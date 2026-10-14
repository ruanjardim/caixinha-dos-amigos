# Segurança e LGPD

## Implementado (Fase 1)

| Controle | Como |
| --- | --- |
| Senhas | argon2id (19 MiB, t=2, p=1); mínimo 10 caracteres; nunca em texto simples |
| Sessões | Armazenadas no banco, cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; expiram em 7 dias; revogadas ao redefinir senha |
| Cadastro | Desativado; contas criadas somente pela administração |
| Recuperação de acesso | Link de uso único válido por 1 hora; resposta idêntica para e-mails existentes e inexistentes (não revela participantes) |
| Rate limiting | Login: 5/min por IP; pedido de redefinição: 3 a cada 15 min; geral: 100/min. Contadores no banco. |
| CSRF | Better Auth valida a origem das requisições; Server Actions do Next.js comparam Origin/Host; cookies `SameSite=Lax` |
| XSS | React escapa toda saída; CSP restritiva (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`) |
| SQL Injection | Somente consultas parametrizadas (Prisma) |
| Cabeçalhos | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP, HSTS (produção) |
| Permissões | Verificadas no servidor; isolamento entre participantes (ver [permissoes.md](permissoes.md)) |
| Auditoria | `audit_log` somente inclusão (garantido por gatilho); campos sensíveis removidos automaticamente |
| Erros | Mensagens genéricas ao usuário; detalhes só no log do servidor (`toActionError`) |
| Configuração | `.env` validado na inicialização; segredos nunca no código; `.env` fora do git |
| Usuário suspenso | Não consegue iniciar sessão; permissões zeradas imediatamente |
| PWA | Service worker não armazena páginas nem dados financeiros em cache |

## Pendente (Fase 7)

- 2FA (TOTP) obrigatório para administradores.
- CSP com nonce (remover `'unsafe-inline'` de `script-src`).
- Registro de tentativas de login malsucedidas na auditoria.
- Verificação de senhas vazadas (Have I Been Pwned, k-anonimidade).
- Política de retenção e rotina automatizada de backup.

## LGPD

- **Minimização:** o cadastro coleta apenas nome, e-mail, telefone e data de entrada. Dados adicionais só quando
  necessários.
- **Finalidade:** dados usados exclusivamente para a gestão da caixinha.
- **Acesso:** cada participante vê apenas os próprios dados; administradores veem o necessário para a gestão.
- **Rastreabilidade:** acessos e alterações relevantes ficam na auditoria.
- **Retenção:** registros financeiros são mantidos pelo prazo legal mesmo após a saída do participante; dados
  pessoais não financeiros podem ser anonimizados a pedido (a implementar).
- **Ambientes de demonstração:** somente dados fictícios (domínio `.local`).
- A definir com o grupo: termo de uso e aviso de privacidade, encarregado (DPO) e canal para solicitações.
