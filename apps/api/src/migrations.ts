import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import mysql from "mysql2/promise";
import { env } from "./env.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

/** รัน migration ที่ยังไม่ได้รัน (เรียกซ้ำได้ ใช้ GET_LOCK กันหลาย process รันพร้อมกัน) */
export async function runMigrations(log: (msg: string) => void = console.log) {
  // สร้าง database ถ้ายังไม่มี (โฮสต์ที่ให้สิทธิ์เฉพาะ database ตัวเองอาจสร้างไม่ได้ ข้ามไปถ้ามีอยู่แล้ว)
  const url = new URL(env.databaseUrl);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`invalid database name: ${dbName}`);
  const server = new URL(env.databaseUrl);
  server.pathname = "/";
  const admin = await mysql.createConnection({ uri: server.toString() });
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (e) {
    log(`skip CREATE DATABASE: ${(e as Error).message}`);
  } finally {
    await admin.end();
  }

  const c = await mysql.createConnection({ uri: env.databaseUrl, multipleStatements: true, charset: "utf8mb4" });
  try {
    const [[lock]] = await c.query<mysql.RowDataPacket[]>("SELECT GET_LOCK('vote_migrations', 60) AS ok");
    if (!lock?.ok) throw new Error("could not acquire migration lock");
    await c.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) PRIMARY KEY, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3))`);
    const [done] = await c.query<mysql.RowDataPacket[]>("SELECT name FROM schema_migrations");
    const applied = new Set(done.map((r) => r.name as string));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      if (applied.has(f)) continue;
      // หมายเหตุ: DDL ใน MySQL commit อัตโนมัติ ถ้าไฟล์ล้มกลางทาง ต้องแก้ด้วยมือ
      await c.query(await readFile(path.join(dir, f), "utf8"));
      await c.query("INSERT INTO schema_migrations (name) VALUES (?)", [f]);
      log(`applied ${f}`);
    }
    log("migrations up to date");
  } finally {
    await c.end();
  }
}
