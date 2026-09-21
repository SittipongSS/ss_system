# FM-SA-04 ใบสเปคสินค้า — โมเดลเอกสารชุดใหม่ (มติ 21/09/2569)

> สถานะ: **รอตรวจ** · ตรวจกับโค้ดเมื่อ 2026-09-22 · ขึ้น production แล้ว (#1764 · `12bfe465`) · mig 0370 รันบนฐานจริงแล้ว 22/09 · รอเจ้าของลองออกเอกสาร/อนุมัติบนจอจริงรอบแรก

สเปคในฐานข้อมูลเป็นข้อมูลของสินค้า ไม่มีเลขและไม่มี Rev ส่วนเลขที่เอกสาร Rev และด่านอนุมัติเป็นของ **เอกสาร** ที่ออกจาก SO

เอกสารนี้ใช้แทนโมเดลสามชั้นของ mig 0364/0369 เดิม ซึ่งให้ Rev กับด่านอนุมัติอยู่ที่สเปค
ตอนที่รื้อ ฐานจริงมีใบสเปค 2 ใบ (ร่างเปล่า) มีเอกสาร 0 ใบ และยังไม่มีตัวนับ ⇒ รื้อได้โดยไม่ต้องย้ายข้อมูลเอกสาร

## มติเจ้าของ (21/09/2569)

| เรื่อง | มติ |
|---|---|
| ขอบเขต | สินค้า FG หมวดหลัก 01 และ 02 เท่านั้น (`productSpecScope.js` เดิม) |
| สเปคในฐานข้อมูล | 1 แถวต่อสินค้า มีรายละเอียด checklist และรูป **ไม่มีเลขรัน ไม่มี Rev ไม่มีด่านอนุมัติ** · ฝ่ายขายแก้ได้เลย · ทุกการแก้ลง audit log |
| ออกเอกสารเมื่อไร | หลัง SO **อนุมัติแล้ว** (`sales_orders.status = 'approved'`) |
| หน่วยของเอกสาร | 1 ใบต่อ **บรรทัด SO** |
| ใครออก | **AC** เท่านั้น (+ admin) |
| เส้นอนุมัติ | AC ยื่น → **AE เจ้าของดีลของ SO** อนุมัติ → **AE Supervisor** อนุมัติ (admin กดแทนได้ทุกขั้น) |
| เลขที่เอกสาร | `FM-SA-04-DDMMYY-XXX` ได้ตอน AC กดออกเอกสาร · DDMMYY = วันที่ออก ปี พ.ศ. 2 หลัก · XXX ตัดรอบรายเดือน (เหมือน FM-RD-01) |
| Rev | เริ่ม **Rev.00** · ถ้าแก้ก่อนอนุมัติขั้นสุดท้าย ยังเป็น Rev เดิม · ถ้าอนุมัติแล้ว AC กด "แก้ไขเอกสาร" จะได้ Rev+1 **เลขที่เดิม** และต้องเดินด่านครบสามขั้นใหม่ |
| แก้สเปคในฐานข้อมูล | **ไม่แตะ** เอกสารที่ยื่นหรืออนุมัติไปแล้ว (เอกสารถือภาพนิ่งของตัวเอง) |
| SO ยกเลิก | เอกสารเป็น `void` · เลขที่ไม่นำกลับมาใช้ |
| SO ออก Rev ใหม่ (ได้ SO เลขใหม่) | เอกสารย้ายไปผูก SO ใบใหม่ · ขึ้น Rev+1 เลขที่เดิม · เดินด่านใหม่ |

## ตาราง (mig 0370)

### `product_specs` — สเปคของสินค้า (คงไว้ ปรับรูป)
- 1 แถวต่อสินค้า (`productId` UNIQUE) ตามเดิม
- **เพิ่มคอลัมน์เนื้อหา** ย้ายมาจาก `product_spec_revisions`: `texture` `standardPackaging` `targetGroup`
  `keySellingPoint` `pricingTier` `productBenefit` `longevity` `dosagePerUse` (ความยาวเท่า CHECK เดิม) +
  `certifications jsonb '[]'` + `updatedBy` `updatedByName`
- **ถอด `currentRevNo`**
- checklist ย้ายไป `product_spec_items` (คีย์ `specId`) ซึ่งเป็นตารางใหม่
- `products.texture` / `products.standardPackaging` ยังเป็นกระจก · **ซิงก์ตอนบันทึกสเปค** (ไม่มีขั้นอนุมัติให้รอแล้ว) · ลบสเปคแล้วล้างสองช่องนี้เป็นค่าว่าง
- รูปประกอบยังเป็น `attachments` (`entityType='product'`, `docType='spec_illustration'`) ตามเดิม

### `product_spec_documents` — เอกสาร 1 ใบต่อบรรทัด SO
`id` (`PSD…`) · `docNo` UNIQUE แก้ไม่ได้ · `specId` → product_specs **RESTRICT** · `productId` → products **RESTRICT** ·
`salesOrderId` / `salesOrderLineId` → **SET NULL** (ย้ายได้ตอน SO ออก Rev) · `status` `active|void` ·
`currentRevNo` (Rev ล่าสุดที่อนุมัติขั้นสุดท้ายแล้ว · `NULL` = ยังไม่เคยอนุมัติ) · `voidedAt/By/ByName/voidReason` ·
`customerSignedAt/Name/customerSignFiles` (เก็บไว้ใช้ทีหลัง ยังไม่มีจอ) · `createdBy/ByName/At` · `updatedAt`
- partial unique: บรรทัด SO หนึ่งบรรทัดมีเอกสารที่ยังไม่ void ได้ใบเดียว
- trigger: `docNo` · `specId` · `productId` · `createdAt` แก้ไม่ได้ · ลบแถวไม่ได้ (เลขที่ออกนอกบริษัทแล้ว)

### `product_spec_document_revisions` — Rev ของเอกสาร
`id` (`PSDR…`) · `documentId` → documents **RESTRICT** · `revNo` ≥ 0 · UNIQUE(`documentId`,`revNo`) ·
`status` `draft | pending_ae | pending_ae_supervisor | approved | rejected | superseded` ·
`reason` (บังคับเมื่อ `revNo > 0` — เหตุผลที่แก้) · `snapshot jsonb` (NULL ตอนเป็นร่าง · ถ่ายตอนยื่น) ·
`illustrationIds text[]` (ตัวชี้รูปในภาพนิ่ง ไว้กันไฟล์หาย) ·
`submittedAt/By/ByName` (AC) · `aeApprovedAt/By/ByName` · `supApprovedAt/By/ByName` ·
`rejectedAt/By/ByName` · `rejectionReason` · `rejectedStage` (`ae|ae_supervisor`) · `supersededAt` ·
`frozenHtml` · `frozenAt` · `rendererVersion` · `createdBy/ByName/At` · `updatedAt`
- partial unique: เอกสารหนึ่งใบมี Rev ที่ยังไม่จบ (`draft|pending_ae|pending_ae_supervisor|rejected`) ได้ทีละหนึ่ง
- trigger: Rev ที่ `approved/superseded` ห้ามแก้ `snapshot` `illustrationIds` `frozenHtml`(เมื่อมีค่าแล้ว) และตราประทับอนุมัติ · สถานะเปลี่ยนได้ทางเดียวคือ `approved → superseded` · ลบแถวไม่ได้

### RPC `create_product_spec_document`
ออกเลข (ตัวนับ `entity_number_counters` scope `FMSA04` · month = YYMM ค.ศ. · seed ด้วย LIKE ที่ปิดตาช่องวัน — ตรรกะเดียวกับ 0364 ข้อ ⑦ / 0271)
แล้ว INSERT เอกสาร และ INSERT Rev.00 `draft` **ในคำสั่งเดียว** · SECURITY DEFINER · ให้สิทธิ์เฉพาะ service_role

### RPC `replace_product_spec_items`
บันทึก checklist ของสเปคแบบทับทั้งชุดในคำสั่งเดียว (ล็อกแถวสเปค → ลบชุดเดิม → เขียนชุดใหม่) · คนที่อ่านพร้อมกัน (เช่นการยื่นที่ถ่ายภาพนิ่ง) เห็นชุดเก่าหรือชุดใหม่ชุดใดชุดหนึ่งเท่านั้น ไม่มีจังหวะที่สองชุดซ้อนกัน · SECURITY DEFINER · ให้สิทธิ์เฉพาะ service_role

### ถอดของเดิม
`product_spec_issues` (ต้องมี 0 แถว ไม่งั้น RAISE) · `product_spec_revision_items` · `product_spec_revisions` ·
`guard_product_spec_revision()` · `create_product_spec_issue(...)`
checklist เดิม 34 แถวย้ายไป `product_spec_items` ผ่าน Rev ล่าสุดของแต่ละใบ

### มาตรฐานเอกสาร
seed แถวตั้งต้นของ `productSpec` ใน `document_standards` และแถวเผยแพร่ v1 ใน `document_standard_versions` ตามแบบของ 0226
(formCode `FM-SA-04` · Rev.00 · มีผล 2025-05-08 · accent teal · `WHERE NOT EXISTS`)
⇒ แก้หน้า "ตั้งค่า → มาตรฐานเอกสาร" ที่ตอบ 500 มาตั้งแต่ #1751

## เส้นสถานะของ Rev

```
            ยื่น (AC)            AE เจ้าของดีลอนุมัติ           AE Sup อนุมัติ
  draft ─────────────▶ pending_ae ────────────────▶ pending_ae_supervisor ──────────▶ approved
    ▲                     │  │                          │  │                            │
    │   ดึงกลับ (ผู้ยื่น/admin)  │  └─ ตีกลับ ─┐          ดึงกลับ ─┘  └─ ตีกลับ ─┐          แก้ไขเอกสาร (AC)
    └─────────────────────┘             ▼                               ▼          ▼
                                     rejected ◀────────────────────────┘     Rev+1 draft
                                        │ AC แก้แล้วยื่นใหม่ (Rev เดิม)            (Rev ก่อนเป็น superseded
                                        └──────▶ pending_ae                  ตอน Rev ใหม่ได้ approved)
```

| การกระทำ | ใคร | จากสถานะ | ผล |
|---|---|---|---|
| `create` (ที่หน้า SO) | AC / admin | — | SO ต้องอนุมัติแล้ว · บรรทัดต้องอยู่ในหมวด · สินค้าต้องมีสเปค · บรรทัดต้องยังไม่มีเอกสาร ⇒ ได้เลขที่ + Rev.00 draft |
| `submit` | AC / admin | draft, rejected | SO ต้องอนุมัติ · ถ่ายภาพนิ่ง (สเปค + checklist + สินค้า + บรรทัด SO + รูป) ⇒ pending_ae · ล้างรอยตีกลับ |
| `withdraw` | ผู้ยื่น / admin | pending_ae, pending_ae_supervisor | ⇒ draft · ล้างตราประทับ submit/AE |
| `ae_approve` | AE เจ้าของดีลของ SO (`sales_deals.ownerId`) / admin | pending_ae | ⇒ pending_ae_supervisor |
| `sup_approve` | `ae_supervisor` / admin | pending_ae_supervisor | ⇒ approved · Rev ที่ approved ก่อนหน้าเป็น superseded · `currentRevNo` = revNo · เรนเดอร์ `frozenHtml` |
| `reject` | ผู้มีสิทธิ์อนุมัติของขั้นนั้น | pending_ae, pending_ae_supervisor | เหตุผล 10–500 ตัวอักษร ⇒ rejected + `rejectedStage` |
| `revise` | AC / admin | Rev ล่าสุด approved | SO ต้องอนุมัติ · เหตุผลบังคับ ⇒ Rev+1 draft (Rev ที่อนุมัติแล้วยังเป็นฉบับที่ใช้ จนกว่า Rev ใหม่จะอนุมัติ) |
| `void` | AC / admin | เอกสาร active | เหตุผลบังคับ ⇒ document `void` · ทุกการกระทำอื่นปิด |

- ทุกการอนุมัติ/ยื่นต้องเช็คว่า SO ยัง `approved` อยู่ (ถ้าถูกย้อนการอนุมัติ ⇒ ติดด่าน บอกเหตุ)
  - ฐานตรวจซ้ำด้วย trigger ของ Rev: เมื่อ Rev จะเปลี่ยนไปเป็น `pending_ae` `pending_ae_supervisor` หรือ `approved` trigger ล็อกแถวเอกสารและแถว SO แบบ FOR SHARE แล้วตรวจว่าเอกสารยัง active และ SO ยัง approved ถ้าเอกสารถูก void หรือ SO ถูกย้อนการอนุมัติระหว่างคำขอ ฐานจะปฏิเสธ และ API ตอบ 409
- "admin" = `role === 'admin'` เท่านั้น — **ไม่ใช้ `isSuperuser`** เพราะ `ae_supervisor` นับเป็น superuser แล้วจะกดขั้น AE ข้ามเจ้าของดีลได้
- UPDATE ที่เปลี่ยนสถานะต้องมี `.eq('status', เดิม)` และ **เช็คว่าโดนแถวจริง** (`select().maybeSingle()` แล้วไม่ใช่ null) ไม่งั้นตอบ 409 "สถานะเปลี่ยนแล้ว กรุณาโหลดใหม่"

## จังหวะจาก SO (hook ใน `sales-orders/[id]/route.js`)
- **cancel** (ทั้งทางยกเลิกเฉย ๆ และทาง `cancel_sales_order_with_reversal_atomic`) ⇒ void เอกสารทุกใบของ SO นั้น เหตุผล `ใบสั่งขาย <เลข> ถูกยกเลิก`
- **revise** ⇒ บรรทัดใหม่ id = `'SOL-' || md5(<newSoId> || ':' || <oldLineId>)` (ดู RPC 0346/0363) ⇒ ย้าย `salesOrderId/LineId` ไปใบใหม่
  - Rev ล่าสุด approved ⇒ สร้าง Rev+1 draft เหตุผล `ออก Rev. ใบสั่งขาย <เก่า> → <ใหม่>`
  - Rev ล่าสุด pending_* ⇒ ถอยเป็น draft (Rev เดิม)
  - draft / rejected ⇒ คงไว้
- hook ทำงาน **หลัง** RPC ของ SO สำเร็จ · ถ้า hook ล้ม SO ยังสำเร็จ แต่ต้องตอบ `warning` และเขียน audit (ไม่เงียบ)
- เอกสารที่บรรทัด SO หายไป (`salesOrderLineId` เป็น NULL เพราะถูกถอดบรรทัด) โผล่ในการ์ดหน้า SO เป็นแถว "บรรทัดถูกถอด" พร้อมปุ่มยกเลิกเอกสาร
  - ตอน SO ออก Rev เอกสารที่หาบรรทัดคู่ในใบใหม่ไม่เจอ ย้ายไปผูก SO ใบใหม่โดยไม่มีบรรทัด แล้วใช้กติกา Rev ดังนี้ (ตัดสิน 22/09/2569 ตอนแก้ผลรีวิว)
    - Rev ล่าสุด pending_* ⇒ ถอยเป็น draft เหมือนเอกสารใบอื่น เพื่อไม่ให้ค้างอยู่ในคิวผู้อนุมัติ
    - Rev ล่าสุด approved ⇒ **ไม่เปิด Rev+1** เพราะเอกสารที่ไม่มีบรรทัดเดินด่านต่อไม่ได้ ทางออกเดียวคือยกเลิก และ Rev ลบไม่ได้ ถ้าเปิด Rev+1 จะมี Rev ที่ยื่นไม่ได้ค้างในประวัติตลอดไป
    - draft / rejected ⇒ คงไว้
- **ผู้ดูแลระบบบังคับลบ SO** ⇒ void เอกสารที่ยัง active ของ SO นั้นก่อนที่ FK จะปลดลิงก์ เหตุผล `ใบสั่งขาย <เลข> ถูกลบถาวร` และพรีวิวก่อนลบต้องบอกจำนวนเอกสารที่จะถูก void
- โมดัลยืนยันการยกเลิก SO และการออก Rev ของ SO ต้องบอกผลที่เกิดกับเอกสาร FM-SA-04 ของใบนั้น (กฎ approval-confirm-modals)

## ภาพนิ่ง (snapshot) และการตรึงกระดาษ
- ถ่ายตอน `submit` ทุกครั้ง (ยื่นใหม่หลังตีกลับก็ถ่ายใหม่) · ร่างที่ยังไม่ยื่นแสดงสด จากสเปค + SO ปัจจุบัน
- `snapshot = { spec: {ช่องเนื้อหาทุกช่อง, certifications}, items: [...], product: {ทุกช่องที่กระดาษพิมพ์}, order: {orderNumber, quotationNumber, confirmDocNo, confirmDocDate, qty, unit, deliveryDueDate, customerName, dealOwnerId, dealOwnerName, dealOwnerEmail, dealOwnerPhone}, illustrations: [{attachmentId, caption, sortOrder, fileName}] }`
- `sup_approve` ⇒ เรนเดอร์ HTML จากภาพนิ่ง + ชื่อผู้ลงนามทั้งสามขั้น แล้วเก็บลง `frozenHtml` · พิมพ์ Rev ที่อนุมัติแล้วใช้ `frozenHtml` เสมอ
- **รูปห้ามหาย**: ลบรูป `spec_illustration` ที่ Rev ไหนก็ตามที่ไม่ใช่ draft อ้างอยู่ (`illustrationIds`) ⇒ **ปลดระวาง** (`metadata.retiredAt`) แทนการลบไฟล์ · จอสเปคซ่อนรูปที่ปลดระวางแล้ว · กระดาษเก่ายังเปิดรูปได้
  - กันการลบที่แทรกกลางการยื่น: ฝั่งลบประทับปลดระวางก่อน แล้วตรวจการอ้างอิงซ้ำ ไม่มีใครอ้างจริงจึงลบแถวและไฟล์ · ฝั่งยื่นตรวจซ้ำหลังเขียนภาพนิ่งว่ารูปทุกรูปยังอยู่และยังไม่ถูกปลดระวาง ถ้าไม่ครบจะถอย Rev กลับสภาพเดิมแล้วตอบ 409 ให้ยื่นใหม่

## กระดาษ
- หัว: `Document No.` = docNo · `Reversion No.` = Rev ของเอกสาร (2 หลัก) · บรรทัดแบบฟอร์ม `FM-SA-04: Rev. No.00` = เวอร์ชันแบบฟอร์ม (คนละตัว)
- ลายเซ็น: Account Coordinator = ผู้ยื่น (`submittedByName`/วันที่) · Account Executive = `aeApprovedByName` · Account Executive Supervisor = `supApprovedByName` · Customer = ว่าง
- ลายน้ำ: draft/pending_*/rejected = "ฉบับร่าง" · superseded = "ถูกแทนด้วย Rev.XX" · เอกสาร void = "ยกเลิก" · approved = ไม่มี
- พิมพ์จากหน้าสเปคของสินค้า (ยังไม่มีเอกสาร) = ลายน้ำ "ตัวอย่าง" · Document No. และ Reversion No. เป็นขีด
- ชื่อบริษัท: ใช้ `getPublishedCompanyProfile` (ไม่ใช่ตาราง `company_profile` ที่ไม่มีจริง) แล้วแม็ป `legalNameTh/En → nameTh/En` แบบ `pdrDocument.js`
- Contact for Sales = AE เจ้าของดีล (จากภาพนิ่ง) ไม่ใช่คนเปิดดู
- วันที่บนกระดาษเป็น พ.ศ. ทั้งใบ

## จอ
- **หน้าสเปคของสินค้า** `/database/products/[id]/spec`: ใช้แก้สเปค (ช่องเนื้อหา · ใบรับรอง · checklist · รูป) มีปุ่มบันทึก · ไม่มี Rev ไม่มีราง
  มีรายการเอกสารที่ออกจากสเปคนี้ (เลขที่ · Rev · สถานะ · SO) · ลบสเปคได้เมื่อยังไม่มีเอกสาร · มีปุ่มพิมพ์ตัวอย่าง
- **การ์ดบนหน้า SO** (`SalesOrderFollowUpDocs`): แต่ละบรรทัดขึ้นสถานะ ไม่ต้องใช้ / ยังไม่มีสเปค (ลิงก์ไปสร้าง) / ยังไม่ออก (AC: ปุ่ม "ออกเอกสาร" + โมดัลยืนยันว่าจะได้เลขที่ที่คืนไม่ได้) / ออกแล้ว (เลขที่ · Rev · สถานะ · ลิงก์)
- **หน้าเอกสาร** `/sales-planning/spec-documents/[id]`: หัวเลขที่ + Rev · ราง 3 ขั้น (AC ยื่น → AE อนุมัติ → AE Sup อนุมัติ) · ปุ่มตามสิทธิ์ ·
  โมดัลยืนยันที่บอกผลลัพธ์ทุกการอนุมัติ · โมดัลตีกลับ/แก้ไข/ยกเลิกที่มีช่องเหตุผล · ประวัติ Rev · พิมพ์ได้ทุก Rev · ลิงก์ "แก้สเปคที่หน้าสินค้า" ตอนเป็นร่าง
- ปุ่ม: ไม่มีสิทธิ์ = ไม่แสดงปุ่ม · ติดด่าน = แสดงปุ่มแล้วบอกเหตุตอนกด (ตัวตัดสินกลางคืน `{ visible, reason }`)

## แจ้งเตือน (`notifyUsers`)
ยื่น ⇒ AE เจ้าของดีล · AE อนุมัติ ⇒ `ae_supervisor` ทุกคนที่ active · ตีกลับ ⇒ ผู้ยื่น · อนุมัติขั้นสุดท้าย ⇒ ผู้ยื่น + AE เจ้าของดีล
entityType `product_spec_document` ต้องลงทะเบียนใน `notificationTargets.js` (ป้าย + ลิงก์)
