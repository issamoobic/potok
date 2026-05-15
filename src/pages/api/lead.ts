import type { APIRoute } from 'astro';

export const prerender = false;

const getEnv = (name: string) => import.meta.env[name] || process.env[name];

const validateContact = (value: string) => {
  const contact = value.trim();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
  const telegram = /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
  const digits = contact.replace(/\D/g, '');
  const hasPhonePrefix = /^[+\d\s().-]+$/.test(contact);
  const sameDigits = /^(\d)\1+$/.test(digits);
  const phone = hasPhonePrefix && digits.length >= 10 && digits.length <= 15 && !sameDigits;

  if (email.test(contact)) return { ok: true, type: 'email' };
  if (phone) return { ok: true, type: 'phone' };
  if (telegram.test(contact)) return { ok: true, type: 'telegram' };

  return {
    ok: false,
    error: 'Укажите корректный телефон, email или Telegram',
  };
};

const sendTelegramMessage = async (text: string) => {
  const tgToken = getEnv('TELEGRAM_BOT_TOKEN');
  const tgChat = getEnv('TELEGRAM_CHAT_ID');

  if (!tgToken || !tgChat) {
    return { ok: false, status: 500, error: 'Telegram не настроен: проверьте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tgChat,
        text,
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        status: 502,
        error: payload?.description || 'Telegram не принял заявку',
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: error instanceof Error && error.name === 'AbortError'
        ? 'Telegram не ответил за 10 секунд'
        : 'Не удалось подключиться к Telegram',
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const name = String(data.name || '').trim();
    const contact = String(data.contact || '').trim();
    const task = String(data.task || '').trim();

    if (!name || !contact || !data.consent_pd) {
      return new Response(JSON.stringify({ error: 'Заполните имя, контакт и согласие на обработку данных' }), { status: 400 });
    }

    const contactValidation = validateContact(contact);
    if (!contactValidation.ok) {
      return new Response(JSON.stringify({ error: contactValidation.error }), { status: 400 });
    }

    const text = [
      '🔥 Новая заявка с сайта KROPOT SYSTEMS',
      '',
      `Имя: ${name}`,
      `Контакт: ${contact}`,
      `Тип контакта: ${contactValidation.type}`,
      `Задача: ${task || '—'}`,
      `Согласие на рекламу: ${data.consent_ad ? 'да' : 'нет'}`,
    ].join('\n');

    const telegram = await sendTelegramMessage(text);
    if (!telegram.ok) {
      console.error('Telegram lead error:', telegram.error);
      return new Response(JSON.stringify({ error: telegram.error }), { status: telegram.status || 500 });
    }

    const bxUrl = getEnv('BITRIX_WEBHOOK_URL');
    if (bxUrl) {
      const isEmail = contact.includes('@');
      fetch(`${bxUrl}crm.lead.add.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            TITLE: `Заявка с сайта: ${name}`,
            NAME: name,
            COMMENTS: task || '',
            SOURCE_ID: 'WEB',
            [isEmail ? 'EMAIL' : 'PHONE']: [{ VALUE: contact, VALUE_TYPE: 'WORK' }],
            UF_CRM_AD_CONSENT: data.consent_ad ? 'Y' : 'N',
          },
        }),
      }).catch((error) => console.error('Bitrix lead error:', error));
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
