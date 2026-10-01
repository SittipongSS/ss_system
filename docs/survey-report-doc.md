# รายงานการประเมินพื้นที่ (FM-TS-01 · เลขที่ SU-YYMMXXXX-R)

> สถานะ: **กำลังดำเนินการ** · ตรวจกับโค้ดเมื่อ 2026-10-01 · PR-1 (ฐานราก) + PR-2 (ออกเลข · ตรึง · เสิร์ฟ · สิทธิ์) สร้างเสร็จ ยังไม่ merge · mig `0401` รันแล้ว (01/10) ·
> PR-2 **ขึ้นแบบปิดสวิตช์** (`SURVEY_REPORT_ISSUE_AT_SEND` ยังไม่ตั้ง) และ **ไม่แตะไฟล์จอสักไฟล์** · PR-3 (ลงทะเบียนมาตรฐาน `siteSurvey` + จอ) ยังไม่เริ่ม

เอกสาร A4 ที่ออกตอนหัวหน้าฝ่ายบริการกด "ส่งผลให้ฝ่ายขาย" ของคำร้องประเมินพื้นที่ — **ภาพนิ่งชุดเดียว สองฉบับ**:
ฉบับลูกค้า กับฉบับภายใน (แถบ "ฉบับภายใน — ห้ามส่งลูกค้า" ทุกหน้า)

กระดานที่เจ้าของอนุมัติ + แผน + สเปก อยู่นอกรีโป: `~/ss-team/mockups/survey-report-doc/`
(`project/R-*.dc.html` · `shots/R-*.png` · `PLAN.md` §8–§9 · `PR-1.md` · `PR-2.md`) — **มติท้ายสุดชนะข้อความเก่าในแผน**
(`PR-2.md` มีตารางมติ 34 ข้อ + คำตอบเจ้าของ 01/10 สี่ข้อ — ที่ต่างจาก `PLAN.md` §3 ให้ยึด `PR-2.md`)

## มติเจ้าของ (28/09 – 01/10/2026)

1. เอกสารเดียว สองฉบับ จากภาพนิ่งเดียวที่ถ่ายตอนส่งผล
2. เลขของตัวเอง `SU-YYMMXXXX-R` (ตัวนับรายปี · ดึงกลับแล้วส่งใหม่ = R ถัดไป) · แบบฟอร์ม `FM-TS-01` Rev.00
3. หน้า 1: หัว · กล่องลูกค้าและสถานที่ · กล่องการประเมิน (**ไม่มีผู้อนุมัติ**) · ตารางเดียว "1. พื้นที่ที่ประเมินและข้อเสนอ"
   (ขนาดแพ็ค กับ แพ็ค/เดือน คนละคอลัมน์) — ไม่มีวัตถุประสงค์ การ์ดสรุป ขอบเขต เครื่อง รุ่น ราคา
4. **ฉบับลูกค้าไม่มีจุดติดตั้งเลย** (ไม่มีคอลัมน์ ไม่มีส่วน ไม่มีบรรทัดอธิบาย) · หน้าพื้นที่ = ภาพกว้าง + ผัง + หมายเหตุ หนึ่งพื้นที่ต่อหน้า ·
   ฉบับภายในเพิ่มส่วน "จุดที่ติดตั้งได้ / POSSIBLE INSTALL SPOTS" (เฉพาะจุดที่หัวหน้าเลือก · รูปผูกด้วย `metadata.spotId`)
5. หน้าสุดท้ายของทั้งสองฉบับ = การรับรองผลอย่างเดียว ชิดล่าง (ที่นั่งลูกค้า: ลงชื่อ · (ชื่อ) · วันที่ — ไม่มีบรรทัดอื่น) ·
   ฉบับภายในต่อด้วยภาคผนวก ก–จ
6. หัววิ่งหน้า 2+ ขวามือมีแค่เลขที่ SU · ท้ายกระดาษ: บริษัท · บรรทัดแบบฟอร์ม · เลขที่ · หน้า x / N
7. เวลาเข้าจริงที่ไม่น่าเชื่อ (0 นาที · ปิดงานย้อนหลัง) ฉบับลูกค้าพิมพ์เวลานัด "HH:MM น. (ตามนัด)" · ฉบับภายในบอกทั้งคู่
8. พื้นที่ที่ตัดออกไม่อยู่ในฉบับลูกค้า · รูปจุดที่ยังไม่ผูกบล็อกการส่ง (PR-S)
9. สิทธิ์: ฉบับลูกค้า = หัวหน้าฝ่ายบริการ + ผู้บริหาร + AE ผู้ขอ/ทีมเดียวกัน · ฉบับภายใน = หัวหน้าฝ่ายบริการ (รวม `ts_senior`) + ผู้บริหาร ·
   **ฝ่ายขายไม่ได้ฉบับภายในไม่ว่าทางไหน · ช่างไม่ได้อะไรเลย** (ตารางเต็มในหัวข้อ "สิทธิ์")
10. **ออกตอนกด "ส่งผลให้ฝ่ายขาย"** · ดึงผลกลับแล้วส่งใหม่ = Rev ถัดไป ฉบับเก่าถูกแทนที่ (เจ้าของตอบ 01/10 ข้อ 1)
11. **ปัญหาของใบตีกลับการส่งผลก่อนเขียนอะไร** — ผังเป็น PDF/HEIC/BMP · รูปเปิดไม่ได้หรือหายจาก Drive · ไม่มีนัดที่ปิด/ไม่มีวัน/ไม่มีผู้ประเมิน ·
    หน้าที่ลงกระดาษไม่ได้ · **ปัญหาของระบบไม่ตีกลับ** (Drive ล่ม · ที่เก็บไฟล์ · ข้อมูลบริษัท/แบบฟอร์ม) — ผลไปถึงฝ่ายขาย หัวหน้ากด "ออกเอกสาร" ทีหลัง
12. ข้อความของช่างพิมพ์บนฉบับลูกค้า **ตามที่พิมพ์** · คำเครื่อง/จุดในหมายเหตุพื้นที่ และอักขระที่กระดาษพิมพ์ไม่ได้ **เตือนอย่างเดียว**
    ในรายการเดียวที่หัวหน้ารับทราบ (`seenWarnings`) — ไม่บล็อก (เจ้าของตอบ 01/10 ข้อ 2)
13. เอกสารที่ออกทีหลังด้วยปุ่ม "ออกเอกสาร" เขียนบรรทัดเธรด **หนึ่งบรรทัด** บนคำร้อง `ออกเอกสารประเมิน SU-… แล้ว — ดาวน์โหลดได้ที่หน้าคำร้อง`
    (กระดิ่งถึงผู้ขอหนึ่งครั้ง) · เอกสารที่ออกในการส่งผลไม่เขียนเพิ่ม (เจ้าของตอบ 01/10 ข้อ 3)
14. Rev ที่ถูกแทนที่: PR-2 **แค่ลิสต์ให้หัวหน้าเห็น** (เลข · วันที่ · เหตุ) ไฟล์เปิดไม่ได้ (409) · เปิดพร้อมลายน้ำ "ถูกแทนที่" เป็น PR ถัดไป (ข้อ 4)

## สายการทำงาน

```
อินพุต (แถวประเมิน + ไฟล์ + คำร้อง + นัด + ทะเบียนขนาด)
  → buildSurveyReportSnapshot      ภาพนิ่ง v1 (ไม่อ่านนาฬิกา ไม่แตะฐาน)
  → surveyReportView(version)      ข้อความพร้อมพิมพ์ต่อฉบับ — ฉบับลูกค้าเป็นรายการอนุญาต
  → paginateSurveyReport(view)     แผนหน้า ต่อฉบับ (เลขหน้า · คอลัมน์ "หน้า" · บรรทัด "ต่อหน้า n")
  → renderSurveyReportHTML         กระดาษ HTML ไฟล์เดียว (ฟอนต์ฝัง · รูปเป็น token `su-img:<sha>`)
  → resolveImageTokens → renderHtmlPdf   PDF A4 ด้วย chromium ตัวเดียวกับ QT/SO
```

PR-2 ห่อสายนี้เป็น **สองขั้น ซึ่งเดินต่อได้จากแถวล้วน ๆ** (ไม่มีคอลัมน์สถานะ ไม่มีแถว "ล้มเหลว"):

```
ขั้นออกเลข  issueSurveyReport        อินพุต → ด่าน → รูป (Drive → sharp → img/<sha>.jpg) → ภาพนิ่ง → [วัดกระดาษ] → RPC issue_survey_report
            เรียกจาก: เส้นส่งผล (หลังคำตอบ กระดิ่ง audit) · POST "ออกเอกสาร"
ขั้นกระดาษ  ensureSurveyReportPaper  วัดสองฉบับใน chromium → ตรึง HTML (เขียนครั้งเดียว) → เก็บ pdf/<reportId>/<ฉบับ>.pdf
            เรียกจาก: GET แรกของเอกสาร · POST "ออกเอกสาร" — **เส้นส่งผลไม่เปิด chromium เลย**
```

| ไฟล์ (`webapp/src/lib/…`) | หน้าที่ |
|---|---|
| `service/surveyReportNumber.js` | รูปเลข SU · ชื่อไฟล์ PDF (ป้ายฉบับไม่ถูกตัด · ชื่อลูกค้าตัดที่ขอบคำ ที่เดียวกันทั้งสองฉบับ — สองไฟล์ต่างกันแค่ `_ภายใน`) |
| `service/surveyVisitTime.js` | เวลาเข้าจริงเชื่อได้ไหม + ข้อความเวลาต่อฉบับ |
| `service/surveyReportSnapshot.js` | ภาพนิ่ง v1 · ด่านตรึง (`surveyReportFreezeBlockers`) · รายการรูปที่ต้องดึง (`surveyReportImageFiles`) |
| `service/surveyReportView.js` | ตัวกรองสองฉบับ · `customerFreeTextWarnings` (เครื่อง/รุ่น/ราคา · จุดติดตั้ง) |
| `service/surveyReportLayout.js` | ตัวจัดหน้า + ค่าคงที่พิกเซล (`SURVEY_REPORT_PX`) · `overflow` / `surveyReportOverflowErrors` · `surveyReportMixLines` |
| `service/surveyReportDocument.js` | แม่แบบ HTML + CSS ที่ย้ายจากกระดาน · `resolveImageTokens` · `SURVEY_REPORT_RENDERER_VERSION` |
| `documents/htmlPdf.js` | HTML → PDF ตัวกลาง (`launchBrowser` · `renderHtmlPdf` · `measureSheets`) — `sales/quotationPdf.js` เป็นตัวห่อ export เดิม |
| `service/surveyReportTestKit.mjs` | ชุดทดสอบร่วมของเทสต์กับ harness (แฝดสังเคราะห์ · ชุดเครื่องหมายรั่ว · ชุดสุดขอบ) |
| `webapp/scripts/render-survey-report.mjs` | harness เรนเดอร์ในเครื่อง · `--pipeline` เดินสองขั้นของ PR-2 บนฐาน/ถัง/Drive ในหน่วยความจำ |
| `webapp/supabase/migrations/0401_survey_report_documents.sql` | ตาราง `service_survey_reports` + RPC ออกเลข + trigger แทนที่ฉบับเก่า + ถัง `survey-report` — **รันแล้ว 01/10** · PR-2 ไม่มี migration |

