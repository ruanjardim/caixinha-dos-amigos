# Permissões

Fonte da verdade: [`src/modules/auth/permissions.ts`](../src/modules/auth/permissions.ts) — testada em
`tests/unit/permissions.test.ts`.

## Regras gerais

- Toda verificação acontece **no servidor** (`requirePagePermission` em páginas, `requirePermission` em ações).
  A interface apenas esconde o que o usuário não pode usar.
- Papel e status são relidos do banco a cada requisição: suspender um usuário tem efeito imediato.
- Usuário `SUSPENDED` não tem nenhuma permissão e não consegue iniciar sessão.
- **Um participante jamais acessa dados individuais de outro** (`canViewParticipant`).
- Participantes nunca alteram dados financeiros; podem editar apenas campos pessoais liberados (hoje: telefone).
- Não existe cadastro público: contas são criadas pela administração.

## Matriz

| Permissão                                                               |           Administrador            |                        Participante                        |
| ----------------------------------------------------------------------- | :--------------------------------: | :--------------------------------------------------------: |
| Gerenciar participantes, usuários                                       |                 ✅                 |                             —                              |
| Criar/configurar ciclos e cotas                                         |                 ✅                 |                             —                              |
| Registrar e confirmar pagamentos                                        |                 ✅                 |                             —                              |
| Despesas, receitas, livro-caixa                                         |                 ✅                 |                             —                              |
| Atividades de arrecadação                                               |                 ✅                 |                             —                              |
| Apurar e aprovar resultados                                             |                 ✅                 |                             —                              |
| Configurar remuneração administrativa                                   |                 ✅                 |                             —                              |
| Encerrar ciclos                                                         |                 ✅                 |                             —                              |
| Relatórios consolidados                                                 |                 ✅                 |                             —                              |
| Consultar auditoria                                                     |                 ✅                 |                             —                              |
| Decidir conformidade                                                    |                 ✅                 |                             —                              |
| Próprio painel, extrato, recibos                                        |                ✅¹                 |                             ✅                             |
| Informar pagamento (fica "em análise")                                  |                ✅¹                 |                             ✅                             |
| Atualizar dados pessoais liberados                                      |                ✅¹                 |                             ✅                             |
| Aceitar regras do ciclo                                                 |                ✅¹                 |                             ✅                             |
| Publicar comunicados                                                    |                 ✅                 |                             —                              |
| Atividades de arrecadação (cadastro, números, lançamentos)              |                 ✅                 | — (vê as atividades dos seus ciclos e os próprios números) |
| Pareceres de conformidade e recursos sensíveis                          |                 ✅                 |                             —                              |
| Relatórios coletivos autorizados (prestação de contas), ler comunicados |                 ✅                 |                             ✅                             |
| Relatórios consolidados (PDF/Excel)                                     |                 ✅                 |                             —                              |
| Relatório de prestação de contas e extrato individual (PDF/Excel)       |                 ✅                 |         ✅ (só do próprio ciclo / próprios dados)          |
| Apurar, aprovar, distribuir, encerrar ciclo, conciliar                  |                 ✅                 |                             —                              |
| Baixar recibo PDF                                                       | ✅ (qualquer pagamento confirmado) |                  ✅ (somente os próprios)                  |

¹ Somente se o administrador também tiver cadastro de participante vinculado, e apenas para os próprios dados.

> **Conflito de interesse (implementado):** se o administrador também participar, **outro administrador ativo**
> deve confirmar os pagamentos dele. Sendo o único administrador, a confirmação exige justificativa, registrada na
> auditoria com a marca `selfConfirmed`.

> **Comprovantes:** só são baixados pelo administrador ou pelo próprio participante dono do pagamento. Para
> qualquer outra pessoa a resposta é "não encontrado" (não revela a existência do arquivo).
