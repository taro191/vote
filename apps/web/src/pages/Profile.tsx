import { useState } from "react";
import { api } from "../api";
import { useSession } from "../App";
import { Avatar, ErrorBox, PollList, Spinner, useLoad, useNav, useToast } from "../ui";
import { Tabs } from "./Battles";

export default function Profile() {
  const { user, config, logout, openCtx } = useSession();
  const { go } = useNav();
  const toast = useToast();
  const [tab, setTab] = useState<"mine" | "voted">("mine");
  const list = useLoad(() => api.polls(tab), [tab]);
  const groups = useLoad(() => api.groups());

  const devGroup = async () => {
    const name = `กลุ่มทดสอบ ${new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
    try {
      const { ctx } = await api.devGroup(name);
      await openCtx(ctx);
      toast("สร้างกลุ่มจำลองแล้ว");
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="space-y-5 pt-4">
      <div className="card flex items-center gap-4 p-5">
        <Avatar name={user.name} src={user.pictureUrl} size={60} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-accent">พื้นที่เสียงของคุณ (Profile)</p>
          <p className="truncate text-xl font-extrabold">{user.name}</p>
        </div>
      </div>

      <div className="space-y-2.5">
        <h2 className="px-1 text-[15px] font-extrabold">กลุ่ม LINE ที่ฉันอยู่</h2>
        {groups.data?.length ? (
          <div className="card divide-y divide-line">
            {groups.data.map((g) => (
              <button key={g.id} onClick={() => go({ name: "group", id: g.id })} className="flex w-full items-center gap-3 p-3.5 text-left">
                <Avatar name={g.name ?? "ก"} src={g.pictureUrl} size={36} />
                <span className="min-w-0 flex-1 truncate font-bold">{g.name ?? "กลุ่ม LINE"}</span>
                <span className="text-xs text-mute">{g.openPolls} เปิดอยู่ ›</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-1 text-sm text-mute">เปิดแอปจากลิงก์ที่บอทส่งในกลุ่ม LINE เพื่อเชื่อมกลุ่มกับบัญชีของคุณ</p>
        )}
      </div>

      <Tabs value={tab} onChange={setTab} items={[["mine", "โหวตที่ฉันสร้าง"], ["voted", "ที่ฉันโหวต"]]} />
      {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : <PollList items={list.data!} empty="ยังไม่มีรายการ" />}

      {config.devAuth && (
        <div className="card space-y-2 border-dashed p-4">
          <p className="text-sm font-extrabold">เครื่องมือนักพัฒนา</p>
          <p className="text-xs text-mute">สร้างกลุ่มจำลองเพื่อทดสอบโหวตเฉพาะกลุ่มโดยไม่ต้องมีบอท (ใช้ได้เฉพาะ DEV_AUTH)</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={devGroup} className="rounded-xl bg-accent-soft px-3.5 py-2 text-sm font-bold text-accent">
              + กลุ่มจำลอง
            </button>
            <button onClick={logout} className="rounded-xl bg-track px-3.5 py-2 text-sm font-bold text-mute">
              สลับผู้ใช้
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
