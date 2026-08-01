# แผนงานต่อจาก PR #739 — QT/SO Workflow, ปุ่มเอกสาร, และ Template ภาษี

เขียนวันที่ 2026-07-26 · ที่มา: รีวิว [PR #739](https://github.com/SittipongSS/ss-system/pull/739) (merged `4febbad1`, commit `144a2976`) เทียบกับ *แผนแม่บทรวม QT / SO / เอกสารภาษี / Document Control / Notification*

เอกสารนี้ **self-contained** — อ่านจบแล้วลงมือได้เลยโดยไม่ต้องย้อนอ่าน session เดิม

---

## 0. สถานะปัจจุบัน

PR #739 ยัด **PR 1 + PR 2 + PR 3** ของแผนแม่บทมารวมเป็นก้อนเดียว (26 ไฟล์ +1493/−163) เนื้องานเสร็จไปมาก แต่มี 6 จุดขัดแผนตรง ๆ และมีบั๊กที่ผู้ใช้เจอได้จริง

| เฟสตามแผนแม่บท | สถานะจริง |
|---|---|
| 0 เตรียม + เอกสารออกแบบ | ⚠️ migration number ไม่ชน แต่ไม่มีไฟล์ `.md` ใน PR เลย |
| 1 Predicates + Tests | ⚠️ สร้างครบ 6 ตัว เทสต์ผ่าน — **UI ไม่ได้เรียกใช้** |
| 2 Migration + Atomic RPC | ⚠️ SO ครบ · **QT `revise_quotation_atomic` ไม่ได้ทำ** |
| 3 API Guard | ✅ เป็นหลัก · เหลือโค้ดตาย + บั๊ก grandfather |
| 4 QT/SO Document Control | ✅ ครบ (แต่ปุ่มไม่สอดคล้องกัน — ดู PR-B) |
| 5 Notification | ⚠️ ขาดคิว + ไม่แตะ StatusNotice |
| 6 มาตรฐานเอกสารภาษี | ❌ hard-code รหัส Form + ข้ามขั้น "ตั้งค่าฉบับแรก" |
| 7 Template ภาษี | ❌ issued snapshot ไม่ได้ทำ + ไม่ reuse เครื่องยนต์กลาง |
| 8 Tax Filing Doc Control | ⚠️ ย้ายปุ่มแล้ว · ขาดด่าน disabled |
| 9 Rollout หน้าอื่น | — ยังไม่ถึง |

**Acceptance checklist ของแผนแม่บทที่ยังไม่ผ่าน: "ไม่มีรหัส Form ภาษี hard-code"**

---

## งานที่ 0 — รัน migration (บล็อกทุกอย่าง ทำก่อน)

โค้ดอยู่บน `main` แล้ว **ถ้า prod deploy โดยยังไม่รัน 0161 = หน้ารายละเอียด SO ทุกใบ 500** เพราะ `loadOrder` query คอลัมน์ `baseNumber` ที่ยังไม่มี (ไม่ใช่แค่ปุ่มใหม่หาย)

### ก่อนรัน — เช็คเลขชนก่อน

0161 สร้าง `UNIQUE (baseNumber, revisionNo)` ถ้ามีทั้ง `SO-26070001` และ `SO-26070001-0` อยู่คู่กัน ทั้งคู่จะได้ baseNumber เดียวกัน + revisionNo=0 แล้ว migration ล้มกลางคัน (Supabase SQL Editor รันทั้งสคริปต์เป็น transaction เดียว → rollback ทั้งก้อน ไม่ค้างครึ่ง)

```sql
SELECT
  CASE
    WHEN "orderNumber" ~ '[-._/]0$' THEN regexp_replace("orderNumber", '[-._/]0$', '')
    ELSE "orderNumber"
  END AS base,
  count(*) AS rows,
  array_agg("orderNumber") AS numbers
FROM public.sales_orders
GROUP BY 1
HAVING count(*) > 1;
```

ได้ 0 แถว → รันได้เลย

### ลำดับ

1. `webapp/supabase/migrations/0161_qt_so_withdraw_revision_workflow.sql`
2. `webapp/supabase/migrations/0162_excise_tax_notice_document_standard.sql`

### หลังรัน — ยืนยัน

```sql
SELECT count(*) FROM information_schema.columns
WHERE table_name='sales_orders' AND column_name IN ('baseNumber','revisionNo','supersededById');   -- ต้องได้ 3

SELECT proname FROM pg_proc WHERE proname IN
  ('withdraw_quotation_submission_atomic','withdraw_sales_order_submission_atomic','revise_approved_sales_order_atomic');  -- ต้องได้ 3

SELECT count(*) FROM public.orders WHERE "taxNoticeNumber" IS NULL;   -- ต้องได้ 0
```

> หมายเหตุ: `npm run check:schema` ที่เคยบันทึกไว้ **ไม่มีอยู่จริง** ใน package.json มีแต่ `npm run check:migrations` (ตรวจเลขไฟล์ ไม่ได้ตรวจ prod)

---

## PR-A — บั๊กที่ผู้ใช้เจอได้ทันที

### A1 🔴 ใบเสนอราคา grandfather (`approvalStatus = 'not_required'`) ถูกล็อกตาย

ใบเก่าก่อน 2026-07-18 (mig 0114 ตั้งใจไม่ backfill) ตอนนี้ปิดทั้ง 3 ทาง:

| ทาง | จุดที่บล็อก |
|---|---|
| PATCH แก้เนื้อหา | `webapp/src/app/api/sales-planning/quotations/[id]/route.js:132` — บล็อกทุก approvalStatus ที่ไม่ใช่ `not_submitted` (ยกเว้น body มีแค่ `status:'sent'`) |
| ออก Revision | `.../quotations/[id]/revise/route.js:29` — บังคับ `approved` เท่านั้น |
| ยื่นอนุมัติ | `.../quotations/[id]/submit/route.js:39` — ปฏิเสธ `not_required` (ของเดิม) |

คอมเมนต์ที่ `route.js:239` ที่เขียนว่า *"ใบ grandfather ก็ถูกดันเข้าสู่ระบบอนุมัติเมื่อถูกแก้เนื้อหา"* กลายเป็นโค้ดตาย เข้าไม่ถึงแล้ว

**ต้องทำ**
1. เติมแถว `not_required` ลง State Matrix ของแผนแม่บท (ตอนนี้แผนมี 4 สถานะ ไม่ครอบคลุมเคสนี้ = ช่องโหว่ของแผนเอง)
2. เลือกทางออก — แนะนำ **อนุญาต PATCH สำหรับ `not_required`** แล้วให้ `contentChanged` รีเซ็ตเป็น `not_submitted` ตามที่คอมเมนต์เดิมตั้งใจ (ใบเก่าถูกดันเข้าระบบอนุมัติใหม่เมื่อถูกแก้) ทางเลือกรอง = อนุญาตออก Revision
3. เพิ่มเทสต์ครอบ `not_required` ใน `webapp/src/lib/sales/quotationWorkflow.test.mjs`

**ตรวจ:** เปิดใบ QT เก่าที่ `approvalStatus='not_required'` และ `status IN ('draft','sent')` → ต้องแก้ได้หรือออก Revision ได้อย่างน้อยหนึ่งทาง

```sql
SELECT id, "quoteNumber", status, "approvalStatus"
FROM public.quotations WHERE "approvalStatus" = 'not_required' AND status IN ('draft','sent','rejected');
```

### A2 🟠 ด่านกันชนกัน (optimistic lock) เป็น no-op

RPC มีพารามิเตอร์ `p_expected_updated_at` และ error `workflow_stale` ข้อความว่า *"เอกสารถูกเปลี่ยนจากอีกหน้าต่าง กรุณาโหลดใหม่"* แต่ route อ่านแถวเองแล้วส่ง `updatedAt` ของตัวเองกลับเข้าไป:

- `.../quotations/[id]/withdraw/route.js:44` ส่ง `quote.updatedAt` — ค่า `expectedUpdatedAt` ที่หน้าเว็บส่งมาใน body **ถูกทิ้ง**
- `.../sales-orders/[id]/route.js` (withdraw + revise) ส่ง `before.updatedAt` และหน้า SO ไม่ได้ส่ง expectedUpdatedAt มาด้วยซ้ำ

ด่านนี้จับได้แค่ race ระดับมิลลิวินาทีระหว่าง server อ่านกับเรียก RPC — จับ "แท็บค้าง" ไม่ได้เลย ซึ่งคือเคสที่ข้อความบอกว่ากัน

**ต้องทำ:** รับ `expectedUpdatedAt` จาก body ส่งเข้า RPC (ถ้าไม่ส่งมา → 400) + หน้า SO ต้องส่งด้วย + เทสต์เคสแท็บค้าง

### A3 🟡 Error ดิบหลุดหน้าเว็บ

`webapp/src/lib/sales/documentWorkflowErrors.js:22` — error ที่ไม่รู้จักคืน status 500 พร้อมข้อความ Postgres ดิบ

**ต้องทำ:** ข้อความ generic + log ตัวจริงฝั่ง server

### A4 🟡 ลบ SO ที่ผูก revision chain → error FK ดิบ

`supersededById` / `revisedFromId` เป็น FK `ON DELETE RESTRICT` — ลบร่าง Revision หรือบังคับลบใบต้นทางจะชน FK แล้วโยน error Postgres ออกหน้าเว็บ

**ต้องทำ:** แปลงเป็นข้อความแนะนำ (ทำแบบเดียวกับ guard หลักฐานลายเซ็นใน DELETE route ของ QT)

---

## PR-B — ปุ่ม QT/SO ซ้ำซ้อนและไม่สอดคล้อง

ไฟล์: `webapp/src/app/sales-planning/quotations/[id]/page.js`, `webapp/src/app/sales-planning/sales-orders/[id]/page.js`, `webapp/src/components/ui/ActionButtons.js`

### B1 🔴 ปุ่มเดียวกัน คนละสี คนละไอคอน ข้ามสองหน้า

`KINDS` ใน `ActionButtons.js:14` มี 16 ชนิด **ไม่มี `copy`, `revise`, `withdraw`** แต่ทั้งสองหน้าส่ง kind เหล่านี้เข้าไปแล้วตกลง fallback `btn-secondary` เงียบ ๆ

| ปุ่ม | QT | SO | ผลที่เห็นจริง |
|---|---|---|---|
| ถอนการยื่น | `kind:"reject"` | `kind:"restore"` | **QT แดง (btn-danger) / SO เทา** |
| ออก Revision | `kind:"copy"` ไม่ส่ง icon | `kind:"revise"` + `icon:Copy` | **QT ไม่มีไอคอน / SO มี** |

**ต้องทำ:** เพิ่ม `withdraw` (btn-secondary + Undo2) และ `revise` (btn-secondary + Copy) ลง `KINDS` แล้วให้ทั้งสองหน้าใช้ตัวเดียวกัน · แก้จุดเดียวหายไป 2 ข้อ

### B2 🟠 โหมดแก้ไข: QT ใช้ URL / SO ใช้ state

- QT: `editMode = searchParams.get("edit") === "1"` (`page.js:50`) ปุ่มแก้ไขเป็น `href`
- SO: `useState(false)` ปุ่มแก้ไขเป็น `onClick`

ผลต่าง: QT กด Back เบราว์เซอร์ = ออกจากโหมดแก้ / SO กด Back = ออกจากหน้าทั้งที่แก้ค้าง

**ต้องทำ:** รวมเป็นกลไกเดียว — แนะนำ state แบบ SO (ไม่ทิ้ง URL ค้าง)

### B3 🟠 QT ใช้ ConfirmDialog ตอนบันทึก (ผิดประเภทตามแผนเฟส 5)

- QT "บันทึก" → เปิด `ConfirmDialog` (`page.js:487`)
- SO "บันทึกร่าง" → บันทึกทันที

แผนเฟส 5 กำหนดว่า Dialog สงวนไว้ให้ **ถอน / ถอด / ตีกลับ / ลบ** เท่านั้น ส่วนบันทึกใช้ **Save Status**

**ต้องทำ:** ถอด ConfirmDialog ออกจาก QT + ใช้ label ตรงกัน ("บันทึกร่าง" ทั้งคู่)

### B4 🟠 SO: reviewer เห็น "ถอนการยื่น" คู่กับ "ตีกลับให้แก้ไข"

ตอน `pending_approval` + เป็น reviewer เห็นพร้อมกัน 3 ปุ่ม: `[อนุมัติและนับ Actual]` `[ถอนการยื่น]` `[ตีกลับให้แก้ไข]` — สองปุ่มหลังบังคับเหตุผล ≥10 ตัวอักษรเหมือนกัน ปลายทางคือ "กลับไปให้ผู้จัดทำแก้" เหมือนกัน ต่างแค่ status `draft` vs `rejected`

**ต้องทำ:** ตัดสินใจ — ซ่อน "ถอนการยื่น" จาก reviewer (เหลือให้ผู้ยื่น) หรือใส่ hint อธิบายความต่าง

### B5 🟠 QT อนุมัติแล้ว = ไม่มีปุ่มหลักเลย

ใบ approved + status draft: `primaryAction` ตกเป็น `null` ทั้ง 3 ชั้น เหลือ secondary 5 ปุ่ม (ออก Revision / ส่งให้ลูกค้า / Won / ออกเอกสาร / ดาวน์โหลด PDF) ขั้นถัดไปที่ควรทำจมอยู่ในแถว outline

**ต้องทำ:** ยก "ส่งให้ลูกค้า" เป็น primary เมื่อ approved + draft

พ่วง: "ส่งให้ลูกค้า" (`page.js:541`) กับ "Won" (`page.js:548`) โผล่พร้อมกัน → ปิด Won ได้โดยไม่เคยส่งใบ (ของเดิม ไม่ใช่ #739 ทำ แต่ตอนนี้อยู่ติดกันเลยเห็นชัด) — ตัดสินใจว่าจะกันหรือปล่อย

### B6 🟡 QT "ดาวน์โหลด PDF" ลืมใส่ `!editMode`

`page.js:566` เป็นปุ่มเดียวในลิสต์ที่ `visible` ไม่มี `&& !editMode` → เข้าโหมดแก้ไขแล้วปุ่มอื่นหายหมด เหลือปุ่มนี้ลอยอยู่

### B7 🟡 SO "บังคับลบพร้อมหลักฐาน" โผล่บน SO ที่อนุมัติ/revised

`visible: role === "admin" && !canHardDeleteSalesOrder(order)` เป็นเงื่อนไข **ตรงข้าม** ของลบปกติ ไม่จำกัดสถานะ → admin เห็นปุ่มนี้บน SO ทุกใบที่ไม่ใช่ร่างสะอาด รวม `approved` และ `revised` (ซึ่งชน FK RESTRICT — ดู A4) และอยู่แถว danger คู่กับ "ยกเลิก SO" = ปุ่มทำลาย 2 ปุ่มติดกัน

**ต้องทำ:** จำกัดสถานะที่ปุ่มบังคับลบโผล่

### B8 🟡 SO action `restore` ไม่ได้ตั้ง label

ใช้ default "คืนเป็นฉบับร่าง" ซึ่งความหมายชนกับ "ถอนการยื่น" ที่ยืม `kind:"restore"` เหมือนกัน (แก้พร้อม B1)

---

## PR-C — Template เอกสารภาษี: แก้เฉพาะจุด

ไฟล์: `webapp/src/lib/tax/billPrint.js` (271 บรรทัด)

### ข้อเท็จจริงพื้นฐาน: **เอกสารภาษีไม่ได้ใช้ template เดียวกับ QT/SO**

```
QT  ──┐
SO  ──┼──► quotationMasterDocument.js (456) + quotationMasterTemplate.js (842)
      │      ใช้โดย issuedQuotationSnapshot / quotePrint / salesOrderPrint / settings preview
ภาษี ─────► billPrint.js (271)  ◄── ไม่มีใครอื่นใช้
```

`salesOrderPrint.js` import `quotationMasterDocument` (SO ใช้ template เดียวกับ QT จริง) แต่ `billPrint.js` ไม่ได้ import เลย

| ชั้น | QT/SO | ภาษี | ตรงกัน |
|---|---|---|---|
| โลโก้ | `SYSTEM_DOCUMENT_LOGO_URL` | เดียวกัน | ✅ |
| Company block | `resolveCompanyBlock` | เดียวกัน | ✅ |
| อ่านมาตรฐาน | `resolveDocumentForm` | เดียวกัน | ✅ |
| CSS + โครงหน้า | `DOCUMENT_CSS` | เขียนเองใหม่ ~100 บรรทัด | ❌ |
| ธีมสี accent | `DOCUMENT_ACCENT_THEMES` (6 คีย์ + watermark) | `NOTICE_ACCENTS` ก๊อป 3 คีย์ | ❌ |
| ฟอนต์ | ฝัง base64 self-contained ~113KB | `<link>` Google Fonts CDN | ❌ |
| แบ่งหน้า | เครื่องยนต์ V4 | `paginateBillLines` ของตัวเอง | ❌ |
| ตรึงฉบับ | `issued_documents` | ไม่มี | ❌ |

ขัดแผนเฟส 7 ที่เขียนว่า *"Reuse document shell/header/company block/pagination"* — ที่ทำจริงกลับด้าน: reuse business fields (ยังพิมพ์ "เลขที่ใบเสนอราคา" บนใบภาษี) แต่ไม่ reuse shell

### C1 🔴 บั๊กแบ่งหน้า — หน้าแรก/หน้ากลางเหลือแถวเดียวได้

`billPrint.js:38` `paginateBillLines` (ของเดิม #739 ไม่ได้แตะ) รันจริง:

```
 9 รายการ -> 2 หน้า: [1, 8]      ← หน้าแรกมีบรรทัดเดียว
13 รายการ -> 2 หน้า: [5, 8]
20 รายการ -> 2 หน้า: [12, 8]     ← เคสเดียวที่สวย = เคสที่เทสต์ใช้
21 รายการ -> 3 หน้า: [12, 1, 8]  ← หน้ากลางมีบรรทัดเดียว
29 รายการ -> 3 หน้า: [12, 9, 8]
```

เจตนาน่าจะเป็น "กันแถวไว้ 8 แถวให้หน้าสุดท้ายมีที่วางยอดรวม+ลายเซ็น" แต่ `take = min(12, remaining - 8)` ทำให้เศษไปกองที่หน้าแรกแทนหน้าสุดท้าย

**ต้องทำ:** เติมหน้าแรกให้เต็ม 12 ก่อน เศษไปหน้าสุดท้าย + เพิ่มเทสต์เคส 9 / 13 / 21 ใน `webapp/src/lib/printPagination.test.mjs`

### C2 🔴 ลายเซ็นยังเป็นเส้นว่างให้เซ็นมือ

```html
<div class="sign"><div class="sig-space"></div><div class="line"></div>
  <div class="lbl">ผู้จัดทำ</div>
  <div class="date">วันที่ ........./........./.........</div></div>
```

QT/SO ผ่านระบบ signature evidence ตรึงลายเซ็น+วันที่ดิจิทัลตั้งแต่ Phase 5B แล้ว แต่เอกสารภาษีที่เพิ่งประกาศเป็น controlled document ยังเป็นช่องเซ็นมือ

**ต้องทำ:** ตัดสินใจร่วมกับเจ้าของงาน — ถ้าใบนี้ต้องมีลายเซ็นระบบ ต้องต่อ signature evidence เข้ามา (งานใหญ่ อาจย้ายไป PR-F พร้อม issued snapshot)

### C3 🟠 ปี พ.ศ. ปนกับ ค.ศ. ในเอกสารใบเดียวกัน

- หัวมุมขวา: `FM-TAX-01: Rev. No.00. 26/07/2569` — **พ.ศ.** (จาก `documentBrand.js:40` และช่อง effectiveDate ในหน้าตั้งค่า)
- ตารางหัวใบ "วันที่เอกสาร" / "กำหนดส่งมอบ": `fmtDate` คืน `DD/MM/YYYY` **ค.ศ.** (`billPrint.js:35` มีคอมเมนต์กำกับว่าตั้งใจ)

**ต้องทำ:** ตัดสินใจมาตรฐานปีของเอกสารทั้งระบบ แล้วทำให้ตรงกันในใบเดียว (เรื่องนี้ค้างมาตั้งแต่การตรวจ component กลาง 2026-07-26)

### C4 🟠 `NOTICE_ACCENTS` เป็นสำเนาที่เทสต์ไม่ครอบ

`billPrint.js:19` ก๊อป hex 3 ชุดจาก `DOCUMENT_ACCENT_THEMES` (`quotationMasterDocument.js:409`) — ค่าตรงกันเป๊ะวันนี้ (`#ad5d43` / `#1e6091` / `#b45309`) จึงยังไม่เห็นอาการ แต่เทสต์ `documentStandards.test.mjs:132` ที่คุมว่า "ทุก accent key ต้องมีธีมในเอกสาร" **เช็คแค่ฝั่ง QT/SO** → เพิ่มสีที่ 4 เมื่อไหร่ เทสต์ผ่านฉลุยแต่เอกสารภาษีตกไป amber เงียบ ๆ

**ต้องทำ:** import `DOCUMENT_ACCENT_THEMES` มาใช้ตรง ๆ ลบ `NOTICE_ACCENTS` ทิ้ง

### C5 🟠 ฟอนต์คนละทาง

QT/SO ฝังฟอนต์ base64 โดยเจตนา (`quotationDocumentFonts.js` คอมเมนต์ว่า *"ให้ใบพิมพ์/ฉบับตรึงแสดงผลตรงกับแอปทุกที่ แม้ออฟไลน์/ไม่มี CDN"*) ส่วนใบภาษียิง `<link>` ไป fonts.googleapis.com → เน็ตช้า/บล็อก CDN = ฟอนต์ fallback ตัวเลขเรียงคนละความกว้าง

**ต้องทำ:** ใช้ `DOCUMENT_FONT_FACE_CSS` แทน `<link>`

### C6 🟡 อื่น ๆ

- **ไม่มีเลข SO บนเอกสาร** — filing เกิดจาก SO แต่หัวใบโชว์แค่ "เลขที่ใบเสนอราคา" + "เลขที่ใบสั่งซื้อ (PO)" ตอนนี้ SO มี revision chain แล้วสอบย้อนไม่ได้ว่าอิง SO ฉบับไหน
- **VAT 7% hard-code** `const VAT_RATE = 0.07`
- **ชื่อ API ยังเป็น "bill" ทั้งไฟล์** — `billPrint.js`, `buildBillPrintHTML`, `openBillPrintWindow`, `paginateBillLines` (ข้อความที่ผู้ใช้เห็นเปลี่ยนครบแล้ว มีเทสต์ `assert.doesNotMatch(/ใบวางบิล/)` คุม)
- **title window ระหว่างโหลด** hard-code `"ใบแจ้งชำระภาษี"` (`billPrint.js:259`) ไม่ได้ใช้ `titleTh` จากมาตรฐาน
- **หัวเอกสารคนละสัดส่วน** — QT/SO โลโก้ 40mm ข้อมูลบริษัทใต้โลโก้ · billPrint `height:46px` ข้อมูลบริษัทอยู่ข้าง ๆ

---

## PR-D — หนี้จากแผนแม่บทเฟส 1–2

### D1 🔴 Predicate สร้างแล้วทิ้ง — ยังมี 2 แหล่งความจริง

แผนเฟส 0 ข้อ 5: *"ระบุ permission predicate เป็นแหล่งความจริงเดียว"* แต่หน้าเว็บทั้งสองหน้า **ไม่ import `quotationWorkflow` / predicate ใหม่เลย** เขียนตรรกะซ้ำ inline:

```js
// QT page
canEditDocument      = canEditCap && EDITABLE.has(status) && approvalStatus === "not_submitted"
canWithdrawSubmission = awaitingApproval && (approvalRequestedBy === meId || canApprove)
canReviseDocument    = canEditCap && approvalStatus === "approved" && EDITABLE.has(status)
// SO page
canEditDocument = canEdit && ["draft","rejected"].includes(status)
canWithdraw     = status === "pending_approval" && (submittedBy === meId || reviewer)
canRevise       = status === "approved" && reviewer
```

API ใช้ predicate · UI ใช้ตรรกะคู่ขนาน · เทสต์ทดสอบแค่ฝั่ง predicate → เพี้ยนแล้วเทสต์ไม่จับ

**ต้องทำ:** ให้ทั้งสองหน้าเรียก `canEditQuotationContent` / `canReviseQuotation` / `canWithdrawQuotationSubmission` / `canEditSalesOrderContent` / `canRevokeAndReviseSalesOrder` / `canWithdrawSalesOrderSubmission` จาก `webapp/src/lib/sales/`

### D2 🟠 `revise_quotation_atomic` ไม่ได้ทำ

แผนเฟส 2 สั่ง *"ย้าย Revision QT ปัจจุบันเข้า transaction เดียว เพื่อไม่ให้เกิดใบใหม่แต่ใบเก่ายัง active"* — 0161 สร้าง 3 RPC ไม่มีตัวนี้

`.../quotations/[id]/revise/route.js:98` ยังเป็น 3 round-trip (insert ใบใหม่ → insert lines → update ใบเดิมเป็น `revised`) + ลบชดเชยเอง คอมเมนต์ในโค้ดยอมรับว่า *"ไม่มี transaction ร่วมข้าม request"* → process ตายกลางทาง = เหลือ 2 ใบ active เลขฐานเดียวกัน ซึ่งคือเคสที่แผนตั้งใจปิด · ฝั่ง SO ได้ atomic ครบแล้ว คู่แฝดยังไม่เท่ากัน

**ต้องทำ:** migration ใหม่สร้าง `revise_quotation_atomic` แล้วให้ route เรียกแทน

### D3 🟡 โค้ดตายค้างใน QT PATCH

บล็อกรีเซ็ต approval ตอน `contentChanged` (`route.js:245`) ยังอยู่ครบ กลายเป็น dead code เพราะด่านใหม่บล็อกก่อนถึง — แผนบอกให้ "ยกเลิกพฤติกรรม" ควรลบทิ้ง (ระวัง: ถ้าเลือกทางออก A1 แบบอนุญาต PATCH ให้ `not_required` บล็อกนี้จะกลับมามีชีวิต — ทำ A1 ก่อน แล้วค่อยตัดสิน D3)

---

## PR-E — เฟส 6: ถอน hard-code รหัส Form + Empty State

### E1 🔴 ละเมิด acceptance "ไม่มีรหัส Form ภาษี hard-code"

แผนเขียนไว้ 3 ที่ว่าห้ามเดารหัส ISO และต้องให้ Admin กด "ตั้งค่าฉบับแรก" เอง แต่:

- `webapp/supabase/migrations/0162_...sql:23` ใส่ `FM-TAX-01`, Rev `00`, มีผล `2026-07-26` แล้ว **publish Version 1 ให้เลย** (`publishedById = 'migration-0162'`)
- `webapp/src/lib/documentBrand.js:37` hard-code ชุดเดียวกันซ้ำอีกรอบเป็น fallback

ผลคือขั้นตอน "ตั้งค่าฉบับแรก" 8 ขั้นที่แผนวางไว้ **ไม่มีทางเกิด** และรหัสที่นักพัฒนาเดากลายเป็นรหัสจริงบนเอกสารที่ออกลูกค้า

**ต้องทำ**
1. ยืนยันกับเจ้าของงานว่า `FM-TAX-01` Rev.00 คือรหัสจริงหรือไม่ — ถ้าใช่ ปิดประเด็นแล้วบันทึกมติ ถ้าไม่ใช่ ต้อง migration แก้ + reissue เอกสารที่ออกไปแล้ว
2. ถอด fallback ใน `documentBrand.js` ออก แล้วให้ `resolveDocumentForm` คืน null เมื่อไม่มีมาตรฐาน
3. ทำ Empty State + ปุ่ม "ตั้งค่าฉบับแรก" ในหน้า `settings/document-standards`

### E2 🟠 ปุ่มออกใบแจ้งชำระไม่เคย disabled

เฟส 8 กำหนด: *"เมื่อยังไม่มีมาตรฐานเผยแพร่ → ปุ่มออกใบแจ้งชำระ disabled + แสดงเหตุผลสั้น + Admin มีลิงก์ไปหน้าตั้งค่า + ไม่ fallback ไปเอกสาร uncontrolled"*

ของจริง `billPrint.js:52` `order.taxNoticeStandardSnapshot || activeStandard` → ไม่มีมาตรฐานก็ตกไป `DOCUMENT_FORMS` hard-code = fallback ไป uncontrolled พอดี และปุ่มพิมพ์ใน `webapp/src/app/tax/filings/[id]/page.js` ไม่เคย disabled

### E3 🟡 ชื่อ key ไม่ตรงแผน

แผนกำหนด `exciseTaxPaymentNotice` · implement เป็น `exciseTaxNotice` (ลงฐานแล้ว แก้ทีหลังแพง) · สถานะ Archived ที่แผนระบุยังไม่มี (ระบบมี draft/published/discard)

---

## PR-F — เฟส 7: Issued snapshot ของเอกสารภาษี

### F1 🔴 ไม่ได้ทำเลย

แผนสั่งขยาย `issued_documents` รับ `documentType = excise_tax_payment_notice` + ตรึง resolved payload + ตรึง HTML/PDF + fingerprint + reprint จาก snapshot

ของจริง `webapp/supabase/migrations/0148_issued_sales_order_snapshot.sql:24` ยัง `CHECK ("documentType" IN ('quotation','sales_order'))` — 0162 ไม่แตะ

ที่ทำจริงคือเก็บ `taxNoticeStandardSnapshot` (ตรึงแค่ *มาตรฐาน*) แล้ว render สดทุกครั้ง → **ยอดเงิน/ชื่อลูกค้า/ที่อยู่ เปลี่ยนหลังพิมพ์ = พิมพ์ซ้ำได้เอกสารคนละใบ** ซึ่งคือปัญหาที่ QT/SO แก้ไปแล้วตั้งแต่ 0130/0148

> ⚠️ กฎที่เคยเจ็บมาแล้ว (PR #710): **อะไรที่เติมค่าตอน read-time ต้องเติมที่ capture ฉบับตรึงด้วย** — เลขภาษี/ผู้ติดต่อเคยหายบนเอกสารที่ออกจริงเพราะแก้แค่ฝั่ง GET

### F2 🟠 ควรยกเข้าเครื่องยนต์กลางพร้อมกัน

ทำ `buildExciseNoticeModel()` แล้วส่งเข้า `renderQuotationMasterDocumentHTML` เหมือนที่ `salesOrderPrint.js` ทำกับ SO · ได้ฟอนต์ฝัง + accent theme + pagination V4 + watermark ฟรี และปิด C1/C4/C5 ไปในตัว

อุปสรรค: เครื่องยนต์กลางผูกกับ model ของ QT (ตาราง 5 คอลัมน์ของภาษีไม่ตรงกับ QT line table) ต้องแยก slot ตารางออกมาก่อน

**หมายเหตุลำดับ:** ถ้าทำ PR-F อยู่แล้ว งาน C1/C4/C5 จะถูกกลืนหายไป — แต่ PR-F เป็นงานใหญ่ ถ้ายังไม่พร้อมให้ทำ PR-C ก่อนเพื่อลดความเสี่ยงเฉพาะหน้า

---

## PR-G — เฟส 5: Notification ที่ยังขาด

ทำครบแล้ว: 4 tone tokens, warning variant, pause hover/focus, `prefers-reduced-motion`, mobile 52px, ลบ inline style + CSS ซ้ำใน `globals.css`

ขาด:
- **ข้อ 6 "รองรับคิวโดยจำกัดจำนวน"** — ยังเป็น `useState(null)` ตัวเดียว toast ใหม่ทับตัวเก่าหาย
- **StatusNotice ไม่ถูกแตะเลย** ทั้งที่แผนหัวเฟสเขียนว่า "ปรับ Toast **และ StatusNotice** ให้เป็นระบบเดียวกัน"
- **ข้อ 10 "ไม่ให้ Toast บัง Document Control"** — toast fix ที่ `bottom:24px` กลางจอ ไม่มีกลไกหลบ

---

## ลำดับที่แนะนำ

| ลำดับ | งาน | เหตุผล |
|---|---|---|
| 1 | **งานที่ 0** รัน migration | บล็อกทุกอย่าง · ถ้า deploy แล้วยังไม่รัน = SO พังอยู่ตอนนี้ |
| 2 | **A1** grandfather | บั๊กที่ผู้ใช้เจอได้วันนี้ |
| 3 | **B1 + B6 + C1** | แก้จุดเดียวได้ผลมาก ไม่ชนกัน ทำรวบรอบเดียวได้ |
| 4 | **A2 + A3 + A4** | ปิดช่องโหว่ + ข้อความ error |
| 5 | **B2–B5, B7, B8** | ปรับปุ่มให้สอดคล้อง (ต้องตัดสินใจ B4, B5 ก่อน) |
| 6 | **C3 + E1** | ต้องได้มติจากเจ้าของงานก่อนลงมือ |
| 7 | **D1 + D2 + D3** | หนี้ทางเทคนิค ไม่กระทบผู้ใช้ทันที |
| 8 | **PR-F** (กลืน C2/C4/C5, E2) | งานใหญ่สุด ทำทีเดียวจบ |
| 9 | **PR-G** | UX ปลายทาง |

## ประเด็นที่ต้องได้มติจากเจ้าของงานก่อนลงมือ

1. **A1** — ใบ grandfather ควรแก้ได้ หรือควรออก Revision ได้ หรือแช่แข็งไปเลย?
2. **B4** — reviewer ควรเห็น "ถอนการยื่น" ด้วยไหม หรือเหลือแค่ "ตีกลับ"?
3. **B5** — ปิด Won โดยไม่เคยส่งใบให้ลูกค้า ควรกันไหม?
4. **C2** — ใบแจ้งชำระภาษีต้องมีลายเซ็นระบบ (แบบ QT/SO) หรือเซ็นมือพอ?
5. **C3** — เอกสารทั้งระบบใช้ พ.ศ. หรือ ค.ศ.?
6. **E1** — `FM-TAX-01` Rev.00 มีผล 26/07/2569 คือรหัสจริงหรือค่าที่ต้องแก้?

## สิ่งที่ตรวจแล้วถูกต้อง (ไม่ต้องแตะ)

- `sync_sales_order_actual` นับเฉพาะ `status='approved'` → สถานะ `revised` หลุดจาก Actual ถูกต้อง ไม่ double count
- RPC ทั้ง 3 ตัว REVOKE จาก anon/authenticated ครบ ให้เฉพาะ service_role
- `create_sales_order_draft` ยัง raise `sales_order_already_exists` → กฎ 1 QT = 1 SO ยังอยู่แม้ถอด UNIQUE constraint (แต่ด่านระดับ DB หายไปแล้ว)
- `revise_approved_sales_order_atomic` กันครบ: stale / มี revision แล้ว / มีใบยื่นภาษีผูกอยู่ / ไม่มีบรรทัด / คอลัมน์ NOT NULL ครบ
- ลบ `.toast` / `.toast-container` ออกจาก `globals.css` แล้ว ไม่มีใครใช้ค้าง (grep ทั้ง src)
- ตัวนับเลข ET ใน 0162 seed สอดคล้องกับ trigger + unique index กันซ้ำ
- SO Save Draft ไม่แตะ Deal Stage
- ผู้ที่ไม่มีสิทธิ์ยิง API ตรงไม่ผ่าน (guard 2 ชั้น: route + RPC)
- เทสต์ที่ #739 เพิ่ม/แก้ ผ่าน 40/40 · `npm run check:migrations` OK 162 ไฟล์ latest 0162

## หมายเหตุสภาพแวดล้อม

- worktree ที่ไม่มี `node_modules` จะรัน `npm test` เต็มชุดไม่ได้ (`react` / `lucide-react` หาไม่เจอ) — รันเฉพาะไฟล์ lib ได้ด้วย
  `node --import ./scripts/test-loader.mjs --test src/lib/sales/*.test.mjs`
- ไม่มี `.env` ในเครื่อง (มีแต่ `.env.example`) → เปิดหน้าเว็บตรวจ UI ได้ แต่ API พังจริง
- `npm run check:schema` **ไม่มีอยู่จริง** มีแต่ `check:migrations`
- ⚠️ Codex ทำงานคู่ขนานบน `main` — fetch ก่อนแก้หน้ารายละเอียดเสมอ (ตอนเขียนแผนนี้ checkout หลักอยู่บน branch `codex/standardize-product-identity`)
