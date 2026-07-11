# M3 color system → ss_system tokens

All tokens live in `webapp/src/app/globals.css` (`:root` for light, `[data-theme="dark"]`
overrides). Anything built from them is automatically dark-mode-correct.

## Full role mapping

| M3 role | Token (light value) | Use for |
|---|---|---|
| primary | `--accent` (#c17a52 terracotta) | The one high-emphasis action, active states, links-as-actions, active tab underline |
| on-primary | `--accent-fg` (#fff) | Text/icons on `--accent` fills |
| primary container | `--accent-soft` (#f6e7dd) | Selected menu items, tonal buttons, soft highlights |
| on-primary-container | `--accent` | Text on `--accent-soft` |
| secondary | `--navy` (#21385e) | Brand anchor: top bar, `.btn-primary`, print headers |
| surface (dim) | `--bg` (#efe9dd cream) | Page background only |
| surface container | `--panel` | Cards, tables, drawers, menus |
| surface container high | `--panel-2` | Hover fills, table headers, inset areas, segmented track |
| surface container highest | `--panel-3` | Deepest inset (rare) |
| on-surface | `--text` (#1a1e27) | Headings, primary content |
| on-surface-variant | `--text-2`, `--text-3` | Secondary text; hints/meta/placeholders |
| outline | `--border-strong` | Emphasized borders, hover borders |
| outline-variant | `--border` | Default hairline borders, dividers |
| error / error container | `--red` / `--red-soft` | Destructive actions, validation, overdue |
| shadow (elev 1/2/3) | `--shadow-sm` / `--shadow-md` / `--shadow-lg` | Resting card / raised-hover / overlays & menus |

### Extended status roles (M3 "custom colors")

Each status color has a strong role and a `-soft` container role — use them as pairs
(strong = text/icon/fill, soft = background):

| Meaning | Strong / container |
|---|---|
| success, done, approved | `--green` / `--green-soft` |
| warning, pending, at-risk | `--amber` / `--amber-soft` |
| info, in-progress | `--blue` / `--blue-soft` |
| alternates for extra series (charts, categories) | `--teal`, `--violet` (+ soft) |
| user-edited marker | `--origin-edited` |

Badge/pill recipe (the standard status look, matches `.status-pill` / `.ui-badge` usage):

```jsx
<span className="ui-badge" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>
  อนุมัติแล้ว
</span>
```

## State layers

M3 expresses hover/focus/pressed as translucent overlays of the content color
(8% / 12% / 12%). In this codebase:

- **Neutral components** hover to the next surface: `background: var(--panel-2)`.
- **Colored components** use `color-mix`:
  ```css
  /* hover on a colored fill: darken ~10% */
  background: color-mix(in oklab, var(--accent) 90%, #000);
  /* hover/selected tint on a transparent control: 8–14% wash */
  background: color-mix(in srgb, var(--red) 12%, transparent);
  /* focus ring wash (see .stat-card.active) */
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--stat) 14%, transparent);
  ```
- **Focus** is always visible: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }`

## Elevation

M3 pairs shadow with tonal lift. Here the ladder is:

| Level | Surface | Shadow | Examples |
|---|---|---|---|
| 0 | `--bg` | none | page |
| 1 | `--panel` | `--shadow-sm` | cards, tables, inputs at rest |
| 2 | `--panel` | `--shadow-md` | hovered/raised cards, active buttons |
| 3 | `--panel` | `--shadow-lg` | menus, drawers, dialogs, popovers |

Don't stack heavy shadows on nested elements — only the outermost container of an
overlay carries `--shadow-lg`.

## Shape scale

| M3 shape | Value | Use |
|---|---|---|
| extra-small/small | `--radius` (8px) | buttons, inputs, badges, menu items (7px inside menus is fine) |
| medium | `--radius-lg` (12px) | cards, tables, drawers, segmented track |
| large | 14px | feature cards (`.pm-task-card`) |
| full | `--radius-full` | chips, progress, pills, avatars |

Rule of thumb: the bigger and more container-like the element, the larger the radius;
interactive controls stay at `--radius`.
