import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/lib/theme';

// Logos as uploaded to thewellnest.ch. They are loaded from the website's image CDN (sized down
// with `format`); if that fails, a text version is shown instead.
const CDN = 'https://images.squarespace-cdn.com/content/v1/6907ae606251a5663933dd37';
const WORDMARK = `${CDN}/64d12573-38a7-46d8-b2e6-2759c5e1a1eb/Black.PNG?format=750w`;
const WORDMARK_RATIO = 24571 / 4000;
const MONOGRAM = `${CDN}/8c032bbc-8792-45f7-b0b3-c82398378dc9/W+schwarz+1.png?format=300w`;
const MONOGRAM_RATIO = 6557 / 4000;

export function Wordmark({ height = 20 }: { height?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Text style={styles.wordmarkText}>THE WELLNEST</Text>;
  return (
    <Image
      source={WORDMARK}
      accessibilityLabel="The Wellnest"
      contentFit="contain"
      contentPosition="left"
      transition={300}
      onError={() => setFailed(true)}
      style={{ height, width: height * WORDMARK_RATIO }}
    />
  );
}

export function Monogram({ height = 28 }: { height?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Text style={[styles.monogramText, { fontSize: height * 0.9 }]}>W</Text>;
  return (
    <Image
      source={MONOGRAM}
      accessibilityLabel="The Wellnest"
      contentFit="contain"
      transition={300}
      onError={() => setFailed(true)}
      style={{ height, width: height * MONOGRAM_RATIO }}
    />
  );
}

const styles = StyleSheet.create({
  wordmarkText: {
    fontFamily: fonts.light,
    fontSize: 20,
    letterSpacing: 6,
    color: colors.ink,
  },
  monogramText: {
    fontFamily: fonts.light,
    color: colors.ink,
  },
});
