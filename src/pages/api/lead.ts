import type { APIRoute } from 'astro';
import { saveLead } from '../../lib/lead-store';
import { notifyLeadInMax } from '../../lib/max-notifier';

export const prerender = false;

const validateContact = (value: string) => {
  const contact = value.trim();
  const digits = contact.replace(/\D/g, '');
  const hasPhonePrefix = /^[+\d\s().-]+$/.test(contact);
  const sameDigits = /^(\d)\1+$/.test(digits);
  const phone = hasPhonePrefix && digits.length >= 10 && digits.length <= 15 && !sameDigits;
  const telegram = /^@[a-zA-Z0-9_]{5,32}$/.test(contact) || /^(https?:\/\/)?(t\.me|telegram\.me)\/[a-zA-Z0-9_]{5,32}\/?$/i.test(contact);
  const max = /^(https?:\/\/)?max\.ru\/u\/[a-zA-Z0-9_-]{8,}(?:[/?#].*)?$/i.test(contact);

  if (phone) return { ok: true, type: 'phone' };
  if (telegram) return { ok: true, type: 'telegram' };
  if (max) return { ok: true, type: 'max' };

  return {
    ok: false,
    error: 'Укажите корректный телефон, Telegram или MAX',
  };
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
    ].join('\n');

    const subject = `Новая заявка KROPOT SYSTEMS: ${name}`;
    const stored = await saveLead({
      source: 'contact-form',
      subject,
      text,
      payload: { name, contact, task },
    });
    if (!stored.ok) {
      console.error('Lead store error:', stored.error);
    }

    if (!stored.ok) {
      return new Response(JSON.stringify({ error: 'Заявка не сохранилась' }), { status: 502 });
    }

    const notification = await notifyLeadInMax({ source: 'форма на сайте', text });
    if ('skipped' in notification && notification.skipped) {
      console.warn('MAX lead notification skipped:', notification.reason);
    } else if (!notification.ok) {
      console.error('MAX lead notification error:', notification.status || '', notification.recipient || '', notification.error);
    } else {
      console.info('MAX lead notification sent:', notification.recipient);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
};
