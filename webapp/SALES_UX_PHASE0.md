# Sales Management UX — Phase 0 Baseline

สถานะ: **พร้อมใช้เป็น implementation baseline**  
วันที่ตรวจ: 12 กรกฎาคม 2026  
ขอบเขต URL: `/sa/*` (รวม source จาก `sales-planning` และ `pm`)

## 1. เป้าหมายและกติกากลาง

Phase 0 ล็อก interaction contract ก่อนย้ายหน้าจอจริง โดยไม่เปลี่ยน database, API หรือ business lifecycle

### Surface contract

| Surface | เกณฑ์ใช้ | กติกา |
|---|---|---|
| Page | งานหลาย section, ใช้เวลานาน, ต้องแชร์ URL/ย้อนกลับได้ | มี page header, breadcrumb/back, primary action, dirty guard |
| Modal | การตัดสินใจหรือฟอร์มสั้นไม่เกินประมาณ 7 fields | มี title, cancel/confirm, focus trap, Escape policy |
| Drawer | quick view/แก้ข้อมูลรองโดยไม่เสีย context | ไม่ใช้แทน editor เอกสาร; mobile เปลี่ยนเป็น full-screen sheet |
| Inline | ค่าเดียว ความเสี่ยงต่ำ และย้อนกลับได้ | ต้องแสดง saving/saved/error และ rollback เมื่อผิดพลาด |

### Save contract

| Pattern | ใช้กับ | พฤติกรรมบังคับ |
|---|---|---|
| Manual save | Lead/Deal/Quotation/Project form | dirty state, Save disabled เมื่อไม่เปลี่ยน, guard ก่อนออก |
| Batch save | Target grid, Project task edits หลายรายการ | pending count, Save/Cancel ชัด, error ไม่ล้างค่าที่แก้ |
| Immediate save | status/toggle ค่าเดียวที่ reversible | Saving → Saved/Error; error ต้อง rollback |
| Confirmed command | Won/Lost/Accept/Approve/Delete/Issue revision | ยืนยันก่อน, ป้องกัน double submit, แสดงผลสำเร็จ/ล้มเหลว |
| Draft + submit | เอกสารที่ใช้เวลานาน | แยก “บันทึกร่าง” จาก “ส่ง/ยืนยัน” ชัดเจน |

สถานะมาตรฐาน: `idle → dirty → saving → saved` หรือ `error`

## 2. Route inventory และ ownership

| Public route | Source | หน้าที่ | ประเภทหลัก |
|---|---|---|---|
| `/sa` | `src/app/sales-planning/page.js` | Dashboard และ forecast review | Page/dashboard |
| `/sa/leads` | `sales-planning/leads/page.js` | รับ คัดกรอง มอบหมาย และแปลงลีด | Page/list + modals |
| `/sa/deals` | `sales-planning/deals/page.js` | รายการดีลและ quick operations | Page/list + modals |
| `/sa/deals/[id]` | `sales-planning/deals/[id]/page.js` | Deal hub, activity, quotation/project links | Page/detail + modals |
| `/sa/projects` | `pm/projects/page.js` | รายการโครงการ execution | Page/list |
| `/sa/projects/[id]` | `pm/projects/[id]/page.js` | Project timeline และเอกสาร | Page/detail + modals + batch edit |
| `/sa/quotations` | `sales-planning/quotations/page.js` | รายการและเริ่มสร้างใบเสนอราคา | Page/list + modal |
| `/sa/quotations/[id]` | `sales-planning/quotations/[id]/page.js` | แก้ไข/ดำเนินการใบเสนอราคา | Page/document editor |
| `/sa/targets` | `sales-planning/targets/page.js` | แก้เป้ารายเดือน/รายปี | Page/grid + batch save |
| `/sa/targets/plan` | `sales-planning/targets/plan/page.js` | คำนวณและยืนยันแผนเป้า | Page/wizard-like |
| `/sa/tasks` | `pm/tasks/page.js` | งานส่วนตัว/ทีม/ปฏิทิน | Page/list + modal + inline status |
| `/sa/kpi` | `sales-planning/kpi/page.js` | KPI read-only | Page/report |

