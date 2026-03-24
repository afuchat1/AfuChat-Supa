import { ActionSheetIOS, Alert, Platform, ToastAndroid } from "react-native";

export type AlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

/**
 * Show a brief, non-blocking toast message.
 *   Android → ToastAndroid
 *   iOS     → dismissable Alert (native feel; no persistent button)
 */
export function showToast(message: string, long = false) {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, long ? ToastAndroid.LONG : ToastAndroid.SHORT);
  } else if (Platform.OS === "ios") {
    Alert.alert("", message, [{ text: "OK", style: "cancel" }], {
      cancelable: true,
    });
  }
}

/**
 * Show a native platform dialog or toast.
 *
 * No buttons supplied:
 *   Android → ToastAndroid (short feedback, non-blocking)
 *   iOS     → Alert with a single "OK" button
 *
 * Buttons supplied, iOS, contains a destructive button:
 *   → ActionSheetIOS bottom sheet (native iOS confirmation pattern)
 *
 * Buttons supplied, iOS, no destructive:
 *   → Alert.alert
 *
 * Buttons supplied, Android:
 *   → Alert.alert (native Android dialog)
 *
 * Web:
 *   → window.alert / window.confirm fallback
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
) {
  /* ── Web fallback ── */
  if (Platform.OS === "web") {
    _webFallback(title, message, buttons);
    return;
  }

  /* ── No buttons → toast / simple notification ── */
  if (!buttons || buttons.length === 0) {
    if (Platform.OS === "android") {
      const msg = message ? `${title}: ${message}` : title;
      ToastAndroid.show(msg, ToastAndroid.LONG);
    } else {
      Alert.alert(title, message || "", [{ text: "OK" }]);
    }
    return;
  }

  /* ── iOS with a destructive action → ActionSheetIOS ── */
  if (Platform.OS === "ios") {
    const hasDestructive = buttons.some((b) => b.style === "destructive");

    if (hasDestructive) {
      const cancelBtn = buttons.find((b) => b.style === "cancel");
      const destructiveBtn = buttons.find((b) => b.style === "destructive");
      const otherBtns = buttons.filter(
        (b) => b.style !== "cancel" && b.style !== "destructive",
      );

      // Option order: destructive first, then default, then cancel last
      const options: string[] = [
        ...(destructiveBtn ? [destructiveBtn.text] : []),
        ...otherBtns.map((b) => b.text),
        cancelBtn?.text ?? "Cancel",
      ];
      const cancelButtonIndex = options.length - 1;
      const destructiveButtonIndex = destructiveBtn ? 0 : undefined;

      ActionSheetIOS.showActionSheetWithOptions(
        { title, message, options, cancelButtonIndex, destructiveButtonIndex },
        (buttonIndex) => {
          if (buttonIndex === cancelButtonIndex) {
            cancelBtn?.onPress?.();
          } else if (destructiveBtn && buttonIndex === 0) {
            destructiveBtn.onPress?.();
          } else {
            const offset = destructiveBtn ? 1 : 0;
            otherBtns[buttonIndex - offset]?.onPress?.();
          }
        },
      );
      return;
    }

    // Non-destructive on iOS → standard Alert
    Alert.alert(title, message || "", buttons);
    return;
  }

  /* ── Android → native Alert dialog ── */
  Alert.alert(title, message || "", buttons);
}

/* ─────────────────────────────────────────────── */
/*  Internal web fallback (unchanged behaviour)    */
/* ─────────────────────────────────────────────── */
function _webFallback(
  title: string,
  message?: string,
  buttons?: AlertButton[],
) {
  const msg = message ? `${title}\n${message}` : title;

  if (!buttons || buttons.length === 0) {
    window.alert(msg);
    return;
  }

  if (buttons.length === 1) {
    window.alert(msg);
    buttons[0].onPress?.();
    return;
  }

  const cancelBtn = buttons.find((b) => b.style === "cancel");
  const actionBtns = buttons.filter((b) => b.style !== "cancel");

  if (actionBtns.length === 1) {
    const result = window.confirm(msg);
    if (result) actionBtns[0].onPress?.();
    else cancelBtn?.onPress?.();
    return;
  }

  const choices = actionBtns.map((b, i) => `${i + 1}. ${b.text}`).join("\n");
  const input = window.prompt(
    `${msg}\n\n${choices}\n\nEnter a number (or cancel):`,
  );
  if (input === null || input.trim() === "") {
    cancelBtn?.onPress?.();
    return;
  }
  const idx = parseInt(input.trim(), 10) - 1;
  if (idx >= 0 && idx < actionBtns.length) actionBtns[idx].onPress?.();
  else cancelBtn?.onPress?.();
}
