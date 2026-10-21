import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
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

const DURATION = 2700;
const EXIT = 550;

/**
 * Start-up animation shown over the app: two rings draw themselves and interlock, the Wellnest
 * logo rises in, then everything fades away. Tap to skip.
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const draw = useSharedValue(0);
  const join = useSharedValue(0);
  const logo = useSharedValue(0);
  const tagline = useSharedValue(0);
  const exit = useSharedValue(0);
  const finished = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function finish(after: number) {
    if (finished.current) return;
    finished.current = true;
    if (timer.current) clearTimeout(timer.current);
    exit.set(withTiming(1, { duration: after, easing: Easing.inOut(Easing.quad) }));
    timer.current = setTimeout(onDone, after);
  }

  useEffect(() => {
    if (reduceMotion) {
      draw.set(1);
      join.set(1);
      logo.set(1);
      tagline.set(1);
    } else {
      draw.set(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.cubic) }));
      join.set(withDelay(550, withSpring(1, { damping: 15, stiffness: 80 })));
      logo.set(withDelay(1000, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) })));
      tagline.set(withDelay(1350, withTiming(1, { duration: 600 })));
    }
    timer.current = setTimeout(
      () => {
        timer.current = null;
        finish(EXIT);
      },
      reduceMotion ? 900 : DURATION - EXIT
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // Runs once on mount; the shared values and `finish` are stable for the intro's lifetime.
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
    <Animated.View style={[styles.overlay, overlayStyle]}>
      <Pressable accessibilityLabel="Skip intro" style={styles.fill} onPress={() => finish(300)}>
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
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  fill: {
    flex: 1,
  },
  content: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  logo: {
    marginTop: 10,
  },
});
