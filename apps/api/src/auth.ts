import { SignJWT, jwtVerify } from "jose";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { env } from "./env.js";
import { exec, one, tx } from "./db.js";

const key = new TextEncoder().encode(env.appSecret);

export type User = { id: string; line_user_id: string; display_name: string; picture_url: string | null };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function issueSession(userId: string, ttl = "30d") {
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime(ttl).sign(key);
}

export async function requireUser(req: FastifyRequest): Promise<User> {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) throw new HttpError(401, "ต้องเข้าสู่ระบบ");
  try {
    const { payload } = await jwtVerify(h.slice(7), key);
    const u = await one<User>("SELECT id, line_user_id, display_name, picture_url FROM users WHERE id = ?", [payload.sub]);
    if (!u) throw new Error("user not found");
    return u;
  } catch {
    throw new HttpError(401, "session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
  }
}

export async function upsertUser(lineUserId: string, name: string, picture: string | null): Promise<User> {
  await exec(
    `INSERT INTO users (id, line_user_id, display_name, picture_url) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), picture_url = VALUES(picture_url)`,
    [randomUUID(), lineUserId, name, picture],
  );
  return (await one<User>("SELECT id, line_user_id, display_name, picture_url FROM users WHERE line_user_id = ?", [lineUserId]))!;
}

/** ตรวจ LIFF ID token กับ LINE แล้วคืนข้อมูลผู้ใช้ */
export async function verifyLineIdToken(idToken: string) {
  if (!env.loginChannelId) throw new HttpError(500, "LINE_LOGIN_CHANNEL_ID is not configured");
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: env.loginChannelId }),
  });
  if (!res.ok) throw new HttpError(401, "ID token ไม่ถูกต้องหรือหมดอายุ");
  const p = (await res.json()) as { sub: string; name?: string; picture?: string };
  return { lineUserId: p.sub, name: p.name || "ผู้ใช้ LINE", picture: p.picture ?? null };
}

/* ---------- ลิงก์บริบทกลุ่มแบบลงลายเซ็น (กันการปลอม groupId ใน URL) ---------- */

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sig = (data: string) => createHmac("sha256", env.appSecret).update(data).digest("base64url").slice(0, 22);

export function signGroupCtx(lineGroupId: string): string {
  const data = b64(lineGroupId);
  return `${data}.${sig(data)}`;
}

export function readGroupCtx(token: string): string | null {
  const [data, s] = token.split(".");
  if (!data || !s) return null;
  const expect = Buffer.from(sig(data));
  const got = Buffer.from(s);
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return null;
  return Buffer.from(data, "base64url").toString();
}

/* ---------------------- ผู้เยี่ยมชม (ใช้งานโดยไม่ต้องล็อกอิน LINE) ---------------------- */

const GUEST_PREFIX = "guest-";
export const isGuest = (u: Pick<User, "line_user_id">) => u.line_user_id.startsWith(GUEST_PREFIX);

/** สร้างบัญชีผู้เยี่ยมชมใหม่ ผูกกับอุปกรณ์ผ่าน token ที่เก็บในเบราว์เซอร์ */
export async function createGuest(): Promise<User> {
  const id = randomUUID();
  return upsertUser(`${GUEST_PREFIX}${id}`, `ผู้เยี่ยมชม #${id.slice(0, 4).toUpperCase()}`, null);
}

/** อ่าน user จาก token โดยไม่โยน error (ใช้ตอนรวมบัญชีผู้เยี่ยมชม) */
export async function userFromToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, key);
    return (await one<User>("SELECT id, line_user_id, display_name, picture_url FROM users WHERE id = ?", [payload.sub])) ?? null;
  } catch {
    return null;
  }
}

/** ย้ายข้อมูลของผู้เยี่ยมชมไปบัญชี LINE แล้วลบบัญชีผู้เยี่ยมชม (โหวตซ้ำโพลเดียวกันจะเก็บของบัญชี LINE ไว้) */
export async function mergeGuest(guest: User, into: User) {
  if (!isGuest(guest) || guest.id === into.id) return;
  await tx(async (c) => {
    await exec("UPDATE polls SET creator_id = ? WHERE creator_id = ?", [into.id, guest.id], c);
    await exec("UPDATE life_profiles SET owner_id = ? WHERE owner_id = ?", [into.id, guest.id], c);
    await exec(
      `UPDATE votes SET user_id = ? WHERE user_id = ?
         AND poll_id NOT IN (SELECT poll_id FROM (SELECT DISTINCT poll_id FROM votes WHERE user_id = ?) AS mine)`,
      [into.id, guest.id, into.id],
      c,
    );
    await exec("DELETE FROM users WHERE id = ?", [guest.id], c);
  });
}
