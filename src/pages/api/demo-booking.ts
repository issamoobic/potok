import type { APIRoute } from 'astro';
import { saveLead } from '../../lib/lead-store';
import { sendMail } from '../../lib/mailer';
import { notifyLeadInMax } from '../../lib/max-notifier';
import { notifyLeadInTelegram } from '../../lib/telegram-notifier';
import { getEnv } from '../../lib/env';

export const prerender = false;

const SLOT_MINUTES = 45;
const MSK_OFFSET_MINUTES = 180;
const CALDAV_ORIGIN = 'https://caldav.yandex.ru';

const calDavUserCandidates = () => {
  const user = getEnv('YANDEX_CALDAV_USER') || 'kropotsystems@yandex.ru';
  const login = user.includes('@') ? user.split('@')[0] : user;
  return [...new Set([user, login].filter(Boolean))];
};

const validateContact = (value: string) => {
  const contact = value.trim();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
  const telegram = /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
  const digits = contact.replace(/\D/g, '');
  const hasPhonePrefix = /^[+\d\s().-]+$/.test(contact);
  const sameDigits = /^(\d)\1+$/.test(digits);
  const phone = hasPhonePrefix && digits.length >= 10 && digits.length <= 15 && !sameDigits;

  if (email.test(contact)) return true;
  if (phone) return true;
  return telegram.test(contact);
};

const pad = (value: number) => String(value).padStart(2, '0');

const formatDateTime = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

const formatMoscow = (date: Date) => {
  const moscow = new Date(date.getTime() + MSK_OFFSET_MINUTES * 60_000);
  return `${pad(moscow.getUTCDate())}.${pad(moscow.getUTCMonth() + 1)}.${moscow.getUTCFullYear()} ${pad(moscow.getUTCHours())}:${pad(moscow.getUTCMinutes())} МСК`;
};

const withTrailingSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`);

const unescapeXmlText = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const absoluteCalDavUrl = (href: string) => {
  const decoded = unescapeXmlText(href.trim());
  if (/^https?:\/\//i.test(decoded)) return withTrailingSlash(decoded);
  return withTrailingSlash(`${CALDAV_ORIGIN}${decoded.startsWith('/') ? '' : '/'}${decoded}`);
};

const extractHrefs = (xml: string) =>
  [...xml.matchAll(/<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/gi)].map((match) => absoluteCalDavUrl(match[1]));

const propfind = async (url: string, auth: string, body: string, depth = '0') =>
  fetch(url, {
    method: 'PROPFIND',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: depth,
    },
    body,
  });

const discoverCalendarUrls = async (auth: string) => {
  const configuredUrl = getEnv('YANDEX_CALDAV_URL');
  if (configuredUrl) return [withTrailingSlash(configuredUrl)];

  const candidates = calDavUserCandidates();

  const fallbackUrls = [...new Set(candidates)].map((candidate) =>
    `https://caldav.yandex.ru/calendars/${encodeURIComponent(candidate)}/events-default/`,
  );

  const principalBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set />
  </D:prop>
</D:propfind>`;

  const calendarBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:resourcetype />
    <D:displayname />
  </D:prop>
</D:propfind>`;

  const discovered: string[] = [];
  for (const candidate of candidates) {
    const principalUrl = `${CALDAV_ORIGIN}/principals/users/${encodeURIComponent(candidate)}/`;
    const principal = await propfind(principalUrl, auth, principalBody);
    if (!principal.ok) continue;

    const homes = extractHrefs(await principal.text());
    for (const home of homes) {
      const calendars = await propfind(home, auth, calendarBody, '1');
      if (!calendars.ok) continue;

      const xml = await calendars.text();
      const responses = xml.match(/<[^>]*response[^>]*>[\s\S]*?<\/[^>]*response>/gi) || [];
      for (const response of responses) {
        if (!/<[^>]*calendar(?:\s|\/|>)/i.test(response)) continue;
        const [href] = extractHrefs(response);
        if (href) discovered.push(href);
      }
    }
  }

  return [...new Set([...discovered, ...fallbackUrls])];
};

