import { useResolvedKnobs } from '@repo/theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { YStack } from 'tamagui';
import type { TamaguiElement } from 'tamagui';

import { PlayerChrome } from './PlayerChrome';
import type { VideoProps } from './types';
import { VideoCaption, VideoFrame, mediaTileFrameProps } from './VideoFrame';

export type { VideoProps } from './types';

const HIDE_MS = 2500;

type VideoHost = Element | TamaguiElement;

const asVideoElement = (node: VideoHost | null): HTMLVideoElement | null => {
  if (node === null || typeof HTMLVideoElement === 'undefined') {
    return null;
  }
  if (node instanceof HTMLVideoElement) {
    return node;
  }
  if (node instanceof Element) {
    return node.querySelector('video');
  }
  const host: unknown = 'host' in node ? node.host : null;
  return host instanceof Element ? asVideoElement(host) : null;
};

const isStageFullscreen = (stage: HTMLElement | null): boolean => {
  if (!stage || typeof document === 'undefined') {
    return false;
  }
  // SAFETY: `webkitFullscreenElement` is an optional vendor member absent from lib.dom; the intersection only adds it as optional.
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement === stage || doc.webkitFullscreenElement === stage;
};

const toggleStageFullscreen = async (stage: HTMLElement | null) => {
  if (!stage || typeof document === 'undefined') {
    return;
  }
  // SAFETY: the webkit-prefixed members are optional vendor extensions absent from lib.dom.
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitFullscreenElement?: Element | null;
  };
  // SAFETY: `webkitRequestFullscreen` is an optional vendor extension absent from lib.dom.
  const el = stage as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  if (isStageFullscreen(stage)) {
    await ('exitFullscreen' in document ? document.exitFullscreen() : doc.webkitExitFullscreen?.());
    return;
  }
  await ('requestFullscreen' in stage ? stage.requestFullscreen() : el.webkitRequestFullscreen?.());
};

/** Autoplay-policy and interrupted-play rejections are expected; playback state follows the media events. */
const ignoreRejection = async (pending: Promise<void> | undefined) => {
  try {
    await pending;
  } catch {
    // Safe to continue: a refused play()/fullscreen request leaves the UI in its current valid state.
  }
};

type KeyCommand =
  | 'togglePlay'
  | 'seekBack'
  | 'seekForward'
  | 'toggleMuted'
  | 'toggleFullscreen'
  | 'seekStart'
  | 'seekEnd';

const SEEK_STEP_SECONDS = 5;

const keyCommandFor = (key: string): KeyCommand | undefined => {
  switch (key) {
    case ' ':
    case 'k':
    case 'K': {
      return 'togglePlay';
    }
    case 'ArrowLeft': {
      return 'seekBack';
    }
    case 'ArrowRight': {
      return 'seekForward';
    }
    case 'm':
    case 'M': {
      return 'toggleMuted';
    }
    case 'f':
    case 'F': {
      return 'toggleFullscreen';
    }
    case 'Home': {
      return 'seekStart';
    }
    case 'End': {
      return 'seekEnd';
    }
    default: {
      return undefined;
    }
  }
};

interface MediaSetters {
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setMuted: (muted: boolean) => void;
}

/** Mirror the media element's state into React state; returns the unbind function. */
const bindMediaListeners = (
  el: HTMLVideoElement,
  { setPlaying, setCurrentTime, setDuration, setMuted }: MediaSetters,
) => {
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
  setPlaying(!el.paused);
  onTime();
  onMeta();
  return () => {
    el.removeEventListener('play', onPlay);
    el.removeEventListener('pause', onPause);
    el.removeEventListener('timeupdate', onTime);
    el.removeEventListener('loadedmetadata', onMeta);
    el.removeEventListener('durationchange', onMeta);
    el.removeEventListener('volumechange', onVolume);
  };
};

