import "server-only";
import { assertCollectiveKey, buildPixPayload, PixError } from "@/domain/pix";
import type { Cents } from "@/domain/money";
import type { PaymentMethod } from "@/generated/prisma/client";
import { env } from "@/lib/env";

export type PixProviderId = "manual" | "simulated";

/**
 * Contrato de um provedor Pix. Um prestador autorizado (PSP) futuro implementa o mesmo contrato,
 * com cobrança dinâmica e webhook próprio — ativado somente com a flag PIX_LIVE_ENABLED,
 * conta da estrutura jurídica da caixinha e credenciais guardadas fora do código.
 */
export type PixProvider = {
  id: PixProviderId;
  label: string;
  /** Cobranças sem valor real (não movimentam dinheiro). */
  isSimulation: boolean;
  /** Confirma o recebimento por webhook (manual: conferência no extrato bancário). */
  receivesWebhooks: boolean;
  paymentMethod: PaymentMethod;
  buildCopyPaste(input: { txid: string; amountCents: Cents; description: string | null }): string;
};

/**
 * Chave fictícia da simulação: não segue nenhum formato do DICT, então nenhum banco
 * aceita pagar este código — impossível enviar dinheiro real por engano.
 */
export const SIMULATION_KEY = "SIMULACAO-SEM-VALOR-REAL";

export const simulatedProvider: PixProvider = {
  id: "simulated",
  label: "Simulação (sem dinheiro real)",
  isSimulation: true,
  receivesWebhooks: true,
  paymentMethod: "PIX_SIMULATED",
  buildCopyPaste: ({ txid, amountCents, description }) =>
    buildPixPayload({
      key: SIMULATION_KEY,
      merchantName: "SIMULACAO CAIXINHA",
      merchantCity: "SIMULACAO",
      amountCents,
      txid,
      description,
    }),
};

export type ManualPixConfig = { key: string; receiverName: string; city: string };

export function manualConfigFromEnv(): ManualPixConfig {
  return { key: env.PIX_MANUAL_KEY, receiverName: env.PIX_MANUAL_RECEIVER_NAME, city: env.PIX_MANUAL_CITY };
}

/** Modo manual: código Pix para a conta DA CAIXINHA; a confirmação é sempre humana. */
export function manualProvider(config: ManualPixConfig = manualConfigFromEnv()): PixProvider {
  if (!config.key || !config.receiverName || !config.city) {
    throw new PixError(
      "Pix manual não configurado: defina PIX_MANUAL_KEY, PIX_MANUAL_RECEIVER_NAME e PIX_MANUAL_CITY com os dados da conta da caixinha.",
    );
  }
  assertCollectiveKey(config.key);
  return {
    id: "manual",
    label: "Manual (conferência pelo extrato)",
    isSimulation: false,
    receivesWebhooks: false,
    paymentMethod: "PIX_MANUAL",
    buildCopyPaste: ({ txid, amountCents, description }) =>
      buildPixPayload({
        key: config.key,
        merchantName: config.receiverName,
        merchantCity: config.city,
        amountCents,
        txid,
        description,
      }),
  };
}

export function getPixProvider(id: string = env.PIX_PROVIDER): PixProvider {
  if (id === "simulated") return simulatedProvider;
  if (id === "manual") return manualProvider();
  throw new PixError("Provedor Pix desconhecido.");
}

/** Dados da chave manual para exibição ao participante (null se não configurada ou inválida). */
export function manualKeyInfo(config: ManualPixConfig = manualConfigFromEnv()) {
  try {
    const provider = manualProvider(config);
    return { key: config.key, receiverName: config.receiverName, city: config.city, provider };
  } catch {
    return null;
  }
}
