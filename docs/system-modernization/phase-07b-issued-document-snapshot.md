# Phase 7B — Issued Document Snapshot และ Immutable PDF Foundation

สถานะ: กำลังดำเนินการ

เริ่มร่าง: 20 กรกฎาคม 2026

ผู้ใช้ยืนยันขอบเขต: 20 กรกฎาคม 2026 — (1) artifact เก็บเป็น **canonical HTML + fingerprint** (เลื่อน PDF binary ไป 7C), (2) ขอบเขตเอกสาร **quotation เท่านั้น** ในเฟสนี้, (3) trigger การออก snapshot = **ตอนอนุมัติ (approved)** จับคู่กับ signature evidence ของ Phase 5

เป้าหมาย: สร้างโครงสร้างกลางสำหรับ "เอกสารที่ออกจริง" (issued document) ที่ pin เนื้อหาและเวอร์ชันทั้งหมดไว้แบบ immutable พร้อมสร้างและเก็บไฟล์ PDF ที่ reprint ได้เหมือนเดิมทุกครั้ง โดย **ยังไม่แทน** Production Print (`quotePrint.js`/`salesOrderPrint.js`) และ **ยังไม่เปลี่ยน** ข้อมูลใบเสนอราคาเดิมในเฟสนี้ — การสลับ consumer อยู่ Phase 7C/7D

## บริบทปัจจุบัน

- Phase 5 ให้ signature evidence แบบ atomic (`document_signature_evidence`, mig 0125) พร้อม `documentFingerprint` แบบ `sha256:<64hex>` และ snapshot ของ signature version + document standard version ต่อการอนุมัติ
- Phase 6A ให้ versioned document standards; Phase 6B ให้ Quotation Master V2 ใน Preview เท่านั้น
- Phase 7A ให้ versioned commercial presets + resolver (mig 0128) แต่ยังไม่เสียบเข้าการสร้างเอกสารจริง
- `quotePrint.js` และ `salesOrderPrint.js` ยังเป็น Production authority และ render จากข้อมูล live (ดึง company data จาก `documentBrand.js` ตอนพิมพ์) → เอกสารเก่าจะเปลี่ยนตาม company/form/preset ใหม่เมื่อ reprint
- Decision 0004 และ 0010 กำหนดว่า issued document ต้อง snapshot เนื้อหาและเวอร์ชัน และเป็นเงื่อนไขก่อนเปลี่ยน Production Print

## ปัญหาที่เฟสนี้แก้

เอกสารที่ออกให้ลูกค้าไปแล้วต้อง reprint ได้ **เหมือนเดิมทุกอักขระ** แม้ company data / controlled form / commercial preset / signature / layout จะเปลี่ยนเวอร์ชันภายหลัง ปัจจุบันยังไม่มีชั้นที่ตรึงสิ่งเหล่านี้ ทำให้เอกสารทางการค้าเก่าเสี่ยงเพี้ยนเงียบ ๆ

## ขอบเขตที่เสนอ (รอยืนยัน)

- เพิ่มโมเดล **issued document snapshot** หนึ่งแถวต่อการออกเอกสารหนึ่งครั้ง โดย pin ไว้ครบ:
  - resolved document data (หัวเอกสาร, บรรทัดสินค้า, ยอดรวม, ส่วนลด, ภาษี, งวดชำระ) แบบ JSONB immutable
  - company data version, document standard version, commercial preset version, signature evidence id, layout/template version, locale/currency
  - `contentFingerprint` แบบ `sha256:<64hex>` คำนวณจาก canonical JSON ของ snapshot
- เพิ่ม **rendered artifact (PDF)** ผูกกับ snapshot: เก็บใน storage bucket เฉพาะ, path/sha256/size/mime, และ generator version
- Reprint = render จาก snapshot เท่านั้น ไม่แตะข้อมูล live; ถ้าไม่มี snapshot ให้บอกชัดว่า reprint ไม่ได้ ไม่เดา
- Immutable guard ระดับ database: ห้าม UPDATE/DELETE snapshot และ artifact (แพทเทิร์นเดียวกับ `guard_document_signature_evidence`)
- API server-only ผ่าน service role: create snapshot (idempotent ต่อ document + sequence), get snapshot/artifact, list ต่อเอกสาร
- Audit สำหรับการออก/สร้าง artifact ทุกครั้ง (actor, เวลา, fingerprint)
- เฟสนี้ทดสอบ engine ด้วยข้อมูลตัวอย่างหลายสถานการณ์ แต่ **ยังไม่สลับ** ปุ่มพิมพ์ production ให้ผู้ใช้ทั่วไป (เปิดเฉพาะเส้นทางตรวจสอบภายใน/flag)

## Snapshot contract

snapshot หนึ่งแถวประกอบด้วย 4 กลุ่มที่ pin พร้อมกันในธุรกรรมเดียว:

1. **Identity** — documentType (`quotation`|`sales_order`), documentId, documentNumber, issue sequence, issuedAt, issuedBy
2. **Version pins** — companyDataVersionId, documentStandardVersionId, commercialPresetVersionId (nullable ถ้ายังไม่ resolve), signatureEvidenceId (จาก Phase 5), layoutTemplateVersion (ค่าคงที่ของ generator), locale
3. **Resolved payload** — JSONB ของเนื้อหาที่ render จริง (normalize + sorted keys) พร้อม schema guard
4. **Fingerprint** — `sha256` ของ canonical payload + version pins เพื่อยืนยันความไม่เปลี่ยน

artifact หนึ่งแถวต่อ snapshot: storageBucket, storagePath, mimeType (`application/pdf`), sizeBytes, sha256, generatorVersion, createdAt

## Immutability และ lifecycle

1. snapshot + artifact สร้างครั้งเดียวตอนออกเอกสาร (issue) และ immutable ตลอดไป
2. ห้าม hard delete ผ่าน UI/API; database trigger ปฏิเสธ UPDATE/DELETE
3. reprint ไม่สร้าง snapshot ใหม่ ใช้ artifact เดิม; ถ้าเนื้อหาเปลี่ยน (fingerprint ใหม่) ถือเป็นการออกเอกสารครั้งใหม่พร้อม sequence ใหม่
4. FK แบบ `ON DELETE RESTRICT` ป้องกันลบ company/form/preset/signature version ที่ถูก pin

## Legacy และ migration

- Migration ที่วางแผน: `0130_issued_document_snapshot.sql`
- ตารางใหม่ 2 ตาราง (`issued_documents`, `issued_document_artifacts`) + guard triggers + RLS + service-role grants
- **ไม่ backfill** เอกสารเก่า; เอกสารที่ออกก่อน 7B เป็น legacy ที่ reprint ผ่าน engine เดิมจนกว่าจะออกใหม่ (สอดคล้อง Phase 5 ที่ไม่ backfill approval evidence)
- ไม่แก้ `quotations`, `sales_orders`, `quote_note_templates` หรือใบเสนอราคาเก่า
- Rollback ระดับแอป = ปิด API/flag ใหม่และคง engine เดิม; ไม่ drop snapshot/artifact ที่สร้างแล้ว

## Storage

- ใช้ storage bucket แยกสำหรับ issued PDF, private, เข้าถึงผ่าน server ด้วย service role เท่านั้น
- Browser ไม่มีสิทธิ์อ่าน/เขียน bucket โดยตรง; ดาวน์โหลดผ่าน server route ที่ตรวจ session + authorization
- ยืนยันรูปแบบ storage/credential ที่โปรเจกต์ใช้จริง (ทบทวน `account/signature/[versionId]/file` เป็น pattern อ้างอิง) ก่อนล็อกโครงสร้าง

## Permission ชั่วคราว

- ออกเอกสาร/สร้าง artifact: ผูกกับสิทธิ์อนุมัติเดิมของแต่ละเอกสาร (เจ้าของดีล/AE Supervisor/Admin สำหรับ QT, Admin/AE Supervisor สำหรับ SO) — ไม่สร้าง role ใหม่ก่อน Phase 8–9
- ทุก route ตรวจ session + gate ใกล้ data source

## ไม่รวมใน Phase 7B

- แทน `quotePrint.js` ด้วย Quotation Master V2 ในเส้นทาง production ของผู้ใช้ทั่วไป (Phase 7C)
- เปลี่ยน Sales Order print/consumer (Phase 7D)
- เลือก commercial preset อัตโนมัติในหน้าสร้าง/แก้ Quotation
- แก้ใบเสนอราคา เอกสาร หรือ template เดิมย้อนหลัง
- Permission redesign (Phase 8–9)

## Validation และ Definition of Done

- [ ] ผู้ใช้ยืนยันขอบเขตก่อนแก้ implementation
- [ ] ซิงก์ `main` ล่าสุดและแยก PR ตามขอบเขต โดยไม่แตะ `.agents/`
- [ ] ตรวจ storage/credential และ lifecycle/migration pattern ปัจจุบันก่อนล็อก schema
- [ ] Migration 0130 สร้างตาราง + immutable guard + RLS + grants โดยไม่แตะข้อมูลเดิม
- [ ] Snapshot immutability, stale/duplicate no-write, atomic issue และ fingerprint determinism ผ่าน automated tests
- [ ] Reprint จาก snapshot ให้ผลเหมือนเดิมทุกครั้งบนข้อมูลตัวอย่างหลายสถานการณ์ (หนึ่งรายการ, หลายหน้า, ส่วนลด, หนึ่ง/หลายงวด, มี/ไม่มีลายเซ็น)
- [ ] Authorization ตามสิทธิ์อนุมัติเดิมและ denial ของ role อื่นผ่าน tests
- [ ] Migration integrity, rollback notes, targeted lint/tests และ production build ผ่าน
- [ ] อัปเดต implementation validation, known issues และหลักฐานตามผลจริง
- [ ] ผู้ใช้ตรวจและยืนยันก่อน Commit, Push และ PR

