import React from "react";
import {
  StyleSheet,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { FloatingGlassSurface } from "@/components/ui/FloatingNavSurface";

type AfuInputSurfaceProps = ViewProps & {
  variant?: "navigation" | "input";
  cornerRadius?: number;
  contentStyle?: StyleProp<ViewStyle>;
};

const OUTER_STYLE_KEYS = new Set([
  "alignSelf",
  "bottom",
  "display",
  "end",
  "flex",
  "flexBasis",
  "flexGrow",
  "flexShrink",
  "height",
  "left",
  "margin",
  "marginBottom",
  "marginEnd",
  "marginHorizontal",
  "marginLeft",
  "marginRight",
  "marginStart",
  "marginTop",
  "marginVertical",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "opacity",
  "position",
  "right",
  "start",
  "top",
  "transform",
  "width",
  "zIndex",
]);

function splitSurfaceStyle(style: StyleProp<ViewStyle>) {
  const flattened = (StyleSheet.flatten(style) ?? {}) as ViewStyle & Record<string, unknown>;
  const outer: ViewStyle = {};
  const content: ViewStyle = {};

  for (const [key, value] of Object.entries(flattened)) {
    if (key === "backgroundColor" || key.startsWith("border") || key.startsWith("shadow") || key === "elevation" || key === "boxShadow" || key === "overflow") {
      continue;
    }
    if (OUTER_STYLE_KEYS.has(key)) {
      (outer as Record<string, unknown>)[key] = value;
      continue;
    }
    (content as Record<string, unknown>)[key] = value;
  }

  return { outer, content };
}

export function AfuInputSurface({
  style,
  children,
  onLayout,
  variant = "input",
  cornerRadius,
  contentStyle,
  ...viewProps
}: AfuInputSurfaceProps) {
  const { outer, content } = splitSurfaceStyle(style);
  const minHeight =
    typeof outer.minHeight === "number"
      ? Math.max(44, outer.minHeight)
      : outer.minHeight ?? 44;

  return (
    <FloatingGlassSurface
      {...viewProps}
      fill={outer.height !== undefined}
      variant={variant}
      cornerRadius={cornerRadius}
      style={[styles.surface, outer, { minHeight }]}
      contentStyle={[styles.content, content, contentStyle]}
      onLayout={onLayout}
    >
      {children}
    </FloatingGlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    alignSelf: "stretch",
    minHeight: 44,
  },
  content: {
    width: "100%",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 2,
    gap: 8,
  },
});