หมายเหตุ: `/sales-planning/*` และ `/pm/*` เป็น source/legacy namespace; `/sa/*` คือ public IA ที่ต้องรักษาในช่วง refactor

## 3. Action-to-surface matrix

### Leads

| Action | ปัจจุบัน | Target | Save |
|---|---|---|---|
| รับลีดใหม่ | Modal ใหญ่ | Modal/full-screen mobile | Manual |
| แก้ไขลีด | Modal ใหญ่ | Modal/full-screen mobile | Manual + dirty guard |
| Screen/Assign/Contact/Meeting/Qualify/Bounce | Action modal | Modal สั้น | Confirmed command |
| สร้างดีลจากลีด | Modal | Modal สั้น | Confirmed command |
| ลบลีด | native confirm | Confirm modal กลาง | Confirmed destructive |

### Deals

| Action | ปัจจุบัน | Target | Save |
|---|---|---|---|
| เพิ่มดีล | Large modal | Page หรือ full-screen editor | Manual |
| เปิดรายละเอียด | Page | Page | Read |
| แก้ดีลหลาย field | Large modal | Dedicated page/edit section | Manual + dirty guard |
| ปิด Won/Lost | Modal | Modal | Confirmed command |
| สร้าง/ผูก Project | Modal | Modal | Confirmed command |
| ดู quotation/documents จาก list | Large modal | Drawer quick view; editor เปิด Page | Read/command |
| เพิ่ม/แก้ activity | Inline form | Inline | Manual ต่อรายการ |
| ลบ activity/deal/document | native confirm | Confirm modal กลาง | Confirmed destructive |

### Quotations

| Action | ปัจจุบัน | Target | Save |
|---|---|---|---|
| เริ่มสร้างโดยเลือกดีล | Modal | Modal สั้น | Command แล้วไป Page |
| แก้ header/lines/discount/notes | Page | Page | Manual + dirty guard |
| ส่งลูกค้า | ปุ่ม command | Confirm modal หากมีผล irreversible | Save draft แล้ว command |
| Accept/Approve/Reject/Revise | ปุ่ม/native confirm | Confirm modal กลาง | Confirmed command |
| Template หมายเหตุ | Large modal | Drawer/setting page | Manual |
| ลบ draft | native confirm | Confirm modal กลาง | Confirmed destructive |
| พิมพ์ | เปิดหน้าพิมพ์ | Page/print surface | Auto-save เฉพาะเมื่อผู้ใช้ยืนยัน |

### Targets

| Action | ปัจจุบัน | Target | Save |
|---|---|---|---|
| แก้ cell | Inline | Inline | Batch manual |
| เปลี่ยนปีทั้งที่ pending | native confirm | Unsaved-change dialog กลาง | Discard/Stay |
| บันทึกเป้าหมาย | Sticky panel | Sticky FormActions | Batch manual |
| วางแผนเป้าทั้งปี | Page | Page | Review → Confirm command |

### Projects and Tasks

| Action | ปัจจุบัน | Target | Save |
|---|---|---|---|
| แก้ project | Modal | Page section/full-screen mobile | Manual |
| เพิ่ม/แก้ task | Modal หรือ inline | Modal สั้นสำหรับโครงสร้าง; inline สำหรับ status | Manual/immediate ตาม field |
| แก้หลาย task | staged edits | Page batch action bar | Batch manual |
| เปลี่ยน task status | Inline | Inline | Immediate + rollback |
| Issue/restore revision | Modal/button | Confirm modal | Confirmed command |
| ยกเลิก/ลบ project/task | modal/native confirm | Confirm modal กลาง | Confirmed destructive |
| เพิ่ม/แก้งานส่วนตัว | Modal | Modal/full-screen mobile | Manual |

## 4. User flows ที่ต้องรักษา

### Flow A — Lead to Deal