/** Chrome stays held visible for HIDE_MS after each interaction while playing. */
const useAutoHideChrome = (controls: boolean, playing: boolean) => {
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [held, setHeld] = useState(true);

  const clearHide = useCallback(() => {
    if (hideTimer.current !== null) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const armHide = useCallback(() => {
    clearHide();
    hideTimer.current = setTimeout(() => {
      setHeld(false);
    }, HIDE_MS);
  }, [clearHide]);

  const bumpChrome = useCallback(() => {
    setHeld(true);
    armHide();
  }, [armHide]);

  // Paused chrome is always visible, so `held` needs no reset there: it is re-held when playback (with controls) starts.
  const active = controls && playing;
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (active) {
      setHeld(true);
    }
  }

  useEffect(() => {
    if (active) {
      armHide();
    } else {
      clearHide();
    }
    return clearHide;
  }, [active, armHide, clearHide]);

  return { held, bumpChrome };
};

/**
 * General-purpose video surface for desk / docs (gallery Video).
 * Web uses a native `<video>` with house overlay chrome (YouTube / Media
 * Chrome / AVKit transport). Native playback lives in `index.native.tsx`
 * behind an optional `expo-video` peer so web-only consumers stay light.
 */
export const Video = ({
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
}: VideoProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ component: 'Video', compact });
  const stageRef = useRef<TamaguiElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [playing, setPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(mutedProp);
  const [fullscreen, setFullscreen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [seeking, setSeeking] = useState(false);

  const { held, bumpChrome } = useAutoHideChrome(controls, playing);
  const interacting = hovering || focused || seeking;
  const chromeActive = !playing || interacting || held;
  const chromeVisible = controls && chromeActive;

  const [seenMutedProp, setSeenMutedProp] = useState(mutedProp);
  if (seenMutedProp !== mutedProp) {
    setSeenMutedProp(mutedProp);
    setMuted(mutedProp);
  }

  useEffect(() => {
    const el = src === '' ? null : (videoRef.current ?? asVideoElement(stageRef.current));
    videoRef.current = el;
    if (el) {
      el.muted = muted;
      el.loop = loop;
    }
    return el ? bindMediaListeners(el, { setPlaying, setCurrentTime, setDuration, setMuted }) : undefined;
  }, [src, loop, muted]);

  useEffect(() => {
    const stage = src !== '' && stageRef.current instanceof HTMLElement ? stageRef.current : null;
    const host = stage?.querySelector('video')?.parentElement ?? stage;
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
      void ignoreRejection(el.play());
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
    const node = stageRef.current;
    const stage = node instanceof HTMLElement ? node : (asVideoElement(node)?.parentElement ?? null);
    void ignoreRejection(toggleStageFullscreen(stage));
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
      const target = e.target instanceof Element ? e.target : null;
      if (target && target !== e.currentTarget && target.closest("[role='slider'], [role='button'], button")) {
        return;
      }
      const el = videoRef.current;
      if (!el) {
        return;
      }
      const command = keyCommandFor(e.key ?? '');
      if (command === undefined) {
        return;
      }
      e.preventDefault?.();
      const position = el.currentTime || 0;
      switch (command) {
        case 'togglePlay': {
          togglePlay();
          break;
        }
        case 'seekBack': {
          onSeek(Math.max(0, position - SEEK_STEP_SECONDS));
          break;
        }
        case 'seekForward': {
          onSeek(Math.min(el.duration || 0, position + SEEK_STEP_SECONDS));
          break;
        }
        case 'toggleMuted': {
          toggleMuted();
          break;
        }
        case 'toggleFullscreen': {
          toggleFullscreen();
          break;
        }
        case 'seekStart': {
          onSeek(0);
          break;
        }
        case 'seekEnd': {
          onSeek(el.duration || 0);
          break;
        }
        default: {
          break;
        }
      }
    },
    [controls, onSeek, toggleFullscreen, toggleMuted, togglePlay],
  );

  const mediaStage = src ? (
    <YStack
      ref={stageRef}
      position="relative"
      overflow="hidden"
      width="100%"
      aspectRatio={16 / 9}
      {...mediaTileFrameProps(knobProps)}
      cursor={controls ? 'pointer' : undefined}
      role={controls ? 'region' : undefined}
      aria-label={title ?? t('Video player')}
      tabIndex={controls ? 0 : undefined}
      {...{
        onKeyDown: onStageKeyDown,
        onPointerMove: controls ? bumpChrome : undefined,
      }}
      onPress={controls ? togglePlay : undefined}>
      <YStack
        render="video"
        ref={(node: TamaguiElement | null) => {
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
    <VideoFrame
      render="figure"
      marginHorizontal={0}
      marginVertical={knobProps.gapLg.gap}
      {...knobProps.gap}
      {...props}>
      {mediaStage}
      {children == null ? null : <VideoCaption>{children}</VideoCaption>}
    </VideoFrame>
  );
};
