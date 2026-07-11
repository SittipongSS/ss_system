# Sales Revamp — แผนแม่บทรื้อระบบบริหารงานขายทั้งเส้น (Lead → ปิดโครงการ)

> แผนรื้อโครงสร้างระบบบริหารงานขาย **ทั้ง frontend + backend** ครอบตั้งแต่ Marketing รับ Lead
> จนปิดโครงการและวนกลับมา RE-ORDER — **superset ของ** [`DEAL_PROJECT_RESTRUCTURE_PLAN.md`](DEAL_PROJECT_RESTRUCTURE_PLAN.md)
> (มติ 5 ข้อ + โมเดล ลูกค้า›โครงการ›ดีล + timeline segment + IA ของแผนนั้น **ยังใช้ทั้งหมด**
> และกลายเป็นเฟสต้น ๆ ของแผนนี้)
>
> สถานะ: **ร่างเพื่อรีวิว — ยังไม่ลงมือ** (2026-07-12)

---

## 0. สโคป + หลักการ

**ครอบ:** Lead intake (Marketing) · คัดกรอง/กระจาย (SLA) · เปิดลูกค้า · โครงการ+ดีล (SCENT/NPD/RE-ORDER)
· Forecast/Target/KPI · ใบเสนอราคา (FM-SA-01) · ไทม์ไลน์ · อนุมัติ Won + หลักฐาน · Sale Order (SO)
· ส่งต่อ RD/PD · ใบเตรียมส่งของ · อนุมัติปิดโครงการ · วนกลับ RE-ORDER

**หลักการที่คงเดิม (ไม่รื้อ):**
- namespace `/sa` + โฟลเดอร์โค้ด/API เดิม (จัดการที่ rewrite) — ตาม IA §5 ของแผน deal-project
- boundary "อ่านข้ามโมดูลได้ ห้าม write ข้าม" + `withUser`/response helper + `recordAudit` (0049)
- master data (ลูกค้า/สินค้า/ราคา) เป็นเจ้าของข้อมูลกลาง; ใบเสนอราคาแช่แข็งราคา
- ไม่มี auto-save — ทุกฟอร์มมีปุ่มบันทึก (memory: no-autosave)
- โมเดล 2 ชั้น deal=พาณิชย์ / project=execution + **ลูกค้า 1:N โครงการ 1:N ดีล**

**คำมาตรฐาน:** ลีด (`sales_leads` ใหม่) · ลูกค้า (`customers`) · โครงการ (`projects`) · ดีล (`sales_deals`)
· ใบเสนอราคา (`quotations`) · ใบสั่งขาย/SO (`sale_orders` ใหม่) — เลิกใช้ "โครงการ" เรียกดีล และ "โปรเจกต์"

---

## 1. เส้นชีวิตงานขาย (lifecycle ทั้งเส้น + จุดวัด KPI)

