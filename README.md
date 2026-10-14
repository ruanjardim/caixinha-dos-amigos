# Caixinha dos Amigos

Plataforma web para administrar a caixinha coletiva de um grupo privado: cotas mensais, controle de pagamentos,
livro-caixa, prestação de contas e apuração/distribuição de resultados — com transparência para os participantes
e rastreabilidade completa para a administração.

> **Status:** Fases 1 a 5 concluídas (fundação, gestão financeira, painéis, resultados e arrecadação). Veja [docs/roadmap.md](docs/roadmap.md).
>
> A plataforma **não realiza investimentos** e **não promete rendimento**. Recursos sensíveis (Pix real, venda de
> números de sorteio, pagamento da remuneração administrativa) ficam **desligados por padrão** até validação
> jurídica — veja [docs/conformidade.md](docs/conformidade.md).

## Stack

| Camada       | Tecnologia                                                         |
| ------------ | ------------------------------------------------------------------ |
| Aplicação    | Next.js 16 (App Router) + React 19 + TypeScript (strict)           |
| Banco        | PostgreSQL 17 local (binários oficiais via `embedded-postgres`); 16+ em produção |
| ORM          | Prisma 7 (driver adapter `pg`)                                     |
| Autenticação | Better Auth 1.7 — sessões no banco, senhas argon2id, rate limiting |
| Validação    | Zod 4                                                              |
| Interface    | Tailwind CSS 4, lucide-react, fonte Plus Jakarta Sans              |
| Gráficos     | Recharts 3 (paleta validada para daltonismo e contraste)           |
| PDF          | @react-pdf/renderer (recibos e relatórios, gerados no servidor)     |
| Excel        | ExcelJS (relatórios .xlsx com valores numéricos)                   |
| PWA          | Manifest + service worker próprio (`public/sw.js`)                 |
| Testes       | Vitest 5 (unitários + integração com o banco)                      |

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

Em desenvolvimento, e-mails (ex.: recuperação de senha) **não são enviados**: ficam gravados em `.outbox/`.

## Comandos

| Comando                                   | O que faz                                          |
| ----------------------------------------- | -------------------------------------------------- |
| `npm run dev`                             | Servidor de desenvolvimento                        |
| `npm run build` / `npm start`             | Build e execução de produção                       |
| `npm run typecheck`                       | Gera tipos de rotas e verifica TypeScript          |
| `npm run lint`                            | ESLint                                             |
| `npm test`                                | Testes automatizados (unitários + integração no banco `caixinha_test`) |
| `npm run check`                           | typecheck + lint + testes + build (use antes de publicar) |
| `npm run db:start` / `db:stop` / `db:status` | Liga, desliga e verifica o PostgreSQL local     |
| `npm run db:migrate`                      | Cria/aplica migrations (desenvolvimento)           |
| `npm run db:deploy`                       | Aplica migrations em produção                      |
| `npm run db:seed`                         | Dados fictícios de demonstração (bloqueado em produção) |
| `npm run db:studio`                       | Interface visual do banco                          |
| `npm run admin:create -- --email E --name "N"` | Cria um administrador (sem senha conhecida; definir via "Esqueci minha senha") |

## Estrutura

```
prisma/            schema, migrations (inclui gatilhos de integridade) e seed
scripts/           criar admin, PostgreSQL local (local-postgres.mjs)
public/            service worker, logotipo
src/app/           rotas (auth), (admin)/admin, (participante)/minha-caixinha, api
src/components/    ui/ (design system), layout/, brand/ (logotipo), pwa/
src/domain/        regras PURAS (sem I/O): dinheiro, datas, parcelas, contribuições, livro-caixa, regras
src/modules/       auth, audit, participants, cycles, payments, ledger, files
                   (cada um: schemas, service, actions; queries quando houver)
src/lib/           env validado, banco, e-mail, senha, utilitários
tests/             unit/ e integration/
docs/              documentação técnica
```

## Documentação

- [Arquitetura](docs/arquitetura.md)
- [Modelo de dados](docs/modelo-de-dados.md)
- [Permissões](docs/permissoes.md)
- [Segurança e LGPD](docs/seguranca.md)
- [Cálculos financeiros](docs/calculos-financeiros.md)
- [Backup e restauração](docs/backup.md)
- [Implantação](docs/implantacao.md)
- [Conformidade jurídica](docs/conformidade.md)
- [Roadmap, funcionalidades e pendências](docs/roadmap.md)
