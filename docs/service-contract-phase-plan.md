# เฟสสัญญา + ด่านเงิน สายบริการ (ปลด P-A) — แผนลงมือละเอียด

**สถานะ:** มติเคาะครบ · แผนละเอียดพร้อมลงมือ (เขียนไว้ส่งต่อเซสชันใหม่ — อ่านไฟล์นี้ไฟล์เดียวควรเริ่มงานได้)
**ผู้เกี่ยวข้อง:** SA × AE Sup × FN × TS · สินค้าหมวด 02-001 (แพ็คเกจบริการ)
**ต่อจาก:** [service-business-system-plan.md](service-business-system-plan.md) §5–§8 (เฟสที่เคย park รอต้นฉบับสัญญาจ้างบริการ)
**ต้นแบบ:** โมเดลของเส้นนี้ถูกยกเป็นแม่แบบสำหรับเส้นอื่น → [so-centric-workflow-model.md](so-centric-workflow-model.md)
**ม็อก:** [service-contract-phase-mockup.html](service-contract-phase-mockup.html) (14 จอรายดีไซน์ · จอ 01 = ผังการวาง · จอ 14 = โครงแท็บหน้า SO)
· [service-contract-phase-prototype.html](service-contract-phase-prototype.html) (เดินเรื่องกดได้ 12 ขั้น + 3 ทางแยก แยกจอตามฝ่าย)

> ⚠️ **supersede §5 ของแผนเดิมบางส่วน** — ไม่สร้างตาราง `service_contract_installments` แล้ว
> ใช้ `sales_order_installments` (mig 0245) ซึ่งมีสายสองลายเซ็น SA แจ้ง → FN รับรอง ครบอยู่แล้ว
> เหตุผล: งวดเกิดพร้อม SO ทุกใบตั้งแต่ #1327 · ต่อสัญญา = SO ใหม่ (มติ mig 0297) · สองตารางงวด = "สองชุดที่เพี้ยนหากัน" ที่ #1212 เตือนไว้

---

## 0. มติผู้ใช้ (2026-08-30 — ครบทุกรอบคุย)

1. **จ่ายก่อนบริการเสมอ** — นัดที่เงินยังไม่ครอบ TS *เห็นได้แต่เป็นเทา ลงคิวไม่ได้* · งวดแรกไม่มียกเว้น:
   ต้องผ่าน ยืนยัน SO + สัญญาอนุมัติ (AE Sup) + งวดรับรอง (FN) ก่อนรอบแรกขึ้นตาราง
2. **จำนวนรอบบริการมากับแพ็คเกจตอนขาย** — SA ระบุใน SO (เช่น 12 รอบ/สัญญา) · TS เห็นตอนวางรอบ
3. **เอกสารแทนสัญญาได้** — PO ลูกค้า / อีเมล / สัญญากระดาษเก่า / อื่น ๆ · ต้องผ่านอนุมัติ AE Sup
   · โมเดลเป็นแถว `sales_contracts` แบบ "เอกสารภายนอก" (ไม่ผ่านเครื่องเจนแม่แบบ)
4. **บันทึกผลติดตามต่อสัญญา** — เอา (กำลังติดตาม / ต่อแล้ว / ไม่ต่อ+เหตุผล)
5. **ด่านตัดสินราย SO และเปิดเฉพาะส่วนที่ครอบ** — ไซต์เดียวโดนหลาย SO ครอบ: จ่ายใบไหน เข้าบริการได้เฉพาะโซนใต้ใบนั้น
6. **SO = ศูนย์กลางการทำงานของทุกฝ่าย** — *"ทุกฝ่ายทำงานในโมดูลตัวเอง เพื่อจะได้มองในทางเดียวกัน"*
   ไม่สร้างหน้าศูนย์รวมใหม่ ไม่ยุบเมนูบริการเข้าเมนูขาย · เพิ่ม toggle สายบนทะเบียน SO + ฝั่งบริการบนหน้าใบ
   · **ยืนยันซ้ำ 2026-08-30** เมื่อผู้ใช้ทักว่า *"SO บริการที่มี 02-001 มันต้องถูกแยกออกมาด้วย
   เพื่อให้ SA FN TS ทำงานร่วม"* — คำตอบคือ **toggle บนทะเบียนเดิม ไม่ใช่หน้าใหม่**

   🔴 **แต่ข้อนี้เป็นจริงไม่ได้ตามที่เขียนไว้เดิม — วัดจากโค้ด 2026-08-30:** ไม่มี role ของฝ่าย TS
   ตัวไหนถือ `salesplan:view` เลยสักตัว (`ts` · `ts_planner` · `ts_senior` · `ts_audit` · `ts_manager`)
   ⇒ TS **เปิดทะเบียน SO และหน้าใบไม่ได้ทั้งหมด** เมนูไม่ขึ้น · เปิด URL ตรงก็โดนเด้ง · API 403
   ⇒ toggle บนทะเบียนให้ผลกับ SA กับ FN เท่านั้น "สามฝ่ายมองใบเดียวกัน" ไม่เคยเป็นไปได้

   ⭐ **มติเพิ่ม 2026-08-30 (ผู้ใช้เลือกเอง): TS เห็นทั้งใบเหมือน SA/FN** ⇒ เปิด `salesplan:view`
   ให้ role ฝ่าย TS ทั้ง 5 ตัว · ผลที่ตามมาซึ่งต้องรู้ตัว:
   - เมนูของ TS จะได้เอกสารร่วมสามชนิด (ใบเสนอราคา · ใบสั่งขาย · สัญญา) ทรงเดียวกับ FN
     — ดีล/โครงการ/ภาพรวมไม่ขึ้น เพราะ `worksInSalesPipeline` ตัดฝ่ายที่มีบ้านของตัวเองอยู่แล้ว
   - **TS เห็นราคาขาย ส่วนลด และยอดของลูกค้าทุกใบในระบบ ไม่ใช่แค่ใบบริการ**
   - 🪤 **เปิด cap อย่างเดียวไม่พอ** — `salesPlanningViewScope()` ไม่รู้จัก role TS จะตกไป `'none'`
     ⇒ เห็น **ศูนย์ใบ** ทั้งที่เมนูขึ้น (เหตุผลเดียวกับที่ `finance` ต้องมีบรรทัด `'all'` ของตัวเอง —
     ฝ่ายที่ไม่ได้อยู่ใต้ SA ไม่มีทีมให้ scope `'team'`/`'own'` เกาะ)
7. **เกณฑ์ "ใบไหนมีรอบบริการ"** — ดีลสาย SERVICE **และ** ใบมีบรรทัดสินค้าหมวด `02-001` อย่างน้อย 1 รายการ
   → **ทั้งใบ**นับเป็นใบมีรอบบริการ · ไม่แยกชนิดรายบรรทัด (บรรทัดอื่นจัดสรรลงโซนได้ตามเดิม)
   · ใบสาย SERVICE ที่ไม่มี 02-001 เลย = ไม่มีรอบ ไม่เข้าคิวรอบ ไม่บังคับสัญญา/งวดครอบ
