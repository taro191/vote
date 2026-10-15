# VOTE — คู่มือสำหรับ Claude

ระบบโหวตบน LINE Mini App (LIFF) · รายละเอียดฟีเจอร์ การตั้งค่า LINE และขั้นตอน deploy ฉบับเต็มอยู่ใน `README.md`

## โครงสร้าง
- npm workspaces: `apps/api` (Node 22+, Fastify 5, mysql2, jose) และ `apps/web` (React 19, Vite 7, Tailwind v4, LIFF SDK)
- `apps/api/src/routes.ts` รวม route ทั้งหมด · `auth.ts` session/LINE login/guest · `polls.ts` `groups.ts` `life.ts` logic แต่ละส่วน · `webhook.ts` `line.ts` บอท · `scheduler.ts` ปิดโหวต/เตือน (เรียกผ่าน `/api/cron`)
- `apps/api/migrations/NNN_*.sql` รันตามลำดับชื่อไฟล์ และจดไว้ในตาราง `schema_migrations` → **ห้ามแก้ไฟล์ที่ deploy ไปแล้ว ให้เพิ่มไฟล์ใหม่แทน**
- `app.js` คือจุดเริ่มสำหรับ Plesk/Passenger · API เสิร์ฟหน้าเว็บจาก `apps/web/dist` ด้วย
- `design/` เป็นต้นแบบจาก Figma Make ใช้อ้างอิงหน้าตาเท่านั้น ไม่ได้ build (มี CLAUDE.md ของตัวเอง)

## คำสั่ง
```bash
npm run dev:api      # http://localhost:3000 (อ่าน .env ที่ root)
npm run dev:web      # http://localhost:5173
npm run migrate
npm run typecheck    # ไม่มีชุดเทสต์ ใช้ typecheck + ลองในเบราว์เซอร์
npm run build
```
ในเครื่องใช้ MySQL ของ WAMP และ `DEV_AUTH=true` เพื่อล็อกอินจำลอง/กลุ่มจำลองได้

## ข้อควรระวัง
- repo เป็น **public** ห้าม commit `.env` หรือ secret ใด ๆ
- production ใช้ **MariaDB** ไม่ใช่ MySQL ดังนั้น SQL ต้องรันได้บนทั้งสองตัว
- คอมเมนต์ในโค้ดและข้อความใน UI เขียนเป็นภาษาไทย
- ผู้ใช้ไม่ต้องล็อกอินก็ใช้ได้ (ระบบสร้างบัญชี guest ให้) แต่โหวตเฉพาะกลุ่มต้องใช้บัญชี LINE

## Deploy (Plesk, https://vote.yaydang.com)
push ขึ้น `main` → Plesk pull ให้อัตโนมัติ (หรือกด Git → Pull now) → Node.js → Run Node.js commands: `run build` (ถ้า dependency เปลี่ยนให้รัน `install --include=dev` ก่อน) → Restart App
- คำสั่ง npm ใน Plesk ไม่เห็น env vars ที่ตั้งในแผง แอปจึงรัน migration เองตอนเริ่มทำงาน
- ภายใต้ Passenger ต้องใช้ `server.listen("passenger")` ตรง ๆ จะใช้ `listen()` ของ Fastify ไม่ได้
- Plesk ไม่แสดง log ของแอป ถ้าแอปเริ่มไม่ขึ้นให้ดูไฟล์ `/vote/app-error.log`
- เช็กหลัง deploy: `curl -X POST https://vote.yaydang.com/api/auth/guest` ต้องได้ token กลับมา
