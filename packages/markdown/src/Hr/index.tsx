import { HorizontalRule } from '../components/HorizontalRule';
import type { HorizontalRuleProps } from '../types';

// must match the markdown HorizontalRule's rendering exactly (SB-M-1214)
export const HR = (props: HorizontalRuleProps) => <HorizontalRule {...props} />;
