import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { useActiveProgress, useFocusFade } from '@/components/motion';
import { Button, Eyebrow } from '@/components/ui';
import { classTypes, type ClassType } from '@/lib/schedule';
import { colors, fonts, radius, TAB_BAR_SPACE } from '@/lib/theme';

export default function ClassesScreen() {
  const focusStyle = useFocusFade();
  const insets = useSafeAreaInsets();
  const { focus } = useLocalSearchParams<{ focus?: string }>();

  return (
    <Animated.ScrollView
      style={[styles.screen, focusStyle]}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Eyebrow>Classes</Eyebrow>
        <Text style={styles.title}>Three ways{'\n'}to move</Text>
        <Text style={styles.intro}>
          The same full-body sequence every time. What changes is the music - and with it, the energy.
        </Text>
      </View>

      <View style={styles.cards}>
        {classTypes
          .filter((type) => type.id !== 'event')
          .map((type, index) => (
            <Animated.View
              key={type.id}
              entering={FadeInDown.delay(index * 90).duration(500)}
              layout={cardLayout}>
              {/* Remount when opened from the home screen so the chosen class starts expanded. */}
              <ClassCard key={focus ?? 'none'} type={type} initiallyOpen={focus === type.id} />
            </Animated.View>
          ))}
      </View>
    </Animated.ScrollView>
  );
}

// Cards below an expanding card slide down instead of jumping.
const cardLayout = LinearTransition.springify().damping(22).stiffness(200);

function ClassCard({ type, initiallyOpen }: { type: ClassType; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const progress = useActiveProgress(open, 300);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.get() * 180}deg` }],
  }));

  return (
    <Animated.View layout={cardLayout} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconCircle}>
          <Icon name={type.icon} size={30} color={type.color} strokeWidth={1.1} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardLabel}>{type.label}</Text>
          <Text style={styles.cardName}>{type.name} · 50 min</Text>
        </View>
      </View>

      <Text style={styles.tagline}>{type.tagline}</Text>

      <View style={styles.features}>
        {type.features.map((feature) => (
          <View key={feature.label} style={styles.feature}>
            <Icon name={feature.icon} size={15} color={colors.inkSoft} strokeWidth={1.3} />
            <Text style={styles.featureText}>{feature.label}</Text>
          </View>
        ))}
      </View>

      {open && (
        <Animated.View
          entering={FadeIn.delay(120).duration(300)}
          exiting={FadeOut.duration(150)}
          style={styles.more}>
          {type.description.map((paragraph) => (
            <Text key={paragraph} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
          <Text style={styles.expectTitle}>Expect</Text>
          <Text style={styles.paragraph}>{type.expect.join(' · ')}</Text>
        </Animated.View>
      )}

      <View style={styles.cardFooter}>
        <Pressable hitSlop={10} onPress={() => setOpen(!open)} style={styles.toggle}>
          <Text style={styles.toggleText}>{open ? 'Less' : 'More'}</Text>
          <Animated.View style={chevronStyle}>
            <Icon name="chevronDown" size={12} color={colors.bronze} strokeWidth={1.8} />
          </Animated.View>
        </Pressable>
        <Button
          label="See times"
          size="sm"
          icon="arrowRight"
          onPress={() => router.navigate({ pathname: '/book', params: { type: type.id } })}
        />
      </View>
    </Animated.View>
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
    marginTop: 12,
  },
  cards: {
    marginTop: 28,
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontFamily: fonts.regular,
    fontSize: 14,
    letterSpacing: 3.5,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  cardName: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  tagline: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkSoft,
    marginTop: 16,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
  },
  featureText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.inkSoft,
  },
  more: {
    marginTop: 18,
    gap: 10,
  },
  paragraph: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
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
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  toggleText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.bronze,
  },
});