PR-2 — โมดูลฝั่ง server **แบ่งตามน้ำหนัก** (มติ 24): GET ใบประเมินที่ช่างเปิด · GET/PATCH คำร้อง · ดึงผลกลับ import ได้แค่ `surveyReportRows` ·
ของหนักเข้าทาง `await import()` ข้างในฟังก์ชันเท่านั้น (ด่าน `check-doc-tracing.mjs` ตรวจผลของ build จริง)

| ไฟล์ | หน้าที่ | ของหนัก |
|---|---|---|
| `service/surveyReportRows.js` | `SURVEY_REPORT_BUCKET` · `SURVEY_REPORT_COLUMNS` (ไม่มีภาพนิ่ง/HTML) · ยาม `surveyReportStoreAllowed()` · สวิตช์ `surveyReportIssueAtSend()` · `loadSurveyReports` → `{ reports, error }` · `surveyReportVoided` · `surveyDocumentSummary` (คีย์ของ GET สำหรับจอ) | ไม่มี (ตัวตรวจโหลดด้วย `await import('./surveyReportInputs')` เมื่อต้องใช้) |
| `service/surveyReportState.js` | ตรรกะล้วน: `surveyReportState` (สถานะจากแถว) · `surveyReportRpcError` / `surveyReportRpcConflict` · `surveyReportPaperIssues` · `surveyReportCustomerHtmlIssues` (ยามกันรั่ว) | ไม่มี |
| `service/surveyReportInputs.js` | `loadSurveyReportInputs` → `{ inputs, unknown }` · `surveyReportPrecheck` (รอบตรวจก่อนส่งผล) — **SELECT อย่างเดียว** | ไม่มี |
| `service/surveyReportImages.js` | `prepareSurveyReportImages` · `downscaleSurveyImage` · `surveyReportImagePath` | `await import('sharp')` · `await import('@/lib/drive')` |
| `service/surveyReportIssue.js` | `issueSurveyReport` (I0–I8) | `await import('./surveyReportImages')` — **ห้าม import `surveyReportPaper`/`htmlPdf`** (เส้นส่งผลจะลาก chromium) |
| `service/surveyReportPaper.js` | `ensureSurveyReportPaper` (P1–P7) · `measureSurveyReportPaper` (I5b) · `surveyReportPrintSession` · `surveyReportPdfPath` | `await import('@/lib/documents/htmlPdf')` |
| `service/surveyAccess.js` | `canOpenSurveyDocument` · `surveyDocAccess` · `surveyDocVersion` | ไม่มี |
| `documents/pdfInspect.js` | `pdfPageCount` · `pdfFonts` · `pdfInspect` (bytes · sha256 · pages · fonts) — ตัวเดียวของขั้นกระดาษกับ harness | `node:crypto` (server เท่านั้น — จอห้าม import `surveyReportState.js`) |
| `documents/documentFontRanges.js` | `DOCUMENT_FONT_CODEPOINTS` · `uncoveredChars` — อักขระที่ฟอนต์ฝังพิมพ์ได้จริง | ไม่มี |
| `app/api/service/surveys/[id]/document/route.js` | GET (เสิร์ฟ PDF/HTML · ฉบับร่าง) · POST ("ออกเอกสาร") | ผ่านสองขั้นข้างบน |
| `webapp/scripts/check-doc-tracing.mjs` | ด่าน CI หลัง build: ไบนารีไปกับ route ที่ใช้ · route เบาไม่ลากของหนัก | — |
| `webapp/scripts/check-survey-report-inputs.mjs` | ตรวจของจริงแบบอ่านอย่างเดียว: เปิดสวิตช์แล้วใบไหนถูกตีกลับ | — |

## กติกาที่ต้องรู้ก่อนแก้

- **ฉบับลูกค้าไม่รั่ว สามชั้น** — view เป็นรายการอนุญาต · ชิ้นของฉบับภายในอ่านป้ายจาก view ฉบับภายในเอง
  (ไม่มีคีย์ = ไม่มีอะไรให้พิมพ์) · CSS ของฉบับภายในแยกก้อน ไม่ฝังลงฉบับลูกค้า
  เทสต์ `surveyReportDocument.test.mjs` grep **ทั้งไฟล์ HTML** ⇒ CSS ของกระดาษห้ามมีคอมเมนต์ (คำอธิบายอยู่ในคอมเมนต์ JS)
- **ตัวเรนเดอร์ไม่คิดเอง** — ข้อความมาจาก view · การขึ้นหน้ามาจากแผนหน้า · เพิ่มของบนกระดาษ = เพิ่มที่ view และนับความสูงที่แผนหน้าก่อน
- **แผ่นเป็น `<article class="sheet su-page">` ตัวเดียว** ข้างในไม่มี `<article>` ซ้อน (ลายน้ำของเปลือกกับผู้ที่ตัดแผ่นพึ่งข้อนี้)
- **แก้ CSS/markup = ความสูงเปลี่ยน** ⇒ รัน harness `--assert` + `--stress` แล้วแก้ `SURVEY_REPORT_PX` กับเทสต์พร้อมกัน
  และขึ้น `SURVEY_REPORT_RENDERER_VERSION` (กระดาษที่ตรึงแล้วพก CSS ของวันที่ออกไปด้วย แก้ทีหลังไม่ถึงใบเก่า)
- **เลขที่กับวันที่ออกไม่อยู่ในภาพนิ่ง** — เป็นคอลัมน์ของแถว (เลขเกิดใน RPC) ตัวเรนเดอร์รับแยก
- **ชุดรูปที่พิมพ์มีที่เดียว** (`zoneFiles` ใน `surveyReportSnapshot.js`): ภาพกว้างทุกรูป · ผัง **รูปล่าสุดรูปเดียว** · **รูปแรก** ของจุดที่หัวหน้าเลือก
  — ตัวดึงรูป · คอลัมน์ `images` · ด่าน "รูปยังเตรียมไม่เสร็จ" · ด่าน HEIC ใช้ชุดนี้ชุดเดียว ⇒ ผังรูปเก่า รูปที่สองของจุด หรือ HEIC บนจุดที่ไม่เลือก
  ไม่บล็อก (ใบที่ส่งผลแล้วถูกล็อก หัวหน้าเปลี่ยนไฟล์ไม่ได้ถ้าไม่ดึงผลกลับ) · ที่ยังบล็อก: HEIC ที่ทำให้กระดาษขาดรูป (ภาพกว้าง · ผังรูปล่าสุด ·
  จุดที่เลือกซึ่งไม่มีรูปอื่น) และ **พื้นที่ที่ไม่มีภาพผังที่พิมพ์ได้** (ด่านส่งผลนับไฟล์ตามหมวด — PDF ก็ผ่าน)
- **ของที่แผนตัดบรรทัดเอง ตัวเรนเดอร์ต้องพิมพ์ตามแผน** — ช่อง "ขนาดแพ็ค" ของแถวรวม (`page.mix` · `block.mix`) กับเชิงอรรถของภาคผนวก ก
  (`block.foot`) เป็นบรรทัดสำเร็จรูปที่พิมพ์แบบห้ามตัด ⇒ ความสูงบนกระดาษ = ที่แผนนับเสมอ (เดิมแถวรวมถูกนับ 34px ตายตัว แต่สามขนาดขึ้นไป
  ตกเป็นสองสามบรรทัด — 10 พื้นที่ + สามขนาดเลยขอบหน้า 1)
- **ข้อความยาวเกินหน้าแบ่งได้** — เหตุผลของภาคผนวก ค กับบรรทัดของ ง ถูกแผนแบ่งเป็นท่อน (`skip` / `stop` = ตำแหน่งตัวอักษร) แล้วพิมพ์ต่อหน้า
  ถัดไปในแถว "(ต่อ)" · ของที่แบ่งไม่ได้และสูงเกินหน้าจริง ๆ ถูกรายงานใน `layout.overflow` — ลิสต์นี้ไม่ว่าง = **ตีกลับการส่งผล** (S5 · เหตุชนิด `content`) และ
  **ไม่ออกเลข ไม่ตรึง** (I3 · I5 · P2) · `surveyReportOverflowErrors(layout)` ให้ข้อความไทย
- **อักขระต้องอยู่ในฟอนต์ที่ฝัง** — กระดาษฝัง Sarabun ชุด latin + thai เท่านั้น · "≤" "⇒" ไม่มี ⇒ ตกไปฟอนต์ของเครื่อง และ chromium บน production
  (มีแต่ Open Sans) จะพิมพ์กล่องสี่เหลี่ยม · เทสต์ช่วงอักขระ + เทสต์ glyph จริง `uncoveredChars`
  (`surveyReportDocument.test.mjs`) + ด่านฟอนต์ของ harness คุมข้อความของแม่แบบ · ข้อความที่คนพิมพ์ = คำเตือนของเส้นส่งผล (หัวข้อ "คำเตือนกับฟอนต์")
- **หมายเหตุปิดท้ายพื้นที่เสมอ** — มีแถวรูปล้นไปหน้า "(ต่อ)" เมื่อไร หมายเหตุไปอยู่ท้ายหน้า "(ต่อ)" หลังรูปที่เหลือ (กระดาน R-C-2 "PAGE RULE")
  · หมายเหตุไม่ขึ้นหน้าใหม่ตัวเดียว (แถวรูปแถวสุดท้ายไปด้วย) · **ผังอยู่หน้าหลักเสมอ ไม่ย้ายตามรูปที่ล้น** (กระดานกำหนด)

## PR-2 — ออกเลข · ตรึง · เสิร์ฟ (สร้างเสร็จ 01/10/2026 · ยังไม่ merge)

### สวิตช์กับยาม — ทำไม merge แล้วยังไม่มีอะไรเปลี่ยน

