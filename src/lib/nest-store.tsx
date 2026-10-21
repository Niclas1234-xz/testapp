import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

// In-memory demo state: bookings and login are lost when the app reloads.
type User = { name: string; email: string };

export type PaymentMethod = 'credits' | 'card';
/** `waitlist` bookings are not charged until a spot opens up. */
export type Booking = { sessionId: string; method: PaymentMethod; waitlist: boolean };

// Demo membership: every member starts with this many credits.
export const MEMBERSHIP_CREDITS = 10;
export const DEMO_CARD = 'Visa •••• 4242';

type NestState = {
  /** Current time, refreshed every minute and on returning to the app. Greeting, "Today",
   * the timetable and which classes are over all follow it. */
  now: number;
  bookings: Booking[];
  bookedIds: string[];
  creditsLeft: number;
  isBooked: (sessionId: string) => boolean;
  bookingFor: (sessionId: string) => Booking | undefined;
  book: (sessionId: string, method: PaymentMethod, waitlist: boolean) => void;
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
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    // Timers pause in the background, so catch up straight away when the app comes back.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  const bookingFor = (sessionId: string) => bookings.find((b) => b.sessionId === sessionId);

  const state: NestState = {
    now,
    bookings,
    bookedIds: bookings.map((b) => b.sessionId),
    // Cancelling removes the booking, which hands its credit back.
    creditsLeft:
      MEMBERSHIP_CREDITS - bookings.filter((b) => b.method === 'credits' && !b.waitlist).length,
    isBooked: (sessionId) => !!bookingFor(sessionId),
    bookingFor,
    book: (sessionId, method, waitlist) =>
      setBookings((current) =>
        current.some((b) => b.sessionId === sessionId)
          ? current
          : [...current, { sessionId, method, waitlist }]
      ),
    cancel: (sessionId) => setBookings((current) => current.filter((b) => b.sessionId !== sessionId)),
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
