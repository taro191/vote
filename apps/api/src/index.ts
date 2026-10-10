import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { HttpError } from "./auth.js";
import { routes } from "./routes.js";
import { startScheduler } from "./scheduler.js";
import { runMigrations } from "./migrations.js";

const app = Fastify({ logger: { level: env.isProd ? "info" : "warn" }, trustProxy: true });

// เก็บ raw body ไว้ตรวจลายเซ็น webhook ของ LINE
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  (req as unknown as { rawBody: string }).rawBody = body as string;
  try {
    done(null, body ? JSON.parse(body as string) : {});
  } catch {
    done(new HttpError(400, "invalid JSON"), undefined);
  }
});

app.setErrorHandler((err, req, reply) => {
  if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
  const { statusCode: status, message } = err as { statusCode?: number; message: string };
  if (status && status < 500) return reply.code(status).send({ error: message });
  req.log.error(err);
  reply.code(500).send({ error: "เกิดข้อผิดพลาดในระบบ" });
});

await app.register(cors, { origin: env.isProd ? false : true });
await app.register(routes);

// โปรดักชัน: เสิร์ฟหน้าเว็บที่ build แล้วจาก apps/web/dist
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api") && req.url !== "/webhook") return reply.sendFile("index.html");
    reply.code(404).send({ error: "Not found" });
  });
}

// โปรดักชัน: อัปเดตตารางอัตโนมัติตอนเริ่มแอป (Plesk ไม่ส่ง env ไปให้คำสั่ง npm จึงรัน migrate แยกไม่ได้)
if (env.isProd) await runMigrations((m) => app.log.info(m));

startScheduler();
// ใต้ Phusion Passenger (Plesk) ต้อง listen ที่ path "passenger" แทนพอร์ต (ดู app.js)
// (Passenger รับเฉพาะ listen("passenger") แบบ string จึงเรียกที่ server ตรง ๆ แทน app.listen)
if (process.env.VOTE_PASSENGER) {
  await app.ready();
  app.server.listen("passenger");
} else await app.listen({ port: env.port, host: "0.0.0.0" });
console.log(`API ready on http://localhost:${env.port}`);
