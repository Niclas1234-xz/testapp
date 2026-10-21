import * as Speech from 'expo-speech';
import { useEffect } from 'react';

const WELCOME_TEXT =
  'Leute, diese App ist so tuff! Mach ein Foto von einem Auto, und ich sag dir sofort, ' +
  'welches Modell es ist und was es kostet. Los geht’s!';

/** Speaks a greeting when the screen opens, styled after the YouTube Shorts TTS voice. */
export function useWelcomeVoice() {
  useEffect(() => {
    Speech.speak(WELCOME_TEXT, {
      language: 'de-DE',
      // Slightly higher and faster than normal sounds like the typical Shorts narrator.
      pitch: 1.2,
      rate: 1.1,
    });
    return () => {
      Speech.stop();
    };
  }, []);
}
