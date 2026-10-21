import * as Haptics from 'expo-haptics';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/icon';
import { AnimatedPressable, useActiveProgress } from '@/components/motion';
import { colors, fonts, radius } from '@/lib/theme';

const TAB_ICONS: Record<string, IconName> = {
  index: 'home',
  book: 'calendar',
  classes: 'rings',
  profile: 'user',
};

// Items and the bar itself glide to their new width when the active label changes.
const tabLayout = LinearTransition.springify().damping(20).stiffness(220);

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
  const progress = useActiveProgress(focused, 260);
  const backgroundStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.get(),
      [0, 1],
      ['rgba(246, 241, 234, 0)', 'rgba(246, 241, 234, 0.12)']
    ),
  }));

  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      layout={tabLayout}
      onPress={onPress}
      style={[styles.item, backgroundStyle]}>
      <Icon
        name={icon}
        size={20}
        color={focused ? colors.onDark : colors.onDarkMuted}
        strokeWidth={focused ? 1.7 : 1.4}
      />
      {focused && (
        <Animated.Text
          entering={FadeIn.delay(80).duration(200)}
          exiting={FadeOut.duration(100)}
          style={styles.label}>
          {label}
        </Animated.Text>
      )}
    </AnimatedPressable>
  );
}

function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, 12) }]}>
      <Animated.View layout={tabLayout} style={styles.bar}>
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
      </Animated.View>
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
    alignItems: 'center',
    gap: 4,
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    boxShadow: '0 10px 30px rgba(46, 43, 39, 0.28)',
  },
  item: {
    height: 52,
    minWidth: 56,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.onDark,
  },
});
