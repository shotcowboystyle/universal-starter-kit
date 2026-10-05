import { useResolvedKnobs } from '@repo/theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { YStack } from 'tamagui';

import { PlayerChrome } from './PlayerChrome';
import type { VideoProps } from './types';
import { VideoCaption, VideoFrame, mediaTileFrameProps } from './VideoFrame';

export type { VideoProps } from './types';

const HIDE_MS = 2500;

function asVideoElement(node: unknown): HTMLVideoElement | null {
  if (!node || typeof HTMLVideoElement === 'undefined') {
    return null;
  }
  if (node instanceof HTMLVideoElement) {
    return node;
  }
  if (node instanceof Element) {
    if (node.tagName === 'VIDEO') {
      return node as HTMLVideoElement;
    }
    return node.querySelector('video');
  }
  const host = (node as { host?: unknown }).host;
  return host ? asVideoElement(host) : null;
}

function isStageFullscreen(stage: HTMLElement | null): boolean {
  if (!stage || typeof document === 'undefined') {
    return false;
  }
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement === stage || doc.webkitFullscreenElement === stage;
}

async function toggleStageFullscreen(stage: HTMLElement | null) {
  if (!stage || typeof document === 'undefined') {
    return;
  }
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitFullscreenElement?: Element | null;
  };
  const el = stage as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (isStageFullscreen(stage)) {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else {
      doc.webkitExitFullscreen?.();
    }
    return;
  }
  if (el.requestFullscreen) {
    await el.requestFullscreen();
  } else {
    el.webkitRequestFullscreen?.();
  }
}

/**
 * General-purpose video surface for desk / docs (gallery Video).
 * Web uses a native `<video>` with house overlay chrome (YouTube / Media
 * Chrome / AVKit transport). Native playback lives in `index.native.tsx`
 * behind an optional `expo-video` peer so web-only consumers stay light.
 */
