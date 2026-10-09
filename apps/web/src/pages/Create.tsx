import { useState, type ReactNode } from "react";
import { api, type Audience, type Kind, type Visibility } from "../api";
import { useSession } from "../App";
import { SubHeader, useLoad, useNav, useToast } from "../ui";

const KINDS: { k: Kind; icon: string; title: string; desc: string }[] = [
  { k: "single", icon: "☝️", title: "เลือก 1 ข้อ", desc: "ตัวเลือกหลายข้อ เลือกได้ข้อเดียว" },
  { k: "multiple", icon: "✅", title: "เลือกหลายข้อ", desc: "เลือกได้หลายข้อตามที่กำหนด" },
  { k: "battle", icon: "⚔️", title: "Battle", desc: "สองฝั่งชนกัน A vs B" },
  { k: "rating", icon: "⭐", title: "ให้คะแนน 1–5", desc: "แย่มาก ถึง ดีมาก ดูค่าเฉลี่ย" },
  { k: "yesno", icon: "👍", title: "ใช่ / ไม่ใช่", desc: "เห็นด้วย ไม่เห็นด้วย งดออกเสียง" },
];

const DURATIONS: [string, number | null][] = [
  ["ไม่กำหนด", null],
  ["1 ชม.", 60],
  ["3 ชม.", 180],
  ["1 วัน", 1440],
  ["3 วัน", 4320],
  ["7 วัน", 10080],
];

type Opt = { label: string; emoji: string };

