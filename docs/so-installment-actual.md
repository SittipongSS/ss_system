# ใบสั่งขาย: นับ Actual ทั้งใบ หรือ Actual รายงวด

> สถานะ: **กำลังดำเนินการ** · ตรวจกับโค้ดเมื่อ 2026-10-27 · **mig 0412 รันบน production แล้ว (เจ้าของรัน 27/10 · ตรวจหลังรันตามคาดทุกข้อ: ดีล 701 · ต่าง 0 · `check:columns` เขียว)** · ที่เหลือ: merge แล้ว deploy โค้ด (ดู "ลำดับขึ้นระบบ") · โค้ดครบทุกชั้นใน worktree `ss_system-instactual` (แบรนช์ `claude/so-installment-actual` — แตกจาก origin/main ที่ 8ba36102 · commit WIP สิบตัวตามลำดับ: build · review round 1 · round 2 · decision 9 · review round 3 · decision 10 · review round 4 fixes · review round 5 fixes · review round 5 gates lens fix · UAT screen fixes (AE Sup pass) — **แก้ผล UAT ฝ่ายบัญชี (FN) 27/10 อยู่ใน worktree ยังไม่ commit** · ยังไม่ push/PR · ⚠️ อ้าง commit ด้วยชื่อ ไม่ใช่ hash — rebase เปลี่ยน hash ทุกตัว) · รอบรีวิว 26/10 แก้ครบ (หัวข้อ "รอบรีวิว 26/10") + รอบรีวิวสอง 26/10 แก้ครบ (หัวข้อ "รอบรีวิวสอง 26/10") + มติข้อ 9 (หัวข้อ "มติข้อ 9 · 26/10") + รอบรีวิวสาม 26/10 (หัวข้อ "รอบรีวิวสาม 26/10") + มติข้อ 10 (หัวข้อ "มติข้อ 10 · 26/10" · **คำถามค้างถึงเจ้าของ 1 ข้อ** — ข้อ 1 ค่าตั้งต้นคงเดิม) + รอบรีวิวสี่ 26/10 (หัวข้อ "รอบรีวิวสี่ 26/10") + รอบรีวิวห้า 27/10 (หัวข้อ "รอบรีวิวห้า 27/10") + UAT จอ AE Sup แบบอ่านอย่างเดียว 27/10 (หัวข้อ "UAT จอ 27/10") + UAT จอฝ่ายบัญชีแบบอ่านอย่างเดียว 27/10 (หัวข้อ "UAT ฝ่ายบัญชี 27/10") · เทสต์เต็มชุดเขียว · ฮาร์เนส PGlite เขียว (39 ข้อ) · เปิดจอแล้วบน dev server แบบอ่านอย่างเดียว (ตัวจำลอง GET · ไม่มีการเขียน) — ยังไม่ได้ลองกดจริงบนฐาน

**สร้าง:** 26/10/2026
**migration:** `0412_so_installment_actual.sql` (DDL — เจ้าของรันมือบน SQL Editor ก่อน deploy · **รันบน production แล้ว 27/10** · ดู "ลำดับขึ้นระบบ")

## คำขอ

> SO ตอนที่ AE Sup กด Actual อยากให้มี ตัวเลือกว่า Actual ทั้งใบ หรือ Actual รายงวด
> ถ้า Actual ทั้งใบก็ทำตามสเตปปกติ ถ้า Actual รายงวด ให้ ยื่น - อนุมัติ - รับรองเงิน ทุกงวด จนครบ

มตินี้ **ยกเว้นมติ 13/08** ("Actual ยอดเต็ม 100% ถึงจะแบ่งจ่าย" · [so-payment-tracking-plan.md](so-payment-tracking-plan.md)) เฉพาะใบที่ AE Sup เลือกรายงวด —
ใบที่เลือก "ทั้งใบ" ทำงานเหมือนเดิมทุกอย่าง

## มติเจ้าของ (26/10/2026 · ถามทีละข้อ)

| # | คำถาม | มติ |
|---|---|---|
| 1 | ยอดงวดเข้า Actual ตอนไหน | ตอน **AE Sup อนุมัติงวด** · เดือน = เดือนที่อนุมัติงวด (เวลาไทย) — "Actual เดือนไหน ยอดเข้าเดือนนั้น" |
| 2 | ยื่นงวดถัดไปได้เมื่อไร | หลัง **บัญชีรับรองเงินงวดก่อนหน้า** แล้ว (วนทีละงวด) |
| 3 | คลิกอนุมัติใบแบบรายงวด นับงวด 1 เลยไหม | **นับงวด 1 ทันที** ในคลิกเดียวกัน |
| 4 | "ยื่นงวด" คืออะไร | **ยื่นขอนับก่อน สลิปตามทีหลัง**: ฝ่ายขายยื่น (ไม่ต้องมีสลิป) → AE Sup อนุมัติ (นับ Actual) → ฝ่ายขายแจ้งสลิป → บัญชีรับรอง |
| 5 | ยอดที่ยังไม่นับโชว์ที่ไหน | งวดที่ยื่นแล้วรอ AE Sup = **"รออนุมัติ"** เดือนปัจจุบัน · งวดที่ยังไม่ยื่น = กองใหม่ **"รอนับรายงวด"** ลงเดือนครบกำหนด (ไม่มีวันครบกำหนด/เลยกำหนดแล้ว = เดือนปัจจุบัน) · อยู่ในยอดคาดการณ์เท่านั้น ไม่เข้า Actual / % เป้า |
| 6 | SO งานบริการรายเดือนเลือกรายงวดได้ไหม | **ได้** |
| 7 | ย้อนอนุมัติแล้วออก Rev. | ย้อนอนุมัติ = งวดที่นับแล้วหลุดหมด · Rev. อนุมัติ = งวดที่เคยนับกลับมาใน **เดือนที่ Rev. อนุมัติ** (เหมือนใบทั้งใบ) |
| 8 | เปลี่ยนแบบทีหลังได้ไหม | ปุ่ม **"นับที่เหลือทั้งหมด"** ทางเดียว (AE Sup + เหตุผล) — ยอดที่เหลือเข้า Actual เดือนที่กด · ทั้งใบ → รายงวด ต้องย้อนอนุมัติแล้วออก Rev. |
| 9 | งวดที่นับ Actual แล้วแต่เงินยังไม่เข้า ปรับแผนงวดได้ไหม | **ปรับยอด/วันได้ ลบไม่ได้** — ปรับแผนงวด (และยกเงินจากใบที่ยกเลิก) แก้ยอด · วันครบกำหนด · ชื่อ · สัดส่วนของงวดนั้นได้ แต่งวดต้องยังอยู่ (ลดถึง 0 = ลบ) · ช่อง Actual ที่ตรึงไว้ (ยอด/เวลาที่นับ) ไม่เปลี่ยน ⇒ Actual ของใบ/ดีลไม่ขยับ |
| 10 | (คำถามค้างข้อ 2 เดิม) หลัง "นับที่เหลือทั้งหมด" งวดที่โผล่ทีหลังทำอย่างไร | **"นับให้เอง ไม่ต้องยื่น"** — กดนับที่เหลือทั้งหมดแล้ว ใบนั้นนับทั้งก้อนจากนี้ไปถาวร: งวดที่ยังไม่นับที่โผล่ทีหลัง (ปรับแผนแบ่ง/เพิ่มงวด · ยกเงินเข้า · Rev. ของใบนั้นที่อนุมัติแบบรายงวด) นับ Actual ให้อัตโนมัติ (via `count_rest` · ส่วนแบ่งตามกติกาเดิม — ปกติ 0 เพราะนับครบแล้ว) · บัญชีรับรองเงินได้ทันที |

### ค่าตั้งต้นที่ Claude เลือก (เจ้าของยังไม่ได้ตอบ — เปลี่ยนได้)

- ใช้กับใบที่อนุมัติหลังขึ้นระบบ (รวม Rev.) เท่านั้น ไม่ย้อนเปลี่ยนใบที่อนุมัติไปแล้ว
- เลือกรายงวดได้เฉพาะใบ pipeline (ไม่ใช่ใบย้อนหลัง) ยอด > 0 และมีอย่างน้อย 2 งวด · ค่าเริ่มต้นของตัวเลือก = "ทั้งใบ" (Rev. = แบบของใบก่อนหน้า)
- ใบรายงวดปลดล็อกทุกอย่างที่ผูกกับ "อนุมัติแล้ว" ตั้งแต่คลิกแรก (งานบริการ · ใบขอพัฒนากลิ่น · FM-SA-04 · ภาษี · ผลิต · บัญชี) — ตัวเลือกนี้ย้ายแค่ Actual
- ผู้อนุมัติงวด = ชุดเดียวกับผู้อนุมัติ SO (AE Sup · CM · CD · admin) · คนยื่นอนุมัติงวดของตัวเองไม่ได้ (ยกเว้น admin) · ตีกลับงวดต้องมีเหตุผล ≥ 10 ตัวอักษร · ไม่มีถอนการอนุมัติงวดเดี่ยว (ใช้ย้อนอนุมัติทั้งใบ) · ไม่ตรึงลายเซ็นรายงวด (audit + เธรดดีล)
- คนยื่นงวด = เจ้าของดีลปัจจุบัน หรือผู้จัดการฝ่ายขาย (กติกาเดียวกับยื่น SO) · ผู้ยื่นดึงคำขอกลับได้ก่อน AE Sup ตัดสิน
- งวดยอด 0 บาท และงวดที่บัญชีรับรองเงินแล้ว (กรณี Rev. จากใบทั้งใบ) นับให้อัตโนมัติตอนคลิกอนุมัติใบ
- ยกเงินจากใบที่ยกเลิกเข้าใบรายงวด = แถวที่ยกมาต้องยื่น-อนุมัติในใบใหม่อีกรอบ (ยกเว้นใบที่กดนับที่เหลือทั้งหมดแล้ว — มติข้อ 10 นับให้เอง) ·
  ปรับแผนงวดล็อกงวดที่ **ยื่นขอนับอยู่** เหมือนงวดที่มีเงิน
  (มติข้อ 9 ครอบเฉพาะงวดที่นับแล้ว — งวดที่ยื่นอยู่ให้ผู้ยื่นดึงกลับ/AE Sup ตีกลับก่อน เพราะส่วนแบ่งคิดตอนอนุมัติ)
- (มติข้อ 9) งวดที่นับแล้ว **ยอด 0** (งวดแถม) คงล็อกทั้งแถว — แกนเขียนแผนบังคับแถวเปิดยอด > 0 ปล่อยเปิดแล้วเก็บ 0 ไว้ก็ไม่ได้ ลบก็ไม่ได้
  = ปรับแผนใบนั้นไม่ได้เลย · เลขงวดของงวดที่นับแล้วเดินตามลำดับในตัวแก้เหมือนแถวเปิด (ตัวแก้ไม่สลับลำดับ ⇒ ลำดับสัมพัทธ์คงเดิม)
- (รอบรีวิวสอง 26/10) ยกเงิน: งวดที่นับตอนคลิกอนุมัติใบ (`so_approval`) ที่ยังไม่มีเงิน/เอกสาร และเงินที่ยกมาครอบ **ทั้งงวด** — มัดจำที่ยกมาคือมัดจำงวดเดียวกัน
  ⇒ งวดนั้นถูกแทน (ลบ) และ Actual ของมันย้ายไปอยู่กับแถวที่ยกมาแถวแรก ยอด/เวลาเดิม (Actual ของใบ/ดีลไม่ขยับ · แถวนั้นไม่ต้องยื่นอีก) —
  **ข้อยกเว้นเดียวของ "ลบไม่ได้" ในมติข้อ 9** (Actual ไม่หาย ย้ายไปอยู่กับเงินก้อนเดียวกัน)
- (มติข้อ 9) ลำดับการหักของยกเงิน: รอบ ก งวดเปิด + งวดที่ถูกแทนทั้งงวด ตามลำดับงวด (งวดที่นับแล้วอื่น ๆ ข้าม) · รอบ ข ยอดที่ยังเหลือลดงวดที่นับแล้ว
  ตามลำดับงวด **ไม่ถึง 0** (เหลืออย่างน้อย 0.01 บาทต่องวด) · แถวที่ยกมาขึ้นก่อนงวดของใบนี้ (งวดที่นับแล้วเลขงวดเลื่อนตามลำดับ — แถวที่ยกมีเงินแล้ว
  ยื่นได้ทันที) · ยังเหลือ = ยกเกิน: เงินที่มีอยู่จริง + ยอดที่ยก > ยอดใบ = `installment_carry_overpaid` (ทางคืนเงินเดิม) · นอกนั้น =
  `installment_carry_counted_locked` (บอกยอดที่ใบยังรับได้ ไม่ใช่คำแนะนำคืนเงิน)
- ยกเลิกใบรายงวด = งวดที่นับแล้วหลุดหมด (เหมือนใบทั้งใบ)
- เจ้าของยอด = กติกาเดิม (แดชบอร์ดตามเจ้าของดีลปัจจุบัน · รายงานยอดขายตามเจ้าของที่ตรึงตอนอนุมัติใบ)
- บัญชีปิดใบเหมือนเดิม (ทุกงวดรับรองครบ) · รางขั้น "นับ Actual" โชว์ x/y งวด
- เอกสาร SO ที่พิมพ์ไม่โชว์แบบการนับ Actual (เป็นเรื่องภายใน)
- คิว "งวดรออนุมัติ" ในงานรอฉันลงมือ + ตัวเลขบนเมนูของผู้อนุมัติ · แจ้งผู้อนุมัติตอนยื่น · แจ้งผู้ยื่นตอนอนุมัติ/ตีกลับ
- (รอบรวมงาน 26/10) เลนเจ้าของดีลของ "รอฉันลงมือ" นับงวดที่ **ถึงเดือนครบกำหนดแล้ว** (หรือไม่มีวันครบกำหนด/ถูกตีกลับ) — ไม่งั้นใบบริการ 12 งวดค้างในป้ายเจ้าของดีลเกือบทั้งปี · ปุ่ม "ยื่นขอนับงวดนี้" ยังกดก่อนกำหนดได้
- (รอบรีวิวสาม 26/10) **ใบรายงวดต้องเหลืองวดที่ยังไม่นับ Actual เสมอ ถ้า Σ ยอดที่นับแล้วยังไม่ถึง `actualAmount`** — ส่วนแบ่ง/ยอดประมาณวางยอดที่เหลือไว้ที่
  งวดที่ยังไม่นับเท่านั้น ⇒ แผนที่ไม่เหลืองวดแบบนั้น = ยอดที่เหลือหายจากทุกกองถาวร · ปรับแผน (เช่นงวด 1 ที่นับแล้ว = เต็มใบแล้วลบงวด 2) และยกเงิน
  (เงินก้อนเดียวครอบทุกงวดที่ยังไม่นับ) = **ปฏิเสธ** `installment_actual_remainder_orphaned` · **ไม่นับยอดที่เหลือให้เอง** (มติข้อ 1: Actual เข้าตอน AE Sup
  อนุมัติงวด เดือนที่อนุมัติ — ยกเงินบัญชีกดได้ และเวลาของแถวที่ยกเป็นเวลาของงวด 1 เดิม = ย้อนลงเดือนเก่า) · ทางออกของยกเงินก้อนเดียวครอบทั้งใบ:
  ย้อนอนุมัติ → Rev. → อนุมัติแบบ "Actual ทั้งใบ" → ยกเข้าใบ Rev. · ปรับแผน: เก็บงวดที่ยังไม่นับไว้ (ลูกค้าจ่ายพร้อมกันได้ด้วยวันครบกำหนดเดียวกัน) ⇒ คำถามค้างข้อ 1
  (**ค่าตั้งต้นคงเดิม — เจ้าของยังไม่ตอบ** · มติข้อ 10 ไม่ได้เปิดทางใหม่: กด "นับที่เหลือทั้งหมด" ก่อนแล้วยก = ไม่ orphan ก็จริง แต่งวดที่นับแล้ว
  ลดได้ไม่ถึง 0 ⇒ เงินก้อนเดียวเต็มใบติด `installment_carry_counted_locked` · ฮาร์เนสข้อ 24 พิสูจน์ทั้งทางตันนี้และทาง Rev. แบบทั้งใบว่าผ่าน ·
  ข้อความของรหัส `installment_actual_remainder_orphaned` บอกทางออกทั้งของปรับแผนและของยกเงิน)