```
[1] Marketing กรอกลีดรายวัน ──── KPI: จำนวน/วัน ต่อคน ต่อช่องทาง
      แหล่ง: Online (Chatcone: Line/Meta/TikTok/IG) · Onsite (โทร/Walk-in) · Website
      ข้อมูล: ชื่อลูกค้า · บริษัท/แบรนด์ · อีเมล/ช่องทางติดต่อ · เบอร์ ·
              บริการที่สนใจ (ระบบกระจายกลิ่น/workshop/สินค้า*/อื่นๆ* — *ระบุเพิ่ม) · budget · รายละเอียด
        ↓
[2] AE Supervisor คัดกรอง + ส่งทีม (ODM / SV / KA) ── KPI/SLA: ภายใน 1 วันทำการ
        ↓                                    ↑ ตีกลับ (ทีมไม่ตรง) → Supervisor ส่งทีมใหม่
[3] Senior AE กระจายให้ AE ราย คน ── AE ติดต่อกลับ ── KPI/SLA: ภายใน 1 วันทำการ
        ↓
[4] AE นัดประชุม onsite (ลูกค้ามา/ออกไปหา) / online ── KPI: จำนวนนัด/ผล
        ↓  ไปต่อได้
[5] เปิดลูกค้าในฐานข้อมูล (นิติบุคคล/บุคคล + เอกสารจำเป็น + เอกสาร Vendor*)   *เฟสหลัง
        ↓
[6] เปิดโครงการ + แตกลีดเป็นดีล — SCENT / NPD(ทีม ODM/SV) / RE-ORDER(ทีม ODM/SV)
        ↓
[7] วาง Forecast ต่อดีล ── KPI: ความแม่นยำ FC, %ปิดยอด Target vs Actual
        ↓
[8] ใบเสนอราคา (หลายใบ/หลายออฟชั่นต่อดีล) + ไทม์ไลน์ (template ตามประเภท → segment ต่อดีล)
        ↓
[9] Won: AE แนบหลักฐาน (สลิป/PO/ยืนยันสั่งซื้อ) → ส่ง AE Supervisor อนุมัติ
      · เอกสารไม่ครบ → ตีกลับ · อนุมัติ → ดีล won + ออก SO (1 ดีล = 1 SO)
        ↓
[10] ส่งต่องาน: SCENT → RD (ชื่อสูตร) · NPD → Production (PD) — ผ่าน timeline segment
        ↓
[11] ใบเตรียมส่งของ — ดึงรายการจาก QT/SO เลือกรายการ+จำนวนส่ง
        ↓
[12] ดีลจบเมื่อทุกขั้นเสร็จ → ขออนุมัติ **ปิดโครงการ** จาก AE Supervisor
        ↺
[13] ลูกค้ากลับมา → เปิดโครงการอีกครั้ง (reopen) + เพิ่มดีล RE-ORDER 1, 2, …
```

**ลำดับดีลในโครงการ:** SCENT → NPD → RE-ORDER 1 → RE-ORDER 2 → …
กรณี**กลิ่นเดิม**: ไม่สร้างดีล SCENT ใหม่ แต่โครงการ**อ้างอิงชื่อสูตรเดิม** → เริ่มที่ NPD → RE-ORDER …
(ตรงกับมติเดิม "โครงการกลิ่นเดิมไม่มีดีล SCENT" — เพิ่มการอ้างอิงสูตร §2.3)

---

## 2. โครงสร้างข้อมูล

### 2.1 ใหม่ทั้งหมด (greenfield)

**`sales_leads`** — ลีดของ Marketing (คนละตัวกับดีล: ลีดส่วนใหญ่ไม่ถึงขั้นเปิดลูกค้า)
```
id (LD-…) · channel ('chatcone_line','chatcone_meta','chatcone_tiktok','chatcone_ig',
                     'phone','walkin','website') · channelGroup ('online','onsite','website')
contactName · company/brand · email/contactChannel · phone
serviceInterest ('diffuser','workshop','product','other') + serviceDetail (บังคับเมื่อ product/other)
budget · details
status ('new','screened','assigned','contacted','meeting','qualified','disqualified')
team (ODM/SV/KA) · assigneeId/Name (AE) · disqualifiedReason
customerId (เมื่อเปิดลูกค้า) · projectId (เมื่อเปิดโครงการ)
createdBy (Marketing) · timestamps ต่อสถานะ: screenedAt/assignedAt/firstContactAt/meetingAt/qualifiedAt
```

**`lead_events`** — ทุก transition + ตีกลับ (ใคร เมื่อไหร่ จากไหนไปไหน เหตุผล) → เป็นแหล่งคำนวณ SLA/KPI
(รูปแบบเดียวกับ `sales_deal_stage_history`)

**`sale_orders`** — ใบสั่งขาย (SO) ออกเมื่อ won อนุมัติแล้ว
```
id · soNumber (SO-YYMMXXXX, unique) · dealId UNIQUE (1 ดีล = 1 SO) · quotationId (ใบที่ลูกค้ารับ)
customerId/Name snapshot · lines (คัดจาก quotation_lines ใบที่ accept) · totalAmount
status ('open','delivered','closed','cancelled') · issuedBy/At
```

**อนุมัติ Won (บนดีล — ฟิลด์ใหม่ ไม่ใช่ตารางใหม่):**
```
wonApprovalStatus ('not_requested','pending','approved','rejected') + requested/approved by/at + rejectReason
หลักฐานแนบผ่านตาราง attachments เดิม (targetType 'deal-won-evidence') — บังคับ ≥1 ไฟล์ตอนส่งขอ
```

