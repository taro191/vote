import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, getToken, hasToken, setToken, type Config, type Group, type User } from "./api";
import { initLiff } from "./liff";
import { BottomNav, NavCtx, Spinner, ToastProvider, type Route } from "./ui";
import Home from "./pages/Home";
import Battles from "./pages/Battles";
import PublicPage from "./pages/Public";
import Profile from "./pages/Profile";
import Create from "./pages/Create";
import PollPage from "./pages/PollPage";
import GroupPage from "./pages/GroupPage";
import Login from "./pages/Login";
import Life from "./pages/Life";
import Stage from "./pages/Stage";

type Session = {
  user: User;
  config: Config;
  /** กลุ่มที่เปิดแอปมาจาก (ลิงก์ ctx ที่ bot ส่ง) */
  group: { group: Group; isMember: boolean } | null;
  openCtx: (ctx: string) => Promise<void>;
  setUser: (u: User) => void;
  logout: () => void;
};
export const SessionCtx = createContext<Session>(null as unknown as Session);
export const useSession = () => useContext(SessionCtx);

// LIFF จะคืน query เดิม (p, ctx, view) หลัง liff.init เสร็จ จึงต้องอ่านตอนนั้น ไม่ใช่ตอนโหลดไฟล์
let linkHandled = false;

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [group, setGroup] = useState<Session["group"]>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [needDevLogin, setNeedDevLogin] = useState(false);
  const [stack, setStack] = useState<Route[]>([{ name: "home" }]);
  const route = stack[stack.length - 1];

  const openCtx = useCallback(async (ctx: string) => {
    const g = await api.context(ctx);
    setGroup(g);
    if (g.isMember) setStack((s) => [...s, { name: "group", id: g.group.id }]);
  }, []);

  // เริ่มต้น: โหลด config -> ใช้ session เดิม / ล็อกอิน LINE ถ้าล็อกอินอยู่แล้ว / ไม่งั้นเข้าแบบผู้เยี่ยมชม
  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.config();
        setConfig(cfg);
        const liffId = import.meta.env.VITE_LIFF_ID || cfg.liffId;

        // ในแอป LINE หรือเคยล็อกอิน LINE ในเบราว์เซอร์นี้ จะได้ ID token (ไม่บังคับล็อกอิน)
        let idToken: string | null = null;
        if (liffId) idToken = await initLiff(liffId).catch(() => null);

        let me: User | null = null;
        if (hasToken()) {
          try {
            me = await api.me();
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 401)) throw e;
            setToken(null);
          }
        }

        // ล็อกอิน LINE อยู่แต่ยังเป็นผู้เยี่ยมชม: เปลี่ยนเป็นบัญชี LINE และย้ายข้อมูลผู้เยี่ยมชมไปด้วย
        if (idToken && (!me || me.isGuest)) {
          try {
            const r = await api.loginLine(idToken, me?.isGuest ? getToken() : null);
            setToken(r.token);
            me = r.user;
          } catch (e) {
            console.warn("LINE login failed, continuing as guest", e);
          }
        }

        if (!me) {
          const r = await api.loginGuest();
          setToken(r.token);
          me = r.user;
        }
        setUser(me);
      } catch (e) {
        setBootError((e as Error).message);
      }
    })();
  }, []);

  // เมื่อมีผู้ใช้แล้ว เปิดบริบทกลุ่มจากลิงก์ (ctx) และหน้าที่ระบุ (view)
  useEffect(() => {
    if (!user || linkHandled) return;
    linkHandled = true;
    const params = new URLSearchParams(window.location.search);
    const ctx = params.get("ctx");
    const view = params.get("view");
    const pollId = params.get("p");
    if (pollId) {
      setStack([{ name: "home" }, { name: "poll", id: pollId }]);
      return;
    }
    (async () => {
      if (ctx) {
        try {
          const g = await api.context(ctx);
          setGroup(g);
          if (g.isMember) {
            setStack((s) => [...s, view === "create" ? { name: "create", groupId: g.group.id } : { name: "group", id: g.group.id }]);
          }
        } catch (e) {
          setBootError((e as Error).message);
        }
      } else if (view === "create") setStack((s) => [...s, { name: "create" }]);
      else if (view === "life") setStack((s) => [...s, { name: "life" }]);
    })();
  }, [user]);

  const nav = {
    route,
    go: (r: Route) => {
      window.scrollTo(0, 0);
      const tab = ["home", "battles", "public", "profile"].includes(r.name);
      setStack((s) => (tab ? [r] : [...s, r]));
    },
    back: () => {
      window.scrollTo(0, 0);
      setStack((s) => (s.length > 1 ? s.slice(0, -1) : [{ name: "home" }]));
    },
  };

  // ใช้เฉพาะโหมดพัฒนา: สลับไปผู้ใช้จำลองคนอื่น
  const logout = () => {
    setToken(null);
    setUser(null);
    setNeedDevLogin(true);
  };

  if (bootError)
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="mt-20 text-lg font-extrabold">เปิดแอปไม่สำเร็จ</p>
        <p className="mt-2 text-sm text-mute">{bootError}</p>
        <button onClick={() => window.location.reload()} className="btn-primary mt-5 rounded-xl px-5 py-2.5 font-bold">
          ลองใหม่
        </button>
      </div>
    );

  if (needDevLogin && !user)
    return (
      <Login
        onLogin={async (name) => {
          const r = await api.loginDev(name);
          setToken(r.token);
          setUser(r.user);
          setNeedDevLogin(false);
        }}
      />
    );

  if (!user || !config) return <Spinner label="กำลังเข้าสู่ระบบ…" />;

  const tabbed = ["home", "battles", "public", "profile"].includes(route.name);

  return (
    <SessionCtx.Provider value={{ user, config, group, openCtx, setUser, logout }}>
      <NavCtx.Provider value={nav}>
        <ToastProvider>
          <main className={`mx-auto max-w-xl px-4 ${tabbed ? "pb-28" : "pb-10"}`} style={{ paddingTop: "env(safe-area-inset-top)" }}>
            {route.name === "home" && <Home />}
            {route.name === "battles" && <Battles />}
            {route.name === "public" && <PublicPage />}
            {route.name === "profile" && <Profile />}
            {route.name === "create" && <Create groupId={route.groupId} />}
            {route.name === "poll" && <PollPage key={route.id} id={route.id} />}
            {route.name === "group" && <GroupPage key={route.id} id={route.id} />}
            {route.name === "life" && <Life />}
            {route.name === "stage" && <Stage key={route.id} id={route.id} />}
          </main>
          {tabbed && <BottomNav />}
        </ToastProvider>
      </NavCtx.Provider>
    </SessionCtx.Provider>
  );
}
