# UX/UI Rulebook

สถานะ: Draft สำหรับตรวจร่วมกัน
ฐานการออกแบบ: SS System tokens + Material Design 3 discipline

## กฎกลาง

- ใช้ token และ shared class ที่มีอยู่ก่อนสร้าง CSS ใหม่
- หนึ่งบริบทมี Primary action แบบ filled ได้ไม่เกินหนึ่งปุ่ม
- ใช้ระดับ Surface และ Typography สร้างลำดับความสำคัญ ไม่ใช้สีหรือกรอบจำนวนมาก
- ทุก Interactive control ต้องมี hover, focus-visible, disabled และ loading state
- Async content ใช้ Skeleton; ผลสำเร็จ/ผิดพลาดใช้ Toast; ไม่มีข้อมูลใช้ Empty state
- หน้าจอที่ผู้ใช้มือถือเข้าถึงต้องมี touch target อย่างน้อย 40px
- ข้อมูลแก้ไขได้ต้องมี Cancel และ Save; ห้าม Auto-save
- UI ใหม่ต้องตรวจทั้ง Light และ Dark theme

## Page Header

โครงส่วนหัวหน้ามาตรฐาน (มติ 2026-07-20) — ตัวอย่างอ้างอิง: หน้ารายละเอียดดีล
`webapp/src/app/sales-planning/deals/[id]/page.js` (แถวปุ่มย้อนกลับ + backActions):

1. **ลูกศรย้อนกลับ มุมซ้ายบน** — ทุกหน้าที่เข้ามาจากหน้าอื่นต้องมี; หน้า landing
   ของระบบ (หน้าที่อยู่ในเมนู navigation) ไม่ต้องมี ใช้ `Workspace` prop
   `back={{ href, label }}` เป็นกลไกมาตรฐาน
2. **ขวาบนนอกการ์ด (แถวเดียวกับปุ่มย้อนกลับ)** = action ระดับ entity ของหน้า:
   แก้ไข, ลบ, พัก, ปิด — เป็น icon button (`.btn-icon` + `aria-label` + `title`)
   ผ่าน `Workspace` prop `backActions`; ปุ่ม workflow ระดับหน้า (เช่น พิมพ์/ออกเอกสาร)
   วางเป็นปุ่ม text ในแถวเดียวกันได้
3. **ขวาสุดของ card header** = action ของเนื้อหาในการ์ดนั้น — ปุ่มเพิ่ม/สร้าง
   ทุกตัวต้องอยู่ในการ์ด ห้ามยกขึ้นไปปนกับ action ระดับหน้า; ถ้ายังไม่มีข้อมูล
   ให้วางปุ่มใน `EmptyState` ของการ์ดนั้นแทน (เช่น "สร้างฉบับร่าง" อยู่ที่ header
   การ์ดประวัติเวอร์ชัน หรือใน EmptyState ตอนยังไม่มีเวอร์ชันแรก)

กฎ:

- ห้ามวางลิงก์ย้อนกลับชิดขวาหรือปนอยู่ในกลุ่มปุ่ม action
- กฎข้อ 3 รวมหน้า list ด้วย: ปุ่มเพิ่ม/สร้างรายการอยู่ที่ Card header ของ
  การ์ดทะเบียน ไม่อยู่บน Page header แม้หน้านั้นมีการ์ดตารางเดียว
- ปุ่มลบระดับหน้าใช้โทน danger
- ปุ่ม approve/reject/ยื่น ของ approval workflow อยู่ใน action bar หรือการ์ด workflow
  ของมันตามเดิม — ไม่ใช่ action ระดับ entity
- ลูกศรย้อนกลับพาไปหน้าแม่ตามโครงสร้างข้อมูลเป็นค่าเริ่มต้น เพื่อให้พฤติกรรม
  คงที่เมื่อเข้าหน้าผ่านลิงก์ตรง; หน้าที่เข้าได้จากหลายทางอาจใช้ปุ่ม
  `router.back()` แทนลิงก์คงที่ แต่ตำแหน่งต้องซ้ายบนเสมอ

## KPI Card

ลำดับมาตรฐานจากบนลงล่าง:

1. Icon และชื่อ KPI
2. ค่าหลัก
3. Supporting text หรือค่าที่ใช้เทียบ
4. สถานะ/ช่วงเวลาเมื่อจำเป็น

กฎ:

- ค่าหลักต้องเด่นที่สุดและอยู่ตำแหน่งเดียวกันทุกการ์ด
- ชื่อ KPI ต้องไม่ถูกแทนด้วยคำอธิบายยาว
- Supporting text ไม่ใช้ขนาดหรือสีแข่งกับค่าหลัก
- ตัวเลขเงิน เปอร์เซ็นต์ และจำนวนใช้ tabular figures
- ไม่มีค่าใช้ dash และข้อความอธิบายสั้น ไม่ใช้ `0` หากความหมายคือไม่มีข้อมูล
- KPI ที่คลิกได้ต้องมี affordance และ active state ชัดเจน

## Navigation Card และ Content Card