**อนุมัติปิดโครงการ (บน projects):**
```
closeStatus ('open','close_requested','closed','reopened') + requested/approved by/at
ปิดได้เมื่อ: ทุกดีลจบ (won+ส่งของครบ หรือ lost) + task ทุก segment เสร็จ → Supervisor อนุมัติ
reopen: เพิ่มดีล RE-ORDER ใหม่ → กลับ 'reopened' อัตโนมัติ + audit
```

### 2.2 ยกระดับของเดิม

**`quotations` (0065/0070 มีแล้ว แต่ flag ปิด)** — เติมตาม spec FM-SA-01:
```
+ quoteNumber รูปแบบใหม่ QT-YYMMXXXX-R (YY ค.ศ. 2 หลัก · MM เดือน · XXXX เลขรันต่อเดือน · R = revision เริ่ม 0)
  กันซ้ำด้วย unique + เลขรันจาก sequence ต่อเดือน (กัน race ด้วย DB ไม่ใช่ app)
+ revision chain: baseNumber + revisionNo + revisedFromId (revise = ใบใหม่ R+1, ใบเก่า status 'revised' อ่านอย่างเดียว)
+ ส่วนลดรายบรรทัด: quotation_lines.discountType('percent','amount') + discountValue → lineTotal หลังลด
+ ส่วนลดรวมท้ายใบ: quotations.discountType/discountValue (คิดหลังรวม subtotal)
+ paymentTerms (text จาก template + แก้ได้)
+ หมายเหตุ + เลือกจาก template: ตารางใหม่ `quote_note_templates` (id·serviceType·title·body·active)
  — supervisor จัดการ template ได้ (หน้า /database หรือในเมนูใบเสนอราคา)
· ราคา freeze เดิม + redactProductMargin เดิม + approval เกินเงื่อนไข (0070) คงไว้
```

**`sales_deals`** — ตามแผน deal-project เดิม (dealType/หลายดีลต่อโครงการ) + เพิ่ม:
```
+ formulaName / formulaRef (ดีล SCENT บันทึกชื่อสูตร; จุดปลั๊กอิน RD ในอนาคต)
· ประเภทย่อย NPD/RE-ORDER แบ่ง ODM/SV = ใช้ field team เดิมของดีล (ไม่เพิ่มคอลัมน์)
```

**`projects`** — + `formulaName` (สูตรของโครงการ — กลิ่นเดิมอ้างสูตรนี้โดยไม่มีดีล SCENT) + closeStatus (§2.1)

**`shipment_prep` (0067 มีแล้ว)** — เปลี่ยนแหล่งรายการ: จากเดิมอิง project_products → **ดึงจาก SO/QT ที่ accept
เลือกรายการ + ระบุจำนวนส่ง** (ส่งบางส่วนได้ → หลายใบต่อ SO, ยอดสะสมห้ามเกินจำนวนใน SO)

**`customers`** — มี customerType (0034) + เอกสารแนบ (0028) แล้ว → เพิ่ม checklist "เอกสารจำเป็น" ตอนเปิดลูกค้า
(นิติบุคคล vs บุคคล ต่างชุด) + เอกสาร Vendor = เฟสอนาคต (ยังไม่ออกแบบ)

### 2.3 แผนที่ entity รวม

```
sales_leads (LD-) ──qualified──► customers ──► projects (PRJ-) ──► sales_deals (SDL-)
   │ lead_events (SLA/KPI)          │             │ formulaName        │ dealType/team/formulaName
   │ team/assignee                  │             │ closeStatus        │ wonApproval* + attachments(หลักฐาน)
   ▼                                ▼             ▼                    ├── quotations (QT-YYMMXXXX-R, หลายใบ)
 KPI dashboard              เอกสารลูกค้า      project_tasks.dealId     │      └ quotation_lines (+ส่วนลด)
                                              (timeline segment)       ├── sale_orders (SO- , 1:1)
                                                                       │      └ shipment_prep (เลือกรายการ/จำนวน)
                                                                       └── sales_deal_forecasts / targets(0075)
```

---

## 3. KPI framework — วัดจาก timestamp อัตโนมัติ ไม่กรอกมือ

