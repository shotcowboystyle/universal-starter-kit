import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { SvgUri } from './index';

describe('SvgUri', () => {
  it('is defined and exportable', () => {
    expect(SvgUri).toBeDefined();
    expect(typeof SvgUri).toBe('function');
  });

  it('returns null for null uri', () => {
    const { container } = renderWithProviders(<SvgUri uri={null} />);
    expect(container.querySelector('div > div')).toBeNull();
  });

  it('returns null for empty string uri', () => {
    const { container } = renderWithProviders(<SvgUri uri="" />);
    expect(container.querySelector('div > div')).toBeNull();
  });

  it('renders a container div for a valid uri', () => {
    const { container } = renderWithProviders(<SvgUri uri="https://example.com/icon.svg" width={100} height={100} />);
    const div = container.querySelector('div > div');
    expect(div).toBeInTheDocument();
  });

  it('renders fallback on error', async () => {
    const fallback = <span data-testid="fallback">Error</span>;
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const { findByTestId } = renderWithProviders(<SvgUri uri="https://example.com/broken.svg" fallback={fallback} />);

    const fallbackEl = await findByTestId('fallback');
    expect(fallbackEl).toBeInTheDocument();
  });

  it('calls onError when fetch fails', async () => {
    const onError = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    renderWithProviders(<SvgUri uri="https://example.com/broken.svg" onError={onError} />);

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
  });

  it('fetches and renders SVG content', async () => {
    const svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle cx="12" cy="12" r="10"/></svg>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(svgContent, { status: 200, headers: { 'Content-Type': 'image/svg+xml' } }),
    );

    const onLoad = vi.fn();
    const { container } = renderWithProviders(<SvgUri uri="https://example.com/icon.svg" onLoad={onLoad} />);

    await vi.waitFor(() => {
      expect(onLoad).toHaveBeenCalled();
    });

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(container.querySelector('circle')).toBeInTheDocument();
  });

  it('strips script tags from fetched SVG for security', async () => {
    const maliciousSvg =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><rect width="10" height="10"/></svg>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(maliciousSvg, { status: 200 }));

    const onLoad = vi.fn();
    const { container } = renderWithProviders(<SvgUri uri="https://example.com/evil.svg" onLoad={onLoad} />);

    await vi.waitFor(() => {
      expect(onLoad).toHaveBeenCalled();
    });

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('rect')).toBeInTheDocument();
  });

  it('applies width and height to the rendered SVG', async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(svgContent, { status: 200 }));

    const onLoad = vi.fn();
    const { container } = renderWithProviders(
      <SvgUri uri="https://example.com/icon.svg" width={48} height={48} onLoad={onLoad} />,
    );

    await vi.waitFor(() => {
      expect(onLoad).toHaveBeenCalled();
    });

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('width')).toBe('48');
    expect(svg?.getAttribute('height')).toBe('48');
  });

  it('sets accessibility attributes on the rendered SVG', async () => {
    const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(svgContent, { status: 200 }));

    const onLoad = vi.fn();
    const { container } = renderWithProviders(
      <SvgUri uri="https://example.com/icon.svg" accessibilityLabel="Test icon" onLoad={onLoad} />,
    );

    await vi.waitFor(() => {
      expect(onLoad).toHaveBeenCalled();
    });

    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Test icon');
  });

  it('handles data:image/svg+xml URIs', async () => {
    const onLoad = vi.fn();
    const dataUri =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='10' height='10'/%3E%3C/svg%3E";

    const { container } = renderWithProviders(<SvgUri uri={dataUri} onLoad={onLoad} />);

    await vi.waitFor(() => {
      expect(onLoad).toHaveBeenCalled();
    });

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('inherits scheme color and does not invent hex chrome', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.tsx'), 'utf8');
    const native = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.native.ts'), 'utf8');
    expect(src).toContain('getVariable(useTheme().color)');
    expect(src).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
    expect(native).toMatch(/color: ['"]\$color['"]/);
  });
});
