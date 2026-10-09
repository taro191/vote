import mysql from "mysql2/promise";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { env } from "./env.js";

export const pool = mysql.createPool({
  uri: env.databaseUrl,
  connectionLimit: 10,
  charset: "utf8mb4",
  timezone: "Z",
  dateStrings: false,
  supportBigNumbers: true,
  multipleStatements: false,
});

// ให้ทุก connection ทำงานเป็น UTC เสมอ
pool.on("connection", (c) => {
  c.query("SET time_zone = '+00:00'");
});

type Conn = Pick<PoolConnection, "query">;

export async function rows<T>(sql: string, params: unknown[] = [], c: Conn = pool): Promise<T[]> {
  const [r] = await c.query<RowDataPacket[]>(sql, params);
  return r as T[];
}

export async function one<T>(sql: string, params: unknown[] = [], c: Conn = pool): Promise<T | undefined> {
  return (await rows<T>(sql, params, c))[0];
}

export async function exec(sql: string, params: unknown[] = [], c: Conn = pool): Promise<ResultSetHeader> {
  const [r] = await c.query<ResultSetHeader>(sql, params);
  return r;
}

export async function tx<T>(fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const r = await fn(c);
    await c.commit();
    return r;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}

/** แปลงค่า BOOLEAN (TINYINT) จาก MySQL เป็น boolean */
export const bool = (v: unknown) => v === true || v === 1 || v === "1";