| KPI | นิยาม | แหล่งข้อมูล |
|---|---|---|
| Marketing กรอกลีดรายวัน | จำนวนลีด/วัน ต่อคน ต่อช่องทาง | `sales_leads.createdAt/createdBy/channel` |
| Supervisor คัดกรองทัน SLA | `screenedAt − createdAt ≤ 1 วันทำการ` (% hit) | `lead_events` + ตาราง `holidays` เดิม (วันทำการ) |
| AE ติดต่อกลับทัน SLA | `firstContactAt − assignedAt ≤ 1 วันทำการ` (% hit) | `lead_events` |
| นัดประชุม | จำนวนนัด onsite/online ต่อ AE + conversion ลีด→นัด→เปิดลูกค้า | `lead_events` (meeting) |
| ตีกลับทีมผิด | จำนวน + rework time | `lead_events` (bounce) |
| %ปิดยอด | `Actual ÷ Target` (บริษัท/ทีม/บุคคล ตาม 0075) | targets + deals |
| ความแม่นยำ FC | ต่อดีล won: `1 − |FC − AT| ÷ FC` → เฉลี่ยรายคน/ทีม/เดือน | deals (projectValue vs wonValue) |
| ดีลค้างเก็บ | ลิสต์ดีลเปิดที่ `forecastMonth` เลยแล้ว | deals |

หน้า **KPI dashboard** (supervisor เห็นหมด · Senior เห็นทีม · AE เห็นตัวเอง — data scope ตาม hierarchy เดิม)

## 4. นิยามตัวเลข (ล็อกสูตร — helper `projectRollup.js` ตัวเดียวทุกหน้า)

| ตัวเลข | นิยาม |
|---|---|
| **Target** | เป้าที่ AE Supervisor วาง: บริษัท→ทีม→บุคคล (มีแล้ว mig 0075 + หน้า grid รายปี) |
| **Forecast Total** | Σ FC ของดีล won + เปิด (ไม่นับ lost) |
| **Actual** | Σ ยอดเก็บจริง (`wonValue`) ของดีล won |
| **Forecast คงเหลือ** | FC Total − Actual − ส่วนต่าง(FC−AT ของดีลที่เก็บต่ำกว่า FC) **≡ Σ FC ของดีลที่ยังเปิด** — สูตรผู้ใช้กับนิยามนี้พิสูจน์แล้วว่าเท่ากัน ใช้ Σ FC(เปิด) เป็น canonical เพราะตอบตรงคำถาม "ยอดดีลไหนยังไม่เก็บ" (ลิสต์ได้เป็นรายดีล) |
| Variance | Actual − Σ FC(won) — เก็บผลเพื่อวัดความแม่น FC (โชว์เสริม) |

ระดับที่ใช้: ดีล → โครงการ (rollup) → ลูกค้า → AE/ทีม/บริษัท (dashboard) — **สูตรเดียวกันทุกระดับ**

---

## 5. เมนู · IA (ต่อยอด §5 ของแผน deal-project)

| เมนู (กลุ่ม บริหารงานขาย) | URL | หน้า | สถานะ |
|---|---|---|---|
| ภาพรวม | `/sa` | dashboard (+KPI ใหม่) | ปรับ |
| **ลีด** | `/sa/leads` | ตารางลีด + ฟอร์มกรอกรายวัน + คิวคัดกรอง/กระจาย | **ใหม่** |
| ดีล | `/sa/deals` | pipeline เดิม (rename ตามแผนเดิม) | ปรับ |
| โครงการ | `/sa/projects` | หน้ารวมโครงการ (แผนเดิมเฟส 2) | ใหม่ |
| **ใบเสนอราคา** | `/sa/quotations` | ค้นหา/สร้าง FM-SA-01 — ลิสต์ทุกใบ ค้นด้วยเลข QT/ลูกค้า/ดีล | **ใหม่ (มติผู้ใช้: เมนูแยก)** |
| **ไทม์ไลน์** | `/sa/timeline` | Gantt รวมทุกโครงการ + filter ทีม/ประเภท/AE | **ใหม่ (มติผู้ใช้: เมนูแยก)** — ตอบ backlog เดิม (memory: pm-responsive-views "Gantt รวมยังไม่ทำ") |
| วางเป้าหมาย | `/sa/targets` | เดิม | คงเดิม |
| งานของฉัน | `/sa/tasks` | เดิม | คงเดิม |
| **KPI** | `/sa/kpi` | SLA ลีด + FC accuracy + %Target (ตาม scope) | **ใหม่** |

