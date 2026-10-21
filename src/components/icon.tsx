import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { colors } from '@/lib/theme';

// Thin line icons in the style of the class cards on thewellnest.ch.
const glyphs = {
  home: <Path d="M3.5 10.5 12 3.5l8.5 7V20a1 1 0 0 1-1 1H15v-6.5H9V21H4.5a1 1 0 0 1-1-1z" />,
  calendar: (
    <>
      <Rect x={3} y={5} width={18} height={16} rx={3} />
      <Line x1={3} y1={10} x2={21} y2={10} />
      <Line x1={8} y1={3} x2={8} y2={7} />
      <Line x1={16} y1={3} x2={16} y2={7} />
    </>
  ),
  rings: (
    <>
      <Circle cx={8.75} cy={12} r={5.75} />
      <Circle cx={15.25} cy={12} r={5.75} />
    </>
  ),
  ringsVertical: (
    <>
      <Circle cx={12} cy={8.75} r={5.75} />
      <Circle cx={12} cy={15.25} r={5.75} />
    </>
  ),
  user: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4.5 21c0-4.1 3.4-7 7.5-7s7.5 2.9 7.5 7" />
    </>
  ),
  lotus: (
    <>
      <Path d="M12 4c2.6 3.1 2.6 8.4 0 12-2.6-3.6-2.6-8.9 0-12z" />
      <Path d="M12 16c-4 0-7-2.9-8-7 3.6.4 6.3 2.6 8 7z" />
      <Path d="M12 16c4 0 7-2.9 8-7-3.6.4-6.3 2.6-8 7z" />
      <Path d="M6 19.5h12" />
    </>
  ),
  leaf: (
    <>
      <Path d="M5 19C5 10.5 10 5 19 5c0 9-5.5 14-14 14z" />
      <Path d="M5 19l8-8" />
    </>
  ),
  heart: (
    <Path d="M12 20.5S3.5 15 3.5 9.25A4.6 4.6 0 0 1 8.1 4.5c1.6 0 3 .8 3.9 2.1.9-1.3 2.3-2.1 3.9-2.1a4.6 4.6 0 0 1 4.6 4.75C20.5 15 12 20.5 12 20.5z" />
  ),
  sun: (
    <>
      <Circle cx={12} cy={12} r={3.5} />
      <Path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  waves: (
    <Path d="M3 8c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 12c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 16c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0" />
  ),
  target: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Circle cx={12} cy={12} r={5} />
      <Circle cx={12} cy={12} r={1.5} />
    </>
  ),
  barbell: <Path d="M6.5 7.5v9M3.5 10v4M17.5 7.5v9M20.5 10v4M6.5 12h11" />,
  spark: <Path d="M12 3l1.8 7.2L21 12l-7.2 1.8L12 21l-1.8-7.2L3 12l7.2-1.8z" />,
  clock: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  pin: (
    <>
      <Path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <Circle cx={12} cy={9.5} r={2.5} />
    </>
  ),
  arrowRight: <Path d="M4 12h16M14 6l6 6-6 6" />,
  chevronLeft: <Path d="M15 5l-7 7 7 7" />,
  chevronRight: <Path d="M9 5l7 7-7 7" />,
  chevronDown: <Path d="M5 9l7 7 7-7" />,
  check: <Path d="M5 12.5l5 5L19 7" />,
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  mail: (
    <>
      <Rect x={3} y={5} width={18} height={14} rx={2.5} />
      <Path d="M3.5 7l8.5 6 8.5-6" />
    </>
  ),
  bell: <Path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4" />,
  card: (
    <>
      <Rect x={3} y={6} width={18} height={13} rx={2.5} />
      <Path d="M3 10.5h18M7 15h3" />
    </>
  ),
  document: <Path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
  logout: <Path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9" />,
  sliders: (
    <>
      <Path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <Circle cx={15} cy={7} r={2} />
      <Circle cx={9} cy={17} r={2} />
    </>
  ),
} as const;

export type IconName = keyof typeof glyphs;

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 22, color = colors.ink, strokeWidth = 1.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round">
        {glyphs[name]}
      </G>
    </Svg>
  );
}
