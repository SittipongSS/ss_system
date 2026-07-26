# แผน implement: เธรดอัปเดตของกลาง (Entity Updates)

> สถานะ: **ฉบับที่ 1 — วิเคราะห์เสร็จ รอเคาะก่อนเริ่มโค้ด** (2026-07-26)
> ที่มา: ผู้ใช้ขอให้เคสขอราคาวัสดุมี "ระบบอัปเดต" แบบเดียวกับดีล/งาน แล้วสั่งให้
> สำรวจทั้งระบบและทำแผนก่อน เผื่อมีที่อื่นอยากใช้ในอนาคต

## 0. สภาพปัจจุบัน — มี 4 ชุด ไม่มีของกลางสักชุด

ระบบนี้เรียกมันว่า **"ความเคลื่อนไหว" / "เธรดอัปเดต"** (สากล = activity feed) —
คอมเมนต์ที่คนพิมพ์เอง + เหตุการณ์ที่ระบบเขียนให้ อยู่ในสายเดียวเรียงตามเวลา

นิยามที่ mig 0113 เขียนไว้และยังใช้ได้อยู่ — **คนละหน้าที่กับ `recordAudit`**:

| | audit log | เธรดอัปเดต |
|---|---|---|
| ตอบคำถาม | ใครแก้อะไรเมื่อไร | เกิดอะไรขึ้น / ติดอะไรอยู่ |
| คนอ่าน | หัวหน้า/ผู้ตรวจ ย้อนหลัง | ทุกคนที่เกี่ยวข้อง ระหว่างทำงาน |
| คนเขียน | ระบบล้วน | คนพิมพ์เอง + ระบบเขียนเหตุการณ์ให้ |
| ลบได้ไหม | ไม่ได้เด็ดขาด | เจ้าของลบข้อความตัวเองได้ (soft delete) |

**ทั้งสองอย่างต้องอยู่ต่อ ไม่ยุบรวมกัน** — แผนนี้ไม่แตะ `recordAudit`

### 0.1 ของเดิม 4 ชุด (เทียบทีละแกน)

| แกน | ดีล `sales_deal_activities` (0063+0083) | สอบถาม RD `inquiry_messages` (0104+0106) | งานของฉัน `personal_task_updates` (0113) | งานบริหาร `mgmt_updates` (0080) |
|---|---|---|---|---|
| ผูกกับ | `dealId` + **FK CASCADE** | `inquiryId` (ไม่มี FK) | `taskId` (ไม่มี FK โดยเจตนา) | **polymorphic** `entityType`+`entityId` |
| kind | note·call·meeting·email·next_step | comment·status | comment·status·due·late | edit·status·comment·file·link |
| ข้อความ | `body` NOT NULL | `body` nullable (โพสต์รูปล้วนได้) | `body` nullable | `body` nullable |
| meta | ไม่มี (ใช้คอลัมน์ `dueDate` แยก) | ไม่มี | `meta jsonb` {field,from,to} | `meta jsonb` {field,from,to} |
| ไฟล์แนบ | ✅ `attachments jsonb` + proxy | ✅ `attachments jsonb` + proxy | ❌ | ❌ |
| แก้ข้อความ | ✅ (ไม่บันทึกว่าแก้) | ✅ `editedAt` | ❌ | ❌ |
| ลบ | ✅ **ลบจริง** | ✅ **soft** `deletedBy/At` | ❌ | ❌ |
| รับทราบ | ❌ | ✅ `acknowledgedBy/At` | ❌ | ❌ |
| ฝ่ายผู้เขียน | ❌ | ✅ `authorDept` (แยกฝั่งถาม/ตอบตอนแสดง) | ❌ | ❌ |
| เขียนพลาดแล้ว | throw ปกติ | throw ปกติ | **ไม่ throw** คืน error ให้ผู้เรียกเลือก | **ไม่ throw** กลืน error |
| UI | inline ใน `deals/[id]` (ไฟล์ 1,454 บรรทัด) | `inquiries/[id]` (465) | `pm/tasks/[id]` (211) | `TaskDrawer`/`MeetingDrawer` |

