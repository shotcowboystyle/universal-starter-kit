import {
  CornersInIcon,
  CornersOutIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from '@phosphor-icons/react';
import { MIN_PRESS_TARGET, ensureKeyboardModalityTracking, useResolvedKnobs, transitionProps } from '@repo/theme';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SizableText, Theme, View, XStack, YStack, getTokens } from 'tamagui';

import { componentColors } from '../componentColors';

/** Overlay within the media stage (same tier as forms `zIndex.localTop`). */
const CHROME_Z_INDEX = 10;

export interface PlayerChromeProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  fullscreen: boolean;
  visible: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onToggleMuted: () => void;
  onToggleFullscreen: () => void;
  onHoverChange: (hovering: boolean) => void;
  onFocusChange: (focused: boolean) => void;
  onSeekingChange: (seeking: boolean) => void;
}

export function formatPlayerTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function activateOnKey(e: { key?: string; preventDefault?: () => void }, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault?.();
    action();
  }
}

function ChromeButton({
  label,
  onPress,
  size,
  radius,
  children,
}: {
  label: string;
  onPress: () => void;
  size: number;
  radius: number;
  children: ReactNode;
}) {
  const { control, knobProps } = useResolvedKnobs({ component: 'Video' });
  return (
    <View
      role="button"
      aria-label={label}
      tabIndex={0}
      width={size}
      height={size}
      minWidth={MIN_PRESS_TARGET}
      minHeight={MIN_PRESS_TARGET}
      alignItems="center"
      justifyContent="center"
      cursor="pointer"
      {...({ color: '$color12' } as Record<string, unknown>)}
      borderRadius={radius}
      hoverStyle={{ backgroundColor: '$color4' }}
      pressStyle={{ opacity: 0.85 }}
      focusVisibleStyle={{ ...control.focusVisibleKnobProps }}
      {...transitionProps(knobProps.transition)}
      onPress={(e: { stopPropagation?: () => void }) => {
        e.stopPropagation?.();
        onPress();
      }}
      {...({
        onKeyDown: (e: { key?: string; preventDefault?: () => void; stopPropagation?: () => void }) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation?.();
          }
          activateOnKey(e, onPress);
        },
      } as Record<string, unknown>)}>
      {children}
    </View>
  );
}

function SeekBar({
  currentTime,
  duration,
  onSeek,
  onSeekingChange,
  radius,
}: {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onSeekingChange: (seeking: boolean) => void;
  radius: number;
}) {
  const { t } = useTranslation();
  const { control, knobProps } = useResolvedKnobs({ component: 'Video' });
  const [hot, setHot] = useState(false);
  const max = duration > 0 && Number.isFinite(duration) ? duration : 0;
  const ratio = max > 0 ? Math.min(1, Math.max(0, currentTime / max)) : 0;

  const seekAt = useCallback(
    (clientX: number, target: HTMLElement) => {
      if (max <= 0) {
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }
      onSeek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * max);
    },
    [max, onSeek],
  );

  return (
    <YStack
      flex={1}
      height={MIN_PRESS_TARGET}
      justifyContent="center"
      role="slider"
      aria-label={t('Seek')}
      aria-valuemin={0}
      aria-valuemax={Math.floor(max)}
      aria-valuenow={Math.floor(Number.isFinite(currentTime) ? currentTime : 0)}
      tabIndex={0}
      cursor="pointer"
      direction="ltr"
      focusVisibleStyle={{ ...control.focusVisibleKnobProps }}
      {...({
        onHoverIn: () => {
          setHot(true);
        },
        onHoverOut: () => {
          setHot(false);
        },
        onPointerDown: (e: {
          clientX?: number;
          currentTarget?: HTMLElement;
          stopPropagation?: () => void;
          preventDefault?: () => void;
        }) => {
          e.stopPropagation?.();
          e.preventDefault?.();
          const target = e.currentTarget;
          if (!target || e.clientX == null) {
            return;
          }
          onSeekingChange(true);
          seekAt(e.clientX, target);
          const move = (ev: PointerEvent) => {
            seekAt(ev.clientX, target);
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            onSeekingChange(false);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        },
        onKeyDown: (e: { key?: string; preventDefault?: () => void; stopPropagation?: () => void }) => {
          if (max <= 0) {
            return;
          }
          const step = max < 15 ? 1 : 5;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault?.();
            e.stopPropagation?.();
            onSeek(Math.max(0, currentTime - step));
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault?.();
            e.stopPropagation?.();
            onSeek(Math.min(max, currentTime + step));
          } else if (e.key === 'Home') {
            e.preventDefault?.();
            e.stopPropagation?.();
            onSeek(0);
          } else if (e.key === 'End') {
            e.preventDefault?.();
            e.stopPropagation?.();
            onSeek(max);
          }
        },
      } as Record<string, unknown>)}>
      <YStack position="relative" width="100%" height={hot ? 6 : 4} justifyContent="center">
        <YStack
          height="100%"
          width="100%"
          backgroundColor="$color8"
          borderRadius={radius}
          overflow="hidden"
          {...transitionProps(knobProps.transition)}>
          <YStack height="100%" width={`${ratio * 100}%`} backgroundColor={componentColors.indicator.selected} />
        </YStack>
        <YStack
          position="absolute"
          top="50%"
          left={`${ratio * 100}%`}
          width={hot ? 14 : 12}
          height={hot ? 14 : 12}
          x={hot ? -7 : -6}
          y={hot ? -7 : -6}
          backgroundColor="$color12"
          borderRadius={radius}
          pointerEvents="none"
        />
      </YStack>
    </YStack>
  );
}

