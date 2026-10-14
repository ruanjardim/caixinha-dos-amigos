/**
 * Regras do ciclo: texto padrão sugerido e conteúdo canônico para o hash.
 * O hash permite provar, a qualquer momento, que as regras aceitas não mudaram.
 */
import { formatDateBR, type ISODate } from "./dates";
import { formatBRL, type Cents } from "./money";

export type RulesContent = {
  cycle: { name: string; startDate: ISODate; contributionEndDate: ISODate; settlementDate: ISODate; dueDay: number };
  rules: {
    version: number;
    adminFeeBps: number;
    distributionMethod: string;
    quotaValuesCents: Cents[];
    rulesText: string;
  };
};

/** JSON com chaves em ordem fixa — mesma entrada, mesmo texto, mesmo hash. */
export function canonicalRules(content: RulesContent): string {
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.keys(value as Record<string, unknown>)
          .sort()
          .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
      );
    }
    return value;
  };
  return JSON.stringify(sortKeys(content));
}

export function formatPercentBps(bps: number): string {
  return `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export function defaultRulesText(p: {
  startDate: ISODate;
  contributionEndDate: ISODate;
  settlementDate: ISODate;
  dueDay: number;
  adminFeeBps: number;
  quotaValuesCents: Cents[];
}): string {
  const quotas = p.quotaValuesCents.map((c) => formatBRL(c)).join(" ou ");
  return [
    "1. OBJETO. A caixinha é um grupo privado de contribuições mensais entre amigos. Não há investimento financeiro externo e NÃO existe promessa de rendimento ou rentabilidade.",
    `2. PERÍODO. As contribuições vão de ${formatDateBR(p.startDate)} a ${formatDateBR(p.contributionEndDate)}. A prestação de contas e a distribuição ocorrem a partir de ${formatDateBR(p.settlementDate)}.`,
    `3. COTAS. Cada cota mensal vale ${quotas}. O participante pode ter mais de uma cota. A mensalidade é a quantidade de cotas multiplicada pelo valor da cota, com vencimento todo dia ${p.dueDay}.`,
    "4. PAGAMENTOS. Um pagamento só é considerado recebido após conferência e confirmação pela administração. O envio de comprovante não confirma o pagamento automaticamente. Antecipações parciais ou integrais são permitidas.",
    "5. RESULTADOS. Eventuais resultados vêm exclusivamente de atividades de arrecadação legalmente permitidas, devidamente registradas. Resultado líquido = receitas adicionais − despesas − tributos e deduções.",
    `6. DISTRIBUIÇÃO. O resultado líquido positivo, após a remuneração administrativa, é distribuído pelo critério de saldo diário proporcional: cada valor efetivamente recebido conta os dias desde a data do crédito até o fim das contribuições (${formatDateBR(p.contributionEndDate)}). Valores pagos antes do início do ciclo contam a partir do início. Estornos e devoluções deixam de contar a partir da sua data. Não há distribuição sobre valores não recebidos, nem acima dos recursos efetivamente disponíveis.`,
    "6.1 PREJUÍZO. Se o resultado líquido for negativo, não há remuneração administrativa e o prejuízo é dividido proporcionalmente ao valor que cada participante mantém na caixinha na apuração.",
    "6.2 SAÍDA DURANTE O CICLO. Quem sair recebe de volta o valor depositado na saída e participa do resultado apenas pelos dias em que o dinheiro permaneceu na caixinha.",
    `7. REMUNERAÇÃO ADMINISTRATIVA. ${formatPercentBps(p.adminFeeBps)} do resultado líquido positivo, nunca sobre o valor contribuído (principal). Não há remuneração quando não houver resultado líquido positivo. O pagamento depende de validação jurídica e tributária.`,
    "8. ALTERAÇÕES. Estas regras ficam congeladas quando publicadas. Mudanças posteriores não alteram retroativamente direitos já apurados.",
    "9. TRANSPARÊNCIA. Todas as movimentações ficam registradas no livro-caixa e na trilha de auditoria. Cada participante acessa somente os próprios dados individuais e a prestação de contas coletiva.",
  ].join("\n\n");
}
