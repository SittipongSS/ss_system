# แผนเชื่อม Google Chat + ประโยชน์จาก Google Workspace

สถานะ: **เฟส 1+2 ใช้งานจริงแล้ว** · **เฟส 3 โค้ดเสร็จ** (cron daily-digest 08:30 จ-ศ — ⚠ ต้องตั้ง env `CRON_SECRET` บน Vercel) · อัปเดต 2026-07-15
เจ้าของการตัดสินใจ: ผู้ใช้ (supervisor) · จอง migration: **0099** (ตาราง `chat_webhooks`, ใช้ในเฟส 2)

**จุดประสงค์:** บริษัทใช้ Google Workspace อยู่แล้ว → ใช้ Google Chat เป็นช่องแจ้งเตือน
เหตุการณ์สำคัญจากระบบ (งานรออนุมัติ, ดีลชนะ, งานใกล้ครบกำหนด) โดยไม่ต้องเข้ามาเช็คในเว็บเอง
และปูทางไปสู่การใช้ Workspace ด้านอื่น (SSO, Calendar, Gmail)

หลักการเดียวกับ [`DRIVE_STORAGE_PLAN.md`](DRIVE_STORAGE_PLAN.md): แตะชั้น integration
ไม่กระทบ business logic — การแจ้งเตือน **ห้ามทำให้ operation หลักล้มเหลว** (fire-and-forget)

---

## ภาพรวมเฟส

| เฟส | เนื้อหา | Effort | ต้องมี |
|-----|---------|--------|--------|
| 1 | Webhook แจ้งเตือนแบบ realtime (env-based) | ~1-2 วัน | สร้าง Space + webhook URL (ผู้ใช้ทำ) |
| 2 | ตาราง `chat_webhooks` + หน้าตั้งค่า (supervisor) | ~1 วัน | mig 0099 |
| 3 | สรุปประจำวัน (daily digest) ผ่าน Vercel Cron | ~1 วัน | ตั้ง `CRON_SECRET` |
| 4 | Google SSO login (แทร็กแยก ทำเมื่อไหร่ก็ได้) | ~1-2 วัน | เปิด Google provider ใน Supabase |
| 5 | Chat App โต้ตอบได้ (ปุ่มอนุมัติใน Chat) | ~1 สัปดาห์+ | GCP project + internal app — **รอเฟส 1-2 พิสูจน์การใช้งานจริงก่อน** |

---

## เฟส 1 — Webhook แจ้งเตือน realtime

### 1.1 สิ่งที่ผู้ใช้ต้องทำก่อน (ฝั่ง Google Chat)

1. สร้าง Space ตามกลุ่มผู้รับ (แนะนำเริ่ม 3 space):
   - **SS-อนุมัติ** — หัวหน้า/ผู้อนุมัติ (Senior AE ขึ้นไป)
   - **SS-งานขาย** — ทีมขายทั้งหมด
   - **SS-โครงการ (PM)** — ผู้เกี่ยวข้องกับโครงการ
2. ในแต่ละ Space: ⚙ Apps & integrations → **Manage webhooks** → สร้าง webhook
   ตั้งชื่อ "SS System" → ได้ URL มา (ถือเป็น secret — ใครมี URL ก็โพสต์ได้)
3. เอา URL 3 ตัวใส่ Vercel env:
   - `CHAT_WEBHOOK_APPROVALS`
   - `CHAT_WEBHOOK_SALES`
   - `CHAT_WEBHOOK_PM`
   - `NEXT_PUBLIC_BASE_URL` (ถ้ายังไม่มี) — ใช้ประกอบลิงก์กลับเข้าระบบในการ์ด

### 1.2 โค้ดใหม่: `src/lib/chat.js`

```
sendChat(spaceKey, card)        // spaceKey: 'approvals' | 'sales' | 'pm'
  - อ่าน URL จาก env ตาม spaceKey — ไม่มี env = ข้ามเงียบ ๆ (ระบบทำงานปกติ)
  - POST cardsV2 ไปที่ webhook, timeout 5s
  - try/catch ทั้งก้อน: log เมื่อพลาด แต่ไม่ throw กลับไปหา caller เด็ดขาด
  - ส่งหลังตอบ response แล้วด้วย after() ของ next/server → ไม่เพิ่ม latency ให้ API
chatCard({ title, subtitle, rows, linkPath, linkLabel })
  - helper ประกอบการ์ดรูปแบบเดียวทั้งระบบ (หัวข้อ + รายการ key/value + ปุ่มลิงก์)
```

ข้อจำกัด Chat webhook: ~60 ข้อความ/นาที/space — เกินพอสำหรับปริมาณงานเรา
(ไม่ต้องทำ queue ในเฟสนี้)

### 1.3 จุดเกี่ยว (event catalog) — อ้างอิงไฟล์จริง

| เหตุการณ์ | Space | จุดเกี่ยวในโค้ด |
|-----------|-------|------------------|
| ลูกค้า/สินค้าใหม่รออนุมัติ | อนุมัติ | `api/customers/route.js`, `api/products/route.js` (POST → pending) |
| ลูกค้า/สินค้าถูกอนุมัติ/ตีกลับ | งานขาย | `api/customers/[id]/route.js`, `api/products/[id]/route.js` (PATCH approvalStatus) |
| ใบเสนอราคารออนุมัติ / อนุมัติ / ตีกลับ | อนุมัติ + งานขาย | `api/sales-planning/quotations/[id]/approval/route.js` |
| ดีลชนะ (Won) | งานขาย | `api/sales-planning/deals/[id]/win/route.js` (จุดเดียว ใช้ `buildWinPatch`) |
| Forecast review อนุมัติ/ตีกลับ | งานขาย | `api/sales-planning/forecast-reviews/route.js` |
| เอกสาร workflow เปลี่ยนสถานะ | อนุมัติ | จุดกลางของ mig 0098 (`document_workflow_core`) — ผูกทีเดียวได้ทุกเอกสาร |

