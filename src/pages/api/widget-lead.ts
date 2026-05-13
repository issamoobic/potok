import type { APIRoute } from 'astro';

export const prerender = false;

const productLabels: Record<string, string> = {
  voice: 'Голосовой агент',
  chat: 'Чат-агент',
  widget: 'Сайт-виджет',
  broadcasts: 'Рассылки',
  center: 'Чат-центр',
  demo: 'Демо продуктов',
};

const goalLabels: Record<string, string> = {
  leads: 'Больше заявок',
  routine: 'Меньше рутины',
  support: 'Поддержка 24/7',
  reactivation: 'Вернуть старых клиентов',
  integration: 'Встроить в бизнес-процессы',
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const name = String(data.name || '').trim();
    const contact = String(data.contact || '').trim();
    const comment = String(data.comment || '').trim();
    const product = String(data.product || 'demo');
    const goal = String(data.goal || 'integration');

    if (!name || !contact) {
      return new Response(JSON.stringify({ error: 'Укажите имя и контакт' }), { status: 400 });
    }

    const tgToken = import.meta.env.TELEGRAM_BOT_TOKEN;
    const tgChat = import.meta.env.TELEGRAM_CHAT_ID;

    if (!tgToken || !tgChat) {
      return new Response(JSON.stringify({ error: 'Telegram не настроен' }), { status: 500 });
    }

    const text = [
      'Новая заявка из виджета KROPOT SYSTEMS',
      '',
      `Имя: ${name}`,
      `Контакт: ${contact}`,
      `Продукт: ${productLabels[product] || product}`,
      `Задача: ${goalLabels[goal] || goal}`,
      `Комментарий: ${comment || '—'}`,
      '',
      'Следующий шаг: записать на демо и показать варианты внедрения в бизнес.',
    ].join('\n');

    const tgResponse = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: tgChat, text }),
    });

    if (!tgResponse.ok) {
      return new Response(JSON.stringify({ error: 'Telegram не принял заявку' }), { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
