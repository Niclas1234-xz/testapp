// Palette and type taken from thewellnest.ch: warm cream, bronze accents, olive, Montserrat.
export const colors = {
  background: '#F6F1EA',
  surface: '#FFFDFA',
  sand: '#EEE8DF',
  ink: '#2E2B27',
  inkSoft: '#62584C',
  muted: '#998A79',
  line: '#E6DDD1',
  lineStrong: '#CFC1B0',
  bronze: '#9A7D60',
  olive: '#465139',
  oliveDeep: '#31331F',
  sage: '#8E9A7B',
  terracotta: '#B9876B',
  onDark: '#F6F1EA',
  onDarkMuted: 'rgba(246, 241, 234, 0.62)',
} as const;

export const fonts = {
  light: 'Montserrat_300Light',
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semibold: 'Montserrat_600SemiBold',
} as const;

export const radius = {
  sm: 12,
  md: 20,
  lg: 28,
  pill: 999,
} as const;

// Space the floating tab bar takes up above the bottom safe-area inset.
export const TAB_BAR_SPACE = 112;
