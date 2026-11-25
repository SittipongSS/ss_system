// ── ทะเบียนป้ายภาษาไทยของทุกสิทธิ์ (cap) — แท็บ "สิทธิ์ตามตำแหน่ง" (รื้อระบบสิทธิ์งวด 3 · มติเจ้าของ 25/11/2026) ─────────
//
// ⭐ ข้อมูลล้วน ไม่ import ของฝั่ง server — หน้าจอใช้ตรงได้
// ⭐ จัดตาม "ระบบ" ที่คนในบริษัทรู้จัก ไม่ใช่ตามคำหน้า `:` ของ cap (เช่น `sales:*` = ใบยื่นชำระภาษี อยู่หมวดภาษี)
// ⚠️ ป้ายบอก "ทำอะไรได้" ระดับ cap เท่านั้น — ด่านจริงหลายตัวแคบลงอีกชั้นตามฝ่าย/ทีม/สถานะเอกสาร
//    (53 ตัวเช็กใน permissions.js) ⇒ แคบอีกชั้นเมื่อไรต้องเขียน `scope` กำกับ ไม่งั้นตารางบอกเกินความจริง
// ⚠️ ระดับ (tier): 1 = ดู · 2 = ทำงาน (เพิ่ม/แก้/ตอบ) · 3 = เต็ม (อนุมัติ/ลบ/จัดการ) — ช่องในตารางภาพรวมโชว์ระดับสูงสุดของระบบนั้น
// 🔴 เพิ่ม cap ใหม่ใน ROLE_CAPS แล้วไม่เติมที่นี่ = แท็บสิทธิ์ไม่โชว์ cap นั้น · capabilityCatalog.test.mjs แดงทันที
import { isModuleClosed } from '@/lib/permissions';

export const CAP_TIER_LABELS = ['—', 'ดู', 'ทำงาน', 'เต็ม'];

