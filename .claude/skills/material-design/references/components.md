# M3 components → existing classes & components

Every M3 component this app needs already has a house implementation. Use this table to find
it; only invent new CSS when a row is genuinely missing, and then add it to `globals.css`
built from tokens.

React components live in `webapp/src/components/ui/`; CSS classes in
`webapp/src/app/globals.css`.

## Buttons

| M3 component | Here | Notes |
|---|---|---|
| Filled button | `.btn.btn-accent` | The ONE high-emphasis action per view. `--accent` bg. |
| Filled button (brand/nav context) | `.btn.btn-primary` | Navy fill — used for topbar-level primary actions. |
| Filled tonal button | `.btn` + inline `background: var(--accent-soft); color: var(--accent); border-color: transparent` | Rare; prefer outlined. |
| Outlined button | `.btn` (default) | Medium emphasis. `.btn.sm` for compact (28px). |
| Text button | `.btn.ghost` | Low emphasis; transparent until hover. |
| Icon button | `.btn-icon` (+ `.danger`) | 28px ghost square. **Always set `aria-label`.** In a `.toolbar` it auto-sizes to `--ctl-h`. |
| Status buttons | `.btn-success` / `.btn-warning` / `.btn-danger` | Approve / hold / delete actions. |
| FAB | — forbidden | Use `.action-bar` (right-aligned flex row) instead. Pair with `ActionButtons.js`. |
| Segmented button | `.segmented` > `<button>` (`.active` or `aria-pressed`) | View/tab/scope switchers. `.icon` for icon-only segments, `.divider` for separators. |

## Selection & input

| M3 component | Here | Notes |
|---|---|---|
| Text field | `.premium-input` | Inside `.form-group` with a `<label>`. |
| Multiline | `.textarea-premium` | |
| Select / exposed dropdown | `.premium-select` or `Select.js` / `SearchableSelect.js` | Searchable for long lists (customers, products). |
| Search bar | `.search-glass` | Toolbar search; height snaps to `--ctl-h` inside `.toolbar`. |
| Filter chips / multi-select | `FilterPopover.js`, `MultiSelectFilter.js` | |
| Form layout | `.form-grid` / `.pm-form-grid` + `.form-group` | Two-column responsive grids. |

Forms never auto-save — end with an `.action-bar` containing ยกเลิก (`.btn`) and
บันทึก (`.btn-accent`).

## Communication (status, progress, feedback)

| M3 component | Here | Notes |
|---|---|---|
| Badge / label | `.ui-badge` | Color via inline `background: var(--x-soft); color: var(--x)`. |
| Assist/filter chip | `.chip` | Icon + label counters and inline tags; full radius. |
| Status pill | `.status-pill` | Workflow states with dot; see also `.pulse-dot`. |
| Linear progress | `.progress` > `<span style={{width: pct+'%'}}>` | `.done` modifier turns green. |
| Skeleton | `.skeleton` or `Skeleton.js` | Never plain "กำลังโหลด..." text. |
| Snackbar | `Toast.js` (`.toast-container`/`.toast`) | Success/error after async actions. |
| Empty state | `.empty-state` or `EmptyState.js` | `.dashed` variant = clickable add-affordance. |

## Containment

| M3 component | Here | Notes |
|---|---|---|
| Card (elevated) | `.glass-panel` | Generic surface. `.hover-card` / `.premium-card-hover` add raise-on-hover. |
| Stat/KPI card | `.stat-card` (filter-toggle, per-tile `--stat` color) or `.metric-card` (dashboard KPI) | Module overviews use `KpiCard` pattern + `ActionQueue.js`. |
| Dialog / side sheet | `.overlay` + `.drawer` (header `.drawer-header`, sections `.drawer-section`) | Drawers are the house pattern for detail/edit panes. |
| Divider | `border-bottom: 1px solid var(--border)` or `.segmented > .divider` | |
| List | `.timeline-list`, `.history-timeline` | Activity/history feeds. |
| Data table | `.premium-table-wrapper` > `.premium-table` | Sticky header built-in; `.sticky-col1` freezes first column on wide matrices; `.clickable-row` for row navigation. Wrap wide content in `.scroll-x-container`. |

## Navigation

| M3 component | Here | Notes |
|---|---|---|
| Top app bar | `.topnav` (`.topnav-system` navy row + `.topnav-menu` row) | Fixed, system-wide. Never add sidebars/bottom nav/nav drawers. |
| Navigation tabs | `.topnav-item` (+ `.active`) | Module menu row. |
| In-page tabs | `.tabs-header` > `.tab-btn` | Underline tabs inside a page. |
| Menu | `.topnav-sys-menu` pattern: `--panel` bg, `--shadow-lg`, 10px radius, 6px padding | Reuse for any popover menu. |
| Back affordance | `.topbar-back-btn` | |

## Layout & density

- Page shell: `.page` (max-width 1480px, responsive padding).
- Toolbar row: `.toolbar` (+ `.toolbar-label`, `> .spacer` pushes right). All controls inside
  snap to `--ctl-h` (34px).
- KPI rows: `.kpi-grid` / `.metrics-row`; dashboards: `.dashboard-grid`; charts: `.chart-card`.
- Spacing rhythm: 4/8/12/16/24 px; card padding 14–18px; page gap `--gap` (16px).
- Responsive: views switch table↔card by breakpoint (`useResponsiveView` pattern in PM);
  wide tables get `.scroll-x-container`, never squeeze columns to fit.
