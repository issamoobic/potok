import tls from 'node:tls';
import { getEnv } from './env';

type MailResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string };

const readSmtpResponse = (socket: tls.TLSSocket, timeoutMs = 10000) =>
  new Promise<string>((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('SMTP timeout'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1);
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };

    socket.on('data', onData);
    socket.on('error', onError);
  });

const expectSmtp = async (socket: tls.TLSSocket, expected: number[]) => {
  const response = await readSmtpResponse(socket);
  const code = Number(response.slice(0, 3));
  if (!expected.includes(code)) {
    throw new Error(response.trim());
  }
  return response;
};

const writeSmtp = (socket: tls.TLSSocket, command: string) => {
  socket.write(`${command}\r\n`);
};

const encodeHeader = (value: string) =>
  `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

const dotStuff = (value: string) =>
  value.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');

export const sendMail = async ({
  subject,
  text,
}: {
  subject: string;
  text: string;
}): Promise<MailResult> => {
  const user = getEnv('SMTP_USER');
  const password = getEnv('SMTP_PASS');
  const to = getEnv('MAIL_TO') || 'issamooobic@yandex.ru';
  const from = getEnv('MAIL_FROM') || user;
  const host = getEnv('SMTP_HOST') || 'smtp.yandex.ru';
  const port = Number(getEnv('SMTP_PORT') || 465);

  if (!user || !password || !from || !to) {
    return { ok: true, skipped: true };
  }

  const socket = tls.connect({
    host,
    port,
    servername: host,
    rejectUnauthorized: true,
  });

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once('secureConnect', resolve);
      socket.once('error', reject);
    });

    await expectSmtp(socket, [220]);
    writeSmtp(socket, `EHLO kropotsystems.ru`);
    await expectSmtp(socket, [250]);
    writeSmtp(socket, 'AUTH LOGIN');
    await expectSmtp(socket, [334]);
    writeSmtp(socket, Buffer.from(user).toString('base64'));
    await expectSmtp(socket, [334]);
    writeSmtp(socket, Buffer.from(password).toString('base64'));
    await expectSmtp(socket, [235]);
    writeSmtp(socket, `MAIL FROM:<${from}>`);
    await expectSmtp(socket, [250]);

    for (const recipient of to.split(',').map((item) => item.trim()).filter(Boolean)) {
      writeSmtp(socket, `RCPT TO:<${recipient}>`);
      await expectSmtp(socket, [250, 251]);
    }

    writeSmtp(socket, 'DATA');
    await expectSmtp(socket, [354]);

    const message = [
      `From: ${encodeHeader('KROPOT SYSTEMS')} <${from}>`,
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      dotStuff(text),
      '.',
    ].join('\r\n');

    writeSmtp(socket, message);
    await expectSmtp(socket, [250]);
    writeSmtp(socket, 'QUIT');
    await expectSmtp(socket, [221]);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'SMTP error',
    };
  } finally {
    socket.destroy();
  }
};
