import { expect, test } from "@playwright/test";
import { credentials, signIn, signOut, totp } from "./support";

test.describe("administração", () => {
  test("2FA obrigatório, conferência do pagamento e novo login com código", async ({ page }) => {
    const { admin, password } = credentials();

    // 1. Primeiro acesso: a configuração do 2FA vem antes de qualquer tela administrativa.
    await signIn(page, admin, password);
    await expect(page).toHaveURL(/\/seguranca\/dois-fatores$/);
    expect((await page.request.get("/api/relatorios/participantes?ciclo=x&formato=pdf")).status()).toBe(404);
    await page.goto("/admin/pagamentos");
    await expect(page).toHaveURL(/\/seguranca\/dois-fatores$/);

    await page.getByLabel("Confirme a sua senha").fill(password);
    await page.getByRole("button", { name: "Começar" }).click();
    const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
    await expect(page.getByTestId("backup-codes").locator("li")).toHaveCount(10);
    const activate = page.getByRole("button", { name: "Ativar verificação em duas etapas" });
    await expect(activate).toBeDisabled(); // só depois de confirmar que guardou os códigos
    await page.getByLabel("Guardei os códigos de recuperação").check();
    await page.getByLabel("Código de 6 dígitos").fill(totp(secret));
    await activate.click();
    await expect(page).toHaveURL(/\/admin$/);

    // 2. Cria outro grupo, confirma o isolamento e volta para a caixinha original.
    await page.getByRole("link", { name: "Minhas caixinhas" }).click();
    await page.getByRole("link", { name: "Nova caixinha" }).click();
    await page.getByLabel("Nome da caixinha").fill("Viagem da Turma");
    await page.getByLabel("Descrição (opcional)").fill("Grupo fictício criado pelo teste automatizado.");
    await page.getByRole("button", { name: "Criar caixinha" }).click();
    await expect(page).toHaveURL(/\/admin\?criada=1$/);
    await expect(page.getByText("Viagem da Turma", { exact: true }).first()).toBeVisible();

    await page.goto("/admin/caixinhas");
    const novaCaixinha = page.getByRole("heading", { name: "Viagem da Turma" }).locator("../../..");
    await expect(novaCaixinha.getByText("Em uso")).toBeVisible();
    const caixinhaOriginal = page.getByRole("heading", { name: "Caixinha dos Amigos" }).locator("../../..");
    await caixinhaOriginal.getByRole("button", { name: "Usar esta caixinha" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Caixinha dos Amigos", { exact: true }).first()).toBeVisible();

    // 3. Confere e confirma o pagamento informado pelo participante.
    await page.goto("/admin/pagamentos");
    await page
      .getByRole("link", { name: /João E2E/ })
      .first()
      .click();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Confirmar pagamento" }).click();
    // A página volta já no estado final: confirmado, com recibo disponível.
    await expect(page.getByText("Confirmado por")).toBeVisible();
    await expect(page.getByRole("link", { name: "Baixar recibo (PDF)" })).toBeVisible();

    // 4. Novo login: senha não basta; código errado é recusado; código certo entra.
    await signOut(page);
    await signIn(page, admin, password);
    await expect(page.getByText("Verificação em duas etapas")).toBeVisible();
    await page.getByLabel("Código de 6 dígitos").fill("000000");
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText(/Código inválido/)).toBeVisible();
    await page.waitForTimeout(11_000); // limite de 3 tentativas a cada 10 s nas rotas de 2FA
    await page.getByLabel("Código de 6 dígitos").fill(totp(secret, Date.now() + 30_000));
    await page.getByRole("button", { name: "Confirmar" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // 5. Auditoria registra o login malsucedido e a verificação.
    await page.goto("/admin/auditoria");
    await expect(page.getByText("Tentativa de login malsucedida").first()).toBeVisible();
    await expect(page.getByText("Código da verificação em duas etapas recusado").first()).toBeVisible();
  });
});
