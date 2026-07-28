# Phase 5 security notes (literal findings)

## CSP (index.html)

Final `script-src` (unsafe-inline removed; unsafe-eval retained for Firebase JS SDK v8):

```
script-src 'self' https://cdnjs.cloudflare.com https://www.gstatic.com https://cdn.jsdelivr.net 'unsafe-eval';
```

Inline executable scripts moved to:
- `assets/js/boot.js` (mobile redirect + ondragstart)
- `assets/js/home-page.js` (page logic; video close via addEventListener)

`application/ld+json` remains (not executable JS under script-src in practice as typed JSON-LD).

## TOTP

- Removed leaking `console.error` with user code / generated codes / secret prefix from `theadm1n.html` and `public/theadm1n.html`.
- Client-side TOTP verification still present (architectural follow-up: move verify to Worker) — flagged, not silently rewritten.

## Firebase RTDB (`database.rules.json`)

- `app_config`: `.read: true` (intentional public config) — only public-read tree at top level besides nested photo/name reads for auth users.
- `payhip_*` / `stripe_*`: `.read: false`, `.write: false`.
- `admin`: gated by admin UID / email.
- Hosting `"public": "public"` — `_archive/` is not deployed to Firebase Hosting.