- Navigation Card ใช้ชื่อ คำอธิบายสั้น และ affordance ไปหน้าถัดไป; ไม่มีเลข KPI ขนาดใหญ่
- KPI Card ใช้สรุปตัวเลข ไม่ใช้เป็นเมนูหลัก
- Content Card ใช้จัดกลุ่มข้อมูลหนึ่งเรื่องและมี action ตามบริบท
- ไม่ซ้อน Card หลายชั้นโดยไม่จำเป็น
- Admin Center ใช้ Navigation Card ที่จัดเป็นหมวด ไม่ใช้ KPI layout

## Graph และ Chart

- หัวกราฟประกอบด้วยชื่อ, ช่วงเวลา/ขอบเขต และ action ที่จำเป็น
- Legend อยู่ตำแหน่งคงที่และใช้คำเดียวกับตารางหรือ Filter
- สีมีความหมายคงที่ข้ามกราฟ เช่น สำเร็จ/เสี่ยง/ข้อมูลหลัก
- Tooltip แสดงชื่อ series, วันที่/หมวด และค่าที่ format แล้ว
- แกนและตัวเลขใช้ format กลาง; จำนวนเงินไม่ตัดหน่วยจนทำให้ตีความผิด
- กราฟต้องมี Summary หรือ Table alternative เมื่อข้อมูลสำคัญต่อการตัดสินใจ
- Loading, empty, error และ partial data state ต้องแยกจากกัน
- หลีกเลี่ยงกราฟ 3D, สีจำนวนมาก และ animation ที่ไม่สื่อสถานะ

## Data Table

- ใช้ `.premium-table-wrapper` และ `.premium-table` ก่อนสร้าง pattern ใหม่
- Header sticky ได้ แต่ต้องไม่ทับ top navigation หรือ content
- ตารางกว้างใช้ horizontal scrolling; ไม่บีบคอลัมน์จนอ่านข้อความไม่ได้
- คอลัมน์ข้อความชิดซ้าย; จำนวนและเงินชิดขวา; รหัสและสถานะใช้ตามชนิดข้อมูล
- เงินและจำนวนใช้ tabular figures และ formatter กลาง
- Total footer ต้องอยู่ใน flow หรือ sticky ภายใน wrapper ที่มีพื้นที่สำรอง
- Sticky footer ต้องไม่ทับแถวข้อมูลหรือ scrollbar
- ตารางที่คลิกแถวได้ต้องมี hover, keyboard focus และ action ที่ชัดเจน
- Header และ Footer ของตารางใช้ semantic markup ที่เหมาะสม
- Mobile เลือกระหว่าง card view หรือ horizontal table ตามความสำคัญของการเทียบข้ามคอลัมน์

## Drawer, Dialog และ Page

ใช้ Drawer เมื่อ:

- ดูรายละเอียดรายการเดียวโดยต้องการรักษาบริบทของตาราง
- เพิ่มหรือแก้ข้อมูลที่ไม่กว้างเกินไป
- เป็นงานหนึ่งขั้นตอนหรือมี Section จำนวนจำกัด

ใช้ Large Dialog หรือหน้าแยกเมื่อ:

- มี Preview ตารางกว้าง
- เป็น Wizard หลายขั้นตอน
- มีข้อมูลจำนวนมากหรือ Workflow ที่ต้องมี URL ของตัวเอง
- ต้องเทียบหลายรายการพร้อมกัน

กฎ Drawer:

- Header อยู่ด้านบนและปุ่มปิดอยู่ตำแหน่งคงที่
- เนื้อหา scroll ภายใน; action bar ไม่ทับเนื้อหา
- มี Cancel และ Save ที่ชัดเจน
- Desktop ใช้ความกว้างสม่ำเสมอ; Mobile แสดงเต็มจอ
- ไม่ใช้ Drawer เป็น navigation หลักของระบบ

## Typography และตัวเลข

- ใช้ IBM Plex Sans Thai ผ่าน `--font-sans`
- Base UI 14px และ line-height รองรับภาษาไทย
- Page title 20–22px/700
- Section title 15–16px/600
- Body/Table 13–14px
- Metadata 11–12px
- รหัสใช้ `--font-mono` เมื่อช่วยให้สแกนง่าย
- เงินและปริมาณใช้ tabular figures ไม่จำเป็นต้องใช้ Mono ทั้งชุด
- ห้าม import ฟ้อนต์ใหม่เฉพาะหน้า

## Responsive และ Accessibility

- ตรวจอย่างน้อย Desktop, Tablet และ Mobile
- ลำดับ DOM ต้องยังมีความหมายเมื่อ layout เปลี่ยน
- Icon button ต้องมี `aria-label`
- Color ไม่เป็นสัญญาณเดียวของสถานะ
- Keyboard ต้องเปิด/ปิด Menu, Drawer และ Dialog ได้
- Focus ต้องไม่ถูกกักหรือตกหลัง Overlay
- Respect reduced motion สำหรับ motion ที่เพิ่มใหม่

## Review checklist ต่อหน้าจอ

- [ ] มี Primary action เพียงหนึ่งรายการต่อบริบท
- [ ] ใช้ token ไม่มีสีดิบใน component CSS
- [ ] Title, value, supporting text และ action มีลำดับชัด
- [ ] Loading/empty/error/success ครบ
- [ ] ตารางและ Footer ไม่ทับกัน
- [ ] Number formatting สม่ำเสมอ
- [ ] Keyboard/focus/ARIA ครบ
- [ ] Light/Dark ผ่าน
- [ ] Mobile ผ่าน
