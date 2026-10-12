# Deploy: SS System → Vercel + Supabase

หลังบ้านย้ายจากไฟล์ `data.json` ไปเป็น **Supabase Postgres** และไฟล์อัปโหลดไป **Supabase Storage**
แล้ว Deploy หน้าบ้าน (Next.js) ขึ้น **Vercel**

---

## 1) สร้าง Supabase project + ตาราง

1. ไปที่ https://supabase.com → New project (จดรหัส database ไว้)
2. สำหรับ **project ใหม่เท่านั้น** สร้าง SQL bootstrap ที่รวม base schema และ migration ทั้งหมด:

   ```bash
   npm install
   npm run db:bootstrap
   ```

   จากนั้นเปิด **SQL Editor** → วางไฟล์ `supabase/bootstrap.generated.sql` → **Run**

   > ห้ามรัน bootstrap บนฐานเดิม เพราะมีคำสั่งสร้างตารางและ backfill ทั้งประวัติ

3. สำหรับ **ฐานเดิม** ให้รันเฉพาะ migration ใหม่ใน `supabase/migrations/` ตามลำดับชื่อไฟล์ และบันทึกเลขไฟล์ล่าสุดที่รันแล้วก่อน deploy web
4. ก่อน commit/deploy migration ทุกครั้งให้รัน:

   ```bash
   npm run check:migrations
   ```

   เลข `0076`, `0087`, `0099` ซ้ำจากประวัติเก่าและถูก allowlist ไว้แล้ว ห้ามนำเลขเหล่านี้กลับมาใช้ซ้ำอีก
5. ไปที่ **Storage** → **New bucket** ตั้งชื่อ `uploads` → ติ๊ก **Public bucket** → Create
   (ใช้กับไฟล์ public เช่นแผนที่/รูป master data)

   Migration `0105` จะสร้าง bucket `sales-evidence` แบบ **private** สำหรับหลักฐาน Won โดยเฉพาะ ห้ามเปลี่ยน bucket นี้เป็น public; ระบบดาวน์โหลดผ่าน API ที่ตรวจสิทธิ์ของดีล
   Migration `0106` เพิ่ม workflow สอบถาม SA ↔ RD แบบรับทราบ/ล็อกข้อความและปิดสองฝ่าย

## 2) เอา keys มาใส่ env

ใน Supabase: **Project Settings → API** จะมี
- `Project URL`
- `anon` `public` key
- `service_role` `secret` key (อย่าเปิดเผย!)

คัดลอกไฟล์ตัวอย่าง แล้วเติมค่า:

```bash
cp .env.example .env.local
```

แก้ `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # anon public
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # service_role secret
SUPABASE_PRIVATE_STORAGE_BUCKET=sales-evidence
```

## 3) ย้ายข้อมูลเดิม (data.json → Supabase)

```bash
node scripts/migrate-to-supabase.mjs
```
ควรเห็น `✓ customers / ✓ products / ✓ orders`

## 4) ทดสอบในเครื่อง

```bash
npm run dev
```
เปิด http://localhost:3000 → ลองเพิ่ม/แก้/ลบ ข้อมูล แล้วรีเฟรช ต้องอยู่ครบ (เก็บใน Supabase แล้ว)

## 5) ขึ้น GitHub

```bash
git init
git add .
git commit -m "Excise Tax Manager on Supabase"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
> `.env.local` ไม่ถูก push (อยู่ใน .gitignore แล้ว) — ปลอดภัย

## 6) Deploy บน Vercel

1. https://vercel.com → **Add New → Project** → เลือก repo
2. **Root Directory** = `webapp`  ⚠️ สำคัญ (โค้ดอยู่ในโฟลเดอร์นี้)
3. **Environment Variables** → ใส่ทั้ง 4 ตัวจาก `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
4. **Deploy** → ได้ URL `https://<repo>.vercel.app` ส่งให้ทีมใช้ได้เลย

### จังหวะการ deploy — `main` ไม่ขึ้น prod เอง

Vercel ไม่ได้ deploy จาก `main` แล้ว แต่ deploy จากแบรนช์ `production`
(ตั้งไว้ที่ `vercel.json` → `git.deploymentEnabled` และที่ **Vercel → Settings →
Environments → Production → Branch Tracking** ต้องเป็น `production` ทั้งสองที่ต้องตรงกัน)

