import { getEnv } from './env';

type MaxNotifyResult =
  | { ok: true; skipped?: false; recipient: string }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string; recipient?: string; status?: number };

const MAX_API_URL = 'https://platform-api.max.ru/messages';
const MAX_TEXT_LIMIT = 4000;

const trimMessage = (value: string) =>
  value.length <= MAX_TEXT_LIMIT ? value : `${value.slice(0, MAX_TEXT_LIMIT - 3)}...`;

const cleanRecipient = (value: string | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '0') return undefined;
  return trimmed;
};

export const notifyLeadInMax = async ({
  source,
  text,
}: {
  source: string;
  text: string;
}): Promise<MaxNotifyResult> => {
  const token = getEnv('MAX_BOT_TOKEN')?.trim();
  const chatId = cleanRecipient(getEnv('MAX_CHAT_ID'));
  const userId = cleanRecipient(getEnv('MAX_USER_ID'));

  if (!token) {
    return { ok: true, skipped: true, reason: 'MAX_BOT_TOKEN is missing' };
  }

  if (!chatId && !userId) {
    return { ok: true, skipped: true, reason: 'MAX_USER_ID or MAX_CHAT_ID is missing' };
  }

  const url = new URL(MAX_API_URL);
  let recipient = '';

  if (userId) {
    url.searchParams.set('user_id', userId);
    recipient = `user_id:${userId}`;
  } else if (chatId) {
    url.searchParams.set('chat_id', chatId);
    recipient = `chat_id:${chatId}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: trimMessage(['Новая заявка KROPOT SYSTEMS', `Источник: ${source}`, '', text].join('\n')),
        notify: true,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        recipient,
        error: await response.text(),
      };
    }

    return { ok: true, recipient };
  } catch (error) {
    return {
      ok: false,
      recipient,
      error: error instanceof Error ? error.message : 'MAX notification error',
    };
  }
};
