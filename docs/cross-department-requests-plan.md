# แผนรื้อโครงสร้าง "คำร้องข้ามฝ่าย" (SA ↔ RD ↔ PC)

รวม 3 เมนู **สอบถาม RD · ขอราคาผลิต · วัสดุ** ให้เป็นโครงเดียวกัน แล้วต่อสายเข้าไทม์ไลน์โครงการ

- เขียน: 2026-07-28
- ต่อยอดจาก: `docs/costing-request-plan.md` (ฉบับ 5), `docs/entity-updates-plan.md`
- สถานะ: **มติครบแล้ว รอเริ่ม PR-1**

---

## 0. ทำไมต้องรื้อตอนนี้

นับแถวบน prod เมื่อ 2026-07-28:

| ตาราง | แถวบน prod |
|---|---|
| `inquiries` / `inquiry_messages` | **0 / 0** |
| `material_price_asks` / `_items` | 1 / 1 |
| `material_prices` / `_revisions` | 1 / 0 |
| `costing_requests` | 1 |
| `sales_deals` | 133 |
| `products` (มี `formulaCode`) | 120 (45) |
| `entity_updates` | 654 |
| `projects` / `project_tasks` | 12 / 282 |

**ทั้งสามเมนูยังแทบไม่มีใครใช้จริง** ขณะที่ดีล/โครงการ/ไทม์ไลน์เดินเต็มที่แล้ว → รื้อโครงตอนนี้
ต้นทุนย้ายข้อมูลเกือบเป็นศูนย์ ปล่อยไว้อีก 3 เดือนราคาจะคนละเรื่อง

---

## 1. มติที่ล็อกแล้ว (ผู้ใช้ยืนยัน 2026-07-28)

1. **RM (หัวน้ำหอม F / เนื้อสาร FB) = RD ตอบ · PM (บรรจุภัณฑ์) = PC ตอบ** — ตรงกับที่ระบบทำอยู่
   (`sourceDeptForMaterialKind`) ไม่มีการสลับ ไม่มี PC ตอบราคา RM
2. **ยังไม่มีฝ่าย Costing** — ผู้ให้ราคาผลิตคือ **ผู้บริหาร (role `executive`) คนเดียว** เหมือนเดิม
   ห้ามเพิ่ม role ใหม่ในแผนนี้
3. **บรีฟกลิ่น / ขอ Mockup = "คำร้อง" ที่ปักหมุดเข้า task เดิมในไทม์ไลน์** ไม่สร้าง task ใหม่
   (งานเดียวต้องไม่โผล่สองที่)
4. **ทะเบียนกลิ่นเก็บ: ชื่อ · รหัส · วันที่ · Rev · Feedback** → Rev เป็นตารางลูก แต่ละ Rev มีวันที่
   ส่งกลิ่นและผลตอบรับของลูกค้า
5. **คำร้องบังคับผูกดีลเฉพาะชนิดที่เป็นงานลูกค้า** (บรีฟ/mockup/เอกสาร) · ชนิดขอราคาไม่บังคับ
   (ขอเก็บข้อมูลไว้ก่อนได้ — สอดคล้องมติเดิมของใบขอราคาผลิต v2)
6. ⭐ **"ขอราคา PM" คือขั้น `หาบรรจุภัณฑ์ที่ลูกค้าต้องการ` (step 25, PC, 30 วัน) ในไทม์ไลน์**
   ไม่ใช่งานลอย ๆ → ทุกชนิดคำร้องมี task ปลายทางในไทม์ไลน์ทั้งหมด

### ตารางจับคู่ ชนิดคำร้อง ↔ ขั้นในไทม์ไลน์

อ้าง `webapp/src/lib/pm/templates.js` · คีย์ขั้น = `workflowTemplateStepKey`
(`staticStepKey` = `<ประเภทดีล>-<เลขขั้น 2 หลัก>`)

| ชนิดคำร้อง | ฝ่าย | ขั้นปลายทาง | stepKey |
|---|---|---|---|
| `scent_brief` แจ้งบรีฟออกแบบกลิ่น | RD | `ออกแบบกลิ่น` (SCENT step 6) | `scent-06` |
| `mockup` ขอ Mock-up | RD | `ขึ้น Mock-up สินค้า` (NPD step 15) | `npd-15` |
| `price_pm` ขอราคาบรรจุภัณฑ์ | PC | `หาบรรจุภัณฑ์ที่ลูกค้าต้องการ` (NPD step 25) | `npd-25` |
| `price_f` ขอราคาหัวน้ำหอม | RD | — (ป้อนใบขอราคาผลิต) | – |
| `price_fb` ขอราคาเนื้อสาร | RD | — (ป้อนใบขอราคาผลิต) | – |
| `material_eta` ติดตามของเข้า PM/RM | PC | `สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด` (NPD 38 / RE-ORDER 11) | `npd-38` / `re-order-11` |
| `info` สอบถามข้อมูล | RD/PC | — | – |
| `document` ขอเอกสาร | RD/PC | — | – |

