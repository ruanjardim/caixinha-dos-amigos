# Caixinha dos Amigos

Plataforma web para administrar a caixinha coletiva de um grupo privado: cotas mensais, controle de pagamentos,
livro-caixa, prestação de contas e apuração/distribuição de resultados — com transparência para os participantes
e rastreabilidade completa para a administração.

> **Status:** as 7 fases planejadas estão concluídas (fundação, gestão financeira, painéis, resultados, arrecadação,
> integrações e qualidade). Antes de usar com dinheiro real, veja o checklist em [docs/implantacao.md](docs/implantacao.md). Veja [docs/roadmap.md](docs/roadmap.md).
>
> A plataforma **não realiza investimentos** e **não promete rendimento**. Recursos sensíveis (Pix real, venda de
> números de sorteio, pagamento da remuneração administrativa) ficam **desligados por padrão** até validação
> jurídica — veja [docs/conformidade.md](docs/conformidade.md).

## Stack

| Camada       | Tecnologia                                                                       |
| ------------ | -------------------------------------------------------------------------------- |
| Aplicação    | Next.js 16 (App Router) + React 19 + TypeScript (strict)                         |
| Banco        | PostgreSQL 17 local (binários oficiais via `embedded-postgres`); 16+ em produção |
| ORM          | Prisma 7 (driver adapter `pg`)                                                   |
| Autenticação | Better Auth 1.7 — sessões no banco, senhas argon2id, rate limiting               |
| Validação    | Zod 4                                                                            |
| Interface    | Tailwind CSS 4, lucide-react, fonte Plus Jakarta Sans                            |
| Gráficos     | Recharts 3 (paleta validada para daltonismo e contraste)                         |
| PDF          | @react-pdf/renderer (recibos e relatórios, gerados no servidor)                  |
| Excel        | ExcelJS (relatórios .xlsx com valores numéricos)                                 |
| PWA          | Manifest + service worker próprio (`public/sw.js`)                               |
| Testes       | Vitest 5 (unitários + integração com o banco)                                    |

## Requisitos

- Node.js **20.19+** (testado com 24.16)
- npm 10+
- Não é necessário instalar PostgreSQL nem Docker: `npm run db:start` liga um PostgreSQL 17 local
  (binários oficiais distribuídos pelo pacote `embedded-postgres`), com dados em `.postgres/`, escutando só em
  `localhost`. Se preferir Docker, há um `docker-compose.yml`.

## Instalação (desenvolvimento)

```bash
npm install                 # instala dependências e gera o Prisma Client
cp .env.example .env        # preencha BETTER_AUTH_SECRET, DEV_SEED_PASSWORD e LOCAL_PG_PASSWORD (e a senha nas URLs)
npm run db:start            # liga o PostgreSQL local e cria os bancos caixinha_dev e caixinha_test
npm run db:deploy           # aplica as migrations (inclui gatilhos de integridade)
npm run db:seed             # cria usuários FICTÍCIOS de demonstração
npm run dev                 # http://localhost:3000
```

Usuários de demonstração (senha = `DEV_SEED_PASSWORD` do seu `.env`):

- `admin@caixinha.local` — Administrador
- `joao@caixinha.local` — Participante

No primeiro acesso do administrador, o sistema pede a configuração da **verificação em duas etapas** (aplicativo
autenticador no celular, como Google Authenticator ou Microsoft Authenticator). Guarde os códigos de recuperação.

Em desenvolvimento, e-mails (ex.: recuperação de senha) **não são enviados**: ficam gravados em `.outbox/`.

## Comandos

| Comando                                             | O que faz                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`                                       | Servidor de desenvolvimento                                                    |
| `npm run build` / `npm start`                       | Build e execução de produção                                                   |
| `npm run typecheck`                                 | Gera tipos de rotas e verifica TypeScript                                      |
| `npm run lint`                                      | ESLint                                                                         |
| `npm test`                                          | Testes automatizados (unitários + integração no banco `caixinha_test`)         |
| `npm run test:e2e`                                  | Testes de ponta a ponta (Playwright, build de produção, banco `caixinha_e2e`)  |
| `npm run check`                                     | typecheck + lint + testes + build (use antes de publicar)                      |
| `npm run db:start` / `db:stop` / `db:status`        | Liga, desliga e verifica o PostgreSQL local                                    |
| `npm run db:migrate`                                | Cria/aplica migrations (desenvolvimento)                                       |
| `npm run db:deploy`                                 | Aplica migrations em produção                                                  |
| `npm run db:seed`                                   | Dados fictícios de demonstração (bloqueado em produção)                        |
| `npm run db:studio`                                 | Interface visual do banco                                                      |
| `npm run admin:create -- --email E --name "N"`      | Cria um administrador (sem senha conhecida; definir via "Esqueci minha senha") |
| `npm run admin:reset-2fa -- --email E --reason "M"` | Remove o 2FA de quem perdeu o celular e os códigos (auditado)                  |
| `npm run backup`                                    | Backup do banco + arquivos, com manifesto e retenção                           |

## Estrutura

```
prisma/            schema, migrations (inclui gatilhos de integridade) e seed
scripts/           criar admin, recuperar 2FA, backup, PostgreSQL local (local-postgres.mjs)
public/            service worker, logotipo
src/app/           rotas (auth), (admin)/admin, (participante)/minha-caixinha, api
src/components/    ui/ (design system), layout/, brand/ (logotipo), pwa/
src/domain/        regras PURAS (sem I/O): dinheiro, datas, parcelas, contribuições, livro-caixa, regras
src/modules/       auth, audit, participants, cycles, payments, ledger, files, results, reports,
                   fundraising, pix, notifications, privacy, dashboard, receipts, announcements
                   (cada um: schemas, service, actions; queries quando houver)
src/lib/           env validado, banco, e-mail, senha, utilitários
tests/             unit/ e integration/ (Vitest)
e2e/               testes de ponta a ponta (Playwright)
docs/              documentação técnica
```

## Documentação

- [Arquitetura](docs/arquitetura.md)
- [Modelo de dados](docs/modelo-de-dados.md)
- [Permissões](docs/permissoes.md)
- [Participantes, convites, cotas e mensalidades](docs/convites.md)
- [Segurança e LGPD](docs/seguranca.md)
- [Login e recuperação por e-mail e SMS — especificação pendente de implementação](docs/recuperacao-conta.md)
- [Cálculos financeiros](docs/calculos-financeiros.md)
- [Backup e restauração](docs/backup.md)
- [Implantação](docs/implantacao.md)
- [Conformidade jurídica](docs/conformidade.md)
- [Integrações: Pix, conciliação e notificações](docs/integracoes.md)
- [Roadmap, funcionalidades e pendências](docs/roadmap.md)
