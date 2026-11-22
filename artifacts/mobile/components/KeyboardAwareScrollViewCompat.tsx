import React from "react";
import {
  Platform,
  ScrollView,
  ScrollViewProps,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

type Props = ScrollViewProps & {
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  bottomOffset?: number;
  extraScrollHeight?: number;
  [key: string]: any;
};

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  bottomOffset = 16,
  style,
  contentContainerStyle,
  extraScrollHeight,
  ...props
}: Props) {
  if (Platform.OS === "web") {
    return (
      <ScrollView
        {...props}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        style={style}
        contentContainerStyle={contentContainerStyle}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView
      {...props}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      bottomOffset={bottomOffset}
      extraKeyboardSpace={extraScrollHeight}
      style={style}
      contentContainerStyle={contentContainerStyle}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
