# API อ่าน SO ให้ระบบอื่นของบริษัท (`/api/ext/v1`)

**สถานะ:** กำลังดำเนินการ · ร่าง 11/11/2026 จากฐาน `origin/main` `41dd0d26` · ลงมือ 17/11/2026 (แบรนช์ `claude/so-external-api` · PR-1)
ตรวจกับโค้ด/ข้อมูลจริงอีกรอบ 17/11 (main `2791bfd1`) — ต่างจากร่างสองจุด: เลข migration = **0438** (0434–0437 ถูกใช้แล้ว)
และบรรทัดต้องส่ง **`packQty`** (ดู "รูปข้อมูล")
**มติ:** เจ้าของตอบทีละข้อในแชต 11/11/2026 (8 ข้อ · ดูตาราง "มติ") · คำถามค้างหมดแล้ว เหลือชื่อทีม/คนดูแลตอนออกคีย์

## ที่มา

เจ้าของอยากเปิดข้อมูล SO ให้ระบบอื่นของบริษัทดึงไปเปิดงานต่อในระบบตัวเอง
(อ่านอย่างเดียว · เครื่องคุยกับเครื่อง ไม่มีคนล็อกอิน)

## ข้อเท็จจริงที่ตรวจก่อนเขียนแผน

- **เส้น SO เดิมเปิดให้คนนอกไม่ได้** — `/api/sales-planning/sales-orders/*` ยืนยันตัวด้วย cookie session
  (`getCurrentUser`) · ตัดขอบเขตตามทีมด้วย `inSalesDocScope` · อ่านด้วย service-role แล้ว `select('*')`
  ส่งทั้งแถวรวมคอลัมน์ภายใน (Actual · เจ้าของดีล · งวดเงิน · metadata)
- `/api/orders` คือใบยื่นสรรพสามิต **ไม่ใช่ SO**
- `proxy.js` ตอบ 401 ให้ทุก `/api` ที่ไม่มี session — ทางเดียวที่เครื่องเข้าได้คือ `bypassesSessionGate()`
  (วันนี้เปิด `/api/cron/` กับ `/api/version` · route ตรวจสิทธิ์เอง · มีเทสต์ใน `proxy.test.mjs`)
- **ยังไม่มีระบบ API key / rate limit / CORS ในโค้ดเลย**
- **`sales_orders."updatedAt"` เชื่อไม่ได้สำหรับซิงก์** — ไม่มี trigger เขียนให้ · โค้ดเขียนเองทีละจุดและมีจุดที่ลืม
  (เช่น `.update({ financeStatus: 'pending' })` ใน `sales-orders/[id]/route.js`) · ฟังก์ชันในฐานหลายสิบตัว UPDATE ใบตรง
  · และ **ห้ามบังคับด้วย trigger** เพราะหลายจุดใช้ `.eq('updatedAt', before.updatedAt)` กันเขียนชน
- **Rev. = แถวใหม่ ไม่ใช่แก้ใบเดิม** (mig 0161/0166) — ใบเดิมกลายเป็น `revised` + `supersededById` ชี้ใบใหม่
  · ใบใหม่ได้ `revisionNo` +1 · `baseNumber` เดิม (เช่น `SO-26070001` → `SO-26070001-0`, `SO-26070001-1`)
- สถานะ SO วันนี้มี 7 ตัว: `draft` · `pending_approval` · `approved` · `rejected` · `cancelled` · `revised` · `approval_revoked`
- `origin` มีสามค่า: `pipeline` (SO ปกติ) · `historical` (SO ย้อนหลัง · mig 0360) · `excise` (SO ค่าสรรพสามิต · รื้อ QT→SO)
- trigger UPDATE เดิมบน `sales_orders` **ผูกคอลัมน์ทุกตัว** (`UPDATE OF status, …` / `OF origin` / `OF "servicePeriodFrom"…`)
  ⇒ คำสั่งที่ SET แค่คอลัมน์ใหม่ไม่ปลุก trigger เดิมสักตัว (ตรวจจาก migration ทุกไฟล์ 11/11)