8. **หน้า SO เป็นโครงแท็บ** (ยืนยันจากม็อกจอ 14) — หัวคงที่ + แถบสถานะเส้น 4 ช่อง + แท็บ 5:
   ภาพรวม · สัญญา · การชำระ · งานบริการ (เฉพาะใบมีรอบ) · ประวัติ — **แท็บแบ่งตามเรื่อง ไม่ใช่ตามฝ่าย**
   ทุกฝ่ายเห็นชุดเดียวกัน สิทธิ์คุมที่ปุ่ม (ล็อกดีกว่าซ่อน)

**ข้อเสนอที่ผู้ใช้ยังไม่ veto (ถือว่าใช้ได้ แต่แจ้งอีกครั้งก่อน merge PR-C):** นัดชนิด `survey` (มีแล้ว) และ
`retrieve` (ถอนเครื่อง — ใหม่) **ไม่เข้าด่านสัญญา/ด่านเงิน** ใช้แค่ข้อ ③④ — ไม่งั้นถอนเครื่องหลังสัญญาหมดติดตลอดกาล
· งานซ่อมเก็บเงินแยก = นอกขอบเขตเฟสนี้ (§9)

---

## 1. เส้นเต็ม (ย่อ — เดินเรื่องเต็มดูใน prototype)

SA สร้าง SO (จำนวนรอบ) → ผูกสัญญา (เจน/เอกสารภายนอก→AE Sup อนุมัติ) → กำหนดช่วงครอบงวด → แจ้งจ่าย
→ FN รับรอง (paidThrough ขยับ) → TS จัดสรรโซน → วางรอบ → นัด gen → ด่าน 4 ข้อ → เข้าบริการ/ปิดงาน
→ 90 วันก่อน term หมด → ทะเบียนต่อสัญญา + กระดิ่ง → ต่อ (ดีล RE-ORDER → SO ใหม่ → term ใหม่ชี้โซนเดิม) / ไม่ต่อ (งานถอน)

---

## 2. Migrations (M1–M5)

ไดเรกทอรี `webapp/supabase/migrations` · **เลขล่าสุดตอนเขียน = 0319 — เลขชนบ่อย (หลายเซสชันพร้อมกัน)
จองเลขตอนแตกแบรนช์จริงเท่านั้น** · ทุกไฟล์รันมือบน Supabase SQL Editor · เขียนแบบ additive + `IF NOT EXISTS`
· จบไฟล์ต้องมี `NOTIFY pgrst, 'reload schema';` · CI มี `check:migrations`

**M1 — ช่วงครอบของงวด** (`ALTER sales_order_installments`) · ✅ **= mig 0320 · รันแล้ว 2026-08-30**
```sql
ADD COLUMN "coversFrom" date, ADD COLUMN "coversTo" date;
CHECK (coversFrom IS NULL OR coversTo IS NULL OR coversFrom <= coversTo)  -- ชื่อ constraint: sales_order_installments_covers_range
```
- null ได้ (ใบเก่า/ใบไม่ใช่บริการ) · งวด confirmed ที่ coversTo เป็น null = **ไม่นับเข้า paidThrough** (จอเตือน)

**M2 — สัญญาเอกสารภายนอก** (`ALTER sales_contracts`)
```sql
ADD COLUMN source text NOT NULL DEFAULT 'generated' CHECK (source IN ('generated','external'));
ADD COLUMN "externalDocKind" text CHECK ("externalDocKind" IN ('customer_po','email','paper_contract','other'));
ADD COLUMN "externalRef" text;
ADD COLUMN "approvedById" text; ADD COLUMN "approvedByName" text; ADD COLUMN "approvedAt" timestamptz;
CHECK (source <> 'external' OR "externalDocKind" IS NOT NULL)
```
- external ข้ามขั้นออกเลขเนื้อหา/ลงนาม: draft → (แนบไฟล์+วันที่+AE Sup อนุมัติ) → **status = 'signed'** ตรง ๆ
  (ใช้ enum status เดิม draft/awaiting_signature/signed/cancelled — ไม่เพิ่มค่า)
- external บังคับ `effectiveDate`+`expiryDate` ตอนอนุมัติ (ด่านที่ API ไม่ใช่ CHECK — ใบ generated กรอกทีหลังได้)
- ไฟล์แนบใช้สายอัปโหลดฉบับลงนามเดิมของสัญญา (ดู route `/api/sales-planning/contracts/[id]/document`)

**M3 — จำนวนรอบขาย** (`ALTER quotation_lines` **และ** `ALTER sales_order_lines`) — mig 0326
```sql
ADD COLUMN "serviceRounds" integer CHECK ("serviceRounds" IS NULL OR "serviceRounds" > 0);
```
🛠 **แก้จากแผนเดิมสองรอบ (2026-08-31)**
1. เดิมเขียนไว้ตารางเดียว แต่บรรทัดใบสั่งขาย **แก้ไม่ได้ทั้งระบบ** (เป็น snapshot ที่ RPC
   ก๊อปจาก `quotation_lines`) ⇒ รอบแรกย้ายทางเข้าไปที่ใบเสนอราคา และ mig 0326 แก้ทั้งสาม
   นิยามที่ก๊อปบรรทัด: `save_quotation_content` · `create_sales_order_draft` ·
   `revise_approved_sales_order_atomic`
2. **มติสุดท้าย: กรอกที่ใบสั่งขาย** (ผู้ใช้ขอเปลี่ยนหลัง mig รันแล้ว) ⇒ ช่องที่ใบเสนอราคา
   ถูกถอดออก · คอลัมน์ที่ `quotation_lines` ค้างไว้โดยไม่มีใครเขียน (จะเก็บกวาดด้วย
   migration ใหม่ทีหลังก็ได้) · ทอดที่ยังสำคัญเหลือทอดเดียวคือ SO → SO Rev.
   · **ช่องนี้เป็นช่องแรกบนบรรทัด SO ที่แก้ได้** จึงมีด่านของตัวเองที่
   `src/lib/sales/serviceRoundsEntry.js` — แก้ได้แม้ใบอนุมัติแล้ว (ไม่ต้องออก Rev.)
   เพราะไม่กระทบยอดเงินและไม่อยู่บนเอกสารที่ออกไปแล้ว

