import { Image, Pressable, StyleSheet, View } from 'react-native';

import type { Game, HudState } from '../game';
import { hudIcon } from '../icons';
import { itemName } from '../items';
import { DirtBackground, ItemSlot, McText, styles as kit } from './kit';

export function hudSlotSize(width: number, height: number) {
  return Math.round(Math.min(46, Math.max(32, Math.min(width / 15, height / 8.5))));
}

function StatRow({ value, kind, size, reverse }: { value: number; kind: 'heart' | 'food' | 'bubble'; size: number; reverse?: boolean }) {
  const icons = [];
  for (let i = 0; i < 10; i++) {
    const v = value - i * 2;
    let name: Parameters<typeof hudIcon>[0];
    if (kind === 'bubble') {
      if (v <= 0) continue;
      name = 'bubble';
    } else if (v >= 2) name = kind;
    else if (v === 1) name = `${kind}_half`;
    else name = `${kind}_empty`;
    icons.push(<Image key={i} source={{ uri: hudIcon(name) }} style={[{ width: size, height: size, marginRight: -size * 0.1 }, kit.pixelated]} />);
  }
  return <View style={[s.row, reverse && s.rowReverse]}>{icons}</View>;
}

export function Hud({
  game,
  hud,
  width,
  height,
  touch,
}: {
  game: Game;
  hud: HudState;
  width: number;
  height: number;
  touch: boolean;
}) {
  const slot = hudSlotSize(width, height);
  const icon = Math.round(slot * 0.4);

  const bubbles = Math.ceil((hud.air / 300) * 20);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* crosshair */}
      <View style={s.crossWrap} pointerEvents="none">
        <View style={s.crossH} />
        <View style={s.crossV} />
      </View>

      {hud.info && (
        <View style={s.info} pointerEvents="none">
          <McText size={12}>{hud.info}</McText>
        </View>
      )}

      <View style={s.bottom} pointerEvents="box-none">
        {hud.toast && (
          <McText size={14} style={s.toast}>
            {hud.toast}
          </McText>
        )}
        {!hud.creative && (
          <View style={[s.stats, { width: slot * 9 }]} pointerEvents="none">
            <View>
              <StatRow value={Math.ceil(hud.health)} kind="heart" size={icon} />
            </View>
            <View style={s.rightStats}>
              {hud.showAir && <StatRow value={bubbles} kind="bubble" size={icon} reverse />}
              <StatRow value={hud.food} kind="food" size={icon} reverse />
            </View>
          </View>
        )}
        {hud.creative && hud.flying && (
          <McText size={11} color="#E0E0E0" style={s.flying}>
            Fliegen
          </McText>
        )}
        <View style={s.hotbarRow} pointerEvents="box-none">
          <View style={s.hotbar}>
            {hud.hotbar.map((st, i) => (
              <ItemSlot
                key={i}
                slot={st}
                size={slot}
                dark
                selected={i === hud.selected}
                onPress={() => game.selectSlot(i)}
                onLongPress={() => {
                  game.selectSlot(i);
                  game.dropHeld(false);
                }}
              />
            ))}
          </View>
          {touch && (
            <Pressable onPress={() => game.openScreen({ kind: 'inventory' })} style={[s.invButton, { width: slot, height: slot }]}>
              <McText size={slot * 0.4}>•••</McText>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/** Shown while the spawn area is generated. */
export function LoadingScreen({ progress, name }: { progress: number; name: string }) {
  return (
    <DirtBackground style={s.loading}>
      <McText size={18}>Welt wird geladen</McText>
      <McText size={13} color="#C0C0C0" style={s.loadingName}>
        {name}
      </McText>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <McText size={12} color="#A0A0A0">
        Gelände wird generiert … {Math.round(progress * 100)}%
      </McText>
    </DirtBackground>
  );
}

export function heldName(hud: HudState) {
  const st = hud.hotbar[hud.selected];
  return st ? itemName(st.id) : '';
}

const s = StyleSheet.create({
  crossWrap: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  crossH: { position: 'absolute', width: 18, height: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  crossV: { position: 'absolute', width: 2, height: 18, backgroundColor: 'rgba(255,255,255,0.85)' },
  info: { position: 'absolute', left: 8, top: 8, backgroundColor: 'rgba(0,0,0,0.35)', padding: 4 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 4, alignItems: 'center' },
  toast: { marginBottom: 6 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 3 },
  rightStats: { alignItems: 'flex-end', gap: 2 },
  row: { flexDirection: 'row' },
  rowReverse: { flexDirection: 'row-reverse' },
  flying: { marginBottom: 4 },
  hotbarRow: { flexDirection: 'row', alignItems: 'center' },
  hotbar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.7)',
  },
  invButton: {
    marginLeft: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingName: { marginBottom: 10 },
  progressTrack: { width: 260, height: 8, backgroundColor: '#3A3A3A', borderWidth: 1, borderColor: '#000000' },
  progressFill: { height: '100%', backgroundColor: '#80FF20' },
});
