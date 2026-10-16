import { expect, test } from "@playwright/test";
import { credentials, signIn, signOut } from "./support";

test.describe("participante", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // celular

  test("entra, informa um pagamento (fica em análise) e vê só os próprios dados", async ({ page }) => {
    const { participant, password } = credentials();
    await signIn(page, participant, password);
    await expect(page).toHaveURL(/\/minha-caixinha$/);
    await expect(page.getByRole("heading", { name: "Olá, João!" })).toBeVisible();

    await page.getByRole("link", { name: "Minhas caixinhas" }).click();
    await expect(page).toHaveURL(/\/caixinhas$/);
    await expect(page.getByRole("link", { name: "Nova caixinha" })).toBeVisible();
    await page.getByRole("link", { name: "Nova caixinha" }).click();
    await expect(page.getByRole("heading", { name: "Criar uma caixinha" })).toBeVisible();
    await page.goto("/minha-caixinha");

    await page.goto("/minha-caixinha/informar-pagamento");
    await page.getByLabel("Valor pago (R$)").fill("100,00");
    await page.getByLabel("Código da transação (opcional)").fill("E2E-PIX-0001");
    await page.getByRole("button", { name: "Enviar para conferência" }).click();
    await expect(page).toHaveURL(/informado=1/);
    await expect(page.getByText("Pagamento informado!")).toBeVisible();

    // Área administrativa e relatórios consolidados: bloqueados no servidor.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/minha-caixinha$/);
    expect((await page.request.get("/api/relatorios/participantes?ciclo=x&formato=pdf")).status()).toBe(404);

    // LGPD: exporta os PRÓPRIOS dados; pedir os de outra pessoa não funciona.
    const own = await page.request.get("/api/meus-dados");
    expect(own.status()).toBe(200);
    const data = await own.json();
    expect(data.cadastro.nome).toBe("João E2E");
    expect(data.participacoes[0].pagamentos[0]).toMatchObject({ valorCentavos: 10_000, situacao: "UNDER_REVIEW" });
    expect((await page.request.get("/api/meus-dados?participante=outro-id")).status()).toBe(404);

    await signOut(page);
  });

  test("alterna o tema e acessa todo o menu no celular", async ({ page }) => {
    const { participant, password } = credentials();
    await signIn(page, participant, password);

    await page.getByRole("button", { name: "Ativar tema escuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Ativar tema claro" })).toBeVisible();

    await page.getByRole("button", { name: "Mais" }).click();
    await expect(page.getByRole("dialog", { name: "Menu completo" })).toBeVisible();
    await page.getByRole("link", { name: "Regras" }).click();
    await expect(page).toHaveURL(/\/minha-caixinha\/regras$/);

    await signOut(page);
  });
});
