// ── บ้านของฝ่ายวิจัยและพัฒนา ────────────────────────────────────────────
//
// ⭐ **เพิ่มหัวข้อของ RD = เพิ่มไฟล์ในโฟลเดอร์นี้ แล้วต่อท้ายลิสต์ข้างล่าง**
// ไม่ต้องแตะไฟล์ของฝ่ายอื่น ไม่ต้องแตะทะเบียนกลาง — นี่คือข้อแรกของโจทย์
// ("เพื่อที่แต่ละฝ่ายจะได้ขยายระบบได้" · มติผู้ใช้ 2026-08-04)
//
// ⚠️ **ลำดับในลิสต์คือลำดับที่ผู้ใช้เห็นในดรอปดาวน์** (ภายในตระกูลเดียวกัน)
import scentDev from './scentDev';
import productDev from './productDev';
import pricing from './pricing';
import legacy from './legacy';

const RD_KINDS = [scentDev, productDev, ...pricing, ...legacy];

export default RD_KINDS;
