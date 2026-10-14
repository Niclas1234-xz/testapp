import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Game } from '../game';
import { McText } from './kit';

type TouchKind = 'joystick' | 'look' | 'jump' | 'sneak';

interface TouchInfo {
  kind: TouchKind;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  start: number;
  moved: boolean;
  holding: boolean;
}

const JOY_RADIUS = 52;
const HOLD_MS = 280;
const TAP_SLOP = 12;

/**
 * Bedrock-style touch controls: floating joystick on the left, drag to look,
 * tap to place/use/attack, hold to mine (or eat), jump and sneak buttons.
 * All touches go through one view so moving and looking work at the same time.
 */
export function TouchControls({ game, width, height, flying }: { game: Game; width: number; height: number; flying: boolean }) {
  const touches = useRef(new Map<number, TouchInfo>());
  const [joy, setJoy] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const [sneak, setSneak] = useState(false);
  const [jumpDown, setJumpDown] = useState(false);

  const insets = useSafeAreaInsets();
  const jumpPos = { x: width - 78 - insets.right, y: height - 100 - insets.bottom };
  const sneakPos = { x: jumpPos.x, y: jumpPos.y - 82 };
  const joyHome = { x: 100 + insets.left, y: height - 105 - insets.bottom };

  // Detect "hold" on look touches even when the finger does not move.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      for (const t of touches.current.values()) {
        if (t.kind !== 'look' || t.holding || t.moved) continue;
        if (now - t.start >= HOLD_MS) {
          t.holding = true;
          game.startHold();
        }
      }
    }, 40);
    return () => clearInterval(id);
  }, [game]);

  const classify = (x: number, y: number): TouchKind => {
    if (Math.hypot(x - jumpPos.x, y - jumpPos.y) < 46) return 'jump';
    if (Math.hypot(x - sneakPos.x, y - sneakPos.y) < 34) return 'sneak';
    if (x < width * 0.38 && y > height * 0.3) return 'joystick';
    return 'look';
  };

  const updateJoystick = (t: TouchInfo) => {
    const dx = t.lastX - t.startX;
    const dy = t.lastY - t.startY;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, JOY_RADIUS);
    const nx = len > 0 ? (dx / len) * clamped : 0;
    const ny = len > 0 ? (dy / len) * clamped : 0;
    // Pushing the stick past the top edge sprints, like Bedrock.
    game.setMovement(-ny / JOY_RADIUS, -nx / JOY_RADIUS, dy < -JOY_RADIUS * 1.25 && Math.abs(dx) < JOY_RADIUS);
    setJoy({ x: t.startX, y: t.startY, dx: nx, dy: ny });
  };

  const onStart = (e: GestureResponderEvent) => {
    for (const ct of e.nativeEvent.changedTouches) {
      const x = ct.pageX;
      const y = ct.pageY;
      const kind = classify(x, y);
      const info: TouchInfo = { kind, startX: x, startY: y, lastX: x, lastY: y, start: Date.now(), moved: false, holding: false };
      touches.current.set(Number(ct.identifier), info);
      if (kind === 'jump') {
        game.setJump(true);
        setJumpDown(true);
      } else if (kind === 'sneak') {
        if (flying) game.setSneak(true);
        else {
          game.setSneak(!sneak);
          setSneak(!sneak);
        }
      } else if (kind === 'joystick') updateJoystick(info);
    }
  };

  const onMove = (e: GestureResponderEvent) => {
    const sens = game.settings.sensitivity;
    for (const ct of e.nativeEvent.changedTouches) {
      const t = touches.current.get(Number(ct.identifier));
      if (!t) continue;
      const x = ct.pageX;
      const y = ct.pageY;
      if (t.kind === 'look') {
        const dx = x - t.lastX;
        const dy = y - t.lastY;
        if (Math.hypot(x - t.startX, y - t.startY) > TAP_SLOP) t.moved = true;
        game.addLook(dx * 0.0062 * sens, dy * 0.0062 * sens * (game.settings.invertY ? -1 : 1));
      }
      t.lastX = x;
      t.lastY = y;
      if (t.kind === 'joystick') updateJoystick(t);
    }
  };

  const onEnd = (e: GestureResponderEvent) => {
    for (const ct of e.nativeEvent.changedTouches) {
      const id = Number(ct.identifier);
      const t = touches.current.get(id);
      if (!t) continue;
      touches.current.delete(id);
      if (t.kind === 'joystick') {
        game.setMovement(0, 0, false);
        setJoy(null);
      } else if (t.kind === 'jump') {
        game.setJump(false);
        setJumpDown(false);
      } else if (t.kind === 'sneak') {
        if (flying) game.setSneak(false);
      } else if (t.kind === 'look') {
        if (t.holding) game.releaseActions();
        else if (!t.moved && Date.now() - t.start < HOLD_MS) game.tap();
      }
    }
  };

  const base = joy ?? joyHome;
  return (
    <View
      style={StyleSheet.absoluteFill}
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}>
      <View pointerEvents="none" style={[s.joyBase, { left: base.x - JOY_RADIUS - 6, top: base.y - JOY_RADIUS - 6, opacity: joy ? 0.7 : 0.4 }]}>
        <View style={[s.joyKnob, { transform: [{ translateX: joy?.dx ?? 0 }, { translateY: joy?.dy ?? 0 }] }]} />
      </View>
      <View pointerEvents="none" style={[s.round, s.jump, { left: jumpPos.x - 36, top: jumpPos.y - 36 }, jumpDown && s.active]}>
        <McText size={20}>{flying ? '▲' : '⇧'}</McText>
      </View>
      <View pointerEvents="none" style={[s.round, s.sneak, { left: sneakPos.x - 26, top: sneakPos.y - 26 }, sneak && !flying && s.active]}>
        <McText size={16}>{flying ? '▼' : '●'}</McText>
      </View>
    </View>
  );
}

/** Pause + camera buttons in the top-right corner. */
export function TopButtons({ game }: { game: Game }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.top, { top: 8 + insets.top, right: 8 + insets.right }]} pointerEvents="box-none">
      <Pressable
        style={s.topButton}
        onPress={() => game.toggleThirdPerson()}>
        <McText size={13}>F5</McText>
      </Pressable>
      <Pressable style={s.topButton} onPress={() => game.pause()}>
        <McText size={15}>II</McText>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  joyBase: {
    position: 'absolute',
    width: (JOY_RADIUS + 6) * 2,
    height: (JOY_RADIUS + 6) * 2,
    borderRadius: JOY_RADIUS + 6,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joyKnob: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.75)' },
  round: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  jump: { width: 72, height: 72, borderRadius: 12 },
  sneak: { width: 52, height: 52, borderRadius: 10 },
  active: { backgroundColor: 'rgba(255,255,255,0.35)' },
  top: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', gap: 8 },
  topButton: {
    width: 40,
    height: 34,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
