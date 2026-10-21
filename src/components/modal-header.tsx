import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/motion';
import { colors, fonts } from '@/lib/theme';

// iOS shows modals as a card below the status bar; Android shows them full screen.
export function ModalHeader({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  const paddingTop = process.env.EXPO_OS === 'android' ? insets.top + 8 : 16;

  return (
    <View style={[styles.bar, { paddingTop }]}>
      <Text style={styles.title}>{title}</Text>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={10}
        onPress={() => router.back()}
        style={styles.close}>
        <Icon name="close" size={18} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: {
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
