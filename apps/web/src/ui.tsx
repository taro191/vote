import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Kind, PollListItem } from "./api";

/* --------------------------------- router --------------------------------- */

export type Route =
  | { name: "home" }
  | { name: "battles" }
  | { name: "public" }
  | { name: "profile" }
  | { name: "create"; groupId?: string }
  | { name: "poll"; id: string }
  | { name: "group"; id: string }
  | { name: "life" }
  | { name: "stage"; id: string };

type Nav = { route: Route; go: (r: Route) => void; back: () => void };
export const NavCtx = createContext<Nav>(null as unknown as Nav);
export const useNav = () => useContext(NavCtx);

/* ---------------------------------- toast --------------------------------- */

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && (
        <div role="status" className="fixed left-1/2 bottom-24 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-canvas shadow-lg max-w-[90vw] text-center">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* --------------------------------- helpers -------------------------------- */

export const KIND_LABEL: Record<Kind, string> = {
  single: "เลือก 1 ข้อ",
  multiple: "เลือกหลายข้อ",
  battle: "Battle",
  rating: "ให้คะแนน",
  yesno: "ใช่ / ไม่ใช่",
};

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function timeLeft(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "ปิดแล้ว";
  const m = Math.round(ms / 60000);
  if (m < 60) return `เหลือ ${m} นาที`;
  const h = Math.round(m / 60);
  if (h < 48) return `เหลือ ${h} ชม.`;
  return `เหลือ ${Math.round(h / 24)} วัน`;
}

/** โหลดข้อมูลแบบง่าย พร้อม reload */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setData(await fn());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

/* ------------------------------- components ------------------------------- */

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  const style = { width: size, height: size };
  return src ? (
    <img src={src} alt="" style={style} className="rounded-full object-cover shrink-0 ring-2 ring-surface" />
  ) : (
    <span style={style} className="grid place-items-center rounded-full bg-accent-soft text-accent font-bold shrink-0 ring-2 ring-surface" aria-hidden>
      <span style={{ fontSize: size * 0.42 }}>{name.slice(0, 1)}</span>
    </span>
  );
}

