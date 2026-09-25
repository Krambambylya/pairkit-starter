const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/**
 * CSP for Pairkit web.
 *
 * Most routes are prerendered. Per-request nonces cannot be stamped onto those
 * script tags, and with a nonce present browsers ignore 'unsafe-inline'. So
 * production allows same-origin + inline bootstraps; development keeps a
 * nonce + strict-dynamic + unsafe-eval policy for HMR.
 */
export const contentSecurityPolicy = (nonce: string, isDev: boolean): string => {
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'unsafe-inline'`;

  return [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    `connect-src 'self' ${apiUrl}`,
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
};