- (รอบรีวิวสาม 26/10) จำนวนในป้าย "รออนุมัติ ฿x · n **ใบ**" ทุกจอ = **จำนวนใบ** ที่มียอดรออนุมัติ — ใบรายงวดที่มีงวดยื่นอยู่นับหนึ่งใบ (ไม่ใช่จำนวนงวด ·
  cache `soInstPendingCount` นับใบ) · การ์ด "รอตรวจอนุมัติ" ของทะเบียน SO = ใบ `pending_approval` ล้วน (กดแล้วตารางเหลือเท่าเลข · #1922 L11) — งวดที่ยื่นของใบ
  รายงวดบอกแยกเป็น "งวดรออนุมัติ ฿y (m งวด · ใบอนุมัติแล้ว)" ในหมายเหตุของการ์ดและหัวกลุ่ม
- (รอบรีวิวสาม 26/10) ตัวหยุดยอดล้มตอนอนุมัติใบรายงวด (best-effort) = **ไม่นับงวด 1 ในคลิกนั้น** — งวดที่ไม่ตรึงแจ้งสลิป/รับรองเงินไม่ได้ ⇒ นับไปก่อน = ติดตาย ·
  ทางกู้ "นับงวด 1" ตรึงงวดที่ค้างก่อนนับเสมอ (ลงเดือนที่กด — มติข้อ 1) · "เริ่มติดตามการชำระ" บนใบที่ **อนุมัติแล้ว** ตรึงงวดทันที (ทุกใบ ไม่ใช่เฉพาะรายงวด —
  ใบทั้งใบเคยได้งวดร่างที่แจ้งชำระเข้าบัญชีไม่ได้เหมือนกัน)

## วงจรงวด (แบบรายงวด)

```
คลิกอนุมัติใบ (เลือก "รายงวด")
  └─ ใบ = อนุมัติแล้ว · งวด 1 (+ งวด 0 บาท + งวดที่รับรองเงินแล้ว) = นับ Actual เดือนนี้
งวด n ≥ 2:
  [รอ] ──(งวด n-1 บัญชีรับรองแล้ว)──> ฝ่ายขาย "ยื่นขอนับงวดนี้" ──> [ยื่นแล้ว · รออนุมัติ]
     ├─ AE Sup "อนุมัติงวดและนับ Actual" ──> [นับแล้ว] ──> ฝ่ายขายแจ้งสลิป ──> บัญชีรับรอง ──> งวด n+1 ยื่นได้
     ├─ AE Sup "ตีกลับงวด" (เหตุผล) ──> [ตีกลับ] ──> ฝ่ายขายยื่นใหม่
     └─ ผู้ยื่น "ดึงคำขอกลับ" ──> [รอ]
AE Sup "นับที่เหลือทั้งหมด" (เหตุผล) ──> ทุกงวดที่ยังไม่นับ = นับเดือนนี้ · เงินยังเก็บตามงวดเดิม
  └─ (มติข้อ 10) ใบนี้นับทั้งก้อนถาวร: งวดที่โผล่ทีหลัง (ปรับแผน · ยกเงินเข้า · Rev. แบบรายงวด) ──> [นับแล้ว] ทันที (ไม่ต้องยื่น)
```

บัญชีรับรองเงินงวดที่ยังไม่ได้อนุมัติไม่ได้ (ด่านทั้งที่จอ/API และ trigger ในฐาน) · ฝ่ายขายแจ้งสลิปงวดได้หลังงวดอนุมัติแล้ว (ด่าน JS อย่างเดียว — ฐานกันแค่การรับรอง)

---

## สัญญาเทคนิค (ทุกชั้นใช้ชื่อตามนี้ · ตรงกับโค้ดแล้ว 26/10)

### ฐานข้อมูล — `0412_so_installment_actual.sql`

**ด่านลำดับรัน:** ต้องมี 0376 · 0377 · 0378 · 0382 และตัวอนุมัติใบ `approve_sales_order_with_signature_evidence_atomic` ก่อน (`mig_0412_requires_0378_0382`) ·
ลายนิ้วมือ md5 ของฟังก์ชันเงินที่ไฟล์นี้ต้องไม่แตะเทียบท้ายไฟล์ (`mig_0412_untouched_changed`) · ไฟล์รันซ้ำได้ (ทดสอบบน PGlite: ฐานว่างสามรอบ — trigger/ฟังก์ชันไม่ซ้อน (ฮาร์เนสข้อ 0) + บนฐานที่มีข้อมูล (รวมงวดที่นับอัตโนมัติ) หนึ่งรอบ ไม่มีอะไรขยับ (ข้อ 12))

**`sales_orders`**
- `"actualMode" text NOT NULL DEFAULT 'order'` — ตั้งได้ทางเดียวคือ RPC ห่ออนุมัติ
- CHECK `sales_orders_actual_mode_valid`: `IN ('order','installment')` **และ** `installment` ได้เฉพาะใบ `origin = 'pipeline'` ที่ไม่ใช่ `draft` / `pending_approval` / `rejected`
- trigger `sales_orders_actual_mode_trg` (BEFORE INSERT OR UPDATE OF `status`, `"actualAmount"`, `"totalAmount"`): ใบกลับเป็นร่าง/รออนุมัติ/ตีกลับ = คืนเป็น `'order'` ·
  คิด cache สองช่องใหม่ด้วยยอดของแถวที่กำลังเขียน
- `"actualCountedAmount" numeric NOT NULL DEFAULT 0` — Σ `actualAmount` ของงวด `actualStatus='approved'` (cache · trigger ของงวดดูแล)
- `"actualSubmittedAmount" numeric NOT NULL DEFAULT 0` — Σ ยอดประมาณ (ก่อน VAT) ของงวด `actualStatus='submitted'`
- CHECK `sales_orders_actual_cache_sane`: สองช่องไม่ติดลบ
- `"actualMode"` เข้ารายการคอลัมน์ที่ปลุก `sales_orders_sync_actual_trg` (สร้าง trigger ใหม่ · ฟังก์ชัน `sales_order_actual_trigger` ของ 0108 คงเดิม)

**`sales_order_installments`**
- `"actualStatus" text NULL` CHECK `IN ('submitted','approved','rejected')` — NULL = ยังไม่ยื่น (หรือใบทั้งใบ)
- `"actualSubmittedAt" timestamptz` · `"actualSubmittedById" text` · `"actualSubmittedByName" text`
- `"actualApprovedAt" timestamptz` · `"actualApprovedById" text` · `"actualApprovedByName" text` ·
  `"actualApprovedVia" text` CHECK `IN ('so_approval','review','count_rest')`
- `"actualRejectedAt" timestamptz` · `"actualRejectedById" text` · `"actualRejectedByName" text` · `"actualRejectedReason" text`
- `"actualAmount" numeric NULL` — ยอดก่อน VAT ของงวดนี้ ตรึงตอนอนุมัติงวด
- `"actualNote" text` (≤ 500) — เหตุผลของ "นับที่เหลือทั้งหมด"
- CHECK `sales_order_installments_actual_shape`: NULL = ไม่มี approved/amount · submitted = มี submittedAt ไม่มี approved/amount ·
  approved = มี approvedAt + amount ≥ 0 + via · rejected = มี rejectedAt + เหตุผล ≥ 10 ไม่มี approved/amount ·
  ยื่นใหม่หลังตีกลับ = เหตุผลตีกลับรอบก่อนค้างไว้เป็นประวัติ

**เวลาที่นับ Actual ของงวด** = `GREATEST(i."actualApprovedAt", so."approvedAt")` เวลาไทย (Rev. อนุมัติ = งวดที่เคยนับย้ายมาเดือน Rev.)

**ส่วนแบ่งก่อน VAT** (`so."actualAmount"` = ก่อน VAT · `i.amount` = รวม VAT) — `_so_installment_actual_share` / `_so_installment_actual_estimates`:
- ตอนอนุมัติงวด: ถ้าเป็นงวดเดียวที่ยังไม่นับ = `so.actualAmount − Σ งวดที่นับแล้ว` · งวดอื่น = `round(i.amount × so.actualAmount / so.totalAmount, 2)`
  ไม่เกินยอดคงเหลือ ⇒ นับครบทุกงวดแล้ว Σ = `so.actualAmount` พอดี (อนุมัติข้ามลำดับก็ตาม)
- ประมาณของงวดที่ยังไม่นับ (กอง "รออนุมัติ" / "รอนับรายงวด"): เรียงตาม `seq` แล้ว `id` งวดละ `round(...)` ไม่เกินคงเหลือ งวดท้ายรับเศษ ⇒
  นับแล้ว + ยื่นแล้ว + ยังไม่ยื่น = `so.actualAmount` พอดี
- ตัวอย่างที่เทสต์ยึด: ใบ 107,000 (VAT 7,000) สามงวด = 33,000 / 33,000 / 34,000 · ใบ 100,000 (VAT 6,542.06) = 31,152.64 / 31,152.64 / 31,152.66
- JS คู่กันที่ `salesOrderActualMode.js` ปัดครึ่งขึ้นที่สตางค์ด้วย BigInt (เลี่ยง float: 0.575 → 0.58)

**คู่ `sync_sales_order_actual` + `enforce_sales_order_actual_on_deal`** (แก้คู่กันเสมอ):
- `wonValue` = Σ `actualAmount` ใบทั้งใบที่อนุมัติ + Σ ยอดงวดที่นับแล้วของใบรายงวดที่อนุมัติ (pipeline เท่านั้นเหมือนเดิม · คิดจากแถวงวดตรง ๆ = เท่ากับ cache เสมอ)
- `metadata.wonMonth` = เดือนที่อนุมัติ **ใบ** ล่าสุด (ความหมายเดิม — ไม่ขยับตามงวด)
- `metadata.actualByMonth` = `{"YYYY-MM": ยอด}` — ใบทั้งใบลงเดือน `approvedAt` · งวดลงเดือนของเวลาที่นับ · มีคีย์เมื่อดีลมีใบ pipeline ที่อนุมัติ (อาจเป็น `{}`)
- `metadata.soInstPendingAmount` / `soInstPendingCount` — งวดที่ยื่นแล้ว (มีคีย์เมื่อ count > 0) · **Count = จำนวนใบ** ที่มีงวดยื่นอยู่ (`count(DISTINCT o.id)` ·
  รอบรีวิวสาม — ทุกจอวาด `soPendingCount + soInstPendingCount` เป็น "· n ใบ") · Amount = Σ ยอดประมาณของทุกงวดที่ยื่น
- `metadata.soInstRemainingByDue` = `{"YYYY-MM" | "none": ยอด}` — งวดที่ยังไม่ยื่น/ถูกตีกลับ ตามเดือน `dueDate` (มีคีย์เมื่อไม่ว่าง) ·
  ใบรายงวดที่อนุมัติแล้วแต่ **ยังไม่มีงวดสักแถว** (ตัวหยุดยอดล้ม) = `actualAmount` ทั้งใบลง `"none"` (รวมกับ `none` ของใบอื่นเป็นคีย์เดียว ·
  ตรงกับ `salesOrderRemainingActual` · มีงวดเมื่อไร trigger ของงวด sync ดีลใหม่ ⇒ ย้ายไปตามเดือนของงวด ไม่นับซ้ำ)
- `soPending*` เดิมไม่เปลี่ยน · enforce ถอดคีย์ระบบทั้งหมดแล้วเขียนใหม่เหมือน `soPending*` (PATCH ดีลแต่งคีย์มาเอง = ถูกเขียนทับ)
- ไม่ backfill: ดีลที่ยังไม่มี `actualByMonth` ผู้อ่านใช้ `{wonMonth: wonValue}` (เท่ากันทุกดีลวันนี้ — ใบอนุมัติหนึ่งใบต่อดีล)
- ใบทั้งใบ (ทุกใบวันนี้): `wonValue` · `wonMonth` · `actualSource` · `wonValueExVat` · `soPending*` ค่าเดิมทุกตัวอักษร (PGlite เทียบ 0411 กับ 0412 บน 9 รูปดีล)

**trigger ของงวด**
- `sales_order_installments_actual_sync` — AFTER INSERT / UPDATE OF (`actualStatus`, `actualAmount`, `actualApprovedAt`, `salesOrderId`, `amount`, `dueDate`, `seq`) / DELETE →
  คิด cache สองช่องของใบ (UPDATE เฉพาะเมื่อค่าเปลี่ยน · ทั้งใบใหม่และใบเดิมเมื่อย้ายใบ · ใบถูกลบไปแล้วจาก cascade = ข้าม)
  แล้วเรียก `sync_sales_order_actual(dealId)` **เฉพาะเมื่อใบเป็นใบรายงวด pipeline ที่อนุมัติอยู่** (กรณีเดียวที่ metadata ของดีลเปลี่ยน) —
  ใบทั้งใบไม่แตะ `sales_deals` เลย (เหมือนวันนี้ · งานงวดไม่ขยับ `updatedAt` ของดีล) · `seq` อยู่ในรายการเพราะลำดับงวดตัดสินว่างวดไหนรับเศษ
- `sales_order_installments_actual_guard` — BEFORE INSERT / UPDATE OF status: ใบ `actualMode='installment'` **ที่ไม่ได้ยกเลิก** + `NEW.status='confirmed'`
  (เปลี่ยนเข้า confirmed) + `NEW."actualStatus" IS DISTINCT FROM 'approved'` ⇒ `RAISE 'installment_actual_not_approved'` (ปฏิเสธอย่างเดียว)
- `sales_order_installments_actual_delete_guard` (มติข้อ 9) — BEFORE DELETE `WHEN (OLD."actualStatus" = 'approved')` → ฟังก์ชัน `so_installment_actual_delete_guard`
  (SECURITY DEFINER · ไม่มีใครเรียกตรงได้): ใบ pipeline `approved` + `actualMode='installment'` ⇒ `RAISE 'installment_actual_counted_row_delete'` (ปฏิเสธอย่างเดียว ·
  ไม่ล็อกใบ) · ครอบทุกทางลบ (แกนเขียนแผนของปรับแผน/ยกเงิน · เขียนตรง) · **ไม่ยิง**: ลบทั้งใบ (`force_delete_sales_order` / DELETE ใบ → CASCADE —
  ใบหายก่อนในคำสั่งเดียวกัน อ่านไม่เจอ = ผ่าน · ฮาร์เนส 11b/19d) · ใบที่ย้อนอนุมัติ/ยกเลิก/ทั้งใบ · ใบย้อนหลัง (`order` เสมอ) ·
  `freezeInstallments` ลบเฉพาะงวดร่างที่ยังไม่ตรึง (งวดตรึงก่อนนับเสมอ) · C2 ของตัวยกเงินถอดการนับก่อนแกนลบ
- `sales_order_installments_actual_autocount` (มติข้อ 10) — **CONSTRAINT TRIGGER · DEFERRABLE INITIALLY DEFERRED** · AFTER INSERT / UPDATE OF
  `"salesOrderId"`, `"actualStatus"` · `WHEN (NEW."actualStatus" IS DISTINCT FROM 'approved')` → `so_installment_actual_autocount` (SECURITY DEFINER ·
  ไม่มีใครเรียกตรงได้): ตอน COMMIT อ่านแถวสดด้วย id (หาย/นับแล้ว = ข้าม) · ใบ pipeline `approved` + `installment` + ไม่ถูกแทน · มีงวดอื่นของใบ
  `actualStatus='approved'` + `actualApprovedVia='count_rest'` (**สัญญาณ "เคยกดนับที่เหลือทั้งหมด" — ไม่มีคอลัมน์ใหม่**: count_rest นับอย่างน้อยหนึ่งงวด ·
  งวดที่นับแล้วลบไม่ได้ · C2a ถอดชั่วคราวเฉพาะ `so_approval` · Rev. ย้ายทั้งแถว = ติดไป · ยกเงิน C1 ล้างช่อง = ไม่ติดจากใบต้นทาง) ⇒ UPDATE แถวนั้น
  `approved` · `actualAmount` = `_so_installment_actual_share` · `actualApprovedAt` = `now()` · ผู้อนุมัติ = ผู้กดนับที่เหลือทั้งหมดล่าสุดของใบ ·
  via `count_rest` · `actualNote` = `'นับอัตโนมัติ — ใบนี้กด “นับที่เหลือทั้งหมด” แล้ว (มติข้อ 10)'` (= `INSTALLMENT_ACTUAL_AUTO_NOTE`) · ผ่าน trigger
  ปกติ (cache + sync ดีล) · WHEN ตัดแถวที่นับแล้ว ⇒ ไม่วน · ไม่ล็อกใบ (ผู้เขียนผ่าน RPC ถือใบไว้จน COMMIT)
  - **ทำไม deferred:** ตัวยกเงินถอดการนับงวด 1 ชั่วคราว (C2a) ก่อนแกนลบ แล้วคืน Actual ให้แถวที่ยกแถวแรก (C2b) — ฮาร์เนส: ตัวเดียวกันแบบ
    NOT DEFERRABLE นับงวดที่ C2a เพิ่งถอดกลับทันที ⇒ แกนลบชน `installment_actual_counted_row_delete` (ยกเงินเข้าใบที่นับที่เหลือทั้งหมดแล้วล้ม) ·
    นับกลางทางยังแจกส่วนแบ่งของงวดที่ถอดชั่วคราวให้แถวที่ยกซ้ำกับ C2b
  - **ผลข้างเคียง:** ภาพ `after` ที่ RPC ปรับแผน/ยกเงินคืน (และ audit `after` ของ route) เป็นภาพก่อน COMMIT — งวดที่ถูกนับอัตโนมัติขึ้นเป็นยังไม่นับในภาพนั้น
    (จอโหลดงวดสดหลัง RPC เสมอ · ร่องรอยการนับอยู่ที่ `actualNote`/`actualApprovedAt` ของแถว)
  - **ข้อยกเว้นที่สี่ของยาม `installmentReplanMigration`** (ตัวเดียวที่เขียนแถวงวดจาก trigger) — ทางเลือกที่ไม่ใช้ trigger ตกไปเพราะตัวปรับแผน
    (replan RPC) อยู่ในลายนิ้วมือที่ห้ามแตะ และแกนเขียนแผนถูกเรียกกลางทางของตัวยกเงิน (ก่อน C2b)
  - **ไม่ยิง:** ใบทั้งใบ (แม้มีแถวรูป count_rest) · ร่าง Rev. · ใบย้อนอนุมัติ · ใบยกเลิก · ใบรายงวดที่ไม่เคยกดนับที่เหลือทั้งหมด (ฮาร์เนสข้อ 22–23) ·
    อนุมัติ Rev. (ไม่มีเหตุการณ์ของแถวงวด) ⇒ start นับให้แทน

**RPC** (plpgsql · `SET search_path = public` · REVOKE PUBLIC/anon/authenticated · GRANT service_role · ไม่ SECURITY DEFINER)
1. `approve_sales_order_with_actual_mode(p_order_id, p_evidence_id, p_expected_updated_at, p_document_fingerprint, p_approval_note, p_actor_id, p_actor_name, p_actor_role, p_actor_team, p_separation_override_reason DEFAULT NULL, p_actual_mode DEFAULT NULL)` → jsonb เดิม + คีย์ `actualMode` (`document` = แถวหลังตั้งแบบ)
   - เรียกตัวเดิม (ไม่แตะเนื้อ) แล้ว UPDATE `"actualMode"` ในทรานแซกชันเดียวกัน
   - `p_actual_mode` ต้องมีค่าตั้งต้นตามกติกา Postgres (พารามิเตอร์ก่อนหน้ามี DEFAULT) — NULL/ว่าง/ค่าอื่น = `sales_order_actual_mode_invalid` (ลืมส่ง = ดัง ไม่ใช่ทั้งใบเงียบ ๆ)
   - `installment` ต้อง pipeline + `totalAmount > 0` ไม่งั้น `sales_order_actual_mode_ineligible` (ไม่มีอะไรถูกเขียน) · จำนวนงวด ≥ 2 ตรวจที่ JS (งวดเกิดหลังอนุมัติ)
   - `order` ล้างช่อง Actual รายงวดของงวดที่ยกมากับใบ Rev. — ไม่งั้นงวด "ยื่นแล้ว" ที่ค้างมาล็อกการปรับแผนถาวร
   - route เรียกตัวนี้ **ทุกครั้ง** (ทั้งใบก็ส่ง `'order'`) ผ่าน `approveWithEvidence` (`lib/admin/signatureEvidence.js` แปลสองรหัสเป็น 400/409)
2. `start_sales_order_installment_actual(p_order_id, p_actor_id, p_actor_name, p_actor_role, p_counted_at DEFAULT NULL)` → `{before, after, counted, countedIds}` — ผู้อนุมัติเท่านั้น · ใบ approved + installment ·
   นับ (via `so_approval`) งวดเลขน้อยสุด + งวดยอด 0 + งวดที่ `status='confirmed'` ที่ยังไม่นับ · รันซ้ำได้ (นับแล้วข้าม) ·
   ใบมีงวดน้อยกว่า 2 = นับทุกงวด · route เรียกหลัง `freezeInstallments` และเป็นทางกู้ "นับงวด 1" ถ้าขั้นนี้ล้ม ·
   **เวลาที่นับ** = `GREATEST(approvedAt, LEAST(COALESCE(p_counted_at, now()), now()))` — การอนุมัติส่ง `approvedAt` ที่เพิ่ง commit (งวด 1 ลงเดือนที่อนุมัติใบ
   แม้ขั้นนี้ข้ามเที่ยงคืนสิ้นเดือน) · ปุ่มกู้ไม่ส่ง = `now()` = เดือนที่กด (มติข้อ 1) · ลายเซ็นเดิม 4 พารามิเตอร์ถูก DROP ในไฟล์ (ไม่ซ้อน overload) ·
   **มติข้อ 10:** ใบที่มีงวด via `count_rest` (Rev. ของใบที่กดนับที่เหลือทั้งหมด — งวดย้ายมาทั้งแถว) = นับ **ทุกงวด** ที่ยังไม่นับ via `count_rest` +
   `actualNote` ข้อความเดียวกับ trigger ข้างบน (ใบอื่นไม่แตะ `actualNote` · via `so_approval` ตามเดิม) · ผู้อนุมัติ = ผู้กดอนุมัติ Rev.
3. `sales_order_installment_actual_action(p_installment_id, p_action, p_reason, p_expected_updated_at, p_actor_id, p_actor_name, p_actor_role)` → `{before, after}`
   - ร่วม: ล็อกใบก่อนงวด · ใบ pipeline + `approved` + installment + ไม่ถูกแทน · CAS `updatedAt` ของงวดเมื่อส่งมา (`installment_actual_stale`) · `p_action` อื่น = `installment_actual_forbidden`
   - `submit`: `actualStatus` NULL/rejected · ทุกงวดที่เลขน้อยกว่า `status='confirmed'` · ผู้ทำ = เจ้าของดีลปัจจุบัน หรือ `is_sales_manager_role`
   - `withdraw`: `submitted` · ผู้ยื่นเอง หรือ admin → NULL (ล้างช่อง submitted)
   - `approve`: `is_sales_manager_role` · `submitted` · ไม่ใช่ผู้ยื่น (admin ได้) · งวดก่อนหน้า confirmed ครบ · คิดส่วนแบ่ง · via `review`
   - `reject`: ผู้อนุมัติ · `submitted` · เหตุผล 10–500
   - (รอบรีวิวสี่) `submit`/`approve`: ใบมีงวดที่ `"frozenAt" IS NULL` = `installment_actual_unfrozen` (ก่อนด่านงวดก่อนหน้า) — withdraw/reject (ถอย) ไม่ติด
4. `count_rest_sales_order_installment_actual(p_order_id, p_reason, p_actor_id, p_actor_name, p_actor_role)` → `{before, after, counted, countedAmount, reason}` — ผู้อนุมัติ · เหตุผล 10–500 ·
   ใบมีงวดยังไม่ตรึง = `installment_actual_unfrozen` (route ตรึงก่อนเรียกเสมอ · รอบรีวิวสี่) ·
   นับทุกงวดที่ยังไม่นับตามลำดับ (via `count_rest`, `actualNote` = เหตุผล) · ไม่เหลืองวดให้นับ = `installment_actual_bad_state` ·
   กดแล้วใบนับทั้งก้อนถาวร (มติข้อ 10 — งวดที่โผล่ทีหลังนับโดย trigger `sales_order_installments_actual_autocount` / start ของ Rev.)

**ตัวล็อกปรับแผนงวด:** `_so_installment_replan_locked` **ตัวใหม่ 8 พารามิเตอร์** (+ `actualStatus`, `amount` — ยื่นขอนับอยู่ = ล็อก · นับแล้ว **ยอด 0** = ล็อก ·
นับแล้วยอด > 0 = **ไม่ล็อก** ตามมติข้อ 9 · JS `installmentReplanLock` ตรงกัน) ⇒ แกนเขียนแผน (0377 ไม่แก้เนื้อ) เอางวดที่นับแล้วออกจากชุด "ต้องเท่าเดิมทุกช่อง" (①)
ไปอยู่ชุดที่ ④ เขียนยอด/วัน/ป้าย/สัดส่วน/เลขงวด (ไม่เอ่ยช่อง Actual) · ② ลบงวดที่แผนไม่เก็บ = trigger ลบปฏิเสธ (ชุด "ต้องยังอยู่") · ยอด 0 = row_invalid (แถวเปิดต้อง > 0) ·
ปะฟังก์ชันที่รันอยู่ให้เรียกตัวใหม่ด้วย anchor นับจำนวนพอดี: แกนเขียนแผน `_so_installments_write_plan` (0377 · 5 จุด) · ตัวยกเงิน `carry_sales_order_installments` (0378 · 3 จุด +
C1 ล้างช่อง Actual ของแถวที่ยกมา — ต้องยื่น-อนุมัติในใบใหม่ + C2 สี่จุด: งวด `so_approval` ที่ยังไม่มีเงินซึ่งแผนตัดทิ้งทั้งงวด = ถอดการนับชั่วคราว (C2a) แล้วคืน Actual
ยอดรวม/เวลา/ผู้อนุมัติเดิมให้แถวที่ยกมาแถวแรกหลังเขียนแผน + คืนภาพ "ก่อน" ของ audit (C2b) · ด่าน `installment_carry_counted_locked` ก่อนด่านยกเกิน:
`ล็อก(8) + ยก + 0.01 × จำนวนงวดที่นับแล้วยอด > 0 ที่ยังอยู่ > ยอดใบ` และ `เงิน/เอกสารจริง + ยก ≤ ยอดใบ` — กติกาเดียวกับ `applyCarryIn`) ·
ตัว 6 พารามิเตอร์ของ 0377 คงไว้แต่ไม่มีใครเรียกแล้ว (ตรวจท้ายไฟล์ `mig_0412_six_arg_callers_left`) · ข้อความแทนที่ของ C2 เรียกตัวล็อกด้วย `NULL, NULL` เท่านั้น
- **W1 (รอบรีวิวสาม):** แกนเขียนแผนปะเพิ่มหนึ่งจุดต่อจากด่าน Σ (anchor `RAISE … 'installment_replan_sum_mismatch'; END IF;` ครั้งเดียว) — ใบ pipeline `approved`
  `installment` ที่หลังเขียน **ไม่มีงวดที่ยังไม่นับ** และ Σ `actualAmount` ของงวดที่นับแล้ว < `actualAmount` ของใบ − 0.005 ⇒ `installment_actual_remainder_orphaned`
  (ตัวปรับแผน `replan_sales_order_installments` อยู่ในลายนิ้วมือที่ห้ามแตะ ⇒ ด่านต้องอยู่ในแกน) · ไม่ยิงในเส้นยกเงิน (แถวที่ยกยังไม่นับตอนแกนจบ — C1)
- **C2o (รอบรีวิวสาม):** ต่อท้าย C2b ในข้อความแทนที่เดียวกัน — เงื่อนไขเดียวกับ W1 หลังแถวที่ยกแถวแรกรับ Actual ของงวดที่ถูกแทน ⇒ รหัสเดียวกัน ·
  ป้าย `0412/W1 ▶` และ `0412/C2o ▶` อยู่ในด่าน "ปะไว้แล้ว" (ร่างเดิมที่ไม่มีป้าย = `mig_0412_patch_anchor` — ฐานจริงไม่เคยรันร่างเดิม · รันรุ่นสุดท้ายแล้ว 27/10)
(ร่าง 0412 ที่เคยรันตัว 7 พารามิเตอร์บนฐานไหน = ไฟล์หยุดเองด้วย `mig_0412_patch_anchor` — ฐานจริงไม่เคยรันร่างเดิม · รันรุ่นสุดท้ายแล้ว 27/10)
- ⚠️ **ห้ามรัน 0377 หรือ 0378 ซ้ำหลัง 0412** — จะทับแพตช์กลับเป็นตัวล็อกเดิม (หัวไฟล์เตือนไว้)

**รหัส error** (ข้อความไทยทั้งหมดอยู่ใน `src/lib/sales/documentWorkflowErrors.js` · ด่าน JS อ่านข้อความเดียวกันผ่าน `workflowErrorMessage`)

| รหัส | HTTP | ข้อความ |
|---|---|---|
| `sales_order_actual_mode_invalid` | 400 | แบบการนับ Actual ไม่ถูกต้อง |
| `sales_order_actual_mode_ineligible` | 409 | ใบนี้นับ Actual รายงวดไม่ได้ — ต้องเป็นใบที่ยอดมากกว่า 0 และแบ่งอย่างน้อย 2 งวด |
| `installment_actual_not_approved` | 409 | งวดนี้ยังไม่ได้อนุมัตินับ Actual — รอ AE Sup อนุมัตินับงวดนี้ก่อน บัญชีจึงรับรองเงินได้ |
| `installment_actual_order_not_installment` | 409 | ใบนี้นับ Actual ทั้งใบ ไม่มีการยื่นรายงวด |
| `installment_actual_order_not_approved` | 409 | ใบสั่งขายยังไม่อยู่ในสถานะอนุมัติ — ยื่นหรืออนุมัติงวดไม่ได้ |
| `installment_actual_bad_state` | 409 | สถานะงวดเปลี่ยนไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง |
| `installment_actual_previous_unconfirmed` | 409 | งวดก่อนหน้ายังไม่ได้รับรองเงิน — ยื่นหรืออนุมัติงวดนี้ได้หลังบัญชีรับรองงวดก่อน |
| `installment_actual_forbidden` | 403 | ไม่มีสิทธิ์ทำรายการนี้กับงวด |
| `installment_actual_self_approval` | 403 | อนุมัติงวดที่ตัวเองยื่นไม่ได้ — ให้ผู้อนุมัติคนอื่นกด |
| `installment_actual_reason_required` | 400 | ใส่เหตุผล 10–500 ตัวอักษร |
| `installment_actual_stale` | 409 | งวดนี้ถูกแก้ไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง |
| `installment_actual_not_found` | 404 | ไม่พบงวดนี้ |
| `installment_actual_unfrozen` | 409 | งวดชำระของใบนี้ยังไม่ตรึง (ตรึงไม่สำเร็จตอนอนุมัติ) — ให้ AE Sup กด ‘นับงวด 1’ หรือ ‘นับงวดที่ค้าง’ ที่การ์ดการชำระก่อน (ระบบตรึงงวดแล้วนับ) จึงยื่น/อนุมัตินับงวดได้ (รอบรีวิวสี่ · RPC submit/approve/count_rest) |
| `installment_carry_counted_locked` | 409 | ยอดที่ยกมาเกินยอดที่ใบนี้ยังรับได้ — งวดที่ยื่นขอนับ Actual อยู่ปรับยอดไม่ได้ (ดึงคำขอกลับ/ตีกลับก่อนแล้วยกใหม่ได้) · งวดที่นับ Actual แล้วลดยอดได้แต่ลบไม่ได้ (ไม่ใช่เงินเกินยอดใบ) · ถ้ายกหลายงวดให้เลือกยกน้อยลง · ถ้ายกงวดเดียว: ย้อนการอนุมัติใบนี้แล้วออก Rev. · อนุมัติ Rev. แบบ “Actual ทั้งใบ” แล้วยกเงินเข้าใบ Rev. |
| `installment_actual_counted_row_delete` | 409 | งวดที่นับ Actual แล้วลบออกจากแผนไม่ได้ — ปรับยอด/วันได้ (ยอด Actual ที่นับไว้คงเดิม) · โหลดหน้าใหม่แล้วเก็บงวดนั้นไว้ในแผน |
| `installment_actual_remainder_orphaned` | 409 | แผนนี้ไม่เหลืองวดที่ยังไม่นับ Actual ทั้งที่ Actual ของใบยังนับไม่ครบ — ยอดที่เหลือจะไม่มีงวดไหนนับได้อีก · ปรับแผน: เก็บงวดที่ยังไม่นับไว้อย่างน้อย 1 งวด · ยกเงินก้อนเดียวครอบทั้งใบ: ย้อนการอนุมัติใบนี้แล้วออก Rev. อนุมัติ Rev. แบบ “Actual ทั้งใบ” แล้วยกเงินเข้าใบ Rev. (โหลดหน้าใหม่แล้วลองอีกครั้ง) |
| CHECK `sales_order_installments_actual_shape` · `sales_orders_actual_mode_valid` · `sales_orders_actual_cache_sane` | 409 | ข้อความไทยของแต่ละตัว (เจอ = เขียนนอก RPC) |
| `mig_0412_*` (ห้าตัว) | 409 | ด่านของไฟล์ตอนรันบน SQL Editor |

### ชั้น JS

**กติกาตัวเดียว — `src/lib/sales/salesOrderActualMode.js`** (ห้าม import `salesOrderWorkflow` / `salesOrderPayments` / `dashboardMetrics` — สามไฟล์นั้น import ไฟล์นี้)
- ค่าคงที่: `ACTUAL_MODE_ORDER` · `ACTUAL_MODE_INSTALLMENT` · `ACTUAL_MODES` · `ACTUAL_MODE_LABELS` · `ACTUAL_STATE_LABELS` / `ACTUAL_STATE_TONES`
  (`counted` · `submitted` · `rejected` · `ready` · `waiting` · `auto` "รอนับอัตโนมัติ" — มติข้อ 10 · `unfrozen` "รอ AE Sup ตรึงงวด" — รอบรีวิวห้า) · `INSTALLMENT_ACTUAL_ACTIONS` (`actual_*` → `p_action`) ·
  `MIN_INSTALLMENT_ACTUAL_ROWS`
- มติข้อ 10: `installmentActualCountRestDone(rows)` (สัญญาณเดียวกับ SQL — มีงวด approved via `count_rest`) · `INSTALLMENT_ACTUAL_AUTO_NOTE` (= ข้อความของ SQL
  ทุกตัวอักษร · ยามที่ migration test) · `installmentActualAutoCounted(row)` (แผงงวดเขียน "นับอัตโนมัติ" แทน "นับที่เหลือทั้งหมด") ·
  `INSTALLMENT_ACTUAL_AFTER_COUNT_REST` ("…ระบบนับ Actual ให้เอง ไม่ต้องยื่น (มติข้อ 10) แต่งวดนี้ยังค้าง: ให้ AE Sup กด ‘นับงวดที่ค้าง’" — งวดที่ยังไม่นับบน
  ใบแบบนี้ที่จอเห็นได้ = ขั้นนับตอนอนุมัติ Rev. ยังไม่จบเท่านั้น) · บนใบแบบนี้: `installmentActualStartRows`/`Pending` = ทุกงวดที่ยังไม่นับ (รวมแถวที่ยกมา ·
  ตรงกับ `v_rest` ของ start) · ป้ายปุ่มกู้ = "นับงวดที่ค้าง" · `installmentActualState` = `auto` (ไม่ใช่ ready/rejected ⇒ `nextSubmittableInstallment` /
  เลนเจ้าของดีลไม่ชวนยื่น) · `installmentActualActionError` submit = `INSTALLMENT_ACTUAL_AFTER_COUNT_REST` (**ข้อเดียวที่ RPC ไม่มี** — ฐานปล่อยผ่านแต่
  trigger นับให้ตอน COMMIT อยู่ดี · กันกระดิ่ง "ยื่นแล้ว" · route ตอบ 409 ผ่าน `actualGateStatus`)
- แบบของใบ: `isInstallmentActualOrder(order)` (ดู `actualMode` ล้วน ไม่ดูสถานะใบ — ด่านรับรองเงินยกเว้นใบยกเลิกที่ `installmentActualPaymentGated`) · `actualModeOf` · `actualModeEligibility(order, count|rows)`
- ยอดของแถวใบ: `salesOrderCountedActual` · `salesOrderSubmittedActual` · `salesOrderRemainingActual` · `salesOrderSubmittedCount`
- ส่วนแบ่ง: `installmentActualShares` · `installmentActualShareAtApproval` · `installmentActualStartRows` · `installmentActualStartPreview`
- เดือน/เหตุการณ์: `installmentActualInstant` · `installmentActualMonth` · `salesOrderActualEvents(order, rows)` (`[{month, amount, at, installmentId, seq}]` · ไม่ส่งงวด = เหตุการณ์เดียวที่เดือนอนุมัติใบ) · `installmentRemainingByDue`
- สถานะ/ด่าน: `installmentActualState` · `nextSubmittableInstallment` (ใบมีงวดไม่ตรึง = null) · `installmentActualProgress` (x/y) · `installmentActualActionError` (ลำดับเดียวกับ RPC ·
  submit/approve บนใบที่มีงวดไม่ตรึง = `INSTALLMENT_ACTUAL_UNFROZEN` — `installmentActualUnfrozen(rows)` · แถวที่ไม่พกคอลัมน์ `frozenAt` = ถือว่าตรึง · รอบรีวิวสี่) ·
  `countRestBlocker` (ใบยังไม่มีงวด = `COUNT_REST_NO_ROWS` "เริ่มติดตามการชำระ ก่อน แล้ว นับงวด 1" — ไม่ใช่ "นับครบแล้ว") · `installmentActualReasonError` ·
  `installmentActualPaymentGated` (ด่านเงิน · ใบที่ส่งมามีสถานะ `cancelled` = ไม่ติด) ·
  `installmentActualLockReason(row, order, {countRestDone})` (เหตุของปุ่มบัญชีที่ดับ ตามสถานะการนับ: ยื่นแล้ว = รอ AE Sup · ยังไม่ยื่น/ตีกลับ = รอฝ่ายขายยื่น ·
  ใบที่กดนับที่เหลือทั้งหมดแล้ว (`installmentActualCountRestDone`) = นับให้เอง ไม่ต้องยื่น · ค้าง = AE Sup กด "นับงวดที่ค้าง" (มติข้อ 10 แทนคำ "กดซ้ำ" ของรอบสาม) ·
  ใบที่ย้อนอนุมัติ (`order.status` หรือ `row.orderStatus`) = `INSTALLMENT_ACTUAL_REVOKED_LOCK` "รอเจ้าของดีลออก Rev." — ยื่น/อนุมัติบนใบนั้นไม่ได้แล้ว) ·
  `installmentActualStartPending(rows)` (งวดที่ขั้นนับตอนอนุมัติยังค้าง = `installmentActualStartRows` ลบงวดที่ยกเงินเข้ามา) · `installmentActualStartButtonLabel`
  ("นับงวด 1" / "นับงวดที่ค้าง") ·
  `INSTALLMENT_ACTUAL_PREVIOUS_UNCONFIRMED` · `INSTALLMENT_ACTUAL_REPORT_BLOCKED` (ด่านแจ้งสลิป — JS อย่างเดียว) ·
  `INSTALLMENT_ACTUAL_CONFIRM_BLOCKED` · `INSTALLMENT_ACTUAL_SELF_APPROVAL` · `installmentActualReportWaitReason(row, ownerName, {countRestDone})`
  (เหตุของฝ่ายขายที่แจ้งสลิปยังไม่ได้ — รอบรีวิวสาม)
- เลนรอฉันลงมือ: `installmentActualAwaitingReview` (ผู้อนุมัติ = role ผู้อนุมัติ **หรือ** `reviewer` ที่ผู้เรียกส่ง · ไม่นับงวดของตัวเอง ยกเว้น admin ·
  เฉพาะงวดที่งวดก่อนหน้ารับรองเงินครบ = อนุมัติได้ตอนนี้) ·
  `installmentActualReadyForOwner(order, rows, { userId, thisMonth })` (เจ้าของดีลปัจจุบัน · งวดถัดไปที่ยื่นได้และถึงเดือนครบกำหนด/ไม่มีวันครบกำหนด/ถูกตีกลับ)

**ตัวอ่าน cache ของดีล — `dashboardMetrics.js`:** `actualByMonthOf` · `actualInMonths` · `installmentPendingAmountOf/CountOf` ·
`installmentRemainingByMonthOf(deal, thisMonth)` (พับ `none`/เดือนที่ผ่านมาเข้าเดือนปัจจุบัน) · `installmentRemainingAmountOf` · `dealClosedValueOf` (Actual + ยื่นแล้ว + รอนับรายงวด) ·
`INSTALLMENT_REMAINING_LABEL = 'รอนับรายงวด'` · `pendingApprovalAmountOf/CountOf` รวมงวดที่ยื่นแล้ว (ผ่าน `dealPendingApprovalAmount/Count` ของ `salesOrderWorkflow` —
ดีล หน้าโครงการ ตาราง SO ได้กองเดียวกัน) · ยามใน `historicalMoneyGuards.test.mjs` (`DEAL_KPI_FROM_METRICS`) ครอบตัวอ่านใหม่ทุกตัว

**`salesOrderWorkflow.js`:** `salesOrderActual` = `salesOrderCountedActual` · `splitSalesOrderAmounts` คืน `{ actual, actualCount, pendingApproval, pendingApprovalCount, instRemaining,
pendingOrderCount, pendingOrderAmount, instPendingCount, instPendingAmount }` เสมอ (รอบรีวิวสาม: `pendingApprovalCount` = **ใบ** · ใบรายงวดที่มีงวดยื่นนับ 1 ·
`pendingOrder*` = ใบ `pending_approval` ล้วน — การ์ด/หัวกลุ่มของทะเบียน SO · `instPending*` = **งวด** ที่ยื่นอยู่ · `pendingApproval = pendingOrderAmount + instPendingAmount`) ·
`isInstallmentActualWaitingOnMe` · `isSalesOrderWaitingOnMe({…, actualInstallments})` · `salesOrderIdsWaitingOnMe({…, actualRows, actualInstallmentsOf})`
- ⚠️ แถวใบไม่มีคอลัมน์จำนวนงวดที่ยื่น — `instPendingCount` ของใบรายงวดอ่าน `order.installments` → `order.actualSubmittedCount` (list route คิดให้) → 1 ถ้ามียอดยื่น

**`salesOrderPayments.js`:** `installmentActionError` มี `actual_submit` / `actual_withdraw` / `actual_approve` / `actual_reject` (ส่งต่อ `installmentActualActionError`) ·
options ใหม่ `order` (หรือ `actualMode`) · `dealOwnerId` · ใบรายงวด: บัญชีรับรอง และบันทึกรับชำระขั้นเดียว ติดด่านจนงวดอนุมัติ · ฝ่ายขายแจ้งสลิปได้หลังงวดอนุมัติ ·
งวดที่แจ้ง/จ่ายไว้แล้วไม่ถอย · `paymentRollup` ยังไม่มีคีย์ actual/won และไฟล์ยังไม่ export ชื่อ `actual*` (เทสต์ล็อก)

**ฝั่ง route — `salesOrderActualRoute.js`** (ใช้ฝั่ง client ได้): `parseActualModeInput` · `installmentCountAtFreeze(existing, {plan, totalAmount})` (คู่กับทุกกิ่งของ `freezeInstallments` —
หน้าใบก็ใช้ตัวนี้ตัดสินสิทธิ์เลือก) · `actualModeApproveBlock` · `previousActualModeOf` · `actualStartBlocker` · `actualGateStatus` · `installmentActualCounted` ·
`installmentActualStartRecovery(rows)` (RPC start ล้ม → อ่านงวดสดแล้วตัดสิน: ไม่เหลือให้นับ = สำเร็จ · เหลือ = ล้ม + `alreadyCounted`) · `revokeActualDropText` (ท้ายสรุป audit
ย้อนอนุมัติ: ใบรายงวด = "รายงวด นับแล้ว ฿x จาก ฿y") · ข้อความ audit สามตัว

**ปรับแผน — `installmentReplan.js` (มติข้อ 9):** `installmentReplanCounted(row)` (นับแล้ว + ไม่ล็อก = แถวเปิดที่ลบไม่ได้) · `REPLAN_COUNTED_LABEL`
"นับ Actual แล้ว — ปรับยอด/วันได้ ลบไม่ได้" · `buildReplanRows` ตอบ error "งวดที่ n นับ Actual แล้ว — ลบออกจากแผนไม่ได้ (ปรับยอด/วันได้)" เมื่อร่างไม่มีงวดนั้น ·
`view[].counted` · `replanChangeLine` ต่อท้าย "นับ Actual แล้ว — ยอด Actual คงเดิม" · `installmentReplanBlocker` บอก "…หรือยื่น/นับ Actual แล้ว" เมื่อทุกงวดล็อกและมีงวดที่ติดเพราะ
ยื่นขอนับ/นับแล้วยอด 0 · `remainderOrphanedCents(order, rows, finalIds, {countedIds})` + `remainderOrphanedText` (รอบรีวิวสาม · คู่กับ W1/C2o) — `buildReplanRows` ตอบ
"Actual ของใบยังนับไม่ครบ ฿x — แผนต้องเหลืองวดที่ยังไม่นับ Actual อย่างน้อย 1 งวด…" ·
`autoCountLine(order, rows, finalIds, {countedIds, noun})` (มติข้อ 10 — ใบที่กดนับที่เหลือทั้งหมดแล้ว: "…งวดที่เพิ่ม n งวดนับ Actual ให้อัตโนมัติตอนบันทึก
ไม่ต้องยื่น" + ส่วนแบ่ง (ปกติ ฿0 · ยังนับไม่ครบ = ยอดที่เหลือเข้าเดือนนี้) · ไม่มีงวดใหม่ = บอกกติกาของใบ · ใบอื่น = '') → `replanPromptFacts.actualAutoCountLine` →
`paymentPlanEditPrompt` (มีค่า = ไม่พูดกติกายื่น/อนุมัติรายงวดของงวดที่ยังไม่นับ)

**ยกเงินเข้าใบรายงวด — `installmentCarry.js`:** `carryConsumableRow` (งวด `so_approval` ยอด > 0 ที่ไม่มีเงิน/เอกสาร) · `applyCarryIn` หักสองรอบ (ดู "ค่าตั้งต้น" ข้างบน) ·
คืน `actualMoved: {fromSeqs, toId, toSeq, amount}` · `view[].counted` · แยกเหตุยกเกิน: เงินเกินจริง = ทางคืนเงินเดิม · ติดงวดที่ยื่นอยู่/นับแล้วลบไม่ได้ =
"เกินยอดที่ใบนี้ยังรับได้ ฿x — `CARRY_COUNTED_LOCKED`" · `carryPromptFacts.actualMovedLine` → โมดัลยืนยัน ·
ยกแล้วไม่เหลืองวดที่ยังไม่นับทั้งที่ Actual ยังนับไม่ครบ (แถวที่ยกแถวเดียวครอบทุกงวด — รอบรีวิวสาม) = error บอกยอด + `CARRY_REMAINDER_WAY_OUT` (ทาง Rev. แบบทั้งใบ ·
ไม่แนะนำ "กดนับที่เหลือทั้งหมดแล้วยก" — ไม่ใช่ทางออก) · มติข้อ 10: `carryPromptFacts.actualAutoCountLine` (`autoCountLine` noun "งวดที่ยกมา" · ไม่นับแถวที่รับ
Actual ของงวดที่ถูกแทน) → `paymentCarryPrompt` แทนคำ "งวดที่ยกมาต้องยื่นขอนับ…อีกรอบ"

**API**
- `PATCH /api/sales-planning/sales-orders/[id]` `{action:'approve', actualMode?}` — ไม่ส่ง/ว่าง = `'order'` · ค่าอื่น 400 `actual_mode_invalid` · ไม่ผ่านสิทธิ์ 409 `actual_mode_ineligible` ·
  หลัง `freezeInstallments` ถ้าใบเป็นรายงวด เรียก start RPC (ส่ง `p_counted_at` = `approvedAt` ที่ตัวห่อคืน) · สำเร็จ 200 `{...แถว, installmentActualCounted?: {count, amount, seqs}, installmentActualStartFailed?: true,
  installmentActualNoRows?: true, installmentActualAlreadyCounted?: true, termsOpened}` — RPC **throw** = อ่านงวดสด (`installmentActualStartRecovery`): ไม่เหลือให้นับ = สำเร็จนับ 0 ·
  เหลือ = ล้ม (+ `installmentActualAlreadyCounted` เมื่อมีงวดนับแล้ว ⇒ จอบอกปุ่ม "นับงวดที่ค้าง") · อ่านไม่ขึ้น = ล้ม ·
  `installmentActualStartFailed` (RPC ไม่ throw) = **หลังขั้นนี้ไม่มีงวดไหนนับเลย** (ตัดสินจาก `after` ด้วย
  `installmentActualStartOutcome` ไม่ใช่ count: ใบ Rev. ที่งวด 1 นับมาแล้วนับ 0 ได้ตามจริง) · `installmentActualNoRows` = ใบยังไม่มีงวด (จอบอก
  "เริ่มติดตามการชำระ" ก่อน "นับงวด 1")
  (ขั้นนับล้ม ≠ อนุมัติล้ม · แถวที่คืนเป็นภาพก่อนนับงวด — จอโหลดใบใหม่หลังอนุมัติทุกครั้ง) · audit ต่อท้ายแบบการนับเสมอ · เธรดดีลบรรทัด `actual_start` เมื่อนับได้ ≥ 1 งวด
  · **ตัวหยุดยอดล้ม (รอบรีวิวสาม)** บนใบรายงวด = **ไม่ยิง start RPC** · ตัดสินจากงวดสด (`installmentActualStartRecovery` + มีงวดที่ยังไม่ตรึง = ล้ม) ·
  ตอบ `installmentFreezeFailed: true` คู่กับ `installmentActualStartFailed` (จอทัก "ตรึงงวดชำระไม่ครบ — กด ‘นับงวด 1’/‘นับงวดที่ค้าง’ (ตรึงแล้วนับ)")
- action `actual_start` (ทางกู้ "นับงวด 1") · `actual_count_rest` (`{reason}`) → 200 `{action, counted, countedAmount, countedSeqs, frozeInstallments?, installments}` ·
  **ทั้งสองคำสั่ง** ตรึงงวดที่ยังไม่ตรึงก่อนยิง RPC (`freezeInstallments` + `confirmationBorrowable` ตัวเดียวกับการอนุมัติ · หลังด่านสิทธิ์/เหตุผล — รอบรีวิวสี่) · ตรึงล้ม = 500 ·
  ตรึงจริง = `frozeInstallments: true` (จอทัก "ตรึงงวดชำระแล้ว" แม้นับ 0)
  `INSTALLMENT_ACTUAL_FREEZE_FAILED` ไม่นับ · จอบอกผลจาก `counted`/`countedSeqs` ("นับ Actual งวด 3 แล้ว" · นับ 0 = "ไม่มีงวดค้างให้นับ")
- `POST …/[id]/installments` ("เริ่มติดตามการชำระ") บนใบ **ที่อนุมัติแล้ว** = `freezeInstallments` (ตรึงทันที · ยืมสลิปตามกติกา MONEY-1) — ใบร่าง/รออนุมัติ = งวดร่างตามเดิม
- GET ใบ: `previousActualMode` (`'order' | 'installment' | null`)
- `PATCH /api/sales-planning/sales-orders/[id]/installments` `{action: 'actual_submit'|'actual_withdraw'|'actual_approve'|'actual_reject', installmentId, reason?, expectedUpdatedAt?}` —
  ข้อมูลเก่า → `installmentActionError` (ตัวเดียวกับแผง) → RPC (CAS) → audit + เธรดดีล + กระดิ่ง → 200 `{installment, installments}` · สถานะ HTTP ของด่าน JS = ของรหัสในฐาน
- ทะเบียน SO: `loadListInstallments` เลือก `id, seq, status, "actualStatus", "actualSubmittedById", "actualApprovedVia"` (`actualApprovedVia` = สัญญาณมติข้อ 10 ·
  ก่อนรัน 0412 = 42703 ถอยเป็นชุดของ 0378) · `_waitingOnMe` ส่ง `actualInstallments` ·
  `_awaitingMyApproval` OR `installmentActualAwaitingReview` · แถวรายงวดพก `actualSubmittedCount` · `_installmentReadyForMe` (เลนเจ้าของดีล — `installmentActualReadyForOwner`) ⇒ จอพาแถวไป `?tab=payment`
- ป้ายบนเมนู (`nav/counts`): งวดรออนุมัติอยู่ใน **ป้าย `salesOrders` เดิม** (เลนผู้อนุมัติ + เลนเจ้าของดีล) ไม่มีคีย์ใหม่ · งวดของเลนเลือก
  `id, "salesOrderId", seq, status, "dueDate", "actualStatus", "actualSubmittedById", "actualApprovedVia"` (ขาด `dueDate` = เลนเจ้าของดีลนับงวดที่ยังไม่ถึงกำหนด ·
  ขาด `actualApprovedVia` = เลนเจ้าของดีลชี้งวดของใบที่กดนับที่เหลือทั้งหมดแล้ว ซึ่งยื่นไม่ได้ — มติข้อ 10) ·
  `payments` = งวด `reported` ทั้งหมด − งวด `reported` ของใบรายงวดที่ **ไม่ได้ยกเลิก** และยังไม่อนุมัตินับ
- ทะเบียนการชำระ (FN): แถวพก `actualMode` · `actualStatus` · `actualAmount` · `actualApprovedAt` · `actualAwaitingApproval` · คิว "รอคุณรับรอง" / ตัวนับก้อนใบ / ป้าย ใช้ `ledgerAwaitsConfirm`
  (ไม่รวมงวดที่ติดด่าน) · การ์ด "รอบัญชีรับรอง" ยังนับตามสถานะ (เลขบนการ์ด = แถวที่เห็นหลังกด · M10b) · `ledgerRowLock(row, 'confirm'|'report')` บอกเหตุ
- select ที่พก `"actualMode", "actualCountedAmount", "actualSubmittedAmount"`: ใบเสนอราคา (การ์ด SO) · โครงการ · ทะเบียน SO/ดีล (`*`) · ทะเบียนการชำระ (`"actualMode"`)

**กระดิ่ง (`lib/sales/installmentActualNotify.js` · `SALES_ORDER_BELL_KINDS`)**
- `sales_order_installment_actual_submitted` → AE Sup ที่บัญชีเปิดอยู่ **นอกจากผู้ยื่น** (`SALES_BELL_ROLES` · ไม่เหลือใคร = admin · CD/CM ไม่รับตามมติ 24/09 ข้อ 6)
- `sales_order_installment_actual_approved` / `_rejected` → ผู้ยื่นของรอบนั้น + เจ้าของดีลปัจจุบัน (คนที่แจ้งสลิป/ยื่นใหม่ต่อ)
- ดึงคำขอกลับไม่แจ้ง · กันแจ้งตัวเอง · กุญแจกันซ้ำรายรอบ · ตาราง §1 ของ [notifications-inbox.md](notifications-inbox.md)

**จอ**
- หน้าใบ: โมดัลอนุมัติ + Admin Override มีแผ่นสองแผ่น (`ActualModeChoice` บน `OptionTiles`) · รายงวดเลือกไม่ได้ = แผ่นจาง + เหตุเป็นตัวหนังสือ ·
  Rev. ของใบที่กดนับที่เหลือทั้งหมด (มติข้อ 10 · `approveActualPlan().countRestDone`) = บรรทัด "ใบนี้นับทั้งก้อนต่อ…ไม่ต้องยื่น" แทนกติกายื่นรายงวด ·
  ค่าเริ่ม ทั้งใบ / Rev. = `previousActualMode` · ผลลัพธ์และปุ่มเปลี่ยนตามแผ่น (ป้ายของแผ่นรายงวดคิดจากงวดที่ขั้นนับจะนับจริง — `approveInstallmentConfirmLabel`:
  "อนุมัติและนับ Actual งวด n" · "…n งวด" · ไม่มีงวดใหม่ = "อนุมัติ (นับ Actual รายงวด)" · มติข้อ 10 = "…ที่ค้างทั้งหมด" · Override พูดตรงกัน — UAT 27/10) ·
  แผ่นอยู่ระหว่างคำถามกับรายการผลลัพธ์ (`lead` ของ `ConfirmDialog` · กล่องยึดขอบบน) ⇒ สลับแผ่นแล้วแผ่นไม่เลื่อน · ทักเตือนเมื่อ `installmentActualStartFailed` ·
  รางขั้น "นับ Actual" x/y งวด (ยังนับไม่ครบ = ขั้นนี้ยัง "กำลังทำ" ไม่ ✓ · คู่ขนานกับขั้นบัญชีปิดใบ) · การ์ดสรุป นับแล้ว/เต็มใบ + รออนุมัติ + รอนับรายงวด ·
  โมดัลย้อนอนุมัติบอกยอดที่นับแล้วที่หลุด (audit ด้วย — `revokeActualDropText`) · โมดัลอนุมัติแบบรายงวดบอกด้วยว่างวดที่ยังไม่นับแจ้งสลิป/รับรองเงินได้หลัง AE Sup อนุมัติงวดนั้น
  (+ ใบงานบริการ: "จ่ายถึง"/นัดช่างเดินตามสองขั้นนั้นทุกงวด) · เจ้าของดีลที่มีงวดยื่นได้ตอนนี้ (`nextSubmittableInstallment`) เห็นคำอธิบายสถานะ
  "งวดที่ n ยื่นขอนับได้แล้ว ที่แท็บการชำระ" (ไม่มีป้ายตัวเลขบนแท็บ — ป้ายแท็บมาจากข้อหลังกดยื่นเท่านั้น) · ทักเตือนขั้นนับล้มแยกสามแบบ (ไม่มีงวด · ยังไม่นับอะไร · นับไปบางงวดแล้ว) ·
  สภาพพิเศษ (ยังไม่มีงวด · งวดไม่ตรึง · นับครบ · ใบนับทั้งก้อนที่มีงวดค้าง) = ขั้นถัดไปจาก `installmentActualNextStep` (คำเดียวกับบรรทัดสรุปของการ์ดการชำระ · UAT 27/10) ·
  การ์ดสรุปแถว "Actual ก่อน VAT" ของใบรายงวดเรียงซ้อน (`stack` ของ `DocumentSummaryCard`) + คู่ "ป้าย ฿ยอด" ห่อ `keepPhrases`
- แผงงวด: ชิปสถานะ Actual ต่อแถว · "ยื่นขอนับงวดนี้" · "อนุมัติงวด" (ป้ายในแถว `INSTALLMENT_ACTUAL_APPROVE_ROW_LABEL` — หัว/ปุ่มยืนยันของโมดัล = "อนุมัติงวดและนับ Actual" · UAT 27/10)
  (โมดัลไม่สัญญางวดถัดไปเมื่อไม่มี/ยื่นแล้ว · ไม่บอกให้แจ้งสลิปซ้ำเมื่อแจ้งไว้แล้ว) · ช่องปุ่มของแถวตรึงขอบขวาของกล่องเลื่อน (จอ > 640) ·
  เมนู ⋯ "ดึงคำขอกลับ" / "ตีกลับงวด" · "นับงวด 1" / "นับงวดที่ค้าง" (ทางกู้ — โชว์เมื่อ `installmentActualStartPending` ไม่ว่าง **หรือใบมีงวดยังไม่ตรึง** (รอบรีวิวสี่ · ไม่มีงวดค้าง = โมดัล "ตรึงงวดชำระ")) · "นับที่เหลือทั้งหมด" ·
  งวดยังไม่ตรึง = "ยื่นขอนับงวดนี้"/"อนุมัติงวด" ดับ + เหตุ `INSTALLMENT_ACTUAL_UNFROZEN` · หัวการ์ด/ประกาศ/บรรทัดสรุปบอกปุ่มกู้ (ไม่ใช่คำของงวดร่าง · UAT 27/10) ·
  โมดัลยื่น/อนุมัติอ่าน `slipStatus` (รับรองแล้ว ≠ แจ้งไว้แล้ว) ·
  โมดัลถอนคำรับรองของใบรายงวดบอกงวดถัดไปที่ติด (`installmentUnconfirmOutcome(…, { order })`) ·
  ใบที่ย้อนอนุมัติ: ฝ่ายขายเห็น "แจ้งลูกค้าจ่ายแล้ว" ดับ + เหตุ "ออก Rev." · โมดัลรับรองของใบยกเลิก/ย้อนอนุมัติ: แถว "นับ Actual" = "ไม่นับ — …" (ตรงกับผลลัพธ์) ·
  ปุ่มรับรองของบัญชีโชว์แต่ดับพร้อมเหตุ (ตามสถานะการนับ — `installmentActualLockReason`) · ปุ่มอนุมัติงวดดับ + เหตุเมื่องวดก่อนหน้าถูกถอนคำรับรอง ·
  (รอบรีวิวสาม) ผู้อนุมัติเปิดงวดที่ตัวเองยื่น = ปุ่มอนุมัติดับ + เหตุ `INSTALLMENT_ACTUAL_SELF_APPROVAL` · ฝ่ายขายที่ไม่ใช่เจ้าของดีล/ผู้อนุมัติ (AC · AE อื่น) =
  "แจ้งลูกค้าจ่ายแล้ว" ดับ + เหตุ `installmentActualReportWaitReason` (รอเจ้าของดีลยื่น → AE Sup อนุมัติ) · โมดัลยื่นไม่บอกให้แจ้งสลิปซ้ำเมื่อแจ้งไว้แล้ว และบอกผู้อนุมัติ
  ที่ยื่นเองว่าอนุมัติเองไม่ได้ · โมดัล "นับงวด 1/นับงวดที่ค้าง" หัวตามงวดที่นับ + บอกการตรึงเมื่องวดยังไม่ตรึง ·
  (มติข้อ 10) ใบที่กดนับที่เหลือทั้งหมดแล้ว: งวดที่ฐานนับให้เองขึ้น "นับอัตโนมัติ" (`installmentActualAutoCounted`) · งวดที่ยังค้าง (start ของ Rev. ยังไม่จบ) ชิป
  "รอนับอัตโนมัติ" · ไม่มีปุ่มยื่น · เหตุของปุ่มที่ดับ = `INSTALLMENT_ACTUAL_AFTER_COUNT_REST` (ชี้ปุ่ม "นับงวดที่ค้าง") · บรรทัดสรุป = "…นับให้อัตโนมัติ…" ·
  คำนำโมดัลปรับแผน/ยกเงินบอกว่างวดที่เพิ่ม/ยกมานับให้อัตโนมัติ · โมดัลนับที่เหลือทั้งหมดบอกว่ากดแล้วนับทั้งก้อนถาวร (รวม Rev. แบบรายงวด) ·
  บรรทัดสรุปบอก "นับ Actual ครบทุกงวดแล้ว" เมื่อครบ (ปุ่ม "นับที่เหลือทั้งหมด" ทักโทนแจ้ง — `countRestBlocker().kind = 'info'`) · โมดัลรับรองพูด "ยื่นงวดถัดไปได้" เฉพาะเมื่องวดถัดไปยังไม่ยื่น/ถูกตีกลับ · ทุกปุ่มถาม `installmentActionError` ตัวเดียวกับ API · โมดัลปรับแผน/ยกเงินพูดยอดที่นับแล้วแทน "ยอดเต็ม เดือนอนุมัติใบ"
- ตัวแก้ปรับแผน (มติข้อ 9 · `QuotationInstallments` โหมด replan): งวดที่นับแล้วแก้ได้เหมือนแถวเปิด + ป้าย "นับ Actual แล้ว — ปรับยอด/วันได้ ลบไม่ได้" ·
  ปุ่มลบอยู่ที่เดิม กดแล้วบอกเหตุ (`GatedAction`) · คำนำโมดัลของใบรายงวดบอกกติกาเดียวกัน · ตารางก่อน/หลังของโมดัลยกเงินต่อป้ายเดียวกันท้ายสัดส่วน ·
  โมดัลยืนยันปรับแผน: "งวดที่นับแล้วปรับยอด/วันได้แต่ Actual ที่นับไว้คงเดิม · งวดที่ยื่นขอนับอยู่ไม่ถูกแตะ"
- ทะเบียน SO: แถวคิว "งวดรออนุมัติ · SO-…" บอกยอดงวดที่ยื่น (`actualSubmittedAmount`) ไม่ใช่ยอดเต็มใบ · ลิงก์ไป `?tab=payment` (แถวเลนเจ้าของดีลด้วย — คิวและตารางหลัก) ·
  แถวใบรายงวดที่อนุมัติแล้วมีบรรทัดรองใต้ยอด "Actual รายงวด · นับแล้ว ฿x · รออนุมัติ ฿y · รอนับรายงวด ฿z" (หัวกลุ่ม/การ์ดนับเฉพาะที่นับแล้ว · ค้นเจอ)
  — ตัวกลาง `installmentActualSubLine` ของ `dealAmountDisplay.js` · **ตาราง SO หน้าดีลและหน้าโครงการใช้ตัวเดียวกัน** (ยอดเต็มของใบ + บรรทัดรอง)
  · วาดผ่าน `InstallmentActualSubLine` (ท่อน `installmentActualSubParts` ห่อ `keepPhrases` · หน้าดีล = `compact` ขนาดหมายเหตุรอง · UAT 27/10)
- การ์ด SO บนหน้าใบเสนอราคา: "Actual รายงวด · นับแล้ว ฿x จาก ฿y ก่อน VAT"
- โมดัลงานบริการ (อนุมัติย้อนหลัง/เปิดแก้): บรรทัด "ไม่แตะ Actual" ของใบรายงวดบอกยอดที่นับแล้วจากยอดเต็ม
- ทะเบียนการชำระ: แถบบอกงวดที่ติดด่านรายงวด แยก "รอ AE Sup อนุมัติ n งวด" (ยื่นแล้ว) กับ "รอฝ่ายขายยื่นขอนับ m งวด" (ยังไม่ยื่น/ตีกลับ — รอบรีวิวสาม)
  (+ จำนวนงวดของใบที่ย้อนอนุมัติ — รอออก Rev.) · แถวคิวบอกเหตุ (ตามสถานะการนับ · ใบย้อนอนุมัติ = ออก Rev.) · `ledgerRowLock` = `installmentActualLockReason` ตัวเดียวกัน
- ทะเบียน SO การ์ด "รอตรวจอนุมัติ" = ใบ `pending_approval` ล้วน (`pendingOrder*`) + หมายเหตุ "งวดรออนุมัติ ฿y (m งวด · ใบอนุมัติแล้ว)" · หัวกลุ่ม "· n ใบ" นับใบ
  (การ์ด: หมายเหตุสั้น "งวดรออนุมัติ ฿y (m งวด)" + `title` ประโยคเต็ม — `pendingCardNoteOf` · UAT 27/10)
- หน้าดีล การ์ด Won: คำชนิด INSTALLMENT = "นับแล้ว ฿A · รอนับรายงวด ฿R" — "รออนุมัติ ฿P" อยู่บรรทัด `<PendingApprovalAmount>` ของการ์ดอย่างเดียว (ไม่ซ้ำ)

**ผู้อ่าน Actual (แดชบอร์ดและรายงาน)**
- กองใหม่บนแท็บผลงานขาย: คีย์ `instRemaining` + `instRemainingCount` (จำนวนดีล) + `instRemainingDealIds` (id ดีลของเดือน — ช่วงไตรมาส/ทั้งปีนับดีลไม่ซ้ำ ·
  payload เก่าไม่มีช่องนี้ = บวกจำนวนรายเดือนตามเดิม) ป้าย "รอนับรายงวด" · เข้า `projected` · ไม่เข้า Actual / % เป้า / ขาด-เกิน / `sales_history`
  (ถัง totals · byOwner · byTeam · byType · ลิ้นชัก metric `instRemaining` · แดชบอร์ดของฉัน: บรรทัด `InstRemainingAmount` ใต้รออนุมัติในหมายเหตุของ "ยอดปิดได้" —
  รอบรีวิวสาม · ไม่แตะ Actual/ขาดอีก/%)
  ⚠️ `DEAL_COLUMNS` ของ `/api/sales-planning/dashboard` ต้องมี `id` (กุญแจของ `instRemainingDealIds`) — ยามใน `performanceMath.test.mjs` สร้างดีลจากคอลัมน์ที่ route เลือกจริง
- Actual ของเดือน = `actualByMonth[เดือน]` ของทุกดีล Won (รอบแยก ไม่ขี่ลูป Won) — `wonCount` / FC Total / Won รอยื่น SO ยังอยู่ที่ `wonMonth` ·
  ตัวรวม `lib/sales/actualMonthRollup.js` · ประวัติยอด/ตัวช่วยวางเป้า `lib/sales/systemActuals.js` (ยอดลงปี/เดือนตามแผนที่ ไม่ใช่ wonValue ทั้งก้อน)
- `wonVariance` ของแดชบอร์ด = FC − ยอดปิดเต็มของดีลที่ Won เดือนนั้น (ไม่มีจอไหนอ่าน)
- รายงานยอดขาย: ใบรายงวดแตกแถวตาม (ใบ, เดือนที่นับ) — ยอด/รวม/VAT/เก็บแล้ว/ค้าง/จำนวนงวด คิดเฉพาะงวดของแถว · ส่วนลด/จำนวนบรรทัดเป็นของทั้งใบ ·
  แถวรายงวดมีคีย์ `actualMode` · `rowKey` · `actualAt` · `installmentSeqs` · ส่วน "รออนุมัติ" รวมงวดที่ยื่นแล้ว (เจ้าของ = เจ้าของที่ตรึงตอนอนุมัติใบ + ทีมของดีล) ·
  จำนวนนับ **แถว** (= แถวที่เห็นหลังกด · M10b) แต่ป้ายเรียก "ใบ" เฉพาะเมื่อแถวหนึ่งคือใบหนึ่ง — มีใบเดียวหลายแถว = "n แถว · m ใบ" (`orderRowsLabel` ·
  จอ: ตัวนับแผง · หัวกลุ่ม · แถวรวม · ตัวแบ่งหน้า · คอลัมน์ "ใบ" รายคน/ทีม · แถวรวมตามเดือน · Excel) · เรียง "อนุมัติเมื่อ" ด้วย `actualAt || approvedAt` (เวลาที่ตาเห็น)
- ส่วนต่างคาดการณ์ของดีล Won (คำใต้การ์ดหน้าดีล) ใช้ "ยอดปิดเต็ม" = Actual + ยื่นแล้ว + รอนับรายงวด (ไม่ฟ้อง "ต่าง" จากงวดที่ยังไม่ถึงคิว) ·
  `rollupDeals` ของโครงการคิด `closedValue`/`totalValue`/`variance` ไว้ (ยังไม่มีจอไหนวางสามตัวนี้) · **หน้ารวมโครงการ `/sa/projects` (แถว + การ์ด Actual) และศูนย์รวมดีล
  (การ์ด Actual + แถวดีล) วางกอง "รอนับรายงวด" (`instRemaining` · `instRemainingCount` · `projectDealValue().instRemaining`) เป็นบรรทัดรองใต้ Actual** (รอบรีวิวสี่ · มติข้อ 5 — ไม่บวกเข้า Actual)
- รายงานยอดขาย: VAT ของแถวงวด = ยอดหน้างวดของแถว × (VAT ÷ ยอดรวม VAT ของใบ) — Σ ทุกแถว = VAT ของใบ (คลาดไม่เกินสตางค์) แม้ยอดงวดเปลี่ยนหลังนับ
  (ยก C2b · มติข้อ 9 · งวดนับให้เองส่วนแบ่ง 0 ของมติข้อ 10) — รอบรีวิวสี่ (เดิม = ยอดหน้างวด − ยอดที่นับ หนีบ 0)
- ตัวเลขหลักของดีล Won บนหน้ารายการดีล/การ์ดลีด = Actual ที่นับแล้วทุกเดือนรวมกัน (มุม "ดีลนี้" — ไม่ใช่ Actual ของงวด) · งวดยื่นแล้วเป็นชิปรออนุมัติข้าง ๆ
- การ์ดดีลบนหน้าลีด: route ลีดส่ง `actualByMonth` · `soInstPendingAmount/Count` · `soInstRemainingByDue` มาด้วย

## รอบรีวิว 26/10 (แก้แล้ว · ยามอยู่ในเทสต์ + ฮาร์เนส PGlite ข้อ 15–16)

| เรื่อง | แก้ |
|---|---|
| ตัวหยุดยอดล้มตอนอนุมัติ ⇒ ใบรายงวดไม่มีงวด · RPC start นับ 0 ไม่ error · จอขึ้น "นับงวด 1 แล้ว" · ยอดทั้งใบหายจากทุกกองของดีล | route ตัดสินจาก `after` (`installmentActualStartOutcome`) → `installmentActualStartFailed` + `installmentActualNoRows` · ทักบอก "เริ่มติดตามการชำระ" ก่อน "นับงวด 1" · audit บอกทางกู้ · `_deal_so_actual_extras` ใส่ยอดทั้งใบลง `soInstRemainingByDue.none` (JS คู่ `installmentRemainingByDue`) |
| ใบรายงวดที่ยกเลิก: งวดที่แจ้งสลิปไว้แต่ยังไม่นับ รับรอง/คืนเงินไม่ได้ (ทางตันคืนเงิน 23/09 D4 กลับมา) | trigger ด่านรับรองข้ามใบ `cancelled` · `installmentActualPaymentGated` ใบยกเลิก = false · โมดัลรับรองไม่ดับปุ่ม · ป้าย `payments` ไม่ลบงวดของใบยกเลิก · ใบที่ย้อนอนุมัติยังกันตามเดิม |
| ป้ายเมนูเจ้าของดีลนับงวดที่ยังไม่ถึงกำหนด (select ของ `nav/counts` ไม่มี `dueDate`) | เติม `"dueDate"` · เทสต์พฤติกรรมด้วยแถวรูปเดียวกับ select |
| ผู้อนุมัติเห็นงวดในคิว/ป้ายแต่กดอนุมัติไม่ได้ (บัญชีถอนคำรับรองงวดก่อน) และไม่มีปุ่ม/เหตุ | `installmentActualAwaitingReview` ต้องงวดก่อนหน้ารับรองครบ · แผงโชว์ปุ่ม "อนุมัติงวดและนับ Actual" ดับ + เหตุ · ข้อความ `previous_unconfirmed` ใช้ได้ทั้งยื่น/อนุมัติ |
| AE Sup คนเดียวยื่นงวดเอง ⇒ กระดิ่งไม่ถึงใคร | ตัดผู้ยื่นก่อนตัดสินถอยไป admin |
| "รอนับรายงวด · N ดีล" บวกจำนวนรายเดือน (ดีลเดียวนับหลายครั้งบนไตรมาส/ปี) | `instRemainingDealIds` ต่อเดือน → `windowStat` นับดีลไม่ซ้ำ |
| ข้อความจอ: โมดัลรับรองของบัญชีพูดถึง "ยื่นงวดถัดไป" ทั้งที่ไม่มี/นับแล้ว · เหตุปุ่มบัญชีดับชี้ AE Sup ทั้งที่ยังไม่มีใครยื่น · โมดัลอนุมัติไม่บอกว่าสลิป/รับรอง/ด่านเงินงานบริการรอ AE Sup ทุกงวด · ราง ✓ ทั้งที่ยังนับไม่ครบ · คำ "งวดถัดไป/งวดที่เหลือ" หลังนับครบ · แถวทะเบียน SO ยอดเต็มไม่ตรงหัวกลุ่ม · คิวงวดเปิดแท็บภาพรวม | แก้ตามรายการ — ดูหัวข้อ "จอ" ข้างบน |

## รอบรีวิวสอง 26/10 (แก้แล้ว · ยามอยู่ในเทสต์ + ฮาร์เนส PGlite ข้อ 17–18c)

| เรื่อง | แก้ |
|---|---|
| งวด 1 ที่นับในคลิกอนุมัติลงเวลาของขั้นนับ (ทรานแซกชันถัดไป) — อนุมัติ 23:59:59 สิ้นเดือน งวด 1 ไปเดือนถัดไป | start รับ `p_counted_at` (หนีบใน `[approvedAt, now()]`) · route ส่ง `approvedAt` · ปุ่มกู้ไม่ส่ง = เดือนที่กด |
| ใบรายงวดที่ย้อนอนุมัติ: เหตุของบัญชี/ทะเบียน "รอฝ่ายขายยื่น/AE Sup อนุมัติ" ทั้งที่ยื่น/อนุมัติบนใบนั้นไม่ได้แล้ว · ฝ่ายขายไม่มีปุ่ม/เหตุ | `installmentActualLockReason(row, order)` กิ่งย้อนอนุมัติ = "ออก Rev." · `ledgerRowLock` · แถบทะเบียน · ปุ่มแจ้งชำระดับ + เหตุ |
| "นับที่เหลือทั้งหมด" บอก "นับครบทุกงวดแล้ว" บนใบที่ยังไม่มีงวด (Actual 0) | `countRestBlocker` แยก `COUNT_REST_NO_ROWS` |
| audit ของการย้อนอนุมัติใบรายงวดบอกยอดเต็มหลุด | `revokeActualDropText` (นับแล้ว ฿x จาก ฿y) |
| "รอนับรายงวด · N ดีล" ยังบวกจำนวนรายเดือน — การแก้รอบแรกไม่ถึงจอ (`DEAL_COLUMNS` ไม่มี `id`) | เติม `id` · ยามสร้างดีลจากคอลัมน์ที่ route เลือกจริง |
| ตาราง SO หน้าดีล/โครงการโชว์แค่ยอดที่นับแล้วในคอลัมน์ "ยอดก่อน VAT" | ยอดเต็ม + บรรทัดรอง (`installmentActualSubLine` ตัวกลาง) |
| รายงานยอดขาย: เรียง "อนุมัติเมื่อ" ด้วยวันอนุมัติใบ ทั้งที่แถวงวดโชว์วันที่นับ · ป้าย "n ใบ" นับแถวรายงวด (ใบเดียว 12 ใบ) | เรียงด้วย `actualAt` (ไม่มี = `approvedAt`) · `orderRowsLabel` "n แถว · m ใบ" |
| เจ้าของดีลที่ป้าย/รอฉันลงมือส่งมา ลงภาพรวมที่บอกว่า AE Sup ทำต่อ | `_installmentReadyForMe` → `?tab=payment` · คำอธิบายสถานะบอกงวดที่ยื่นได้ |
| โมดัลรับรองของใบยกเลิก/ย้อนอนุมัติโชว์ "นับ Actual ฿x" / "ยังไม่อนุมัติงวด" ขัดกับผลลัพธ์ | แถวนี้ = "ไม่นับ — ใบยกเลิกแล้ว/ถูกย้อนการอนุมัติ" |
| โมดัลอนุมัติงวดสุดท้ายสัญญา "งวดถัดไปยื่นได้…" · บอกให้แจ้งสลิปงวดที่แจ้งไว้แล้ว | `nextNeedsSubmit` · `slipReported` จากแถวจริง |
| ขั้นนับล้ม (throw) บนใบ Rev. ที่งวด 1 นับแล้ว: ทักให้กด "นับงวด 1" ที่ไม่มีปุ่ม | route อ่านงวดสด (`installmentActualStartRecovery`) · ปุ่มกู้โชว์ตามงวดที่ค้าง ป้าย "นับงวด 1"/"นับงวดที่ค้าง" |
| ยกมัดจำเข้าใบรายงวดที่งวด 1 นับตอนอนุมัติ = งวดมัดจำผีค้าง ขวางการยื่นงวดถัดไป | งวด `so_approval` ที่ยังไม่มีเงินถูกแทนทั้งงวด · Actual ย้ายไปแถวที่ยก (0412 C2 · lib `applyCarryIn`) |
| งวดที่นับแล้วแต่ยังไม่มีเงินถูกนับเป็น "งวดที่มีเงิน" — ยกเงินแนะนำให้คืนเงินลูกค้า · ปรับแผนบอก "รับเงิน/มีเอกสารผูก" | แยกเหตุ + รหัส `installment_carry_counted_locked` · เหตุปรับแผน "…หรือยื่น/นับ Actual แล้ว" (ให้แก้ยอดงวดที่นับแล้วได้ = รอเจ้าของ) |

## มติข้อ 9 · 26/10 (แก้แล้ว · ยามอยู่ในเทสต์ + ฮาร์เนส PGlite ข้อ 10 · 18b–18d · 19–19d)

| เรื่อง | แก้ |
|---|---|
| งวดที่นับแล้วแต่เงินยังไม่เข้า ปรับแผนไม่ได้ (ล็อกเหมือนงวดที่มีเงิน) | ตัวล็อก 8 พารามิเตอร์: นับแล้วยอด > 0 ไม่ล็อก · ยื่นอยู่/นับแล้วยอด 0 ล็อก · JS `installmentReplanLock` ตรงกัน |
| ลบงวดที่นับแล้วได้ถ้าไม่ล็อก | trigger `sales_order_installments_actual_delete_guard` (`installment_actual_counted_row_delete`) · `buildReplanRows` ตอบก่อน · ตัวแก้ไม่ลบให้ (บอกเหตุ) · ลดถึง 0 = row_invalid |
| ยกเงินลดงวดที่นับแล้วไม่ได้ ⇒ `installment_carry_counted_locked` ทั้งที่งวดนั้นรับได้ | `applyCarryIn` รอบ ข ลดงวดที่นับแล้ว (ไม่ถึง 0) · ด่าน C2 ของ RPC นับ 0.01 ต่องวดที่ต้องเหลือ · ข้อความบอกยอดที่ใบยังรับได้ |
| Actual ไม่ขยับเมื่อยอดงวดที่นับแล้วเปลี่ยน | ช่อง Actual ไม่อยู่ในแผน · ยอดประมาณของงวดที่ยังไม่นับคิดจากยอดตรึงของงวดที่นับแล้ว (ไม่แก้ `_so_installment_actual_estimates` / `installmentActualShares`) — นับครบแล้วแบ่งงวด 3 เป็นสองงวด: งวดใหม่ส่วนแบ่ง 0 · Actual/wonValue/actualByMonth เท่าเดิม (ฮาร์เนส 19c — หลังมติข้อ 10 งวดใหม่ของใบที่นับครบด้วยนับที่เหลือทั้งหมดถูกนับให้เอง ส่วนแบ่ง 0) |

## รอบรีวิวสาม 26/10 (แก้แล้ว · ยามอยู่ในเทสต์ + ฮาร์เนส PGlite ข้อ 20–20c · commit แล้ว — "wip: review round 3 fixes")

| เรื่อง | แก้ |
|---|---|
| มติข้อ 9 เปิดทางให้แผน "งวด 1 ที่นับแล้ว = เต็มใบ + ลบงวด 2" ⇒ ทุกงวดนับแล้วแต่ Σ < `actualAmount` · ยอดที่เหลือหายจากทุกกองถาวร · นับที่เหลือบอก "ครบแล้ว" (high) · ยกเงินเต็มใบก้อนเดียวผ่าน C2 ได้ผลเดียวกัน | W1 (แกนเขียนแผน) + C2o (ท้าย C2b) = `installment_actual_remainder_orphaned` · lib `remainderOrphanedCents` ตอบก่อนใน `buildReplanRows`/`applyCarryIn` · ไม่นับยอดที่เหลือให้เอง (มติข้อ 1) — คำถามค้างข้อ 1 |
| ตัวหยุดยอดล้มตอนอนุมัติ ⇒ งวดไม่ตรึง · ทางกู้ "เริ่มติดตามการชำระ" ได้งวดร่าง · นับงวด 1 ไปแล้ว ⇒ แจ้งสลิปค้าง pending · รับรองไม่ได้ · งวด 2 ยื่นไม่ได้ตลอดไป | POST ของใบที่อนุมัติแล้วตรึงทันที · `actual_start` ตรึงก่อนนับ · อนุมัติที่ตรึงล้ม = ไม่นับ + `installmentFreezeFailed` + ทักทางกู้ · `confirmationBorrowable` ตัวกลาง |
| การ์ด "รอตรวจอนุมัติ" (#1922 L11) นับงวดที่ยื่นของใบที่อนุมัติแล้ว แต่กดแล้วกรอง `pending_approval` · หัวกลุ่ม/ทุกจอ "· n ใบ" นับงวด | `pendingOrder*`/`instPending*` · การ์ด/หัวกลุ่ม = ใบ pending ล้วน + หมายเหตุงวดแยก · `pendingApprovalCount` + `soInstPendingCount` (SQL `count(DISTINCT)`) + รายงานยอดขายนับใบ · ฟิกซ์เจอร์ L11/L11c มีใบรายงวดแล้ว |
| หน้าดีลการ์ด Won ขึ้น "รออนุมัติ ฿P" สองบรรทัด | คำ INSTALLMENT ไม่ใส่ P (บรรทัด `PendingApprovalAmount` ของการ์ดเป็นที่เดียว) |
| AC/AE อื่นไม่มีปุ่มแจ้งสลิปและไม่มีเหตุ · ผู้อนุมัติที่ยื่นเองไม่มีปุ่มอนุมัติและไม่มีเหตุ | `salesReportLock` + `installmentActualReportWaitReason` · `approveSelf` + `INSTALLMENT_ACTUAL_SELF_APPROVAL` · โมดัลยื่นบอกผู้อนุมัติว่าอนุมัติเองไม่ได้ |
| แถบทะเบียนการชำระชี้ AE Sup ทุกงวดที่ติดด่าน (รวมงวดที่ยังไม่มีใครยื่น) | แยกนับ ยื่นแล้ว/ยังไม่ยื่น · `ledgerRowLock` = `installmentActualLockReason` |
| ปุ่มกู้ "นับงวดที่ค้าง" เปิดโมดัล "นับ Actual งวดแรก" + ทัก "นับงวดแรกแล้ว" (แม้นับ 0) | หัวโมดัลตามงวด · ทักจาก `counted`/`countedSeqs` · audit "งวดที่ค้าง" |
| โมดัลยื่น + กระดิ่งอนุมัติบอกให้แจ้งสลิปงวดที่แจ้งไว้แล้ว | `slipReported` ของโมดัลยื่น · กระดิ่งอ่าน `status` ของงวด |
| นับที่เหลือทั้งหมดแล้วงวดที่เพิ่มทีหลังกลับไปเดินรายงวด และเหตุบอก "รอฝ่ายขายยื่น" | ~~เหตุ/บรรทัดสรุปบอกให้ AE Sup กดนับที่เหลือทั้งหมดอีกครั้ง~~ → **แทนด้วยมติข้อ 10** (นับให้เอง · หัวข้อถัดไป) |
| แดชบอร์ดของฉันไม่วาดกอง "รอนับรายงวด" ที่ API ส่งมา | `InstRemainingAmount` ใต้รออนุมัติ (ไม่แตะ Actual/ขาดอีก/%) |
| บรรทัดสถานะของเอกสารนี้/INDEX ล้าสมัย | แก้แล้ว (ด้านบน) |

## มติข้อ 10 · 26/10 (แก้แล้ว · ยามอยู่ในเทสต์ + ฮาร์เนส PGlite ข้อ 0 · 13 · 19c · 21–24 · commit แล้ว — "wip: decision 10 auto-count after count_rest")

> คำตอบของคำถามค้างข้อ 2 เดิม: **"นับให้เอง ไม่ต้องยื่น"**

| เรื่อง | แก้ |
|---|---|
| หลังกดนับที่เหลือทั้งหมด งวดที่โผล่ทีหลัง (ปรับแผนแบ่ง/เพิ่มงวด · ยกเงินเข้า) ต้องยื่น-อนุมัติ (หรือ AE Sup กดซ้ำ) · บัญชีรับรองไม่ได้จนกว่าจะนับ | constraint trigger `sales_order_installments_actual_autocount` (DEFERRABLE INITIALLY DEFERRED) นับให้ตอน COMMIT — via `count_rest` · ส่วนแบ่งตามกติกาเดิม (นับครบแล้ว = 0 ⇒ wonValue/actualByMonth/cache ไม่ขยับ) · บัญชีรับรองได้ทันที (ฮาร์เนส 19c ปรับแผน · 21 ยกเงิน — รวมยกสองแถวที่แถวแรกรับ Actual ของงวดที่ถูกแทน) |
| Rev. ของใบที่กดนับที่เหลือทั้งหมด อนุมัติแบบรายงวด — start นับแค่งวด 1/0 บาท/รับรองแล้ว · งวดอื่นที่ค้างต้องยื่น | start นับทุกงวดที่ยังไม่นับ via `count_rest` เมื่อใบมีงวด via `count_rest` (ฮาร์เนส 22 · JS `installmentActualStartRows` ตรงกัน) |
| ใบที่ไม่เข้าเงื่อนไขต้องไม่ถูกแตะ | ใบที่ไม่เคยกดนับที่เหลือทั้งหมด · ย้อนอนุมัติ · ยกเลิก · ใบทั้งใบ (แม้มีแถวรูป count_rest) · ร่าง Rev. = ไม่นับ (ฮาร์เนส 22–23) |
| ต้อง deferred จริงไหม | probe: ตัวเดียวกันแบบ NOT DEFERRABLE ทำให้ยกเงินเข้าใบที่นับที่เหลือทั้งหมดแล้วล้ม (`installment_actual_counted_row_delete` — นับงวดที่ C2a เพิ่งถอดกลับทันที) · ภายในทรานแซกชันของปรับแผนงวดใหม่ยังไม่นับ (ฮาร์เนส 19c) |
| จอ/โมดัลยังพูด "ยื่นขอนับได้" / "AE Sup กดนับที่เหลือทั้งหมดอีกครั้ง" (รอบสาม) | สถานะ `auto` · ยื่นไม่ได้ (ด่าน JS) · เหตุชี้ "นับงวดที่ค้าง" · บรรทัดสรุป · "นับอัตโนมัติ" บนแถว · โมดัลปรับแผน/ยกเงิน/นับที่เหลือทั้งหมด/อนุมัติ Rev. บอกผลใหม่ · เลนเจ้าของดีลอ่าน `actualApprovedVia` |
| คำถามค้างข้อ 1 (ยกเงินก้อนเดียวครอบทุกงวดที่ยังไม่นับ) | **ค่าตั้งต้นคงเดิม** (ปฏิเสธ — เจ้าของยังไม่ตอบ) · ข้อความรหัส `installment_actual_remainder_orphaned` บอกทางออกของยกเงินด้วย (ย้อนอนุมัติ → Rev. → อนุมัติแบบทั้งใบ → ยกเข้าใบ Rev.) · "กดนับที่เหลือทั้งหมดแล้วยก" ไม่ใช่ทางออก (counted_locked) — ฮาร์เนส 24 พิสูจน์ทั้งสองทาง |

## รอบรีวิวสี่ 26/10 (แก้แล้ว · ยามอยู่ในเทสต์ + ฮาร์เนส PGlite ข้อ 25)

| เรื่อง | แก้ |
|---|---|
| ตัวหยุดยอดล้มตอนอนุมัติ: รอบสามกันแค่ทางกู้ "นับงวด 1" — ยื่น/อนุมัติงวด และ "นับที่เหลือทั้งหมด" ยังนับงวดที่ไม่ตรึงได้ ⇒ แจ้งสลิปค้าง pending · บัญชีรับรองไม่ได้ · งวดถัดไปยื่นไม่ได้ตลอดไป · ปุ่มกู้หายเพราะไม่มีงวดค้างให้นับ | รหัสใหม่ `installment_actual_unfrozen` ใน RPC submit/approve (ก่อนด่านงวดก่อนหน้า) + count_rest (ก่อนนับ) · ด่าน JS ลำดับเดียวกัน (`installmentActualUnfrozen` — แถวที่ไม่พกคอลัมน์ = ถือว่าตรึง) · route `actual_count_rest` ตรึงก่อน RPC เหมือน `actual_start` · ปุ่มกู้โชว์ตราบที่มีงวดไม่ตรึง (ไม่มีงวดค้าง = โมดัล "ตรึงงวดชำระ") · แถวยื่น/อนุมัติดับ + เหตุ · เลนเจ้าของดีล/ป้ายเมนูไม่นับ (`nextSubmittableInstallment` · select พก `frozenAt`) — ฮาร์เนส 25 |
| รายงานยอดขาย/Excel: VAT ของแถวงวด = ยอดหน้างวด − ยอดที่นับ หนีบ 0 ⇒ ยก C2b / ปรับยอดงวดที่นับแล้ว / งวดนับให้เองส่วนแบ่ง 0 ทำ Σ VAT เกินของใบ และแถว ฿0 ทั้งแถวเป็น VAT | VAT ของแถว = ยอดหน้างวด × สัดส่วน VAT ของใบ (`installmentShape`) — แถว ฿0 ยังเป็นแถว (ยอดหน้าใบรวมครบ) |
| หน้ารวมโครงการ + ศูนย์รวมดีลไม่โชว์กอง "รอนับรายงวด" (rollup คิดไว้แต่ไม่มีจออ่าน) ⇒ ใบ 1.2M ที่นับงวด 1 ขึ้น Actual 100,000 เฉย ๆ | `InstRemainingAmount` ใต้ Actual ทั้งแถวและการ์ด (`sumProjectRollups` · `projectDealValue` พก `instRemaining`) |
| มติข้อ 10: อนุมัติ Rev. ของใบที่กดนับที่เหลือทั้งหมด — แผ่นรายงวด/ปุ่มยืนยัน/ทักหลังอนุมัติ/ทักปุ่มกู้ ยังสัญญา "งวดถัดไป ยื่น → AE Sup อนุมัติ" | แผ่นบอก "ไม่ต้องยื่นรายงวด" · ปุ่ม "อนุมัติและนับ Actual ที่ค้างทั้งหมด" · ทักจากงวดที่นับจริง (`installmentActualCounted.seqs`) · ใบนับทั้งก้อน = ไม่พูดถึง AE Sup |
| ยกเงินงวดเดียวเข้าใบที่ติดงวดนับแล้ว: `installment_carry_counted_locked` บอกแค่ "เลือกยกน้อยลง" ซึ่งทำไม่ได้ | ข้อความสองกิ่ง (หลายงวด = ยกน้อยลง · งวดเดียว = ย้อนอนุมัติ → Rev. แบบทั้งใบ → ยกเข้าใบ Rev.) + งวดที่ยื่นอยู่ = ดึงคำขอกลับ/ตีกลับก่อน · lib/ฐาน/เอกสารคำเดียวกัน · ไม่สั่งคืนเงิน |
| โมดัลยื่น/อนุมัติงวดที่บัญชีรับรองแล้ว (ยกมา · C1) บอก "บัญชีรับรองเงินได้หลัง…อนุมัติ" | `slipStatus` (reported/confirmed แยกกัน) — รับรองแล้ว = "งวดนี้บัญชีรับรองเงินแล้ว" · งวดถัดไปยื่นได้ทันที |
| ถอนคำรับรองของใบรายงวดไม่บอกว่างวดถัดไปยื่น/อนุมัตินับไม่ได้จนรับรองใหม่ | `installmentUnconfirmOutcome(…, { order })` เพิ่มบรรทัดตามงวดถัดไปที่ยังไม่นับ (ยื่นแล้ว = AE Sup อนุมัติไม่ได้ · ยังไม่ยื่น = ยื่นไม่ได้) · ใบที่กดนับที่เหลือทั้งหมด/ใบทั้งใบ/งวดถัดไปนับแล้ว = ไม่พูด |
| บรรทัดสถานะของเอกสารนี้/INDEX อ้าง hash ก่อน rebase และบอกว่ามติข้อ 10 ยังไม่ commit | อ้าง commit ด้วยชื่อ · base = "origin/main ณ rebase ล่าสุด" |

## รอบรีวิวห้า 27/10 (แก้แล้ว · ยามอยู่ในเทสต์ + ฮาร์เนส PGlite ข้อ 26–27 · commit แล้ว — "wip: review round 5 fixes" + "wip: review round 5 gates lens fix")

| เรื่อง | แก้ |
|---|---|
| audit ของปรับแผน/ยกเงินเข้าลง `after` ของ RPC ตรง ๆ — ภาพนั้นถ่าย **ก่อน** COMMIT (trigger นับอัตโนมัติของมติข้อ 10 เลื่อนไป COMMIT) ⇒ งวดที่ฐานนับให้ถูกบันทึกว่า "ยังไม่นับ" · ใบ Rev. ที่ยอดสูงขึ้นหลังนับที่เหลือทั้งหมด = ฿10,000 เข้า Actual โดยไม่มีบรรทัดไหนบอก | route อ่านงวดสดหลัง RPC ครั้งเดียว (`loadCommittedInstallments`) แล้วใช้ทั้ง audit (`after.installments` = สถานะที่ commit · ภาพของ RPC เก็บใน `rpcAfter` · อ่านพลาด = ลงภาพของ RPC + `afterSource:'rpc'`) และคำตอบ · งวดที่ฐานนับเองหาด้วย `installmentActualAutoCountedAtCommit` (ตัวนับเดียวกับ start/count_rest) ต่อท้ายสรุป "ระบบนับ Actual อัตโนมัติ (มติข้อ 10) งวดที่ n ฿x" · ปรับแผนที่มียอดนับเอง = "(Actual เปลี่ยนเฉพาะงวดที่ระบบนับอัตโนมัติ)" ไม่ใช่ "ไม่เปลี่ยน" — ฮาร์เนส 26 |
| (ตัวแก้ข้อบน) การอ่านสดเป็นคำขอแยกหลัง COMMIT ⇒ ผู้เขียนคนอื่นที่รอล็อกใบ commit แทรกก่อนอ่านได้ — AE Sup อีกคนกด "อนุมัติงวดและนับ Actual" งวดที่ยื่นค้าง (งวดที่ยื่นล็อกจากปรับแผน updatedAt ไม่ขยับ CAS จึงผ่าน) ⇒ ตัวเทียบนับทุกแถวที่กลายเป็น approved แล้วสรุป audit ยกการอนุมัติของคนให้ "ระบบนับ Actual อัตโนมัติ (มติข้อ 10)" บนใบที่ไม่เคยกดนับที่เหลือทั้งหมด | `installmentActualAutoCountedAtCommit` นับเฉพาะแถวรูปที่ trigger เขียน (`installmentActualAutoCounted`: approved · via count_rest · ข้อความอัตโนมัติ) · ภาพของ RPC ไม่มีงวด via count_rest = ว่างเสมอ (trigger ไม่มีผู้ตัดสิน · คนอื่นสร้างสัญญาณแทรกไม่ได้ขณะ RPC ถือล็อกใบ) · แถวที่คนอื่นเปลี่ยนยังอยู่ครบใน `after.installments` (ผู้อนุมัติตัวจริง) · ที่ยังแยกไม่ได้: "นับงวดที่ค้าง" (start §6② บนใบที่มีงวด via count_rest) เขียนรูปเดียวกับ trigger ทุกช่อง — กดแทรกช่องเดียวกันพอดี สรุปยังยกให้ระบบ (เกิดยาก · ยอดใน after ถูกเสมอ) — ฮาร์เนส 27 |
| Excel รายงานยอดขาย ชีตใบสั่งขาย: แถวรวม "รวม 3 ใบ" ให้ใบรายงวดใบเดียวที่แตกสามแถว (บรรทัดหัวบอก "3 แถว · 1 ใบ") | แถวรวมใช้ `orderRowsLabel` ตัวเดียวกับบรรทัดหัว ("รวม 3 แถว · 1 ใบ") · ใบทั้งใบล้วน = คำเดิม |
| ทักหลังอนุมัติแบบรายงวด: ขั้นนับนับ 0 งวดได้ตามจริง (ใบ Rev. ที่งวดต้น ๆ นับไว้ก่อนย้อน — มติข้อ 7) แต่ทักถอยไป "นับ Actual งวด 1 แล้ว" ตายตัว | ทักประกอบจากงวดที่เพิ่งนับ (`installmentActualCounted.seqs`) + งวดที่เคยนับกลับมาเป็น Actual เดือนนี้ (งวดของใบก่อนกด — ภาพเดียวกับโมดัล) · "งวดถัดไปนับเมื่อ AE Sup อนุมัติแต่ละงวด" เฉพาะเมื่อยังเหลือ · ถอดถ้อยคำ "งวด 1" ตายตัว |
| โมดัลย้อนการอนุมัติของใบรายงวด: "สลิปรอบัญชีตรวจ n งวดยังอยู่ในคิวบัญชีตามปกติ" ทุกงวด — งวดที่ยังไม่นับติดด่านเงินต่อหลังย้อน (ไม่อยู่ในคิว · ปุ่มดับ · trigger ปฏิเสธ) | แบ่งด้วยด่านตัวเดียวกับทะเบียนบัญชี (`installmentActualPaymentGated`): งวดที่นับแล้ว = คำเดิม · งวดที่ยังไม่นับ = "บัญชีรับรองไม่ได้จนเจ้าของดีลออก Rev." · ใบทั้งใบ = คำเดิมทุกตัวอักษร |
| ใบที่ตัวหยุดยอดล้ม (งวดไม่ตรึง): ป้ายงวด 1 "ยื่นขอนับได้" ข้างปุ่มยื่นที่ดับด้วย `installment_actual_unfrozen` | สถานะแสดงใหม่ `unfrozen` "รอ AE Sup ตรึงงวด" (โทนกลาง) เมื่อใบมีงวดไม่ตรึงและงวดนี้ถึงคิว · ยังรองวดก่อน = `waiting` เดิม · เหตุที่ถูกตีกลับยังโชว์ |
| มติข้อ 6 — ใบงานบริการแบบรายงวดที่ข้ามการตั้งงานบริการตอนยื่น (0404) / เปิดแก้หลังอนุมัติ (0396): ทัก "อนุมัติแล้ว · นับ Actual แล้ว" (ทั้งใบ) · คำใต้สถานะ "ยอดถูกนับเป็น Actual แล้ว" ทับคำอธิบายรายงวด (นับแล้ว x/y · งวดที่ยื่นได้) จนงานบริการอนุมัติ | กิ่งรายงวดของทักมาก่อนกิ่งงานบริการ + ต่อท้ายเรื่องงานบริการ (`SERVICE_DEFERRED_TEXT.approvedInstallmentSuffix` · จำนวนโซนที่เปิด) · ใบรายงวดคงคำอธิบายรายงวดแล้วต่อ "— การตั้งงานบริการทีหลัง/การแก้งานบริการ/การตั้งงานบริการย้อนหลังไม่เปลี่ยนยอดที่นับ" · ใบทั้งใบ = ประโยคเดิม |

## UAT จอ 27/10 (dev server แบบอ่านอย่างเดียว · ตัวจำลอง GET · แก้แล้ว · commit แล้ว — "wip: UAT screen fixes (AE Sup pass) + pinned status/action columns")

| เรื่อง | แก้ |
|---|---|
| ใบรายงวดที่อนุมัติแล้วแต่ตรึงงวดไม่สำเร็จ: แผงพูดคำของงวดร่าง ("ยอดยืนยันตอนใบอนุมัติ · ส่งให้บัญชีตรวจเองตอนนั้น") และหัวใบบอก "งวดที่เหลือนับเมื่อ AE Sup อนุมัติแต่ละงวด" | `installmentActualNextStep(order, rows)` (`no_rows` · `unfrozen` · `complete` · `auto` · null = ปกติ) — คำเดียวบนหัวใบและบรรทัดสรุปของการ์ด · แผง: หัวการ์ด "งวดชำระยังไม่ตรึง — รอ AE Sup กด “นับงวด 1”" + ประกาศโทนเตือนแทนคำของงวดร่าง · ประกาศแผนเปลี่ยนบอกจังหวะ "ตอน AE Sup กด …" · **ใบทั้งใบที่ตรึงล้มคงคำเดิม** (ไม่มีปุ่มกู้บนแผงให้ชี้ — ช่องโหว่เดิมของ main ไม่อยู่ในงานนี้) |
| หัวใบหลัง count_rest ที่ยังมีงวดค้าง บอก "งวดที่เหลือนับเมื่อ AE Sup อนุมัติแต่ละงวด" (มติข้อ 10 = ไม่มีการอนุมัติทีละงวด) | สภาพ `auto` = "ใบนี้นับทั้งก้อน … งวดที่ค้างให้ AE Sup กด “นับงวดที่ค้าง”" |
| "ฝ่ายขาย (ชื่อ)แจ้งสลิป" · "รอเจ้าของดีล (ชื่อ)ยื่นขอนับ" ไม่มีวรรค | วรรคหลังวงเล็บชื่อทั้งสองจุด |
| ตารางงวดที่ 1440 เกินกล่อง (ปุ่ม "อนุมัติงวดและนับ Actual") เมนู ⋯ ตกขอบ · ที่ 1280 ช่องปุ่มอยู่นอกจอทั้งช่อง (minWidth 1010 ของตารางที่มีคอลัมน์วันวางบิล — เป็นมาตั้งแต่ main) | ป้ายในแถว "อนุมัติงวด" (ความหมายเต็มอยู่ที่โมดัล + `title`) · ช่องปุ่ม + หัวคอลัมน์ตรึงขอบขวา (`position: sticky` · ทึบ · จอ ≤640 ไม่ตรึง) — ใบทั้งใบได้ด้วย |
| ตาราง SO หน้าดีล: บรรทัดรองดันเลขที่ SO / ป้ายสถานะขาดบรรทัด · "รอนับรายงวด" ขาดกลางคำทุกจอ · การ์ดสรุปหน้าใบป้าย "Actual ก่อน VAT" ขาดสองบรรทัด | เลขที่/ป้ายสถานะ nowrap · คู่ "ป้าย ฿ยอด" ห่อ `keepPhrases` (บรรทัดรองตาราง SO สามจอ · คำใต้การ์ด Won `wonHint.keep` · บรรทัดสรุปของการ์ดการชำระ · การ์ดสรุปหน้าใบ) · ตารางหน้าดีลใช้ `compact` (fs-1) ให้ท่อนกว้างสุดพอดีคอลัมน์ · การ์ดสรุปแถวนี้เรียงซ้อน |
| การ์ด "รอตรวจอนุมัติ" ของทะเบียน SO ตัด "…(1 งวด · ใ…" ไม่มี title | หมายเหตุสั้นลง + `title` ประโยคเต็ม |
| แดชบอร์ดของฉัน: "รอนับรายงวด" ใหญ่กว่าหมายเหตุข้าง ๆ | `InstRemainingAmount` รับ `className` · การ์ดส่ง `.metricInst` (ขนาดเท่าหมายเหตุ) |
| โมดัลอนุมัติ: แผ่นอยู่ใต้รายการผลลัพธ์ เลือก "รายงวด" แล้วแผ่นเลื่อนหนีเคอร์เซอร์ ~53px · ป้ายปุ่ม "…งวด 1" ตายตัว | แผ่นเป็น `lead` ของ `ConfirmDialog` (ระหว่างคำถามกับรายการ) + กล่องที่มี `lead` ยึดขอบบน (กล่องกึ่งกลางที่โตยังเลื่อนขึ้นครึ่งหนึ่ง — วัดแล้ว) ⇒ แผ่นอยู่ที่เดิมทุกการสลับ · ป้ายจากงวดที่จะนับจริง (ดูหัวข้อจอ) |
| เครื่องหมายคำพูดปนกัน · "นับที่เหลือทั้งหมด" บนใบที่นับครบขึ้น toast แดง | บรรทัดรายงวดของโมดัลอนุมัติ + บรรทัดสรุป `auto` ใช้ “…” แบบโมดัลรายงวดของ `approvalPrompt` (บรรทัดทั้งใบคงประโยคเดิม · ข้อความด่าน/เหตุคงแบบ ‘…’ ของ main) · `countRestBlocker` นับครบ = `kind: 'info'` → `GatedAction blockerKind` |

ที่ยังไม่ได้แก้ (นอกขอบเขต): บนจอ 390 รายการผลลัพธ์ของโมดัลยังตัดบรรทัดที่ "รอ|อนุมัติ" / "รอ|นับรายงวด" ในประโยคยาว (ICU ตัดตรงขอบคำจริง — ห่อทั้งระบบต้องเป็นมติของ `THAI_KEEP_TOGETHER`)

## UAT ฝ่ายบัญชี 27/10 (dev server แบบอ่านอย่างเดียว · role finance · ตัวจำลอง GET · แก้แล้ว · ยังไม่ commit)

| เรื่อง | แก้ |
|---|---|
| ข้อ 1 — ทะเบียนการชำระ: ใบที่มีสลิปแจ้งแล้วแต่งวดติดด่านนับ Actual (ใบรายงวดที่ยังไม่นับ/ใบที่ย้อนอนุมัติ) ขึ้นป้าย "รอลูกค้าชำระ" และตกถัง "รอลูกค้าชำระ" (`group.awaiting` นับเฉพาะงวดที่รับรองได้ ⇒ `groupNote` ตกบรรทัดสุดท้าย) · แถบบอกแต่ยอดรวม ไม่บอกว่าใบไหน | `ledgerHeld` (คู่ตรงข้ามของ `ledgerAwaitsConfirm` ในงวด reported) · ก้อนใบนับ `held` + `heldReasons` ⇒ ป้าย "รอนับ Actual n งวด" (title = เหตุรายงวด) + ถัง "รอนับ Actual" · แถบ = รายใบ (เลขที่ลิงก์ `?tab=payment` แท็บใหม่) + งวด · ยอด · คำสั้นของเหตุ (ประโยคเต็มที่ title) จาก `ledgerHeldSummary` (API `facetTally.held` — ถอดตัวกรองสถานะก่อนนับ ⇒ ขึ้นแม้กรอง `?status=reported`) + ปุ่ม "ดูในทะเบียน" (`?status=held`) |
| ข้อ 2 — ป้ายเมนูทะเบียนการชำระ 27 แต่ลิงก์ `?status=reported` เห็น 21: ป้ายนับ `reported` ทั้งตาราง − ก้อนที่ติดด่าน ขณะที่ทะเบียนตัดใบยอด 0 (สลิป ฿0 ค้าง 6 แถว · `paymentNotRequired`) · และ `?status=reported` รวมงวดที่ติดด่านซึ่งป้ายไม่นับ | ตัวตัดสินเดียว: `ledgerIncludes` (ใบหาย · ใบยอด 0 · งวดโมฆะ · งวดยังไม่ตรึง — route ทะเบียนเรียกตัวนี้) + `ledgerInConfirmQueue` (ป้ายเมนูดึงงวด reported + ใบ แล้วถามตัวนี้) · สถานะในมุมตัวกรอง `ledgerStatusKey`: งวดที่ติดด่าน = `held` "รอนับ Actual" (ไม่ใช่ค่าในฐาน) ⇒ `?status=reported` = การ์ด "รอบัญชีรับรอง" = คิว "รอคุณรับรอง" = ป้ายเมนู = การ์ด "งวดรอรับรอง" ของ /finance (`ledgerSummary.awaiting*` นับ `ledgerAwaitsConfirm` · `held*` แยก) · Excel คำสถานะ "รอนับ Actual" · เลือกทางนี้แทน "ลิงก์ป้ายไปที่คิว" เพราะคิวไม่มี URL ของตัวเอง และกติกา #1921/#1922 ต้องให้เลขบนการ์ด "รอบัญชีรับรอง" (กดแล้วตั้ง `status=reported`) เท่าแถวหลังกดด้วย |
| ข้อ 3 — งวด n-1 นับแล้วแต่บัญชีถอนคำรับรอง แล้วงวด n ยื่นค้าง: บัญชีเห็นงวด n "รอ AE Sup อนุมัติงวดก่อน" ขณะที่ด่านอนุมัติของ AE Sup ตอบ `previous_unconfirmed` — สองฝ่ายชี้กันไปมา | `installmentActualPreviousOpen` (งวดก่อนหน้าตัวแรกที่ยังไม่รับรอง + สถานะเงิน + นับแล้วไหม) + `installmentActualHold` (`revoked` · `count_rest` · `prev_confirm` · `prev_count` · `prev_payment` · `submitted` · `rejected` · `unsubmitted`) — ตัวเดียวของคำยาว (`installmentActualLockReason`) คำสั้น (`installmentActualLockShort`) และแถบทะเบียน · งวดก่อนหน้ารอบัญชีรับรอง = "งวด k ยังไม่ได้รับรองเงิน — บัญชีรับรองเงินงวด k ก่อน AE Sup จึงอนุมัติงวดนี้ได้ บัญชีจึงรับรองเงินงวดนี้ได้" · ทะเบียนประทับ `actualPreviousOpen`/`actualCountRestDone` จากชุดก่อนกรอง (`stampActualHold`) · ฝั่ง AE Sup: `installmentActualApproveWait` "งวด k ยังไม่ได้รับรองเงิน — บัญชีรับรองเงินงวด k ก่อน จึงอนุมัติงวดนี้ได้" · ข้อความของ `installment_actual_not_approved` เปลี่ยนเป็น "รอ AE Sup อนุมัตินับ**งวดนี้**ก่อน" (เดิม "อนุมัติงวดก่อน" อ่านเป็นงวดก่อนหน้าได้ — รหัสของฐานไม่เปลี่ยน) |
| ข้อ 4 — โมดัลรับรอง: "งวดนี้นับไปแล้วตอน AE Sup อนุมัติงวด" ทุกงวด — เท็จกับงวดที่นับตอนอนุมัติใบ (`so_approval`) และ "นับที่เหลือทั้งหมด"/นับอัตโนมัติ (`count_rest`) | บรรทัดตามทาง (`actualApprovedVia` ของงวด): `review` = อนุมัติงวด · `so_approval` = อนุมัติใบ · `count_rest` = กด "นับที่เหลือทั้งหมด" · ข้อความอัตโนมัติ (`installmentActualAutoCounted`) = "ระบบนับให้อัตโนมัติแล้ว (มติข้อ 10)" · ไม่รู้ทาง = ไม่อ้างจังหวะ · แถวทะเบียนพก `actualApprovedVia`/`actualNote` |
| ข้อ 5 — แถบ "รอฝ่ายขายยื่นขอนับ n งวด (ยื่นได้หลังบัญชีรับรองงวดก่อนหน้าของใบเดียวกัน)" เท็จกับงวดที่ไม่มีงวดก่อนค้าง (งวดแรก/แถวที่ยกมา) | ถอดวงเล็บรวม — เหตุอยู่รายงวด (ข้อ 1) · ประโยคนำของแถบจริงกับทุกงวด · มีงวดที่รอบัญชีรับรองงวดก่อน = บรรทัด "งานของคุณก่อน" แยก |
| ข้อ 6 — ตารางงวด: เหตุยาวในช่องสถานะตรึงขวา (~133px) ตัดเป็นแถวสูง · "AE / Sup" ขาดกลาง · ที่ 1280 คอลัมน์จมใต้กลุ่มตรึงโดยไม่มีอะไรบอกว่าเลื่อนได้ | ช่องสถานะ = คำสั้นที่บอกคนที่ต้องทำต่อ (`keepPhrases` "AE Sup") + ประโยคเต็มสำหรับโปรแกรมอ่านจอ (`sr-only` · ปุ่มชี้ด้วย aria-describedby) + title · ปุ่มที่ติดด่านเป็น `GatedAction` (กดแล้วขึ้นประโยคเต็ม — จอสัมผัส) · TableScroll ได้ `edgeHint` (opt-in · `lib/ui/useHiddenEdges` เฝ้ากล่องเดียว → `data-hidden-edge`) — ตรวจแล้วว่า primitive ไม่มีคำใบ้แบบนี้มาก่อน · แผงงวดเปิดและทอดเงาจากขอบซ้ายของกลุ่มตรึงขณะยังมีคอลัมน์ซ่อนทางขวา (จอ ≤640 ไม่ตรึง = ไม่มีเงา) |
| ข้อ 7 — เอกสารยังเขียน "ยังไม่รัน 0412" | สถานะ/ลำดับขึ้นระบบ/INDEX: รันบน production แล้ว 27/10 (ดีล 701 · ต่าง 0 · check:columns เขียว) · ที่เหลือ merge แล้ว deploy |

ที่ยังไม่ได้แก้ (นอกขอบเขต · เป็นมาตั้งแต่ main): การ์ดทะเบียนการชำระบนจอมือถือตัดยอดเงินหลักล้านด้วย "…"

### คำถามค้างถึงเจ้าของ (ถามทีละข้อ — Claude เลือกค่าตั้งต้นไว้ก่อน)

1. **ยกเงินก้อนเดียวที่ครอบทุกงวดที่ยังไม่นับ** (เช่นลูกค้าจ่ายเต็มใบไว้กับใบที่ยกเลิก แล้วใบใหม่อนุมัติแบบรายงวด 50/50 ที่งวด 1 นับไปแล้ว) — ตอนนี้ **ปฏิเสธ**
   (ทาง Rev. แบบทั้งใบ) · **ค่าตั้งต้นคงเดิม ยังไม่ได้คำตอบ** (26/10 · มติข้อ 10 ไม่ได้ตอบข้อนี้ และไม่ได้เปิดทางใหม่ — กดนับที่เหลือทั้งหมดก่อนแล้วยก
   ติด `installment_carry_counted_locked`) · ทางเลือก: ให้แถวที่ยกมานับยอดที่เหลือของใบทันที (เงินรับรองแล้ว) — แต่เวลาที่นับจะเป็นเวลาของงวด 1 เดิม
   (อาจเป็นเดือนที่ปิดแล้ว) หรือเป็นเวลาที่ยก (ต้องแยกแถวเพราะแถวหนึ่งมีเวลาเดียว)

(คำถามค้างข้อ 2 เดิม — งวดที่โผล่หลัง "นับที่เหลือทั้งหมด" — ตอบแล้วเป็นมติข้อ 10 · ถอดออกจากรายการ)

## รอบรีวิวหก 27/10 (แก้แล้ว · ยามอยู่ในเทสต์ · ไม่แตะ 0412 · ยังไม่ commit)

| เรื่อง | แก้ |
|---|---|
| เหตุ "งวดก่อนหน้า" ชี้ให้ฝ่ายขาย "แจ้งสลิปงวด k" ทั้งที่งวด k **ยังไม่นับ** (แจ้งสลิปติด `REPORT_BLOCKED`) — เช่นงวด 3 จ่ายก่อนอนุมัติใบ (อนุมัติย้ายเป็น `reported` ยังไม่นับ) ขณะที่งวด 2 ยังไม่แจ้ง/บัญชีตีกลับ | `installmentActualPreviousOpen` พก `actualStatus` ของงวดนั้นด้วย · `installmentActualHold` แยกชนิดใหม่ `prev_submit` (งวดก่อนหน้ายังไม่นับ + ยังไม่แจ้ง/ถูกตีกลับ): ยาว "ฝ่ายขายยื่นขอนับงวด k → AE Sup อนุมัติ → ฝ่ายขายแจ้งสลิป และบัญชีรับรองก่อน" (ยื่นแล้ว = "AE Sup อนุมัตินับงวด k แล้วฝ่ายขายแจ้งสลิปและบัญชีรับรองก่อน") · สั้น "รองวด k ยื่นขอนับก่อน" / "รอ AE Sup อนุมัติงวด k ก่อน" · `prev_payment` คงคำเดิมเฉพาะงวดก่อนหน้าที่นับแล้ว (แจ้งสลิปได้จริง) · ทะเบียน (แถบรายใบ · `groupNote` · `ledgerRowLock`) และแผงงวดได้คำเดียวกัน |
| โมดัลรับรองของบัญชี: งวด `so_approval` ที่ปุ่มกู้ "นับงวด 1"/"นับงวดที่ค้าง" นับทีหลัง (RPC ลงเวลาที่กด · via ยังเป็น `so_approval`) ขึ้น "งวดนี้นับไปแล้วตอน AE Sup อนุมัติใบ" ขัดกับแถว "นับ Actual" ที่โชว์เดือนที่กด | `installmentActualCountedLate(row, orderApprovedAt)` — `so_approval` ที่ `actualApprovedAt` **หลัง** `approvedAt` ของใบ = นับทีหลัง (คลิกอนุมัติลงเวลาเท่ากันพอดี · Rev. ที่รับงวดนับแล้วมา = เก่ากว่า · ยกเงิน C2b ลอกเวลาเดิม) ⇒ บรรทัด `so_recovery` "งวดนี้นับไปแล้วหลังอนุมัติใบ ตอน AE Sup กด “นับงวด 1”/“นับงวดที่ค้าง”" · ไม่รู้เวลา = คำเดิม · ไม่แตะ RPC · ทั้งโมดัลรับรอง (หน้าใบ + ทะเบียน — แถวพก `orderApprovedAt`) และ "บันทึกการรับชำระ" ของบัญชี · คำ "AE Sup" ของผู้อนุมัติที่เป็นแอดมินคงตามคำเรียกกลางของไฟล์ |
| ตารางงวด: ช่องปุ่มกว้างคงที่ 192px ตรึงขวาทุกใบ (รวมใบทั้งใบ) แม้ไม่มีแถวไหนมีปุ่ม (แผนจากใบเสนอราคา · คนดูที่ไม่มีคำสั่ง · ใบชำระครบ) — ที่ 1280 กลุ่มตรึงกินกล่องได้ ~45% | `.table:not(:has(> tbody > tr > td.actionCell > *))` — ช่องปุ่มกลับไปกว้างตามเนื้อ (1%) ไม่ตรึง · สถานะตรึงชิดขอบ (`right: 0`) · จอ ≤640 คงไม่ตรึง (ถอดซ้ำในบล็อกเดิม · ไม่เพิ่มจุดตัดจอ) · ตรวจกับ CSS ที่ build จริงบน Chrome headless: มีปุ่ม = 192px/สถานะ right 192 (เดิม) · ไม่มีปุ่ม = ช่องปุ่ม 26px ไม่ตรึง/สถานะชิดขอบกล่อง |
| GET ใบอ่านงวดพลาด (route กลืนเป็น `[]`) ⇒ ใบรายงวดที่มีงวดจริงขึ้นขั้นถัดไป `no_rows` "กด “เริ่มติดตามการชำระ” … แล้ว AE Sup กด “นับงวด 1”" บนหัวใบและการ์ด (แผนจากใบเสนอราคา + ปุ่มเริ่มติดตามเป็นของเดิมตั้งแต่ main) | GET ส่ง `installmentsError` ทุกใบ (เดิมเฉพาะใบย้อนหลังผ่าน `extrasError`) · หัวใบ/การ์ดไม่คิด `installmentActualNextStep` เมื่ออ่านพลาดและไม่มีแถวในมือ · แผง: หัว "อ่านงวดชำระไม่สำเร็จ" + ประกาศแดง (รีเฟรชหน้า) · ไม่วาดแผน/ปุ่มเริ่มติดตาม · ปุ่ม "นับที่เหลือทั้งหมด" บอกว่าอ่านงวดไม่ขึ้นแทน `COUNT_REST_NO_ROWS` · แถวที่ได้มาทีหลัง (POST/PATCH) ชนะเหตุเก่า |
| โมดัลยืนยันที่มี `lead` (ยึดขอบบน 40px) คงเพดาน 90vh ⇒ จอสูงไม่ถึง 640 ขอบล่าง/ปุ่มตกจอ (overlay ไม่เลื่อน) | `max-height: min(90vh, calc(100% - var(--space-9)))` บนกล่องที่ยึดขอบบนเท่านั้น · Chrome headless (CSS ที่ build จริง): 1093×500 / 1093×450 / 844×390 / 390×700 อยู่ในจอทั้งกล่อง · กล่องที่ไม่มี `lead` ไม่แตะ |

## ลำดับขึ้นระบบ

1. ✅ **เสร็จ 27/10** — เจ้าของรัน `0412` บน SQL Editor ของ production (ไฟล์ปลอดภัยกับโค้ดที่ deploy อยู่: คอลัมน์ใหม่มีค่าตั้งต้น · RPC ใหม่ยังไม่มีใครเรียก ·
   คู่ sync ให้ค่าเดิมทุกดีลแบบทั้งใบ · ฟังก์ชันบนฐานไม่ตรงที่ไฟล์คาด = ไฟล์หยุดเองด้วย `mig_0412_patch_anchor`)
2. ✅ **เสร็จ 27/10** — ตรวจอ่านอย่างเดียวหลังรันตามคาดทุกข้อ: `wonValue` / `wonMonth` ของทุกดีลไม่ขยับ (ดีล 701 · ต่าง 0) · `npm run check:columns` เขียว
   (มติข้อ 10 เพิ่ม `"actualApprovedVia"` ใน select ของทะเบียน SO/ป้ายเมนู)
3. **ที่เหลือ:** merge แบรนช์แล้ว deploy โค้ด (0412 รันแล้ว ⇒ ลำดับ "migration ก่อนโค้ด" ครบ) — คำเตือนเดิมของขั้นนี้: deploy โค้ด (โค้ดใหม่อ่านคอลัมน์ใหม่ — deploy ก่อนรัน migration = GET หน้า SO · ทะเบียนการชำระ · ป้าย `salesOrders`/`payments` · select ของ QT/โครงการ พัง ·
   ทะเบียน SO อย่างเดียวถอยได้เอง)
4. เปิดจอจริง: อนุมัติใบทดสอบแบบรายงวด → ยื่น/อนุมัติ/ตีกลับ/ดึงกลับงวด → บัญชีรับรอง → นับที่เหลือทั้งหมด → ปรับแผนแบ่งงวด/ยกเงินเข้า
   (งวดใหม่ต้องขึ้น "นับอัตโนมัติ" หลังบันทึก · บัญชีรับรองได้เลย) · ย้อนอนุมัติ + ออก Rev. (Rev. แบบรายงวดของใบที่นับที่เหลือทั้งหมด = นับทุกงวดที่ค้าง)

## ความเสี่ยงที่รู้แล้ว

- **มติข้อ 9 — ยอดงวดที่นับแล้วไม่ตรงกับ Actual ที่ตรึงไว้:** ลดยอดงวดที่นับแล้ว ⇒ เงินที่จะเก็บของงวดนั้นน้อยกว่าส่วนแบ่งที่นับไปแล้ว (ส่วนที่ย้ายไปงวดอื่น
  ได้ส่วนแบ่งตามคงเหลือ — Σ ทั้งใบยังเท่า `actualAmount` เพราะงวดท้ายที่ยังไม่นับรับเศษ ตันที่ 0 · **บังคับด้วย W1/C2o ตั้งแต่รอบรีวิวสาม**: แผนที่ไม่เหลืองวด
  ที่ยังไม่นับขณะ Σ ยังไม่ครบ = ปฏิเสธ) · เพิ่มยอด = ส่วนเพิ่มไม่เข้า Actual จนกว่างวดอื่นจะถูกนับ ·
  นับครบด้วย "นับที่เหลือทั้งหมด" แล้วแบ่งงวดเพิ่ม/ยกเงินเข้า = งวดใหม่นับให้เองส่วนแบ่ง 0 (มติข้อ 10) · นับครบด้วยการยื่น-อนุมัติทีละงวด (ไม่เคยกดนับที่เหลือ
  ทั้งหมด) แล้วแบ่งงวดเพิ่ม = งวดใหม่ส่วนแบ่ง 0 แต่ยังต้องยื่น-อนุมัติ (มติข้อ 10 ครอบเฉพาะใบที่กดนับที่เหลือทั้งหมด)
- **มติข้อ 10 — trigger เขียนแถวงวด (ข้อยกเว้นที่สี่ของยาม):** งวดที่ถูกนับอัตโนมัติไม่มี audit แยก — ร่องรอยอยู่ที่แถว (`actualNote` ข้อความคงที่ ·
  `actualApprovedAt` = เวลาของทรานแซกชันที่บันทึก · ผู้อนุมัติ = ผู้กดนับที่เหลือทั้งหมดล่าสุด) · audit ของปรับแผน/ยกเงินลงภาพหลัง COMMIT แล้ว
  (รอบรีวิวห้า — สรุปบอกงวด/ยอดที่ระบบนับเอง) **ยกเว้น** อ่านงวดสดหลัง RPC พลาด = ลงภาพของ RPC (`afterSource:'rpc'`) · เขียนงวดตรง (SQL Editor/Table Editor)
  บนใบแบบนี้ก็ถูกนับตอน COMMIT เหมือนกัน (ไม่มี audit)
- **มติข้อ 10 — สภาพค้าง:** งวดที่ยังไม่นับบนใบที่กดนับที่เหลือทั้งหมดแล้วเกิดได้ทางเดียว = Rev. อนุมัติแบบรายงวดแล้วขั้น start ล้ม/ยังไม่รัน ⇒ จอบอก
  "รอนับอัตโนมัติ" + ปุ่มกู้ "นับงวดที่ค้าง" (ผู้อนุมัติ) · แถบทะเบียนการชำระของบัญชีรู้สัญญาณนี้แล้ว (UAT ฝ่ายบัญชี 27/10 — แถวพก `actualApprovedVia`
  และ `stampActualHold` ประทับ `actualCountRestDone` จากงวดทั้งใบ ⇒ เหตุ "รอ AE Sup กด “นับงวดที่ค้าง”" ไม่ใช่ "รอฝ่ายขายยื่นขอนับ")
- **มติข้อ 10 — Rev. ที่ยอดก่อน VAT เพิ่ม:** งวดที่นับแล้วถือส่วนแบ่งเดิม ⇒ ถ้าทุกงวดนับแล้ว ส่วนเพิ่มไม่มีงวดให้นับ (ความเสี่ยงเดิมข้างล่าง) · งวดที่เพิ่มทีหลัง
  บนใบที่กดนับที่เหลือทั้งหมดรับส่วนเพิ่มนั้นอัตโนมัติ (เข้าเดือนที่บันทึก — โมดัลปรับแผน/ยกเงินบอกยอดก่อนกด)
- **มติข้อ 9 — ยกเงินจนงวดที่นับแล้วเหลือ 0.01:** กติกา "ลดได้ไม่ถึง 0" ตรงตัว ⇒ ยกเกือบเต็มยอดได้งวดเศษสตางค์ (โมดัลพรีวิวโชว์ก่อนกด) — ถ้าเจอจริงให้เจ้าของตัดสินว่าจะกันขั้นต่ำไหม

- **Rev. ที่เปลี่ยนยอดก่อน VAT:** งวดที่นับแล้วถือส่วนแบ่งเดิม — ผลรวมอาจเกิน `actualAmount` ใหม่ (คงเหลือตันที่ 0)
- **ปุ่มกู้ "นับงวด 1" ข้ามเดือน:** ขั้นนับตอนอนุมัติใช้เวลาอนุมัติใบ (รอบรีวิวสอง — ไม่มีปัญหาเส้นเดือนแล้ว) แต่ถ้าขั้นนั้นล้มแล้วกดปุ่มกู้เดือนถัดไป
  งวด 1 ลงเดือนที่กด (ตามมติข้อ 1 "Actual เดือนไหน ยอดเข้าเดือนนั้น" — ไม่ย้อนลงเดือนที่ปิดไปแล้ว)
- **0412 รุ่นก่อนรอบรีวิวสอง:** ถ้าเคยรันร่างเดิมบนฐานใดไว้ (มี C1 แต่ไม่มี C2) ไฟล์นี้หยุดด้วย `mig_0412_patch_anchor` — ฐานจริงไม่เคยรันร่างเดิม (รัน 0412 รุ่นสุดท้ายบน production แล้ว 27/10)
- **เขียนดีลบ่อยขึ้น:** งานของใบรายงวดขยับ `sales_deals.updatedAt` (ปรับแผน 12 งวด ≈ 25 รอบ sync) · enforce อ่านเพิ่มเล็กน้อยทุกการเขียนดีล
- **ใบรายงวดที่ย้อนอนุมัติ:** งวดที่ยังไม่อนุมัติรับรองเงิน/แจ้งสลิปไม่ได้จนย้ายไปใบ Rev. (ร่าง Rev. เริ่มเป็นทั้งใบ ⇒ รับรองได้บนร่าง) — ตามสัญญาตรงตัว ·
  **ใบที่ยกเลิกไม่ติดด่านนี้** (รอบรีวิว 26/10 — ไม่มี Rev. ให้ย้าย ⇒ ต้องรับรองแล้วคืนเงินได้)
- **ปัดเศษ:** JS ปัดจากค่าจริง · Postgres ปัดหลังหารด้วยความละเอียดของตัวเอง — ต่างหนึ่งสตางค์ได้เฉพาะค่าที่ห่างครึ่งสตางค์ไม่เกิน ~1e-8 ·
  ความยาวเหตุผล JS นับ UTF-16 · Postgres นับตัวอักษร (ต่างกันเฉพาะอีโมจิ)
- **ค่าใช้จ่ายการอ่าน:** ป้ายบนเมนูและรายงานยอดขายโหลดใบรายงวดที่อนุมัติทั้งหมด + งวด — เล็กวันนี้ โตตามการใช้
- **ไวยากรณ์ `.or()` ของรายงาน** (`approvedAt.gte."<from>",actualMode.eq.installment`) ตามแบบใน `notifications.js` แต่ทดสอบกับตัวจำลองเท่านั้น
- เปิดจอแล้วบน dev server แบบอ่านอย่างเดียว (UAT AE Sup + ฝ่ายบัญชี 27/10 · ตัวจำลอง GET) — ยังไม่ได้ลองกดจริงบนฐาน (ขั้น 4 ของลำดับขึ้นระบบ)
