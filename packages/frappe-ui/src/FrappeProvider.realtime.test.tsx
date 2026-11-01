import { renderWithProviders } from '@repo/test-utils';
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrappeProvider } from './FrappeProvider';
import { FrappeTable } from './FrappeTable';

const { socket } = vi.hoisted(() => ({
  socket: vi.fn<() => never>(() => {
    throw new Error('Unexpected realtime transport');
  }),
}));
vi.mock(import('socket.io-client'), () => ({ io: socket }));
describe('FrappeProvider realtime', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([false, undefined, true])(
    'provider realtime=%s keeps HTTP reads and respects socket intent',
    async (realtime) => {
      const requests: string[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = input instanceof Request ? input.url : input.toString();
          requests.push(url);
          return Response.json(
            url.includes('/api/resource/')
              ? {
                  data: [{ name: 'HTTP-001', doctype: 'Customer', customer_name: 'HTTP customer' }],
                }
              : { exc_type: 'DoesNotExistError', message: 'Unsupported method' },
            {
              status: url.includes('/api/resource/') ? 200 : 404,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }),
      );
      const view = renderWithProviders(
        <FrappeProvider
          baseURL={`https://provider-${String(realtime)}.test`}
          realtime={realtime}>
          <FrappeTable<{ name: string; doctype: string; customer_name: string }>
            doctype="Customer"
            columns={[{ id: 'customer_name', accessorKey: 'customer_name', header: 'Customer' }]}
            filterableFields={[]}
            enablePagination={false}
            layout="table"
          />
        </FrappeProvider>,
      );
      await waitFor(() => {
        expect(view.getByText('HTTP customer')).toBeTruthy();
      });
      expect(requests.some((url) => url.includes('/api/resource/Customer'))).toBe(true);
      expect(socket).toHaveBeenCalledTimes(realtime === false ? 0 : 1);
      expect(view.queryByText(/reconnecting|offline/iu)).toBeNull();
    },
  );
});