> ⚠️ เก็บ `projectId + stepKey` **ไม่ใช่ `projectTaskId`** — `mergeTemplateTasks` ลบ/สร้าง task ใหม่ได้
> ตอน resync แม่แบบ ถ้าผูก id ตรง ๆ หมุดจะหลุดเงียบ ๆ · resolve task ตอนอ่านเสมอ

---

## 2. โครงใหม่ 3 ชั้น

### ชั้น A — ทะเบียน (ข้อมูลหลัก) ย้ายไปใต้ "ฐานข้อมูล"

| ทะเบียน | ที่มา | ผูกกับ |
|---|---|---|
| **กลิ่น** `scents` + `scent_revisions` | ใหม่ | ← วัสดุ `RM_F`, ← สูตร |
| **สูตร** `formulas` | ยกจาก 3 ช่องข้อความบน `products` (mig 0112) — backfill 45 แถว | ← วัสดุ `RM_FB`, ← `products.formulaId` |
| **วัสดุ** `material_prices` | มีแล้ว (0157) — เพิ่ม `scentId` / `formulaId` | ← ใบขอราคาผลิต |

ผลลัพธ์: "ขอราคา F อ้างชื่อกลิ่น" / "ขอราคา FB อ้างชื่อสูตร" เปลี่ยนจากพิมพ์ข้อความเป็น
**เลือกจากทะเบียนด้วย id** — ปิดบั๊กตระกูลเดียวกับที่ 0158 เพิ่งปิด ("ตอบแล้วเกิดวัสดุตัวใหม่")

### ชั้น B — คำร้องข้ามฝ่าย: กลไกเดียว มีชนิด

**ต่อยอดจาก `material_price_asks` (0158) ไม่ใช่จาก `inquiries`** — ของ 0158 ใหม่กว่าและมีครบทุกอย่าง
ที่ต้องใช้อยู่แล้ว: เลขที่ · สถานะ 6 ขั้น · คิวรายฝ่าย · เธรดกลาง · ไฟล์แนบต่อครบ 5 จุด · บรรทัด
หลายรายการ · ชั้นจำนวน · เทสต์ · `RecordControlCard`
ส่วน `inquiries` (0104) เป็นเธรดล้วน ไม่มีบรรทัด ไม่มีคิว **และมี 0 แถวบน prod** → **ลบทิ้ง**

```
material_price_asks       →  dept_requests          (+ kind, บริบทดีล/โครงการ, stepKey, title)
material_price_ask_items  →  dept_request_items     (มีเฉพาะชนิดขอราคา)
inquiries + inquiry_messages  →  ลบทั้งคู่
```

สถานะชุดเดียวทุกชนิด (ของ 0158 เดิม): `draft → pending → acknowledged → answered → closed`
(+ `cancelled`)

### ชั้น C — ของเข้า PM/RM ระดับโครงการ

ยกกลไกของ `/sahamit/material` (`pmDueDate` / `rmDueDate` / `arrivedAt` ราย PO line) ขึ้นเป็นของกลาง
ระดับโครงการ → ตาราง `material_deliveries` · สรุปขึ้นขั้น `npd-38` ให้ milestone นั้นมีของจริงข้างใน
และวันช้าสุดดันวันเริ่มผลิตผ่านเครื่องยนต์ `lib/pm/schedule.js` ที่มีอยู่แล้ว

---

## 3. เมนูก่อน/หลัง

```
ก่อน                              หลัง
─────────────────────────         ────────────────────────────────────────
สอบถาม RD                         คำร้อง            (คิวฝ่ายฉัน / ที่ฉันเปิด / ทั้งหมด — กรองด้วยชนิด)
ขอราคาผลิต                        ขอราคาผลิต        (คงเดิม — เอกสารสาย QT/SO ผู้บริหารเข้าตรง)
วัสดุ (ทะเบียน+เคส 3 แท็บ)         ของเข้า & กำหนดการผลิต

ฐานข้อมูล: ลูกค้า · สินค้า · หมวดสินค้า
        →  + ทะเบียนกลิ่น · ทะเบียนสูตร · ทะเบียนวัสดุ (ย้ายมาจากเมนู "วัสดุ")

หน้าดีล: แท็บ "สอบถาม RD"  →  แท็บ "คำร้อง" (เห็นทุกชนิด + ใบขอราคาผลิตของดีลนั้น)
```

แก้ชื่อชนกัน: เมนูสหมิตร `วัสดุ / Lead time` → `ของเข้า (สหมิตร)`

---

## 4. เลขที่เอกสาร

ใช้ RPC `next_entity_number` เดิม (mig 0096)

| ชนิด | scope | รูปแบบ |
|---|---|---|
| `price_f` / `price_fb` | `RM` | `RM-YYMMXXXX` (คงเดิม) |
| `price_pm` | `PM` | `PM-YYMMXXXX` (คงเดิม) |
| ที่เหลือทั้งหมด | `RQ` | `RQ-YYMMXXXX` |

