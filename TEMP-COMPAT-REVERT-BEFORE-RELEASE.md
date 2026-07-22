# Temporary compat — REVERTED (2026-07-22)

See also `BPTV2/docs/TEMP-COMPAT-REVERT-BEFORE-RELEASE.md`.

Restored:
- `pending_tokens` owner-only read / no client write
- classic `login.html` `allowedIp: clientIp`
- no `legacy=1` on login1 allow list
- Discord desktop uses classic OAuth (not login1?legacy=1)

Deploy: `firebase deploy --only database,hosting`
