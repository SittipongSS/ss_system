# ระบบแจ้งปัญหาระบบ (System Issue Reporting)

> สถานะ: **รอตรวจ** · ตรวจกับโค้ดเมื่อ 2026-08-07 · ครบทั้ง 3 ก้อน · mig 0219 รันบน Supabase แล้ว · รอ smoke test ด้วยบัญชีจริง (ดู "เหลือทำ" ท้ายไฟล์)

ให้ผู้ใช้ทุกคนแจ้งบั๊ก/ปัญหา/คำขอปรับระบบถึงแอดมินได้จากทุกหน้า พร้อมภาพหน้าจอและบริบทของหน้าที่พัง
แล้วติดตามต่อได้ว่าใครรับเรื่อง แก้ถึงไหน และแก้แล้วหายจริงหรือยัง

เอกสารนี้เก็บมติ 28 ข้อจากรอบซักถาม 2026-08-07 ทั้งหมด — **มติที่ตัดสินแล้ว ไม่ใช่ข้อเสนอ**
ก่อนแก้มติข้อใดข้อหนึ่ง ให้อ่านเหตุผลใต้ข้อนั้นก่อน เพราะหลายข้อผูกกับบั๊กที่เคยเกิดจริงในระบบนี้

---

## 0. ของที่มีอยู่แล้วและจะถูกใช้ซ้ำ — ห้ามเขียนใหม่

ตรวจกับโค้ดเมื่อ 2026-08-07

| ของกลาง | ไฟล์ | ใช้ทำอะไรในระบบนี้ |
|---|---|---|
| ทะเบียนสิทธิ์เธรดอัปเดต | `src/lib/master/updateAccess.js` (`UPDATE_ENTITIES`) | ลงทะเบียน entity เดียว ได้ทั้ง API เธรด ไฟล์แนบ และ component |
| แจ้งเตือนรายคน (mig 0185) | `src/lib/notifications.js` · `/api/notifications` | กล่องแจ้งเตือน + กระดิ่ง |
| ไฟล์แนบ (mig 0028) | `src/lib/master/attachments.js` · `AttachmentsPanel` | แนบภาพหน้าจอ |
| ที่เก็บไฟล์ | `/api/upload` → `src/lib/drive.js` | Google Drive (ทางเดียว ดู §6) |
| แผนที่โฟลเดอร์ Drive | `src/lib/master/driveEntityMap.js` | entity ที่ไม่ได้ map จะตกถัง `_รอจัดที่` เงียบ ๆ |
| ออกเลขที่เอกสาร (mig 0096) | `src/lib/entityCode.js` · RPC `next_entity_number` | รหัส `IS-YYMMXXXX` |
| แจ้งเข้าห้องแชทฝ่าย | `src/lib/chat.js` | เรื่องใหม่เข้าคิวแอดมิน |
| โครงหน้า/ปุ่ม/ป้าย | `Workspace` · `Button` · `StatusBadge` · `Segmented` · `Table` · `Modal` | UI ทั้งหมด |

---

## 1. ขอบเขตและเจ้าของเรื่อง (Q1–Q6)

### Q1 · entity ใหม่ ไม่ยืม `dept_requests`

สร้าง entity ใหม่ `system_issue` (ตาราง `system_issues`) แต่ **ต่อเข้าของกลางทั้งหมด** —
ลงทะเบียนใน `UPDATE_ENTITIES`, ใช้ตาราง `attachments` กลาง, เพิ่มชื่อใน `HREF` และ `ENTITY_LABEL`
ของกล่องแจ้งเตือน · ไม่เขียนเธรดหรือสายไฟล์แนบขึ้นมาใหม่เอง

**ทำไมไม่ยืม `dept_requests`** — ด่านอ่านของคำร้องคือ `canViewCosting(user) && canReadRequestRow(...)`
และฝ่ายที่ตอบถูกล็อกไว้ที่ RD/PC/FN ส่วนเรื่องแจ้งปัญหาต้องให้ **ทุกคน** เปิดได้และ **แอดมิน** ตอบ
ถ้ายืม จะต้องแตก branch ตามชนิดเรื่องในด่านเดียวกันทุกจุด ซึ่งเป็นรูปแบบที่ทำให้เกิดช่องรั่วข้ามชนิด

### Q2 · ใครเปิดเรื่องได้ — ทุกคนที่ล็อกอิน

รวม `viewer` และผู้สังเกตการณ์แบบอ่านอย่างเดียว

**ทำไม** — คนที่เจอบั๊กบ่อยที่สุดคือคนที่สิทธิ์น้อยที่สุด ถ้ากันกลุ่มนี้ไว้ ปัญหาของเขาจะไม่ถูกรายงานเลย

### Q3 · "แอดมินระบบ" = role `admin` เท่านั้น

เห็นคิวทั้งหมด รับเรื่อง มอบหมาย และปิดเรื่องได้

**ไม่รวม `ae_supervisor`** ทั้งที่ `isSuperuser()` นับรวมอยู่ — เขาเป็นหัวหน้าฝ่ายขาย ไม่ใช่คนดูแลระบบ
⚠️ จุดนี้แปลว่า **ห้ามใช้ `isSuperuser()` เป็นด่านของโมดูลนี้** ต้องเทียบ `role === 'admin'` ตรง ๆ

### Q4 · รับ 3 ประเภทตั้งแต่วันแรก

`kind` = `bug` (บั๊ก) · `request` (ขอปรับ/ขอเพิ่ม) · `question` (ถามวิธีใช้)

