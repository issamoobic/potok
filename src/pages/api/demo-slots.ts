import type { APIRoute } from 'astro';

export const prerender = false;

const SLOT_MINUTES = 45;
const LOOKAHEAD_DAYS = 14;
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;
const MSK_OFFSET_MINUTES = 180;
const CALDAV_ORIGIN = 'https://caldav.yandex.ru';

const getEnv = (name: string) => import.meta.env[name] || process.env[name];

const pad = (value: number) => String(value).padStart(2, '0');

const calDavUserCandidates = () => {
  const user = getEnv('YANDEX_CALDAV_USER') || 'kropotsystems@yandex.ru';
  const login = user.includes('@') ? user.split('@')[0] : user;
  return [...new Set([user, login].filter(Boolean))];
};

const toMoscowParts = (date: Date) => {
  const moscow = new Date(date.getTime() + MSK_OFFSET_MINUTES * 60_000);
  return {
    year: moscow.getUTCFullYear(),
    month: moscow.getUTCMonth() + 1,
    day: moscow.getUTCDate(),
    hour: moscow.getUTCHours(),
    minute: moscow.getUTCMinutes(),
    weekday: moscow.getUTCDay(),
  };
};

const fromMoscow = (year: number, month: number, day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour, minute) - MSK_OFFSET_MINUTES * 60_000);

const formatCalDavUtc = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

const withTrailingSlash = (url: string) => (url.endsWith('/') ? url : `${url}/`);

const decodeXml = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

const absoluteCalDavUrl = (href: string) => {
  const decoded = decodeXml(href.trim());
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

const parseDateValue = (value: string) => {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?(\d{2})?Z?$/);
  if (!match) return null;

  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  const utc = normalized.endsWith('Z');
  const timestamp = utc
    ? Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    : fromMoscow(Number(year), Number(month), Number(day), Number(hour), Number(minute)).getTime();

  return new Date(timestamp);
};

const parseBusyIntervals = (xml: string) => {
  const calendarData = [...xml.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)].map((match) => match[0]);

  return calendarData.flatMap((event) => {
    const start = event.match(/DTSTART(?:;[^:\r\n]+)?:([^\r\n]+)/)?.[1];
    const end = event.match(/DTEND(?:;[^:\r\n]+)?:([^\r\n]+)/)?.[1];
    const parsedStart = start ? parseDateValue(start) : null;
    const parsedEnd = end ? parseDateValue(end) : null;

    return parsedStart && parsedEnd ? [{ start: parsedStart, end: parsedEnd }] : [];
  });
};

const loadBusyIntervals = async (start: Date, end: Date) => {
  const authCandidates = authHeaders();
  if (!authCandidates.length) {
    return { ok: false as const, error: 'Yandex Calendar не настроен' };
  }

  const body = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag />
    <C:calendar-data />
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${formatCalDavUtc(start)}" end="${formatCalDavUtc(end)}" />
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

  const errors: string[] = [];

  for (const auth of authCandidates) {
    for (const url of await discoverCalendarUrls(auth)) {
      const response = await fetch(url, {
        method: 'REPORT',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/xml; charset=utf-8',
          Depth: '1',
        },
        body,
      });

      if (response.ok) {
        return { ok: true as const, busy: parseBusyIntervals(await response.text()) };
      }

      errors.push(`${response.status}`);
    }
  }

  return { ok: false as const, error: `Yandex Calendar вернул ${errors.join('/')}` };
};

const overlaps = (start: Date, end: Date, busy: Array<{ start: Date; end: Date }>) =>
  busy.some((interval) => start < interval.end && end > interval.start);

const createSlots = (busy: Array<{ start: Date; end: Date }>) => {
  const now = new Date();
  const slots: Array<{ start: string; end: string; label: string }> = [];

  for (let offset = 0; offset < LOOKAHEAD_DAYS; offset += 1) {
    const parts = toMoscowParts(new Date(now.getTime() + offset * 24 * 60 * 60_000));
    if (parts.weekday === 0 || parts.weekday === 6) continue;

    for (let hour = WORK_START_HOUR; hour < WORK_END_HOUR; hour += 1) {
      const start = fromMoscow(parts.year, parts.month, parts.day, hour);
      const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
      if (start.getTime() < now.getTime() + 2 * 60 * 60_000) continue;
      if (overlaps(start, end, busy)) continue;

      const label = `${pad(parts.day)}.${pad(parts.month)} в ${pad(hour)}:00`;
      slots.push({ start: start.toISOString(), end: end.toISOString(), label });
      if (slots.length >= 9) return slots;
    }
  }

  return slots;
};

export const GET: APIRoute = async () => {
  try {
    const now = new Date();
    const rangeEnd = new Date(now.getTime() + LOOKAHEAD_DAYS * 24 * 60 * 60_000);
    const busy = await loadBusyIntervals(now, rangeEnd);

    if (!busy.ok) {
      console.error('Yandex Calendar slots fallback:', busy.error);
      return new Response(JSON.stringify({
        ok: true,
        calendarConnected: false,
        slots: createSlots([]),
      }), { status: 200 });
    }

    return new Response(JSON.stringify({ ok: true, calendarConnected: true, slots: createSlots(busy.busy) }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ ok: false, error: 'Не удалось загрузить слоты', slots: [] }), { status: 500 });
  }
};
