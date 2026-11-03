import React, { forwardRef } from "react";
import {
  StyleSheet,
  TextInput as NativeTextInput,
  type TextInputInstance,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { FloatingGlassSurface } from "@/components/ui/FloatingNavSurface";

type AfuTextInputProps = TextInputProps & {
  appearance?: "floating" | "embedded";
  embeddedPaddingVertical?: number;
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
  "position",
  "right",
  "start",
  "top",
  "width",
  "zIndex",
]);

function splitStyle(style: StyleProp<TextStyle>) {
  const flattened = (StyleSheet.flatten(style) ?? {}) as TextStyle & Record<string, unknown>;
  const outer: ViewStyle = {};
  const text: TextStyle = {};

  for (const [key, value] of Object.entries(flattened)) {
    if (OUTER_STYLE_KEYS.has(key)) {
      (outer as Record<string, unknown>)[key] = value;
      continue;
    }
    if (
      key === "backgroundColor" ||
      key.startsWith("border") ||
      key.startsWith("padding") ||
      key.startsWith("shadow") ||
      key === "elevation"
    ) {
      continue;
    }
    (text as Record<string, unknown>)[key] = value;
  }

  return { flattened, outer, text };
}

const AfuTextInput = forwardRef<TextInputInstance, AfuTextInputProps>(
  function AfuTextInput(
    {
      appearance = "floating",
      embeddedPaddingVertical,
      style,
      multiline = false,
      placeholderTextColor,
      selectionColor,
      ...props
    },
    ref,
  ) {
    const { colors } = useTheme();

    if (appearance === "embedded") {
      const flattened = (StyleSheet.flatten(style) ?? {}) as TextStyle & Record<string, unknown>;
      const embeddedStyle: TextStyle = {};
      for (const [key, value] of Object.entries(flattened)) {
        if (
          key === "backgroundColor" ||
          key.startsWith("border") ||
          key.startsWith("padding") ||
          key.startsWith("shadow") ||
          key === "elevation" ||
          key === "boxShadow"
        ) {
          continue;
        }
        (embeddedStyle as Record<string, unknown>)[key] = value;
      }
      return (
        <NativeTextInput
          ref={ref}
          {...props}
          multiline={multiline}
          style={[
            embeddedStyle,
            {
              color: (flattened.color as TextStyle["color"] | undefined) ?? colors.text,
              fontFamily: (flattened.fontFamily as string | undefined) ?? "Inter_400Regular",
              fontSize: (flattened.fontSize as number | undefined) ?? 15,
              lineHeight: (flattened.lineHeight as number | undefined) ?? 20,
              minWidth: 0,
              paddingHorizontal: 0,
              paddingVertical: embeddedPaddingVertical ?? (multiline ? 6 : 0),
              backgroundColor: "transparent",
              borderWidth: 0,
              outlineStyle: "none" as any,
              textAlignVertical:
                (flattened.textAlignVertical as TextStyle["textAlignVertical"] | undefined) ??
                (multiline ? "top" : "center"),
            },
          ]}
          placeholderTextColor={placeholderTextColor ?? colors.textMuted}
          selectionColor={selectionColor ?? colors.accent}
        />
      );
    }

    const { flattened, outer, text } = splitStyle(style);
    const requestedMinHeight = outer.minHeight;
    const minHeight =
      typeof requestedMinHeight === "number"
        ? Math.max(44, requestedMinHeight)
        : requestedMinHeight ?? 44;
    const fill = outer.height !== undefined;
    const textColor = (flattened.color as TextStyle["color"] | undefined) ?? colors.text;

    return (
      <FloatingGlassSurface
        fill={fill}
        variant="input"
        style={[styles.surface, outer, { minHeight }]}
        contentStyle={[
          styles.content,
          fill && styles.filledContent,
          multiline && styles.multilineContent,
        ]}
      >
        <NativeTextInput
          ref={ref}
          {...props}
          multiline={multiline}
          placeholderTextColor={placeholderTextColor ?? colors.textMuted}
          selectionColor={selectionColor ?? colors.accent}
          style={[
            styles.input,
            text,
            {
              color: textColor,
              height: fill ? "100%" : undefined,
              textAlignVertical:
                (flattened.textAlignVertical as TextStyle["textAlignVertical"] | undefined) ??
                (multiline ? "top" : "center"),
            },
          ]}
        />
      </FloatingGlassSurface>
    );
  },
);

AfuTextInput.displayName = "AfuTextInput";

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
  },
  filledContent: {
    flex: 1,
  },
  multilineContent: {
    alignItems: "stretch",
    paddingVertical: 8,
  },
  input: {
    width: "100%",
    flex: 1,
    minWidth: 0,
    minHeight: 24,
    paddingHorizontal: 0,
    paddingVertical: 6,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: "Inter_400Regular",
    backgroundColor: "transparent",
    borderWidth: 0,
    outlineStyle: "none" as any,
  },
});

export default AfuTextInput;
export type TextInput = NativeTextInput;
export { AfuTextInput as TextInput };
