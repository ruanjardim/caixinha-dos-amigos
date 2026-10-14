# Backup e restauração

## Produção: `npm run backup`

Um comando gera, em `BACKUP_DIR` (padrão `./backups`):

- `caixinha_AAAA-MM-DD_HHMM.dump` — banco (`pg_dump` em formato custom, compactado);
- `caixinha_AAAA-MM-DD_HHMM_arquivos.tar.gz` — comprovantes e imagens (`storage/uploads`);
- `caixinha_AAAA-MM-DD_HHMM.sha256` — manifesto para conferir a integridade.

Depois aplica a retenção: **7 diários, 4 semanais e 12 mensais** (os demais são apagados; `--no-prune` desliga).

```bash
npm run backup                # banco + arquivos
npm run backup -- --skip-db   # só arquivos (quando o provedor do banco já faz o backup dele)
```

- Requer `pg_dump` da mesma versão principal do servidor, no PATH ou em `PG_DUMP_PATH`. As credenciais vão por
  variáveis de ambiente do processo (nunca na linha de comando).
- Agende 1×/dia (cron do servidor).
- Verificado neste projeto: empacotamento dos arquivos, manifesto e retenção (teste automatizado). O PostgreSQL
  embutido de desenvolvimento não inclui `pg_dump`, então o dump do banco precisa ser testado no servidor.

Recomendações:

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

Comprovantes e imagens ficam em `storage/uploads` (fora da pasta pública) e entram no `npm run backup`. Para
restaurar: `tar -xzf caixinha_AAAA-MM-DD_HHMM_arquivos.tar.gz -C storage`. Confira antes com
`sha256sum -c caixinha_AAAA-MM-DD_HHMM.sha256`.
