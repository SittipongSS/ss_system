# Phase 4C — Home and Navigation Hub Modernization

สถานะ: รอดำเนินการ

เป้าหมาย: ปรับ `/home` ให้เป็นศูนย์เข้าสู่ระบบงานที่สม่ำเสมอกับ Navigation หลัก ใช้งานง่ายตามบทบาทและทีม โดยไม่สร้าง Dashboard รวมที่ซ้ำหรือโหลดข้อมูลจากทุกระบบ

## บริบทปัจจุบัน

- `/home` เป็นหน้า hub แบบ bare layout และไม่ครอบด้วย `AppLayout`
- System card, icon, copy, permission visibility และ landing route มีข้อมูลซ้ำกับ `AppLayout`
- หน้ามี inline style จำนวนมาก ทำให้ดูแล responsive, theme และ state ได้ยาก
- ระหว่างโหลด role หน้า return `null` จึงไม่มี Loading/Error feedback
- หน้าแสดงชื่อผู้ใช้และระบบที่เข้าได้ แต่ยังไม่แสดงบริบทบทบาท/ทีมและไม่มี Continue action
- Account/Security, user management และ logout ต้องดูแลแยก เพราะหน้าไม่ใช้ AppLayout chrome

## ขอบเขต

- สร้าง System Catalog กลางสำหรับ key, ชื่อ, คำอธิบาย, icon, landing route และ visibility metadata
- ให้ `/home` และ system switcher ใน `AppLayout` ใช้ Catalog เดียวกันเพื่อลด drift
- ปรับ System Card และ page layout ด้วย CSS token/shared class ของโครงการ
- แสดงชื่อผู้ใช้ บทบาท และทีมด้วยลำดับข้อมูลที่อ่านง่าย
- เรียงและซ่อน System Card ตาม permission เดิม โดย authorization จริงยังอยู่ที่ page/API
- เพิ่ม Continue action ไปยังระบบล่าสุดที่ผู้ใช้ยังมีสิทธิ์ พร้อม fallback ที่ปลอดภัย
- รวมทางลัด Account/Security, Settings หรือ User directory ตามสิทธิ์ และ Logout
- เพิ่ม Loading, Empty, Error และ forced-password-change state ที่ชัดเจน
- ตรวจ Desktop, Tablet, Mobile, Light/Dark, keyboard และ screen-reader behavior

## Information architecture

ลำดับหน้า:

1. Brand และคำทักทาย
2. ข้อมูลบริบทผู้ใช้: บทบาทและทีม
3. Continue action เมื่อมีระบบล่าสุดที่เข้าได้
4. System Card grid ตามสิทธิ์
5. Account/Settings/User directory shortcuts ตามสิทธิ์
6. Logout และ forced password change flow

หน้า `/home` เป็น navigation hub ไม่ใช่ analytics dashboard จึงไม่ดึง KPI, chart,
ยอดขาย, งานค้าง หรือ notification feed จากทุกระบบ

## System Catalog

Catalog เป็น metadata กลางสำหรับการนำทาง ไม่ใช่แหล่ง authorization

ข้อมูลที่วางแผน:

- stable system key
- ชื่อภาษาไทยและคำอธิบายสั้น
- icon component และ visual role
- default landing route หรือ resolver ที่รับ user context
- capability/visibility predicate ที่อ้าง permission helper เดิม
- sort order

กติกา:

- `/home`, top navigation system switcher และจุดแสดง system identity ใช้ Catalog เดียวกัน
- Settings เป็น global application context ไม่ใช่ system card และไม่ถูกจัดรวมใต้ระบบธุรกิจใด
- Catalog ห้ามข้าม page/API permission guard
- ถ้า permission เปลี่ยน ระบบล่าสุดที่เข้าไม่ได้ต้องถูกละทิ้งและเลือก fallback ใหม่
- ไม่เก็บ secret หรือ authorization decision ไว้ใน browser storage

## Continue action

- จำ system key ล่าสุด ไม่จำ URL ภายในที่อาจมีข้อมูลเฉพาะรายการ
- ตรวจสิทธิ์ใหม่ทุกครั้งก่อนแสดงและก่อนนำทาง
- ถ้าไม่มีค่าหรือเข้าไม่ได้ ให้ซ่อน Continue action โดยไม่เกิด Empty gap
- ใช้เพียง local preference; ไม่ต้องเพิ่ม Migration ในรอบแรก
- Logout ต้องไม่ทำให้ cache หรือข้อมูลของผู้ใช้เดิมรั่วไป session ถัดไป

## UX/UI

