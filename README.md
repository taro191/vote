# VOTE — LINE Mini App

ระบบโหวตบน LINE Mini App (LIFF) อ้างอิงผู้ใช้จาก LINE Login และกลุ่มจาก LINE bot

## ฟีเจอร์
- **รูปแบบโหวต:** เลือก 1 ข้อ · เลือกหลายข้อ (กำหนดจำนวนสูงสุดได้) · Battle A vs B · ให้คะแนน 1–5 · ใช่/ไม่ใช่/งดออกเสียง
- **ผู้มีสิทธิ์โหวต:** เฉพาะสมาชิกกลุ่ม LINE (ตรวจกับ Messaging API) · ทุกคนที่มีลิงก์ · สาธารณะ
- **ตั้งค่า:** ไม่ระบุตัวตน · เปลี่ยน/ถอนคำตอบได้หรือไม่ · แสดงผลตลอด / หลังโหวต / เมื่อปิด · เวลาปิดอัตโนมัติ
- **บอทในกลุ่ม:** ส่งเมนูเมื่อถูกเชิญหรือพิมพ์ "โหวต" · ประกาศโหวตใหม่ · เตือนก่อนปิด · ส่งผลเมื่อปิด
- **แชร์** ไปแชตอื่นด้วย `shareTargetPicker`
- **ผลสด:** หน้าโหวตอัปเดตทุก 5 วินาที
- **Stage Display Mode:** จอใหญ่/จอ LED แสดงผลสดทุก 3 วินาที พร้อม QR code ให้คนในงานสแกนโหวต (ปุ่ม "📺 จอใหญ่" ในหน้าโหวต)
- **Vote my life:** ให้คะแนนชีวิตวันละ 1 ครั้ง (1–5 + โน้ต) ตารางชีวิต target × 365 ช่อง สรุปค่าเฉลี่ย/แนวโน้ม/วันดีติดต่อกัน
  สูงสุด 12 โปรไฟล์ต่อบัญชี (เช่น สมาชิกในครอบครัว) · ส่งออก CSV · บอทส่งเตือนรายวันตามเวลาที่ตั้ง (ต้องเพิ่มบอทเป็นเพื่อน)
  เปิดตรงได้ด้วย `?view=life` หรือพิมพ์ "ชีวิต" ในแชต 1:1 กับบอท

## โครงสร้าง
```
apps/api   Node + Fastify + MySQL (mysql2) — API, LINE webhook, ตัวตั้งเวลาปิด/เตือน
apps/web   React + Vite + Tailwind v4 + LIFF SDK — หน้าแอป
design/    งานออกแบบต้นแบบจาก Figma Make (ใช้อ้างอิงหน้าตา)
```

## เริ่มใช้งานในเครื่อง
ต้องมี Node 22+ และ MySQL 8.0.16+ (เช่น MySQL ของ WAMP)

```bash
npm install
cp .env.example .env      # แก้ DATABASE_URL และ APP_SECRET
npm run migrate           # สร้าง database และตาราง
npm run dev:api           # API ที่ http://localhost:3000
npm run dev:web           # เว็บที่ http://localhost:5173
```

ถ้ายังไม่ได้ตั้งค่า LIFF และ `DEV_AUTH=true` แอปจะแสดงหน้าล็อกอินจำลอง ใช้ทดสอบได้โดยไม่ต้องมีบัญชี LINE
และสร้าง "กลุ่มจำลอง" ได้จากหน้าโปรไฟล์ เพื่อทดสอบโหวตเฉพาะกลุ่ม (ระบบจะพิมพ์ข้อความที่บอทจะส่งลง log แทนการส่งจริง)

## ตั้งค่า LINE
1. ที่ [LINE Developers Console](https://developers.line.biz/console/) สร้าง Provider
2. **LINE Login channel** → แท็บ LIFF → Add
   - Size: `Full` · Endpoint URL: URL ของเว็บ (ต้องเป็น https เช่นจาก ngrok หรือโดเมนจริง)
   - Scope: `openid`, `profile` · เปิด `shareTargetPicker` ในแท็บ LIFF
   - นำ Channel ID → `LINE_LOGIN_CHANNEL_ID` และ LIFF ID → `LIFF_ID` / `VITE_LIFF_ID`
3. **Messaging API channel** (บอท)
   - Channel secret → `LINE_CHANNEL_SECRET` · ออก Channel access token (long-lived) → `LINE_CHANNEL_ACCESS_TOKEN`
   - Webhook URL: `https://<โดเมน>/webhook` แล้วเปิด *Use webhook*
   - เปิด *Allow bot to join group chats* และปิด *Auto-reply messages*
4. เชิญบอทเข้ากลุ่ม LINE → บอทจะส่งเมนู "สร้างโหวตใหม่" ให้ทันที

> ข้อมูลใน `.env` เป็นความลับ ห้าม commit (repo นี้เป็น public)

## Production
```bash
npm run build     # build เว็บไปที่ apps/web/dist และ compile API
NODE_ENV=production npm start
```
API จะเสิร์ฟหน้าเว็บจาก `apps/web/dist` ด้วย จึงใช้โดเมนเดียวกันได้ทั้ง LIFF endpoint และ webhook
เมื่อ `NODE_ENV=production` ระบบจะปิดล็อกอินจำลองและกลุ่มจำลองอัตโนมัติ

## API หลัก
| Method | Path | ใช้ทำอะไร |
|---|---|---|
| POST | `/api/auth/line` | แลก LIFF ID token เป็น session |
| POST | `/api/context` | เปิดลิงก์กลุ่ม (ctx ที่ลงลายเซ็นจากบอท) + ตรวจสมาชิก |
| GET | `/api/polls?scope=public\|mine\|voted\|groups\|group` | รายการโหวต |
| POST | `/api/polls` | สร้างโหวต |
| GET | `/api/polls/:id` | รายละเอียด + ผล (ตามสิทธิ์การเห็นผล) |
| POST / DELETE | `/api/polls/:id/vote` | โหวต / ถอนโหวต |
| POST | `/api/polls/:id/close` | ผู้สร้างปิดโหวต |
| GET | `/api/life` | ภาพรวม Vote my life (โปรไฟล์ + การเตือน) |
| POST / PUT / DELETE | `/api/life/profiles[/:id]` | จัดการโปรไฟล์ |
| GET | `/api/life/profiles/:id/votes` | คะแนนทั้งหมดของโปรไฟล์ |
| PUT / DELETE | `/api/life/profiles/:id/votes/:YYYY-MM-DD` | ให้/ล้างคะแนนวันนั้น |
| PUT | `/api/life/remind` | ตั้งเวลาแจ้งเตือนรายวัน |
| POST | `/webhook` | LINE webhook (ตรวจ `x-line-signature`) |

## ดูงานออกแบบต้นแบบ
```bash
npx http-server design/public -p 5180
# เปิด http://localhost:5180/vote.html
```
