import { useEffect, useState } from "react";
import { api, type Poll } from "../api";
import { sharePoll } from "../liff";
import { Avatar, Bar, BATTLE_A, BATTLE_B, Chip, ErrorBox, fmtDate, KIND_LABEL, Spinner, SubHeader, timeLeft, useLoad, useNav, useToast } from "../ui";

const RATING_COLORS = ["#E5484D", "#F76B15", "#F5B800", "#46B97A", "#0F9D6B"];
const AUDIENCE: Record<Poll["audience"], string> = { group: "เฉพาะสมาชิกกลุ่ม", link: "ทุกคนที่มีลิงก์", public: "สาธารณะ" };

export default function PollPage({ id }: { id: string }) {
  const { back } = useNav();
  const toast = useToast();
  const { data: poll, error, loading, reload, setData } = useLoad(() => api.poll(id), [id]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (poll) setPicked(poll.myChoices);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll?.id, poll?.myChoices.join()]);

  // อัปเดตผลแบบสดทุก 5 วินาทีระหว่างที่โหวตยังเปิดอยู่
  useEffect(() => {
    if (!poll?.isOpen) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") api.poll(id).then(setData).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [id, poll?.isOpen, setData]);

  if (loading) return <Spinner />;
  if (error || !poll)
    return (
      <div>
        <SubHeader title="โหวต" />
        <ErrorBox message={error ?? "ไม่พบโหวต"} onRetry={reload} />
      </div>
    );

  const voted = poll.myChoices.length > 0;
  const locked = !poll.isOpen || (voted && !poll.allowChange);
  const multi = poll.kind === "multiple";
  const dirty = picked.slice().sort().join() !== poll.myChoices.slice().sort().join();

  const act = async (fn: () => Promise<Poll>, msg: string) => {
    setBusy(true);
    try {
      setData(await fn());
      toast(msg);
    } catch (e) {
      toast((e as Error).message);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (oid: string) => {
    if (locked) return;
    if (!multi) {
      // เลือกข้อเดียว: แตะแล้วส่งเลย
      if (poll.myChoices[0] === oid) return;
      setPicked([oid]);
      act(() => api.vote(poll.id, [oid]), voted ? "เปลี่ยนคำตอบแล้ว" : "โหวตแล้ว ✓");
      return;
    }
    setPicked((p) => (p.includes(oid) ? p.filter((x) => x !== oid) : p.length >= poll.maxChoices ? p : [...p, oid]));
  };

  const share = async () => {
    try {
      const r = await sharePoll(poll);
      if (r === "copied") toast("คัดลอกลิงก์แล้ว");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const total = poll.options.reduce((s, o) => s + (o.votes ?? 0), 0);
  const left = timeLeft(poll.closesAt);

  return (
    <div>
      <SubHeader
        title={KIND_LABEL[poll.kind]}
        right={
          <button onClick={share} className="rounded-full bg-accent-soft px-3.5 py-1.5 text-sm font-bold text-accent">
            แชร์
          </button>
        }
      />

      <div className="space-y-4">
        <div className="card p-5">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {poll.isOpen ? <Chip tone="green">● เปิดอยู่{left ? ` · ${left}` : ""}</Chip> : <Chip tone="gray">ปิดแล้ว</Chip>}
            <Chip tone="gray">{AUDIENCE[poll.audience]}</Chip>
            {poll.anonymous && <Chip tone="gray">ไม่ระบุตัวตน</Chip>}
            {poll.group && <Chip>{poll.group.name ?? "กลุ่ม LINE"}</Chip>}
          </div>
          <h1 className="text-xl font-extrabold leading-snug">{poll.title}</h1>
          {poll.description && <p className="mt-2 whitespace-pre-line text-sm text-mute">{poll.description}</p>}
          <div className="mt-3 flex items-center gap-2 text-xs text-mute">
            <Avatar name={poll.creator.name} src={poll.creator.pictureUrl} size={20} />
            <span>
              โดย <b className="text-ink">{poll.creator.name}</b> · {fmtDate(poll.createdAt)}
            </span>
          </div>
        </div>

        {poll.kind === "battle" && poll.options.length === 2 ? (
          <BattleView poll={poll} onPick={toggle} disabled={locked || busy} />
        ) : poll.kind === "rating" ? (
          <RatingView poll={poll} onPick={toggle} disabled={locked || busy} />
        ) : (
          <div className="card space-y-2 p-4">
            {multi && poll.isOpen && <p className="px-1 text-xs font-semibold text-mute">เลือกได้สูงสุด {poll.maxChoices} ข้อ</p>}
            {poll.options.map((o) => {
              const sel = picked.includes(o.id);
              const pct = total ? ((o.votes ?? 0) / total) * 100 : 0;
              return (
                <button
                  key={o.id}
                  onClick={() => toggle(o.id)}
                  disabled={locked || busy}
                  aria-pressed={sel}
                  className={`relative w-full overflow-hidden rounded-2xl border p-3.5 text-left transition ${sel ? "border-accent" : "border-line"} ${locked ? "cursor-default" : "active:scale-[.99]"}`}
                >
                  {poll.showResults && <span className="absolute inset-y-0 left-0 bg-accent-soft transition-[width] duration-500" style={{ width: `${pct}%` }} />}
                  <span className="relative flex items-center gap-3">
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center border-2 text-[11px] text-white ${multi ? "rounded-md" : "rounded-full"} ${sel ? "border-accent bg-accent" : "border-line"}`}
                    >
                      {sel && "✓"}
                    </span>
                    <span className="min-w-0 flex-1 font-semibold">
                      {o.emoji} {o.label}
                    </span>
                    {poll.showResults && (
                      <span className="shrink-0 text-sm font-bold">
                        {Math.round(pct)}% <span className="text-xs font-semibold text-mute">({o.votes})</span>
                      </span>
                    )}
                  </span>
                  {o.voters && o.voters.length > 0 && <Voters list={o.voters} />}
                </button>
              );
            })}
            {multi && poll.isOpen && !locked && (
              <button
                onClick={() => act(() => api.vote(poll.id, picked), voted ? "บันทึกคำตอบใหม่แล้ว" : "โหวตแล้ว ✓")}
                disabled={busy || !picked.length || !dirty}
                className="btn-primary mt-1 w-full rounded-xl py-3 font-bold disabled:opacity-50"
              >
                {voted ? "บันทึกคำตอบใหม่" : `ยืนยันโหวต (${picked.length})`}
              </button>
            )}
          </div>
        )}

        <div className="card space-y-1 p-4 text-sm">
          <p className="font-bold">
            ผู้โหวตทั้งหมด {poll.voterCount.toLocaleString()} คน
            {!poll.showResults && <span className="font-normal text-mute"> · {poll.resultsVisibility === "after_close" ? "ผลจะแสดงเมื่อปิดโหวต" : "โหวตก่อนเพื่อดูผล"}</span>}
          </p>
          {poll.closesAt && <p className="text-mute">{poll.isOpen ? "ปิดโหวต" : "ปิดเมื่อ"} {fmtDate(poll.closedAt ?? poll.closesAt)}</p>}
          {voted && !poll.allowChange && poll.isOpen && <p className="text-mute">โหวตนี้ไม่อนุญาตให้เปลี่ยนคำตอบ</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {voted && poll.allowChange && poll.isOpen && (
            <button onClick={() => act(() => api.unvote(poll.id), "ถอนโหวตแล้ว")} disabled={busy} className="rounded-xl bg-track px-4 py-2.5 text-sm font-bold text-mute">
              ถอนโหวต
            </button>
          )}
          {poll.isCreator && poll.isOpen && (
            <button onClick={() => act(() => api.close(poll.id), "ปิดโหวตแล้ว")} disabled={busy} className="rounded-xl bg-accent-soft px-4 py-2.5 text-sm font-bold text-accent">
              ปิดโหวตตอนนี้
            </button>
          )}
          {poll.isCreator && <DeleteButton onDelete={async () => (await api.remove(poll.id), toast("ลบโหวตแล้ว"), back())} />}
        </div>
      </div>
    </div>
  );
}

function Voters({ list }: { list: { name: string; pictureUrl: string | null }[] }) {
  return (
    <span className="relative mt-2 flex items-center pl-8">
      <span className="flex -space-x-1.5">
        {list.slice(0, 8).map((v, i) => (
          <Avatar key={i} name={v.name} src={v.pictureUrl} size={20} />
        ))}
      </span>
      <span className="ml-2 truncate text-[11px] text-mute">{list.map((v) => v.name).join(", ")}</span>
    </span>
  );
}

function BattleView({ poll, onPick, disabled }: { poll: Poll; onPick: (id: string) => void; disabled: boolean }) {
  const [a, b] = poll.options;
  const total = (a.votes ?? 0) + (b.votes ?? 0);
  const pa = total ? Math.round(((a.votes ?? 0) / total) * 100) : 50;
  const winner = !poll.isOpen && total ? ((a.votes ?? 0) === (b.votes ?? 0) ? null : (a.votes ?? 0) > (b.votes ?? 0) ? a : b) : undefined;

  const side = (o: Poll["options"][number], color: string) => {
    const mine = poll.myChoices.includes(o.id);
    return (
      <button
        onClick={() => onPick(o.id)}
        disabled={disabled}
        aria-pressed={mine}
        className="flex flex-col items-center gap-1 rounded-3xl border-2 p-4 transition active:scale-[.97]"
        style={{ borderColor: mine ? color : "var(--line)", background: mine ? color : `color-mix(in srgb, ${color} 8%, var(--surface))`, color: mine ? "#fff" : "var(--ink)" }}
      >
        <span className="text-5xl">{o.emoji || "⭐"}</span>
        <span className="text-center text-base font-extrabold leading-tight">{o.label}</span>
        {poll.showResults && (
          <span className="text-sm font-bold opacity-90">
            {o.votes?.toLocaleString()} เสียง
          </span>
        )}
        {mine && <span className="text-[11px] font-bold">✓ คุณเลือกฝั่งนี้</span>}
      </button>
    );
  };

  return (
    <div className="card space-y-4 p-4">
      {winner !== undefined && (
        <p className="rounded-2xl bg-accent-soft p-3 text-center font-extrabold">
          {winner ? `🏆 ${winner.emoji ?? ""} ${winner.label} ชนะ!` : "🤝 เสมอกัน"}
        </p>
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {side(a, BATTLE_A)}
        <span className="text-sm font-extrabold text-mute">VS</span>
        {side(b, BATTLE_B)}
      </div>
      {poll.showResults && (
        <div>
          <div className="flex h-3 overflow-hidden rounded-full bg-track">
            <div className="transition-[width] duration-500" style={{ width: `${total ? pa : 50}%`, background: BATTLE_A }} />
            <div className="flex-1" style={{ background: BATTLE_B }} />
          </div>
          <div className="mt-1 flex justify-between text-xs font-bold">
            <span style={{ color: BATTLE_A }}>{total ? pa : 0}%</span>
            <span style={{ color: BATTLE_B }}>{total ? 100 - pa : 0}%</span>
          </div>
        </div>
      )}
      {poll.options.some((o) => o.voters?.length) && (
        <div className="grid grid-cols-2 gap-2 text-left">
          {poll.options.map((o) => (
            <div key={o.id}>{o.voters && o.voters.length > 0 && <Voters list={o.voters} />}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function RatingView({ poll, onPick, disabled }: { poll: Poll; onPick: (id: string) => void; disabled: boolean }) {
  const total = poll.options.reduce((s, o) => s + (o.votes ?? 0), 0);
  const avg = total ? poll.options.reduce((s, o, i) => s + (o.votes ?? 0) * (i + 1), 0) / total : 0;
  const ordered = [...poll.options].reverse(); // ดีมาก -> แย่มาก ตามงานออกแบบ

  return (
    <div className="card space-y-4 p-4">
      <div className="grid grid-cols-5 gap-2">
        {ordered.map((o) => {
          const i = poll.options.indexOf(o);
          const mine = poll.myChoices.includes(o.id);
          const c = RATING_COLORS[i];
          return (
            <button
              key={o.id}
              onClick={() => onPick(o.id)}
              disabled={disabled}
              aria-pressed={mine}
              className="flex min-h-21 flex-col items-center gap-1 rounded-2xl px-0.5 py-3 text-[12px] font-bold transition active:scale-95"
              style={{ background: mine ? c : `color-mix(in srgb, ${c} 15%, var(--surface))`, color: mine ? "#fff" : "var(--ink)" }}
            >
              <span className="text-2xl leading-none">{o.emoji}</span>
              {o.label}
            </button>
          );
        })}
      </div>
      {poll.showResults && total > 0 && (
        <>
          <div className="rounded-2xl bg-accent-soft p-3">
            <p className="text-2xl font-extrabold text-accent">{avg.toFixed(2)} / 5</p>
            <p className="text-xs text-mute">คะแนนเฉลี่ยจาก {total} เสียง</p>
          </div>
          <div className="grid grid-cols-[64px_1fr_40px] items-center gap-x-3 gap-y-2 text-sm">
            {ordered.map((o) => {
              const i = poll.options.indexOf(o);
              const pct = ((o.votes ?? 0) / total) * 100;
              return (
                <div key={o.id} className="contents">
                  <span>{o.label}</span>
                  <Bar pct={pct} color={RATING_COLORS[i]} h={10} />
                  <span className="text-right">{Math.round(pct)}%</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function DeleteButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <span className="flex gap-2">
      <button onClick={onDelete} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white">
        ยืนยันลบ
      </button>
      <button onClick={() => setConfirm(false)} className="rounded-xl bg-track px-4 py-2.5 text-sm font-bold text-mute">
        ยกเลิก
      </button>
    </span>
  ) : (
    <button onClick={() => setConfirm(true)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-red-600">
      ลบโหวต
    </button>
  );
}