- **SO ถูกลบจริงได้** — แอดมินลบได้ทุกอย่าง (#1501) และ `"dealId" … ON DELETE CASCADE` ⇒ ลบดีล = SO หาย
  ระบบปลายทางจะไม่มีทางรู้ถ้าไม่ทิ้งร่องรอยไว้
- ไม่มี trigger ตัวไหนบน `sales_orders` เทียบทั้งแถว (`to_jsonb(NEW)` / `NEW IS DISTINCT FROM OLD`)
  ⇒ เพิ่มคอลัมน์ที่ trigger เขียนเองได้โดยไม่ชนด่านเดิม
- ฐาน dev = ฐาน prod ⇒ migration ต้องให้เจ้าของรันใน SQL Editor · ทดสอบกับข้อมูลจริง
- ~~migration ของงานนี้ `0434`~~ — 17/11: 0434–0437 ถูกใช้ไปแล้ว (ยุบโครงการ · คำร้องพัฒนากลิ่น) ⇒ **`0438`**
- 17/11: trigger UPDATE บน `sales_orders` ยังผูกคอลัมน์ทุกตัว (ตรวจทุก migration ถึง 0437) · ข้อเท็จจริงข้างบนยังจริง

## มติ

| # | คำถาม | คำตอบ |
|---|---|---|
| 1 | ใครเรียก | ระบบอื่นของบริษัท (ไม่ใช่ลูกค้า ไม่ใช่พาร์ทเนอร์ภายนอก) |
| 2 | เอาไปทำอะไร | ดึงไปทำงานต่อในระบบตัวเอง ⇒ REST อ่านอย่างเดียว + ดึงเฉพาะที่เปลี่ยน |
| 3 | ช่องข้อมูล | ตามที่เสนอ (ดู "รูปข้อมูล") |
| 4 | ระบบปลายทางคืออะไร | เว็บที่ทีมอื่นของบริษัทเขียนเอง ⇒ ฝั่งนั้นเขียนโค้ดเรียก API เองได้ · **ต้องเรียกจากฝั่งเซิร์ฟเวอร์ของเว็บนั้น** (ดู "ยืนยันตัว") |
| 5 | เก็บประวัติการเรียก | เก็บทุกครั้งเป็นตาราง `api_client_calls` · ล้างแถวเกิน 90 วัน |
| 6 | SO ชนิดไหน | **เฉพาะ SO ที่จะไปผลิตต่อ** = `origin = 'pipeline'` และมีบรรทัด FG หมวดกลุ่ม 01/02 อย่างน้อยหนึ่งบรรทัด · ไม่ส่ง SO ย้อนหลัง/SO ค่าสรรพสามิต (ไม่มีพารามิเตอร์ขอเพิ่ม) |
| 7 | ใบที่ปนหมวด 03/04 | **ส่งทุกบรรทัดของใบ** พร้อม `categoryCode` รายบรรทัด · ปลายทางกรองบรรทัดที่ต้องผลิตเอง · ยอดรวมบรรทัดตรงกับหัวใบ |
| 8 | ส่วนลดรายบรรทัด | ส่ง `discountAmount` รายบรรทัดด้วย ⇒ ปลายทางกระทบ `qty × unitPrice − discountAmount = lineTotal` ได้เอง |

## สัญญากับระบบปลายทาง

### ยืนยันตัว

- header `Authorization: Bearer ssk_<keyId>_<secret>` — หนึ่งคีย์ต่อหนึ่งระบบ
- เรียกจากเซิร์ฟเวอร์เท่านั้น · **ไม่เปิด CORS** (เบราว์เซอร์เรียกตรงไม่ได้ — กันคีย์หลุดหน้าเว็บ)
  · ถ้าเว็บของทีมปลายทางเป็นหน้าเว็บล้วนไม่มีเซิร์ฟเวอร์ ต้องเพิ่มฟังก์ชันฝั่งเซิร์ฟเวอร์หนึ่งตัวไว้ถือคีย์และเรียกแทน
  · คีย์เก็บใน env ของเซิร์ฟเวอร์ฝั่งนั้น ห้าม commit ลงโค้ด ห้ามส่งลงเบราว์เซอร์
- ผิด/ไม่มี/ถูกเพิกถอน ⇒ `401 {"error":"invalid_key","message":"…"}` · คีย์ไม่มี scope ⇒ `403 {"error":"missing_scope"}`

### เส้น

| เส้น | ใช้ทำอะไร |
|---|---|
| `GET /api/ext/v1/sales-orders?after=<changeSeq>&limit=100` | ดึงทุกใบที่เปลี่ยนหลังเลขที่ส่งมา เรียงตาม `changeSeq` · `limit` สูงสุด 100 (ตั้งต้น 100) |
| `GET /api/ext/v1/sales-orders/{orderNumber}` | ใบเดียวพร้อมบรรทัด (ใช้ตรวจทาน/แก้ซิงก์หลุด) |

### ใบที่ส่ง

**ชนิดใบ (มติ 6):** ส่งเฉพาะ SO ที่จะไปผลิตต่อ

- `origin = 'pipeline'` — ไม่ส่ง `historical` (งานจบไปแล้ว) และ `excise` (ใบค่าธรรมเนียม ไม่มีของ)
- มีบรรทัดหมวดกลุ่ม **01 หรือ 02** อย่างน้อยหนึ่งบรรทัด — ใช้ค่าคงที่ `BOM_MAIN_CATEGORIES` (`lib/master/productBom.js`)
  ตัวเดียวกับกติกาส่ง BOM ให้ RD · 03 = ค่าออกแบบ · 04 = รายได้อื่น ไม่มีของให้ผลิต
- หมวดของบรรทัดอ่านจาก `categoryOf(fgCode)` ก่อน แล้วถอยไป `metadata->>categoryCode` (ลำดับเดียวกับ `lib/excise/exciseListStage.js`)
- กลุ่ม 02 รวมหมวดตัวเครื่อง (02-024 เครื่องกดสบู่ · 02-035 เครื่องกระจายกลิ่น) และหมวดบริการ 02-001/02-037 ด้วย — ตรงกับกติกา BOM
- **ข้อยกเว้น Rev.:** ใบ Rev. ใหม่ที่ถอดบรรทัด 01/02 ออกหมดยังส่ง ถ้าใบก่อนหน้า (`revisedFromId`) เคยเข้าเกณฑ์
  — ไม่งั้นปลายทางเห็น `supersededBy` ชี้ใบที่ไม่เคยได้รับ และไม่รู้ว่าต้องหยุดงาน

**บรรทัด (มติ 7):** ใบที่เข้าเกณฑ์ส่ง **ทุกบรรทัด** รวมหมวด 03/04 · บรรทัดที่ต้องผลิต = `categoryCode` ขึ้นต้น `01-` หรือ `02-`
· `categoryCode` เป็น `null` ได้ (บรรทัดกรอกเองรุ่นเก่าที่ไม่มีทั้ง `fgCode` และหมวด) — ปลายทางต้องถือว่า "ไม่รู้หมวด" ไม่ใช่ "ไม่ต้องผลิต"

**สถานะ:** ส่งเฉพาะ 4 สถานะ — ใบที่ยังไม่อนุมัติไม่มีความหมายกับงานปลายทาง:

| status | ความหมายสำหรับปลายทาง |
|---|---|
| `approved` | ใบที่ใช้ทำงาน |
| `approval_revoked` | ถูกถอนอนุมัติ (ขั้นแรกของการออก Rev.) — หยุดงานไว้ก่อน |
| `revised` | ถูกแทนด้วยใบ Rev. ใหม่ — ดู `supersededBy` |
| `cancelled` | ยกเลิก — หยุดงาน |
| `deleted` | ใบถูกลบออกจากระบบ (มาจากตารางร่องรอย · มีแค่ `orderNumber` `baseNumber` `revisionNo` `changeSeq` `changedAt`) · อาจเป็นใบที่ปลายทางไม่เคยได้รับ (ใบไม่มีบรรทัด 01/02 — ฐานตัดสินหมวดตอนลบไม่ได้) ⇒ ข้ามได้ |

**กติกาฝั่งปลายทาง:** ผูกงานด้วย `baseNumber` · ใบที่ใช้ทำงาน = แถว `approved` ที่ `revisionNo` สูงสุดของ `baseNumber` นั้น
· บันทึกทับตาม `orderNumber` (เรียกซ้ำได้ ผลเท่าเดิม)

### รูปข้อมูล

```json
{
  "data": [
    {
      "orderNumber": "SO-26070001-1",
      "baseNumber": "SO-26070001",
      "revisionNo": 1,
      "status": "approved",
      "supersededBy": null,
      "origin": "pipeline",
      "orderDate": "2026-07-03",
      "deliveryDueDate": "2026-08-15",
      "paymentDueDate": "2026-08-31",
      "approvedAt": "2026-07-04T03:12:00Z",
      "cancelledAt": null,
      "customer": { "arCode": "AR-306", "name": "ชื่อตามหัวเอกสาร" },
      "subtotal": 10000,
      "discountAmount": 0,
      "vatAmount": 700,
      "totalAmount": 10700,
      "lines": [
        {
          "fgCode": "FG-…",
          "categoryCode": "02-001",
          "description": "…",
          "qty": 10,
          "packQty": null,
          "unit": "ชิ้น",
          "unitPrice": 1000,
          "discountAmount": 0,
          "lineTotal": 10000
        }
      ],
      "changeSeq": 18234,
      "changedAt": "2026-07-04T03:12:00Z"
    }
  ],
  "nextAfter": 18234,
  "hasMore": false
}
```

แหล่งของแต่ละช่อง: หัวใบจาก `sales_orders` · `customer.name` = `sales_orders."customerName"` (ชื่อที่พิมพ์บนใบ)
· `customer.arCode` จาก `customers."arCode"` · `supersededBy` = `orderNumber` ของแถวที่ `supersededById` ชี้
· บรรทัดจาก `sales_order_lines` (`categoryCode` = `categoryOf(fgCode)` ถอยไป `metadata->>categoryCode` · `unit` จาก mig 0146
· `discountAmount` = คอลัมน์ `"discountAmount"` ของบรรทัด · มติ 8) เรียงตาม `sortOrder`

**กระทบยอดบรรทัด (มติ 8 · ตรวจ prod 17/11):** `lineTotal = qty × (packQty ?? 1) × unitPrice − discountAmount`
· บรรทัด "แพ็ค/เดือน" (หมวด 02-001 · mig 0407) มี `packQty` = จำนวนแพ็ค และ `qty` = จำนวนเดือน · บรรทัดอื่น `packQty` = `null`
· ใบที่เข้าเกณฑ์ 240 ใบ / 459 บรรทัด (36 บรรทัดแพ็ค) ลงตัวทุกบรรทัด และผลรวม `lineTotal` = `subtotal` ทุกใบ
· ⚠️ ไม่ส่ง `packQty` = 10 บรรทัดกระทบยอดไม่ได้ ⇒ เพิ่มช่องนี้ (ไม่ใช่ข้อมูลภายใน — อยู่บนกระดาษ QT/SO อยู่แล้ว)

**ไม่ส่งเด็ดขาด:** `actualAmount` · `notes` · `metadata` · ID/ชื่อคนสร้าง-ยื่น-อนุมัติ-ตีกลับ · `approvalNote`
· `rejectionReason` · `cancelReason` · งวดเงิน/สลิป/ใบกำกับ · ราคาทุน · `id` ภายใน

### วิธีดึงที่แนะนำให้ปลายทาง

1. เก็บ `nextAfter` ล่าสุดไว้ (ครั้งแรกส่ง `after=0`)
2. ทุก 5–15 นาที เรียก `?after=<ที่เก็บไว้>` วนจน `hasMore=false`
3. บันทึกทับตาม `orderNumber` แล้วเก็บ `nextAfter` ใหม่

ไม่ต้องเผื่อเวลาซ้อน — API ไม่ส่งแถวที่เพิ่งเปลี่ยนไม่ถึง 60 วินาที (ดู "ทำไมใช้ `changeSeq`")

### ข้อจำกัดที่ต้องบอกปลายทาง

- แก้รหัส AR/ชื่อลูกค้าที่หน้าลูกค้า ⇒ `changeSeq` ของ SO **ไม่ขยับ** · ถ้าปลายทางต้องตาม ต้องเพิ่มเส้นลูกค้าภายหลัง
- บรรทัด SO แก้ไม่ได้หลังอนุมัติ (เปลี่ยน = Rev.) ⇒ บรรทัดเปลี่ยนเมื่อไรได้แถวใหม่เสมอ

## สิ่งที่สร้าง

### ฐานข้อมูล — `0438_external_api_clients.sql`

1. **`api_clients`** — `id` · `name` · `keyId` (unique · 8 ตัวอักษรที่โชว์ได้) · `keyHash` (sha256 hex ของ secret · ไม่เก็บตัวจริง)
   · `scopes text[]` (วันนี้มีตัวเดียว `so:read`) · `createdAt` · `createdBy` · `revokedAt` · `revokedBy` · `lastUsedAt`
2. **`sales_orders."changeSeq" bigint` + `"changedAt" timestamptz`** — trigger `BEFORE INSERT OR UPDATE` เขียนเองทุกครั้ง
   (`nextval('sales_orders_change_seq')` + `now()`) · **ไม่แตะ `updatedAt`** · ดัชนี `("changeSeq")`
   · ลำดับในไฟล์: เพิ่มคอลัมน์ → backfill แถวเดิมด้วย `row_number() OVER (ORDER BY "updatedAt", id)`
   + `"changedAt" = "updatedAt"` → `setval` sequence ต่อจากเลขสุดท้าย → **สร้าง trigger ทีหลังสุด**
   (สร้างก่อน backfill = trigger แจกเลขทับโดยไม่เรียงตามเวลา)
3. **`sales_orders_deleted` (ตารางร่องรอย)** — trigger `AFTER DELETE` บน `sales_orders` เก็บ `orderNumber` `baseNumber`
   `revisionNo` `status` เดิม `deletedAt` และ `changeSeq` ใหม่จาก sequence เดียวกัน · เก็บเฉพาะใบที่สถานะอยู่ใน 4 ตัวที่ส่งออก
4. **`api_client_calls` (ประวัติการเรียก · มติ 5)** — `id` · `clientId` · `at` · `method` · `path` · `query` (ตัด 500 ตัวอักษร)
   · `status` (HTTP) · `rowCount` · `durationMs` · `ip` · ดัชนี `("clientId", at DESC)` และ `(at)`
   · ขนาดคาดการณ์: ดึงทุก 5 นาที ≈ 290 แถว/วัน ≈ 26,000 แถวต่อ 90 วัน — เล็กมาก
   · คีย์ผิด/ไม่มีคีย์ก็เก็บ (`clientId` = NULL) — ใช้จับคนลองเดาคีย์
5. ทั้งสามตารางใหม่: `ENABLE ROW LEVEL SECURITY` ไม่มี policy + **`REVOKE ALL … FROM anon, authenticated` เขียนชัด**
   (default privileges ของ `supabase_admin` ยังเปิดอยู่ — ดูบันทึก anon RPC 02/09)
6. ท้ายไฟล์: `SELECT` ตรวจผล (นับคอลัมน์/trigger/แถวที่ backfill แล้ว) · รันบล็อกเดียวใน SQL Editor

**ทำไมใช้ `changeSeq` ไม่ใช้เวลา:** data fix ที่ UPDATE หลายร้อยใบในคำสั่งเดียวได้ `now()` เท่ากันทุกแถว
⇒ แบ่งหน้าด้วยเวลาอย่างเดียววนไม่จบ · sequence ได้เลขไม่ซ้ำทุกแถวเสมอ · ส่วนปัญหา "ทรานแซกชันที่ได้เลขก่อนแต่ commit ทีหลัง"
กันด้วยการไม่ส่งแถวที่ `changedAt` ใหม่กว่า 60 วินาที (ทรานแซกชันของระบบนี้จบในไม่กี่วินาที · route ตัดที่ 60 วินาที)

### โค้ด

| ไฟล์ | งาน |
|---|---|
| `src/lib/extApi/auth.js` | แกะ header · หา `keyId` · เทียบ sha256 ด้วย `crypto.timingSafeEqual` · เช็ก `revokedAt` + scope · อัปเดต `lastUsedAt` (ไม่เกินนาทีละครั้ง) |
| `src/lib/extApi/callLog.js` | เขียน `api_client_calls` หนึ่งแถวต่อการเรียก (ทั้งผ่านและไม่ผ่าน) · เขียนพลาด = ไม่ล้มคำตอบ แต่ `console.error` |
| ล้างประวัติ | เพิ่มขั้นใน `api/cron/close-resolved-issues` (cron ตัวเดียวที่รันทุกวัน · ไม่เพิ่ม cron ใหม่ใน `vercel.json`) ลบแถว `at` เก่ากว่า 90 วัน |
| `src/lib/extApi/salesOrderDto.js` | แปลงแถว → รูปข้อมูลด้านบน · **whitelist ช่องที่ส่ง** ที่เดียว |
| `src/lib/extApi/salesOrderFeed.js` | เกณฑ์ใบ (pipeline · 01/02 · ข้อยกเว้น Rev.) · รวม SO + ร่องรอยเรียงตาม `changeSeq` · ตัด 60 วินาที · ใบเดียว |
| `src/lib/extApi/handler.js` | ตัวห่อ route (`extApiGet`): ยืนยันคีย์ · จดประวัติ · ตอบ JSON `no-store` · ไม่เปิด CORS — ทุก route ใต้ `app/api/ext` ต้องผ่าน (ยามในเทสต์) |
| `src/app/api/ext/v1/sales-orders/route.js` | รายการ · `after` · `limit` · ตัด 60 วินาที · รวมแถว `deleted` |
| `src/app/api/ext/v1/sales-orders/[orderNumber]/route.js` | ใบเดียว |
| `src/proxy.js` → `bypassesSessionGate` | เพิ่ม `path.startsWith('/api/ext/v1/')` (มี `/` ปิดท้าย) + คอมเมนต์ว่า route ตรวจคีย์เอง |
| `scripts/issue-api-key.mjs` | ออกคีย์: สุ่ม secret · พิมพ์ครั้งเดียวบนจอ · บันทึกแค่ hash · `--revoke <keyId>` |

ออกคีย์ด้วยสคริปต์ ไม่ใช้ SQL Editor — ผลลัพธ์ใน SQL Editor ค้างในประวัติ query ได้

### เทสต์

- `proxy.test.mjs` — `/api/ext/v1/sales-orders` และ `/api/ext/v1/sales-orders/SO-1` ข้ามด่าน session ·
  `/api/ext` · `/api/ext/` · `/api/extx/v1/…` · `/api/ext/v2/…` · `/api/ext/v10/…` **ต้องไม่ข้าม**
- `extApi/auth.test.mjs` — ไม่มี header · รูปคีย์ผิด · `keyId` ไม่มีจริง · secret ผิด · ถูกเพิกถอน · ไม่มี scope · ผ่าน
- `extApi/salesOrderDto.test.mjs` — ชุดคีย์ที่ออกต้องเท่ากับรายการ whitelist เป๊ะ · ใส่แถวที่มี `actualAmount`/`notes`/`metadata`/`approvedBy`
  แล้วต้องไม่หลุดออกมา
- route — แบ่งหน้าไม่ซ้ำไม่ขาด · ตัดสถานะที่ไม่ส่ง · ตัด `historical`/`excise` · ตัดใบที่ไม่มีบรรทัด 01/02 · ใบไม่มี `fgCode` แต่มี `metadata.categoryCode` ยังเข้า
  · ใบ Rev. ที่ถอด 01/02 หมดยังส่งเมื่อใบก่อนหน้าเข้าเกณฑ์ · ตัดแถวใหม่กว่า 60 วินาที · แถว `deleted`
- ด่าน CI เดิม: `check:columns` (select ทุกตัวต้องมีคอลัมน์จริง) · `check:rowcap` (ทุก query มี `.limit`) · `check:migrations`

## นอกโค้ด

- **Rate limit:** ตั้งกฎใน Vercel Firewall ที่ path `/api/ext/` (เสนอ 60 ครั้ง/นาที ต่อ IP)
  — ต้องเช็กในแดชบอร์ดก่อนว่าแพ็กเกจ Pro เปิดกฎ rate limit ได้
- **คู่มือให้ทีมระบบปลายทาง:** ตัดหัวข้อ "สัญญากับระบบปลายทาง" ด้านบนส่งให้ได้เลย

## งวดงาน

| งวด | อะไร | ก่อน merge |
|---|---|---|
| PR-1 | migration 0438 + lib + 2 route + proxy + สคริปต์ออกคีย์ + เทสต์ + ย้ายแผนนี้เข้า `docs/` (กำลังดำเนินการ 17/11) | ✅ เจ้าของรัน 0438 บน prod แล้ว 17/11 (tables 3 · seq_null 0 · triggers 2 · seq_ok true) · anon เปิดสามตารางไม่ได้ (401) · เดินฟีดทั้งชุดบนข้อมูลจริงด้วยตัวโหลด: 233 ใบ ไม่ซ้ำ · 448 บรรทัดกระทบยอดลงตัว |
| หลัง deploy | ออกคีย์ทดลอง → `curl` ทั้งสองเส้นบน production → เพิกถอนแล้วต้องได้ 401 → ออกคีย์จริงให้ระบบปลายทาง | — |
| ภายหลัง (ถ้าต้องการ) | หน้าจัดการคีย์ในระบบ · เส้นลูกค้า · webhook | ถามเจ้าของก่อน |

## คำถามที่ยังค้าง (ถามทีละข้อ)

1. ~~ระบบปลายทางคือระบบอะไร~~ — ตอบแล้ว (มติ 4) · ยังต้องรู้ชื่อทีม/คนดูแลตอนออกคีย์ (ใช้ตั้งชื่อคีย์และส่งคู่มือ)
2. ~~เก็บประวัติการเรียก~~ — ตอบแล้ว (มติ 5: เก็บทุกครั้ง)
3. ~~ส่ง SO ย้อนหลัง/SO ค่าสรรพสามิตไหม~~ — ตอบแล้ว (มติ 6: เฉพาะ SO ที่จะไปผลิต กลุ่ม 01/02)
3ข. ~~ใบที่ปนหมวด 03/04~~ — ตอบแล้ว (มติ 7: ส่งทุกบรรทัด)
4. ~~ส่วนลดรายบรรทัด~~ — ตอบแล้ว (มติ 8: ส่ง `discountAmount`)
5. ~~ตอนลงมือ: ตรวจบนข้อมูลจริงว่า `qty × unitPrice − discountAmount = lineTotal`~~ — ตรวจ 17/11: ต้องคูณ `packQty` ด้วย
   (บรรทัดแพ็ค/เดือน) แล้วลงตัวทุกบรรทัด · `subtotal` = ผลรวม `lineTotal` ทุกใบ ⇒ ส่ง `packQty` (ดู "รูปข้อมูล")

## ความเสี่ยง

- **เปิดประตูข้ามด่าน session** — พิมพ์ prefix ผิดตัวเดียวเปิดทั้ง API · กันด้วยเทสต์ทางที่ต้องยังปิด + route ตรวจคีย์ทุกครั้ง
- **trigger ใหม่บน `sales_orders`** — ทุก UPDATE ช้าขึ้นเล็กน้อย (หนึ่ง `nextval`) · ไม่ชนด่านเดิม (ตรวจแล้ว ไม่มี trigger เทียบทั้งแถว)
- **backfill บนฐานจริง** — UPDATE ทุกแถวของ `sales_orders` หนึ่งครั้ง · SET แค่ `changeSeq`/`changedAt`
  ⇒ trigger เดิมไม่ทำงาน (ทุกตัวผูก `UPDATE OF <คอลัมน์อื่น>` — ตรวจแล้ว) · Actual/ลายเซ็น/สรรพสามิตไม่ขยับ
  · ทำก่อนสร้าง trigger ตัวใหม่ · ท้ายไฟล์ SELECT นับแถวที่ `changeSeq IS NULL` ต้องได้ 0
- **คีย์หลุด** — เพิกถอนได้ทันทีด้วยสคริปต์ · คีย์ให้สิทธิ์อ่าน SO อย่างเดียว เขียนอะไรไม่ได้
