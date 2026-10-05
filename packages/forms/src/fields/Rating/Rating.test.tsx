import { renderWithProviders } from '@repo/test-utils';
import { createThemesBuilder, defaultAccentTheme, defaultBaseTheme, defaultBuilderOptions } from '@repo/theme';
import { configWithoutAnimations } from '@tamagui/config';
import { animationsCSS } from '@tamagui/config/v5-css';
import { fireEvent, render } from '@testing-library/react';
import { TamaguiProvider, createTamagui } from 'tamagui';
import { describe, expect, it, vi } from 'vitest';

import { Form } from '../../Form';
import { TableCellContext } from '../../shared/tableCellContext';

import { Rating } from './index';

const MockStarIcon = ({ size, weight, color }: { size: number; weight: string; color: string }) => (
  <span data-testid="star" data-size={size} data-weight={weight} data-color={color} />
);

// House builder themes for the mark assertion — created at MODULE
// scope: tamagui registers a config's theme variables globally at
// createTamagui time, and a config created after the first render (inside a
// test body) never resolves its tokens (Progress.spec pattern).
const houseThemes = createThemesBuilder(defaultBaseTheme, defaultAccentTheme, defaultBuilderOptions).themes();
const houseConfig = createTamagui({
  ...configWithoutAnimations,
  animations: animationsCSS,
  themes: houseThemes as any,
});