หน้าเดียว คิวเดียว กรองได้ · แยกตั้งแต่แรกเพราะถ้าปล่อยให้ปนกันก่อนแล้วค่อยแยกทีหลัง จะแยกไม่ออก

### Q5 · ช่องทางเปิดเรื่อง — โมดัล + หน้ารายการ

- โมดัลเปิดจาก `AccountMenu` (มีอยู่ทุกหน้าแล้ว)
- หน้า `/support` สำหรับดูรายการและรายละเอียด
- **ไม่ทำปุ่มลอย** — ทับ UI บนมือถือ

### Q6 · เก็บบริบทอัตโนมัติเท่าที่ปลอดภัย

เก็บเงียบ ๆ ตอน submit: URL หน้าปัจจุบัน · user agent · role/department/team ของผู้แจ้ง · เวลา

**ไม่จับ console log และไม่จับภาพหน้าจออัตโนมัติ** — ข้อมูลลูกค้าหลุดเข้าไปได้โดยไม่มีใครดูก่อน
ผู้ใช้แนบเองถ้าต้องการ

---

## 2. วงจรชีวิตของเรื่อง (Q7–Q9, Q12)

### Q7 · 5 สถานะ

| สถานะ | ป้าย | โทน `StatusBadge` |
|---|---|---|
| `pending` | แจ้งแล้ว — รอรับเรื่อง | `warning` |
| `acknowledged` | รับเรื่องแล้ว — กำลังแก้ | `info` |
| `resolved` | แก้แล้ว — รอยืนยัน | `success` |
| `closed` | ปิดเรื่อง | `neutral` |
| `rejected` | ไม่ใช่บั๊ก / ไม่ทำ | `neutral` |

อยู่ที่ `src/lib/issues/statuses.js` แพตเทิร์นเดียวกับ `src/lib/requests/statuses.js`
(ป้ายและโทนเป็นค่าคงที่ในไฟล์เดียว หน้าจอไม่ต้องรู้จัก token สี)

- **ไม่มี `draft`** — บั๊กไม่มีสถานะร่าง
- **ไม่ใช้คำว่า `answered`** — "ตอบแล้ว" ไม่เท่ากับ "แก้แล้ว"
- `rejected` **บังคับใส่เหตุผล** (`rejectReason`) ทั้งที่ชั้น API และ CHECK ของ DB

### Q8 · ปิดเรื่องแบบสองฝ่าย + ปิดอัตโนมัติ

1. แอดมินตั้ง `resolved`
2. ผู้แจ้งได้แจ้งเตือน กด **"ยืนยันแก้แล้ว"** → `closed` หรือ **"ยังไม่หาย"** → ดีดกลับ `acknowledged`
3. ผู้แจ้งเงียบเกิน **7 วันนับจาก `resolvedAt`** → ระบบปิดเอง (`closed` + `autoClosed = true`) ผ่าน `/api/cron` ที่มีอยู่

**ทำไมต้องมีทั้งสองขา** — ถ้าแอดมินปิดฝ่ายเดียว บั๊กที่แก้ไม่ครบจะหายเข้ากลีบเมฆ
แต่ถ้าไม่มีการปิดอัตโนมัติ คิวจะบวมค้างตลอดกาลเพราะไม่มีใครกลับมากดยืนยัน

### Q9 · ผู้แจ้งเป็นคนบอก "ผลกระทบ" ไม่ใช่ "ความด่วน"

`impact` = `blocked` (ทำงานต่อไม่ได้เลย) · `workaround` (ติดแต่มีทางเลี่ยง) · `minor` (เรื่องเล็ก/ความสวยงาม)

**ทำไมใช้คำแบบนี้** — ถามว่า "ด่วนแค่ไหน" จะได้ "ด่วนมาก" ทุกใบ แต่ถามว่างานหยุดหรือไม่ เป็นข้อเท็จจริงที่ตรวจสอบได้
แอดมินปรับค่าได้ทีหลัง และการปรับจะขึ้นในเธรดให้ผู้แจ้งเห็น

### Q12 · ผู้ใช้เห็นเฉพาะเรื่องของตัวเอง

แอดมินเห็นทั้งหมด

**ทำไมไม่ให้เห็นของคนอื่น** — ภาพหน้าจอที่แนบมามักติดราคาหรือชื่อลูกค้ามาด้วย

**ชดเชยการแจ้งซ้ำ**: ตอนผู้ใช้กำลังพิมพ์ในโมดัล ให้แสดง 3 เรื่องล่าสุดที่มาจาก URL เดียวกัน
โชว์แค่ **หัวข้อกับสถานะ** ไม่มีรายละเอียด ไม่มีไฟล์แนบ

---

## 3. การเชื่อมกับของกลาง (Q10, Q11, Q18, Q19, Q24)

### Q10 · ผูกกับหน้าด้วย URL เท่านั้น

**ไม่ทำ `entityType`/`entityId` แบบ polymorphic** ในรอบแรก

**ทำไม** — ต้องไปลงทะเบียนด่านอ่านของทุก entity ไม่งั้นเรื่องแจ้งกลายเป็นช่องทางดูข้อมูลของ entity
ที่ผู้แจ้งไม่มีสิทธิ์ · URL มี id อยู่แล้วและพาไปถึงหน้าเดียวกันได้

### Q11 · แจ้งเตือนสองช่อง คนละหน้าที่

