# แผน: ย้ายไฟล์แนบขึ้น Google Drive

สถานะ: **Phase 1+2 โค้ดเสร็จ + build/lint ผ่าน** (ยังไม่เทส runtime บน Vercel) · 2026-06-24
รอ: ตั้ง env Vercel + รัน migration 0048 + เทสบน preview deploy (WIF ใช้งานได้เฉพาะบน Vercel)

**จุดประสงค์:** บริษัทมี Google Workspace (มีพื้นที่ cloud อยู่แล้ว) → ย้ายการอัปไฟล์
ไป Google Drive เพื่อ **ลดการใช้พื้นที่ Supabase Storage**

ย้าย backend เก็บไฟล์แนบจาก Supabase Storage → Google Drive (Shared Drive บริษัท)
จัดโฟลเดอร์ ลูกค้า → สินค้า, คุมสิทธิ์ผ่านระบบเดิม (team/role). ตาราง `attachments`
(migration 0028) และ UI เดิมไม่ต้องรื้อ — สิทธิ์ยัง piggyback กับ customer/product
ผ่าน `canViewRecord`/`canEditRecord`.

---

## Alignment กับ Boundary Map (ตรวจกับโค้ดจริงแล้ว)

แผนนี้เป็น **storage-layer track** — ดู roadmap รวม [`BOUNDARY_MAP_PLAN.md`](BOUNDARY_MAP_PLAN.md)
และ contract attachment [`ATTACHMENT_REQUIREMENT_SPEC.md`](ATTACHMENT_REQUIREMENT_SPEC.md)

**สอดคล้อง (สถาปัตยกรรมรองรับอยู่แล้ว):**
- แตะแค่ชั้น **Storage** — `ATTACHMENT_REQUIREMENT_SPEC §1` แยก storage ออกจาก requirement ไว้พอดี
- **Requirement engine ไม่กระทบ** — `listAttachments()` อ่าน *row* (docType ครบไหม) ไม่ใช่ bytes → backend-agnostic
- UI เรียก `/api/master/attachments` อยู่แล้ว (ตรง namespace Phase 0)

**ปรับ/ประสานเพิ่ม (เจอตอน cross-check — สำคัญ):**

