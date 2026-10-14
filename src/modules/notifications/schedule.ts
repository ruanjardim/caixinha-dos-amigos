import "server-only";
import { after } from "next/server";

/**
 * Executa o envio de avisos DEPOIS da resposta: o usuário não espera o e-mail,
 * e uma falha de envio nunca desfaz a operação financeira já concluída.
 */
export function notifyAfterResponse(task: () => Promise<unknown>) {
  after(async () => {
    try {
      await task();
    } catch (e) {
      console.error("[notificacao]", e);
    }
  });
}