เลขออก **ตอนกดส่ง** ไม่ใช่ตอนสร้างร่าง (บทเรียนใบขอราคาผลิต PR3a — ร่างที่ถูกทิ้งจะได้ไม่กินเลข)
scope `IQ` ของ `inquiries` เลิกใช้ (ไม่มีแถวบน prod จึงไม่ต้องกันเลขย้อนหลัง)

---

## 5. Migration

> ⚠️ **ก่อนเริ่ม:** บน main มี **migration เลข 0169 ซ้ำสองไฟล์**
> (`0169_deal_feed_to_entity_updates.sql` + `0169_sales_order_reissue_after_cancel.sql`)
> ต้องรัน `npm run check:schema` ยืนยันว่า prod รันครบ **ทั้งคู่** ก่อน ไม่งั้นซ้ำรอย 0076
> (ดู memory `migration-drift-guard`)

### 0170 — ทะเบียนกลิ่น + ทะเบียนสูตร

```sql
-- ============================================================
--  Migration 0170: ทะเบียนกลิ่น (scents) + ทะเบียนสูตร (formulas)
--  แผน docs/cross-department-requests-plan.md ชั้น A
--
--  ก่อนหน้านี้ "กลิ่น" ไม่มีตัวตนในระบบเลย (มีแค่ชื่อ task ในไทม์ไลน์ + ข้อความ
--  ในทะเบียนวัสดุ) และ "สูตร" เป็น 3 ช่องข้อความบน products (mig 0112)
--  → ขอราคา F/FB อ้างของพวกนี้ได้แค่พิมพ์ชื่อ จับคู่ไม่ได้ รายงานไม่ได้
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้)
--  ⚠ ต้องรัน **ก่อน** deploy โค้ด PR-1
-- ============================================================

BEGIN;

-- ── 1) ทะเบียนกลิ่น ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scents (
  id             text PRIMARY KEY,
  code           text UNIQUE,                      -- SC-YYMMXXXX (next_entity_number scope 'SC')
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  -- กลิ่นเฉพาะลูกค้า (null = กลิ่นกลางของบริษัท ใช้ซ้ำได้ทุกงาน)
  "customerId"   text, "customerName" text,
  -- ดีล SCENT ต้นทางที่สั่งออกแบบ (null = กลิ่นที่มีอยู่ก่อน/สร้างจากทะเบียนตรง ๆ)
  "dealId"       text,
  status         text NOT NULL DEFAULT 'developing' CHECK (status IN (
                   'developing',  -- กำลังออกแบบ/ส่งให้ลูกค้าลองอยู่
                   'active',      -- ลูกค้าอนุมัติแล้ว ใช้ผลิตได้
                   'archived')),  -- เลิกใช้
  -- Rev ล่าสุด — derive ตอนเขียนเสมอ (อ่านทะเบียนไม่ต้อง join ลูกทุกครั้ง)
  "currentRevisionNo" integer NOT NULL DEFAULT 0,
  "ownerId"      text, "ownerName" text,           -- RD เจ้าของกลิ่น
  note           text CHECK (note IS NULL OR length(note) <= 2000),
  "createdById"  text, "createdByName" text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);

-- ตัวตนของกลิ่น = ชื่อ (ตัดช่องว่าง/ไม่สนตัวพิมพ์) + ลูกค้า
-- แพตเทิร์นเดียวกับ material_prices_identity_uk (0157) — ห้ามให้ชื่อซ้ำในลูกค้าเดียวกัน
-- ไม่งั้นขอราคา F สองใบจะชี้คนละแถวโดยไม่มีใครรู้
CREATE UNIQUE INDEX IF NOT EXISTS scents_identity_uk
  ON public.scents (lower(btrim(name)), COALESCE("customerId", ''));
CREATE INDEX IF NOT EXISTS scents_customer_idx ON public.scents ("customerId");
CREATE INDEX IF NOT EXISTS scents_deal_idx     ON public.scents ("dealId");
CREATE INDEX IF NOT EXISTS scents_status_idx   ON public.scents (status);

-- ── 2) Rev ของกลิ่น = การส่งกลิ่นให้ลูกค้า 1 ครั้ง + ผลตอบรับ ──────────────
-- ⚠ ต่างจาก material_price_revisions ตรงที่ **แก้ได้** — feedback ลูกค้ามาทีหลัง
-- วันที่ส่ง (คนละวันกับวันที่ได้คำตอบ) จึงห้ามใส่ guard immutable แบบราคา
CREATE TABLE IF NOT EXISTS public.scent_revisions (
  id               text PRIMARY KEY,
  "scentId"        text NOT NULL REFERENCES public.scents(id) ON DELETE CASCADE,
  "revisionNo"     integer NOT NULL CHECK ("revisionNo" >= 1),
  "sampleCode"     text,                           -- รหัสตัวอย่างที่ส่ง (ของ RD)
  "sentAt"         date,                           -- "วันที่ Rev" = วันที่ส่งกลิ่น
  "sentById"       text, "sentByName" text,
  -- ผลตอบรับจากลูกค้า
  "feedbackStatus" text NOT NULL DEFAULT 'pending' CHECK ("feedbackStatus" IN (
                     'pending',   -- ส่งแล้ว รอลูกค้าตอบ
                     'revise',    -- ให้แก้ → เกิด Rev ถัดไป
                     'approved',  -- ผ่าน
                     'rejected')),-- ไม่เอากลิ่นนี้
  "feedbackAt"     date,
  "feedbackById"   text, "feedbackByName" text,
  feedback         text CHECK (feedback IS NULL OR length(feedback) <= 4000),
  note             text CHECK (note IS NULL OR length(note) <= 2000),
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now(),
  -- มีผลตอบรับแล้วต้องมีวันที่เสมอ (ไม่งั้นวัด lead time ของ RD ไม่ได้)
  CHECK ("feedbackStatus" = 'pending' OR "feedbackAt" IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS scent_revisions_no_uk
  ON public.scent_revisions ("scentId", "revisionNo");

-- ── 3) ทะเบียนสูตร ─────────────────────────────────────────────────────────
-- รหัสสูตรเป็นของจริงจาก RD (ไม่ใช่เลขรันของระบบ) → ผู้ใช้กรอกเอง แต่ห้ามซ้ำ
CREATE TABLE IF NOT EXISTS public.formulas (
  id             text PRIMARY KEY,
  code           text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 100),
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  "formulaDate"  date,                             -- วันที่ของสูตร (เดิม products."formulaDate")
  -- สูตรใช้กลิ่นตัวไหน (มติผู้ใช้: สูตรเกี่ยวข้องกับกลิ่น)
  "scentId"      text REFERENCES public.scents(id) ON DELETE SET NULL,
  "customerId"   text, "customerName" text,
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('draft', 'active', 'archived')),
  note           text CHECK (note IS NULL OR length(note) <= 2000),
  "createdById"  text, "createdByName" text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS formulas_code_uk ON public.formulas (lower(btrim(code)));
CREATE INDEX IF NOT EXISTS formulas_scent_idx    ON public.formulas ("scentId");
CREATE INDEX IF NOT EXISTS formulas_customer_idx ON public.formulas ("customerId");

-- ── 4) ต่อทะเบียนเข้าของเดิม ───────────────────────────────────────────────
-- products: 3 ช่องข้อความเดิม **ไม่ลบในรอบนี้** (ยังมีที่อ่านอยู่หลายจุด รวมทั้ง
-- snapshot บนใบขอราคาผลิต/เคส) — เพิ่ม pointer ก่อน แล้วเก็บกวาดใน PR-5
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "formulaId" text REFERENCES public.formulas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS products_formula_idx ON public.products ("formulaId");

-- material_prices: F ผูกกลิ่น · FB ผูกสูตร (PM ไม่ผูกอะไร)
-- ⚠ ไม่แตะ material_prices_identity_uk ในรอบนี้ — ตัวตนยังยึด formulaCode (text)
--   เปลี่ยน unique index = ต้องล้างข้อมูลก่อน ยกไป PR-5 ตอนที่ pointer เต็มแล้ว
ALTER TABLE public.material_prices
  ADD COLUMN IF NOT EXISTS "scentId"   text REFERENCES public.scents(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "formulaId" text REFERENCES public.formulas(id) ON DELETE SET NULL;

-- ── 5) backfill สูตรจาก products (45 แถวบน prod ณ 2026-07-28) ──────────────
-- รวมตามรหัสสูตร (ตัดช่องว่าง/ไม่สนตัวพิมพ์) — สินค้าหลายตัวใช้สูตรเดียวกันได้
INSERT INTO public.formulas (id, code, name, "formulaDate", "customerId", "customerName", status)
SELECT
  'FML-' || md5(lower(btrim(p."formulaCode"))),
  min(btrim(p."formulaCode")),
  min(COALESCE(NULLIF(btrim(p."formulaName"), ''), btrim(p."formulaCode"))),
  max(p."formulaDate"),
  -- ผูกลูกค้าให้เฉพาะสูตรที่ใช้กับลูกค้ารายเดียวล้วน ๆ (ปนกัน = สูตรกลาง)
  CASE WHEN count(DISTINCT p."customerId") = 1 THEN min(p."customerId") END,
  CASE WHEN count(DISTINCT p."customerId") = 1 THEN min(p."customerName") END,
  'active'
  FROM public.products p
 WHERE NULLIF(btrim(p."formulaCode"), '') IS NOT NULL
 GROUP BY lower(btrim(p."formulaCode"))
 ON CONFLICT DO NOTHING;

UPDATE public.products p
   SET "formulaId" = 'FML-' || md5(lower(btrim(p."formulaCode")))
 WHERE NULLIF(btrim(p."formulaCode"), '') IS NOT NULL
   AND p."formulaId" IS NULL;

-- ── 6) RLS (แพตเทิร์นเดิมทั้งระบบ: ปิดหมด เปิดเฉพาะ service_role) ──────────
ALTER TABLE public.scents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scent_revisions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formulas         ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scents, public.scent_revisions, public.formulas
  FROM anon, authenticated;
GRANT  ALL ON TABLE public.scents, public.scent_revisions, public.formulas
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT count(*) FROM formulas;                                    -- ควรได้ 45
-- SELECT count(*) FROM products WHERE "formulaId" IS NOT NULL;      -- ควรได้ 45
-- SELECT count(*) FROM products
--  WHERE NULLIF(btrim("formulaCode"),'') IS NOT NULL AND "formulaId" IS NULL;  -- ต้องได้ 0
```

