# Segurança e LGPD

## Implementado (Fase 1)

| Controle              | Como                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Senhas                | argon2id (19 MiB, t=2, p=1); mínimo 10 caracteres; nunca em texto simples                                                                                                                                       |
| Sessões               | Armazenadas no banco, cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; expiram em 7 dias; revogadas ao redefinir senha                                                                                  |
| Cadastro              | Desativado; contas criadas somente pela administração                                                                                                                                                           |
| Recuperação de acesso | Link de uso único válido por 1 hora; resposta idêntica para e-mails existentes e inexistentes (não revela participantes)                                                                                        |
| Rate limiting         | Login: 5/min por IP; pedido de redefinição: 3 a cada 15 min; geral: 100/min. Contadores no banco.                                                                                                               |
| CSRF                  | Better Auth valida a origem das requisições; Server Actions do Next.js comparam Origin/Host; cookies `SameSite=Lax`                                                                                             |
| XSS                   | React escapa toda saída; CSP restritiva (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`)                                                                                                   |
| SQL Injection         | Somente consultas parametrizadas (Prisma)                                                                                                                                                                       |
| Cabeçalhos            | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP, HSTS (produção)                                                                                                                  |
| Permissões            | Verificadas no servidor; isolamento entre participantes (ver [permissoes.md](permissoes.md))                                                                                                                    |
| Auditoria             | `audit_log` somente inclusão (garantido por gatilho); campos sensíveis removidos automaticamente                                                                                                                |
| Erros                 | Mensagens genéricas ao usuário; detalhes só no log do servidor (`toActionError`)                                                                                                                                |
| Configuração          | `.env` validado na inicialização; segredos nunca no código; `.env` fora do git                                                                                                                                  |
| Usuário suspenso      | Não consegue iniciar sessão; permissões zeradas imediatamente                                                                                                                                                   |
| PWA                   | Service worker não armazena páginas nem dados financeiros em cache                                                                                                                                              |
| Comprovantes          | Tipo verificado pelo CONTEÚDO (PDF/PNG/JPG/WEBP), máx. 5 MB, nome saneado, hash SHA-256, guardados fora da pasta pública, download com verificação de permissão e `Content-Disposition: attachment` + `nosniff` |
| Pagamentos            | Nunca confirmados automaticamente; anti-duplicidade em 3 níveis (idempotência, referência única no banco, alerta de mesmo valor/data); confirmação atômica                                                      |
| Prestação de contas   | Somente totais coletivos; contribuições agregadas por mês; nenhum nome ou valor individual (testado)                                                                                                            |
| Comunicados           | Texto simples, exibido sem interpretar HTML (`<script>` aparece como texto — testado)                                                                                                                           |
| Recibos               | Só para pagamento confirmado, do próprio participante (ou admin); "não encontrado" para terceiros; código HMAC                                                                                                  |
| Relatórios            | Permissão por tipo verificada no servidor; "não encontrado" para quem não pode; emissão auditada (exportação de dados pessoais)                                                                                 |
| Webhook Pix           | Assinatura HMAC-SHA256 com janela de 5 min, comparação em tempo constante, id de evento único, corpo ≤ 64 KB, registro imutável de todos os eventos (inclusive rejeitados); nunca confirma pagamento sozinho    |
| Chave Pix             | Simulação usa chave inválida para qualquer banco; modo manual recusa chave CPF (conta pessoal)                                                                                                                  |
| Tarefa diária         | `Authorization: Bearer <CRON_SECRET>` com comparação em tempo constante; auditada                                                                                                                               |
| Notificações          | Decisões sobre pagamento vão só ao próprio participante; e-mails sem dados de outros participantes; preferência respeitada; envio único                                                                         |
| Ordem de verificação  | Em toda ação: sessão/permissão ANTES de validar dados                                                                                                                                                           |

## Implementado (Fase 7)

| Controle                   | Como                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verificação em duas etapas | TOTP (aplicativo autenticador) **obrigatório para administradores**: sem ele, o administrador só tem permissões de participante e é levado à configuração (servidor, não só interface). 10 códigos de recuperação de uso único; segredo e códigos cifrados no banco; bloqueio de 15 min após 10 códigos errados; administrador não consegue desligar. Opcional para participantes. Recuperação por link de e-mail de 15 minutos com nova senha e revogação de sessões; rotina assistida por linha de comando preservada. Ver [recuperação por e-mail](recuperacao-conta.md) |
| CSP com nonce              | Nonce novo a cada requisição (`src/proxy.ts`); `script-src 'self' 'nonce-…' 'strict-dynamic'`, sem `'unsafe-inline'` nem `'unsafe-eval'` em produção; páginas sempre dinâmicas; APIs com `default-src 'none'`                                                                                                                                                                                                                                                     |
| Auditoria de autenticação  | Login malsucedido (e-mail digitado, nunca a senha), códigos 2FA aceitos/recusados, uso de código de recuperação, ativação/desativação do 2FA                                                                                                                                                                                                                                                                                                                      |
| Webhook Pix                | No máximo 30 assinaturas inválidas gravadas por minuto; acima disso responde 429 sem gravar                                                                                                                                                                                                                                                                                                                                                                       |
| Arquivos                   | Comprovantes órfãos (sem vínculo há mais de 24 h) removidos pela tarefa diária                                                                                                                                                                                                                                                                                                                                                                                    |
| Dependências               | `npm audit` revisado: correções aplicadas via `overrides` (uuid, deepmerge-ts, mysql2). Restam alertas só na cadeia de lint (`braces` ≤ 3.0.3, sem versão corrigida publicada), ferramenta de desenvolvimento que não vai para produção                                                                                                                                                                                                                           |

## Pendente / recomendações

- Verificação de senhas vazadas (Have I Been Pwned, k-anonimidade) — exige chamada a serviço externo; avaliar.
- Teste de invasão por terceiro antes de movimentar dinheiro real.
- Backup do banco depende de `pg_dump` no servidor (ver [backup.md](backup.md)).

## LGPD

- **Minimização:** o cadastro coleta apenas nome, e-mail, telefone e data de entrada. Dados adicionais só quando
  necessários.
- **Finalidade:** dados usados exclusivamente para a gestão da caixinha.
- **Acesso:** cada participante vê apenas os próprios dados; administradores veem o necessário para a gestão.
- **Rastreabilidade:** acessos e alterações relevantes ficam na auditoria.
- **Retenção:** registros financeiros são mantidos pelo prazo legal mesmo após a saída do participante.
- **Acesso e portabilidade:** o participante baixa os próprios dados em JSON ("Meus dados" → "Baixar meus
  dados"); a administração pode gerar o mesmo arquivo a pedido do titular. Toda exportação é auditada.
- **Eliminação:** a administração anonimiza o cadastro (nome, e-mail, telefone substituídos; acesso, senha,
  sessões e 2FA removidos; avisos enviados desvinculados do e-mail) depois que o titular não tiver valores em
  aberto. Pagamentos, livro-caixa e auditoria são mantidos pelo prazo legal, sem identificação direta. Um cadastro
  anonimizado não pode ser reativado nem editado.
- **Ambientes de demonstração:** somente dados fictícios (domínio `.local`).
- A definir com o grupo: termo de uso e aviso de privacidade, encarregado (DPO) e canal para solicitações.
