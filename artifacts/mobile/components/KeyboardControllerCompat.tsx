import React, { type PropsWithChildren } from "react";
import {
  KeyboardAvoidingView as ReactNativeKeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { isExpoGo } from "@/lib/expoEnvironment";

type KeyboardControllerModule = typeof import("react-native-keyboard-controller");
export type KeyboardAvoidingViewControllerProps =
  import("react-native-keyboard-controller").KeyboardAvoidingViewProps;

const nativeKeyboardController: KeyboardControllerModule | null =
  Platform.OS === "web" || isExpoGo()
    ? null
    : require("react-native-keyboard-controller");

export function KeyboardProvider({ children }: PropsWithChildren) {
  const NativeProvider = nativeKeyboardController?.KeyboardProvider;
  return NativeProvider ? <NativeProvider>{children}</NativeProvider> : <>{children}</>;
}

export function KeyboardAvoidingView(
  props: KeyboardAvoidingViewControllerProps,
) {
  const NativeKeyboardAvoidingView = nativeKeyboardController?.KeyboardAvoidingView;
  if (NativeKeyboardAvoidingView) {
    return <NativeKeyboardAvoidingView {...props} />;
  }

  const {
    automaticOffset: _automaticOffset,
    behavior,
    ...fallbackProps
  } = props as KeyboardAvoidingViewControllerProps & {
    automaticOffset?: boolean;
  };
  const fallbackBehavior =
    behavior === "translate-with-padding" ? "padding" : behavior;

  return (
    <ReactNativeKeyboardAvoidingView
      {...fallbackProps}
      behavior={fallbackBehavior}
    />
  );
}

export function KeyboardAwareScrollView(props: any) {
  const NativeKeyboardAwareScrollView =
    nativeKeyboardController?.KeyboardAwareScrollView;
  if (NativeKeyboardAwareScrollView) {
    return <NativeKeyboardAwareScrollView {...props} />;
  }

  const {
    bottomOffset: _bottomOffset,
    extraKeyboardSpace: _extraKeyboardSpace,
    extraScrollHeight: _extraScrollHeight,
    ...fallbackProps
  } = props;
  return (
    <ScrollView
      {...fallbackProps}
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
    />
  );
}

export function KeyboardStickyView(props: any) {
  const NativeKeyboardStickyView = nativeKeyboardController?.KeyboardStickyView;
  if (NativeKeyboardStickyView) {
    return <NativeKeyboardStickyView {...props} />;
  }

  const {
    offset,
    enabled = true,
    ...fallbackProps
  } = props;
  return (
    <ReactNativeKeyboardAvoidingView
      {...fallbackProps}
      enabled={enabled}
      behavior={Platform.OS === "ios" ? "position" : undefined}
      keyboardVerticalOffset={offset?.opened ?? 0}
    />
  );
}

export function useKeyboardContext(): any {
  if (nativeKeyboardController) {
    return nativeKeyboardController.useKeyboardContext();
  }
  return { reanimated: { height: { value: 0 }, progress: { value: 0 } } };
}
