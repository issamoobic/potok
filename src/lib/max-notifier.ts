const getEnv = (name: string) => import.meta.env[name] || process.env[name];

type MaxNotifyResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string };

const MAX_API_URL = 'https://platform-api.max.ru/messages';
const MAX_TEXT_LIMIT = 4000;

const trimMessage = (value: string) =>
  value.length <= MAX_TEXT_LIMIT ? value : `${value.slice(0, MAX_TEXT_LIMIT - 1)}…`;

export const notifyLeadInMax = async ({
  source,
  text,
}: {
  source: string;
  text: string;
}): Promise<MaxNotifyResult> => {
  const token = getEnv('MAX_BOT_TOKEN');
  const chatId = getEnv('MAX_CHAT_ID');
  const userId = getEnv('MAX_USER_ID');

  if (!token || (!chatId && !userId)) {
    return { ok: true, skipped: true };
  }

  const url = new URL(MAX_API_URL);
  if (chatId) {
    url.searchParams.set('chat_id', chatId);
  } else if (userId) {
    url.searchParams.set('user_id', userId);
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
      }),
    });

    if (!response.ok) {
      return { ok: false, error: await response.text() };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'MAX notification error',
    };
  }
};
