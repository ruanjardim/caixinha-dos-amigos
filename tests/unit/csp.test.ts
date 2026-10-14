import { describe, expect, it } from "vitest";
import { API_CSP, generateNonce, pageCsp } from "@/lib/csp";

describe("Content-Security-Policy", () => {
  it("scripts só com o nonce da resposta, sem 'unsafe-inline' nem 'unsafe-eval' em produção", () => {
    const csp = pageCsp("abc123", true);
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).toBe("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("desenvolvimento libera eval (depuração do React), nunca inline", () => {
    const script = pageCsp("n", false)
      .split("; ")
      .find((d) => d.startsWith("script-src"))!;
    expect(script).toContain("'unsafe-eval'");
    expect(script).not.toContain("'unsafe-inline'");
  });

  it("nonce imprevisível a cada chamada", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64")).toHaveLength(16);
  });

  it("APIs não executam nem embutem nada", () => {
    expect(API_CSP).toMatch(/^default-src 'none'/);
  });
});