- ใบเสนอราคา/ไทม์ไลน์ = **เมนูเข้าเร็ว** แต่ตัวข้อมูลยังผูก โครงการ›ดีล เสมอ (สร้างจากเมนูต้องเลือกดีลก่อน)
- Marketing เห็นเฉพาะ `/sa/leads` (capability ใหม่ `salesplan:lead`) — role Marketing เป็น open decision #2

---

## 6. เฟสการทำ (7 เฟส — เรียงตาม dependency + value)

> เฟส A–B = เฟส 1–2 ของแผน deal-project เดิม (มติครบแล้ว) — เริ่มได้ทันที
> migration จองเลข 0088+ ตามแผนเดิม; ของใหม่จอง 0092+ (เลขจริงตอน merge)

### เฟส A · รากฐานดีล (= เฟส 1 เดิม) — mig 0088
dealType 3 ค่า + แยก template 3 ชุด + rename IA + dashboard 3 ประเภท + **เพิ่ม `formulaName`
บนดีล/โครงการ** (ช่องกรอก — ปลั๊กอิน RD ไว้ทีหลัง)

### เฟส B · โครงการหลายดีล + timeline segment (= เฟส 2 เดิม) — mig 0089+0090
list ฝั่ง PM → ดรอป unique → link-project → `project_tasks.dealId` + swimlane →
หน้ารวม `/sa/projects` + KPI FC Total/Actual/FC คงเหลือ

### เฟส C · โมดูลลีด + SLA/KPI — mig 0092 (`sales_leads`, `lead_events`)
- หน้า `/sa/leads`: ฟอร์มกรอก (Marketing) · คิวคัดกรอง (Supervisor เลือกทีม) · คิวกระจาย (Senior เลือก AE)
  · ปุ่มบันทึกติดต่อ/นัดประชุม · ตีกลับพร้อมเหตุผล
- action "เปิดลูกค้า" (ส่งเข้า flow master เดิม — approval workflow ลูกค้าใหม่มีแล้ว 0027)
  → "เปิดโครงการ + แตกดีล" (สร้างโครงการ + ดีลใต้โครงการจากหน้าเดียว, ผูก `leadId`)
- วันทำการ: reuse ตาราง `holidays` เดิม + helper คำนวณ SLA
- หน้า `/sa/kpi` เวอร์ชันแรก (SLA ลีด + จำนวนกรอกรายวัน)
- **greenfield — ขนานกับ A/B ได้** ถ้าอยากได้ KPI ลีดเร็ว

### เฟส D · ใบเสนอราคาเต็มรูป (FM-SA-01) — mig 0093 (upgrade quotations + `quote_note_templates`)
- เลข QT-YYMMXXXX-R (sequence ต่อเดือนกันซ้ำที่ DB) · revision chain · ส่วนลดรายบรรทัด+ท้ายใบ
  · เงื่อนไขชำระ · หมายเหตุ + template ต่อประเภทบริการ