1. **`proxy.js` gating — ตรวจแล้ว ไม่ต้องแก้** (เดิมกังวลผิด). `apiWriteAllowed` คืน true
   ทันทีสำหรับ GET (`proxy.js:140`) และ `lockedOut` ปล่อย GET ผ่าน prefix `/api/attachments`
   (อยู่ใน `OPEN_WRITE_APIS`) → route ดาวน์โหลด GET ผ่าน proxy ได้สำหรับผู้ล็อกอินทุกคน.
   การคุมสิทธิ์จริงคือ `canViewRecord` ใน handler (เหมือน GET `/api/attachments` เดิม).
   route ทำที่ `/api/master/attachments/[id]/file` (ตรง namespace, Alignment #4).

2. **DELETE handler ชนกับ Phase 2 ของ roadmap** — #5 (ลบไฟล์ Drive ตอน DELETE) แตะ handler
   เดียวกับงาน deletion policy + เก็บ demo hack. ทำคู่กันหรือเรียงให้ชัด กันแก้ทับ.

3. **Phase 3 (ย้ายไฟล์เก่า) = required ไม่ใช่ option** — จุดประสงค์คือ *ลดพื้นที่ Supabase
   ที่ใช้อยู่*. Hybrid (ใหม่→Drive, เก่าคาที่เดิม) แค่ "หยุดโต". ต้องทำ Phase 3 + เพิ่มขั้น
   **ลบ original บน Supabase หลังย้าย+verify สำเร็จ** ไม่งั้นพื้นที่ไม่ลดจริง.

4. **Namespace ของ route ใหม่** — เขียนเป็น `/api/attachments/[id]/file` (legacy) แต่ UI อยู่
   ฝั่ง `/api/master/*` → ให้ href + proxy gate ตรง namespace กัน (master หรือทำ alias).

---

## A. การตัดสินใจหลัก (ยืนยันแล้ว)

| หัวข้อ | ค่าที่เลือก |
|---|---|
| Backend | Google Drive (Shared Drive บริษัท) — Supabase Storage เก็บไว้เป็น fallback ของไฟล์เก่า |
| Auth | **Workload Identity Federation** (Vercel OIDC → impersonate Service Account, **ไม่มี downloadable key**) + Shared Drive. เลือก WIF เพราะ org บังคับ `iam.disableServiceAccountKeyCreation` (สร้าง JSON key ไม่ได้) |
| โครงสร้าง | โฟลเดอร์ลูกค้า → โฟลเดอร์สินค้า (nest ผ่าน `product.customerId`, FK จาก mig 0006) |
| สิทธิ์ | **ระดับ A — ไฟล์ private + proxy ดาวน์โหลดผ่านระบบ** (คุมตามทีม/role เดิม) |
| Migration ไฟล์เก่า | Hybrid: เก่าอ่าน Supabase, ใหม่ขึ้น Drive (ย้ายเก่าเป็นเฟสท้าย — **required เพื่อลดพื้นที่จริง**) |

## B. Flow ก่อน/หลัง

**ก่อน:** `client → /api/upload (เขียน Supabase) → คืน publicUrl → POST /api/master/attachments (เก็บ fileUrl)`
แสดงผลด้วย `<a href={fileUrl}>` เปิดตรง (public URL)

**หลัง (ระดับ A):**
```
client → /api/upload {file, entityType, entityId}
           → resolve โฟลเดอร์ลูกค้า/สินค้า (cache driveFolderId)
           → อัปขึ้น Drive (private — ไม่ตั้ง permission)
           → คืน { driveFileId, webViewLink }
       → POST /api/master/attachments { fileUrl: webViewLink, driveFileId }
แสดงผล/ดาวน์โหลด → <a href="/api/master/attachments/{id}/file">
           → เช็ก canViewRecord → stream bytes จาก Drive
```

## C. จุดเชื่อมต่อทั้งหมดที่ต้องแตะ (สำรวจจากโค้ดจริงแล้ว)

| # | ไฟล์ | ต้องทำอะไร |
|---|---|---|
| 1 | `src/app/api/upload/route.js` | แตกสาขา backend ตาม `STORAGE_BACKEND`; รับ `entityType/entityId`; resolve โฟลเดอร์; คืน `driveFileId` |
| 2 | `src/lib/drive.js` *(ใหม่)* | google client + ensureFolder + upload + getStream + delete |
| 3 | `src/app/api/attachments/route.js` POST | รับ + เก็บ `driveFileId` |
| 4 | `src/app/api/attachments/[id]/file/route.js` *(ใหม่)* | proxy ดาวน์โหลด (เช็กสิทธิ์ → stream) — **+ ลงทะเบียน gate ใน `proxy.js` (ดู Alignment #1)** |
| 5 | `src/app/api/attachments/[id]/route.js` DELETE | ลบไฟล์บน Drive ด้วย (best-effort) ถ้ามี `driveFileId` — **ประสานกับ Phase 2 (Alignment #2)** |
| 6 | `src/components/AttachmentsPanel.js` | ส่ง `entityType/entityId` ขึ้น upload; เปลี่ยน `href` ทุกจุด (3 ที่) ไป proxy; ส่ง `driveFileId` ตอน POST |
| 7 | `src/components/excise/ReceiveDialog.js` | ปรับ payload upload + ส่ง `driveFileId` ต่อ |
| 8 | `src/components/excise/FileTaxDialog.js` | เหมือน #7 |
| 9 | `src/lib/tax/registrationFiles.js` | **สำคัญ** — เปลี่ยนจาก `fetch(fileUrl)` เป็นดึงผ่าน `getFileStream(driveFileId)` (ไฟล์ private fetch ตรงไม่ได้) |
| 10 | migration ใหม่ | เพิ่มคอลัมน์ (ดู §D) |

## D. Migration ใหม่ (รันมือบน Supabase prod — DDL ผ่าน service-role ไม่ได้)

ตั้งเลขถัดจาก 0046 (⚠ ยืนยันเลขล่าสุดก่อน push — เคยเจอเลขชนตอน merge):
```sql
-- attachments: เก็บ Drive file id (null = ไฟล์เก่าบน Supabase)
alter table public.attachments add column if not exists "driveFileId" text;
-- cache โฟลเดอร์ Drive ราย entity (สร้างครั้งแรกแล้วใช้ซ้ำ)
alter table public.customers add column if not exists "driveFolderId" text;
alter table public.products  add column if not exists "driveFolderId" text;
```
> `fileUrl` ยังเก็บ (= webViewLink ไว้ปุ่ม "เปิดใน Drive"). แยกเก่า/ใหม่ดูจาก `driveFileId != null`

## E. `lib/drive.js` — สัญญา API ที่จะสร้าง

```
getDrive()                                    // google client ผ่าน Workload Identity Federation
                                              //   (ExternalAccountClient + subjectTokenSupplier
                                              //    คืน Vercel OIDC token; ไม่มี key ในเครื่อง)
ensureCustomerFolder(customer)                // → folderId (cache ลง customers.driveFolderId)
ensureProductFolder(product, customer)        // → folderId ใต้โฟลเดอร์ลูกค้า (cache ลง products)
resolveFolderForEntity(entityType, entityId)  // map order/registration → โฟลเดอร์ลูกค้า
uploadFile(folderId, {buffer, name, mimeType})// → { id, webViewLink }  (private)
getFileStream(driveFileId)                    // → ReadableStream (proxy + zip)
deleteFile(driveFileId)                        // best-effort
```
- โฟลเดอร์ตั้งชื่อ `<ชื่อ> (รหัส)` กันชนกัน; ค้นด้วย `name + "'<parent>' in parents" + mimeType=folder` ก่อนสร้าง (idempotent)
- ทุกคำสั่งใส่ `supportsAllDrives:true`, `driveId`, `corpora:'drive'`
- Drive รับชื่อ Unicode (ไทย) ได้ — ไม่ต้อง sanitize เป็น ASCII เหมือน Supabase

## F. การตั้งค่า Google (Workload Identity Federation — ฝั่งผู้ใช้)

> org บังคับ `iam.disableServiceAccountKeyCreation` → **สร้าง JSON key ไม่ได้** ใช้ WIF แทน
> (Vercel ออก OIDC token → GCP แลกเป็นสิทธิ์ impersonate SA — ไม่มีไฟล์ key ที่หลุดได้)

1. GCP project → เปิด **Google Drive API**
2. สร้าง **Service Account** (ไม่ต้องออก key, ไม่ต้องให้ project role) → จดอีเมล SA
3. **Shared Drive** บริษัท → เพิ่มอีเมล SA เป็น **Content Manager** + จด Shared Drive ID
4. **Workload Identity Pool + OIDC provider** (IAM & Admin → Workload Identity Federation):
   - Issuer (URL): Vercel OIDC issuer `https://oidc.vercel.com/<TEAM_SLUG>`
   - Allowed audience: ค่า audience ของ Vercel (default `https://vercel.com/<TEAM_SLUG>`)
   - Attribute mapping: `google.subject = assertion.sub`
   - Attribute condition (แนะนำ): จำกัดเฉพาะ project/owner ของ Vercel เช่น `assertion.owner == '<team>'`
5. **ผูกสิทธิ์ impersonate:** grant `roles/iam.workloadIdentityUser` บน SA ให้ principalSet ของ pool
6. ที่หน้า provider → **Download config** (external account JSON — *ไม่ลับ*, ชี้ pool/SA เฉย ๆ)
7. **Vercel:** เปิด OIDC Federation (Project Settings → Security) → ได้ `VERCEL_OIDC_TOKEN` ใน runtime
8. ตั้ง env (Vercel + `.env.example`):
   - `STORAGE_BACKEND=drive`
   - `GOOGLE_WIF_CONFIG` (external account JSON จากข้อ 6 — ไม่ลับ)
   - `GOOGLE_SHARED_DRIVE_ID`
   - *(option)* `GOOGLE_DRIVE_ROOT_FOLDER_ID`

> ⚠ ต้องเป็น **Shared Drive** ไม่ใช่ My Drive — SA ไม่มี quota ของตัวเอง,
> และ Shared Drive ทำให้ไฟล์เป็นของบริษัท ไม่ผูกบัญชีพนักงานที่อาจลาออก
> ⚠ route ต้องเป็น **Node runtime** (googleapis + อ่าน OIDC token) ไม่ใช่ edge

## G. การคุมสิทธิ์ระดับ A — รายละเอียด

- ไฟล์อัปแบบ **ไม่ตั้ง permission ใดๆ** → เห็นได้แค่สมาชิก Shared Drive + service account
- Proxy route `/api/attachments/[id]/file`:
  1. `getAttachment(id)` → หา parent → `canViewRecord(user, RESOURCE, parent)`
     (ตรรกะซ้ำกับ GET เดิม — แยกเป็น helper `assertCanViewAttachment()` กัน drift)
     **⚠ ต้องผ่าน proxy.js coarse gate ก่อนถึง handler — gate ปัจจุบันปล่อยเฉพาะ editor
     (Alignment #1) ต้องเปิดให้ระดับ view สำหรับ subpath `/file`**
  2. ผ่าน → `getFileStream(driveFileId)` → ส่งกลับพร้อม `Content-Type`,
     `Content-Disposition: inline`, `Cache-Control: private`
  3. ไฟล์เก่า (`driveFileId == null`) → redirect ไป Supabase `fileUrl` เดิม (hybrid)
- ผล: ใครเห็นไฟล์ไหน = ตามทีม ODM/KA/SV + ลำดับชั้นที่มีอยู่; ลิงก์หลุดไปเปิดไม่ได้ถ้าไม่ล็อกอิน

## H. เฟสการทำงาน

**เฟส 0 — เตรียม (ผู้ใช้ + Claude)**
- ผู้ใช้: ตั้ง Service Account + Shared Drive + ส่ง env (หรือวางโค้ดรอ env ก่อน)
- Claude: เตรียม SQL migration ให้รันมือ

**เฟส 1 — ท่ออัปโหลดขึ้น Drive**
- สร้าง `lib/drive.js` + แก้ `/api/upload` (#1,#2) + เก็บ `driveFileId` (#3)
- แก้ผู้เรียกทั้ง 3 (#6,#7,#8) ให้ส่ง context + เก็บ `driveFileId`
- ทดสอบ: อัปไฟล์ลูกค้า/สินค้า → โฟลเดอร์ nest ถูก + แถว DB มี driveFileId

**เฟส 2 — สิทธิ์ระดับ A**
- proxy route (#4) + **gate ใน proxy.js** + เปลี่ยน `href` ใน UI ไป proxy (#6) + ปรับ DELETE (#5)
- แก้ ZIP export ให้ดึงผ่าน Drive (#9)
- ทดสอบ: user ต่างทีมเปิดไฟล์ไม่ได้ (403); ผู้ดูได้ (view-only) เปิดได้; เจ้าของเปิดได้; ZIP ครบ; ลบหายทั้ง DB+Drive

**เฟส 3 — ย้ายไฟล์เก่า (required เพื่อลดพื้นที่ Supabase จริง)**
- one-off script: แถวที่ `driveFileId is null` → ดึงจาก Supabase → อัป Drive → อัปเดตแถว
- **ลบ original บน Supabase Storage หลัง verify ว่าไฟล์บน Drive อ่านได้** (นี่คือขั้นที่ลดพื้นที่จริง)
- ทำเป็น batch + log ไฟล์ที่ย้ายไม่สำเร็จ (ไม่ลบ Supabase ถ้า Drive ยังไม่ยืนยัน)

## I. ความเสี่ยง / ข้อควรระวัง

1. **ZIP export (#9)** — จุดลืมง่ายสุด; ถ้าไม่แก้ ZIP จะได้ไฟล์เปล่าเมื่อไฟล์เป็น private
2. **proxy.js gate ของ `/file` (Alignment #1)** — ลืมแล้ว viewer โหลดไม่ได้ / หรือเปิดกว้างเกิน
3. **`googleapis` เป็น Node lib หนัก** — route ต้องเป็น Node runtime ไม่ใช่ edge;
   repo นี้เป็น Next เวอร์ชันพิเศษ (ดู AGENTS.md) → อ่าน docs ใน
   `node_modules/next/dist/docs/` ก่อนตั้ง runtime config
4. **Rate limit Drive API** — อัปหลายไฟล์พร้อมกันอาจชน quota; cache `driveFolderId`
   ช่วยลด API call ค้นโฟลเดอร์ (สำคัญตอน Phase 3 batch migrate)
5. **เลข migration ชนตอน merge** — ยืนยันเลขล่าสุดก่อน push
6. **เคลียร์ demo data ก่อน deploy**
7. **performance proxy** — ไฟล์ ≤10MB วิ่งผ่าน server ได้สบาย; ใช้ stream (ไม่ buffer
   ทั้งไฟล์) + cache header
8. **Phase 3 ลบ Supabase = irreversible** — ลบ original ต้องมั่นใจว่า Drive อ่านได้แล้วเท่านั้น

## J. Test checklist

- [ ] อัปไฟล์ลูกค้า → โผล่ในโฟลเดอร์ลูกค้าบน Drive
- [ ] อัปไฟล์สินค้า → โผล่ใต้โฟลเดอร์ ลูกค้า > สินค้า
- [ ] user ต่างทีม GET `/file` → 403
- [ ] user ระดับ view-only (ดูได้/แก้ไม่ได้) GET `/file` → เปิดได้ (Alignment #1)
- [ ] ไฟล์เก่า (Supabase) ยังเปิดได้ (hybrid redirect)
- [ ] ลบ → หายทั้งแถว DB + ไฟล์ Drive
- [ ] ZIP export ครบทุกไฟล์
- [ ] excise ReceiveDialog / FileTaxDialog อัปได้
- [ ] Phase 3: ย้ายไฟล์เก่าครบ + พื้นที่ Supabase ลดลงจริง

---

ขอบเขตรวม: ~3-4 ไฟล์ใหม่ + แก้ ~7 ไฟล์ (รวม `proxy.js`) + 1 migration
