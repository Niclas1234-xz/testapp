import { useFocusEffect, useNavigation, useRoute } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * With "reduce motion" or battery saver on, Reanimated jumps animations straight to their end
 * by default. The app's fades and colour changes are not motion in the accessibility sense,
 * so they opt out of that and always play.
 */
export const ALWAYS = ReduceMotion.Never;

const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6, reduceMotion: ALWAYS };

/** 0 → 1 while `active`, eased, for colour and size transitions between states. */
export function useActiveProgress(active: boolean, duration = 220) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(active ? 1 : 0, { duration, reduceMotion: ALWAYS }));
  }, [active, duration, progress]);
  return progress;
}

const FOCUS_FADE = 320;

/**
 * Fade-and-rise when you switch to a tab screen. Replaces the tab navigator's own fade, which
 * could leave a screen invisible after quick tab switches. Coming back from a modal (e.g. the
 * booking screen) does not fade, and a timer makes sure the screen always ends up fully visible.
 */
export function useFocusFade() {
  const navigation = useNavigation();
  const route = useRoute();
  // Starts hidden so the first visit fades in without a flash of the finished screen.
  const progress = useSharedValue(0);
  const cameFromOtherTab = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (cameFromOtherTab.current) {
        progress.set(0);
        progress.set(
          withTiming(1, { duration: FOCUS_FADE, easing: Easing.out(Easing.cubic), reduceMotion: ALWAYS })
        );
      } else {
        progress.set(1);
      }
      const safety = setTimeout(() => progress.set(1), FOCUS_FADE + 400);
      return () => {
        clearTimeout(safety);
        // Leaving for another tab changes the tab navigator's active route; a modal on top of the
        // tabs does not.
        const state = navigation.getState();
        cameFromOtherTab.current = !state || state.routes[state.index]?.key !== route.key;
      };
    }, [navigation, progress, route.key])
  );
  return useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * 10 }],
  }));
}

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** How far the element shrinks while pressed. */
  scaleTo?: number;
};

/** Pressable that gently shrinks while pressed and springs back on release. */
export function PressableScale({ style, scaleTo = 0.97, onPressIn, onPressOut, ...props }: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        scale.set(withSpring(scaleTo, PRESS_SPRING));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withSpring(1, PRESS_SPRING));
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    />
  );
}
