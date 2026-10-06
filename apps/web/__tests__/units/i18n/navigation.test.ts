import { describe, expect, it, vi } from 'vitest';

// oxlint-disable-next-line vitest/prefer-import-in-mock -- createNavigation stub returns placeholder strings, not the real navigation components
vi.mock('next-intl/navigation', () => ({
  createNavigation: vi.fn<() => Record<string, string>>(() => ({
    Link: 'Link',
    redirect: 'redirect',
    usePathname: 'usePathname',
    useRouter: 'useRouter',
    getPathname: 'getPathname',
  })),
}));

describe('navigation', () => {
  it('should export navigation functions', async () => {
    const navigation = await import('@/i18n/navigation');
    expect(navigation.Link).toBeDefined();
    expect(navigation.redirect).toBeDefined();
    expect(navigation.usePathname).toBeDefined();
    expect(navigation.useRouter).toBeDefined();
    expect(navigation.getPathname).toBeDefined();
  });

  it('should export Link', async () => {
    const { Link } = await import('@/i18n/navigation');
    expect(Link).toBeDefined();
  });

  it('should export redirect', async () => {
    const { redirect } = await import('@/i18n/navigation');
    expect(redirect).toBeDefined();
  });

  it('should export usePathname', async () => {
    const { usePathname } = await import('@/i18n/navigation');
    expect(usePathname).toBeDefined();
  });

  it('should export useRouter', async () => {
    const { useRouter } = await import('@/i18n/navigation');
    expect(useRouter).toBeDefined();
  });

  it('should export getPathname', async () => {
    const { getPathname } = await import('@/i18n/navigation');
    expect(getPathname).toBeDefined();
  });
});