### 0171 — คำร้องข้ามฝ่าย (เคสขอราคา → คำร้อง) + ลบ inquiries

```sql
-- ============================================================
--  Migration 0171: เคสขอราคาวัสดุ → คำร้องข้ามฝ่าย (dept_requests)
--  แผน docs/cross-department-requests-plan.md ชั้น B
--
--  ระบบมีกลไก "ขอให้ฝ่ายอื่นทำอะไรให้" อยู่ 2 ชุดที่เกือบเหมือนกันแต่คนละคำ
--  คนละตาราง คนละคิว → RD ต้องเฝ้าสองที่ และไม่มีที่ไหนรวมว่างานค้างมีกี่ชิ้น
--    · inquiries (0104)            = เธรดล้วน บังคับดีล ไม่มีบรรทัด ไม่มีคิวรายฝ่าย
--    · material_price_asks (0158)  = เลขที่+สถานะ 6 ขั้น+คิว+บรรทัด+ชั้นจำนวน+เธรดกลาง
--  ตัวหลังใหม่กว่าและมีครบ → ขยายตัวหลังให้รับ "ชนิด" แล้วลบตัวแรกทิ้ง
--
--  ⚠ prod ณ 2026-07-28: inquiries = 0 แถว, material_price_asks = 1 แถว
--    (ตรวจซ้ำก่อนรันจริง — ถ้า inquiries ไม่ว่างแล้วต้องหยุดและเขียน backfill ก่อน)
--  ⚠ รันมือบน Supabase SQL Editor · ต้องรัน **ก่อน** deploy โค้ด PR-2
-- ============================================================

BEGIN;

-- ── 0) ด่านกันลบข้อมูลจริง ─────────────────────────────────────────────────
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.inquiries;
  IF n > 0 THEN
    RAISE EXCEPTION 'inquiries มี % แถว — แผนนี้คิดบนสมมติฐานว่าว่าง หยุดก่อน', n;
  END IF;
END $$;

-- ── 1) เปลี่ยนชื่อตาราง: เคสขอราคา → คำร้อง ────────────────────────────────
ALTER TABLE public.material_price_asks       RENAME TO dept_requests;
ALTER TABLE public.material_price_ask_items  RENAME TO dept_request_items;
ALTER TABLE public.dept_request_items        RENAME COLUMN "askId" TO "requestId";

-- ── 2) ชนิดคำร้อง + บริบทงาน + หมุดไทม์ไลน์ ────────────────────────────────
ALTER TABLE public.dept_requests
  -- ชนิดไม่มี CHECK ที่ระดับ DB โดยเจตนา — ชุดชนิดประกาศในโค้ด
  -- (lib/master/requestTypes.js) แพตเทิร์นเดียวกับ updateTypes/attachmentTypes/
  -- materialTypes: เพิ่มชนิดใหม่ = แก้โค้ดล้วน ไม่ต้องออก migration ทุกครั้ง
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'price_pm',
  -- หัวเรื่อง: ชนิดขอราคาไม่ต้องมี (บรรทัดบอกเองว่าถามอะไร) ชนิดอื่นบังคับที่ API
  ADD COLUMN IF NOT EXISTS title text CHECK (title IS NULL OR length(title) <= 200),
  ADD COLUMN IF NOT EXISTS body  text CHECK (body  IS NULL OR length(body)  <= 4000),
  ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false,
  -- บริบทงาน (บังคับเฉพาะชนิดงานลูกค้า — ตรวจที่ API ไม่ใช่ CHECK เพราะกฎขึ้นกับ kind)
  ADD COLUMN IF NOT EXISTS "dealId"    text,
  ADD COLUMN IF NOT EXISTS "projectId" text,
  -- หมุดขั้นในไทม์ไลน์: เก็บ stepKey ไม่ใช่ taskId — mergeTemplateTasks ลบ/สร้าง task
  -- ใหม่ตอน resync แม่แบบ ผูก id ตรง ๆ แล้วหมุดจะหลุดเงียบ ๆ (resolve ตอนอ่าน)
  ADD COLUMN IF NOT EXISTS "stepKey"   text,
  -- ผูกกลิ่น/สูตรด้วย id (0170) — เลิกอ้างด้วยข้อความ
  ADD COLUMN IF NOT EXISTS "scentId"   text REFERENCES public.scents(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "formulaId" text REFERENCES public.formulas(id) ON DELETE SET NULL,
  -- วันที่ผู้ขอ "อยากได้คำตอบ" vs วันที่ฝ่ายผู้ตอบ "รับปากว่าจะตอบ"
  -- (ยกแนวคิดมาจาก inquiries ที่กำลังจะลบ — เส้นวัด KPI คือตัวหลัง)
  ADD COLUMN IF NOT EXISTS "requestedDueDate" date,
  ADD COLUMN IF NOT EXISTS "committedDueDate" date;

-- dept เดิม CHECK ไว้แค่ RD/PC — ยังพอ (ชนิดใหม่ทั้งหมดไปสองฝ่ายนี้)
-- ถ้าวันหนึ่งต้องส่งถึง LG/QC ค่อยผ่อน CHECK ใน migration แยก

CREATE INDEX IF NOT EXISTS dept_requests_kind_idx    ON public.dept_requests (kind, status);
CREATE INDEX IF NOT EXISTS dept_requests_deal_idx    ON public.dept_requests ("dealId");
CREATE INDEX IF NOT EXISTS dept_requests_project_idx ON public.dept_requests ("projectId", "stepKey");

-- ── 3) แถวเดิมทั้งหมดคือคำร้องขอราคา — เติม kind ให้ถูกตามฝ่าย/ชนิดวัสดุ ────
-- (prod มี 1 แถว แต่เขียนให้ทั่วไปไว้ เผื่อ staging มีมากกว่านั้น)
UPDATE public.dept_requests r
   SET kind = CASE
     WHEN r.dept = 'PC' THEN 'price_pm'
     WHEN EXISTS (SELECT 1 FROM public.dept_request_items i
                   WHERE i."requestId" = r.id AND i.kind = 'RM_F') THEN 'price_f'
     ELSE 'price_fb'
   END;
ALTER TABLE public.dept_requests ALTER COLUMN kind DROP DEFAULT;

-- ── 4) เธรดกลาง: entityType 'material_ask' → 'dept_request' ────────────────
UPDATE public.entity_updates
   SET "entityType" = 'dept_request'
 WHERE "entityType" = 'material_ask';

-- ไฟล์แนบ (polymorphic, ไม่มี CHECK entityType — ดู lib/master/attachmentTypes.js)
UPDATE public.attachments
   SET "entityType" = 'dept_request_item'
 WHERE "entityType" = 'material_ask_item';

-- ── 5) ลบระบบสอบถามเดิม (0 แถว — ยืนยันด้วยด่านข้อ 0 แล้ว) ─────────────────
DROP TABLE IF EXISTS public.inquiry_messages;
DROP TABLE IF EXISTS public.inquiries;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT kind, count(*) FROM dept_requests GROUP BY 1;
-- SELECT count(*) FROM entity_updates WHERE "entityType" = 'material_ask';   -- ต้องได้ 0
-- SELECT count(*) FROM attachments    WHERE "entityType" = 'material_ask_item'; -- ต้องได้ 0
--
-- Rollback: RENAME กลับ + DROP คอลัมน์ที่เพิ่ม + UPDATE entityType กลับ
--           (ตาราง inquiries สร้างใหม่จาก 0104 ได้ เพราะไม่มีข้อมูลให้กู้)
```

