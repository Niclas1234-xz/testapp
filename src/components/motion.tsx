import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

/** 0 → 1 while `active`, eased, for colour and size transitions between states. */
export function useActiveProgress(active: boolean, duration = 220) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(active ? 1 : 0, { duration }));
  }, [active, duration, progress]);
  return progress;
}

/**
 * Soft fade-and-rise each time a tab screen comes into focus. Replaces the tab navigator's own
 * fade, which could leave a screen invisible after quick tab switches. Opacity never drops
 * below 0.4, so even an interrupted animation cannot hide the screen.
 */
export function useFocusFade() {
  const progress = useSharedValue(1);
  useFocusEffect(
    useCallback(() => {
      progress.set(0);
      progress.set(withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }));
    }, [progress])
  );
  return useAnimatedStyle(() => ({
    opacity: 0.4 + 0.6 * progress.get(),
    transform: [{ translateY: (1 - progress.get()) * 8 }],
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
