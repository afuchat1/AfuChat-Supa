import { Alert, Platform, ToastAndroid } from "react-native";

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

export function showToast(message: string, long = false) {
  if (Platform.OS === "android") {
    ToastAndroid.show(message, long ? ToastAndroid.LONG : ToastAndroid.SHORT);
  } else {
    showAlert("", message);
  }
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

  const nativeButtons = (buttons && buttons.length > 0)
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
