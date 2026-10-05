/**
 * CURATED-REEXPORT-IS-CATALOG registry — every bare-name export of the
 * @repo/ui barrel that IS a raw framework re-export
 * (value-identical to the tamagui / @tamagui/toast export of the same name)
 * must have a row here declaring WHY it is knob-immune, or the export-surface
 * spec (./exportSurface.test.tsx) fails the suite.
 *
 * A row is a declaration that the knob channel legitimately does not apply to
 * this export — NOT an amnesty for knob-dead painted UI. If a raw primitive
 * paints opinionated chrome (radius, padding, press states) it belongs behind
 * a `Tamagui*` escape hatch or a house shadow (Button/Spinner precedent), not
 * in this file. Rows marked ADJUDICATION-CANDIDATE are flagged for the
 * rulebook owner; see the census report.
 *
 * Locked both directions by exportSurface.test.tsx:
 *  - every raw bare export must be registered (or Tamagui*-prefixed);
 *  - every row must correspond to a live raw bare export (no stale rows, no
 *    laundering house implementations through the registry).
 */
export const knobImmuneExports: Readonly<Record<string, string>> = {
  // ── Structural layout lego ────────────────────────────────────────────
  // The knobs system is designed around these: house surfaces SPREAD
  // knobProps.* fragments ONTO View/Stack/etc. The lego
  // itself carries no opinionated chrome; a self-knobbing primitive would
  // double-apply fragments under every house surface.
  View: 'unopinionated layout lego; knob fragments are spread onto it by composing surfaces',
  XStack: 'unopinionated layout lego; knob fragments are spread onto it by composing surfaces',
  YStack: 'unopinionated layout lego; knob fragments are spread onto it by composing surfaces',
  XGroup: 'layout grouping lego; knob fragments are spread onto it by composing surfaces',
  YGroup: 'layout grouping lego; knob fragments are spread onto it by composing surfaces',
  Group: 'layout grouping lego; knob fragments are spread onto it by composing surfaces',
  Spacer: 'pure whitespace; no paintable chrome for knobs to reach',
  Square: 'geometric lego (fixed aspect); consumers spread knob fragments onto it',
  Circle: 'geometric lego (identity circle by definition); radius knob story is N/A',
  ScrollView: 'scroll container lego; no opinionated chrome, fragments ride the content',
  // Separator left the registry 2026-08-28: bare `Separator` is now
  // a house implementation (./Separator — painted 1px line), so it no longer
  // qualifies for a row (house implementations ARE the knob story). Its
  // weight has no knob by ruling, and Circle and
  // Square stay knob-immune lego with no per-role radius.
  // Fold's substrate. Logic shell only; Accordion (and Fold)
  // own the painted chrome. Restored with the three below after a refactor
  // (the Adapt drop) rewrote this file from an older copy and took them
  // out as collateral; Adapt itself stays dropped.
  Unspaced: 'spacing opt-out marker; paints nothing, tells the parent stack to skip gap on its children',
  VisuallyHidden: 'a11y hide utility; paints nothing visible, no chrome for knobs to reach',
  LinearGradient: 'paint primitive (color stops are content); no opinionated chrome, consumers own the stops',
  ListItem:
    'raw list-row primitive consumed as lego by house list surfaces (List, sidebar, tags) which own the knob story. ADJUDICATION-CANDIDATE + BACKLOG: painted row with own padding/press states — deserves a house shadow or Tamagui* demotion once consumers migrate',

  // ── Typography ────────────────────────────────────────────────────────
  // NO rows. The former "typography substrate" claim (knobs ride fragments
  // spread by composing surfaces) was measured false: FontKnobStyles rescued
  // family/leading/tracking on web only, fontWeight/textAccent/pageTitleScale
  // reached the raw primitives on no platform, and on native nothing did
  // Bare Text/SizableText/Paragraph/Anchor and Heading/H1–H6 are
  // house shadows now (./Text.tsx, ./Heading.tsx) that spread the fragments
  // as props on every platform; raw primitives ride the Tamagui* hatches.

  // ── Overlay composition roots ─────────────────────────────────────────
  // Logic shells with no painted frame of their own; the knob channel lands
  // on the house content surfaces designed to fill them (DialogContent,
  // PopoverContent, SheetFrame, ConfirmDialog).
  Popover: 'composition root; knobs land on house PopoverContent',
  Sheet: 'composition root; knobs land on house SheetFrame',
  Portal: 'reparenting utility; renders children elsewhere, paints nothing',
  PortalProvider: 'provider; paints nothing',

  // ── Providers / theme / animation drivers ────────────────────────────
  TamaguiProvider: "root provider (tamagui's own name, not an escape hatch); paints nothing",
  Theme: 'theme scoping provider; hue selection is the theme system, not a knob',
  AnimatePresence: 'mount/unmount choreography wrapper; motion values come from knob-gated children',

  // ── Hooks (non-visual) ────────────────────────────────────────────────
  useControllableState: 'state hook; no rendered output',
  useDidFinishSSR: 'SSR lifecycle hook; no rendered output',
  useEvent: 'callback identity hook; no rendered output',
  useMedia: 'media query hook; no rendered output',
  usePropsAndStyle: 'style resolution hook; no rendered output',
  useTheme: 'theme access hook; no rendered output',
  useThemeName: 'theme access hook; no rendered output',
  useToastController: 'imperative toast controller hook (@tamagui/toast); no rendered output',
  useToastState: 'toast state hook (@tamagui/toast); no rendered output',

  // ── Styling / token utilities (non-visual) ────────────────────────────
  styled: 'component factory; output components consume knobs where house code applies them',
  createStyledContext: 'context factory utility; no rendered output',
  withStaticProperties: 'object composition utility; no rendered output',
  getToken: 'token lookup utility; no rendered output',
  getTokens: 'token lookup utility; no rendered output',
  getTokenValue: 'token lookup utility; no rendered output',
  isClient: 'environment boolean; not a component',
  isWeb: 'environment boolean; not a component',
};