> Vercel เคยเก็บค่านี้ไว้ที่ Settings → Git แต่ย้ายมาอยู่ใต้ Environments แล้ว
> ช่อง Branch Tracking พิมพ์ชื่อแบรนช์เองได้ ไม่ใช่ dropdown
>
> ⚠️ **แบรนช์ต้องมีอยู่จริงบน GitHub ก่อน** ไม่งั้นกด Save แล้วเด้ง
> `Failed to save branch tracking. Try again.` โดยไม่บอกสาเหตุ — ข้อความชวนให้คิดว่า
> เป็นความผิดพลาดชั่วคราว กดซ้ำอีกกี่ครั้งก็ไม่ผ่าน สร้างแบรนช์ก่อนแล้วค่อย Save

`main` ยังรับ merge ได้ตลอดวันเหมือนเดิม แล้ว workflow
`.github/workflows/deploy-production.yml` จะ fast-forward `production` ตาม `main`
ให้เองวันละ 3 รอบ: **09:00 / 13:00 / 18:00 เวลาไทย**

เหตุผล: Build CPU Minutes เคยเป็น 87% ของบิล Vercel ($24.22 จาก subtotal $27.98)
และ Vercel คิดเงินเป็น *vCPU ที่จองไว้ × wall-clock ของ build step ทั้งก้อน*
(clone + install + build + อัป cache) ⇒ ตัวแปรที่ขยับตัวเลขได้จริงคือ**จำนวน build**
ไม่ใช่ความเร็วของ build วันหนึ่งมี merge ~22 ครั้ง เหลือ 3 build

**ของด่วนที่รอรอบถัดไปไม่ได้:** ไปที่ **Actions → Deploy to production → Run workflow**
กดแล้วขึ้น prod ทันที และมีล็อกว่าใครกดเมื่อไร

workflow จะไม่ deploy ให้ถ้า CI ของ `main` ยังไม่เขียว — รอบตามเวลาจะข้ามไปเงียบ ๆ
แล้วไปเก็บรอบหน้า ส่วนการกดปุ่มเองจะฟ้องแดงให้เห็นว่าไม่ได้ deploy

### ไฟล์แนบ: `UPLOAD_RECEIPT_MODE` — สวิตช์ฉุกเฉินของด่านใบรับการอัปโหลด (migration 0406 · มติเจ้าของ 08/10/2026)

ไฟล์ที่แนบเป็นไฟล์แนบต้องมี **ใบรับการอัปโหลด** — แถวในตาราง `upload_receipts` ที่ server จดไว้ตอนอัปไฟล์ขึ้น Drive
ว่าใครอัปใบไหนเมื่อไร (อายุ 24 ชั่วโมง) ไม่มีใบรับ = แนบไม่ได้

- **ปกติไม่ต้องตั้งตัวแปรนี้เลย** (= บังคับ) ไม่อยู่ในรายการตัวแปรที่ต้องมีตอน deploy
- **ต้องรัน `supabase/migrations/0406_upload_receipts.sql` บน SQL Editor ก่อน** เปิด PR ให้ CI เขียว / ก่อน merge /
  ก่อน deploy — โค้ดใหม่บนฐานที่ยังไม่มีตาราง = อัปไฟล์ได้ แต่แนบเป็นไฟล์แนบแล้วตอบ
  "ตรวจที่มาของไฟล์ไม่ได้ในขณะนี้" (503) ทุกครั้ง
- ออกใบรับพลาดชั่วคราว (log `🔴 ออกใบรับการอัปโหลดไม่สำเร็จ`) แต่ตารางอ่านได้ = ไฟล์ใบนั้นแนบแล้วตอบ 400
  "ไฟล์นี้ไม่ได้มาจากการอัปโหลดของคุณ…" (ไม่ใช่ 503) และลบไฟล์ที่เพิ่งอัปตอบ 403 — ให้ผู้ใช้อัปไฟล์ใหม่แล้วแนบอีกครั้ง
  ไฟล์ใบแรกค้างบน Drive ให้รายงานไฟล์กำพร้า (cron drive-orphans) ตามเก็บ
