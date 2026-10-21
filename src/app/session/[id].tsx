import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  interpolateColor,
  useAnimatedStyle,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ModalHeader } from '@/components/modal-header';
import { AnimatedPressable, PressableScale, useActiveProgress } from '@/components/motion';
import { openInstructor } from '@/components/session-card';
import { Button } from '@/components/ui';
import { DEMO_CARD, useNest, type PaymentMethod } from '@/lib/nest-store';
import {
  endTime,
  formatShortDay,
  formatTime,
  getClassType,
  getInstructor,
  getSession,
  initials,
  type Session,
} from '@/lib/schedule';
import { colors, fonts, radius } from '@/lib/theme';

type Step = 'review' | 'processing' | 'done';

export default function BookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { bookingFor, book, cancel, creditsLeft, now } = useNest();
  const [choice, setChoice] = useState<PaymentMethod>('credits');
  const [step, setStep] = useState<Step>('review');
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Closing the screen while the payment is "processing" must not book anything.
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    []
  );

  const session = getSession(id, now);
  if (!session) {
    return (
      <View style={styles.screen}>
        <ModalHeader title="Book class" />
        <View style={styles.missing}>
          <Text style={styles.note}>This class no longer exists.</Text>
        </View>
      </View>
    );
  }

  const sessionId = session.id;
  const booking = bookingFor(sessionId);
  const full = session.spotsLeft === 0;
  const past = session.start.getTime() < now;
  const canUseCredits = creditsLeft > 0;
  // Fall back to the card once the credits are used up.
  const method: PaymentMethod = choice === 'credits' && !canUseCredits ? 'card' : choice;
  const footerPadding = Math.max(insets.bottom, 16);

  function confirm() {
    setStep('processing');
    // Stand-in for the payment provider round trip.
    pending.current = setTimeout(() => {
      pending.current = null;
      book(sessionId, method, full);
      setStep('done');
      if (process.env.EXPO_OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }, 900);
  }

  if (step === 'done') {
    return (
      <View style={styles.screen}>
        <ModalHeader title={full ? 'Waitlist' : 'Booked'} />
        <Success session={session} method={method} waitlist={full} />
        <View style={[styles.footer, { paddingBottom: footerPadding }]}>
          <Button label="Done" onPress={() => router.back()} style={styles.flex} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ModalHeader title={booking ? 'Your booking' : 'Book class'} />

      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(450)}>
          <Ticket session={session} booked={!!booking && !booking.waitlist} />
        </Animated.View>

        {booking ? (
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.bookedBox}>
            <View style={styles.bookedIcon}>
              <Icon name="check" size={18} color={colors.onDark} strokeWidth={2} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.bookedTitle}>
                {booking.waitlist ? 'You’re on the waitlist' : 'You’re booked'}
              </Text>
              <Text style={styles.bookedText}>
                {booking.waitlist
                  ? `Charged to ${booking.method === 'credits' ? '1 credit' : DEMO_CARD} if a spot opens`
                  : `Paid with ${booking.method === 'credits' ? '1 credit' : DEMO_CARD}`}
              </Text>
            </View>
          </Animated.View>
        ) : (
          !past && (
            <Animated.View entering={FadeInDown.delay(100).duration(400)}>
              <Text style={styles.sectionLabel}>Payment method</Text>
              <View style={styles.options}>
                <PaymentOption
                  icon="rings"
                  title="Credits"
                  subtitle={canUseCredits ? `${creditsLeft} credits left` : 'No credits left'}
                  price="1 credit"
                  selected={method === 'credits'}
                  disabled={!canUseCredits}
                  onPress={() => setChoice('credits')}
                />
                <PaymentOption
                  icon="card"
                  title="Credit card"
                  subtitle={DEMO_CARD}
                  price={`CHF ${session.priceChf}`}
                  selected={method === 'card'}
                  onPress={() => setChoice('card')}
                />
              </View>

              <View style={styles.total}>
                <Text style={styles.totalLabel}>Total</Text>
                <Animated.Text key={method} entering={FadeIn.duration(250)} style={styles.totalValue}>
                  {method === 'credits' ? '1 credit' : `CHF ${session.priceChf}.00`}
                </Animated.Text>
              </View>
              <Text style={styles.note}>
                {full
                  ? 'This class is full. You’ll only be charged if a spot opens up.'
                  : 'Free cancellation up to 12 hours before class.'}
              </Text>
            </Animated.View>
          )
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: footerPadding }]}>
        {past ? (
          <Button label="Class finished" variant="outline" disabled style={styles.flex} />
        ) : booking ? (
          <Button
            label={booking.waitlist ? 'Leave waitlist' : 'Cancel booking'}
            variant="outline"
            onPress={() => cancel(sessionId)}
            style={styles.flex}
          />
        ) : (
          <Button
            label={
              full
                ? 'Join waitlist'
                : method === 'credits'
                  ? 'Book with 1 credit'
                  : `Pay CHF ${session.priceChf} & book`
            }
            icon="arrowRight"
            loading={step === 'processing'}
            onPress={confirm}
            style={styles.flex}
          />
        )}
      </View>
    </View>
  );
}

