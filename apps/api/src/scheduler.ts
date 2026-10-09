import { exec, rows } from "./db.js";
import { announceResult, sendReminder } from "./polls.js";
import { sendLifeReminders } from "./life.js";

/** ปิดโหวตที่ถึงเวลา และส่งเตือนก่อนปิด (ทำงานซ้ำได้อย่างปลอดภัย) */
export async function tick() {
  const due = await rows<{ id: string }>(
    "SELECT id FROM polls WHERE closed_at IS NULL AND closes_at IS NOT NULL AND closes_at <= CURRENT_TIMESTAMP(3) LIMIT 100",
  );
  for (const { id } of due) {
    const r = await exec("UPDATE polls SET closed_at = closes_at WHERE id = ? AND closed_at IS NULL", [id]);
    if (r.affectedRows) await announceResult(id).catch((e) => console.error("announceResult", id, e));
  }

  const remind = await rows<{ id: string }>(
    `SELECT id FROM polls
      WHERE closed_at IS NULL AND reminded_at IS NULL AND remind_minutes IS NOT NULL AND group_id IS NOT NULL
        AND closes_at > CURRENT_TIMESTAMP(3)
        AND closes_at <= CURRENT_TIMESTAMP(3) + INTERVAL remind_minutes MINUTE
      LIMIT 100`,
  );
  for (const { id } of remind) await sendReminder(id).catch((e) => console.error("sendReminder", id, e));

  await sendLifeReminders();
}

export function startScheduler(intervalMs = 30_000) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (e) {
      console.error("scheduler tick failed", e);
    } finally {
      running = false;
    }
  };
  run();
  return setInterval(run, intervalMs);
}
