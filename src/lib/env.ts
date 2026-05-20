import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const envFileValues = new Map<string, string>();
let envFileLoaded = false;

const unquoteEnvValue = (value: string) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const loadEnvFile = () => {
  if (envFileLoaded) return;
  envFileLoaded = true;

  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = unquoteEnvValue(trimmed.slice(separator + 1));
    if (key && !envFileValues.has(key)) envFileValues.set(key, value);
  }
};

export const getEnv = (name: string) => {
  loadEnvFile();
  return process.env[name] || envFileValues.get(name) || import.meta.env[name];
};
