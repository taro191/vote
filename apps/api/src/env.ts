function opt(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

const isProd = process.env.NODE_ENV === "production";

export const env = {
  isProd,
  port: Number(opt("PORT", "3000")),
  databaseUrl: opt("DATABASE_URL"),
  appSecret: opt("APP_SECRET", isProd ? "" : "dev-secret-not-for-production-use-only"),
  publicUrl: opt("PUBLIC_URL", "http://localhost:3000"),
  loginChannelId: opt("LINE_LOGIN_CHANNEL_ID"),
  liffId: opt("LIFF_ID", opt("VITE_LIFF_ID")),
  channelSecret: opt("LINE_CHANNEL_SECRET"),
  channelAccessToken: opt("LINE_CHANNEL_ACCESS_TOKEN"),
  devAuth: !isProd && opt("DEV_AUTH") === "true",
  // คีย์สำหรับ /api/cron (Scheduled Task ของโฮสต์เรียกทุกนาที เผื่อแอปถูกพักตอนไม่มีคนใช้)
  cronKey: opt("CRON_KEY"),
};

if (!env.databaseUrl.startsWith("mysql://")) throw new Error("DATABASE_URL must be a mysql:// URL (see .env.example)");
if (env.appSecret.length < 32) throw new Error("APP_SECRET must be at least 32 characters");

/** มี bot (Messaging API) พร้อมใช้งานหรือไม่ */
export const hasBot = () => Boolean(env.channelAccessToken && env.channelSecret);

/** ลิงก์เปิดแอปผ่าน LIFF (หรือเว็บตรง ๆ ตอน dev) */
export function appLink(params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString();
  const base = env.liffId ? `https://liff.line.me/${env.liffId}` : env.publicUrl;
  return q ? `${base}?${q}` : base;
}
