import liff from "@line/liff";
import type { Poll } from "./api";

let ready = false;
let initing: Promise<void> | null = null;

export async function initLiff(liffId: string) {
  initing ??= liff.init({ liffId });
  await initing;
  ready = true;
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return null; // กำลัง redirect ไปหน้า login
  }
  return liff.getIDToken();
}

export const inLineClient = () => ready && liff.isInClient();

export function closeApp() {
  if (inLineClient()) liff.closeWindow();
}

const KIND: Record<string, string> = { single: "เลือก 1 ข้อ", multiple: "เลือกได้หลายข้อ", battle: "Battle", rating: "ให้คะแนน 1–5", yesno: "ใช่ / ไม่ใช่" };

function flexFor(p: Poll) {
  const opts = p.kind === "rating" ? [] : p.options.slice(0, 6);
  return {
    type: "flex" as const,
    altText: `โหวต: ${p.title}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: `โหวต · ${KIND[p.kind]}`, size: "xs", color: "#1F6BFF", weight: "bold" },
          { type: "text", text: p.title, weight: "bold", size: "lg", color: "#0F1F3D", wrap: true },
          ...opts.map((o) => ({ type: "text", text: `• ${o.emoji ? o.emoji + " " : ""}${o.label}`, size: "sm", color: "#0F1F3D", wrap: true })),
          { type: "text", text: `โดย ${p.creator.name}`, size: "xs", color: "#55667F" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [{ type: "button", style: "primary", color: "#1F6BFF", height: "sm", action: { type: "uri", label: "โหวตเลย", uri: p.shareUrl } }],
      },
    },
  };
}

/** แชร์โหวตไปยังแชตอื่น: ใช้ shareTargetPicker ใน LINE, นอก LINE ใช้ Web Share / คัดลอกลิงก์ */
export async function sharePoll(p: Poll): Promise<"shared" | "copied" | "cancelled"> {
  if (ready && liff.isApiAvailable("shareTargetPicker")) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await liff.shareTargetPicker([flexFor(p) as any]);
    return r ? "shared" : "cancelled";
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: p.title, url: p.shareUrl });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  await navigator.clipboard.writeText(p.shareUrl);
  return "copied";
}
