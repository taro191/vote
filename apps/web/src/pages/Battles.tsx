import { useState } from "react";
import { api } from "../api";
import { ErrorBox, PollList, Spinner, useLoad, useNav } from "../ui";

export default function Battles() {
  const { go } = useNav();
  const [status, setStatus] = useState<"open" | "closed">("open");
  const list = useLoad(async () => {
    const [g, p] = await Promise.all([api.polls("groups", { status }), api.polls("public", { status })]);
    const seen = new Set<string>();
    return [...g, ...p].filter((x) => x.kind === "battle" && !seen.has(x.id) && seen.add(x.id));
  }, [status]);

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">⚔ Battle</h1>
          <p className="text-sm text-mute">สองฝั่งชนกัน ใครจะชนะ ตัดสินด้วยเสียงของทุกคน</p>
        </div>
        <button onClick={() => go({ name: "create" })} className="btn-primary shrink-0 rounded-xl px-3.5 py-2 text-sm font-bold">
          + สร้าง Battle
        </button>
      </div>
      <Tabs value={status} onChange={setStatus} items={[["open", "กำลังแข่ง"], ["closed", "ผลรอบที่ผ่านมา"]]} />
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} />
      ) : (
        <PollList items={list.data!} empty={status === "open" ? "ยังไม่มี Battle ที่กำลังแข่ง" : "ยังไม่มีผล Battle"} />
      )}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  return (
    <div className="inline-flex gap-0.5 rounded-2xl bg-track/70 p-1" role="tablist">
      {items.map(([v, label]) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`rounded-xl px-4 py-1.5 text-sm font-bold ${value === v ? "bg-surface text-ink shadow-sm" : "text-mute"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
