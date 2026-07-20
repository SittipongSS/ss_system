# SS System UI Design System

ระบบบริหารงานขายเป็นต้นแบบของ UI ทั้งระบบ โดยทุกโมดูลต้องใช้ design layer กลางชุดเดียวกัน ไม่สร้าง palette, page shell หรือ component style แยกเองในแต่ละระบบ

## Source of truth

- Design tokens และ shared classes: `src/app/globals.css`
- Page composition: `src/components/ui/Workspace.js`
- Shared controls: `src/components/ui/`
- Static contract check: `npm run audit:ui`

`SaWorkspace` ยังอยู่เป็น compatibility alias สำหรับ route เดิม แต่ไม่มี stylesheet เฉพาะฝ่ายขายแล้ว การแก้ `Workspace` หรือ token กลางจึงมีผลกับฝ่ายขาย ภาษี ฐานข้อมูล งานบริหาร Sahamit และหน้าตั้งค่าพร้อมกัน

## Page contract

1. เริ่มหน้าด้วย `Workspace` และส่ง `icon`, `title`, `subtitle`, `headerRight`, `toolbar` หรือ `rail` ผ่าน props
2. ใช้ `WorkspaceSection`, `MetricStrip` และ `Metric` เมื่อต้องสร้าง section หรือ KPI strip แบบเดียวกับระบบบริหารงานขาย
3. ใช้ `KpiCard`, `Tabs`, `Select`, `SearchableSelect`, `FilterPopover`, `EmptyState`, `SkeletonRows`, `Toast` และ `FormActions` จาก `components/ui`
4. หนึ่งบริบทมี filled action เพียงปุ่มเดียว (`.btn-accent`); action รองใช้ `.btn` หรือ `.btn.ghost`
5. ฟอร์มต้องมีปุ่มบันทึกชัดเจน ไม่มี auto-save และใช้ confirm ตาม workflow เดิม

## Visual rules

- สี พื้นผิว เงา รัศมี และ motion ใช้ CSS variables เท่านั้น
- Page ใช้ `--bg`; card/table/drawer ใช้ `--panel`; inset/hover ใช้ `--panel-2`
- Header, section, metric strip และ data surface ใช้ radius `--radius-lg`
- Loading content ใช้ skeleton; ข้อมูลว่างใช้ `EmptyState`; async result ใช้ `Toast`
- Desktop และ mobile ใช้ top navigation ชุดเดียวกัน; mobile เปิด menu sheet จาก top bar
- ทุก interactive element ต้องมี hover, `:focus-visible` และ disabled state

## Verification

รันตามลำดับ:

```bash
npm run audit:ui
npm run lint
npm test
npm run build
```

`audit:ui` จะตรวจจำนวน route, design-shell coverage, raw color ที่หลุดออกนอก token layer, sales-only workspace stylesheet และ Material dependency ที่ห้ามใช้
