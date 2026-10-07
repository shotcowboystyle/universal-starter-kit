/**
 * Link dialog for native: a small modal with a URL input.
 *
 * The web version uses a Popover; native uses an RN Modal (10Tap has no
 * floating anchors). Same command contract: executeCommand("link",
 * { href }) to set, { href: null } to remove.
 */

import { Button } from '@repo/forms';
import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { Input, Text, XStack, YStack } from 'tamagui';

import { t } from '../shared/t';
import { normalizeUrl } from '../shared/url';
import type { EditorState, RichEditorRef } from '../types';

import { LinkIcon } from './icons';
import { ToolbarButton } from './ToolbarButton';

export interface LinkDialogProps {
  /** Reference to the editor */
  editorRef: React.RefObject<RichEditorRef | null>;
  /** Current editor state */
  state: EditorState;
  /** Whether the dialog is disabled */
  disabled?: boolean;
}

export function LinkDialog({ editorRef, state, disabled }: LinkDialogProps) {
  const [open, setOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const handleSubmit = useCallback(() => {
    const normalized = normalizeUrl(linkUrl);
    if (normalized) {
      editorRef.current?.executeCommand('link', { href: normalized });
    }
    setLinkUrl('');
    setOpen(false);
  }, [linkUrl, editorRef]);

  const handleRemove = useCallback(() => {
    editorRef.current?.executeCommand('link', { href: null });
    setOpen(false);
  }, [editorRef]);

  return (
    <>
      <ToolbarButton
        active={state.isLink}
        disabled={disabled}
        onPress={() => {
          setOpen(true);
        }}
        aria-label={t('Link')}>
        <LinkIcon />
      </ToolbarButton>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setOpen(false);
        }}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            setOpen(false);
          }}>
          <Pressable
            style={styles.sheet}
            onPress={(e) => {
              e.stopPropagation();
            }}>
            <YStack
              backgroundColor="$background"
              borderRadius="$4"
              padding="$4"
              gap="$3"
              minWidth={280}>
              <Text fontWeight="600">{state.isLink ? t('Edit Link') : t('Add Link')}</Text>
              <Input
                size="$3"
                placeholder="https://example.com"
                value={linkUrl}
                onChangeText={setLinkUrl}
                onSubmitEditing={handleSubmit}
                autoFocus
                autoCapitalize="none"
                keyboardType="url"
              />
              <XStack
                gap="$2"
                justifyContent="flex-end">
                <Button
                  size="$2"
                  onPress={() => {
                    setOpen(false);
                  }}
                  aria-label={t('Cancel')}>
                  {t('Cancel')}
                </Button>
                {state.isLink && (
                  <Button
                    size="$2"
                    error
                    onPress={handleRemove}
                    aria-label={t('Remove link')}>
                    {t('Remove')}
                  </Button>
                )}
                <Button
                  size="$2"
                  theme="active"
                  onPress={handleSubmit}
                  disabled={!linkUrl.trim()}
                  aria-label={state.isLink ? t('Update link') : t('Add link')}>
                  {state.isLink ? t('Update') : t('Add')}
                </Button>
              </XStack>
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {},
});
