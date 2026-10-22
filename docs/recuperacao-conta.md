# Login e recuperação da conta

**Decisão do titular do projeto — 22/10/2026:** o aplicativo autenticador permanece no login. Para recuperar a
conta, será necessário comprovar o controle do **e-mail e do telefone por SMS**. Os dois canais são obrigatórios.
Convites continuam restritos à administração da caixinha de destino.

**Estado:** especificação para implementação. A recuperação por dois canais ainda não foi implementada,
testada ou publicada. O titular informou não possuir um serviço de SMS. Nenhuma conta real foi recuperada,
nenhum SMS foi enviado e nenhum dado financeiro foi alterado nesta etapa.

## Comportamento desejado

| Situação                                  | Caminho e resultado previstos                                                                                                                                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrar normalmente                        | E-mail e senha → código do aplicativo autenticador → área autorizada da caixinha. O autenticador continua obrigatório para a administração.                                                                                                   |
| Preparar a recuperação                    | Com a sessão autenticada, confirmar a senha e a autenticação adicional exigida → verificar o e-mail da conta e o telefone por códigos separados → guardar os dois como contatos de recuperação verificados.                                   |
| Esqueci a senha, mas tenho o autenticador | **Entrar → Esqueci minha senha** → código no e-mail e código por SMS → validar ambos → definir e confirmar nova senha → entrar novamente, com o autenticador preservado.                                                                      |
| Perdi o autenticador                      | **Entrar → Perdi acesso ao autenticador** → código no e-mail e código por SMS → validar ambos → redefinir a credencial comprometida e, quando necessário, a senha → entrar e cadastrar um novo autenticador antes de acessar a administração. |
| Perdi o e-mail ou o número antigo         | A recuperação automática fica indisponível. Orientar um procedimento assistido de comprovação de identidade; conhecer dados cadastrais, receber apenas um código ou pedir a um administrador não deve liberar o acesso automaticamente.       |

Os textos e caminhos acima descrevem o fluxo a entregar. A ação **Perdi acesso ao autenticador** e a tela de
contatos de recuperação ainda não existem. A obrigatoriedade atual do autenticador para administradores é
preservada; torná-lo obrigatório para todos os participantes seria uma alteração adicional de política.

## Cadastro e alteração dos contatos

- O e-mail deve corresponder ao e-mail da própria conta, confirmado com código ou link de uso único.
- O telefone de recuperação deve pertencer à **conta**, inclusive quando o administrador não tiver um cadastro
  de participante. Armazenar número normalizado com código do país e data de verificação.
- O telefone de contato do participante, hoje opcional e editável, não deve virar um contato de recuperação
  verificado por migração ou por simples cópia. É necessário confirmar a posse por SMS.
- Exigir sessão válida e reautenticação nas operações de cadastrar ou trocar contatos. Para contas protegidas
  pelo aplicativo, exigir também a confirmação recente do autenticador. Não confiar apenas em um cookie antigo.
- A troca de telefone ou e-mail precisa de verificação do novo contato e proteção contra troca por alguém que
  obteve uma sessão. Avisar pelos contatos anteriores e pelos novos após a confirmação.
- Uma solicitação de recuperação nunca deve permitir escolher um número novo para receber o código. O envio
  usa exclusivamente os contatos anteriormente verificados; dados digitados servem somente para localizar a conta.

## Regras da recuperação

1. Emitir dois comprovantes independentes, vinculados à mesma conta, solicitação e finalidade. Não aceitar um
   código como substituto do outro, trocar a conta no meio do fluxo ou juntar códigos de solicitações diferentes.
2. Usar códigos aleatórios, de uso único, com validade curta e limite de tentativas. Proposta inicial: seis
   dígitos, dez minutos e até cinco tentativas por solicitação, com limites adicionais de envio por conta e origem.
   Conferir esses parâmetros com o serviço de SMS escolhido antes de implementá-los.
3. Validar **ambos no servidor** antes de alterar senha, autenticador ou permissões. Limitar tentativas também
   quando a operação for chamada diretamente, sem usar os botões da interface.
4. Consumir a autorização e efetuar a recuperação em uma única operação atômica. Duplo clique ou chamadas
   simultâneas não podem reutilizar a autorização. Invalidar outras solicitações e links pendentes da conta.
5. Encerrar todas as sessões existentes após a recuperação. Não abrir uma sessão administrativa automaticamente.
6. Quando apenas a senha for esquecida, preservar o autenticador existente. Quando o autenticador for perdido,
   invalidar o segredo anterior, os códigos de reserva e os dispositivos de confiança relacionados, exigindo um
   novo cadastro do aplicativo antes de retornar à administração.
7. Auditar solicitação, falha, conclusão e troca de contatos, sem gravar códigos, senhas, links completos ou
   segredos. Avisar o titular sobre a recuperação concluída pelos canais estabelecidos.
8. Usar resposta pública genérica para conta inexistente, suspensa, sem contatos verificados ou dados divergentes,
   sem revelar quem participa. Falhas do serviço não devem resultar em falsa confirmação de envio.
9. Sem e-mail ou SMS disponível, não reduzir silenciosamente a exigência para um único canal. Exibir orientação
   de recuperação assistida sem alterar credenciais.

## Fluxos existentes que precisam de adequação

A regra não pode ser aplicada somente à nova tela; os pontos atuais de acesso também precisam respeitá-la.

