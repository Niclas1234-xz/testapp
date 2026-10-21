import { createContext, use, useEffect, useState, type ReactNode } from 'react';

// In-memory demo state: bookings and login are lost when the app reloads.
type User = { name: string; email: string };

type NestState = {
  /** Current time, refreshed every minute so past classes grey out on their own. */
  now: number;
  bookedIds: string[];
  isBooked: (sessionId: string) => boolean;
  book: (sessionId: string) => void;
  cancel: (sessionId: string) => void;
  user: User | null;
  logIn: (email: string) => void;
  logOut: () => void;
};

const NestContext = createContext<NestState | null>(null);

function nameFromEmail(email: string) {
  const local = email.split('@')[0].split(/[._-]/)[0] || 'Guest';
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function NestProvider({ children }: { children: ReactNode }) {
  const [bookedIds, setBookedIds] = useState<string[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const state: NestState = {
    now,
    bookedIds,
    isBooked: (sessionId) => bookedIds.includes(sessionId),
    book: (sessionId) =>
      setBookedIds((ids) => (ids.includes(sessionId) ? ids : [...ids, sessionId])),
    cancel: (sessionId) => setBookedIds((ids) => ids.filter((id) => id !== sessionId)),
    user,
    logIn: (email) => setUser({ email, name: nameFromEmail(email.trim()) }),
    logOut: () => setUser(null),
  };

  return <NestContext value={state}>{children}</NestContext>;
}

export function useNest() {
  const state = use(NestContext);
  if (!state) throw new Error('useNest must be used inside <NestProvider>.');
  return state;
}
