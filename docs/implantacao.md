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
- **Não** definir `DEV_SEED_PASSWORD`, `LOCAL_PG_*` nem `TEST_DATABASE_URL`.

## Passos

```bash
npm ci
npm run check            # typecheck, lint, testes e build
npm run db:deploy        # aplica migrations
npm run admin:create -- --email voce@exemplo.com --name "Seu Nome"
npm start                # porta 3000 (use um proxy reverso com HTTPS)
```

Depois: na tela de login, use "Esqueci minha senha" para definir a senha do administrador.

## Checklist antes de publicar

- [ ] Todas as verificações de `npm run check` passando
- [ ] Backup automático configurado **e** restauração testada
- [ ] HTTPS ativo; HSTS conferido
- [ ] 2FA para administradores (Fase 7)
- [ ] Termo de uso e aviso de privacidade publicados
- [ ] Recursos sensíveis permanecem desligados até parecer jurídico
