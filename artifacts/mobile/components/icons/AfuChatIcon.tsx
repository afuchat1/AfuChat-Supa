import React from "react";
import Svg, { Path, G } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

/**
 * AfuChat brand icon — the logo symbol without background.
 * Two curved swoosh arcs forming a broken circle, with an × in the centre.
 * ViewBox 0 0 100 100, outer radius 40, inner radius 24.
 *
 * Geometry (all angles in SVG convention: 0°=right, clockwise positive):
 *   Swoosh 1 — clockwise arc from 320° to 140° (180°)
 *   Swoosh 2 — clockwise arc from 160° to 340° (180°)
 *   20° gaps at ~330° (upper-right) and ~150° (lower-left) form the arrow tips.
 *   × = 12-point plus shape rotated 45° around (50, 50).
 */
export default function AfuChatIcon({ size = 24, color = "#00C2CB" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Swoosh 1: upper-right → lower-left, clockwise 180° arc */}
      <Path
        fill={color}
        d="M 81 24 A 40 40 0 0 1 19 76 L 32 65 A 24 24 0 0 0 68 35 Z"
      />

      {/* Swoosh 2: lower-left-area → upper-right-area, clockwise 180° arc */}
      <Path
        fill={color}
        d="M 12 64 A 40 40 0 0 1 88 36 L 73 42 A 24 24 0 0 0 27 58 Z"
      />

      {/* × in centre — a plus (+) rotated 45° around (50,50) */}
      {/* Plus path: arm length 22, arm half-width 7 */}
      <G transform="rotate(45, 50, 50)">
        <Path
          fill={color}
          d="M 43 28 L 57 28 L 57 43 L 72 43 L 72 57 L 57 57 L 57 72 L 43 72 L 43 57 L 28 57 L 28 43 L 43 43 Z"
        />
      </G>
    </Svg>
  );
}