| จังหวะ | ช่อง | ผู้รับ |
|---|---|---|
| เรื่องใหม่เข้าคิว | **Chat webhook** ห้องแอดมิน | ห้อง ไม่ใช่คน |
| มอบหมาย / ตอบ / เปลี่ยนสถานะ | **notification รายคน** (mig 0185) | ผู้แจ้ง + ผู้รับผิดชอบ |

เรื่องใหม่ไม่ยิง notification รายคน เพราะยังไม่รู้ว่าใครรับ และกติกาเดิมของระบบห้าม fan-out
notification ให้ "ทุกคนในฝ่าย" (มติ 14)

ต้องเพิ่ม `system_issue` ทั้งใน `HREF` (`(id) => '/support/' + id`) และ `ENTITY_LABEL` (`'เรื่องแจ้งปัญหา'`)
ของ `src/lib/notifications.js`

### Q18 · มอบหมาย — รับเรื่องเองเป็นหลัก

- `assigneeId` เป็น nullable · เรื่องเข้าคิวโดยยังไม่มีเจ้าของ
- แอดมินกด **"รับเรื่อง"** = self-assign + ขยับเป็น `acknowledged` ในปุ่มเดียว
- มอบต่อให้แอดมินอีกคนได้ผ่าน `PersonSelect` ที่มีอยู่ (กรองเฉพาะ role `admin`)
- ผู้ถูกมอบได้ notification รายคน

**ทำไม** — แอดมินมีหลายคน ถ้าไม่มีเจ้าภาพ ทุกคนจะคิดว่าอีกคนทำ

### Q19 · เลขที่เรื่อง `IS-YYMMXXXX`

ออกผ่าน `generateEntityCode(supabase, 'IS')` (RPC `next_entity_number`, atomic ต่อ scope+เดือน)

**ทำไมต้องมี** — `entityTitle()` ในกล่องแจ้งเตือนไล่หา `code` ก่อน `name` ถ้าไม่มีจะ fallback เป็น id ดิบ
ซึ่งเป็นสิ่งที่กฎในโค้ดห้ามไว้ · และคนจะพูดกันว่า "เรื่อง IS-26080014 แก้ยัง" · ชื่อไฟล์บน Drive ก็พึ่งเลขนี้

⚠️ **แก้จากที่คุยไว้ตอนแรกว่า `ISS-YYMM-NNN`** — มาตรฐานของ repo คือ scope 2 ตัวอักษร + เลขรัน 4 หลัก
ติดกัน (`DL-` `PJ-` `CR-` `SV-` `PB-` `SS-`) จึงใช้ `IS-` ให้เข้าชุด · scope `IS` ยังว่าง ไม่ชนของเดิม

### Q24 · ลงทะเบียนใน `UPDATE_ENTITIES`

```js
system_issue: {
  table: 'system_issues',
  attachments: true,
  // ด่านเดียวกับ GET /api/issues/[id] เป๊ะ — ห้ามแคบกว่าหน้าจอ
  async canView(supabase, parent, user) {
    return user?.id === parent?.reportedById || user?.role === 'admin';
  },
  // ปิด/ปฏิเสธแล้วถือเป็นหลักฐาน — กติกาเดียวกับ dept_request
  async canPost(supabase, parent, user) {
    if (['closed', 'rejected'].includes(parent?.status)) return false;
    return user?.id === parent?.reportedById || user?.role === 'admin';
  },
  recipients: (parent) => [parent?.reportedById, parent?.assigneeId],
},
```

- **ห้ามตั้งด่านเธรดแคบกว่าด่านหน้าจอ** — เคยมีบั๊กที่เปิดใบได้แต่เธรดว่างเปล่าโดยไม่มีอะไรอธิบาย
- `recipients` **ไม่ใส่แอดมินทุกคน** — งาน "เรื่องใหม่เข้าคิว" เป็นของ Chat webhook แล้ว
  และแอดมินที่กดรับเรื่องจะกลายเป็น `assigneeId` เอง

---

## 4. UI (Q13, Q14, Q20, Q21)

ยึด `webapp/UI_DESIGN_SYSTEM.md` ทั้งหมด — โมดูลใหม่เริ่มที่ legacy budget เท่ากับ 0

📐 **แบบหน้าจอ: [system-issue-ui-mockup.html](system-issue-ui-mockup.html)** — 8 จอ เปิดในเบราว์เซอร์ได้เลย
(เมนูผู้ใช้ · โมดัลแจ้งเรื่อง · เรื่องของฉัน · รอยืนยัน · คิวแอดมิน · รายละเอียดฝั่งแอดมิน · มือถือ · หน้าพัง)
โทเคนยกจาก `globals.css` ตรง ๆ ไม่มีค่าดิบที่คิดขึ้นเอง

### Q13 · โมดัลแจ้งเรื่อง — บังคับช่องเดียว

เรียงจากบนลงล่าง:

1. `Segmented` **ประเภท** 3 ค่า (ตั้งต้น `bug`)
2. `Segmented` **ผลกระทบ** 3 ค่า (ตั้งต้น `workaround`)
3. `Input` **หัวข้อ** — ไม่บังคับ ว่างแล้วตัดจากบรรทัดแรกของรายละเอียด
4. `Textarea` **รายละเอียด** — ช่องเดียวที่บังคับ
5. `AttachmentsPanel`
6. แถบบริบท (หน้า/เบราว์เซอร์) เป็นข้อความจาง อ่านอย่างเดียว **ไม่ซ่อน** — บอกให้ผู้ใช้รู้ว่าเก็บอะไรไป
7. ปุ่ม `tone="accent"` ตัวเดียวตามกฎ "หนึ่งบริบทมี filled action เดียว"

