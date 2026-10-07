import { Text, isWeb } from 'tamagui';

import type { BreakProps } from '../types';

export function Break(_props: BreakProps) {
  // a literal "\n" collapses under white-space: normal on web (SB-M-1210)
  if (isWeb) {
    return <br />;
  }
  return <Text>{'\n'}</Text>;
}
