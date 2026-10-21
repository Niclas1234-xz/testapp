import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { useNest, type Booking } from '@/lib/nest-store';
import { formatTime, getClassType, getInstructor, relativeDay, type Session } from '@/lib/schedule';
import { colors, fonts, radius } from '@/lib/theme';

export function openSession(id: string) {
  router.push({ pathname: '/session/[id]', params: { id } });
}

export function openInstructor(id: string) {
  router.push({ pathname: '/instructor/[id]', params: { id } });
}

function availability(session: Session, booking: Booking | undefined) {
  const spots = session.spotsLeft;
  if (booking?.waitlist) return { text: 'On waitlist', color: colors.olive };
  if (booking) return { text: 'Booked', color: colors.olive };
  if (spots === 0) return { text: 'Full · waitlist', color: colors.terracotta };
  if (spots <= 3) return { text: `${spots} ${spots === 1 ? 'spot' : 'spots'} left`, color: colors.bronze };
  return { text: `${spots} spots left`, color: colors.muted };
}

// `showDay` swaps the duration for "Today"/"Tomorrow"/"Thu 22", for lists that span several days.
export function SessionCard({ session, showDay }: { session: Session; showDay?: boolean }) {
  const { bookingFor, now } = useNest();
  const booking = bookingFor(session.id);
  const booked = !!booking;
  const type = getClassType(session.typeId);
  const instructor = getInstructor(session.instructorId);
  const status = availability(session, booking);

  return (
    <PressableScale
      onPress={() => openSession(session.id)}
      style={[styles.card, booked && styles.cardBooked]}>
      <View style={styles.timeColumn}>
        <Text style={styles.time}>{formatTime(session.start)}</Text>
        <Text style={styles.duration}>
          {showDay ? relativeDay(session.start, now) : `${session.durationMin} min`}
        </Text>
      </View>

      <View style={[styles.accent, { backgroundColor: type.color }]} />

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {session.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {instructor.name} · {session.location}
        </Text>
        <View style={styles.status}>
          {booked && <Icon name="check" size={13} color={status.color} strokeWidth={2} />}
          <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
        </View>
      </View>

      <Icon name="chevronRight" size={16} color={colors.lineStrong} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: 16,
    paddingLeft: 18,
    paddingRight: 14,
    gap: 14,
  },
  cardBooked: {
    borderWidth: 1,
    borderColor: colors.olive,
  },
  timeColumn: {
    width: 58,
  },
  time: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  duration: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 3,
  },
  accent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
  },
  meta: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  statusText: {
    fontFamily: fonts.medium,
    fontSize: 12,
  },
});
