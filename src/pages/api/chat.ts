import type { APIRoute } from 'astro';

export const prerender = false;

const SYSTEM_PROMPT = `Ты — помощник студии "KROPOT SYSTEMS". Студия внедряет ИИ-агентов для бизнеса: голосовые звонки, чаты, рассылки.

Твоя задача:
1. Понять, какую задачу хочет автоматизировать клиент.
2. Узнать сферу бизнеса и примерный объём (звонков/чатов в день).
3. Предложить конкретное решение из линейки: голосовой агент, чат-агент, виджет на сайт, массовые рассылки.
4. После 3-4 сообщений мягко предложить оставить контакт для расчёта.

Стиль: коротко, по делу, по-человечески. Не используй маркированные списки. Не обещай конкретных цифр и не называй стоимость до демо. Если спрашивают о цене — предложи демо и разбор задачи, после которого команда подготовит расчёт под конкретный процесс.

Если вопрос вне темы автоматизации бизнеса — вежливо верни в тему.`;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { messages } = await request.json();

    // Попытка 1: OpenRouter
    const orKey = import.meta.env.OPENROUTER_API_KEY;
    const orModel = import.meta.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';
    if (orKey) {
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${orKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: orModel,
            messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
            max_tokens: 400,
          }),
        });
        if (r.ok) {
          const data = await r.json();
          const reply = data.choices?.[0]?.message?.content;
          if (reply) return new Response(JSON.stringify({ reply }), { status: 200 });
        }
      } catch (e) {
        console.error('OpenRouter failed:', e);
      }
    }

    // Попытка 2: YandexGPT (резерв)
    const yKey = import.meta.env.YANDEX_API_KEY;
    const yFolder = import.meta.env.YANDEX_FOLDER_ID;
    if (yKey && yFolder) {
      const r = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
        method: 'POST',
        headers: {
          'Authorization': `Api-Key ${yKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelUri: `gpt://${yFolder}/yandexgpt-lite`,
          completionOptions: { stream: false, temperature: 0.6, maxTokens: 400 },
          messages: [
            { role: 'system', text: SYSTEM_PROMPT },
            ...messages.map((m: any) => ({ role: m.role, text: m.content })),
          ],
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const reply = data.result?.alternatives?.[0]?.message?.text;
        if (reply) return new Response(JSON.stringify({ reply }), { status: 200 });
      }
    }

    return new Response(JSON.stringify({
      reply: 'Извините, технические неполадки. Напишите kropotsystems@yandex.ru или в Telegram @kropotsystems — ответим лично.',
    }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