กติกา: ใส่ `sendChat(...)` **หลัง** DB write สำเร็จเท่านั้น และไม่ await แบบ blocking

### 1.4 รูปแบบการ์ด (ตัวอย่าง: ใบเสนอราคารออนุมัติ)

หัวการ์ด: "📄 ใบเสนอราคารออนุมัติ" · แถว: เลขที่ QT, ลูกค้า, มูลค่า, ผู้ขอ
ปุ่ม: "เปิดดูในระบบ" → `${NEXT_PUBLIC_BASE_URL}/sa/quotations/<id>`
(การ์ดแสดงเฉพาะข้อมูลที่คนใน space มีสิทธิ์เห็นอยู่แล้ว — space เป็น internal เท่านั้น)

### 1.5 การทดสอบ

- สร้าง space ทดสอบส่วนตัว + webhook → ใส่ env ใน `.env.local` → ยิงเหตุการณ์จริงจาก UI
- เช็คว่า API ตอบเร็วเท่าเดิม (การ์ดส่งหลัง response) และ env หาย → ไม่มี error

---

## เฟส 2 — ตั้งค่า webhook ผ่านหน้าเว็บ (เลิกพึ่ง env)

- mig **0099**: ตาราง `chat_webhooks` (key PK, url, label, enabled, updatedBy, updatedAt)
- `lib/chat.js` อ่านจากตารางก่อน (cache ~1 นาที) → fallback env
- หน้า `/database/chat-webhooks` (supervisor เท่านั้น — pattern เดียวกับ `/database/holidays`)
  เพิ่ม/แก้/ปิด webhook ต่อ space ได้เอง + ปุ่ม "ส่งข้อความทดสอบ"
- เก็บ audit ผ่าน `recordAudit` เหมือน master data อื่น

## เฟส 3 — สรุปประจำวัน (daily digest)

- เพิ่ม `crons` ใน `vercel.json` (ปัจจุบันยังไม่มี cron เลย):
  `{ "path": "/api/cron/daily-digest", "schedule": "30 1 * * 1-5" }` = 08:30 เวลาไทย จันทร์-ศุกร์
- route ใหม่ `api/cron/daily-digest/route.js` ตรวจ `Authorization: Bearer ${CRON_SECRET}`
- เนื้อหา digest (ใช้ query เดิมที่มีอยู่แล้ว ไม่เขียน logic ใหม่):
  - งานรออนุมัติค้าง (master pending + QT รออนุมัติ) → space อนุมัติ
  - task PM ใกล้ครบกำหนด 3 วัน / เลยกำหนด (ใช้ `lib/pm/derived.js` urgency) → space PM
  - FC สหมิตรเสี่ยงช้า (logic เดิมจาก sahamit-risk) → space งานขาย
- ไม่มีเหตุการณ์ = ไม่ส่ง (อย่าส่งการ์ดว่าง)

## เฟส 4 — Google SSO (แทร็กแยก อิสระจาก Chat)

- เปิด Google provider ใน Supabase Auth + จำกัดโดเมน `scentandsense.co.th` (ตรวจ `hd` claim)
- ปุ่ม "เข้าสู่ระบบด้วย Google" ในหน้า login — **role ยังอ่านจาก DB ทุก request ตามเดิม**
  (auth-session-model ไม่เปลี่ยน) แค่เปลี่ยนวิธีพิสูจน์ตัวตน
- ต้องตัดสินใจ: บังคับ SSO อย่างเดียว หรือให้ใช้รหัสผ่านคู่กันช่วงเปลี่ยนผ่าน
- ผูกบัญชีเดิม: match ด้วยอีเมล (อีเมลพนักงานเป็น @scentandsense.co.th อยู่แล้ว)

## เฟส 5 — Chat App โต้ตอบได้ (อนาคต)

ปุ่มอนุมัติ/ตีกลับในการ์ด Chat โดยตรง — ต้องมี GCP project, service account,
deploy เป็น internal Chat app, endpoint รับ interaction + ตรวจ JWT ของ Google
**เริ่มก็ต่อเมื่อเฟส 1-3 ถูกใช้จริงและมี demand ชัด** (ต้นทุนดูแลสูงกว่ามาก)

---

## ประโยชน์ Workspace อื่นที่จัดลำดับไว้ (ยังไม่อยู่ในแผนนี้)

1. **Google Drive เก็บไฟล์แนบ** — โค้ดเสร็จแล้ว รอปิดงาน (ดู `DRIVE_STORAGE_PLAN.md`)
2. **Google Calendar + Meet** — sync กำหนดส่ง PM / นัดประชุมของโมดูลงานบริหาร (ดู `MGMT_PLAN.md`)
3. **Gmail API** — ส่งใบเสนอราคา/เอกสารให้ลูกค้าในนามบริษัท + เก็บประวัติการส่ง
4. **Google Sheets export** — รายงานเป็น Sheets แชร์ได้ทันที

## ความปลอดภัย

- webhook URL = secret (โพสต์ได้อย่างเดียว อ่านไม่ได้) — เก็บใน env/ตาราง ห้าม commit
- การ์ดส่งเข้า space ภายในบริษัทเท่านั้น ไม่ส่งข้อมูลลูกค้าเกินที่จำเป็น (ชื่อ+เลขเอกสาร+มูลค่า)
- cron ต้องมี `CRON_SECRET` กันยิงจากภายนอก
- เฟส 5 ค่อยว่ากันเรื่อง OAuth/JWT — เฟส 1-3 ไม่มี credential ฝั่ง Google เลย
