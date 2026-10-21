import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  interpolateColor,
  SlideInDown,
  useAnimatedStyle,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { AnimatedPressable, PressableScale, useActiveProgress, useFocusFade } from '@/components/motion';
import { SessionCard } from '@/components/session-card';
import { Button, Chip, Eyebrow } from '@/components/ui';
import { useNest } from '@/lib/nest-store';
import {
  addDays,
  classTypes,
  dayKey,
  formatDay,
  formatMonth,
  instructors,
  getSchedule,
  scheduleWeeks,
  weekdayShort,
  type Session,
} from '@/lib/schedule';
import { colors, fonts, radius, TAB_BAR_SPACE } from '@/lib/theme';

const TYPE_CHIPS = [
  { id: 'all', label: 'All' },
  ...classTypes.map((type) => ({ id: type.id, label: type.id === 'event' ? 'Events' : type.name })),
];

export default function BookScreen() {
  const focusStyle = useFocusFade();
  const insets = useSafeAreaInsets();
  const { type = 'all' } = useLocalSearchParams<{ type?: string }>();
  const { now } = useNest();
  const { sessions, start: scheduleStart } = getSchedule(now);
  const today = new Date(now);
  const todayKey = dayKey(today);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const [pickedDay, setPickedDay] = useState(todayKey);
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [stripWidth, setStripWidth] = useState(0);
  const stripRef = useRef<ScrollView>(null);
  // Page the strip is scrolling to on its own; scroll events in between are ignored.
  const scrollTarget = useRef<number | null>(null);

  const weeks = Array.from({ length: scheduleWeeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => addDays(scheduleStart, w * 7 + i))
  );
  // Once the picked day is over (the app stayed open past midnight), today takes its place.
  const pickedStillAhead = weeks
    .flat()
    .some((day) => dayKey(day) === pickedDay && day.getTime() >= todayStart);
  const selectedDay = pickedStillAhead ? pickedDay : todayKey;
  const week = Math.max(
    weeks.findIndex((days) => days.some((day) => dayKey(day) === selectedDay)),
    0
  );
  const weekStart = weeks[week][0];
  const days = weeks[week];
  const activeFilters = instructorId ? 1 : 0;

  // Keep the swipeable strip on the week of the selected day (arrows, "Show …", midnight).
  useEffect(() => {
    if (!stripWidth) return;
    scrollTarget.current = week;
    stripRef.current?.scrollTo({ x: week * stripWidth, animated: true });
  }, [week, stripWidth]);

  const bookable = (session: Session) =>
    session.start.getTime() > now &&
    (type === 'all' || session.typeId === type) &&
    (!instructorId || session.instructorId === instructorId);

  const daySessions = sessions.filter(
    (session) => dayKey(session.start) === selectedDay && bookable(session)
  );
  const selectedDate = days.find((day) => dayKey(day) === selectedDay) ?? today;

  // Opening a week selects today in the current week and Monday in later weeks.
  function firstDayOf(weekIndex: number) {
    return weekIndex === 0 ? todayKey : dayKey(weeks[weekIndex][0]);
  }

  function onStripScroll(x: number) {
    if (!stripWidth) return;
    const page = Math.round(x / stripWidth);
    if (Math.abs(x - page * stripWidth) > 1) return; // still between two weeks
    if (scrollTarget.current !== null) {
      if (page === scrollTarget.current) scrollTarget.current = null;
      return;
    }
    if (page !== week) setPickedDay(firstDayOf(page));
  }

  // Shown when the selected day is empty, so there is always a way forward.
  const nextAvailable =
    daySessions.length === 0
      ? sessions.find(
          (session) =>
            session.start.getTime() >= addDays(selectedDate, 1).getTime() && bookable(session)
        )
      : undefined;

  return (
    <Animated.View style={[styles.screen, focusStyle]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Eyebrow>Classes & events</Eyebrow>
            <Text style={styles.title}>Book</Text>
          </View>
          <PressableScale
            accessibilityLabel="Filter"
            onPress={() => setFiltersOpen(true)}
            style={[styles.filterButton, activeFilters > 0 && styles.filterButtonActive]}>
            <Icon name="sliders" size={20} color={activeFilters > 0 ? colors.onDark : colors.ink} />
            {activeFilters > 0 && (
              <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.badge}>
                <Text style={styles.badgeText}>{activeFilters}</Text>
              </Animated.View>
            )}
          </PressableScale>
        </View>

        <View style={styles.calendar}>
          <View style={styles.monthRow}>
            <Text style={styles.month}>{formatMonth(weekStart)}</Text>
            <View style={styles.monthNav}>
              <ArrowButton
                icon="chevronLeft"
                label="Previous week"
                disabled={week === 0}
                onPress={() => setPickedDay(firstDayOf(week - 1))}
              />
              <ArrowButton
                icon="chevronRight"
                label="Next week"
                disabled={week === scheduleWeeks - 1}
                onPress={() => setPickedDay(firstDayOf(week + 1))}
              />
            </View>
          </View>

          {/* Swipe left and right to move between weeks. */}
          <View
            style={styles.stripViewport}
            onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}>
            {stripWidth > 0 && (
              <ScrollView
                ref={stripRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScrollBeginDrag={() => {
                  scrollTarget.current = null;
                }}
                onScroll={(event) => onStripScroll(event.nativeEvent.contentOffset.x)}>
                {weeks.map((weekDays, weekIndex) => (
                  <View key={weekIndex} style={[styles.dayStrip, { width: stripWidth }]}>
                    {weekDays.map((day) => {
                      const key = dayKey(day);
                      const past = day.getTime() < todayStart;
                      return (
                        <DayPill
                          key={key}
                          date={day}
                          selected={key === selectedDay}
                          isToday={key === todayKey}
                          past={past}
                          hasClasses={sessions.some((s) => dayKey(s.start) === key && bookable(s))}
                          onPress={() => setPickedDay(key)}
                        />
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>

          <View style={styles.pageDots}>
            {weeks.map((_, weekIndex) => (
              <PageDot key={weekIndex} active={weekIndex === week} />
            ))}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {TYPE_CHIPS.map((chip) => (
            <Chip
              key={chip.id}
              label={chip.label}
              active={chip.id === type}
              onPress={() => router.setParams({ type: chip.id })}
            />
          ))}
        </ScrollView>

        <Animated.View key={selectedDay} entering={FadeIn.duration(300)} style={styles.dayHeader}>
          <Text style={styles.dayTitle}>
            {selectedDay === todayKey ? 'Today' : formatDay(selectedDate).split(',')[0]}
          </Text>
          <Text style={styles.dayDate}>{formatDay(selectedDate).split(', ')[1]}</Text>
        </Animated.View>

        {/* Re-keyed on every change so the new list cascades in. */}
        <View key={`${selectedDay}-${type}-${instructorId}`} style={styles.list}>
          {daySessions.map((session, index) => (
            <Animated.View key={session.id} entering={FadeInDown.delay(index * 60).duration(380)}>
              <SessionCard session={session} />
            </Animated.View>
          ))}

          {daySessions.length === 0 && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.empty}>
              <Text style={styles.emptyTitle}>No classes left</Text>
              <Text style={styles.emptyText}>
                {activeFilters > 0 || type !== 'all'
                  ? 'Nothing matches your selection on this day.'
                  : 'There is nothing left to book on this day.'}
              </Text>
              {nextAvailable && (
                <Button
                  label={`Show ${formatDay(nextAvailable.start).split(',')[0]}`}
                  variant="outline"
                  size="sm"
                  onPress={() => setPickedDay(dayKey(nextAvailable.start))}
                />
              )}
            </Animated.View>
          )}
        </View>
      </ScrollView>

      <FilterSheet
        visible={filtersOpen}
        instructorId={instructorId}
        onInstructor={setInstructorId}
        onClose={() => setFiltersOpen(false)}
      />
    </Animated.View>
  );
}

function DayPill({
  date,
  selected,
  isToday,
  past,
  hasClasses,
  onPress,
}: {
  date: Date;
  selected: boolean;
  isToday: boolean;
  past: boolean;
  hasClasses: boolean;
  onPress: () => void;
}) {
  const progress = useActiveProgress(selected);
  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], ['rgba(46, 43, 39, 0)', colors.ink]),
    transform: [{ scale: 0.92 + progress.get() * 0.08 }],
  }));
  const nameStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.get(), [0, 1], [colors.muted, colors.onDark]),
  }));
  const numberStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.get(), [0, 1], [isToday ? colors.bronze : colors.ink, colors.onDark]),
  }));
  const dotStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [colors.lineStrong, colors.onDark]),
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: past }}
      disabled={past}
      onPress={onPress}
      style={[styles.day, pillStyle, past && styles.dayPast]}>
      <Animated.Text style={[styles.dayName, nameStyle]}>{weekdayShort(date).slice(0, 2)}</Animated.Text>
      <Animated.Text style={[styles.dayNumber, numberStyle]}>{date.getDate()}</Animated.Text>
      <Animated.View style={[styles.dot, hasClasses && !past ? dotStyle : null]} />
    </AnimatedPressable>
  );
}