### 0172 — ของเข้า PM/RM ระดับโครงการ

```sql
-- ============================================================
--  Migration 0172: รายการของเข้า PM/RM ระดับโครงการ (material_deliveries)
--  แผน docs/cross-department-requests-plan.md ชั้น C
--
--  ของเดิม: การติดตามของเข้ามีเฉพาะสายสหมิตร (sahamit_material_tracking —
--  pmDueDate/rmDueDate/arrivedAt ราย PO line) · งานทั่วไปมีแค่ task เดียวใน
--  ไทม์ไลน์ "สั่งซื้อสารและบรรจุภัณฑ์ — กำหนดของเข้าทั้งหมด" (45 วัน) ที่ไม่มี
--  อะไรอยู่ข้างใน → SA ถาม PC ทีไรก็ต้องไล่ถามเป็นรายตัวนอกระบบ
--
--  ⚠ รันมือบน Supabase SQL Editor · ต้องรัน **ก่อน** deploy โค้ด PR-4
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.material_deliveries (
  id              text PRIMARY KEY,
  "projectId"     text NOT NULL,
  "dealId"        text,
  -- ผูกวัสดุในทะเบียนถ้ามี (ปิดบั๊กตระกูล "จับคู่ด้วยข้อความ") · label เป็น snapshot เสมอ
  "materialId"    text REFERENCES public.material_prices(id) ON DELETE SET NULL,
  kind            text NOT NULL CHECK (kind IN ('RM_F', 'RM_FB', 'PM')),
  label           text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  qty             numeric CHECK (qty IS NULL OR qty > 0),
  unit            text,
  "poRef"         text,                             -- เลข PR/PO ภายนอก (Express)
  "dueDate"       date,                             -- กำหนดถึง
  "arrivedAt"     date,                             -- มาแล้ว (null = ยังไม่มา)
  "ownerId"       text, "ownerName" text,           -- PC ผู้รับผิดชอบ
  -- คำร้องติดตามที่ทำให้แถวนี้ถูกอัปเดตล่าสุด (logical link ไม่ใส่ FK — คำร้องถูกลบได้
  -- แต่ข้อมูลของเข้าต้องอยู่ต่อ)
  "requestId"     text,
  note            text CHECK (note IS NULL OR length(note) <= 1000),
  "createdById"   text, "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  -- ของมาก่อนกำหนดได้ แต่ต้องไม่มาก่อนวันสร้างแถวแบบไร้เหตุผล → ตรวจที่ API
  CHECK ("arrivedAt" IS NULL OR "dueDate" IS NULL OR "arrivedAt" >= '2000-01-01')
);
CREATE INDEX IF NOT EXISTS material_deliveries_project_idx
  ON public.material_deliveries ("projectId", "dueDate");
CREATE INDEX IF NOT EXISTS material_deliveries_open_idx
  ON public.material_deliveries ("projectId") WHERE "arrivedAt" IS NULL;

ALTER TABLE public.material_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.material_deliveries FROM anon, authenticated;
GRANT  ALL ON TABLE public.material_deliveries TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
```

