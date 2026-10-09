import { createHmac, timingSafeEqual } from "node:crypto";
import { env, hasBot } from "./env.js";

const API = "https://api.line.me/v2/bot";

/** กลุ่มจำลองสำหรับทดสอบในเครื่อง (ไม่เรียก LINE API) */
export const isDevGroup = (lineGroupId: string) => !env.isProd && lineGroupId.startsWith("dev-");

async function call(path: string, init: RequestInit = {}) {
  if (!hasBot()) return null;
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.channelAccessToken}`, "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LINE API ${path} -> ${res.status} ${await res.text()}`);
  const t = await res.text();
  return t ? JSON.parse(t) : {};
}

export function verifySignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature || !env.channelSecret) return false;
  const expect = Buffer.from(createHmac("sha256", env.channelSecret).update(rawBody).digest("base64"));
  const got = Buffer.from(signature);
  return expect.length === got.length && timingSafeEqual(expect, got);
}

export type Message = Record<string, unknown>;

export const reply = (replyToken: string, messages: Message[]) =>
  call("/message/reply", { method: "POST", body: JSON.stringify({ replyToken, messages }) });

export async function push(to: string, messages: Message[]) {
  if (isDevGroup(to)) {
    console.log(`[dev push -> ${to}]`, JSON.stringify(messages).slice(0, 300));
    return null;
  }
  return call("/message/push", { method: "POST", body: JSON.stringify({ to, messages }) });
}

export async function groupSummary(groupId: string): Promise<{ groupName: string; pictureUrl?: string } | null> {
  return call(`/group/${encodeURIComponent(groupId)}/summary`);
}

/** ตรวจว่า userId เป็นสมาชิกของกลุ่ม/ห้องหรือไม่ (404 = ไม่ใช่สมาชิก) */
export async function isMember(type: "group" | "room", groupId: string, userId: string): Promise<boolean> {
  if (isDevGroup(groupId)) return true;
  if (!hasBot()) return false;
  const p = await call(`/${type}/${encodeURIComponent(groupId)}/member/${encodeURIComponent(userId)}`);
  return p !== null;
}

/* ------------------------------ Flex messages ------------------------------ */

const BLUE = "#1F6BFF";
const INK = "#0F1F3D";
const MUTE = "#55667F";

export const KIND_LABEL: Record<string, string> = {
  single: "เลือก 1 ข้อ",
  multiple: "เลือกได้หลายข้อ",
  battle: "Battle",
  rating: "ให้คะแนน 1–5",
  yesno: "ใช่ / ไม่ใช่",
};

const fmtTime = (d: Date) =>
  d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function uriButton(label: string, uri: string, primary = true) {
  return {
    type: "button",
    style: primary ? "primary" : "secondary",
    ...(primary ? { color: BLUE } : {}),
    height: "sm",
    action: { type: "uri", label, uri },
  };
}

export function menuMessage(link: { create: string; list: string }): Message {
  return {
    type: "flex",
    altText: "VOTE — สร้างโหวตในกลุ่มนี้",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: "VOTE", weight: "bold", color: BLUE, size: "sm" },
          { type: "text", text: "หนึ่งเสียง หนึ่งการเลือก", weight: "bold", size: "lg", color: INK, wrap: true },
          { type: "text", text: "สร้างโหวตให้ทุกคนในกลุ่มตัดสินใจร่วมกัน ไม่ต้องเถียงกันยาวในแชต", size: "sm", color: MUTE, wrap: true },
          { type: "text", text: "พิมพ์ \"โหวต\" ในกลุ่มเพื่อเรียกเมนูนี้อีกครั้ง", size: "xs", color: MUTE, wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [uriButton("สร้างโหวตใหม่", link.create), uriButton("ดูโหวตของกลุ่ม", link.list, false)],
      },
    },
  };
}

export type PollSummary = {
  title: string;
  description: string | null;
  kind: string;
  closes_at: Date | null;
  creator: string;
  options: { label: string; emoji: string | null }[];
};