function Ticket({ session, booked }: { session: Session; booked: boolean }) {
  const type = getClassType(session.typeId);
  const instructor = getInstructor(session.instructorId);
  // Your own booking takes one of the free spots.
  const spotsLeft = Math.max(session.spotsLeft - (booked ? 1 : 0), 0);
  const full = spotsLeft === 0;
  const taken = session.capacity - spotsLeft;

  const details: { label: string; value: string }[] = [
    { label: 'Date', value: formatShortDay(session.start) },
    { label: 'Time', value: `${formatTime(session.start)} – ${formatTime(endTime(session))}` },
    { label: 'Location', value: session.location },
    { label: 'Duration', value: `${session.durationMin} min` },
  ];

  return (
    <View style={styles.ticket}>
      <View style={styles.ticketTop}>
        <View style={[styles.typeBadge, { backgroundColor: type.color }]}>
          <Icon name={type.icon} size={16} color={colors.onDark} />
        </View>
        <Text style={styles.ticketEyebrow}>
          {type.category} · {type.label}
        </Text>
      </View>
      <Text style={styles.ticketTitle}>{session.title}</Text>

      {/* Ticket perforation */}
      <View style={styles.perforation}>
        <View style={[styles.notch, styles.notchLeft]} />
        <View style={styles.perforationLine} />
        <View style={[styles.notch, styles.notchRight]} />
      </View>

      <View style={styles.grid}>
        {details.map((detail) => (
          <View key={detail.label} style={styles.cell}>
            <Text style={styles.cellLabel}>{detail.label}</Text>
            <Text style={styles.cellValue}>{detail.value}</Text>
          </View>
        ))}
      </View>

      <PressableScale onPress={() => openInstructor(instructor.id)} style={styles.instructor}>
        <View style={styles.initials}>
          <Text style={styles.initialsText}>{initials(instructor.name)}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.instructorName}>{instructor.name}</Text>
          <Text style={styles.instructorRole}>{instructor.role}</Text>
        </View>
        <Text style={styles.bioLink}>Bio</Text>
        <Icon name="chevronRight" size={14} color={colors.onDarkMuted} />
      </PressableScale>

      <View style={styles.capacity}>
        <Text style={styles.capacityText}>
          {full ? 'Fully booked' : `${spotsLeft} of ${session.capacity} spots left`}
        </Text>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${(taken / session.capacity) * 100}%` }]} />
        </View>
      </View>
    </View>
  );
}

function PaymentOption({
  icon,
  title,
  subtitle,
  price,
  selected,
  disabled,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  price: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const progress = useActiveProgress(selected);
  const boxStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.get(), [0, 1], [colors.surface, colors.ink]),
  }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: progress.get() }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.option, boxStyle, disabled && styles.optionDisabled]}>
      <View style={styles.optionIcon}>
        <Icon name={icon} size={22} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.optionPrice}>{price}</Text>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        <Animated.View style={[styles.radioDot, dotStyle]} />
      </View>
    </AnimatedPressable>
  );
}

function Success({ session, method, waitlist }: { session: Session; method: PaymentMethod; waitlist: boolean }) {
  const instructor = getInstructor(session.instructorId);
  return (
    <View style={styles.success}>
      <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.successBadge}>
        <Icon name="check" size={40} color={colors.onDark} strokeWidth={1.6} />
      </Animated.View>
      <Animated.Text entering={FadeInDown.delay(150).duration(400)} style={styles.successTitle}>
        {waitlist ? 'You’re on the waitlist.' : 'You’re in.'}
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(230).duration(400)} style={styles.successText}>
        {session.title} with {instructor.name}
        {'\n'}
        {formatShortDay(session.start)} · {formatTime(session.start)} · {session.location}
      </Animated.Text>
      <Animated.View entering={FadeInDown.delay(310).duration(400)} style={styles.paidPill}>
        <Icon name={method === 'credits' ? 'rings' : 'card'} size={14} color={colors.bronze} />
        <Text style={styles.paidText}>
          {waitlist
            ? 'No charge until a spot opens'
            : method === 'credits'
              ? 'Paid with 1 credit'
              : `CHF ${session.priceChf} · ${DEMO_CARD}`}
        </Text>
      </Animated.View>
      <Animated.Text entering={FadeIn.delay(450).duration(400)} style={styles.hint}>
        Demo booking · find it under Nest.
      </Animated.Text>
    </View>
  );
}

const TICKET_PADDING = 22;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  ticket: {
    backgroundColor: colors.oliveDeep,
    borderRadius: radius.lg,
    padding: TICKET_PADDING,
    overflow: 'hidden',
  },
  ticketTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  typeBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketEyebrow: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
  },
  ticketTitle: {
    fontFamily: fonts.light,
    fontSize: 34,
    color: colors.onDark,
    marginTop: 14,
  },
  perforation: {
    height: 20,
    justifyContent: 'center',
    marginVertical: 14,
  },
  perforationLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(246, 241, 234, 0.25)',
  },
  notch: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background,
  },
  notchLeft: {
    left: -TICKET_PADDING - 10,
  },
  notchRight: {
    right: -TICKET_PADDING - 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
  },
  cell: {
    width: '50%',
  },
  cellLabel: {
    fontFamily: fonts.medium,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
  },
  cellValue: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.onDark,
    marginTop: 4,
  },
  instructor: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(246, 241, 234, 0.08)',
  },
  initials: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(246, 241, 234, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    letterSpacing: 1,
    color: colors.onDark,
  },
  instructorName: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.onDark,
  },
  instructorRole: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.onDarkMuted,
    marginTop: 2,
  },
  bioLink: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
  },
  capacity: {
    marginTop: 20,
    gap: 8,
  },
  capacityText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.onDarkMuted,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(246, 241, 234, 0.15)',
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: colors.onDark,
  },
  sectionLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 28,
    marginBottom: 12,
    paddingHorizontal: 6,
  },
  options: {
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
  },
  optionDisabled: {
    opacity: 0.45,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  optionSubtitle: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 3,
  },
  optionPrice: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.ink,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.ink,
  },
  total: {
    marginTop: 20,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontFamily: fonts.light,
    fontSize: 22,
    color: colors.ink,
  },
  totalValue: {
    fontFamily: fonts.medium,
    fontSize: 18,
    color: colors.ink,
  },
  note: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 8,
    paddingHorizontal: 6,
  },
  bookedBox: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  bookedIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookedTitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  bookedText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.background,
  },
  success: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  successBadge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: fonts.light,
    fontSize: 34,
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
  paidPill: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  paidText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkSoft,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginTop: 16,
  },
});
