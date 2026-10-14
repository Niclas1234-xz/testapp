import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState, BackHandler, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { Game } from '../game';
import { saveSettings, type Settings } from '../storage';
import { Hud, LoadingScreen } from './Hud';
import { InventoryScreen } from './Inventory';
import { DeathScreen, OptionsScreen, PauseMenu } from './Menus';
import { TopButtons, TouchControls } from './TouchControls';
import { useDesktopInput } from './useDesktopInput';

function hasTouch() {
  if (Platform.OS !== 'web') return true;
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
}

/** The running game: GL surface, render loop, HUD, controls and in-game screens. */
export function GameView({ game, onQuit }: { game: Game; onQuit: () => void }) {
  const { width, height } = useWindowDimensions();
  const hud = useSyncExternalStore(
    (fn) => game.subscribe(fn),
    () => game.getHud()
  );
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [touch] = useState(hasTouch);
  const [settings, setSettings] = useState<Settings>(game.settings);
  const raf = useRef(0);

  useDesktopInput(game, canvas);

  // Expose the game for debugging in the browser console during development.
  useEffect(() => {
    if (__DEV__ && Platform.OS === 'web') (globalThis as { __mc?: Game }).__mc = game;
  }, [game]);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    game.attachGL(gl);
    if (Platform.OS === 'web') setCanvas((gl as unknown as WebGLRenderingContext).canvas as HTMLCanvasElement);
    const loop = (t: number) => {
      game.frame(t, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.endFrameEXP();
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    return () => {
      cancelAnimationFrame(raf.current);
      game.save();
      game.detachGL();
    };
  }, [game]);

  // Save and pause when the app goes to the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        game.pause();
        game.save();
      }
    });
    return () => sub.remove();
  }, [game]);

  // Android back button: close screens / open the pause menu.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const s = game.screen;
      if (!s) game.pause();
      else if (s.kind === 'pause') game.setScreen(null);
      else if (s.kind === 'options') game.setScreen({ kind: 'pause' });
      else if (s.kind !== 'death') game.closeScreen();
      return true;
    });
    return () => sub.remove();
  }, [game]);

  const changeSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
    game.applySettings(s);
  };

  const quit = () => {
    game.save();
    onQuit();
  };

  const screen = hud.screen;
  const container = screen && (screen.kind === 'inventory' || screen.kind === 'crafting' || screen.kind === 'furnace' || screen.kind === 'chest');

  return (
    <View style={s.root}>
      <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={0} />
      {hud.loading < 1 ? (
        <LoadingScreen progress={hud.loading} name={game.meta.name} />
      ) : (
        <>
          {!screen && touch && <TouchControls game={game} width={width} height={height} flying={hud.flying} />}
          {!screen && <Hud game={game} hud={hud} width={width} height={height} touch={touch} />}
          {!screen && touch && <TopButtons game={game} />}
          {container && screen && <InventoryScreen game={game} screen={screen} width={width} height={height} />}
          {screen?.kind === 'pause' && (
            <PauseMenu
              creative={hud.creative}
              onResume={() => game.setScreen(null)}
              onOptions={() => game.setScreen({ kind: 'options' })}
              onToggleMode={() => game.setGameMode(hud.creative ? 'survival' : 'creative')}
              onQuit={quit}
            />
          )}
          {screen?.kind === 'options' && (
            <View style={s.dim}>
              <OptionsScreen settings={settings} onChange={changeSettings} onDone={() => game.setScreen({ kind: 'pause' })} />
            </View>
          )}
          {screen?.kind === 'death' && <DeathScreen message={hud.deathMessage} onRespawn={() => game.respawn()} onQuit={quit} />}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  dim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(16,16,16,0.75)' },
});
