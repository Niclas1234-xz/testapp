import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { WORDMARK, WORDMARK_RATIO } from '@/components/logo';
import { colors, fonts } from '@/lib/theme';

const LOGO_WIDTH = 240;
const LOGO_HEIGHT = LOGO_WIDTH / WORDMARK_RATIO;
// Soft leading edge of the cream curtain that wipes across the logo.
const EDGE = 48;
const EDGE_STEPS = 12;

const REVEAL = 1300;
const HOLD = 800;
const EXIT = 550;
// How long to wait for the logo image before animating the text version instead.
const IMAGE_TIMEOUT = 1200;
// Taps this early are most likely left over from opening the app, not a wish to skip.
const SKIP_AFTER = 700;

// A wipe and a fade, so it also plays with "reduce motion" on (Reanimated would otherwise jump
// every animation straight to its end).
const never = ReduceMotion.Never;

type Mode = 'waiting' | 'image' | 'text';

/**
 * Start-up animation: the Wellnest wordmark is uncovered from left to right by a soft-edged
 * curtain, settles, then fades into the app. Tap to skip.
 *
 * It lives in a Modal so it always sits above the navigator, and only starts once that Modal is
 * on screen and the logo is ready.
 */
export function Intro({ onShown, onDone }: { onShown: () => void; onDone: () => void }) {
  const [shown, setShown] = useState(false);
  const [mode, setMode] = useState<Mode>('waiting');
  const reveal = useSharedValue(0);
  const settle = useSharedValue(0);
  const exit = useSharedValue(0);
  const shownOnce = useRef(false);
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

  function show() {
    if (shownOnce.current) return;
    shownOnce.current = true;
    setShown(true);
    onShown();
  }

  // Start once the Modal is visible and we know whether the image or the text version is shown.
  useEffect(() => {
    if (!shown || mode === 'waiting' || startedAt.current !== null) return;
    startedAt.current = Date.now();
    reveal.set(
      withDelay(150, withTiming(1, { duration: REVEAL, easing: Easing.inOut(Easing.cubic), reduceMotion: never }), never)
    );
    settle.set(
      withDelay(150, withTiming(1, { duration: REVEAL + 300, easing: Easing.out(Easing.cubic), reduceMotion: never }), never)
    );
    timer.current = setTimeout(() => finish(EXIT), 150 + REVEAL + HOLD);
    // finish only touches refs and shared values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, mode]);

  // Fall back to the text logo if the image is slow, and never keep the app covered for long.
  useEffect(() => {
    if (!shown) return;
    const imageTimeout = setTimeout(() => setMode((m) => (m === 'waiting' ? 'text' : m)), IMAGE_TIMEOUT);
    return () => clearTimeout(imageTimeout);
  }, [shown]);

  useEffect(() => {
    // Safety nets in case the Modal never reports that it is shown.
    const showFallback = setTimeout(show, 800);
    const hardStop = setTimeout(onDone, 7000);
    return () => {
      clearTimeout(showFallback);
      clearTimeout(hardStop);
      if (timer.current) clearTimeout(timer.current);
    };
    // Mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function skip() {
    if (startedAt.current === null || Date.now() - startedAt.current < SKIP_AFTER) return;
    finish(300);
  }

  const curtainStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reveal.get() * (LOGO_WIDTH + EDGE) }],
  }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, settle.get() * 2.5) * (1 - exit.get()),
    transform: [{ scale: 0.96 + settle.get() * 0.04 + exit.get() * 0.03 }],
  }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.get() }));

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={show}
      onRequestClose={() => finish(300)}>
      <Animated.View style={[styles.overlay, overlayStyle]}>
        <Pressable accessibilityLabel="Skip intro" style={styles.center} onPress={skip}>
          <Animated.View style={[styles.logo, logoStyle]}>
            {mode === 'text' ? (
              <Text style={styles.text}>THE WELLNEST</Text>
            ) : (
              <Image
                source={WORDMARK}
                accessibilityLabel="The Wellnest"
                contentFit="contain"
                onLoad={() => setMode((m) => (m === 'waiting' ? 'image' : m))}
                onError={() => setMode('text')}
                style={styles.image}
              />
            )}
            {/* Cream curtain with a soft leading edge, sliding off to the right. */}
            <Animated.View style={[styles.curtain, curtainStyle]}>
              {Array.from({ length: EDGE_STEPS }, (_, i) => (
                <View
                  key={i}
                  style={[styles.edgeStep, { opacity: (i + 1) / (EDGE_STEPS + 1) }]}
                />
              ))}
              <View style={styles.curtainSolid} />
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
    justifyContent: 'center',
  },
  image: {
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
  text: {
    fontFamily: fonts.light,
    fontSize: 19,
    letterSpacing: 5,
    color: colors.ink,
    textAlign: 'center',
  },
  curtain: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -EDGE,
    width: LOGO_WIDTH + EDGE + 4,
    flexDirection: 'row',
  },
  edgeStep: {
    width: EDGE / EDGE_STEPS,
    backgroundColor: colors.background,
  },
  curtainSolid: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
