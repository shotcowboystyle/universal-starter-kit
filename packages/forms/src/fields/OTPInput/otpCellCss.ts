import { isWeb } from 'tamagui';

/**
 * Carve-out: OTP rings the focused *cell*, inset, never the row.
 * InputParts paints a Box composite ring (`mp-composite-ring`); that would
 * double-paint next to the per-cell Area ring, so the Box ring is killed
 * here and the Area keeps the ≥2px inset outline (neighbors clip an outer
 * ring). Caret is hidden — Stripe/Apple slots use a fake bar when empty.
 */
const OTP_CELL_STYLE_ID = 'mp-otp-cell-ring';

const otpCellCss = `/* LC-71 OTP carve-out: each cell Box is the perceived control (not the row).
   InputParts already paints an inset composite ring on .mp-composite-ring;
   do not also outline the inner Area. */
.mp-otp-cell {
  position: relative;
}
.mp-otp-cell .mp-otp-area,
.mp-otp-cell .mp-otp-area:focus,
.mp-otp-cell .mp-otp-area:focus-visible,
.mp-otp-cell .mp-input-area,
.mp-otp-cell .mp-input-area:focus,
.mp-otp-cell .mp-input-area:focus-visible {
  caret-color: transparent;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
  font-weight: 600;
  font-size: 1.45em;
  letter-spacing: 0.02em;
  text-align: center;
  outline: none !important;
}
.mp-otp-cell:focus-within:has(input:placeholder-shown)::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 2px;
  height: 42%;
  transform: translate(-50%, -50%);
  background: var(--color12, var(--c-color12, CanvasText));
  pointer-events: none;
  border-radius: 1px;
  animation: mp-otp-caret-blink 1.05s steps(1) infinite;
}
@keyframes mp-otp-caret-blink {
  50% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .mp-otp-cell:focus-within:has(input:placeholder-shown)::after {
    animation: none;
  }
}
.mp-otp-cell.mp-otp-motion-none:focus-within:has(input:placeholder-shown)::after {
  animation: none;
}`;

/** Mount OTP cell caret / tabular-num styles. Refreshes if the CSS changed (HMR). */
export function ensureOtpCellCss(): void {
  if (!isWeb || typeof document === 'undefined') {
    return;
  }
  let tag = document.getElementById(OTP_CELL_STYLE_ID) as HTMLStyleElement | null;
  if (!tag) {
    tag = document.createElement('style');
    tag.id = OTP_CELL_STYLE_ID;
    document.head.appendChild(tag);
  }
  if (tag.textContent !== otpCellCss) {
    tag.textContent = otpCellCss;
  }
}
