import type { APIRoute } from 'astro';

export const prerender = false;

const SLOT_MINUTES = 45;
const MSK_OFFSET_MINUTES = 180;

const getEnv = (name: string) => import.meta.env[name] || process.env[name];

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

const calendarUrl = () => {
  const user = getEnv('YANDEX_CALDAV_USER') || 'kropotsystems@yandex.ru';
  return getEnv('YANDEX_CALDAV_URL') || `https://caldav.yandex.ru/calendars/${encodeURIComponent(user)}/events-default/`;
};

const authHeader = () => {
  const user = getEnv('YANDEX_CALDAV_USER');
  const password = getEnv('YANDEX_CALDAV_PASSWORD');

  if (!user || !password) return null;
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
};

const escapeIcs = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const sendTelegramMessage = async (text: string) => {
  const tgToken = getEnv('TELEGRAM_BOT_TOKEN');
  const tgChat = getEnv('TELEGRAM_CHAT_ID');

  if (!tgToken || !tgChat) return;

  await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: tgChat, text, disable_web_page_preview: true }),
  }).catch((error) => console.error('Telegram booking error:', error));
};

const createCalendarEvent = async (data: {
  name: string;
  contact: string;
  comment: string;
  product: string;
  goal: string;
  start: Date;
  end: Date;
}) => {
  const auth = authHeader();
  if (!auth) {
    return { ok: false, status: 500, error: 'Yandex Calendar не настроен' };
  }

  const uid = `kropot-demo-${crypto.randomUUID()}@kropotsystems`;
  const createdAt = new Date();
  const description = [
    `Имя: ${data.name}`,
    `Контакт: ${data.contact}`,
    `Продукт: ${data.product}`,
    `Задача: ${data.goal}`,
    `Комментарий: ${data.comment || '—'}`,
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
    `SUMMARY:${escapeIcs(`Демо KROPOT SYSTEMS — ${data.name}`)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const response = await fetch(`${calendarUrl()}${uid}.ics`, {
    method: 'PUT',
    headers: {
      Authorization: auth,
      'Content-Type': 'text/calendar; charset=utf-8',
    },
    body: ics,
  });

  if (!response.ok) {
    return { ok: false, status: 502, error: `Yandex Calendar вернул ${response.status}` };
  }

  return { ok: true, uid };
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

    if (!name || !contact || Number.isNaN(slotStart.getTime())) {
      return new Response(JSON.stringify({ error: 'Заполните контакт и выберите слот' }), { status: 400 });
    }

    if (!validateContact(contact)) {
      return new Response(JSON.stringify({ error: 'Укажите корректный телефон, email или Telegram' }), { status: 400 });
    }

    const booking = await createCalendarEvent({ name, contact, comment, product, goal, start: slotStart, end: slotEnd });
    if (!booking.ok) {
      return new Response(JSON.stringify({ error: booking.error }), { status: booking.status || 500 });
    }

    await sendTelegramMessage([
      '🔥 Забронировано демо KROPOT SYSTEMS',
      '',
      `Время: ${formatMoscow(slotStart)}`,
      `Имя: ${name}`,
      `Контакт: ${contact}`,
      `Продукт: ${product}`,
      `Задача: ${goal}`,
      `Комментарий: ${comment || '—'}`,
    ].join('\n'));

    return new Response(JSON.stringify({ ok: true, slotLabel: formatMoscow(slotStart) }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Не удалось забронировать демо' }), { status: 500 });
  }
};
