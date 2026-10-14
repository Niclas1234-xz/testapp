import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Settings } from '../storage';
import { McButton, McText } from './kit';

const DIFFICULTIES = ['Friedlich', 'Leicht', 'Normal', 'Schwer'];

function Stepper({ label, onMinus, onPlus }: { label: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={s.stepper}>
      <Pressable onPress={onMinus} style={s.stepButton} hitSlop={4}>
        <McText size={16}>−</McText>
      </Pressable>
      <View style={s.stepLabel}>
        <McText size={13} numberOfLines={1}>
          {label}
        </McText>
      </View>
      <Pressable onPress={onPlus} style={s.stepButton} hitSlop={4}>
        <McText size={16}>+</McText>
      </Pressable>
    </View>
  );
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const onOff = (v: boolean) => (v ? 'An' : 'Aus');

/** Video/controls options (shared by the title screen and the pause menu). */
export function OptionsScreen({ settings, onChange, onDone }: { settings: Settings; onChange: (s: Settings) => void; onDone: () => void }) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  return (
    <View style={s.screen}>
      <McText size={16} style={s.title}>
        Optionen
      </McText>
      <ScrollView contentContainerStyle={s.optionsGrid} style={s.scroll}>
        <Stepper
          label={`Sichtweite: ${settings.renderDistance} Chunks`}
          onMinus={() => set({ renderDistance: clamp(settings.renderDistance - 1, 2, 12) })}
          onPlus={() => set({ renderDistance: clamp(settings.renderDistance + 1, 2, 12) })}
        />
        <Stepper
          label={`Sichtfeld: ${settings.fov === 70 ? 'Normal' : settings.fov}`}
          onMinus={() => set({ fov: clamp(settings.fov - 5, 30, 110) })}
          onPlus={() => set({ fov: clamp(settings.fov + 5, 30, 110) })}
        />
        <Stepper
          label={`Empfindlichkeit: ${Math.round(settings.sensitivity * 100)}%`}
          onMinus={() => set({ sensitivity: clamp(Math.round((settings.sensitivity - 0.1) * 10) / 10, 0.2, 3) })}
          onPlus={() => set({ sensitivity: clamp(Math.round((settings.sensitivity + 0.1) * 10) / 10, 0.2, 3) })}
        />
        <Stepper
          label={`Helligkeit: ${settings.gamma <= 0 ? 'Düster' : settings.gamma >= 1 ? 'Hell' : `+${Math.round(settings.gamma * 100)}%`}`}
          onMinus={() => set({ gamma: clamp(settings.gamma - 0.25, 0, 1) })}
          onPlus={() => set({ gamma: clamp(settings.gamma + 0.25, 0, 1) })}
        />
        <Stepper
          label={`Schwierigkeit: ${DIFFICULTIES[settings.difficulty]}`}
          onMinus={() => set({ difficulty: (settings.difficulty + 3) % 4 })}
          onPlus={() => set({ difficulty: (settings.difficulty + 1) % 4 })}
        />
        <McButton small label={`Grafik: ${settings.fancyGraphics ? 'Schön' : 'Schnell'}`} onPress={() => set({ fancyGraphics: !settings.fancyGraphics })} style={s.option} />
        <McButton small label={`Weiche Beleuchtung: ${onOff(settings.smoothLighting)}`} onPress={() => set({ smoothLighting: !settings.smoothLighting })} style={s.option} />
        <McButton small label={`Wolken: ${onOff(settings.clouds)}`} onPress={() => set({ clouds: !settings.clouds })} style={s.option} />
        <McButton small label={`Gehbewegung: ${onOff(settings.viewBobbing)}`} onPress={() => set({ viewBobbing: !settings.viewBobbing })} style={s.option} />
        <McButton small label={`Koordinaten: ${onOff(settings.showCoords)}`} onPress={() => set({ showCoords: !settings.showCoords })} style={s.option} />
        <McButton small label={`Y-Achse umkehren: ${onOff(settings.invertY)}`} onPress={() => set({ invertY: !settings.invertY })} style={s.option} />
      </ScrollView>
      <McButton label="Fertig" onPress={onDone} style={s.done} />
    </View>
  );
}

export function PauseMenu({
  creative,
  onResume,
  onOptions,
  onToggleMode,
  onQuit,
}: {
  creative: boolean;
  onResume: () => void;
  onOptions: () => void;
  onToggleMode: () => void;
  onQuit: () => void;
}) {
  return (
    <View style={[s.screen, s.dim]}>
      <McText size={16} style={s.title}>
        Spielmenü
      </McText>
      <View style={s.column}>
        <McButton label="Zurück zum Spiel" onPress={onResume} style={s.wide} />
        <McButton label="Optionen …" onPress={onOptions} style={s.wide} />
        <McButton label={`Spielmodus: ${creative ? 'Kreativ' : 'Überleben'}`} onPress={onToggleMode} style={s.wide} />
        <McButton label="Speichern und zum Titelbild" onPress={onQuit} style={s.wide} />
      </View>
    </View>
  );
}

export function DeathScreen({ message, onRespawn, onQuit }: { message: string; onRespawn: () => void; onQuit: () => void }) {
  return (
    <View style={[s.screen, s.death]}>
      <McText size={28} style={s.title}>
        {message}
      </McText>
      <View style={s.column}>
        <McButton label="Wiederbeleben" onPress={onRespawn} style={s.wide} />
        <McButton label="Zum Titelbild" onPress={onQuit} style={s.wide} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 12 },
  dim: { backgroundColor: 'rgba(16,16,16,0.65)' },
  death: { backgroundColor: 'rgba(120,0,0,0.55)' },
  title: { marginBottom: 14 },
  column: { gap: 8, alignItems: 'center' },
  wide: { width: 300 },
  scroll: { flexGrow: 0, maxWidth: 640 },
  optionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  option: { width: 300 },
  done: { width: 300, marginTop: 12 },
  stepper: {
    width: 300,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3C3C3C',
    borderWidth: 2,
    borderColor: '#000000',
  },
  stepButton: { width: 40, height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#6F6F6F' },
  stepLabel: { flex: 1, alignItems: 'center' },
});
