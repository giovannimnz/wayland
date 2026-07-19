# Design QA — workspace computer connected indicator

Date: 2026-07-19

## Source and environment

- Reference: user-provided Codex sidebar screenshot (`image-2.png`).
- Live implementation: `https://10.13.1.13:25750/#/projects` on `atius-srv-3`.
- Browser: Chromium headless through Playwright.
- Viewport: 1365 × 900.
- State: authenticated, dark theme, Projects page open, Recent Chats visible.
- Connected hosts present: `ATIUS-SRV-1` and `ATIUS-SRV-3`.
- Disconnected hosts present: `ATIUS-SRV-2` and `HORISTIC-SRV`.

## Evidence

- Before fix: `output/playwright/codex-dot-before-recent.png`.
- Full live page after fix: `output/playwright/codex-dot-after-projects-full.png`.
- Recent Chats after fix: `output/playwright/codex-dot-after-recent.png`.
- Reference and implementation together: `output/playwright/codex-reference-vs-wayland-after.png`.

## Full-view comparison

The live Projects page renders the computer name right-aligned on each project card and on each Recent Chats project row. Connected entries show a bright green circular marker; disconnected entries keep the computer name and omit the marker. No card, row, or sidebar layout shifted after the change.

## Focused comparison

The Codex reference uses a compact bright-green status circle after the remote computer name. The Wayland implementation now follows the same hierarchy, alignment, color role, and visual weight:

- size: 8 × 8 px;
- rendered `fill`: `rgb(52, 211, 153)`;
- rendered `stroke`: `rgb(52, 211, 153)`;
- theme token: `var(--success, #34d399)`;
- spacing: existing 6 px gap preserved between computer name and dot.

The prior implementation was 7 × 7 px and inherited `rgb(154, 154, 154)` from `currentColor`, which made the supposedly connected marker gray. The SVG now receives the success token directly for both `color` and `fill`.

## Interaction and state checks

- Projects navigation opened successfully after authentication.
- Seven connected indicators were detected across Projects and Recent Chats.
- Every detected connected indicator measured 8 × 8 px and rendered green.
- Disconnected project cards remained without a connected marker.
- Hover title remains available through the parent indicator (`Connected` / `Disconnected`).
- Service health was active; local and DRG/VPN auth-status endpoints returned success.

## Console

The browser recorded the existing unauthenticated startup `403` and an optional script certificate warning before login. No connected-indicator runtime exception, React error, broken navigation, or post-login rendering failure was observed.

## Findings history

1. P1 — connected marker rendered gray because the SVG inherited `currentColor`. Fixed by applying the success token directly to the SVG and increasing its size to 8 px.
2. P2 — TypeScript rejected the refresh interval callback's inferred promise-like return. Fixed with an explicit `void` callback body.
3. Recheck — focused DOM tests, lint, typecheck, guarded production build, service smoke, and live visual comparison all passed.

## Final result

passed
