# SS System

ระบบภายในของ Scent & Sense — งานขาย · จัดการโครงการ · ข้อมูลหลัก · ภาษีสรรพสามิต ·
คำร้องข้ามฝ่าย · พยากรณ์ยอดสหมิตร · ธุรกิจบริการ รวมเป็น Next.js app เดียว

Next.js 16 · React 19 · Supabase · deploy บน Vercel

## เริ่มงาน

```bash
npm install && npm run dev
```

เปิด http://localhost:3000

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm test` | รันเทสต์ทั้งหมด (`src/**/*.test.mjs`) |
| `npm run lint` | ESLint |
| `npm run build` | build ตรวจก่อน deploy |
| `npm run check:migrations` | ตรวจเลข migration ชนกันไหม — **รันก่อนเพิ่ม migration ใหม่เสมอ** |
| `npm run check:columns` | ตรวจว่า `select()` อ้างคอลัมน์ที่มีจริง |
| `npm run audit:ui` | ตรวจว่า UI ใช้ token/คลาสร่วมตามมาตรฐาน |

## ก่อนเขียนโค้ด

1. **[AGENTS.md](AGENTS.md)** — กฎบังคับของโปรเจกต์ (ฟอร์มสร้าง/แก้ต้องเป็น component เดียวกัน)
2. **[docs/INDEX.md](../docs/INDEX.md)** — สารบัญเอกสารทั้งหมด มติที่เคาะแล้วอยู่ไฟล์ไหน งานไหนค้าง
3. **[UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md)** — ก่อนแตะ UI
4. **[DEPLOY.md](DEPLOY.md)** — Vercel + Supabase

Migration ทุกไฟล์อยู่ที่ `supabase/migrations/` และ **ต้องรันมือบน Supabase SQL Editor**
(service-role รัน DDL ไม่ได้)
