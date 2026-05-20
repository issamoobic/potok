import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const getEnv = (name: string) => import.meta.env[name] || process.env[name];

type StoredLead = {
  source: string;
  subject: string;
  text: string;
  payload?: Record<string, unknown>;
};

export const saveLead = async (lead: StoredLead) => {
  const filePath = getEnv('LEAD_STORE_PATH') || join(process.cwd(), 'storage', 'leads.jsonl');
  const entry = {
    createdAt: new Date().toISOString(),
    ...lead,
  };

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    return { ok: true as const, filePath };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Lead store error',
    };
  }
};
