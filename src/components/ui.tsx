import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { AnimatedPressable, PressableScale, useActiveProgress } from '@/components/motion';
import { initials } from '@/lib/schedule';
import { colors, fonts, radius } from '@/lib/theme';

type ButtonVariant = 'primary' | 'light' | 'outline' | 'outlineLight';

const buttonColors: Record<ButtonVariant, { background: string; border: string; text: string }> = {
  primary: { background: colors.ink, border: colors.ink, text: colors.onDark },
  light: { background: colors.onDark, border: colors.onDark, text: colors.ink },
  outline: { background: 'transparent', border: colors.lineStrong, text: colors.ink },
  outlineLight: { background: 'transparent', border: 'rgba(246, 241, 234, 0.4)', text: colors.onDark },
};

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: IconName;
  disabled?: boolean;
  /** Shows a spinner instead of the label and ignores presses. */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  loading,
  style,
}: ButtonProps) {
  const palette = buttonColors[variant];
  return (
    <PressableScale
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        size === 'sm' && styles.buttonSmall,
        { backgroundColor: palette.background, borderColor: palette.border },
        disabled && { opacity: 0.4 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <>
          <Text
            style={[styles.buttonLabel, size === 'sm' && styles.buttonLabelSmall, { color: palette.text }]}>
            {label}
          </Text>
          {icon && <Icon name={icon} size={size === 'sm' ? 14 : 18} color={palette.text} />}
        </>
      )}
    </PressableScale>
  );
}

/** Selectable pill whose fill fades between states. */
export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const progress = useActiveProgress(active);
  const containerStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], ['rgba(46, 43, 39, 0)', colors.ink]),
    borderColor: interpolateColor(progress.get(), [0, 1], [colors.line, colors.ink]),
  }));
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.get(), [0, 1], [colors.inkSoft, colors.onDark]),
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, containerStyle]}>
      <Animated.Text style={[styles.chipText, textStyle]}>{label}</Animated.Text>
    </AnimatedPressable>
  );
}

export function Eyebrow({ children, color = colors.bronze }: { children: ReactNode; color?: string }) {
  return <Text style={[styles.eyebrow, { color }]}>{children}</Text>;
}

export function Avatar({ name, size = 40, tint = colors.sand }: { name: string; size?: number; tint?: string }) {
  return (
    <View
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.34 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 52,
    paddingHorizontal: 24,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  buttonSmall: {
    height: 36,
    paddingHorizontal: 16,
    gap: 6,
  },
  buttonLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  buttonLabelSmall: {
    fontSize: 10.5,
    letterSpacing: 1.6,
  },
  chip: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  eyebrow: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    letterSpacing: 1,
  },
});