- **สวิตช์ฉุกเฉิน** (ผู้ใช้แนบไฟล์ไม่ได้ทั้งบริษัทและยังหาสาเหตุไม่เจอ): ตั้งใน Vercel → Settings → Environment
  Variables → Production เป็น `UPLOAD_RECEIPT_MODE=observe:YYYY-MM-DD` (วันตามเวลาไทย เช่น `observe:2026-10-10` ·
  **ไม่เกิน 7 วันนับจากวันนี้** — ไกลกว่านั้นถือว่าไม่ได้ตั้ง) แล้ว **build คอมมิตที่อยู่บน production ตอนนี้ซ้ำจาก Vercel**:
  Vercel → Deployments → deployment ที่ติดป้าย Production (Current) → เมนู `…` → **Redeploy**
  (ค่า env ผูกกับ deployment ตอน build — เปลี่ยนค่าเฉย ๆ deployment เดิมยังใช้ค่าเดิม)
  - ⚠️ **ห้ามใช้ Actions → Deploy to production → Run workflow กับงานนี้** — workflow นั้นทำอย่างเดียวคือเลื่อน branch
    `production` ตาม `main`: ถ้าสอง branch อยู่คอมมิตเดียวกันอยู่แล้ว มันพิมพ์ "nothing new to deploy" แล้ว **จบเขียว
    โดยไม่ build อะไร** (สวิตช์ยังไม่เปิดทั้งที่ดูเหมือนสำเร็จ) · ถ้า `main` นำอยู่ มันพาคอมมิตอื่นที่ไม่เกี่ยวขึ้น prod
    กลางเหตุฉุกเฉิน และไม่ยอมทำเลยถ้า CI ของ `main` ยังไม่เขียว
  - **ตรวจว่าสวิตช์เปิดจริง** (ทำทุกครั้ง): ① หน้า Deployments มี deployment Production ใบใหม่ที่ **สร้างหลัง**
    เวลาที่แก้ค่า env และสถานะ Ready ② ให้คนที่แนบไม่ได้ลองแนบอีกครั้ง — ต้องแนบผ่าน และ Vercel → Logs ต้องมีบรรทัด
    `[upload-receipt] observe would-reject` ของคำขอนั้น · ไม่มีบรรทัดนี้และยังได้ 400/503 = สวิตช์ยังไม่มีผล
    (ค่าพิมพ์ผิดรูป · วันไกลเกิน 7 วัน · ยังไม่ได้ Redeploy)
  - จนสิ้นวันนั้น ด่านใบรับตอนแนบจะ **จดแล้วปล่อยผ่าน** — ทุกคำขอที่ควรถูกปฏิเสธขึ้น log หนึ่งบรรทัด
    ขึ้นต้นด้วย `[upload-receipt] observe would-reject` ตามด้วย JSON (เหตุ · เส้น · id ผู้ใช้ · ระเบียน · id ไฟล์)
  - **พ้นวันนั้นกลับมาบังคับเอง** แม้ลืมถอดค่า · รูปอื่นทั้งหมด (`observe` เฉย ๆ · ตัวพิมพ์ใหญ่ · มีช่องว่าง ·
    วันที่ไม่มีจริง) = บังคับ · **วันที่ไกลกว่า 7 วันนับจากวันนี้ (เวลาไทย) = บังคับเช่นกัน** (กันพิมพ์ปีผิดหรือตั้ง
    `9999-12-31` แล้วด่านปิดค้าง) — เหตุฉุกเฉินที่ยาวกว่า 7 วันต้องมาตั้งวันใหม่แล้ว Redeploy อีกรอบ
  - ผ่อนได้ **ด่านเดียว** คือใบรับของ `POST /api/attachments` — รูปร่างรหัสไฟล์ · ลิงก์ตรงกับไฟล์ ·
    "ไฟล์นี้ถูกแนบไว้กับเอกสารอื่นแล้ว" และเส้นลบไฟล์ที่เพิ่งอัป (`DELETE /api/upload`) บังคับทุกโหมด
  - ระหว่างเปิดสวิตช์ ช่องโหว่ที่ด่านนี้ปิดไว้ (แนบแถวที่ชี้ไฟล์ของคนอื่น) กลับมาเปิด — ตั้งวันให้สั้นที่สุด
    และถอดค่าทันทีที่แก้ต้นเหตุได้ · **ถอดค่าแล้วต้อง Redeploy จาก Vercel แบบเดียวกัน** (ไม่ใช่กด workflow) — ไม่งั้น
    deployment เดิมยังผ่อนด่านต่อจนสิ้นวันที่ตั้งไว้ หรือจนมี deploy รอบถัดไป · ตรวจหลังถอด: deployment Production ใบใหม่
    สร้างหลังเวลาที่ถอดค่า และไม่มีบรรทัด `[upload-receipt] observe would-reject` ใหม่ใน Logs อีก

