import { api, type PollListItem } from "../api";
import { useSession } from "../App";
import { Avatar, BATTLE_A, BATTLE_B, ErrorBox, PollList, Section, Spinner, useLoad, useNav } from "../ui";

export default function Home() {
  const { user, group } = useSession();
  const { go } = useNav();
  const groups = useLoad(() => api.groups());
  const feed = useLoad(async () => {
    const [mine, pub] = await Promise.all([api.polls("groups", { status: "open" }), api.polls("public", { status: "open" })]);
    return { mine, pub };
  });

  const battle = pickBattle([...(feed.data?.mine ?? []), ...(feed.data?.pub ?? [])]);

  return (
    <div className="space-y-6 pt-3">
      <header className="flex items-center gap-3">
        <div className="btn-primary grid h-10 w-10 place-items-center rounded-2xl text-sm font-extrabold">•V</div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold leading-tight">VOTE</p>
          <p className="truncate text-[11px] font-semibold text-mute">One Voice. One Choice.</p>
        </div>
        <button onClick={() => go({ name: "profile" })} aria-label="โปรไฟล์">
          <Avatar name={user.name} src={user.pictureUrl} size={36} />
        </button>
      </header>

      <div className="card p-4">
        <p className="text-xs font-bold text-accent">สวัสดี {user.name}</p>
        <p className="mt-0.5 text-sm font-semibold">"เสียงของคุณ ขยับบางสิ่งเสมอ"</p>
      </div>

      {group && !group.isMember && (
        <ErrorBox message={`คุณไม่ได้เป็นสมาชิกกลุ่ม "${group.group.name ?? "LINE"}" จึงดูโหวตของกลุ่มนี้ไม่ได้`} />
      )}

      {battle && (
        <button onClick={() => go({ name: "poll", id: battle.id })} className="card relative w-full overflow-hidden p-5 text-left">
          <p className="inline-flex rounded-full bg-accent-soft px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider text-accent">⚔ BATTLE OF THE DAY</p>
          <p className="mt-2 line-clamp-2 text-sm font-bold">{battle.title}</p>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center text-center">
            <Side o={battle.options[0]} total={sum(battle)} color={BATTLE_A} />
            <span className="grid h-9 w-9 place-items-center rounded-full bg-track text-xs font-extrabold text-mute">VS</span>
            <Side o={battle.options[1]} total={sum(battle)} color={BATTLE_B} />
          </div>
          {sum(battle) > 0 && battle.options[0].votes !== null && (
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-track">
              <div style={{ width: `${((battle.options[0].votes ?? 0) / sum(battle)) * 100}%`, background: BATTLE_A }} />
              <div style={{ width: `${((battle.options[1].votes ?? 0) / sum(battle)) * 100}%`, background: BATTLE_B }} />
            </div>
          )}
          <p className="mt-3 text-[11px] font-semibold text-mute">{battle.voterCount.toLocaleString()} คนร่วมโหวต · แตะเพื่อโหวต</p>
        </button>
      )}

      {groups.data && groups.data.length > 0 && (
        <Section title="กลุ่ม LINE ของฉัน">
          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1">
            {groups.data.map((g) => (
              <button key={g.id} onClick={() => go({ name: "group", id: g.id })} className="card flex w-40 shrink-0 items-center gap-2.5 p-3 text-left">
                <Avatar name={g.name ?? "ก"} src={g.pictureUrl} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{g.name ?? "กลุ่ม LINE"}</span>
                  <span className="block text-[11px] text-mute">{g.openPolls ?? 0} โหวตเปิดอยู่</span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="โหวตในกลุ่มของฉัน">
        {feed.loading ? (
          <Spinner />
        ) : feed.error ? (
          <ErrorBox message={feed.error} onRetry={feed.reload} />
        ) : (
          <PollList
            items={feed.data!.mine}
            empty={
              <>
                ยังไม่มีโหวตที่เปิดอยู่ในกลุ่มของคุณ
                <br />
                เชิญบอท VOTE เข้ากลุ่ม LINE แล้วพิมพ์ "โหวต" เพื่อเริ่ม
              </>
            }
          />
        )}
      </Section>

      {feed.data && feed.data.pub.length > 0 && (
        <Section
          title="โหวตสาธารณะล่าสุด"
          action={
            <button onClick={() => go({ name: "public" })} className="text-xs font-bold text-accent">
              ดูทั้งหมด ›
            </button>
          }
        >
          <PollList items={feed.data.pub.slice(0, 3)} empty={null} />
        </Section>
      )}
    </div>
  );
}

const sum = (p: PollListItem) => p.options.reduce((s, o) => s + (o.votes ?? 0), 0);

/** เลือก Battle ที่มีคนโหวตมากที่สุดในวันนี้มาเป็นไฮไลต์ */
function pickBattle(items: PollListItem[]) {
  const battles = items.filter((p) => p.kind === "battle" && p.options.length === 2);
  return battles.sort((a, b) => b.voterCount - a.voterCount)[0];
}

function Side({ o, total, color }: { o: PollListItem["options"][number]; total: number; color: string }) {
  return (
    <div className="min-w-0">
      <div className="text-3xl">{o.emoji || "⭐"}</div>
      <div className="mt-1 truncate text-sm font-extrabold">{o.label}</div>
      {o.votes !== null && total > 0 && (
        <div className="text-sm font-extrabold" style={{ color }}>
          {Math.round((o.votes / total) * 100)}%
        </div>
      )}
    </div>
  );
}