export default function Create({ groupId: initialGroup }: { groupId?: string }) {
  const { go, back } = useNav();
  const { config } = useSession();
  const toast = useToast();
  const groups = useLoad(() => api.groups());

  const [kind, setKind] = useState<Kind>("single");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState<Opt[]>([
    { label: "", emoji: "" },
    { label: "", emoji: "" },
  ]);
  const [groupId, setGroupId] = useState<string>(initialGroup ?? "");
  const [audience, setAudience] = useState<Audience>(initialGroup ? "group" : "link");
  const [anonymous, setAnonymous] = useState(false);
  const [allowChange, setAllowChange] = useState(true);
  const [visibility, setVisibility] = useState<Visibility>("live");
  const [maxChoices, setMaxChoices] = useState(2);
  const [duration, setDuration] = useState<number | null>(1440);
  const [customClose, setCustomClose] = useState("");
  const [announce, setAnnounce] = useState(true);
  const [remind, setRemind] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsOptions = kind === "single" || kind === "multiple" || kind === "battle";
  const hasClose = duration !== null || Boolean(customClose);

  const pickKind = (k: Kind) => {
    setKind(k);
    if (k === "battle") setOptions((o) => [o[0] ?? { label: "", emoji: "" }, o[1] ?? { label: "", emoji: "" }]);
  };

  const setOpt = (i: number, patch: Partial<Opt>) => setOptions((o) => o.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const submit = async () => {
    setError(null);
    const closesAt = customClose ? new Date(customClose).toISOString() : duration ? new Date(Date.now() + duration * 60000).toISOString() : null;
    const opts = needsOptions ? options.filter((o) => o.label.trim()).map((o) => ({ label: o.label.trim(), emoji: o.emoji.trim() || null })) : [];
    setBusy(true);
    try {
      const { id } = await api.create({
        title,
        description: description || undefined,
        kind,
        audience,
        groupId: groupId || null,
        options: opts,
        anonymous,
        allowChange,
        resultsVisibility: visibility,
        maxChoices: kind === "multiple" ? Math.min(maxChoices, opts.length || 2) : undefined,
        closesAt,
        announce: Boolean(groupId) && announce,
        remindMinutes: closesAt && groupId ? remind : null,
      });
      toast("สร้างโหวตแล้ว");
      back();
      go({ name: "poll", id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SubHeader title="สร้างโหวตใหม่" />
      <div className="space-y-4">
        <Card title="รูปแบบโหวต">
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((x) => (
              <button
                key={x.k}
                type="button"
                onClick={() => pickKind(x.k)}
                aria-pressed={kind === x.k}
                className={`rounded-2xl border p-3 text-left transition ${kind === x.k ? "border-accent bg-accent-soft" : "border-line bg-canvas"} ${x.k === "yesno" ? "col-span-2" : ""}`}
              >
                <span className="text-xl">{x.icon}</span>
                <span className="block text-sm font-extrabold">{x.title}</span>
                <span className="block text-[11px] text-mute">{x.desc}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card title="หัวข้อ">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="เช่น คืนนี้ทีมเราควรกินอะไรกันดี?" className={input} />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="รายละเอียด / วัตถุประสงค์ (ไม่บังคับ)"
            className={`${input} mt-2 resize-y`}
          />
        </Card>

        {needsOptions && (
          <Card title={kind === "battle" ? "สองฝั่งที่จะชนกัน" : "ตัวเลือก"}>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={o.emoji}
                    onChange={(e) => setOpt(i, { emoji: e.target.value })}
                    maxLength={8}
                    placeholder={kind === "battle" ? (i ? "🍜" : "🍕") : "😀"}
                    aria-label={`อีโมจิตัวเลือก ${i + 1}`}
                    className={`${input} w-14 shrink-0 text-center`}
                  />
                  <input
                    value={o.label}
                    onChange={(e) => setOpt(i, { label: e.target.value })}
                    maxLength={120}
                    placeholder={kind === "battle" ? (i ? "ฝั่ง B" : "ฝั่ง A") : `ตัวเลือก ${i + 1}`}
                    className={input}
                  />
                  {kind !== "battle" && options.length > 2 && (
                    <button type="button" onClick={() => setOptions((x) => x.filter((_, j) => j !== i))} className="shrink-0 rounded-xl px-3 text-mute" aria-label="ลบตัวเลือก">
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {kind !== "battle" && options.length < 20 && (
              <button type="button" onClick={() => setOptions((x) => [...x, { label: "", emoji: "" }])} className="mt-2 text-sm font-bold text-accent">
                + เพิ่มตัวเลือก
              </button>
            )}
            {kind === "multiple" && (
              <label className="mt-3 flex items-center justify-between text-sm font-semibold">
                เลือกได้สูงสุด
                <select value={maxChoices} onChange={(e) => setMaxChoices(Number(e.target.value))} className={`${input} w-24`}>
                  {Array.from({ length: Math.max(2, options.length) - 1 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      {n} ข้อ
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Card>
        )}

        <Card title="ใครโหวตได้">
          {(groups.data?.length ?? 0) > 0 && (
            <label className="mb-3 block text-sm font-semibold">
              กลุ่ม LINE
              <select
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value);
                  if (!e.target.value && audience === "group") setAudience("link");
                  if (e.target.value) setAudience("group");
                }}
                className={`${input} mt-1`}
              >
                <option value="">ไม่ผูกกับกลุ่ม</option>
                {groups.data!.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name ?? "กลุ่ม LINE"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Radio
            value={audience}
            onChange={setAudience}
            items={[
              ["group", "เฉพาะสมาชิกกลุ่ม", groupId ? "ตรวจสอบสมาชิกกับ LINE ก่อนโหวต" : "ต้องเลือกกลุ่ม LINE ก่อน", !groupId],
              ["link", "ทุกคนที่มีลิงก์", "แชร์ลิงก์ไปแชตไหนก็ได้"],
              ["public", "สาธารณะ", "แสดงในหน้าโหวตสาธารณะด้วย"],
            ]}
          />
          {!groups.data?.length && (
            <p className="mt-2 text-[11px] text-mute">ถ้าต้องการโหวตเฉพาะกลุ่ม ให้เปิดแอปจากเมนูที่บอทส่งในกลุ่ม LINE (พิมพ์ "โหวต" ในกลุ่ม)</p>
          )}
        </Card>

        <Card title="เวลาปิดโหวต">
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map(([label, m]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setDuration(m);
                  setCustomClose("");
                }}
                aria-pressed={!customClose && duration === m}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${!customClose && duration === m ? "bg-accent text-white" : "bg-canvas text-mute"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="mt-3 block text-sm font-semibold">
            หรือกำหนดเอง
            <input type="datetime-local" value={customClose} onChange={(e) => setCustomClose(e.target.value)} className={`${input} mt-1`} />
          </label>
        </Card>

        <Card title="การตั้งค่า">
          <Toggle checked={anonymous} onChange={setAnonymous} title="ไม่ระบุตัวตน" desc="ไม่แสดงว่าใครเลือกอะไร" />
          <Toggle checked={allowChange} onChange={setAllowChange} title="เปลี่ยนคำตอบได้" desc="แก้หรือถอนโหวตได้จนกว่าจะปิด" />
          <label className="mt-2 block text-sm font-semibold">
            แสดงผลโหวต
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} className={`${input} mt-1`}>
              <option value="live">แสดงผลตลอดเวลา</option>
              <option value="after_vote">แสดงหลังจากโหวตแล้ว</option>
              <option value="after_close">แสดงเมื่อปิดโหวตเท่านั้น</option>
            </select>
          </label>
          {groupId && (
            <>
              <Toggle
                checked={announce}
                onChange={setAnnounce}
                title="ให้บอทประกาศในกลุ่ม"
                desc={config.bot ? "ส่งการ์ดโหวตตอนสร้าง และส่งผลเมื่อปิด" : "ยังไม่ได้ตั้งค่าบอท (จะไม่ส่งจริง)"}
              />
              {announce && hasClose && (
                <label className="mt-2 block text-sm font-semibold">
                  เตือนก่อนปิด
                  <select value={remind ?? ""} onChange={(e) => setRemind(e.target.value ? Number(e.target.value) : null)} className={`${input} mt-1`}>
                    <option value="">ไม่เตือน</option>
                    <option value="15">15 นาที</option>
                    <option value="60">1 ชั่วโมง</option>
                    <option value="180">3 ชั่วโมง</option>
                    <option value="1440">1 วัน</option>
                  </select>
                </label>
              )}
            </>
          )}
        </Card>

        {error && <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300">{error}</p>}

        <button onClick={submit} disabled={busy || !title.trim()} className="btn-primary w-full rounded-2xl py-3.5 text-base font-extrabold disabled:opacity-50">
          {busy ? "กำลังสร้าง…" : "สร้างโหวต"}
        </button>
      </div>
    </div>
  );
}

const input = "w-full min-w-0 rounded-xl border border-line bg-canvas px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-2.5 text-sm font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, title, desc }: { checked: boolean; onChange: (v: boolean) => void; title: string; desc: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-2">
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-[11px] text-mute">{desc}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-track transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

function Radio<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string, string, boolean?][] }) {
  return (
    <div className="space-y-2">
      {items.map(([v, title, desc, disabled]) => (
        <label
          key={v}
          className={`flex items-center gap-3 rounded-2xl border p-3 ${value === v ? "border-accent bg-accent-soft" : "border-line"} ${disabled ? "opacity-45" : "cursor-pointer"}`}
        >
          <input type="radio" checked={value === v} disabled={disabled} onChange={() => onChange(v)} className="accent-[var(--accent)]" />
          <span>
            <span className="block text-sm font-bold">{title}</span>
            <span className="block text-[11px] text-mute">{desc}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