### ช่อง "แพ็ค/เดือน" ของใบเสนอราคา — รุ่นที่ถอยกลับไปได้ (งวด PR-3 · ประตูทางเดียว)

รายละเอียดและเหตุผลทั้งหมดอยู่ที่ [docs/qt-pack-column.md](../docs/qt-pack-column.md) หัวข้อ "ประตูทางเดียว" — ที่นี่คือสิ่งที่คนกด deploy / rollback ต้องรู้:

- ตั้งแต่มีบรรทัดใบเสนอราคาที่มีเลขแพ็ค (`quotation_lines."packQty"` ไม่ว่าง) **ห้าม rollback production ไปรุ่นที่ต่ำกว่า deployment ของงวด PR-2 ข้างล่าง**
  — รุ่นก่อนงวด PR-1 (ก่อนคอมมิต `aec7c58c`) บันทึกใบแพ็คแล้วยอดหดเป็น จำนวน × ราคา **โดยไม่มี error** · รุ่นที่มีแค่งวด PR-1 ไม่วาดคอลัมน์แพ็คบนจอ/กระดาษพิมพ์สด
- **ทางฉุกเฉินทางเดียว** เมื่อช่องกรอกของงวด PR-3 มีปัญหา: Vercel → Deployments → deployment ของงวด PR-2 → เมนู `…` → **Redeploy**
  (ใบแพ็คยังอ่านถูกทุกที่ · บันทึก/ออก Rev. ของใบแพ็คถูกปฏิเสธจนกว่าจะกลับขึ้นงวด PR-3 · งานอื่นทำต่อได้)
- 🔴 **รุ่นก่อนงวด PR-1 ที่ต่อฐานนี้ = rollback ที่ห้ามข้างบน ไม่ว่าจะรันที่ไหน**: `npm run dev` ของ worktree ที่ยังไม่ได้รวม `main` (โปรเจกต์นี้ไม่มีฐาน dev แยก — `.env.local` ของทุก worktree ชี้ฐานจริง) ·
  preview ของแบรนช์เก่า (ถ้า preview ต่อฐานเดียวกัน) ⇒ **ห้ามบันทึก / ออก Rev. / ยื่น / อนุมัติใบเสนอราคาบนรุ่นนั้น** — ใบแพ็คที่ถูกบันทึกจากรุ่นนั้นยอดหดเงียบเหมือนกันทุกประการ
  · ก่อนใบแพ็คใบแรก: รวม `main` เข้าทุก worktree ที่จะเปิด dev server หรือหยุดมัน (วัด 09/10: 41 จาก 46 worktree ยังเป็นรุ่นก่อนงวด PR-1 รวม checkout หลัก)
