import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Button, Eyebrow, Pill } from '@/components/ui';
import { classTypes, type ClassType } from '@/lib/schedule';
import { colors, fonts, radius, TAB_BAR_SPACE } from '@/lib/theme';

export default function ClassesScreen() {
  const insets = useSafeAreaInsets();
  const { focus } = useLocalSearchParams<{ focus?: string }>();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Eyebrow>Classes</Eyebrow>
        <Text style={styles.title}>Three ways{'\n'}to move</Text>
        <Text style={styles.intro}>
          Every practice follows the same full-body sequence of strength, cardio, mobility, and
          breath. What changes is the music, energy, atmosphere, and experience.
        </Text>
      </View>

      <View style={styles.cards}>
        {classTypes
          .filter((type) => type.id !== 'event')
          .map((type, index) => (
            <Animated.View key={type.id} entering={FadeInDown.delay(index * 90).duration(500)}>
              {/* Remount when opened from the home screen so the chosen class starts expanded. */}
              <ClassCard key={focus ?? 'none'} type={type} initiallyOpen={focus === type.id} />
            </Animated.View>
          ))}
      </View>
    </ScrollView>
  );
}

function ClassCard({ type, initiallyOpen }: { type: ClassType; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <Animated.View layout={LinearTransition.duration(250)} style={styles.card}>
      <View style={styles.cardIcon}>
        <Icon name={type.icon} size={54} color={colors.ink} strokeWidth={0.8} />
      </View>
      <Text style={styles.cardLabel}>{type.label}</Text>
      <Text style={styles.cardName}>{type.name}</Text>
      <View style={styles.rule} />

      <View style={styles.features}>
        {type.features.map((feature) => (
          <View key={feature.label} style={styles.feature}>
            <Icon name={feature.icon} size={22} color={colors.inkSoft} strokeWidth={1.1} />
            <Text style={styles.featureText}>{feature.label}</Text>
          </View>
        ))}
      </View>

      <Pill>50 min</Pill>

      {open && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.more}>
          <Text style={styles.tagline}>{type.tagline}</Text>
          {type.description.map((paragraph) => (
            <Text key={paragraph} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
          <Text style={styles.expectTitle}>Expect</Text>
          <Text style={styles.expect}>{type.expect.join(' · ')}</Text>
        </Animated.View>
      )}

      <Button
        label="Book now"
        icon="arrowRight"
        onPress={() => router.navigate({ pathname: '/book', params: { type: type.id } })}
        style={styles.cardButton}
      />
      <Pressable hitSlop={8} onPress={() => setOpen(!open)} style={styles.toggle}>
        <Text style={styles.toggleText}>{open ? 'Show less' : 'Read more'}</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevronDown" size={12} color={colors.bronze} strokeWidth={1.8} />
        </View>
      </Pressable>
    </Animated.View>
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
    lineHeight: 48,
    color: colors.ink,
    marginTop: 6,
  },
  intro: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 24,
    color: colors.inkSoft,
    marginTop: 14,
  },
  cards: {
    marginTop: 28,
    paddingHorizontal: 16,
    gap: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  cardIcon: {
    alignSelf: 'center',
  },
  cardLabel: {
    fontFamily: fonts.regular,
    fontSize: 19,
    letterSpacing: 5,
    textTransform: 'uppercase',
    color: colors.ink,
    textAlign: 'center',
    marginTop: 18,
  },
  cardName: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 6,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.lineStrong,
    marginVertical: 22,
  },
  features: {
    gap: 18,
    marginBottom: 24,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
    paddingHorizontal: 4,
  },
  featureText: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  more: {
    marginTop: 24,
    gap: 12,
  },
  tagline: {
    fontFamily: fonts.medium,
    fontSize: 16,
    lineHeight: 25,
    color: colors.ink,
  },
  paragraph: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 23,
    color: colors.inkSoft,
  },
  expectTitle: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: colors.bronze,
    marginTop: 4,
  },
  expect: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  cardButton: {
    marginTop: 24,
  },
  toggle: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 4,
  },
  toggleText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.bronze,
  },
});
