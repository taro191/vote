import { useEffect, useMemo, useRef, useState } from "react";
import { api, type LifeOverview, type LifeVotes } from "../api";
import { ErrorBox, Spinner, SubHeader, useLoad, useToast } from "../ui";
import { Tabs } from "./Battles";

/* ตาม design/public/vote.html (Vote my life) — 1 วัน 1 คะแนน ตารางชีวิต target × 365 ช่อง */

const LEVELS = [
  null,
  { t: "แย่มาก", c: "#E5484D", e: "😭" },
  { t: "แย่", c: "#F76B15", e: "🙁" },
  { t: "พอใช้", c: "#F5B800", e: "😐" },
  { t: "ดี", c: "#46B97A", e: "🙂" },
  { t: "ดีมาก", c: "#0F9D6B", e: "😄" },
] as const;
const lv = (s: number) => LEVELS[s]!;

const DAY = 864e5;
const utc = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const thDate = (ms: number) => new Date(ms).toLocaleDateString("th-TH", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

export default function Life() {
  const toast = useToast();
  const ov = useLoad(() => api.life.overview());
  const [active, setActive] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const profiles = ov.data?.profiles ?? [];
  const current = profiles.find((p) => p.id === active) ?? profiles[0];

  if (ov.loading) return <Spinner />;
  if (ov.error || !ov.data)
    return (
      <div>
        <SubHeader title="Vote my life" />
        <ErrorBox message={ov.error ?? "โหลดไม่สำเร็จ"} onRetry={ov.reload} />
      </div>
    );

  const created = (id: string) => {
    setAdding(false);
    setActive(id);
    ov.reload();
  };

  return (
    <div>
      <SubHeader title="Vote my life" />
      {!profiles.length || adding ? (
        <div className="space-y-3">
          {!profiles.length && (
            <div className="px-1">
              <h1 className="text-2xl font-extrabold">Vote my life</h1>
              <p className="text-sm text-mute">36,500 วัน หนึ่งวันหนึ่งคะแนน กรอกวันเกิดเพื่อดูว่าใช้ไปเท่าไรและเหลือเท่าไร</p>
            </div>
          )}
          <ProfileForm
            title={profiles.length ? "เพิ่มสมาชิก" : "สร้างตารางชีวิต"}
            submitLabel="สร้าง"
            today={ov.data.today}
            onSubmit={async (v) => created((await api.life.create(v)).id)}
            onCancel={profiles.length ? () => setAdding(false) : undefined}
          />
        </div>
      ) : (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 pt-1">
            {profiles.map((p) => {
              const on = p.id === current!.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setActive(p.id)}
                  aria-pressed={on}
                  className={`flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3.5 text-sm font-semibold shadow-sm ${on ? "bg-accent text-white" : "bg-surface"}`}
                >
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${on ? "bg-white text-[#1F6BFF]" : "bg-accent-soft text-accent"}`}
                    style={{ boxShadow: `0 0 0 2.5px ${p.todayScore ? lv(p.todayScore).c : "var(--accent-border)"}` }}
                  >
                    {p.name.slice(0, 1)}
                  </span>
                  {p.name}
                </button>
              );
            })}
            {profiles.length < ov.data.max && (
              <button onClick={() => setAdding(true)} className="shrink-0 rounded-full bg-surface px-3.5 py-1 text-sm font-semibold text-mute shadow-sm">
                + เพิ่มสมาชิก ({profiles.length}/{ov.data.max})
              </button>
            )}
          </div>
          <ProfileView key={current!.id} overview={ov.data} id={current!.id} onChanged={ov.reload} onDeleted={() => (setActive(null), ov.reload(), toast("ลบโปรไฟล์แล้ว"))} />
        </>
      )}
    </div>
  );
}

function ProfileView({ overview, id, onChanged, onDeleted }: { overview: LifeOverview; id: string; onChanged: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => api.life.votes(id), [id]);
  const [sel, setSel] = useState<number | null>(null);
  const [range, setRange] = useState<"30" | "90" | "365">("30");

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorBox message={error ?? "โหลดไม่สำเร็จ"} onRetry={reload} />;

  const p = data.profile;
  const T = p.target * 365;
  const b = utc(p.birth);
  const ti = Math.round((utc(data.today) - b) / DAY);
  const s = sel ?? Math.max(0, Math.min(ti, T - 1));
  const used = Math.max(0, Math.min(ti + 1, T));
  const left = T - used;
  const pct = ((used / T) * 100).toFixed(1);
  const dayKey = keyOf(b + s * DAY);
  const cur = data.votes[dayKey];
  const yr = Math.floor(s / 365);

  const mutate = (fn: (v: LifeVotes["votes"]) => void) => {
    const votes = { ...data.votes };
    fn(votes);
    setData({ ...data, votes });
  };

  const vote = async (score: number, note: string) => {
    const prev = data.votes;
    mutate((v) => (v[dayKey] = [score, note || null]));
    try {
      await api.life.vote(p.id, dayKey, score, note);
      if (s === ti) onChanged();
    } catch (e) {
      setData({ ...data, votes: prev });
      toast((e as Error).message);
    }
  };

  const clear = async () => {
    const prev = data.votes;
    mutate((v) => delete v[dayKey]);
    try {
      await api.life.clear(p.id, dayKey);
      if (s === ti) onChanged();
    } catch (e) {
      setData({ ...data, votes: prev });
      toast((e as Error).message);
    }
  };

  const R = 54;
  const C = 2 * Math.PI * R;

  return (
    <div className="space-y-3.5">
      {/* hero */}
      <div className="card flex flex-wrap items-center gap-5 p-5">
        <div className="relative h-34 w-34 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`ใช้ไป ${pct} เปอร์เซ็นต์`}>
            <circle cx="60" cy="60" r={R} fill="none" strokeWidth="11" stroke="var(--track)" />
            <circle cx="60" cy="60" r={R} fill="none" strokeWidth="11" stroke="var(--accent)" strokeLinecap="round" strokeDasharray={`${(C * used) / T} ${C}`} />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <b className="text-2xl leading-tight">{pct}%</b>
            <span className="text-xs text-mute">ใช้ไปแล้ว</span>
          </div>
        </div>
        <div className="min-w-44 flex-1">
          <p className="text-sm text-mute">{p.name}</p>
          <p className="text-5xl font-extrabold tracking-tight">{left.toLocaleString()}</p>
          <p className="text-sm text-mute">วันที่เหลือ จากเป้าหมาย {p.target} ปี</p>
          <div className="mt-2.5 flex flex-wrap gap-2 text-xs font-semibold text-mute">
            <span className="rounded-full bg-canvas px-3 py-1">ผ่านไป {used.toLocaleString()} วัน</span>
            <span className="rounded-full bg-canvas px-3 py-1">รวม {T.toLocaleString()} วัน</span>
          </div>
        </div>
      </div>

      {/* vote */}
      <div className="card p-5">
        <h2 className="mb-3 font-bold">
          Vote วันที่ {thDate(b + s * DAY)}
          {s === ti && " (วันนี้)"}
        </h2>
        {s > ti ? (
          <p className="text-sm text-mute">วันนี้ยังมาไม่ถึง เลือกวันที่ผ่านมาแล้วเพื่อ vote</p>
        ) : (
          <VoteBox key={dayKey} cur={cur} onVote={vote} onClear={clear} />
        )}
      </div>

      {/* life grid */}
      <div className="card p-5">
        <h2 className="font-bold">ตารางชีวิต {T.toLocaleString()} ช่อง</h2>
        <p className="mb-3 text-sm text-mute">1 แถว = 1 ปีของอายุ (แถวบนสุดคืออายุ 0) แตะแถวเพื่อดูปีนั้น</p>
        <LifeCanvas T={T} ti={ti} sel={s} birth={b} votes={data.votes} target={p.target} onPick={setSel} />
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-mute">
          {[5, 4, 3, 2, 1].map((v) => (
            <span key={v} className="flex items-center gap-1.5">
              <i className="inline-block h-3 w-3 rounded" style={{ background: lv(v).c }} />
              {lv(v).t}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded bg-accent-border" />
            ยังไม่ได้ vote
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block h-3 w-3 rounded bg-track" />
            อนาคต
          </span>
        </div>
      </div>

      {/* year */}
      <div className="card p-5">
        <h2 className="mb-3 font-bold">
          อายุ {yr} ปี · {Math.min(365, T - yr * 365)} วัน
        </h2>
        <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1 sm:grid-cols-[repeat(19,minmax(0,1fr))]">
          {Array.from({ length: Math.min(365, T - yr * 365) }, (_, k) => {
            const i = yr * 365 + k;
            const v = data.votes[keyOf(b + i * DAY)];
            return (
              <button
                key={i}
                onClick={() => setSel(i)}
                aria-label={thDate(b + i * DAY)}
                aria-pressed={i === s}
                className={`aspect-square rounded-[5px] ${i > ti ? "bg-track" : "bg-accent-border"} ${i === ti ? "ring-2 ring-ink" : ""} ${i === s ? "outline-3 outline-offset-1 outline-accent" : ""}`}
                style={v ? { background: lv(v[0]).c } : undefined}
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button disabled={yr === 0} onClick={() => setSel(Math.max(0, s - 365))} className={ghost}>
            ปีก่อนหน้า
          </button>
          <button disabled={(yr + 1) * 365 >= T} onClick={() => setSel(Math.min(T - 1, s + 365))} className={ghost}>
            ปีถัดไป
          </button>
          <button onClick={() => setSel(Math.min(ti, T - 1))} className={ghost}>
            กลับมาวันนี้
          </button>
        </div>
      </div>

      <Summary votes={data.votes} birth={b} ti={ti} range={Number(range)} tabs={<Tabs value={range} onChange={setRange} items={[["30", "1 เดือน"], ["90", "3 เดือน"], ["365", "1 ปี"]]} />} />

      <Settings overview={overview} profile={p} votes={data.votes} onChanged={() => (reload(), onChanged())} onDeleted={onDeleted} />
    </div>
  );
}

const ghost = "rounded-xl bg-accent-soft px-4 py-2 text-sm font-bold text-ink disabled:opacity-45";

function VoteBox({ cur, onVote, onClear }: { cur?: [number, string | null]; onVote: (s: number, note: string) => void; onClear: () => void }) {
  const [note, setNote] = useState(cur?.[1] ?? "");
  return (
    <>
      <div className="grid grid-cols-5 gap-2">
        {[5, 4, 3, 2, 1].map((v) => {
          const on = cur?.[0] === v;
          const l = lv(v);
          return (
            <button
              key={v}
              onClick={() => onVote(v, note)}
              aria-pressed={on}
              className="flex min-h-21 flex-col items-center gap-1 rounded-2xl px-0.5 py-3 text-[12px] font-bold transition active:scale-95"
              style={{ background: on ? l.c : `color-mix(in srgb, ${l.c} 15%, var(--surface))`, color: on ? (v === 3 ? "#3a2d00" : "#fff") : "var(--ink)" }}
            >
              <span className="text-[1.8rem] leading-none">{l.e}</span>
              {l.t}
            </button>
          );
        })}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => cur && note !== (cur[1] ?? "") && onVote(cur[0], note)}
        maxLength={500}
        rows={2}
        placeholder="โน้ตสั้นๆ ของวันนี้ (ไม่บังคับ)"
        className="mt-3 w-full resize-y rounded-xl border border-transparent bg-canvas px-3 py-2.5 outline-none focus:border-accent"
      />
      {cur && (
        <button onClick={onClear} className={`${ghost} mt-2`}>
          ล้าง vote ของวันนี้
        </button>
      )}
    </>
  );
}

function LifeCanvas(props: { T: number; ti: number; sel: number; birth: number; target: number; votes: LifeVotes["votes"]; onPick: (i: number) => void }) {
  const { T, ti, sel, birth, target, votes, onPick } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const cell = 4;
  useEffect(() => {
    const cv = ref.current!;
    cv.width = 365 * cell;
    cv.height = target * cell;
    const g = cv.getContext("2d")!;
    const cs = getComputedStyle(document.documentElement);
    const past = cs.getPropertyValue("--accent-border").trim();
    const fut = cs.getPropertyValue("--track").trim();
    const ink = cs.getPropertyValue("--ink").trim();
    const acc = cs.getPropertyValue("--accent").trim();
    for (let i = 0; i < T; i++) {
      const v = votes[keyOf(birth + i * DAY)];
      g.fillStyle = v ? lv(v[0]).c : i > ti ? fut : past;
      g.fillRect((i % 365) * cell, Math.floor(i / 365) * cell, cell - 1, cell - 1);
    }
    if (ti >= 0 && ti < T) {
      g.strokeStyle = ink;
      g.lineWidth = 1.5;
      g.strokeRect((ti % 365) * cell - 0.5, Math.floor(ti / 365) * cell - 0.5, cell + 1, cell + 1);
    }
    g.strokeStyle = acc;
    g.lineWidth = 2;
    g.strokeRect(1, Math.floor(sel / 365) * cell, 365 * cell - 2, cell - 1);
  }, [T, ti, sel, birth, target, votes]);

  return (
    <div className="max-w-full overflow-x-auto rounded-xl">
      <canvas
        ref={ref}
        aria-label="ตารางชีวิตทั้งหมด"
        className="block w-full min-w-[365px] cursor-pointer"
        onClick={(e) => {
          const cv = ref.current!;
          const r = cv.getBoundingClientRect();
          const x = ((e.clientX - r.left) * cv.width) / r.width;
          const y = ((e.clientY - r.top) * cv.height) / r.height;
          onPick(Math.min(Math.floor(y / cell) * 365 + Math.min(364, Math.floor(x / cell)), T - 1));
        }}
      />
    </div>
  );
}

function Summary({ votes, birth, ti, range: n, tabs }: { votes: LifeVotes["votes"]; birth: number; ti: number; range: number; tabs: React.ReactNode }) {
  const st = useMemo(() => {
    const at = (i: number) => (i >= 0 ? votes[keyOf(birth + i * DAY)] : undefined);
    const vs: number[] = [];
    const pv: number[] = [];
    const cnt = [0, 0, 0, 0, 0, 0];
    type Day = { i: number; v: number; n: string | null };
    let best: Day | null = null;
    let worst: Day | null = null;
    for (let i = ti - n + 1; i <= ti; i++) {
      const v = at(i);
      if (!v) continue;
      vs.push(v[0]);
      cnt[v[0]]++;
      if (!best || v[0] > best.v) best = { i, v: v[0], n: v[1] };
      if (!worst || v[0] < worst.v) worst = { i, v: v[0], n: v[1] };
    }
    for (let i = ti - 2 * n + 1; i <= ti - n; i++) {
      const v = at(i);
      if (v) pv.push(v[0]);
    }
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    let streak = 0;
    for (let i = ti; i >= 0; i--) {
      const v = at(i);
      if (v && v[0] >= 4) streak++;
      else if (i === ti && !v) continue;
      else break;
    }
    const A = avg(vs);
    const B = avg(pv);
    return { vs, cnt, best, worst, A, delta: A !== null && B !== null ? A - B : null, streak };
  }, [votes, birth, ti, n]);

  return (
    <div className="card p-5">
      <h2 className="mb-3 font-bold">สรุป {n} วันล่าสุด</h2>
      <div className="mb-4">{tabs}</div>
      {st.vs.length ? (
        <>
          <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
            <Stat main={`${st.A!.toFixed(2)} / 5`} sub={`คะแนนเฉลี่ย (${st.vs.length} วันที่ vote)`} hi />
            <Stat main={st.delta === null ? "–" : `${st.delta >= 0 ? "▲" : "▼"} ${Math.abs(st.delta).toFixed(2)}`} sub="เทียบช่วงก่อนหน้า" />
            <Stat main={`${st.streak} วัน`} sub="วันดี/ดีมากติดต่อกัน" />
            <Stat main={lv(st.best!.v).t} sub={`ดีที่สุด: ${thDate(birth + st.best!.i * DAY)}${st.best!.n ? " · " + st.best!.n : ""}`} />
            <Stat main={lv(st.worst!.v).t} sub={`แย่ที่สุด: ${thDate(birth + st.worst!.i * DAY)}${st.worst!.n ? " · " + st.worst!.n : ""}`} />
          </div>
          <div className="grid grid-cols-[64px_1fr_40px] items-center gap-x-3 gap-y-2.5 text-sm">
            {[5, 4, 3, 2, 1].map((k) => {
              const q = (st.cnt[k] / st.vs.length) * 100;
              return (
                <div key={k} className="contents">
                  <span>{lv(k).t}</span>
                  <div className="h-2.5 overflow-hidden rounded-md bg-track">
                    <div className="h-full rounded-md" style={{ width: `${q}%`, background: lv(k).c }} />
                  </div>
                  <span className="text-right">{q.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-mute">ยังไม่มีการ vote ในช่วงนี้ เริ่มจาก vote วันนี้ด้านบน</p>
      )}
    </div>
  );
}

function Stat({ main, sub, hi }: { main: string; sub: string; hi?: boolean }) {
  return (
    <div className={`rounded-2xl p-3.5 ${hi ? "bg-accent-soft" : "bg-canvas"}`}>
      <b className={`block text-[1.4rem] tracking-tight ${hi ? "text-accent" : ""}`}>{main}</b>
      <span className="text-xs text-mute">{sub}</span>
    </div>
  );
}

function Settings({
  overview,
  profile,
  votes,
  onChanged,
  onDeleted,
}: {
  overview: LifeOverview;
  profile: LifeVotes["profile"];
  votes: LifeVotes["votes"];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [remindOn, setRemindOn] = useState(overview.remind.on);
  const [time, setTime] = useState(overview.remind.time);
  const [confirmDel, setConfirmDel] = useState(false);

  const saveRemind = async (on: boolean, t: string) => {
    setRemindOn(on);
    setTime(t);
    try {
      await api.life.remind(on, t);
      toast(on ? `จะเตือนทุกวันเวลา ${t}` : "ปิดการแจ้งเตือนแล้ว");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const exportCsv = () => {
    const rows = ["date,score,level,note"];
    for (const k of Object.keys(votes).sort()) {
      const [s, n] = votes[k];
      rows.push(`${k},${s},${lv(s).t},"${(n ?? "").replace(/"/g, '""')}"`);
    }
    const url = URL.createObjectURL(new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `vote-my-life-${profile.name}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <details className="card p-5">
      <summary className="cursor-pointer font-bold">สมาชิก การแจ้งเตือน และตั้งค่า</summary>
      <div className="mt-3 space-y-4">
        <ProfileForm
          title="ตั้งค่าโปรไฟล์"
          submitLabel="บันทึก"
          today={overview.today}
          initial={profile}
          onSubmit={async (v) => {
            await api.life.update(profile.id, v);
            toast("บันทึกแล้ว");
            onChanged();
          }}
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-mute">
            แจ้งเตือนทุกวัน
            <select value={remindOn ? "on" : "off"} onChange={(e) => saveRemind(e.target.value === "on", time)} className={field}>
              <option value="off">ปิด</option>
              <option value="on">เปิด</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-mute">
            เวลา
            <input type="time" value={time} onChange={(e) => e.target.value && saveRemind(remindOn, e.target.value)} className={field} />
          </label>
        </div>
        <p className="text-xs text-mute">
          บอท LINE จะส่งข้อความเตือนตามเวลาที่ตั้ง (เวลาไทย) และข้ามถ้าทุกโปรไฟล์ vote วันนี้แล้ว ต้องเพิ่มบอท VOTE เป็นเพื่อนก่อน
          {!overview.bot && " · ตอนนี้ยังไม่ได้ตั้งค่าบอท จึงยังไม่ส่งจริง"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCsv} className={ghost}>
            ส่งออก CSV
          </button>
          {confirmDel ? (
            <>
              <button
                onClick={async () => {
                  await api.life.remove(profile.id);
                  onDeleted();
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"
              >
                ยืนยันลบ {profile.name}
              </button>
              <button onClick={() => setConfirmDel(false)} className={ghost}>
                ยกเลิก
              </button>
            </>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="rounded-xl px-4 py-2 text-sm font-bold text-red-600">
              ลบสมาชิกนี้และข้อมูลทั้งหมด
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

const field = "rounded-xl border border-transparent bg-canvas px-3 py-2.5 text-[15px] font-normal text-ink outline-none focus:border-accent";

function ProfileForm(props: {
  title: string;
  submitLabel: string;
  today: string;
  initial?: { name: string; birth: string; target: number };
  onSubmit: (v: { name: string; birth: string; target: number }) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(props.initial?.name ?? "");
  const [birth, setBirth] = useState(props.initial?.birth ?? "");
  const [target, setTarget] = useState(String(props.initial?.target ?? 100));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const t = Number(target);
    if (!name.trim() || !birth || !(t >= 30 && t <= 120)) {
      setErr("กรอกชื่อ วันเกิด และเป้าหมายอายุ (30–120 ปี) ให้ครบ");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await props.onSubmit({ name: name.trim(), birth, target: t });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="mb-3 font-bold">{props.title}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-32 flex-1 flex-col gap-1.5 text-xs font-semibold text-mute">
          ชื่อ
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-mute">
          วันเกิด
          <input type="date" value={birth} max={props.today} onChange={(e) => setBirth(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-mute">
          เป้าหมายอายุ (ปี)
          <input type="number" min={30} max={120} value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} w-24`} />
        </label>
        <button onClick={submit} disabled={busy} className="btn-primary rounded-xl px-5 py-2.5 font-bold disabled:opacity-50">
          {props.submitLabel}
        </button>
        {props.onCancel && (
          <button onClick={props.onCancel} className={ghost}>
            ยกเลิก
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-sm font-semibold text-red-600">{err}</p>}
    </div>
  );
}
