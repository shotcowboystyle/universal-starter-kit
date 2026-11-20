'use client';

// Renders outside the app providers (its own <html>), so it uses plain markup
// with inline styles instead of the Tamagui catalog.
const bodyStyle = {
  margin: 0,
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  fontFamily: 'system-ui, sans-serif',
} as const;

const GlobalError = ({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) => (
  <html lang="en">
    <body style={bodyStyle}>
      <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Something went wrong</h2>
      <p style={{ color: '#6b7280', margin: 0 }}>{error.message}</p>
      <button
        type="button"
        onClick={reset}
        style={{
          borderRadius: 6,
          border: 0,
          padding: '8px 16px',
          background: '#111827',
          color: '#fff',
          cursor: 'pointer',
        }}>
        Try again
      </button>
    </body>
  </html>
);

export default GlobalError;