/** ระบบ → สิทธิ์ · `key` ตรงกับคีย์ใน CLOSED_MODULES เมื่อเป็นระบบที่ปิดได้ (production · mgmt) */
export const CAPABILITY_MODULES = Object.freeze([
  { key: 'customers', name: 'ลูกค้า', icon: 'Building2', caps: [
    { cap: 'customers:view', tier: 1, label: 'ดูทะเบียนลูกค้า' },
    { cap: 'customers:edit', tier: 2, label: 'เพิ่ม/แก้ลูกค้า' },
    { cap: 'customers:delete', tier: 3, label: 'ลบลูกค้า' },
  ] },
  { key: 'products', name: 'สินค้า', icon: 'Package', caps: [
    { cap: 'products:view', tier: 1, label: 'ดูทะเบียนสินค้า' },
    { cap: 'products:cost', tier: 1, label: 'เห็นราคาผลิต (ไม่เห็นโครงสร้างต้นทุน)' },
    { cap: 'products:edit', tier: 2, label: 'เพิ่ม/แก้สินค้า · เห็นราคาผลิต' },
    { cap: 'products:margin', tier: 3, label: 'เห็นโครงสร้างต้นทุน + กำไรโรงงาน' },
    { cap: 'products:delete', tier: 3, label: 'ลบสินค้า' },
  ] },
  { key: 'registry', name: 'กลิ่น/สูตร', icon: 'FlaskConical', caps: [
    { cap: 'registry:delete', tier: 3, label: 'ลบกลิ่น/สูตรได้ทุกสถานะ', scope: 'ต้องไม่มีใครอ้างอยู่' },
  ] },
  { key: 'salesplan', name: 'งานขาย', icon: 'Handshake', caps: [
    { cap: 'salesplan:view', tier: 1, label: 'ดูดีล · ใบเสนอราคา · ใบสั่งขาย' },
    { cap: 'salesplan:lead', tier: 2, label: 'กรอก/แก้ลีด' },
    { cap: 'salesplan:edit', tier: 2, label: 'เปิด/แก้ดีลและเอกสารขาย' },
    { cap: 'salesplan:review', tier: 3, label: 'ทบทวน Forecast' },
    { cap: 'salesplan:target', tier: 3, label: 'วางเป้ายอดขาย' },
  ] },
  { key: 'pm', name: 'โครงการ', icon: 'FolderKanban', caps: [
    { cap: 'pm:view', tier: 1, label: 'ดูโครงการ' },
    { cap: 'pm:edit', tier: 2, label: 'แก้แผนโครงการ' },
  ] },
  { key: 'costing', name: 'ขอราคาผลิต', icon: 'Calculator', caps: [
    { cap: 'costing:view', tier: 1, label: 'ดูใบขอราคาผลิต (ต้นทุนเต็มใบ)' },
    { cap: 'costing:edit', tier: 2, label: 'ประกอบ/แก้ใบขอราคาผลิต' },
    { cap: 'costing:quote', tier: 2, label: 'เติมราคาของฝ่ายตัวเอง', scope: 'เฉพาะฝ่ายที่เป็นแหล่งราคา (RD · PC)' },
    { cap: 'costing:approve', tier: 3, label: 'อนุมัติราคาผลิต' },
  ] },
  { key: 'requests', name: 'คำร้อง', icon: 'MessageCircleQuestion', caps: [
    { cap: 'requests:answer', tier: 2, label: 'รับ/ตอบคำร้อง', scope: 'เฉพาะคำร้องถึงฝ่ายตัวเอง' },
  ] },
  { key: 'payments', name: 'การเงิน', icon: 'Wallet', caps: [
    { cap: 'payments:confirm', tier: 3, label: 'คอนเฟิร์มงวดชำระ', scope: 'เฉพาะฝ่าย FN' },
  ] },
  { key: 'tax', name: 'ภาษีสรรพสามิต', icon: 'Landmark', caps: [
    { cap: 'history:view', tier: 1, label: 'เห็นข้อมูลภาษีบนหน้าสินค้า/ลูกค้า' },
    { cap: 'tax:module', tier: 1, label: 'เข้าระบบภาษีสรรพสามิต' },
    { cap: 'ra:view', tier: 1, label: 'ดูสถานะภาษีทุกทีม' },
    { cap: 'sales:view', tier: 1, label: 'ดูใบยื่นชำระภาษี' },
    { cap: 'sales:act', tier: 2, label: 'สร้าง/ดำเนินการใบยื่นชำระภาษี' },
    { cap: 'sales:delete', tier: 3, label: 'ลบใบยื่นชำระภาษี', scope: 'ตามขอบเขตทีม' },
    { cap: 'ra:approve', tier: 3, label: 'อนุมัติทะเบียน/ยื่นกรม' },
  ] },
  { key: 'production', name: 'ผลิต', icon: 'Hammer', caps: [
    { cap: 'production:view', tier: 1, label: 'ดูตารางผลิต' },
    { cap: 'production:edit', tier: 2, label: 'วางคิวผลิต', scope: 'เฉพาะฝ่ายวางคิว' },
  ] },
  { key: 'service', name: 'บริการ', icon: 'Wrench', caps: [
    { cap: 'service:view', tier: 1, label: 'ดูไซต์ · โซน · เครื่อง' },
    { cap: 'service:work', tier: 2, label: 'ปิดงานที่ได้รับมอบหมาย' },
    { cap: 'service:edit', tier: 3, label: 'จัดคิว · แก้ทะเบียนบริการ', scope: 'ด่านฝ่าย TS อีกชั้น' },
  ] },
  { key: 'sahamit', name: 'สหมิตร', icon: 'ChartLine', caps: [
    { cap: 'sahamit:view', tier: 1, label: 'ดูพยากรณ์/PO สหมิตร', scope: 'เฉพาะทีม KA (+ หัวหน้าฝ่ายขาย · แอดมิน)' },
    { cap: 'sahamit:edit', tier: 2, label: 'แก้พยากรณ์/PO สหมิตร', scope: 'เฉพาะทีม KA (+ หัวหน้าฝ่ายขาย · แอดมิน)' },
  ] },
  { key: 'mgmt', name: 'งานบริหาร', icon: 'Briefcase', caps: [
    { cap: 'mgmt:view', tier: 1, label: 'เข้าดูงานบริหาร' },
    { cap: 'mgmt:edit', tier: 2, label: 'เพิ่ม/แก้งานบริหาร' },
  ] },
  { key: 'admin', name: 'ผู้ดูแลระบบ', icon: 'Shield', caps: [
    { cap: 'users:view', tier: 1, label: 'ดูรายชื่อผู้ใช้และสิทธิ์' },
    { cap: 'audit:view', tier: 1, label: 'ดูบันทึกการใช้งาน' },
    { cap: 'team:manage', tier: 2, label: 'จัดทีม', scope: 'เฉพาะฝ่ายตัวเอง' },
    { cap: 'users:manage', tier: 3, label: 'เพิ่ม/แก้/ปิดบัญชีผู้ใช้ · ให้สิทธิ์เสริม' },
    { cap: 'master:manage', tier: 3, label: 'แก้ข้อมูลหลัก/ตั้งค่ากลาง' },
  ] },
]);

/** cap ที่ทุกคนที่ล็อกอินได้เสมอ — ไม่อยู่ในตาราง (ไม่ใช่ความต่างระหว่างตำแหน่ง) */
export const EVERYONE_CAP_NOTE = 'ทุกตำแหน่งแจ้งปัญหาระบบได้เสมอ';

const BY_CAP = new Map(CAPABILITY_MODULES.flatMap((m) => m.caps.map((c) => [c.cap, { ...c, module: m }])));

export const catalogCaps = () => [...BY_CAP.keys()];
export const capInfo = (cap) => BY_CAP.get(cap) || null;
export const capCatalogLabel = (cap) => BY_CAP.get(cap)?.label || cap;

/** ระบบนี้ปิดอยู่ทั้งระบบไหม (CLOSED_MODULES) */
export const moduleClosed = (module) => isModuleClosed(module?.key);

/** ระดับสูงสุดที่ชุด cap นี้มีในระบบหนึ่ง — 0 = ไม่มีเลย */
export function moduleLevel(caps, module) {
  const held = caps instanceof Set ? caps : new Set(caps || []);
  return (module?.caps || []).reduce((lv, c) => (held.has(c.cap) ? Math.max(lv, c.tier) : lv), 0);
}
