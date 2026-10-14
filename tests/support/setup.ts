import "dotenv/config";
import { testDatabaseUrl } from "./test-db";

// Todo código testado (inclusive src/lib/db.ts) usa o banco de TESTES.
// Sem TEST_DATABASE_URL, DATABASE_URL é removida e os testes de integração são pulados.
process.env.DATABASE_URL_ORIGINAL = process.env.DATABASE_URL;
const url = testDatabaseUrl();
if (url) process.env.DATABASE_URL = url;
else delete process.env.DATABASE_URL;
