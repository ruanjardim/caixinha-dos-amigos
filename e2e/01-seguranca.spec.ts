import { expect, test } from "@playwright/test";
import { credentials, signIn } from "./support";

test.describe("segurança básica", () => {
  test("formulário de login nunca envia credenciais pela URL sem JavaScript", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
    const page = await context.newPage();
    const navigations: Array<{ method: string; url: string }> = [];
    page.on("request", (request) => {
      if (request.isNavigationRequest()) navigations.push({ method: request.method(), url: request.url() });
    });

    await page.goto("/login");
    await page.getByLabel("E-mail").fill("participante@caixinha.local");
    await page.getByLabel("Senha").fill("segredo-que-nao-pode-ir-na-url");
    await page.getByRole("button", { name: "Entrar" }).click();

    const submission = navigations.at(-1);
    expect(submission?.method).toBe("POST");
    expect(submission?.url).not.toContain("password=");
    expect(submission?.url).not.toContain("segredo-que-nao-pode-ir-na-url");
    expect(page.url()).not.toContain("segredo-que-nao-pode-ir-na-url");
    await context.close();
  });

  test("páginas usam CSP com nonce (sem 'unsafe-inline' em scripts) e bloqueiam iframes", async ({ page }) => {
    const response = await page.goto("/login");
    const headers = response!.headers();
    const csp = headers["content-security-policy"];
    const script = csp.split(";").find((d) => d.trim().startsWith("script-src"))!;
    expect(script).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");

    // A página funciona com a CSP: o formulário responde (JavaScript hidratado).
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
    });
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    expect(violations).toEqual([]);
  });

  test("áreas privadas exigem login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/minha-caixinha/extrato");
    await expect(page).toHaveURL(/\/login$/);
    const api = await page.request.get("/api/meus-dados");
    expect(api.status()).toBe(401);
  });

  test("senha errada: mensagem genérica, sem revelar se o e-mail existe", async ({ page }) => {
    const { participant } = credentials();
    await signIn(page, participant, "senha-totalmente-errada");
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
