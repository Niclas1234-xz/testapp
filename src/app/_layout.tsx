import { Montserrat_300Light } from '@expo-google-fonts/montserrat/300Light';
import { Montserrat_400Regular } from '@expo-google-fonts/montserrat/400Regular';
import { Montserrat_500Medium } from '@expo-google-fonts/montserrat/500Medium';
import { Montserrat_600SemiBold } from '@expo-google-fonts/montserrat/600SemiBold';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

import { Intro } from '@/components/intro';
import { prefetchLogos } from '@/components/logo';
import { NestProvider } from '@/lib/nest-store';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();
prefetchLogos();

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

// Full modals instead of formSheets: their layout (scroll area plus a fixed footer) behaves the
// same on iOS and Android.
const modalOptions = {
  presentation: 'modal',
  contentStyle: { backgroundColor: colors.background },
} as const;

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Montserrat_300Light,
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
  });

  // The start-up animation plays once per app launch, on the same cream as the native splash.
  // The splash stays up until the animation is on screen, so nothing flashes in between.
  const [introVisible, setIntroVisible] = useState(true);

  if (!loaded && !error) return null;

  return (
    <ThemeProvider value={theme}>
      <NestProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="session/[id]" options={modalOptions} />
          <Stack.Screen name="instructor/[id]" options={modalOptions} />
        </Stack>
        {introVisible && (
          <Intro onShown={() => SplashScreen.hide()} onDone={() => setIntroVisible(false)} />
        )}
        <StatusBar style="dark" />
      </NestProvider>
    </ThemeProvider>
  );
}
