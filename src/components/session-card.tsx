import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { useNest } from '@/lib/nest-store';
import {
  formatTime,
  getClassType,
  getInstructor,
  type Session,
} from '@/lib/schedule';
import { colors, fonts, radius } from '@/lib/theme';

export function openSession(id: string) {
  router.push({ pathname: '/session/[id]', params: { id } });
}

export function openInstructor(id: string) {
  router.push({ pathname: '/instructor/[id]', params: { id } });
}

export function availability(session: Session, booked: boolean) {
  const spots = session.spotsLeft;
  if (booked) return { text: 'You’re booked', color: colors.olive };
  if (spots === 0) return { text: 'Full · join waitlist', color: colors.terracotta };
  if (spots <= 3) return { text: `Only ${spots} ${spots === 1 ? 'spot' : 'spots'} left`, color: colors.bronze };
  return { text: `${spots} spots left`, color: colors.muted };
}

export function SessionCard({ session }: { session: Session }) {
  const { isBooked, now } = useNest();
  const booked = isBooked(session.id);
  const type = getClassType(session.typeId);
  const instructor = getInstructor(session.instructorId);
  const past = session.start.getTime() < now;
  const status = past ? { text: 'Finished', color: colors.muted } : availability(session, booked);

  return (
    <Pressable
      onPress={() => openSession(session.id)}
      style={({ pressed }) => [styles.card, past && styles.past, pressed && styles.pressed]}>
      <View style={styles.timeColumn}>
        <Text style={styles.time}>{formatTime(session.start)}</Text>
        <Text style={styles.duration}>{session.durationMin} min</Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: type.color }]} />
          <Text style={styles.meta}>
            {type.category} · {session.location}
          </Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {session.title}
        </Text>
        <Pressable hitSlop={8} onPress={() => openInstructor(instructor.id)}>
          <Text style={styles.instructor}>
            with <Text style={styles.instructorName}>{instructor.name}</Text>
          </Text>
        </Pressable>

        <View style={styles.footer}>
          <View style={styles.status}>
            {booked && <Icon name="check" size={14} color={status.color} strokeWidth={2} />}
            <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
          </View>
          {!past && (
            <View style={[styles.cta, booked && styles.ctaBooked]}>
              <Text style={[styles.ctaText, booked && styles.ctaTextBooked]}>
                {booked ? 'Details' : session.spotsLeft === 0 ? 'Waitlist' : 'Book'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    padding: 16,
    gap: 14,
  },
  past: {
    opacity: 0.5,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  timeColumn: {
    width: 52,
    paddingTop: 2,
  },
  time: {
    fontFamily: fonts.medium,
    fontSize: 17,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  duration: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 4,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.lineStrong,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  meta: {
    fontFamily: fonts.medium,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 18,
    color: colors.ink,
    letterSpacing: 0.2,
  },
  instructor: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  instructorName: {
    color: colors.inkSoft,
    textDecorationLine: 'underline',
    textDecorationColor: colors.lineStrong,
  },
  footer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  statusText: {
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  cta: {
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  ctaBooked: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.olive,
  },
  ctaText: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.onDark,
  },
  ctaTextBooked: {
    color: colors.olive,
  },
});
