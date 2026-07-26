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

## Page contract

1. เริ่มหน้าด้วย `Workspace` และส่ง `icon`, `title`, `subtitle`, `headerRight`, `toolbar` หรือ `rail` ผ่าน props
2. ใช้ `WorkspaceSection`, `MetricStrip` และ `Metric` เมื่อต้องสร้าง section หรือ KPI strip แบบเดียวกับระบบบริหารงานขาย
3. ใช้ `KpiCard`, `Tabs`, `Select`, `SearchableSelect`, `FilterPopover`, `EmptyState`, `SkeletonRows`, `Toast` และ `FormActions` จาก `components/ui`
4. ครอบตารางทุกชนิดด้วย `TableScroll` และระบุ `family="editable"` หรือ `family="matrix"` เมื่อไม่ใช่ list table
5. ครอบ Recharts ทุกตัวด้วย `ChartCanvas`; ใช้ `ChartCard`, `ChartTooltip`, `ChartEmptyState` และ `chartTheme` สำหรับโครงและสี
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
