# SS System UI Design System

ระบบบริหารงานขายเป็นต้นแบบของ UI ทั้งระบบ โดยทุกโมดูลต้องใช้ design layer กลางชุดเดียวกัน ไม่สร้าง palette, page shell หรือ component style แยกเองในแต่ละระบบ

## Source of truth

- ต้นแบบที่เปิดดูได้จริง: `/settings/design-preview` (primitive ทุกตัวในหน้าเดียว ทั้งสองธีม)
- Design tokens และ shared classes: `src/app/globals.css`
- Buttons: `src/components/ui/Button.js` (ปุ่มทั่วไป) และ `src/components/ui/ActionButtons.js` (ปุ่มตามความหมายของ workflow)
- Page composition: `src/components/ui/Workspace.js`
- Detail composition: `src/components/ui/DetailOverview.js`
- Tables: `src/components/ui/Table.js`
- Dashboards and charts: `src/components/ui/ChartCard.js` and `src/lib/chartTheme.js`
- Feedback: `src/components/ui/Toast.js` and `src/components/ui/ConfirmDialog.js`
- Print: `src/lib/printTheme.js`
- Shared controls: `src/components/ui/`
- Static contract check: `npm run audit:ui`

compatibility alias เฉพาะโมดูลถูกถอดแล้ว ทุก route ใช้ primitive กลางโดยตรง การแก้ `Workspace` หรือ token กลางจึงมีผลกับฝ่ายขาย ภาษี ฐานข้อมูล งานบริหาร Sahamit และหน้าตั้งค่าพร้อมกัน

**ออกแบบฟอร์ม → อ่าน [docs/form-design-rules.md](../docs/form-design-rules.md) ก่อน** —
เอกสารนี้คุมสัญญาของชั้นกลาง (token/คลาส/primitive) ส่วนวิธี *เลือกใช้* (ลำดับคำถาม ·
การกรอก · ช่องแบบไหนใช้คอนโทรลอะไร) อยู่ในไฟล์นั้น

## Page contract

1. เริ่มหน้าด้วย `Workspace` และส่ง `icon`, `title`, `subtitle`, `headerRight`, `toolbar` หรือ `rail` ผ่าน props
2. ใช้ `WorkspaceSection`, `MetricStrip` และ `Metric` เมื่อต้องสร้าง section หรือ KPI strip แบบเดียวกับระบบบริหารงานขาย
3. ใช้ `KpiCard`, `Tabs`, `Select`, `SearchableSelect`, `FilterPopover`, `EmptyState`, `SkeletonRows`, `Toast` และ `FormActions` จาก `components/ui`
4. ครอบตารางทุกชนิดด้วย `TableScroll` และระบุ `family="editable"` หรือ `family="matrix"` เมื่อไม่ใช่ list table
5. ครอบ Recharts ทุกตัวด้วย `ChartCanvas`; ใช้ `ChartCard`, `ChartTooltip`, `ChartEmptyState` และ `chartTheme` สำหรับโครงและสี
   - 🪤 **`<Pie>` ต้องใส่ `isAnimationActive={false}` เสมอ** — Recharts 3.9.2 เรนเดอร์ Pie ที่เปิดอนิเมชัน
     (ค่าเริ่มต้น) ออกมาเป็น sector เปล่าไม่มี `path` = **วงกลมหายทั้งวง และไม่มี error อะไรฟ้อง**
     พังเงียบอยู่ 3 หน้า (สหมิตร · ภาษีสรรพสามิต · ฐานข้อมูล) จนเจอตอนทำการ์ดช่องทางของลีด 2026-08-12
     กราฟแท่ง/เส้นไม่มีอาการนี้ — เฉพาะ `Pie` · มีเทสต์กันไหลกลับที่ `pieAnimation.test.mjs`
6. ใช้ `notifyToast` และ `confirmAction` แทน native `alert`/`confirm`
7. เอกสารพิมพ์ใช้ `PRINT_FONT_STACK` และ placeholder จาก `printTheme`
4. ปุ่มทุกตัวมาจาก `Button` หรือ `ActionButton` — ห้ามเขียน `className="btn …"` เองในหน้าใหม่
   หนึ่งบริบทมี filled action เพียงปุ่มเดียว (`tone="accent"`); action รองใช้ `Button` เปล่าหรือ `variant="quiet"`