**M4 — ทะเบียนติดตามต่อสัญญา** (ตารางใหม่ `service_renewal_followups`) — mig 0327
🛠 เพิ่มจากแผนเดิม: คอลัมน์ `"coveredEndDate" date NOT NULL` — ถ้าไม่มี ระบบตอบไม่ได้ว่า
"ปิดเรื่องไปแล้ว" หมายถึงรอบไหน ⇒ ปีหน้ารอบใหม่หมดอีกครั้งไซต์จะเงียบหายตลอดกาล
```sql
id text PRIMARY KEY,
"siteId" text NOT NULL REFERENCES service_sites(id) ON DELETE RESTRICT,
"ownerId" text, "ownerName" text,
status text NOT NULL DEFAULT 'following' CHECK (status IN ('following','renewed','declined')),
"lastContactOn" date, "nextContactOn" date,
"resultNote" text CHECK (length("resultNote") <= 2000),
"renewedSalesOrderId" text REFERENCES sales_orders(id) ON DELETE SET NULL,
"declineReason" text,
"openedAt" timestamptz NOT NULL DEFAULT now(), "closedAt" timestamptz,
"createdById" text, "createdByName" text, "createdAt"/"updatedAt" ตามแพตเทิร์น;
CHECK (status <> 'declined' OR ("declineReason" IS NOT NULL AND length(btrim("declineReason")) >= 10));
CREATE UNIQUE INDEX service_renewal_followups_open_uk ON ... ("siteId") WHERE status = 'following';
```
- RLS + REVOKE anon/authenticated + GRANT service_role ตามแพตเทิร์น 0297

**M5 — ชนิดนัดถอนเครื่อง** — ขยาย CHECK ของ `service_visits.kind` เพิ่ม `'retrieve'`
(ดูแพตเทิร์นตอน survey ถูกเพิ่มใน mig 0314/0316 — DROP CONSTRAINT เดิมแล้ว ADD ใหม่)

---

## 3. ตัวตัดสินกลาง (lib — หัวใจของเฟส เขียนก่อน UI)

กติกาเหล็กของ repo: **ตัวตัดสินอยู่ที่เดียว ปุ่มบนจอกับ server ใช้ตัวเดียวกัน · คำนวณสด ไม่เก็บผลลงฐาน**

### 3.1 `orderHasServiceRounds(order, lines)` — ใหม่ (วางที่ `src/lib/sales/serviceOrders.js`)
```
สาย (orderBusinessLine จาก src/lib/service/intake.js — โครงการก่อน แล้วดีล) === 'SERVICE'
AND lines.some(l => categoryOf(l.fgCode) === '02-001')     // ✅ ของจริงที่ลงโค้ดแล้ว
```
- อ่านจาก **fgCode snapshot บนบรรทัด** ไม่อ่าน products สด (สินค้าย้ายหมวด/ถูกลบ ใบตรึงแล้วต้องนิ่ง)
- ⚠️ **ห้ามใช้ `startsWith('02-001-')`** (แผนฉบับแรกเขียนไว้ผิด) — รหัสจริงเป็น `FG-AAAA-02-001-DDDDD`
  หมวดอยู่กลางสตริง ⇒ ต้องผ่าน `categoryOf()` (lib/master/categoryOf.js) เท่านั้น
- ใช้ร่วม: ฟอร์มสร้าง SO (โชว์คอลัมน์รอบ) · toggle สายทะเบียน · แท็บงานบริการ · ทะเบียนต่อสัญญา
  · **คิว intake ยังไม่ได้ใช้และตั้งใจให้ต่างไปก่อน** (คิวนั้นถามคำถามกว้างกว่า: "ใบไหนต้องไปตั้งไซต์/โซน"
  จึงตัดสินด้วยสายธุรกิจล้วน) — ถ้าจะยุบให้เหลือเกณฑ์เดียว ทำพร้อม PR-C ตอน intake รับชิปสัญญา/จ่ายถึง
- ⚠️ `scripts/test-loader.mjs` ไม่ resolve `dir/index.js` — lib ใหม่ต้องเป็นไฟล์แบน + เทสต์ `.test.mjs` ข้างกัน

### 3.2 `paidThrough(installments)` — ใหม่ (วางที่ `src/lib/sales/paymentCoverage.js`)
```
max(coversTo) ของงวด status === 'confirmed'   → null ถ้าไม่มี
```
- `reported`/`pending`/`rejected` ไม่นับ — **"แจ้งแล้ว" ไม่ปลดด่าน**
- ฟังก์ชันคู่กัน: `overdueUnconfirmed(installments, todayIso)` = มีงวด `dueDate < วันนี้(ไทย)` ที่ยังไม่ confirmed
  · "วันนี้" ต้องมาจากนาฬิกาไทย (`businessDate` — ด่าน `check:thaitime` ใน CI จับ)
- 🔴 **`coversDate` fail-closed ทุกทาง** (แก้จากแผนฉบับแรกหลังรีวิว) — ไม่รู้วันนัด · ส่ง installments
  มาไม่ใช่อาเรย์ (ยังไม่โหลด/ไม่ได้ select มา) · อาเรย์ว่าง · ไม่มีงวด confirmed ⇒ **ไม่ผ่าน** ทั้งหมด
  · "ใบยอด 0 ไม่ต้องมีขั้นชำระ" **ไม่ตัดสินในไฟล์นี้** — ระบบมีตัวตัดสินตัวเดียวอยู่แล้วคือ
  `paymentNotRequired(orderTotal)` ⇒ ผู้เรียกใน PR-C ประกอบเอง:
  `paymentNotRequired(order.totalAmount) || coversDate(installments, visitDate)`
  (แผนฉบับแรกให้ "ไม่มีแถว = ผ่าน" ซึ่งกว้างกว่าของจริง: ใบเก่าที่ยอดไม่เป็นศูนย์ก็ไม่มีแถวได้
   แล้วด่านจะเปิดให้ใบที่ยังไม่เคยเก็บเงินสักบาท — fail-open ตรงข้ามกับมติทั้งเฟส)
- default แบ่งช่วง: **ปุ่ม "แบ่งช่วงอัตโนมัติ"** แบ่ง [effectiveDate..expiryDate ของสัญญาที่ผูก] เท่า ๆ กันตามจำนวนงวด
  — เป็นปุ่ม explicit ห้าม auto-fill เงียบ (กฎฟอร์ม: ไม่มีค่าตั้งต้นให้สิ่งที่เป็นการตัดสินใจ)
  · **ปุ่มยกไป PR-B** (มติผู้ใช้ 2026-08-30) เพราะ PR-A ยังไม่มีสัญญาให้ผูก จึงไม่มีช่วงให้แบ่ง
    ตัวคำนวณ `splitCoverageEvenly` เขียน+เทสต์ไว้แล้วใน `paymentCoverage.js` รอเสียบอย่างเดียว
- ช่วงซ้อน/เว้นระหว่างงวด = เตือนบนจอ ไม่บล็อก (แผนชำระจริงมี 29 รูปแบบ)

### 3.3 ปลดด่าน ①② ใน `src/lib/service/visitGate.js`
- ลบค่าคงที่ `CONTRACT_PHASE_READY` ทิ้ง · `evaluateVisitGate(visit, ctx)` รับข้อมูลจริงเพิ่ม:
  `{ site, zones, terms, ordersById, installmentsByOrderId, contractsById, todayIso }`
- **ประเมินราย (นัด × โซน)** — โซน z ของไซต์นัด:
  - **ข้อ① สัญญา (SA):** มี term ครอบ z ที่มีผล (ตัวตัดสินเดิม `termIsActive` ใน `src/lib/service/terms.js` —
    SO approved + ไม่ถูก Rev. ทับ) AND วันนัด ∈ [term.startDate, term.endDate]
    AND term.serviceContractId → สัญญา status `signed` และไม่ cancelled · term ไม่ผูกสัญญา = ติด
  - **ข้อ② เงิน (SA → FN):** SO ของ term นั้น — วันนัด ≤ paidThrough(SO) AND ไม่มี overdueUnconfirmed
