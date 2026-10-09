# เส้นที่ส่งไฟล์ที่ผู้ใช้อัปไว้กลับออกจากโดเมนของระบบ + ไฟล์แนบที่ระเบียนแม่ถูกลบ

> สถานะ: **รอตรวจ** · ตรวจกับโค้ดเมื่อ 2026-10-09 (เฉพาะส่วนของ `confirm-file` — ดู §แก้ตาม 2026-10-09 · ส่วนอื่นตรวจ 2026-10-08) · **merge เข้า main แล้ว 2026-10-08** (#1884 `1ede590a`) · เจ้าของสั่ง deploy คืนเดียวกัน · ไม่มี migration · ไม่มีตัวแปร env · ⚠️ ยังไม่ได้ลองกับ server / Drive / ฐานจริง — ยืนยันด้วยเทสต์อ่านซอร์สและเทสต์ตัวช่วยล้วน · งานปิดช่องโหว่สายไฟล์แนบที่ตรวจเจอ 08/10/2569 แยกเป็นสาม PR ตามไฟล์ (อีกสองส่วน: ใบรับการอัปโหลด `claude/upload-receipts` · กติกาผูกเอกสาร Google `claude/google-link-rule`) — เอกสารนี้ครอบเฉพาะ 7 ไฟล์ของส่วนนี้ · **แก้ตาม 2026-10-09** (PR `claude/evidence-private-only` · ยังไม่ merge · ยังไม่ได้ลองกับ server / Storage จริง): `sales-orders/[id]/confirm-file` ไม่มีทาง Drive และทาง redirect แล้ว

**อ่านก่อนเพิ่ม route ที่ส่งไบต์ของไฟล์ออกให้เบราว์เซอร์ และก่อนแตะด่านลบ/แก้ไฟล์แนบ (`guardAttachmentWrite`)**

## ของที่พัง (ตรวจ 08/10/2569)

| # | อาการ | เส้นที่เป็น |
|---|---|---|
| ① | **stored XSS** — ตอบ `'Content-Type': att.mimeType \|\| …` พร้อม `Content-Disposition: inline` ทุกชนิด · `mimeType` ใน ref เป็นค่าที่ **client ประกาศเองตอนบันทึก** ⇒ แนบไฟล์แล้วประกาศ `text/html` = หน้าเว็บที่รันสคริปต์บนโดเมนของระบบ ด้วยคุกกี้ของคนที่กดเปิด | `quotations/[id]/file` · `sales-orders/[id]/confirm-file` · `sales-orders/[id]/payment-file` |
| ② | **open redirect** — ref ที่ไม่มี `driveFileId` ถูก `Response.redirect(att.fileUrl, 307)` โดยไม่ตรวจปลายทาง · `fileUrl` ก็เป็นค่าจาก client ⇒ ลิงก์ที่ขึ้นต้นด้วยโดเมนของระบบแต่พาไปเว็บอื่น | `updates/[id]/file` · `quotations/[id]/file` · `sales-orders/[id]/confirm-file` |
| ③ | **ไฟล์แนบกำพร้าใครก็ลบ/แก้ได้** — `guardAttachmentWrite` ถือ "ไม่มีแถวแม่" เป็น "เหลือด่านระบบล้วน" และสาขา `PARENT_TABLE` เขียนว่า `if (parent && …)` ⇒ แม่หาย = ไม่มีด่านรายใบเลย · ใครผ่านด่านโมดูล (หรือแค่ด่านหยาบของ `proxy.js`) ก็ลบ/แก้ไฟล์ของระเบียนที่ตัวเองไม่เคยมีสิทธิ์ | `DELETE` และ `PATCH /api/attachments/[id]` (สองทางผ่านตัวกลางเดียวกัน) |

ทุกเส้นอยู่ใต้ `webapp/src/app/api/` · เส้น `quotations/…` กับ `sales-orders/…` อยู่ใต้ `sales-planning/` อีกชั้น · ตารางนี้คืออาการ ณ วันที่ตรวจ — `confirm-file` ถูกถอดทาง redirect ออกทั้งทางในวันถัดมา (§แก้ตาม 2026-10-09)

## สี่เส้นส่งไฟล์ทำอะไรตอนนี้

header ของทุก Response ที่ส่งไบต์มาจาก [`attachmentFileHeaders`](../webapp/src/lib/master/attachmentTypes.js) ตัวเดียว (ตัวช่วยนี้มีอยู่เดิม PR นี้ไม่ได้แก้):

- **Content-Type คิดจากนามสกุลไฟล์** (`resolveUploadMime` → ตาราง `EXT_MIME`) ไม่ใช้ค่าในแถว · นามสกุลที่ไม่รู้จัก จะใช้ชนิดที่ประกาศได้ต่อเมื่ออยู่ใน `ACCEPTED_UPLOAD_MIME` · นอกนั้น `application/octet-stream`
- **เปิดในแท็บ (`inline`)** เฉพาะ `INLINE_SAFE_MIME`: `.pdf` · `.txt` · `.png` · `.jpg/.jpeg` · `.webp` · `.gif` · `.bmp`
- **บังคับดาวน์โหลด (`attachment`)** ทุกอย่างที่เหลือ — Office (`.doc/.docx/.xls/.xlsx/.ppt/.pptx`) · `.csv` · `.zip/.rar/.7z` · `.ai/.eps/.psd` · `.heic/.heif` · `.tif/.tiff` · และไฟล์ที่ไม่ควรอยู่ในระบบ (`.html` · `.svg` ⇒ `octet-stream` + ดาวน์โหลด · เว้นแต่ประกาศชนิดที่อยู่ในลิสต์ที่รับมาด้วย — ดู §ช่องที่ยังเปิด)
- `X-Content-Type-Options: nosniff` ทุกตอบ · `Cache-Control: private, max-age=60` เป็นค่าตั้งต้น

| เส้น | ไบต์จากไหน | header | แคช | redirect |
|---|---|---|---|---|
| `updates/[id]/file` | Drive | `attachmentFileHeaders(att)` (ใช้อยู่ก่อนแล้ว) | `private, max-age=60` | ตรวจก่อน |
| `quotations/[id]/file` | ถังส่วนตัว (`storagePath`) | `{ ...attachmentFileHeaders(att), 'Cache-Control': 'private, no-store' }` | `private, no-store` | — |
| | Drive | `attachmentFileHeaders(att)` | `private, max-age=60` (เท่าเดิม) | ตรวจก่อน |
| `sales-orders/[id]/confirm-file` | ถังส่วนตัวอย่างเดียว (แก้ 2026-10-09 — เดิมเหมือน `quotations/[id]/file` ทั้งสองทาง) | spread + `no-store` | `private, no-store` | ไม่มี redirect · ไม่มีทาง Drive · ref ที่ไม่มี `storagePath` = 404 `ไม่พบไฟล์แนบ` |
| `sales-orders/[id]/payment-file` | ถังส่วนตัวอย่างเดียว | spread + `no-store` | `private, no-store` | ไม่มี redirect · ไม่มีทาง Drive |

**redirect** (เหลือสองเส้น: `updates/[id]/file` · `quotations/[id]/file`) — ref ที่ไม่มี `driveFileId` ไปต่อได้เฉพาะเมื่อ [`attachmentUrlError(att.fileUrl)`](../webapp/src/lib/master/attachmentStorage.js) คืน `null` คือ `https` + host เป็น `drive.google.com` หรือ `docs.google.com` เป๊ะ · ปลายทางอื่น/ค่ามั่ว (`http:` · `javascript:` · `//evil` · host ที่แค่ขึ้นต้นด้วยชื่อ Google) ⇒ **404 `ไม่พบไฟล์แนบ`** ตอบเหมือนไม่มีไฟล์ (เส้น `master/attachments/[id]/file` ใช้ตัวตรวจเดียวกันแต่ตอบ 400 — ไม่ได้แก้ในรอบนี้)

ผลที่ผู้ใช้เห็น: หลักฐาน/ไฟล์ในเธรดชนิดนอกลิสต์ `inline` ดาวน์โหลดแทนการเปิดในแท็บ · PDF กับรูปเปิดเหมือนเดิม

## ข้อมูลจริงที่ใช้ตัดสิน (อ่านอย่างเดียว 08/10/2569)

- ref ในเธรดอัปเดต (`entity_updates.attachments`) มี `driveFileId` ทุกใบ
- ref หลักฐาน Won (`quotations.wonAttachments`) และเอกสารยืนยันคำสั่งซื้อ (`sales_orders.confirmAttachments`) เป็น `storagePath` ทุกใบ
- **ไม่มี ref แบบ URL ล้วนเลย** ⇒ ด่าน redirect ไม่ทำให้ไฟล์จริงใบไหนเปิดไม่ได้ (ref เก่าที่ชี้ URL สาธารณะของ Supabase จะตอบ 404 ตามกติกานี้ — วัดแล้วไม่มีเหลือ)

⚠️ ข้อมูลชุดนี้มาจากผู้ตรวจที่อ่านฐานจริง ไม่มีสคริปต์หรือจำนวนแถวในรีโป — ในโค้ดมีแค่ข้อสรุปข้อสุดท้ายเป็นคอมเมนต์ในเส้นที่ redirect (วันนั้นสามเส้น · วันนี้เหลือสอง)

## แถวแม่ถูกลบไปแล้ว: ใครลบ/แก้ไฟล์ค้างได้

`guardAttachmentWrite` ใน `webapp/src/app/api/attachments/[id]/route.js`:

```js
const canSweepOrphan = isSuperuser(user?.role) || (!!att.uploadedBy && att.uploadedBy === user?.id);
```

- ผ่านได้เฉพาะ **คนที่แนบไฟล์นั้นเอง** (`attachments.uploadedBy`) หรือ **ผู้ดูแล** ตาม [`isSuperuser`](../webapp/src/lib/permissions.js) = `admin` + `SALES_SUPERVISOR_ROLES` (Commercial Director · Commercial Manager · AE Supervisor · AC Supervisor)
- แถวเก่าที่ `uploadedBy` ว่าง = ผู้ดูแลเท่านั้น
- ไม่ผ่าน = **403** `<ลบเอกสาร|แก้รายละเอียดเอกสาร>ไม่ได้ — ระเบียนต้นทางของไฟล์นี้ถูกลบไปแล้ว เหลือเฉพาะคนที่แนบไฟล์นี้หรือผู้ดูแลระบบที่เก็บกวาดได้`
- ด่านนี้ถูกถาม **ทันทีหลังรู้ว่าอ่านแถวแม่ไม่พัง** (อ่านพังยังหยุดที่ 500 เหมือนเดิม) และก่อนตัวตัดสินเดิมของสาขา — ตัวตัดสินเดิมยังทำงานต่อ

| สาขา | entityType | แม่หาย ต้องผ่านอะไรบ้าง |
|---|---|---|
| ขอราคา/คำร้อง | คีย์ของ `COSTING_ATTACHMENT_TABLE` | `canSweepOrphan` **และ** `canViewCosting` |
| ดีล/โครงการ/สัญญา | `deal` · `project` · `contract` · `contract_addendum` | `canSweepOrphan` **และ** `canViewSalesPlanning` |
| `PARENT_TABLE` | `customer` · `product` · `order` · `registration` · `personal_task` | `canSweepOrphan` (ไม่มีด่านโมดูลในตัว guard — เหลือด่านหยาบของ `proxy.js`) |
| ใบสั่งขาย | `sales_order` | ไม่ได้แก้ — มีกติกาของตัวเองอยู่แล้ว: `canRemoveSalesOrderFile` (คนแนบหรือ `admin` เท่านั้น) **และ** `canViewSalesPlanning` |
| งานบริหาร | `mgmt_task` · `mgmt_meeting` | ไม่ได้แก้ — ไม่อ่านแถวแม่เลย ถามแค่ `mgmt:edit` (ดู §ช่องที่ยังเปิด) |

⚠️ การใช้ `isSuperuser` (รวมหัวหน้าฝ่ายขาย) แทน `admin` อย่างเดียว เป็น **ทางที่ผู้ลงมือเลือก ยังไม่ใช่มติเจ้าของ** — จะให้เหลือแอดมินคนเดียวคือแก้บรรทัด `canSweepOrphan` หนึ่งบรรทัด + regex ในเทสต์หนึ่งตัว

เทสต์ `attachmentWriteGateCoverage.test.mjs` ตรึงว่า: สามสาขาถามด่านนี้ติดกับด่านอ่านพัง ไม่มี `return` แทรกก่อนตัวตัดสินเดิม · นับการอ่านแถวแม่ไว้ **4 ทาง** — เพิ่มทางที่ห้าโดยไม่มีด่านแม่หาย = เทสต์ตก

## แก้ตาม 2026-10-09 — `confirm-file` ส่งได้เฉพาะไฟล์ในถังส่วนตัว

PR `claude/evidence-private-only` (รอบสองของด่านที่มาไฟล์ ฝั่งหลักฐานของใบสั่งขาย — กติกาฝั่งเขียนอยู่ที่ [upload-receipts.md](upload-receipts.md) §รอบสอง) · ⚠️ ยืนยันด้วยเทสต์อ่านซอร์สเท่านั้น ยังไม่ได้ลองกับ server / Storage จริง

- **ของที่พัง** — `driveFileId` กับ `fileUrl` ใน `sales_orders.confirmAttachments` เป็นค่าที่ client ส่งมาตอนบันทึก และตัว sanitize เดิมปล่อย `{ fileUrl: 'x', driveFileId: <id อะไรก็ได้> }` ลงแถว ⇒ คนที่สร้าง/แก้ใบสั่งขายได้ ใส่ id ไฟล์ Drive ของใครก็ได้ แล้วเส้นนี้สตรีมออกมาด้วยสิทธิ์ของระบบ
- **ที่แก้** — ลบสาขา Drive (`getFileStream`) และสาขา redirect (`Response.redirect(att.fileUrl)`) ออกทั้งคู่ · ด่านแรกหลังหยิบ ref: `if (!att || !att.storagePath)` ⇒ 404 `ไม่พบไฟล์แนบ` · ที่เหลือเหมือนเดิมทุกบรรทัด (bucket ต้องตรง · path ต้องผ่าน `isQuotationEvidencePath` ของใบเสนอราคาต้นทาง · ใบที่ไม่มีใบเสนอราคาต้นทาง = 404 · header จาก `attachmentFileHeaders` ทับ `no-store`)
- **ข้อมูลจริงที่ใช้ตัดสิน** (อ่านอย่างเดียว 09/10/2569 00:55 เวลาไทย — มาจากผู้ตรวจที่อ่านฐานจริง ไม่มีสคริปต์ในรีโป): `sales_orders.confirmAttachments` 220 ref อยู่ใน bucket `sales-evidence` ใต้ `quotations/<quotationId ของใบเอง>/order-confirmation/` ทั้งหมด · มี `driveFileId` 0 · มี `fileUrl` 0 ⇒ ไม่มีไฟล์จริงใบไหนเปิดไม่ได้เพราะการถอดนี้
- ผู้ใช้ไม่เห็นความต่าง · ref รูป Drive/ลิงก์ (ถ้ามีใครปลูกไว้หลังเวลาที่วัด) จะตอบ 404
- `quotations/[id]/file` **ไม่ได้แตะ** — ดู §ช่องที่ยังเปิด

## ทะเบียนเส้นที่ดึงไบต์ (ratchet)

[`webapp/src/app/api/storedFileResponses.test.mjs`](../webapp/src/app/api/storedFileResponses.test.mjs) (9 เทสต์) ถือทะเบียน `STREAM_ROUTES` — วันนี้ 15 เส้น: `client` 6 · `system` 9 (`confirm-file` ยังเป็น `client` — ยังส่งไบต์จากถังส่วนตัว)

**"เส้นที่ดึงไบต์"** = `route.js` ใต้ `src/app/api` ที่เรียก `getFileStream(` · `.download(` · `createSignedUrl(`/`createSignedUrls(` เอง **หรือ** import โมดูลใต้ `src` ที่เรียกตัวใดตัวหนึ่ง (`@/…` · `await import()` · ทางสัมพัทธ์) **ลึกหนึ่งชั้น** · เส้นที่ไม่อยู่ในทะเบียน = แดง · ชื่อในทะเบียนที่ไม่ดึงไบต์แล้ว = แดงเช่นกัน

| ชนิด | ความหมาย | เทสต์บังคับ |
|---|---|---|
| `client` | ไบต์/ชื่อ/ชนิดมาจากสิ่งที่ผู้ใช้อัปหรือประกาศ และส่งให้เบราว์เซอร์ตรง ๆ | import `attachmentFileHeaders` · ห้ามตั้ง `Content-Type`/`Content-Disposition` เอง (รวม key แบบ computed) · ห้าม `att.mimeType \|\|` และ `data.type` · ทุก `new Response(` ต้องเป็นรูป `headers: attachmentFileHeaders(…)` หรือ spread ตัวนั้นแล้วทับได้เฉพาะ `Cache-Control` · redirect ต้องมี `attachmentUrlError(att.fileUrl)` นำหน้า |
| `system` | ไบต์ที่ระบบสร้าง/แปลง/ห่อเอง หรือไม่ได้ส่งออกเลย | ต้องมี `why` · `Content-Type` เป็นค่าคงที่ในโค้ด · ห้าม redirect · ต้องมี `nosniff` เว้นแต่ทุกตอบเป็น `attachment;` |

สี่เส้นของรอบนี้ถูกตรึงละเอียดกว่า (ลิสต์ `HARDENED`): จำนวนทางส่งไบต์รายเส้น · ทาง Drive ต้องเป็น `attachmentFileHeaders(att)` · ทางถังส่วนตัวต้องทับ `no-store` หลัง spread · บล็อก "ตรวจปลายทาง → 404 → redirect" ต้องเรียงกันในบล็อกเดียว · จำนวนที่ตรึงของ `confirm-file` ตั้งแต่ 2026-10-09: ทาง Drive 0 · ทางถังส่วนตัว 1 · redirect 0 และมีเทสต์ของเส้นนี้เองอีกตัว (ซอร์สต้องไม่มี `driveFileId` · `getFileStream` · `redirect` · `fileUrl` · ด่าน bucket + โฟลเดอร์ของใบเสนอราคาต้นทางต้องมาก่อน `.download(` ตัวเดียวของเส้น)

### เพิ่ม route ที่ส่งไฟล์ที่เก็บไว้ ต้องทำอะไร

1. ผูกสิทธิ์อ่านกับระเบียนแม่ของไฟล์ก่อนดึงไบต์ (ข้อนี้เทสต์ตรวจแทนไม่ได้ — คนทบทวนต้องดูเอง ก่อนเพิ่มชื่อในข้อ 5)
2. ส่งไบต์เป็น `new Response(data, …)` หรือ `new Response(Readable.toWeb(stream), …)` เท่านั้น และ header มาจาก `attachmentFileHeaders(…)` — รูปอื่นเทสต์ตกโดยเจตนา (จำเป็นจริงให้ขยาย `byteResponses` กับ `CLIENT_RESPONSE` ในเทสต์)
3. ถ้าต้อง redirect ตามค่าในแถว ให้ `if (attachmentUrlError(att.fileUrl)) return …` ก่อนเสมอ
4. คุยกับ Drive = `export const runtime = 'nodejs'` + `await import('@/lib/drive')` (ห้าม import แบบ static)
5. เพิ่มชื่อใน `STREAM_ROUTES` **ในคอมมิตเดียวกัน** — `client` หรือ `system` พร้อม `why`

## ช่องที่ยังเปิด (รู้แล้ว ไม่ได้แก้ในรอบนี้)

- **`tax/reports/route.js`** — ZIP (ห่อไฟล์แนบของผู้ใช้) และ XLSX ตอบด้วย `Content-Type` คงที่ + `attachment;` แต่ **ไม่มี `nosniff` และไม่มี `Cache-Control`** · ผ่านเทสต์เพราะทุกตอบเป็นดาวน์โหลดล้วน
- **`lib/tax/registrationFiles.js`** — แถวไฟล์แนบที่ไม่มี `driveFileId` (แถวเก่า) ถูก `apiFetch(a.fileUrl)` **ฝั่ง server** โดยไม่ผ่าน `attachmentUrlError` แล้วเอาเนื้อใส่ ZIP · พฤติกรรมเดิม ต้องทบทวนแยก (ยังไม่ได้ไล่ว่า `apiFetch` ฝั่ง server ทำอะไรกับปลายทางภายนอก)
- **สาขางานบริหารของ `guardAttachmentWrite`** — ไม่อ่านแถวแม่ จึงไม่มีด่านแม่หาย
- **ทะเบียนมองลึกชั้นเดียว** — เส้นที่ถึงไบต์ผ่านโมดูลสองชั้นไม่ถูกจับ (เช่น `service/surveys/[id]/send` ถูกจับวันนี้เพราะ import โมดูลที่ดึงไบต์ตรง ๆ อยู่ด้วย)
- `attachmentFileHeaders` ยังเชื่อชนิดที่ประกาศเมื่อนามสกุลไม่รู้จักและชนิดอยู่ในลิสต์ที่รับ (`logo.svg` ที่ประกาศ `image/png` ⇒ ส่งเป็น `image/png` แบบ `inline`) — ปลอดภัยเพราะ `nosniff` และลิสต์นั้นไม่มีชนิดที่รันสคริปต์ได้ · จะแก้ต้องแก้ `attachmentTypes.js`
- `updates/[id]/file` ยังส่งข้อความ error ดิบของ Google กลับใน body ของ 502
- `updates/[id]/file` กับ `quotations/[id]/file` ยังสตรีมตาม `driveFileId` ที่เก็บในแถวโดยไม่ตรวจว่าไฟล์นั้นถูกอัปมาเพื่อระเบียนนี้ — เรื่องที่มาของไฟล์ ดู [upload-receipts.md](upload-receipts.md) · `confirm-file` ปิดแล้ว (§แก้ตาม 2026-10-09) · `quotations/[id]/file` คงทาง Drive/redirect ไว้เพราะช่อง `wonAttachments` ไม่มีเส้นเขียนเหลือแล้ว และวัด 09/10/2569 ไม่มี ref รูป Drive/ลิงก์ในช่องนั้น (0 แถว) — เลื่อนไว้ ไม่ใช่ตัดสินว่าปลอดภัยถาวร · เธรดเป็นงานของ PR ถัดไป
