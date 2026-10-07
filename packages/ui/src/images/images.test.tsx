import { renderWithProviders } from '@repo/test-utils';
import { describe, expect, it } from 'vitest';

import { Image } from './Image/index';
import { Svg } from './Svg/index';
import { Svg as NativeSvg } from './Svg/index.native';
import { SvgUri } from './SvgUri/index';

import { Image as IndexImage, Svg as IndexSvg, SvgUri as IndexSvgUri } from './index';

describe('Images Module', () => {
  it('should export Image', () => {
    expect(Image).toBeDefined();
  });

  it('should render Image correctly', () => {
    // oxlint-disable-next-line typescript/no-deprecated -- exercising the supported RN-style `source` prop
    const { container } = renderWithProviders(<Image source={{ uri: 'test-uri' }} />);
    expect(container).toBeDefined();
  });

  it('should export Svg', () => {
    expect(Svg).toBeDefined();
  });

  it('should render Svg correctly', () => {
    const { container } = renderWithProviders(<Svg />);
    expect(container).toBeDefined();
  });

  it('should export SvgUri', () => {
    expect(SvgUri).toBeDefined();
  });

  it('should render SvgUri correctly', () => {
    const { container } = renderWithProviders(<SvgUri uri="test-uri" />);
    expect(container).toBeDefined();
  });

  it('should export all components from index', () => {
    expect(IndexImage).toBeDefined();
    expect(IndexSvg).toBeDefined();
    expect(IndexSvgUri).toBeDefined();
  });

  it('should render SimpleImage from index correctly', () => {
    // oxlint-disable-next-line typescript/no-deprecated -- exercising the supported RN-style `source` prop
    const { container } = renderWithProviders(<IndexImage source={{ uri: 'test-uri' }} />);
    expect(container).toBeDefined();
  });

  it('should render Svg from index correctly', () => {
    const { container } = renderWithProviders(<IndexSvg />);
    expect(container).toBeDefined();
  });

  it('should render SvgUri from index correctly', () => {
    const { container } = renderWithProviders(<IndexSvgUri uri="test-uri" />);
    expect(container).toBeDefined();
  });

  it('renders correctly', () => {
    const { getByTestId } = renderWithProviders(<NativeSvg testID="svg-component" />);
    const svgComponent = getByTestId('svg-component');
    expect(svgComponent).toBeTruthy();
  });
});
