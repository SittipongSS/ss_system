---
name: material-design
description: Apply Material Design 3 (M3) principles to UI work in this repo using the project's OWN CSS token/class system (webapp/src/app/globals.css) — never by installing @material/web or any Material library. Use this skill whenever building or restyling ANY page, component, form, table, dialog, dashboard, or card in webapp/, or when the user mentions Material, M3, ดีไซน์, ปรับหน้าตา, ทำหน้าใหม่, จัด layout, สวยขึ้น, UI/UX — even if they don't say "Material" explicitly.
---

# Material Design 3 on the ss_system design system

This skill translates Material Design 3 (from the material-components org / m3.material.io)
into concrete rules for THIS codebase. The project already has a complete token + shared-class
system in `webapp/src/app/globals.css`; M3 here is a **design discipline applied through those
existing tokens**, not a component library.

**Never** add `@material/web`, MDC, Materialize, or any Material CSS/JS dependency.
`material-components-web` is archived and `@material/web` is in maintenance mode — and more
importantly, this app's brand (warm cream + terracotta + navy, IBM Plex Sans Thai) is expressed
entirely through CSS variables that also drive dark mode. External component styles would break
both.

## The three golden rules

1. **Tokens only, never raw colors.** Every color, radius, and shadow comes from a CSS variable
   in `globals.css` (`--accent`, `--panel`, `--text-2`, `--radius-lg`, `--shadow-md`, …).
   Hardcoding a hex value silently breaks dark mode, because `[data-theme="dark"]` re-points the
   same variables. If a needed color doesn't exist, derive it with
   `color-mix(in srgb, var(--token) N%, transparent)` — that is also how M3 state layers work.

2. **Reuse the shared class layer before writing CSS.** `globals.css` already implements most M3
   components under different names (`.btn-accent` = filled button, `.segmented` = segmented
   button, `.chip`, `.premium-table`, `.overlay`+`.drawer`, `.progress`, `.skeleton`,
   `.empty-state`, …). Adding a new one-off style for something that exists creates drift.
   The full mapping is in [references/components.md](references/components.md) — read it before
   building any new screen.

3. **Hierarchy through emphasis, not decoration.** M3's core idea: one high-emphasis action per
   context (filled `.btn-accent`), medium emphasis for alternatives (outlined `.btn`), low
   emphasis for tertiary actions (`.btn.ghost`, `.btn-icon`). Surfaces gain prominence through
   the container ladder `--bg → --panel → --panel-2 → --panel-3` plus shadow, not through louder
   colors.

## M3 role → project token map (summary)

| M3 role | Project token |
|---|---|
| primary / on-primary | `--accent` / `--accent-fg` |
| primary container / on-primary-container | `--accent-soft` / `--accent` |
| secondary (brand anchor, nav & primary buttons) | `--navy` |
| surface / surface-container low→high | `--bg` / `--panel` → `--panel-2` → `--panel-3` |
| on-surface / on-surface-variant | `--text` / `--text-2`, `--text-3` |
| outline / outline-variant | `--border-strong` / `--border` |
| error / error container | `--red` / `--red-soft` |
| extended: success, warning, info, tertiary | `--green`, `--amber`, `--blue`, `--teal`, `--violet` (+ `-soft` containers) |
| elevation 1 / 2 / 3 | `--shadow-sm` / `--shadow-md` / `--shadow-lg` |
| shape small / medium / large / full | `--radius` (8) / `--radius-lg` (12) / 14px cards / `--radius-full` |

Details, state-layer recipes, and elevation guidance:
[references/color-and-tokens.md](references/color-and-tokens.md)

Typography scale (IBM Plex Sans Thai, 14px base), spacing grid, and motion durations/easing:
[references/typography-motion.md](references/typography-motion.md)

## Workflow when building or restyling UI

1. Read the target page/component and note which shared classes it already uses.
2. Pick components from [references/components.md](references/components.md) — prefer the shared
   React components in `webapp/src/components/ui/` (Select, Toast, Skeleton, EmptyState,
   ActionButtons, ActionQueue, FilterPopover, SearchableSelect, MultiSelectFilter, Workspace)
   over re-implementing markup.
3. Apply the M3 checklist below.
4. If a genuinely new pattern is needed, add it to `globals.css` **built from tokens**, with a
   short comment saying what it's for, so the next module can reuse it (that's how `.segmented`
   and `.stat-card` came to exist).

## M3 review checklist

Run through this before finishing any UI change:

- **Single filled action** — at most one `.btn-accent` (or `.btn-primary`) per view/dialog;
  everything else steps down to `.btn` / `.btn.ghost` / `.btn-icon`.
- **Containers, not borders-on-borders** — group content with the surface ladder + one border,
  not nested boxes. Page background stays `--bg`; cards sit on `--panel`.
- **States exist** — hover, `:focus-visible` (2px `--accent` outline), and disabled
  (`opacity:.4–.45; cursor:not-allowed`) on every interactive element.
- **Text hierarchy** — heading `--text`, supporting `--text-2`, hints/meta `--text-3`; numbers in
  tables use `font-variant-numeric: tabular-nums` (`.premium-table` has it already).
- **Dark mode works** — if you wrote a hex/rgb literal outside `globals.css`, that's the bug.
  Check both themes mentally: everything derived from tokens passes automatically.
- **Density** — toolbar controls all `--ctl-h` (34px) tall inside `.toolbar`; touch targets on
  mobile-facing views ≥ 40px; table rows breathe (10–12px padding), don't cram.
- **Feedback** — async actions show `.skeleton` while loading, `Toast` on success/failure,
  `.empty-state` when there is no data (never a blank table).

## Project UX laws that override stock M3

These are house rules; when M3 guidance conflicts, these win:

- **No auto-save.** Every editing surface has an explicit "บันทึก" button and a confirm step —
  never save on blur/change (M3-style inline commit is forbidden here).
- **No FAB.** Primary actions live in the `.action-bar` (right-aligned flex row) or the toolbar,
  not floating buttons.
- **Navigation is the fixed two-row top bar** (`.topnav`, navy system row + menu row). Don't
  introduce sidebars, bottom navigation, or navigation drawers.
- **Documents and print views** use the company logo via `lib/printHeader.js` — every screen and
  generated document carries `public/brand-logo.png`.
- **Thai-first copy** — labels/short UI text in Thai to match the rest of the app.