---

## 6. ลำดับ PR

### PR-1 — ทะเบียนกลิ่น + สูตร (mig 0170)

| ไฟล์ | งาน |
|---|---|
| `supabase/migrations/0170_scent_formula_registry.sql` | DDL + backfill |
| `lib/master/scents.js` (ใหม่) | logic: สถานะ, Rev, feedback, ตัวตนกลิ่น, สิทธิ์ (RD เป็นเจ้าของ) |
| `lib/master/formulas.js` (ใหม่) | logic: normalize รหัส/ชื่อ, ผูกกลิ่น |
| `app/api/master/scents/**` · `formulas/**` | CRUD + `POST /scents/[id]/revisions` (ส่งกลิ่น) + `PATCH .../feedback` |
| `app/database/scents/page.js` · `formulas/page.js` | ทะเบียน + ฟอร์มเดียวใช้ทั้งสร้าง/แก้ (กฎ AGENTS.md) |
| `components/AppLayout.js` | เมนู "ทะเบียนกลิ่น" / "ทะเบียนสูตร" ใต้ฐานข้อมูล |
| `components/database/ProductForm.js` | ช่องสูตร: text → `FormulaPicker` (คงค่าเดิมอ่านได้) |
| `lib/master/updateTypes.js` | เธรด `scent` (comment / sent / feedback) |
| `src/proxy.js` | ลงทะเบียน endpoint ใหม่ (allowlist default-deny — ไม่ลงทะเบียน = non-admin 403 เงียบ) |
| เทสต์ | `scents.test.mjs` · `formulas.test.mjs` |

