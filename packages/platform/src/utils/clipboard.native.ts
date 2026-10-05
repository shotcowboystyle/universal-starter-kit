import { Clipboard } from 'react-native';

export async function writeToClipboard(text: string): Promise<boolean> {
  try {
    // Core Clipboard is present in the pinned native runtime. Access stays
    // inside the guard so an unavailable module reports failure when copying.
    Clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}
