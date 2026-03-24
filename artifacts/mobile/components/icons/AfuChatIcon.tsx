import React from "react";
import Svg, { Path, G } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

/**
 * AfuChat brand icon as instant-rendering SVG (no image load delay).
 * Traced from the actual logo: two swoosh arcs forming a broken circular arrow
 * with an × in the centre.
 *
 * Geometry — viewBox 0 0 100 100, center (50,50):
 *   Outer ring radius: 38   Inner ring radius: 24
 *   Swoosh 1: ~200° CCW arc (330° → 130°) with calligraphic curved tails
 *   Swoosh 2: ~160° CCW arc (150° → 350°) with calligraphic curved tails
 *   × centre:  plus (+) shape rotated 45°, arm-length 23, arm-width 14
 */
export default function AfuChatIcon({ size = 24, color = "#00C2CB" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* ── Swoosh 1 ── large arc, ~200° CCW, upper-right → lower-left ── */}
      <Path
        fill={color}
        d={[
          "M 88 18",               // tail tip (upper-right)
          "C 88 24 85 28 83 31",   // curve into outer arc start @ 330°
          "A 38 38 0 1 0 26 79",   // outer arc CCW 200° → 130°
          "C 20 86 10 92 8 96",    // curve to lower-left tail tip
          "C 14 100 22 96 35 68",  // return from tail → inner arc start @ 130°
          "A 24 24 0 1 1 71 38",   // inner arc CW 200° → 330°
          "C 76 32 84 22 88 18",   // curve back to tail tip
          "Z",
        ].join(" ")}
      />

      {/* ── Swoosh 2 ── small arc, ~160° CCW, lower-left-area → upper-right ── */}
      <Path
        fill={color}
        d={[
          "M 12 72",               // tail tip (lower-left)
          "C 12 68 14 67 17 69",   // curve into outer arc start @ 150°
          "A 38 38 0 0 0 87 43",   // outer arc CCW 160° → 350°
          "C 91 40 94 34 94 30",   // curve to upper-right tail tip
          "C 90 24 86 28 74 46",   // return from tail → inner arc start @ 350°
          "A 24 24 0 0 1 29 62",   // inner arc CW 160° → 150°
          "C 24 64 16 68 12 72",   // curve back to tail tip
          "Z",
        ].join(" ")}
      />

      {/* ── × centre — plus (+) rotated 45° around (50,50) ── */}
      <G transform="rotate(45, 50, 50)">
        <Path
          fill={color}
          d="M 43 27 L 57 27 L 57 43 L 73 43 L 73 57 L 57 57 L 57 73 L 43 73 L 43 57 L 27 57 L 27 43 L 43 43 Z"
        />
      </G>
    </Svg>
  );
}
