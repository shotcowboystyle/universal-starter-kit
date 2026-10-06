import { Linking } from 'react-native';

export function openUrl(url: string, _target?: string): void {
  Linking.openURL(url);
}
