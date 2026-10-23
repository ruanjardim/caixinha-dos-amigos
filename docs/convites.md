# Participantes e convites

Somente o responsável (`OWNER`) ou um administrador (`ADMIN`) da caixinha selecionada pode enviar ou reenviar
convites de acesso. Ter administração em outro grupo não concede essa permissão. A verificação em duas etapas
continua obrigatória para a administração.

## Cadastrar e convidar

1. Selecione a caixinha que deseja administrar.
2. Abra **Participantes → Novo participante** (`/admin/participantes/novo`).
3. Preencha nome completo, e-mail de acesso, telefone opcional e data de entrada. Clique em **Cadastrar participante**.
4. Nos detalhes do participante (`/admin/participantes/[id]`), abra **Acesso ao sistema → Enviar convite de acesso**.
5. O participante recebe no e-mail cadastrado um link válido por uma hora para definir a própria senha.
6. Para um cadastro com acesso ativo, use **Reenviar link de senha** quando necessário. A operação preserva o papel
   de quem já é responsável ou administrador do grupo.

A senha inicial é aleatória e descartada. A administração não conhece a senha escolhida pelo participante.
Para suspender um acesso existente, use **Suspender acesso**, com justificativa; isso encerra as sessões da conta.
Essa suspensão de conta é a função já existente e não constitui um gerenciador separado de convites pendentes.

O envio usa a integração de e-mail existente. Em produção, é necessário configurar SMTP. Em desenvolvimento,
sem SMTP, a mensagem fica em `.outbox/`, sem envio externo. Convites e recuperação usam somente o e-mail.
O telefone permanece como contato opcional; veja [Login e recuperação por e-mail](recuperacao-conta.md).

## Cotas e mensalidades

O convite libera o acesso à conta; as cotas são definidas separadamente:

1. Abra **Ciclos e cotas** e selecione o ciclo (`/admin/ciclos/[id]`).
2. Em **Incluir participante**, escolha a pessoa, a **Quantidade de cotas**, o **Valor da cota** e a **Data de entrada**.
3. Clique em **Incluir no ciclo**. O valor da cota deve estar previsto nas regras do ciclo.
4. No ciclo em preparação, publique as regras e use **Abrir ciclo** para gerar as parcelas previstas.
5. Quando o ciclo já estiver aberto, a inclusão gera as parcelas a partir do mês de entrada.

Enviar um convite não gera mensalidades, registra pagamentos ou altera o livro-caixa.

## Proteção no servidor

- As páginas exigem permissão administrativa e as ações exigem `users.manage`.
- O serviço de acesso relê no banco o status da conta, a configuração de duas etapas, o papel no grupo e o status
  da caixinha dentro da transação, antes de consultar ou alterar o participante.
- O participante de destino deve pertencer à caixinha selecionada. Sem contexto de grupo, a compatibilidade
  legada fica limitada ao administrador global e a cadastros explicitamente sem caixinha; não há busca sem filtro.
- Um papel antigo, um campo enviado pelo navegador ou a simples troca do identificador não concede acesso.
- Contas suspensas, administradores sem duas etapas e grupos arquivados não podem enviar convites.
- O cadastro público continua desativado. A recuperação da própria senha não cria conta nem vincula alguém a um grupo.

Cobertura automatizada: `tests/integration/participant-access.test.ts`, com banco separado e envio de e-mail simulado.
