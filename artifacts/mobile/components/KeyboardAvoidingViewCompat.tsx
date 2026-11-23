import React from "react";
import {
  KeyboardAvoidingView as ReactNativeKeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  KeyboardAvoidingView as ControllerKeyboardAvoidingView,
  type KeyboardAvoidingViewControllerProps,
} from "@/components/KeyboardControllerCompat";

export type KeyboardAvoidingViewCompatProps =
  KeyboardAvoidingViewControllerProps;

export function KeyboardAvoidingViewCompat(
  props: KeyboardAvoidingViewCompatProps,
) {
  if (Platform.OS === "web") {
    const {
      automaticOffset: _automaticOffset,
      enabled: _enabled,
      behavior,
      ...webProps
    } = props;
    const webBehavior = behavior === "translate-with-padding" ? "padding" : behavior;
    return (
      <ReactNativeKeyboardAvoidingView
        {...webProps}
        behavior={webBehavior}
      />
    );
  }

  return <ControllerKeyboardAvoidingView {...props} />;
}
