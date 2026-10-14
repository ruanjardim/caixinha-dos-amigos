import "server-only";
import { ZodError } from "zod";
import { ForbiddenError, UnauthenticatedError } from "@/modules/auth/session";

/** Resultado padrão das Server Actions. Nunca expõe detalhes internos. */
export type ActionResult<T = void> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Erro de regra de negócio cuja mensagem pode ser exibida ao usuário. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/**
 * Converte qualquer erro em uma resposta segura.
 * Erros inesperados são registrados no servidor e retornam mensagem genérica.
 */
export function toActionError(error: unknown): { ok: false; error: string; fieldErrors?: Record<string, string[]> } {
  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, error: "Verifique os campos destacados.", fieldErrors };
  }
  if (error instanceof DomainError || error instanceof ForbiddenError || error instanceof UnauthenticatedError) {
    return { ok: false, error: error.message };
  }
  console.error("[erro-inesperado]", error);
  return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
}
