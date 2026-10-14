import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { Game } from '../game';
import { modifierKeys } from './Inventory';

/** Keyboard + mouse (with pointer lock) controls for the web build, mirroring Minecraft Java. */
export function useDesktopInput(game: Game, canvas: HTMLCanvasElement | null) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !canvas) return;
    const keys = new Set<string>();
    const c = game.controls;
    let lastForwardPress = 0;

    const updateMovement = () => {
      c.forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      c.strafe = (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0);
      c.jump = keys.has('Space');
      c.sneak = keys.has('ShiftLeft') || keys.has('ShiftRight');
      if (c.forward <= 0) c.sprint = false;
    };

    const locked = () => document.pointerLockElement === canvas;

    const onKeyDown = (e: KeyboardEvent) => {
      modifierKeys.shift = e.shiftKey;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3', 'F5', 'Tab'].includes(e.code)) e.preventDefault();
      const screen = game.screen;
      if (screen) {
        if (e.code === 'Escape' || (e.code === 'KeyE' && screen.kind !== 'pause' && screen.kind !== 'options' && screen.kind !== 'death')) {
          if (screen.kind === 'options') game.setScreen({ kind: 'pause' });
          else if (screen.kind === 'death') return;
          else if (screen.kind === 'pause') game.setScreen(null);
          else game.closeScreen();
        }
        return;
      }
      if (!e.repeat && e.code === 'KeyW') {
        const now = performance.now();
        if (now - lastForwardPress < 300) c.sprint = true;
        lastForwardPress = now;
      }
      keys.add(e.code);
      updateMovement();
      switch (e.code) {
        case 'ControlLeft':
        case 'ControlRight':
        case 'KeyR':
          c.sprint = true;
          break;
        case 'KeyE':
          game.openScreen({ kind: 'inventory' });
          document.exitPointerLock?.();
          break;
        case 'Escape':
          game.pause();
          break;
        case 'KeyQ':
          game.dropHeld(e.ctrlKey);
          break;
        case 'F5':
          game.thirdPerson = !game.thirdPerson;
          break;
        case 'F3':
          game.showDebug = !game.showDebug;
          break;
        default:
          if (e.code.startsWith('Digit')) {
            const n = Number(e.code.slice(5));
            if (n >= 1 && n <= 9) game.selectSlot(n - 1);
          }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      modifierKeys.shift = e.shiftKey;
      keys.delete(e.code);
      updateMovement();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (game.screen) return;
      if (!locked()) {
        canvas.requestPointerLock?.();
        return;
      }
      e.preventDefault();
      if (e.button === 0) game.pressAttack();
      else if (e.button === 2) game.pressUse();
      else if (e.button === 1) game.pickBlock();
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) c.attack = false;
      if (e.button === 2) c.use = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!locked() || game.screen) return;
      // Minecraft's sensitivity curve: 100 % ≈ 0.15° per pixel.
      const f = game.settings.sensitivity * 0.6 + 0.2;
      const k = ((f * f * f * 8 * 0.15) * Math.PI) / 180;
      c.lookYaw += e.movementX * k;
      c.lookPitch += e.movementY * k * (game.settings.invertY ? -1 : 1);
    };

    const onWheel = (e: WheelEvent) => {
      if (game.screen) return;
      e.preventDefault();
      game.selectSlot(game.player.selected + (e.deltaY > 0 ? 1 : -1));
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    const onLockChange = () => {
      if (!locked()) {
        c.attack = false;
        c.use = false;
        keys.clear();
        updateMovement();
        if (!game.screen && game.getHud().loading >= 1) game.pause();
      }
    };

    const onBlur = () => {
      keys.clear();
      updateMovement();
      c.attack = false;
      c.use = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('pointerlockchange', onLockChange);
      if (locked()) document.exitPointerLock?.();
    };
  }, [game, canvas]);
}
