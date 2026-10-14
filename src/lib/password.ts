import "server-only";
import { hash, verify } from "@node-rs/argon2";

/**
 * Hash de senha com argon2id (recomendação OWASP).
 * Parâmetros: 19 MiB de memória, 2 iterações, paralelismo 1.
 */
const OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword({ hash: stored, password }: { hash: string; password: string }) {
  try {
    return await verify(stored, password);
  } catch {
    // Hash corrompido ou em formato desconhecido: nunca autentica.
    return false;
  }
}

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
