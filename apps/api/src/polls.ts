import { randomUUID } from "node:crypto";
import { z } from "zod";
import { bool, exec, one, rows, tx } from "./db.js";
import { HttpError, type User } from "./auth.js";
import { getGroup, publicGroup, requireMember, type Group } from "./groups.js";
import { appLink } from "./env.js";
import { pollMessage, push, resultMessage } from "./line.js";

export const KINDS = ["single", "multiple", "battle", "rating", "yesno"] as const;

const RATING = [
  { label: "แย่มาก", emoji: "😭" },
  { label: "แย่", emoji: "🙁" },
  { label: "พอใช้", emoji: "😐" },
  { label: "ดี", emoji: "🙂" },
  { label: "ดีมาก", emoji: "😄" },
];
const YESNO = [
  { label: "ใช่ / เห็นด้วย", emoji: "👍" },
  { label: "ไม่ใช่ / ไม่เห็นด้วย", emoji: "👎" },
  { label: "งดออกเสียง", emoji: "🤐" },
];

const optionSchema = z.object({
  label: z.string().trim().min(1, "ตัวเลือกต้องไม่ว่าง").max(120),
  emoji: z.string().trim().max(16).optional().nullable(),
});

export const createSchema = z
  .object({
    title: z.string().trim().min(1, "กรุณาใส่หัวข้อ").max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    kind: z.enum(KINDS),
    audience: z.enum(["group", "link", "public"]),
    groupId: z.string().uuid().optional().nullable(),
    options: z.array(optionSchema).max(20).default([]),
    anonymous: z.boolean().default(false),
    allowChange: z.boolean().default(true),
    resultsVisibility: z.enum(["live", "after_vote", "after_close"]).default("live"),
    maxChoices: z.number().int().min(1).max(20).optional(),
    closesAt: z.string().datetime({ offset: true }).optional().nullable(),
    announce: z.boolean().default(true),
    remindMinutes: z.number().int().min(1).max(7 * 24 * 60).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    const n = v.options.length;
    if (v.kind === "battle" && n !== 2) ctx.addIssue({ code: "custom", path: ["options"], message: "Battle ต้องมี 2 ฝั่งพอดี" });
    if ((v.kind === "single" || v.kind === "multiple") && n < 2) ctx.addIssue({ code: "custom", path: ["options"], message: "ต้องมีอย่างน้อย 2 ตัวเลือก" });
    const labels = v.options.map((o) => o.label.toLowerCase());
    if (new Set(labels).size !== labels.length) ctx.addIssue({ code: "custom", path: ["options"], message: "ตัวเลือกซ้ำกัน" });
    if (v.audience === "group" && !v.groupId) ctx.addIssue({ code: "custom", path: ["groupId"], message: "ต้องเปิดจากกลุ่ม LINE เพื่อสร้างโหวตเฉพาะกลุ่ม" });
    if (v.closesAt && new Date(v.closesAt).getTime() <= Date.now() + 60_000)
      ctx.addIssue({ code: "custom", path: ["closesAt"], message: "เวลาปิดโหวตต้องอยู่ในอนาคต" });
    if (v.remindMinutes && !v.closesAt) ctx.addIssue({ code: "custom", path: ["remindMinutes"], message: "ต้องตั้งเวลาปิดก่อนจึงจะเตือนได้" });
  });

type PollRow = {
  id: string;
  group_id: string | null;
  creator_id: string;
  title: string;
  description: string | null;
  kind: (typeof KINDS)[number];
  audience: "group" | "link" | "public";
  anonymous: boolean;
  allow_change: boolean;
  results_visibility: "live" | "after_vote" | "after_close";
  max_choices: number;
  closes_at: Date | null;
  closed_at: Date | null;
  announce: boolean;
  remind_minutes: number | null;
  created_at: Date;
  creator_name: string;
  creator_picture: string | null;
};

type OptionRow = { id: string; poll_id: string; label: string; emoji: string | null; position: number };

const POLL_SELECT = `SELECT p.*, u.display_name AS creator_name, u.picture_url AS creator_picture
                       FROM polls p JOIN users u ON u.id = p.creator_id`;

function normPoll(p: PollRow): PollRow {
  return { ...p, anonymous: bool(p.anonymous), allow_change: bool(p.allow_change), announce: bool(p.announce) };
}

export const isOpen = (p: Pick<PollRow, "closed_at" | "closes_at">) =>
  !p.closed_at && (!p.closes_at || p.closes_at.getTime() > Date.now());

export async function loadPoll(id: string): Promise<PollRow> {
  if (!z.string().uuid().safeParse(id).success) throw new HttpError(404, "ไม่พบโหวตนี้");
  const p = await one<PollRow>(`${POLL_SELECT} WHERE p.id = ?`, [id]);
  if (!p) throw new HttpError(404, "ไม่พบโหวตนี้");
  return normPoll(p);
}

