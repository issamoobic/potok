import { getEnv } from './env';

type TelegramNotifyResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string };

export const notifyLeadInTelegram = async (source: string): Promise<TelegramNotifyResult> => {
  const tgToken = getEnv('TELEGRAM_BOT_TOKEN');
  const tgChat = getEnv('TELEGRAM_CHAT_ID');

  if (!tgToken || !tgChat) {
    return { ok: true, skipped: true };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tgChat,
        text: [
          'Новая заявка KROPOT SYSTEMS.',
          `Источник: ${source}.`,
          'Персональные данные отправлены только на почту. Проверьте входящие.',
        ].join('\n'),
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      return { ok: false, error: await response.text() };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Telegram notification error',
    };
  }
};
