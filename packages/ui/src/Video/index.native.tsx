import { useResolvedKnobs } from '@repo/theme';
import { useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { YStack } from 'tamagui';

import type { VideoProps } from './types';
import { VideoCaption, VideoFrame, mediaTileFrameProps } from './VideoFrame';

export type { VideoProps } from './types';

interface ExpoVideoModule {
  useVideoPlayer: typeof import('expo-video').useVideoPlayer;
  VideoView: typeof import('expo-video').VideoView;
}

let expoVideoCache: ExpoVideoModule | null | undefined;

/**
 * `expo-video` is an OPTIONAL peer — a top-level import would evaluate it for
 * every native consumer of the package barrel and crash the whole app when the
 * peer is missing or the host binary's ExpoVideo native module doesn't match
 * the installed JS (expo-video eval touches
 * `NativeVideoModule.VideoPlayer.prototype`, which throws under skew — seen in
 * Expo Go). Lazy + guarded keeps the barrel eval-safe; the surface degrades to
 * the poster frame when playback isn't available.
 */
function loadExpoVideo(): ExpoVideoModule | null {
  if (expoVideoCache !== undefined) {
    return expoVideoCache;
  }
  try {
    const mod = require('expo-video') as Partial<ExpoVideoModule>;
    expoVideoCache = typeof mod?.useVideoPlayer === 'function' && mod?.VideoView ? (mod as ExpoVideoModule) : null;
  } catch {
    expoVideoCache = null;
  }
  return expoVideoCache;
}

interface NativeSurfaceProps {
  src: string;
  muted: boolean;
  autoPlay: boolean;
  controls: boolean;
  loop: boolean;
  poster?: string;
  title?: string;
}

type ExpoSurfaceProps = NativeSurfaceProps & { expoVideo: ExpoVideoModule };

/**
 * Isolated so `useVideoPlayer` always runs unconditionally when a src exists.
 * Remount via `key={src}` when the URL changes.
 */
function ExpoVideoSurface({ expoVideo, src, muted, autoPlay, controls, loop, poster, title }: ExpoSurfaceProps) {
  const { knobProps } = useResolvedKnobs({ component: 'Video' });
  const { useVideoPlayer, VideoView } = expoVideo;
  const player = useVideoPlayer(src, (instance) => {
    instance.loop = loop;
    instance.muted = muted;
    if (autoPlay) {
      instance.play();
    }
  });
  const [showPoster, setShowPoster] = useState(Boolean(poster) && !autoPlay);

  useEffect(() => {
    player.loop = loop;
    player.muted = muted;
  }, [player, loop, muted]);

  useEffect(() => {
    if (autoPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [player, autoPlay]);

  return (
    <YStack width="100%" aspectRatio={16 / 9} overflow="hidden" {...mediaTileFrameProps(knobProps)} position="relative">
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        nativeControls={controls}
        contentFit="contain"
        accessibilityLabel={title}
        onFirstFrameRender={() => {
          setShowPoster(false);
        }}
      />
      {showPoster && poster ? (
        <Image
          source={{ uri: poster }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </YStack>
  );
}

/** Playback-less stand-in when the optional `expo-video` peer is unavailable. */
function PosterOnlySurface({ poster, title }: NativeSurfaceProps) {
  const { knobProps } = useResolvedKnobs({ component: 'Video' });
  return (
    <YStack
      width="100%"
      aspectRatio={16 / 9}
      overflow="hidden"
      {...mediaTileFrameProps(knobProps)}
      position="relative"
      accessibilityLabel={title}>
      {poster ? (
        <Image
          source={{ uri: poster }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </YStack>
  );
}

/**
 * Native video surface — requires optional peer `expo-video` (SDK 55+).
 * System transport (AVKit / ExoPlayer) is the platform chrome; the frame
 * and caption follow house recipes. Web-only consumers never load this file.
 */
export function Video({
  src,
  children,
  muted = false,
  autoPlay = false,
  controls = true,
  loop = false,
  poster,
  title,
  compact,
  ...props
}: VideoProps) {
  const { knobProps } = useResolvedKnobs({ component: 'Video', compact });
  const expoVideo = loadExpoVideo();

  const surfaceProps: NativeSurfaceProps = {
    src: src ?? '',
    muted,
    autoPlay,
    controls,
    loop,
    poster,
    title,
  };

  return (
    <VideoFrame marginHorizontal={0} marginVertical={knobProps.gapLg.gap} {...knobProps.gap} {...props}>
      {src ? (
        expoVideo ? (
          <ExpoVideoSurface key={src} expoVideo={expoVideo} {...surfaceProps} />
        ) : (
          <PosterOnlySurface {...surfaceProps} />
        )
      ) : (
        <YStack width="100%" aspectRatio={16 / 9} overflow="hidden" {...mediaTileFrameProps(knobProps)} />
      )}
      {children != null ? <VideoCaption>{children}</VideoCaption> : null}
    </VideoFrame>
  );
}
