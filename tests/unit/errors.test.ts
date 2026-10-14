import { describe, expect, it } from "vitest";
import { toActionError } from "@/lib/errors";

describe("tradução segura de erros", () => {
  it("regra do banco (gatilho) vira mensagem amigável", () => {
    const e = new Error(
      "Invalid `prisma.payment.update()` invocation:\n\nCiclo encerrado: use o procedimento de correção pós-encerramento.",
    );
    expect(toActionError(e).error).toBe("Ciclo encerrado: use o procedimento de correção pós-encerramento.");
  });

  it("trecho de código na mensagem NUNCA é exibido", () => {
    const e = new Error(
      'Invalid invocation\n→ 42   if (!cycle) throw new DomainError("Ciclo não encontrado.");\nUnknown argument `foo`.',
    );
    const r = toActionError(e);
    expect(r.error).toBe("Não foi possível concluir a operação. Tente novamente.");
  });
});
