import { Clipboard } from 'react-native';

export const writeToClipboard = async (text: string): Promise<boolean> => {
  try {
    // Core Clipboard is present in the pinned native runtime. Access stays
    // inside the guard so an unavailable module reports failure when copying.
    // oxlint-disable-next-line typescript/no-deprecated -- core Clipboard is the pinned native runtime's only built-in; no replacement dependency is installed
    Clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
};
