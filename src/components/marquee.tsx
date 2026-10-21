import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, fonts } from '@/lib/theme';

const SPEED = 40; // px per second

// Endless ticker like the "THE NOW · THE NATURE · …" band on the website.
export function Marquee({ items }: { items: string[] }) {
  const [width, setWidth] = useState(0);
  const offset = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!width || reduceMotion) return;
    offset.value = 0;
    offset.value = withRepeat(
      withTiming(-width, { duration: (width / SPEED) * 1000, easing: Easing.linear }),
      -1
    );
    return () => cancelAnimation(offset);
  }, [width, reduceMotion, offset]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  const row = (
    <View style={styles.row}>
      {items.map((item) => (
        <View key={item} style={styles.item}>
          <Text style={styles.text}>{item}</Text>
          <View style={styles.separator} />
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.track, animatedStyle]}>
        <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>{row}</View>
        {row}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    paddingVertical: 16,
  },
  track: {
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontFamily: fonts.light,
    fontSize: 15,
    letterSpacing: 4,
    color: colors.ink,
  },
  separator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.bronze,
    marginHorizontal: 22,
  },
});
