# แผนขยาย Contextual Right Rail และ Document Control ทั้งระบบ

> สถานะ: Implementation ครบทุกเฟส — รอ staging UAT และ CI
> เริ่ม: 2026-07-26
> ฐานโค้ด: `main` หลัง PR #734
> Branch: `codex/document-control-rollout`

## เป้าหมาย

ขยายมาตรฐานที่พิสูจน์แล้วจาก QT/SO ไปยังหน้าที่มีวงจรเอกสารจริง โดยให้ผู้ใช้พบข้อมูลสรุป
สถานะ ขั้นตอน ปุ่มจัดการเอกสาร และเอกสารที่เกี่ยวข้องในตำแหน่งเดียวกัน ขณะเดียวกันต้องไม่ย้าย
business rule, permission หรือ API ownership เข้า component กลาง

## กติกาที่ใช้กับทุกเฟส

1. `ContextualRightRail` ดูแล layout/sticky/responsive เท่านั้น
2. `DocumentControlCard` เป็น renderer ของ action descriptor; หน้า feature คำนวณสิทธิ์และ callback
3. Page header เก็บเฉพาะย้อนกลับ แก้ไข และลบระดับ entity
4. Lifecycle/output actions อยู่ใน `DocumentControlCard`
5. Downstream/upstream actions อยู่ใน `RelatedDocumentCard`
6. Action ระดับบรรทัดยังอยู่ติดกับบรรทัด ไม่ย้ายขึ้น rail
7. มี filled primary ได้สูงสุดหนึ่งปุ่มต่อบริบท
8. ทุกการบันทึกเป็น explicit save; ห้าม auto-save
9. ใช้ token และ shared classes จาก `globals.css`; ห้าม dependency UI ใหม่
10. การย้าย UI ต้องรักษา endpoint, payload, permission และข้อความยืนยันเดิม

## สิ่งที่ไม่ทำ

- ไม่ยัด Customer, Product, Deal, Project, Lead, Task หรือ Inquiry เข้า `DocumentControlCard`
- ไม่ย้าย business logic ข้ามโมดูล
- ไม่รวม action ระดับรายการ/บรรทัดเข้ากับ lifecycle ของเอกสาร
- ไม่เปลี่ยน schema เพื่อความสะดวกของ layout ยกเว้น Excise Filing v2 ที่มีแผนข้อมูลรองรับอยู่แล้ว
- ไม่เพิ่ม navigation sidebar, drawer navigation หรือ FAB

## แผน commit

| ลำดับ | Commit | ขอบเขต |
|---|---|---|
| 1 | `1e1e4c93` | Plan + QT/SO shared cleanup |
| 2 | `d75b6b98` | Costing + Material Request |
| 3 | `d7679d65` | Tax Registration + Filing |
| 4 | `08885f8c` | Sahamit PO + Shipment Preparation |
| 5 | `8f3d187a` | Versioned Settings |
| 6 | `ab4c12a0` | SO ↔ Excise Filing v2 |
| 7 | รอ closeout commit | Acceptance + documentation |

## Phase 0 — ปิดหนี้ร่วมของ QT/SO

### Implementation

1. เพิ่ม read-only presentation ให้ `QuotationLineItems` รองรับ SO โดยไม่สร้างตารางชุดที่สอง
2. ย้าย SO line table และ totals มาใช้ component กลาง
3. เพิ่ม alert surface กลางสำหรับ error/success พร้อม action เสริม
4. ย้าย QT/SO ไปใช้ alert กลางและลบ CSS เฉพาะหน้า
5. เพิ่ม dialog กลางสำหรับเหตุผลที่ต้องกรอก พร้อม validation/help/counter
6. ย้าย QT unaccept และ SO reject/override ที่ contract ตรงกันมาใช้ dialog กลาง
7. คง modal เฉพาะ domain ที่มีฟอร์มหลายส่วน เช่น SO cancel reason code + reverse Won

### Checks

- SO แสดงรายการ ยอดรวม ยอดสุทธิ และ Actual เท่าเดิม
- QT edit/read behavior ไม่เปลี่ยน
- Dialog ปิดไม่ได้ระหว่าง busy และ validation เดิมยังทำงาน
- ไม่มี duplicate filled primary
- Unit tests ของ shared model/component contract

## Phase 1 — Costing และ Material Request

### Costing

1. สร้าง pure status/workflow/action adapter จาก predicate เดิม
2. เปลี่ยนหัวหน้าเป็น `SalesDetailOverview`
3. ใช้ `DetailPageLayout`
4. Rail ประกอบด้วย:
   - `DocumentSummaryCard`: MOQ, จำนวนรายการ, ราคาครบ, อนุมัติครบ
   - `DocumentControlCard`: แก้ไข, ดึงราคา, ส่งอนุมัติ, ยกเลิก, ออกฉบับแก้ไข
   - `RelatedDocumentCard`: ดีลต้นทางและ FG ที่เกี่ยวข้อง
