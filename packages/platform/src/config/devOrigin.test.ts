import { describe, expect, it } from 'vitest';

import { devHostFromHostUri, resolveDevOrigin } from './devOrigin';

const phone = { isWeb: false, hostUri: '10.0.0.5:3456' };

describe('resolveDevOrigin', () => {
  it('returns the url unchanged on web, even with a hostUri', () => {
    expect(resolveDevOrigin('http://localhost:8000', { isWeb: true, hostUri: '10.0.0.5:3456' })).toBe(
      'http://localhost:8000',
    );
  });

  it('rewrites a localhost origin to the hostUri host on native', () => {
    expect(resolveDevOrigin('http://localhost:8000', phone)).toBe('http://10.0.0.5:8000');
  });

  it('rewrites the 127.0.0.1 spelling too', () => {
    expect(resolveDevOrigin('http://127.0.0.1:8000', phone)).toBe('http://10.0.0.5:8000');
  });

  it('keeps the configured port, path, query and scheme', () => {
    expect(resolveDevOrigin('http://localhost:8080/auth/realms/myrealm?x=1#f', phone)).toBe(
      'http://10.0.0.5:8080/auth/realms/myrealm?x=1#f',
    );
    expect(resolveDevOrigin('ws://localhost:9000/socket.io', phone)).toBe('ws://10.0.0.5:9000/socket.io');
    expect(resolveDevOrigin('http://localhost', phone)).toBe('http://10.0.0.5');
  });

  it('leaves non-loopback hosts untouched', () => {
    expect(resolveDevOrigin('http://192.168.1.20:8000', phone)).toBe('http://192.168.1.20:8000');
    expect(resolveDevOrigin('https://bench.example.com', phone)).toBe('https://bench.example.com');
    expect(resolveDevOrigin('http://localhost.example.com:8000', phone)).toBe('http://localhost.example.com:8000');
  });

  it('leaves the url alone when there is no hostUri (release build)', () => {
    expect(resolveDevOrigin('http://localhost:8000', { isWeb: false })).toBe('http://localhost:8000');
    expect(resolveDevOrigin('http://localhost:8000', { isWeb: false, hostUri: '' })).toBe('http://localhost:8000');
  });

  it('passes values that are not urls through untouched', () => {
    expect(resolveDevOrigin('8080', phone)).toBe('8080');
    expect(resolveDevOrigin('localhost:8000', phone)).toBe('localhost:8000');
    expect(resolveDevOrigin('', phone)).toBe('');
  });

  it('defaults to the web source in this environment', () => {
    expect(resolveDevOrigin('http://localhost:8000')).toBe('http://localhost:8000');
  });
});

describe('devHostFromHostUri', () => {
  it('takes the host out of host:port', () => {
    expect(devHostFromHostUri('10.0.0.5:3456')).toBe('10.0.0.5');
    expect(devHostFromHostUri('dev.local')).toBe('dev.local');
  });

  it('strips a scheme and a path when a manifest carries them', () => {
    expect(devHostFromHostUri('http://10.0.0.5:3456/index.bundle')).toBe('10.0.0.5');
    expect(devHostFromHostUri('exp://10.0.0.5:3456')).toBe('10.0.0.5');
  });

  it('keeps an IPv6 literal bracketed', () => {
    expect(devHostFromHostUri('[fd00::2]:3456')).toBe('[fd00::2]');
  });

  it('returns undefined for nothing', () => {
    expect(devHostFromHostUri(undefined)).toBeUndefined();
    expect(devHostFromHostUri('')).toBeUndefined();
    expect(devHostFromHostUri(':3456')).toBeUndefined();
  });
});
