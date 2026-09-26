# ใบสั่งขายย้อนหลัง (SO ย้อนหลัง) — คีย์งานบริการที่ขายไปแล้วนอกระบบ

> สถานะ: **รอตรวจ** · ตรวจกับโค้ดเมื่อ 2026-09-25 (ยกเลิกหลังอนุมัติ มติ 24/09 · mig 0387 + แก้ตาม review 25/09 — §8D · §9.2) · **โมเดล 22/09 (mig 0374) แทนโมเดล "เกิดเป็นอนุมัติแล้ว" ของ 0360** ·
> P1 (โครงสร้าง + จุดตัดเรื่องเงิน) ขึ้น prod แล้ว 16/09/2026 (#1723 · mig 0360 รันแล้ว) และ**ยังเป็นฐานของรอบนี้** ·
> 🛑 **รัน 0374 บน prod ก่อน merge** (§9) · ยังไม่ได้คีย์ของจริง — เฟส 3 (คีย์ใบจริงตามชีต) เริ่มได้หลัง merge + UAT
> ⭐ **มติเจ้าของ 23/09: บรรทัดโซน = บรรทัดใบเสนอราคา** (§1.1 A13 · §2.4) — `กำลังดำเนินการ` บนแบรนช์ `claude/legacy-so-qt-lines`:
> ขั้น A (แผน · ตัวเขียน · ฟอร์มฝั่ง lib · **mig 0379 `รอดำเนินการ` — รันบน prod ก่อน merge**) ทำแล้ว ·
> ขั้น B (จอ: ขั้น ① VAT · ขั้น ② บรรทัดโซน · ขั้น ④ ตารางรายการ · การ์ดโซนของหน้าใบ) ทำแล้ว — `รอตรวจ` (§8A) ·
> รอบรีวิว/UAT 23/09 แก้แล้ว: ตารางของขั้น ② เป็นตารางจริงบนเดสก์ท็อป (แยกจากการ์ดไซต์ · ยุบแถบสรุปขั้น ② ④) · แถวใหม่ล็อกหน่วย/ราคา ·
> ราคาของแผนไหลกลับลงบรรทัด · เหตุของจำนวนไม่เต็ม · ปุ่มลบ/placeholder/กล่องสรุปแบบใบเสนอราคา — ข้อที่ยังต่าง 9 ข้อ **ตัดสินครบแล้ว 25/09** (§8A)
> ⭐ **มติเจ้าของ 25/09 (A14): ขั้น ② = ตารางรายการของใบเสนอราคา + ช่อง "ไซต์ · โซน" ในบรรทัด** · ส่วนลดท้ายใบ · VAT ย้ายลงกล่องสรุป ·
> ถอดการ์ดไซต์/ติ๊กโซน/ช่องค้น/"ใช้แพ็คเกจเดียวกันทุกโซน" · เพิ่ม "เพิ่มหลายโซน" — `รอตรวจ` บนแบรนช์ `claude/legacy-so-step2-qt` · **ไม่มี migration**
> (ม็อก https://claude.ai/artifact/Tu6RVhUfoQb9kTNooknhoH · §8A)
> ⭐ **มติเจ้าของ 25/09 (A15): รื้อขั้น ① แบบหน้าสร้างใบเสนอราคา** — หัว `DetailOverview` + ช่องสรุป 4 ช่องแทนแถบสรุปข้างขวา ·
> การ์ดตามเรื่อง · ชนิดเอกสารเป็นชิป · ลูกค้ากับ AE คู่กัน · **ก้อนแดงขึ้นหลังกดไปต่อเท่านั้นทุกขั้น** — `รอตรวจ` แบรนช์เดียวกัน · ไม่มี migration
> ⭐ **มติเจ้าของ 25/09 (A16): รื้อขั้น ③ งวดชำระ** — คำถามสามทาง (จ่ายครบทั้งใบแล้ว · จ่ายมาแล้วบางส่วน · ยังไม่เคยจ่าย) · ช่วงของงวด
> ต่อกันเอง กรอกแค่ "ถึง" · **งวดสุดท้ายคิดยอดที่เหลือ + ถึงวันสิ้นสุดสัญญาให้** · แบ่งงวดตามเดือนปฏิทิน (หน้าต่าง ดูผลก่อนสร้าง · วันครบกำหนด 4 แบบ)
> · สัญญาที่จบตรงวันครบรอบแบ่งเป็นเดือนได้ · **ไม่มีแถบสรุปข้างขวาในขั้นไหนแล้ว** — `รอตรวจ` แบรนช์เดียวกัน · ไม่มี migration
> ⭐ **มติเจ้าของ 25/09 (A17): รื้อขั้น ④ "ตรวจแบบผู้อนุมัติ"** — หัวเอกสารแบบขั้น ① · ใบที่อาจซ้ำอยู่บนสุด (ด่านเดียวที่บล็อก) ·
> แถวตรวจประโยคเดียวกับหน้าต่างอนุมัติ พร้อมปุ่ม "แก้ในขั้น …" · คำเตือนรวมเป็นกลุ่มในแถวของมัน · รางหลังกดส่ง · **แผงบันทึกเหนือแถบท้าย**
> (จังหวะ/ผลที่ล้ม/ทางออกไม่เกินหนึ่งปุ่ม — ถอดปุ่ม "บันทึกอีกครั้ง" ที่ข้ามด่านใบซ้ำ) · ผู้อนุมัติเรียก **"ผู้จัดการฝ่ายขาย"** (เฉพาะใบย้อนหลัง) — `รอตรวจ` แบรนช์ `claude/legacy-so-step4` · ไม่มี migration
> ⭐ **มติเจ้าของ 26/09 (A18): บันทึกใบซ้ำที่ผู้คีย์ยืนยัน** — ใบไหน · ใคร · เมื่อไร · เหตุผล (ไม่บังคับ ≤500) ลง `metadata.historicalIntake.duplicateReview` · ยืนยันเป็นรายใบ · ผู้อนุมัติเห็นในหน้าต่างอนุมัติ + การ์ด "ใบที่อาจซ้ำ" (ตรวจใหม่ตอนเปิดใบ — ใบที่พบเพิ่ม = เตือน ไม่บล็อก) — `รอตรวจ` แบรนช์ `claude/legacy-so-dup-ack` · ไม่มี migration

อ่านคู่กับ:
[so-pending-approval-amount.md](so-pending-approval-amount.md) (Actual = SO อนุมัติ · ตัว cache คู่ sync/enforce) ·
[legacy-deal-switch.md](legacy-deal-switch.md) (สวิตช์ "ดีลเก่า" — **คนละเรื่อง** กับสายนี้) ·
[service-intake-phase4.md](service-intake-phase4.md) (คิวงานเข้าใหม่ของ TS) ·
[sales-contract-plan.md](sales-contract-plan.md) (เอกสารแทนสัญญา) ·
[form-design-rules.md](form-design-rules.md) (ล็อกเจ้าของเป็นตัวเอง §2) ·
ม็อก/สเปกของรอบ 22/09 `~/ss-team/mockups/legacy-so-service-flow/` · ม็อกรอบ 0360 `~/ss-team/mockups/legacy-so/` (อยู่นอกรีโปทั้งคู่)

## 0. ย่อหนึ่งย่อหน้า

ชีตทะเบียนสัญญาบริการของทีม (379 จุดติดตั้ง · 149 ลูกค้า) ไม่มีทางเข้าระบบ เพราะสะพานเส้นเดียวระหว่างขายกับบริการ
(`service_zone_terms`) บังคับบรรทัดใบสั่งขาย ⇒ งานเก่าไม่ขึ้นคิวนัด ไม่มีรอบเติม ไม่มีต่อสัญญา
ทางที่เลือก: **แถวจริงใน `sales_orders` + ธง `origin = 'historical'`** เก็บยอดจริงไว้ในใบ แล้ว **กรองที่ตัวคำนวณ**
ทุกจุดที่คิดเงิน · ไม่มีใบเสนอราคา ไม่มีโครงการ ผูกกับ **ดีลภาชนะ** 1 ใบต่อ (ลูกค้า × AE)
**มติ 22/09 เปลี่ยนเจ้าของงาน**: ฝ่ายขายทุกตำแหน่ง (+admin) คีย์ใบในฟอร์มหน้าเต็ม 4 ขั้น โดย**เลือกโซนจากทะเบียนไซต์ตอนคีย์**
→ **AE Sup อนุมัติ** ซึ่งเป็นจังหวะเดียวที่ออกเลขเอกสารแทนสัญญา ตรึงงวด และเปิดรอบขายของโซนให้ TS
→ บัญชีรับรอง **"งวดยกมา"** ครั้งเดียว → TS เหลือแค่ตั้งรอบ · สวิตช์ยกเว้นด่านเงินถูกถอด ใบยอด 0 ผ่านด่านเองด้วย `paymentNotRequired`

## 1. มติ

### 1.1 มติ 22/09/2026 — โมเดลปัจจุบัน

| ข้อ | มติ | ลงโค้ดที่ |
|---|---|---|
| A1 | **ฝ่ายขายทุกตำแหน่งคีย์ได้** (`ae` · `ac` · `senior_ae` · `ae_supervisor`) + admin — ไม่ใช่ AE Sup อย่างเดียว | `HISTORICAL_KEYER_ROLES` + literal ใน RPC (เทสต์เทียบสองฝั่ง) |
| A2 | `ae`/`senior_ae` คีย์ให้ **ตัวเองเท่านั้น** · `ac` และคนที่ขอบเขตแก้ไม่ใช่ `all` ถูกวัดกับ **ดีลภาชนะที่ใบจะเข้าไปอยู่จริง** | `ownerLockedToSelf` + `inSalesEditScope` ใน `planHistoricalServiceOrder` (ทั้งพรีวิวและบันทึก) |
| A3 | **SA เลือกไซต์/โซนจากทะเบียนตอนคีย์** — เลิกให้ฝ่ายขายพิมพ์ชื่อจุดเป็นข้อความ และเลิกให้ TS ผูกโซนทีหลัง | `sales_order_lines."serviceZoneId"` (0374) · ขั้น ② ของฟอร์ม |
| A4 | **ใบเกิดเป็นร่าง แล้วส่ง AE Sup อนุมัติ** (มติข้อ 6 ของ 0360 ถูกทับ) | CHECK `sales_orders_origin_shape` ใหม่ + RPC 4 ตัว |
| A5 | เลขที่เอกสารแทนสัญญา ออก **ตอน AE Sup อนุมัติใบ ในทรานแซกชันเดียวกัน** ไม่ใช่ขั้นแยกที่หน้าสัญญา | `approve_historical_sales_order` เรียก `approve_external_sales_contract` |
| A6 | รอบขายของโซน (`service_zone_terms`) เกิด **ตอนอนุมัติ** | RPC อนุมัติ ข้อ 10 |
| A7 | **"งวดยกมา"** = เงินที่เก็บไปแล้วก่อนเข้าระบบ · ใบละไม่เกิน 1 งวด · บัญชีรับรองครั้งเดียว · ไม่มีวันครบกำหนด | `sales_order_installments.kind` + CHECK/unique ของ 0374 |
| A8 | **เลิกสวิตช์ยกเว้นด่านเงินรายใบ** (มติข้อ 13 ของ 0360 ถูกทับ) — ใบยอด 0 ผ่านด่าน② เองทุก origin | `paymentNotRequired` ใน `visitGate`/`intake` |
| A9 | สัญญากรอกในฟอร์มคีย์ใบ (ชนิด · เลขอ้างอิง · ช่วงวัน · ไฟล์) ไม่ใช่เดินขั้นสัญญาแยกหลังบันทึก | ขั้น ① ของฟอร์ม + RPC สร้าง `sales_contracts` ร่างให้ |
| A10 | ชนิดเอกสารภายนอกเพิ่ม **`signed_quotation`** ("ใบเสนอราคาที่ลูกค้าเซ็น") | CHECK `sales_contracts_external_kind` (0374 §4) + `EXTERNAL_DOC_KINDS` |
| A11 | **แก้ข้อมูลที่อนุมัติแล้ว = ยกเลิกใบ แล้วคีย์ใหม่** — ไม่มี "ตีกลับหลังอนุมัติ" | `HISTORICAL_CORRECTION_PATH` + trigger void สัญญา (§8D) |
| A12 | บรรทัดของใบต้องเป็น **แพ็คเกจบริการหมวด 02-001** เท่านั้น | `historical_so_check_lines` + `lineIsServicePackage` (ตัวเดียวกับ `SERVICE_ROUND_CATEGORY`) |
| A13 | **(23/09) บรรทัดโซน = บรรทัดใบเสนอราคา** — *"3500 x 1 ชุด x 12 เดือน · มันต้องไม่ควรแตกต่างจาก form ใบเสนอราคา เพื่อไม่ให้ USER สับสน"* ⇒ จำนวน × ราคา/หน่วย (ราคาผลิตในทะเบียน · ล็อก) − ส่วนลดรายการ (ไม่ลด/%/บาท) = จำนวนเงิน · หน่วยจากสินค้า · 1 ชุด 12 เดือน = **จำนวน 12 (แพ็คเกจ) × 3,500 = 42,000** · VAT = ตัวเลือกของใบเสนอราคา ("รวม VAT แล้ว" 0 · "+ VAT 7% ท้ายใบ" 7) · ถอดช่อง "แพ็ค" · ยอดที่พิมพ์เอง · ปุ่มลัด "ราคา × แพ็ค × เดือน" · โหมด "ราคารวม VAT แล้ว — ถอด VAT" | `historicalLinesMoney` (= `quoteLineMoney` + `quoteTotals` ของใบเสนอราคา) · `planHistoricalServiceOrder` อ่านราคาจาก `products."costPrice"` เท่านั้น · mig **0379** บังคับสูตรในฐาน |
| A14 | **(25/09) ขั้น ② หน้าตาเหมือนใบเสนอราคา + เชื่อมไซต์ · โซนรายบรรทัด** — *"หน้า SO ย้อนหลัง ใช้แล้ว สับสนยาก มันควรจะหน้าตาเหมือนใบเสนอราคา แต่เพิ่มการเชื่อม ไซท์ โซน รายรายการเข้าไป"* · *"ใช้แพ็คเกจเดียวกันทุกโซนคืออะไร จำเป็นหรอ"* · *"ส่วนลด รายบรรทัด รายใบก็ควรครบ"* ⇒ ตารางเดียว + ปุ่ม "เพิ่มรายการ"/"เพิ่มหลายโซน" · โซนเลือกในบรรทัด · **ส่วนลดท้ายใบ** (ไม่ต้องแก้ฐาน — RPC 0374 รับ `discountAmount` และตรวจยอดหัวใบลงตัวอยู่แล้ว · ชนิด/ค่าเก็บใน `metadata.historicalIntake`) · **VAT ในกล่องสรุป ไม่มีค่าตั้งต้น** · จำนวนเริ่มว่าง และไม่มีหมายเหตุรายบรรทัด (เจ้าของรับรองทั้งสองข้อ) | `WizardZonesStep` · `HistoricalBulkZonesModal` · `QuoteLineTotalsEditor` (ใช้ร่วมกับใบเสนอราคา) · `historicalZonePickerOptions` · `historicalPruneIssues` · `planHistoricalServiceOrder` (ด่าน `discount`) |
| A15 | **(25/09) รื้อขั้น ① ลูกค้าและสัญญา** — *"ขอทำส่วนลูกค้าและสัญญาก่อน รื้อ UI design"* · ม็อกผ่านโดยขอแก้ข้อเดียว (ลูกค้ากับ AE วางคู่กัน) ⇒ หัวเอกสาร `DetailOverview` ตัวเดียวกับหน้าสร้างใบเสนอราคา (ช่องสรุป ลูกค้า · AE · ช่วงสัญญา · ไฟล์ แทนแถบสรุปขวา — ขั้น ① ② ④ ไม่มีแถบแล้ว เหลือขั้น ③) · การ์ด ที่มาของใบ / เอกสารแทนสัญญา / อ้างอิงเดิม / หมายเหตุ · ชนิดเอกสาร `ChoiceChips` · คำอธิบายใต้ช่องเหลือเฉพาะที่ต้องรู้ตรงนั้น · **ก้อนแดงขึ้นหลังกด "ถัดไป"/แตะขั้นข้างหน้า/บันทึก เท่านั้น ทุกขั้น** (ข้อของวันสัญญาที่เพิ่งพิมพ์ยังขึ้นใต้ช่องทันที — ธง `live`) · รีวิว 25/09: ช่องบังคับของขั้น ① ตรวจที่จอครบในรอบเดียว เรียงตามจอ ข้อความเดียวกับแผน (`HISTORICAL_REQUIRED_MESSAGES`) · หัวไม่ลงแถบหัวลอย (`pin={false}` — ปุ่มกลับของแถบข้ามยามงานยังไม่บันทึก) · ชนิดเอกสารแก้ได้ตอนแก้ใบ | `WizardContractStep` · `historicalVisibleIssues` · `historicalContractFacts` · `HISTORICAL_FULL_WIDTH_STEPS` · `revealedSteps` ใน `HistoricalOrderWizard` |
| A16 | **(25/09) รื้อขั้น ③ งวดชำระ** — *"ขอรื้อส่วนงวดชำระด้วยได้มั้ย"* · ม็อกผ่าน (Step3New/Step3Full/Step3Split บนแคนวาสเดียวกัน) + คำตอบ 3 ข้อ: ① **ถอดแถบสรุปข้างขวาในขั้น ③ ด้วย** (ยอดใบ · หักงวดยกมา · งวดที่ยังต้องเก็บ อยู่ในกล่องสรุปท้ายตาราง) ② **งวดสุดท้ายคิดให้** — ยอด = ยอดที่ต้องเก็บ − งวดอื่น · ครอบถึงวันสิ้นสุดสัญญา (ล็อกพร้อมเหตุ) ③ **สัญญาที่จบตรงวันครบรอบ** (28 จาก 81 กลุ่มในชีต) นับเป็น n เดือน แบ่งทุกเดือน/3/6/รายปีได้ งวดสุดท้ายยาวขึ้น 1 วัน · ที่ตัดสินตามข้อเสนอ: คำถามสามทาง (3 ใน 4 ใบจริง = จ่ายครบ — ยอด/ช่วงคิดให้) · ช่วงของงวดต่อกันเอง (กรอกแค่ "ถึง") · หน้าต่างแบ่งงวดตาม**เดือนปฏิทิน** (ของเดิมหารจำนวนวันเท่ากัน — SO-26090232-0 ลงฐานไปแบบนั้น) + วันครบกำหนด 4 แบบ (วันเริ่มงวด · สิ้นเดือน · ทุกวันที่ n · กรอกเอง) ไม่มีค่าตั้งต้น · วันครบกำหนดยังบังคับทุกงวด (เลิกบังคับ = แก้ CHECK ของ 0374) · งวดยกมาเป็นแถวแรกของตาราง (เลขงวด = เลขงวดของใบ) · ข้อรายงวดของแผนชี้ช่อง `installments.<i>.<ช่อง>` + `detail` · ไม่ใช้ตัวแก้งวดของหน้าใบสั่งขาย (`QuotationInstallments` — เพดาน 12 งวด · แดงสดระหว่างพิมพ์ · ไม่มีห่วงโซ่) | `WizardMoneyStep` · `HistoricalInstallmentTable` · `HistoricalSplitModal` · `CardHeading` · `historicalInstallmentChain` · `historicalMoneyIssues` · `historicalOpeningModeChange` · `historicalSplitPreview` · `serviceMonthSpan` · `splitCoverageByMonths` / `dueDateByRule` (paymentCoverage) |
| A17 | **(25/09) รื้อขั้น ④ ตรวจและส่งอนุมัติ** — *"ขอรื้อขั้น ④ ตรวจและส่งอนุมัติด้วย"* · ม็อกผ่าน (Step4New/Step4Dup บนแคนวาสเดียวกัน) + คำตอบ 4 ข้อ: ① **ไม่มีหน้าต่างยืนยันก่อนส่ง** (ขั้น ④ คือหน้ายืนยันอยู่แล้ว · ส่งแล้วดึงกลับ/ถูกตีกลับได้) ② ผู้อนุมัติเรียกว่า **"ผู้จัดการฝ่ายขาย"** ทั้งฟอร์มและหน้าใบย้อนหลัง (`HISTORICAL_APPROVER_LABEL` — ผู้ที่อนุมัติได้จริงคือ AE Sup · CM · Commercial Director + Admin · ใบปกติคงคำเดิม) ③ **บันทึกว่าผู้คีย์ยืนยันใบไหนว่าไม่ซ้ำ = งานถัดไป** (รอบนี้ยังไม่เก็บ) ④ **จำนวนแพ็คเกจ ≠ จำนวนเดือน** ("บางรายการอาจใช้ 2 แพ็คต่อเดือน") ⇒ ไม่มีคำใบ้/คำเตือน/กฎ จำนวน × เดือน · ที่ตัดสินตามข้อเสนอ: แถวตรวจใช้ตัวสร้างประโยคชุดเดียวกับหน้าต่างอนุมัติ (`historicalApprovalFacts` ได้ผลไบต์เดิม) · คำเตือนของแผนมีหัวข้อ (`warningItems` — `warnings` สตริงเดิม · ไม่เข้า RPC) รวมเป็นกลุ่ม (งวดเลยกำหนด 10 งวด = ข้อเดียว) · "ไม่มีงวดยกมา" ไม่ใช่คำเตือน (เป็นค่าของแถว) · ใบที่อาจซ้ำบอก "ตรงกันที่" (`matchedOn`) ลิงก์เปิดแท็บใหม่ · 400 ลงเครื่องหมายผิดทันทีที่ขั้นแรกที่ผิด · รหัสของ server พาไปขั้นที่มีช่อง (ตารางรหัส → ขั้น ①/②/③) · ไฟล์ที่อัปไม่ขึ้นเอาออกจากตะกร้าได้ · ใบถูกแก้จากที่อื่น = "โหลดใบล่าสุด" (ถามก่อน) · "ยกเลิก" → **"ออกจากฟอร์ม"** (ลิงก์ตอนว่าง · ปุ่มดับตอนบันทึก) · ยามงานยังไม่บันทึกคลุมตอนกำลังบันทึก · ป้ายตีกลับรอดการพลิกเป็นร่าง (`rejectedAt`) · ผู้คีย์ = ผู้ใช้ที่ล็อกอิน · 🐞 UAT 390px: แถบปุ่มแบบหน้า (`.form-action-bar.is-page` ทั้งระบบ 9 หน้า) เคยยืนใต้แถบเมนูล่างของมือถือ ปุ่มถูกทับ ⇒ เผื่อ `--mobile-nav-h` · **รีวิว 4 มุม (25/09) แก้แล้ว**: "กดเพื่อทำต่อ" เฉพาะผลที่กดซ้ำผ่านได้ · "ใบร่าง … บันทึกแล้ว" เฉพาะเมื่อรอบนี้ลงฐานจริง · นับ/จำชื่อไฟล์สัญญาทีละไฟล์ที่ขึ้น · ยามออกจากหน้าผูกกับรอบบันทึก (ไม่ใช่พรีวิว) · รางขั้น ④ เหลืองเมื่อปุ่มติดด่าน · ป้ายสถานะ "ถูกตีกลับ — แก้แล้วส่งใหม่" รอดการพลิกเป็นร่าง · รหัสที่ไม่รู้จัก = แจ้งผู้ดูแลพร้อมรหัส · ข้อความ `historical_so_money_mismatch` / `historical_so_approve_forbidden` และคำ "AE Sup" ที่ค้างในแผงงวดของใบย้อนหลัง | `WizardReviewStep` · `historicalReviewView` (`historicalReviewChecklist` · `historicalWarningGroups` · `historicalReviewFootNote` · `historicalSaveStages` · `historicalSaveResultView` · `historicalReviewFacts` · `historicalKeyerMode` · `historicalSubmitToast`) · `historicalAfterSendRail` · `historicalSaveExit` (ตารางรหัส → ขั้น) · ถอด `historicalExitActions` / `historicalSaveFailureState` |
| A18 | **(26/09) บันทึกใบซ้ำที่ผู้คีย์ยืนยัน** — *"ทำงานถัดไป บันทึกใบซ้ำที่ผู้คีย์ยืนยัน"* (A17 ③ ที่พักไว้) · ม็อก DupAckKeyer/DupAckApprove/DupAckPage บนแคนวาสเดียวกัน + คำตอบ 4 ข้อ: ① ใบที่อาจซ้ำที่เกิด **หลัง** ผู้คีย์ยืนยัน = **เตือนในหน้าต่างอนุมัติ ไม่บล็อก** (ตรวจใหม่ทุกครั้งที่เปิดใบ · ตัวจับคู่ตัวเดียวกับตอนคีย์ `historicalDuplicateMatches`) ② **เหตุผลช่องเดียว ไม่บังคับ ≤500** (ขึ้นใต้สวิตช์เมื่อเปิด · ผู้อนุมัติเห็น) ③ ใบที่ถูกตีกลับ/ดึงกลับแล้วเปิดมาแก้ = **สวิตช์เริ่มปิด ต้องยืนยันใหม่** · โชว์ "รอบก่อน {ชื่อ} ยืนยัน n ใบเมื่อ …" + **เติมเหตุผลเดิมให้** ④ หน้าใบ = **การ์ด "ใบที่อาจซ้ำ" ในแท็บภาพรวม ต่อจากการ์ดโซน** (ขึ้นเฉพาะใบที่มี) · ที่ตัดสินตามข้อเสนอ: **ไม่มี migration** — บันทึกที่ `sales_orders.metadata.historicalIntake.duplicateReview` (RPC ของ 0374 เก็บ `p_header.intake` ทั้งก้อนในทรานแซกชันเดียวกับใบ) ต่อท้ายอาร์กิวเมนต์ที่ route **หลังประกอบแล้ว** ⇒ ไม่เข้าลายนิ้วมือ (มีเทสต์ยาม) · เขียนทุกครั้งที่บันทึกจริง (ไม่มีใบซ้ำ = `orders: []` ⇒ "ไม่มีบันทึก" = ใบก่อนมีระบบนี้) · ของเก่าอยู่ใน audit_logs · **ยืนยันเป็นรายใบ** (`acknowledgedDuplicateIds` — ใบที่ server พบแต่ผู้คีย์ไม่เคยเห็น = 409 · 🐞 ของเดิม: พรีวิวใหม่ได้ใบเพิ่มแต่สวิตช์ยังเปิดค้าง) · แท็บรุ่นก่อนที่ส่ง `acknowledgeDuplicates: true` ยังรับ (บันทึก `basis: flag`) · บันทึกเก็บภาพนิ่งของใบที่ยืนยัน (เลข · สถานะตอนยืนยัน · ตรงกันที่) · ผู้อนุมัติเห็นสถานะตอนยืนยันเทียบตอนนี้ · ใบที่ถูกลบ/ยกเลิกไปแล้ว · ใบที่พบเพิ่ม · ลิงก์เปิดแท็บใหม่ · ช่องว่างที่เหลือ (แข่งกันคีย์พร้อมกัน/สร้างซ้ำได้ใบเดิมคืน) ปิดด้วยการตรวจใหม่ตอนเปิดใบ (ปิดขาดต้อง migration — RPC รับรายการ) | `lib/sales/historicalDuplicates.js` (`historicalDuplicateMatches` · `historicalDuplicateAckOf` · `historicalDuplicatesAcknowledged` · `historicalDuplicateReviewRecord` · `historicalDuplicateReviewOf` · `historicalDuplicateReviewView` · `historicalDuplicateApprovalRows`) · `HistoricalDuplicateTable` (ขั้น ④ + การ์ดหน้าใบ) · `HistoricalDuplicateReviewCard` · `loadHistoricalOrderExtras().duplicateCheck` · `historicalApprovalFacts({ duplicateCheck })` |

### 1.2 มติของ 0360 ที่ยังใช้อยู่

ข้อ 1 · 2 · 3 · 4 · 5 · 7 · 10 · 12 · 14 · 16 · 18 · 19 · 20 · 21 · 22
— **เงินงานเก่าไม่เข้า Actual/FC/เป้า** · เก็บยอดจริงแล้วกรองที่ตัวคำนวณ · ไม่มีใบเสนอราคา ไม่มีโครงการ ·
ระบบออกเลข SO ใหม่ตามรูปแบบปกติและ **วันที่ใบ = วันเริ่มสัญญาจริง** (เลขเดิมเก็บเป็นอ้างอิงและค้นเจอ) ·
ดีลภาชนะ 1 ใบต่อ (ลูกค้า × AE) ชื่อ "ดีลงานบริการย้อนหลัง" (ห้ามเรียก "ดีลเก่า") · `origin='historical'` มีบ้านเดียวที่ `lib/sales/historicalOrders.js`

### 1.3 มติของ 0360 ที่ถูกทับแล้ว — อย่าอ่านของเก่าไปทำ

| ข้อเดิม | เคยเขียนว่า | 22/09 ว่า |
|---|---|---|
| 6 | ใบเกิดเป็น **อนุมัติแล้ว** ทันที · `approvedAt` = เวลาคีย์ | ใบเกิดเป็น **ร่าง** → ส่งอนุมัติ → AE Sup อนุมัติ (A4) |
| 8 | 1 บรรทัด = 1 **จุดติดตั้งที่พิมพ์เป็นข้อความ** | 1 บรรทัด = **1 โซนในทะเบียน** (A3) · `installationPoint` เหลือเป็น snapshot ที่ระบบเขียนเอง |
| 9 | งานที่จบแล้ว (`running:false`) = เฟสสอง | ฟอร์มรับเฉพาะสัญญาที่ยังไม่หมดอายุ (วันสิ้นสุด ≥ วันนี้) — เกณฑ์เดียวกัน ตรวจที่ JS |
| 11 | ใบยอด 0 ต้องมีหมายเหตุ **+ ยกเว้นด่านเงินอัตโนมัติ** | ใบยอด 0 ต้องมีหมายเหตุ และ**ต้องไม่มีงวดเลย** · ด่านเงินผ่านเองด้วย `paymentNotRequired` (A8) |
| 13 | งวด = คีย์เท่าที่รู้ + **สวิตช์ยกเว้นด่านเงินรายใบ** | งวดต้องครบยอดใบและครอบต่อเนื่องเต็มช่วงสัญญา · **สวิตช์ถูกถอด** (A7/A8) |
| 15 | คีย์ได้: AE Supervisor + แอดมิน | ฝ่ายขายทุกตำแหน่ง + แอดมิน (A1/A2) |
| 17 | **TS ผูกบรรทัด ↔ โซน** ในคิวงานเข้าใหม่ | SA ผูกตอนคีย์ · รอบขายเกิดตอนอนุมัติ · TS เหลือตั้งรอบ (A3/A6) |
| 23 | "TS ไม่พบจุดนี้หน้างาน" (ทาง ข · mig 0362/0366) | **ไปไม่ถึงแล้ว** — บรรทัดผูกโซนตั้งแต่คีย์ ⇒ ถอดโค้ดทิ้ง (§10) คอลัมน์/CHECK/trigger ของ 0362 ยังอยู่ในฐาน |

## 2. โครงสร้างข้อมูล (mig 0360 เดิม + **mig 0374**)

### 2.1 ของเดิมที่ยังอยู่ (0360)

- `sales_deals.origin` · `sales_orders.origin` — `'pipeline' | 'historical'` DEFAULT pipeline · **เปลี่ยนไม่ได้** (trigger `guard_record_origin_immutable`)
- `sales_orders`: `historicalQuoteRef` · `historicalExpressRef` · `historicalInvoiceRef` (≤200) · `historicalIntakeHash` (sha256 ของคำขอ)
- `sales_order_lines."installationPoint"` (1–200) — **0374 ยังเขียน** แต่เป็น snapshot `"<รหัสไซต์> <ชื่อไซต์> · <ชื่อโซน>"` ที่ RPC ประกอบเอง
- `sync_sales_order_actual` / `enforce_sales_order_actual_on_deal` = 0353 + `origin = 'pipeline'` สี่จุด — **0374 ไม่แตะ** (เทสต์ตรึง)
- CHECK `sales_deals_historical_shape` + unique `sales_deals_historical_container_uk` (ดีลภาชนะ) · `sales_orders_historical_refs_len` · `intake_hash_format`
- `paymentGateExempt*` 4 คอลัมน์ + CHECK `payment_gate_exempt_sane` — **ยังอยู่ในฐานแต่เลิกใช้**
  CHECK ใหม่บังคับให้ใบย้อนหลัง `"paymentGateExemptAt" IS NULL` เสมอ · ไม่มีตัวอ่านไหนในโค้ดแล้ว (ร่องรอยปลอมไม่ปลดด่าน)
- คอลัมน์/CHECK/trigger ของ **0362** (ธง "TS ไม่พบจุด") ยังอยู่ 0 แถว — ไม่มีโค้ดเรียก (§10) · `siteNotFoundMigration.test.mjs` ยังตรึงรูปไว้

### 2.2 mig 0374 — `0374_historical_so_approval_flow.sql`

| ส่วน | ของ |
|---|---|
| §1 | `sales_order_lines."serviceZoneId"` → `service_zones(id)` **ON DELETE RESTRICT** + partial index `sales_order_lines_service_zone_idx` |
| §2 ด่านกันรันทับข้อมูลเก่า | `DO` block: มีใบย้อนหลังแบบเดิม (มีร่องรอยยกเว้น หรือไม่มีบรรทัดที่ชี้โซน) = `RAISE mig_0374_old_historical_rows_exist` · รันครั้งแรกเจอ 0 แถว · รันซ้ำผ่านเพราะใบแบบใหม่ทุกใบมีบรรทัดชี้โซน · ⚠️ ด่านอ่าน `l."serviceZoneId"` ⇒ **ต้องอยู่หลัง §1** (เทสต์ตรึงลำดับไว้ — ย้ายขึ้นหัวไฟล์เมื่อไร ด่านตายที่ 42703) |
| §3 | `sales_order_installments.kind` `'regular'\|'opening'` NOT NULL DEFAULT `'regular'` · CHECK `sales_order_installments_kind_check` · CHECK `sales_order_installments_opening_shape` (opening ต้องมีช่วงครอบ และ **ห้ามมีวันครบกำหนด**) · UNIQUE `sales_order_installments_opening_uk` (ใบละ 1 งวดยกมา) |
| §4 | CHECK `sales_contracts_external_kind` + `'signed_quotation'` |
| §5 | CHECK `sales_orders_origin_shape` **ใหม่** — กิ่ง pipeline เหมือน 0360 ทุกตัวอักษร |
| §6 | `DROP FUNCTION` 4 ตัวของโมเดลเดิม: `create_historical_sales_order` (9 arg) · `append_historical_installments` · `historical_so_installments_total` · `remove_historical_sales_order_line` |
| §7 | ตัวช่วย 4 + trigger function 2 + trigger 3 (ตารางถัดไป) |
| §8–11 | RPC 4 ตัว (ตารางถัดไป) |
| §12 | `REVOKE ALL` จาก PUBLIC/anon/authenticated ทั้ง 10 ฟังก์ชัน · `GRANT EXECUTE … TO service_role` **เฉพาะ RPC 4 ตัว** — ตัวช่วยและ trigger function ไม่มี GRANT ให้ใครเลย (รันในฐานะเจ้าของผ่าน SECURITY DEFINER/trigger) |

**กิ่ง historical ของ CHECK `sales_orders_origin_shape`** — สถานะ `draft` · `pending_approval` · `rejected` · `approved` · `cancelled` ·
`approved` ต้องมีผู้อนุมัติ · สามสถานะแรกต้องไม่มีร่องรอยอนุมัติ · `pending_approval` ต้องมี `submittedAt` ·
`quotationId`/`projectId` ว่าง · `revisionNo = 0` · ไม่มี `revisedFromId`/`supersededById` · `financeStatus` NULL ·
ไม่มีหลักฐานลายเซ็นทั้งสองช่อง · มี `historicalIntakeHash` · ไม่มีร่องรอยยกเว้นด่านเงิน
⇒ **ย้อนการอนุมัติ · ออก Rev. ยังตายที่ CHECK เหมือนเดิม**

| ฟังก์ชัน | ชนิด | ทำอะไร |
|---|---|---|
| `historical_so_check_contract(jsonb)` | ตัวช่วย (ไม่มี GRANT) | ชนิดเอกสาร · เลขอ้างอิง ≤200 · ช่วงวัน 2000–2100 · เริ่ม ≤ สิ้นสุด · **เริ่ม ≤ วันนี้ (เวลาไทย)** |
| `historical_so_check_lines(jsonb, text)` | ตัวช่วย | ≥1 บรรทัด · สินค้าอยู่ใน `products` และหมวด **02-001** · โซนเปิดใช้งาน + ไซต์เปิดใช้งาน + ไซต์เป็นของลูกค้าในใบ + ชนิด `customer` · ห้ามโซนซ้ำ · คืน Σ ยอดบรรทัด |
| `historical_so_check_installments(jsonb, numeric, date, date)` | ตัวช่วย | รูปของ `งวดยกมา`/งวดปกติ · Σ งวด = ยอดใบ (เผื่อ 0.01) · **ครอบต่อเนื่องเต็มช่วงสัญญา ไม่มีช่องว่างไม่มีทับ** · หมายเหตุ ≤1000 · ใบ ฿0 ห้ามมีงวด |
| `historical_so_write_children(text, jsonb, jsonb, numeric, text, text)` | ตัวช่วย | **ด่านของตัวเองมาก่อน `DELETE` เสมอ**: ล็อกหัวใบ · ต้องเป็นใบย้อนหลังสถานะร่าง/ถูกตีกลับ · ยังไม่มีรอบขายของโซน · ยังไม่มีงวดที่ตรึง — ไม่ครบ = `historical_so_edit_state_invalid` · แล้วค่อยเขียนบรรทัด/งวดใหม่ทั้งชุด |
| `historical_so_void_substitute_contract()` | trigger fn | ยกเลิกเอกสารแทนสัญญา (ร่างหรือลงนามแล้ว) ของใบที่ถูกยกเลิก/ลบ · มี `NOT EXISTS` กันไม่ให้แตะสัญญาที่ใบอื่นซึ่งยังไม่ยกเลิกผูกอยู่ |
| `historical_so_no_reopen()` | trigger fn | `RAISE historical_so_reopen_forbidden` |
| `create_historical_sales_order` (10 arg) | RPC | ดีลภาชนะ + เอกสารแทนสัญญาร่าง + ใบสถานะ **ร่าง** + บรรทัด + งวด ในทรานแซกชันเดียว |
| `update_historical_sales_order` (9 arg) | RPC | แก้ใบร่าง/ใบที่ถูกตีกลับ — **ลูกค้ากับ AE ล็อก** · เขียนบรรทัด/งวดใหม่ทั้งชุด · พลิก `rejected` → `draft` |
| `submit_historical_sales_order` (6 arg) | RPC | ต้องมีไฟล์เอกสารแทนสัญญา + หลักฐานงวดยกมา ⇒ `pending_approval` · ล้าง `"rejectionReason"` |
| `approve_historical_sales_order` (11 arg) | RPC | replay-safe · ออกเลข CT · ใบ `approved` · ตรึงงวด · เปิดรอบขายของโซน |

| trigger | บนอะไร | เมื่อไร |
|---|---|---|
| `sales_orders_historical_void_contract_upd` | AFTER UPDATE OF status | ใบย้อนหลังเปลี่ยนเป็น `cancelled` |
| `sales_orders_historical_void_contract_del` | BEFORE DELETE | ลบใบย้อนหลัง |
| `sales_orders_historical_no_reopen` | BEFORE UPDATE OF status | `approved`/`cancelled` → `draft`/`pending_approval`/`rejected` = ปฏิเสธ |

🔴 **ทำไมต้องมี `sales_orders_historical_no_reopen`** — CHECK ของ 0360 เคยกันการคืนสถานะให้เองเพราะใบย้อนหลังมีได้สถานะเดียว
CHECK ใหม่เปิดให้มี `draft` ที่ `approvedAt` ว่าง ⇒ action `restore` ของแอดมิน (ซึ่งล้าง `approvedAt` ทิ้ง) จะผ่าน CHECK ได้
ด่านฝั่ง JS ยังอยู่ แต่**ตัวกันจริงย้ายมาอยู่ที่ trigger** (คอมเมนต์ของ action `restore` ใน
`app/api/sales-planning/sales-orders/[id]/route.js` ถูกแก้ให้อ้าง trigger ไม่ใช่ CHECK แล้ว)

### 2.4 mig 0379 — `0379_historical_so_quote_lines.sql` (มติ 23/09 · `รอดำเนินการ`)

นิยามใหม่ **สองตัว** ด้วยลายเซ็นเดิม — ตัวอื่นของ 0374 ไม่แตะ · คงทุกคำสั่งของ 0374 ไว้แล้วเติม (ยามเทียบรายคำสั่ง)

| ส่วน | ของ |
|---|---|
| ด่าน (DO · อ่านอย่างเดียว) | ใบย้อนหลังที่ยังไม่อนุมัติ (ร่าง/รออนุมัติ/ตีกลับ) มีบรรทัดที่ `lineTotal > round(qty × unitPrice, 2) + 0.01` = `RAISE mig_0379_historical_lines_not_quote_shaped` (หยุดทั้งไฟล์) · ใบอนุมัติแล้วไม่นับ |
| `historical_so_check_lines` | + ส่วนลดรายการ: ชนิด NULL/`percent`/`amount` (= `QUOTE_DISCOUNT_TYPES`) · ไม่ลดต้องมีค่า 0 · % ≤ 100 · ไม่ติดลบ · **สูตรสองระดับ**: มีคีย์ `discountAmount` (payload ของการบันทึก) = สูตรเต็มของ `quoteLineNet` ±0.01 · ไม่มีคีย์ (แถวที่เก็บแล้ว ซึ่งขั้นส่ง/อนุมัติของ 0374 ประกอบ jsonb ใหม่โดยไม่มีคีย์ส่วนลด) = แค่ `lineTotal ≤ round(qty × unitPrice, 2) + 0.01` · รหัสใหม่ `historical_so_line_money_mismatch` · **ไม่อ่านราคาในทะเบียน** (รันตอนอนุมัติด้วย) |
| `historical_so_write_children` | + หลังด่านสถานะ ก่อน `DELETE`: ทุกบรรทัดต้องมี `discountAmount`/`discountValue` เป็นตัวเลข (ไม่มี = ฟอร์มรุ่นก่อน → `historical_so_line_invalid`) · `"costPrice"` ว่าง/≤0 → `historical_so_line_unpriced` · `unitPrice ≠ "costPrice"` → `historical_so_line_price_not_registry` (409 "ราคาในทะเบียนเพิ่งเปลี่ยน — ตรวจใหม่แล้วบันทึก") · บรรทัดเก็บส่วนลดสามช่อง · `metadata = '{}'` (ไม่มี `grossAmount`) = รูปเดียวกับบรรทัดที่ 0363 ก๊อปจากใบเสนอราคา |
| สิทธิ์ | REVOKE สองตัวจาก PUBLIC/anon/authenticated/service_role เท่า 0374 · ไม่มี GRANT |

⚠️ **4 ใบที่ค้างรออนุมัติ (23/09)** — ทุกบรรทัด 12 × ราคาในทะเบียน ไม่มีส่วนลด ⇒ ผ่านทางหลวม **AE Sup อนุมัติได้โดยไม่ต้องคีย์ใหม่**
(ฮาร์เนสพิสูจน์รวมกรณีทะเบียนเปลี่ยนราคาหลังรัน) · ถูกตีกลับ = ฟอร์มใหม่โหลดบรรทัดเดิมกลับครบ แล้วบันทึกที่ราคาในทะเบียนปัจจุบัน
⚠️ **ผลต่อ TS** — RPC อนุมัติเขียน `service_zone_terms."packageQty" = qty` ⇒ "1 ชุด × 12 เดือน" = packageQty **12** (ภาระงานนับ 12 แพ็ค)
เท่ากับบรรทัดของใบ pipeline วันนี้ · ยังไม่แก้ (§10)

### 2.3 สถานะของใบ (เดินได้ทางเดียว)

```
คีย์ใบ ──> draft ──"บันทึกและส่งอนุมัติ"──> pending_approval ──อนุมัติ──> approved
             ↑                                │  │
             │                                │  └──ดึงกลับ (withdraw)──> draft
             └──"ตีกลับให้แก้ไข"──────────────┘                              (แก้ในฟอร์มเดิม)
                         rejected ──แก้แล้วส่งใหม่──> pending_approval
   ทุกสถานะ ──ยกเลิก──> cancelled   (approved/cancelled กลับไม่ได้ · trigger กัน)
```

- **`draft` มีอยู่เพราะไฟล์ต้องมีแถวก่อน** — ไฟล์เอกสารแทนสัญญาต้องเป็น `attachments` ของสัญญา และหลักฐานงวดยกมา
  ต้องอยู่ใต้ `sales-orders/<ใบ>/payments/` ⇒ สร้างแถวก่อน อัปไฟล์ แล้วค่อยส่งอนุมัติ (§8A)
  กดครั้งเดียวจบทั้งลำดับ · ร่างค้างเกิดเฉพาะตอนกดแล้วล้มกลางทาง ซึ่งขึ้นในเลน "รอฉันลงมือ" ของผู้คีย์และในทะเบียน SO
- **`approval_revoked` / `revised` เป็นไปไม่ได้** (CHECK)
- **แก้ใบที่อนุมัติไปแล้ว = ยกเลิกแล้วคีย์ใหม่** — §8D

## 3. ทางเข้าของคน

| ใคร | ทำอะไร | ด่าน |
|---|---|---|
| `ae` · `senior_ae` | คีย์ใบ **ของตัวเอง** (ช่อง AE ล็อกเป็นตัวเอง) · แก้ใบร่าง/ใบที่ถูกตีกลับ · ส่งอนุมัติ | `canKeyHistoricalSalesOrder` + `ownerLockedToSelf` |
| `ac` (และทุกคนที่ขอบเขตแก้ ≠ `all`) | คีย์ให้ AE ในทีมที่ตัวเองดูแล — วัดกับ **ดีลภาชนะที่ใบจะเข้าไปอยู่จริง** (ดีลเดิมของคู่ ลูกค้า × AE ถ้ามี ไม่งั้นทีมของ AE) | `inSalesEditScope(actor, effectiveDeal)` ใน planner ทั้งพรีวิวและบันทึก |
| `ae_supervisor` | คีย์ได้ · **อนุมัติ/ตีกลับใบของคนอื่น** · ยกเลิกใบ · ย้ายเจ้าของดีลภาชนะ | `isSalesOrderReviewer` · `canMoveHistoricalDealOwner` |
| `admin` | ทุกอย่าง + **อนุมัติใบตัวเองได้แบบ Admin Override** (เหตุผลไม่บังคับ = เท่าสาย pipeline) · ลบใบ | `HISTORICAL_KEYER_ROLES` + `isSalesOrderReviewer` |
| FN (บัญชี) | รับรอง/ตีกลับ **งวดยกมา** และงวดที่เหลือ · เป็นคนเดียวที่แก้ช่วงครอบของใบย้อนหลังได้ | สิทธิ์เดิมของงวด (`canConfirmPayment`) |
| TS | **ตั้งรอบ** (โซนผูกมาแล้ว) · ไม่มีขั้นผูกโซนอีก | `canEditService` |

🔴 **ผู้คีย์อนุมัติใบตัวเองไม่ได้** (ยกเว้น admin ผ่าน Override) — ทั้งด่านฝั่ง JS (`approveHistoricalOrder`) และ RPC
(`historical_so_self_approval`) ตรวจก่อนแตะฐาน · ป้ายตัวเลขบนเมนูของผู้ตรวจ**ตัดใบของตัวเองออกแล้ว** ⇒ ป้ายตรงกับคิว
(เปลี่ยนพฤติกรรมของใบ pipeline ด้วย — ดู §10)

⚠️ **ย้ายเจ้าของดีลภาชนะถูกล็อกระหว่างมีใบค้าง** — `PATCH /api/sales-planning/deals/:id { ownerId }` ตอบ 409
ถ้าดีลนั้นถือใบย้อนหลังสถานะ `draft`/`pending_approval`/`rejected` อยู่ เพราะการย้ายไม่ sync `sales_contracts.team/ownerId`
⇒ เจ้าของใหม่จะแตะไฟล์ของสัญญาร่างไม่ได้

## 4. จุดตัดเรื่องเงิน (ทุกจุดที่ใบย้อนหลังต้องไม่ถูกนับ)

**ไม่เปลี่ยนจาก 0360** — และ 0374 ตอกเพิ่มว่า **ใบที่รออนุมัติก็ไม่นับ**

**SQL** — cache Actual/รออนุมัติของดีล (`sync_sales_order_actual` + `enforce_sales_order_actual_on_deal` กรอง `origin='pipeline'`)
⇒ ใบย้อนหลังที่ `pending_approval` **ไม่เข้ายอด `soPending*`/"รออนุมัติ"** เลย ([so-pending-approval-amount.md](so-pending-approval-amount.md))
⇒ RPC อนุมัติ **ไม่แตะ `actualAmount` · `financeStatus` · หลักฐานลายเซ็น** เลยสักช่อง

**ตัวอ่านใบสั่งขาย**
- `api/sales-planning/report` (ใบอนุมัติรายเดือน + ใบรออนุมัติ) — `pipelineRowsOnly`
- `lib/pm/productionJobsRepo` ร่างงานผลิตอัตโนมัติ — `pipelineRowsOnly` + `isHistoricalOrder` ใน `productionPlan`
- `lib/sales/handoffQueueData` คิวรอยื่นภาษี · `api/tax/orders/from-sales-order`
- `lib/sales/salesOrderWorkflow`: `salesOrderAmountKind` = `'excluded'` · `salesOrderActual` = 0
- `api/admin/signature-coverage` — `pipelineRowsOnly` (ใบย้อนหลังไม่มีลายเซ็นให้ตาม)

**ตัวอ่าน KPI ระดับดีล** (ดีลภาชนะ = Won มูลค่า 0) — `isWonAwaitingSo` · dashboard/history · `summarizeMyDeals` ·
`kpiDeals` · `DealDrillDownModal` (`.filter(isKpiDeal)`) · คำใต้การ์ด Won kind `historical`

**การกระทำที่ปิด** — ย้อนการอนุมัติ · ออก Rev. · คืนเป็นร่างหลังอนุมัติ · ยกเลิกแบบย้อน Won · สลับภาษาเอกสาร ·
ดีลภาชนะ: เปลี่ยนลูกค้า/สาย/ประเภท/ทีมว่าง · ไทม์ไลน์ · สร้าง/ผูกโครงการ

**ค้นหา** — ทะเบียน SO และทะเบียนการชำระค้นด้วยเลขเอกสารเดิมได้ · ทะเบียนการชำระค้นคำว่า "ยกมา"/"ใบย้อนหลัง" ได้
(กติกา "ตาเห็นบนแถว = ต้องค้นเจอ")

## 5. ยามกันไหลกลับ

| ยาม | ไฟล์ | กัน |
|---|---|---|
| SQL tripwire (0360) | `lib/sales/historicalSalesOrderMigration.test.mjs` | ฟังก์ชันที่อ่าน `sales_orders` + `'approved'` ต้องกรอง pipeline หรืออยู่ในรายการ "ตรวจสถานะอย่างเดียว" · รูปของ CHECK/RPC เทียบค่าคงที่ฝั่ง JS · ghost check |
| SQL tripwire (0379) | `lib/sales/historicalQuoteLinesMigration.test.mjs` | สองลายเซ็นเดิมพอดี · คำสั่งของ 0374 อยู่ครบ (เว้น INSERT บรรทัด) · ชนิดส่วนลด = `QUOTE_DISCOUNT_TYPES` · คอลัมน์ราคา = `QUOTE_PRICE_FIELD` · ค่าคลาด 0.01 · ทางหลวมของแถวที่เก็บแล้ว · ด่านบรรทัดอยู่ระหว่างด่านสถานะกับ `DELETE` · ส่วนลดสามช่อง/ไม่มี `grossAmount` · REVOKE เท่า 0374 ไม่มี GRANT · ด่าน DO อ่านอย่างเดียว · หัวไฟล์มีคำสั่งก่อนรัน + ROLLBACK + "ห้ามคีย์ช่วงรันถึง deploy" |
| SQL tripwire (0374) | `lib/sales/historicalApprovalMigration.test.mjs` | หัวไฟล์ · BEGIN/COMMIT · รันซ้ำได้ · ไม่มี DML นอก body ยกเว้นด่าน §2 (และด่านต้องมาหลังคอลัมน์ของ §1) · REVOKE ครบทุกตัว **และ GRANT เฉพาะ RPC 4 ตัว** · `write_children` มีด่านก่อน `DELETE` · ขั้นอนุมัติ: กิ่ง replay มาก่อนด่าน stale · ตรวจอนุมัติตัวเองก่อนเขียน · ตรวจ `p_signed_file_id` ด้วย entityType/docType · เรียก `approve_external` ก่อน UPDATE ใบ · ไม่เขียน `actualAmount`/`financeStatus`/ลายเซ็น · trigger จำกัดที่ `origin='historical'` · 0374 ไม่นิยาม sync/enforce หรือ trigger ของ 0360 ซ้ำ |
| คำสั่งอ่าน SO | `lib/sales/historicalMoneyGuards.test.mjs` | ทุก `.from('sales_orders')` ที่แตะยอด/สถานะต้องอยู่ชั้นใดชั้นหนึ่ง (MUST_FILTER · PER_ID_GUARDED · SEES_HISTORICAL · SCOPED_SAFE) · `'historical'` และ `.eq('origin', …)` มีบ้านเดียวคือ `lib/sales/historicalOrders.js` |
| ตัวเขียนฝั่ง API | `lib/sales/historicalWriterGuards.test.mjs` | กิ่ง submit/approve ของใบย้อนหลังมาก่อน RPC ของสาย pipeline · `save` ปฏิเสธใบย้อนหลัง · PATCH งวดส่ง `orderLock` + `historical` · **ไม่มีตัวตามยกเลิกสัญญาฝั่ง JS** (trigger เป็นเจ้าของ) · คอมเมนต์ `restore` อ้าง trigger |
| ตัวตัดสิน/ตัวเขียนของฟอร์ม | `historicalOrderPlan.test.mjs` · `historicalOrderCommit.test.mjs` · `historicalIntakeForm.test.mjs` | ตัวตัดสินตัวเดียวกันตอนพรีวิวและตอนบันทึก · ล็อก AE เป็นตัวเอง · ขอบเขตทีมของดีลที่ใบจะเข้าไปอยู่ · ลำดับขั้นของการบันทึก · **(23/09) เงิน = สูตรใบเสนอราคา** (`historicalLinesMoney` เทียบ `normalizeManualLines`/`quoteTotals`) · ราคาจากทะเบียนเท่านั้น · ยอดที่ฟอร์มคิดเองเท่าแผน |
| ขั้นทำงานฝั่ง API | `historicalOrderWorkflow.test.mjs` | ด่านทุกตัวรันก่อน RPC · อนุมัติตัวเอง 403 ไม่แตะฐาน · ไม่มี `expectedUpdatedAt`/`signedFileId` = 400 · replay ไม่เขียน audit |
| จอ (ยาม source) | `historicalRegisterUi.test.mjs` · `historicalDetailUi.test.mjs` · `historicalPaymentUi.test.mjs` | ฟอร์มสร้าง = ฟอร์มแก้ตัวเดียวกัน · ไม่มี `retry:true` · ทุกจุดที่กดอนุมัติส่ง `expectedUpdatedAt` + `signedFileId` · ไม่มีคำว่า "นับ Actual" · การ์ด/โมดัลที่ต้องโผล่เฉพาะใบย้อนหลัง |
| สายไฟฝั่งบริการ | `lib/service/historicalServiceSide.test.mjs` · `forceDeleteService.test.mjs` | select ของคิว/bind/gateContext · ไม่อ่านร่องรอยยกเว้นอีก · ป้ายเมนูนับถังตั้งรอบ · โซน/ไซต์ที่อยู่ในใบย้อนหลังบังคับลบไม่ได้ |
| รหัส error | `lib/sales/documentWorkflowErrors.test.mjs` | ทุกรหัสที่ RPC RAISE มีข้อความไทย + HTTP status · **ห้ามรหัสไหนเป็น substring ของอีกรหัส** |
| copy paths | `serviceRoundsCopyPaths.test.mjs` | คอลัมน์ใหม่ต้องประกาศว่า Rev./ร่างไม่ก๊อป |

## 6. API

### 6.1 คีย์ใบ / แก้ใบ — `POST /api/sales-planning/sales-orders/historical` · `PATCH …/historical/:id`

**เส้นเดียวกันสองทาง** — ตรรกะทั้งหมดอยู่ที่ `lib/sales/historicalOrderCommit.js` (`commitHistoricalOrder`) route เป็นเปลือก
`preview: true` ตรวจอย่างเดียวไม่แตะ RPC · ไม่มี `retry: true` ที่ไหน

```jsonc
{
  "preview": true, "intakeKey": "uuid",
  "customerId": "…", "ownerId": "uuid (บังคับ · ae/senior_ae ต้องเป็นตัวเอง)", "team": "…",
  "contract": { "docKind": "signed_quotation", "ref": "Q#…", "startDate": "2026-01-01", "endDate": "2026-12-31" },
  "vatRate": 7,
  "discountType": null, "discountValue": 0,
  "refs": { "quote": "Q#…", "express": null, "invoice": "IV…" },
  "notes": "… (บังคับเมื่อยอด 0)",
  "zones": [{ "zoneId": "…", "productId": "…", "qty": 12, "discountType": "percent", "discountValue": 5, "rounds": 12 }],
  "opening": { "amount": 196452, "coversTo": "2026-08-31", "paidOn": "2026-01-10", "note": "…", "evidence": [] },
  "installments": [{ "label": "งวด 3/3", "amount": 65484, "dueDate": "…", "coversFrom": "2026-09-01", "coversTo": "2026-12-31" }],
  "acknowledgeDuplicates": false
}
```

| ผล | รูป |
|---|---|
| บรรทัดโซน (มติ 23/09) | **แบบบรรทัดใบเสนอราคา** — ไม่มีราคา/ยอดจากจอ: ราคา/หน่วย = `products."costPrice"` ณ ตอนพรีวิว/บันทึก · หน่วย = `saleUnit` · ยอด = `quoteLineMoney` · `vatRate` 0 = "รวม VAT แล้ว" / 7 = "+ VAT 7% ท้ายใบ" · จำนวนว่าง = error (ไม่ใช่ 1) · แพ็คเกจยังไม่ตั้งราคา = error · แท็บรุ่นก่อน (`packs`/`lineAmount` ไม่มี `qty` · `amountsIncludeVat: true`) = error "โหลดหน้าใหม่" · `p_lines` = `{ zoneId, productId, qty, unitPrice, discountType, discountValue, discountAmount, lineTotal, serviceRounds }` · `intake = { vatRate, discountType, discountValue }` (→ `metadata.historicalIntake`) · **ส่วนลดท้ายใบ (25/09)**: `discountType` null/"percent"/"amount" · ค่าว่าง = 0 · % ไม่เกิน 100 — ด่านสูตรอยู่ที่แผน (error ช่อง `discount`) · ยอดไปที่ `p_header.discountAmount` · 0374 ตรวจแค่ `ยอดรวม − ส่วนลด + VAT = ยอดทั้งสิ้น` |
| พรีวิวที่ผ่าน | 200 `{ preview:true, plan:{ header, lines, installments, deal, duplicates, warnings, errors } }` — ไม่เรียก RPC |
| พรีวิวที่ยังไม่ผ่าน | 400 `{ error, errors:[{ field, message, detail? }], money }` (**ไม่ใช่ 200 ที่มี errors**) — ฟอร์มแมป `field` กลับไปยังขั้น · บรรทัด (25/09) = `zones.<i>.<zoneId\|productId\|qty\|rounds>` (`zones.<i>` = แถวรูปผิด · `zones` = ยังไม่มีบรรทัด) · `message` = "รายการ N (ชื่อโซน): …" · `detail` = ข้อความไม่มีป้ายบรรทัด (ของใต้ช่อง) · `vatRate` · `discount` สังกัดขั้น ② · งวด (25/09 A16) = `installments.<i>.<label\|amount\|dueDate\|coversTo\|coverage\|note\|row>` · `message` = "งวดที่ N: …" โดย N = เลขงวดของใบ (งวดยกมาเป็นงวดที่ 1) · `installments` = ยังไม่มีงวด/ผลรวมไม่เท่ายอดใบ · `opening.<ช่อง>` สังกัดขั้น ③ |
| สร้าง | 201 `{ order (สถานะ **ร่าง**), lines, installments, contract, deal, dealCreated, replayed:false }` · คำขอเดิมซ้ำ = 200 `replayed:true` |
| แก้ | 200 `{ order, lines, installments, contract }` · ต้องส่ง `expectedUpdatedAt` |
| สิทธิ์ | 403 "คีย์ใบสั่งขายย้อนหลังได้เฉพาะฝ่ายขายและแอดมิน" |
| ซ้ำ | 409 `historical_so_duplicate_unacknowledged` + `duplicates` (ตัดใบของตัวเองและใบที่ยกเลิกแล้วออกแล้ว) |
| รหัสคีย์ชน | 409 `historical_so_intake_key_conflict` + `orderId` (คำนวณฝั่ง server) ⇒ ฟอร์มเสนอ "เปิดใบที่สร้างไว้ในฟอร์มแก้ไข" |
| แก้ใบที่ไม่ใช่ร่าง/ถูกตีกลับ | 409 `historical_so_edit_state_invalid` |
| เปลี่ยนลูกค้า/AE ตอนแก้ | 409 `historical_so_owner_locked` |
| ยังไม่รัน 0374 | 503 `HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE` |

🪤 **หลักฐานงวดยกมาถูกกรองสองชั้น** (`sanitizeHistoricalEvidence` ใช้ทั้งตอนแก้และตอนส่ง): bucket ส่วนตัว ·
โฟลเดอร์ `sales-orders/<ใบนี้>/payments/` เท่านั้น · เฉพาะ ref แบบ `storagePath` (ตัวล้างกลางยังปล่อย ref ยุคเก่าแบบ URL ผ่าน) ·
ไฟล์ต้องมีอยู่จริงใน bucket

### 6.2 ขั้นทำงานของใบ — `PATCH /api/sales-planning/sales-orders/:id`

| action | ใบย้อนหลัง |
|---|---|
| `submit` | `submitHistoricalOrder` → RPC · ต้องมีไฟล์สัญญา + หลักฐานงวดยกมา · ผู้ส่งเดิมกดซ้ำ = `replayed` ไม่เขียน audit ซ้ำ |
| `approve` | `approveHistoricalOrder` → RPC · **ต้องส่ง `expectedUpdatedAt` และ `signedFileId`** · ผู้อนุมัติคนเดิมกดซ้ำ = `replayed` (ไม่ออกเลข CT ใหม่ ไม่เพิ่มรอบขาย) |
| `reject` (ตีกลับให้แก้ไข) · `withdraw` (ดึงกลับ) | เส้นเดิมของทุกใบ · ปลายทาง `rejected` / `draft` |
| `cancel` | ได้ทุกสถานะ (อนุมัติแล้ว = ผู้จัดการฝ่ายขายที่อนุมัติได้ · มติ 24/09) · **trigger ยกเลิกเอกสารแทนสัญญาให้ในทรานแซกชันเดียว** · **งวดยกมาเป็นโมฆะตามใบ** (รอตรวจ → ฐานตีกลับให้ · รับรองแล้ว → คงแถว + หมายเหตุบังคับ ≥ 10 ตัวอักษร · mig 0387) — response พก `contractVoided` · `contractVoidedLabel` · `openingVoided` ให้ toast · ติดด่านเฉพาะ**งวดปกติ**ที่รับรองแล้ว/รอบัญชีตรวจ (`historicalCancelBlock` · trigger 0387 กันซ้ำ) · งวดยกมามีเงินแต่ฐานยังไม่ยืนยัน 0387 (`historical_so_cancel_settle_ready`) = 503 แบบก่อนมติ (fail closed · review 25/09) · หมายเหตุบังคับตัดสินซ้ำใน trigger (`historical_so_cancel_note_required` 409) |
| `save` | 409 "แก้ใบย้อนหลังที่ฟอร์มคีย์ใบ" |
| `revise` · `revoke_approval` · `restore` | ปฏิเสธ (CHECK + trigger `sales_orders_historical_no_reopen` กันซ้ำที่ฐาน) |
| `set_payment_gate_exemption` | **ถอดทิ้งแล้ว** (A8) |
| `rename/close/remove_installation_point` | **ถอดทิ้งแล้ว** (§10) |

`DELETE /sales-orders/:id?dryRun=1` → ลบแบบปกติได้เมื่อยังไม่มีอะไรปลายน้ำ (`historicalDeleteBlock`:
มีรอบขายของโซน = "เปิดโซนให้ TS แล้ว N โซน" · รอบบริการ · งวดที่บัญชีคอนเฟิร์ม · เลขใบกำกับ)
ติดเมื่อไรอ่านพรีวิวแล้วใช้ `?force=1` · **trigger ยกเลิกเอกสารแทนสัญญาให้ทั้งสองทาง**
⚠️ ใบที่อนุมัติแล้ว/ยกเลิกหลังอนุมัติ **ลบแบบปกติไม่ได้** (`canHardDeleteSalesOrder`) — ไปทางบังคับลบซึ่งมีพรีวิวบอกผลกระทบ

### 6.3 งวดชำระ — `…/sales-orders/:id/installments`

- **POST ยกงวดจากแผนใบเสนอราคา / `append`**: 400 "งวดของใบย้อนหลังมาจากฟอร์มคีย์ใบ" — RPC `append_historical_installments` ถูก DROP ใน 0374
- **PATCH**: ส่ง `orderLock: historicalInstallmentLock(order)` และ `historical: isHistoricalOrder(order)` เข้า `installmentActionError` (§7)
- **GET/PATCH ของใบย้อนหลังไม่เรียก `withLiveAmounts`** — งวดที่ยังไม่ตรึงจะถูกคิดเป็น "ชำระเต็มจำนวน 100%" ถ้าเผลอเรียก

### 6.4 สัญญา (เอกสารแทนสัญญา = "substitute contract")

สร้างโดย **RPC คีย์ใบ** ไม่ใช่ `POST /contracts` · `metadata.historicalSalesOrderId` ชี้กลับที่ใบ ⇒ `isSubstituteContract`

| ระยะ | ล็อกอะไร |
|---|---|
| ใบยัง `draft`/`pending_approval`/`rejected` | `historicalContractLockReason` ล็อก **แก้ · ลบ · ยกเลิก · อนุมัติที่หน้าสัญญา** ทั้ง route และจอ · หน้าสัญญาโชว์ StatusNotice + ลิงก์กลับไปที่ใบ · เลนรออนุมัติของ AE Sup **ไม่นับ** ร่างพวกนี้ (เป็นงานของคิวใบสั่งขาย) |
| ใบ `pending_approval` | `historicalContractFilesFrozen` — แนบ/ลบ/แก้ไฟล์ไม่ได้ (`POST /api/attachments` และ `guardAttachmentWrite`) ⇒ **ไฟล์ที่ AE Sup เห็นคือไฟล์ที่ถูกอนุมัติ** · RPC ตรวจ `p_signed_file_id` ซ้ำอีกชั้น |
| ใบถูกยกเลิก/ลบ | trigger ยกเลิกสัญญาให้ (ร่างหรือลงนามแล้วก็ตาม) — **เลข CT ที่ใช้ไปแล้วไม่คืน** |
| ใบหายไปแล้ว / ใบยกเลิกแล้ว | `historicalContractLockReason` คืน `null` ⇒ **สัญญากำพร้าไม่มีวันล็อกค้าง** แอดมินลบ/ยกเลิกได้ตามปกติ |

รายละเอียดวงจรชีวิตอยู่ใน [sales-contract-plan.md](sales-contract-plan.md)

## 7. การกระทำของงวดบนใบย้อนหลัง

`installmentActionError` เป็นตัวตัดสินตัวเดียวที่ทั้งปุ่มบนจอและ API ถาม

| สถานะใบ | ผล |
|---|---|
| `draft` · `pending_approval` · `rejected` | **ทุก action ถูกปฏิเสธ** — "งวดของใบย้อนหลังขยับได้หลัง AE Sup อนุมัติ" (งวดยังไม่ตรึง บัญชียังมองไม่เห็น ทั้งชุดแก้ที่ฟอร์มคีย์ใบ) |
| `cancelled` | "ใบยกเลิกแล้ว — งวดของใบนี้ขยับไม่ได้" |
| `approved` | ตามตารางถัดไป |

| action | งวดยกมา (`kind='opening'`) | งวดปกติของใบย้อนหลัง |
|---|---|---|
| `report` (แจ้งชำระ) · `confirm` · `reject` | ได้ (ขั้นอนุมัติดัน `งวดยกมา` เป็น "แจ้งชำระแล้ว" ให้ ⇒ ขึ้นคิวบัญชีทันทีโดยไม่ต้องแจ้ง) | ได้ |
| `schedule` (ตั้งกำหนดชำระ) | **ปฏิเสธ** "งวดยกมาไม่มีกำหนดชำระ" (CHECK `opening_shape` บังคับ `dueDate` ว่าง) | ได้ |
| `withdraw` (ถอนการแจ้ง) | **ปฏิเสธ** — บอกทางแก้ `HISTORICAL_CORRECTION_PATH` (ผู้จัดการฝ่ายขายยกเลิกใบ · งวดยกมาเป็นโมฆะ · มติ 24/09) | ได้ |
| `coverage` (แก้ช่วงครอบ) **และ `report` ที่ส่งช่วงครอบมาด้วย** | **เฉพาะฝ่ายบัญชี** · `coversFrom` ล็อกที่วันเริ่มสัญญา · `coversTo` ล้างไม่ได้ | **เฉพาะฝ่ายบัญชี** ("ช่วงครอบของใบย้อนหลังตรึงตอน AE Sup อนุมัติ") |
| `tax-invoice` / `tax-invoice-clear` | ได้ — บันทึกเลขใบกำกับที่ออกไปแล้ว | ได้ |
| `link` / `unlink` | ปฏิเสธ / ไม่มีผล (ไม่มี quotationId) | เดียวกัน |

🪤 **สองอันนี้เคยเป็น 500 ดิบ** — `schedule`/`withdraw` บนงวดยกมาจะไปตายที่ CHECK `sales_order_installments_opening_shape`
และ `coverage` ที่ฝ่ายขายกดจะพังความต่อเนื่องที่บัญชีรับรองไปแล้ว ⇒ ด่านอยู่ที่ตัวตัดสิน ไม่ใช่ที่ฐาน ·
route ยังแมป CHECK violation ผ่าน `documentWorkflowError` ก่อนถึง 500 เผื่อทางที่ยังไม่รู้จัก

### งวดยกมาไม่เข้ากอง "ยังไม่ออกใบกำกับ"

`taxInvoicePending` คืน `false` สำหรับงวดยกมา · แถวโชว์ `openingInvoiceNote` = "ใบกำกับออกในระบบเดิม (Express)" + `historicalInvoiceRef`
— ใบกำกับของเงินก้อนนั้นออกไปแล้วใน Express ⇒ กติกา 07/09 "ทุกงวดที่จ่ายแล้วมีใบกำกับ" ยังจริง แค่ใบกำกับไม่ได้อยู่ในระบบนี้

### โมดัลรับรองของบัญชี

`paymentConfirmPrompt({ historical: true, opening })` — **ไม่มีบรรทัด Rev. และไม่มีบรรทัด Actual** (สองเรื่องนั้นไม่จริงกับใบย้อนหลัง)
แต่เพิ่ม "เปิดด่านเงินของนัดบริการถึง {วัน}" · "งวดยกมา — เงินที่เก็บก่อนเข้าระบบ รับรองครั้งเดียว" ·
ผลต่อการยกเลิกใบ (มติ 24/09): **งวดยกมา** = "ถ้าผู้จัดการฝ่ายขายยกเลิกใบเพื่อคีย์ใหม่ งวดยกมานี้เป็นโมฆะตามใบ" ·
**งวดปกติ** = "ผู้จัดการฝ่ายขายยกเลิกใบนี้ไม่ได้จนกว่าบัญชีถอนคำรับรองแล้วตีกลับงวดนี้" (ปิดทางแก้ "ยกเลิกแล้วคีย์ใหม่" ชั่วคราว ·
review 25/09: ถอนคำรับรองอย่างเดียวแถวกลับเป็น "รอตรวจ" ซึ่งยังบล็อก ⇒ บอกครบสองขั้น) · `HISTORICAL_STATUS_NOTE`
ใน `InstallmentConfirmDialog` มีแถว kv บังคับสามแถว: หมายเหตุจาก SA · ยอดที่เก็บแล้ว X จากยอดใบ · **อนุมัติใบ: ชื่อ AE Sup · วันที่ · ไม่นับ Actual**
โมดัลตีกลับของงวดยกมาพก `historicalOpeningRejectNote` ที่บอกทางแก้ต่อ

## 8. ฝั่งบริการ

รายละเอียดอยู่ใน [service-intake-phase4.md](service-intake-phase4.md) §ใบสั่งขายย้อนหลังในคิว — สรุป:

- **ไม่มีขั้น "รอตั้งไซต์/โซน" สำหรับใบย้อนหลังอีกแล้ว** — รอบขายของโซนเกิดตอน AE Sup อนุมัติ ⇒ ใบโผล่ที่ถัง **"รอตั้งรอบ"** ตรง ๆ
- 🔴 **ป้ายตัวเลขบนเมนู `serviceIntake` นับ `bind + plan`** — ของเดิมนับถังผูกโซนอย่างเดียว ซึ่งใบย้อนหลังไม่เคยเข้า ⇒ TS จะไม่ได้สัญญาณเลย
  (ถัง "ครบรอบยังไม่มีนัด" ยังไม่นับ เพราะต้องอ่านนัด) · **นับทุก origin ไม่ใช่เฉพาะใบย้อนหลัง** (ดู §10)
- หน้าคิว **สลับไปถัง "รอตั้งรอบ" ให้ครั้งเดียวหลังโหลดสำเร็จครั้งแรก** เมื่อถังผูกโซนว่างแต่ถังตั้งรอบไม่ว่าง
  (เปิดมาเจอแท็บแรกว่างทั้งที่ป้ายบอกว่ามีงาน = อ่านว่าป้ายโกหก · คนเลือกแท็บเองแล้วรอบเบื้องหลังไม่ดึงกลับ) ·
  แถวถังตั้งรอบโชว์ชิปเงินสามทาง: **"ไม่มีงวดให้เก็บ"** (ใบยอด 0 · `paymentNotRequired` · 🔄 แทนชิป "ยกเว้นด่านเงิน" ที่ถอดแล้ว) ·
  **"เงินครอบถึง {วัน}"** (`paidThrough`) · **"ยังไม่มีงวดที่รับรอง"**
  (⚠️ ไม่ใช่ "ยังไม่มีเงินเข้า" — งวดยกมาเก็บเงินไปแล้ว บัญชียังไม่รับรองเท่านั้น · บอกว่าเงินไม่เข้า = ส่ง TS ไปถามลูกค้าผิดเรื่อง) ·
  มีโน้ต "โซนผูกจากฝ่ายขายตอนคีย์ใบแล้ว — ใบย้อนหลังไม่ต้องผ่าน รอตั้งไซต์/โซน"
- **ด่านเข้าไซต์ข้อ②**: `paymentNotRequired(order.totalAmount) || (งวดครอบวันนัด && ไม่มีงวดเลยกำหนดที่ยังไม่รับรอง)`
  ⇒ **ใบยอด 0 ผ่านเองทุก origin** · สวิตช์ยกเว้นหายไป · ร่องรอย `paymentGateExemptAt` ที่ค้างในแถวไม่มีใครอ่านแล้ว
- **ข้อ① สัญญาไม่มีทางยกเว้น** เหมือนเดิม — แต่ใบย้อนหลังผูกเอกสารแทนสัญญามาตั้งแต่คีย์ ⇒ ผ่านเองตั้งแต่อนุมัติ
- 🔴 **โซน/ไซต์ที่อยู่ในบรรทัดใบสั่งขายบังคับลบไม่ได้** — FK ของ `serviceZoneId` เป็น RESTRICT และตัวลบลึก
  รันทีละก้อนแบบไม่อยู่ในทรานแซกชันเดียว ⇒ ถ้าไม่กันไว้จะลบรอบขาย/ไฟล์สำรวจทิ้งก่อนแล้วไปล้มที่โซน
  `zoneForceManifest`/`siteForceManifest` คืน `blocked: true` และ `deleteZoneDeep`/`deleteSiteDeep` โยนก่อนก้าวแรก ·
  ลบโซนแบบปกติเจอ 23503 ของ FK ตัวนี้ = "โซนนี้อยู่ในใบสั่งขาย — ปิดใช้งานแทน"

## 8A. ฟอร์มคีย์ใบ (ฟอร์มหน้าเต็ม 4 ขั้น)

ม็อกคือสเปก: `~/ss-team/mockups/legacy-so-service-flow/` (`project/*.dc.html` + `SPEC.md`)

**สร้างกับแก้คือฟอร์มเดียวกันจริง ๆ** (กฎของ `AGENTS.md`) — สองหน้าเรียก component ตัวเดียว:
- `app/sales-planning/sales-orders/historical/new/page.js` → `<HistoricalOrderWizard />`
- `app/sales-planning/sales-orders/historical/[id]/edit/page.js` → `<HistoricalOrderWizard orderId={id} />`

เข้าได้จากปุ่ม **"SO ย้อนหลัง"** บนหัวทะเบียนใบสั่งขาย (ลิงก์ ไม่ใช่โมดัล) · ด่าน `canKeyHistoricalSalesOrder` + `salesplan:edit`

| ขั้น | ชื่อบนราง | มีอะไร |
|---|---|---|
| ① | ลูกค้าและสัญญา | ⭐ **(A15) หน้าตาแบบหน้าสร้างใบเสนอราคา**: หัว `DetailOverview` (ขั้น 1/4 · ป้าย "ไม่นับ Actual / FC / เป้า" + สถานะใบ · ช่องสรุป ลูกค้า/AE/ช่วงสัญญา/ไฟล์ จาก `historicalContractFacts` — **ไม่มีแถบสรุปขวา**) · การ์ด **ที่มาของใบ**: ลูกค้า \| AE คู่กัน (`ae`/`senior_ae` ล็อกเป็นตัวเอง) · ทีม (เฉพาะตอนเลือกได้ ≥2) · บรรทัดเหตุที่ล็อก · การ์ด **เอกสารแทนสัญญา**: ชนิดเอกสารเป็น `ChoiceChips` จาก `EXTERNAL_DOC_KINDS` ทั้งชุด **ไม่มีค่าตั้งต้น** · เลขอ้างอิง · ช่วงวัน (+ ป้ายจำนวนเดือน) · **ไฟล์สัญญา** · การ์ด **อ้างอิงเดิม** 3 ช่อง · การ์ด **หมายเหตุ** · 🚫 ไม่มีช่อง VAT (ไปกล่องสรุปของขั้น ②) · ไม่มีกล่องฟ้าท้ายฟอร์ม (เป็นป้ายบนหัว) |
| ② | ไซต์ โซน และรายการ | ⭐ **มติ 25/09 (A14): ตารางรายการของใบเสนอราคาตารางเดียว** (`QuoteLineCells` ตัวเดียวกับ `QuotationLineItems`) · หัวตาราง "รายการ · N บรรทัด · M โซน" + ปุ่ม **"เพิ่มหลายโซน"** และ **"เพิ่มรายการ"** (บรรทัดใหม่ว่างทุกช่อง) · คอลัมน์ # · รายการ · จำนวน · ราคา/หน่วย · ส่วนลดรายการ · จำนวนเงิน · ลบ · เซลล์ "รายการ" = แพ็คเกจ 02-001 (`quoteLineFromProduct`) · ข้อมูล FG · แถบผูก **"ไซต์ · โซน"** (`SearchableSelect` จัดกลุ่มตามไซต์ · ค้นได้ทั้งรหัส/ชื่อไซต์และชื่อ/รหัสโซน · ตัวเลือกจาก `historicalZonePickerOptions`: โซนที่บรรทัดอื่นผูกแล้ว/ปิดใช้งานเลือกไม่ได้พร้อมเหตุ · โซนของบรรทัดนี้เองเลือกคืนได้เสมอ (R10) · โซนที่ทะเบียนอ่านไม่ถึงขึ้นเป็นตัวเลือกบอกเหตุ) + **"รอบบริการที่ขายไว้"** · ทะเบียนโหลดทีละไซต์แบบพังทีละใบ (`includeInactive=0`) · ไซต์ที่พังมีก้อนเตือนพร้อม "ลองอ่านไซต์ที่พังอีกครั้ง" เท่านั้น · บรรทัดที่ผูกโซนในไซต์ที่อ่านไม่ได้ลบไม่ได้ (N1) · **กล่องสรุปแบบแก้ได้ของใบเสนอราคา** (`QuoteLineTotalsEditor`): **หัก ส่วนลด** ท้ายใบ (ไม่ลด/%/บาท) + **ภาษีมูลค่าเพิ่ม** (ไม่มีค่าตั้งต้น — ป้าย "เลือก" · เปลี่ยนแล้วถามก่อนล้างงวด) · error ขึ้น **ใต้ช่องที่ผิดช่องเดียว** + ก้อนรวมหัวขั้น (ผูกกับ `key` ของแถว · แก้ช่องไหนข้อความช่องนั้นหาย — `historicalPruneIssues`) · หน้าต่าง **"เพิ่มหลายโซน"** (`HistoricalBulkZonesModal`): ค้น · ติ๊กทีละโซน/ทั้งไซต์/ทุกโซนที่เห็น · แพ็คเกจ + จำนวน (เว้นว่างได้) ครั้งเดียว · ปุ่มบอกผลก่อนกด · เพิ่มบรรทัดใหม่เท่านั้น ไม่แตะบรรทัดเดิม · 🚫 ถอด (25/09): การ์ดไซต์ + ติ๊กโซน · ช่องค้นบนขั้น · "การแสดงผล" (ย่อ/ขยาย) · **"ใช้แพ็คเกจเดียวกันทุกโซน"** (`packageProductId` — ไม่บันทึกอะไร เททับทุกบรรทัดเงียบ ๆ) · 🚫 ถอด (23/09): แพ็ค · ยอดที่พิมพ์เอง · ปุ่ม "ราคาแพ็คเกจ × แพ็ค × เดือน" · ช่องระยะสัญญา |
| ③ | งวดชำระ | ⭐ **(A16) การ์ดตามเรื่อง ไม่มีแถบสรุปขวา**: **ช่วงบริการตามสัญญา** (แถบเวลา เก็บแล้ว/ยังไม่ถึงกำหนด/เลยกำหนด + วันนี้ · ป้ายจำนวนเดือน) · **เงินที่เก็บก่อนเข้าระบบ** — คำถามสามทางไม่มีค่าตั้งต้น: *จ่ายครบทั้งใบแล้ว* (งวดยกมา = ยอดใบ ครอบเต็มสัญญา คิดให้ · ไม่มีตารางงวด) · *จ่ายมาแล้วบางส่วน* (ยอด · ครอบถึง · ป้ายเดือน/วันเริ่มงวดที่เหลือ) · *ยังไม่เคยจ่าย* · แล้ววันที่รับเงิน · **หลักฐาน ≥1 ไฟล์** · หมายเหตุถึงบัญชี ≤1000 · เปลี่ยนคำตอบที่ทำของหาย = ถามก่อน (`historicalOpeningModeChange`) · **งวดการชำระ** — ตารางห่วงโซ่ (งวดยกมาแถวแรก · กรอกแค่ "ถึง" · งวดสุดท้ายคิดยอดที่เหลือ/ถึงวันสิ้นสุดเอง) · ปุ่ม "แบ่งงวดอัตโนมัติ" (หน้าต่าง: รอบการเก็บเงิน × วันครบกำหนด · ดูตัวอย่าง · ตัวเลือกที่ไม่ลงตัวโชว์พร้อมเหตุ · แทนที่งวดเดิม = ปุ่มโทนอันตราย) · "เพิ่มงวด" · คำเตือนงวดที่เลยกำหนดแล้ว · กล่องสรุปแบบใบเสนอราคา (ยอดใบ · หักงวดยกมา · งวดที่ยังต้องเก็บ + บรรทัดครบยอด/ต่อเนื่อง) |
| ④ | ตรวจและส่งอนุมัติ | ⭐ **(A17) "ตรวจแบบผู้อนุมัติ" — ทุกอย่างมาจากแผนของ server** (ยกเว้นชื่อผู้คีย์และรายชื่อไฟล์): หัว `DetailOverview pin={false}` (ขั้น 4/4 · ป้าย "ไม่นับ Actual / FC / เป้า" + สถานะใบ · ช่องสรุป ลูกค้า/ช่วงสัญญา/ยอดรวมทั้งสิ้น/เลขใบ — `historicalReviewFacts`) → **ใบที่อาจซ้ำ** (เฉพาะตอนพบ · บนสุด · ด่านเดียวที่บล็อก · ตาราง เลขที่ใบ (แท็บใหม่) · สถานะ · วันเริ่ม · **ตรงกันที่** · เลขเอกสารเดิม · สวิตช์ "ตรวจแล้ว ไม่ใช่ใบซ้ำ") → **สิ่งที่ผู้อนุมัติจะตรวจ** (`historicalReviewChecklist`: เอกสารแทนสัญญา · ไฟล์หลักฐานลงนาม (ไฟล์แรกที่แนบ · null = ยังอ่านไม่ได้ ≠ 0) · อ้างอิงเดิม · หมายเหตุ (มีค่า/ใบ ฿0) · โซน · งวดยกมา หรือ ยอดใบ ฿0 · งวดที่ยังต้องเก็บ · ผลตรวจยอด/ช่วง — แต่ละแถวมี "แก้ในขั้น ①/②/③" พาไปช่องนั้น · คำเตือนรวมเป็นกลุ่มในแถวของมัน) → **รายการ** (`QuotationReadOnlyLineItems` + กล่องสรุปแบบขั้น ② · ไม่มีคำใบ้จำนวน × เดือน) → **หลังกดส่ง** (`WorkflowRail` จาก `historicalAfterSendRail`: คีย์ใบ → ผู้จัดการฝ่ายขายอนุมัติ → บัญชีรับรอง (ไม่มีในใบ ฿0) → TS ตั้งรอบ → ฝ่ายขายตามเก็บงวด + บรรทัดล็อก "อนุมัติแล้วแก้ในฟอร์มไม่ได้") · **แผงบันทึก** เหนือแถบท้าย (ระหว่างบันทึก = จังหวะที่มีงานจริง · ล้ม = บอกสิ่งที่ลงฐานแล้ว + ทางออกไม่เกินหนึ่งปุ่ม — ลองใหม่ = ปุ่มบันทึกตัวเดิมซึ่งผ่านด่านทุกครั้ง) · บรรทัดใต้ปุ่มจาก `historicalReviewFootNote` · แถบท้าย "ออกจากฟอร์ม" · ย้อนกลับ · **บันทึกและส่งอนุมัติ** (ติดด่าน = `aria-disabled` จาง กดแล้วพาไปหาเหตุ) |

✅ **ข้อที่ต่างจากตารางใบเสนอราคา — เจ้าของตัดสินครบแล้ว 25/09** (เหตุผลด้านข้อมูลอยู่หลังขีด):
1. จำนวนเริ่มที่**ว่าง** (ใบเสนอราคาเริ่มที่ 1.00) — **คงไว้ (รับรอง 25/09)**: 1 ชุด × 12 เดือน = จำนวน 12 · ใส่ 1 ให้ = เดาผิดเกือบทุกใบ
2. จำนวนต้องเป็น**จำนวนเต็ม** (ใบเสนอราคารับ 1.5) — RPC 0379 + `service_zone_terms.packageQty` เป็นจำนวนเต็ม
3. ไม่มี "+ แทรกหมายเหตุ" รายบรรทัด — **คงไว้ (รับรอง 25/09)**: หมายเหตุพิมพ์ลงใบเสนอราคาเท่านั้น ใบย้อนหลังไม่พิมพ์ และ body/แผนไม่มีช่องนี้
4. ~~ไม่มีปุ่ม "เพิ่มสินค้า"~~ ⇒ **มีปุ่ม "เพิ่มรายการ" แล้ว (25/09)** · ยังไม่มี "เพิ่มรายการเอง" (บรรทัดพิมพ์เอง) — ทุกบรรทัดต้องเป็นแพ็คเกจ 02-001 ที่ผูกโซน
5. ราคา/หน่วย**ปิดตั้งแต่ยังไม่เลือกแพ็คเกจ** (ใบเสนอราคาเปิดให้พิมพ์ก่อนเลือก) — ใบนี้ไม่ส่งราคาขึ้นไป ช่องที่เปิดไว้คือช่องที่พิมพ์แล้วหาย
6. ~~ไม่มี "หัก ส่วนลด" ท้ายใบ — แผน/RPC คิดส่วนลดรายบรรทัดอย่างเดียว (เพิ่ม = migration ใหม่)~~ ⇒ **มีแล้ว (25/09)** · 🐞 ข้อความเดิมผิด:
   RPC create/update ของ 0374 อ่าน `p_header.discountAmount` และตรวจ `ยอดรวม − ส่วนลด + VAT = ยอดทั้งสิ้น` อยู่แล้ว (0374:753-766 · 1011-1024)
   ⇒ **ไม่ต้องแก้ฐาน** · ฐานตรวจแค่ยอดลงตัว ไม่ตรวจสูตร %/บาท (ระดับเดียวกับ VAT) — ด่านสูตรอยู่ที่ `planHistoricalServiceOrder` (ช่อง `discount`)
7. ~~VAT ไม่ใช่ดรอปดาวน์ท้ายตาราง~~ ⇒ **อยู่ในกล่องสรุปท้ายตารางแล้ว (25/09)** · ยังต่างข้อเดียวคือ**ไม่มีค่าตั้งต้น** (ใบเสนอราคาเปิดที่ "+ VAT 7% ท้ายใบ") — รับรอง 25/09
8. ~~ช่อง "ใช้แพ็คเกจเดียวกันทุกโซน"~~ ⇒ **ถอดแล้ว (25/09)** แทนด้วยหน้าต่าง "เพิ่มหลายโซน" (เพิ่มบรรทัดใหม่เท่านั้น ไม่เททับบรรทัดเดิม)
9. คำเตือนราคาในทะเบียนขยับพูดว่า "ระบบคิดด้วยราคานี้ตอนกด “ถัดไป”" (แผนอ่านราคาปัจจุบันเองทุกครั้งที่ตรวจ) · ยังไม่ตั้งราคา = ตีกลับ ไม่ใช่คงราคาเดิม

⭐ **ราคาของแผนไหลกลับลงบรรทัด** (รีวิว 23/09) — พรีวิวที่ผ่านเขียนหน่วย/ราคา/หน่วยของแผนกลับลงแถว (`historicalZonesWithPlanPrices`
· `setState` ตรง ๆ ไม่ปั๊ม dirty ไม่ทิ้งแผน) ⇒ เซลล์ "จำนวนเงิน" = บรรทัดของแผน = ยอดใบ · ราคาขยับ = ลิสต์สินค้าที่แคชไว้เก่ากว่าทะเบียน
⇒ ทิ้งแคช `PRODUCTS_PATH` แล้วอ่านใหม่ (ไม่งั้นคำเตือนราคาขยับพูดราคาเก่าว่าเป็นราคาปัจจุบัน)

📐 **ความกว้าง (วัด 23/09 ด้วย puppeteer หลังแก้)** — ของเดิม: ตารางซ้อนในการ์ดไซต์ + คอลัมน์ "โซน" + แถบสรุป 330px ⇒ กล่อง 726px (จอ 1440)
/ 766px (1920 · 2560) ต่ำกว่าจุดพับ 900 ⇒ **การ์ดต่อบรรทัดเสมอบนเดสก์ท็อป** ขณะที่ใบเสนอราคาเป็นตาราง (964px) · หลังแก้ (ตารางเดียวนอกการ์ด ·
ขั้น ② ④ ไม่มีแถบสรุป — `historicalStepShowsAside`): ขั้น ② กล่อง **1108px (1440) · 1148px (1920) เป็นตาราง** (`tr` = table-row · หัวตารางแสดง)
· ขั้น ④ ตารางฝั่งอ่าน 1140px (1440) เป็นตาราง · จอ 390 เป็นการ์ดต่อบรรทัดเหมือนใบเสนอราคา และไม่ล้นกล่อง (scrollWidth = clientWidth)

#### สี่ข้อที่ UAT 23/09 จับได้ (แก้แล้ว — อย่าถอยกลับ)

| # | อาการ | กติกาที่ใช้แทน |
|---|---|---|
| A1 | `contractMonths` **ปัดเดือนลง** ⇒ สัญญาที่ขาดไปวันเดียว (1 ม.ค.–30 ธ.ค.) ได้ยอดที่ปุ่มลัดเสนอเพียง 11/12 ของจริง | **ลงตัวเป็นเดือนเท่านั้นถึงตอบเป็นตัวเลข** ช่วงอื่น `null` แล้วทุกคนที่ถามต้องบอกเหตุ (`contractSpan().note` = "ช่วงสัญญาไม่ลงตัวเป็นเดือน — แบ่งงวดชำระเอง (ขั้น ③)" — ปรับ 23/09: ยอดของโซนไม่คิดจากเดือนแล้ว เหลือกระทบแค่การแบ่งงวด) · วันสิ้นเดือนที่เดือนถัดไปไม่มี (31 ม.ค.) ก็นับว่าไม่ลงตัว |
| A2 | เปลี่ยนลูกค้าล้างแค่โซน/แพ็คเกจ **แต่ทิ้งงวดที่คิดจากโซนชุดนั้นไว้** ⇒ ขั้น ③ ยอดไม่ตรงโดยไม่มีเหตุผล | `historicalDownstreamReset(state, 'customer' \| 'vat')` ตอบทั้ง "อะไรจะหาย" และ "ล้างอะไร" · ถามด้วย `confirmAction` ก่อนเสมอเมื่อมีของจะหาย · **วันสัญญาไม่ล้างให้** (พิมพ์ทีละตัว) แต่ขึ้นคำเตือนค้างว่าต้องกลับไปตรวจช่วงครอบในขั้น ③ |
| A3 | `DateInput` ที่ล้อมด้วย `min`/`max` **กลืนค่าที่พิมพ์** แล้วเด้งกลับตอนเบลอ เงียบสนิท | ขอบเหลือช่วงเอกสาร (2000–2100) · กฎ "ไม่เกินวันนี้ / ไม่ก่อนวันเริ่ม / สิ้นสุดไปแล้ว" เป็น **ข้อความใต้ช่อง** จาก `historicalContractDateIssues` ซึ่งอ่าน `CONTRACT_DATE_MESSAGES` ก้อนเดียวกับที่แผนฝั่ง server ตีกลับ |
| A4 | ลูกค้าจริงมี 26 ไซต์ 43 โซน ⇒ ยิง 27 คำขอ ไม่มีช่องค้น ไม่มีการพับ และ **ไซต์เดียวพัง = ลิสต์ว่างทั้งจอ** (`Promise.all` ก้อนเดียว) | โหลดทีละไซต์แบบ **พังทีละใบ** (ไซต์ที่พังมีปุ่ม "ลองอีกครั้ง" ของตัวเอง) + ช่องค้น + พับ (`historicalZoneBrowser`) · ⚠️ ยังยิงรายไซต์เพราะเส้นรวม `/api/service/customers/[id]/zones` ใช้ด่าน `canPickServiceSite` ซึ่ง **ae_supervisor ตกด่าน** — ย้ายได้ต่อเมื่อเจ้าของโมดูลบริการเปิดด่านให้ก่อน |

#### ห้าข้อของ **เปลือกฟอร์ม** ที่ UAT 23/09 จับได้ (แก้แล้ว — อย่าถอยกลับ)

อาการเดียวกันห้าหน้ากาก: **จอพูดถึงของที่ไม่มีอยู่จริง หรือพูดแทนข้อมูลที่ยังไม่ได้ถาม**
⇒ ถ้อยคำและสถานะของเปลือกทั้งหมดย้ายไปอยู่ใน `historicalIntakeForm.js` (ตรึงด้วยเทสต์ของจริง)
สตริงที่พิมพ์ทิ้งไว้ใน JSX ไม่มีใครเฝ้าให้ว่ามันยังจริงอยู่ไหม

| # | อาการ | กติกาที่ใช้แทน |
|---|---|---|
| B1 | กด **"ถัดไป"** ตอนยังขาดไฟล์เอกสารแทนสัญญา = **ไม่มีอะไรเกิดขึ้นเลย** (`setIssues([])` แล้ว `return`) ซ้ำยังล้าง error ของ server ที่อยู่บนจอทิ้ง · ตะกร้าไฟล์ก็หน้าตาเหมือนช่องไม่บังคับ | `historicalNextBlock(localIssues, step)` ตอบ "ติดข้อไหน · ช่องไหน · ข้อความว่าอะไร" ⇒ ฟอร์ม **คาข้อความไว้** + เลื่อนไปที่ช่อง + โฟกัสของที่กดได้ตัวแรก · จุดยึดคือ `historicalFieldAnchorId` ตัวเดียวกับที่แต่ละขั้นใช้วาด `id` (เทสต์ผูกสองฝั่งไว้ ⇒ ชี้ไป id ที่ไม่มีอยู่ไม่ได้) · `PendingFiles` มี `invalid` ของตัวเองแล้ว · แถวบนรางที่ไปไม่ได้บอกเหตุใน `title` |
| B2 | รางส่ง `count: { filled: stepIssues ? 0 : 1, total: 1 }` ⇒ ขั้นที่ error มาจากพรีวิว (② และ ④) ขึ้น **"1/1 (ครบ)" ตั้งแต่ฟอร์มยังเปล่า** | `historicalWizardRail` — เลิกใช้เศษส่วน · ขั้นละหนึ่งบรรทัดสรุปตามม็อก ("4 โซน" — เลิกนับ "แพ็ค" ตามมติ 23/09 · "ยกมา 1 งวด · ต้องเก็บ 1 งวด") · จุดสีบอกเฉพาะที่รู้จริง (มีข้อต้องแก้ / กรอกแล้ว / ยังว่าง) · ส่งเป็น node ของ `label` — **ไม่แก้ `SectionRail`** ซึ่งเป็น primitive ของทั้งระบบ |
| B3 | แถว "ลูกค้า"/"AE ผู้ดูแล" ของแถบสรุปอ่าน `plan?.header` อย่างเดียว ⇒ ค้างเป็นขีดจนกว่าจะมีคนกดตรวจ ทั้งที่แถว "ช่วงสัญญา" ใต้มันขยับทันที | `historicalAsideRows` — **ทุกแถวถอยมาที่ state ของฟอร์มเสมอ** · เพิ่มแถวตามม็อก (สัญญา · ไฟล์ · อ้างอิงเดิม · ภาษี) และป้าย "ย้อนหลัง" ข้างหัว · เหลือว่างได้เฉพาะของที่มีแต่ server คิดให้ได้ (ยอดก่อน VAT · VAT) |
| B4 | ขั้น ④ ที่ยังไม่มีแผนสั่งให้กด **"ตรวจอีกครั้ง"** — ปุ่มชื่อนั้นไม่เคยมีอยู่บนจอ | `HISTORICAL_SAVE_BUTTON_LABEL` เป็นป้ายปุ่มที่เดียว · `historicalReviewStaleNotice()` ประกอบคำสั่งจากค่าคงที่ตัวนั้น ⇒ เปลี่ยนป้ายปุ่มแล้วคำสั่งเปลี่ยนตาม · และบอกความจริงว่า **กดครั้งแรกคือการตรวจ ยังไม่บันทึก** |
| B5 | แถบท้ายของขั้น ①–③ (ปุ่มเดียวคือ "ถัดไป") เขียนว่า "ส่งให้ AE Sup อนุมัติทันทีที่บันทึก" · หัวก้อน error เขียน "ยังกรอกไม่ครบ 3 ข้อ" ทั้งที่ช่องดาวแดงยังว่างอีกราว 7 ช่อง | `historicalFootNote({ step, gate })` · `historicalStepIssueNotice(count)` — พูดเฉพาะสิ่งที่**นับได้จริง** แล้วบอกตรง ๆ ว่ายังมีด่านของพรีวิวอีกชั้น (ด่านใบซ้ำก็เลิกใช้คำว่า "ยังกรอกไม่ครบ" ด้วยเหตุผลเดียวกัน) |

⚠️ **ช่องค้นของดรอปดาวน์** (`SearchableSelect`) เลิกพึ่งแอตทริบิวต์ `autoFocus` แล้ว — สเปก HTML สั่งให้เบราว์เซอร์
**ทิ้ง** autofocus ของ element ที่แทรกเข้ามาหลังเอกสารเคลียร์คิวของรอบโหลด และเมนูนี้เกิดจากการคลิกเสมอ
⇒ โฟกัสเองด้วย ref ตอนเปิด (วัดบน Chrome 23/09: ของเดิมยังโฟกัสติด ⇒ ถือเป็นการถอดของที่พึ่งไม่ได้ ไม่ใช่การแก้บั๊กที่ทำซ้ำได้)


### ลำดับการบันทึก (กดครั้งเดียว หลายจังหวะ)

`nextSaveStage(progress)` เดินห้าขั้น **และจำ ref ของไฟล์ที่อัปสำเร็จไว้** ⇒ กดใหม่ไม่อัปซ้ำ (กติกา "กดส่งซ้ำต้องไม่อัปไฟล์ซ้ำ")

```
persist ──> contractFiles ──> evidence ──> persistEvidence ──> submit
(สร้าง/แก้)   (ไฟล์สัญญา)     (หลักฐานงวดยกมา)  (เขียน ref ลงงวด)   (ส่งอนุมัติ)
```

- **`persist` มาก่อนเสมอ** — ใบที่ถูกตีกลับต้องถูกแก้ให้กลับเป็น `draft` ก่อน เพราะ**ด่านอัปหลักฐานการเงินปฏิเสธสถานะ `rejected`**
  (RPC แก้ใบพลิก `rejected` → `draft` ให้เอง — ไม่ใช่เรื่องความสวยงาม)
- หลัง `persist` รอบแรก ฟอร์ม `window.history.replaceState` ไปที่ URL ของโหมดแก้ แล้ว**คอมโพเนนต์ตัวเดิม**สลับเป็นโหมดแก้ทันที
  (โหลดหน้าใหม่ก็ hydrate จาก server ได้) — รองรับใน Next รุ่นนี้ (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`)
- `persistEvidence` มีเพื่อให้ **reload แล้วหลักฐานยังอยู่** (ref ต้องถูกเขียนลงแถวงวด ไม่ใช่ค้างใน state)
- สำเร็จ = toast ระดับแอป (รอดข้ามการเปลี่ยนหน้า) + พาไปหน้าใบ · ล้มกลางทาง = ฟอร์มบอกว่าติดขั้นไหนและเสนอทางออกตามรหัส error
- **ไม่มี `retry: true` ที่ไหน** · ปุ่มท้ายฟอร์มเป็น `form-action-bar is-page` + `ActionButton kind="submit"` (โทน primary ไม่ใช่ accent)

### ทะเบียนใบสั่งขาย

- แถวใบย้อนหลัง: ชิป info **"ย้อนหลัง"** + เลขเอกสารเดิมแทนเลข QT · บรรทัดรองใต้ลูกค้า = "AE {ชื่อ}" (มติข้อ 22 ของ 0360) · ชื่อ AE อยู่ในชุดค้น
- ตัวกรอง **"ที่มาของใบ"** กลุ่มสุดท้ายใน `FilterPopover`
- รางสามขั้น (เอกสาร → เงิน → ปิดใบ): ขั้น "บัญชีปิดใบ" ของใบย้อนหลัง = **ข้าม** "ไม่เข้าคิวบัญชี" (`financeStatus` ว่างเสมอโดยออกแบบ) ·
  🔄 **สาขา "ยกเว้นด่านเงิน" ถูกถอด** — ใบย้อนหลังที่มียอดเดินขั้นเก็บเงินด้วยงวดจริงเหมือนใบปกติ (งวดยกมานับเป็นหนึ่งงวด) ·
  ใบยอด 0 ข้ามขั้นเก็บเงินด้วยสาขาเดียวกับใบ pipeline
- ยอดหรี่ "ยังไม่นับเป็น Actual"

### หน้ารายละเอียดใบ

- รางก้าว 5 ขั้น (`historicalWorkflowSteps`): คีย์ใบ → AE Sup อนุมัติ (ไม่นับ Actual) → บัญชีรับรองงวดยกมา/งวดแรก → TS ตั้งรอบ → เข้าบริการ
  ⭐ ขั้นบัญชีกับขั้น TS **สลับกันได้** — รอบขายเกิดตอนอนุมัติ ⇒ TS ตั้งรอบก่อนบัญชีรับรองได้ (นัดติดด่านเงินแทน)
- ปุ่มหลัก: ร่าง/ถูกตีกลับ = "แก้ไขและส่งอนุมัติ" (ไปฟอร์มเดิม) · รออนุมัติ + เป็นผู้ตรวจ = "อนุมัติใบย้อนหลัง"
- **โมดัลอนุมัติตัวเดียวสำหรับทั้งปกติและ Admin Override** (`historicalApprovalPrompt`) — checklist บอกสิ่งที่กำลังรับรอง
  (สัญญา+ไฟล์ที่จะกลายเป็น `signedFileId` · โซนรายไซต์ · **รายการแบบใบเสนอราคา** `quoteLineText` — "12 แพ็คเกจ × ฿3,500.00 = ฿42,000.00 (4 โซน)" ·
  ยอดรวมทั้งสิ้น/ยอดรวมสินค้า/บริการ/ภาษีมูลค่าเพิ่ม · งวดยกมา+ความครอบ · คำเตือนรอบขายซ้ำ)
  และ effects บอกสิ่งที่จะเกิด (ออกเลข CT · งวดยกมาขึ้นคิวบัญชี · เปิดโซนให้ TS · `HISTORICAL_STATUS_NOTE`)
  · ลิงก์ไฟล์อยู่ใน children ของ ConfirmDialog · **ทั้งสองทางส่ง `expectedUpdatedAt` + `signedFileId`**
  (โมดัล Override ที่หน้าใบเขียนเองของสาย pipeline **ไม่ถูกใช้กับใบย้อนหลัง** — ตัวนั้นไม่ส่ง `expectedUpdatedAt` และไม่ผ่านกติกาโมดัลอนุมัติ)
- การ์ด **"โซนในใบนี้"** (`HistoricalZonesCard` — ไซต์ · โซน | รายการ (รหัส FG) | จำนวน + หน่วย | รอบบริการที่ขายไว้ | จำนวนเงิน | สถานะรอบ ·
  หัวการ์ดนับ "N โซน" ไม่นับ "แพ็ค" แล้ว — มติ 23/09) + การ์ด **"ช่วงบริการ"** (`CoverageTimeline` ตัวเดียวกับในฟอร์ม)
- ตารางรายการของหน้าใบ (ใบย้อนหลัง) บอก **ไซต์ · โซน** ใต้คำอธิบายของทุกบรรทัด (`showInstallationPoint`) — บรรทัดของหลายโซนหน้าตาเหมือนกันทุกช่อง
- ปิดสำหรับใบย้อนหลัง: แถบเตือนพร้อมลงนาม · การ์ดยืนยันคำสั่งซื้อ · ปุ่มแก้ inline · "ออกสัญญาจากใบนี้"
- โมดัลยกเลิก/ลบบอกผลกับเอกสารแทนสัญญาเสมอ (`historicalCancelEffect` — รวมประโยค "เลข CT ไม่คืน" เมื่อสัญญาลงนามแล้ว)
- ของเสริมโหลดไม่ขึ้น = โชว์แถว **"โหลดไม่ขึ้น"** ใน checklist ไม่ใช่ซ่อนทิ้ง (แถวที่หายเงียบอ่านเหมือน "ไม่มีเรื่องต้องตรวจ")

## 8D. แก้ข้อมูลหลังอนุมัติ = ยกเลิกใบแล้วคีย์ใหม่

ไม่มี "ตีกลับหลังอนุมัติ" — มติ 22/09 เลือกทางนี้เพราะทางอีกทาง (คืนใบไป `rejected` โดยเก็บสัญญาที่ลงนามแล้วไว้)
ต้องมีกิ่งพิเศษทั้งในฟอร์ม · RPC แก้ · RPC อนุมัติ และต้องเจาะรูให้ trigger `no_reopen` ซึ่งเป็นเวิร์กโฟลว์ใหม่ที่มติยังไม่ครอบ

**ลำดับที่ถูกต้อง** (`HISTORICAL_CORRECTION_PATH` · ⭐ มติเจ้าของ 24/09 "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ" · mig 0387):

1. ถ้ามี**งวดปกติ**ที่รับเงินในระบบหลังอนุมัติ (รับรองแล้ว/รอบัญชีตรวจ) — **ให้บัญชีตีกลับก่อน · ที่รับรองแล้วต้องถอนคำรับรองแล้วตีกลับ**
   (ถอนอย่างเดียวแถวกลับเป็น "รอตรวจ" ซึ่งยังบล็อก · ตีกลับรับเฉพาะแถวที่รอตรวจ — ข้อความบอกครบสองขั้นตั้งแต่ review 25/09) (`historicalCancelBlock`
   บังคับ · ใบย้อนหลังไม่มีทางยก/คืนเงิน ⇒ ยกเลิกทับ = เงินค้างถาวร) · trigger `sales_orders_historical_cancel_settle` กันซ้ำตอนแข่งกัน (409)
   · ปุ่ม "ยกเลิก SO" บนหน้าใบ**ถามด่านตัวเดียวกันและปิดพร้อมบอกเหตุ** ส่วนโมดัลยกเลิกโชว์เหตุที่ API ตีกลับ **ในโมดัล**
   (แถบ error ของหน้าอยู่ใต้โมดัล ⇒ ถ้าไม่ส่งเข้าไป คนกดจะเห็นแค่โมดัลค้างเงียบ)
   ⭐ **งวดยกมาไม่ต้องให้บัญชีตีกลับก่อนแล้ว** — เป็นโมฆะตามใบ: ที่รอตรวจ ฐานตีกลับให้ในทรานแซกชันเดียวกัน (เหตุ "ยกเลิกตามใบ…
   ไม่ใช่การตีกลับของบัญชี" ⇒ ออกจากคิว/ป้ายเมนูบัญชี) · ที่รับรองแล้ว คงแถวไว้เป็นประวัติ แต่ `installmentVoid` ตัดออกจากทะเบียนบัญชี/ยอด
   เก็บแล้ว/ตารางรายการ (ไม่ใช่เงินค้าง) + **หมายเหตุบังคับ ≥ 10 ตัวอักษร** (`historicalCancelNoteError` · audit ของงวดอีกแถว)
   · review 25/09: หมายเหตุตัดสินซ้ำใน trigger หลังล็อกงวด (`historical_so_cancel_note_required`) — บัญชีรับรองแทรกระหว่าง route อ่านกับเขียน
     ไม่ทำให้เงินที่รับรองแล้วโมฆะโดยไม่มีเหตุ · สรุป audit/`openingVoided` อ่านจากแถวหลังยกเลิก (`historicalOpeningSettled`)
   🐞 เดิมบล็อกงวดยกมาด้วย ⇒ ใบที่เพิ่งอนุมัติ (ขั้นอนุมัติดันงวดยกมาขึ้นคิวบัญชีให้เอง) ไม่มีใครยกเลิกได้ รวม Admin
2. **ผู้จัดการฝ่ายขาย** (CD · CM · AE Sup · Admin — คนเดียวกับผู้อนุมัติ) **ยกเลิกใบ** — trigger ยกเลิกเอกสารแทนสัญญาให้ในทรานแซกชันเดียวกัน
   (ร่างหรือลงนามแล้วก็ตาม) · โมดัลบอกก่อนกด: สัญญา · งวดยกมาที่เป็นโมฆะ (ใครรับรองไว้) · รอบขายของโซนหยุด · ทางคีย์ใหม่
3. ฝ่ายขาย **คีย์ใบใหม่** ที่ฟอร์มเดิม — ⚠️ ด่านเงินของนัดช่างรอทั้ง**ใบใหม่อนุมัติ และบัญชีรับรองงวดยกมาของใบใหม่**
   (ด่านนับเฉพาะงวด confirmed · ขั้นอนุมัติดันงวดยกมาแค่ถึง "รอตรวจ")

**ราคาของทางนี้**: เลข CT ที่ออกไปแล้ว**ไม่คืน** (เหมือนสัญญาที่ถูก void ของสาย FM-SA-04) · เหลือใบยกเลิก + สัญญายกเลิกไว้เป็นร่องรอย
⇒ ประโยคนี้ถูกเขียนไว้ที่ **ทุกทางตัน**: โมดัลตีกลับงวดของบัญชี · ข้อความตอนถอนงวดยกมาไม่ได้ · ข้อความล็อกของสัญญา · โมดัลยกเลิก/ลบ

## 9. ลำดับ deploy

🛑 **รัน 0374 บนฐานจริงก่อน merge คอมมิต JS** — ลำดับเดียวกับ 0360

1. เปิด PR (CI `check:columns` จะแดงจนกว่าจะรัน — คอลัมน์ `serviceZoneId`/`kind` ยังไม่มีในฐาน)
2. เจ้าของรัน `0374_historical_so_approval_flow.sql` ใน **SQL Editor** (DDL) → บล็อก "ลองก่อนรันจริง" (BEGIN…ROLLBACK รวมการทดลองยกเลิก/คืนสถานะ) → ชุดคำสั่ง "ตรวจหลังรัน" ในหัวไฟล์ (รวม `has_function_privilege` ว่า GRANT ตกเฉพาะ RPC 4 ตัว)
3. `npm run check:columns` + `check:rowcap` บนเครื่อง → `gh run rerun <id> --failed`
4. merge → deploy

🔴 **ช่วงระหว่างรัน 0374 กับ deploy: ห้ามคีย์ใบย้อนหลัง** — RPC สร้างแบบเก่า (9 arg) ถูก DROP ไปแล้ว โมดัลเดิมที่ยังอยู่บน prod
จะตอบ 503 · ด่าน §1 ของ migration จะ abort ถ้ามีใบแบบเดิมอยู่ในฐาน (ตรวจ 22/09: 0 ใบ)

⚠️ **สลับลำดับ (merge ก่อนรัน) พังตรงไหนบ้าง — เท่าที่ไล่แล้ว** (ไม่ใช่ลิสต์ปิด · ของที่ "ดัง" หาเจอง่ายกว่าของที่ "เงียบ")

- ✅ **ตัวคีย์ใบ** ตรวจ schema เองแล้วตอบ 503 พร้อมข้อความ (ไม่ใช่ 500 ดิบ) — `HISTORICAL_FLOW_SCHEMA_MISSING_MESSAGE`
- 🔴 **ทะเบียนใบสั่งขาย** (`api/sales-planning/sales-orders` · งวดชำระเลือก `kind` ของ 0374) **กลืน error โดยตั้งใจ**
  (`console.error` เท่านั้น ไม่ 500 — กันหน้าพังตอนยังไม่มีตารางงวดของ 0245) ⇒ ก่อนรัน 0374 คอลัมน์งวดชำระของ **ทุกใบ**
  ตอบ `ยังไม่เริ่มติดตาม` (ใบย้อนหลังว่างเปล่า เพราะไม่มีแผนจาก QT ให้ถอย) · บรรทัด "ใบกำกับ x/y" หายทั้งคอลัมน์
  (`salesOrderTaxInvoiceNote` เงียบเมื่อ `tracked:false`) · เลน "รอฉันลงมือ" ของบัญชีว่าง (`awaitsFinanceReview` fail-closed)
  **ทั้งที่ป้ายตัวเลขบนเมนูยังนับถูก** (`api/nav/counts` ไม่ได้เลือก `kind` และ throw เมื่ออ่านไม่ขึ้น) ⇒ ป้ายกับลิสต์ขัดกัน
  โดยไม่มี error ให้ใครเห็น — **เงียบกว่าทุกข้อในลิสต์นี้**
- 🔴 **ตัวกรอง `.in('serviceZoneId', …)` ของ `forceDeleteService`** ได้ 42703 ⇒ พรีวิว/บังคับลบโซนและไซต์พัง (ดัง)
- 🔴 **`'signed_quotation'`** ชน CHECK `sales_contracts_external_kind` เดิมของ 0322 ⇒ บันทึกเอกสารแทนสัญญาไม่ผ่าน (ดัง)
- ✅ **คิว/ด่านเข้าไซต์ ไม่กระทบ** — ยืนยันกับโค้ดแล้ว: `api/service/intake` และ `lib/service/gateContext` เลือกเฉพาะคอลัมน์
  ที่มีมาก่อน 0374 (`salesOrderId`/`status`/`dueDate`/`coversFrom`/`coversTo`/`id` · ฝั่งใบอ่าน `origin`/`totalAmount`)

### 9.2 ลำดับ deploy ของ 0387 (มติ 24/09 · ผู้จัดการฝ่ายขายยกเลิกใบที่อนุมัติแล้ว · งวดยกมาเป็นโมฆะ)

**รันก่อนหรือหลัง deploy ก็ได้** (DDL · SQL Editor · รันซ้ำได้) — route **fail closed** (review 25/09):
· รันก่อน: โค้ดเดิมตอบ 400 ก่อนถึง UPDATE ทุกใบที่งวดมีเงิน/รอตรวจ — ไม่พังอะไร
· deploy ก่อน (deploy อัตโนมัติวันละ 3 รอบไม่ถามมิก): route ถาม `historical_so_cancel_settle_ready()` ก่อนเขียน → ไม่มีฟังก์ชัน (PGRST202)
  = ยกเลิกใบที่งวดยกมามีเงินยังไม่ได้ (503 "ยังไม่ได้รัน migration 0387" + ทางออกเดิม: บัญชีตีกลับงวดยกมาก่อน) · ใบอื่นยกเลิกได้ตามเดิม
  🐞 เดิม (5dcb11b0) route ปล่อยงวดยกมาให้ trigger แล้วแค่เตือนหลังเขียน ⇒ งวดค้าง `reported` บนใบที่ยกเลิกถาวร (ล็อกทั้งใบปิดปุ่มบัญชี ·
  ทะเบียนบัญชีตัดทิ้ง · ป้ายเมนูบัญชี +1) และรันมิกทีหลังไม่ซ่อม (trigger ยิงตอนเปลี่ยนสถานะเท่านั้น)
· คำเตือนหลังเขียน (`HISTORICAL_CANCEL_SETTLE_STUCK`) เหลือไว้กันกรณี trigger ถูกปิดระหว่างถามกับเขียน · หัวไฟล์มีคำสั่งตรวจ ①②③④ และบล็อกลองจริง (ROLLBACK)
🪤 ยามทั้งระบบ "ห้าม trigger บนตารางงวด" (`installmentReplanMigration.test.mjs`) มีข้อยกเว้นเดียวคือด่านปฏิเสธของ 0387 (มติเจ้าของให้เพิ่ม)

### 9.1 ลำดับ deploy ของ 0379 (มติ 23/09 · บรรทัดโซนแบบใบเสนอราคา)

🛑 **รัน 0379 ก่อน merge คอมมิต JS แล้ว merge + deploy ต่อทันที** — ลำดับเดียวกับ 0374
1. เจ้าของรันคำสั่ง **"ก่อนรัน"** ในหัวไฟล์ (อ่านอย่างเดียว): คาด 4 ใบ · `diff = 0` ทุกแถว · `unitPrice = costPrice` ·
   intake ไม่มี `"amountsIncludeVat": true` · หน่วยของแพ็คเกจ 02-001 ควรเป็น แพ็คเกจ/เดือน (ไม่ใช่ "ชุด" — "12 ชุด × 3,500" อ่านผิด)
2. รัน `0379_historical_so_quote_lines.sql` ใน SQL Editor → บล็อก "ลองก่อนรันจริง" (จบ ROLLBACK) → "ตรวจหลังรัน"
3. merge → deploy ทันที · `npm run check:columns` เขียวอยู่แล้ว (0379 ไม่เพิ่มคอลัมน์)

🔴 **ช่วงรันถึง deploy: ห้ามคีย์/แก้ใบย้อนหลัง** — ฟอร์มรุ่น 0374 ที่ยังอยู่บน prod ไม่ส่งคีย์ส่วนลด ⇒ ตัวเขียนตอบ 400
"ข้อมูลรายการของโซนไม่ถูกต้อง … โหลดหน้าฟอร์มใหม่" (ดัง) · **AE Sup อนุมัติ 4 ใบที่ค้างได้ตามปกติ** (ขั้นอนุมัติใช้ทางหลวม)
⚠️ **สลับลำดับ (deploy JS ก่อนรัน) = ส่วนลดหายเงียบ** — ตัวเขียนของ 0374 เขียนส่วนลดเป็น 0 ตายตัวแต่เก็บยอดที่หักแล้ว
⇒ บรรทัดที่ยอดไม่ตรงสูตรลงฐานโดยไม่มีอะไรฟ้อง

## 10. ค้าง / ต้องตัดสิน

**ถอดทิ้งในรอบนี้** (ไปไม่ถึงแล้วเพราะบรรทัดผูกโซนตั้งแต่คีย์):
- สวิตช์ยกเว้นด่านเงินรายใบ — action `set_payment_gate_exemption`, `historicalGateExempt`, `exemptReasonError`, ชิป "ยกเว้นด่านเงิน"
  **คอลัมน์ `paymentGateExempt*` และ CHECK ยังอยู่ในฐาน** (บังคับว่างสำหรับใบย้อนหลัง)
- "TS ไม่พบจุดนี้หน้างาน" (§8B เดิม) และ "ถอดจุดออกจากใบ" (§8C เดิม) — `SiteDecisionCard` · `SiteNotFoundPanel` ·
  `api/service/intake/site-not-found` · `siteNotFound*.js` · `siteLineRemoval.js` · กระดิ่ง kind `sales_order_site_not_found` ·
  action `rename/close/remove_installation_point` · RPC `remove_historical_sales_order_line` (DROP ใน 0374)
  **คอลัมน์/CHECK/trigger ของ 0362 ยังอยู่ในฐาน 0 แถว** และ `siteNotFoundMigration.test.mjs` ยังตรึงรูปไว้ — **mig 0366 ไม่ต้องรันแล้ว**
- โมดัลคีย์ 4 ขั้นของ P2a (`HistoricalSalesOrderModal` + 5 ไฟล์ขั้น) · RPC `append_historical_installments` · `historical_so_installments_total`

**เปลี่ยนพฤติกรรมของใบ pipeline ด้วย** (ตั้งใจ · ต้องอยู่ใน PR):
- ใบสั่งขายบริการยอด 0 บาทของสาย pipeline **ผ่านด่านเข้าไซต์ข้อ② เองแล้ว**
- ป้ายตัวเลขบนเมนูของผู้ตรวจ **ไม่นับใบที่ตัวเองยื่น** อีกต่อไป (เดิมนับทั้งที่กดอนุมัติไม่ได้)
- ป้าย `serviceIntake` ของ TS **นับถัง "รอตั้งรอบ" ด้วย** ทุก origin (เพิ่มคิวอ่านสองตัวต่อการนับหนึ่งรอบ)
- งวดยกมาถูกตัดออกจากกอง "ยังไม่ออกใบกำกับ" ของบัญชี

**ยังไม่เคาะ / ต้องยืนยันกับเจ้าของ**:
- **ร่างค้าง** — กดบันทึกแล้วล้มกลางทางทิ้งใบร่างไว้ (เห็นในทะเบียนและในเลน "รอฉันลงมือ" ของผู้คีย์ · แอดมินลบได้)
- ~~**ราคาต่อโซน** — เก็บค่าที่คีย์ มีปุ่มช่วยคิด (ราคาแพ็คเกจ × แพ็ค × เดือน) แต่ไม่ล็อกตามสูตร~~ → **ตัดสินแล้ว 23/09 (A13)**:
  คีย์เหมือนบรรทัดใบเสนอราคา · ราคา = ราคาผลิตในทะเบียน (ล็อก) · ส่วนลดรายการแทนการพิมพ์ยอดเอง · ปุ่มช่วยคิดถูกถอด
- **(23/09) packageQty ของ TS** — "1 ชุด × 12 เดือน" = จำนวน 12 ⇒ `service_zone_terms."packageQty"` 12 (ภาระงาน TS นับ 12 แพ็ค)
  เท่าใบ pipeline · ถ้าภาระงานต้องนับ "ชุด" ต้องมีมติแยก (ไม่แก้ใน 0379)
- **(23/09) ต่างจากใบเสนอราคาโดยเจตนาสองข้อ** — (ก) แพ็คเกจยังไม่ตั้งราคา = ตีกลับ (ใบเสนอราคาคงราคาเดิมแล้วไปตีกลับตอนส่ง
  แต่ใบย้อนหลังบันทึกกับส่งจังหวะเดียว) · (ข) จำนวนเริ่มที่ว่างและว่าง = ตีกลับ (ใบเสนอราคาเริ่มที่ 1) — ต้นเหตุของบั๊กคือจำนวนที่เดาให้
- **งวดที่เหลือบังคับมีวันครบกำหนด** (0360 ยอมให้ว่าง) · **สัญญาที่หมดอายุแล้วคีย์ไม่ได้** (ตรวจที่ JS เท่านั้น) — อาจบล็อกสัญญาที่เพิ่งหมดแต่ยังบริการอยู่
- **หลักฐานงวดยกมาบังคับ ≥1 ไฟล์** (ม็อกวาดว่าไม่บังคับ) — ไม่มีทางยกเว้น · แนบ PDF ใบกำกับจาก Express ได้
- **เหตุผลของ Admin Override ไม่บังคับ** (เท่าสาย pipeline) — ถ้าจะบังคับต้องเปลี่ยนเป็น `ReasonDialog`
- **`standardMlPerMonth` ของรอบขายที่เกิดตอนอนุมัติเป็น NULL** — ยังไม่มีจอไหนกรอก
- **เลข CT** — ทุกการอนุมัติกินเลขจากบ่อเดียวของทั้งบริษัท (เพดาน 9,999 **ตลอดอายุระบบ** ไม่ใช่ต่อเดือน · เฟส 3 กินหลักร้อย) · `YYMM` ในเลข = เดือนที่อนุมัติ
- **งวดยกมาไม่เข้ากองใบกำกับ** — ต้องยืนยันกับบัญชี
- **ไม่มีลายเซ็นอิเล็กทรอนิกส์** ในการส่ง/อนุมัติใบย้อนหลัง (CHECK บังคับให้ช่องลายเซ็นว่าง)
- พิมพ์ใบย้อนหลัง / สลับภาษาเอกสาร / ใบวางบิล — ยังไม่รองรับ
- `FilterPopover` ไม่มีตัวเลขต่อตัวเลือก ⇒ ตัวกรอง "ที่มาของใบ" ไม่มี "184 / 3" ตามม็อก (ต้องแก้ primitive กลาง = ต้องมีมติ)
