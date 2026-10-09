import { useState } from "react";
import { api, type Kind } from "../api";
import { ErrorBox, KIND_LABEL, PollList, Spinner, useLoad, useNav } from "../ui";
import { Tabs } from "./Battles";

export default function PublicPage() {
  const { go } = useNav();
  const [status, setStatus] = useState<"open" | "closed">("open");
  const [kind, setKind] = useState<Kind | "all">("all");
  const list = useLoad(() => api.polls("public", { status }), [status]);
  const items = (list.data ?? []).filter((p) => kind === "all" || p.kind === kind);

  return (
    <div className="space-y-4 pt-4">
      <div className="btn-primary relative overflow-hidden rounded-3xl p-5 shadow-[0_14px_32px_rgb(31_107_255/22%)]">
        <div className="absolute -right-12 -top-16 h-32 w-32 rounded-full bg-white/15" />
        <h1 className="text-xl font-extrabold">โหวตสาธารณะ</h1>
        <p className="mt-1 text-sm opacity-90">เปิดให้ทุกคนร่วมแสดงความเห็น ใครก็โหวตได้</p>
        <button onClick={() => go({ name: "create" })} className="relative mt-3 rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#1F6BFF]">
          + สร้างโหวตสาธารณะ
        </button>
      </div>

      <Tabs value={status} onChange={setStatus} items={[["open", "เปิดอยู่"], ["closed", "ปิดแล้ว"]]} />

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {(["all", "single", "multiple", "battle", "rating", "yesno"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${kind === k ? "bg-accent text-white" : "bg-surface text-mute shadow-sm"}`}
          >
            {k === "all" ? "ทั้งหมด" : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : <PollList items={items} empty="ยังไม่มีโหวตสาธารณะในหมวดนี้" />}
    </div>
  );
}