**เกณฑ์ผ่าน:** สร้างกลิ่น → ส่ง Rev 1 → บันทึก feedback `revise` → ส่ง Rev 2 → `approved`;
สินค้า 45 ตัวชี้ `formulaId` ครบ; ทะเบียนสูตรเลือกกลิ่นได้

### PR-2 — รวมคำร้อง (mig 0171)

| ไฟล์ | งาน |
|---|---|
| `supabase/migrations/0171_dept_requests.sql` | rename + kind + บริบท + ลบ inquiries |
| `lib/master/requestTypes.js` (ใหม่) | ชุดชนิด: ฝ่ายปลายทาง · scope เลขที่ · บังคับดีลไหม · มีบรรทัดไหม · stepKey |
| `lib/deptRequests.js` (จาก `lib/materialAsks.js`) | logic เดิม + แตกกฎตามชนิด |
| `app/api/sa/requests/**` (จาก `/api/sa/materials/asks/**`) | + redirect เส้นเก่า |
| `app/sa/requests/page.js` | คิวฝ่ายฉัน / ที่ฉันเปิด / ทั้งหมด + ตัวกรองชนิด |
| **ลบ** `app/sa/inquiries/**` · `app/api/sales-planning/inquiries/**` · `lib/inquiries.js` · `components/salesPlanning/Inquiry*` | ~1,400 บรรทัด |
| `lib/salesDetailTabs.js` · หน้าดีล | แท็บ "สอบถาม RD" → "คำร้อง" |
| `lib/chat.js` | การ์ดแจ้งเตือนรวมเป็นใบเดียว ต่อชนิด |

**เกณฑ์ผ่าน:** เคสเดิมบน prod เปิดได้เหมือนเดิม เลข `PM-`/`RM-` ไม่เปลี่ยน เธรด/ไฟล์แนบครบ;
ไม่มีลิงก์ค้างชี้ `/sa/inquiries`

> ⚠️ **ห้ามลืม 5 จุดของไฟล์แนบ** เมื่อ entityType เปลี่ยน — `loadParent` + view gate + edit gate
> ของ `/api/attachments` · `lib/drive.js resolveFolderForEntity` · `PARENT_TABLE` ใน
> `lib/master/attachments.js` (รายการเต็มอยู่หัวไฟล์ `lib/master/costingAttachmentAccess.js`)

### PR-3 — ชนิดที่มีผลลัพธ์ (โค้ดล้วน)

