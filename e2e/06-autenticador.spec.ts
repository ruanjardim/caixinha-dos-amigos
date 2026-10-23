import { expect, test } from "@playwright/test";
import { credentials, signIn, signOut, totp } from "./support";

test.describe("ativação e login pelo autenticador", () => {
  test("código TOTP aceito abre a administração e permite novo login com código formatado", async ({
    page,
  }, testInfo) => {
    const { admin, password } = credentials();
    await signIn(page, admin, password);
    await expect(page).toHaveURL(/\/seguranca\/dois-fatores$/);
    await page.getByLabel("Confirme a sua senha").fill(password);
    await page.getByRole("button", { name: "Começar" }).click();
    const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
    await page.getByLabel("Guardei os códigos de recuperação").check();
    await page.getByLabel("Código de 6 dígitos").fill(totp(secret));
    const activation = page.waitForResponse((response) => response.url().endsWith("/two-factor/verify-totp"));
    await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
    expect((await activation).status()).toBe(200);
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto("/seguranca/dois-fatores");
    await expect(page.getByText("A verificação em duas etapas está ativa na sua conta.")).toBeVisible();
    await page.getByRole("link", { name: "Voltar para a caixinha" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await signOut(page);
    await signIn(page, admin, password);
    const code = totp(secret);
    await page.getByLabel("Código de 6 dígitos").fill(`${code.slice(0, 3)} ${code.slice(3)}`);
    const login = page.waitForResponse((response) => response.url().endsWith("/two-factor/verify-totp"));
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    expect((await login).status()).toBe(200);
    await expect(page).toHaveURL(/\/admin$/);
    await page.screenshot({ path: testInfo.outputPath("administracao-apos-autenticador.png") });
  });

  test("ativação distingue falha do servidor, sessão expirada e conexão e aceita código colado com espaço", async ({
    page,
  }) => {
    const { participant, password } = credentials();
    await signIn(page, participant, password);
    await expect(page).toHaveURL(/\/minha-caixinha$/);
    await page.goto("/seguranca/dois-fatores");
    await page.getByLabel("Confirme a sua senha").fill(password);
    await page.getByRole("button", { name: "Começar" }).click();
    const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
    await page.getByLabel("Guardei os códigos de recuperação").check();
    await page.getByLabel("Código de 6 dígitos").fill("123");
    const activate = page.getByRole("button", { name: "Ativar verificação em duas etapas" });
    await activate.click();
    await expect(page.getByText("Informe os seis dígitos do código do autenticador.")).toBeVisible();

    let failure: "server" | "session" | "network" = "server";
    await page.route("**/api/auth/two-factor/verify-totp", async (route) => {
      if (failure === "network") return route.abort("failed");
      return route.fulfill({
        status: failure === "server" ? 503 : 401,
        json: {
          code: failure === "server" ? "INTERNAL_SERVER_ERROR" : "INVALID_TWO_FACTOR_COOKIE",
          message: "detalhe interno que não deve aparecer",
        },
      });
    });
    await page.getByLabel("Código de 6 dígitos").fill("123456");
    await activate.click();
    await expect(
      page.getByText("O servidor não conseguiu concluir a verificação. Tente novamente em instantes."),
    ).toBeVisible();
    await expect(page.getByText(/Código inválido/)).toHaveCount(0);
    await expect(activate).toBeEnabled();
    failure = "session";
    await activate.click();
    await expect(
      page.getByText("Sua sessão de verificação expirou. Entre novamente com e-mail e senha."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Entrar novamente" })).toHaveAttribute("href", "/login");
    failure = "network";
    await activate.click();
    await expect(
      page.getByText("Não foi possível conectar ao aplicativo. Confira a conexão e tente novamente."),
    ).toBeVisible();
    await expect(activate).toBeEnabled();
    await expect(page.getByText("detalhe interno que não deve aparecer")).toHaveCount(0);

    await page.unroute("**/api/auth/two-factor/verify-totp");
    const code = totp(secret);
    await page.getByLabel("Código de 6 dígitos").fill(`${code.slice(0, 3)} ${code.slice(3)}`);
    const request = page.waitForRequest((request) => request.url().endsWith("/two-factor/verify-totp"));
    await activate.click();
    expect((await request).postDataJSON()).toEqual({ code });
    await expect(page).toHaveURL(/\/minha-caixinha$/);
  });

  for (const scenario of [
    {
      status: 503,
      code: "INTERNAL_SERVER_ERROR",
      text: "O servidor não conseguiu concluir a verificação. Tente novamente em instantes.",
    },
    {
      status: 401,
      code: "INVALID_TWO_FACTOR_COOKIE",
      text: "Sua sessão de verificação expirou. Entre novamente com e-mail e senha.",
    },
    {
      status: 429,
      code: "ACCOUNT_TEMPORARILY_LOCKED",
      text: "A verificação foi bloqueada temporariamente após várias tentativas. Aguarde 15 minutos e entre novamente.",
    },
    {
      status: 401,
      code: "INVALID_CODE",
      text: "Código inválido para esta configuração. Use o código atual da Caixinha dos Amigos no autenticador.",
    },
  ]) {
    test(`login apresenta a causa ${scenario.code} sem expor detalhes internos`, async ({ page }) => {
      await page.route("**/api/auth/sign-in/email", (route) => route.fulfill({ json: { twoFactorRedirect: true } }));
      await page.route("**/api/auth/two-factor/verify-totp", (route) =>
        route.fulfill({
          status: scenario.status,
          json: { code: scenario.code, message: "detalhe interno que não deve aparecer" },
        }),
      );
      await signIn(page, "teste-autenticador@caixinha.local", "Senha fictícia deste teste!");
      await page.getByLabel("Código de 6 dígitos").fill("123456");
      const confirm = page.getByRole("button", { name: "Confirmar", exact: true });
      await confirm.click();
      await expect(page.getByText(scenario.text)).toBeVisible();
      await expect(page.getByText("detalhe interno que não deve aparecer")).toHaveCount(0);
      await expect(confirm).toBeEnabled();
    });
  }
});