**ทำไมบังคับช่องเดียว** — ยิ่งช่องเยอะ คนยิ่งไม่แจ้ง

### Q14 · `/support` อยู่นอกเปลือกตั้งค่า

- **ไม่เพิ่มเข้า `SETTINGS_PATHS`** (`/settings` `/users` `/audit`) เพราะ `viewer` เข้าเปลือกนั้นไม่ได้
  แต่ `viewer` คือคนที่ต้องแจ้งได้ตาม Q2
- **หน้าเดียวสองบทบาทผ่าน `Tabs`** — ผู้ใช้ทั่วไปเห็นแท็บเดียว ("เรื่องของฉัน")
  แอดมินเห็นเพิ่ม "คิวรอรับ · กำลังแก้ · ทั้งหมด" · ไม่แยกหน้าแอดมิน
  (กฎเดิมของ repo: สร้าง/แก้ ใช้ component เดียว — ที่นี่คือรายการเดียว ต่างกันแค่ scope ของ query)
**เพิ่มตอนลงมือ (ก้อนที่ 2)** — เปลือกเมนูของ repo นี้ผูกกับ "ระบบ" เสมอ หน้าที่ไม่สังกัด
ระบบไหนจะตกไปใช้เมนูของระบบภาษี ดังนั้น `/support` จึงต้องเป็น **ระบบของตัวเอง** จริง ๆ:

- `SYSTEM_CATALOG` เพิ่ม `{ key: 'support', isVisible: () => true }` — ระบบเดียวที่ไม่มีเงื่อนไข cap
- `AppLayout` เพิ่มกลุ่มเมนูหนึ่งเมนู (`cap: 'issues:report'`)
- `permissions.js` เพิ่ม `UNIVERSAL_CAPS = ['issues:report']` ที่ `capsFor` ต่อท้ายให้ทุก role
  — **ประกาศที่เดียว ห้ามไล่เติมลง `ROLE_CAPS` ทีละ role** (12 อาร์เรย์ = ที่ที่จะตกหล่นหนึ่งตัว)
- `proxy.js` เพิ่ม `/support` ใน `OPEN_PAGES` และ `/api/issues` ใน `OPEN_WRITE_APIS`
  (default-deny: ไม่ลงทะเบียน = non-admin เจอ 403 เงียบ ๆ)
- เทสต์ที่เทียบลิสต์แบบเป๊ะ ๆ ต้องอัปเดตตาม: `systems.test.mjs` (3 เคส) · `permissions.test.mjs` (2 เคส)

- ⚠️ **ต้องแก้ `systemForPathname` ใน `src/config/navigation.js` ให้รู้จัก `/support`**
  ไม่งั้นตกไปที่ `return 'tax'` ท้ายฟังก์ชัน แล้วทั้งโมดูลจะไปโผล่ใต้เปลือกเมนูระบบภาษี
  — บั๊กเดียวกับที่เคยเกิดกับ `/requests` และ build/เทสต์จับไม่ได้เพราะหน้าเรนเดอร์ปกติทุกอย่าง

### Q20 · เดสก์ท็อปเป็นตาราง มือถือเป็นการ์ด

- เดสก์ท็อป `Table` + `TableScroll`: สถานะ · เลขที่ · ผลกระทบ · ผู้แจ้ง · หน้าที่พัง · อายุเรื่อง
- มือถือ: การ์ด `StatusBadge` + หัวข้อ + บรรทัดล่างเป็นผู้แจ้ง/อายุ
- จุดตัดจอ **768** จากชุดที่แนะนำใน `globals.css` (480 · 560 · 640 · 680 · 768 · 900 · 1000 · 1200) — ห้ามคิดค่าใหม่
- **ไม่เพิ่ม badge ตัวนับบน top bar** — ใช้กระดิ่งแจ้งเตือนเดิม ไม่งั้นมีตัวนับสองตัวที่ไม่ตรงกัน

### Q21 · error boundary มีปุ่ม "แจ้งปัญหานี้"

หน้าจอที่พังแสดงปุ่มที่เปิดโมดัลพร้อมกรอก stack ให้ล่วงหน้า (ลง `errorStack`)

**ไม่ส่งอัตโนมัติ** — error เดียวกันเด้งซ้ำจะได้เรื่องซ้ำใบละสิบ และ stack อาจมีข้อมูลใน state ติดไป
โดยไม่มีใครดูก่อน · ให้คนกดเอง = มีคนยืนยันว่าพังจริง และแอดมินได้ stack ที่ตามต่อได้

---

## 5. ไฟล์แนบ (Q15–Q17)

### ข้อเท็จจริงที่ยืนยันกับโค้ดแล้ว (2026-08-07)

- ไฟล์แนบทั้งระบบขึ้น **Google Drive ทางเดียว** — `/api/upload` ตัดทาง Supabase Storage ทิ้งเมื่อ 2026-07-30
  (prod อยู่บน Drive 128/128 แถว และโค้ดสองทางคือแหล่งของบั๊กเกือบทุกข้อในสายอัปโหลด)
  ข้อยกเว้นเดียวคือ `quotation_won_evidence` ที่ยังลง private Supabase bucket
- entityType ที่ยังไม่ map โฟลเดอร์ **ตกถัง `_รอจัดที่` เงียบ ๆ** (`src/lib/drive.js:460`)
  — เคยเป็นบั๊กจริงกับเธรดสรรพสามิต ตอนนี้มี `driveEntityMap.test.mjs` บังคับไว้แล้ว
