import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { colors, fonts, radius } from '@/lib/theme';

const TAB_ICONS: Record<string, IconName> = {
  index: 'home',
  book: 'calendar',
  classes: 'rings',
  profile: 'user',
};

function FloatingTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label = options.title ?? route.name;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              style={[styles.item, focused && styles.itemFocused]}>
              <Icon
                name={TAB_ICONS[route.name] ?? 'home'}
                size={20}
                color={focused ? colors.onDark : colors.onDarkMuted}
                strokeWidth={focused ? 1.7 : 1.4}
              />
              {focused && <Text style={styles.label}>{label}</Text>}
            </Pressable>
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
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
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
  itemFocused: {
    backgroundColor: 'rgba(246, 241, 234, 0.12)',
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: colors.onDark,
  },
});