export function Spinner({ label = "กำลังโหลด…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-mute" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card p-5 text-center text-sm">
      <p className="text-ink font-semibold">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-xl bg-accent-soft px-4 py-2 font-bold text-accent">
          ลองใหม่
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-line px-5 py-8 text-center text-sm text-mute">{children}</div>;
}

export function Chip({ children, tone = "soft" }: { children: ReactNode; tone?: "soft" | "green" | "gray" }) {
  const cls =
    tone === "green" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : tone === "gray" ? "bg-track text-mute" : "bg-accent-soft text-accent";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${cls}`}>{children}</span>;
}

export function Bar({ pct, color = "var(--accent)", h = 8 }: { pct: number; color?: string; h?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-track" style={{ height: h }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[15px] font-extrabold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const BATTLE_A = "#1F6BFF";
export const BATTLE_B = "#0A8579";

/** การ์ดโหวตในรายการ */
export function PollCard({ p }: { p: PollListItem }) {
  const { go } = useNav();
  const total = p.options.reduce((s, o) => s + (o.votes ?? 0), 0);
  const shown = p.options.some((o) => o.votes !== null);
  const left = timeLeft(p.closesAt);

  return (
    <button onClick={() => go({ name: "poll", id: p.id })} className="card w-full p-4 text-left transition hover:-translate-y-0.5 active:translate-y-0">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Chip>{KIND_LABEL[p.kind]}</Chip>
        {p.isOpen ? <Chip tone="green">● เปิดอยู่</Chip> : <Chip tone="gray">ปิดแล้ว</Chip>}
        {p.hasVoted && <Chip tone="gray">✓ โหวตแล้ว</Chip>}
        {p.groupName && <span className="truncate text-[11px] font-semibold text-mute">· {p.groupName}</span>}
      </div>
      <h3 className="font-extrabold leading-snug">{p.title}</h3>

      {p.kind === "battle" && p.options.length === 2 ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm font-bold">
            <span>
              {p.options[0].emoji} {p.options[0].label}
            </span>
            <span className="text-xs text-mute">VS</span>
            <span>
              {p.options[1].label} {p.options[1].emoji}
            </span>
          </div>
          {shown && total > 0 && (
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-track">
              <div style={{ width: `${((p.options[0].votes ?? 0) / total) * 100}%`, background: BATTLE_A }} />
              <div style={{ width: `${((p.options[1].votes ?? 0) / total) * 100}%`, background: BATTLE_B }} />
            </div>
          )}
        </div>
      ) : (
        shown &&
        total > 0 &&
        p.kind !== "rating" && (
          <div className="mt-3 space-y-1.5">
            {[...p.options]
              .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
              .slice(0, 3)
              .map((o) => (
                <div key={o.id} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-xs">
                  <span className="truncate font-semibold">
                    {o.emoji} {o.label}
                  </span>
                  <span className="text-mute">{Math.round(((o.votes ?? 0) / total) * 100)}%</span>
                  <div className="col-span-2">
                    <Bar pct={((o.votes ?? 0) / total) * 100} h={5} />
                  </div>
                </div>
              ))}
          </div>
        )
      )}

      <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-mute">
        <Avatar name={p.creator.name} src={p.creator.pictureUrl} size={18} />
        <span className="truncate">{p.creator.name}</span>
        <span>· {p.voterCount} คนโหวต</span>
        {p.isOpen && left && <span className="ml-auto shrink-0">{left}</span>}
      </div>
    </button>
  );
}

export function PollList({ items, empty }: { items: PollListItem[]; empty: ReactNode }) {
  if (!items.length) return <Empty>{empty}</Empty>;
  return (
    <div className="space-y-3">
      {items.map((p) => (
        <PollCard key={p.id} p={p} />
      ))}
    </div>
  );
}

/** หัวหน้าจอย่อย (มีปุ่มกลับ) */
export function SubHeader({ title, right }: { title: string; right?: ReactNode }) {
  const { back } = useNav();
  return (
    <header className="sticky top-0 z-30 -mx-4 mb-3 flex items-center gap-2 border-b border-line bg-canvas/90 px-3 py-2.5 backdrop-blur-md">
      <button onClick={back} className="rounded-full bg-accent-soft px-3.5 py-1.5 text-sm font-bold text-accent" aria-label="กลับ">
        ‹ กลับ
      </button>
      <h1 className="min-w-0 flex-1 truncate text-base font-extrabold">{title}</h1>
      {right}
    </header>
  );
}

/* ------------------------------- bottom nav ------------------------------- */

const icons = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  battles: "M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 14 2h3v3l-4.5 4.5M5 14l-2 2 4 4 2-2",
  public: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0",
};

export function BottomNav() {
  const { route, go } = useNav();
  const item = (name: "home" | "battles" | "public" | "profile", label: string) => {
    const active = route.name === name;
    return (
      <button
        onClick={() => go({ name })}
        aria-current={active ? "page" : undefined}
        className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${active ? "text-accent" : "text-mute"}`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={icons[name]} />
        </svg>
        {label}
      </button>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-md" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto flex max-w-xl items-end px-2">
        {item("home", "หน้าแรก")}
        {item("battles", "Battle")}
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => go({ name: "create" })}
            className="btn-primary -mt-5 grid h-14 w-14 place-items-center rounded-full text-3xl font-light shadow-[0_8px_20px_rgb(31_107_255/35%)]"
            aria-label="สร้างโหวต"
          >
            +
          </button>
        </div>
        {item("public", "สาธารณะ")}
        {item("profile", "โปรไฟล์")}
      </div>
    </nav>
  );
}

/** การ์ดทางเข้า Vote my life (ตามงานออกแบบ: ต่อจากการ์ดโปรไฟล์) */
export function LifeEntry() {
  const { go } = useNav();
  return (
    <button
      onClick={() => go({ name: "life" })}
      aria-label="เปิด Vote my life เพื่อให้คะแนนชีวิตประจำวัน"
      className="relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-3xl border border-accent-border bg-surface p-4 text-left shadow-[0_8px_28px_rgb(20_80_200/12%)] transition hover:-translate-y-0.5 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-linear-to-b before:from-accent before:to-accent-2"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-accent-border bg-accent-soft text-accent" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2v3M16 2v3M3.5 9h17" />
          <rect x="3.5" y="4" width="17" height="17" rx="3" />
          <path d="m8 15 2.2 2.2L16.5 11" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-extrabold">
          Vote my life <span className="btn-primary rounded-full px-2 py-0.5 text-[10px] font-bold">ใหม่</span>
        </span>
        <span className="mt-0.5 block text-xs text-mute">36,500 วัน · ให้คะแนนชีวิตทุกวัน ดูว่าใช้ไปเท่าไร เหลือเท่าไร</span>
      </span>
      <span className="btn-primary grid h-9 w-9 place-items-center rounded-full" aria-hidden>
        ›
      </span>
    </button>
  );
}
