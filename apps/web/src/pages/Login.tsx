import { useState } from "react";

/** หน้าล็อกอินจำลอง ใช้เฉพาะตอนพัฒนาที่ยังไม่มี LIFF */
export default function Login({ onLogin }: { onLogin: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (n: string) => {
    if (!n.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onLogin(n.trim());
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="btn-primary grid h-20 w-20 place-items-center rounded-3xl text-3xl font-extrabold shadow-[0_12px_30px_rgb(31_107_255/30%)]">•V</div>
      <p className="mt-5 inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">Collective Decision &amp; Battle Platform</p>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight">
        หนึ่งเสียง หนึ่งการเลือก
        <br />
        <span className="text-accent">ขยับบางสิ่งเสมอ</span>
      </h1>
      <p className="mt-2 text-sm text-mute">โหมดพัฒนา: ยังไม่ได้ตั้งค่า LIFF จึงใช้ผู้ใช้จำลองแทนบัญชี LINE</p>

      <form
        className="mt-8 w-full space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(name);
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่อผู้ใช้จำลอง"
          maxLength={40}
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        <button disabled={busy || !name.trim()} className="btn-primary w-full rounded-xl py-3 font-bold disabled:opacity-50">
          เข้าใช้งาน
        </button>
      </form>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {["มิ้นท์", "โอ๊ต", "แพร"].map((n) => (
          <button key={n} disabled={busy} onClick={() => submit(n)} className="rounded-full bg-surface px-3 py-1.5 text-sm font-semibold shadow-sm">
            {n}
          </button>
        ))}
      </div>
      {err && <p className="mt-4 text-sm font-semibold text-red-600">{err}</p>}
    </div>
  );
}