const authHeaders = () => {
  const password = getEnv('YANDEX_CALDAV_PASSWORD');

  if (!password) return [];
  return calDavUserCandidates().map((user) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`);
};

const escapeIcs = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const createCalendarEvent = async (data: {
  name: string;
  contact: string;
  comment: string;
  product: string;
  goal: string;
  start: Date;
  end: Date;
}) => {
  const authCandidates = authHeaders();
  if (!authCandidates.length) {
    return { ok: false, status: 500, error: 'Yandex Calendar не настроен' };
  }

  const uid = `kropot-demo-${crypto.randomUUID()}@kropotsystems`;
  const createdAt = new Date();
  const description = [
    'Новая заявка на демо с сайта KROPOT SYSTEMS.',
    'Персональные данные отправлены только на почту.',
    'Проверьте входящие, чтобы связаться с клиентом.',
  ].join('\\n');

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KROPOT SYSTEMS//Demo Booking//RU',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatDateTime(createdAt)}`,
    `DTSTART:${formatDateTime(data.start)}`,
    `DTEND:${formatDateTime(data.end)}`,
    `SUMMARY:${escapeIcs('Демо KROPOT SYSTEMS')}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const errors: string[] = [];

  for (const auth of authCandidates) {
    for (const url of await discoverCalendarUrls(auth)) {
      const response = await fetch(`${url}${uid}.ics`, {
        method: 'PUT',
        headers: {
          Authorization: auth,
          'Content-Type': 'text/calendar; charset=utf-8',
        },
        body: ics,
      });

      if (response.ok) {
        return { ok: true, uid };
      }

      errors.push(`${response.status}`);
    }
  }

  return { ok: false, status: 502, error: `Yandex Calendar вернул ${errors.join('/')}` };
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const contact = String(body.contact || '').trim();
    const comment = String(body.comment || '').trim();
    const product = String(body.product || 'demo');
    const goal = String(body.goal || 'integration');
    const slotStart = new Date(String(body.slotStart || ''));
    const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60_000);

    if (!name || !contact || !body.consent_pd || Number.isNaN(slotStart.getTime())) {
      return new Response(JSON.stringify({ error: 'Заполните контакт и выберите слот' }), { status: 400 });
    }

    if (!validateContact(contact)) {
      return new Response(JSON.stringify({ error: 'Укажите корректный телефон, email или Telegram' }), { status: 400 });
    }

    const booking = await createCalendarEvent({ name, contact, comment, product, goal, start: slotStart, end: slotEnd });
    const leadText = [
      booking.ok ? '🔥 Забронировано демо KROPOT SYSTEMS' : '🔥 Заявка на демо KROPOT SYSTEMS',
      '',
      `Время: ${formatMoscow(slotStart)}`,
      `Имя: ${name}`,
      `Контакт: ${contact}`,
      `Продукт: ${product}`,
      `Задача: ${goal}`,
      `Комментарий: ${comment || '—'}`,
      booking.ok ? 'Календарь: слот создан' : `Календарь: не создался (${booking.error})`,
    ].join('\n');
    const subject = `Демо KROPOT SYSTEMS: ${name}`;
    const stored = await saveLead({
      source: 'demo-booking',
      subject,
      text: leadText,
      payload: {
        name,
        contact,
        comment,
        product,
        goal,
        slotStart: slotStart.toISOString(),
        calendarBooked: booking.ok,
      },
    });
    if (!stored.ok) {
      console.error('Booking lead store error:', stored.error);
    }

    const mail = await sendMail({
      subject,
      text: leadText,
    });
    if (!mail.ok) {
      console.error('Email booking lead error:', mail.error);
      if (!stored.ok) {
        return new Response(JSON.stringify({ error: 'Заявка не сохранилась' }), { status: 502 });
      }
    }

    notifyLeadInTelegram('бронирование демо').then((notification) => {
      if (!notification.ok) console.error('Telegram booking notification error:', notification.error);
    });

    notifyLeadInMax({ source: 'бронирование демо', text: leadText }).then((notification) => {
      if (!notification.ok) console.error('MAX booking notification error:', notification.error);
    });

    return new Response(JSON.stringify({
      ok: true,
      calendarBooked: booking.ok,
      slotLabel: formatMoscow(slotStart),
    }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Не удалось забронировать демо' }), { status: 500 });
  }
};
