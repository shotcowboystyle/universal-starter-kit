/**
 * Shared suggestion popup for editor typeahead menus (slash commands and
 * @ mentions).
 *
 * One implementation (LC-16): both menus render the same row anatomy with
 * the shared menu-row geometry (SP-EDGE -- the container owns only its
 * border, rows own all padding and span edge-to-edge, matching
 * SelectRow / DropdownMenuItemFrame / MentionSuggestionItem: 12px
 * horizontal x 8px vertical padding, 8px in-row gap, flat corners).
 *
 * The popup is portaled to document.body (it must escape the editor frame
 * and the fullscreen z-index), which puts it OUTSIDE the Tamagui theme
 * scope -- so no Tamagui components and no raw CSS fallbacks. Every color
 * and structural role comes from `SuggestionChrome`, resolved from the
 * live theme + knobs by the editor and pushed through editor storage.
 * Enter/exit motion (LC-24) fades through `motionMs`, which is 0 when the
 * animation knob is "none".
 */

import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

// ===========================================================================
// Chrome (resolved theme + knob values, no raw fallbacks)
// ===========================================================================

export interface SuggestionChrome {
  /** Panel surface color (theme background) */
  background: string;
  /** Panel border color */
  borderColor: string;
  /** Row highlight surface (active/hover) */
  activeBackground: string;
  /** Leading icon tile surface */
  iconTileBackground: string;
  /** Primary row text color */
  titleColor: string;
  /** Secondary row text color */
  descriptionColor: string;
  /** Panel corner radius in px */
  radius: number;
  /** Shared floating-panel shadow (Axiom 14/15 light source) */
  shadow: string;
  /** Enter/exit fade duration in ms (0 = animation none) */
  motionMs: number;
  /**
   * Row horizontal padding in px, resolved from the shared LC-16
   * `menuRowFrame` recipe (theme) by the editor host — the DOM popup never
   * invents its own geometry.
   */
  rowPaddingX: number;
}

/**
 * Chrome used only when the editor has not pushed resolved values yet
 * (first paint edge — a popup cannot open before the host's push effect
 * runs). Colors reference the tamagui `:root` default-theme custom
 * properties rather than literal values, so even this edge stays sourced
 * from the theme system (Axiom 5).
 */
export const fallbackSuggestionChrome: SuggestionChrome = {
  background: 'var(--background)',
  borderColor: 'var(--borderColor)',
  activeBackground: 'var(--color4)',
  iconTileBackground: 'var(--color3)',
  titleColor: 'var(--color12)',
  descriptionColor: 'var(--color11)',
  radius: 8,
  shadow: '0px 8px 28px var(--shadow2), 0px 2px 6px var(--shadow1)',
  motionMs: 120,
  rowPaddingX: 12,
};

declare module '@tiptap/core' {
  interface Storage {
    suggestionChrome: { value: SuggestionChrome };
  }
}

/**
 * Storage-only extension carrying the resolved suggestion chrome. The
 * editor host (TiptapEditor) resolves theme + knob values in React land and
 * pushes them here so the DOM-portaled popups never invent their own colors.
 */
export const SuggestionChromeStore = Extension.create({
  name: 'suggestionChrome',
  addStorage(): { value: SuggestionChrome } {
    return { value: fallbackSuggestionChrome };
  },
});

/** Reads the resolved chrome pushed by the editor host */
export function getSuggestionChrome(editor: any): SuggestionChrome {
  return editor?.storage?.suggestionChrome?.value ?? fallbackSuggestionChrome;
}

// ===========================================================================
// Rows
// ===========================================================================

export interface SuggestionRow {
  key: string;
  title: string;
  description?: string;
  /** Leading glyph rendered inside the icon tile */
  icon?: ReactNode;
  /** Avatar image URL (mentions); takes the icon tile slot */
  avatarUrl?: string;
}

export interface SuggestionListProps {
  rows: SuggestionRow[];
  chrome: SuggestionChrome;
  emptyLabel: string;
  onSelect: (index: number) => void;
}