**สรุปแกนที่ต่างกันจริง มีแค่ 3 อย่าง** — kind, ไฟล์แนบเปิด/ปิด, และความสามารถ
(แก้/ลบ/รับทราบ) ที่เหลือคือ**โครงเดียวกันเป๊ะที่เขียนซ้ำ 4 รอบ**

### 0.2 ของที่ "หน้าตาคล้าย" แต่ไม่ใช่เธรด — ไม่ยุบเข้ามา

| ตาราง | คืออะไร | ทำไมไม่ยุบ |
|---|---|---|
| `sales_deal_stage_history` (0063) | ประวัติเปลี่ยน stage ของดีล | เป็นข้อมูล**ที่รายงานคิดยอดจากมัน** ไม่ใช่ข้อความเล่าเรื่อง |
| `lead_events` (0091) | เหตุการณ์ลีด มีคอลัมน์เฉพาะโดเมน (`meetingMode`, `assigneeId`, `eventAt`) | schema เฉพาะทาง + คิว/KPI ลีด query ตรง ๆ ยัดลง `meta` แล้วรายงานพัง |
| `product_price_history`, `sales_history` | ประวัติค่าเชิงตัวเลข | ไม่มีคนอ่านเป็นเรื่องราว |
| `attachments` (0028) | ไฟล์แนบ**ของ entity** (มี docType/บังคับแนบ) | คนละความหมายกับรูปที่แปะในข้อความ — อยู่คู่กันได้ ดูข้อ 4.3 |

### 0.3 ต้นทุนที่จ่ายอยู่ตอนนี้

1. **แดชบอร์ดต้องเย็บเอง** — `my-dashboard` และ RD dashboard ดึงหลายตารางมา normalize
   ทีละอันเพื่อทำฟีดรวม; ถ้าเป็นตารางเดียวคือ query เดียว
2. **ฟีเจอร์ไม่เท่ากันแบบไม่ได้ตั้งใจ** — แนบรูปได้เฉพาะ 2 ใน 4, แก้ข้อความได้ 2 ใน 4,
   ลบดีลทิ้งจริงแต่ลบสอบถามเป็น soft ทั้งที่เป็นหลักฐานพอกัน
