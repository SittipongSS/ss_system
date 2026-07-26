# แผน implement: ระบบขอราคาผลิต (Costing Request)

> สถานะ: **ฉบับแก้ไขครั้งที่ 5 — สร้างครบทั้ง 3 PR แล้ว** (PR-1 #729 · PR-2 #731 · PR-3)
> mig 0157/0158 รัน prod แล้ว 2026-07-26 · **0159 ต้องรันก่อน deploy PR-3**
> ฉบับที่ 1 (MERGED #637) ใบเดียวจบวงจร — สร้างครบ 6 PR (#638–#650)
> ฉบับที่ 3 (MERGED #659) แยก 2 เอกสาร MR + CR — สร้างครบ 3 PR (#662/#665/#666) **ใช้จริงไม่ได้** (ข้อ 0)
> ฉบับที่ 4 (MERGED #723) ยุบใบ MR เป็น "คิว" ไม่มีเลขที่ — **สมมติฐานผิด** ผู้ใช้ยืนยันว่าคำขอราคา
> ต้องเป็นเคสที่มีเลขที่/สถานะ/รูปแนบ/ชั้นจำนวน (ข้อ 0.2) · ยังไม่มีโค้ดฉบับ 4 ถูกเขียน
> ฉบับนี้ = โครงของฉบับ 4 (ทะเบียนวัสดุเป็น master, ผูกด้วย id) + คำขอราคากลับมาเป็น **เคส**

## 0. ทำไมต้องรื้อ

### 0.1 ฉบับ 3 แยกผิดแกน — บั๊ก 7 ข้อ (ตรวจโค้ดจริงยืนยันครบทุกข้อ 2026-07-26)

ราคาวัสดุเป็น **ข้อมูลหลัก** (มีตัวตนถาวร ใช้ซ้ำ มีประวัติราคา) ส่วนใบขอราคาผลิตเป็น
**เอกสารงาน** — ฉบับ 3 ทำใบขอราคาวัสดุ (MR-) เป็นเอกสารคู่ขนานกับใบ CR ตัวเชื่อมระหว่าง
สองใบจึงเหลือแค่ **ข้อความชื่อวัสดุ** และ 5 ใน 7 บั๊กมาจากจุดนี้จุดเดียว:

| # | อาการ | ที่ | หายเมื่อ |
|---|---|---|---|
| 1 🔴 | RD/PC กด "แก้ราคา" ในคลัง = 403 เสมอ (proxy กั้นด้วย `costing:edit` ที่ RD/PC ไม่มี) | `src/proxy.js:263` | PR-1 |
| 2 🔴 | ตอบใบ MR ทุกครั้ง = สร้างวัสดุ**ตัวใหม่** ไม่เคยเป็น rev.2 (บรรทัดไม่เคยมี `materialId`) | `materialPrices.js:126` → `answer/route.js:53` → `materialPricesAdmin.js:77` | PR-1+2 |
| 3 🔴 | `gramsPerUnit` แก้บนใบไม่ได้เลย → แม่แบบไม่ใส่กรัม = ใบค้างถาวร | เขียนที่เดียวคือ `costingAdmin.js:69` (จากแม่แบบ) | PR-3 |
| 4 🟠 | จับคู่คลัง↔บรรทัดด้วยชื่อตรงเป๊ะ (`norm(label)===norm(label)`) — เปราะ พึ่งการพิมพ์ให้ตรง | `materialPrices.js:75` `bestPriceFor` | PR-3 (ผูกด้วย id) |
| 5 🟠 | ราคาทับรายลูกค้าใช้ไม่ได้ — ฟอร์มส่งแต่ `customerName` ไม่ส่ง `customerId` | `requests/page.js:55` | PR-2 |
| 6 🟡 | บรรทัดเกินอายุติดธง "รอยืนยัน" แต่ไม่มีคิว/แจ้งเตือนให้ RD/PC (ไม่มี `sendChat` ทั้งไฟล์) | `fill-prices/route.js` | PR-2 |
| 7 🟡 | `priceSource='manual'` ไม่มีโค้ดไหนเขียน · `confirmStatus` ซ้ำซ้อนกับเคส | mig 0144 | PR-3 |

### 0.2 ฉบับ 4 ทำคำขอราคาบางเกินไป — สเปกจริงจากผู้ใช้ (2026-07-26)

ฉบับ 4 เขียนว่า *"คำขอราคาเป็นคิว ไม่ใช่เอกสาร ไม่มีเลขที่ ไม่มีสถานะใบ"* ผู้ใช้อธิบายของจริง:

**เส้น PM → PC** เซลยื่นเคสขอราคาบรรจุภัณฑ์ พร้อม **สเปกละเอียด** ("ขวดขนาด 30 ml สีชา
สกรีนที่ขวด 1 จุด 1 สี") · **แนบรูปได้ และในหน้ารายละเอียดต้องพรีวิวรูปได้เลย** ·
ขอ **ราคาต่อชิ้นเป็นหลายชั้นจำนวน** · **ติดตามสถานะ**ได้ว่า PC รับเรื่อง/เปิดเคสแล้ว →
แจ้งราคา → ปิดเคส · **มีเลขที่เคส**

**เส้น RM (F/FB) → RD** "ลูกค้าคอนเฟิร์มสูตรนี้ ขอราคา F / FB ต่อ กก."

### 0.3 สิ่งที่ยังถูกจากฉบับ 4 (คงไว้ทั้งหมด)

ทะเบียนวัสดุเป็น master (ไม่ใช่เอกสาร) · บรรทัดในใบ CR ผูกวัสดุด้วย **id** ไม่ใช่ชื่อ ·
วัสดุร่างที่เซลเสนอรอ RD/PC รับ · ราคาที่ดึงไปแล้วตรึงเป็น snapshot · prod ยังไม่มีข้อมูลจริง
จึง drop ตาราง MR ตรงได้

## 1. มติที่ล็อกแล้ว (2026-07-26)

1. **ชั้นจำนวนที่ขอ เซลระบุเองอิสระ — ห้ามกำหนดตายตัวว่าจะขอชั้นอะไรบ้าง** ระบบ*แนะนำ*ได้
   (ปุ่มเร็ว/ค่าที่เคยใช้) แต่ไม่มีชุดค่าบังคับ และไม่มี CHECK ค่าใน DB
2. **เซลเป็นคนเลือกว่าจะใช้ชั้นไหนไปคิดต้นทุนในใบ CR** เพราะ **จำนวนวัสดุ ≠ จำนวนสินค้า**
   (3 SKU × 1000 ชิ้น ใช้ขวดแบบเดียวกัน → ต้องใช้ราคาชั้น 3000)
   → **ผลสำคัญ: ไม่ต้องแก้สูตร `itemUnitCost` ให้ขึ้นกับชั้นจำนวนของใบเลย** บรรทัดยัง snapshot
   ราคา **ค่าเดียว** เหมือนเดิม เพิ่มแค่ `priceTierQty` ว่าเลือกชั้นไหนมา (ไว้ให้ตรวจย้อนหลัง)
3. **1 เคส = หลายรายการ** (ขวด + ฝา + กล่อง ของงานเดียวกันอยู่เคสเดียว) — โครงหัว/บรรทัด
   เหมือนใบ MR เดิม **แต่บรรทัดผูก `materialId` ในทะเบียนเสมอ** (ปิดบั๊ก 2)
4. **เลขที่เคสแยกตามฝ่าย: `PM-YYMMXXXX` (→PC) / `RM-YYMMXXXX` (→RD)** — scope ใหม่ 2 ตัวใน
   `next_entity_number`, เลิกใช้ `MR`; **เลขออกตอนกดส่ง ไม่ใช่ตอนสร้างร่าง** (บทเรียน PR3a:
   ร่างที่ถูกทิ้งจะกินเลขจนขาดช่วง)
5. **แนบไฟล์อยู่ระดับ "รายการในเคส"** ไม่ใช่ทั้งเคส — ตามแพตเทิร์น `costing_item` ที่ตัดสินไว้
   แล้วตอน PR5 ("รูปตัวอย่าง/สเปกเป็นของวัสดุตัวนั้น RD/PC ดูประกอบตอนตอบราคา")
6. **สเปกเป็นข้อความยาวช่องเดียว + รูปแนบ** ยังไม่แตกเป็นคอลัมน์ ขนาด/สี/จุดสกรีน — PM มีทั้ง
   ขวด/ฝา/กล่อง/ฉลาก โครงคนละแบบ ล็อกคอลัมน์ตอนนี้จะกรอกไม่ลงตัวสักอย่าง
7. **ต้องมีทางปิดเคสแบบไม่มีราคา** (`no_quote` + เหตุผล) — PC ตอบว่า "ทำไม่ได้ / โรงงานไม่รับ /
   เลิกผลิตแล้ว" ได้ ไม่งั้นเคสพวกนี้ค้าง open ตลอดไป
8. **ตัวตนวัสดุ RM ยึด `formulaCode` ไม่ใช่ข้อความชื่อ** — "F ของสูตร A" คนละตัวกับ "F ของสูตร B"
   แต่ชื่อพิมพ์เหมือนกันได้ ถ้า identity เป็น (kind, ชื่อ, ลูกค้า) ราคาสองสูตรจะทับกันเงียบ ๆ
9. **ราคาอยู่ที่ชั้นเท่านั้น (one source of truth)** — ย้าย `pricePerKg/pricePerUnit` ออกจาก
   `material_price_revisions` ไปอยู่ตาราง tier; `qty IS NULL` = ราคาเดียวไม่แบ่งชั้น (เคส RM)
10. มติเดิมที่คงอยู่: อนุมัติรายสินค้า + ตัวนับ x/y นับสด · ผู้บริหารคนเดียวจบ + ลายเซ็น ·
    ดีล/FG optional · revise = ใบใหม่ rev.2 · แม่แบบ = admin + ซ่อนแทนลบ · อายุราคา default
    90 วัน · คำศัพท์ "ราคาผลิต" · กรัม/ชิ้น แก้ได้บนบรรทัด (แม่แบบให้แค่ค่าตั้งต้น)

## 2. โครงใหม่

```
┌─ ทะเบียนวัสดุ (master data — ไม่ใช่เอกสาร ไม่มีเลขที่) ────────────────┐
│ วัสดุมี id จริง · PM ยึดชื่อ / RM ยึดสูตร · ราคาเป็น rev (immutable)     │
│ 1 rev มีได้หลายชั้นจำนวน · มีอายุ · ราคากลาง / ทับรายลูกค้า              │
│ เซลเพิ่มวัสดุได้เป็น "ร่าง" → RD/PC รับ + ใส่ราคา = "ใช้งาน"             │
└────────┬──────────────────────────────────────────────┬───────────────┘
  เลือกวัสดุ│                                            │ ตอบ = rev ใหม่
         ↓                                              ↑
╔═ เคสขอราคาวัสดุ PM-YYMMXXXX / RM-YYMMXXXX ════════════════════════════╗
║ 1 เคส = หลายรายการ · แต่ละรายการ: วัสดุในทะเบียน + สเปก + รูปแนบ        ║
║   + ชั้นจำนวนที่อยากรู้ราคา (เซลใส่เอง เช่น 1000/3000/5000)              ║
║ สถานะ: ร่าง → ส่งแล้ว → PC/RD รับเรื่อง → ตอบราคา → ปิดเคส              ║
║ ตอบราคา = ออก rev ใหม่ให้วัสดุตัวนั้นในทะเบียน (ไม่เกิดวัสดุใหม่)         ║
╚════════════════════════════════════════════════════════════════════════╝
         ↓ เซลเลือก "ชั้นไหน" ไปใช้
╔═ ใบขอราคาผลิต CR-YYMMXXXX ═════════════════════════════════════════════╗
║ กางบรรทัดตามแม่แบบประเภทสินค้า (คงเดิม)                                 ║
║ แต่ละบรรทัด: เลือกวัสดุจากทะเบียน + กรอกกรัม/ชิ้น (แก้ได้)               ║
║   + เลือกชั้นราคา (ระบบแนะนำจากจำนวนในใบ แต่เซลตัดสิน) → snapshot ค่าเดียว║
║   ไม่มีราคา/เกินอายุ → กด "ขอราคา" ในใบ = เปิดเคส (ผูกกลับบรรทัดนี้)      ║
║ ครบทุกบรรทัดบังคับ = ปลดล็อกส่งผู้บริหาร                                 ║
║ ผู้บริหารเคาะราคาผลิตต่อชั้นจำนวน รายสินค้า + ลายเซ็น → ผูก FG → ป้อนราคา ║
╚════════════════════════════════════════════════════════════════════════╝
```

**หายไปจากระบบ:** ใบขอราคาวัสดุ `MR-` ทั้งชุด (ตาราง/หน้า/API/เลขที่) · การจับคู่ตามชื่อ ·
ธง `confirmStatus` บนบรรทัด (แทนด้วยเคส) · `priceSource` (มี `materialRevisionId` บอกที่มาแล้ว)

### วงจรสถานะ

```
วัสดุ:    draft ──RD/PC รับ+ใส่ราคา──▶ active ──ซ่อน──▶ archived
           ▲ เซลเสนอ                  └─ ราคา rev N (หลายชั้น, มีอายุ) ─┘

เคส:      draft ──ส่ง(ออกเลข)──▶ pending ──RD/PC กดรับเรื่อง──▶ acknowledged
            │                                                      │
            └──ยกเลิก(ร่าง)──▶ cancelled          ตอบครบทุกรายการ ──┘
                                                        ↓
                                          answered ──ผู้ขอปิด/auto──▶ closed
          รายการในเคส: pending → quoted (มี rev) | no_quote (มีเหตุผล)

ใบ CR:    draft → pricing → assembling → pending_exec ⇄ returned → approved → linked
                   ▲ มีเคสค้าง         ▲ ราคาครบทุกบรรทัดบังคับ
```

## 3. โมเดลข้อมูล

migration ล่าสุด = 0156 → ใช้ **0157 / 0158 / 0159** ตัวละ PR (ดูข้อ 6 — เจตนาให้แต่ละ
migration ไปคู่กับโค้ดที่ต้องใช้มัน ไม่ drop คอลัมน์ล่วงหน้าก่อนโค้ดที่ยังเขียนคอลัมน์นั้นถูกแก้)

ตารางที่**ไม่แตะเลย**: `product_type_cost_templates/lines` (0140) · `costing_requests` ·
`costing_request_items` · `costing_item_tiers` (0141) · ป้อนต้นทุน (0142) · `attachments` (0028
— polymorphic ไม่มี CHECK `entityType` เพิ่ม entity ใหม่เป็น **โค้ดล้วน ไม่ต้อง migration**)

### 0157 — ทะเบียนวัสดุ + ราคาชั้นจำนวน (PR-1)

```sql
BEGIN;

-- ── 1) material_prices → ทะเบียน (master) ────────────────────────────────
ALTER TABLE public.material_prices
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  -- ตัวตนของ RM = สูตร (มติ 8) · snapshot ชื่อสูตรไว้แสดง
  ADD COLUMN IF NOT EXISTS "formulaCode"    text,
  ADD COLUMN IF NOT EXISTS "formulaName"    text,
  ADD COLUMN IF NOT EXISTS "acceptedById"   text,
  ADD COLUMN IF NOT EXISTS "acceptedByName" text,
  ADD COLUMN IF NOT EXISTS "acceptedAt"     timestamptz;

UPDATE public.material_prices SET status = 'archived' WHERE "isHidden" = true;
DROP INDEX IF EXISTS public.material_prices_kind_idx;      -- index เดิมอ้าง isHidden
ALTER TABLE public.material_prices DROP COLUMN IF EXISTS "isHidden";
CREATE INDEX material_prices_kind_idx ON public.material_prices (kind, status);
CREATE INDEX material_prices_formula_idx ON public.material_prices ("formulaCode")
  WHERE "formulaCode" IS NOT NULL;

-- ⚠️ ก่อนสร้าง UNIQUE: เช็คของทดลองที่ซ้ำอยู่ (บั๊ก 2 ทำให้มีได้) แล้วล้างก่อน
--   SELECT kind, lower(btrim(label)) l, coalesce("formulaCode",'') f,
--          coalesce("customerId",'') c, count(*)
--   FROM public.material_prices GROUP BY 1,2,3,4 HAVING count(*) > 1;
CREATE UNIQUE INDEX material_prices_identity_uk ON public.material_prices
  (kind, lower(btrim(label)), coalesce("formulaCode", ''), coalesce("customerId", ''));

-- ── 2) ราคาเป็นชั้นจำนวน — ย้ายราคาไปอยู่ที่ tier ที่เดียว (มติ 9) ──────
CREATE TABLE IF NOT EXISTS public.material_price_revision_tiers (
  id             text PRIMARY KEY,
  "revisionId"   text NOT NULL REFERENCES public.material_price_revisions(id) ON DELETE CASCADE,
  -- null = ราคาเดียวไม่แบ่งชั้น (เคส RM ต่อ กก.) · มีค่า = ราคาที่ปริมาณสั่งนี้
  qty            numeric CHECK (qty IS NULL OR qty > 0),
  "pricePerKg"   numeric CHECK ("pricePerKg"   IS NULL OR "pricePerKg"   >= 0),
  "pricePerUnit" numeric CHECK ("pricePerUnit" IS NULL OR "pricePerUnit" >= 0),
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  -- ต้องมีราคาจริงเสมอ และลงช่องเดียว (หน่วยจริงยึด revisions."unitBasis")
  CONSTRAINT material_price_revision_tiers_one_price CHECK (
    ("pricePerKg" IS NOT NULL AND "pricePerUnit" IS NULL)
    OR ("pricePerKg" IS NULL AND "pricePerUnit" IS NOT NULL)
  )
);
-- 0 เป็น sentinel ปลอดภัยเพราะ CHECK ห้าม qty = 0
CREATE UNIQUE INDEX material_price_revision_tiers_uk
  ON public.material_price_revision_tiers ("revisionId", coalesce(qty, 0));

-- ย้ายราคาที่มีอยู่ (ถ้ามี) ไปเป็นชั้น "ไม่แบ่งชั้น" แล้วถอดคอลัมน์เดิม
INSERT INTO public.material_price_revision_tiers (id, "revisionId", qty, "pricePerKg", "pricePerUnit")
SELECT 'MRT-' || id, id, NULL, "pricePerKg", "pricePerUnit"
  FROM public.material_price_revisions
 ON CONFLICT DO NOTHING;

ALTER TABLE public.material_price_revisions
  DROP CONSTRAINT IF EXISTS material_price_revisions_price_matches_basis,
  DROP COLUMN IF EXISTS "pricePerKg",
  DROP COLUMN IF EXISTS "pricePerUnit",
  -- ที่มาของ rev: รายการในเคสไหน (logical link ไม่ใส่ FK — เหตุผลใน 0158)
  ADD COLUMN IF NOT EXISTS "sourceAskItemId" text;

-- ชั้นราคาต้อง immutable เหมือน rev (แพตเทิร์น 0143)
CREATE OR REPLACE FUNCTION public.guard_material_price_revision_tier()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'material_price_revision_tier_immutable';
END;
$$;
DROP TRIGGER IF EXISTS material_price_revision_tiers_guard ON public.material_price_revision_tiers;
CREATE TRIGGER material_price_revision_tiers_guard
BEFORE UPDATE OR DELETE ON public.material_price_revision_tiers
FOR EACH ROW EXECUTE FUNCTION public.guard_material_price_revision_tier();

-- ── 3) ออก rev + ชั้นราคา ต้องเป็น transaction เดียว ────────────────────
-- ⚠️ เหตุผล: rev ลบไม่ได้ (guard) ถ้าแอปเขียน rev สำเร็จแล้ว insert ชั้นราคาพัง
--    จะได้ rev ที่ไม่มีราคาค้างถาวรและกู้ไม่ได้ → ต้องผ่าน RPC ตัวเดียว
--    (แพตเทิร์นเดียวกับ next_entity_number / force_delete_*)
CREATE OR REPLACE FUNCTION public.append_material_price_revision(
  p_material_id text,
  p_unit_basis  text,
  p_tiers       jsonb,     -- [{ qty: number|null, price: number }, ...]
  p_valid_until date   DEFAULT NULL,
  p_quoted_by   text   DEFAULT NULL,
  p_quoted_name text   DEFAULT NULL,
  p_note        text   DEFAULT NULL,
  p_ask_item_id text   DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rev_no  integer;
  v_rev_id  text := 'MREV-' || gen_random_uuid();
  v_tier    jsonb;
BEGIN
  IF p_tiers IS NULL OR jsonb_array_length(p_tiers) = 0 THEN
    RAISE EXCEPTION 'material_revision_needs_price';
  END IF;
  SELECT COALESCE(MAX("revisionNo"), 0) + 1 INTO v_rev_no
    FROM material_price_revisions WHERE "materialId" = p_material_id;

  INSERT INTO material_price_revisions
    (id, "materialId", "revisionNo", "unitBasis", "validUntil",
     "quotedById", "quotedByName", note, "sourceAskItemId")
  VALUES (v_rev_id, p_material_id, v_rev_no, p_unit_basis, p_valid_until,
     p_quoted_by, p_quoted_name, p_note, p_ask_item_id);

  FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers) LOOP
    INSERT INTO material_price_revision_tiers
      (id, "revisionId", qty, "pricePerKg", "pricePerUnit")
    VALUES ('MRT-' || gen_random_uuid(), v_rev_id,
      NULLIF(v_tier->>'qty', '')::numeric,
      CASE WHEN p_unit_basis = 'per_kg'    THEN (v_tier->>'price')::numeric END,
      CASE WHEN p_unit_basis = 'per_piece' THEN (v_tier->>'price')::numeric END);
  END LOOP;

  RETURN jsonb_build_object('revisionId', v_rev_id, 'revisionNo', v_rev_no);
END;
$$;
REVOKE ALL ON FUNCTION public.append_material_price_revision(text,text,jsonb,date,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_material_price_revision(text,text,jsonb,date,text,text,text,text)
  TO service_role;

ALTER TABLE public.material_price_revision_tiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.material_price_revision_tiers FROM anon, authenticated;
GRANT  ALL ON TABLE public.material_price_revision_tiers TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
```

### 0158 — เคสขอราคาวัสดุ + ถอนใบ MR (PR-2)

```sql
BEGIN;

-- ── 1) หัวเคส ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.material_price_asks (
  id                text PRIMARY KEY,
  "docNo"           text UNIQUE,          -- PM-YYMMXXXX / RM-YYMMXXXX (ออกตอนส่ง)
  dept              text NOT NULL CHECK (dept IN ('RD', 'PC')),   -- ฝ่ายผู้ตอบ = scope เลข
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN (
                      'draft', 'pending', 'acknowledged', 'answered', 'closed', 'cancelled')),
  "customerId"      text, "customerName" text,   -- มีค่า = ขอราคาเฉพาะลูกค้ารายนี้
  -- RM: สินค้า/สูตรที่ลูกค้าคอนเฟิร์ม (snapshot — สูตรเปลี่ยนทีหลังเคสเก่าไม่เพี้ยน)
  "productId"       text, "productName" text,
  "formulaCode"     text, "formulaName" text, "formulaDate" date,
  -- ถามจากในใบ CR (null = ถามลอย ๆ จากทะเบียน) — ลบใบแล้วเคสยังอยู่เป็นหลักฐาน
  "costingRequestId" text REFERENCES public.costing_requests(id) ON DELETE SET NULL,
  "requestedById"   text NOT NULL, "requestedByName" text, team text,
  note              text CHECK (note IS NULL OR length(note) <= 2000),
  "submittedAt"     timestamptz,
  "acknowledgedById" text, "acknowledgedByName" text, "acknowledgedAt" timestamptz,
  "answeredAt"      timestamptz,
  "closedById"      text, "closedByName" text, "closedAt" timestamptz,
  "cancelReason"    text CHECK ("cancelReason" IS NULL OR length("cancelReason") <= 500),
  "cancelledAt"     timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'cancelled'    OR "cancelledAt" IS NOT NULL),
  CHECK (status <> 'acknowledged' OR "acknowledgedAt" IS NOT NULL),
  CHECK (status <> 'closed'       OR "closedAt" IS NOT NULL),
  -- เลขออกตอนส่ง: ร่าง/ยกเลิกร่างไม่กินเลข (บทเรียน PR3a)
  CHECK (status IN ('draft', 'cancelled') OR "docNo" IS NOT NULL)
);
CREATE INDEX material_price_asks_queue_idx   ON public.material_price_asks (dept, status, "submittedAt" DESC);
CREATE INDEX material_price_asks_owner_idx   ON public.material_price_asks ("requestedById");
CREATE INDEX material_price_asks_costing_idx ON public.material_price_asks ("costingRequestId");

-- ── 2) รายการในเคส (1 เคส = หลายรายการ — มติ 3) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.material_price_ask_items (
  id                text PRIMARY KEY,
  "askId"           text NOT NULL REFERENCES public.material_price_asks(id) ON DELETE CASCADE,
  "sortOrder"       integer NOT NULL DEFAULT 0,
  kind              text NOT NULL CHECK (kind IN ('RM_F', 'RM_FB', 'PM')),
  -- ผูกทะเบียนเสมอ (ปิดบั๊ก 2): ของใหม่ = API สร้างวัสดุ "ร่าง" ให้ก่อนแล้วผูก
  "materialId"      text NOT NULL REFERENCES public.material_prices(id) ON DELETE RESTRICT,
  label             text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),  -- snapshot
  spec              text CHECK (spec IS NULL OR length(spec) <= 2000),   -- มติ 6
  -- ผูกกลับบรรทัดในใบ CR เพื่อเติมราคาให้อัตโนมัติ (null = ไม่ผูกบรรทัด)
  "componentId"     text REFERENCES public.costing_item_components(id) ON DELETE SET NULL,
  "priceStatus"     text NOT NULL DEFAULT 'pending'
                    CHECK ("priceStatus" IN ('pending', 'quoted', 'no_quote')),
  "noQuoteReason"   text CHECK ("noQuoteReason" IS NULL OR length("noQuoteReason") <= 500),
  "answeredRevisionId" text REFERENCES public.material_price_revisions(id),
  "answeredById"    text, "answeredByName" text, "answeredAt" timestamptz,
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  CHECK ("priceStatus" <> 'quoted'   OR "answeredRevisionId" IS NOT NULL),
  CHECK ("priceStatus" <> 'no_quote' OR "noQuoteReason" IS NOT NULL)
);
CREATE INDEX material_price_ask_items_ask_idx   ON public.material_price_ask_items ("askId", "sortOrder");
CREATE INDEX material_price_ask_items_queue_idx ON public.material_price_ask_items ("priceStatus");
CREATE INDEX material_price_ask_items_mat_idx   ON public.material_price_ask_items ("materialId");

-- ── 3) ชั้นจำนวนที่ "ขอ" — เซลใส่เอง ไม่มีชุดตายตัว (มติ 1) ──────────────
CREATE TABLE IF NOT EXISTS public.material_price_ask_tiers (
  id           text PRIMARY KEY,
  "askItemId"  text NOT NULL REFERENCES public.material_price_ask_items(id) ON DELETE CASCADE,
  qty          numeric NOT NULL CHECK (qty > 0),   -- ไม่มีแถวเลย = ขอราคาเดียว
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("askItemId", qty)
);

-- ⚠️ `material_price_revisions."sourceAskItemId"` ตั้งใจเป็น **logical link ไม่ใส่ FK**
--    (แพตเทิร์นเดียวกับ sourceRequestId เดิม / inquiries 0104): rev เป็น immutable —
--    guard ห้าม UPDATE ทุกกรณี ถ้าใส่ FK ON DELETE SET NULL การลบเคสจะสั่ง UPDATE rev
--    แล้วชน guard ทันที (ลบเคสไม่ได้เลย). ตัวชี้ค้างไม่กระทบอะไรเพราะอ่านทางเดียว

-- ── 4) เคสที่ส่งแล้วเป็นหลักฐาน ลบไม่ได้ (แพตเทิร์น 0143/0147) ──────────
CREATE OR REPLACE FUNCTION public.guard_material_price_ask()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- admin force ผ่าน RPC (flag local ต่อ transaction — แพตเทิร์น 0147)
    IF current_setting('app.force_delete', true) = '1' THEN RETURN OLD; END IF;
    IF OLD.status = 'draft' AND OLD."submittedAt" IS NULL THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'material_price_ask_delete_forbidden';
  END IF;
  IF OLD."docNo" IS NOT NULL AND NEW."docNo" IS DISTINCT FROM OLD."docNo" THEN
    RAISE EXCEPTION 'material_price_ask_doc_no_immutable';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'material_price_ask_cancelled_immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS material_price_asks_guard ON public.material_price_asks;
CREATE TRIGGER material_price_asks_guard
BEFORE UPDATE OR DELETE ON public.material_price_asks
FOR EACH ROW EXECUTE FUNCTION public.guard_material_price_ask();

CREATE OR REPLACE FUNCTION public.force_delete_material_ask(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.force_delete', '1', true);   -- true = local ต่อ transaction
  DELETE FROM public.material_price_asks WHERE id = p_id;   -- ลูก cascade
END;
$$;
REVOKE ALL ON FUNCTION public.force_delete_material_ask(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_material_ask(text) TO service_role;

ALTER TABLE public.material_price_asks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_price_ask_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_price_ask_tiers  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.material_price_asks, public.material_price_ask_items,
                    public.material_price_ask_tiers FROM anon, authenticated;
GRANT  ALL ON TABLE public.material_price_asks, public.material_price_ask_items,
                    public.material_price_ask_tiers TO service_role;

-- ── 5) ถอนใบขอราคาวัสดุ MR ทั้งชุด (prod ไม่มีข้อมูลจริง — ข้อ 0.3) ─────
DROP TRIGGER  IF EXISTS material_price_requests_guard ON public.material_price_requests;
DROP FUNCTION IF EXISTS public.guard_material_price_request();
DROP FUNCTION IF EXISTS public.force_delete_material_request(text);
DROP TABLE    IF EXISTS public.material_price_request_items;   -- ลูกก่อน (FK)
DROP TABLE    IF EXISTS public.material_price_requests;
DELETE FROM public.entity_number_counters WHERE scope = 'MR';
-- ตัวชี้ค้างที่ไม่มี FK (ตั้งใจ loose ตอน 0143) — ล้างกันงงตอนไล่ข้อมูล
UPDATE public.material_price_revisions SET "sourceRequestId" = NULL
 WHERE "sourceRequestId" IS NOT NULL;

COMMIT;
NOTIFY pgrst, 'reload schema';
```

> scope `PM`/`RM` ไม่ต้อง seed — `next_entity_number` (0096) `INSERT … ON CONFLICT` สร้างแถว
> ให้เองครั้งแรกที่เรียก

### 0159 — ใบ CR ผูกวัสดุจริง (PR-3)

```sql
BEGIN;

ALTER TABLE public.costing_item_components
  -- ชั้นราคาที่เซลเลือกใช้ (null = ราคาไม่แบ่งชั้น) — ราคายัง snapshot ค่าเดียว (มติ 2)
  ADD COLUMN IF NOT EXISTS "priceTierQty" numeric
    CHECK ("priceTierQty" IS NULL OR "priceTierQty" > 0),
  -- ธงยืนยันย้ายไปเป็นเคสแล้ว · priceSource ซ้ำซ้อนกับ materialRevisionId (บั๊ก 7)
  DROP COLUMN IF EXISTS "confirmStatus",
  DROP COLUMN IF EXISTS "confirmRequestedAt",
  DROP COLUMN IF EXISTS "confirmRequestedById",
  DROP COLUMN IF EXISTS "priceSource";

-- ตัวชี้ที่ชี้วัสดุที่ไม่มีอยู่ (ผลจากบั๊ก 2) ต้องเคลียร์ก่อนใส่ FK
UPDATE public.costing_item_components
   SET "materialId" = NULL, "materialRevisionId" = NULL
 WHERE "materialId" IS NOT NULL
   AND "materialId" NOT IN (SELECT id FROM public.material_prices);
UPDATE public.costing_item_components SET "materialRevisionId" = NULL
 WHERE "materialRevisionId" IS NOT NULL
   AND "materialRevisionId" NOT IN (SELECT id FROM public.material_price_revisions);

ALTER TABLE public.costing_item_components
  ADD CONSTRAINT costing_item_components_material_fk
    FOREIGN KEY ("materialId") REFERENCES public.material_prices(id) ON DELETE RESTRICT,
  ADD CONSTRAINT costing_item_components_material_rev_fk
    FOREIGN KEY ("materialRevisionId") REFERENCES public.material_price_revisions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS costing_item_components_material_idx
  ON public.costing_item_components ("materialId");

-- + CREATE OR REPLACE guard_costing_request(): เกณฑ์ลบเปลี่ยนจาก status = 'draft'
--   เป็น "ยังไม่เคยส่ง" (submittedAt IS NULL) + status IN (draft, pricing, assembling)
--   เพราะธง 'pricing' แอปสลับเองเมื่อมีเคสค้าง — ใบร่างที่แค่ถามราคาต้องไม่กลาย
--   เป็นลบไม่ได้ตลอดกาลโดยไม่ได้ตั้งใจ (ดูไฟล์จริงใน supabase/migrations/0159)

COMMIT;
NOTIFY pgrst, 'reload schema';
```

**Rollback:** ใบ MR กู้ไม่ได้ (drop จริง) — ถ้าต้องถอย รัน 0143 ส่วนที่ 3 ซ้ำเพื่อสร้างตารางเปล่า
กลับมา · ตารางเคส/ชั้นราคา drop ได้ตรง · คอลัมน์ `confirm*`/`priceSource` เพิ่มกลับด้วย 0144 ·
ราคาใน rev เดิม: ย้ายกลับจาก tier ด้วย `UPDATE … FROM material_price_revision_tiers WHERE qty IS NULL`

## 4. โครงสร้างไฟล์

### ลบทิ้ง
```
src/app/sa/materials/requests/page.js                       PR-2
src/app/sa/materials/requests/[id]/page.js                  PR-2
src/app/api/sa/materials/requests/route.js                  PR-2
src/app/api/sa/materials/requests/[id]/route.js             PR-2
src/app/api/sa/materials/requests/[id]/answer/route.js      PR-2
src/app/api/sa/costing/[id]/confirm-price/route.js          PR-3 (แทนด้วยเคส)
```

### สร้างใหม่
```
supabase/migrations/0157_material_registry.sql        PR-1
supabase/migrations/0158_material_price_asks.sql      PR-2
supabase/migrations/0159_costing_material_link.sql    PR-3
src/lib/materialRegistry.js                           PR-1  logic ล้วน (ทะเบียน + ชั้นราคา)
src/lib/materialRegistry.test.mjs                     PR-1
src/components/materials/MaterialForm.js              PR-1  ⚠️ ฟอร์มเดียว สร้าง+แก้ (AGENTS.md)
src/components/materials/PriceTierFields.js           PR-1  ตารางชั้นราคา (ใช้ทั้งฝั่งขอและฝั่งตอบ)
src/app/api/sa/materials/[id]/route.js                PR-1  GET/PATCH(accept|archive|edit)/DELETE
src/app/api/sa/materials/[id]/revisions/route.js      PR-1  POST = ออก rev ใหม่ (RPC) + ปิดเคส
src/lib/materialAsks.js                               PR-2  logic ล้วน (สถานะเคส/ด่าน/ตัวนับ)
src/lib/materialAsks.test.mjs                         PR-2
src/components/materials/AskForm.js                   PR-2  ⚠️ ฟอร์มเดียว สร้าง+แก้ร่าง
src/app/sa/materials/asks/page.js                     PR-2  รายการเคส + คิวฝ่ายตน
src/app/sa/materials/asks/[id]/page.js                PR-2  รายละเอียดเคส + ตอบราคา + พรีวิวรูป
src/app/api/sa/materials/asks/route.js                PR-2  GET รายการ/คิว · POST เปิดเคส(ร่าง)
src/app/api/sa/materials/asks/[id]/route.js           PR-2  GET/PATCH(submit|acknowledge|close|cancel)/DELETE
src/app/api/sa/materials/asks/[id]/answer/route.js    PR-2  PATCH ตอบราคา/no_quote รายรายการ
src/components/materials/MaterialPicker.js            PR-3  ค้น+เลือกวัสดุจากทะเบียน
src/app/api/sa/costing/[id]/components/route.js       PR-3  PATCH ผูกวัสดุ/แก้กรัม/เลือกชั้นราคา
```

### แก้
| ไฟล์ | PR | แก้อะไร |
|---|---|---|
| `src/proxy.js` (บรรทัด 262–266) | 1 | `/api/sa/materials` ผ่านด้วย `costing:quote` **หรือ** `costing:edit` (ด่านจริงอยู่ใน handler); ลบ regex `/revise` ที่ไม่มี route (บั๊ก 1) |
| `src/proxy.js` (บรรทัด ~257) | 3 | ลบกฎ `/confirm-price$` ในบล็อก `/api/sa/costing` — กฎตายเมื่อลบ route |
| `src/lib/materialPrices.js` | 1 | ลบ `generateMaterialRequestDocNo`/`normalizeMaterialRequestItems`; `revisionUnitPrice(revision, tierQty)` อ่านจากชั้น; `bestPriceFor` เหลือเลือกราคากลาง/ทับรายลูกค้าของวัสดุ **ตัวเดียวกัน**; เพิ่ม `materialIdentityKey`/`materialPriceState`/`suggestTierQty` |
| `src/lib/materialPrices.test.mjs` | 1 | ชั้นราคา + identity RM ตามสูตร + สถานะวัสดุ |
| `src/lib/materialPricesAdmin.js` | 1–2 | ลบ `loadMaterialRequests`/`findMaterialRequest`; `appendMaterialRevision` เรียก RPC `append_material_price_revision` (ไม่ insert เอง ไม่สร้างวัสดุเอง); เพิ่ม `loadAsks`/`findAsk`/`closeAskItemsForRevision` |
| `src/app/sa/materials/page.js` | 1 | เขียนใหม่ — ทะเบียนวัสดุ (ค้น/กรอง/รับร่าง/ออก rev/ประวัติ/ซ่อน) + ปุ่ม "ขอราคา" |
| `src/components/AppLayout.js:222` | 1 | เมนู "คลังราคาวัสดุ" → "ทะเบียนวัสดุ" (+ PR-2 เพิ่มเมนู/แท็บ "เคสขอราคา") |
| `src/lib/master/attachmentTypes.js:94` | 2 | เพิ่ม entity `material_ask_item` (`reference_image` / `spec` / `other`) — **โค้ดล้วน ไม่ต้อง migration** |
| `src/app/api/attachments/route.js` | 2 | สิทธิ์แนบ/ลบของ entity ใหม่ (ผู้ขอแนบได้ตอนร่าง/ยังไม่ตอบ; RD/PC แนบของตนได้) |
| `src/lib/chat.js` | 2 | ไม่ต้องเพิ่ม space (`rd`/`pc` มีแล้ว) — แค่ payload เคสใหม่ |
| `src/lib/costingLibrary.js` | 3 | `componentLibraryStatus` ยึด `materialId` แทนชื่อ (บั๊ก 4); `libraryPricingBlocker` เช็ค: ไม่ผูกวัสดุ / วัสดุร่าง / ไม่มีราคา / เกินอายุ / มีเคสค้าง / กรัมว่างบน per_kg; เลิกอ่าน `confirmStatus` |
| `src/lib/costingAdmin.js:69` | 3 | กรัมจากแม่แบบเป็นค่าตั้งต้น แก้ได้ทีหลัง (บั๊ก 3) |
| `src/app/api/sa/costing/[id]/fill-prices/route.js` | 3 | ดึงจาก `materialId` ที่ผูกไว้ + ชั้นที่เลือก; เลิกเขียน `confirmStatus`; คืน `_filled/_expired/_missing` ให้ UI ใช้จริง |
| `src/app/api/sa/costing/[id]/submit/route.js` | 3 | blocker ใหม่ + ตั้งสถานะ `pricing` เมื่อมีเคสค้าง |
| `src/app/sa/costing/[id]/page.js` | 3 | บล็อกบรรทัด: MaterialPicker + ช่องกรัม + ตัวเลือกชั้นราคา (+คำแนะนำ) + ป้ายสถานะ + ปุ่มขอราคา; toast บอกจำนวนจริง |
| `src/lib/costing.js` | 3 | `submitToExecError` เลิกรับ `pricing` แบบ legacy; คอมเมนต์ที่ยังอ้าง "2 เอกสาร"/`priceSource` ออก |

### API สรุป

```
ทะเบียนวัสดุ (PR-1)
GET    /api/sa/materials?kind=&status=&customerId=&formulaCode=&q=   ทุกคนที่ canViewCosting
POST   /api/sa/materials         { kind, label, customerId?, formulaCode?, supplierNote?, tiers? }
                                 เซล→status draft (ห้ามส่ง tiers) · RD/PC→active + ออก rev.1
PATCH  /api/sa/materials/[id]    { action: 'accept'|'archive'|'edit', ... }
DELETE /api/sa/materials/[id]    ลบได้เฉพาะร่างที่ยังไม่มี rev และยังไม่ถูกอ้างในเคส/ใบ
POST   /api/sa/materials/[id]/revisions      RD/PC เท่านั้น (canQuoteMaterial)
       { tiers: [{ qty?, price }], validUntil?, note?, askItemId? }   → RPC atomic
       → ปิดรายการเคสที่ open ของวัสดุนี้ + เติมราคากลับบรรทัดในใบ (ถ้าผูก) + แจ้งกลับผู้ขอ

เคสขอราคา (PR-2)
GET    /api/sa/materials/asks?status=&dept=&mine=1    RD/PC เห็นของฝ่ายตน · เซลเห็นที่ตัวเองขอ
POST   /api/sa/materials/asks                        เปิดเคสเป็น "ร่าง" (ยังไม่ออกเลข)
       { dept, customerId?, productId?, formulaCode?, costingRequestId?, note,
         items: [{ kind, materialId? | newMaterial{label}, label, spec?,
                   componentId?, tiers: [qty, ...] }] }
PATCH  /api/sa/materials/asks/[id]  { action: 'submit'|'acknowledge'|'close'|'cancel', ... }
       submit = ออกเลข PM-/RM- + แจ้ง space rd/pc · acknowledge = RD/PC กดรับเรื่อง
PATCH  /api/sa/materials/asks/[id]/answer
       { answers: [{ itemId, tiers: [{ qty?, price }], validUntil?, note }
                 | { itemId, noQuote: true, reason }] }   ตรวจทั้งชุดก่อนเขียน
DELETE /api/sa/materials/asks/[id]                   ร่างที่ยังไม่ส่ง (+ admin ?force=1)

ใบ CR (PR-3)
PATCH  /api/sa/costing/[id]/components
       { componentId, materialId?, gramsPerUnit?, priceTierQty? }  ผูกแล้วมีราคาสด = เติมทันที
PATCH  /api/sa/costing/[id]/fill-prices               ดึงราคาล่าสุดทุกบรรทัดที่ผูกวัสดุแล้ว
```

**สิทธิ์** — ด่านจริงอยู่ใน handler เสมอ (proxy เห็นแค่ role):
ใส่ราคา / รับวัสดุร่าง / รับเรื่อง / ตอบเคส = `canQuoteMaterial` (ฝ่ายเจ้าของตาม `kind`) ·
เปิดเคส / เสนอวัสดุร่าง / ผูกวัสดุในใบ = `costing:edit` (+ `canEditCostingRequest` รายใบ) ·
ดูทั้งหมด = `canViewCosting`

**แจ้งเตือน** — ส่งเคส → space `rd`/`pc` ตาม `dept` · รับเรื่อง/ตอบราคา/`no_quote` → แจ้งกลับ
ผู้ขอ (+ ใบ CR ที่รออยู่ ถ้าผูก) · ส่งผู้บริหาร/ผลอนุมัติ → เดิม
**Audit** — `recordAudit` ทุก action; `entityType` ใหม่ = `material_price_ask`

## 5. หน้าจอ

| ที่ | ของใหม่/เปลี่ยน |
|---|---|
| `/sa/materials` (รื้อ, PR-1) | **ทะเบียนวัสดุ** — ค้น/กรอง (ชนิด · สถานะ · ลูกค้า · สูตร) · เพิ่มวัสดุ · ออกราคา rev ใหม่ (**ตารางชั้นจำนวน: เพิ่ม/ลบแถวได้เอง**) · ประวัติ rev เทียบชั้นต่อชั้น · รับวัสดุร่าง · ซ่อน · ปุ่ม **"ขอราคา"** (เปิดเคสจากทะเบียนได้เลย) |
| `/sa/materials/asks` (ใหม่, PR-2) | **เคสขอราคา** 2 แท็บ: *เคสของฉัน* (เซล) และ **คิวฝ่ายตน** (RD/PC: รอรับเรื่อง / รับแล้วยังไม่ตอบ / วัสดุร่างรอรับ) ← ปิดบั๊ก 6 |
| `/sa/materials/asks/[id]` (ใหม่, PR-2) | รายละเอียดเคส — ต่อรายการ: วัสดุ + **สเปก** + **รูปแนบพรีวิวได้ในหน้า** (AttachmentsPanel: ภาพย่อ + คลิกขยาย + ลากวาง/paste ของเดิม) + **ตารางชั้นจำนวนที่ขอ ↔ ช่องกรอกราคาของ RD/PC** · แถบสถานะ/ไทม์ไลน์ (ส่ง → รับเรื่อง → ตอบ → ปิด) · ปุ่ม "ตอบไม่ได้" + เหตุผล |
| `/sa/materials/requests` | ลบทั้งโฟลเดอร์ + redirect → `/sa/materials/asks` |
| `/sa/costing/[id]` (รื้อบล็อกบรรทัด, PR-3) | ต่อบรรทัด: **เลือกวัสดุ** (กรองตาม `kind` อัตโนมัติ, สร้างร่างจากในใบได้) · ช่อง **กรัม/ชิ้น** แก้ได้ · **ตัวเลือกชั้นราคา** พร้อมคำแนะนำ ("ใบนี้ 3 SKU × 1000 = 3000 ชิ้น → แนะนำชั้น 3000") · ป้ายสถานะราคา (สด / เกินอายุ / รอ RD/PC / วัสดุร่าง) · ปุ่ม **ขอราคา** รายบรรทัด |
| `/sa/costing/[id]` | ปุ่ม "ดึงราคาจากคลัง" → **"ดึงราคาล่าสุดทุกบรรทัด"** + toast บอกจำนวนจริง |
| ที่เหลือ | ไม่เปลี่ยน — อนุมัติ/ตีกลับ/ลายเซ็น/ผูก FG/ป้อนต้นทุน/revise/แม่แบบ |

## 6. ลำดับสร้าง (3 PR)

> **กฎลำดับ:** แต่ละ migration ไปคู่กับโค้ดที่ต้องใช้มันใน PR เดียวกัน — ห้าม drop คอลัมน์
> ล่วงหน้าก่อนโค้ดที่ยังเขียนคอลัมน์นั้นถูกแก้ (ฉบับ 4 พลาดจุดนี้: drop `confirm*` ใน PR-1
> ทั้งที่ `fill-prices` ที่ยังเขียนคอลัมน์นั้นอยู่ในแผน PR-2 → ปุ่มดึงราคาจะพังกลางทาง)

**PR-1 ทะเบียนวัสดุ + ราคาชั้นจำนวน**
mig 0157 · `materialRegistry.js` + เทสต์ · `revisionUnitPrice` อ่านจากชั้น · `appendMaterialRevision`
ผ่าน RPC · หน้า `/sa/materials` ใหม่ + `MaterialForm`/`PriceTierFields` · API ทะเบียน/rev ·
แก้ proxy (บั๊ก 1) · เมนู
→ ใบ MR เดิมยังทำงานได้ (ยังไม่ลบ) แต่ตอบใบต้องผ่าน RPC ตัวใหม่ → แก้ `answer/route.js` เท่าที่จำเป็น

**PR-2 เคสขอราคา + ถอนใบ MR**
mig 0158 · `materialAsks.js` + เทสต์ · หน้าเคส + คิว + รายละเอียด (สเปก/รูปพรีวิว/ชั้นจำนวน) ·
API เคสครบ · แจ้งเตือน space rd/pc (บั๊ก 6) · `customerId` ผูกจริง (บั๊ก 5) · ลบใบ MR ทั้งชุด +
redirect · entity แนบไฟล์ใหม่
→ ใบ CR ยังใช้การจับคู่ตามชื่อชั่วคราว (ไม่พัง เพราะ 0158 ไม่แตะคอลัมน์ที่โค้ดใบ CR เขียน)

**PR-3 ใบ CR ผูกวัสดุจริง + เก็บกวาด** ✅ สร้างแล้ว
mig 0159 · `MaterialPicker` + `/components` API (ผูกวัสดุ + แก้กรัม + เลือกชั้น — บั๊ก 3) ·
`componentLibraryStatus`/`libraryPricingBlocker` ยึด id (บั๊ก 4) · `fill-prices` คืนจำนวนจริง ·
ลบ `confirm-price` + กฎ proxy · ตัด `priceSource` ออกจากโค้ด/คอมเมนต์ (บั๊ก 7) · สถานะ `pricing`
กลับมามีความหมาย · rulebook + memory + คอมเมนต์ที่ยังอ้าง "2 เอกสาร"

> สิ่งที่ทำเพิ่มจากแผนตอนลงมือจริง (เหตุผลอยู่ในโค้ด/migration):
> · `syncCostingPricingStatus` ใน `costingAdmin.js` = แหล่งเดียวที่สลับธง `pricing`
>   (เรียกจาก submit + ทุก action ของเคสที่ผูกใบ) — ไม่มีปุ่มให้ใครกดเปลี่ยนเอง
> · GET ใบคืน `_openAsks` ให้หน้าจอขึ้นป้าย "รอฝ่าย…ตอบเคส" รายบรรทัดได้
> · ผ่อน guard การลบใบร่าง (เหตุผลข้างบน) ทั้งฝั่ง DB และ API ให้ตรงกัน
> · `fill-prices` ไม่ทับ snapshot ที่ยังสด (มติ 2) แต่ **ต่ออายุ** อันที่หมดอายุแล้ว
> · เก็บกวาดโค้ดตายจากใบ MR ที่ค้างมาจาก PR-1/PR-2: `bestPriceFor`,
>   `generateMaterialRequestDocNo`, `normalizeMaterialRequestItems` + เทสต์ของมัน
> · `AskForm` เปลี่ยนไปใช้ `productIdentity()` (มาตรฐาน PR #730) แทนการต่อ `fgCode — name` เอง

## 7. เช็คลิสต์ทดสอบ (UAT)

1. เซลเพิ่มวัสดุใหม่ → เป็นร่าง, RD/PC เห็นในคิว, รับ + ใส่ราคา → active + แจ้งกลับผู้ขอ
2. RD แก้ราคา RM ได้ / PC แก้ PM ได้ / **สลับฝ่ายกันแก้ไม่ได้** / เซลแก้ราคาไม่ได้เลย
3. ออกราคา rev.2 หลายชั้น (1000/3000/5000) → ประวัติเทียบชั้นต่อชั้นได้ · **ใบที่ดึง rev.1
   ชั้น 3000 ไปแล้ว ตัวเลขไม่ขยับ**
4. เปิดเคส PM: 3 รายการ (ขวด/ฝา/กล่อง) + สเปก + แนบรูป → **รูปพรีวิวได้ในหน้ารายละเอียด** ·
   ส่ง → ได้เลข `PM-YYMM0001` · ร่างที่ทิ้งไม่กินเลข
5. **ชั้นที่ขอใส่ค่าอะไรก็ได้** (เช่น 800 / 2500 / 12000) ไม่มีชุดบังคับ · เพิ่ม/ลบแถวได้
6. PC กด **รับเรื่อง** → เซลเห็นสถานะเปลี่ยน · ตอบราคาครบทุกรายการ → เคส answered → ปิดเคส
7. PC ตอบ **"ทำไม่ได้" + เหตุผล** → รายการเป็น `no_quote`, เคสปิดได้โดยไม่มีราคา
8. ตอบเคสวัสดุตัวเดิมซ้ำ → **ไม่เกิดวัสดุใหม่** เป็น rev ถัดไปของตัวเดิม (บั๊ก 2)
9. ราคา F ของ **สองสูตรต่างกัน** อยู่แยกกันจริง ไม่ทับกัน (มติ 8)
10. ราคาทับรายลูกค้า: วัสดุชื่อเดียวกัน ลูกค้า A มีราคาเฉพาะ → ใบของ A ได้ราคาเฉพาะ, ใบของ B
    ได้ราคากลาง (บั๊ก 5)
11. ในใบ CR: บรรทัดขวดเลือกวัสดุ + **เลือกชั้น 3000 ทั้งที่ใบสั่ง SKU ละ 1000** → ต้นทุนใช้
    ราคาชั้น 3000 · ระบบแนะนำชั้นให้แต่ไม่บังคับ
12. บรรทัด per_kg กรัมว่าง → ส่งผู้บริหารไม่ได้ + **แก้กรัมบนใบได้จริง** แล้วส่งผ่าน (บั๊ก 3)
13. ราคาเกินอายุ → ป้ายขึ้น + กดขอราคา = เปิดเคสผูกบรรทัด → RD/PC ตอบ → **บรรทัดอัปเดตเอง**
14. ใบที่มีเคสค้าง = สถานะ `pricing` และส่งผู้บริหารไม่ได้
15. ลบใบ CR (admin force) แล้ว → เคสที่เคยผูกยังอยู่ **สถานะไม่ค้าง** และตอบได้ปกติ
16. อนุมัติ/ตีกลับ/ลายเซ็น/ป้อนต้นทุนเข้า FG/revise rev.2 — ทำงานเหมือนเดิมทุกเส้น
17. `npm test` เขียว · `npm run check:migrations` เขียว

## 8. ความเสี่ยง

1. **ชื่อวัสดุซ้ำ/สะกดต่าง** — UNIQUE จับได้แค่ตรงเป๊ะ ("ขวดแก้ว 50ml" vs "ขวด 50 ml.")
   เฟสแรกพึ่งการค้นตอนเลือก; ถ้าเริ่มรกค่อยทำตัวช่วยรวม
2. **UNIQUE ครอบทุกสถานะรวม archived/draft** — ซ่อนแล้วเพิ่มชื่อเดิมใหม่จะชน constraint
   → **API ต้องดักก่อนเขียนแล้วชี้ไปวัสดุเดิม/เสนอกู้จาก archived** ห้ามปล่อย error ดิบขึ้นหน้า
   (ทางเลือกถ้าใช้จริงแล้วอึดอัด: เปลี่ยนเป็น partial index เฉพาะ `status <> 'archived'`
   แบบเดียวกับ 0140)
3. **UNIQUE สร้างไม่ผ่านถ้ามีข้อมูลทดลองซ้ำ** — รัน query เช็ค/ล้างก่อน (ดู 0157)
4. **RPC เป็นทางเดียวที่ออก rev ได้** — ถ้ามีโค้ดไหน insert `material_price_revisions` ตรง
   จะได้ rev ไม่มีราคาและลบไม่ได้ (guard) → เทสต์ต้องมีเคสนี้ และ code review ต้องกัน
5. **ชั้นราคาที่เลือกไว้บนบรรทัดอาจไม่มีใน rev ใหม่** (RD/PC ตอบ rev.2 มาแค่ 2 ชั้น) →
   `fill-prices` ต้องรายงานเป็น "ชั้นที่เลือกหาย" ไม่ใช่เงียบ ๆ ใช้ชั้นอื่นแทน
6. **ระหว่าง PR-2 → PR-3 ใบ CR ยังจับคู่ตามชื่อ** — ไม่พัง แต่ยังไม่ได้ประโยชน์เต็ม
7. mig 0157/0158/0159 ต้องรันมือบน Supabase SQL Editor **ตัวละ PR และรันก่อน deploy PR นั้น**
8. ก่อนใช้จริง: บัญชี role `executive` + ลายเซ็น + webhook space `pc`/`rd`/`executive`
```
