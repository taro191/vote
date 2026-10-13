import { randomUUID } from "node:crypto";
import { bool, exec, one, rows } from "./db.js";
import { HttpError, isGuest, type User } from "./auth.js";
import { groupSummary, isDevGroup, isMember } from "./line.js";

export type Group = {
  id: string;
  line_group_id: string;
  type: "group" | "room";
  name: string | null;
  picture_url: string | null;
  bot_active: boolean;
};

/** ผลตรวจสมาชิกใช้ซ้ำได้ภายในช่วงนี้ก่อนต้องถาม LINE ใหม่ */
const MEMBERSHIP_TTL_MS = 6 * 60 * 60 * 1000;

const COLS = "id, line_group_id, type, name, picture_url, bot_active";
const norm = (g: Group | undefined) => (g ? { ...g, bot_active: bool(g.bot_active) } : undefined);

export async function getGroup(id: string) {
  return norm(await one<Group>(`SELECT ${COLS} FROM line_groups WHERE id = ?`, [id]));
}

export async function getGroupByLineId(lineGroupId: string) {
  return norm(await one<Group>(`SELECT ${COLS} FROM line_groups WHERE line_group_id = ?`, [lineGroupId]));
}

/** สร้าง/อัปเดตกลุ่มเมื่อ bot ได้รับ event จากกลุ่มนั้น */
export async function ensureGroup(lineGroupId: string, type: "group" | "room", fallbackName?: string): Promise<Group> {
  let name: string | null = fallbackName ?? null;
  let picture: string | null = null;
  if (type === "group" && !isDevGroup(lineGroupId)) {
    try {
      const s = await groupSummary(lineGroupId);
      if (s) {
        name = s.groupName;
        picture = s.pictureUrl ?? null;
      }
    } catch (e) {
      console.warn("groupSummary failed", e);
    }
  }
  await exec(
    `INSERT INTO line_groups (id, line_group_id, type, name, picture_url, bot_active) VALUES (?, ?, ?, ?, ?, TRUE)
     ON DUPLICATE KEY UPDATE bot_active = TRUE,
       name = COALESCE(VALUES(name), name),
       picture_url = COALESCE(VALUES(picture_url), picture_url)`,
    [randomUUID(), lineGroupId, type, name ?? (type === "room" ? "ห้องแชต" : null), picture],
  );
  return (await getGroupByLineId(lineGroupId))!;
}

export async function setBotActive(lineGroupId: string, active: boolean) {
  await exec("UPDATE line_groups SET bot_active = ? WHERE line_group_id = ?", [active, lineGroupId]);
}

export async function markMembersLeft(lineGroupId: string, lineUserIds: string[]) {
  if (!lineUserIds.length) return;
  await exec(
    `UPDATE group_members gm
       JOIN line_groups g ON g.id = gm.group_id
       JOIN users u ON u.id = gm.user_id
        SET gm.left_at = CURRENT_TIMESTAMP(3)
      WHERE g.line_group_id = ? AND u.line_user_id IN (?)`,
    [lineGroupId, lineUserIds],
  );
}

/** ตรวจว่าผู้ใช้เป็นสมาชิกกลุ่ม (ใช้แคช ถ้าเก่าเกินไปจะถาม LINE ใหม่) */
export async function checkMember(user: User, group: Group, force = false): Promise<boolean> {
  if (isGuest(user)) return false; // ผู้เยี่ยมชมไม่มีบัญชี LINE จึงยืนยันการเป็นสมาชิกกลุ่มไม่ได้
  const cached = await one<{ verified_at: Date; left_at: Date | null }>(
    "SELECT verified_at, left_at FROM group_members WHERE group_id = ? AND user_id = ?",
    [group.id, user.id],
  );
  if (!force && cached && !cached.left_at && Date.now() - cached.verified_at.getTime() < MEMBERSHIP_TTL_MS) return true;

  let ok: boolean;
  try {
    ok = await isMember(group.type, group.line_group_id, user.line_user_id);
  } catch (e) {
    // LINE API มีปัญหาชั่วคราว: เชื่อแคชเดิมถ้าเคยยืนยันแล้ว
    console.warn("membership check failed", e);
    return Boolean(cached && !cached.left_at);
  }
  if (ok) {
    await exec(
      `INSERT INTO group_members (group_id, user_id, verified_at, left_at) VALUES (?, ?, CURRENT_TIMESTAMP(3), NULL)
       ON DUPLICATE KEY UPDATE verified_at = CURRENT_TIMESTAMP(3), left_at = NULL`,
      [group.id, user.id],
    );
  } else if (cached && !cached.left_at) {
    await exec("UPDATE group_members SET left_at = CURRENT_TIMESTAMP(3) WHERE group_id = ? AND user_id = ?", [group.id, user.id]);
  }
  return ok;
}

export async function requireMember(user: User, group: Group) {
  if (!(await checkMember(user, group))) throw new HttpError(403, "โหวตนี้สำหรับสมาชิกในกลุ่ม LINE นี้เท่านั้น");
}

/** กลุ่มที่ผู้ใช้เคยยืนยันว่าเป็นสมาชิก */
export async function myGroups(user: User) {
  return rows<Group & { open_polls: number }>(
    `SELECT g.id, g.line_group_id, g.type, g.name, g.picture_url, g.bot_active,
            (SELECT COUNT(*) FROM polls p WHERE p.group_id = g.id AND p.closed_at IS NULL) AS open_polls
       FROM group_members gm JOIN line_groups g ON g.id = gm.group_id
      WHERE gm.user_id = ? AND gm.left_at IS NULL
      ORDER BY g.updated_at DESC`,
    [user.id],
  );
}

export const publicGroup = (g: Group) => ({ id: g.id, type: g.type, name: g.name, pictureUrl: g.picture_url, botActive: g.bot_active });
