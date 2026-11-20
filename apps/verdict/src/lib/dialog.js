import { Alert, Platform } from 'react-native';

// Alert.alert does nothing in a browser (react-native-web), so on the web
// this falls back to the browser's own dialogs. Same signature as
// Alert.alert, for dialogs with at most one non-cancel button.
export function alert(title, message, buttons) {
  if (Platform.OS !== 'web') return Alert.alert(title, message || undefined, buttons);
  const text = [title, message].filter(Boolean).join('\n\n');
  const list = buttons || [];
  const cancel = list.find((b) => b.style === 'cancel');
  const action = list.find((b) => b.style !== 'cancel');
  if (!action) {
    window.alert(text);
    if (cancel && cancel.onPress) cancel.onPress();
    return undefined;
  }
  if (window.confirm(`${text}\n\nOK = ${action.text}${cancel ? `, Cancel = ${cancel.text}` : ''}`)) {
    if (action.onPress) action.onPress();
  } else if (cancel && cancel.onPress) {
    cancel.onPress();
  }
  return undefined;
}

// Ask for a line of text. Resolves to the text, or null when cancelled.
export function prompt(title, message) {
  if (Platform.OS === 'web') return Promise.resolve(window.prompt([title, message].filter(Boolean).join('\n\n')));
  if (Alert.prompt) {
    return new Promise((resolve) => Alert.prompt(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      { text: 'OK', onPress: (v) => resolve(v) },
    ]));
  }
  // Android has no Alert.prompt: a plain confirm stands in.
  return new Promise((resolve) => Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    { text: 'OK', onPress: () => resolve('__confirmed__') },
  ]));
}
