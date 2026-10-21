import type { IconName } from '@/components/icon';
import { colors } from '@/lib/theme';

// Demo data only. Texts come from thewellnest.ch/classes; the timetable is generated so the
// booking screen always has upcoming classes to show.

export type ClassTypeId = 'sculpt' | 'mat-pilates' | 'yoga' | 'event';

export type ClassType = {
  id: ClassTypeId;
  name: string;
  label: string;
  category: 'Class' | 'Special event';
  icon: IconName;
  color: string;
  tagline: string;
  description: string[];
  expect: string[];
  features: { icon: IconName; label: string }[];
};

export const classTypes: ClassType[] = [
  {
    id: 'sculpt',
    name: 'Sculpt',
    label: 'Signature class',
    category: 'Class',
    icon: 'rings',
    color: colors.bronze,
    tagline:
      'Our signature Wellnest experience - a rhythm-led, full-body practice designed to build strength, create energy and bring you back into the here and now.',
    description: [
      'Moving between controlled strength, deep burn, fluid movement and intentional moments of release, the class follows a carefully crafted rhythm of effort and ease.',
      'Music is at the heart of the practice, guiding the energy as it builds and softens. Together with sound, light, scent and mindful guidance, it creates an immersive experience.',
      'Leave feeling present and energized - yet grounded and at ease.',
    ],
    expect: [
      'mindfulness',
      'full-body movement',
      'rhythm-led strength',
      'controlled burn',
      'fluid flow',
      'intentional release',
    ],
    features: [
      { icon: 'barbell', label: 'Full-body workout' },
      { icon: 'heart', label: 'Strength & cardio' },
      { icon: 'sun', label: 'Energising atmosphere' },
    ],
  },
  {
    id: 'mat-pilates',
    name: 'Mat Pilates',
    label: 'Classic Pilates',
    category: 'Class',
    icon: 'ringsVertical',
    color: colors.olive,
    tagline: 'Precision, alignment and deep strength - connecting you to the power within.',
    description: [
      'Our take on a modern Pilates practice - rooted in its foundational principles while bringing a steady, intentional flow to the mat.',
      'Through precise, controlled movement, the class builds strength from within, with a focus on alignment, core stability and body awareness.',
      'A steady flow gradually builds warmth and intensity - always grounded in control and form.',
    ],
    expect: [
      'precision + control',
      'deep strength',
      'alignment',
      'steady flow',
      'core stability',
      'body awareness',
    ],
    features: [
      { icon: 'target', label: 'Improves posture' },
      { icon: 'waves', label: 'Builds strength' },
      { icon: 'lotus', label: 'Calm & focused' },
    ],
  },
  {
    id: 'yoga',
    name: 'Yoga Flow',
    label: 'Yoga',
    category: 'Class',
    icon: 'lotus',
    color: colors.sage,
    tagline: 'Finding space in the body. Stillness in the mind.',
    description: [
      'A mindful, flowing practice designed to bring balance, grounding, and calm into both body and mind.',
      'Supporting mobility and stability - always with a sense of ease - the focus lies in moving with awareness, finding rhythm through breath, and allowing tension to dissolve.',
      'A practice to move freely. Breathe deeply. And feel fully.',
    ],
    expect: [
      'breath-led movement',
      'fluid flow',
      'mindful strength',
      'mobility + flexibility',
      'grounding',
      'presence',
    ],
    features: [
      { icon: 'leaf', label: 'More flexibility' },
      { icon: 'sun', label: 'Reduces stress' },
      { icon: 'heart', label: 'Mind & body' },
    ],
  },
  {
    id: 'event',
    name: 'Special Event',
    label: 'The Network',
    category: 'Special event',
    icon: 'spark',
    color: colors.terracotta,
    tagline: 'Movement, music, nourishment and connection - gathered into one moment.',
    description: [
      'Our special events bring the community together beyond the mat: longer formats, live sound and something good to eat afterwards.',
    ],
    expect: ['live music', 'longer format', 'community', 'nourishment'],
    features: [
      { icon: 'spark', label: 'Unique format' },
      { icon: 'heart', label: 'Community' },
      { icon: 'sun', label: 'Nourishment' },
    ],
  },
];

export type Instructor = {
  id: string;
  name: string;
  role: string;
  bio: string;
};

