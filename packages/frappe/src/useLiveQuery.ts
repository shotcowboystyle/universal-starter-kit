/**
 * React DB supplies the server snapshot for both SSR and browser hydration.
 * Keep the upstream hook lifecycle intact on every platform.
 */
export { useLiveQuery } from '@tanstack/react-db';