3. **ของใหม่ทุกตัวต้องเลือกว่าจะก๊อปใคร** — เคสขอราคาวัสดุคือรายล่าสุดที่มาถึงทางแยกนี้
4. **บทเรียนไฟล์แนบเพิ่งซ้ำรอย** (PR #733: ต้องต่อ 5 จุด) — ของกระจายคือที่มาของบั๊กเงียบ

## 1. มติที่ต้องเคาะ (ยังไม่ล็อก)

1. **ทำของกลาง `entity_updates` แล้วย้ายของเดิมทั้ง 4 ชุดมาใช้** (ผู้ใช้เลือกแล้ว)
2. ระหว่างทาง **ห้ามมีชุดที่ 5** — ของใหม่ (เคสขอราคา/ใบ CR) ใช้ของกลางตั้งแต่วันแรก
3. ตารางเก่า **ไม่ drop ทันที** — ย้ายข้อมูล → สลับโค้ด → ปล่อยผ่านหนึ่งรอบ → ค่อย drop
4. `lead_events` / `stage_history` **ไม่ย้าย** (ข้อ 0.2) แต่ฟีดหน้าจอ **merge ตอนอ่าน** ได้เหมือนเดิม
5. ความสามารถเป็น **ต่อ entity** ไม่ใช่ต่อระบบ — entity ไหนเปิดแนบรูป/แก้/ลบได้ ประกาศในโค้ด

## 2. สิ่งที่ core ต้องรองรับ (มาจากข้อ 0.1 ทั้งหมด ไม่มีเผื่อ)

- kind อิสระต่อ entity + ป้าย/สีของมัน — **ไม่มี CHECK ใน DB** (แพตเทิร์นเดียวกับ
  `attachmentTypes` / `materialTypes`: เพิ่มชนิดใหม่ = แก้โค้ดล้วน ไม่ต้อง migration)
- ข้อความว่างได้ถ้ามีไฟล์แนบ (โพสต์รูปล้วน)
- `meta jsonb` สำหรับ {field, from, to} ของเหตุการณ์ระบบ + ค่าเฉพาะทางอย่าง `dueDate`
- ไฟล์แนบเป็น jsonb ref บนแถว + proxy ดาวน์โหลดตัวเดียว
- แก้ (`editedAt`) · ลบแบบ soft (`deletedBy/At`) · รับทราบ (`acknowledgedBy/At`)
- `authorDept` — ใช้แยกฝั่งซ้าย/ขวาในเธรดสองฝ่าย (สอบถาม RD, เคสขอราคา)
- เขียนพลาดต้อง **ไม่ทำให้ action หลักพัง** แต่ต้องคืน error ให้ผู้เรียกที่แคร์เช็คได้

## 3. จุดที่จะได้ใช้ (สำรวจหน้ารายละเอียดทั้งระบบ)

| หน้า | มีเธรดไหม | ควรมีไหม | เหตุผล |
|---|---|---|---|
| ดีล | ✅ ของเดิม | ย้าย | — |
| สอบถาม RD | ✅ ของเดิม | ย้าย | — |
| งานของฉัน | ✅ ของเดิม | ย้าย | — |
| งานบริหาร (พัก) | ✅ ของเดิม | ย้าย | ไม่มีข้อมูล prod → ย้ายง่ายสุด ใช้เป็นตัวนำร่อง |
| **เคสขอราคาวัสดุ** | ❌ | **🔴 ต้องมี** | สองฝ่ายคุยกันจริง ("ขวดสีชามีไหม / MOQ 500 ได้ไหม") ตอนนี้ต้องโทรนอกระบบ เหตุผลของราคาหายไปกับสาย |
| **ใบขอราคาผลิต** | ❌ | **🔴 ต้องมี** | ผู้บริหารตีกลับแล้วเซลแก้ — ตอนนี้เหตุผลอยู่ในช่อง `returnReason` ช่องเดียวทับกันทุกครั้ง |
| **ใบเสนอราคา (QT)** | ❌ | 🟠 ควรมี | ลูกค้าขอแก้ราคา/เงื่อนไขหลายรอบก่อนตกลง ตอนนี้ร่องรอยอยู่ในหัวคนขาย |
| **Sale Order** | ❌ | 🟠 ควรมี | ปัญหาหน้างาน (ของขาด/เลื่อนส่ง) ควรอยู่กับใบ |
| **ทะเบียนสรรพสามิต / ใบยื่นภาษี** | ❌ | 🟠 ควรมี | LG ตีกลับให้แก้ — เหตุผลควรเป็นเธรด ไม่ใช่ช่องเดียว |
| **ลูกค้า / สินค้า** | ❌ | 🟡 น่ามี | บันทึกข้อตกลงพิเศษรายลูกค้า ("เจ้านี้ขอวางบิลทุกวันที่ 25") |
| **PO สหมิตร** | ❌ | 🟡 น่ามี | เคสแบ่งส่ง/ยอดไม่ตรง |
| **ทะเบียนวัสดุ** | ❌ | 🟢 ไว้ก่อน | เหตุผลราคาอยู่ที่ rev note แล้ว |
| โครงการ | rollup ของดีล | คงเดิม | ยืมของลูก ถูกแล้ว |
| ลีด | `lead_events` | ไม่ย้าย (ข้อ 0.2) | อาจ **เพิ่ม** เธรดคอมเมนต์คู่กันทีหลังถ้าต้องการ |

> รวม **candidate ใหม่ 8 จุด** — ถ้าไม่ทำของกลาง แต่ละจุดคือการก๊อปโค้ดอีกหนึ่งรอบ

## 4. โมเดลข้อมูล

### 4.1 `entity_updates` (mig 0160)

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.entity_updates (
  id            text PRIMARY KEY,
  -- polymorphic (แพตเทิร์นเดียวกับ attachments 0028 / mgmt_updates 0080):
  -- ไม่มี FK โดยเจตนา — entity อยู่คนละโมดูล ผู้ลบต้องเก็บกวาดเอง (ดู 4.4)
  "entityType"  text NOT NULL,
  "entityId"    text NOT NULL,
  -- ไม่มี CHECK: ชุด kind เป็นของแต่ละ entity ประกาศในโค้ด (lib/master/updateTypes.js)
  kind          text NOT NULL DEFAULT 'comment',
  body          text CHECK (body IS NULL OR length(body) <= 4000),
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {field,from,to} · {dueDate}
  attachments   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ref เท่านั้น (ดู 4.3)
  "authorId"    text, "authorName" text, "authorDept" text,
  "editedAt"    timestamptz,
  "acknowledgedBy" text, "acknowledgedAt" timestamptz,
  -- soft delete: ข้อความที่คนอื่นอ่านไปแล้วเป็นหลักฐาน ลบจริงไม่ได้
  "deletedBy"   text, "deletedAt" timestamptz,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  -- โพสต์เปล่าไม่มีความหมาย: ต้องมีข้อความ หรือไฟล์ หรือเป็นเหตุการณ์ระบบ
  CONSTRAINT entity_updates_not_empty CHECK (
    body IS NOT NULL OR jsonb_array_length(attachments) > 0 OR kind <> 'comment'
  )
);

CREATE INDEX entity_updates_entity_idx
  ON public.entity_updates ("entityType", "entityId", "createdAt" DESC);
-- ฟีดรวมข้ามโมดูล (my-dashboard / RD dashboard) — ของเดิมต้องยิงหลายตารางแล้วเย็บเอง
CREATE INDEX entity_updates_recent_idx ON public.entity_updates ("createdAt" DESC);
CREATE INDEX entity_updates_author_idx ON public.entity_updates ("authorId", "createdAt" DESC);

ALTER TABLE public.entity_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.entity_updates FROM anon, authenticated;
GRANT  ALL ON TABLE public.entity_updates TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
```

### 4.2 `entityType` ที่ใช้ (ค่าคงที่ในโค้ด)

`deal` · `inquiry` · `personal_task` · `mgmt_task` · `mgmt_meeting` · `mgmt_rock`
· `material_ask` · `costing_request` (+ ที่จะเพิ่มตามข้อ 3)

> ใช้ชื่อชุดเดียวกับ `attachmentTypes` ที่มีอยู่แล้วทุกตัวที่ชื่อชนกัน — คนอ่านโค้ด
> ไม่ต้องจำสองชุด

### 4.3 ไฟล์แนบ: jsonb บนแถว **ไม่ใช่** ตาราง `attachments` กลาง

ตั้งใจให้ต่างจากไฟล์แนบของ entity และตรงกับที่ดีล/สอบถามทำอยู่แล้ว:

| | `attachments` (0028) | `entity_updates.attachments` |
|---|---|---|
| ของใคร | ของ **entity** ("รูปตัวอย่างของวัสดุตัวนี้") | ของ **ข้อความนั้น** ("รูปที่ผมส่งให้ดูตอนถาม") |
| มี docType/บังคับแนบ | ✅ | ❌ |
| อายุ | อยู่กับ entity | ลบข้อความ = ไฟล์หมดความหมายตาม |

⚠️ กฎ 5 จุดของไฟล์แนบ entity (ดูหัวไฟล์ `costingAttachmentAccess.js`) **ไม่ใช้กับเส้นนี้** —
เส้นนี้มี proxy ตัวเดียว `/api/updates/[id]/file?i=N` ที่เช็คสิทธิ์ผ่าน adapter ตัวเดียวกับ
การอ่านเธรด จึงไม่มีทางหลุดคนละจุดกันแบบเดิม (นี่คือเหตุผลหนึ่งที่ควรมีของกลาง)

### 4.4 ลบ entity แล้วเธรดต้องไม่ค้าง

ไม่มี FK → `lib/forceDelete.js` ต้อง `DELETE FROM entity_updates WHERE entityType=… AND entityId=…`
ทุกที่ที่ลบ entity (แพตเทิร์นเดียวกับ `purgeAttachments`) → ทำเป็น `purgeUpdates()` คู่กัน

## 5. โครงสร้างไฟล์

### สร้างใหม่
```
supabase/migrations/0160_entity_updates.sql
src/lib/master/updateTypes.js          ชุด kind + ป้าย/สี ต่อ entityType (โค้ดล้วน)
src/lib/master/updateAccess.js         ⭐ registry เดียว: table + canView/canPost/canMutate
src/lib/master/updateAccess.test.mjs
src/lib/master/updates.js              server: listUpdates/appendUpdate/purgeUpdates
src/components/updates/UpdateThread.js ⭐ component เดียว: ฟีด + composer + lightbox
src/components/updates/UpdateComposer.js
src/app/api/updates/route.js           GET (entityType,entityId) · POST
src/app/api/updates/[id]/route.js      PATCH (edit|acknowledge) · DELETE (soft)
src/app/api/updates/[id]/file/route.js proxy ไฟล์แนบในข้อความ
```

### หัวใจของแผน: `updateAccess.js` — เพิ่ม entity ใหม่ = **แก้ไฟล์เดียว**

```js
export const UPDATE_ENTITIES = {
  material_ask: {
    table: 'material_price_asks',
    kinds: ['comment', 'status'],
    attachments: true,
    canView:   (user, ask) => canViewCosting(user),
    canPost:   (user, ask) => canManageAsk(user, ask) || canAnswerAsk(user, ask),
    // แก้/ลบได้เฉพาะข้อความตัวเอง และเฉพาะตอนเคสยังเดินอยู่
    canMutate: (user, ask, row) => row.authorId === user?.id
                 && !['closed', 'cancelled'].includes(ask.status),
  },
  deal: { … }, inquiry: { … }, personal_task: { … }, mgmt_task: { … },
};
```

บทเรียนที่ฝังไว้ตรงนี้: **ทุกด่านของ entity หนึ่งอยู่ที่เดียว** — ของเดิมกระจาย
loadParent/view/edit/โฟลเดอร์ Drive/proxy คนละไฟล์ แล้วขาดทีละจุดโดยไม่มีใครรู้

### แก้
| ไฟล์ | แก้อะไร |
|---|---|
| `lib/forceDelete.js` | เรียก `purgeUpdates()` ทุกจุดที่ลบ entity |
| `api/sales-planning/my-dashboard`, `rd-kpi` | ฟีดรวมอ่านจากตารางเดียว เลิกเย็บเอง |
| `app/sales-planning/deals/[id]/page.js` | ลบฟีด inline ~180 บรรทัด → `<UpdateThread entityType="deal" …/>` |
| `app/sa/inquiries/[id]/page.js` · `app/pm/tasks/[id]/page.js` · `mgmt/*Drawer.js` | เหมือนกัน |
| `app/sa/materials/asks/[id]/page.js` · `app/sa/costing/[id]/page.js` | **เพิ่มเธรด** (ของใหม่) |

## 6. API

```
GET    /api/updates?entityType=&entityId=          เธรดของ entity (เก่า→ใหม่)
GET    /api/updates?mine=1&limit=50                ฟีดรวมข้ามโมดูล (แดชบอร์ด)
POST   /api/updates    { entityType, entityId, kind?, body?, attachments?, meta? }
PATCH  /api/updates/[id]  { action: 'edit'|'acknowledge', body? }
DELETE /api/updates/[id]                            soft delete (เจ้าของ/admin)
GET    /api/updates/[id]/file?i=0                   proxy ไฟล์แนบในข้อความ
```

proxy: `/api/updates` ต้องผ่านทุก role ที่ล็อกอิน (ด่านจริงอยู่ใน adapter — proxy
เห็นแค่ role ไม่รู้จัก entity) — แพตเทิร์นเดียวกับ `/api/attachments`

## 7. แผนย้ายของเดิม (ทีละ PR — ห้ามย้ายพร้อมกัน)

**หลักการ**: ย้าย**ข้อมูลก่อน** → สลับ**อ่าน** → สลับ**เขียน** → ปล่อยหนึ่งรอบ → **drop**
แต่ละ migration copy แบบ idempotent (`WHERE NOT EXISTS`) รันซ้ำได้ปลอดภัย

| PR | ย้ายอะไร | ข้อมูล prod | ความเสี่ยง |
|---|---|---|---|
| **1** | core: mig 0160 + lib + API + `UpdateThread` + **ต่อที่เคสขอราคา** | ไม่มี (ของใหม่) | ต่ำ — ไม่แตะของเดิมเลย |
| **2** | ใบขอราคาผลิต + งานบริหาร (`mgmt_updates`) | mgmt ไม่มีข้อมูลจริง (โมดูลพัก) | ต่ำ |
| **3** | งานของฉัน (`personal_task_updates`) | มี | กลาง — kind `due`/`late` ต้องแมปให้ครบ |
| **4** | สอบถาม RD (`inquiry_messages`) | มี + ไฟล์แนบ + acknowledge | **สูงสุด** — ฟีเจอร์เยอะที่สุด ทำท้ายสุดหลัง core นิ่ง |
| **5** | ดีล (`sales_deal_activities`) | มีเยอะสุด + `dueDate` → `meta.dueDate` + แดชบอร์ด 2 ตัวอ่านอยู่ | สูง — ต้องแก้ my-dashboard/rd-kpi พร้อมกัน |
| **6** | เก็บกวาด: drop 4 ตารางเก่า + ลบโค้ดตาย | — | ต่ำ (หลังปล่อยผ่านแล้ว) |

> PR 1 ตอบโจทย์ที่ผู้ใช้ขอมาแล้ว (เคสขอราคามีเธรด) — 2–6 คือการเก็บหนี้ ทำต่อได้ตามจังหวะ
> ⚠️ ถ้าหยุดหลัง PR 1 แล้วไม่ทำต่อ = ระบบมี **5 ชุด** แย่กว่าเดิม ต้องตั้งใจเดินให้จบ

## 8. ความเสี่ยง

1. **หยุดกลางทาง** (ข้อ 7) — กันด้วยการทำ PR 2 (mgmt, ไม่มีข้อมูล) ติดกันทันที
   เพื่อพิสูจน์ว่าเส้นย้ายใช้ได้จริงตั้งแต่ยังไม่เสี่ยง
2. **ดีลมีข้อมูลเยอะและมี 2 แดชบอร์ดอ่านอยู่** — ย้ายท้าย ๆ และ backfill ก่อนสลับอ่าน
3. **`meta` ไม่มี index** — `dueDate` ของดีลย้ายไป `meta.dueDate`; ถ้าอนาคตต้องกรอง
   ด้วยมันบ่อย ค่อยเพิ่ม expression index (`(meta->>'dueDate')`) ไม่ต้องรื้อ schema
4. **ไม่มี FK** — เธรดค้างเมื่อลบ entity ถ้าลืมเรียก `purgeUpdates` → เทสต์ต้องครอบ
   ทุก entityType ที่ลงทะเบียน (loop จาก registry ไม่ใช่เขียนทีละตัว)
5. **สิทธิ์ผิดพลาดกระทบทุกโมดูลพร้อมกัน** — ของกลางแปลว่าพังทีเดียวพังหมด →
   `updateAccess.test.mjs` ต้อง cover ทุก entity × (view/post/mutate) × role หลัก
6. **ผู้ใช้เห็นของหายชั่วคราว** ถ้า backfill ไม่ครบก่อนสลับอ่าน → ทุก PR ต้อง
   verify count เก่า = count ใหม่ ก่อน merge

## 9. เช็คลิสต์ทดสอบ (UAT)

1. เคสขอราคา: เซลถาม → PC ตอบในเธรด → แนบรูปได้ พรีวิวได้ · ปิดเคสแล้วโพสต์เพิ่มไม่ได้
2. เหตุการณ์ระบบขึ้นเธรดเอง: ส่งเคส → รับเรื่อง → ตอบราคา rev.N → no_quote → ปิด
3. แก้ข้อความตัวเอง → ขึ้น "แก้ไขแล้ว" · ลบ → ขึ้น "ข้อความถูกลบ" ไม่ใช่หายเงียบ
4. คนอื่นแก้/ลบข้อความเราไม่ได้ (ยกเว้น admin) · คนนอก scope อ่านไม่ได้เลย
5. ลบ entity (admin force) → เธรดถูกเก็บกวาด ไม่ค้างในตาราง
6. หลังย้ายแต่ละ PR: จำนวนข้อความเท่าเดิมทุกเธรด + ไฟล์แนบเปิดได้เหมือนเดิม
7. แดชบอร์ดฟีดรวมยังแสดงครบเหมือนก่อนย้าย
8. `npm test` เขียว · `npm run check:migrations` เขียว