- ใช้ IBM Plex Sans Thai และ token/class ใน `webapp/src/app/globals.css`; ไม่ติดตั้ง Material library
- ใช้ hierarchy ผ่าน `--bg`, `--panel`, `--panel-2`, typography และ spacing ไม่ใช้สีตกแต่งเกินจำเป็น
- มี high-emphasis action ไม่เกินหนึ่งรายการในแต่ละ context; Continue เป็น primary เมื่อมี
- System Card เป็น navigation card ไม่ใช่ KPI card และทั้ง card ต้องมี accessible name
- Card icon ต้องตรงกับ system switcher และไม่ใช้ raw color ที่ทำให้ Dark mode แตก
- Grid ต้องสมดุลสำหรับจำนวนการ์ด 1–6 ใบ, ไม่มี orphan layout ที่ดูผิดจังหวะ และไม่มี horizontal overflow
- Mobile touch target อย่างน้อย 40px และไม่พึ่ง hover
- มี `:focus-visible`, ลำดับ Tab ตามภาพ, Enter/Space ทำงาน และไม่มี nested interactive controls ใน Card
- Loading ใช้ Skeleton ไม่ใช้หน้าว่าง; Error มี Retry; ไม่มีระบบที่เข้าได้แสดง Empty state พร้อมคำอธิบาย
- เคารพ reduced motion และไม่ใช้ animation ที่ขัดขวางการนำทาง
- Forced password change ต้องยังบังคับได้บน hub และคืน focus อย่างถูกต้อง

## Permission และ security

- ใช้ permission helper และ landing resolver เดิมในระยะนี้
- UI visibility ไม่ถือเป็น authorization; proxy, page guard และ API guard ยังบังคับสิทธิ์ตามเดิม
- ไม่สร้าง Role/Capability ใหม่ก่อน Phase 8–9
- Account/Settings/User directory shortcuts แสดงตาม capability ที่มีอยู่
- Settings ใช้ทางเข้าระดับ app shell; เมื่ออยู่ใน Settings ต้องไม่แสดง sub-navigation ของระบบธุรกิจ
- Logout ต้อง clear application cache และจบ session ก่อนกลับหน้า login

## Data/API/Migration

- ไม่คาดว่าจะมี Migration หรือ API ใหม่ในรอบแรก
- System Catalog เป็น code configuration ที่มี tests และใช้ร่วมกันหลาย consumer
- preference ระบบล่าสุดเก็บเฉพาะ stable system key ฝั่ง client
- หากภายหลังต้อง sync preference ข้ามอุปกรณ์ ต้องเปิด decision ใหม่ ไม่รวมใน Phase 4C รอบแรก

## ไม่รวมใน Phase 4C

- Dashboard รวม, chart, KPI หรือ action queue ข้ามระบบ
- การแก้ Dashboard ภายใน Sales, Tax, Database, PM, Sahamit หรือ Management
- การเปลี่ยน workflow ของแต่ละระบบ
- การรื้อ Top Navigation ทั้งชุดนอกส่วนที่ต้องใช้ System Catalog ร่วมกัน
- Login page redesign
- Notification center
- Permission redesign — Phase 8–9

## Validation และ Definition of Done

- [x] ผู้ใช้ยืนยันให้เพิ่ม Phase 4C ใน Roadmap
- [x] จัดทำ Phase document และ Decision log ก่อน implementation
- [ ] Inventory system key, landing route, icon และ permission predicate ครบ
- [ ] `/home` และ `AppLayout` ใช้ System Catalog เดียวกัน
- [ ] Permission/landing tests ครบทุก role/team และ revoked-access fallback
- [ ] Continue action ไม่พาผู้ใช้ไป route ที่ไม่มีสิทธิ์
- [ ] Loading, Empty, Error, Logout และ forced password states ผ่าน
- [ ] Desktop/Mobile และ Light/Dark ผ่านโดยไม่มี horizontal overflow
- [ ] Keyboard, focus-visible, screen-reader label และ reduced motion ผ่าน
- [ ] ESLint, automated tests และ production build ผ่าน
- [ ] Preview UAT ด้วยอย่างน้อย Admin, Sales และ role ที่เห็นระบบจำกัด
- [ ] ผู้ใช้ตรวจและยืนยันก่อน Commit, Push และ Draft PR

## Known risks

- การรวม Catalog อาจเปลี่ยน landing route หรือ visibility โดยไม่ตั้งใจ ต้องมี parity tests ก่อนถอดข้อมูลซ้ำ
- `/home` ใช้ auth client โดยตรงและไม่อยู่ใน AppLayout จึงต้องรักษา forced password/logout behavior เดิม
- การจำ route ภายในแบบละเอียดอาจเปิดเผยหรือพาไป record ที่ไม่มีสิทธิ์ จึงเก็บเพียง system key
- การเพิ่ม KPI ข้ามระบบจะทำให้หน้าแรกช้าและสร้างนิยามตัวเลขซ้ำ จึงอยู่นอกขอบเขต