## Implementation validation — 20 กรกฎาคม 2026

- เพิ่ม Migration `0130_issued_document_snapshot.sql`: ตาราง `issued_documents` + `issued_document_artifacts`, immutable guard triggers (block UPDATE/DELETE), UNIQUE (documentType, documentId, contentFingerprint) เพื่อ idempotency, FK แบบ RESTRICT ไป quotation/standard version/preset version/signature evidence, RLS + service-role-only, และ `capture_issued_quotation_snapshot_atomic`
- RPC ตรวจ: quotation ต้อง `approved`, `signatureEvidenceId` ต้องตรงกับที่อนุมัติ, document standard version ต้องตรงกับ evidence, fingerprint format, และ **idempotent** (เนื้อหาเดิม → คืน snapshot เดิม ไม่สร้าง sequence ซ้ำ)
- artifact เก็บเป็น canonical HTML inline (ไม่ใช้ storage bucket ในเฟสนี้ — เลื่อน PDF+bucket ไป 7C ตามมติ)
- เพิ่ม `lib/sales/issuedQuotationSnapshot.js`: สร้าง resolved payload (pin content + customer + company snapshot + standard), fingerprint ผ่าน `documentApprovalFingerprint` เดิม, render artifact ผ่าน `buildQuotePrintHTML` (pure string builder รันฝั่ง server ได้), และเรียก RPC
- เสียบ capture เข้า `POST /api/sales-planning/quotations/[id]/approval` แบบ best-effort หลังอนุมัติสำเร็จ — snapshot ที่ fail ไม่ roll back การอนุมัติ (RPC idempotent จึง regenerate ได้)
- เพิ่ม reprint route `GET /api/sales-planning/quotations/[id]/issued` (list metadata / `?render=latest|<seq>` คืน HTML ที่ตรึงไว้พร้อม fingerprint header) — server-only ผ่าน session + `canViewSalesPlanning`
- `check:migrations` ผ่าน 130 ไฟล์ (latest 0130); unit tests ของ snapshot ผ่าน 5/5 (payload pin, fingerprint deterministic + content-sensitive, artifact ไม่มีลายน้ำ draft, sha256 stable)
- **ยังไม่แทน** `quotePrint.js` ในเส้นทางผู้ใช้ทั่วไป; ปุ่มพิมพ์เดิมทำงานเหมือนเดิมทุกประการ

## งานที่รอสภาพแวดล้อมจริง

- เครื่อง/worktree นี้ติดตั้ง node_modules ไม่ครบ (ขาด `eslint`, `lucide-react` ฯลฯ) จึงยังไม่ได้รัน `npm run lint` และ `next build`; test อื่นที่ import UI package fail จากสาเหตุนี้ (pre-existing, ไม่เกี่ยวกับ 7B) — ต้องรัน lint/build บนเครื่องที่ deps ครบก่อนปิดเฟส
- ยังไม่ได้ execute SQL กับฐานข้อมูลจริง (ไม่มี psql/Supabase CLI/Docker) — ต้องยืนยัน lifecycle/immutability/idempotency หลังผู้ใช้รัน Migration 0130
- UAT: อนุมัติใบเสนอราคาจริงหนึ่งใบ → ตรวจว่า snapshot + artifact ถูกสร้าง, reprint ให้ HTML เดิม, และแก้ master ภายหลังไม่กระทบ reprint

## Known risks

- PDF generation ฝั่ง server อาจต้อง headless renderer ที่ไม่มีในสภาพแวดล้อมนี้ → ต้องยืนยันแนวทาง render (server HTML→PDF vs เก็บ HTML canonical + fingerprint ก่อน แล้วต่อ PDF ใน 7C) ก่อนล็อกขอบเขต artifact
- Canonical JSON ต้อง deterministic (sorted keys, normalized number/locale) ไม่งั้น fingerprint เพี้ยนแม้ข้อมูลเดิม
- Storage bucket ใหม่เพิ่ม config surface; ต้องยืนยัน credential/RLS ให้ server-only จริง
- การ pin หลายเวอร์ชันด้วย FK RESTRICT จะบล็อกการลบ master version ที่เคยใช้ — เป็นพฤติกรรมที่ตั้งใจ ต้องสื่อสารกับผู้ดูแล

## มติที่ยืนยันแล้ว (20 กรกฎาคม 2026)

1. **artifact = canonical HTML + fingerprint** ในเฟสนี้ ไม่เก็บ PDF binary; การเรนเดอร์ PDF จริงเลื่อนไป Phase 7C เมื่อยืนยัน renderer ที่ prod รองรับ
2. **ขอบเขต quotation เท่านั้น** ใน 7B; model เผื่อ `documentType` ไว้แต่ยังไม่ทำ sales_order (อยู่ 7D)
3. **trigger = ตอนอนุมัติ (approved)** ผูกกับ `approve_quotation_with_signature_evidence_atomic` ของ Phase 5 เพื่อจับสถานะที่แช่แข็งชุดเดียวกัน ไม่เพิ่มจุด trigger ใหม่