- เพดาน **10 MB ต่อไฟล์** (`MAX_UPLOAD_MB`) · รับทั้งเอกสารและรูป (`ACCEPTED_UPLOAD_EXT`)

### Q15 · โฟลเดอร์ปลายทาง `แจ้งปัญหาระบบ / <YYYY-MM>`

สาขาใหม่ใน `folderPathForEntity` + เพิ่ม `system_issue` ใน `FOLDER_ENTITY_TYPES`

**ไม่ทำโฟลเดอร์ต่อใบ** — เรื่องหนึ่งใบมีไฟล์ 1–2 ไฟล์ ทำโฟลเดอร์ต่อใบจะได้โฟลเดอร์เปล่าหลักพันภายในปีเดียว
และ `ensureFolder` ต้องยิง Drive API เพิ่มทุกครั้ง · ชื่อไฟล์บน Drive ขึ้นต้นด้วยเลขที่เรื่อง (`IS-YYMMXXXX`) จึงยังหาเจอ

### Q16 · ยอมรับว่าไฟล์อยู่บน Shared Drive ร่วม

ไม่ทำ private bucket แยกสำหรับโมดูลนี้

**ทำไม** — สายอ่านไฟล์ที่สอง (proxy + สิทธิ์ + ลบ) คือรูปแบบ "โค้ดสองทาง" ที่โปรเจกต์เพิ่งตัดทิ้ง
เพราะเป็นแหล่งบั๊กเกือบทุกข้อ

**ชดเชย** ด้วยข้อความใต้ปุ่มแนบ:

> ไฟล์จะเก็บบน Google Drive ของบริษัท — ปิดข้อมูลลูกค้าที่ไม่เกี่ยวก่อนแนบ

### Q17 · สร้างแถวก่อน แล้วค่อยอัปไฟล์ · ไฟล์พลาดไม่ล้มเรื่อง

`uploadForEntity` ต้องการ `entityId` เพื่อ resolve โฟลเดอร์ แต่ในโมดัลยังไม่มีแถว ดังนั้น:

1. กด "ส่ง" → `POST /api/issues` สร้างแถว ได้ `id` + `code`
2. อัปไฟล์ด้วย id จริง → บันทึก metadata ที่ `/api/master/attachments`

**ถ้าอัปไฟล์พลาด ห้าม rollback เรื่อง** — เรื่องถูกส่งแล้วถือว่าสำเร็จ ขึ้น toast บอกว่าไฟล์แนบไม่ขึ้น
ให้ไปแนบซ้ำในหน้ารายละเอียด

> คนที่กำลังแจ้งบั๊กเจอปัญหาอยู่แล้ว ถ้าการแจ้งบั๊กพังซ้ำเพราะไฟล์ เขาจะเลิกแจ้ง

### ⚠️ แก้มติตอนลงมือ (ก้อนที่ 2) — ไฟล์แนบไปทาง **เธรด** ไม่ใช่ตาราง `attachments`

แผนเดิมเขียนว่าใช้ `AttachmentsPanel` + `docType` = `screenshot`/`other` · **ใช้ไม่ได้จริง**

ด่านหยาบของ `/api/attachments` ใน `proxy.js` ไล่ตาม cap ของ role
(`customers:edit` · `products:edit` · `pm:edit` · `costing:*` · …) ซึ่ง **`viewer` ไม่มีสักตัว**
แต่ viewer ต้องแนบภาพหน้าจอได้ตามมติ Q2 · จะเปิดทางนั้นต้องผ่อนด่านให้ทุกคนที่ล็อกอิน
ซึ่งเท่ากับผ่อนให้ **ทุก entity** ไม่ใช่เฉพาะเรื่องแจ้งปัญหา — proxy เห็นแค่ method+path
ส่วน `entityType` อยู่ใน body

จึงแนบผ่าน `POST /api/updates` (แถวอัปเดตมีช่อง `attachments` ของตัวเอง) แทน:

- ด่านของเส้นนั้นคือ `UPDATE_ENTITIES.system_issue` ที่ลงทะเบียนไว้แล้ว = **สิทธิ์ตรงพอดี**
  ไม่ต้องผ่อนอะไรทั้งระบบ
- ไฟล์ยังขึ้น Drive ที่เดิม (`/api/upload` + `entityType: 'system_issue'`) — §5 ข้ออื่นคงเดิมทุกข้อ
- ผลพลอยได้: ไฟล์ไปอยู่ในบทสนทนาที่คนคุยกันจริง ไม่ใช่แผงเอกสารแยกต่างหาก
- **ไม่มี `system_issue` ใน `ATTACHMENT_TYPES`** — มีแล้วจะชวนให้เข้าใจผิดว่า `AttachmentsPanel` ใช้ได้
  (เทสต์ `issueRouting.test.mjs` บังคับไว้)

---

## 6. Schema — migration 0219 (Q22, Q23)

> ⚠️ **สองข้อนี้ตกรอบซักถามไป** (เซสชันขาดตอน) — ผมตัดสินตามมาตรฐานของ repo ที่ยืนยันกับโค้ดแล้ว
> **ต้องอ่านทวนก่อนรัน** ถ้าไม่ตรงใจให้แก้ที่นี่ก่อน

### Q22 · ตาราง `system_issues`

### Q23 · ด่านชั้น DB — CHECK constraint ไม่ใช่ trigger