- ผลรวมระดับนัด: ทุกโซนติด → `blocked` ทั้งใบ (ร่าง/เทาในคิว) · ติดบางโซน → ผ่าน แต่แนบ `zoneGates`
  ให้ใบส่งงาน/ปิดงานตัดโซนติดเป็น "งดบริการ" (ห้ามปิดงานโซนนั้น)
- นัด `kind` เป็น `survey` หรือ `retrieve` → ข้าม ①② ใช้แค่ ③④
- `initialVisitStatus` เดิมทำงานต่อได้เอง — นัด gen ใหม่ที่ผ่านครบ = `scheduled` ที่ติด = `draft`
- override หัวหน้า (mig 0302) ไม่แตะ — ใช้กลไกเดิม
- ⚠️ นิยาม "นัดมีชีวิต" ใช้ `src/lib/service/visitStatus.js` ชุดเดียว (เคยมี 5 ชุดไม่เท่ากันมาแล้ว)
- ⚠️ เมื่องวดถูกรับรอง นัด draft ที่พ้นด่านแล้ว **ไม่ auto-เปลี่ยน status ในฐาน** — จอคิวคำนวณสดว่า "ลากได้แล้ว"
  แล้วขึ้นตารางตอน TS ปล่อย/ลาก (หรือถ้าจะ auto-release ตอน gen/เปิดจอ ให้ทำใน API เดียวจุดเดียว — ตัดสินตอน implement PR-C
  แต่ห้ามให้สองที่ตัดสินไม่เหมือนกัน)

### 3.4 สรุปฝั่งบริการของใบ (สำหรับแถบสถานะเส้น + แท็บงานบริการ)
- ต่อ SO: terms (จัดสรรกี่แพ็ค/กี่โซน/กี่ไซต์) · plans (วางรอบหรือยัง) · visits ข้างหน้า (ผ่าน n / ติด m + เหตุยอดนิยม)
  · paidThrough · สัญญา · Σ`serviceRounds` ที่ขาย vs จำนวน visit ปิดงานแล้ว
- คำนวณฝั่ง server ใน API ของหน้า SO — ระวังด่าน `check:rowcap` (จำกัดแถวต่อ query)

---

## 4. งานราย PR