export function pollMessage(p: PollSummary, link: string, heading = "โหวตใหม่"): Message {
  const opts = p.kind === "rating" ? [] : p.options.slice(0, 6);
  const optionLines =
    p.kind === "battle" && opts.length === 2
      ? [{ type: "text", text: `${opts[0].emoji ?? ""} ${opts[0].label}  VS  ${opts[1].emoji ?? ""} ${opts[1].label}`.trim(), size: "md", weight: "bold", color: INK, wrap: true, align: "center" }]
      : opts.map((o) => ({ type: "text", text: `• ${o.emoji ? o.emoji + " " : ""}${o.label}`, size: "sm", color: INK, wrap: true }));
  return {
    type: "flex",
    altText: `${heading}: ${p.title}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `${heading} · ${KIND_LABEL[p.kind] ?? p.kind}`, size: "xs", color: BLUE, weight: "bold" },
          { type: "text", text: p.title, weight: "bold", size: "lg", color: INK, wrap: true },
          ...(p.description ? [{ type: "text", text: p.description, size: "sm", color: MUTE, wrap: true, maxLines: 3 }] : []),
          ...(optionLines.length ? [{ type: "box", layout: "vertical", spacing: "xs", contents: optionLines }] : []),
          {
            type: "text",
            size: "xs",
            color: MUTE,
            wrap: true,
            text: `โดย ${p.creator}${p.closes_at ? ` · ปิด ${fmtTime(p.closes_at)}` : ""}`,
          },
        ],
      },
      footer: { type: "box", layout: "vertical", contents: [uriButton("โหวตเลย", link)] },
    },
  };
}

export type ResultRow = { label: string; emoji: string | null; votes: number };

export function resultMessage(title: string, kind: string, rows: ResultRow[], voters: number, link: string): Message {
  const total = rows.reduce((s, r) => s + r.votes, 0);
  const max = Math.max(0, ...rows.map((r) => r.votes));
  const sorted = [...rows].sort((a, b) => b.votes - a.votes);
  let headline: string;
  if (kind === "rating") {
    const sum = rows.reduce((s, r, i) => s + r.votes * (i + 1), 0);
    headline = total ? `คะแนนเฉลี่ย ${(sum / total).toFixed(2)} / 5` : "ยังไม่มีใครโหวต";
  } else if (!total) headline = "ยังไม่มีใครโหวต";
  else {
    const winners = sorted.filter((r) => r.votes === max);
    headline =
      winners.length > 1
        ? `🤝 เสมอกัน: ${winners.map((w) => w.label).join(", ")}`
        : `🏆 ${winners[0].emoji ? winners[0].emoji + " " : ""}${winners[0].label}`;
  }
  const list = kind === "rating" ? rows : sorted;
  return {
    type: "flex",
    altText: `ผลโหวต: ${title}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "ปิดโหวตแล้ว · ผลลัพธ์", size: "xs", color: BLUE, weight: "bold" },
          { type: "text", text: title, weight: "bold", size: "lg", color: INK, wrap: true },
          { type: "text", text: headline, weight: "bold", size: "md", color: INK, wrap: true },
          ...list.slice(0, 8).map((r) => {
            const pct = total ? Math.round((r.votes / total) * 100) : 0;
            return {
              type: "box",
              layout: "vertical",
              spacing: "xs",
              contents: [
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    { type: "text", text: `${r.emoji ? r.emoji + " " : ""}${r.label}`, size: "sm", color: INK, flex: 5, wrap: true },
                    { type: "text", text: `${r.votes} (${pct}%)`, size: "sm", color: MUTE, align: "end", flex: 2 },
                  ],
                },
                {
                  type: "box",
                  layout: "vertical",
                  height: "6px",
                  backgroundColor: "#E4ECF8",
                  cornerRadius: "3px",
                  contents: [
                    { type: "box", layout: "vertical", height: "6px", width: `${Math.max(pct, 1)}%`, backgroundColor: BLUE, cornerRadius: "3px", contents: [] },
                  ],
                },
              ],
            };
          }),
          { type: "text", text: `ผู้โหวตทั้งหมด ${voters} คน`, size: "xs", color: MUTE },
        ],
      },
      footer: { type: "box", layout: "vertical", contents: [uriButton("ดูผลละเอียด", link, false)] },
    },
  };
}

export function textMessage(text: string): Message {
  return { type: "text", text };
}
