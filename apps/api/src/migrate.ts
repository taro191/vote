import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";
import { env } from "./env.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

async function main() {
  // สร้าง database ถ้ายังไม่มี
  const url = new URL(env.databaseUrl);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`invalid database name: ${dbName}`);
  const server = new URL(env.databaseUrl);
  server.pathname = "/";
  const admin = await mysql.createConnection({ uri: server.toString() });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();

  const c = await mysql.createConnection({ uri: env.databaseUrl, multipleStatements: true, charset: "utf8mb4" });
  await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))`);
  const [done] = await c.query<mysql.RowDataPacket[]>("SELECT name FROM schema_migrations");
  const applied = new Set(done.map((r) => r.name as string));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    // หมายเหตุ: DDL ใน MySQL commit อัตโนมัติ ถ้าไฟล์ล้มกลางทาง ต้องแก้ด้วยมือ
    await c.query(await readFile(path.join(dir, f), "utf8"));
    await c.query("INSERT INTO schema_migrations (name) VALUES (?)", [f]);
    console.log(`applied ${f}`);
  }
  console.log("migrations up to date");
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
