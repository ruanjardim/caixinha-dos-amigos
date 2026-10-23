import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import TwoFactorPage from "@/app/(auth)/seguranca/dois-fatores/page";
import { getCurrentUser, type CurrentUser } from "@/modules/auth/session";

vi.mock("@/modules/auth/auth", () => ({ auth: {} }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/modules/auth/session", async (original) => ({
  ...(await original<typeof import("@/modules/auth/session")>()),
  getCurrentUser: vi.fn(),
}));
vi.mock("@/app/(auth)/seguranca/dois-fatores/two-factor-setup", () => ({
  TwoFactorSetup: ({ homePath }: { homePath: string }) => <a href={homePath}>Continuar após ativar</a>,
  DisableTwoFactor: () => null,
}));

function user(changes: Partial<CurrentUser> = {}): CurrentUser {
  return {
    userId: "teste",
    name: "Teste",
    email: "teste@caixinha.local",
    role: "ADMIN",
    status: "ACTIVE",
    participantId: null,
    twoFactorPending: true,
    twoFactorEnabled: false,
    ...changes,
  };
}

describe("destino depois da ativação do autenticador", () => {
  it("administrador pendente continua para a administração, sem voltar à configuração", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user());
    const html = renderToStaticMarkup(await TwoFactorPage());
    expect(html).toContain('href="/admin"');
    expect(html).not.toContain('href="/seguranca/dois-fatores"');
  });

  it("participante que administra uma caixinha também segue para a administração", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user({ role: "PARTICIPANT", caixinhaRole: "OWNER" }));
    expect(renderToStaticMarkup(await TwoFactorPage())).toContain('href="/admin"');
  });

  it("participante comum continua para sua área", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(
      user({ role: "PARTICIPANT", caixinhaRole: "PARTICIPANT", twoFactorPending: false }),
    );
    expect(renderToStaticMarkup(await TwoFactorPage())).toContain('href="/minha-caixinha"');
  });
});
