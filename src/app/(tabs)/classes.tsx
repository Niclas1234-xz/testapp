import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  interpolateColor,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon, type IconName } from '@/components/icon';
import { AnimatedPressable, PressableScale, useActiveProgress, useFocusFade } from '@/components/motion';
import { Button, Eyebrow } from '@/components/ui';
import { classTypes, type ClassType, type ClassTypeId } from '@/lib/schedule';
import { STUDIO } from '@/lib/studio';
import { colors, fonts, radius, TAB_BAR_SPACE } from '@/lib/theme';

const CLASSES = classTypes.filter((type) => type.id !== 'event');
const SWITCHER_PADDING = 4;
const SWIPE_DISTANCE = 50;

export default function ClassesScreen() {
  const focusStyle = useFocusFade();
  const insets = useSafeAreaInsets();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // The selected class lives in the URL, so the home screen tiles can open a specific one.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const index = Math.max(
    CLASSES.findIndex((type) => type.id === focus),
    0
  );
  const selected = CLASSES[index];

  // Remember which way we moved, so the new class slides in from the matching side.
  const [shown, setShown] = useState({ index, direction: 1 });
  if (shown.index !== index) setShown({ index, direction: index > shown.index ? 1 : -1 });

  function select(id: ClassTypeId) {
    if (id === selected.id) return;
    if (process.env.EXPO_OS !== 'web') Haptics.selectionAsync();
    router.setParams({ focus: id });
  }

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-24, 24])
    .failOffsetY([-14, 14])
    .onEnd((event) => {
      if (event.translationX < -SWIPE_DISTANCE && index < CLASSES.length - 1) select(CLASSES[index + 1].id);
      if (event.translationX > SWIPE_DISTANCE && index > 0) select(CLASSES[index - 1].id);
    });

  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={[styles.screen, focusStyle]}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + TAB_BAR_SPACE }}
      showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.duration(450)} style={styles.header}>
        <Eyebrow>Classes</Eyebrow>
        <Text style={styles.title}>Three ways to move</Text>
        <Text style={styles.intro}>Same full-body sequence. Different music, different energy.</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(450)}>
        <ClassSwitcher index={index} onSelect={select} />
      </Animated.View>

      <GestureDetector gesture={swipe}>
        <View style={styles.page}>
          <ClassPage key={selected.id} type={selected} direction={shown.direction} />
        </View>
      </GestureDetector>

      <Animated.View entering={FadeInDown.delay(240).duration(450)} style={styles.matchSection}>
        <Text style={styles.matchTitle}>Which class is for me?</Text>
        {CLASSES.map((type) => (
          <PressableScale
            key={type.id}
            scaleTo={0.98}
            onPress={() => {
              select(type.id);
              scrollRef.current?.scrollTo({ y: 0, animated: true });
            }}
            style={[styles.matchRow, type.id === selected.id && styles.matchRowActive]}>
            <View style={[styles.matchIcon, { backgroundColor: type.deepColor }]}>
              <Icon name={type.icon} size={18} color={colors.onDark} strokeWidth={1.3} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.matchText}>{type.match}</Text>
              <Text style={[styles.matchName, { color: type.color }]}>{type.name}</Text>
            </View>
            <Icon name="chevronRight" size={16} color={colors.lineStrong} />
          </PressableScale>
        ))}
      </Animated.View>
    </Animated.ScrollView>
  );
}

function ClassSwitcher({ index, onSelect }: { index: number; onSelect: (id: ClassTypeId) => void }) {
  const [width, setWidth] = useState(0);
  const position = useSharedValue(index);
  const segment = width / CLASSES.length;

  useEffect(() => {
    position.set(withSpring(index, { damping: 18, stiffness: 200, mass: 0.8 }));
  }, [index, position]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: segment,
    transform: [{ translateX: position.get() * segment }],
  }));

  return (
    <View
      style={styles.switcher}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width - SWITCHER_PADDING * 2)}>
      {width > 0 && <Animated.View style={[styles.switcherIndicator, indicatorStyle]} />}
      {CLASSES.map((type, i) => (
        <SwitcherItem
          key={type.id}
          label={type.shortName}
          active={i === index}
          onPress={() => onSelect(type.id)}
        />
      ))}
    </View>
  );
}

function SwitcherItem({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const progress = useActiveProgress(active, 240);
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.get(), [0, 1], [colors.muted, colors.ink]),
  }));
  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.switcherItem}>
      <Animated.Text style={[styles.switcherText, textStyle]}>{label}</Animated.Text>
    </AnimatedPressable>
  );
}

