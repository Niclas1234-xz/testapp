import * as ScreenOrientation from 'expo-screen-orientation';
import { DarkTheme, DefaultTheme, Link, Stack, ThemeProvider, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [initialPath] = useState(usePathname());

  // The app is portrait; only the Minecraft screens switch to landscape (they lock it themselves).
  useEffect(() => {
    if (Platform.OS !== 'web' && !initialPath.startsWith('/minecraft'))
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, [initialPath]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen
          name="index"
          options={{
            title: 'Autoerkenner',
            headerRight: () => (
              <Link href="/minecraft" style={{ fontSize: 16, fontWeight: '600', color: '#4C8DF6', paddingHorizontal: 4 }}>
                ⛏️ Minecraft
              </Link>
            ),
          }}
        />
        <Stack.Screen name="minecraft" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
