const BASE = import.meta.env.VITE_API_URL || "";
const TOKEN_KEY = "vote.token";

let token: string | null = null;
try {
  token = sessionStorage.getItem(TOKEN_KEY);
} catch {
  /* storage ใช้ไม่ได้ (private mode) */
}

export function setToken(t: string | null) {
  token = t;
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
export const hasToken = () => Boolean(token);

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `เกิดข้อผิดพลาด (${res.status})`);
  return data as T;
}

/* ---------------------------------- types --------------------------------- */

export type Kind = "single" | "multiple" | "battle" | "rating" | "yesno";
export type Audience = "group" | "link" | "public";
export type Visibility = "live" | "after_vote" | "after_close";

export type User = { id: string; name: string; pictureUrl: string | null };
export type Group = { id: string; type: "group" | "room"; name: string | null; pictureUrl: string | null; botActive: boolean; openPolls?: number };
export type Config = { liffId: string | null; devAuth: boolean; bot: boolean };

export type PollListItem = {
  id: string;
  title: string;
  kind: Kind;
  audience: Audience;
  closesAt: string | null;
  isOpen: boolean;
  createdAt: string;
  creator: { name: string; pictureUrl: string | null };
  groupName: string | null;
  hasVoted: boolean;
  voterCount: number;
  options: { id: string; label: string; emoji: string | null; votes: number | null }[];
};

export type Poll = {
  id: string;
  title: string;
  description: string | null;
  kind: Kind;
  audience: Audience;
  anonymous: boolean;
  allowChange: boolean;
  resultsVisibility: Visibility;
  maxChoices: number;
  closesAt: string | null;
  closedAt: string | null;
  createdAt: string;
  isOpen: boolean;
  isCreator: boolean;
  creator: { name: string; pictureUrl: string | null };
  group: Group | null;
  myChoices: string[];
  showResults: boolean;
  voterCount: number;
  options: { id: string; label: string; emoji: string | null; votes: number | null; voters: { name: string; pictureUrl: string | null }[] | null }[];
  shareUrl: string;
};

export type CreatePollInput = {
  title: string;
  description?: string;
  kind: Kind;
  audience: Audience;
  groupId?: string | null;
  options: { label: string; emoji?: string | null }[];
  anonymous: boolean;
  allowChange: boolean;
  resultsVisibility: Visibility;
  maxChoices?: number;
  closesAt?: string | null;
  announce: boolean;
  remindMinutes?: number | null;
};

export type LifeProfile = { id: string; name: string; birth: string; target: number; todayScore?: number | null };
export type LifeOverview = { today: string; max: number; bot: boolean; remind: { on: boolean; time: string }; profiles: LifeProfile[] };
export type LifeVotes = { profile: LifeProfile; today: string; votes: Record<string, [number, string | null]> };
type ProfileInput = { name: string; birth: string; target: number };

/* ---------------------------------- calls --------------------------------- */

export const api = {
  config: () => req<Config>("GET", "/api/config"),
  loginLine: (idToken: string) => req<{ token: string; user: User }>("POST", "/api/auth/line", { idToken }),
  loginDev: (name: string) => req<{ token: string; user: User }>("POST", "/api/auth/dev", { name }),
  me: () => req<User>("GET", "/api/me"),
  context: (ctx: string) => req<{ group: Group; isMember: boolean }>("POST", "/api/context", { ctx }),
  groups: () => req<Group[]>("GET", "/api/groups"),
  devGroup: (name: string) => req<{ ctx: string }>("POST", "/api/dev/group", { name }),
  polls: (scope: "public" | "mine" | "voted" | "groups" | "group", opts: { groupId?: string; status?: "open" | "closed" | "all" } = {}) => {
    const q = new URLSearchParams({ scope, ...(opts.groupId ? { groupId: opts.groupId } : {}), ...(opts.status ? { status: opts.status } : {}) });
    return req<PollListItem[]>("GET", `/api/polls?${q}`);
  },
  poll: (id: string) => req<Poll>("GET", `/api/polls/${id}`),
  create: (input: CreatePollInput) => req<{ id: string }>("POST", "/api/polls", input),
  vote: (id: string, optionIds: string[]) => req<Poll>("POST", `/api/polls/${id}/vote`, { optionIds }),
  unvote: (id: string) => req<Poll>("DELETE", `/api/polls/${id}/vote`),
  close: (id: string) => req<Poll>("POST", `/api/polls/${id}/close`),
  remove: (id: string) => req<void>("DELETE", `/api/polls/${id}`),

  life: {
    overview: () => req<LifeOverview>("GET", "/api/life"),
    create: (p: ProfileInput) => req<LifeProfile>("POST", "/api/life/profiles", p),
    update: (id: string, p: ProfileInput) => req<LifeProfile>("PUT", `/api/life/profiles/${id}`, p),
    remove: (id: string) => req<void>("DELETE", `/api/life/profiles/${id}`),
    votes: (id: string) => req<LifeVotes>("GET", `/api/life/profiles/${id}/votes`),
    vote: (id: string, day: string, score: number, note: string) => req<void>("PUT", `/api/life/profiles/${id}/votes/${day}`, { score, note }),
    clear: (id: string, day: string) => req<void>("DELETE", `/api/life/profiles/${id}/votes/${day}`),
    remind: (on: boolean, time: string) => req<void>("PUT", "/api/life/remind", { on, time }),
  },
};
