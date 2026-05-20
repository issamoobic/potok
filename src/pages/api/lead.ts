import type { APIRoute } from 'astro';
import { saveLead } from '../../lib/lead-store';
import { sendMail } from '../../lib/mailer';
import { notifyLeadInMax } from '../../lib/max-notifier';
import { notifyLeadInTelegram } from '../../lib/telegram-notifier';

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

    const subject = `Новая заявка KROPOT SYSTEMS: ${name}`;
    const stored = await saveLead({
      source: 'contact-form',
      subject,
      text,
      payload: { name, contact, task, consentAd: Boolean(data.consent_ad) },
    });
    if (!stored.ok) {
      console.error('Lead store error:', stored.error);
    }

    const mail = await sendMail({
      subject,
      text,
    });
    if (!mail.ok) {
      console.error('Email lead error:', mail.error);
      if (!stored.ok) {
        return new Response(JSON.stringify({ error: 'Заявка не сохранилась' }), { status: 502 });
      }
    }

    notifyLeadInTelegram('форма на сайте').then((notification) => {
      if (!notification.ok) console.error('Telegram lead notification error:', notification.error);
    });

    notifyLeadInMax({ source: 'форма на сайте', text }).then((notification) => {
      if (!notification.ok) console.error('MAX lead notification error:', notification.error);
    });

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
