import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { SessionCard } from '@/components/session-card';
import { Button, Eyebrow } from '@/components/ui';
import { useNest } from '@/lib/nest-store';
import { classTypes, sessions } from '@/lib/schedule';
import { colors, fonts, radius, TAB_BAR_SPACE } from '@/lib/theme';

function greeting(now: number) {
  const hour = new Date(now).getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, isBooked, now } = useNest();
  const upcoming = sessions.filter((session) => session.start.getTime() > now);
  const nextBooking = upcoming.find((session) => isBooked(session.id));
  const upNext = upcoming.filter((session) => session.id !== nextBooking?.id).slice(0, 3);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
      showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>
            {greeting(now)}
            {user ? `, ${user.name}` : ''}
          </Text>
          <Text style={styles.wordmark}>THE WELLNEST</Text>
        </View>
        <PressableScale
          accessibilityLabel="Profile"
          onPress={() => router.navigate('/profile')}
          style={styles.roundButton}>
          <Icon name="user" size={18} />
        </PressableScale>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(600)} style={styles.hero}>
        <Svg width={240} height={240} style={styles.heroRings}>
          <Circle cx={92} cy={120} r={84} stroke="rgba(246,241,234,0.16)" strokeWidth={1} fill="none" />
          <Circle cx={148} cy={120} r={84} stroke="rgba(246,241,234,0.16)" strokeWidth={1} fill="none" />
        </Svg>
        <Eyebrow color={colors.onDarkMuted}>Move · Feel · Connect</Eyebrow>
        <Text style={styles.heroTitle}>Get out of your head and into your body.</Text>
        <Button
          label="Book a class"
          variant="light"
          icon="arrowRight"
          onPress={() => router.navigate('/book')}
          style={styles.heroButton}
        />
      </Animated.View>

      {nextBooking && (
        <Section title="Your next class" delay={160}>
          <SessionCard session={nextBooking} showDay />
        </Section>
      )}

      <Section
        title="Up next"
        delay={nextBooking ? 240 : 160}
        action={
          <Pressable hitSlop={10} onPress={() => router.navigate('/book')} style={styles.link}>
            <Text style={styles.linkText}>All classes</Text>
            <Icon name="arrowRight" size={14} color={colors.bronze} />
          </Pressable>
        }>
        <View style={styles.list}>
          {upNext.map((session) => (
            <Animated.View key={session.id} layout={LinearTransition}>
              <SessionCard session={session} showDay />
            </Animated.View>
          ))}
        </View>
      </Section>

      <Section title="Explore" delay={nextBooking ? 320 : 240}>
        <View style={styles.tiles}>
          {classTypes
            .filter((type) => type.id !== 'event')
            .map((type) => (
              <PressableScale
                key={type.id}
                scaleTo={0.94}
                onPress={() => router.navigate({ pathname: '/classes', params: { focus: type.id } })}
                style={styles.tile}>
                <Icon name={type.icon} size={30} color={type.color} strokeWidth={1.1} />
                <Text style={styles.tileText} numberOfLines={1}>
                  {type.name}
                </Text>
              </PressableScale>
            ))}
        </View>
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  action,
  delay = 0,
  children,
}: {
  title: string;
  action?: ReactNode;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(550)}
      layout={LinearTransition}
      style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  greeting: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginBottom: 4,
  },
  wordmark: {
    fontFamily: fonts.light,
    fontSize: 20,
    letterSpacing: 6,
    color: colors.ink,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    marginHorizontal: 16,
    borderRadius: radius.lg + 4,
    backgroundColor: colors.oliveDeep,
    padding: 28,
    paddingTop: 32,
    overflow: 'hidden',
  },
  heroRings: {
    position: 'absolute',
    top: -50,
    right: -80,
  },
  heroTitle: {
    fontFamily: fonts.light,
    fontSize: 32,
    lineHeight: 40,
    color: colors.onDark,
    marginTop: 14,
    letterSpacing: -0.3,
  },
  heroButton: {
    marginTop: 28,
  },
  section: {
    marginTop: 36,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: fonts.light,
    fontSize: 22,
    color: colors.ink,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linkText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.bronze,
  },
  list: {
    gap: 10,
  },
  tiles: {
    flexDirection: 'row',
    gap: 10,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
    paddingVertical: 22,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  tileText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
  },
});
