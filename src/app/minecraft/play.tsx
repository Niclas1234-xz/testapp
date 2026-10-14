import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Game } from '@/minecraft/game';
import { loadChunks, loadSettings, loadWorldMeta } from '@/minecraft/storage';
import { GameView } from '@/minecraft/ui/GameView';
import { DirtBackground, McButton, McText } from '@/minecraft/ui/kit';

export default function PlayScreen() {
  const { world } = useLocalSearchParams<{ world: string }>();
  const [game] = useState(() => {
    const meta = world ? loadWorldMeta(world) : null;
    return meta ? new Game(meta, loadChunks(meta.id), loadSettings()) : null;
  });

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/minecraft'));

  if (!game) {
    return (
      <DirtBackground style={s.center}>
        <McText size={16}>Welt nicht gefunden</McText>
        <View style={s.gap} />
        <McButton label="Zurück" onPress={leave} />
      </DirtBackground>
    );
  }

  return <GameView game={game} onQuit={leave} />;
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  gap: { height: 12 },
});
