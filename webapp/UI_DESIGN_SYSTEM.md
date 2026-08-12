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
6. ใช้ `notifyToast` และ `confirmAction` แทน native `alert`/`confirm`
7. เอกสารพิมพ์ใช้ `PRINT_FONT_STACK` และ placeholder จาก `printTheme`
8. ปุ่มทุกตัวมาจาก `Button` หรือ `ActionButton` — ห้ามเขียน `className="btn …"` เองในหน้าใหม่
   หนึ่งบริบทมี filled action เพียงปุ่มเดียว (`tone="accent"`); action รองใช้ `Button` เปล่าหรือ `variant="quiet"`
9. ฟอร์มต้องมีปุ่มบันทึกชัดเจน ไม่มี auto-save และใช้ confirm ตาม workflow เดิม

## Visual rules

- สี พื้นผิว เงา รัศมี และ motion ใช้ CSS variables เท่านั้น
- Page ใช้ `--bg`; card/table/drawer ใช้ `--panel`; inset/hover ใช้ `--panel-2`
- Header, section, metric strip และ data surface ใช้ radius `--radius-lg`
- Loading content ใช้ skeleton; ข้อมูลว่างใช้ `EmptyState`; async result ใช้ `Toast`
- Desktop และ mobile ใช้ top navigation ชุดเดียวกัน; mobile เปิด menu sheet จาก top bar
- ทุก interactive element ต้องมี hover, `:focus-visible` และ disabled state

## ชั้นกลาง 13 ชั้น — ของใหม่หยิบชื่อ ห้ามคิดค่าเอง

ทุกชั้นประกาศใน `src/app/globals.css` (`:root`) และมี **ตัวตรวจใน `audit:ui` + เทสต์**
กันไหลกลับ · ตรวจล่าสุด 2026-08-12

⚠️ **เลขเพดานของจริงอ่านจาก `npm run audit:ui` ไม่ใช่จากเอกสารนี้** — ตัวเลขในไฟล์นี้
เคยค้างหลังของจริงทั้งชุด (เขียน 793 ตอนที่ของจริงลงมา 242 แล้ว) เอกสารบอกว่า
*ชั้นไหนมีเจ้าของ* · สคริปต์บอกว่า *เหลือเท่าไร*

| ชั้น | โทเคน | ตัวตรวจ | เทสต์ |
|---|---|---|---|
| สี | `--bg` `--panel*` `--text*` `--accent*` `--navy*` + `*-soft` | raw color = 0 | `systemFoundation` |
| ขนาดตัวอักษร | `--fs-1..17` + ชื่อตามหน้าที่ | font-size/`fontSize` นอกโทเคน = 0 | `typeScale` · `inlineTypeScale` |
| **ตัวพิมพ์** | `--font-sans` = **ฟอนต์เดียวทั้งระบบ** · `--font-mono` / `--font-numeric` ชี้ตัวเดียวกัน | `font-family`/`fontFamily` นอกโทเคน = 0 | ตัวตรวจ `audit:ui` |
| ความหนาตัวอักษร | `--fw-normal/medium/semibold/bold` | font-weight นอกโทเคน = 0 | `fontWeightScale` |
| ความสูงบรรทัด | `--lh-none/flat/tight/thai/text/relaxed` | เพดาน `RAW_LINE_HEIGHT_CAP` | `lineHeightScale` |
| ระยะห่างตัวอักษร | `--ls-heading/tabular/label` | เพดาน `RAW_LETTER_SPACING_CAP` · หน่วยต้องเป็น `em` = บังคับ | `letterSpacingScale` |
| ชั้นซ้อน | `--z-sticky` → `--z-portal-menu` (14 ชื่อ) | z-index ≥30 นอกโทเคน = 0 | `zIndexScale` |
| จังหวะ | `--motion-fast/medium/standard/slow` · `--ease-out/standard` | เวลาดิบใน transition/animation = 0 | `motionScale` |
| ระยะห่าง | `--space-0-5..9` (กริด 4px + ครึ่งขั้น) | เพดาน `RAW_SPACING_CAP` | `spacingScale` |
| ความมนมุม | `--radius` `--radius-md/lg/xl/full` | เพดาน `RAW_RADIUS_CAP` | `radiusScale` |
| เงา | `--shadow-sm/md/lg` · `--shadow-float` (รู้จักธีมเอง) | เพดาน `RAW_SHADOW_CAP` | `shadowScale` |
| ความจาง | `--op-disabled` 0.45 · `--op-muted` 0.55 | เพดาน `RAW_OPACITY_CAP` | `opacityScale` |
| ความสูงตัวควบคุม | `--ctl-h` 36px · `--ctl-h-touch` 44px | — | `controlHeight` |
| จุดตัดจอ | *ไม่มีโทเคน* (ดูกับดัก) | เพดาน `BREAKPOINT_CAP` | `breakpointScale` |

