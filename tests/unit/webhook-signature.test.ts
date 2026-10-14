import { describe, expect, it } from "vitest";
import { signWebhook, verifyWebhookSignature } from "@/modules/pix/signature";

const SECRET = "s".repeat(40);
const NOW = new Date("2026-12-05T15:00:00Z");
const TS = Math.floor(NOW.getTime() / 1000);
const BODY = '{"id":"evt-1","type":"pix.paid"}';

function check(over: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) {
  return verifyWebhookSignature({
    secret: SECRET,
    rawBody: BODY,
    signature: signWebhook(SECRET, TS, BODY),
    timestamp: String(TS),
    now: NOW,
    ...over,
  });
}

describe("assinatura do webhook (HMAC-SHA256)", () => {
  it("aceita mensagem íntegra dentro da janela", () => {
    expect(check()).toEqual({ ok: true });
    expect(check({ now: new Date(NOW.getTime() + 299_000) })).toEqual({ ok: true });
  });

  it("rejeita corpo alterado, segredo errado e cabeçalhos ausentes", () => {
    expect(check({ rawBody: BODY.replace("evt-1", "evt-2") }).ok).toBe(false);
    expect(check({ signature: signWebhook("x".repeat(40), TS, BODY) }).ok).toBe(false);
    expect(check({ signature: null }).ok).toBe(false);
    expect(check({ timestamp: null }).ok).toBe(false);
    expect(check({ signature: "v1=curta" }).ok).toBe(false);
  });

  it("rejeita mensagem antiga (reaproveitamento) ou do futuro", () => {
    expect(check({ now: new Date(NOW.getTime() + 301_000) })).toMatchObject({ ok: false });
    expect(check({ now: new Date(NOW.getTime() - 301_000) })).toMatchObject({ ok: false });
    expect(check({ timestamp: "abc" })).toMatchObject({ ok: false, reason: /Carimbo/ });
  });
});
