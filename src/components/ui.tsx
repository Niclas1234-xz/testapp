import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
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
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  style,
}: ButtonProps) {
  const palette = buttonColors[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSmall,
        { backgroundColor: palette.background, borderColor: palette.border },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.75 },
        style,
      ]}>
      <Text
        style={[styles.buttonLabel, size === 'sm' && styles.buttonLabelSmall, { color: palette.text }]}>
        {label}
      </Text>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 18} color={palette.text} />}
    </Pressable>
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
