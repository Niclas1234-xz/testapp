import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { openInstructor } from '@/components/session-card';
import { Avatar, Button, Eyebrow } from '@/components/ui';
import { useNest } from '@/lib/nest-store';
import {
  endTime,
  formatDay,
  formatTime,
  getClassType,
  getInstructor,
  getSession,
} from '@/lib/schedule';
import { colors, fonts, radius } from '@/lib/theme';

export default function SessionSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { isBooked, book, cancel, now } = useNest();
  const [justBooked, setJustBooked] = useState(false);

  const session = getSession(id);
  if (!session) {
    return (
      <View style={styles.missing}>
        <Text style={styles.body}>This class no longer exists.</Text>
        <Button label="Close" variant="outline" size="sm" onPress={() => router.back()} />
      </View>
    );
  }

  const type = getClassType(session.typeId);
  const instructor = getInstructor(session.instructorId);
  const booked = isBooked(session.id);
  const full = session.spotsLeft === 0;
  const past = session.start.getTime() < now;
  const spotsLeft = Math.max(session.spotsLeft - (booked && !full ? 1 : 0), 0);
  const taken = session.capacity - spotsLeft;

  function confirm() {
    book(session!.id);
    setJustBooked(true);
    if (process.env.EXPO_OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  if (justBooked) {
    return (
      <View style={[styles.success, { paddingBottom: insets.bottom + 24 }]}>
        <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.successBadge}>
          <Icon name="check" size={40} color={colors.onDark} strokeWidth={1.6} />
        </Animated.View>
        <Animated.View entering={FadeIn.delay(150).duration(400)} style={styles.successContent}>
          <Text style={styles.successTitle}>{full ? 'You’re on the waitlist.' : 'You’re in.'}</Text>
          <Text style={styles.successText}>
            {session.title} with {instructor.name}
            {'\n'}
            {formatDay(session.start)} · {formatTime(session.start)} · {session.location}
          </Text>
          <View style={styles.demoPill}>
            <Text style={styles.demoPillText}>Booked · Demo</Text>
          </View>
          <Text style={styles.hint}>You’ll find all your bookings under Nest.</Text>
        </Animated.View>
        <Button label="Done" onPress={() => router.back()} style={styles.successButton} />
      </View>
    );
  }

  const details: { icon: IconName; text: string }[] = [
    { icon: 'calendar', text: formatDay(session.start) },
    {
      icon: 'clock',
      text: `${formatTime(session.start)} – ${formatTime(endTime(session))} · ${session.durationMin} min`,
    },
    { icon: 'pin', text: `The Wellnest ${session.location}` },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.typeRow}>
          <View style={[styles.typeBadge, { backgroundColor: type.color }]}>
            <Icon name={type.icon} size={18} color={colors.onDark} />
          </View>
          <Eyebrow>
            {type.category} · {type.label}
          </Eyebrow>
        </View>
        <Text style={styles.title}>{session.title}</Text>

        <View style={styles.details}>
          {details.map((detail) => (
            <View key={detail.icon} style={styles.detailRow}>
              <Icon name={detail.icon} size={18} color={colors.bronze} />
              <Text style={styles.detailText}>{detail.text}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => openInstructor(instructor.id)}
          style={({ pressed }) => [styles.instructor, pressed && { opacity: 0.7 }]}>
          <Avatar name={instructor.name} size={48} />
          <View style={styles.flex}>
            <Text style={styles.instructorName}>{instructor.name}</Text>
            <Text style={styles.instructorRole}>{instructor.role}</Text>
          </View>
          <Text style={styles.bioLink}>Show bio</Text>
        </Pressable>

        <Text style={styles.body}>{type.tagline}</Text>

        <View style={styles.expect}>
          {type.expect.map((item) => (
            <View key={item} style={styles.expectChip}>
              <Text style={styles.expectText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.capacity}>
          <View style={styles.capacityRow}>
            <Text style={styles.capacityLabel}>Availability</Text>
            <Text style={styles.capacityValue}>
              {full ? 'Fully booked' : `${spotsLeft} of ${session.capacity} spots left`}
            </Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${(taken / session.capacity) * 100}%` }]} />
          </View>
        </View>

        <View style={styles.price}>
          <Text style={styles.capacityLabel}>Price</Text>
          <Text style={styles.priceValue}>
            CHF {session.priceChf}
            <Text style={styles.priceNote}> · or 1 credit</Text>
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {past ? (
          <Button label="Class finished" variant="outline" disabled style={styles.flex} />
        ) : booked ? (
          <>
            <View style={styles.bookedNote}>
              <Icon name="check" size={16} color={colors.olive} strokeWidth={2} />
              <Text style={styles.bookedText}>You’re booked</Text>
            </View>
            <Button label="Cancel booking" variant="outline" onPress={() => cancel(session.id)} />
          </>
        ) : (
          <>
            <Button label="Cancel" variant="outline" onPress={() => router.back()} />
            <Button
              label={full ? 'Join waitlist' : 'Book now'}
              icon="arrowRight"
              onPress={confirm}
              style={styles.flex}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  content: {
    padding: 24,
    paddingTop: 32,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.light,
    fontSize: 32,
    lineHeight: 40,
    color: colors.ink,
    marginTop: 14,
  },
  details: {
    marginTop: 20,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  instructor: {
    marginTop: 24,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  instructorName: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  instructorRole: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  bioLink: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.bronze,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 24,
    color: colors.inkSoft,
  },
  expect: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  expectChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  expectText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.inkSoft,
  },
  capacity: {
    marginTop: 28,
    gap: 10,
  },
  capacityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  capacityLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  capacityValue: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.sand,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: colors.bronze,
    borderRadius: 2,
  },
  price: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  priceValue: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  priceNote: {
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  bookedNote: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookedText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.olive,
  },
  success: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    backgroundColor: colors.surface,
  },
  successBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successContent: {
    alignItems: 'center',
  },
  successTitle: {
    fontFamily: fonts.light,
    fontSize: 32,
    color: colors.ink,
    marginTop: 28,
    textAlign: 'center',
  },
  successText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 24,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: 12,
  },
  demoPill: {
    marginTop: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.sand,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  demoPillText: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.bronze,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 16,
    textAlign: 'center',
  },
  successButton: {
    alignSelf: 'stretch',
    marginTop: 40,
  },
});