async function loadOptions(pollIds: string[]): Promise<OptionRow[]> {
  if (!pollIds.length) return [];
  return rows<OptionRow>("SELECT id, poll_id, label, emoji, position FROM poll_options WHERE poll_id IN (?) ORDER BY position", [pollIds]);
}

/** ตรวจสิทธิ์เข้าถึงโหวต: โหวตเฉพาะกลุ่มต้องเป็นสมาชิกกลุ่มนั้น */
async function assertAccess(user: User, p: PollRow): Promise<Group | undefined> {
  const group = p.group_id ? await getGroup(p.group_id) : undefined;
  if (p.audience === "group") {
    if (!group) throw new HttpError(410, "กลุ่มของโหวตนี้ไม่มีอยู่แล้ว");
    if (p.creator_id !== user.id) await requireMember(user, group);
  }
  return group;
}

const canSeeResults = (p: PollRow, user: User, hasVoted: boolean) =>
  p.creator_id === user.id || !isOpen(p) || p.results_visibility === "live" || (p.results_visibility === "after_vote" && hasVoted);

/* --------------------------------- create --------------------------------- */

export async function createPoll(user: User, input: z.infer<typeof createSchema>) {
  let group: Group | undefined;
  if (input.groupId) {
    group = await getGroup(input.groupId);
    if (!group) throw new HttpError(404, "ไม่พบกลุ่ม");
    await requireMember(user, group);
  }
  const options = input.kind === "rating" ? RATING : input.kind === "yesno" ? YESNO : input.options;
  const maxChoices = input.kind === "multiple" ? Math.min(input.maxChoices ?? options.length, options.length) : 1;
  const id = randomUUID();

  await tx(async (c) => {
    await exec(
      `INSERT INTO polls (id, group_id, creator_id, title, description, kind, audience, anonymous, allow_change,
                          results_visibility, max_choices, closes_at, announce, remind_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        group?.id ?? null,
        user.id,
        input.title,
        input.description || null,
        input.kind,
        input.audience,
        input.anonymous,
        input.allowChange,
        input.resultsVisibility,
        maxChoices,
        input.closesAt ? new Date(input.closesAt) : null,
        input.announce && Boolean(group),
        input.closesAt ? (input.remindMinutes ?? null) : null,
      ],
      c,
    );
    await exec(
      "INSERT INTO poll_options (id, poll_id, label, emoji, position) VALUES ?",
      [options.map((o, i) => [randomUUID(), id, o.label, o.emoji || null, i])],
      c,
    );
  });

  const poll = await loadPoll(id);
  if (poll.announce && group?.bot_active) {
    announceNew(poll, group).catch((e) => console.error("announce failed", e));
  }
  return id;
}

async function announceNew(p: PollRow, g: Group, heading = "โหวตใหม่") {
  const opts = await loadOptions([p.id]);
  await push(g.line_group_id, [
    pollMessage(
      { title: p.title, description: p.description, kind: p.kind, closes_at: p.closes_at, creator: p.creator_name, options: opts },
      appLink({ p: p.id }),
      heading,
    ),
  ]);
}

/* ---------------------------------- view ---------------------------------- */

export async function pollView(user: User, id: string) {
  const p = await loadPoll(id);
  const group = await assertAccess(user, p);
  const opts = await loadOptions([p.id]);
  const mine = await rows<{ option_id: string }>("SELECT option_id FROM votes WHERE poll_id = ? AND user_id = ?", [p.id, user.id]);
  const hasVoted = mine.length > 0;
  const showResults = canSeeResults(p, user, hasVoted);

  const counts = await rows<{ option_id: string; n: number }>(
    "SELECT option_id, COUNT(*) AS n FROM votes WHERE poll_id = ? GROUP BY option_id",
    [p.id],
  );
  const voterCount = (await one<{ n: number }>("SELECT COUNT(DISTINCT user_id) AS n FROM votes WHERE poll_id = ?", [p.id]))!.n;
  const countOf = new Map(counts.map((c) => [c.option_id, Number(c.n)]));

  let voters: Map<string, { name: string; pictureUrl: string | null }[]> | undefined;
  if (showResults && !p.anonymous) {
    const vs = await rows<{ option_id: string; display_name: string; picture_url: string | null }>(
      `SELECT v.option_id, u.display_name, u.picture_url FROM votes v JOIN users u ON u.id = v.user_id
        WHERE v.poll_id = ? ORDER BY v.created_at`,
      [p.id],
    );
    voters = new Map();
    for (const v of vs) {
      const list = voters.get(v.option_id) ?? [];
      list.push({ name: v.display_name, pictureUrl: v.picture_url });
      voters.set(v.option_id, list);
    }
  }

  return {
    id: p.id,
    title: p.title,
    description: p.description,
    kind: p.kind,
    audience: p.audience,
    anonymous: p.anonymous,
    allowChange: p.allow_change,
    resultsVisibility: p.results_visibility,
    maxChoices: p.max_choices,
    closesAt: p.closes_at,
    closedAt: p.closed_at,
    createdAt: p.created_at,
    isOpen: isOpen(p),
    isCreator: p.creator_id === user.id,
    creator: { name: p.creator_name, pictureUrl: p.creator_picture },
    group: group ? publicGroup(group) : null,
    myChoices: mine.map((m) => m.option_id),
    showResults,
    voterCount: Number(voterCount),
    options: opts.map((o) => ({
      id: o.id,
      label: o.label,
      emoji: o.emoji,
      votes: showResults ? (countOf.get(o.id) ?? 0) : null,
      voters: voters ? (voters.get(o.id) ?? []) : null,
    })),
    shareUrl: appLink({ p: p.id }),
  };
}

/* ---------------------------------- vote ---------------------------------- */

export async function castVote(user: User, id: string, optionIds: string[]) {
  const p = await loadPoll(id);
  await assertAccess(user, p);
  if (!isOpen(p)) throw new HttpError(409, "โหวตนี้ปิดแล้ว");

  const unique = [...new Set(optionIds)];
  const limit = p.kind === "multiple" ? p.max_choices : 1;
  if (unique.length < 1) throw new HttpError(400, "กรุณาเลือกอย่างน้อย 1 ตัวเลือก");
  if (unique.length > limit) throw new HttpError(400, `เลือกได้สูงสุด ${limit} ตัวเลือก`);

  const valid = new Set((await loadOptions([p.id])).map((o) => o.id));
  if (!unique.every((o) => valid.has(o))) throw new HttpError(400, "ตัวเลือกไม่ถูกต้อง");

  await tx(async (c) => {
    // ล็อกแถวโหวตของผู้ใช้คนนี้ กันกดซ้ำพร้อมกัน
    const existing = await rows<{ option_id: string }>(
      "SELECT option_id FROM votes WHERE poll_id = ? AND user_id = ? FOR UPDATE",
      [p.id, user.id],
      c,
    );
    if (existing.length && !p.allow_change) throw new HttpError(409, "คุณโหวตไปแล้ว และโหวตนี้ไม่อนุญาตให้เปลี่ยน");
    await exec("DELETE FROM votes WHERE poll_id = ? AND user_id = ?", [p.id, user.id], c);
    await exec("INSERT INTO votes (poll_id, user_id, option_id) VALUES ?", [unique.map((o) => [p.id, user.id, o])], c);
  });
}

export async function clearVote(user: User, id: string) {
  const p = await loadPoll(id);
  await assertAccess(user, p);
  if (!isOpen(p)) throw new HttpError(409, "โหวตนี้ปิดแล้ว");
  if (!p.allow_change) throw new HttpError(409, "โหวตนี้ไม่อนุญาตให้ถอนหรือเปลี่ยนคำตอบ");
  await exec("DELETE FROM votes WHERE poll_id = ? AND user_id = ?", [p.id, user.id]);
}

/* ------------------------------ close / delete ----------------------------- */

export async function closePoll(user: User, id: string) {
  const p = await loadPoll(id);
  if (p.creator_id !== user.id) throw new HttpError(403, "เฉพาะผู้สร้างเท่านั้นที่ปิดโหวตได้");
  if (p.closed_at) return;
  await exec("UPDATE polls SET closed_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND closed_at IS NULL", [p.id]);
  await announceResult(p.id);
}

export async function deletePoll(user: User, id: string) {
  const p = await loadPoll(id);
  if (p.creator_id !== user.id) throw new HttpError(403, "เฉพาะผู้สร้างเท่านั้นที่ลบโหวตได้");
  await exec("DELETE FROM polls WHERE id = ?", [p.id]);
}

/** ส่งผลโหวตเข้ากลุ่ม (ครั้งเดียวต่อโหวต) */
export async function announceResult(pollId: string) {
  const claimed = await exec(
    `UPDATE polls SET announced_result_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND announce = TRUE AND group_id IS NOT NULL AND announced_result_at IS NULL`,
    [pollId],
  );
  if (!claimed.affectedRows) return;
  const p = await loadPoll(pollId);
  const g = await getGroup(p.group_id!);
  if (!g?.bot_active) return;
  const opts = await loadOptions([p.id]);
  const counts = await rows<{ option_id: string; n: number }>("SELECT option_id, COUNT(*) AS n FROM votes WHERE poll_id = ? GROUP BY option_id", [p.id]);
  const voters = (await one<{ n: number }>("SELECT COUNT(DISTINCT user_id) AS n FROM votes WHERE poll_id = ?", [p.id]))!.n;
  const m = new Map(counts.map((c) => [c.option_id, Number(c.n)]));
  await push(g.line_group_id, [
    resultMessage(p.title, p.kind, opts.map((o) => ({ label: o.label, emoji: o.emoji, votes: m.get(o.id) ?? 0 })), Number(voters), appLink({ p: p.id })),
  ]);
}

/** เตือนในกลุ่มก่อนปิดโหวต */
export async function sendReminder(pollId: string) {
  const claimed = await exec("UPDATE polls SET reminded_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND reminded_at IS NULL", [pollId]);
  if (!claimed.affectedRows) return;
  const p = await loadPoll(pollId);
  const g = p.group_id ? await getGroup(p.group_id) : undefined;
  if (g?.bot_active && p.announce) await announceNew(p, g, "⏰ ใกล้ปิดโหวต");
}

/* ---------------------------------- lists --------------------------------- */

export type ListScope = "public" | "mine" | "voted" | "groups" | "group";

export async function listPolls(user: User, scope: ListScope, groupId?: string, status: "open" | "closed" | "all" = "all") {
  let where: string;
  const params: unknown[] = [];
  switch (scope) {
    case "public":
      where = "p.audience = 'public'";
      break;
    case "mine":
      where = "p.creator_id = ?";
      params.push(user.id);
      break;
    case "voted":
      where = "EXISTS (SELECT 1 FROM votes v WHERE v.poll_id = p.id AND v.user_id = ?)";
      params.push(user.id);
      break;
    case "groups":
      where = "p.group_id IN (SELECT group_id FROM group_members WHERE user_id = ? AND left_at IS NULL)";
      params.push(user.id);
      break;
    case "group": {
      const g = groupId ? await getGroup(groupId) : undefined;
      if (!g) throw new HttpError(404, "ไม่พบกลุ่ม");
      await requireMember(user, g);
      where = "p.group_id = ?";
      params.push(g.id);
      break;
    }
  }
  if (status === "open") where += " AND p.closed_at IS NULL AND (p.closes_at IS NULL OR p.closes_at > CURRENT_TIMESTAMP(3))";
  if (status === "closed") where += " AND (p.closed_at IS NOT NULL OR p.closes_at <= CURRENT_TIMESTAMP(3))";

  const list = (
    await rows<PollRow & { group_name: string | null }>(
      `SELECT p.*, u.display_name AS creator_name, u.picture_url AS creator_picture, g.name AS group_name
         FROM polls p JOIN users u ON u.id = p.creator_id LEFT JOIN line_groups g ON g.id = p.group_id
        WHERE ${where} ORDER BY p.created_at DESC LIMIT 50`,
      params,
    )
  ).map((p) => ({ ...normPoll(p), group_name: p.group_name }));
  if (!list.length) return [];

  const ids = list.map((p) => p.id);
  const [opts, counts, voters, mine] = await Promise.all([
    loadOptions(ids),
    rows<{ option_id: string; n: number }>("SELECT option_id, COUNT(*) AS n FROM votes WHERE poll_id IN (?) GROUP BY option_id", [ids]),
    rows<{ poll_id: string; n: number }>("SELECT poll_id, COUNT(DISTINCT user_id) AS n FROM votes WHERE poll_id IN (?) GROUP BY poll_id", [ids]),
    rows<{ poll_id: string }>("SELECT DISTINCT poll_id FROM votes WHERE poll_id IN (?) AND user_id = ?", [ids, user.id]),
  ]);
  const countOf = new Map(counts.map((c) => [c.option_id, Number(c.n)]));
  const votersOf = new Map(voters.map((v) => [v.poll_id, Number(v.n)]));
  const votedSet = new Set(mine.map((m) => m.poll_id));

  return list.map((p) => {
    const hasVoted = votedSet.has(p.id);
    const show = canSeeResults(p, user, hasVoted);
    return {
      id: p.id,
      title: p.title,
      kind: p.kind,
      audience: p.audience,
      closesAt: p.closes_at,
      isOpen: isOpen(p),
      createdAt: p.created_at,
      creator: { name: p.creator_name, pictureUrl: p.creator_picture },
      groupName: p.group_name,
      hasVoted,
      voterCount: votersOf.get(p.id) ?? 0,
      options: opts
        .filter((o) => o.poll_id === p.id)
        .map((o) => ({ id: o.id, label: o.label, emoji: o.emoji, votes: show ? (countOf.get(o.id) ?? 0) : null })),
    };
  });
}
