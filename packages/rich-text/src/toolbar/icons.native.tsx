/**
 * Native icon components for the rich text editor toolbar
 *
 * Text-based replacements for the web SVG icons.
 */

import { Text, styled } from 'tamagui';

// ===========================================================================
// Text Style Icons (same as web)
// ===========================================================================

export const BoldIcon = styled(Text, {
  fontWeight: 'bold',
});

export const ItalicIcon = styled(Text, {
  fontStyle: 'italic',
});

export const UnderlineIcon = styled(Text, {
  textDecorationLine: 'underline',
});

export const StrikeIcon = styled(Text, {
  textDecorationLine: 'line-through',
});

// ===========================================================================
// Text-based icon replacements for native
// ===========================================================================

const IconText = styled(Text, {
  fontSize: 13,
  color: '$color11',
});

export const UndoIcon = () => <IconText>↩</IconText>;

export const RedoIcon = () => <IconText>↪</IconText>;

export const AlignLeftIcon = () => <IconText>☰</IconText>;

export const AlignCenterIcon = () => <IconText>☰</IconText>;

export const AlignRightIcon = () => <IconText>☰</IconText>;

export const AlignJustifyIcon = () => <IconText>☰</IconText>;

export const LinkIcon = () => <IconText>🔗</IconText>;

export const TextColorIcon = (_props: { color?: string | null }) => <IconText>A</IconText>;

export const HighlightIcon = (_props: { color?: string | null }) => <IconText>🖊</IconText>;

export const HorizontalRuleIcon = () => <IconText>―</IconText>;

export const ClearFormattingIcon = () => <IconText>✕</IconText>;

export const SubscriptIcon = () => <IconText>X₂</IconText>;

export const SuperscriptIcon = () => <IconText>X²</IconText>;

export const BulletListIcon = () => <IconText>•≡</IconText>;

export const OrderedListIcon = () => <IconText>1.</IconText>;

export const TaskListIcon = () => <IconText>☑</IconText>;

export const ImageIcon = () => <IconText>🖼</IconText>;

export const BlockquoteIcon = () => <IconText>❝</IconText>;

export const CodeBlockIcon = () => <IconText>{'</>'}</IconText>;
