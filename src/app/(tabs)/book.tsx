import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
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
  getInstructor,
  instructors,
  locations,
  scheduleStart,
  scheduleWeeks,
  sessions,
  weekdayShort,
  type Session,
} from '@/lib/schedule';
import { colors, fonts, radius, TAB_BAR_SPACE } from '@/lib/theme';

const TYPE_TABS = [{ id: 'all', label: 'All' }, ...classTypes.map((type) => ({ id: type.id, label: type.name }))];

type FilterKind = 'instructor' | 'location';

export default function BookScreen() {
  const insets = useSafeAreaInsets();
  const { type = 'all' } = useLocalSearchParams<{ type?: string }>();
  const [week, setWeek] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [instructorId, setInstructorId] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [openFilter, setOpenFilter] = useState<FilterKind | null>(null);

  const { now: nowMs } = useNest();
  const now = new Date(nowMs);
  const todayKey = dayKey(now);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = addDays(scheduleStart, week * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekKeys = days.map(dayKey);

  const matchesFilters = (session: Session) =>
    (type === 'all' || session.typeId === type) &&
    (!instructorId || session.instructorId === instructorId) &&
    (!location || session.location === location);

  const visible = sessions.filter((session) => {
    const key = dayKey(session.start);
    if (!matchesFilters(session)) return false;
    // "Show all" lists what is still bookable this week; a selected day also shows finished classes.
    if (selectedDay) return key === selectedDay;
    return weekKeys.includes(key) && session.start.getTime() > now.getTime();
  });

  const groups = weekKeys
    .map((key, i) => ({ key, date: days[i], items: visible.filter((s) => dayKey(s.start) === key) }))
    .filter((group) => group.items.length > 0);

  const hasFilters = type !== 'all' || instructorId || location;

  function changeWeek(delta: number) {
    setWeek((current) => current + delta);
    setSelectedDay(null);
  }

  function resetFilters() {
    router.setParams({ type: 'all' });
    setInstructorId(null);
    setLocation(null);
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Eyebrow>Classes & events</Eyebrow>
          <Text style={styles.title}>Book</Text>
        </View>

        <View style={styles.monthRow}>
          <Text style={styles.month}>{formatMonth(weekStart)}</Text>
          <View style={styles.monthNav}>
            <Pressable
              onPress={() => {
                setWeek(0);
                setSelectedDay(todayKey);
              }}
              style={[styles.todayButton, selectedDay === todayKey && styles.todayButtonActive]}>
              <Text style={[styles.todayText, selectedDay === todayKey && styles.todayTextActive]}>
                Today
              </Text>
            </Pressable>
            <RoundIconButton
              icon="chevronLeft"
              label="Previous week"
              disabled={week === 0}
              onPress={() => changeWeek(-1)}
            />
            <RoundIconButton
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
            const isToday = key === todayKey;
            const isPast = day.getTime() < todayStart.getTime();
            return (
              <Pressable
                key={key}
                onPress={() => setSelectedDay(selected ? null : key)}
                style={[styles.day, selected && styles.daySelected]}>
                <Text style={[styles.dayName, selected && styles.dayTextSelected, isPast && styles.dayPast]}>
                  {weekdayShort(day)}
                </Text>
                <Text style={[styles.dayNumber, selected && styles.dayTextSelected, isPast && styles.dayPast]}>
                  {day.getDate()}
                </Text>
                <View style={[styles.todayDot, isToday && { backgroundColor: selected ? colors.onDark : colors.bronze }]} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.toolbar}>
          <FilterChip label="Show all" active={!selectedDay} onPress={() => setSelectedDay(null)} />
          <FilterChip
            label={instructorId ? getInstructor(instructorId).name.split(' ')[0] : 'Instructor'}
            active={!!instructorId}
            dropdown
            onPress={() => setOpenFilter('instructor')}
          />
          <FilterChip
            label={location ?? 'Location'}
            active={!!location}
            dropdown
            onPress={() => setOpenFilter('location')}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}>
          {TYPE_TABS.map((tab) => {
            const active = tab.id === type;
            return (
              <Pressable key={tab.id} onPress={() => router.setParams({ type: tab.id })} style={styles.tab}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                <View style={[styles.tabLine, active && styles.tabLineActive]} />
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.list}>
          {groups.map((group) => (
            <Animated.View key={group.key} layout={LinearTransition} entering={FadeIn.duration(300)}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupTitle}>
                  {group.key === todayKey ? 'Today · ' : ''}
                  {formatDay(group.date)}
                </Text>
                <Text style={styles.groupCount}>
                  {group.items.length} {group.items.length === 1 ? 'class' : 'classes'}
                </Text>
              </View>
              <View style={styles.cards}>
                {group.items.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </View>
            </Animated.View>
          ))}

          {groups.length === 0 && (
            <View style={styles.empty}>
              <Icon name="calendar" size={36} color={colors.lineStrong} strokeWidth={1.2} />
              <Text style={styles.emptyTitle}>No classes here</Text>
              <Text style={styles.emptyText}>
                {hasFilters
                  ? `Nothing matches your filters ${selectedDay ? 'on this day' : 'this week'}. Try another day or reset the filters.`
                  : `There is nothing left to book ${selectedDay ? 'on this day' : 'this week'}. Have a look at the next week.`}
              </Text>
              {hasFilters && <Button label="Reset filters" variant="outline" size="sm" onPress={resetFilters} />}
            </View>
          )}
        </View>
      </ScrollView>

      <FilterSheet
        kind={openFilter}
        value={openFilter === 'instructor' ? instructorId : location}
        onClose={() => setOpenFilter(null)}
        onSelect={(value) => {
          if (openFilter === 'instructor') setInstructorId(value);
          else setLocation(value);
          setOpenFilter(null);
        }}
      />
    </View>
  );
}

function RoundIconButton({
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
      onPress={onPress}
      style={({ pressed }) => [styles.roundButton, (disabled || pressed) && { opacity: disabled ? 0.3 : 0.6 }]}>
      <Icon name={icon} size={16} />
    </Pressable>
  );
}

function FilterChip({
  label,
  active,
  dropdown,
  onPress,
}: {
  label: string;
  active: boolean;
  dropdown?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {dropdown && (
        <Icon name="chevronDown" size={12} color={active ? colors.onDark : colors.inkSoft} strokeWidth={1.8} />
      )}
    </Pressable>
  );
}

function FilterSheet({
  kind,
  value,
  onClose,
  onSelect,
}: {
  kind: FilterKind | null;
  value: string | null;
  onClose: () => void;
  onSelect: (value: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const options =
    kind === 'instructor'
      ? [
          { value: null, label: 'All instructors' },
          ...instructors.map((i) => ({ value: i.id, label: i.name })),
        ]
      : [{ value: null, label: 'All locations' }, ...locations.map((l) => ({ value: l, label: l }))];

  return (
    <Modal visible={kind !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetGrabber} />
        <Text style={styles.sheetTitle}>{kind === 'instructor' ? 'Instructors' : 'Locations'}</Text>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.label}
              onPress={() => onSelect(option.value)}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.sand }]}>
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
              {selected && <Icon name="check" size={18} color={colors.bronze} strokeWidth={2} />}
            </Pressable>
          );
        })}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 24,
  },
  title: {
    fontFamily: fonts.light,
    fontSize: 40,
    color: colors.ink,
    marginTop: 6,
  },
  monthRow: {
    marginTop: 20,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  month: {
    fontFamily: fonts.medium,
    fontSize: 13,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  todayButtonActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  todayText: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  todayTextActive: {
    color: colors.onDark,
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayStrip: {
    marginTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 4,
  },
  day: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.md,
    gap: 6,
  },
  daySelected: {
    backgroundColor: colors.ink,
  },
  dayName: {
    fontFamily: fonts.medium,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.muted,
  },
  dayNumber: {
    fontFamily: fonts.medium,
    fontSize: 17,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  dayTextSelected: {
    color: colors.onDark,
  },
  dayPast: {
    opacity: 0.4,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  toolbar: {
    marginTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkSoft,
  },
  chipTextActive: {
    color: colors.onDark,
  },
  tabs: {
    marginTop: 20,
    paddingHorizontal: 24,
    gap: 22,
  },
  tab: {
    paddingTop: 4,
  },
  tabText: {
    fontFamily: fonts.medium,
    fontSize: 11.5,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.ink,
  },
  tabLine: {
    height: 2,
    marginTop: 8,
    borderRadius: 1,
  },
  tabLineActive: {
    backgroundColor: colors.ink,
  },
  list: {
    marginTop: 8,
    paddingHorizontal: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 24,
    paddingBottom: 12,
  },
  groupTitle: {
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  groupCount: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
  },
  cards: {
    gap: 10,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 56,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: fonts.light,
    fontSize: 22,
    color: colors.ink,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 8,
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
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line,
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderRadius: radius.sm,
  },
  optionText: {
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  optionTextSelected: {
    fontFamily: fonts.medium,
  },
});