- `scent_brief` ปิดเคส → สร้าง/ผูกแถวใน `scents` + ปักหมุด `scent-06`
- `mockup` → ปักหมุด `npd-15`
- `price_pm` → ปักหมุด `npd-25` (ตามมติข้อ 6)
- `price_f` / `price_fb` → ฟอร์มเลือก **กลิ่น/สูตรจากทะเบียน** แทนพิมพ์ชื่อ; ตอบราคาแล้ว
  rev เข้าทะเบียนวัสดุที่ผูก `scentId`/`formulaId`
- การ์ด "คำร้องที่ผูกขั้นนี้" บนไทม์ไลน์ (หน้าดีล/โครงการ) — resolve จาก `projectId + stepKey`

### PR-4 — ของเข้า & กำหนดการผลิต (mig 0172)

- ตาราง `material_deliveries` + หน้า/แท็บในโครงการ + `PATCH` รายแถว (กำหนดถึง / มาแล้ว)
- สรุปขึ้นขั้น `npd-38` / `re-order-11`: `x/y รายการมาแล้ว · ช้าสุด <วันที่>`
- คำร้อง `material_eta` = SA กดขอให้ PC อัปเดตทั้งชุด (ไม่ใช่ไล่ถามทีละตัว)
- เมนูสหมิตร `วัสดุ / Lead time` → `ของเข้า (สหมิตร)` (แก้ชื่อชนกันอย่างเดียว ไม่ยุบรวม)

### PR-5 — เก็บกวาด

- ย้ายทะเบียนวัสดุจาก `/sa/materials` → `/database/materials` (เมนู "วัสดุ" เดิมหายไป)
- `products.formulaName/formulaCode/formulaDate` → อ่านผ่าน `formulaId` แล้วค่อยเลิกใช้ช่องข้อความ
  (snapshot บนเอกสารที่ออกแล้วห้ามแตะ)
- `material_prices_identity_uk` เปลี่ยนจาก `formulaCode` (text) → `formulaId`
- ลบ scope `IQ` ออกจากเอกสารประกอบ

---

## 7. ความเสี่ยง & กฎที่ต้องเคารพ

| ความเสี่ยง | กันอย่างไร |
|---|---|
| migration 0169 ซ้ำสองไฟล์บน main | รัน `npm run check:schema` ยืนยันทั้งคู่ **ก่อน** ออก 0170 |
| rename ตารางแล้ว PostgREST cache ค้าง | `NOTIFY pgrst, 'reload schema'` ท้ายทุก migration (มีในทุกไฟล์แล้ว) |
| ไฟล์แนบพังตอนเปลี่ยน entityType | ต่อครบ 5 จุด (ดู PR-2) — เคยพลาดมาแล้วสองรอบ (#733) |
| `Number(null) = 0` ทำ "ยังไม่รู้ราคา" กลายเป็น "ฟรี" | ใช้ `numberOrNull` ทุกจุดที่คำนวณต้นทุน |
| rev ของ**ราคา** เป็น immutable แต่ rev ของ**กลิ่น**แก้ได้ | อย่าลอก guard ของ `material_price_revisions` มาใส่ `scent_revisions` — feedback มาทีหลังวันส่ง |
| หมุดไทม์ไลน์หลุดตอน resync แม่แบบ | เก็บ `stepKey` ไม่ใช่ `projectTaskId` |
| endpoint ใหม่ 403 เงียบ ๆ | proxy เป็น allowlist default-deny — ลงทะเบียนทุกเส้นใหม่ |
| ฟอร์มสร้าง/แก้เพี้ยนหากัน | component เดียวสองโหมด (กฎ `webapp/AGENTS.md`) |
| Vercel ไม่ build หลัง merge | ตรวจ `gh api repos/SittipongSS/ss_system/deployments` เทียบ sha |

---

## 8. คำถามที่ยังไม่ได้ตัดสิน

1. **เลขที่ `RQ-` สำหรับคำร้องที่ไม่ใช่ขอราคา** — ใช้เลขชุดเดียวทุกชนิด หรืออยากได้พรีฟิกซ์
   แยกต่อชนิด (`SB-` บรีฟกลิ่น, `MU-` mockup)?
2. **รหัสกลิ่น** — ให้ระบบออกเลขรัน `SC-YYMMXXXX` หรือ RD กรอกรหัสของตัวเองเหมือนรหัสสูตร?
3. **กลิ่นกลาง vs กลิ่นของลูกค้า** — กลิ่นที่ออกแบบให้ลูกค้า A ใช้กับลูกค้า B ได้ไหม
   (กระทบ `scents_identity_uk` และการมองเห็น)
4. **ใครแก้ทะเบียนกลิ่นได้** — RD เท่านั้น หรือ SA สร้างร่างได้แล้ว RD รับ (แบบทะเบียนวัสดุ)
5. **`material_eta` ดึงรายการของเข้าจากไหนตอนเริ่ม** — PC กรอกเอง หรือ generate จากบรรทัด
   ในใบขอราคาผลิตที่อนุมัติแล้ว
