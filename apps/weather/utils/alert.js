import { Alert, Platform } from "react-native";

// react-native-web ships Alert.alert as a no-op, so on the web every error
// message and confirmation would silently disappear. Same signature as
// Alert.alert; on the web it falls back to the browser's own dialogs.
export default function alert(title, message, buttons) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = [title, message].filter(Boolean).join("\n\n");
  const actions = buttons || [];
  const cancel = actions.find((b) => b.style === "cancel");
  const confirm = actions.find((b) => b !== cancel);

  if (cancel && confirm) {
    const chosen = window.confirm(text) ? confirm : cancel;
    chosen.onPress?.();
    return;
  }

  window.alert(text);
  actions[0]?.onPress?.();
}