`dept_requests` ใช้ trigger `guard_dept_request` คุมการเปลี่ยนสถานะ แต่ที่นี่ใช้ **CHECK ล้วน**
เพราะกติกาของเราเป็นเรื่อง "แถวนี้สอดคล้องในตัวเองไหม" ไม่ใช่ "เปลี่ยนจากค่าเก่าไปค่าใหม่ได้ไหม"
ลำดับสถานะบังคับที่ชั้น API + เทสต์ (§7 ข้อ 3) · trigger เพิ่มของที่ต้องดูแลโดยไม่ได้อะไรเพิ่ม

RLS เปิดแล้วตัดสิทธิ์ `anon`/`authenticated` ทิ้ง เข้าถึงผ่าน service-role เท่านั้น — มาตรฐานเดียวกับ 0188/0189

```sql
-- ============================================================
--  Migration 0219: ระบบแจ้งปัญหาระบบ
--  แผน docs/system-issue-reporting-plan.md §6
--
--  ⚠️ รันมือบน Supabase SQL Editor · ตารางใหม่ล้วน รันก่อน deploy ได้เลย
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.system_issues (
  id            text PRIMARY KEY,
  code          text UNIQUE,               -- IS-YYMMXXXX (next_entity_number scope 'IS')

  kind          text NOT NULL DEFAULT 'bug'
                  CHECK (kind IN ('bug', 'request', 'question')),
  -- ผลกระทบต่อการทำงาน ไม่ใช่ "ความด่วน" — ถามว่างานหยุดไหม เป็นข้อเท็จจริงที่ตรวจได้
  impact        text NOT NULL DEFAULT 'workaround'
                  CHECK (impact IN ('blocked', 'workaround', 'minor')),

  title         text CHECK (title IS NULL OR length(title) <= 200),
  detail        text NOT NULL CHECK (length(detail) BETWEEN 1 AND 5000),

  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'acknowledged', 'resolved', 'closed', 'rejected')),

  -- ── ผู้แจ้ง (snapshot เสมอ — คนลาออกแล้วเรื่องต้องอ่านย้อนได้) ──
  "reportedById"   text NOT NULL,
  "reportedByName" text,
  "reporterRole"       text,
  "reporterDepartment" text,
  "reporterTeam"       text,

  -- ── ผู้รับผิดชอบ (แอดมิน) ──
  "assigneeId"     text,
  "assigneeName"   text,

  -- ── บริบทที่เก็บอัตโนมัติ (Q6) ──
  "pageUrl"     text CHECK ("pageUrl" IS NULL OR length("pageUrl") <= 500),
  "userAgent"   text CHECK ("userAgent" IS NULL OR length("userAgent") <= 500),
  -- stack จาก error boundary — มีเฉพาะเรื่องที่เปิดจากหน้าที่พังจริง (Q21)
  "errorStack"  text CHECK ("errorStack" IS NULL OR length("errorStack") <= 8000),

  -- ── เวลาของแต่ละขั้น ──
  "acknowledgedAt" timestamptz,
  "resolvedAt"     timestamptz,
  "closedAt"       timestamptz,
  -- ปิดเองเพราะผู้แจ้งเงียบ 7 วัน ≠ ผู้แจ้งยืนยันว่าหาย — ต้องแยกออกจากกันให้อ่านย้อนได้
  "autoClosed"     boolean NOT NULL DEFAULT false,
  "rejectReason"   text CHECK ("rejectReason" IS NULL OR length("rejectReason") <= 1000),

  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),

  -- ปฏิเสธแล้วต้องบอกเหตุผลเสมอ — "ไม่ทำ" เฉย ๆ ทำให้ผู้แจ้งไม่รู้ว่าควรทำอะไรต่อ
  CONSTRAINT system_issues_reject_needs_reason CHECK (
    status <> 'rejected' OR ("rejectReason" IS NOT NULL AND length(btrim("rejectReason")) > 0)
  ),
  -- รับเรื่องแล้วต้องมีเจ้าภาพ ไม่งั้นเรื่องอยู่ในสถานะ "กำลังแก้" โดยไม่มีใครแก้
  CONSTRAINT system_issues_ack_needs_assignee CHECK (
    status NOT IN ('acknowledged', 'resolved') OR "assigneeId" IS NOT NULL
  ),
  -- เวลาต้องเดินตามลำดับขั้น — แถวที่ resolvedAt มาก่อน acknowledgedAt อ่านย้อนไม่ได้
  CONSTRAINT system_issues_time_order CHECK (
    ("resolvedAt" IS NULL OR "acknowledgedAt" IS NOT NULL)
    AND ("resolvedAt" IS NULL OR "acknowledgedAt" IS NULL OR "resolvedAt" >= "acknowledgedAt")
    AND ("closedAt"  IS NULL OR "closedAt" >= "createdAt")
  ),
  -- ปิด/ปฏิเสธเท่านั้นที่มี closedAt · และปิดแล้วต้องมี closedAt เสมอ
  CONSTRAINT system_issues_closed_at_matches_status CHECK (
    (status IN ('closed', 'rejected')) = ("closedAt" IS NOT NULL)
  ),
  -- autoClosed ใช้ได้เฉพาะกับเรื่องที่ปิดจริง
  CONSTRAINT system_issues_autoclose_only_closed CHECK (
    "autoClosed" = false OR status = 'closed'
  )
);

-- คิวแอดมินเปิดหน้าแล้วเรียงใหม่สุดก่อนเสมอ
CREATE INDEX IF NOT EXISTS system_issues_status_created_idx
  ON public.system_issues (status, "createdAt" DESC);
-- "เรื่องของฉัน" ของผู้ใช้ทั่วไป
CREATE INDEX IF NOT EXISTS system_issues_reporter_idx
  ON public.system_issues ("reportedById", "createdAt" DESC);
-- "ที่ฉันรับผิดชอบ"
CREATE INDEX IF NOT EXISTS system_issues_assignee_idx
  ON public.system_issues ("assigneeId") WHERE "assigneeId" IS NOT NULL;
-- cron ปิดอัตโนมัติ กวาดเฉพาะเรื่องที่รอยืนยันอยู่ (Q8)
CREATE INDEX IF NOT EXISTS system_issues_awaiting_confirm_idx
  ON public.system_issues ("resolvedAt") WHERE status = 'resolved';
-- ชี้เรื่องซ้ำจากหน้าเดียวกันตอนผู้ใช้กำลังพิมพ์ (Q12)
CREATE INDEX IF NOT EXISTS system_issues_page_idx
  ON public.system_issues ("pageUrl", "createdAt" DESC) WHERE "pageUrl" IS NOT NULL;

ALTER TABLE public.system_issues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_issues FROM anon, authenticated;
GRANT  ALL ON TABLE public.system_issues TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ย้อนกลับ ────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.system_issues;
-- DELETE FROM public.entity_number_counters WHERE scope = 'IS';
-- NOTIFY pgrst, 'reload schema';
```

