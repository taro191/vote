import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, type Poll } from "../api";
import { BATTLE_A, BATTLE_B, ErrorBox, KIND_LABEL, Spinner, timeLeft, useLoad, useNav } from "../ui";

const PALETTE = ["#1F6BFF", "#0A8579", "#4F5FE0", "#0B76B8", "#F76B15", "#E5484D", "#46B97A", "#F5B800"];
const RATING_COLORS = ["#E5484D", "#F76B15", "#F5B800", "#46B97A", "#0F9D6B"];

/** Stage Display Mode: แสดงผลโหวตสดบนจอใหญ่/จอ LED พร้อม QR ให้คนในงานสแกนโหวต */
export default function Stage({ id }: { id: string }) {
  const { back } = useNav();
  const { data: poll, error, loading, reload, setData } = useLoad(() => api.poll(id), [id]);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (poll) QRCode.toDataURL(poll.shareUrl, { margin: 1, width: 360, color: { dark: "#0F1F3D", light: "#FFFFFF" } }).then(setQr);
  }, [poll?.shareUrl]);

  // อัปเดตสดทุก 3 วินาที
  useEffect(() => {
    const t = setInterval(() => api.poll(id).then(setData).catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [id, setData]);

  if (loading) return <Spinner />;
  if (error || !poll) return <ErrorBox message={error ?? "ไม่พบโหวต"} onRetry={reload} />;

  const full = () => document.documentElement.requestFullscreen?.().catch(() => {});

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-[#081426] text-[#EAF3FF]">
      <div className="mx-auto flex min-h-full max-w-[1400px] flex-col gap-[3vh] p-[3vw]">
        <header className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[clamp(12px,1.4vw,22px)] font-bold tracking-wider text-[#6FB1FF]">
              VOTE · {KIND_LABEL[poll.kind].toUpperCase()} · {poll.isOpen ? `LIVE${poll.closesAt ? " · " + timeLeft(poll.closesAt) : ""}` : "ปิดโหวตแล้ว"}
            </p>
            <h1 className="mt-1 text-[clamp(24px,4vw,64px)] font-extrabold leading-tight">{poll.title}</h1>
          </div>
          <div className="flex shrink-0 gap-2 text-sm font-bold">
            <button onClick={full} className="rounded-full bg-white/10 px-4 py-2">
              เต็มจอ
            </button>
            <button onClick={back} className="rounded-full bg-white/10 px-4 py-2">
              ออก
            </button>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-[3vw] lg:grid-cols-[1fr_auto]">
          <Results poll={poll} />
          {poll.isOpen && qr && (
            <div className="mx-auto flex flex-col items-center gap-3 rounded-[28px] bg-white p-5 text-center text-[#0F1F3D]">
              <img src={qr} alt="QR code สำหรับโหวต" className="h-[min(28vw,320px)] w-[min(28vw,320px)]" />
              <p className="text-[clamp(14px,1.5vw,22px)] font-extrabold">สแกนเพื่อโหวต</p>
            </div>
          )}
        </div>

        <footer className="text-[clamp(14px,1.6vw,26px)] font-bold text-[#9FB8D9]">
          {poll.voterCount.toLocaleString()} คนร่วมโหวต
          {!poll.showResults && " · ผลจะแสดงเมื่อปิดโหวต"}
        </footer>
      </div>
    </div>
  );
}

function Results({ poll }: { poll: Poll }) {
  const total = poll.options.reduce((s, o) => s + (o.votes ?? 0), 0);

  if (!poll.showResults)
    return <p className="text-center text-[clamp(28px,5vw,80px)] font-extrabold text-[#6FB1FF]">🔒 ผลโหวตเป็นความลับจนกว่าจะปิด</p>;

  if (poll.kind === "battle" && poll.options.length === 2) {
    const [a, b] = poll.options;
    const pa = total ? Math.round(((a.votes ?? 0) / total) * 100) : 50;
    const lead = !total || a.votes === b.votes ? null : (a.votes ?? 0) > (b.votes ?? 0) ? a.id : b.id;
    const side = (o: typeof a, c: string, pct: number) => (
      <div className={`text-center transition ${lead && lead !== o.id ? "opacity-60" : ""}`}>
        <div className="text-[clamp(60px,10vw,180px)] leading-none">{o.emoji || "⭐"}</div>
        <div className="mt-2 text-[clamp(22px,3.4vw,56px)] font-extrabold">{o.label}</div>
        <div className="text-[clamp(36px,6vw,110px)] font-extrabold" style={{ color: c }}>
          {pct}%
        </div>
        <div className="text-[clamp(14px,1.6vw,26px)] text-[#9FB8D9]">{(o.votes ?? 0).toLocaleString()} เสียง</div>
      </div>
    );
    return (
      <div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-[2vw]">
          {side(a, "#6FB1FF", total ? pa : 0)}
          <span className="text-[clamp(20px,3vw,48px)] font-extrabold text-[#9FB8D9]">VS</span>
          {side(b, "#3FD6B8", total ? 100 - pa : 0)}
        </div>
        <div className="mt-[3vh] flex h-[clamp(14px,2vw,32px)] overflow-hidden rounded-full bg-white/10">
          <div className="transition-[width] duration-700" style={{ width: `${pa}%`, background: BATTLE_A }} />
          <div className="flex-1" style={{ background: BATTLE_B }} />
        </div>
      </div>
    );
  }

  if (poll.kind === "rating") {
    const avg = total ? poll.options.reduce((s, o, i) => s + (o.votes ?? 0) * (i + 1), 0) / total : 0;
    return (
      <div className="space-y-[2vh]">
        <p className="text-[clamp(48px,9vw,160px)] font-extrabold leading-none text-[#6FB1FF]">
          {avg.toFixed(2)}
          <span className="text-[0.4em] text-[#9FB8D9]"> / 5</span>
        </p>
        <Bars rows={[...poll.options].reverse().map((o) => ({ ...o, color: RATING_COLORS[poll.options.indexOf(o)] }))} total={total} />
      </div>
    );
  }

  const rows = [...poll.options].sort((x, y) => (y.votes ?? 0) - (x.votes ?? 0)).map((o, i) => ({ ...o, color: PALETTE[i % PALETTE.length] }));
  return <Bars rows={rows} total={total} />;
}

function Bars({ rows, total }: { rows: { id: string; label: string; emoji: string | null; votes: number | null; color: string }[]; total: number }) {
  return (
    <div className="space-y-[2.2vh]">
      {rows.slice(0, 8).map((o) => {
        const pct = total ? ((o.votes ?? 0) / total) * 100 : 0;
        return (
          <div key={o.id}>
            <div className="flex items-baseline justify-between gap-4 text-[clamp(18px,2.4vw,40px)] font-extrabold">
              <span className="truncate">
                {o.emoji} {o.label}
              </span>
              <span>
                {Math.round(pct)}% <span className="text-[0.6em] text-[#9FB8D9]">({(o.votes ?? 0).toLocaleString()})</span>
              </span>
            </div>
            <div className="mt-1.5 h-[clamp(12px,1.8vw,28px)] overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: o.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
