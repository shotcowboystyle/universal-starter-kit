// jsdom defines `ontouchstart` (happy-dom does not), which makes tamagui's
// isWebTouchable true and resolves touch-sized controls (e.g. 17px icons).
// Tests model a pointer device unless they opt into touch themselves.
if (typeof window !== 'undefined') {
  for (let o: object | null = window; o; o = Object.getPrototypeOf(o)) {
    delete (o as Record<string, unknown>).ontouchstart;
  }
}