function ClassPage({ type, direction }: { type: ClassType; direction: number }) {
  const slideIn = (direction > 0 ? FadeInRight : FadeInLeft).duration(380);

  return (
    <Animated.View entering={slideIn}>
      <View style={[styles.hero, { backgroundColor: type.deepColor }]}>
        <Svg width={220} height={220} style={styles.heroRings}>
          <Circle cx={80} cy={110} r={76} stroke="rgba(246,241,234,0.12)" fill="none" />
          <Circle cx={140} cy={110} r={76} stroke="rgba(246,241,234,0.12)" fill="none" />
        </Svg>
        <View style={styles.heroIcon}>
          <Icon name={type.icon} size={30} color={colors.onDark} strokeWidth={1.1} />
        </View>
        <Text style={styles.heroLabel}>{type.label}</Text>
        <Text style={styles.heroName}>{type.name}</Text>
        <Text style={styles.heroTagline}>{type.tagline}</Text>
        <View style={styles.facts}>
          <Fact icon="clock" text="50 min" />
          <Fact icon="pin" text={STUDIO.city} />
        </View>
      </View>

      <Text style={styles.sectionLabel}>Good for</Text>
      <View style={styles.features}>
        {type.features.map((feature, i) => (
          <Animated.View
            key={feature.label}
            entering={FadeInDown.delay(120 + i * 70).duration(400)}
            style={styles.feature}>
            <View style={styles.featureIcon}>
              <Icon name={feature.icon} size={22} color={type.color} strokeWidth={1.3} />
            </View>
            <Text style={styles.featureText}>{feature.label}</Text>
          </Animated.View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>What to expect</Text>
      <View style={styles.chips}>
        {type.expect.map((item, i) => (
          <Animated.View key={item} entering={FadeIn.delay(220 + i * 45).duration(300)} style={styles.chip}>
            <Text style={styles.chipText}>{item}</Text>
          </Animated.View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>About the class</Text>
      <View style={styles.about}>
        {type.description.map((paragraph) => (
          <Text key={paragraph} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
      </View>

      <Button
        label={`Find a ${type.shortName} class`}
        icon="arrowRight"
        onPress={() => router.navigate({ pathname: '/book', params: { type: type.id } })}
        style={styles.cta}
      />
    </Animated.View>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={14} color={colors.onDark} strokeWidth={1.5} />
      <Text style={styles.factText}>{text}</Text>
    </View>
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
    fontSize: 34,
    color: colors.ink,
    marginTop: 6,
  },
  intro: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkSoft,
    marginTop: 8,
  },
  switcher: {
    marginTop: 22,
    marginHorizontal: 16,
    flexDirection: 'row',
    padding: SWITCHER_PADDING,
    borderRadius: radius.pill,
    backgroundColor: colors.sand,
  },
  switcherIndicator: {
    position: 'absolute',
    top: SWITCHER_PADDING,
    bottom: SWITCHER_PADDING,
    left: SWITCHER_PADDING,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    boxShadow: '0 2px 8px rgba(46, 43, 39, 0.10)',
  },
  switcherItem: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switcherText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  page: {
    marginTop: 18,
    paddingHorizontal: 16,
  },
  hero: {
    borderRadius: radius.lg,
    padding: 24,
    paddingTop: 26,
    overflow: 'hidden',
  },
  heroRings: {
    position: 'absolute',
    top: -50,
    right: -70,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(246, 241, 234, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.onDarkMuted,
    marginTop: 18,
  },
  heroName: {
    fontFamily: fonts.light,
    fontSize: 36,
    color: colors.onDark,
    marginTop: 4,
  },
  heroTagline: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(246, 241, 234, 0.85)',
    marginTop: 10,
  },
  facts: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(246, 241, 234, 0.3)',
  },
  factText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.onDark,
  },
  sectionLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 26,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  features: {
    flexDirection: 'row',
    gap: 10,
  },
  feature: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink,
    textAlign: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.inkSoft,
  },
  about: {
    gap: 10,
    padding: 20,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  paragraph: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  cta: {
    marginTop: 20,
  },
  matchSection: {
    marginTop: 40,
    paddingHorizontal: 16,
    gap: 10,
  },
  matchTitle: {
    fontFamily: fonts.light,
    fontSize: 22,
    color: colors.ink,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surface,
  },
  matchRowActive: {
    borderColor: colors.lineStrong,
  },
  matchIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  matchName: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: 4,
  },
});
