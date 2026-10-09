import { appLink } from "./env.js";
import { signGroupCtx } from "./auth.js";
import { ensureGroup, markMembersLeft, setBotActive } from "./groups.js";
import { menuMessage, reply, textMessage } from "./line.js";

type Source = { type: "user" | "group" | "room"; userId?: string; groupId?: string; roomId?: string };
type Event = {
  type: string;
  replyToken?: string;
  source: Source;
  message?: { type: string; text?: string };
  left?: { members: { userId: string }[] };
};

const MENU_WORDS = /^(?:\/?vote|โหวต|\/โหวต|สร้างโหวต|เมนูโหวต)$/i;

function chatOf(s: Source): { id: string; type: "group" | "room" } | null {
  if (s.type === "group" && s.groupId) return { id: s.groupId, type: "group" };
  if (s.type === "room" && s.roomId) return { id: s.roomId, type: "room" };
  return null;
}

function groupMenu(lineGroupId: string) {
  const ctx = signGroupCtx(lineGroupId);
  return menuMessage({ create: appLink({ ctx, view: "create" }), list: appLink({ ctx }) });
}

export async function handleEvent(e: Event) {
  const chat = chatOf(e.source);

  switch (e.type) {
    case "join": // bot ถูกเชิญเข้ากลุ่ม/ห้อง
      if (!chat) return;
      await ensureGroup(chat.id, chat.type);
      if (e.replyToken) await reply(e.replyToken, [groupMenu(chat.id)]);
      return;

    case "leave": // bot ถูกเชิญออก
      if (chat) await setBotActive(chat.id, false);
      return;

    case "memberLeft":
      if (chat && e.left) await markMembersLeft(chat.id, e.left.members.map((m) => m.userId));
      return;

    case "follow": // เพิ่ม bot เป็นเพื่อน
      if (e.replyToken)
        await reply(e.replyToken, [
          textMessage("ยินดีต้อนรับสู่ VOTE 🗳️\nเชิญบอทเข้ากลุ่ม LINE แล้วพิมพ์ \"โหวต\" เพื่อสร้างโหวตในกลุ่ม\nหรือเปิดแอปเพื่อสร้างโหวตแบบแชร์ลิงก์: " + appLink({})),
        ]);
      return;

    case "message": {
      const text = e.message?.type === "text" ? e.message.text?.trim() ?? "" : "";
      if (!e.replyToken || !MENU_WORDS.test(text)) return;
      if (chat) {
        await ensureGroup(chat.id, chat.type);
        await reply(e.replyToken, [groupMenu(chat.id)]);
      } else {
        await reply(e.replyToken, [textMessage("เปิดแอป VOTE: " + appLink({}))]);
      }
      return;
    }
  }
}
