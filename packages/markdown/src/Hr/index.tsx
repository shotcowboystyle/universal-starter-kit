import { HorizontalRule } from '../components/HorizontalRule';

// must match the markdown HorizontalRule's rendering exactly (SB-M-1214)
export const HR = (props: Record<string, unknown>) => <HorizontalRule {...(props as any)} />;
