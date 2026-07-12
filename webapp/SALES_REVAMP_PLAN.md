# Sales Revamp — แผนแม่บทรื้อระบบบริหารงานขายทั้งเส้น (Lead → ปิดโครงการ)

> แผนรื้อโครงสร้างระบบบริหารงานขาย **ทั้ง frontend + backend** ครอบตั้งแต่ Marketing รับ Lead
> จนปิดโครงการและวนกลับมา RE-ORDER — **superset ของ** [`DEAL_PROJECT_RESTRUCTURE_PLAN.md`](DEAL_PROJECT_RESTRUCTURE_PLAN.md)
> (มติ 5 ข้อ + โมเดล ลูกค้า›โครงการ›ดีล + timeline segment + IA ของแผนนั้น **ยังใช้ทั้งหมด**
> และกลายเป็นเฟสต้น ๆ ของแผนนี้)
>
> สถานะ: **ร่างรอบ 2 — มติ #1–3 เคาะแล้ว** (2026-07-12: กรอกลีดมือ · role MK ใหม่ · เลข QT รีเซ็ตต่อเดือน
> + เพิ่มแผน Top bar ทั้งระบบ §5.1 + กติกาไฟล์แนบขึ้น Google Drive §2.4 + แผนที่ integration อนาคต §1.1)

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

### 1.1 แผนที่ integration ข้ามแผนก (มติผู้ใช้ — วางช่องรอ ยังไม่ implement)

| ประเภทดีล | ปลั๊กอินอนาคต | จุดเชื่อมที่เตรียมไว้ในแผนนี้ |
|---|---|---|
| SCENT | **RD** (สูตรกลิ่น) | `formulaName/formulaRef` บนดีล+โครงการ (เฟส A) — วันหน้าเปลี่ยนจาก text เป็น FK ไปตารางสูตรของ RD |
| NPD | **RD / PD / PC** | timeline segment มี task role RD/PD/PC อยู่แล้วใน template — วันหน้าต่อคิวงานรายแผนก/แจ้งเตือน + BOM (RD) + Code (PC) |
| RE-ORDER | **PD / PC** | เดียวกัน (REORDER template มี role PD/PC/QC ครบ) + สาย Sahamit material เดิม |

> หลักการ: **เฟสนี้เก็บ "ข้อมูลเชื่อม" ให้ครบ (สูตร, role บน task, dealId บน segment)**
> ตัว integration จริง (คิวงานแผนก, แจ้งเตือน, ระบบ RD) เป็นโมดูลอนาคต — ไม่บล็อกแผนนี้

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

**`sales_deal_activities` (0063 มีแล้ว: note/call/meeting/email/next_step ต่อดีล)** — มติผู้ใช้:
อัปเดต/บันทึกประชุม/ความเคลื่อนไหว **บันทึกแยกต่อดีล แล้วรวมที่โครงการ** (pattern เดียวกับ timeline segment):
```
+ activityAt timestamptz  (เวลานัด/เวลาเกิดเหตุการณ์ — แยกจาก createdAt เวลาบันทึก)
+ meetingMode ('onsite_customer_visit','onsite_at_office','online')  เฉพาะ kind='meeting'
· ระดับลีด (ก่อนเกิดดีล): นัด/ติดต่อบันทึกใน lead_events (เฟส C) — พอเปิดโครงการ ประวัติตามไปด้วย leadId
· ระดับโครงการ: feed รวมกิจกรรมทุกดีล เรียงเวลา (Project 360 เฟส G) — อ่านอย่างเดียว เขียนที่ดีลเสมอ
· อนาคต: ปฏิทินนัด = view อ่านจาก activityAt (kind meeting/next_step) ของลีด+ดีลทั้งหมด
  — ไม่มีตารางใหม่ ข้อมูลพร้อมตั้งแต่เฟส C; เชื่อม mgmt meetings ค่อยดูเมื่อถึงตอนนั้น
```

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

### 2.4 ไฟล์แนบทั้งหมด → Google Drive (กติกาบังคับ — มติผู้ใช้)

