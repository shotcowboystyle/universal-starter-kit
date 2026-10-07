export interface PanelTheme {
  bg: string;
  bgSubtle: string;
  bgHover: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  pending: string;
}

export const themes: Record<'light' | 'dark', PanelTheme> = {
  light: {
    bg: '#ffffff',
    bgSubtle: '#f5f5f5',
    bgHover: '#eeeeee',
    text: '#1a1a1a',
    textSecondary: '#666666',
    border: '#e0e0e0',
    accent: '#3b82f6',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
    pending: '#8b5cf6',
  },
  dark: {
    bg: '#1a1a2e',
    bgSubtle: '#16213e',
    bgHover: '#0f3460',
    text: '#e0e0e0',
    textSecondary: '#a0a0a0',
    border: '#2a2a4a',
    accent: '#60a5fa',
    success: '#4ade80',
    warning: '#facc15',
    error: '#f87171',
    pending: '#a78bfa',
  },
};