function PageDot({ active }: { active: boolean }) {
  const progress = useActiveProgress(active, 260);
  const style = useAnimatedStyle(() => ({
    width: 5 + progress.get() * 11,
    backgroundColor: interpolateColor(progress.get(), [0, 1], [colors.line, colors.bronze]),
  }));
  return <Animated.View style={[styles.pageDot, style]} />;
}

function ArrowButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevronLeft' | 'chevronRight';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      scaleTo={0.85}
      onPress={onPress}
      style={[styles.arrow, disabled && { opacity: 0.25 }]}>
      <Icon name={icon} size={16} />
    </PressableScale>
  );
}

function FilterSheet({
  visible,
  instructorId,
  onInstructor,
  onClose,
}: {
  visible: boolean;
  instructorId: string | null;
  onInstructor: (id: string | null) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        entering={SlideInDown.springify().damping(20).stiffness(180)}
        style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>Filter</Text>

        <Text style={styles.sheetLabel}>Instructor</Text>
        <View style={styles.options}>
          {instructors.map((instructor) => {
            const selected = instructor.id === instructorId;
            return (
              <Chip
                key={instructor.id}
                label={instructor.name}
                active={selected}
                onPress={() => onInstructor(selected ? null : instructor.id)}
              />
            );
          })}
        </View>

        <View style={styles.sheetButtons}>
          <Button label="Reset" variant="outline" onPress={() => onInstructor(null)} />
          <Button label="Show classes" onPress={onClose} style={styles.flex} />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fonts.light,
    fontSize: 40,
    color: colors.ink,
    marginTop: 6,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  filterButtonActive: {
    backgroundColor: colors.ink,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.bronze,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: colors.onDark,
  },
  calendar: {
    marginTop: 20,
    marginHorizontal: 16,
    padding: 16,
    paddingBottom: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  month: {
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  monthNav: {
    flexDirection: 'row',
    gap: 4,
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripViewport: {
    marginTop: 12,
    minHeight: 72,
  },
  dayStrip: {
    flexDirection: 'row',
    gap: 4,
  },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: 10,
  },
  pageDot: {
    height: 5,
    borderRadius: 3,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    gap: 4,
  },
  dayPast: {
    opacity: 0.3,
  },
  dayName: {
    fontFamily: fonts.medium,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  dayNumber: {
    fontFamily: fonts.medium,
    fontSize: 17,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  chips: {
    marginTop: 16,
    paddingHorizontal: 16,
    gap: 8,
  },
  dayHeader: {
    marginTop: 28,
    marginBottom: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  dayTitle: {
    fontFamily: fonts.light,
    fontSize: 22,
    color: colors.ink,
  },
  dayDate: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  list: {
    paddingHorizontal: 16,
    gap: 10,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 40,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  emptyTitle: {
    fontFamily: fonts.light,
    fontSize: 20,
    color: colors.ink,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 12,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(46, 43, 39, 0.35)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: fonts.light,
    fontSize: 24,
    color: colors.ink,
  },
  sheetLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 22,
    marginBottom: 10,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 28,
  },
});
