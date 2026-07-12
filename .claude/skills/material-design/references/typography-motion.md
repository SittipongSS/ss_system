# Typography, spacing, and motion

## Type scale (IBM Plex Sans Thai, body base 14px)

The fonts load via `next/font` (`--font-sans`, `--font-mono` on `<html>`); never add font
imports. Thai text needs slightly more line-height than Latin — the 1.5 body default covers it.

| M3 role | Here | Use |
|---|---|---|
| headline small | 20–22px / 700 / `--text` | Page title (`.page-title-area`) |
| title medium | 15–16px / 600 / `--text` | Card & drawer section titles |
| title small | 13.5–14px / 600 | Table of contents, nav items |
| body medium | 13–14px / 400 / `--text` or `--text-2` | Content, table cells (13px) |
| label large | 12–13px / 500–600 | Buttons, toolbar labels |
| label medium | 11–12px / 600 / `--text-2` | Badges, table headers, meta |
| label small | 10.5–11px / 600, often uppercase | Field labels (`.field-label`), axis ticks |

Numbers: `font-family: var(--font-mono)` (`.mono`) for IDs/codes; tabular figures for
money/quantities (`.premium-table` already sets `font-variant-numeric: tabular-nums`).
Money formatting comes from `lib/format.js` — never hand-format.

De-emphasis helpers: `.dim`, `.muted`, `.empty` (dash placeholder for no-value cells).

## Spacing

4px base grid. Common steps: 4 (icon gaps), 6–8 (control gaps), 10–12 (toolbar gaps,
cell padding), 14–18 (card padding), 16 (`--gap`, grid gutters), 24–28 (page padding),
40+ (empty-state breathing room).

Control heights: `--ctl-h` 34px (toolbar controls) · 32px (default `.btn`) ·
28px (`.btn.sm`, `.btn-icon`) · rows `--row-h` 40px.

## Motion

M3 easing/durations, scaled to this app's snappy feel:

| Purpose | Duration | Easing |
|---|---|---|
| color/hover feedback | 100–150ms | default (ease) |
| reveal/selection (tabs, segmented) | 120ms | ease |
| size/position (progress width, cards) | 200ms | `ease-out` |
| overlays (drawer/dialog enter) | 200–250ms | `cubic-bezier(0.2, 0, 0, 1)` (M3 emphasized) |

Rules:
- Animate `transform`/`opacity`, not layout properties.
- Loading uses `.skeleton` shimmer, not spinners, for content areas.
- No attention-seeking animation on data screens; motion only confirms user action.
- Respect existing transitions when editing a component — don't remove them, don't stack new
  ones on top.
