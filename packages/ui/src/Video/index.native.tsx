import { useResolvedKnobs } from '@repo/theme';
import type { useVideoPlayer as UseVideoPlayer, VideoView as ExpoVideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { YStack } from 'tamagui';

import type { VideoProps } from './types';
import { VideoCaption, VideoFrame, mediaTileFrameProps } from './VideoFrame';

export type { VideoProps } from './types';

interface ExpoVideoModule {
  useVideoPlayer: typeof UseVideoPlayer;
  VideoView: typeof ExpoVideoView;
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
const isExpoVideoModule = (mod: Partial<ExpoVideoModule>): mod is ExpoVideoModule =>
  mod.useVideoPlayer !== undefined && mod.VideoView !== undefined;

const loadExpoVideo = (): ExpoVideoModule | null => {
  if (expoVideoCache !== undefined) {
    return expoVideoCache;
  }
  try {
    // oxlint-disable-next-line node/global-require, unicorn/prefer-module, typescript/no-unsafe-assignment -- lazy require of the optional expo-video peer; a static import would evaluate it for every native consumer
    const mod: Partial<ExpoVideoModule> = require('expo-video');
    expoVideoCache = isExpoVideoModule(mod) ? mod : null;
  } catch {
    expoVideoCache = null;
  }
  return expoVideoCache;
};

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
const ExpoVideoSurface = ({ expoVideo, src, muted, autoPlay, controls, loop, poster, title }: ExpoSurfaceProps) => {
  const { knobProps } = useResolvedKnobs({ component: 'Video' });
  const { useVideoPlayer, VideoView } = expoVideo;
  // oxlint-disable-next-line react/hooks -- the hook comes from the lazily required expo-video module; its identity is fixed once loaded (loadExpoVideo caches it)
  const player = useVideoPlayer(src, (instance) => {
    instance.loop = loop;
    instance.muted = muted;
    if (autoPlay) {
      instance.play();
    }
  });
  const hasPoster = poster !== undefined && poster !== '';
  const [showPoster, setShowPoster] = useState(hasPoster && !autoPlay);

  useEffect(() => {
    // oxlint-disable-next-line react/immutability -- expo-video's player is an imperative native handle configured by assignment
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
    <YStack
      width="100%"
      aspectRatio={16 / 9}
      overflow="hidden"
      {...mediaTileFrameProps(knobProps)}
      position="relative">
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={controls}
        contentFit="contain"
        accessibilityLabel={title}
        onFirstFrameRender={() => {
          setShowPoster(false);
        }}
      />
      {showPoster && hasPoster ? (
        <Image
          source={{ uri: poster }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </YStack>
  );
};

/** Playback-less stand-in when the optional `expo-video` peer is unavailable. */
const PosterOnlySurface = ({ poster, title }: NativeSurfaceProps) => {
  const { knobProps } = useResolvedKnobs({ component: 'Video' });
  return (
    <YStack
      width="100%"
      aspectRatio={16 / 9}
      overflow="hidden"
      {...mediaTileFrameProps(knobProps)}
      position="relative"
      accessibilityLabel={title}>
      {poster !== undefined && poster !== '' ? (
        <Image
          source={{ uri: poster }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </YStack>
  );
};

type ResolvedKnobProps = ReturnType<typeof useResolvedKnobs>['knobProps'];

const renderSurface = (
  surfaceProps: NativeSurfaceProps,
  expoVideo: ExpoVideoModule | null,
  knobProps: ResolvedKnobProps,
) => {
  if (surfaceProps.src === '') {
    return (
      <YStack
        width="100%"
        aspectRatio={16 / 9}
        overflow="hidden"
        {...mediaTileFrameProps(knobProps)}
      />
    );
  }
  if (expoVideo === null) {
    return <PosterOnlySurface {...surfaceProps} />;
  }
  return (
    <ExpoVideoSurface
      key={surfaceProps.src}
      expoVideo={expoVideo}
      {...surfaceProps}
    />
  );
};

/**
 * Native video surface — requires optional peer `expo-video` (SDK 55+).
 * System transport (AVKit / ExoPlayer) is the platform chrome; the frame
 * and caption follow house recipes. Web-only consumers never load this file.
 */
export const Video = ({
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
}: VideoProps) => {
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
    <VideoFrame
      marginHorizontal={0}
      marginVertical={knobProps.gapLg.gap}
      {...knobProps.gap}
      {...props}>
      {renderSurface(surfaceProps, expoVideo, knobProps)}
      {children == null ? null : <VideoCaption>{children}</VideoCaption>}
    </VideoFrame>
  );
};