---

## 7. เทสต์ (Q25)

**ที่แดงเองอยู่แล้ว** — แค่ทำให้ผ่าน ไม่ต้องเขียนใหม่:
`driveEntityMap.test.mjs` (โฟลเดอร์ปลายทาง) · `npm run audit:ui` (legacy budget ของโมดูลใหม่ต้องเป็น 0) ·
`tokenUsage` · `typeScale` · `spacingScale` · `zIndexScale`

**ที่ต้องเขียนใหม่ 4 ไฟล์:**

1. `issueStatuses.test.mjs` — ทุกสถานะมีป้ายและโทนครบ (แพตเทิร์นเดียวกับ `REQUEST_STATUS_TONES`)
2. `issueAccess.test.mjs` — ผู้ใช้ A เปิดเรื่องของผู้ใช้ B ไม่ได้ · แอดมินเปิดได้ ·
   **และด่านเธรดเท่ากับด่านหน้าจอ** โดยเทียบสองฟังก์ชันตรง ๆ ไม่ใช่เขียนความคาดหวังซ้ำสองที่
3. `issueLifecycle.test.mjs` — สถานะที่ข้ามขั้นถูกปฏิเสธ · `rejected` ที่ไม่มีเหตุผลถูกปฏิเสธ ·
   auto-close นับ 7 วันจาก `resolvedAt` ไม่ใช่ `createdAt`
4. `issueNotify.test.mjs` — ผู้รับไม่มีแอดมินที่ไม่เกี่ยว · แจ้งเตือนล้มไม่ทำให้การโพสต์ที่สำเร็จแล้วตอบ error
   (กฎ fire-and-forget ของ `lib/notifications.js`)

---

## 8. ลำดับการ build (Q26–Q28)

### Q26 · เอกสาร

ไฟล์นี้เอง (`docs/system-issue-reporting-plan.md`) + หนึ่งบรรทัดในหมวดแผนของ `docs/INDEX.md`
· **แก้บรรทัดสถานะที่หัวไฟล์ในคอมมิตเดียวกับที่แก้โค้ด** ไม่ตามเก็บทีหลัง

### Q27 · 3 ก้อน แต่ละก้อน merge แล้วใช้งานได้จริง

| ก้อน | ของที่ส่ง | merge แล้วได้อะไร |
|---|---|---|
| 1 · หลังบ้าน ✅ | migration 0219 · `lib/issues/*` · `/api/issues` · ลงทะเบียน `UPDATE_ENTITIES` · `driveEntityMap` · เทสต์ 4 ไฟล์ (36 เคส) | ยังไม่มีหน้าจอ |
| 2 · ฝั่งผู้ใช้ ✅ | โมดัลใน `AccountMenu` · `/support` + `/support/[id]` · `systemForPathname` · cap สากล `issues:report` · เทสต์เพิ่ม 8 เคส | **แจ้งบั๊กได้จริง** แอดมินยังไม่มีคิวแต่ได้ Chat webhook |
| 3 · ฝั่งแอดมิน ✅ | แท็บคิว + การ์ดตัวเลข · รับเรื่อง/มอบหมาย/ปรับผลกระทบ/ปิด · cron `close-resolved-issues` · `app/error.js` | ครบตามแผน |

### Q28 · ไม่ทำช่องทางชั่วคราวระหว่างรอ

ก้อนที่ 2 ให้ของที่ใช้ได้จริงแล้ว และของชั่วคราวที่แยกทางกันมักไม่มีใครถอด

⚠️ แต่ **ก้อน 1 กับ 2 ควรอยู่ในสัปดาห์เดียวกัน** ไม่ปล่อยให้ก้อน 1 ค้างเป็นโค้ดที่ไม่มีใครเรียก

---

## ภาคผนวก · จุดที่ต้องแตะในไฟล์ที่มีอยู่

ทุกบรรทัดในตารางนี้คือของที่ **ลืมแล้วพังเงียบ** — ไม่มี build error ให้เห็น

