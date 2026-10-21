import * as Haptics from 'expo-haptics';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { PressableScale, useActiveProgress } from '@/components/motion';
import { colors, fonts, radius } from '@/lib/theme';

const TAB_ICONS: Record<string, IconName> = {
  index: 'home',
  book: 'calendar',
  classes: 'rings',
  profile: 'user',
};

// Every tab has the same fixed size, so nothing reflows when the selection changes; only the
// highlight slides from one tab to the next.
const ITEM_WIDTH = 72;
const ITEM_HEIGHT = 56;
const BAR_PADDING = 6;

function TabItem({
  label,
  icon,
  focused,
  onPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  onPress: () => void;
}) {
  const progress = useActiveProgress(focused, 240);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -1.5 * progress.get() }, { scale: 1 + 0.08 * progress.get() }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.get(), [0, 1], [colors.onDarkMuted, colors.onDark]),
  }));

  return (
    <PressableScale
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      scaleTo={0.9}
      onPress={onPress}
      style={styles.item}>
      <Animated.View style={iconStyle}>
        <Icon
          name={icon}
          size={20}
          color={focused ? colors.onDark : colors.onDarkMuted}
          strokeWidth={focused ? 1.7 : 1.4}
        />
      </Animated.View>
      <Animated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
        {label}
      </Animated.Text>
    </PressableScale>
  );
}

function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const position = useSharedValue(state.index);

  useEffect(() => {
    position.set(withSpring(state.index, { damping: 18, stiffness: 200, mass: 0.8 }));
  }, [state.index, position]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.get() * ITEM_WIDTH }],
  }));

  return (
    <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        <Animated.View style={[styles.indicator, indicatorStyle]} />
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];

          return (
            <TabItem
              key={route.key}
              label={options.title ?? route.name}
              icon={TAB_ICONS[route.name] ?? 'home'}
              focused={focused}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (focused || event.defaultPrevented) return;
                if (process.env.EXPO_OS !== 'web') Haptics.selectionAsync();
                navigation.navigate(route.name, route.params);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="book" options={{ title: 'Book' }} />
      <Tabs.Screen name="classes" options={{ title: 'Classes' }} />
      <Tabs.Screen name="profile" options={{ title: 'Nest' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  bar: {
    flexDirection: 'row',
    padding: BAR_PADDING,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    boxShadow: '0 10px 30px rgba(46, 43, 39, 0.28)',
  },
  indicator: {
    position: 'absolute',
    top: BAR_PADDING,
    left: BAR_PADDING,
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    borderRadius: ITEM_HEIGHT / 2,
    backgroundColor: 'rgba(246, 241, 234, 0.12)',
  },
  item: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 9.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
