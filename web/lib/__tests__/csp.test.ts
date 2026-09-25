import { describe, expect, it } from 'vitest';

import { contentSecurityPolicy } from '../csp';

describe('contentSecurityPolicy', () => {
  it('allows same-origin and inline scripts in production for prerendered pages', () => {
    const csp = contentSecurityPolicy('test-nonce', false);
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('strict-dynamic');
    expect(csp).not.toContain('nonce-test-nonce');
  });

  it('keeps unsafe-eval in development for Next HMR', () => {
    const csp = contentSecurityPolicy('dev-nonce', true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('nonce-dev-nonce');
  });
});