- **`SURVEY_REPORT_ISSUE_AT_SEND=on`** (env ฝั่ง server · production) = ส่งผลแล้วออกเอกสารด้วย · ปิดอยู่ = เส้นส่งผลไม่ตรวจรูป ไม่ตรวจเอกสาร
  ไม่ออกเลข ไม่อ่านแถวเอกสาร ไม่โหลด `sharp` · ค่าอื่นทุกค่า (`1` · `true`) = ปิด · **ห้ามเปิดก่อน PR-3 ขึ้น**: โมดัลยังไม่บอกว่าจะออกเอกสาร
  (กติกา #1223) และจอรุ่นเก่าที่ไม่ส่ง `seenWarnings` จะถูกตีกลับทุกครั้ง
- **ยามเขียนถาวร `surveyReportStoreAllowed()` = `VERCEL_ENV === 'production'`** — คุม RPC ออกเลข · อัป `img/` และ `pdf/` · การตรึง · การเขียนที่อยู่ไฟล์
  🔴 dev DB = prod DB และ GET แรกของเอกสาร **เขียน** (ตรึงคอลัมน์ที่เขียนได้ครั้งเดียว) ⇒ preview deploy หรือเครื่องนักพัฒนาที่มี
  `PUPPETEER_EXECUTABLE_PATH` จะตรึง Rev ของจริงด้วยตัวเรนเดอร์ของ branch กับฟอนต์ของ Mac · ที่อื่นนอก production: PDF/HTML ที่ตรึงแล้วเสิร์ฟได้ ·
  ฉบับร่างดูได้ · อะไรที่จะเขียน = 409 `เครื่องนี้ไม่ใช่ระบบจริง (production) — ออกหรือตรึงเอกสารจากเครื่องทดสอบไม่ได้`
- มีผลไม่ว่าสวิตช์เปิดหรือปิด (สามเรื่องเล็ก): ฐานของส่วนต่างรอบก่อนตอนส่งผล + `meta.totals` บนแถวเธรด `answer` · ยามกดดึงผลกลับซ้ำ ·
  `meta.closedBySend` บนบรรทัดเธรดของนัดที่ถูกปิดพร้อมส่งผล
- **ราคาที่จ่ายแม้สวิตช์ปิด — สอง GET** (สเปก §10 ยอมรับ "for heads only" · ไม่มีอะไรเปลี่ยนบนจอ ไม่มีการเขียน): คนที่มีสิทธิ์เอกสารอ่านแถว
  `service_survey_reports` เพิ่มหนึ่งครั้ง (ช่าง/Planner บน GET ใบประเมิน: ไม่อ่านเลย) · **หัวหน้าฝ่ายที่เปิดใบที่ตอบแล้วและยังไม่มีเอกสาร** (`missing` —
  วันนี้คือทุกใบที่ตอบแล้ว เพราะยังไม่มีแถวเอกสารสักแถว) GET ใบประเมินวิ่งตัวตรวจของปุ่ม "ออกเอกสาร" ทั้งชุดทุกครั้งที่โหลด/สลับกลับมาที่แท็บ:
  ไฟล์รายพื้นที่ + ทะเบียนขนาด (อ่านซ้ำ) + ตัวโหลดข้อมูลเอกสาร (ทะเบียนโซน · นัด · เธรดนัด · ชื่อทีมจาก auth · ไซต์ · ลูกค้า · ดีล · ประวัติคำร้อง ·
  ข้อมูลบริษัท · แบบฟอร์ม) + ประกอบภาพนิ่งและแบ่งหน้าสองฉบับ ≈ N+11 คำสั่งอ่าน อยู่ในรอบขนานเดียวกับของประกอบอื่น · ผล (`document.issue`)
  ยังไม่มีจอไหนอ่านจนกว่า PR-3 ขึ้น · ล้ม = `unknown: true` ไม่ใช่ GET ล้ม · ใบที่ยังไม่ตอบ / ใบที่มีเอกสาร / ผู้ขอ / ช่าง ไม่จ่าย
  (เทสต์ `surveyReportRecallGetReopen.test.mjs` ล็อกขอบเขตนี้) · อยากให้เงียบจนกว่า PR-3 ขึ้น = ทำให้ `withChecks` เป็นแบบขอเอง (เปลี่ยนสัญญา §10)
- **เส้นดึงผลกลับแข็งขึ้น** (มีผลไม่ว่าสวิตช์เปิดหรือปิด · ไม่มีจอไหนเปลี่ยน): รับเฉพาะหัวข้อ `site_survey` (หัวข้ออื่น 404) และเฉพาะคนที่ตอบใบของฝ่ายนั้นได้
  (`canAnswerRequest` ตัวเดียวกับเส้นส่งผล · 403) · ผลวัดถูกอ่าน **ก่อน** update — อ่านพลาด = 500 โดยยังไม่มีอะไรถูกเขียน กดใหม่ได้
- ย้อนกลับ: ถอด env แล้ว redeploy — เอกสารที่ออกไปแล้วยังใช้ได้ ไม่มีอะไรถูกย้อนในฐาน

### สถานะของเอกสาร — อนุมานจากแถว (`surveyReportState(request, reports, { now, issueAtSend })`)

| สถานะ | แถว | ความหมาย |
|---|---|---|
| `not_sent` | ยังไม่ตอบ ไม่มีแถว | ยังไม่เคยออก |
| `recalled` | ยังไม่ตอบ มีแถว (ถูกแทนที่หมด) | ส่งรอบหน้า = Rev ถัดไป |
| `issuing` | ตอบแล้ว ไม่มีฉบับ `current` · สวิตช์เปิด · ตอบมาไม่เกิน 180 วิ | น่าจะกำลังออก (เดาจากนาฬิกา) |
| `missing` | ตอบแล้ว ไม่มีฉบับ `current` | ตอบแล้วไม่มีเอกสาร — หัวหน้ากด "ออกเอกสาร" |
| `issued` | มีฉบับ `current` · `frozenAt` ว่าง | มีเลข + ภาพนิ่ง + รูป ยังไม่มีกระดาษ |
| `frozen` | `frozenAt` มี · ที่อยู่ PDF ยังไม่ครบ | HTML ตรึงแล้ว รอ PDF |
| `ready` | ที่อยู่ PDF ครบสองฉบับ | เสร็จ |
| `stale` | ฉบับ `current` ที่ `approvedAt` ≠ `answeredAt` ของคำร้อง (เทียบเป็นมิลลิวินาที) | trigger แทนที่ไม่ยิง — ไม่เสิร์ฟ ไม่ใช้ซ้ำ แก้ด้วยมือ |

### เส้นส่งผล `POST /api/service/surveys/[id]/send` (`runtime = 'nodejs'` · `maxDuration = 300`)

ลำดับ (S2–S5 ทำเฉพาะสวิตช์เปิด และ **ตีกลับได้เฉพาะก่อนเขียน** — นัดถูกปิดก่อนตอบใบ หลังจุดนั้นห้ามมีอะไรตีกลับ):

1. **S2 จอรุ่นเก่า** — `body.seenWarnings` ไม่ใช่ลิสต์ → 409 `SURVEY_SEND_OLD_PAGE_ERROR` (ก่อนอ่านอะไรเพิ่ม)
2. **S3 ตรวจรูปก่อนเขียน** — `prepareSurveyReportImages(…, { deadline: 60 วิ })` · ไฟล์ที่ **ตัวไฟล์เองเปิดไม่ได้** (ถอดรหัสไม่ได้ · หายจาก Drive ·
   ไม่มี `driveFileId` · ใหญ่เกิน) → 409 `รูป n รูปเปิดไม่ได้ — อัปใหม่เป็น JPG แล้วส่งอีกครั้ง (ชื่อไฟล์ …) · ยังไม่ได้ส่งผล` · Drive ช้า/ล่ม ·
   หมดงบ · โหลด sharp ไม่ได้ = **ไม่ตีกลับ** ลง log แล้วส่งต่อ · แผนที่รูปส่งให้ S8 (ไม่ดึงซ้ำ)
3. **S4 ด่านเดิม** — หกข้อ · ขนาดแพ็คเกจ · รูปจุด (ที่เดิม เนื้อเดิม)
4. **S5 เหตุของเอกสาร** — ① นัดที่ค้างเป็นร่าง → ประโยคของ `surveySendVisitStep` ② `surveyReportPrecheck` เจอคำเตือนที่ไม่อยู่ใน `seenWarnings`
   → 409 `SURVEY_SEND_WARNINGS_CHANGED_ERROR` ③ เหตุชนิด `content` → 409 `ออกเอกสารไม่ได้ — <เหตุ> | <เหตุ> · ยังไม่ได้ส่งผล` ·
   ตัวตรวจอ่านไม่ครบ (`unknown`) หรือโยน = ข้าม ② ③ แล้วลง log
5. **เขียน** (ปิดนัด → ตอบใบ) — บรรทัดเธรดของนัดพก `meta: { closedBySend: true }`
6. **S7** ยอดรวม · กระดิ่ง · audit — ฐานของส่วนต่าง = `meta.totals` ของแถวแรกที่มี ในแถวเธรดชนิด `answer`/`recall` ใหม่ก่อน (`.limit(20)` ·
   `surveySendDiffBaseline`) · แถว `answer` พก `meta: { dept, totals }` (`askActionUpdate` รับ `opts.totals`) · แถวก่อน PR-2 ไม่มียอด = ตกไปแถว `recall`
7. **S8 ออกเลข** — `issueSurveyReport(…, { via: 'send', prepared, deadline: 20 วิ })` ใน try/catch ของตัวเอง หลังกระดิ่งและ audit · ล้มยังไงก็ตอบ 200
8. **S9** `{ request, totals, closedVisit, report }` — `report` = `{ state: 'off' }` | `{ state: 'issued', docNo, rev, reused, warnings }` |
   `{ state: 'failed', code, reason, retry }` (`reason` เป็นประโยคไทยขึ้นจอได้เลย · `retry` = กด "ออกเอกสาร" ซ้ำแล้วมีโอกาสผ่านโดยไม่ต้องดึงผลกลับ)

ตัวช่วยล้วนของเส้นนี้อยู่ใน `surveySendClose.js`: `SURVEY_SEND_PREFLIGHT_MS` · `SURVEY_SEND_OLD_PAGE_ERROR` · `SURVEY_SEND_WARNINGS_CHANGED_ERROR` ·
`SURVEY_SEND_REPORT_FAILED` · `SURVEY_SEND_REPORT_OFF` · `surveySendUnseenWarnings` · `surveySendImageRefusal` · `surveySendDocumentRefusal` ·
`surveySendDiffBaseline` · `surveySendReport` (หยิบทีละคีย์ ไม่ spread — id ของแถวรั่วไม่ได้) · `surveySendConfirm` รับเพิ่ม `issuesDocument` ·
`replacesDocNo` · `warnings` (ไม่ส่ง = ผลเท่าเดิม · PR-3 เป็นคนส่ง)

### ขั้นออกเลข `issueSurveyReport(supabase, opts)` — ไม่โยน

`{ requestId, request, user, closedVisit, via: 'send' | 'issue_only', prepared, deadline, measure, req }` + จุดเสียบของเทสต์/harness
(`storeAllowed` · `audit` · `now` · `newId` · `prepareImages` · `imageOptions`)

| ขั้น | ทำอะไร | ล้มแล้ว |
|---|---|---|
| I0 | ยามเขียนถาวร · คำร้องที่ตอบแล้ว (ปุ่ม "ออกเอกสาร" อ่านใหม่เสมอ) · เก็บ `answeredAt` เป็น **สตริงเดิม** | `not_production` · `not_answered` · `read_failed` |
| I1 | มีฉบับ `current` ของคำตอบรอบนี้ = ใช้ซ้ำ (`reused: true`) | `stale_current` · `read_failed` |
| I2 | `loadSurveyReportInputs` บนข้อมูลหลังล็อก — ชิ้นไหนอ่านไม่สำเร็จ = ไม่ออก | `blocked` (กดซ้ำได้) |
| I3 | ด่านส่งผลสามตัว + `surveyReportFreezeIssues` ทุกชนิด + หน้าล้นทั้งสองฉบับ | `blocked` — มีข้อ `content` = ต้องดึงผลกลับ · มีแต่ `system` = แก้แล้วกดซ้ำ |
| I4 | รูป: ใช้ของรอบตรวจ เติมเฉพาะที่ขาด (งบ 20 วิ ตอนส่ง · 180 วิ ตอนกดปุ่ม) | `undecodable` (ชื่อไฟล์ · ต้องดึงผลกลับ) · `images_failed` · `timeout` |
| I5 | ภาพนิ่งโหมด freeze + เรนเดอร์แห้งสองฉบับ + **ยามกันรั่วของฉบับลูกค้า** | `paper_blocked` (ยังไม่กินเลข) |
| I5b | เฉพาะ POST (`measure`): วัดกระดาษจริงใน chromium ก่อนออกเลข | `paper_blocked` — ถูกตัด = กดซ้ำไม่ช่วย · chromium ล้ม = กดซ้ำได้ |
| I6 | `rpc('issue_survey_report')` — เลขรัน + แถว ในทรานแซกชันเดียว | ตารางข้างล่าง |
| I7–I8 | อ่านแถวกลับ · audit `create` | ไม่ทำให้ผลกลายเป็นล้ม |

- **ผล** มีเก้าคีย์ทุกครั้ง: `{ state, code, docNo, rev, reused, reasons, reason, retry, warnings }` · `reason` รวมคำแนะนำทางออกแล้ว (ผู้เรียกไม่ต่อท้ายเอง) ·
  `result.reportId` เป็นคีย์ **ที่ไม่ถูกไล่** (non-enumerable): อ่านได้ แต่ `JSON.stringify`/spread/`Object.keys` ไม่พาออก — id ของแถวคือที่อยู่ไฟล์ PDF
- **รหัส** (`SURVEY_REPORT_ISSUE_CODES`): `not_production` · `not_answered` · `read_failed` · `stale_current` · `blocked` · `undecodable` · `images_failed` ·
  `timeout` · `paper_blocked` · `answer_changed` · `rpc_failed` · `internal`
- **สัญญาของ `measure`**: `measure({ customerHtml, internalHtml, deadline })` → `{ issues: [{ version, kind: 'block' | 'log', text, page }], error }`
  (HTML ยังเป็น token `su-img:<sha>` ไม่มีเลข — ตัววัดแปลง token จากถังเอง) · route เอกสารเสียบ `measureSurveyReportPaper`
- **error ของ RPC** (`surveyReportRpcError`): `survey_report_already_current` หรือ `23505` → อ่านแถวกับคำร้องซ้ำแล้วตัดสินสี่ทาง
  (`surveyReportRpcConflict`: ใช้ซ้ำ · `answer_changed` · `stale_current` · `rpc_failed` "เลขชนกัน") · `survey_answer_changed` → `answer_changed`
  (ไม่เขียน audit ล้มเหลว — รอบส่งถัดไปออกเอง) · `PGRST202` → "ฐานข้อมูลยังไม่พร้อม (mig 0401)" · เลขครบ 9999 → แจ้งผู้ดูแลระบบ
- **RPC commit แล้วคำตอบหาย**: ถามหาแถวด้วย id ที่เพิ่งสร้าง — เจอ = "ออกแล้ว" เลขใหม่ (audit ไม่ขาด) · ไม่เจอ = `rpc_failed` รอบหน้า I1 ใช้ซ้ำ **ไม่มีเลขที่สอง**
- ล้มด้วย `via: 'send'` = audit `update` ของคำร้อง `ออกเอกสารประเมินไม่สำเร็จหลังส่งผล RQ-… — <เหตุ>` · ไฟล์นี้ **ไม่เขียนบรรทัดเธรด**

### อินพุต `loadSurveyReportInputs` → `{ inputs, unknown: string[] }` (SELECT อย่างเดียว)

- 🔴 **อ่านไม่สำเร็จ ≠ ไม่มี** — ชิ้นที่อ่านพลาดเป็น `null` **และ** ชื่อเข้า `unknown` (ลำดับตาม `SURVEY_REPORT_INPUT_LABELS`: zones · files · zoneRegistry ·
  site · customer · deal · visits · visitThread · helpers · assigneeRole · history · sizes · company · form) · ชิ้นที่ไม่มีจริงเป็น `null` เฉย ๆ
- นัดที่เอกสารรับรอง = นัด `done` ล่าสุดตามวันเข้าจริง (`surveyReportVisitOf`) ไม่ใช่ "ใบล่าสุดสถานะใดก็ได้" · ผู้ช่วยแปลงจาก Map ของ `loadCrewNames` ·
  ประวัติอ่านทุกรอบ (`.limit(200)`) · มาตรฐานเอกสารอ่านแถวที่เผยแพร่ของคีย์ `siteSurvey` ตรง ๆ
- `surveyReportFreezeIssues(inputs)` → `[{ kind, text }]` · **`content`** (การส่งผลล็อกมันไว้ แก้ได้ด้วยการส่งใหม่เท่านั้น): ไม่มีพื้นที่ · ขนาด · แพ็คเกจ ·
  ผังที่พิมพ์ได้ · HEIC/BMP · รูปจุดที่ยังไม่ผูก · นัด (ไม่มี · ไม่มีวัน · ไม่มีผู้ประเมิน) · ชื่อผู้ส่งผล — **`system`** (แก้ได้โดยไม่ต้องดึงผลกลับ): บริษัท ·
  แบบฟอร์ม · ชื่อลูกค้า/ไซต์ · รหัสพื้นที่ในทะเบียน · ทุกชื่อใน `unknown` ("อ่าน…ไม่สำเร็จ")
- `surveyReportPrecheck` → `{ blockers: [{ kind, text }], warnings, unknown }` — ตัวเดียวของ S5 และของ GET ใบประเมิน ·
  **เส้นส่งผลตีกลับเฉพาะ `content` · ขั้นออกเลขตีกลับทุกชนิด** · หน้าล้นนำหน้าด้วย `ฉบับลูกค้า: ` / `ฉบับภายใน: `

### รูป `prepareSurveyReportImages(supabase, files, opts)` → `{ imageByAttId, failed }` — ไม่โยน

- Drive (`getFileStream(id, { signal })` · เพดาน 30 วิ/ไฟล์) → `sharp`: หมุนตาม EXIF · ถมพื้นขาว · ด้านยาว ≤ 1000 px (ผัง ≤ 1600) ไม่ขยาย · JPEG q72 →
  `img/<sha256>.jpg` (`upsert: false` · "มีอยู่แล้ว" = สำเร็จ) · ชุดละ 4 ไฟล์ · หมดงบ = ที่เหลือเป็น `timeout`
- `failed[].permanent`: `no_drive_file` · `drive_not_found` · `drive_forbidden` · `too_large` · `undecodable` — ชั่วคราว: `timeout` · `drive_timeout` ·
  `drive_error` (รวม 403 ที่เป็นโควตา/rate limit) · `upload_failed` · `sharp_unavailable` · `prepare_failed`
- **404/403 เป็นของ "ไฟล์" ต่อเมื่อรอบนั้นพิสูจน์ได้ว่าระบบยังเข้า Drive ได้** — รอบที่ไม่มีไฟล์ไหนดึงได้เลยและมี 404/403 จะถาม Drive หนึ่งครั้ง
  (`drives.get` ของ Shared Drive · เพดาน 10 วิ · `opts.probeDrive` เสียบแทนได้) · ถามไม่ผ่าน = ชุดนั้นเป็น `drive_error` (ชั่วคราว): service account
  ที่หลุดจาก Shared Drive ไม่ทำให้การส่งผลถูกตีกลับ และปุ่มออกเอกสารตอบ `images_failed` (กดใหม่) ไม่ใช่ "ดึงผลกลับ"
- `sharp` อยู่ใน `dependencies` ตรงตัว `0.34.5` · ยามเขียนถาวรปิด = ย่อได้แต่ไม่อัป (แผนที่ชุดนั้นห้ามไปถึงภาพนิ่งโหมด freeze — I0 กันไว้)

### ขั้นกระดาษ `ensureSurveyReportPaper(supabase, { reportId, want, deadline, user, session })` → `{ state, code, reasons, captured, ready }` — ไม่โยน

- แถวที่ยังไม่ตรึง: พิมพ์ + วัด **ทั้งสองฉบับเสมอ** → ยามกันรั่วรอบสอง → ตรึงสองฉบับในคำสั่งเดียว (`frozenAt is null`) → เก็บ PDF สองฉบับ → audit `update`
  (`{ bytes, sha256, pages, fonts }` ต่อฉบับ — แทนคอลัมน์ที่ตารางไม่มี) · แถวที่ตรึงแล้ว: พิมพ์เฉพาะฉบับที่ขอและยังไม่มี PDF
  (คำขอฉบับลูกค้าไม่อ่าน `internalHtml` ไม่ดึงรูปจุด)
- **กันการตรึง** (`surveyReportPaperIssues` ชนิด `block`): เหลือ token `su-img:` · รูปถอดรหัสไม่ได้ · จำนวนแผ่น HTML/ที่วัด/หน้า PDF ไม่เท่ากัน ·
  แผ่นไม่มีเส้นท้ายกระดาษ · **เนื้อหาเลยเส้นท้ายกระดาษ** — ลง log เฉย ๆ: เหลือที่น้อยกว่า 8 px · ฟอนต์นอก Sarabun / Type3
  (🔄 เดิมเขียนว่า "เหลือ < 8px = ไม่ตรึง ไม่ส่ง" — มติ 4: ของถูกตัดเท่านั้นที่กัน และกันการ **ตรึง** ไม่ใช่การส่งผล)
- `code`: `null` (ฉบับที่ขอมี PDF ครบ) · `not_production` · `read_failed` · `paper_failed` · `image_missing` · `storage_failed` · `chromium_failed` · `timeout`
  (งบเหลือไม่ถึง 40 วิ — ไม่เปิด chromium) · `freeze_failed` · `store_failed`
- **ไม่มีการรอที่ไม่มีเพดาน**: ทุกการเรียกถัง · ฐาน · chromium ของขั้นนี้ไม่เกิน 30 วิต่อครั้ง **และ** ไม่เลย `deadline` (`ctx.call`) ·
  งบถูกเช็กซ้ำก่อนพิมพ์ฉบับถัดไป (15 วิ) และก่อนเก็บ PDF แต่ละฉบับ (5 วิ) · หมดงบกลางทาง = `timeout` พร้อมของที่เก็บไปแล้ว
  (`state: 'frozen'` + `ready` ของฉบับที่ทัน — รอบถัดไปพิมพ์จากกระดาษที่ตรึงแล้วเก็บต่อ) · การเรียกครั้งเดียวที่ค้างเกิน 30 วิ = เหตุของขั้นนั้น
  (`read_failed` · `storage_failed` · `freeze_failed` · `store_failed`) · audit ท้ายขั้น 10 วิ · ปิดเบราว์เซอร์ 5 วิ ·
  route เอกสารอ่านไฟล์มาเสิร์ฟผ่าน `surveyReportBounded` (30 วิ → 502)
- `captured` = ฉบับที่ **รอบนี้** เก็บ PDF และเขียนที่อยู่ไฟล์เอง (อีกคำขอเขียนไปก่อน = พร้อมแล้วแต่ไม่อยู่ในลิสต์) · `ready` = `{ customer, internal }` หลังรอบนี้
- แถวที่ตรึงแล้วแต่พิมพ์เจอข้อกัน = **ไม่เก็บ PDF ฉบับนั้น** (`paper_failed`) · PDF ที่เก็บแล้วไม่พิมพ์ซ้ำ (ผลของ chromium ไม่นิ่งระดับไบต์) ·
  HTML ที่ตรึงพก token — data URI อยู่แค่ในตัวที่ส่งให้ chromium · ที่อยู่ไฟล์ `pdf/<reportId>/<ฉบับ>.pdf` (ไม่ใช่เลขที่ ซึ่งพิมพ์อยู่บนฉบับลูกค้า)
- `surveyReportPrintSession()` = เบราว์เซอร์เดียวต่อคำขอ ใช้ร่วมระหว่างขั้นวัด (I5b) กับขั้นกระดาษ เปิดตอนพิมพ์ครั้งแรก

### route เอกสาร `/api/service/surveys/[id]/document`

**GET** — query `version` (เฉพาะ `internal` ตรงตัวจึงได้ฉบับภายใน อย่างอื่น = ฉบับลูกค้า) · `format=pdf|html` · `download=1` · `draft=1`

1. ไม่มีผู้ใช้ 401 · `canOpenSurveyDocument(user)` ไม่ผ่าน 403 **โดยไม่อ่านอะไรเลย**
2. อ่านคำร้อง — ไม่เจอ 404 · `surveyDocAccess(user, request)[draft ? 'draft' : version]` ไม่ผ่าน 403 **ก่อนอ่านแถวเอกสาร** · ไม่ใช่ `site_survey` 404 · `format` แปลก 400
3. อ่านแถวเอกสาร → (กิ่งฉบับร่าง) หรือ: `issuing` 409 `กำลังออกเอกสารของใบนี้ — ลองใหม่อีกครู่` · มีแต่ฉบับที่ถูกแทนที่ 409 `เอกสาร SU-… ถูกแทนที่แล้ว — รอฉบับใหม่` ·
   ไม่มีแถว 404 `ยังไม่มีเอกสารของใบนี้ — แจ้งหัวหน้าฝ่ายบริการให้กดออกเอกสาร` · `stale` 409
4. กระดาษของรูปแบบนี้ยังไม่มี → `ensureSurveyReportPaper({ want: version })` · ไม่สำเร็จ: `not_production` 409 · `image_missing`/`storage_failed` 502 ·
   `timeout` 503 · อื่น ๆ 500 (`{ error, code }`) · **กระดาษที่ยังไม่ตรึงไม่ถูกเสิร์ฟ** · เหตุที่ขึ้นต้น "ฉบับภายใน" ไม่แสดงให้คนที่ไม่มีสิทธิ์ฉบับภายใน
5. `format=html`: อ่านคอลัมน์เดียวจากแผนที่ตายตัว แปลง token เป็น data URI จากถัง · `format=pdf`: สตรีมไฟล์ของฉบับนั้น (ถังอ่านไม่ได้ 502)
6. audit `view` (`after: { docNo, version, format, captured }`) · หัว `Content-Disposition` (`filename="<docNo>-<ฉบับ>.pdf"` ASCII + `filename*` ชื่อไทย) ·
   `Cache-Control: private, no-store` · `X-Pdf-Fallback: on-demand` เมื่อเพิ่งเก็บในคำขอนี้ · error เป็นหน้า HTML ไทยเมื่อ `Accept` มี `text/html`

**ฉบับร่าง** (`draft=1` · หัวหน้าเท่านั้น): HTML อย่างเดียว (`format=pdf` 400) · ลายน้ำ `ฉบับร่าง` · ไม่มีเลข · มีฉบับ `current` แล้ว 409
`ออกเอกสารแล้ว — เปิดฉบับที่ตรึงไว้` · ยังวัดไม่ครบ 409 `ดูตัวอย่างได้เมื่อวัดครบทุกพื้นที่ (n/m)` · รูปชี้ `/api/master/attachments/<attId>/file` ·
**ไม่เขียน ไม่แตะถัง ไม่เปิด chromium ไม่ลง audit** — ใช้ได้นอก production

**POST** ("ออกเอกสาร" · ด่าน `surveyDocAccess(…).issue`) — ขั้นออกเลข (`via: 'issue_only'` + วัดกระดาษ I5b) แล้วขั้นกระดาษ (`want: 'both'`) ในเบราว์เซอร์เดียว

- 200 `{ report: { state, docNo, rev, reused, warnings, reason? } }` — `state` = `issued` | `frozen` | `ready` (สถานะกระดาษหลังรอบนี้) ·
  มี `reason` = เลขออกแล้วแต่กระดาษยังไม่เสร็จ (ยังเป็น 200) · id ของแถวไม่อยู่ใน payload
- ขั้นออกเลขล้ม: `{ error, code, reasons, retry }` — 409 (`not_production` · `not_answered` · `stale_current` · `blocked` · `undecodable` · `paper_blocked` ·
  `answer_changed`) · 502 (`images_failed`) · 503 (`timeout`) · 500 (`read_failed` · `rpc_failed` · `internal`)
- **บรรทัดเธรด** (มติ 34): เฉพาะเมื่อ `state === 'issued' && reused === false` เขียน **ก่อนขั้นกระดาษ** —
  `appendUpdate({ entityType: 'dept_request', kind: 'report_issued', body: 'ออกเอกสารประเมิน SU-… แล้ว — ดาวน์โหลดได้ที่หน้าคำร้อง', meta: { docNo, rev } })`
  · ชนิด `report_issued` ลงทะเบียนใน `UPDATE_KINDS.dept_request` (`narrative` · ไม่ `quiet` · ไม่ `authorable`) ⇒ กระดิ่งถึงผู้ขอด้วยทางเดิมของเธรด ·
  ไม่เขียนเมื่อใช้ซ้ำ · เมื่อล้ม · จากเส้นส่งผล · เขียนไม่ลง = ยังตอบ 200 + audit `ออกเอกสารประเมิน SU-… แล้ว แต่ลงเธรดแจ้งผู้ขอไม่สำเร็จ — <เหตุ>`
  ⚠️ หัวกระดิ่งโชว์ชื่อเรื่องของคำร้องเมื่อมี (ไม่ใช่ `RQ-…` — `entityTitle` ของกระดิ่งหยิบ `title` ก่อน เหมือนบรรทัด `answer`)

### ดึงผลกลับ · เปิดใบกลับ · คีย์ของ GET

- **`POST …/recall`**: update มี `.not('answeredAt', 'is', null)` — กดซ้ำ = 409 `ใบนี้ถูกดึงผลกลับไปแล้ว — โหลดหน้าใหม่` (ไม่มีบรรทัดเธรด/กระดิ่งซ้ำ) ·
  การแทนที่ฉบับเก่าเป็นงานของ trigger 0401 ⑤ · **หลัง** update: `surveyReportVoided(…)` คืนเลขที่ของฉบับที่เพิ่งถูกแทนที่ (ไม่อ่านก่อน update —
  RPC ที่กำลังออกเลขถือล็อกแถวคำร้อง) · มีเลข: เธรด/audit ต่อท้าย ` · เอกสาร SU-… ใช้ไม่ได้แล้ว ห้ามใช้ฉบับที่ส่งลูกค้าไปแล้ว` ·
  `meta.supersededDocNo` · คำตอบ `supersededReport` (สตริงเลขที่ หรือ `null`) · ทั้งบรรทัดเธรดอยู่ใน 500 ตัว (ขอบของกระดิ่ง): ใบใหญ่ + เหตุผลยาว
  ของที่สั้นลงคือเหตุผลในบรรทัด (ปกติ 300 ตัว · ฉบับเต็มอยู่ในสรุป audit) ไม่ใช่ประโยคเอกสารที่อยู่ท้ายสุด
- **`PATCH /api/sa/requests/[id]` action `reopen`** ("ยังไม่จบ") ของใบประเมินที่ตอบแล้ว: ประโยคเดียวกัน — ในเธรดวาง **หน้า** เหตุผลของคนกด
  (`ยังไม่จบ — เปิดเรื่องกลับมา · รอ… · เอกสาร SU-… ใช้ไม่ได้แล้ว … · <เหตุผล>`: กระดิ่งตัดที่ 500 ตัว เหตุผลยาวได้ถึง 500) · สรุป audit ต่อท้ายตามเดิม
- **GET ใบประเมิน** คีย์ `document` (`surveyDocumentSummary(…, { withChecks: true })`) · **GET คำร้อง** คีย์ `surveyDocument` (เฉพาะ `site_survey` ·
  `{ withVoids: true }`) — `{ access, issueAtSend, storeAllowed, state, current }` + `history` (เฉพาะ `access.history`) + `nextDocNo` · `send` · `issue`
  (เฉพาะ `access.issue`) + `voids` (GET คำร้อง · คนที่ตอบ/จัดการใบได้) · ไม่มีสิทธิ์ = `{ access: 'none' }` ตรงตัว (ช่าง: ไม่อ่านแถวเอกสารเลย) ·
  สรุปล้ม = `{ access: 'none', unknown: true }` GET ยัง 200 · **คีย์ที่ไม่มีสิทธิ์ = ไม่มีคีย์ (ไม่ใช่ `null`)** — จอ PR-3 ห้ามทึกทักว่ามี ·
  `send.blockers` = เหตุชนิด `content` ที่ S5 จะตีกลับ · `send.warnings` = สตริงที่จอต้องส่งกลับเป็น `seenWarnings` **ตามตัว** ·
  `issue.blockers` = `[{ kind, text }]` ทุกชนิด (รวมด่านส่งผลที่ขั้นออกเลขวิ่งซ้ำ) · ไม่มี payload ไหนพกภาพนิ่ง/HTML/id ของแถว/ที่อยู่ไฟล์

### สิทธิ์ `surveyDocAccess(user, request)` → `{ customer, internal, issue, draft, history }`

| บทบาท | ฉบับลูกค้า | ฉบับภายใน | ออกเอกสาร · ฉบับร่าง | ลิสต์ Rev เก่า |
|---|---|---|---|---|
| admin · ts_manager · ts_audit · ts_senior · commercial_director · commercial_manager | ได้ | ได้ | ได้ | ได้ |
| executive | ได้ | ได้ | — | — |
| ae_supervisor · ac_supervisor · ผู้ขอ · ทีมเดียวกับใบ | ได้ | — | — | — |
| ts · ts_planner · viewer · บทบาทที่เปิดระบบคำร้องไม่ได้ | — | — | — | — |

`canOpenSurveyDocument(user)` เป็นด่านถูก ๆ ก่อนอ่านอะไร และ `surveyDocAccess` ใช้ด่านเดียวกันซ้ำข้างใน (ช่างที่ทีมตรงกับใบก็ยังไม่ได้อะไร) ·
ห้ามใช้ `surveyReadError` (ช่าง/ผู้จัดคิวผ่าน) หรือ `canAnswerRequest` ตัวเดียว (AE Sup ผ่านทาง superuser) · ถังเป็นส่วนตัว ตารางเปิด RLS ไม่มี policy

### คำเตือนกับฟอนต์

- `surveyReportSendWarnings(view)` = `customerFreeTextWarnings` (คำเครื่อง/รุ่น/ราคา · จุดติดตั้ง ใน **หมายเหตุพื้นที่** เท่านั้น — ชื่อพื้นที่ไม่สแกน
  "ห้องเครื่อง" เป็นชื่อจริง) + หนึ่งบรรทัดต่อช่องของฉบับลูกค้าที่มีอักขระพิมพ์ไม่ได้
  `<ช่อง> มีอักขระที่เอกสารพิมพ์ไม่ได้ (😀 U+1F600 · …) — จะขึ้นเป็นกล่องสี่เหลี่ยม` (ทุกสตริงของฉบับลูกค้า) ·
  ⚠️ จอเทียบ `seenWarnings` ด้วยสตริงตรงตัว — ต้องใช้สตริงจาก server ห้ามประกอบเอง
- `lib/documents/documentFontRanges.js`: ครอบคลุม = **cmap จริง ∩ `unicode-range`** ของฟอนต์แต่ละตัว (313 code point) ไม่ใช่ `unicode-range` อย่างเดียว —
  ช่วง U+2000–206F ประกาศไว้ 112 ตัว มี glyph 15 ตัว (ขีด U+2010–2012 "‰" "※" ไม่มี) · เทสต์แกะ cmap ของทุกหน้าฟอนต์แล้วล้มเมื่อค่าคงที่ต่าง ·
  `uncoveredChars` ข้ามช่องว่างกับอักขระที่ไม่พิมพ์อะไร (ZWSP · ZWJ · variation selector)
- ข้อความเฉพาะฉบับภายใน (ชื่อจุด · เหตุผล · รายละเอียดคำร้อง) **ไม่ถูกสแกน** — ขั้นกระดาษลง log เมื่อ PDF มีฟอนต์นอก Sarabun

### ตายกลางทางแล้วเหลืออะไร (ย่อ — ตารางเต็ม `PR-2.md` §11)

| ตายที่ | เหลือ | ทางออก |
|---|---|---|
| ก่อนเขียน (S2 · S3 · S5) | รูป `img/` เท่านั้น · นัดยังเปิด | แก้แล้วกดใหม่ |
| หลังตอบ ก่อน/ใน RPC · Drive ล่ม · หมดงบรูป | ใบตอบแล้ว ไม่มีแถว ไม่เสียเลข (`issuing` → `missing`) | กด "ออกเอกสาร" (POST) — รูปที่อัปแล้วใช้ซ้ำ |
| รูปเปิดไม่ได้ที่เจอหลังล็อก · ด่านชนิด `content` | เหมือนบน | ดึงผลกลับ แก้ ส่งใหม่ (กดซ้ำล้มที่เดิม) |
| RPC commit แล้วคำตอบหาย | แถว `current` | I1 เจอแล้วใช้ซ้ำ — ไม่มีเลขที่สอง |
| chromium ล้ม · ฟังก์ชันตายในขั้นกระดาษ | `issued` / `frozen` | GET หรือ POST ครั้งถัดไปทำต่อ |
| แผ่นถูกตัด (เส้นส่งผล — POST ตรวจก่อนออกเลข) | `issued` ไม่ตรึง | แก้ตัวเรนเดอร์แล้ว GET/POST · หรือดึงผลกลับ แก้ ส่งใหม่ |
| อัป PDF แล้วเขียนที่อยู่ไม่ทัน | ไฟล์อยู่ที่ path คอลัมน์ว่าง | รอบหน้าอัปได้ "มีอยู่แล้ว" แล้วเขียนที่อยู่ |
| ดึงผลกลับ/เปิดใบกลับหลัง RPC | แถวถูกแทนที่ | ส่งรอบหน้า = Rev+1 · บรรทัดดึงกลับเอ่ยเลข |

### ด่านและเครื่องมือของ PR-2

- **CI** (`.github/workflows/ci.yml` · หลังขั้น Build): `node scripts/check-doc-tracing.mjs` อ่าน `.next/server/app/<route>/route.js.nft.json` —
  route เอกสารต้องมี `.br` ของ chromium ครบ + `puppeteer-core` + ไบนารี sharp (addon + libvips) · route ส่งผลต้องมีไบนารี sharp และ **ห้าม** มี
  `puppeteer-core`/`@sparticuz/chromium` · GET ใบประเมิน · ดึงผลกลับ · GET/PATCH คำร้อง **ห้ามมีทั้งสามอย่าง** · ข้อความที่ล้มบอกบรรทัดที่ต้องเพิ่มใน
  `outputFileTracingIncludes` ของ `next.config.mjs` (route เอกสารมี entry ของ chromium แล้ว)
  🪤 บน Vercel ตัว trace ของ next-server **ตัด sharp ออกโดยตั้งใจ** (`next/dist/build/collect-build-traces.js` — `hasNextSupport`) ⇒ sharp ไปถึงฟังก์ชัน
  ได้ทางเดียวคือ trace ของ route เอง — เครื่องนักพัฒนาไม่มีวันเห็นอาการนี้
  ⚠️ **ยังไม่เคยรันกับ build จริงของ PR-2** (สร้างโดยไม่รัน `next build`) — รอบแรกของ CI คือการยืนยัน: ถ้า trace ของ route เอกสาร/ส่งผลไม่มีไบนารี sharp
  ให้เพิ่ม `'node_modules/sharp/**/*', 'node_modules/@img/**/*'` ให้สอง route นั้นใน `outputFileTracingIncludes` · ลองกับ build เก่าของ worktree อื่นแล้ว:
  ตัวอ่าน `nft.json` ทำงาน และ route เบาทั้งสาม (ก่อน PR-2) ไม่มีของหนักจริง
- **ตรวจของจริงก่อนเปิดสวิตช์** (อ่านอย่างเดียว · รันเมื่อเจ้าของอนุญาต): `node --import ./scripts/test-loader.mjs scripts/check-survey-report-inputs.mjs
  <id | RQ-…>` หรือ `--open` (ใบที่ยังไม่ส่งผลทุกใบ + สรุปยอด) · พิมพ์ชิ้นที่อ่านไม่สำเร็จ · ด่านเดิม · เหตุแยกชนิด · หน้าล้น + จำนวนหน้า · คำเตือน ·
  รายการรูป · และ **ใบที่วันนี้ส่งได้แต่เปิดสวิตช์แล้วจะถูกตีกลับ (S5)** · client ถูกห่อ `readOnlyClient` (เหลือ `.select()` กับ `getUserById`) ·
  ไม่ตรวจว่ารูปเปิดได้จริง (ต้องดึง Drive) กับผลวัดกระดาษ
- **ไปป์ไลน์ในเครื่อง**: `render-survey-report.mjs --pipeline` (หัวข้อ harness ข้างล่าง)
- `check:rowcap` ขึ้นทะเบียน `service_survey_reports` เพดาน 0 · `check:columns` อ่าน `SURVEY_REPORT_COLUMNS` กับคอลัมน์ของตัวโหลด (เขียวเพราะ 0401 รันแล้ว)
- เทสต์ของเครื่องมือทั้งสาม: `src/lib/service/surveyReportTooling.test.mjs` (ไปป์ไลน์เดินด้วยตัวพิมพ์ปลอม + sharp จริง)

## harness — เรนเดอร์ในเครื่อง ไม่แตะฐาน ไม่แตะ Drive

🔴 dev DB = prod DB ⇒ **ห้ามทดสอบเอกสารนี้ด้วยการกดส่งผลในแอป** ใช้ harness เท่านั้น

```
cd webapp
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node --import ./scripts/test-loader.mjs scripts/render-survey-report.mjs \
  --fixture ~/ss-team/mockups/survey-report-doc/real/fixture.json \
  --photos ~/ss-team/mockups/survey-report-doc/real/photos \
  --doc-no SU-26090001-0 --issued 2026-09-26 \
  --out ~/ss-team/mockups/survey-report-doc/render --assert
```

ได้ `customer.html/.pdf` · `internal.html/.pdf` · PNG ทีละหน้า (794×1123 เท่าภาพกระดาน) · `fit.json` (ผลวัดจริงของทุกแผ่น) · `snapshot.json`
ตัวเลือก: `--synthetic` (แฝดสังเคราะห์ ไม่มีชื่อลูกค้าจริง) · `--stress` (ทุกกรณีของ `surveyStressCases()` — กรณีแรกลง `--out` ที่เหลือลง
`--out/cases/<ชื่อ>` · `--case <ชื่อ>` = กรณีเดียว) · `--scale 2` · `--no-spot-links` · `--pipeline` (ข้างล่าง)
`fixture.json` กับผลลัพธ์มีชื่อลูกค้าและเบอร์โทรจริง — อยู่นอกรีโป อย่าย้ายเข้ามา

`--assert` ล้มเมื่อ (ทุกชุดอินพุต): หน้าไหนเหลือไม่ถึง 8px เหนือเส้นท้ายกระดาษ · ขอบล่างจริงเกินที่แผนคิด · จุดอ้างอิงของแผน
(ตารางบน · ความสูงผัง · การรับรอง · ลงนาม) ต่างจากที่วัดเกิน 8px · แผนรายงานหน้าล้น · **PDF มีฟอนต์อื่นนอกจาก Sarabun**
(กล่องเทาของชุดสังเคราะห์เขียนขนาดด้วย Arial — ยกเว้นให้เฉพาะชุดที่มีกล่องเทา) · ของจริง/แฝดสังเคราะห์เพิ่มข้อทองคำ (4 / 6 หน้า ฯลฯ)

กรณีของ `surveyStressCases()` (harness กับเทสต์วัดจริงใช้ชุดเดียวกัน): `stress` (12 พื้นที่ · รูปเยอะ/แนวตั้ง · สี่ขนาดจำนวนสองหลัก · ประวัติ 14 แถว)
· `mix3` `mix4` `mix2d` (แถวรวมหลายบรรทัด) · `limit10` `limit9` (หน้า 1 ชิดเพดาน) · `sendback` (ตีกลับ 10 × 300 + คำร้อง 4,000 ตัว) ·
`tallhead` (ตารางเริ่มหน้า 2) · `noplan` (โหมดร่าง — ไม่มีผัง)

เทสต์ `surveyReportDocument.test.mjs` มีรอบ "วัดจริงใน Chrome" ที่รันเมื่อตั้ง `PUPPETEER_EXECUTABLE_PATH` (ข้ามเองใน CI)

### `--pipeline` — สองขั้นของ PR-2 ทั้งเส้น (sharp จริง · Chrome จริง · ฐาน/ถัง/Drive ในหน่วยความจำ)

```
cd webapp
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
node --import ./scripts/test-loader.mjs scripts/render-survey-report.mjs \
  --fixture ~/ss-team/mockups/survey-report-doc/real/fixture.json \
  --photos ~/ss-team/mockups/survey-report-doc/real/photos \
  --pipeline --out ~/ss-team/mockups/survey-report-doc/render-pr2 --assert
```

- โค้ดชุดเดียวกับ production: ตัวโหลดอินพุต → ด่าน → `prepareSurveyReportImages` (ไฟล์จาก "Drive" ปลอม = รูปในโฟลเดอร์ `--photos` · ไม่ส่ง หรือ
  `--synthetic` = JPEG สีพื้นที่สร้างด้วย sharp) → วัดกระดาษใน Chrome → RPC ปลอมที่ทำตาม 0401 ④ → ตรึง → เก็บ PDF · แล้ว **เดินซ้ำอีกรอบ**
- `surveyPipelineWorld` (ในสคริปต์): ตารางรูปเดียวกับฐาน · เขียนได้ตารางเดียว (`service_survey_reports` พร้อมยามเติมครั้งเดียวของ 0401 ②) ตารางอื่นถูกเขียน = โยน ·
  ถังรับแค่ JPEG/PDF · ยามเขียนถาวรเสียบเป็นเปิด (`storeAllowed: true`) **เฉพาะกับของปลอมชุดนี้** · audit เป็นของปลอม (ค่าตั้งต้นของสองขั้นเขียน
  `audit_logs` ของจริง — ห้ามเรียกโดยไม่เสียบ)
- `--assert`: สถานะ `missing → issued → ready` · รอบสอง `reused` เลขเดิมและไม่พิมพ์ซ้ำ · RPC ครั้งเดียว เลขรันถูกกินครั้งเดียว · ไฟล์ละครั้งจาก Drive ·
  ถังมีแต่รูปของภาพนิ่งกับ PDF สองไฟล์ที่ path ของฉบับนั้น · HTML ที่ตรึงพก token · ยามกันรั่วผ่าน · หน้า PDF = แผนหน้า · ฟอนต์ Sarabun เท่านั้น ·
  audit สองแถวไม่มีภาพนิ่ง/HTML · บวกข้อทองคำ (4 / 6 หน้า ฯลฯ)
- ได้ `customer.pdf` · `internal.pdf` · `customer.html` · `internal.html` (กระดาษที่ตรึง แปลง token เป็นรูปแล้ว) · `snapshot.json` · `pipeline.json`
  (สถานะ · ผลสองรอบ · หน้า/ฟอนต์ · รูป · ไฟล์ในถัง · audit · เวลาแต่ละขั้น)
- `--via send` = เดินแบบเส้นส่งผล (ตรวจรูปก่อน → ออกเลขไม่วัดกระดาษ → ขั้นกระดาษ) · `--issued YYYY-MM-DD` = ตรึงนาฬิกา (เดือนในเลขที่ + วันที่ออก) ·
  `--no-spot-links` = ต้องติดด่าน (ไม่ได้เลข)

**ผลรัน 01/10/2026 (ของจริง RQ-AS-26090186 · Chrome ในเครื่อง)**: `missing → issued → ready` · รอบแรก `SU-26100001-0` ออกเลขใหม่ เก็บ PDF สองฉบับ ·
รอบสอง `reused` ไม่พิมพ์ซ้ำ · ฉบับลูกค้า 4 หน้า (0.50 MB) · ฉบับภายใน 6 หน้า (0.72 MB) · ฟอนต์ Sarabun สี่น้ำหนักเท่านั้น · 8 ไฟล์จาก Drive → 6 รูปในถัง
(ไฟล์เดียวกันที่ใช้เป็นทั้งภาพกว้างและรูปจุด = sha เดียว) · รวม ~3.2 วิ (ย่อรูป 0.4 · พิมพ์+วัดสี่ครั้ง 3.0) · แฝดสังเคราะห์และ `--via send` ผ่านเหมือนกัน
⚠️ เวลา Drive จริง · chromium บน Lambda · sharp บน linux ยังไม่เคยวัด — ครั้งแรกคือการออกเอกสารจริงใบแรกบน production

### ผลสอบเทียบ (01/10/2026 · `fm-ts-01@2026-10-01b`)

- ของจริง RQ-AS-26090186: ฉบับลูกค้า 4 หน้า · ฉบับภายใน 6 หน้า · คอลัมน์ "หน้า" 2, 3 · 173.31 ตร.ม. · 949.75 ลบ.ม. · "SM 1 · ST 1" · "12:00 น. (ตามนัด)"
  · ฟอนต์ใน PDF ทั้งสองฉบับ = Sarabun Regular/Medium/SemiBold/Bold เท่านั้น
  · เทียบภาพกับรอบก่อน (`2026-10-01a`): ตรงกันทุกพิกเซลทุกหน้า ยกเว้นภาคผนวกหน้า 5 (ถ้อยคำเชิงอรรถ ก กับบรรทัดนับของ ข)
- ตารางหน้า 1 เริ่มที่ 446.4 (ลูกค้า) / 718.9 (ภายใน) ⇒ ค่าคงที่ 447 / 720 · กล่องผัง 530.9 / 255.4 (แผน 531 / 255) ·
  การรับรองผลสูง 217 · ภาคผนวก ค จบที่ 699.7 (แผน 701) · ทุกหน้าเหลือ ≥ 10px เหนือเส้นท้ายกระดาษ
- ชุดสุดขอบทุกกรณี: ไม่มีหน้าไหนล้น · จุดอ้างอิงทุกจุดต่างจากแผนไม่เกิน 1.1px · หน้า 1 ที่ชิดเพดาน (`limit9` · แถวรวมสองบรรทัด) แผน 1046 วัดได้ 1040.2
- **ชื่อพื้นที่ในช่องตาราง** นับด้วยตัวประเมินที่สอบเทียบแล้ว (`nameLinesOf` — กว้าง ×1.035 · เว้นท้ายบรรทัดครึ่งเดียว · 6,004 กรณีใน Chrome นับต่ำ 0):
  หน้า 2 ของชุดสุดขอบฉบับภายในเคยต่างจากที่วัด 61px ตอนนี้ 4px · ⚠️ ของจริงในช่อง 128px ("…และสนามเทนนิส · ชั้น GF" ลงบรรทัดสองโดยเหลือ
  0.3px) ยังถูกนับ 3 บรรทัด ⇒ หน้า 1 ฉบับภายในของของจริงแผน 957 วัดได้ 935.4 **โดยตั้งใจ** (จะนับให้ตรงต้องเผื่อไม่ถึง 0.3px)
- ที่แผนยังเผื่อเกินจริง (ฝั่งปลอดภัย — หน้าโปร่งขึ้น ไม่ล้น): ข้อความยาวหลายสิบบรรทัดในช่องแคบ (เหตุผลตีกลับ 10 × 300 ในช่อง 176px: หน้าหนึ่ง
  เผื่อได้ถึง ~100px)

## ที่ต่างจากกระดานโดยตั้งใจ

| จุด | กระดาน | กระดาษจริง | เหตุผล |
|---|---|---|---|
| บรรทัดแบบฟอร์ม | `[FM-TS-01]: Rev. No.00. [วันที่มีผล]` | `FM-TS-01: Rev. No.00. 29/09/2569` | วงเล็บเหลี่ยมคือช่องรอค่า — รูปเดียวกับ QT (`documentFormLine`) |
| ตำแหน่งผู้ประเมิน | `ฝ่ายบริการ · [ตำแหน่ง]` | `ฝ่ายบริการ · <ป้ายตำแหน่งจริง>` | เดียวกัน (ป้ายยาวตกสองบรรทัดได้ ที่นั่งสูงพอ) |
| สถานะปิดเรื่อง (แผงภายใน · ที่นั่งฝ่ายขายของ จ) | `รอฝ่ายขายปิดเรื่อง` | `ยังไม่ปิดเรื่อง ณ วันที่ออก` หรือผู้ปิด + วันเวลา | กระดาษที่ตรึงแล้วพิมพ์สถานะสดไม่ได้ (PR-1.md §8.5) |
| เชิงอรรถภาคผนวก ก | `XS (ห้องน้ำ) หัวหน้าเลือกเอง` | `XS หัวหน้าเลือกเอง` | สร้างจากทะเบียนขนาดที่ตรึงไว้ ซึ่งไม่เก็บหมายเหตุของขนาด — **รอเจ้าของเคาะ** |
| ขอบซ้าย/ขวา | 46px บนกรอบ 794px | `calc((210mm − 702px) / 2)` ≈ 45.85px | แผ่นจริงกว้าง 210mm = 793.7px — ตรึงคอลัมน์ 702px ไว้ ไม่งั้นชื่อที่กระดานลงพอดีบรรทัดตกเป็นสามบรรทัด |
| คอลัมน์ `#` | padding 8px | padding 2px + ห้ามตัดบรรทัด | พื้นที่ที่ 10 ขึ้นไปตกเป็น "1/0" ในช่อง 26–30px (กระดานมีแต่เลขหลักเดียว) |
| ตัวเอียงของ "ลายเซ็นอิเล็กทรอนิกส์" | Sarabun Italic จาก Google Fonts | เอียงสังเคราะห์จาก Sarabun 400 | เปลือกเอกสารฝังเฉพาะตัวตรง 400–700 (ออฟไลน์ได้ · เหมือน QT) |
| ชื่อพื้นที่ในตารางหน้า 1 ฉบับภายใน | ไม่มี `nw` ที่ชั้น | ชั้นเกาะคำสุดท้ายเหมือนฉบับลูกค้า | ตัวจัดหน้านับแบบเดียวกันทั้งสองฉบับ — ของจริงตัดบรรทัดตรงกับกระดาน |
| ความสูงแผ่น | 1123px | 297mm = 1122.5px | ขนาดกระดาษของเปลือก (@page A4) — ของชิดล่างขึ้นมา 0.5px |
| เชิงอรรถ ก · บรรทัดนับของ ข | `≤300 ลบ.ม. = SM · ≤2,400 = ST` · `เพิ่ม 1 ⇒ ประเมินจริง 2 พื้นที่` | `ไม่เกิน 300 ลบ.ม. = SM · ไม่เกิน 2,400 = ST` · `เพิ่ม 1 = ประเมินจริง 2 พื้นที่` | "≤" "⇒" ไม่อยู่ในฟอนต์ที่ฝัง — บน production เป็นกล่องสี่เหลี่ยม |
| ช่อง "ขนาดแพ็ค" ของแถวรวม | `nw` ต่อขนาด เบราว์เซอร์ตัดเอง | บรรทัดสำเร็จรูปจากแผน (ตัวคั่นค้างท้ายบรรทัดบน) | ความสูงของแถวรวมต้องเท่าที่แผนนับ — กระดานมีแค่ "SM 1 · ST 1" (บรรทัดเดียว หน้าตาเท่าเดิม) |
| รูปในกล่อง 226×170 | `cover` ทุกรูป | `cover` เฉพาะรูปแนวนอนใกล้ 4:3 (1.17–1.51) นอกนั้น `contain` | รูปแนวตั้งเสียบนล่างรวม 43% — ของจริงเป็น 4:3 ทุกรูป หน้าตาเท่าเดิม |
| หัวพื้นที่ | ชื่อ + ชั้นต่อกันธรรมดา | "· ชั้น N" และ "(ต่อ)" ห้ามตัด เกาะคำสุดท้ายของชื่อ | เลขชั้นเคยตกบรรทัดใหม่ตัวเดียว — แบบเดียวกับช่องชื่อของตารางหน้า 1 |
| หมายเหตุของพื้นที่ที่มีหน้า "(ต่อ)" | (ไม่ได้วาด — "PAGE RULE": ส่วนที่เหลือ แล้วหมายเหตุ) | อยู่ท้ายหน้า "(ต่อ)" · ไม่ขึ้นหน้าใหม่ตัวเดียว | ลำดับอ่าน: รูป → ผัง → รูปที่เหลือ → หมายเหตุ |
| พื้นที่ที่ไม่มีภาพผัง (โหมดร่าง) | (ไม่ได้วาด) | กล่อง "ไม่มีผัง" เตี้ย 80 ไม่ยืด | กรอบว่างที่ยืดเต็มหน้าอ่านเป็นหน้าพัง — ตรึงจริงไม่ได้อยู่แล้ว (ด่านตรึงบังคับผัง) |
| หน้า 1 ที่แถวแรกของตารางไม่พอ | (ไม่ได้วาด) | ไม่พิมพ์หัวข้อ/หัวตารางเปล่า — ตารางเริ่มหน้า 2 | ฉบับภายในที่พื้นที่ 1 มี 14 ส่วนขึ้นไป |

## งานถัดไป

- **เจ้าของ**: `0401` รันแล้ว (01/10 — วันที่มีผลของ FM-TS-01 ที่ seed คือ 29/09/2569) · เคาะเชิงอรรถ "(ห้องน้ำ)" · เคาะว่าหน้าพื้นที่ฉบับภายใน
  (เหลือที่ให้ผัง 15–16px) ยอมให้หมายเหตุจุดดันส่วนจุดไปหน้า "(ต่อ)" หรือลดผังขั้นต่ำเป็น 200
  · **เคาะขนาดผังของฉบับภายใน**: กระดาน R-I-Z ให้ผังเหลือ ~237px (ภาพ 310×237 / 418×237) — ตัวหนังสือในภาพผัง ("กว้างxยาวxสูง…" · "AC")
    เหลือ 5–6px อ่านบนกระดาษไม่ออก (ฉบับลูกค้า 669×513 อ่านได้) · ทางเลือก: ยอมตามกระดาน หรือให้ส่วนจุดไปหน้า "(ต่อ)" เมื่อผังต่ำกว่า ~300px
    (= ตั้ง `SURVEY_REPORT_PX.zone.planMin` ของฉบับภายในเป็น 300 — ของจริงจะเป็น 8 หน้าแทน 6)
  · **ไม่ทำตามข้อเสนอ review**: ย้ายผังไปหน้า "(ต่อ)" เมื่อรูปกว้างเกินสองแถว — ขัดกับ "PAGE RULE" ของกระดาน R-C-2 (ผังอยู่หน้าหลักเสมอ)
    ถ้าเจ้าของอยากให้รูปกว้างทุกรูปมาก่อนผัง ต้องเคาะใหม่
- **ลำดับขึ้นระบบ** (`PR-2.md` §17): ① PR-1 merge ② 0401 รัน (✅ 01/10) ③ PR-2 merge **โดยไม่ตั้ง env** — ผู้ใช้ไม่เห็นอะไรเปลี่ยนนอกจากสามเรื่องเล็ก
  ④ PR-3 merge ⑤ `GET /api/version` บน production ต้องตอบ `env: production` (ไม่งั้นยามเขียนถาวรจะปฏิเสธทุกอย่าง) แล้วหัวหน้ากด "ออกเอกสาร"
  ใบเก่าหนึ่งใบ = `SU-2610xxxx-0` ของจริง (ถาวร) เจ้าของอ่าน PDF สองฉบับ ⑥ ตั้ง `SURVEY_REPORT_ISSUE_AT_SEND=on` ใน Vercel production
  — **ห้ามก่อน ④** · ก่อน ⑥ รัน `check-survey-report-inputs.mjs --open` (เจ้าของอนุญาต) นับใบที่จะถูกตีกลับ
- **ตรวจหลัง 0401** (อ่านอย่างเดียว): ไม่มี policy ของ `storage.objects` เอ่ยถึง `survey-report`
  (`SELECT policyname, qual FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';`)
- **ความเสี่ยงที่ยอมรับ** (`PR-2.md` §19): การส่งผลรอรูป + RPC (ประมาณ 4–7 วิ สองพื้นที่ · เพดาน 60 + 20 วิ) · เส้นส่งผลไม่วัดกระดาษ ⇒ แผ่นที่ถูกตัดเหลือ Rev
  ที่มีเลขแต่ไม่มีไฟล์จนกว่าจะแก้ตัวเรนเดอร์หรือดึงผลกลับ · คนแรกที่เปิดเอกสารรอ chromium ~10 วิ · PDF เกิน 4.5 MB ยังไม่เคยลองสตรีมบน Vercel ·
  ไฟล์ในถังอยู่นอก backup ของฐาน (HTML ที่ตรึงกับภาพนิ่งอยู่ใน backup) · ใบที่ใหญ่เกินงบ 180 วิ ออกไม่ได้จนกว่าจะมีแคชรูป
- **PR-3 ส่วน A (ไม่ใช่จอ · เทสต์ของตัวเอง)**: ลงทะเบียนมาตรฐานเอกสาร `siteSurvey` (`DOCUMENT_STANDARD_KEYS` · ป้าย · `DOCUMENT_FORMS` · รอบเลข ·
  กิ่งพรีวิว · สี teal ของคีย์นี้รวมตัวเลือกสีของหน้าตั้งค่า) — 🔄 เดิมเขียนว่าเป็นงานของ PR-2 (ที่นี่และคอมเมนต์ 0401 ⑦): **ย้ายมา PR-3** เพราะทำให้แท็บใหม่
  โผล่ในหน้าตั้งค่า (มติ 28) · PR-2 อ่านแถวที่เผยแพร่ของคีย์นี้ตรง ๆ จึงไม่ต้องรอ
- **PR-3 จอ**: ส่วนเอกสารบนการ์ดควบคุม + บล็อกบนหน้าคำร้อง (อ่าน `document` / `surveyDocument`) · แถวด่านจาก `document.send.blockers` ·
  โมดัลส่งผลกาง `document.send.warnings` แล้วส่งกลับเป็น `seenWarnings` **ตามตัว** พร้อมอาร์กิวเมนต์ใหม่ของ `surveySendConfirm` ·
  หลังส่งผลที่ได้ `report.state: 'issued'` เรียก `POST …/document` หนึ่งครั้งแล้วโชว์ `report.reason` ถ้ากระดาษไม่เสร็จ · ปุ่ม "ออกเอกสาร" + โมดัลยืนยัน
  (ต้องบอกว่าผู้ขอจะได้รับแจ้ง — #1223) · `issuing` = ซ่อนปุ่ม · "ดูตัวอย่าง (ฉบับร่าง)" เปิด `…/document?draft=1&format=html&version=…` ·
  โมดัลดึงผลกลับ/เปิดใบกลับเอ่ย `เอกสาร SU-… จะถูกแทนที่` (`document.current.docNo` · `surveyDocument.voids`) ·
  ⚠️ จอห้าม import `surveyReportState.js` (ลาก `node:crypto`) — อ่าน `document.state` จาก API
- **PR ถัดจาก PR-3**: หัวหน้าเปิด Rev ที่ถูกแทนที่พร้อมลายน้ำ "ถูกแทนที่" (เรนเดอร์ครั้งที่สองจาก HTML ที่ตรึง เก็บแยก path — ไม่ต้องมี migration)
- **นอกงานนี้ (เจอระหว่างทำ)**: route PATCH ของใบเสนอราคาเรียกตัวจับ PDF โดยไม่มี entry ใน `outputFileTracingIncludes`
  (`api/sales-planning/quotations/[id]/route.js`) · `loadSurveyZones` ไม่มี `.limit()` (ด่าน `check:rowcap` ยังไม่จับตาราง `service_survey_zones`)
