import { randomUUID } from "node:crypto";
import { z } from "zod";
import { bool, exec, one, rows } from "./db.js";
import { HttpError, type User } from "./auth.js";
import { appLink, hasBot } from "./env.js";
import { push, textMessage } from "./line.js";

export const MAX_PROFILES = 12;
const TZ = "Asia/Bangkok";

/** วันที่ปัจจุบันตามเวลาไทย (YYYY-MM-DD) */
export function todayTH(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}
function nowTimeTH(now = new Date()): string {
  return now.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "รูปแบบวันที่ไม่ถูกต้อง").refine((s) => !isNaN(Date.parse(s + "T00:00:00Z")), "วันที่ไม่ถูกต้อง");

export const profileSchema = z.object({
  name: z.string().trim().min(1, "กรุณาใส่ชื่อ").max(40),
  birth: day.refine((d) => d <= todayTH(), "วันเกิดต้องไม่อยู่ในอนาคต").refine((d) => d >= "1900-01-01", "วันเกิดไม่ถูกต้อง"),
  target: z.number().int().min(30, "เป้าหมายอายุ 30–120 ปี").max(120, "เป้าหมายอายุ 30–120 ปี"),
});

export const voteSchema = z.object({
  score: z.number().int().min(1).max(5),
  note: z.string().trim().max(500).optional().nullable(),
});

export const remindSchema = z.object({
  on: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "เวลาไม่ถูกต้อง"),
});

export const daySchema = day;

type ProfileRow = { id: string; name: string; birth: string; target_years: number };

const PROFILE_COLS = "id, name, DATE_FORMAT(birth_date, '%Y-%m-%d') AS birth, target_years";
const pub = (p: ProfileRow) => ({ id: p.id, name: p.name, birth: p.birth, target: Number(p.target_years) });

async function ownProfile(user: User, id: string): Promise<ProfileRow> {
  const p = await one<ProfileRow>(`SELECT ${PROFILE_COLS} FROM life_profiles WHERE id = ? AND owner_id = ?`, [id, user.id]);
  if (!p) throw new HttpError(404, "ไม่พบโปรไฟล์");
  return p;
}

export async function overview(user: User) {
  const [profiles, settings, today] = await Promise.all([
    rows<ProfileRow>(`SELECT ${PROFILE_COLS} FROM life_profiles WHERE owner_id = ? ORDER BY created_at`, [user.id]),
    one<{ life_remind_on: unknown; life_remind_time: string }>("SELECT life_remind_on, life_remind_time FROM users WHERE id = ?", [user.id]),
    rows<{ profile_id: string; score: number }>(
      `SELECT v.profile_id, v.score FROM life_votes v JOIN life_profiles p ON p.id = v.profile_id WHERE p.owner_id = ? AND v.day = ?`,
      [user.id, todayTH()],
    ),
  ]);
  const todayScore = new Map(today.map((t) => [t.profile_id, Number(t.score)]));
  return {
    today: todayTH(),
    max: MAX_PROFILES,
    bot: hasBot(),
    remind: { on: bool(settings?.life_remind_on), time: settings?.life_remind_time ?? "20:00" },
    profiles: profiles.map((p) => ({ ...pub(p), todayScore: todayScore.get(p.id) ?? null })),
  };
}

export async function createProfile(user: User, input: z.infer<typeof profileSchema>) {
  const n = (await one<{ n: number }>("SELECT COUNT(*) AS n FROM life_profiles WHERE owner_id = ?", [user.id]))!.n;
  if (Number(n) >= MAX_PROFILES) throw new HttpError(409, `เพิ่มได้สูงสุด ${MAX_PROFILES} โปรไฟล์`);
  const id = randomUUID();
  await exec("INSERT INTO life_profiles (id, owner_id, name, birth_date, target_years) VALUES (?, ?, ?, ?, ?)", [
    id,
    user.id,
    input.name,
    input.birth,
    input.target,
  ]);
  return pub(await ownProfile(user, id));
}

