import type { APIRoute } from 'astro';
import { saveLead } from '../../lib/lead-store';
import { notifyLeadInMax } from '../../lib/max-notifier';

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

    const contactValidation = validateContact(contact);
    if (!contactValidation.ok) {
      return new Response(JSON.stringify({ error: contactValidation.error }), { status: 400 });
    }

    const text = [
      '🔥 Новая заявка из виджета KROPOT SYSTEMS',
      '',
      `Имя: ${name}`,
      `Контакт: ${contact}`,
      `Тип контакта: ${contactValidation.type}`,
      `Продукт: ${productLabels[product] || product}`,
      `Задача: ${goalLabels[goal] || goal}`,
      `Комментарий: ${comment || '—'}`,
      '',
      'Следующий шаг: записать на демо и показать варианты внедрения в бизнес.',
    ].join('\n');

    const subject = `Новая заявка из виджета KROPOT SYSTEMS: ${name}`;
    const stored = await saveLead({
      source: 'widget',
      subject,
      text,
      payload: { name, contact, comment, product, goal },
    });
    if (!stored.ok) {
      console.error('Widget lead store error:', stored.error);
    }

    if (!stored.ok) {
      return new Response(JSON.stringify({ error: 'Заявка не сохранилась' }), { status: 502 });
    }

    const notification = await notifyLeadInMax({ source: 'виджет сайта', text });
    if ('skipped' in notification && notification.skipped) {
      console.warn('MAX widget lead notification skipped:', notification.reason);
    } else if (!notification.ok) {
      console.error('MAX widget lead notification error:', notification.status || '', notification.recipient || '', notification.error);
    } else {
      console.info('MAX widget lead notification sent:', notification.recipient);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
