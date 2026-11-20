/** iOS date is the inline calendar; time keeps the wheel users expect. */
export const osDateTimeIosDisplay = (mode: 'date' | 'time'): 'inline' | 'spinner' =>
  mode === 'time' ? 'spinner' : 'inline';
