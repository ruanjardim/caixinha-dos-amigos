import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { DateError } from "@/domain/dates";
import { InstallmentError } from "@/domain/installments";
import { LedgerError } from "@/domain/ledger";
import { MoneyError } from "@/domain/money";
import { Prisma } from "@/generated/prisma/client";
import { ForbiddenError, UnauthenticatedError } from "@/modules/auth/session";

/** Estado devolvido pelas Server Actions aos formulários. Nunca expõe detalhes internos. */
export type ActionState = {
  ok?: boolean;
  error?: string;
  /** Código para o formulário reagir (ex.: pedir confirmação de possível duplicidade). */
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

/** Erro de regra de negócio cuja mensagem pode ser exibida ao usuário. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

const SAFE_ERRORS = [
  DomainError,
  ForbiddenError,
  UnauthenticatedError,
  MoneyError,
  DateError,
  InstallmentError,
  LedgerError,
];

/**
 * Converte qualquer erro em uma resposta segura.
 * Erros inesperados são registrados no servidor e retornam mensagem genérica.
 */
export function toActionError(error: unknown): ActionState {
  unstable_rethrow(error); // não engole redirect()/notFound()

  if (error instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, error: "Verifique os campos destacados.", fieldErrors };
  }
  if (SAFE_ERRORS.some((E) => error instanceof E)) {
    return { ok: false, error: (error as Error).message, code: (error as DomainError).code };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { ok: false, error: "Já existe um registro com estes dados." };
  }
  // Proteções do banco (gatilhos) usam o código P0001 com mensagem em português.
  const dbMessage = databaseRuleMessage(error);
  if (dbMessage) return { ok: false, error: dbMessage };

  console.error("[erro-inesperado]", error);
  return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
}

/**
 * Mensagem de uma regra do PRÓPRIO banco (gatilho com RAISE EXCEPTION, código P0001).
 * Erros de validação do Prisma trazem trechos de código na mensagem: nunca são exibidos.
 */
function databaseRuleMessage(error: unknown): string | null {
  if (!(error instanceof Error) || error instanceof Prisma.PrismaClientValidationError) return null;
  const match =
    /^.*?((?:Tabela |Exclusão definitiva |Lançamento \S+ desbalanceado|Ciclo |Regras do ciclo |Apuração |Pagamento |Transição |Número de sorteio )[^"`;{}()]*?\.)\s*$/m.exec(
      error.message,
    );
  return match ? match[1].trim() : null;
}

export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  if (!field) return true;
  const target = JSON.stringify(error.meta ?? {});
  return target.includes(field);
}
