# Implantação

> O sistema **não deve ser publicado** antes da conclusão das fases planejadas e das validações jurídicas
> (ver [conformidade.md](conformidade.md)). Este guia descreve o procedimento para quando a publicação for
> autorizada.

## Requisitos

- Node.js 20.19+ (recomendado 24 LTS)
- PostgreSQL 16+ com TLS e backups automáticos
- Domínio com HTTPS (obrigatório para cookies seguros e para o PWA)
- Servidor SMTP para recuperação de senha e comunicados
- Armazenamento persistente para comprovantes (`storage/uploads` ou armazenamento de objetos), com backup

## Variáveis de ambiente

Ver [`.env.example`](../.env.example). Em produção:

- `BETTER_AUTH_SECRET`: 32+ bytes aleatórios, exclusivos do ambiente.
- `BETTER_AUTH_URL`: URL pública (`https://...`).
- `DATABASE_URL` com `sslmode=require`.
- `SMTP_*` preenchidos (sem SMTP o envio de e-mails falha em produção).
- `PIX_PROVIDER="manual"` em produção (a simulação é para testes). `PIX_MANUAL_*` somente com a conta da
  estrutura jurídica da caixinha (nunca conta pessoal); vazio até lá.
- `PIX_WEBHOOK_SECRET` e `CRON_SECRET`: 32+ bytes aleatórios, exclusivos do ambiente.
- **Não** definir `DEV_SEED_PASSWORD`, `LOCAL_PG_*` nem `TEST_DATABASE_URL`.

## Passos

```bash
npm ci
npm run check            # typecheck, lint, testes e build
npm run db:deploy        # aplica migrations
npm run admin:create -- --email voce@exemplo.com --name "Seu Nome"
npm start                # porta 3000 (use um proxy reverso com HTTPS)
```

Depois: na tela de login, use "Esqueci minha senha" para definir a senha do administrador. No primeiro acesso, o
sistema exige a configuração da verificação em duas etapas (aplicativo autenticador + códigos de recuperação).

Administrador que perder o autenticador: **Recuperar acesso → Perdi acesso ao autenticador** envia um link
de uso único ao e-mail da conta, válido por 15 minutos. A confirmação exige nova senha e encerra as sessões;
antes de administrar novamente, deve cadastrar um novo autenticador. Ver [recuperação por e-mail](recuperacao-conta.md).
Sem acesso ao e-mail, permanece a rotina assistida `npm run admin:reset-2fa -- --email E --reason "motivo"`,
executada no servidor após comprovar a identidade e com justificativa na auditoria.

Agende a tarefa diária (lembretes, expiração de cobranças e limpeza de comprovantes órfãos), 1×/dia:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/tarefas/diarias
```

## Checklist antes de publicar

- [ ] Todas as verificações de `npm run check` passando
- [ ] Backup automático configurado **e** restauração testada
- [ ] HTTPS ativo; HSTS conferido
- [ ] Administradores com 2FA configurado e códigos de recuperação guardados
- [ ] `npm run test:e2e` passando (build de produção)
- [ ] `npm run backup` agendado e restauração testada
- [ ] Termo de uso e aviso de privacidade publicados
- [ ] Recursos sensíveis permanecem desligados até parecer jurídico
- [ ] `PIX_PROVIDER=manual` e chave da conta da caixinha conferida (titular = estrutura jurídica)
- [ ] Tarefa diária agendada e testada
