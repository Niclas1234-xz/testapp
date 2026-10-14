import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Game, Screen, UiSnapshot } from '../game';
import type { Slot } from '../inventory';
import { creativeItems, itemName } from '../items';
import { ItemSlot, ItemView, McText, Panel } from './kit';

/** Whether shift is held (desktop quick-move). Set by the keyboard handler. */
export const modifierKeys = { shift: false };

function useSnapshot(game: Game): UiSnapshot {
  return useSyncExternalStore(
    (fn) => game.subscribe(fn),
    () => game.getUiSnapshot()
  );
}

type Container = 'inv' | 'craft' | 'chest' | 'furnace' | 'armor';

/** Container screens: player inventory, crafting table, furnace, chest and creative inventory. */
export function InventoryScreen({ game, screen, width, height }: { game: Game; screen: Screen; width: number; height: number }) {
  const snap = useSnapshot(game);
  const [label, setLabel] = useState<string | null>(null);

  if (snap.creative && screen.kind === 'inventory') return <CreativeScreen game={game} snap={snap} width={width} height={height} />;

  const rows =
    screen.kind === 'chest' ? 7.6 : screen.kind === 'furnace' ? 7.4 : screen.kind === 'crafting' ? 7.6 : 8.6;
  const size = Math.floor(Math.min(42, (height - 70) / rows, (width - 60) / 9.6));

  const tap = (container: Container, index: number, slot: Slot) => {
    if (slot) setLabel(itemName(slot.id));
    // Shift-click or double tap moves the stack to the other part of the inventory.
    game.slotTap(container, index, modifierKeys.shift);
  };
  const longPress = (container: Container, index: number) => game.clickSlot(container, index, true);

  const grid = (slots: Slot[], container: Container, from: number, count: number, cols: number) => (
    <View style={[st.grid, { width: cols * size }]}>
      {slots.slice(from, from + count).map((sl, i) => (
        <ItemSlot
          key={from + i}
          slot={sl}
          size={size}
          onPress={() => tap(container, from + i, sl)}
          onLongPress={() => longPress(container, from + i)}
        />
      ))}
    </View>
  );

  const playerInv = (
    <>
      <McText size={12} color="#404040" style={st.label}>
        Inventar
      </McText>
      {grid(snap.inventory, 'inv', 9, 27, 9)}
      <View style={{ height: size * 0.15 }} />
      {grid(snap.inventory, 'inv', 0, 9, 9)}
    </>
  );

  const result = (
    <ItemSlot
      slot={snap.result}
      size={Math.round(size * 1.25)}
      onPress={() => {
        if (snap.result) setLabel(itemName(snap.result.id));
        game.takeCraftResult(modifierKeys.shift);
      }}
      onLongPress={() => game.takeCraftResult(true)}
    />
  );

  let top: ReactNode = null;
  let title = 'Inventar';
  if (screen.kind === 'inventory' || screen.kind === 'crafting') {
    const n = snap.craftSize;
    title = 'Handwerk';
    top = (
      <View style={st.craftRow}>
        {screen.kind === 'inventory' && (
          <>
            <View>
              {snap.armor.map((sl, i) => (
                <ItemSlot key={i} slot={sl} size={size} onPress={() => tap('armor', i, sl)} />
              ))}
            </View>
            <View style={[st.playerBox, { width: size * 2.6, height: size * 4 }]}>
              <McText size={11} color="#404040">
                Steve
              </McText>
            </View>
          </>
        )}
        {grid(snap.craft, 'craft', 0, n * n, n)}
        <McText size={size * 0.6} color="#8B8B8B" style={st.arrow}>
          ➜
        </McText>
        {result}
      </View>
    );
  } else if (screen.kind === 'furnace' && snap.furnace) {
    title = 'Ofen';
    const f = snap.furnace;
    top = (
      <View style={st.furnace}>
        <View style={st.furnaceCol}>
          <ItemSlot slot={f.slots[0]} size={size} onPress={() => tap('furnace', 0, f.slots[0])} onLongPress={() => longPress('furnace', 0)} />
          <View style={[st.flame, { height: size * 0.8 }]}>
            <View style={[st.flameFill, { height: `${Math.round(f.burn * 100)}%` }]} />
          </View>
          <ItemSlot slot={f.slots[1]} size={size} onPress={() => tap('furnace', 1, f.slots[1])} onLongPress={() => longPress('furnace', 1)} />
        </View>
        <View style={[st.progress, { width: size * 1.4 }]}>
          <View style={[st.progressFill, { width: `${Math.round(f.cook * 100)}%` }]} />
        </View>
        <ItemSlot slot={f.slots[2]} size={Math.round(size * 1.25)} onPress={() => tap('furnace', 2, f.slots[2])} />
      </View>
    );
  } else if (screen.kind === 'chest' && snap.chest) {
    title = 'Truhe';
    top = grid(snap.chest, 'chest', 0, 27, 9);
  }

  return (
    <View style={st.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => game.dropCursor(true)} />
      <Panel style={st.panel}>
        <View style={st.header}>
          <McText size={12} color="#404040">
            {title}
          </McText>
          <Pressable onPress={() => game.closeScreen()} hitSlop={10} style={st.close}>
            <McText size={14} color="#404040">
              ✕
            </McText>
          </Pressable>
        </View>
        {top}
        {playerInv}
        <McText size={11} color="#505050" style={st.hint} numberOfLines={1}>
          {label ?? 'Tippen: nehmen/ablegen · Halten: halbieren/einzeln · Doppeltippen: verschieben'}
        </McText>
      </Panel>
      {snap.cursor && (
        <View pointerEvents="none" style={[st.cursor, { width: size, height: size }]}>
          <ItemView slot={snap.cursor} size={size} />
          <McText size={10}>{itemName(snap.cursor.id)}</McText>
        </View>
      )}
    </View>
  );
}

