function luminance(rgb: string): number {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!canvas) {
    return 0.5;
  }
  const context = canvas.getContext('2d');
  if (!context) {
    return 0.5;
  }
  canvas.width = 1;
  canvas.height = 1;
  context.fillStyle = rgb;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

export function contrastTextFor(bgColor: string): string {
  return luminance(bgColor) > 0.5 ? '#111' : '#f0f0f0';
}

export function fallbackGray(step: number): string {
  const normalizedStep = (step - 1) / 11;
  const grayValue = Math.round(230 - normalizedStep * 190);
  return `rgb(${grayValue},${grayValue},${grayValue})`;
}

export const cellSize = 32;

export function stepToPx(step: number): number {
  return (step - 1) * cellSize + cellSize / 2;
}
