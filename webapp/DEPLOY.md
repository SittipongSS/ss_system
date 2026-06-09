# Deploy: Excise Tax Manager → Vercel + Supabase

หลังบ้านย้ายจากไฟล์ `data.json` ไปเป็น **Supabase Postgres** และไฟล์อัปโหลดไป **Supabase Storage**
แล้ว Deploy หน้าบ้าน (Next.js) ขึ้น **Vercel**

---

## 1) สร้าง Supabase project + ตาราง

1. ไปที่ https://supabase.com → New project (จดรหัส database ไว้)
2. เปิด **SQL Editor** → วางเนื้อหาไฟล์ [`supabase/schema.sql`](supabase/schema.sql) ทั้งหมด → **Run**
   (สร้างตาราง customers / products / orders + เปิด RLS)
3. ไปที่ **Storage** → **New bucket** ตั้งชื่อ `uploads` → ติ๊ก **Public bucket** → Create
   (ใช้เก็บไฟล์แผนที่/เอกสาร ที่อัปโหลดผ่านหน้า SA/ลูกค้า)

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

หลังจากนี้ push GitHub ครั้งไหน Vercel จะ deploy ให้อัตโนมัติ

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
   - `role` ใช้ค่า: `sa` | `legal` | `sales` | `admin`
   - หลังล็อกอิน ระบบพาไปหน้าตาม role อัตโนมัติ

> 🔒 อยากจำกัดเฉพาะอีเมลบริษัท: Authentication → URL/Email settings หรือเพิ่ม
> นโยบาย/disable public signup (โดยปกติเราสร้าง user เองอยู่แล้ว ไม่เปิดให้สมัครเอง)

### หมายเหตุ dev ในเครื่อง
ถ้ายังไม่ตั้งค่า Supabase (`.env.local` ว่าง) แอปจะรันแบบ **ไม่มี auth** (เข้าได้เลย)
เพื่อให้ dev ต่อได้ — พอใส่ env ครบ ระบบ login จะทำงานทันที

---

## เช็กลิสต์ก่อนส่งให้ทีม
- [ ] รัน `schema.sql` + สร้าง bucket `uploads` (public)
- [ ] `.env.local` ครบ 4 ค่า + `node scripts/migrate-to-supabase.mjs`
- [ ] สร้างบัญชีทีมใน Supabase + ใส่ `role` ใน user metadata
- [ ] ทดสอบ `npm run dev`: login → เข้าได้, logout → เด้งออก, ข้อมูล persist
- [ ] Vercel: Root = `webapp` + env 4 ตัว → Deploy