5. ฟอร์มต้องมีปุ่มบันทึกชัดเจน ไม่มี auto-save และใช้ confirm ตาม workflow เดิม

## Visual rules

- สี พื้นผิว เงา รัศมี และ motion ใช้ CSS variables เท่านั้น
- Page ใช้ `--bg`; card/table/drawer ใช้ `--panel`; inset/hover ใช้ `--panel-2`
- Header, section, metric strip และ data surface ใช้ radius `--radius-lg`
- Loading content ใช้ skeleton; ข้อมูลว่างใช้ `EmptyState`; async result ใช้ `Toast`
- Desktop และ mobile ใช้ top navigation ชุดเดียวกัน; mobile เปิด menu sheet จาก top bar
- ทุก interactive element ต้องมี hover, `:focus-visible` และ disabled state

## ชั้นกลาง 7 ชั้น — ของใหม่หยิบชื่อ ห้ามคิดค่าเอง

ทุกชั้นประกาศใน `src/app/globals.css` (`:root`) และมี **ตัวตรวจใน `audit:ui` + เทสต์**
กันไหลกลับ · สถานะ 2026-07-30 หลังรอบตรวจใหญ่ (PR #807–#839)

| ชั้น | โทเคน | ตัวตรวจ | เทสต์ |
|---|---|---|---|
| สี | `--bg` `--panel*` `--text*` `--accent*` `--navy*` + `*-soft` | raw color = 0 | `systemFoundation` |
| ขนาดตัวอักษร | `--fs-1..17` + ชื่อตามหน้าที่ | font-size/`fontSize` นอกโทเคน = 0 | `typeScale` · `inlineTypeScale` |
| **ตัวพิมพ์** | `--font-sans` = **ฟอนต์เดียวทั้งระบบ** · `--font-mono` / `--font-numeric` ชี้ตัวเดียวกัน | `font-family`/`fontFamily` นอกโทเคน = 0 | ตัวตรวจ `audit:ui` |
| ชั้นซ้อน | `--z-sticky` → `--z-portal-menu` (14 ชื่อ) | z-index ≥30 นอกโทเคน = 0 | `zIndexScale` |
| จังหวะ | `--motion-fast/medium/standard/slow` · `--ease-out/standard` | เวลาดิบใน transition/animation = 0 | `motionScale` |
| ระยะห่าง | `--space-1..9` (กริด 4px) | เพดาน `RAW_SPACING_CAP` | `spacingScale` |
| ความสูงตัวควบคุม | `--ctl-h` 36px · `--ctl-h-touch` 44px | — | `controlHeight` |
| จุดตัดจอ | *ไม่มีโทเคน* (ดูกับดัก) | เพดาน `BREAKPOINT_CAP` | `breakpointScale` |

**กติกาที่ใช้ได้กับทุกชั้น**
- บริบทเปลี่ยนได้แค่ **สี** — ห้ามใช้ descendant selector เขียน *รูปทราง* (ขอบ/พื้น/เงา/
  ความสูง/padding) ทับ variant ถ้าปุ่มในบริบทหนึ่งต้องหน้าตาต่าง = ผู้เรียกเลือก
  tone/variant ผิด ให้แก้ที่ JSX (ที่มา: `.btn.ghost` เคยถูกนิยาม 3 ที่ · #816)
- โทเคนที่ประกาศแล้วต้องมีคนใช้ — `tokenUsage.test.mjs` ห้ามประกาศเผื่อไว้
  (เคยมี 31 ตัวตาย รวมชุด M3 ทั้งชุดที่คอมเมนต์สั่งให้ใช้แต่ไม่มีใครอ้าง · #825)
- **หน้าต้นแบบต้องพูดตรงความจริง** — ตัวเลข/คำอ้างบนหน้านั้นผูกกับการนับจริงด้วยเทสต์
  (เคยโชว์สถานะ `.error` ที่ไม่มี selector และเลข "ป้ายซ้ำ" ที่ค้าง 3 เดือน · #814/#819)

## งานที่เหลือ 3 ข้อ — ต้องมีคนเปิดหน้าจริงดูก่อนถึงจะตัดสินได้

ทั้งสามข้อ **มีเพดาน/ลิสต์ยกเว้นรองรับแล้ว** ของใหม่งอกเพิ่มไม่ได้ · ที่ค้างคือการ
ตัดสินใจด้านดีไซน์ซึ่งต้องเห็นหน้าจริง ไม่ใช่โค้ดที่ยังเขียนไม่เสร็จ

**1. ระยะห่าง 793 จุดนอกกริด 4px** — `RAW_SPACING_CAP` ใน `scripts/audit-ui.mjs`

ค่าที่เหลือ: `10px` ×165 · `14px` ×106 · `6px` ×86 · `2px` ×84 · `18px` ×83 · ที่เหลือกระจาย
สามค่าแรกคือ "จังหวะ +2" ที่ใช้ทั้งระบบอย่างสม่ำเสมอ — **ย้ายแล้วคือปรับดีไซน์ ไม่ใช่เก็บกวาด**

🔴 เคยลองรอบหนึ่งแล้วทิ้ง (2026-07-30): ดูดเฉพาะค่าที่ห่างขั้น **1px** (236 จุด) โดยคิดว่า
"1px มองไม่เห็น" · วัดจริงบนหน้าต้นแบบได้ **113 จาก 126 element ขยับ มากสุด 10px**
เพราะ 1px ต่อ declaration **สะสม**ลงมาตามชั้นที่ซ้อนกัน (เมนู 8 รายการ × 2px = 16px)
→ ก่อนอ้างว่า "ขยับนิดเดียว" ต้องวัด `getBoundingClientRect` ของ element จริง ไม่ใช่ดูค่าใน CSS

**2. จุดตัดจอ 14 ค่า** — `BREAKPOINT_CAP` (ตอนนี้ 22)

ยังไม่ยุบ: 520 · 576 · 600 · 620 · 650 · 700 · 780 · 800 · 820 · 860 · 960 · 1050 · 1100 · 1120
ชุดที่แนะนำให้ของใหม่ใช้ (เขียนไว้ใน `globals.css` แล้ว): **480 · 560 · 640 · 680 · 768 · 900 · 1000 · 1200**
การย้ายค่าที่เหลือ = เปลี่ยน *จุดที่เลย์เอาต์สลับ* ต้องลากหน้าต่างดูจริง

**3. ปุ่มหน้าแรกสูง 40px** — `UNRESOLVED` ใน `src/components/ui/controlHeight.test.mjs`

`.home-hub-shortcuts .btn` และ `.home-continue-card .btn` อยู่ระหว่างมาตรฐาน 36 กับ
จอสัมผัส 44 · น่าจะจงใจ (หน้าแรกเป็น launchpad) แต่ยังไม่มีชื่อรองรับ
**ทางออกคือตั้งชื่อให้มัน (เช่น `--ctl-h-lg`) หรือยุบเข้ามาตรฐาน — ไม่ใช่ปล่อยไว้**

## ป้ายในตาราง — ขนาดและการ align (มติผู้ใช้ 2026-08-08)

> *"หากเป็นกลุ่มเดียวกันขนาดควรเท่ากันมั้ย จะได้ไม่มีเล็กบ้างใหญ่บ้าง"* — ใช่

**ป้ายทั้งระบบทรงเดียวกันอยู่แล้ว** — `.ui-badge` · `.status-pill` · `.chip` ·
`Badge.module.css .base` ใช้ `min-height: 24px` · padding · `--fs-label` ·
`--lh-text` ชุดเดียวกัน และมีเทสต์ล็อกไว้ว่าต้องตรงกัน (`badgeShape`)
⇒ ความต่างที่ตาเห็นมาจากสองอย่างเท่านั้น: **ความกว้างวิ่งตามข้อความ** และ **`size="sm"` ที่ใช้ปนกัน**

### 5 กฎ

1. **ป้ายในคอลัมน์เดียวกันกว้างเท่ากัน** — `.ui-badge-cell` + ตั้ง `--cell-badge-w`
   ผ่านคลาส `.ui-badge-w-*` ของคอลัมน์นั้น · ขอบป้ายเรียงเป็นเส้นตรงลงมา ⇒ ตากวาด
   คอลัมน์ได้เป็นแนว ไม่ใช่เต้นตามความยาวคำ
2. **ป้ายในตารางใช้ขนาดเดียว** (ค่าตั้งต้น `md`) — `size="sm"` สงวนไว้สำหรับป้ายที่
   **แทรกอยู่ในบรรทัดข้อความ** หรืออยู่ในการ์ดเล็กเท่านั้น · ในตารางป้ายคือข้อมูลหลัก
   ของคอลัมน์ ไม่ใช่ของประกอบ
3. **ข้อความชิดซ้าย · ตัวเลขและวันที่ชิดขวา** — ใช้ `className="num"` (Table.module.css
   ให้ `text-align: right` + `tabular-nums` อยู่แล้ว) · `.mono` **ไม่ได้จัดชิด** ⇒ วันที่ที่
   คนเทียบข้ามแถว ("ใบไหนเลยกำหนดนานสุด") ต้องเป็น `.num`
   ⚠️ อย่าใช้ `.mono` / `font-mono` เพื่อหวังให้ตัวเลขตรงคอลัมน์ — ตั้งแต่ 2026-08-09
   ระบบมีตัวพิมพ์เดียว `.mono` จึงไม่ได้เปลี่ยนฟอนต์อีกแล้ว · **ตัวเลขตรงคอลัมน์อยู่แล้ว
   โดยกำเนิด** เพราะ 0-9 ของ IBM Plex Sans Thai กว้าง 600/1000 em เท่ากันหมด
   (วัดจาก `hmtx` ของ woff2 จริง และวัดซ้ำในเบราว์เซอร์: ทุกหลัก 8.4px ที่ 14px)
4. **หัวตารางชิดตามเนื้อข้างล่าง** — `<th className="num">` สำหรับคอลัมน์ที่เนื้อชิดขวา ·
   `:global(.num)` ใน `Table.module.css` ใช้ได้กับทั้ง `th` และ `td` อยู่แล้ว ไม่ต้องเพิ่ม CSS
5. **แถวที่มีเซลล์สองบรรทัด ชิดบนทั้งแถว** — ค่าตั้งต้นของตารางกลางคือ
   `vertical-align: middle` ซึ่งถูกสำหรับแถวบรรทัดเดียว · พอมีเซลล์สองบรรทัดปนเซลล์
   บรรทัดเดียว บรรทัดแรกของแต่ละเซลล์จะไม่อยู่ระดับเดียวกัน ⇒ ตารางที่ตั้งใจให้เซลล์
   ซ้อนสองบรรทัดต้องสลับทั้งตารางเป็นชิดบน ไม่ใช่สลับทีละเซลล์

### ความกว้างต้องวัดจากของจริง

ค่าที่มีอยู่เขียนคำที่ใช้วัดกำกับไว้เสมอ (`--ui-badge-w-stage: 124px` ← *"เสนอไทม์ไลน์"*)
ของใหม่ต้องทำเหมือนกัน — เปิดหน้าจริง ฉีด `<span class="ui-badge">` ที่มีคำยาวที่สุดของ
ชุดนั้น แล้ววัด `getBoundingClientRect().width` (ดู §"วิธีวัดว่าหน้าตาไม่ขยับ")

**วัดแล้ว 2026-08-08** (dev server · IBM Plex Sans Thai · `--fs-label` 11.5px):

| ชุด | คำที่ยาวที่สุด | วัดได้ |
|---|---|---|
| ก้าวถัดไป (คิวคำร้อง) | “รอผู้ขอทำต่อ 3 รายการ” | 135px |
| สถานะกลิ่น | “ร่าง — รอ RD รับเข้าทะเบียน” | 156px |
| ที่มาของกลิ่น | “มาจากคำร้อง (ถูกลบแล้ว)” | 146px |

⚠️ **ตั้งแคบกว่าที่วัดไม่ได้** — ป้ายที่ยาวเกินจะดันคอลัมน์ ไม่ใช่ตัดคำ (กับดักเดิมของ
คอลัมน์สถานะลีดที่ตั้งไว้ 90px)

🪤 **ประกาศคลาสไว้ล่วงหน้าไม่ได้** — `audit:ui` มีเพดาน "CSS ที่ไม่มีใครเรียก" = **0**
⇒ `.ui-badge-w-*` ตัวใหม่ต้องลงคอมมิตเดียวกับหน้าที่ใช้มัน ไม่ใช่เตรียมไว้ก่อน
(กฎเดียวกับ `tokenUsage` ที่ห้ามประกาศโทเคนเผื่อไว้)

## กับดักที่เสียเวลาไปแล้ว — อย่าเหยียบซ้ำ

- 🪤 **Tailwind อ่านโทเคนบางชื่อเอง** — `--radius-xl` ไม่มีใครเขียน `var()` เลยแต่ขับ
  utility `rounded-xl` (8 จุด) · ลบแล้วมุมหดจาก 16px เหลือ 12px เงียบ ๆ
  **ก่อนลบโทเคน "ที่ไม่มีใครใช้" ต้องลบแล้ววัดในเบราว์เซอร์ว่าค่าว่างจริง** ถ้ายังมีค่า =
  มีอีกชั้นประกาศไว้ · ชื่อกลุ่มเสี่ยง: `--radius-*` `--text-*` `--font-*` `--shadow-*`
  `--color-*` `--spacing` `--breakpoint-*`
- 🪤 **custom property ใช้ใน media query ไม่ได้** — `@media (max-width: var(--bp))` ไม่ทำงาน
  ตามสเปก (media query ถูกประเมินก่อนตัวแปร resolve) จุดตัดจอจึงเป็นข้อตกลง+เพดาน
  ไม่ใช่โทเคน
- 🪤 **กฎที่อ่านทีละบรรทัดพลาด declaration ที่ตัดหลายบรรทัด** — `transition:` ยาว ๆ ใน
  `globals.css` ขึ้นบรรทัดใหม่ บรรทัดต่อไม่มีคำว่า `transition` เลยรอดกฎไป 5 จุด
  ต้องอ่าน**ทั้ง declaration**: `/(?:transition|animation)[^;{}]*;/`
- 🪤 **Turbopack cache `globals.css` แยกจาก CSS module** — เวลาวัดก่อน/หลังด้วย
  `git stash` ต้อง **ล้าง `.next` ทั้งสองรอบ** (restart เฉย ๆ ไม่พอ) ไม่งั้นได้โมดูลใหม่
  ปนกับ globals เก่า = โทเคนไม่มีค่า อ่านผลลวง
- 🪤 **`>=` กับ `>` ในเทสต์ชั้นซ้อน** — `--z-toast` เคยเท่ากับ `--z-modal` เป๊ะ แล้วเทสต์ที่
  เขียน `>=` ผ่าน ทั้งที่ของพัง (ค่าเท่ากัน = ปล่อยให้ลำดับ DOM ตัดสิน)
- 🪤 **`grep "\bชื่อคลาส\b"` นับเกิน** — `\b` แมตช์คลาสที่มีขีดนำหน้าด้วย ใช้
  `(?<![\w-])…(?![\w-])` แบบเดียวกับ ratchet
- ⚠️ **`var(--x, ค่าเก่า)` ตายทันทีที่ `--x` ถูกประกาศ** — `.ui-select.compact` ไม่เคยทำงานเลย
- 🪤 **`overflow-x: hidden` ฆ่า `position: sticky` ของลูกทุกตัว** — ตามสเปก แกนหนึ่งเป็น
  `hidden` บังคับอีกแกนที่เป็น `visible` ให้กลายเป็น `auto` กล่องนั้นจึงเป็น scroll
  container ทั้งที่ไม่เคยเลื่อนเอง แล้วลูกที่ sticky ไปยึดกับกล่องที่นิ่งสนิท
  **`getComputedStyle` ตอบว่า `sticky` ครบทุกค่า** (position · bottom · z-index) จึงดู
  เหมือนทำงาน — ต้องวัด `getBoundingClientRect()` **ตอนเลื่อนจริง** ถึงจะเห็นว่าหลุดจอ
  ⇒ ใช้ `overflow-x: clip` แทน (ตัดแนวนอนเหมือนกัน แต่ไม่สร้าง scroll container)
  · `.main-content` โดนข้อนี้เต็ม ๆ · ล็อกไว้ที่ `stickyScrollport.test.mjs`

## วิธีวัดว่า "หน้าตาไม่ขยับ" จริงไหม

ใช้ทุกครั้งที่แตะชั้นกลาง — พิสูจน์ด้วยตัวเลข ไม่ใช่ด้วยตา

1. ปักพอร์ตใน `.claude/launch.json` (**ห้าม `autoPort`** ไม่งั้น `localStorage` คนละ origin)
2. `rm -rf .next` → start → เก็บ `getBoundingClientRect` ของทุก element ทั้ง 5 กลุ่ม
   บนหน้าต้นแบบ เก็บลง `localStorage`
3. `git stash` (หรือ pop) → `rm -rf .next` → restart → วัดใหม่ → เทียบ
4. แบ่งเรียกทีละกลุ่ม ไม่งั้นชน timeout 30 วินาที
5. ตั้ง viewport ก่อนวัดเสมอ — ไม่งั้นค่าที่อ่านได้เพี้ยน (เคยอ่านกราฟได้ 0px เหมือนบั๊ก)

## Legacy budget — กติกาเดียวของงานย้ายเข้า design system

งาน design system วัดด้วย **จำนวนบรรทัดที่ลบ** ไม่ใช่จำนวน component ที่เพิ่ม
`npm run audit:ui` นับ "ชั้นสไตล์เก่าที่เหลือ" ต่อโมดูล (`legacyTable`, `legacySurface`,
`inlineStyle`, `rawButtonClass`) เทียบกับเพดานใน `scripts/ui-legacy-budget.json`

- ตัวเลขเกินเพดาน = PR กำลังวางชั้นใหม่ทับชั้นเก่า → audit ตก แก้ที่ต้นเหตุ ไม่ใช่ขอยกเว้น
- ตัวเลขต่ำกว่าเพดาน = ลบของเก่าได้จริง → รูดเพดานลงด้วย `npm run audit:ui -- --update-budget`
  แล้ว commit ไฟล์งบไปกับ PR เดียวกัน
- CSS module ห้ามใช้ `:global(.premium-*)`, `:global(.glass-panel)`, `:global(.fz-table)`
  ปัญหา "กรอบซ้อนกรอบ/พื้นผิดชั้น" ต้องแก้ด้วย prop ของ primitive เอง ไม่ใช่ให้ stylesheet
  ของ primitive ไปรู้จักชื่อคลาสของชั้นเก่า

ที่มา (2026-07-26): audit เดิมตรวจแค่ว่าหน้าเรียก primitive กลางหรือยัง จึงผ่าน 100%
ทั้งที่ 57 จาก 63 ไฟล์ที่ใช้ `TableScroll` ยังห่อ `<table className="premium-table">` อยู่ข้างใน
= กฎสองชุดตีกันบนหน้าจอจริง (แถวขยับตอน hover, ตารางถูกบังคับ `min-width: 700px`)

## Verification

รันตามลำดับ:

```bash
npm run audit:ui
npm run lint
npm test
npm run build
```

`audit:ui` จะตรวจจำนวน route, design-shell coverage, raw color ที่หลุดออกนอก token layer, sales-only workspace stylesheet และ Material dependency ที่ห้ามใช้

⚠️ **ถ้า audit ฟ้องว่า "ลดได้แล้ว"** (เพดานค้างสูงเกินจริง) ให้รูดเพดานลง อย่าปล่อยไว้ —
พื้นที่ว่างใต้เพดานคือที่ให้ของใหม่แอบเข้ามาโดยไม่มีใครเห็น เพดานทุกตัวในไฟล์นี้จึงตกทั้ง
สองทาง: เกิน = เพิ่มของเก่า · ต่ำกว่า = ลบได้แล้วแต่ลืมอัปเดตเลข
