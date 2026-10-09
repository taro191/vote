// จุดเริ่มต้นสำหรับ Plesk (Phusion Passenger) — Application Startup File = app.js
// โหลด .env ถ้ามี แล้วเปิด API ที่ build แล้ว (ซึ่งเสิร์ฟหน้าเว็บจาก apps/web/dist ด้วย)
const fs = require("node:fs");
const path = require("node:path");

const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
process.env.NODE_ENV ||= "production";

import("./apps/api/dist/index.js").catch((err) => {
  console.error("Failed to start VOTE API:", err);
  process.exit(1);
});
