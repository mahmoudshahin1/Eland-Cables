import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const BCRYPT_COST = 10;

export async function hashPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters.'), { code: 'INVALID_PASSWORD' });
  }
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  if (!plain || !passwordHash) return false;
  if (passwordHash.startsWith('$2a$') || passwordHash.startsWith('$2b$') || passwordHash.startsWith('$2y$')) {
    return bcrypt.compare(plain, passwordHash);
  }
  return false;
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomOpaqueToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
