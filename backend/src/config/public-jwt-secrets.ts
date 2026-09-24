import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function secretsFilePath(): string {
  const candidates = [
    join(__dirname, 'public-jwt-secrets.txt'),
    join(__dirname, '../../src/config/public-jwt-secrets.txt'),
  ];
  const found = candidates.find(path => existsSync(path));
  if (!found) {
    throw new Error(`public-jwt-secrets.txt not found. Tried: ${candidates.join(', ')}`);
  }
  return found;
}

export const PUBLIC_JWT_SECRETS: readonly string[] = readFileSync(secretsFilePath(), 'utf8')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0 && !line.startsWith('#'));

export const MIN_JWT_SECRET_LENGTH = 32;
export const MIN_JWT_SECRET_DISTINCT_CHARACTERS = 10;

export function jwtSecretHasEnoughVariety(secret: string): boolean {
  return new Set(secret).size >= MIN_JWT_SECRET_DISTINCT_CHARACTERS;
}