🪤 **`--radius-*` และ `--shadow-*` เป็น namespace ของ Tailwind v4** — เพิ่มชื่อใหม่
= เปลี่ยนความหมายของ utility `rounded-*` / `shadow-*` ทั้งระบบเงียบ ๆ ห้ามตั้งชื่อใหม่
เพื่อรองรับค่าที่เหลือใต้เพดาน

**กติกาที่ใช้ได้กับทุกชั้น**
- บริบทเปลี่ยนได้แค่ **สี** — ห้ามใช้ descendant selector เขียน *รูปทราง* (ขอบ/พื้น/เงา/
  ความสูง/padding) ทับ variant ถ้าปุ่มในบริบทหนึ่งต้องหน้าตาต่าง = ผู้เรียกเลือก
  tone/variant ผิด ให้แก้ที่ JSX (ที่มา: `.btn.ghost` เคยถูกนิยาม 3 ที่ · #816)
- โทเคนที่ประกาศแล้วต้องมีคนใช้ — `tokenUsage.test.mjs` ห้ามประกาศเผื่อไว้
  (เคยมี 31 ตัวตาย รวมชุด M3 ทั้งชุดที่คอมเมนต์สั่งให้ใช้แต่ไม่มีใครอ้าง · #825)
- **หน้าต้นแบบต้องพูดตรงความจริง** — ตัวเลข/คำอ้างบนหน้านั้นผูกกับการนับจริงด้วยเทสต์
  (เคยโชว์สถานะ `.error` ที่ไม่มี selector และเลข "ป้ายซ้ำ" ที่ค้าง 3 เดือน · #814/#819)

## เพดานที่ยังไม่เป็นศูนย์ — ที่ค้างคือการตัดสินใจด้านดีไซน์ ไม่ใช่โค้ดที่ยังไม่เสร็จ

ทุกตัว **มีเพดานรองรับแล้ว ของใหม่งอกเพิ่มไม่ได้** · เหตุผลรายตัวและประวัติการรูดเพดาน
เขียนกำกับไว้เหนือค่าคงที่แต่ละตัวใน `scripts/audit-ui.mjs` — **อ่านที่นั่นก่อนคิดจะแตะ**
ตัวเลขข้างล่างคือสถานะ 2026-08-12 ไว้ให้เห็นภาพ ไม่ใช่แหล่งอ้างอิง

| เพดาน | ตอนนี้ | ที่เหลือคืออะไร |
|---|---|---|
| `RAW_SPACING_CAP` | 242 | เลขคี่ (5 · 3 · 9 · 7 · 11px) — จังหวะ 2px ที่เหลือถูกตั้งชื่อเป็น `--space-*-5` ไปแล้ว |
| `RAW_LINE_HEIGHT_CAP` | 17 | ค่าระหว่างขั้น `--lh-*` (1.55 · 1.4 · 1.35 …) — คูณจำนวนบรรทัด ยิ่งกล่องยาวยิ่งขยับ |
| `RAW_RADIUS_CAP` | 21 | ค่าระหว่างขั้น (9 · 2 · 7 · 6 · 14px) · ไม่นับ `50%`, `0`, ค่าราย 4 มุม |
| `RAW_SHADOW_CAP` | 7 | เงาที่ **ไม่ใช่เงายกระดับ** (keyframes pulse · ขอบคอลัมน์ตรึง · tooltip กราฟ) จึงไม่มีปลายทาง |
| `RAW_OPACITY_CAP` | 15 | ความจางเชิงข้อมูล/ของประดับ ไม่ใช่สถานะ "กดไม่ได้" · `0`/`1` ไม่นับ |
| `RAW_LETTER_SPACING_CAP` | 4 | 4 จุดที่คนละบทบาทกันจริง — `.brand-logo` · `th` · `.dept` · `.totalAmount` **อย่าเหมารวมทีหลัง** |
| `BREAKPOINT_CAP` | 13 | 5 ค่าที่ยังไม่ยุบ: **800 · 820 · 1050 · 1100 · 1120** — ช่วงที่เปลี่ยนชนความกว้างอุปกรณ์จริง (iPad Air แนวตั้ง ฯลฯ) |

ชุดจุดตัดจอที่ให้ของใหม่ใช้ (เขียนไว้ใน `globals.css` แล้ว):
**480 · 560 · 640 · 680 · 768 · 900 · 1000 · 1200**

🔴 **บทเรียนที่ต้องใช้ทุกครั้งที่คิดจะรูดเพดานลง** (2026-07-30) — เคยดูดเฉพาะระยะห่างที่
ห่างขั้น **1px** (236 จุด) โดยคิดว่า "1px มองไม่เห็น" · วัดจริงบนหน้าต้นแบบได้ **113 จาก
126 element ขยับ มากสุด 10px** เพราะ 1px ต่อ declaration **สะสม**ลงมาตามชั้นที่ซ้อนกัน
(เมนู 8 รายการ × 2px = 16px) → ก่อนอ้างว่า "ขยับนิดเดียว" ต้องวัด `getBoundingClientRect`
ของ element จริง ไม่ใช่ดูค่าใน CSS

✅ **ปิดแล้ว: ปุ่มหน้าแรกสูง 40px** (2026-07-30) — จำลอง markup แล้ววัดบนจอ 375px พบว่า
ปุ่มลัดหน้าแรกได้ 40px ขณะที่ปุ่มบันทึกในฟอร์มได้ 44px = **launchpad มีเป้าเล็กกว่าฟอร์ม**
ตรงข้ามกับเหตุผลที่ใช้อ้าง · ทางออก: จอแคบใช้ `--ctl-h-touch` เดสก์ท็อปยุบเข้า `--ctl-h`
**ไม่ตั้ง `--ctl-h-lg`** เพราะจะได้โทเคนที่มีผู้ใช้จุดเดียวและไม่มีกฎว่าใช้เมื่อไหร่
⚠️ `UNRESOLVED` ใน `controlHeight.test.mjs` **ต้องว่างเสมอ** — เจอความสูงปุ่มที่ไม่มีชื่อ
ให้ตัดสินตอนนั้น อย่าพักไว้ในลิสต์

## ป้ายในตาราง — ขนาดและการ align (มติผู้ใช้ 2026-08-08)

> *"หากเป็นกลุ่มเดียวกันขนาดควรเท่ากันมั้ย จะได้ไม่มีเล็กบ้างใหญ่บ้าง"* — ใช่

**ป้ายทั้งระบบทรงเดียวกันอยู่แล้ว** — `.ui-badge` · `.status-pill` · `.chip` ·
`Badge.module.css .base` ใช้ `min-height: 24px` · padding · `--fs-label` ·
`--lh-text` ชุดเดียวกัน และมีเทสต์ล็อกไว้ว่าต้องตรงกัน (`badgeFamilies.test.mjs`)
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

⚠️ **ตั้งแคบกว่าที่วัดไม่ได้** — ป้ายที่ยาวเกินจะดันคอลัมน์ ไม่ใช่ตัดคำ (กับดักเดิมของ
คอลัมน์สถานะลีดที่ตั้งไว้ 90px)

**⭐ ทางลัดที่ถูกกว่าการขยายคอลัมน์: ย่อคำ** — รอบวัด 2026-08-08 เจอสามชุดที่กว้างเกิน
แล้วแก้ที่ *คำ* ไม่ใช่ที่ตัวเลข ทั้งสามครั้ง เพราะคำที่ยาวคือคำที่พูดซ้ำกับคอลัมน์อื่น

| ชุด | คำเดิม | วัดได้ | คำที่ใช้จริงตอนนี้ | คลาส |
|---|---|---|---|---|
| ก้าวถัดไป (คิวคำร้อง) | “รอผู้ขอทำต่อ 3 รายการ” | 135px | “รอผู้ขอทำต่อ” (84px) — จำนวนซ้ำกับคอลัมน์ “คืบหน้า” | `.ui-badge-w-nextstep` 88px |
| สถานะกลิ่น | “ร่าง — รอ RD รับเข้าทะเบียน” | 156px | “รอเข้าทะเบียน” (89px) | `.ui-badge-w-registry` 92px |
| ที่มาของกลิ่น | “มาจากคำร้อง (ถูกลบแล้ว)” | 146px | “คำร้องถูกลบ” — เคสหายากไม่ควรดันคอลัมน์กว้างกว่าเคสปกติ (130px) | `.ui-badge-w-source` 132px |

⇒ เจอป้ายที่กว้างเกิน **ถามก่อนว่าคำนั้นพูดซ้ำกับคอลัมน์ข้าง ๆ หรือเปล่า** ค่อยไปขยาย
คลาสถ้าคำนั้นจำเป็นจริง · มติของแต่ละชุดเขียนกำกับไว้ที่โค้ดต้นทาง
(`lib/requests/queueBoard.js` · `lib/master/scents.js`)

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
`inlineStyle`, `rawButtonClass`, `rawInputClass`) เทียบกับเพดานใน `scripts/ui-legacy-budget.json`

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