โครงสร้างพร้อมแล้ว: [`lib/drive.js`](src/lib/drive.js) (Shared Drive + Workload Identity Federation)
+ [`/api/upload`](src/app/api/upload/route.js) สลับ backend ด้วย env `STORAGE_BACKEND=drive` (mig 0048,
แผนเต็ม [`DRIVE_STORAGE_PLAN.md`](DRIVE_STORAGE_PLAN.md))

- **ไฟล์แนบใหม่ทุกตัวในแผนนี้** — หลักฐาน won (สลิป/PO), เอกสารเปิดลูกค้า, ไฟล์บนลีด —
  ต้องอัปโหลดผ่าน `/api/upload` เดิม (ห้ามยิง Supabase storage ตรง) → ไปลง Google Drive
- โฟลเดอร์บน Shared Drive: ตาม convention เดิมของ DRIVE_STORAGE_PLAN (ลูกค้า > ประเภทเอกสาร) —
  เพิ่มโฟลเดอร์กลุ่มใหม่: `ลูกค้า/<ชื่อ>/หลักฐานการขาย/` (won evidence) และ `ลีด/` (ไฟล์แนบลีด ถ้ามี)
- เช็กก่อนเริ่มเฟส C/E: **ยืนยันว่า prod ตั้ง `STORAGE_BACKEND=drive` แล้ว** (ถ้ายัง = ต้องเปิดก่อน
  ตามลำดับงานเดิมของ boundary-map ที่ให้ย้าย Drive เป็นงาน #1)

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
- Marketing เห็นเฉพาะ `/sa/leads` — **role ใหม่ `MK`** + capability `salesplan:lead` (มติ #2)

### 5.1 ย้าย Sidebar → Top bar ทั้งระบบ (frozen — มติผู้ใช้)

เปลี่ยน navigation ของ**ทุกโมดูล** (sales / PM / tax / database / sahamit / mgmt) จาก sidebar ซ้าย
เป็น **top bar ตรึงบนสุด** — แก้ที่ [`AppLayout.js`](src/components/AppLayout.js) จุดเดียว มีผลทั้งเว็บ
(memory: shared-ui-layer — layout กลางอยู่ไฟล์นี้)

**โครง Top bar (2 ชั้น, ตรึงทั้งคู่ `position: sticky; top: 0`):**

```
┌──────────────────────────────────────────────────────────────────────┐
│ โลโก้ SS · [ตัวสลับระบบ ▾]              …            🔔? · ชื่อผู้ใช้ ▾ │  ชั้นระบบ
├──────────────────────────────────────────────────────────────────────┤
│ ภาพรวม · ลีด · ดีล · โครงการ · ใบเสนอราคา · ไทม์ไลน์ · เป้าหมาย · KPI │  ชั้นเมนูของระบบ
└──────────────────────────────────────────────────────────────────────┘
   เนื้อหาเต็มความกว้างจอ (ไม่มี sidebar กินพื้นที่อีกต่อไป)
```

- **ชั้นระบบ**: ตัวสลับระบบเป็น dropdown (แทน hub card + sidebar group) + เมนูผู้ใช้/ออกจากระบบ
- **ชั้นเมนู**: รายการเดียวกับ sidebar group ปัจจุบันของระบบนั้น (reuse โครง `match`/capability
  filter เดิมทั้งหมด — เปลี่ยนเฉพาะการ render แนวนอน) + ขีดเส้นใต้รายการ active
- **Responsive**: จอแคบ → ชั้นเมนูเลื่อนแนวนอน (scrollable) ก่อน ถ้าแน่นมากค่อยยุบเป็น hamburger;
  ยึดมาตรฐาน responsive เดิม (memory: pm-responsive-views ใช้ breakpoint กลางที่มีอยู่)
- **ผลพลอยได้**: Gantt/ตารางกว้าง ๆ (ไทม์ไลน์รวม, grid เป้าหมาย 12 เดือน) ได้พื้นที่แนวนอนเพิ่มเต็มจอ
- **ความเสี่ยงต่ำเชิงข้อมูล** (ไม่มี migration/API) แต่**กระทบสายตาทุกหน้า** → ทำเป็นเฟสของตัวเอง
  ปล่อยครั้งเดียวทั้งเว็บ ไม่ปล่อยครึ่ง ๆ (บางระบบ sidebar บางระบบ top bar = สับสน)
- CSS: ตัวแปร `--topbar-h` แทน `--sidebar-w` + ปรับ sticky element เดิมที่เคยอ้างความสูง header
  (toolbar ใน PM/ตาราง master ที่ sticky อยู่แล้ว ต้องเลื่อน offset ตาม)

### 5.2 โลโก้บริษัท — กฎถาวรทั้งระบบ (มติผู้ใช้)

โลโก้ทางการ = **`public/brand-logo.png`** (ตราต้นไม้ในซุ้มโค้ง ขาวบนน้ำเงินกรมท่า — มีในรีโปแล้ว
ใช้อยู่แค่หน้า login + hub) → **กฎ: ต้องปรากฏทุกหน้าจอและทุกเอกสารที่ระบบออก**

| ที่ | การใช้ | ทำเมื่อ |
|---|---|---|
| Top bar (ชั้นระบบ) | โลโก้มุมซ้ายบนพื้น navy (โทนเดียวกับโลโก้ — ตัวแปร navy มีใน globals.css แล้ว) | เฟส T |
| เอกสารใหม่ทุกใบ | **helper กลาง `lib/printHeader.js`**: โลโก้ + ชื่อ/ที่อยู่บริษัท + เลขเอกสาร — ใช้กับ QT (FM-SA-01), SO, ใบเตรียมส่งของ | เฟส D/E/F |
| เอกสารพิมพ์เดิม | Gantt print (`ganttPrint.js`), รายงาน/ใบวางบิล Tax (`billPrint.js`, `reportPrint.js`) — เติมโลโก้ผ่าน helper เดียวกัน | ตอนแตะไฟล์นั้น หรือเก็บตกเฟส G |
| หน้า login/hub | ใช้อยู่แล้ว | — |

- ห้ามฝังโลโก้ก๊อปปี้หลายไฟล์ — อ้าง `public/brand-logo.png` ที่เดียว (เอกสาร PDF ฝังจากไฟล์นี้ตอน gen)
- ถ้าได้ไฟล์ SVG ต้นฉบับจากบริษัท ให้แทนที่เป็น `brand-logo.svg` (คมกว่าตอนพิมพ์) — จุดใช้ไม่ต้องแก้ถ้าทำผ่าน helper

---

## 6. เฟสการทำ (7 เฟส — เรียงตาม dependency + value)

> **สถานะ (2026-07-12): เฟส A / T / B / C / D เสร็จ + merge + mig 0088–0092 รันบน prod ครบแล้ว — ถัดไป = เฟส E**
>
> | เฟส | PR | หมายเหตุ |
> |---|---|---|
> | A รากฐานดีล | #228 | mig 0088 |
> | T Top bar | #234 | — |
> | B หลายดีล+segment | #235 | mig 0089+0090 |
> | C ลีด+SLA/KPI | #236 | mig 0091 (เลขจริง — แผนเดิมจอง 0092) |
> | D ใบเสนอราคา FM-SA-01 | #238 + #243 | mig 0092 (เลขจริง); #243 = feedback วิซาร์ด QT/FG picker/สร้างดีลหลายประเภทจากลีด |
> | — revert UI redesign | #244 | ย้อน #239–242 กลับดีไซน์เดิม (มติผู้ใช้) — งานใหม่ยึด Modal/window.confirm/top bar 2 ชั้น |
> | — ศูนย์รวมโครงการ | #245 + #246 | โครงการครอบดีลแบบจิ๊กซอว์: KPI rollup + การ์ดต่อดีล (QT/segment ใต้ดีล) + ฟีดรวม + เมนูครอบแท็บ ภาพรวม↔ไทม์ไลน์ |
> | — ปุ่มแก้ไข/ลบ QT | #247 | หน้ารวมใบเสนอราคา ต่อแถว (กติกาตาม API) |
>
> migration ถัดไปจองจาก **0093** (sale_orders / wonApproval — เลขจริงตอน merge)

### เฟส A ✅ · รากฐานดีล (= เฟส 1 เดิม) — mig 0088
dealType 3 ค่า + แยก template 3 ชุด + rename IA + dashboard 3 ประเภท + **เพิ่ม `formulaName`
บนดีล/โครงการ** (ช่องกรอก — ปลั๊กอิน RD ไว้ทีหลัง)

### เฟส B ✅ · โครงการหลายดีล + timeline segment (= เฟส 2 เดิม) — mig 0089+0090
list ฝั่ง PM → ดรอป unique → link-project → `project_tasks.dealId` + swimlane →
หน้ารวม `/sa/projects` + KPI FC Total/Actual/FC คงเหลือ

### เฟส T ✅ · Top bar ทั้งระบบ (§5.1) — ไม่มี migration · ขนานได้
- ปรับ `AppLayout.js` sidebar → top bar 2 ชั้น frozen + ตัวสลับระบบ + responsive
- ไล่ตรวจ sticky offset ทุกโมดูล (PM toolbar, ตาราง master, Gantt header)
- **แนะนำทำก่อนเฟส C** — เมนูใหม่ (ลีด/ใบเสนอราคา/ไทม์ไลน์/KPI) จะได้เกิดบน top bar เลย
  ไม่ต้องทำสองรอบ; ปล่อยครั้งเดียวทั้งเว็บ

### เฟส C ✅ · โมดูลลีด + SLA/KPI — mig 0092 (`sales_leads`, `lead_events`, +คอลัมน์ activities §2.2)
- หน้า `/sa/leads`: ฟอร์มกรอก (Marketing) · คิวคัดกรอง (Supervisor เลือกทีม) · คิวกระจาย (Senior เลือก AE)
  · ปุ่มบันทึกติดต่อ/นัดประชุม · ตีกลับพร้อมเหตุผล
- action "เปิดลูกค้า" (ส่งเข้า flow master เดิม — approval workflow ลูกค้าใหม่มีแล้ว 0027)
  → "เปิดโครงการ + แตกดีล" (สร้างโครงการ + ดีลใต้โครงการจากหน้าเดียว, ผูก `leadId`)
- วันทำการ: reuse ตาราง `holidays` เดิม + helper คำนวณ SLA
- หน้า `/sa/kpi` เวอร์ชันแรก (SLA ลีด + จำนวนกรอกรายวัน)
- **greenfield — ขนานกับ A/B ได้** ถ้าอยากได้ KPI ลีดเร็ว

### เฟส D ✅ · ใบเสนอราคาเต็มรูป (FM-SA-01) — mig 0093 (upgrade quotations + `quote_note_templates`)
- เลข QT-YYMMXXXX-R (sequence ต่อเดือนกันซ้ำที่ DB) · revision chain · ส่วนลดรายบรรทัด+ท้ายใบ
  · เงื่อนไขชำระ · หมายเหตุ + template ต่อประเภทบริการ
- เมนู `/sa/quotations` + วิซาร์ดสร้าง (เลือกดีล → ดึงลูกค้า/สินค้า/ราคา freeze → หลายออฟชั่นต่อดีล)
- พิมพ์/PDF ใช้ pattern `ganttPrint`/เอกสารเดิม
- เปิด `SALES_FEATURES.quotations = true` เมื่อครบ (ระวังบั๊กเดิม finding #8: accept ยอด null ทับ projectValue)

### เฟส E ⏳ (ถัดไป) · อนุมัติ Won + SO — mig 0094 (`sale_orders`) + 0095 (ฟิลด์ wonApproval)
- flow ใหม่แทน markWon ตรง: AE แนบหลักฐาน (บังคับ) → ส่งขอ → Supervisor อนุมัติ/ตีกลับ →
  อนุมัติแล้วจึง `markWon()` (นิยาม win = confirmed+deposit เดิม + มีหลักฐาน + อนุมัติ)
- ออก SO อัตโนมัติจากใบเสนอราคาที่ accept (1 ดีล = 1 SO, unique) — แก้ SO ต้องยกเลิก+ออกใหม่ (audit)
- RE-ORDER: ปิด won ต้องระบุโครงการ (มติเดิม #3) — บังคับที่จุดเดียวกันนี้
- Sahamit PO settle = ทางลัด won เดิม → ปรับให้แนบ PO เป็นหลักฐานอัตโนมัติ (เอกสารมีอยู่แล้วในระบบ)

### เฟส F · ส่งต่องาน + ใบเตรียมส่งของ + ปิดโครงการ — mig 0096
- handoff: won แล้ว activate segment ถัดไป — SCENT → งาน RD · NPD → งาน RD/PD/PC · RE-ORDER → งาน PD/PC
  (role เหล่านี้มีใน template อยู่แล้ว — ตัว integration จริงตาม §1.1 เป็นโมดูลอนาคต)
- shipment_prep v2: สร้างจาก SO → เลือกรายการ + จำนวนส่ง (ส่งบางส่วนได้ ยอดสะสม ≤ SO)
- ปิดโครงการ: เงื่อนไขครบ → ขออนุมัติ → Supervisor ปิด; RE-ORDER ใหม่ → reopen อัตโนมัติ
- เฟส 3 เดิม (Sahamit PO แนบโครงการเดิม — mig 0091) รวมอยู่เฟสนี้

### เฟส G · 360 + KPI เต็มรูป + เมนูไทม์ไลน์รวม
- Project 360 feed + Customer 360 (เฟส 4 เดิม) + `/sa/timeline` Gantt รวม + `/sa/kpi` เต็ม
  (FC accuracy, %Target, conversion funnel ลีด→ลูกค้า→won) + drill-down
- feed โครงการ = กิจกรรมทุกดีล + lead_events ก่อนเปิดโครงการ เรียงเวลาเดียว (เขียนที่ดีล/ลีดเสมอ)
- (อนาคต หลัง G) ปฏิทินนัดรวม — view จาก `activityAt` ของลีด+ดีล; เชื่อม mgmt meetings ค่อยตัดสินใจตอนนั้น

**ลำดับบังคับ:** A → B (DB unique) · D ก่อน E (SO อ้างใบเสนอราคา) · C ขนานได้ · F หลัง E · G ท้าย
· **T ขนานได้ทุกเมื่อ แนะนำก่อน C** · เช็ก `STORAGE_BACKEND=drive` บน prod ก่อน C/E (§2.4)

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
| Top bar ทำ sticky element เดิมเพี้ยน (toolbar PM/หัวตาราง) | ตัวแปร `--topbar-h` กลาง + ไล่ตรวจทุกโมดูลก่อนปล่อย + ปล่อยครั้งเดียวทั้งเว็บ |
| ไฟล์แนบหลุดไป Supabase storage | code review gate: อัปโหลดผ่าน `/api/upload` เท่านั้น + ยืนยัน `STORAGE_BACKEND=drive` บน prod |

---

## 9. มติ + open decisions

**เคาะแล้ว (2026-07-12):**

| # | เรื่อง | มติ |
|---|---|---|
| 1 | Chatcone | **กรอกมือก่อน** — ต่อ API/webhook ทีหลัง |
| 2 | Marketing ในระบบ | **role ใหม่ `MK`** เห็นเฉพาะเมนูลีด |
| 3 | เลขรัน QT | **รีเซ็ตทุกเดือน** (ตามรูปแบบ YYMM) |
| — | ไฟล์แนบ | **Google Drive เท่านั้น** (ผ่าน `/api/upload` + `STORAGE_BACKEND=drive`) ไม่ใช้ Supabase storage |
| — | Navigation | **ย้าย sidebar → top bar frozen ทั้งระบบ** (§5.1, เฟส T) |
| — | Integration อนาคต | SCENT→RD · NPD→RD/PD/PC · RE-ORDER→PD/PC (§1.1 — วางช่องเชื่อมไว้ ยังไม่ implement) |
| 5 | นัดประชุม/ความเคลื่อนไหว | **บันทึกแยกต่อดีล → รวม feed ที่โครงการ** (pattern เดียวกับ timeline); ลีดใช้ lead_events ช่วงก่อนเกิดดีล; ปฏิทินนัด = view อนาคตอ่านจาก `activityAt` (§2.2) |

**ยังเปิดอยู่ (ตอบก่อนเฟสที่เกี่ยว):**

4. **SO number** — ใช้ SO-YYMMXXXX รูปแบบเดียวกับ QT? (เสนอ: ใช่ — ตอบก่อนเฟส E)
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

<!-- deploy bump 2026-07-13 -->
<!-- deploy bump 2 -->
