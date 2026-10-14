import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { logoImage } from '@/minecraft/icons';
import { seedFromString } from '@/minecraft/rng';
import {
  createWorld,
  deleteWorld,
  listWorlds,
  loadSettings,
  saveSettings,
  type GameMode,
  type Settings,
  type WorldMeta,
} from '@/minecraft/storage';
import { tile } from '@/minecraft/textures/atlas';
import { DirtBackground, McButton, McInput, McText, styles as kit } from '@/minecraft/ui/kit';
import { OptionsScreen } from '@/minecraft/ui/Menus';

type View_ = 'title' | 'worlds' | 'create' | 'options';

const SPLASHES = ['Jetzt mit Kühen!', 'Auch auf dem Handy!', '100 % prozedural!', 'Mit echten Creepern!', 'Lies den Quellcode!'];

export default function TitleScreen() {
  const { width, height } = useWindowDimensions();
  const [view, setView] = useState<View_>('title');
  const [worlds, setWorlds] = useState<WorldMeta[]>(() => listWorlds());
  const [selected, setSelected] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [name, setName] = useState('Neue Welt');
  const [seed, setSeed] = useState('');
  const [mode, setMode] = useState<GameMode>('survival');
  const [splash] = useState(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [logo] = useState(() => logoImage('MINECRAFT', tile('stone')));

  const logoWidth = Math.min(width * 0.8, logo.width, 520);
  const logoHeight = (logoWidth / logo.width) * logo.height;

  const play = (id: string) => router.push({ pathname: '/minecraft/play', params: { world: id } });

  if (view === 'options') {
    return (
      <DirtBackground>
        <OptionsScreen
          settings={settings}
          onChange={(s) => {
            setSettings(s);
            saveSettings(s);
          }}
          onDone={() => setView('title')}
        />
      </DirtBackground>
    );
  }

  if (view === 'create') {
    return (
      <DirtBackground style={s.center}>
        <McText size={16} style={s.heading}>
          Neue Welt erstellen
        </McText>
        <View style={s.form}>
          <McText size={12} color="#A0A0A0">
            Name der Welt
          </McText>
          <McInput value={name} onChangeText={setName} />
          <McText size={12} color="#A0A0A0" style={s.formLabel}>
            Startwert für den Weltgenerator (leer = zufällig)
          </McText>
          <McInput value={seed} onChangeText={setSeed} placeholder="z.B. 12345" />
          <McButton
            label={`Spielmodus: ${mode === 'survival' ? 'Überleben' : 'Kreativ'}`}
            onPress={() => setMode(mode === 'survival' ? 'creative' : 'survival')}
            style={s.formButton}
          />
          <McText size={11} color="#A0A0A0" style={s.modeHint}>
            {mode === 'survival'
              ? 'Suche nach Ressourcen, baue, kämpfe und überlebe – mit Leben und Hunger.'
              : 'Unbegrenzte Ressourcen, fliegen und sofortiges Abbauen.'}
          </McText>
        </View>
        <View style={s.row}>
          <McButton
            label="Neue Welt erstellen"
            onPress={() => {
              const meta = createWorld(name.trim() || 'Neue Welt', seedFromString(seed), mode);
              setWorlds(listWorlds());
              play(meta.id);
            }}
            style={s.half}
          />
          <McButton label="Abbrechen" onPress={() => setView('worlds')} style={s.half} />
        </View>
      </DirtBackground>
    );
  }

  if (view === 'worlds') {
    const sel = worlds.find((w) => w.id === selected);
    return (
      <DirtBackground>
        <View style={s.worldsHeader}>
          <McText size={16}>Welt auswählen</McText>
        </View>
        <ScrollView style={s.worldList} contentContainerStyle={s.worldListContent}>
          {worlds.length === 0 && (
            <McText size={13} color="#A0A0A0" style={s.empty}>
              Noch keine Welten – erstelle eine neue!
            </McText>
          )}
          {worlds.map((w) => (
            <Pressable
              key={w.id}
              onPress={() => {
                if (selected === w.id) play(w.id);
                setSelected(w.id);
                setConfirmDelete(false);
              }}
              style={[s.worldItem, selected === w.id && s.worldSelected]}>
              <McText size={14}>{w.name}</McText>
              <McText size={11} color="#A0A0A0">
                {new Date(w.lastPlayed).toLocaleString('de-CH')} · {w.mode === 'survival' ? 'Überleben' : 'Kreativ'} · Startwert {w.seed}
              </McText>
            </Pressable>
          ))}
        </ScrollView>
        <View style={s.worldButtons}>
          <View style={s.row}>
            <McButton label="Ausgewählte Welt spielen" disabled={!sel} onPress={() => sel && play(sel.id)} style={s.half} />
            <McButton
              label="Neue Welt erstellen"
              onPress={() => {
                setName(`Neue Welt${worlds.length > 0 ? ` ${worlds.length + 1}` : ''}`);
                setSeed('');
                setView('create');
              }}
              style={s.half}
            />
          </View>
          <View style={s.row}>
            <McButton
              label={confirmDelete ? 'Wirklich löschen?' : 'Löschen'}
              disabled={!sel}
              onPress={() => {
                if (!sel) return;
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                deleteWorld(sel.id);
                setWorlds(listWorlds());
                setSelected(null);
                setConfirmDelete(false);
              }}
              style={s.half}
            />
            <McButton label="Abbrechen" onPress={() => setView('title')} style={s.half} />
          </View>
        </View>
      </DirtBackground>
    );
  }

  return (
    <DirtBackground style={s.center}>
      <View style={{ width: logoWidth, height: logoHeight, marginBottom: height < 420 ? 12 : 28 }}>
        <Image source={{ uri: logo.uri }} style={[{ width: logoWidth, height: logoHeight }, kit.pixelated]} />
        <McText size={14} color="#FFFF00" style={s.splash}>
          {splash}
        </McText>
      </View>
      <View style={s.column}>
        <McButton
          label="Einzelspieler"
          onPress={() => {
            setWorlds(listWorlds());
            setView('worlds');
          }}
          style={s.wide}
        />
        <McButton label="Optionen …" onPress={() => setView('options')} style={s.wide} />
        <McButton label="Zurück zur App" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.wide} />
      </View>
      <McText size={10} color="#C0C0C0" style={s.footer}>
        Fan-Nachbau · alle Texturen prozedural generiert
      </McText>
    </DirtBackground>
  );
}

const s = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  heading: { marginBottom: 12 },
  column: { gap: 8, alignItems: 'center' },
  wide: { width: 320 },
  splash: { position: 'absolute', right: -10, bottom: 0, transform: [{ rotate: '-18deg' }] },
  footer: { position: 'absolute', left: 8, bottom: 6 },
  form: { gap: 6, alignItems: 'stretch', width: 340, marginBottom: 14 },
  formLabel: { marginTop: 8 },
  formButton: { marginTop: 10 },
  modeHint: { marginTop: 4 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  half: { width: 230, minWidth: 0 },
  worldsHeader: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  worldList: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  worldListContent: { padding: 10, gap: 6, alignItems: 'center' },
  worldItem: { width: 460, maxWidth: '100%', padding: 8, borderWidth: 2, borderColor: 'transparent' },
  worldSelected: { borderColor: '#A0A0A0', backgroundColor: 'rgba(0,0,0,0.6)' },
  empty: { marginTop: 20 },
  worldButtons: { paddingVertical: 8, gap: 6 },
});