export const instructors: Instructor[] = [
  {
    id: 'giorgia',
    name: "Giorgia D'Amico",
    role: 'Sculpt & Pilates',
    bio: 'Giorgia builds every class around the music. Expect a strong rhythm, clear cues and a playlist you will want to save.',
  },
  {
    id: 'lea',
    name: 'Lea Wahl',
    role: 'Mat Pilates',
    bio: 'Lea teaches Pilates with precision and calm. Her classes are slow enough to feel every muscle and steady enough to keep you working.',
  },
  {
    id: 'mila',
    name: 'Mila Rossi',
    role: 'Yoga & Breathwork',
    bio: 'Mila guides breath-led flows that leave space to soften. Her evening classes are the best way to land after a long day.',
  },
  {
    id: 'noah',
    name: 'Noah Keller',
    role: 'Sculpt',
    bio: 'Noah brings energy and a sense of humour. His Sculpt classes build, burn and finish with a long, well-earned release.',
  },
  {
    id: 'elena',
    name: 'Elena Baumann',
    role: 'Pilates & Yoga',
    bio: 'Elena combines alignment-focused Pilates with mindful yoga. She meets everyone where they are, beginners included.',
  },
];

export const locations = ['Luzern', 'Zürich'] as const;
export type Location = (typeof locations)[number];

export type Session = {
  id: string;
  typeId: ClassTypeId;
  title: string;
  instructorId: string;
  location: Location;
  start: Date;
  durationMin: number;
  capacity: number;
  spotsLeft: number;
  priceChf: number;
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function weekdayShort(date: Date) {
  return WEEKDAYS[date.getDay()].slice(0, 3).toUpperCase();
}

export function formatDay(date: Date) {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatMonth(date: Date) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function endTime(session: Session) {
  return new Date(session.start.getTime() + session.durationMin * 60_000);
}

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Weeks start on Monday.
  return addDays(start, -((start.getDay() + 6) % 7));
}

// Four classes a day, times as on the website's demo timetable.
const DAILY_SLOTS = [
  ['07:30', '12:00', '16:00', '19:00'],
  ['07:15', '12:10', '16:30', '19:15'],
];
const ROTATION: ClassTypeId[] = ['sculpt', 'mat-pilates', 'yoga', 'sculpt', 'mat-pilates'];
const WEEKS_AHEAD = 4;

const EVENTS = [
  { title: 'Sunday Reset: Sculpt & Brunch', time: '10:00', durationMin: 120, priceChf: 65 },
  { title: 'Sound Bath & Breathwork', time: '17:30', durationMin: 75, priceChf: 45 },
];

function at(day: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(day);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function buildSchedule() {
  const sessions: Session[] = [];
  const firstDay = startOfWeek(new Date());

  for (let dayIndex = 0; dayIndex < WEEKS_AHEAD * 7; dayIndex++) {
    const day = addDays(firstDay, dayIndex);
    const slots = DAILY_SLOTS[dayIndex % DAILY_SLOTS.length];

    slots.forEach((time, slot) => {
      const seed = dayIndex * slots.length + slot;
      const typeId = ROTATION[seed % ROTATION.length];
      const capacity = typeId === 'mat-pilates' ? 12 : 16;
      sessions.push({
        id: `${dayKey(day)}-${slot}`,
        typeId,
        title: classTypes.find((type) => type.id === typeId)!.name,
        instructorId: instructors[(seed * 3 + dayIndex) % instructors.length].id,
        location: locations[seed % 3 === 0 ? 1 : 0],
        start: at(day, time),
        durationMin: slot === 0 ? 45 : 50,
        capacity,
        // Pseudo-random but stable, with the occasional full class.
        spotsLeft: (seed * 7 + 3) % (capacity - 2),
        priceChf: 35,
      });
    });

    // Special events on Sundays, alternating weekly.
    if (day.getDay() === 0) {
      const event = EVENTS[Math.floor(dayIndex / 7) % EVENTS.length];
      sessions.push({
        id: `${dayKey(day)}-event`,
        typeId: 'event',
        title: event.title,
        instructorId: instructors[Math.floor(dayIndex / 7) % instructors.length].id,
        location: 'Luzern',
        start: at(day, event.time),
        durationMin: event.durationMin,
        capacity: 24,
        spotsLeft: 9,
        priceChf: event.priceChf,
      });
    }
  }

  return sessions.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export const sessions = buildSchedule();
export const scheduleStart = startOfWeek(new Date());
export const scheduleWeeks = WEEKS_AHEAD;

export function getSession(id: string) {
  return sessions.find((session) => session.id === id);
}

export function getClassType(id: ClassTypeId) {
  return classTypes.find((type) => type.id === id)!;
}

export function getInstructor(id: string) {
  return instructors.find((instructor) => instructor.id === id)!;
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
