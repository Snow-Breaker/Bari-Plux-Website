/**
 * bariplux-headers — real security headers in front of GitHub Pages.
 * Separate from discord-auth-worker on purpose.
 *
 * Zone routes (bariplux.com / www): fetch(request) goes to the origin.
 * workers.dev: proxy https://bariplux.com for header smoke tests.
 *
 * Requires Cloudflare SSL/TLS mode Full or Full (strict). Flexible causes
 * an infinite HTTPS redirect loop with GitHub Pages Enforce HTTPS.
 */
export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const isWorkersDev = incoming.hostname.endsWith('.workers.dev');

    const upstreamRequest = isWorkersDev
      ? new Request(
          new URL(incoming.pathname + incoming.search, 'https://bariplux.com'),
          request
        )
      : request;

    const response = await fetch(upstreamRequest);
    const headers = new Headers(response.headers);

    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Real frame-ancestors (meta cannot deliver this). Append — browsers combine CSPs.
    headers.append('Content-Security-Policy', "frame-ancestors 'none'");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
