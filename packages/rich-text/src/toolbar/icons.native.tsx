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

export function UndoIcon() {
  return <IconText>↩</IconText>;
}

export function RedoIcon() {
  return <IconText>↪</IconText>;
}

export function AlignLeftIcon() {
  return <IconText>☰</IconText>;
}

export function AlignCenterIcon() {
  return <IconText>☰</IconText>;
}

export function AlignRightIcon() {
  return <IconText>☰</IconText>;
}

export function AlignJustifyIcon() {
  return <IconText>☰</IconText>;
}

export function LinkIcon() {
  return <IconText>🔗</IconText>;
}

export function TextColorIcon(_props: { color?: string | null }) {
  return <IconText>A</IconText>;
}

export function HighlightIcon(_props: { color?: string | null }) {
  return <IconText>🖊</IconText>;
}

export function HorizontalRuleIcon() {
  return <IconText>―</IconText>;
}

export function ClearFormattingIcon() {
  return <IconText>✕</IconText>;
}

export function SubscriptIcon() {
  return <IconText>X₂</IconText>;
}

export function SuperscriptIcon() {
  return <IconText>X²</IconText>;
}

export function BulletListIcon() {
  return <IconText>•≡</IconText>;
}

export function OrderedListIcon() {
  return <IconText>1.</IconText>;
}

export function TaskListIcon() {
  return <IconText>☑</IconText>;
}

export function ImageIcon() {
  return <IconText>🖼</IconText>;
}

export function BlockquoteIcon() {
  return <IconText>❝</IconText>;
}

export function CodeBlockIcon() {
  return <IconText>{'</>'}</IconText>;
}