export function Video({
  src,
  children,
  muted: mutedProp = false,
  autoPlay = false,
  controls = true,
  loop = false,
  poster,
  title,
  compact,
  ...props
}: VideoProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ component: 'Video', compact });
  const stageRef = useRef<unknown>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(mutedProp);
  const [fullscreen, setFullscreen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [held, setHeld] = useState(true);

  const chromeVisible = Boolean(controls && (!playing || hovering || focused || seeking || held));

  const clearHide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const bumpChrome = useCallback(() => {
    setHeld(true);
    clearHide();
    hideTimer.current = setTimeout(() => {
      setHeld(false);
    }, HIDE_MS);
  }, [clearHide]);

  useEffect(() => {
    if (!controls) {
      return;
    }
    if (!playing) {
      clearHide();
      setHeld(true);
      return;
    }
    bumpChrome();
    return clearHide;
  }, [bumpChrome, clearHide, controls, playing]);

  useEffect(() => {
    setMuted(mutedProp);
  }, [mutedProp]);

  useEffect(() => {
    const stage = stageRef.current as { querySelector?: (s: string) => Element | null } | null;
    const el = videoRef.current ?? asVideoElement(stage) ?? asVideoElement(stage?.querySelector?.('video'));
    videoRef.current = el;
    if (!el) {
      return;
    }

    el.muted = muted;
    el.loop = loop;
    const sync = () => {
      setPlaying(!el.paused);
      setCurrentTime(el.currentTime || 0);
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    };
    const onPlay = () => {
      setPlaying(true);
    };
    const onPause = () => {
      setPlaying(false);
    };
    const onTime = () => {
      setCurrentTime(el.currentTime || 0);
    };
    const onMeta = () => {
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    };
    const onVolume = () => {
      setMuted(el.muted);
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('volumechange', onVolume);
    sync();
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('volumechange', onVolume);
    };
  }, [src, loop, muted]);

  useEffect(() => {
    const stage = asVideoElement(stageRef.current) ? (stageRef.current as HTMLElement) : null;
    const host =
      (stageRef.current as { querySelector?: (s: string) => Element | null } | null)?.querySelector?.('video')
        ?.parentElement ?? stage;
    const onFs = () => {
      setFullscreen(isStageFullscreen(host));
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
    };
  }, [src]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) {
      return;
    }
    bumpChrome();
    if (el.paused) {
      void el.play()?.catch(() => {});
    } else {
      el.pause();
    }
  }, [bumpChrome]);

  const onSeek = useCallback((time: number) => {
    const el = videoRef.current;
    if (!el || !Number.isFinite(time)) {
      return;
    }
    el.currentTime = time;
    setCurrentTime(time);
  }, []);

  const toggleMuted = useCallback(() => {
    const el = videoRef.current;
    if (!el) {
      return;
    }
    el.muted = !el.muted;
    setMuted(el.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const stage =
      (typeof HTMLElement !== 'undefined' && stageRef.current instanceof HTMLElement
        ? stageRef.current
        : asVideoElement(stageRef.current)?.parentElement) ?? null;
    void toggleStageFullscreen(stage)?.catch(() => {});
  }, []);

  const onStageKeyDown = useCallback(
    (e: {
      key?: string;
      preventDefault?: () => void;
      target?: EventTarget | null;
      currentTarget?: EventTarget | null;
    }) => {
      if (!controls) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && target !== e.currentTarget && target.closest?.("[role='slider'], [role='button'], button")) {
        return;
      }
      const el = videoRef.current;
      if (!el) {
        return;
      }
      const key = e.key ?? '';
      if (key === ' ' || key === 'k' || key === 'K') {
        e.preventDefault?.();
        togglePlay();
      } else if (key === 'ArrowLeft') {
        e.preventDefault?.();
        onSeek(Math.max(0, (el.currentTime || 0) - 5));
      } else if (key === 'ArrowRight') {
        e.preventDefault?.();
        onSeek(Math.min(el.duration || 0, (el.currentTime || 0) + 5));
      } else if (key === 'm' || key === 'M') {
        e.preventDefault?.();
        toggleMuted();
      } else if (key === 'f' || key === 'F') {
        e.preventDefault?.();
        toggleFullscreen();
      } else if (key === 'Home') {
        e.preventDefault?.();
        onSeek(0);
      } else if (key === 'End') {
        e.preventDefault?.();
        onSeek(el.duration || 0);
      }
    },
    [controls, onSeek, toggleFullscreen, toggleMuted, togglePlay],
  );

  const mediaStage = src ? (
    <YStack
      ref={stageRef as never}
      position="relative"
      overflow="hidden"
      width="100%"
      aspectRatio={16 / 9}
      {...mediaTileFrameProps(knobProps)}
      cursor={controls ? 'pointer' : undefined}
      role={controls ? 'region' : undefined}
      aria-label={title ?? t('Video player')}
      tabIndex={controls ? 0 : undefined}
      {...({
        onKeyDown: onStageKeyDown,
        onPointerMove: controls ? bumpChrome : undefined,
      } as Record<string, unknown>)}
      onPress={controls ? togglePlay : undefined}>
      <YStack
        render="video"
        ref={(node: unknown) => {
          videoRef.current = asVideoElement(node);
        }}
        // @ts-expect-error HTML video attributes via render prop
        src={src}
        autoPlay={autoPlay}
        playsInline
        muted={muted}
        loop={loop}
        poster={poster}
        preload="metadata"
        aria-label={title}
        width="100%"
        height="100%"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'contain',
        }}
      />
      {controls ? (
        <PlayerChrome
          playing={playing}
          currentTime={currentTime}
          duration={duration}
          muted={muted}
          fullscreen={fullscreen}
          visible={chromeVisible}
          onTogglePlay={togglePlay}
          onSeek={onSeek}
          onToggleMuted={toggleMuted}
          onToggleFullscreen={toggleFullscreen}
          onHoverChange={setHovering}
          onFocusChange={setFocused}
          onSeekingChange={setSeeking}
        />
      ) : null}
    </YStack>
  ) : (
    <YStack
      overflow="hidden"
      width="100%"
      aspectRatio={16 / 9}
      {...mediaTileFrameProps(knobProps)}
      justifyContent="center"
      alignItems="center"
    />
  );

  return (
    <VideoFrame render="figure" marginHorizontal={0} marginVertical={knobProps.gapLg.gap} {...knobProps.gap} {...props}>
      {mediaStage}
      {children != null ? <VideoCaption>{children}</VideoCaption> : null}
    </VideoFrame>
  );
}