- เมนู `/sa/quotations` + วิซาร์ดสร้าง (เลือกดีล → ดึงลูกค้า/สินค้า/ราคา freeze → หลายออฟชั่นต่อดีล)
- พิมพ์/PDF ใช้ pattern `ganttPrint`/เอกสารเดิม
- เปิด `SALES_FEATURES.quotations = true` เมื่อครบ (ระวังบั๊กเดิม finding #8: accept ยอด null ทับ projectValue)

### เฟส E · อนุมัติ Won + SO — mig 0094 (`sale_orders`) + 0095 (ฟิลด์ wonApproval)
- flow ใหม่แทน markWon ตรง: AE แนบหลักฐาน (บังคับ) → ส่งขอ → Supervisor อนุมัติ/ตีกลับ →
  อนุมัติแล้วจึง `markWon()` (นิยาม win = confirmed+deposit เดิม + มีหลักฐาน + อนุมัติ)
- ออก SO อัตโนมัติจากใบเสนอราคาที่ accept (1 ดีล = 1 SO, unique) — แก้ SO ต้องยกเลิก+ออกใหม่ (audit)
- RE-ORDER: ปิด won ต้องระบุโครงการ (มติเดิม #3) — บังคับที่จุดเดียวกันนี้
- Sahamit PO settle = ทางลัด won เดิม → ปรับให้แนบ PO เป็นหลักฐานอัตโนมัติ (เอกสารมีอยู่แล้วในระบบ)

### เฟส F · ส่งต่องาน + ใบเตรียมส่งของ + ปิดโครงการ — mig 0096
- handoff: won แล้ว activate segment ถัดไป — SCENT → task ชุด RD · NPD → task ชุด PD
  (role RD/PD มีใน template อยู่แล้ว — เพิ่มการแจ้งเตือน/คิวรายแผนกภายหลัง)
- shipment_prep v2: สร้างจาก SO → เลือกรายการ + จำนวนส่ง (ส่งบางส่วนได้ ยอดสะสม ≤ SO)
- ปิดโครงการ: เงื่อนไขครบ → ขออนุมัติ → Supervisor ปิด; RE-ORDER ใหม่ → reopen อัตโนมัติ
- เฟส 3 เดิม (Sahamit PO แนบโครงการเดิม — mig 0091) รวมอยู่เฟสนี้

### เฟส G · 360 + KPI เต็มรูป + เมนูไทม์ไลน์รวม
- Project 360 feed + Customer 360 (เฟส 4 เดิม) + `/sa/timeline` Gantt รวม + `/sa/kpi` เต็ม
  (FC accuracy, %Target, conversion funnel ลีด→ลูกค้า→won) + drill-down

**ลำดับบังคับ:** A → B (DB unique) · D ก่อน E (SO อ้างใบเสนอราคา) · C ขนานได้ · F หลัง E · G ท้าย

---

## 7. Ground truth — มีแล้ว vs ต้องสร้าง (ตรวจโค้ด 2026-07-12)

| ของ | สถานะ | หมายเหตุ |
|---|---|---|
| deals/targets/stage history/activities | ✅ มี (0063, 0075) | targets ครบ บริษัท→ทีม→บุคคล + หน้า grid รายปี |
| quotations + lines + approval | ✅ โครงมี (0065, 0070) **แต่ flag ปิด** | ขาด: เลขรันใหม่/revise/ส่วนลด/เงื่อนไขชำระ/note template/เมนู |
| shipment_prep | ✅ มี (0067) | ต้องเปลี่ยนแหล่งเป็น SO + เลือกจำนวน |
| attachments + approval workflow master | ✅ มี (0027, 0028) | ใช้กับหลักฐาน won + เอกสารลูกค้า |
| holidays (วันทำการ) | ✅ มี (0018) | ใช้คำนวณ SLA 1 วันทำการ |
| audit (`recordAudit`) | ✅ มี (0049) | ทุก action ใหม่ต้อง log |
| **sales_leads / lead_events** | ❌ ไม่มี | greenfield ทั้งโมดูล (grep ยืนยัน) |
| **sale_orders (SO)** | ❌ ไม่มี | orders เดิมเป็นของ Tax คนละเรื่อง — ห้ามปนกัน |
| **อนุมัติ won / ปิดโครงการ** | ❌ ไม่มี | markWon ปัจจุบันตรง ไม่มี approval gate |
| **role Marketing / cap `salesplan:lead`** | ❌ ไม่มี | ต้องเพิ่มใน permissions.js (+บัญชีผู้ใช้ MK) |
| **formulaName / RD link** | ❌ ไม่มี | เฟส A เก็บเป็น text ก่อน ปลั๊กอิน RD ทีหลัง |
| dealType/template/segment/หน้ารวมโครงการ | 📋 แผนล็อกแล้ว | = เฟส A/B (แผน deal-project, มติครบ) |

---

## 8. ความเสี่ยง + การกัน

| ความเสี่ยง | การกัน |
|---|---|
| สโคปใหญ่ ลากยาว | ตัดเป็น 7 เฟส แต่ละเฟสจบในตัว ใช้งานได้จริงก่อนเฟสถัดไป; A–C ปล่อยเร็ว |
| เลข QT ซ้ำ/ข้ามเมื่อสร้างพร้อมกัน | sequence/lock ที่ DB ต่อเดือน ไม่นับที่ app |
| SO กับ orders (Tax) ปนกัน | ตารางแยก ชื่อชัด `sale_orders` + ไม่แตะ flow ภาษีเดิม |
| Won gate ทำให้ Sahamit PO flow สะดุด | PO = หลักฐานอัตโนมัติ → ขออนุมัติแบบ pre-filled ไม่เพิ่มงาน KA |
| KPI สร้างแรงจูงใจผิด (กรอกลีดขยะรายวัน) | วัด conversion ควบคู่จำนวน + Supervisor เห็น disqualified rate ต่อคน |
| SLA คำนวณผิดช่วงวันหยุด | ใช้ตาราง holidays จริง + unit test เคสคร่อมเสาร์อาทิตย์/วันหยุดยาว |
| flag quotations เปิดแล้วเจอบั๊กเดิม | อุด finding #8 (accept ยอด null) ก่อนเปิด + verify กับดีลจริง |
| เฟส A/B เสี่ยงเดิม (ดรอป unique ฯลฯ) | ตามการกันในแผน deal-project (deploy โค้ด list ก่อนรัน DDL) |

---

## 9. Open decisions (ขอมติก่อนเฟสที่เกี่ยว)

1. **Chatcone integration** — เฟส C ให้ Marketing กรอกมือก่อน (MVP) แล้วค่อยต่อ API/webhook อัตโนมัติทีหลัง? (เสนอ: กรอกมือก่อน — ได้ KPI ทันที ไม่บล็อกด้วยงาน integrate)
2. **ใครคือ Marketing ในระบบ** — เพิ่ม role ใหม่ `MK` หรือใช้บัญชี AC/ทีมกลางที่มีอยู่? (เสนอ: role ใหม่ `MK` เห็นเฉพาะเมนูลีด)
3. **เลขรัน QT** — XXXX รีเซ็ตทุกเดือน (ตามรูปแบบ YYMM) หรือรันต่อเนื่องทั้งปี? (เสนอ: รีเซ็ตต่อเดือน)
4. **SO number** — ใช้ SO-YYMMXXXX รูปแบบเดียวกับ QT? (เสนอ: ใช่)
5. **นัดประชุม** — บันทึกแค่บนลีด (เฟส C) พอไหม หรือต้องมีปฏิทินนัด/เชื่อม mgmt meetings? (เสนอ: บนลีดก่อน)
6. **FC accuracy** — สูตร `1−|FC−AT|/FC` ต่อดีลแล้วเฉลี่ย โอเคไหม + วัดเป็นรายเดือนตาม forecastMonth?
7. **เอกสาร Vendor** — requirement ยังไม่นิ่ง → จอดไว้เฟสอนาคต (ตามที่ระบุ "ค่อยพัฒนาต่อ")

---

## 10. แผนทดสอบ (ภาพรวม — รายเฟสเขียนตอนเริ่มเฟส)

- เดินเส้นเต็ม 1 รอบบน staging: กรอกลีด → คัดกรอง(จับเวลา SLA) → กระจาย → ติดต่อ → นัด →
  เปิดลูกค้า → เปิดโครงการ+แตกดีล SCENT/NPD → FC → QT 2 ออฟชั่น + revise → ลูกค้ารับ →
  แนบหลักฐาน → Supervisor อนุมัติ → SO ออกอัตโนมัติ → ใบเตรียมส่งของ (เลือกบางรายการ) →
  ปิดโครงการ → เปิด RE-ORDER ใหม่ → reopen
- ตีกลับ 2 จุด: ทีมผิด (ลีด) + เอกสารไม่ครบ (won) — ตรวจ event/audit ครบ
- KPI: สร้างข้อมูลคร่อมวันหยุด → SLA คิดวันทำการถูก; FC accuracy ตรงกับคำนวณมือ
- สิทธิ์: MK เห็นแค่ลีด · AE เห็นของตัวเอง · Senior เห็นทีม · Supervisor เห็นหมด + อนุมัติได้คนเดียว