1. Marketing สร้าง Lead
2. Screen และเลือกทีม
3. Assign AE
4. บันทึกการติดต่อ/นัดหมาย
5. Qualify และผูก Customer
6. สร้าง Deal ได้หนึ่งหรือหลายประเภท
7. ไป Deal detail

จุดวัด: สร้าง lead สำเร็จ, SLA screen/first contact, transition history, deal IDs ที่เกิดขึ้น

### Flow B — Deal to Quotation

1. เปิด Deal detail
2. ตรวจ Customer, value, forecast month และ project link
3. สร้างหรือผูก Project ตามเงื่อนไข
4. เริ่มสร้าง Quotation จาก Deal
5. แก้วันที่ รายการ ราคา ส่วนลด VAT และหมายเหตุ
6. บันทึกร่าง
7. ส่งลูกค้า/ขออนุมัติเมื่อเข้าเงื่อนไข

จุดกันข้อมูลหาย: dirty guard ที่ deal editor และ quotation editor; command ห้ามล้าง draft เมื่อ API error

### Flow C — Quotation to Won

1. ลูกค้ารับ quotation ที่อนุมัติแล้วหรือไม่ต้องอนุมัติ
2. ยืนยันยอดปิดจริงและเดือน Won
3. Deal เปลี่ยนเป็น Won
4. Forecast และ KPI อัปเดตจาก server
5. Project execution ทำงานต่อใน `/sa/projects/[id]`

จุดเสี่ยง: Accept และ Won เป็นคนละ business command ต้องไม่รวมเป็น auto-save

### Flow D — Target planning

1. เลือกปีและ owner/team
2. วางเป้ารายปีและกระจายรายเดือน
3. Review ผลรวม/ส่วนต่าง
4. ยืนยันแผน
5. ปรับ cell ภายหลังได้แบบ batch

จุดกันข้อมูลหาย: pending count, discard confirmation เมื่อเปลี่ยน context, Save failure คง cell edits

### Flow E — Project execution

1. เปิด project ที่ผูกจาก deal
2. เพิ่ม/จัดลำดับ/กำหนด dependency ของ task
3. แก้หลายรายการและบันทึกเป็นชุด
4. เปลี่ยน status งานรายวัน
5. ออก revision เมื่อถึง checkpoint
6. ส่งต่อทะเบียน/เอกสาร/การจัดส่งตาม route

## 5. Responsive baseline

| Range | Navigation | List/table | Forms/surfaces |
|---|---|---|---|
| Compact `<768px` | Bottom nav 4 รายการ + More sheet | Card/priority columns | 1 column, 44px targets, large modal → full-screen |
| Medium `768–1023px` | Compact top bar + scroll subnav | Reduced columns/horizontal scroll เฉพาะจำเป็น | 1–2 columns |
| Wide `≥1024px` | System switcher + contextual top nav | Full table | 2–3 columnsตาม content |

Sales mobile bottom items: `ภาพรวม`, `ลีด`, `ดีล`, `งาน`, `เพิ่มเติม`  
More sheet: `โครงการ`, `ใบเสนอราคา`, `เป้าหมาย`, `KPI`, `ปฏิทิน`, เปลี่ยนระบบ และ user actions

## 6. Data and typography baseline

- วันที่แสดงผล: `DD/MM/YYYY`; date-time: `DD/MM/YYYY HH:mm`
- API date-only: `YYYY-MM-DD`; ห้ามแปลงผ่าน timezone โดยไม่จำเป็น
- เงิน input blur: `1,000,000.00`; display อาจมี `฿` ตาม context
- จำนวนสินค้า: `25,056`; หน่วยอยู่ใน label/header/suffix
- เปอร์เซ็นต์: `80.00%`
- ตัวเลขตารางใช้ Sans + `tabular-nums lining-nums`; monospace สงวนให้รหัส
- ตัวเลขชิดขวา; label และ error ต้องไม่พึ่งสีอย่างเดียว

## 7. Prioritized UX backlog

### P0 — ป้องกันความเสียหาย/ความสับสนสูง

