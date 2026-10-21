import { Montserrat_300Light } from '@expo-google-fonts/montserrat/300Light';
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular';
import { Montserrat_500Medium } from '@expo-google-fonts/montserrat/500Medium';
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { NestProvider } from '@/lib/nest-store';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

const theme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.bronze,
    background: colors.background,
    card: colors.background,
    text: colors.ink,
    border: colors.line,
  },
};

const sheetOptions = {
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetCornerRadius: 28,
  contentStyle: { backgroundColor: colors.surface },
} as const;

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Montserrat_300Light,
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hide();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <ThemeProvider value={theme}>
      <NestProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="session/[id]"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.92] }}
          />
          <Stack.Screen
            name="instructor/[id]"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.7, 0.92] }}
          />
        </Stack>
        <StatusBar style="dark" />
      </NestProvider>
    </ThemeProvider>
  );
}
