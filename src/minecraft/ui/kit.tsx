import { useState, type ReactNode } from 'react';
import {
  Image,
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { backgroundTexture, itemIcon } from '../icons';
import { durabilityOf, type Slot } from '../inventory';
import { item } from '../items';
import { tile } from '../textures/atlas';

export const MC_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/** Text with Minecraft's drop shadow. */
export function McText({
  children,
  style,
  color = '#FFFFFF',
  size = 14,
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  color?: string;
  size?: number;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          color,
          fontSize: size,
          fontFamily: MC_FONT,
          fontWeight: '700',
          textShadowColor: color === '#FFFFFF' ? '#3F3F3F' : 'rgba(0,0,0,0.35)',
          textShadowOffset: { width: size / 8, height: size / 8 },
          textShadowRadius: 0.1,
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

/** Gray stone button with bevel, like Minecraft menus. */
export function McButton({
  label,
  onPress,
  disabled,
  style,
  small,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        (hover || pressed) && !disabled && styles.buttonHover,
        disabled && styles.buttonDisabled,
        style,
      ]}>
      <View style={styles.buttonInner}>
        <McText size={small ? 13 : 15} color={disabled ? '#A0A0A0' : hover ? '#FFFFA0' : '#FFFFFF'} numberOfLines={1}>
          {label}
        </McText>
      </View>
    </Pressable>
  );
}

/** Dark dirt background used by all menu screens. */
export function DirtBackground({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const uri = backgroundTexture(tile('dirt'), 0.3);
  return (
    <ImageBackground source={{ uri }} resizeMode="repeat" style={[styles.fill, style]} imageStyle={styles.pixelated}>
      {children}
    </ImageBackground>
  );
}

/** Light gray inventory panel with bevelled border. */
export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function McInput({
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numbers-and-punctuation';
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#707070"
      keyboardType={keyboardType}
      autoCorrect={false}
      style={styles.input}
    />
  );
}

/** One inventory slot with item icon, count and durability bar. */
export function ItemSlot({
  slot,
  size,
  selected,
  onPress,
  onLongPress,
  dark,
}: {
  slot: Slot;
  size: number;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  dark?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[
        styles.slot,
        { width: size, height: size },
        dark && styles.slotDark,
        selected && styles.slotSelected,
      ]}>
      <ItemView slot={slot} size={size} />
    </Pressable>
  );
}

export function ItemView({ slot, size }: { slot: Slot; size: number }) {
  if (!slot) return null;
  const def = item(slot.id);
  const dur = def?.tool ? durabilityOf(slot) : 0;
  const frac = dur > 0 ? 1 - slot.damage / dur : 1;
  return (
    <View style={styles.itemWrap} pointerEvents="none">
      <Image source={{ uri: itemIcon(slot.id) }} style={[{ width: size * 0.8, height: size * 0.8 }, styles.pixelated]} />
      {slot.count > 1 && (
        <McText size={Math.max(10, size * 0.3)} style={styles.count}>
          {slot.count}
        </McText>
      )}
      {dur > 0 && slot.damage > 0 && (
        <View style={[styles.durTrack, { width: size * 0.7, bottom: size * 0.08 }]}>
          <View
            style={{
              width: `${Math.max(0, frac) * 100}%`,
              height: '100%',
              backgroundColor: `hsl(${Math.round(frac * 120)}, 100%, 50%)`,
            }}
          />
        </View>
      )}
    </View>
  );
}

export const styles = StyleSheet.create({
  fill: { flex: 1 },
  pixelated: Platform.OS === 'web' ? ({ imageRendering: 'pixelated' } as object) : {},
  button: {
    height: 40,
    minWidth: 200,
    backgroundColor: '#6F6F6F',
    borderWidth: 2,
    borderColor: '#000000',
    justifyContent: 'center',
  },
  buttonSmall: { height: 34, minWidth: 120 },
  buttonInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderTopColor: '#AAAAAA',
    borderLeftColor: '#AAAAAA',
    borderBottomColor: '#555555',
    borderRightColor: '#555555',
    paddingHorizontal: 10,
  },
  buttonHover: { backgroundColor: '#7E86BE', borderColor: '#FFFFFF' },
  buttonDisabled: { backgroundColor: '#2C2C2C' },
  panel: {
    backgroundColor: '#C6C6C6',
    borderWidth: 3,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderBottomColor: '#555555',
    borderRightColor: '#555555',
    padding: 8,
    borderRadius: 3,
  },
  input: {
    height: 40,
    minWidth: 260,
    backgroundColor: '#000000',
    borderWidth: 2,
    borderColor: '#A0A0A0',
    color: '#FFFFFF',
    fontFamily: MC_FONT,
    fontSize: 15,
    paddingHorizontal: 8,
  },
  slot: {
    backgroundColor: '#8B8B8B',
    borderWidth: 2,
    borderTopColor: '#373737',
    borderLeftColor: '#373737',
    borderBottomColor: '#FFFFFF',
    borderRightColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotDark: { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: 'rgba(0,0,0,0.6)' },
  slotSelected: { borderColor: '#FFFFFF', borderWidth: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  itemWrap: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  count: { position: 'absolute', right: 2, bottom: 0 },
  durTrack: { position: 'absolute', height: 3, backgroundColor: '#000000' },
});