### PR-A — ช่วงครอบงวด + จ่ายถึง (mig M1) · **โค้ดเสร็จแล้ว รอ merge**
> แบรนช์ `claude/payment-coverage` (worktree `ss_system-service`) · **mig 0320 รันบน Supabase แล้ว 2026-08-30**
> (ยืนยันแล้ว: คอลัมน์ขึ้นครบ · PostgREST เห็นคอลัมน์ = schema cache รีโหลดแล้ว) ⇒ deploy โค้ดได้
>
> **สิ่งที่แก้จากแผนหลังไปอ่านโค้ดจริง — แผนเดิมผิด 4 จุด:**
> 1. `/finance/payments` **ไม่ได้ใช้ `SalesOrderPaymentPanel`** — เขียน `<table>` เองในหน้า
>    (component นั้นถูก import ที่เดียวคือหน้า SO) ⇒ PR-A แก้ตารางสองชุดแยกกัน
> 2. เกณฑ์ `fgCode.startsWith('02-001-')` **ใช้ไม่ได้** — รหัสจริงเป็น `FG-AAAA-02-001-DDDDD`
>    หมวดอยู่กลางสตริง ⇒ ใช้ `categoryOf(fgCode) === '02-001'` (helper กลางที่มีอยู่แล้ว)
> 3. "ก๊อป coversFrom/To ตามแพตเทิร์น dueDate เดิม" — **ไม่มีแพตเทิร์นนั้นอยู่จริง**
>    (RPC ออก Rev. ไม่แตะตารางงวดเลย ใบใหม่เริ่มที่ 0 แถว) · แต่ไม่ต้องทำอะไรเพิ่ม:
>    `freezeInstallments` สาขาที่จำนวนงวดเท่าเดิมเป็น UPDATE ในที่เดิม ⇒ ค่ารอดอยู่แล้ว
>    ⚠️ สาขาที่**จำนวนงวดเปลี่ยน** ลบแถวร่างแล้วสร้างใหม่ — `dueDate` หายอยู่แล้ววันนี้
>    และ coversFrom/To จะหายด้วย (พฤติกรรมเดิม ไม่ได้แก้ในรอบนี้ — บันทึกไว้ที่ §9)
> 4. หน้า SO **ไม่เคยรู้สายธุรกิจของใบ** — API ไม่ได้ select `deal.line`/`project.line`
>    ⇒ PR-A เติมสองคอลัมน์นั้น (ตรวจแล้วว่าไม่กระทบ fingerprint ของฉบับตรึง เพราะ
>    `buildIssuedSalesOrderPayload` หยิบเฉพาะ `deal.title`/`project.name`)
>
> **มติเพิ่มระหว่างทำ (2026-08-30):**
> · **สิทธิ์แก้ช่วงครอบเปลี่ยนมือตอน confirmed** — ยังไม่รับรอง = SA/FN กรอกได้ ·
>   รับรองแล้ว = **FN เท่านั้น** (ไม่งั้น SA เลื่อน "จ่ายถึง" ปลดด่านตัวเองได้)
>   ของจริงบนฐานมีใบสายบริการที่รับรองแล้ว 8 ใบต้องให้ FN ไล่กรอกย้อนหลัง
> · **ปุ่ม "แบ่งช่วงอัตโนมัติ" ยกไป PR-B** — PR-A ไม่มีสัญญาให้ผูกจึงไม่มีช่วงให้แบ่ง
>   (ตัวคำนวณ `splitCoverageEvenly` เขียน+เทสต์ไว้แล้วใน `paymentCoverage.js` รอเสียบ)
> · **ตัวกรองสายบนหน้า FN = เกณฑ์เต็ม** (สาย SERVICE + มีบรรทัด 02-001) สองถัง:
>   "ใบมีรอบบริการ" / "ใบอื่น" — ใบที่ยังไม่ระบุสายอยู่ถัง "ใบอื่น"
> · เพิ่ม action ใหม่ `coverage` แยกจาก `schedule` (คนละกติกาสิทธิ์ คนละโมดัล)
**แตะ:** `src/components/salesPlanning/SalesOrderPaymentPanel.js` (แผงเดียวใช้ทั้งหน้า SO และฝั่ง FN) ·
`src/app/api/sales-planning/sales-orders/[id]/installments/route.js` (รับ/คืน coversFrom/To — ดู whitelist คอลัมน์ของ route) ·
`src/lib/sales/paymentCoverage.js` ใหม่ + เทสต์ · หน้า `/finance/payments` (คอลัมน์ "จ่ายถึง" + ตัวกรองสาย)
**UI:** คอลัมน์ "ครอบคลุมบริการ" (วันที่ + "≈ รอบที่ n–m" คำนวณโชว์จากรอบจริงถ้ามี) · แถบ covbar + บรรทัด
"เงินครอบบริการถึง …" · โมดัลแก้ช่วงครอบรายงวด + ปุ่มแบ่งอัตโนมัติ · โมดัลรับรองของ FN เพิ่มบรรทัดผล
("รับรองแล้วจ่ายถึงขยับเป็น … นัด n นัดจะปลด") ตามกติกา `approvalPrompt` (#1223)
**เงื่อนไขแสดง:** เฉพาะใบที่ `orderHasServiceRounds` (ใบอื่นแผงเดิมเป๊ะ) — จึงต้องดึง 3.1 มาด้วยตั้งแต่ PR นี้
**กับดัก:** ออก Rev. แล้วงวดตั้งใหม่ตามแผน — ต้องก๊อป coversFrom/To ตาม seq เมื่อจำนวนงวดเท่ากัน
(ตามแพตเทิร์น dueDate เดิม — ดู drift-warning ในแผง) · งวด confirmed ไร้ coversTo → เตือน "ยังไม่นับเข้าจ่ายถึง"
**ตรวจรับ:** สร้าง SO บริการ → กรอกช่วงครอบ → FN รับรองงวด 1 → จ่ายถึงขึ้นถูก · ใบสายสินค้าไม่เห็นอะไรเปลี่ยน

### PR-B — สัญญาเอกสารภายนอก + ผูกกับใบ (mig M2)

> 🔴 **แก้หลังสำรวจโค้ดจริง 2026-08-30 — ข้ออ้างเดิมของหัวข้อนี้ผิด 6 จาก 7 ข้อ**
> (รอบ PR-A ก็ผิด 4 จุด · อย่าเชื่อ path/endpoint ในเอกสารโดยไม่เปิดไฟล์)
>
> | เดิมเขียนว่า | ของจริง |
> |---|---|
> | โมดัลสร้างอยู่ `contracts/page.js` | อยู่ `components/salesPlanning/ContractCreateModal.js` — **เป็นของกลาง มี 4 จุดเรียก** (ทะเบียนสัญญา · ดีล · ใบเสนอราคา · โครงการ) ⇒ เพิ่มขั้น "ที่มา" กระทบทั้งสี่ ต้องมีเคสตรวจโหมด `dealId` ด้วย |
> | `[id]/document` เป็นสายอัปโหลดไฟล์ลงนาม | เป็น **GET ปั๊ม HTML สำหรับพิมพ์** ทั้งไฟล์มี `export const GET` ตัวเดียว ไม่มี POST/formData ไม่แตะ `attachments` เลย |
> | (ไม่ได้พูดถึง) | **ท่อจริงมีอยู่แล้วและใช้ซ้ำได้ทั้งดุ้น**: `AttachmentsPanel` docType `signed_contract` → `POST /contracts/[id]/sign` ซึ่งเซ็ต `status='signed'` + `signedDate` + `signedFileId` + `effectiveDate`/`expiryDate` ให้ครบในคำขอเดียว |
> | status มี 4 ค่า | **มี 5** — `draft · awaiting_signature · signed · revised · cancelled` (0280 เพิ่ม `revised`) · ลอก 4 ค่าไปทำตัวกรอง = ใบ revised หายจากจอ |
> | `/contracts/options` ให้เลือกสัญญาของดีลได้ | คืน **ชนิดสัญญา + ใบเสนอราคา** ไม่ใช่รายการสัญญา · ตัวที่ใช้ได้จริงคือ `GET /contracts?dealId=` |
> | หน้า SO เรียก options อยู่แล้ว | **หน้า SO กับ API SO ไม่มีคำว่า contract อยู่สักบรรทัดเดียว** (grep = 0) ⇒ การ์ดสัญญาคือของใหม่ทั้งก้อน |
> | `service: null` คือเหตุที่เฟสถูกพัก | ตัวพักจริงคือ `CONTRACT_PHASE_READY` ใน `lib/service/visitGate.js` — ใส่แม่แบบแล้วด่านยังคืน parked อยู่ดี |
> | ✅ `service_zone_terms.serviceContractId` มีแล้ว | **ข้อเดียวที่ถูก** (mig 0297 รันแล้ว) ⇒ **ห้ามเขียน ADD COLUMN ซ้ำใน M2** |
> | ผู้อนุมัติ = ae_supervisor (มี helper ให้ใช้) | มติถูก แต่ **ไม่มี helper ด่านนี้ในระบบ ต้องเขียนใหม่** · ถ้าลอก `canEditSalesPlanning` ของ route `/sign` ตามความเคยชิน **AE/AC จะกดอนุมัติผ่าน = ด่าน "จ่ายก่อนบริการ" รั่วตั้งแต่ขั้นแรก** |

**แตะ:** `src/components/salesPlanning/ContractCreateModal.js` (เพิ่มขั้น "ที่มา" บนสุด: เจนจากแม่แบบ /
เอกสารภายนอก · แม่แบบบริการยัง null = ปุ่มเทาบอกเหตุ · **ระวัง regression 4 จุดเรียก**) ·
`src/app/sales-planning/contracts/[id]/page.js` (มุมมอง external: ไฟล์+อ้างอิง+วันที่ · ปุ่ม
"อนุมัติเอกสารแทนสัญญา" เฉพาะ AE Sup + โมดัล effects) ·
API `src/app/api/sales-planning/contracts/*` (สร้าง external ต้องข้าม `MISSING_TEMPLATE_NOTE` ที่
`route.js:74` · route อนุมัติใหม่ `[id]/approve-external` ล้อ `/sign` ที่มีอยู่ แต่**เปลี่ยนด่านเป็น AE Sup**) ·
`src/lib/sales/contracts.js` (helper ด่านใหม่ + `source`/`externalDocKind` เข้า `EDITABLE_KEYS`) ·
หน้า SO: การ์ดสัญญา — ดึงจาก **`GET /contracts?dealId=`** (ไม่ใช่ `/contracts/options`) → **apply ลง
`service_zone_terms.serviceContractId` ทุก term ของใบ** (API ฝั่ง service)

**🪤 กับดักของฐานที่ต้องแก้ในใบ M2 เดียวกัน** (ไม่ใช่แค่ `ADD COLUMN` 6 ตัว):
- `sales_contracts_status_number` — status ที่ไม่ใช่ draft/cancelled **ต้องมี `contractNo`**
- `sales_contracts_issued_complete` — `contractNo` กับ `issuedAt` ต้องมาคู่กัน
- `sales_contracts_signed_needs_date` — `status='signed'` ต้องมี `signedDate`
- RPC `issue_sales_contract` บังคับ `status='draft'` และ `contractNo` ว่าง ⇒ เส้น external เรียกซ้ำไม่ได้
- เพิ่มค่า status ใหม่ต้อง `DROP CONSTRAINT` แล้ว `ADD` ชื่อเดิม (ท่าของ 0280) ไม่ใช่ `ADD CHECK` เฉย ๆ
- 🔴 `master_row_assignments` สร้าง SET จาก `information_schema.columns` ⇒ **คีย์ที่ยังไม่มีคอลัมน์ถูกทิ้งเงียบ ไม่ error**
  ⇒ **deploy โค้ดก่อนรัน migration = ค่าหายโดยไม่มีใครรู้** (ย้ำ: รัน M2 ก่อน deploy เสมอ)
- `PATCH /contracts/[id]` เป็น allowlist `EDITABLE_KEYS` 7 ช่อง + `isContractEditable` = `draft` เท่านั้น
  ⇒ ใบ external ที่อยู่ `signed` แล้วแก้ `externalRef` ไม่ได้เลย ถ้าต้องแก้ได้ ต้องขยายด่านด้วย
**สิทธิ์:** ผู้อนุมัติ = ae_supervisor · ⚠️ อย่าใช้ `isSuperuser` เดี่ยว ๆ เป็นด่าน (บทเรียน `canConfirmPayment`)
· admin ทำได้ทุกอย่าง (#1501 — เทสต์ยามมีอยู่)
**กติกาวัน:** ตัวตัดสินช่วงเวลา = วันบน term · สัญญาเป็นซอง — term วันนอกซอง = เตือน ไม่บล็อก
**ตรวจรับ:** สร้าง external → แนบไฟล์ → AE Sup อนุมัติ → status signed + approvedBy ครบ → หน้า SO ผูกได้ →
term ทุกแถวได้ serviceContractId

### PR-C — ปลดด่าน ①② + คิวเทา + ใบงานตัดโซน (mig M5 · หลัง A+B)
**แตะ:** `src/lib/service/visitGate.js` (ตาม §3.3) + `visitGate.test.mjs` (มีอยู่ — เพิ่มเคส จ่ายถึง/บางโซน/exempt) ·
จุดที่เรียก gate ทุกจุด (จอจัดคิว `/service/schedule` · จอปล่อยเข้าคิว · server ที่ปฏิเสธจริง) ต้องส่ง ctx ใหม่ ·
คิวรอจัด: แยก "ผ่านด่าน (ลากได้)" / "ติดด่าน (เทา ลากไม่ได้ + เหตุ + เจ้าของ SA / SA→FN / TS)" ·
ใบส่งงาน + ปิดงานรายเครื่อง: แถวโซนติด = "งดบริการ (เหตุ)" ล็อกปิดงาน · intake เพิ่มชิปสัญญา/จ่ายถึง (ใช้ 3.1/3.2)
· เพิ่ม kind `retrieve` ในทะเบียนชนิดนัด (label "ถอนเครื่อง") — ปุ่มสร้างจากงานปิดสัญญาเท่านั้น (ไม่มีปุ่มลอย — TS ไม่ใช่ต้นทางของงาน)
**ข้อมูลเก่า/เปลี่ยนผ่าน (สำคัญ — อ่านก่อน merge):** SO บริการที่วิ่งอยู่ก่อนเฟส **ติดด่านทันที** ที่ deploy
(ไม่มีสัญญา/ช่วงครอบ) — ลำดับที่ถูก: merge A+B ก่อน → ไล่ผูกสัญญากระดาษเก่าผ่าน external + กรอกช่วงครอบ
ให้ใบที่วิ่งอยู่ → ค่อย merge C · ระหว่างเปลี่ยนผ่านใช้ override หัวหน้า (มีบันทึกถาวร) ได้
**ตรวจรับ:** เดินเรื่องตาม prototype ขั้น 6–10 ได้จริง: นัดในช่วงจ่ายถึงขึ้นตาราง · นัดเกินเป็นเทาพร้อมเหตุ ·
FN รับรองงวดถัดไปแล้วนัดกลับมาลากได้ · ไซต์สอง SO จ่ายใบเดียว = อีกโซน "งดบริการ" บนใบส่งงาน

### PR-D — จำนวนรอบขาย + toggle สายทะเบียน (mig M3 · อิสระ)
**แตะ:** 🛠 **แผนเดิมผิด (แก้ 2026-08-31 · มติผู้ใช้)** — เขียนไว้ว่ากรอกที่ฟอร์มสร้าง SO
"คำนวณสดจากบรรทัดที่กำลังกรอก" แต่ **ฟอร์มนั้นไม่มีบรรทัดให้กรอก**: บรรทัดถูกก๊อปจาก
ใบเสนอราคาตอนสร้าง และแก้ไม่ได้ทุกที่ (ฟอร์มเขียนไว้เองว่า "คัดลอกจาก QT ตอนสร้าง แก้ที่นี่ไม่ได้"
· หน้ารายละเอียดใช้ `QuotationReadOnlyLineItems`)
⇒ **ที่กรอกจริงคือการ์ดงานบริการบนหน้าใบสั่งขาย** `components/salesPlanning/ServiceContractCard.js`
(ช่องรายบรรทัดของหมวด 02-001 · อยู่ในการ์ด ไม่ใช่ในตารางรายการ เพราะตารางเป็น snapshot
อ่านอย่างเดียวทั้งแผง การแทรกช่องกรอกช่องเดียวจะอ่านเป็น "แก้บรรทัดได้" ซึ่งไม่จริง)
· ด่าน + ตัวตรวจอยู่ที่ `lib/sales/serviceRoundsEntry.js` ตัวเดียวที่ทั้งจอและ API ใช้
· API: action `set_service_rounds` บน PATCH ของใบ (ตรวจว่าบรรทัดเป็นของใบนี้และเป็นหมวดบริการจริง) ·
ทะเบียน `src/app/sales-planning/sales-orders/page.js` — segmented **ทุกสาย/สายสินค้า/สายบริการ**
(สายมีสองค่าใน DB คือ PRODUCT/SERVICE + null "ยังไม่ระบุ" ซึ่งอยู่ใน "ทุกสาย" — ไม่มีค่า SCENT)
เลือกสายบริการ → คอลัมน์ สัญญา · จ่ายถึง · รอบ n/N โดย n = **นัดที่ปิดงานแล้ว** นับผ่าน
`service_plans."salesOrderId"` (นัดนอกรอบไม่นับ) และ N = ผลรวม `serviceRounds` ของบรรทัด
· ฝั่ง TS: intake + ฟอร์มวางรอบ โชว์ "ขายไว้ N รอบ" + คำนวณ "ความถี่นี้จะได้ ~n นัด"
**กติกา:** ตัวเลขเป็นข้อผูกพันอ้างอิง/กระทบยอด — **ไม่บังคับ** planGen (รอบจริงเลื่อน/งดได้)
· **สิทธิ์ TS (มติ 2026-08-30):** `src/lib/permissions.js` — เพิ่ม `salesplan:view` ให้ role ฝ่าย TS
ทั้ง 5 ตัว **และ** เพิ่มสาขา `'all'` ใน `salesPlanningViewScope()` ให้ฝ่าย TS (ไม่งั้นเห็นศูนย์ใบ)
· ระวังเทสต์ยามที่ล็อกลิสต์ cap ราย role และเทสต์ที่ล็อกว่าใครเปิด `/api/sales-planning/*` ได้
**ตรวจรับ:** ใบเข้าเกณฑ์เห็นช่อง ใบไม่เข้าไม่เห็น · toggle เปลี่ยนคอลัมน์ · ช่องค้นหามี `autoComplete="off"` (#1372)
· สวมบท `ts_planner` แล้วเปิด `/sa/sales-orders` เห็นใบครบทุกทีม และเปิดใบรายใบได้

### PR-E — ทะเบียนต่อสัญญา + กระดิ่ง (mig M4 · อิสระ)
**แตะ:** หน้าใหม่ `/sa/renewals` (`src/app/sales-planning/renewals/`) ·
เมนู `src/components/AppLayout.js` วางถัดจาก contracts — **แต่ไม่ใช่ `SHARED_DOC_ITEMS`**
(การต่อสัญญาเป็นงานขาย ไม่ใช่เอกสารร่วมของบัญชี/บริการ) ·
🛠 **แก้จากแผนเดิม (2026-08-31)** — ratchet ที่แผนสั่งไว้ไม่ตรงของจริง:
`OPEN_PAGES` มี `/sa` + `/sales-planning` อยู่แล้ว (หน้าใหม่ใต้สองเส้นนี้ไม่ต้องลงทะเบียน) ·
ไม่มีไฟล์ `navMenuNames.test.mjs` ในรีโป · `SELF_LOAD_CAP` นับเฉพาะตารางใน `SCOPED_TABLES`
⇒ ที่ต้องแตะจริงคือ **`next.config.mjs` rewrites** (ลืมแล้วหน้า 404 ทั้งที่ไฟล์ครบ)
และเพดานป้ายใน `settings/design-preview/page.js`
**เนื้อ:** แถว = ไซต์ที่ active term จบใน ≤90 วัน หรือจบแล้วยังไม่ปิดเรื่อง (**คำนวณสดจาก term.endDate — ห้ามเก็บสถานะ**)
join `service_renewal_followups` · metric strip 4 ช่อง · โมดัลบันทึกผล (OptionTiles: ตามต่อ/ต่อ/ไม่ต่อ) ·
ต่อ → **เปิดฟอร์มสร้างดีลตัวเดิมของระบบ** (`DealCreateModal` prop `defaults`) พร้อมลูกค้าเดิม +
สาย SERVICE + ชนิด RE-ORDER — ไม่สร้างดีลให้เองที่ server เพราะดีลต้องมีเจ้าของ/มูลค่า/หมวด
ซึ่งเป็นการตัดสินใจของคน และตรรกะสร้างดีลอยู่ใน route ไม่ใช่ lib (ก๊อปมา = ฟอร์มชุดที่สอง) ·
`renewedSalesOrderId` เก็บตอน SO ใหม่เกิด ·
ไม่ต่อ → declineReason บังคับ ≥10 + แจ้ง TS (งานถอน — นัด `retrieve` จาก PR-C)
**กระดิ่ง:** kind ใหม่ `service_renewal_due` (`SERVICE_BELL_KINDS`) — ลง `NOTIFICATION_BOXES`
ใน `src/lib/notifications.js` (+เทสต์) · ปลายทาง/ป้ายลง `notificationTargets.js` ด้วย
(entity `service_renewal` → `/sa/renewals`)
· ระบบไม่มี cron → sweep ตอนเปิดทะเบียน/แดชบอร์ด SA (แพตเทิร์น `contractQuotationSync` เรียกสองจังหวะ)
· กันยิงซ้ำด้วยกุญแจ (siteId × endDate) เช็คกับ notifications เดิมก่อน insert
**ตรวจรับ:** ไซต์เข้าเขต 90 วันโผล่ + กระดิ่งถึงเจ้าของครั้งเดียว · ปิดเรื่องแล้วหลุดจากแท็บใกล้หมด

### PR-F — รื้อหน้า SO เป็นโครงแท็บ (ไม่มี mig · ปิดท้าย หลัง C)
**แตะ:** `src/app/sales-planning/sales-orders/[id]/page.js` — จากหน้ายาวการ์ดต่อกัน → หัวคงที่ + แถบสถานะเส้น + แท็บ:
1. **ภาพรวม** (default): ยอด · รายการสินค้า (+รอบ) · ข้อมูลบนเอกสาร · เอกสารยืนยันคำสั่งซื้อ · ContextCard ดีล/QT/โครงการ/ลูกค้า
2. **สัญญา**: การ์ดจาก PR-B
3. **การชำระ**: `SalesOrderPaymentPanel` ยกมาทั้งก้อน (ตัวนับบนแท็บ = confirmed/total)
4. **งานบริการ** (เฉพาะ `orderHasServiceRounds`): ตารางจัดสรร · รอบ+นัด (ผ่าน/ติด+เหตุ) · กระทบยอด n/N ·
   ปุ่มกระโดด ไซต์/จัดคิว (ข้อมูลจาก §3.4)
5. **ประวัติ**: audit trail + revision history (ของเดิมย้ายเข้า)
**แถบสถานะเส้น 4 ช่อง** (ยืนยัน SO · สัญญา · จ่ายถึง · งานบริการ) — คำนวณสดจากตัวตัดสินชุดเดียวกับด่าน ·
กดช่องกระโดดเข้าแท็บ · ใบไม่มีรอบ = ช่อง 4 หาย เหลือราง 3
**Deep link:** `?tab=payment|contract|service|history` — คิว FN/TS/กระดิ่ง ลิงก์ตรงแท็บ
**กติกา:** ย้ายของเดิม **ห้ามเขียนการ์ดซ้ำสองชุด** — component เดิมย้ายที่อยู่เฉย ๆ · แท็บใช้ primitive `Tabs` ของระบบ
**ตรวจรับ:** ใบสายสินค้า = 4 แท็บ ราง 3 ช่อง หน้าตาเนื้อในเหมือนเดิมครบ · ใบบริการ = 5 แท็บ ราง 4 ช่อง

**ลำดับ:** A → B → (รอบไล่ผูกของเก่า) → C → D, E ขนาน → F ปิดท้าย

---

## 5. Ratchet / ด่าน CI ที่ต้องแตะ (สะสมจากบทเรียนโมดูลนี้)

- CI: `npm test` · `check:migrations` · `audit:ui` (เพดาน — ห้าม glass-panel/premium-input/style={{}} ในโค้ดใหม่ ใช้ `WorkspaceSection`)
  · `check:rowcap` · `check:thaitime` · `check:apifetch` (จอเรียก API ผ่าน `apiFetch/apiJson` เท่านั้น · retry ตั้งต้นเฉพาะ GET)
- หน้าใหม่ → `OPEN_PAGES` (`src/proxy.js`) · เมนูใหม่ → `navMenuNames.test.mjs` + `SELF_LOAD_CAP` (`systemRules.test.mjs`)
- kind แจ้งเตือนใหม่ → `NOTIFICATION_BOXES` (`src/lib/notifications.js`)
- `.ui-badge` แฟมิลีใหม่ → `BADGE_FAMILIES` ใน `settings/design-preview/page.js`
- ทะเบียน/หน้ารายการใหม่ → ทะเบียน refresh-signals
- ปุ่มอนุมัติทุกปุ่ม → `approvalPrompt` บังคับ effects · `window.confirm` ห้าม (`confirmAction`)
- ช่องค้นหา → `autoComplete="off"` · ปุ่ม kind ต้องมีในตาราง `KINDS` ของ `ActionButtons.js`
- วันที่ห้าม `<input type="date">` ดิบ — `DateInput` · เงิน `MoneyInput` · จุดตัดจอใหม่ห้ามเพิ่ม
- CSS token ที่ไม่มีจริง (เคยพลาด): `--surface-1/2`→`--panel/panel-2` · `--line`→`--border` · `--radius-sm`→`--radius-md` · `999px`→`--radius-full`

## 6. สภาพแวดล้อมทำงาน

- **worktree บริการ:** `~/ss-team/ss_system-service` (แบรนช์งานบริการเดิม) · พรีวิว config `service-dev` พอร์ต 3010 —
  config อยู่ `~/ss-team/.claude/launch.json` (โฟลเดอร์แม่) · repo หลัก `~/ss-team/ss_system` มีหลายเซสชันใช้ร่วม —
  ระวัง `commit -a` กลืนงานค้างของกันและกัน · สแกน worktree สดก่อนใช้ (สถานะเปลี่ยนตลอด)
- `.env.local` ก๊อปจาก ss_system · ทดสอบ UI ไม่แตะรหัสผ่าน: คอมเมนต์ `NEXT_PUBLIC_SUPABASE_*` สองตัว → dev bypass ·
  เลือกบทบาทด้วย `NEXT_PUBLIC_DEV_BYPASS_ROLE/_DEPARTMENT/_TEAM` · **คืนค่าไฟล์ทุกครั้งเมื่อจบ**
- **dev DB = prod DB — ไม่มีฐานแยก** ทดสอบเขียน/ลบต้องใช้ fixture ที่สร้างเองแล้วลบทิ้ง · ระบบไม่มีถังขยะ
- ห้ามรัน `next build` ขณะ dev server รัน (แคช turbopack พัง ทุก API ตอบ 500)
- Stacked PR: base ถูก squash แล้วต้อง `git rebase --onto origin/main <คอมมิตสุดท้ายของงานเก่า>` · CI ไม่รันถ้า base ไม่ใช่ main
- Deploy อัตโนมัติวันละ 3 รอบผ่าน workflow → เช็ค `npm run deploy:status` + `/api/version` · **mig ต้องรันก่อน deploy โค้ดที่ใช้คอลัมน์ใหม่**

## 7. บัญชี/สิทธิ์ที่ต้องพร้อมก่อน UAT

- ฝ่าย TS ยังไม่มีบัญชีจริงสักคน (role `ts` dept `TS` มีในระบบแล้ว — ผู้ใช้ต้องสร้าง)
- FN ใช้ role `finance` (ย้ายแล้วตั้งแต่ #1212) · ผู้อนุมัติ external = `ae_supervisor` · admin ผ่านทุกด่าน (#1501)

## 8. UAT ปิดเฟส (เดินตาม prototype ทั้งเส้น)

ขั้น 1–12 + ทางแยก 3 เส้นบนข้อมูล fixture: สร้าง SO บริการจริง → external contract → อนุมัติ → ช่วงครอบ →
FN รับรอง → จัดสรร → วางรอบ → คิว/ด่าน → ปิดงาน → จำลองงวดค้าง (นัดเทา) → รับรองแล้วปลด → ทะเบียนต่อสัญญา
(ปรับ endDate fixture ให้เข้าเขต 90 วัน) → ต่อ/ไม่ต่อ · แล้วลบ fixture ทิ้ง

## 9. นอกขอบเขต / เปิดค้าง

- งานซ่อม/บริการนอกสัญญาเก็บเงินแยก — โมเดลเงินยังไม่ออกแบบ
- ต้นฉบับสัญญาจ้างบริการ (รอผู้ใช้ส่ง — ห้ามแต่งเอง) → ค่อยเปิดสายเจนใน `contractTemplates.js`
- Import ช่วงครอบ/สัญญาจากชีตเก่า 380 จุด (ต่อยอด F-8) — เฟสนี้ไล่ผูกมือผ่าน external
- ผูกงวด ↔ คำขอใบวางบิล (`billingRequestId`) — "ผูกได้ไม่บังคับ" ยังไม่ทำ
- 🔴 **ออก Rev. ของ SO แล้ว "จ่ายถึง" กลับเป็นศูนย์ — ต้องปิดก่อน merge PR-C**
  RPC `revise_approved_sales_order_atomic` (mig 0161/0166) ก๊อปเฉพาะหัวใบ + บรรทัด
  **ไม่แตะ `sales_order_installments` เลย** ⇒ ใบฉบับใหม่เริ่มด้วยงวด 0 แถว แล้วได้ชุดใหม่
  จากแผน QT ตอนอนุมัติ ซึ่งไม่มี `coversFrom/To` (และไม่มี `dueDate` อยู่แล้ววันนี้)
  · ผลตอน PR-C ขึ้น: **ออก Rev. ครั้งเดียว งานบริการของใบนั้นถูกบล็อกทั้งเส้น** ทั้งที่
  ลูกค้าจ่ายล่วงหน้าไปแล้ว — รุนแรงกว่ากรณี `dueDate` หายมาก เพราะ dueDate แค่ทำให้
  ตัวเลขบนจอไม่ครบ ส่วนอันนี้ปิดคิวช่าง · ทางที่ทำได้: ก๊อปงวดตาม seq หลัง RPC
  (`sales-orders/[id]/route.js` ราว 442–468) หรือให้ `ensureInstallments` อ่านจาก
  `order.revisedFromId` · **ยังไม่ทำใน PR-A** (นอกขอบเขต) แต่ต้องทำก่อน PR-C
- **งวดที่ตั้งใหม่ตอนอนุมัติทำให้ค่าที่ SA กรอกหาย** — `freezeInstallments` สาขาที่จำนวนงวด
  ไม่ตรงแผน ลบแถวร่างแล้วสร้างใหม่ ⇒ `dueDate` / `billingRequestId` / `note` / `coversFrom-To`
  หายเงียบตอนกดอนุมัติใบ (พฤติกรรมเดิมของ `dueDate` ตั้งแต่ mig 0245 ไม่ใช่ของใหม่จาก PR-A)
  · มีแค่ธง `installmentPlanDrift` เตือนล่วงหน้าบนจอ ซึ่งไม่บล็อก · ถ้าจะแก้ ต้องอุ้มค่าตาม seq
  ก่อน DELETE ใน `salesOrderInstallmentsStore.js` — เป็นงานของตัวเอง ไม่ได้อยู่ใน PR ไหน
- แม่แบบไทม์ไลน์สาย SERVICE ยังเป็นของก๊อป (งานเก่า mig 0276)
