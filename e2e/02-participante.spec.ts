import { expect, test } from "@playwright/test";
import { credentials, signIn, signOut } from "./support";

test.describe("participante", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // celular

  test("entra, informa um pagamento (fica em análise) e vê só os próprios dados", async ({ page }) => {
    const { participant, password } = credentials();
    await signIn(page, participant, password);
    await expect(page).toHaveURL(/\/minha-caixinha$/);
    await expect(page.getByRole("heading", { name: "Olá, João!" })).toBeVisible();

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
});
