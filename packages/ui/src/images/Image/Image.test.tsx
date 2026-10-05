import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Image } from './index';

const here = dirname(fileURLToPath(import.meta.url));

const SRC = 'https://example.com/photo.jpg';

describe('Image', () => {
  describe('rendering', () => {
    it('renders an img element on web', () => {
      const { container } = renderWithProviders(<Image src={SRC} alt="test" width={100} height={100} />);
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
    });

    it('applies layout styles on a clipping frame', () => {
      const { container } = renderWithProviders(<Image src={SRC} alt="test" width={200} height={100} />);
      expect(container.querySelector('[data-image-frame]')).toBeInTheDocument();
      expect(container.querySelector('img')).toBeInTheDocument();
    });

    it('returns null when no source is provided', () => {
      const { container } = renderWithProviders(<Image alt="no source" />);
      const img = container.querySelector('img');
      expect(img).not.toBeInTheDocument();
      expect(container.querySelector('[data-image-fallback]')).not.toBeInTheDocument();
    });

    it('renders with source prop (object form)', () => {
      const { container } = renderWithProviders(
        <Image source={{ uri: SRC }} alt="object source" width={100} height={100} />,
      );
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', SRC);
    });

    it('does not leak the RN source object onto the img', () => {
      const { container } = renderWithProviders(
        <Image source={{ uri: SRC }} alt="object source" width={100} height={100} />,
      );
      const img = container.querySelector('img');
      expect(img).not.toHaveAttribute('source');
    });
  });

  describe('web layout props on img', () => {
    it('passes width directly to the img element', () => {
      const { container } = renderWithProviders(<Image src={SRC} alt="test" width={300} />);
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
    });

    it('passes aspectRatio style to the img element on web', () => {
      const { container } = renderWithProviders(<Image src={SRC} alt="test" width={400} aspectRatio={16 / 9} />);
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
    });

    it('passes borderRadius to the img element on web', () => {
      const { container } = renderWithProviders(
        <Image src={SRC} alt="test" width={200} height={200} borderRadius={16} />,
      );
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
    });
  });

  describe('SVG detection', () => {
    it('detects .svg extension', () => {
      const { container } = renderWithProviders(
        <Image src="https://example.com/icon.svg" alt="svg" width={100} height={100} />,
      );
      expect(container.querySelector('img')).toBeInTheDocument();
    });

    it('detects .svg with query params', () => {
      const { container } = renderWithProviders(
        <Image src="https://example.com/icon.svg?v=2" alt="svg with params" width={100} height={100} />,
      );
      expect(container.querySelector('img')).toBeInTheDocument();
    });

    it('detects .svg with hash fragment', () => {
      const { container } = renderWithProviders(
        <Image src="https://example.com/icon.svg#section" alt="svg with hash" width={100} height={100} />,
      );
      expect(container.querySelector('img')).toBeInTheDocument();
    });

    it('detects data:image/svg+xml', () => {
      const { container } = renderWithProviders(
        <Image
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3C/svg%3E"
          alt="data svg"
          width={100}
          height={100}
        />,
      );
      expect(container.querySelector('img')).toBeInTheDocument();
    });

    it('detects svg via the svg prop', () => {
      const { container } = renderWithProviders(
        <Image src="https://example.com/image" alt="forced svg" svg width={100} height={100} />,
      );
      expect(container.querySelector('img')).toBeInTheDocument();
    });

    it('does not detect non-svg images as svg', () => {
      const { container } = renderWithProviders(
        <Image src="https://example.com/photo.jpg" alt="jpg" width={100} height={100} />,
      );
      expect(container.querySelector('img')).toBeInTheDocument();
    });
  });

  describe('alt text', () => {
    it('sets alt attribute on the img', () => {
      const { container } = renderWithProviders(<Image src={SRC} alt="descriptive alt" width={100} height={100} />);
      expect(container.querySelector('img')).toHaveAttribute('alt', 'descriptive alt');
    });
  });

  describe('objectFit', () => {
    it('renders with objectFit cover', () => {
      const { container } = renderWithProviders(
        <Image src={SRC} alt="cover" width={200} height={200} objectFit="cover" />,
      );
      expect(container.querySelector('img')).toBeInTheDocument();
    });

    it('renders with objectFit contain', () => {
      const { container } = renderWithProviders(
        <Image src={SRC} alt="contain" width={200} height={200} objectFit="contain" />,
      );
      expect(container.querySelector('img')).toBeInTheDocument();
    });
  });

  describe('event handlers', () => {
    it('accepts onLoad handler', () => {
      const onLoad = vi.fn();
      const { container } = renderWithProviders(
        <Image src={SRC} alt="test" width={100} height={100} onLoad={onLoad} />,
      );
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      fireEvent.load(img!);
      expect(onLoad).toHaveBeenCalled();
    });

    it('accepts onError handler', () => {
      const onError = vi.fn();
      const { container } = renderWithProviders(
        <Image src={SRC} alt="test" width={100} height={100} onError={onError} />,
      );
      const img = container.querySelector('img');
      fireEvent.error(img!);
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Next.js contract', () => {
    it('lazy-loads by default and eager-loads when priority', () => {
      const lazy = renderWithProviders(<Image src={SRC} alt="lazy" width={100} height={100} />);
      expect(lazy.container.querySelector('img')).toHaveAttribute('loading', 'lazy');
      const eager = renderWithProviders(<Image src={SRC} alt="hero" width={100} height={100} priority />);
      expect(eager.container.querySelector('img')).toHaveAttribute('loading', 'eager');
    });

    it('forwards sizes', () => {
      const { container } = renderWithProviders(
        <Image src={SRC} alt="sizes" width={100} height={100} sizes="(max-width: 600px) 100vw, 400px" />,
      );
      expect(container.querySelector('img')).toHaveAttribute('sizes', '(max-width: 600px) 100vw, 400px');
    });

    it('fill paints an absolute frame', () => {
      const { container } = renderWithProviders(<Image src={SRC} alt="fill" fill />);
      const frame = container.querySelector('[data-image-frame]');
      expect(frame).toBeInTheDocument();
    });
  });

  describe('Polaris thumbnail + fallback', () => {
    it('shows a type glyph when a sized thumbnail has no source', () => {
      const { container } = renderWithProviders(<Image alt="Missing photo" size="medium" />);
      expect(container.querySelector('img')).not.toBeInTheDocument();
      expect(container.querySelector('[data-image-fallback]')).toBeInTheDocument();
    });

    it('replaces a failed asset with the fallback glyph', () => {
      const { container } = renderWithProviders(<Image src={SRC} alt="broken" width={80} height={80} />);
      fireEvent.error(container.querySelector('img')!);
      expect(container.querySelector('[data-image-fallback]')).toBeInTheDocument();
      expect(container.querySelector('img')).not.toBeInTheDocument();
    });

    it('marks extraSmall thumbnails with nestedControl px', () => {
      const { container } = renderWithProviders(<Image src={SRC} alt="nested" size="extraSmall" compact />);
      const frame = container.querySelector('[data-image-frame]');
      expect(frame).toHaveAttribute('data-nested-px');
    });
  });

  describe('focus ring / container clip / 44px', () => {
    it('rings the frame, not the img, when the image is a control', () => {
      const onPress = vi.fn();
      const { container } = renderWithProviders(<Image src={SRC} alt="Open photo" size="medium" onPress={onPress} />);
      const frame = container.querySelector('[data-image-frame]');
      expect(frame).toHaveAttribute('role', 'button');
      expect(container.querySelector('img')).not.toHaveAttribute('role');
    });

    it('floors an unsized pressable image at 44px', () => {
      const { container } = renderWithProviders(<Image src={SRC} alt="Open photo" onPress={() => {}} />);
      const frame = container.querySelector('[data-image-frame]');
      expect(frame).toBeInTheDocument();
      const style = window.getComputedStyle(frame!);
      expect(Number.parseInt(style.minHeight, 10) >= 44 || style.minHeight === '44px').toBe(true);
    });

    it('rounds only outer corners on a stacked group', () => {
      const { container } = renderWithProviders(
        <Image src={SRC} alt="first" size="medium" groupPosition="first" groupOrientation="horizontal" />,
      );
      expect(container.querySelector('[data-image-frame]')).toHaveAttribute('data-group-position', 'first');
    });
  });

  describe('live-media tile', () => {
    it('does not paint a status pip; frame radius stays UNCLAMPED', () => {
      const src = [
        readFileSync(join(here, 'index.tsx'), 'utf8'),
        readFileSync(join(here, 'ImageFrame.tsx'), 'utf8'),
      ].join('\n');
      expect(src).not.toMatch(/knobProps\.cardSurface|knobProps\.containerRadius|capContainerRadius\(/);
      expect(src).not.toMatch(/data-status-pip|StatusPip|statusPip/);

      const { container } = renderWithProviders(<Image src={SRC} alt="live tile" width={120} height={80} />);
      expect(container.querySelector('[data-status-pip]')).toBeNull();
      expect(container.querySelector("[data-media-tile='image']")).toBeTruthy();
    });
  });
});