5. ย้ายเฉพาะ action ระดับใบ; ปุ่มยืนยันราคา ผูก FG และป้อนต้นทุนอยู่กับรายการเดิม
6. คง modal และ API callback เดิม

### Material Request

1. สร้าง status/workflow/action adapter
2. ใช้ overview + detail layout + rail
3. ย้ายส่งขอราคาและยกเลิกใบไป Document Control
4. ปุ่มบันทึกราคายังอยู่ sticky ใต้ตาราง เพราะเป็น action ของคำตอบหลายบรรทัด
5. แสดงความพร้อม/จำนวนรอราคาใน summary

### Checks

- ฝ่ายขายเห็น submit/cancel ตาม scope เดิม
- RD/PC ตอบเฉพาะรายการของฝ่ายตน
- Costing ดึงราคาจากคลังและอนุมัติรายรายการได้เหมือนเดิม
- Attachments ยังอัปโหลดและลบได้ตามสถานะ

## Phase 2 — Tax Registration และ Tax Filing

### Registration

1. เปลี่ยน Timeline เฉพาะหน้าเป็น `WorkflowRail`
2. ใช้ `DocumentReadinessList` แสดงเอกสารบังคับและ warning
3. ย้าย submit/resubmit/approve/reject/revise ไป Document Control
4. คง edit/delete เป็น page-header entity utility
5. แยก customer documents กับ registration documents ในเนื้อหาหลัก

### Filing

1. ใช้ summary แสดงภาษีรวม จำนวนรายการ และ due date
2. ย้าย receive/start filing/file/reject และออกใบวางบิลไป Document Control
3. ใช้ workflow กลางแทน Timeline เฉพาะหน้า
4. แสดง SO/ลูกค้า/ทะเบียนต้นทางผ่าน Related Document
5. คง item table และ attachments ในเนื้อหาหลัก

### Checks

- Legal และ Tax action visibility เท่าเดิม
- Exempt/non-exempt flow แสดง primary action ถูกต้อง
- Readiness และ disabled reason ถูกต้อง
- Print bill เรียก engine เดิม

## Phase 3 — Sahamit PO และ Shipment Preparation

### PO

1. ใช้ overview + detail layout
2. Summary แสดงจำนวนรายการ จำนวนรวม ปลายทาง และสถานะจัดส่ง
3. Document Control เก็บ save header/edit/delete เฉพาะที่เป็นระดับใบ
4. Related Document เก็บเปิด/เชื่อม/สร้างโครงการ และ settle deal
5. split/merge/shipment action ระดับชุดส่งคงอยู่ใน section เดิม
6. เปลี่ยน browser confirm/alert ที่เกี่ยวข้องเป็น shared dialog/toast

### Shipment Preparation

1. ใช้ detail layout แบบ output workspace
2. Summary แสดงโครงการ จำนวนสินค้า และสถานะการสร้างเอกสาร
3. Control เก็บสร้างใหม่/refresh/พิมพ์
4. ไม่มี workflow rail หาก entity ไม่มี lifecycle จริง

### Checks

- PO edit form ยัง reuse `PoForm`
- split/merge และ settlement ไม่เปลี่ยน payload
- mobile ไม่เกิด horizontal overflow
- เอกสาร shipment print มี logo และข้อมูลเดิมครบ

## Phase 4 — Versioned Settings

### Shared primitive

สร้าง `VersionControlCard` บน action descriptor เดิม รองรับ:

- สถานะ Draft/Published/Archived
- เวอร์ชันปัจจุบัน
- change note/readiness
- Save draft, Publish, Discard และ Create draft
- busy/disabled reason

### หน้าที่ migrate

1. Company
2. Commercial Presets
3. Document Standards
4. Workflow Templates

หน้าตั้งค่ายังคง editor/list/history layout เดิม ไม่บังคับใช้ right rail หากทำให้พื้นที่แก้ไขแคบเกินไป
แต่กลุ่ม lifecycle action ต้อง render ผ่าน component เดียวกัน

### Checks

- Published immutable
- stale update และ discard/publish confirmation เดิมยังอยู่
- ไม่มี auto-save
- Version history ไม่เปลี่ยน

## Phase 5 — SO ↔ Excise Filing v2

