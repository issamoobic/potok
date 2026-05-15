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

const getEnv = (name: string) => import.meta.env[name] || process.env[name];

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
    const comment = String(data.comment || '').trim();
    const product = String(data.product || 'demo');
    const goal = String(data.goal || 'integration');

    if (!name || !contact) {
      return new Response(JSON.stringify({ error: 'Укажите имя и контакт' }), { status: 400 });
    }

    const text = [
      '🔥 Новая заявка из виджета KROPOT SYSTEMS',
      '',
      `Имя: ${name}`,
      `Контакт: ${contact}`,
      `Продукт: ${productLabels[product] || product}`,
      `Задача: ${goalLabels[goal] || goal}`,
      `Комментарий: ${comment || '—'}`,
      '',
      'Следующий шаг: записать на демо и показать варианты внедрения в бизнес.',
    ].join('\n');

    const telegram = await sendTelegramMessage(text);
    if (!telegram.ok) {
      console.error('Telegram widget lead error:', telegram.error);
      return new Response(JSON.stringify({ error: telegram.error }), { status: telegram.status || 500 });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
