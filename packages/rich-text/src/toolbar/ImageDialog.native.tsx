/**
 * Image dialog for native: a small modal with a URL input.
 *
 * The web version uses a Popover; native uses an RN Modal. Same command
 * contract: executeCommand("image", { src }).
 */

import { Button } from '@repo/forms';
import { useCallback, useState } from 'react';
import { Modal, Pressable, StyleSheet } from 'react-native';
import { Input, Text, XStack, YStack } from 'tamagui';

import { t } from '../shared/t';
import type { RichEditorRef } from '../types';

import { ImageIcon } from './icons';
import { ToolbarButton } from './ToolbarButton';

export interface ImageDialogProps {
  /** Reference to the editor */
  editorRef: React.RefObject<RichEditorRef | null>;
  /** Whether the dialog is disabled */
  disabled?: boolean;
}

export function ImageDialog({ editorRef, disabled }: ImageDialogProps) {
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  const handleInsert = useCallback(() => {
    const trimmed = imageUrl.trim();
    if (trimmed) {
      editorRef.current?.executeCommand('image', { src: trimmed });
      setImageUrl('');
      setOpen(false);
    }
  }, [imageUrl, editorRef]);

  return (
    <>
      <ToolbarButton
        disabled={disabled}
        onPress={() => {
          setOpen(true);
        }}
        aria-label={t('Insert Image')}>
        <ImageIcon />
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
              <Text fontWeight="600">{t('Insert Image')}</Text>
              <Input
                size="$3"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChangeText={setImageUrl}
                onSubmitEditing={handleInsert}
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
                <Button
                  size="$2"
                  theme="active"
                  onPress={handleInsert}
                  disabled={!imageUrl.trim()}
                  aria-label={t('Insert image')}>
                  {t('Insert')}
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