function CreativeScreen({ game, snap, width, height }: { game: Game; snap: UiSnapshot; width: number; height: number }) {
  const cols = Math.max(9, Math.min(14, Math.floor((width - 80) / 44)));
  const size = Math.floor(Math.min(42, (width - 80) / cols));
  const items = creativeItems();
  return (
    <View style={st.overlay}>
      <Panel style={[st.panel, { maxHeight: height - 20 }]}>
        <View style={st.header}>
          <McText size={12} color="#404040">
            Kreativinventar – Tippen legt den Gegenstand in den gewählten Slot
          </McText>
          <Pressable onPress={() => game.closeScreen()} hitSlop={10} style={st.close}>
            <McText size={14} color="#404040">
              ✕
            </McText>
          </Pressable>
        </View>
        <ScrollView style={{ maxHeight: height - 40 - size * 2.6 }} contentContainerStyle={[st.grid, { width: cols * size }]}>
          {items.map((id) => (
            <ItemSlot key={id} slot={{ id, count: 1, damage: 0 }} size={size} onPress={() => game.creativePick(id, false)} />
          ))}
        </ScrollView>
        <View style={{ height: size * 0.3 }} />
        <View style={[st.grid, { width: 9 * size, alignSelf: 'center' }]}>
          {snap.inventory.slice(0, 9).map((sl, i) => (
            <ItemSlot
              key={i}
              slot={sl}
              size={size}
              selected={i === snap.selected}
              onPress={() => game.selectSlot(i)}
              onLongPress={() => game.creativeClearSlot(i)}
            />
          ))}
        </View>
        <McText size={11} color="#505050" style={st.hint}>
          Slot halten = leeren
        </McText>
      </Panel>
    </View>
  );
}

const st = StyleSheet.create({
  overlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(16,16,16,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: { alignItems: 'center' },
  header: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  close: { paddingHorizontal: 6 },
  label: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  craftRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  playerBox: { backgroundColor: '#000000', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4, marginRight: 10 },
  arrow: { marginHorizontal: 4 },
  furnace: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  furnaceCol: { alignItems: 'center', gap: 4 },
  flame: { width: 14, backgroundColor: '#8B8B8B', justifyContent: 'flex-end' },
  flameFill: { width: '100%', backgroundColor: '#FF8A1E' },
  progress: { height: 10, backgroundColor: '#8B8B8B' },
  progressFill: { height: '100%', backgroundColor: '#FFFFFF' },
  hint: { marginTop: 6 },
  cursor: { position: 'absolute', left: 12, top: 12, alignItems: 'center' },
});
