import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { SessionCard } from '@/components/session-card';
import { Button, Eyebrow } from '@/components/ui';
import { useNest } from '@/lib/nest-store';
import {
  addDays,
  classTypes,
  dayKey,
  formatDay,
  formatMonth,
  instructors,
  locations,
  scheduleStart,
  scheduleWeeks,
  sessions,
  weekdayShort,
  type Session,
} from '@/lib/schedule';
import { colors, fonts, radius, TAB_BAR_SPACE } from '@/lib/theme';

const TYPE_CHIPS = [
  { id: 'all', label: 'All' },
  ...classTypes.map((type) => ({ id: type.id, label: type.id === 'event' ? 'Events' : type.name })),
];

export default function BookScreen() {
  const insets = useSafeAreaInsets();
  const { type = 'all' } = useLocalSearchParams<{ type?: string }>();
  const { now } = useNest();
  const today = new Date(now);
  const todayKey = dayKey(today);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const [week, setWeek] = useState(0);
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const weekStart = addDays(scheduleStart, week * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const activeFilters = (instructorId ? 1 : 0) + (location ? 1 : 0);

  const bookable = (session: Session) =>
    session.start.getTime() > now &&
    (type === 'all' || session.typeId === type) &&
    (!instructorId || session.instructorId === instructorId) &&
    (!location || session.location === location);

  const daySessions = sessions.filter(
    (session) => dayKey(session.start) === selectedDay && bookable(session)
  );
  const selectedDate = days.find((day) => dayKey(day) === selectedDay) ?? today;

  function changeWeek(delta: number) {
    const next = week + delta;
    setWeek(next);
    setSelectedDay(next === 0 ? todayKey : dayKey(addDays(scheduleStart, next * 7)));
  }

  // Shown when the selected day is empty, so there is always a way forward.
  const nextAvailable =
    daySessions.length === 0
      ? sessions.find(
          (session) =>
            session.start.getTime() >= addDays(selectedDate, 1).getTime() && bookable(session)
        )
      : undefined;

  function showDay(date: Date) {
    const weekIndex = Math.floor((date.getTime() - scheduleStart.getTime()) / (7 * 86_400_000));
    setWeek(Math.min(weekIndex, scheduleWeeks - 1));
    setSelectedDay(dayKey(date));
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Eyebrow>Classes & events</Eyebrow>
            <Text style={styles.title}>Book</Text>
          </View>
          <Pressable
            accessibilityLabel="Filter"
            onPress={() => setFiltersOpen(true)}
            style={[styles.filterButton, activeFilters > 0 && styles.filterButtonActive]}>
            <Icon name="sliders" size={20} color={activeFilters > 0 ? colors.onDark : colors.ink} />
            {activeFilters > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{activeFilters}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.calendar}>
          <View style={styles.monthRow}>
            <Text style={styles.month}>{formatMonth(weekStart)}</Text>
            <View style={styles.monthNav}>
              <ArrowButton
                icon="chevronLeft"
                label="Previous week"
                disabled={week === 0}
                onPress={() => changeWeek(-1)}
              />
              <ArrowButton
                icon="chevronRight"
                label="Next week"
                disabled={week === scheduleWeeks - 1}
                onPress={() => changeWeek(1)}
              />
            </View>
          </View>

          <View style={styles.dayStrip}>
            {days.map((day) => {
              const key = dayKey(day);
              const selected = key === selectedDay;
              const past = day.getTime() < todayStart;
              const hasClasses = sessions.some((s) => dayKey(s.start) === key && bookable(s));
              return (
                <Pressable
                  key={key}
                  disabled={past}
                  onPress={() => setSelectedDay(key)}
                  style={[styles.day, selected && styles.daySelected, past && styles.dayPast]}>
                  <Text style={[styles.dayName, selected && styles.dayTextSelected]}>
                    {weekdayShort(day).slice(0, 2)}
                  </Text>
                  <Text
                    style={[
                      styles.dayNumber,
                      key === todayKey && styles.dayToday,
                      selected && styles.dayTextSelected,
                    ]}>
                    {day.getDate()}
                  </Text>
                  <View
                    style={[
                      styles.dot,
                      hasClasses && !past && { backgroundColor: selected ? colors.onDark : colors.lineStrong },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {TYPE_CHIPS.map((chip) => {
            const active = chip.id === type;
            return (
              <Pressable
                key={chip.id}
                onPress={() => router.setParams({ type: chip.id })}
                style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle}>
            {selectedDay === todayKey ? 'Today' : formatDay(selectedDate).split(',')[0]}
          </Text>
          <Text style={styles.dayDate}>{formatDay(selectedDate).split(', ')[1]}</Text>
        </View>

        <Animated.View key={`${selectedDay}-${type}-${instructorId}-${location}`} entering={FadeIn.duration(250)} style={styles.list}>
          {daySessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}

          {daySessions.length === 0 && (
            <View style={styles.empty}>
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
                  onPress={() => showDay(nextAvailable.start)}
                />
              )}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <FilterSheet
        visible={filtersOpen}
        instructorId={instructorId}
        location={location}
        onInstructor={setInstructorId}
        onLocation={setLocation}
        onClose={() => setFiltersOpen(false)}
      />
    </View>
  );
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
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.arrow, (disabled || pressed) && { opacity: disabled ? 0.25 : 0.6 }]}>
      <Icon name={icon} size={16} />
    </Pressable>
  );
}

function FilterSheet({
  visible,
  instructorId,
  location,
  onInstructor,
  onLocation,
  onClose,
}: {
  visible: boolean;
  instructorId: string | null;
  location: string | null;
  onInstructor: (id: string | null) => void;
  onLocation: (location: string | null) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>Filter</Text>

        <Text style={styles.sheetLabel}>Instructor</Text>
        <View style={styles.options}>
          {instructors.map((instructor) => {
            const selected = instructor.id === instructorId;
            return (
              <Pressable
                key={instructor.id}
                onPress={() => onInstructor(selected ? null : instructor.id)}
                style={[styles.chip, selected && styles.chipActive]}>
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{instructor.name}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sheetLabel}>Location</Text>
        <View style={styles.options}>
          {locations.map((name) => {
            const selected = name === location;
            return (
              <Pressable
                key={name}
                onPress={() => onLocation(selected ? null : name)}
                style={[styles.chip, selected && styles.chipActive]}>
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{name}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.sheetButtons}>
          <Button
            label="Reset"
            variant="outline"
            onPress={() => {
              onInstructor(null);
              onLocation(null);
            }}
          />
          <Button label="Show classes" onPress={onClose} style={styles.flex} />
        </View>
      </View>
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
  dayStrip: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 4,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    gap: 4,
  },
  daySelected: {
    backgroundColor: colors.ink,
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
  dayToday: {
    color: colors.bronze,
  },
  dayTextSelected: {
    color: colors.onDark,
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
  chip: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  chipTextActive: {
    color: colors.onDark,
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