export interface SuggestionListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SuggestionList = forwardRef<SuggestionListRef, SuggestionListProps>(
  ({ rows, chrome, emptyLabel, onSelect }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      setSelectedIndex(0);
    }, [rows]);

    useEffect(() => {
      const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    const selectItem = useCallback(
      (index: number) => {
        if (rows[index]) {
          onSelect(index);
        }
      },
      [rows, onSelect],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (rows.length === 0) {
          return false;
        }
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + rows.length - 1) % rows.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % rows.length);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    const containerStyle: CSSProperties = {
      background: chrome.background,
      border: `1px solid ${chrome.borderColor}`,
      borderRadius: `${chrome.radius}px`,
      boxShadow: chrome.shadow,
      // SP-EDGE: container owns only its border -- rows own all padding
      padding: 0,
      maxHeight: '320px',
      overflowY: 'auto',
      minWidth: '220px',
      maxWidth: '320px',
    };

    if (rows.length === 0) {
      return (
        <div
          style={containerStyle}
          data-suggestion-popup="true">
          <div
            style={{
              padding: `8px ${chrome.rowPaddingX}px`,
              color: chrome.descriptionColor,
              fontSize: '13px',
            }}>
            {emptyLabel}
          </div>
        </div>
      );
    }

    return (
      <div
        style={containerStyle}
        ref={listRef}
        role="listbox"
        data-suggestion-popup="true">
        {rows.map((row, index) => (
          <button
            key={row.key}
            role="option"
            aria-selected={index === selectedIndex}
            type="button"
            style={{
              // LC-16 shared menu-row geometry (menuRowFrame): horizontal
              // padding resolved from the theme recipe, 8px vertical, 8px
              // in-row gap, full-width flat rows (SP-EDGE)
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: `8px ${chrome.rowPaddingX}px`,
              border: 'none',
              background: index === selectedIndex ? chrome.activeBackground : 'none',
              width: '100%',
              textAlign: 'start',
              cursor: 'pointer',
              borderRadius: 0,
              fontSize: '13px',
              lineHeight: '1.3',
              fontFamily: 'inherit',
            }}
            onClick={() => {
              selectItem(index);
            }}
            onMouseEnter={() => {
              setSelectedIndex(index);
            }}>
            {row.avatarUrl ? (
              <img
                src={row.avatarUrl}
                alt=""
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  objectFit: 'cover',
                }}
              />
            ) : row.icon !== undefined && row.icon !== null ? (
              <span
                aria-hidden="true"
                style={{
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  background: chrome.iconTileBackground,
                  color: chrome.titleColor,
                  fontWeight: 700,
                  fontSize: '12px',
                  flexShrink: 0,
                }}>
                {row.icon}
              </span>
            ) : null}
            <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
              <span
                style={{
                  fontWeight: 600,
                  color: chrome.titleColor,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                {row.title}
              </span>
              {row.description ? (
                <span style={{ fontSize: '11px', color: chrome.descriptionColor }}>{row.description}</span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    );
  },
);

SuggestionList.displayName = 'SuggestionList';

// ===========================================================================
// Popup lifecycle (shared tiptap suggestion render())
// ===========================================================================

interface PopupHandle {
  element: HTMLDivElement;
  destroy: (immediate?: boolean) => void;
  position: (clientRect?: (() => DOMRect | null) | null) => void;
}

function createPopup(editorDom: HTMLElement, motionMs: number): PopupHandle {
  const popup = document.createElement('div');
  popup.style.position = 'fixed';
  // above the fullscreen editor frame (zIndex 100000), which the
  // body-portaled popup would otherwise render underneath
  popup.style.zIndex = '100001';
  // Portal lives on document.body, outside the app font scope; inherit the
  // editor's computed font so the menu matches the app
  popup.style.fontFamily = getComputedStyle(editorDom).fontFamily;
  if (motionMs > 0) {
    popup.style.opacity = '0';
    popup.style.transform = 'translateY(4px)';
    popup.style.transition = `opacity ${motionMs}ms ease, transform ${motionMs}ms ease`;
    requestAnimationFrame(() => {
      popup.style.opacity = '1';
      popup.style.transform = 'translateY(0)';
    });
  }
  document.body.append(popup);

  return {
    element: popup,
    position: (clientRect) => {
      const rect = clientRect?.();
      if (!rect) {
        return;
      }
      const menuHeight = Math.min(popup.offsetHeight || 320, 320);
      const below = rect.bottom + 4;
      const flip = below + menuHeight > window.innerHeight && rect.top - menuHeight - 4 > 0;
      popup.style.left = `${Math.min(rect.left, Math.max(8, window.innerWidth - popup.offsetWidth - 8))}px`;
      popup.style.top = flip ? `${rect.top - menuHeight - 4}px` : `${below}px`;
    },
    destroy: (immediate = false) => {
      if (immediate || motionMs === 0) {
        popup.remove();
        return;
      }
      popup.style.opacity = '0';
      popup.style.transform = 'translateY(4px)';
      popup.style.pointerEvents = 'none';
      window.setTimeout(() => {
        popup.remove();
      }, motionMs);
    },
  };
}

export interface SuggestionRendererOptions<ItemType> {
  /** Maps suggestion items to shared rows */
  toRow: (item: ItemType) => SuggestionRow;
  /** Reads resolved chrome (editor storage) at open time */
  getChrome: (editor: any) => SuggestionChrome;
  /** Copy for the empty state */
  getEmptyLabel: () => string;
}

/**
 * Builds the `render()` lifecycle for a tiptap Suggestion configuration,
 * portaling the shared SuggestionList and wiring keyboard navigation,
 * Escape (consumed -- it must not reach outer handlers like fullscreen
 * exit), repositioning, and enter/exit motion.
 */
export function createSuggestionRenderer<ItemType>({
  toRow,
  getChrome,
  getEmptyLabel,
}: SuggestionRendererOptions<ItemType>) {
  return () => {
    let component: ReactRenderer<SuggestionListRef> | null = null;
    let popup: PopupHandle | null = null;

    const makeProps = (props: any) => ({
      rows: (props.items as ItemType[]).map(toRow),
      chrome: getChrome(props.editor),
      emptyLabel: getEmptyLabel(),
      onSelect: (index: number) => {
        const item = (props.items as ItemType[])[index];
        if (item !== undefined) {
          props.command(item);
        }
      },
    });

    return {
      onStart: (props: any) => {
        component = new ReactRenderer(SuggestionList, {
          props: makeProps(props),
          editor: props.editor,
        });
        popup = createPopup(props.editor.view.dom, getChrome(props.editor).motionMs);
        popup.element.append(component.element);
        popup.position(props.clientRect);
        // reposition once content has laid out (flip needs real height)
        requestAnimationFrame(() => popup?.position(props.clientRect));
      },
      onUpdate: (props: any) => {
        component?.updateProps(makeProps(props));
        popup?.position(props.clientRect);
      },
      onKeyDown: (props: any) => {
        if (props.event.key === 'Escape') {
          // consume the Escape entirely: closing the menu must not also
          // trigger outer Escape handlers (e.g. fullscreen exit)
          props.event.stopPropagation();
          popup?.destroy();
          component?.destroy();
          popup = null;
          component = null;
          return true;
        }
        return component?.ref?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        popup?.destroy();
        component?.destroy();
        popup = null;
        component = null;
      },
    };
  };
}
