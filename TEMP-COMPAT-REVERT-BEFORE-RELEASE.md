# Temporary login compat — fully reverted (2026-07-22)

Version gate (`app=2.3.0`), `legacy=1`, open `pending_tokens` claim rules,
and `allowedIp: null` are all removed.

Desktop `?desktop=1` again redirects to firebase `login1.html` for all builds.
