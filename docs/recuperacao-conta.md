# Login, convites e recuperação por e-mail

**Decisão atual — 22/10/2026:** convites e recuperação usam somente o e-mail da conta. O aplicativo autenticador
permanece no login, obrigatório para a administração e opcional para participantes. Somente a administração da
caixinha de destino pode enviar ou reenviar convites.

## Caminhos

| Necessidade                                | Caminho                                                                                                          | Resultado                                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convite                                    | **Participantes → Novo participante → Cadastrar participante → Acesso ao sistema → Enviar convite de acesso**    | Link por e-mail para definir a senha, válido por uma hora.                                                                                            |
| Esqueci a senha                            | **Entrar → Esqueci minha senha ou perdi o autenticador → Esqueci minha senha → Enviar link por e-mail**          | Link para nova senha, válido por uma hora. Preserva o autenticador.                                                                                   |
| Perdi o autenticador                       | **Entrar → Esqueci minha senha ou perdi o autenticador → Perdi acesso ao autenticador → Enviar link por e-mail** | Link de uso único, válido por 15 minutos, para definir nova senha e recuperar o acesso.                                                               |
| Confirmação da recuperação do autenticador | Abrir o link recebido → **Nova senha → Confirme a nova senha → Confirmar recuperação → Entrar novamente**        | Invalida sessões, autenticador anterior, reservas, dispositivos de confiança e links pendentes. A administração exige cadastrar um novo autenticador. |

Endereços: `/login`, `/recuperar-senha`, `/recuperar-senha?tipo=autenticador`, `/redefinir-senha` e
`/recuperar-autenticador?token=…`. A tela do código no login também oferece o link direto para recuperar o
autenticador por e-mail. O telefone permanece apenas como contato opcional no cadastro.

## Proteções

- Solicitar um link ou abrir sua página não altera a conta. A recuperação acontece somente ao confirmar a nova senha.
- O link do autenticador usa identificador aleatório de 256 bits, com hash no banco e comprovação vinculada ao
  e-mail, senha e autenticador vigentes. Trocar qualquer um deles invalida o link já emitido.
- Um reenvio invalida o link anterior. A confirmação é atômica e de uso único, inclusive em chamadas simultâneas.
- Finalidades separadas: o link comum de senha não remove o autenticador, e o link de autenticador não funciona
  no endpoint comum de redefinição de senha.
- A resposta pública é genérica. Conta inexistente, suspensa ou sem autenticador não recebe link de recuperação
  de autenticador. A entrega ocorre após a resposta, sem revelar a existência da conta pela espera do SMTP.
- Há limites no banco compartilhados entre instâncias: até cinco solicitações por origem e três por e-mail em
  15 minutos; até dez tentativas de confirmação por origem no mesmo intervalo.
- A conclusão define uma nova senha, encerra as sessões e invalida os comprovantes pendentes. O usuário precisa
  entrar novamente. Não há abertura automática de sessão ou promoção de papel.
- Os eventos ficam na auditoria, sem senhas, links ou códigos. O titular recebe aviso por e-mail após a conclusão.
- Sem acesso ao e-mail, a recuperação deve ser assistida após comprovação de identidade. A rotina operacional
  `npm run admin:reset-2fa` permanece disponível no servidor com justificativa auditada.

## Envio e publicação

É usado o SMTP já existente no projeto (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `MAIL_FROM`).
Sem SMTP, o desenvolvimento grava mensagens em `.outbox/`; em produção, SMTP é necessário. Falha de envio
invalida o link recém-criado e registra uma mensagem operacional sem o conteúdo sensível.

A recuperação não exige novos pacotes, tabelas, migrações ou provedor de envio. O custo e os limites do e-mail
dependem do plano ou serviço SMTP configurado; a implementação reaproveita o envio de e-mail do aplicativo.

A validação também identificou avisos de segurança na versão existente do Next.js. A proposta atualiza Next.js
e sua configuração de análise de 16.4.0 para 16.4.2, correção da mesma linha de versões, sem acrescentar integrações.

Na publicação pela Hostinger, configurar a URL oficial em `BETTER_AUTH_URL`, manter a chave de segurança ao
migrar contas existentes e testar o SMTP no ambiente de destino. Nenhuma recuperação altera cotas, mensalidades,
pagamentos, saldos ou permissões de grupo.

Os testes de integração usam banco local separado e mensagens simuladas. A proposta de revisão ainda precisa
ser integrada e publicada para que as novas telas apareçam no site público.
