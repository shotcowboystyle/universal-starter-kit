/**
 * Icon components for the rich text editor toolbar (web).
 *
 * LC-16 / census #20: glyphs come from `@phosphor-icons/react` — the house
 * icon standard — so toolbar icons share stroke weight and optical size with
 * every other surface. Only the color-state icons (TextColorIcon /
 * HighlightIcon) stay hand-rolled: they render the currently selected color
 * as a functional swatch bar, which no static icon set provides.
 *
 * Native uses `icons.native.tsx` (text glyphs; phosphor stays out of the
 * native bundle).
 */

import { useDirection } from '@repo/ui';
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  CodeIcon,
  CodeSimpleIcon,
  ImageIcon as PhosphorImageIcon,
  LinkIcon as PhosphorLinkIcon,
  ListBulletsIcon,
  ListChecksIcon,
  ListNumbersIcon,
  MinusIcon,
  QuotesIcon,
  TextAlignCenterIcon,
  TextAlignJustifyIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextSubscriptIcon,
  TextSuperscriptIcon,
  TextTSlashIcon,
  TextUnderlineIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Text, styled } from 'tamagui';

const ICON_SIZE = 16;

// ===========================================================================
// SVG Wrapper (used by the color-state icons below)
// ===========================================================================

const SvgWrapper = styled(Text, {
  name: 'SvgWrapper',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

// ===========================================================================
// Text Style Icons
// ===========================================================================

// These historically rendered a styled letter child (`<BoldIcon>B</BoldIcon>`);
// the phosphor glyphs replace the letter, so children are accepted and ignored.

export function BoldIcon(_props: { children?: ReactNode }) {
  return <TextBIcon size={ICON_SIZE} />;
}

export function ItalicIcon(_props: { children?: ReactNode }) {
  return <TextItalicIcon size={ICON_SIZE} />;
}

export function UnderlineIcon(_props: { children?: ReactNode }) {
  return <TextUnderlineIcon size={ICON_SIZE} />;
}

export function StrikeIcon(_props: { children?: ReactNode }) {
  return <TextStrikethroughIcon size={ICON_SIZE} />;
}

// ===========================================================================
// Toolbar Icons (phosphor)
// ===========================================================================

// Undo/redo arrows encode travel through history (back/forward), so the
// glyph pair swaps under RTL (useDirection pattern); alignment icons below
// stay physical — they depict the literal alignment they produce.
export function UndoIcon() {
  const isRTL = useDirection() === 'rtl';
  return isRTL ? <ArrowUUpRightIcon size={ICON_SIZE} /> : <ArrowUUpLeftIcon size={ICON_SIZE} />;
}

export function RedoIcon() {
  const isRTL = useDirection() === 'rtl';
  return isRTL ? <ArrowUUpLeftIcon size={ICON_SIZE} /> : <ArrowUUpRightIcon size={ICON_SIZE} />;
}

export function AlignLeftIcon() {
  return <TextAlignLeftIcon size={ICON_SIZE} />;
}

export function AlignCenterIcon() {
  return <TextAlignCenterIcon size={ICON_SIZE} />;
}

export function AlignRightIcon() {
  return <TextAlignRightIcon size={ICON_SIZE} />;
}

export function AlignJustifyIcon() {
  return <TextAlignJustifyIcon size={ICON_SIZE} />;
}

export function LinkIcon() {
  return <PhosphorLinkIcon size={ICON_SIZE} />;
}

export function HorizontalRuleIcon() {
  return <MinusIcon size={ICON_SIZE} />;
}

export function ClearFormattingIcon() {
  return <TextTSlashIcon size={ICON_SIZE} />;
}

export function SubscriptIcon() {
  return <TextSubscriptIcon size={ICON_SIZE} />;
}

export function SuperscriptIcon() {
  return <TextSuperscriptIcon size={ICON_SIZE} />;
}

export function BulletListIcon() {
  return <ListBulletsIcon size={ICON_SIZE} />;
}

export function OrderedListIcon() {
  return <ListNumbersIcon size={ICON_SIZE} />;
}

export function TaskListIcon() {
  return <ListChecksIcon size={ICON_SIZE} />;
}

export function ImageIcon() {
  return <PhosphorImageIcon size={ICON_SIZE} />;
}

export function BlockquoteIcon() {
  return <QuotesIcon size={ICON_SIZE} />;
}

export function CodeBlockIcon() {
  return <CodeIcon size={ICON_SIZE} />;
}

export function InlineCodeIcon() {
  return <CodeSimpleIcon size={ICON_SIZE} />;
}

export function ExpandIcon() {
  return <ArrowsOutSimpleIcon size={ICON_SIZE} />;
}

export function CompressIcon() {
  return <ArrowsInSimpleIcon size={ICON_SIZE} />;
}

// ===========================================================================
// Color-state icons — genuinely custom (LC-16 kept-with-reason)
//
// Both render the CURRENT color as a swatch bar under the glyph, a functional
// state display no static icon set carries. currentColor keeps the glyph on
// the text color; the bar takes the live selection.
// ===========================================================================

export function TextColorIcon({ color }: { color?: string | null }) {
  return (
    <SvgWrapper>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none">
        <text
          x="12"
          y="14"
          textAnchor="middle"
          fontSize="14"
          fontWeight="bold"
          fill="currentColor">
          A
        </text>
        <rect
          x="4"
          y="18"
          width="16"
          height="3"
          rx="1"
          fill={color ?? 'currentColor'}
        />
      </svg>
    </SvgWrapper>
  );
}

export function HighlightIcon({ color }: { color?: string | null }) {
  return (
    <SvgWrapper>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        {color && (
          <rect
            x="2"
            y="18"
            width="8"
            height="4"
            rx="1"
            fill={color}
            stroke="none"
          />
        )}
      </svg>
    </SvgWrapper>
  );
}
