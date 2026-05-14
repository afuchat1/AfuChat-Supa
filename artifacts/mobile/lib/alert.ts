import { Alert, Platform } from "react-native";
import { showToast as _showToast } from "./toast";

export type AlertButton = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
};

type Listener = (state: AlertState) => void;

let _listener: Listener | null = null;

export function registerAlertListener(fn: Listener) {
  _listener = fn;
}

export function unregisterAlertListener() {
  _listener = null;
}

export function showToast(message: string, _long = false) {
  _showToast(message, { type: "info" });
}

export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
) {
  if (_listener) {
    _listener({ visible: true, title, message, buttons });
    return;
  }

  if (Platform.OS === "web") {
    _webFallback(title, message, buttons);
    return;
  }

  const nativeButtons =
    buttons && buttons.length > 0
      ? buttons.map((b) => ({
          text: b.text,
          style: b.style,
          onPress: b.onPress,
        }))
      : [{ text: "OK" }];
  Alert.alert(title || "", message || "", nativeButtons, { cancelable: true });
}

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

export function confirmAlert(
  title: string,
  message?: string,
  options?: {
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
  },
): Promise<boolean> {
  return new Promise((resolve) => {
    showAlert(title, message, [
      {
        text: options?.cancelText || "Cancel",
        style: "cancel",
        onPress: () => resolve(false),
      },
      {
        text: options?.confirmText || "OK",
        style: options?.destructive ? "destructive" : "default",
        onPress: () => resolve(true),
      },
    ]);
  });
}
