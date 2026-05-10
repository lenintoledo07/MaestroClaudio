// Versión nativa del AbstractArt de la web. Usa react-native-svg
// para que se vea idéntico en iOS/Android sin canvas pesado.

import * as React from 'react';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop, Circle, Line, G } from 'react-native-svg';

const PALETTES: Record<string, { from: string; to: string; accent: string }> = {
  HE:  { from: '#818CF8', to: '#A5B4FC', accent: '#C7D2FE' },
  CNR: { from: '#A78BFA', to: '#C084FC', accent: '#DDD6FE' },
  MDM: { from: '#67E8F9', to: '#A5F3FC', accent: '#CFFAFE' },
  GS:  { from: '#86EFAC', to: '#BBF7D0', accent: '#DCFCE7' },
  XX:  { from: '#52525B', to: '#71717A', accent: '#A1A1AA' },
};

function family(code?: string | null): keyof typeof PALETTES {
  if (!code) return 'XX';
  const prefix = String(code).toUpperCase().split('-')[0] as keyof typeof PALETTES;
  return PALETTES[prefix] ? prefix : 'XX';
}

type Props = {
  courseCode?: string | null;
  width?: number;
  height?: number;
};

export default function AbstractArt({ courseCode, width = 320, height = 80 }: Props) {
  const fam = family(courseCode);
  const p = PALETTES[fam];
  const id = `art-${fam}`;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id={`${id}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={p.from} stopOpacity={0.55} />
          <Stop offset="100%" stopColor={p.to} stopOpacity={0.15} />
        </LinearGradient>
        <RadialGradient id={`${id}-glow`} cx="20%" cy="40%" r="70%">
          <Stop offset="0%" stopColor={p.accent} stopOpacity={0.45} />
          <Stop offset="100%" stopColor={p.from} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="#181818" />
      <Rect width={width} height={height} fill={`url(#${id}-bg)`} />
      <Rect width={width} height={height} fill={`url(#${id}-glow)`} />

      {fam === 'HE' && <Hacking width={width} height={height} p={p} />}
      {fam === 'CNR' && <Normativa width={width} height={height} p={p} />}
      {fam === 'MDM' && <Monitoring width={width} height={height} p={p} />}
      {fam === 'GS' && <Gobierno width={width} height={height} p={p} />}
      {fam === 'XX' && <Default width={width} height={height} p={p} />}
    </Svg>
  );
}

type SubProps = { width: number; height: number; p: { from: string; to: string; accent: string } };

function Hacking({ width, height, p }: SubProps) {
  return (
    <G>
      <Circle cx={width * 0.18} cy={height * 0.5} r={height * 0.55} fill={p.from} opacity={0.18} />
      <Circle cx={width * 0.78} cy={height * 0.3}  r={height * 0.4}  fill={p.accent} opacity={0.20} />
      <Line x1={0} y1={height * 0.75} x2={width} y2={height * 0.6} stroke={p.from}   strokeWidth={0.6} opacity={0.5} />
      <Line x1={0} y1={height * 0.85} x2={width} y2={height * 0.7} stroke={p.accent} strokeWidth={0.4} opacity={0.4} />
    </G>
  );
}

function Normativa({ width, height, p }: SubProps) {
  const bars = [0.1, 0.18, 0.4, 0.32, 0.55, 0.42, 0.7, 0.5];
  const w = (width - 40) / bars.length;
  return (
    <G x={20} y={height * 0.3}>
      {bars.map((h, i) => (
        <Rect key={i} x={i * w + 2} y={0} width={w - 4} height={height * h} fill={p.accent} opacity={0.4 + (i % 3) * 0.15} rx={1} />
      ))}
    </G>
  );
}

function Monitoring({ width, height, p }: SubProps) {
  const cx = width * 0.5, cy = height * 0.5;
  return (
    <G>
      {[0.2, 0.4, 0.6, 0.8, 1.0].map((r, i) => (
        <Circle key={i} cx={cx} cy={cy} r={r * height * 0.6} fill="none" stroke={p.accent} strokeWidth={0.6} opacity={0.5 - i * 0.08} />
      ))}
      <Circle cx={cx} cy={cy} r={3} fill={p.from} />
    </G>
  );
}

function Gobierno({ width, height, p }: SubProps) {
  const cols = 12, rows = 4;
  const dx = width / cols, dy = height / rows;
  const dots: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push(<Circle key={`${r}-${c}`} cx={c * dx + dx / 2} cy={r * dy + dy / 2} r={1} fill={p.accent} opacity={0.45} />);
    }
  }
  return (
    <G>
      {dots}
      <Line x1={0} y1={height * 0.5} x2={width} y2={height * 0.5} stroke={p.from} strokeWidth={0.4} opacity={0.4} />
    </G>
  );
}

function Default({ width, height, p }: SubProps) {
  const dots: React.ReactNode[] = [];
  for (let i = 0; i < 14; i++) {
    dots.push(<Circle key={i} cx={(i / 13) * width + 6} cy={height * (0.4 + 0.2 * Math.sin(i * 0.9))} r={2} fill={p.accent} opacity={0.3} />);
  }
  return <G>{dots}</G>;
}