1. ตรวจ migration/schema จาก `docs/excise-filing-plan.md`
2. เพิ่ม read API ฝั่ง Tax สำหรับ lookup filing ด้วย `salesOrderId`
3. เพิ่ม create endpoint ฝั่ง Tax ที่รับ SO ที่อนุมัติแล้ว
4. Validate 1 SO = 1 filing และ idempotent conflict
5. หน้า SO query สถานะ downstream แบบ read-only
6. `RelatedDocumentCard`:
   - ยังไม่มี: ปุ่มสร้างการยื่นชำระ
   - มีแล้ว: สถานะ + ปุ่มเปิดใบยื่น
7. หน้า Tax Filing แสดง Related SO
8. ห้ามหน้า SO เขียนตาราง Tax โดยตรง

### Checks

- SO ไม่อนุมัติสร้างใบยื่นไม่ได้
- SO ไม่มีสินค้าสรรพสามิตสร้างไม่ได้
- SO เดิมสร้างซ้ำไม่ได้
- Permission ใช้ `sales:act`/กติกาฝั่ง Tax
- สอง entry points ให้ผลลัพธ์เดียวกัน

## Phase 6 — Acceptance และปิดเอกสาร

### Automated

1. Unit tests ทั้งหมด
2. Targeted ESLint ทุกไฟล์ที่เปลี่ยน
3. Production build
4. Migration checker
5. `git diff --check`

### Browser matrix

ทุกหน้าที่ migrate ต้องตรวจ:

- Desktop และ mobile
- Light และ dark
- Loading, empty, error, read-only และ busy
- Role/status สำคัญ
- ไม่มี horizontal overflow
- ไม่มี console error
- primary action ไม่เกินหนึ่งปุ่ม

### Real-data acceptance

- QT/SO ทุก role/status
- Migration 0128/0130 และ issued artifact
- A4/PDF สีและขาวดำ
- Costing/Material, Tax และ PO ด้วยข้อมูล staging จริง
- ผู้ใช้ยืนยันก่อนเปลี่ยนสถานะเอกสารเป็นเสร็จสมบูรณ์

### ผลตรวจจริง — 2026-07-26

| รายการ | ผล | หลักฐาน |
|---|---|---|
| Unit/regression tests | ผ่าน | 764/764 tests หลังรวม `origin/main` ล่าสุด |
| Targeted ESLint | ผ่าน | ทุกไฟล์ที่เปลี่ยนใน Phase 5 และ shared UI |
| Production build | ผ่าน | Next.js compile, TypeScript, page generation และ route manifest |
| Migration checker | ผ่าน | 160 files; latest `0160` |
| `git diff --check` | ผ่าน | ไม่มี whitespace error |
| Desktop dark | ผ่าน | `/tax/filings` + create-from-SO modal; ไม่มี horizontal overflow |
| Desktop light | ผ่าน | `/tax/filings`; theme token เปลี่ยนครบและไม่มี overflow |
| Mobile 390×844 | ผ่าน | list + modal อยู่ใน viewport; ไม่มี horizontal overflow |
| Empty/error/disabled | ผ่าน | empty list, API error notice และปุ่ม create disabled เมื่อไม่มี candidate |
| Browser console | ผ่าน | ไม่พบ console warning/error จาก UI |
| Real-data/role/status matrix | Blocked | local ไม่มี `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY`; API data request ตอบ 500 ตาม config guard |

### Known issues และ deferred acceptance

1. ต้องรัน migration `0160_sales_order_excise_filing.sql` ใน staging ก่อน UAT
2. ต้องตรวจ SO/Filing ด้วยข้อมูลจริงอย่างน้อย: approved SO ที่มี/ไม่มีสินค้าสรรพสามิต,
   SO ที่มีใบยื่นแล้ว, ทะเบียน missing advisory, exempt filing และ workflow
   `draft → pending → received → filing → complete → delivered`
3. ต้องตรวจ role จริง: AE/AC/Senior AE/AE Supervisor/Admin/Legal ตาม scope ทีม
4. การแจ้งเตือน Google Chat ไป Legal ไม่รวมใน rollout นี้ เพราะระบบยังไม่มี Legal chat space;
   dashboard/work queue เป็น notification surface ที่ใช้งานในขอบเขตปัจจุบัน
5. Print engine ไม่ได้ถูกเปลี่ยนใน rollout นี้; regression tests เดิมผ่าน แต่ A4/PDF staging
   acceptance ยังต้องทำตาม release checklist

## Definition of Done

- [x] ทุก phase implementation เสร็จ
- [x] Tests/lint/build/migration check ผ่าน
- [x] Browser smoke matrix desktop/mobile + light/dark ผ่าน
- [x] Real-data acceptance ระบุ blocker ที่พิสูจน์ได้
- [x] Permission/action inventory อัปเดต
- [x] Known issues และ deferred work ระบุชัด
- [x] เอกสาร rollout, Excise v2 และ QT/SO plan ตรงกับโค้ด
- [ ] Commit, push, PR และ CI สำเร็จ
