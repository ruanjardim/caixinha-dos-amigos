# Backup e restauração

## Produção (PostgreSQL)

Backup diário com `pg_dump` em formato custom (compactado):

```bash
pg_dump --format=custom --no-owner --file="backups/caixinha_$(date +%F).dump" "$DATABASE_URL"
```

Recomendações:

- Agendar diariamente (cron do servidor ou recurso do provedor gerenciado).
- Retenção sugerida: 7 diários, 4 semanais, 12 mensais.
- Guardar uma cópia **fora** do servidor do banco, criptografada (ex.: `age` ou `gpg`).
- Arquivo de backup contém dados pessoais e financeiros: acesso restrito à administração.
- **Testar a restauração** ao menos uma vez por trimestre.

## Restauração

```bash
createdb caixinha_restore
pg_restore --no-owner --dbname="postgresql://USUARIO:SENHA@HOST:5432/caixinha_restore" backups/caixinha_AAAA-MM-DD.dump
```

Depois de conferir os dados no banco restaurado, aponte `DATABASE_URL` para ele (ou renomeie os bancos).

## Desenvolvimento

O PostgreSQL local (`npm run db:start`) guarda os dados em `.postgres/` (fora do git). Para recriar o banco de
desenvolvimento do zero:

```bash
npx prisma migrate reset   # apaga TUDO no banco caixinha_dev e reaplica as migrations
npm run db:seed            # recria os usuários fictícios de demonstração
```

O banco `caixinha_test` é esvaziado automaticamente a cada `npm test`.

## Arquivos enviados

Comprovantes e imagens (a partir da Fase 2) ficam em `storage/` (desenvolvimento) ou em armazenamento de objetos
(produção) e devem entrar na mesma rotina de backup.
