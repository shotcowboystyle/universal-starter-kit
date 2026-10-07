/**
 * KnobDialog - Tamagui Dialog wrapped with knob-wired styling.
 *
 * Since no shared Dialog component exists in the codebase, this internal
 * wrapper applies useResolvedKnobs to Tamagui's Dialog for consistent
 * borderRadius, elevation, and sizing across the table package.
 */

import { Dialog, DialogShowFocus } from '@repo/ui';
import { useResolvedKnobs } from '@repo/theme';
import type React from 'react';

export interface KnobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modal?: boolean;
  children: React.ReactNode;
}

export function KnobDialog({ open, onOpenChange, modal = true, children }: KnobDialogProps) {
  return (
    <Dialog
      modal={modal}
      open={open}
      onOpenChange={onOpenChange}>
      {children}
    </Dialog>
  );
}

export interface KnobDialogContentProps {
  children: React.ReactNode;
  minWidth?: number;
}

export function KnobDialogContent({ children, minWidth }: KnobDialogContentProps) {
  const { knobProps } = useResolvedKnobs();

  return (
    <Dialog.Portal>
      <Dialog.Overlay
        key="overlay"
        transition="quick"
        opacity={0.5}
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />

      <Dialog.Content
        {...knobProps.elevatedSurface}
        key="content"
        animateOnly={['transform', 'opacity']}
        transition={[
          'quick',
          {
            opacity: {
              overshootClamping: true,
            },
          },
        ]}
        enterStyle={{ x: 0, y: -20, opacity: 0, scale: 0.9 }}
        exitStyle={{ x: 0, y: 10, opacity: 0, scale: 0.95 }}
        {...knobProps.gapLg}
        elevation={knobProps.elevation}
        {...(minWidth ? { minWidth } : {})}>
        {children}
        <DialogShowFocus />
      </Dialog.Content>
    </Dialog.Portal>
  );
}

// Re-export Dialog sub-components for convenience
export const KnobDialogTrigger = Dialog.Trigger;
export const KnobDialogTitle = Dialog.Title;
export const KnobDialogDescription = Dialog.Description;
export const KnobDialogClose = Dialog.Close;
