import { Linking } from 'react-native';

export const openUrl = (url: string, _target?: string): void => {
  void Linking.openURL(url);
};