1. ใช้ dirty guard และ SaveStatus กับ editor หลาย field
2. แทน native confirm ด้วย ConfirmDialog กลางสำหรับ destructive/business commands
3. แยก Save draft ออกจาก Send/Accept/Won/Revise
4. ทำ date-only formatter ให้ timezone-safe
5. Error ทุก save ต้องคงค่าที่ผู้ใช้กรอก

### P1 — ความสม่ำเสมอและ mobile usability

1. Mobile bottom navigation + More sheet
2. PageHeader/FormActions/Modal/Drawer contract กลาง
3. MoneyInput/PercentInput/DateField กลาง
4. Deals list และ Leads list เป็น card/priority columns บน compact
5. ย้าย Deal editor หลาย field ออกจาก large modal

### P2 — ลด debt และขยายทั้งระบบ

1. แยก navigation config จาก `AppLayout.js`
2. ลด inline styles และแยก `globals.css` เป็น foundations/components/modules
3. ลบ direct `toLocaleString/toLocaleDateString` นอก formatter
4. เพิ่ม component showcase และ visual regression suite
5. migrate pattern จาก Sales ไป module อื่น

## 8. Acceptance criteria

### Global

- ผู้ใช้คาดเดาได้จากหน้าจอว่าการกดจะเปิด Page, Modal, Drawer หรือทำ command
- keyboard เข้าถึง action สำคัญได้; focus กลับต้นทางเมื่อปิด surface
- loading ป้องกัน double submit; error ระบุวิธีแก้และไม่ล้างข้อมูล
- destructive action มีชื่อ record และผลกระทบใน confirmation
- mobile ไม่มี action สำคัญหลุด viewport และ touch target ไม่น้อยกว่า 44px

### Save/edit

- Form หลาย field แสดง dirty ทันทีเมื่อเปลี่ยนค่า
- Save disabled เมื่อไม่มีการเปลี่ยนแปลง
- ออกจาก Page/Modal/Drawer ที่ dirty ต้องเลือก Stay หรือ Discard
- Save success reset dirty; Save failure คงค่าทั้งหมด
- Inline immediate save แสดง Saving/Saved/Error และ rollback เมื่อผิดพลาด
- Batch edit แสดงจำนวน pending และมี Save/Cancel เดียวกันทั้งระบบ

### Formatting

- กรอก `1000000` แล้ว blur เป็น `1,000,000.00`
- วันที่ `2026-07-12` แสดง `12/07/2026` โดยไม่เลื่อนวันจาก timezone
- จำนวน/% ใช้ helper กลางและแนวหลักตรงกันในตาราง

### Route-specific smoke scenarios

- Lead: create → screen → assign → qualify → create deal
- Deal: edit → link/create project → create quotation → Won/Lost
- Quotation: edit multiple lines → leave guard → save → send/approve/accept/revise
- Target: edit multiple cells → switch year guard → save/error recovery
- Project: staged task edits → cancel/save → revision → status command

## 9. Baseline evidence และข้อจำกัด

- Unit/integration tests ณ baseline: 140 ผ่าน
- Production build Next.js 16.2.7 ผ่าน
- Source inventory ตรวจจาก route, action, modal และ save handlers จริง
- **Visual baseline 390/768/1024/1440 ยังไม่ถูกบันทึก** เพราะ in-app browser เชื่อมต่อ local dev server ไม่สำเร็จ (`localhost` ถูก client block และ network address ถูกปฏิเสธการเชื่อมต่อ)

ดังนั้น Phase 0 ด้าน IA/interaction/acceptance ถือว่าล็อกแล้ว แต่ visual snapshots ต้องทำเป็น gate แรกเมื่อ environment เปิดให้ browser เข้าถึง dev serverได้ ก่อน merge navigation redesign

## 10. Phase 0 exit decision

พร้อมเริ่ม implementation ตามลำดับ:

1. P0 save/format foundation — เริ่มแล้วใน commit `a22c8f7`
2. ConfirmDialog + date-only-safe formatter
3. Quotation pilot completion
4. Responsive navigation แยก PR
5. Deals/Leads migration