export async function updateProfile(user: User, id: string, input: z.infer<typeof profileSchema>) {
  await ownProfile(user, id);
  await exec("UPDATE life_profiles SET name = ?, birth_date = ?, target_years = ? WHERE id = ?", [input.name, input.birth, input.target, id]);
  // คะแนนที่อยู่ก่อนวันเกิดใหม่ไม่มีความหมายแล้ว
  await exec("DELETE FROM life_votes WHERE profile_id = ? AND day < ?", [id, input.birth]);
  return pub(await ownProfile(user, id));
}

export async function deleteProfile(user: User, id: string) {
  await ownProfile(user, id);
  await exec("DELETE FROM life_profiles WHERE id = ?", [id]);
}

/** คะแนนทั้งหมดของโปรไฟล์ในรูป { "YYYY-MM-DD": [score, note] } */
export async function votes(user: User, id: string) {
  const p = await ownProfile(user, id);
  const list = await rows<{ d: string; score: number; note: string | null }>(
    "SELECT DATE_FORMAT(day, '%Y-%m-%d') AS d, score, note FROM life_votes WHERE profile_id = ? ORDER BY day",
    [p.id],
  );
  const out: Record<string, [number, string | null]> = {};
  for (const v of list) out[v.d] = [Number(v.score), v.note];
  return { profile: pub(p), today: todayTH(), votes: out };
}

export async function setVote(user: User, id: string, d: string, input: z.infer<typeof voteSchema>) {
  const p = await ownProfile(user, id);
  if (d > todayTH()) throw new HttpError(400, "วันนี้ยังมาไม่ถึง เลือกวันที่ผ่านมาแล้วเพื่อ vote");
  if (d < p.birth) throw new HttpError(400, "วันที่อยู่ก่อนวันเกิด");
  await exec(
    `INSERT INTO life_votes (profile_id, day, score, note) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE score = VALUES(score), note = VALUES(note)`,
    [p.id, d, input.score, input.note || null],
  );
}

export async function clearVote(user: User, id: string, d: string) {
  const p = await ownProfile(user, id);
  await exec("DELETE FROM life_votes WHERE profile_id = ? AND day = ?", [p.id, d]);
}

export async function setRemind(user: User, input: z.infer<typeof remindSchema>) {
  await exec("UPDATE users SET life_remind_on = ?, life_remind_time = ? WHERE id = ?", [input.on, input.time, user.id]);
}

/** เรียกจาก scheduler: ส่งเตือนผู้ที่ถึงเวลาและยังมีโปรไฟล์ที่ไม่ได้ vote วันนี้ */
export async function sendLifeReminders(now = new Date()) {
  if (!hasBot()) return;
  const today = todayTH(now);
  const due = await rows<{ id: string; line_user_id: string }>(
    `SELECT u.id, u.line_user_id FROM users u
      WHERE u.life_remind_on = TRUE AND u.life_remind_time <= ? AND (u.life_reminded_on IS NULL OR u.life_reminded_on < ?)
        AND u.line_user_id NOT LIKE 'dev-%' AND u.line_user_id NOT LIKE 'guest-%'
        AND EXISTS (SELECT 1 FROM life_profiles p WHERE p.owner_id = u.id
                     AND NOT EXISTS (SELECT 1 FROM life_votes v WHERE v.profile_id = p.id AND v.day = ?))
      LIMIT 200`,
    [nowTimeTH(now), today, today],
  );
  for (const u of due) {
    const claimed = await exec("UPDATE users SET life_reminded_on = ? WHERE id = ? AND (life_reminded_on IS NULL OR life_reminded_on < ?)", [
      today,
      u.id,
      today,
    ]);
    if (!claimed.affectedRows) continue;
    await push(u.line_user_id, [textMessage(`Vote my life 🗓️\nวันนี้เป็นอย่างไรบ้าง? มา vote ให้วันนี้หน่อย\n${appLink({ view: "life" })}`)]).catch((e) =>
      console.error("life reminder failed", u.id, e),
    );
  }
}
