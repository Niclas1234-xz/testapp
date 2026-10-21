import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Wordmark } from '@/components/logo';
import { Eyebrow } from '@/components/ui';
import { colors } from '@/lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const WIDTH = 160;
const HEIGHT = 84;
// Horizontal distance of each ring from the centre: apart at first, then interlocked like the
// rings on the website's Signature Class card.
const APART = 44;
const TOGETHER = 19;

const DURATION = 2800;
const EXIT = 550;
// Taps this early are most likely left over from opening the app, not a wish to skip.
const SKIP_AFTER = 700;

// The intro is mostly drawing and fading, so it also plays with "reduce motion" switched on
// (Reanimated would otherwise jump every animation straight to its end). Only the sliding of
// the rings is left out then.
const never = ReduceMotion.Never;
const ease = Easing.out(Easing.cubic);

/**
 * Start-up animation: two rings draw themselves and interlock, the Wellnest logo rises in,
 * then everything fades away. Tap to skip.
 *
 * It lives in a Modal so it is guaranteed to sit above the navigator on iOS and Android, and
 * its clock only starts once that Modal is actually on screen.
 */
export function Intro({ onShown, onDone }: { onShown: () => void; onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const draw = useSharedValue(0);
  const join = useSharedValue(0);
  const logo = useSharedValue(0);
  const tagline = useSharedValue(0);
  const exit = useSharedValue(0);
  const startedAt = useRef<number | null>(null);
  const finished = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function finish(after: number) {
    if (finished.current) return;
    finished.current = true;
    if (timer.current) clearTimeout(timer.current);
    exit.set(withTiming(1, { duration: after, easing: Easing.inOut(Easing.quad), reduceMotion: never }));
    timer.current = setTimeout(onDone, after);
  }

  function start() {
    if (startedAt.current !== null) return;
    startedAt.current = Date.now();
    onShown();
    draw.set(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.cubic), reduceMotion: never }));
    join.set(
      reduceMotion ? 1 : withDelay(550, withSpring(1, { damping: 15, stiffness: 80, reduceMotion: never }), never)
    );
    logo.set(withDelay(1000, withTiming(1, { duration: 650, easing: ease, reduceMotion: never }), never));
    tagline.set(withDelay(1350, withTiming(1, { duration: 600, reduceMotion: never }), never));
    timer.current = setTimeout(() => finish(EXIT), DURATION - EXIT);
  }

  function skip() {
    if (startedAt.current === null || Date.now() - startedAt.current < SKIP_AFTER) return;
    finish(300);
  }

  useEffect(() => {
    // Safety nets: start even if the Modal never reports that it is shown, and never keep the
    // app covered for long.
    const fallback = setTimeout(start, 800);
    const hardStop = setTimeout(onDone, 7000);
    return () => {
      clearTimeout(fallback);
      clearTimeout(hardStop);
      if (timer.current) clearTimeout(timer.current);
    };
    // Mount-only: the shared values are stable and the handlers only read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leftRing = useAnimatedProps(() => ({
    cx: WIDTH / 2 - (APART + (TOGETHER - APART) * join.get()),
    strokeDashoffset: CIRCUMFERENCE * (1 - draw.get()),
  }));
  const rightRing = useAnimatedProps(() => ({
    cx: WIDTH / 2 + (APART + (TOGETHER - APART) * join.get()),
    strokeDashoffset: -CIRCUMFERENCE * (1 - draw.get()),
  }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.get() }));
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + exit.get() * 0.06 }],
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logo.get(),
    transform: [{ translateY: (1 - logo.get()) * 14 }],
  }));
  const taglineStyle = useAnimatedStyle(() => ({ opacity: tagline.get() }));

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={start}
      onRequestClose={() => finish(300)}>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable accessibilityLabel="Skip intro" style={styles.fill} onPress={skip}>
          <Animated.View style={[styles.content, contentStyle]}>
            <Svg width={WIDTH} height={HEIGHT}>
              {[leftRing, rightRing].map((animatedProps, index) => (
                <AnimatedCircle
                  key={index}
                  cy={HEIGHT / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={colors.ink}
                  strokeWidth={1.2}
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  animatedProps={animatedProps}
                />
              ))}
            </Svg>
            <Animated.View style={[styles.logo, logoStyle]}>
              <Wordmark height={22} />
            </Animated.View>
            <Animated.View style={taglineStyle}>
              <Eyebrow>Move · Feel · Connect</Eyebrow>
            </Animated.View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fill: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  logo: {
    marginTop: 10,
  },
});
