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

| Permissão | Administrador | Participante |
| --- | :---: | :---: |
| Gerenciar participantes, usuários | ✅ | — |
| Criar/configurar ciclos e cotas | ✅ | — |
| Registrar e confirmar pagamentos | ✅ | — |
| Despesas, receitas, livro-caixa | ✅ | — |
| Atividades de arrecadação | ✅ | — |
| Apurar e aprovar resultados | ✅ | — |
| Configurar remuneração administrativa | ✅ | — |
| Encerrar ciclos | ✅ | — |
| Relatórios consolidados | ✅ | — |
| Consultar auditoria | ✅ | — |
| Decidir conformidade | ✅ | — |
| Próprio painel, extrato, recibos | ✅¹ | ✅ |
| Informar pagamento (fica "em análise") | ✅¹ | ✅ |
| Atualizar dados pessoais liberados | ✅¹ | ✅ |
| Aceitar regras do ciclo | ✅¹ | ✅ |
| Relatórios coletivos autorizados, comunicados | ✅ | ✅ |

¹ Somente se o administrador também tiver cadastro de participante vinculado, e apenas para os próprios dados.

> **Conflito de interesse:** se o administrador também participar, recomenda-se que outro administrador confirme
> os pagamentos dele (a ser implementado na Fase 2 como alerta/bloqueio configurável).