describe('Rating', () => {
  describe('without form context', () => {
    it('renders with label', () => {
      const result = renderWithProviders(<Rating label="Rating" name="rating" starIcon={MockStarIcon} />);
      expect(result.findTextElement('Rating')).toBeDefined();
    });

    it('renders required label with asterisk', () => {
      const result = renderWithProviders(<Rating label="Required" name="req" starIcon={MockStarIcon} required />);
      const label = result.container.querySelector('label');
      expect(label?.textContent).toContain('*');
    });

    it('renders correct number of stars', () => {
      const result = renderWithProviders(<Rating label="Stars" name="s" starIcon={MockStarIcon} maxStars={5} />);
      const stars = result.container.querySelectorAll("[data-testid='star']");
      expect(stars.length).toBe(5);
    });

    it('renders custom maxStars', () => {
      const result = renderWithProviders(<Rating label="Stars" name="s" starIcon={MockStarIcon} maxStars={3} />);
      const stars = result.container.querySelectorAll("[data-testid='star']");
      expect(stars.length).toBe(3);
    });

    it('renders skeleton placeholder', () => {
      const result = renderWithProviders(<Rating label="Loading" name="l" starIcon={MockStarIcon} skeleton />);
      expect(result.container.querySelectorAll("[data-testid='star']").length).toBe(0);
    });

    it('renders disabled state', () => {
      const result = renderWithProviders(<Rating label="Disabled" name="d" starIcon={MockStarIcon} disabled />);
      expect(result.findTextElement('Disabled')).toBeDefined();
    });

    // Axiom 13 ONE BODY: the contract must be usable bare.
    it('renders bare without starIcon — package default star, no crash', () => {
      const result = renderWithProviders(<Rating label="Bare" value={0.6} />);
      const stars = result.container.querySelectorAll('[data-rating-star]');
      expect(stars.length).toBe(5);
      // Default Phosphor star renders an svg glyph inside every star slot
      expect(result.container.querySelectorAll('[data-rating-star] svg').length).toBe(5);
    });

    // Stars are keyboard-focusable and operable.
    it('stars form one roving tab stop and activate with Enter/Space', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(<Rating label="Kbd" value={0.4} onChange={onChange} />);
      const stars = Array.from(result.container.querySelectorAll('[data-rating-star]'));
      expect(stars.length).toBe(5);
      const tabStops = stars.filter((s) => s.getAttribute('tabindex') === '0');
      // Exactly one tab stop (roving) — the committed value star (2 of 5)
      expect(tabStops.length).toBe(1);
      expect(tabStops[0]?.getAttribute('data-rating-index')).toBe('2');
      // Every other star stays reachable by arrows (tabindex -1, not absent)
      for (const star of stars) {
        expect(star.getAttribute('tabindex')).toMatch(/^(0|-1)$/);
      }
      // Enter on star 4 commits 4/5
      const star4 = result.container.querySelector("[data-rating-index='4']") as HTMLElement;
      fireEvent.keyDown(star4, { key: 'Enter' });
      expect(onChange).toHaveBeenCalledWith(0.8);
      // Space on the current star (2) toggles the rating off
      const star2 = result.container.querySelector("[data-rating-index='2']") as HTMLElement;
      fireEvent.keyDown(star2, { key: ' ' });
      expect(onChange).toHaveBeenCalledWith(0);
    });

    it('disabled stars drop out of the tab order', () => {
      const result = renderWithProviders(<Rating label="Disabled" value={0.4} disabled />);
      const stars = Array.from(result.container.querySelectorAll('[data-rating-star]'));
      expect(stars.length).toBe(5);
      for (const star of stars) {
        expect(star.getAttribute('tabindex')).toBeNull();
        expect(star.getAttribute('aria-disabled')).toBe('true');
      }
    });

    // The FILLED star is the selection mark, so it
    // resolves the shared accent mark token; the empty star stays neutral
    // chrome. Stock test themes carry no $accentBackground, so mount the
    // house builder themes for real resolution.
    it('fills selected stars with the accent mark and empty stars with boundary chrome', () => {
      const { container } = render(
        <TamaguiProvider config={houseConfig} defaultTheme="light" disableInjectCSS>
          <Rating label="Rate" value={0.6} starIcon={MockStarIcon} />
        </TamaguiProvider>,
      );
      const filled = container.querySelector("[data-rating-star='filled'] [data-testid='star']");
      const empty = container.querySelector("[data-rating-star='empty'] [data-testid='star']");
      expect(filled).toBeTruthy();
      expect(empty).toBeTruthy();
      expect(filled!.getAttribute('data-color')).toContain('accentBackground');
      expect(empty!.getAttribute('data-color')).not.toContain('accentBackground');
      // WCAG 1.4.11: empty stars are graphical objects — $color7 is
      // below the 3:1 boundary floor; the empty ring uses the same boundary
      // token as Radio.
      expect(empty!.getAttribute('data-color')).toContain('color10');
    });

    // Material Rating is a radio group: one checked value, stars 1..N fill as
    // a consequence. aria-pressed-on-every-filled-star was the old lie.
    it('exposes a radiogroup where only the committed star is checked', () => {
      const result = renderWithProviders(<Rating label="Quality" value={0.6} starIcon={MockStarIcon} />);
      const group = result.container.querySelector('[data-rating-row]');
      expect(group?.getAttribute('role')).toBe('radiogroup');
      const radios = Array.from(result.container.querySelectorAll('[data-rating-star]'));
      expect(radios.map((el) => el.getAttribute('role'))).toEqual(['radio', 'radio', 'radio', 'radio', 'radio']);
      expect(radios.map((el) => el.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false', 'false']);
    });

    // Pointer focus paints no ring (wasKeyboardFocus is pinned false
    // in test-utils). The ring node is only mounted for keyboard-origin.
    it('does not paint a focus ring on pointer focus', () => {
      const result = renderWithProviders(<Rating label="Quality" value={0.4} starIcon={MockStarIcon} />);
      const star = result.container.querySelector("[data-rating-index='2']") as HTMLElement;
      fireEvent.focus(star);
      expect(result.container.querySelector('[data-rating-ring]')).toBeNull();
    });

    it('read-only rating is an image, not a tab stop', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Rating label="Score" value={0.8} readOnly starIcon={MockStarIcon} onChange={onChange} />,
      );
      const row = result.container.querySelector('[data-rating-row]');
      expect(row?.getAttribute('role')).toBe('img');
      const stars = Array.from(result.container.querySelectorAll('[data-rating-star]'));
      expect(stars).toHaveLength(5);
      for (const star of stars) {
        expect(star.getAttribute('tabindex')).toBeNull();
        expect(star.getAttribute('role')).toBeNull();
      }
      fireEvent.click(stars[0] as HTMLElement);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('scales the star glyph with the size token', () => {
      const small = renderWithProviders(<Rating label="Small" value={0.6} size="$2" starIcon={MockStarIcon} />);
      const large = renderWithProviders(<Rating label="Large" value={0.6} size="$5" starIcon={MockStarIcon} />);
      const smallSize = Number(small.container.querySelector("[data-testid='star']")?.getAttribute('data-size'));
      const largeSize = Number(large.container.querySelector("[data-testid='star']")?.getAttribute('data-size'));
      expect(smallSize).toBeGreaterThan(0);
      expect(largeSize).toBeGreaterThan(smallSize);
    });

    it('clamps overflow values to maxStars and shows a live value', () => {
      const result = renderWithProviders(<Rating label="Clamped" value={3} maxStars={5} starIcon={MockStarIcon} />);
      const filled = result.container.querySelectorAll("[data-rating-star='filled']");
      expect(filled.length).toBe(5);
      const readout = result.container.querySelector('[data-rating-value]');
      expect(readout?.textContent).toMatch(/5/);
    });

    it('arrow keys move focus and commit the rating', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Rating label="Kbd" value={0.4} starIcon={MockStarIcon} onChange={onChange} />,
      );
      const star2 = result.container.querySelector("[data-rating-index='2']") as HTMLElement;
      fireEvent.keyDown(star2, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledWith(0.6);
    });

    it('Home and End commit the first and last star', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Rating label="Kbd" value={0.4} starIcon={MockStarIcon} onChange={onChange} />,
      );
      const star2 = result.container.querySelector("[data-rating-index='2']") as HTMLElement;
      fireEvent.keyDown(star2, { key: 'Home' });
      expect(onChange).toHaveBeenCalledWith(0.2);
      fireEvent.keyDown(star2, { key: 'End' });
      expect(onChange).toHaveBeenCalledWith(1);
    });

    it('clamps a negative value to zero filled stars', () => {
      const result = renderWithProviders(<Rating label="Neg" value={-2} starIcon={MockStarIcon} />);
      expect(result.container.querySelectorAll("[data-rating-star='filled']").length).toBe(0);
      expect(result.container.querySelectorAll("[data-rating-star='empty']").length).toBe(5);
    });

    it('renders no stars when maxStars is not positive', () => {
      const result = renderWithProviders(<Rating label="None" value={1} maxStars={0} starIcon={MockStarIcon} />);
      expect(result.container.querySelectorAll('[data-rating-star]').length).toBe(0);
    });

    it('squares star wells when pointy and rounds them otherwise', () => {
      const pointed = renderWithProviders(<Rating label="Pointy" value={0.6} pointy starIcon={MockStarIcon} />);
      expect(pointed.container.querySelector('[data-rating-row]')?.getAttribute('data-rating-pointy')).toBe('true');
      const rounded = renderWithProviders(<Rating label="Round" value={0.6} pointy={false} starIcon={MockStarIcon} />);
      expect(rounded.container.querySelector('[data-rating-row]')?.getAttribute('data-rating-pointy')).toBeNull();
    });

    it('does not grow 44px wells or paint a live value inside a table cell', () => {
      const result = renderWithProviders(
        <TableCellContext.Provider value={{ inTableCell: true, isHeader: false, editable: true }}>
          <Rating label="Score" value={0.6} starIcon={MockStarIcon} />
        </TableCellContext.Provider>,
      );
      const row = result.container.querySelector('[data-rating-row]');
      expect(row?.getAttribute('data-rating-cell')).toBe('true');
      expect(result.container.querySelector('[data-rating-value]')).toBeNull();
      expect(result.container.querySelector('[data-rating-grow]')).toBeNull();
      expect(result.container.querySelector('label')).toBeNull();
    });
  });

  describe('with form context', () => {
    it('renders inside form', () => {
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { rating: 0 } }} submitText="Submit">
          <Rating name="rating" label="Rate" starIcon={MockStarIcon} />
        </Form>,
      );
      expect(result.findTextElement('Rate')).toBeDefined();
    });

    it('read-only form field does not commit', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { rating: 0.6 } }} submitText="Submit">
          <Rating name="rating" label="Rate" readOnly starIcon={MockStarIcon} onChange={onChange} />
        </Form>,
      );
      const star = result.container.querySelector("[data-rating-index='5']") as HTMLElement;
      fireEvent.click(star);
      expect(onChange).not.toHaveBeenCalled();
      expect(result.container.querySelector('[data-rating-row]')?.getAttribute('role')).toBe('img');
    });

    it('commits through the canonical onChange when a star is pressed', () => {
      const onChange = vi.fn();
      const result = renderWithProviders(
        <Form formOptions={{ defaultValues: { rating: 0.2 } }} submitText="Submit">
          <Rating name="rating" label="Rate" starIcon={MockStarIcon} onChange={onChange} />
        </Form>,
      );
      const star = result.container.querySelector("[data-rating-index='4']") as HTMLElement;
      fireEvent.click(star);
      expect(onChange).toHaveBeenCalledWith(0.8);
    });
  });
});
