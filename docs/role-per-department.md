# ยกเลิก role `staff` — ทุกฝ่ายมี role ของตัวเอง

สถานะ: **รอตรวจ** · เขียน 2026-08-28

มติผู้ใช้ 2026-08-28: *"จะไม่มีตำแหน่ง staff แล้วทุกฝ่าย"*

| ฝ่าย | role เดิม | role ใหม่ |
|---|---|---|
| PC ฝ่ายจัดซื้อ | `staff` | `pc` |
| PD ฝ่ายผลิต | `staff` | `pd` |
| WH ฝ่ายคลัง | `staff` | `wh` |
| QC ฝ่ายควบคุมคุณภาพ | `staff` | `qc` |
| TS ฝ่ายเทคนิคบริการ | `staff` | `ts` |

RD (`rd` · 2026-07) และ FN (`finance` · 2026-08-13) แยกออกไปก่อนหน้านี้แล้ว — รอบนี้คือส่วนที่เหลือ

---

## 1. ทำไมต้องแยก ไม่ใช่แค่เปลี่ยนชื่อ

role เดียวครอบห้าฝ่าย แปลว่า cap ต้องถือ **กว้างสุดเท่าที่ฝ่ายไหนสักฝ่ายต้องใช้** แล้วไป
แคบด้วย `department` ที่ helper ปลายทางทุกตัว:

```js
export function canViewCosting(user) {
  if (!canUser(user, 'costing:view')) return false;
  if (user?.role !== 'staff') return true;              // ← ตะเข็บที่ต้องเขียนซ้ำทุกที่
  return COSTING_SOURCE_DEPARTMENTS.includes(departmentOf(user));
}
```

ผลคือ **ทุก endpoint ใหม่ที่เผลอ gate ด้วย `can(role, cap)` ล้วน จะเปิดให้ห้าฝ่ายพร้อมกัน** —
คลัง/QC เห็นต้นทุน หรือช่างแก้ตารางผลิต โดยไม่มี error ให้ใครสังเกต · คอมเมนต์ในโค้ดเดิม
เขียนเตือนเรื่องนี้ไว้สามที่ ซึ่งแปลว่ามันคือกับดักที่รู้ตัวแต่แก้ที่ต้นเหตุไม่ได้

⇒ แยก role รายฝ่าย แล้ว **ให้ cap ตรงกับงานจริงตั้งแต่ชั้น role**:

| cap | pc | pd | wh | qc | ts |
|---|---|---|---|---|---|
| `pm:view` · `products:view` · `customers:view` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `costing:view` · `costing:quote` (แหล่งราคา PM) | ✅ | — | — | — | — |
| `requests:answer` (รับคำร้องข้ามฝ่าย) | ✅ | — | — | — | — |
| `production:view` (สายงานโรงงาน) | ✅ | ✅ | ✅ | ✅ | — |
| `production:edit` (คนวางคิวจริง) | ✅ | ✅ | — | — | — |
| `service:view` · `service:edit` | — | — | — | — | ✅ |

ด่านระดับฝ่าย (`canEditProduction` · `canEditService` · `canConfirmPayment`) **ยังอยู่ครบ** —
มันกันฝ่ายขาย/admin ที่ถือ cap เดียวกันด้วยเหตุผลอื่น · ที่หายไปคือตะเข็บ `role !== 'staff'`

## 2. ลำดับ deploy (บทเรียนจาก [legal-to-ra-rename.md](legal-to-ra-rename.md))

`app_metadata.role` อยู่ใน Supabase Auth **ไม่ใช่ตารางในฐาน** ⇒ ไม่มี SQL ให้รันพร้อม deploy

- ย้ายบัญชี**ก่อน** deploy: โค้ดเก่าไม่รู้จัก `pc`/`pd` ⇒ สองคนนั้นกลายเป็นอ่านอย่างเดียว
- deploy **ก่อน**ย้ายบัญชี: `staff` ไม่มีใน `ROLE_CAPS` แล้ว ⇒ พังทางกลับกัน

ทางออกเดียวกับรอบ `legal` → `ra`: **แปลงตอนอ่าน** แต่รอบนี้ตารางชื่อ role อย่างเดียวไม่พอ
เพราะปลายทางขึ้นกับฝ่ายของคนนั้น ⇒ `normalizeRole(role, department)`

```js
const LEGACY_STAFF_ROLE_BY_DEPARTMENT = { PC: 'pc', PD: 'pd', WH: 'wh', QC: 'qc', TS: 'ts', RD: 'rd', FN: 'finance' };
```

⚠️ **ไม่มีฝ่าย = คืน `staff` ตามเดิม** ไม่เดา · role ที่ระบบไม่รู้จักตกไป `DEFAULT_CAPS`
(อ่านทะเบียนอย่างเดียว) ซึ่งเป็นฝั่งที่ปลอดภัย — เคยเขียน fallback เป็น `viewer` แล้วพบว่า
**เปิดกว้างขึ้น** เพราะ viewer คือผู้สังเกตการณ์ทั้งระบบ

⚠️ `proxy.js` อ่าน `app_metadata` เองไม่ผ่าน `authUser` ⇒ ต้องแปลงที่นั่นด้วย
(`roleOf({ role, department })`) ไม่งั้นคนถือโทเคนเก่าโดน 403 ที่ชั้น proxy ทั้งที่ handler ยอม

⇒ **ลำดับที่ใช้จริง: deploy → รันสคริปต์ย้ายบัญชี → คนที่ค้างอยู่ login ใหม่เมื่อไรก็ได้**

```bash
node scripts/migrate-staff-role-to-department-role.mjs --dry-run
node scripts/migrate-staff-role-to-department-role.mjs
```

## 3. สิ่งที่ต้องแตะเมื่อเพิ่ม role ฝ่ายใหม่ครั้งหน้า

`ROLES` · `OPS_ROLES` · `ROLE_LABELS` · `DEPARTMENT_ROLES` · `ROLE_DEFAULT_DEPARTMENT` · `ROLE_CAPS`
— ห้าตัวแรกเป็นทะเบียน ตัวสุดท้ายคือ cap จริง · `OPS_ROLES` คือที่เดียวที่ helper ถาม
("role นี้เป็นฝ่ายปฏิบัติการไหม") แทนการไล่เขียนชื่อ role ซ้ำทุกจุด

## 4. สถานะบัญชี

ณ 2026-08-28 มีสองบัญชีที่ถือ `staff`: `tanyaporn@` (PC) · `eknarin@` (PD) —
`npm run check:users` เป็นตัวจับว่าเหลือใครค้าง

🗑️ ลบ `LEGACY_STAFF_ROLE_BY_DEPARTMENT` ได้เมื่อทั้งสองคน login ใหม่แล้ว
