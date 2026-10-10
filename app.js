// จุดเริ่มต้นสำหรับ Plesk (Phusion Passenger) — Application Startup File = app.js
// โหลด .env ถ้ามี แล้วเปิด API ที่ build แล้ว (ซึ่งเสิร์ฟหน้าเว็บจาก apps/web/dist ด้วย)
const fs = require("node:fs");
const path = require("node:path");

// Plesk ไม่แสดง stdout/stderr ของแอป จึงเขียน error ตอนเริ่มทำงานลงไฟล์นี้ (อ่านได้จาก File Manager)
const errorLog = path.join(__dirname, "app-error.log");
const logError = (label, err) => {
  const msg = `[${new Date().toISOString()}] ${label}: ${err && err.stack ? err.stack : err}\n`;
  console.error(msg);
  try {
    fs.appendFileSync(errorLog, msg);
  } catch {}
};
process.on("uncaughtException", (err) => {
  logError("uncaughtException", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => logError("unhandledRejection", err));

// Passenger ดัก listen() อัตโนมัติไม่ได้กับ Fastify จึงปิด autoInstall แล้วให้แอป listen("passenger") เอง
if (typeof PhusionPassenger !== "undefined") {
  PhusionPassenger.configure({ autoInstall: false });
  process.env.VOTE_PASSENGER = "1";
}

const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
process.env.NODE_ENV ||= "production";

import("./apps/api/dist/index.js").catch((err) => {
  logError("Failed to start VOTE API", err);
  process.exit(1);
});