/**
 * Overlay transport — YouTube / Media Chrome / AVKit layout: large paused
 * play, bottom bar (play · time · seek · duration · mute · fullscreen),
 * auto-hide while playing. Tokens only; dark theme so glyphs read over
 * any frame. Keyboard rings ride each control.
 */
export function PlayerChrome({
  playing,
  currentTime,
  duration,
  muted,
  fullscreen,
  visible,
  onTogglePlay,
  onSeek,
  onToggleMuted,
  onToggleFullscreen,
  onHoverChange,
  onFocusChange,
  onSeekingChange,
}: PlayerChromeProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ component: 'Video' });
  ensureKeyboardModalityTracking();

  useEffect(() => {
    ensureKeyboardModalityTracking();
  }, []);

  const sizePx =
    (getTokens().size as Record<string, { val?: number } | undefined>)?.[knobProps.sizeToken]?.val ?? MIN_PRESS_TARGET;
  const target = Math.max(sizePx, MIN_PRESS_TARGET);
  const glyph = Math.max(16, Math.round(sizePx / 2));
  const radius = knobProps.pointy ? 0 : 1000;
  const centerToken = knobProps.density === 'compact' ? knobProps.sizeToken : '$6';
  const centerPx = Math.max(
    target,
    (getTokens().size as Record<string, { val?: number } | undefined>)?.[centerToken]?.val ?? 64,
  );
  const centerGlyph = Math.round(centerPx * 0.45);

  return (
    <Theme name="dark">
      <YStack
        {...({ 'data-testid': 'video-chrome' } as Record<string, unknown>)}
        position="absolute"
        top={0}
        right={0}
        bottom={0}
        left={0}
        zIndex={CHROME_Z_INDEX}
        opacity={visible ? 1 : 0}
        pointerEvents={visible ? 'box-none' : 'none'}
        justifyContent="space-between"
        // Web hover + focus-capture handlers Tamagui forwards at runtime; the
        // RN-flavored View prop type omits them (house Record cast).
        {...({
          onHoverIn: () => {
            onHoverChange(true);
          },
          onHoverOut: () => {
            onHoverChange(false);
          },
          onFocusCapture: () => {
            onFocusChange(true);
          },
          onBlurCapture: (e: {
            currentTarget?: { contains?: (n: unknown) => boolean };
            nativeEvent?: { relatedTarget?: unknown };
          }) => {
            const next = e.nativeEvent?.relatedTarget;
            if (next && e.currentTarget?.contains?.(next)) {
              return;
            }
            onFocusChange(false);
          },
        } as Record<string, unknown>)}
        {...transitionProps(knobProps.transition)}>
        <YStack flex={1} alignItems="center" justifyContent="center" pointerEvents="none">
          {playing ? null : (
            <View pointerEvents="auto">
              <ChromeButton label={t('Play')} onPress={onTogglePlay} size={centerPx} radius={radius}>
                <YStack
                  width={centerPx}
                  height={centerPx}
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor="$color3"
                  borderRadius={radius}
                  {...({ color: '$color12' } as Record<string, unknown>)}>
                  <PlayIcon size={centerGlyph} color="currentColor" weight="fill" />
                </YStack>
              </ChromeButton>
            </View>
          )}
        </YStack>

        <YStack pointerEvents="auto" position="relative">
          <YStack
            position="absolute"
            top={0}
            right={0}
            bottom={0}
            left={0}
            backgroundColor="$color1"
            opacity={0.72}
            pointerEvents="none"
          />
          <XStack {...knobProps.panelPadding} {...knobProps.gap} alignItems="center" position="relative">
            <ChromeButton label={playing ? t('Pause') : t('Play')} onPress={onTogglePlay} size={target} radius={radius}>
              {playing ? (
                <PauseIcon size={glyph} color="currentColor" weight="fill" />
              ) : (
                <PlayIcon size={glyph} color="currentColor" weight="fill" />
              )}
            </ChromeButton>
            <SizableText
              {...knobProps.label}
              color="$color12"
              minWidth={36}
              textAlign="right"
              {...({ style: { fontVariantNumeric: 'tabular-nums' } } as Record<string, unknown>)}>
              {formatPlayerTime(currentTime)}
            </SizableText>
            <SeekBar
              currentTime={currentTime}
              duration={duration}
              onSeek={onSeek}
              onSeekingChange={onSeekingChange}
              radius={radius}
            />
            <SizableText
              {...knobProps.label}
              color="$color12"
              minWidth={36}
              {...({ style: { fontVariantNumeric: 'tabular-nums' } } as Record<string, unknown>)}>
              {formatPlayerTime(duration)}
            </SizableText>
            <ChromeButton label={muted ? t('Unmute') : t('Mute')} onPress={onToggleMuted} size={target} radius={radius}>
              {muted ? (
                <SpeakerSlashIcon size={glyph} color="currentColor" weight="bold" />
              ) : (
                <SpeakerHighIcon size={glyph} color="currentColor" weight="bold" />
              )}
            </ChromeButton>
            <ChromeButton
              label={fullscreen ? t('Exit fullscreen') : t('Enter fullscreen')}
              onPress={onToggleFullscreen}
              size={target}
              radius={radius}>
              {fullscreen ? (
                <CornersInIcon size={glyph} color="currentColor" weight="bold" />
              ) : (
                <CornersOutIcon size={glyph} color="currentColor" weight="bold" />
              )}
            </ChromeButton>
          </XStack>
        </YStack>
      </YStack>
    </Theme>
  );
}