| ไฟล์ | แก้อะไร | ลืมแล้วเกิดอะไร |
|---|---|---|
| `src/lib/master/updateAccess.js` | เพิ่ม `system_issue` ใน `UPDATE_ENTITIES` | เธรด/ไฟล์แนบใช้ไม่ได้ทั้งชุด |
| `src/lib/master/driveEntityMap.js` | เพิ่มใน `FOLDER_ENTITY_TYPES` | เทสต์แดง (ดักไว้แล้ว) |
| `src/lib/drive.js` | เพิ่มสาขาใน `folderPathForEntity` | ไฟล์ตกถัง `_รอจัดที่` เงียบ ๆ |
| `src/lib/notifications.js` | เพิ่มใน `HREF` + `ENTITY_LABEL` | แจ้งเตือนขึ้นแต่กดไม่ไปไหน |
| `src/config/navigation.js` | `systemForPathname` รู้จัก `/support` | ทั้งโมดูลไปโผล่ใต้เปลือกเมนูระบบภาษี |
| ~~`src/lib/master/attachmentTypes.js`~~ | **ยกเลิก** — ไฟล์แนบไปทางเธรดแทน (ดู §5) | — |
| ~~`scripts/ui-legacy-budget.json`~~ | **ไม่ต้องแตะ** — โมดูลใหม่ไม่มีชั้นสไตล์เก่าเลย (ใช้ `TableShell` + โทเคนล้วน) | — |
| `docs/INDEX.md` | หนึ่งบรรทัดในหมวดแผน | เอกสารกำพร้า ไม่มีใครหาเจอ |

**เพิ่มขึ้นมาระหว่างทาง** — จุดที่แผนเดิมไม่ได้เขียนไว้ แต่ไม่ทำแล้วพังเงียบ:

| ไฟล์ | แก้อะไร | ทำไมถึงโผล่มา |
|---|---|---|
| `src/lib/master/updateTypes.js` | `UPDATE_KINDS.system_issue` — ชื่อ kind ตรงกับชื่อ action ทุกตัว | ไม่ประกาศ = เหตุการณ์ขึ้นป้าย "ข้อความ" เหมือนคนพิมพ์เอง แล้วหายตอนกดซ่อนเหตุการณ์ระบบ |
| `src/lib/chat.js` | เพิ่ม space `admin` (`CHAT_WEBHOOK_ADMIN`) | ระบบยังไม่มีห้องแชทของผู้ดูแลระบบมาก่อน — Q11 ต้องใช้ |
| `src/lib/drive.js` | `FILE_PREFIX` — ชื่อไฟล์ขึ้นต้นด้วยเลขที่เรื่อง | ผลจากมติ Q15 ที่ไม่ทำโฟลเดอร์ต่อใบ ไฟล์หลายเรื่องจึงกองรวมกันในโฟลเดอร์เดือนเดียว |
| `src/config/systems.js` · `src/components/AppLayout.js` · `src/lib/permissions.js` · `src/proxy.js` | `/support` เป็นระบบของตัวเอง + cap สากล `issues:report` | เปลือกเมนูผูกกับ "ระบบ" เสมอ · default-deny ของ proxy ตัด non-admin ทิ้งเงียบ ๆ |
| `vercel.json` | cron `close-resolved-issues` (02:00 ทุกวัน) | ไม่ลงทะเบียน = cron ไม่เคยทำงาน และไม่มีอะไรฟ้อง |
| `src/app/error.js` | หน้า error boundary + ปุ่ม "แจ้งปัญหานี้" | ระบบยังไม่เคยมี error boundary ของตัวเองมาก่อน |

---

## เหลือทำก่อนเปลี่ยนสถานะเป็น `เสร็จสมบูรณ์`

ทั้งหมดเป็นของที่โค้ดพิสูจน์เองไม่ได้ ต้องมีคนเปิดของจริง

1. **smoke test ด้วยบัญชีของฝ่าย ไม่ใช่ admin** — ทดสอบด้วย admin จะไม่เห็นบั๊กด่านสิทธิ์เลย
   ตรวจ 3 อย่าง: `viewer` เปิด `/support` ได้ · แนบภาพหน้าจอได้จริง (ไฟล์ขึ้น Drive) ·
   เปิดเรื่องของคนอื่นไม่ได้ (ต้องได้ข้อความ "เห็นได้เฉพาะเรื่องที่คุณแจ้งเอง" ไม่ใช่คำว่า forbidden)
2. **ตั้ง webhook ห้องผู้ดูแลระบบ** — หน้าตั้งค่า Chat webhooks (space "ผู้ดูแลระบบ") หรือ env
   `CHAT_WEBHOOK_ADMIN` · ไม่ตั้งก็ไม่พัง แต่เรื่องใหม่จะไม่มีใครรู้จนกว่าจะเปิดคิวเอง
3. **ยิง cron ด้วยมือหนึ่งรอบ** — `/api/cron/close-resolved-issues` (admin เปิดจากเบราว์เซอร์ได้)
   ควรได้ `{ scanned: 0, closed: 0 }` ในวันแรก · ถ้าได้ 401 แปลว่า `CRON_SECRET` ยังไม่ถูกตั้งบน Vercel
4. **ดูไฟล์บน Drive จริง** — โฟลเดอร์ `แจ้งปัญหาระบบ / <YYYY-MM>` และชื่อไฟล์ต้องขึ้นต้นด้วย `IS-…`
   (ถ้าไปโผล่ที่ `_รอจัดที่` แปลว่าสาขาโฟลเดอร์ไม่ทำงาน — ไม่มี error ให้เห็น)
