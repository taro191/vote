import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env, hasBot } from "./env.js";
import { HttpError, issueSession, readGroupCtx, requireUser, signGroupCtx, upsertUser, verifyLineIdToken } from "./auth.js";
import { checkMember, ensureGroup, getGroupByLineId, myGroups, publicGroup } from "./groups.js";
import { castVote, clearVote, closePoll, createPoll, createSchema, deletePoll, listPolls, pollView } from "./polls.js";
import { handleEvent } from "./webhook.js";
import { verifySignature } from "./line.js";

const parse = <T extends z.ZodTypeAny>(s: T, v: unknown): z.infer<T> => {
  const r = s.safeParse(v);
  if (!r.success) throw new HttpError(400, r.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง");
  return r.data;
};

export async function routes(app: FastifyInstance) {
  /* ---------------------------------- meta --------------------------------- */
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/config", async () => ({ liffId: env.liffId || null, devAuth: env.devAuth, bot: hasBot() }));

  /* ---------------------------------- auth --------------------------------- */
  app.post("/api/auth/line", async (req) => {
    const { idToken } = parse(z.object({ idToken: z.string().min(10) }), req.body);
    const p = await verifyLineIdToken(idToken);
    const user = await upsertUser(p.lineUserId, p.name, p.picture);
    return { token: await issueSession(user.id), user: publicUser(user) };
  });

  app.post("/api/auth/dev", async (req) => {
    if (!env.devAuth) throw new HttpError(404, "Not found");
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(40) }), req.body);
    const user = await upsertUser(`dev-${name}`, name, null);
    return { token: await issueSession(user.id), user: publicUser(user) };
  });

  app.get("/api/me", async (req) => publicUser(await requireUser(req)));

  /* --------------------------------- groups -------------------------------- */
  // แปลงลิงก์ ctx ที่ bot ส่งในกลุ่ม -> ข้อมูลกลุ่ม + ตรวจสมาชิก
  app.post("/api/context", async (req) => {
    const user = await requireUser(req);
    const { ctx } = parse(z.object({ ctx: z.string().min(3).max(300) }), req.body);
    const lineGroupId = readGroupCtx(ctx);
    if (!lineGroupId) throw new HttpError(400, "ลิงก์กลุ่มไม่ถูกต้อง");
    const group = (await getGroupByLineId(lineGroupId)) ?? (await ensureGroup(lineGroupId, lineGroupId.startsWith("R") ? "room" : "group"));
    const isMember = await checkMember(user, group, true);
    return { group: publicGroup(group), isMember };
  });

  app.get("/api/groups", async (req) => {
    const user = await requireUser(req);
    return (await myGroups(user)).map((g) => ({ ...publicGroup({ ...g, bot_active: Boolean(g.bot_active) }), openPolls: Number(g.open_polls) }));
  });

  // โหมด dev: สร้างกลุ่มจำลองเพื่อทดสอบโหวตเฉพาะกลุ่มโดยไม่ต้องมี bot
  app.post("/api/dev/group", async (req) => {
    if (!env.devAuth) throw new HttpError(404, "Not found");
    await requireUser(req);
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(60) }), req.body);
    const lineGroupId = `dev-${randomUUID()}`;
    await ensureGroup(lineGroupId, "group", name);
    return { ctx: signGroupCtx(lineGroupId) };
  });

  /* ---------------------------------- polls -------------------------------- */
  app.get("/api/polls", async (req) => {
    const user = await requireUser(req);
    const q = parse(
      z.object({
        scope: z.enum(["public", "mine", "voted", "groups", "group"]).default("public"),
        groupId: z.string().uuid().optional(),
        status: z.enum(["open", "closed", "all"]).default("all"),
      }),
      req.query,
    );
    return listPolls(user, q.scope, q.groupId, q.status);
  });

  app.post("/api/polls", async (req, reply) => {
    const user = await requireUser(req);
    const id = await createPoll(user, parse(createSchema, req.body));
    reply.code(201);
    return { id };
  });

  app.get<{ Params: { id: string } }>("/api/polls/:id", async (req) => pollView(await requireUser(req), req.params.id));

  app.post<{ Params: { id: string } }>("/api/polls/:id/vote", async (req) => {
    const user = await requireUser(req);
    const { optionIds } = parse(z.object({ optionIds: z.array(z.string().uuid()).min(1).max(20) }), req.body);
    await castVote(user, req.params.id, optionIds);
    return pollView(user, req.params.id);
  });

  app.delete<{ Params: { id: string } }>("/api/polls/:id/vote", async (req) => {
    const user = await requireUser(req);
    await clearVote(user, req.params.id);
    return pollView(user, req.params.id);
  });

  app.post<{ Params: { id: string } }>("/api/polls/:id/close", async (req) => {
    const user = await requireUser(req);
    await closePoll(user, req.params.id);
    return pollView(user, req.params.id);
  });

  app.delete<{ Params: { id: string } }>("/api/polls/:id", async (req, reply) => {
    await deletePoll(await requireUser(req), req.params.id);
    reply.code(204);
  });

  /* ------------------------------ LINE webhook ----------------------------- */
  app.post("/webhook", async (req, reply) => {
    const raw = (req as unknown as { rawBody?: string }).rawBody ?? "";
    if (!verifySignature(raw, req.headers["x-line-signature"] as string | undefined)) {
      reply.code(401);
      return { error: "bad signature" };
    }
    const events = ((req.body as { events?: unknown[] })?.events ?? []) as Parameters<typeof handleEvent>[0][];
    // ตอบ 200 ทันที แล้วประมวลผลต่อเบื้องหลัง (LINE ต้องการคำตอบเร็ว)
    for (const e of events) handleEvent(e).catch((err) => req.log.error({ err }, "webhook event failed"));
    return { ok: true };
  });
}

function publicUser(u: { id: string; display_name: string; picture_url: string | null }) {
  return { id: u.id, name: u.display_name, pictureUrl: u.picture_url };
}