- **ห้ามแก้ `QUOTE_PACK_INPUT_OPEN` กลับเป็น `false`** เป็นทางแก้ — ไม่เท่ากับ rollback (คนขายจะลบเลขแพ็คด้วยมือตามข้อความของระบบ แล้วยอดหด)
- deployment ของงวด PR-2 ที่ถอยกลับไปได้ (ต้องเป็น deploy ที่ขึ้น production **ก่อน** และ **แยกจาก** งวด PR-3):
  `id: dpl_GEc823QmaFCaABy8rZumJbbG8Ewv · คอมมิต: 311baf42 · ขึ้น production เมื่อ: 09/10/2026` (deploy ของงวด PR-2 เอง · #1891)
  · deploy ของ production ที่ขึ้นหลังจากนั้นและก่อนงวด PR-3 ใช้ถอยได้เหมือนกัน (มีโค้ดงวด PR-2 ครบ) — ล่าสุดก่อนงวด PR-3 (จดจาก `/api/version` เมื่อ 12/10/2026):
  `id: dpl_ACS5StFXeuCHwyffHaB3u1SmRYkd · คอมมิต: 0457f624`
- เวลาที่งวด PR-3 ขึ้น production (ค่า `--pack-launch` ของสคริปต์ข้างล่าง — ISO มีเขตเวลา):
  `2026-10-12T11:56:00+07:00` (งวด PR-3 · #1896 · คอมมิต `66465e17` · `dpl_EjQkR2Fzn2YnJuMH8wyaezsNj8br`) · รอบเทียบแรกหลังขึ้น 12/10: `✓ ไม่มีจุดต่าง` — รอบถัดไปใส่
  `--expect-min-lines=1253,464 --expect-min-fingerprints=584,257 --expect-min-packed=0,0 --pack-launch=2026-10-12T04:56:00.000Z --audit-since=2026-10-12T07:00:11.555Z`
  (ค่าจากรอบหลัง deploy งวด PR-4 · #1899 · 12/10/2026 14:00 — `✓ ไม่มีจุดต่าง`)
- หลัง deploy และหลัง rollback **ทุกครั้ง** — และเมื่อสงสัยว่ามีใครบันทึกใบจากรุ่นเก่า (อ่านอย่างเดียว · จากโฟลเดอร์ `webapp`):
  `node --import ./scripts/test-loader.mjs scripts/check-line-pack-parity.mjs --expect-min-lines=<QT>,<SO> --expect-min-fingerprints=<QT>,<SO> --expect-min-packed=<QT>,<SO> --pack-launch=<เวลาข้างบน> --audit-since=<ของรอบก่อน>`
  — ใส่ค่าที่สคริปต์พิมพ์ไว้ท้ายผลของรอบก่อน · ต้องจบด้วย `✓ ไม่มีจุดต่าง`
  · หัวข้อ **⑥ ⑦ ⑧** คือตัวจับเลขแพ็คที่หาย: ⑧ ไล่ `audit_logs` แล้วพิมพ์ **เลขใบ · รายการ · เลขแพ็คเดิม · ยอดเดิม** ของการบันทึกที่ทำเลขแพ็คของบรรทัดหาย (= มีรุ่นเก่าเขียนทับ ให้หยุดแล้วแจ้งผู้พัฒนา — ยอดเดิมกู้จากค่าที่พิมพ์)
  · จำนวนบรรทัดที่มีเลขแพ็ค **ลดลง** = "ต้องดู" ไม่ใช่ "รุ่นเก่าเขียนทับ" เสมอ (คนขายลบใบร่าง/ลบบรรทัดได้ตามปกติ — สคริปต์พิมพ์ว่าบรรทัดไหนถูกลบ) · ไม่ใส่ `--pack-launch` จำนวนที่ลดจะเป็น exit 1
- หลัง deploy งวด PR-3: กด **"บังคับรีเฟรชทุกคน"** (หัวข้อถัดไป) — แท็บที่เปิดค้างไม่มีช่องกรอก ได้แต่ข้อความปฏิเสธของเซิร์ฟเวอร์

### บังคับรีเฟรชทุกคน — ปุ่มแอดมิน (มติเจ้าของ 25/09/2026)

**deploy ไม่ทำให้แท็บที่เปิดค้างรีเฟรชเอง** — ตัวเช็กเวอร์ชันหลัง deploy ของ #1829 (แถบ + รีโหลดเมื่อเปลี่ยนหน้า)
ถูกถอดแล้ว ตามมติ "การจะรีเฟรช ขอให้แอดมินกดเองพอ อันอื่นไม่ต้อง"

- หลัง deploy ที่อยากให้ทุกคนได้หน้าใหม่ทันที (หรือหลังย้ายบทบาทใคร) → แอดมินเข้า **จัดการผู้ใช้งาน (/users)**
  → ปุ่ม **"บังคับรีเฟรชทุกคน"** มุมขวาบน → ยืนยัน
- ทุกแท็บที่เปิดระบบอยู่ขึ้น **หน้าต่างบังคับรีเฟรช ปิดไม่ได้** ภายใน 1 นาที (หรือทันทีที่กลับมาดูหน้าจอ) ·
  ทางเดียวคือกด "รีเฟรชตอนนี้" · งานที่พิมพ์ค้างและยังไม่บันทึกหาย (กล่องยืนยันบอกแอดมินก่อนกด)
- คำสั่งเก็บเป็นแถว `audit_logs` (entityType `system` · entityId `force-refresh`) ⇒ ดูได้ในหน้า /audit ว่าใครกดเมื่อไร
- กติกาเต็มอยู่ `src/lib/ui/forceRefresh.js` · เส้น API `src/app/api/users/force-refresh/route.js`

---

## 7) ระบบ Login (Supabase Auth) — ทำให้แล้ว ✅

Login เปลี่ยนจากรหัส `1234` เป็น **Supabase Auth (อีเมล + รหัสผ่านจริง)** แล้ว
- `src/proxy.js` กันทุกหน้า/ทุก API: ยังไม่ล็อกอิน → เด้งไปหน้า login / API ตอบ 401
- role (sa/legal/sales/admin) เก็บใน **user metadata** ของแต่ละบัญชี (แอดมินกำหนด)

### ตั้งค่าใน Supabase (ทำครั้งเดียว)

1. **Authentication → Providers → Email** = เปิด (ค่าเริ่มต้นเปิดอยู่)
2. (แนะนำ) **Authentication → Providers → Email → ปิด "Confirm email"**
   หรือสร้าง user แบบ Auto Confirm (ขั้นถัดไป) ก็ได้
3. สร้างบัญชีให้ทีม: **Authentication → Users → Add user**
   - กรอกอีเมล + รหัสผ่าน → ติ๊ก **Auto Confirm User** → Create
4. กำหนด role: คลิกที่ user → **User Metadata** (raw) → ใส่ JSON:
   ```json
   { "role": "legal", "name": "นิติกร" }
   ```
   - `role` ใช้ค่าใดค่าหนึ่ง:
     `admin` | `secretary` | `ae_supervisor` | `senior_ae` | `ac` | `ae` | `marketing` | `legal` | `viewer` | `staff`
   - `senior_ae`, `ac`, `ae` ต้องมี `team`: `ODM` | `KA` | `SV`
   - `staff` ต้องมี `department`: `PC` | `PD` | `WH` | `RD` | `QC`
   - หลังล็อกอิน ระบบพาไปหน้าตาม role อัตโนมัติ

> 🔒 อยากจำกัดเฉพาะอีเมลบริษัท: Authentication → URL/Email settings หรือเพิ่ม
> นโยบาย/disable public signup (โดยปกติเราสร้าง user เองอยู่แล้ว ไม่เปิดให้สมัครเอง)

### หมายเหตุ dev ในเครื่อง
ถ้ายังไม่ตั้งค่า Supabase (`.env.local` ว่าง) proxy จะปล่อยหน้าเว็บผ่านเพื่อให้พัฒนา UI ได้ แต่ API ที่ต้องยืนยันตัวตนจะใช้งานไม่ได้

> Production ต้องมี `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` ครบเสมอ มิฉะนั้น proxy จะไม่สามารถบังคับ login ได้ ตรวจ log `[proxy] ... auth is DISABLED` และถือว่า deploy ไม่ผ่าน

---

## เช็กลิสต์ก่อนส่งให้ทีม
- [ ] รัน `npm run check:migrations`
- [ ] Project ใหม่: สร้างและรัน `supabase/bootstrap.generated.sql`; ฐานเดิม: รันเฉพาะ migration ใหม่ครบ
- [ ] สร้าง bucket public `uploads`; ตรวจว่า migration `0105` สร้าง bucket private `sales-evidence` แล้ว และรัน `0106` ก่อน deploy Inquiry workflow
- [ ] `.env.local` ครบ 4 ค่า; รัน `node scripts/migrate-to-supabase.mjs` เฉพาะกรณีนำเข้าข้อมูลเก่าจาก `data.json`
- [ ] สร้างบัญชีทีมใน Supabase + ใส่ `role` ใน user metadata
- [ ] ทดสอบ `npm test`, `npm run lint`, `npm run build`
- [ ] Smoke test: login → Lead → Deal → Quotation → Won พร้อมหลักฐาน → Project/PM
- [ ] Vercel: Root = `webapp` + env 4 ตัว → Deploy
- [ ] Vercel → Settings → Environments → Production → **Branch Tracking = `production`** (ไม่ใช่ `main`) ให้ตรงกับ `vercel.json` — แบรนช์ต้องมีอยู่จริงก่อนถึงจะ Save ผ่าน
