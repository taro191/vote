import { useState } from "react";
import { api } from "../api";
import { Avatar, ErrorBox, PollList, Spinner, SubHeader, useLoad, useNav } from "../ui";
import { Tabs } from "./Battles";

export default function GroupPage({ id }: { id: string }) {
  const { go } = useNav();
  const [status, setStatus] = useState<"open" | "closed">("open");
  const groups = useLoad(() => api.groups());
  const list = useLoad(() => api.polls("group", { groupId: id, status }), [id, status]);
  const g = groups.data?.find((x) => x.id === id);

  return (
    <div>
      <SubHeader title={g?.name ?? "กลุ่ม LINE"} />
      <div className="space-y-4">
        <div className="card flex items-center gap-3 p-4">
          <Avatar name={g?.name ?? "ก"} src={g?.pictureUrl} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold">{g?.name ?? "กลุ่ม LINE"}</p>
            <p className="text-xs text-mute">{g && !g.botActive ? "⚠ บอทไม่ได้อยู่ในกลุ่มนี้แล้ว จะไม่ประกาศผลในแชต" : "โหวตเฉพาะสมาชิกกลุ่มนี้"}</p>
          </div>
        </div>
        <button onClick={() => go({ name: "create", groupId: id })} className="btn-primary w-full rounded-2xl py-3 font-bold">
          + สร้างโหวตในกลุ่มนี้
        </button>
        <Tabs value={status} onChange={setStatus} items={[["open", "เปิดอยู่"], ["closed", "ปิดแล้ว"]]} />
        {list.loading ? <Spinner /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : <PollList items={list.data!} empty="ยังไม่มีโหวตในหมวดนี้" />}
      </div>
    </div>
  );
}