| Ponto confirmado no código                                                                | Situação atual                                                                     | Adequação necessária                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`                                                                                  | E-mail e senha; contas com duas etapas seguem para TOTP ou código de reserva.      | Manter TOTP no login e acrescentar o acesso à recuperação de autenticador.                                                                                                                       |
| `/recuperar-senha`                                                                        | Solicita apenas e-mail e chama a recuperação nativa do Better Auth.                | Usar o fluxo com ambos os contatos verificados.                                                                                                                                                  |
| `/redefinir-senha`                                                                        | Link por e-mail permite escolher nova senha.                                       | Impedir que um link isolado contorne a comprovação por SMS para uma conta já existente.                                                                                                          |
| `POST /api/auth/request-password-reset` e `POST /api/auth/reset-password`                 | Recuperação nativa por e-mail, usada também no convite administrativo.             | Impor a nova política no servidor, inclusive em chamadas diretas e links emitidos antes da mudança.                                                                                              |
| **Participantes → Acesso ao sistema → Enviar convite de acesso / Reenviar link de senha** | A administração libera a conta e solicita um link de senha nativo.                 | Distinguir primeiro acesso de recuperação. Um reenvio para conta existente não pode liberar recuperação só por e-mail.                                                                           |
| **Usar um código de recuperação**, no login                                               | Alternativa de segundo fator por código de reserva.                                | Adequar essa alternativa à exigência de ambos os contatos; ela não deve permanecer como um atalho que invalide a política. Só retirar o caminho anterior quando a substituição estiver validada. |
| `npm run admin:reset-2fa`                                                                 | Rotina operacional remove TOTP e encerra sessões, mediante justificativa auditada. | Restringir o uso a procedimento assistido com identidade comprovada, fora do fluxo público. Não expor a rotina como recuperação automática.                                                      |
| Exportação e anonimização de dados                                                        | Tratam telefone de participante, credenciais, sessões e TOTP existentes.           | Incluir os novos contatos e solicitações na política de acesso, retenção e eliminação; apagar comprovantes expirados sem tocar no histórico financeiro.                                          |

Não exigir o autenticador perdido para iniciar a recuperação, nem exigir sessão já autenticada na tela pública de
recuperação. A prova alternativa é a combinação dos dois contatos previamente verificados.

## Entrega e ativação

O serviço de SMS é uma dependência real: conta do provedor, envio habilitado para os países necessários,
credenciais protegidas e limites de uso. A configuração SMTP já existe no projeto; sua entrega real também precisa
ser verificada no ambiente escolhido. As credenciais devem ser configuradas diretamente no ambiente, sem copiá-las
para o chat, documentação ou repositório.

Antes de ativar a política, permitir que os titulares de contas existentes verifiquem seus contatos com a conta
autenticada e preparar o atendimento para quem não conseguir fazê-lo. Não preencher campos de verificação
retroativamente com base no cadastro atual. Publicação e migrações no ambiente real dependem da revisão da
implementação e da autorização do titular do projeto.

## Critérios de aceite para a implementação

| Caso                                                          | Resultado esperado                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| E-mail correto, SMS incorreto ou ausente                      | Recuperação negada, sem alterar senha, TOTP ou sessões.                                  |
| SMS correto, e-mail incorreto ou ausente                      | Recuperação negada, sem alterar senha, TOTP ou sessões.                                  |
| Ambos válidos e da mesma solicitação                          | Recuperação permitida uma única vez para a conta e finalidade corretas.                  |
| Código expirado, reutilizado ou muitas tentativas             | Recuperação negada e reenvio controlado.                                                 |
| Códigos de outra conta ou de solicitações diferentes          | Recuperação negada.                                                                      |
| Duas conclusões simultâneas                                   | Apenas uma recuperação concluída.                                                        |
| Telefone alterado no perfil comum                             | O contato de recuperação verificado permanece independente.                              |
| Administrador sem cadastro de participante                    | Consegue verificar contatos de recuperação da própria conta.                             |
| Conta suspensa ou anonimizada                                 | Sem reativação automática.                                                               |
| Falha no e-mail ou SMS                                        | Sem liberação por um canal e sem confirmação falsa de entrega.                           |
| Recuperação de senha sem perda do aplicativo                  | Autenticador preservado; próximo login ainda exige o código.                             |
| Recuperação por perda do aplicativo                           | Credenciais antigas inválidas; administração bloqueada até configurar novo autenticador. |
| Chamada direta à recuperação nativa ou reenvio administrativo | Nenhum desvio da exigência de ambos os contatos para recuperação de conta existente.     |
| Convite, recuperação ou verificação de contato                | Nenhuma mudança em cotas, parcelas, pagamentos, saldos ou papéis do grupo.               |

Esses são testes de aceite propostos. Nenhum deles deve ser apresentado como aprovado antes da implementação
e da execução com serviços e dados de teste isolados.

## Referências

O fluxo atual foi conferido nos módulos `auth`, `participants` e `privacy`, nas telas de login e recuperação e no
modelo Prisma do repositório. O desenho adota uso único, validade, limitação de tentativas e encerramento de sessões
descritos nas [orientações de recuperação de senha da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
O [Better Auth documenta a distinção entre TOTP e códigos enviados por outros canais](https://better-auth.com/docs/plugins/2fa).
Essas referências orientam os controles; o requisito de exigir e-mail **e** SMS foi definido pelo titular do projeto.
