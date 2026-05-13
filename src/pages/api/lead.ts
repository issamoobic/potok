import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { name, contact, task, consent_pd } = data;

    if (!name || !contact || !consent_pd) {
      return new Response(JSON.stringify({ error: 'Не все обязательные поля' }), { status: 400 });
    }

    // Битрикс24: создание лида
    const bxUrl = import.meta.env.BITRIX_WEBHOOK_URL;
    if (bxUrl) {
      const isEmail = String(contact).includes('@');
      await fetch(`${bxUrl}crm.lead.add.json`, {
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
      });
    }

    // Telegram: уведомление основателю
    const tgToken = import.meta.env.TELEGRAM_BOT_TOKEN;
    const tgChat = import.meta.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChat) {
      const text = `🔥 Новая заявка\n\nИмя: ${name}\nКонтакт: ${contact}\nЗадача: ${task || '—'}`;
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
