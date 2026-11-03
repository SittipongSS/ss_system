import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lockedOut } from "../../proxy.js";
import { can } from "../permissions.js";
import { notificationHref } from "../notificationTargets.js";

/* ── ปิดระบบภาษีสรรพสามิต (/tax) จากฝ่ายขาย — PR6b-2 (แผนรื้อสรรพสามิต หมวด 12.6 · มติเจ้าของ 02/11 V13) ──
   เข้า /tax ได้ = RA + แอดมิน + ผู้ดู (cap `tax:module`) · ฝ่ายขายทุกตำแหน่ง (รวม AE Sup / CM / CD) ไม่เห็นการ์ด/เมนู เปิดหน้าไม่ได้
   ⚠️ `history:view` ยังอยู่กับฝ่ายขาย — เปิดข้อมูลภาษีบนหน้าสินค้า/ลูกค้า (แผงทะเบียน · ป้ายสถานะ) ตามเดิม */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const SALES = ["ae", "ac", "senior_ae", "senior_ac", "ac_supervisor", "ae_supervisor", "commercial_director", "commercial_manager"];
const TAX = ["ra", "viewer", "executive"];

test("cap tax:module: RA + แอดมิน + ผู้ดูเท่านั้น · ฝ่ายขายไม่มี แต่ยังถือ history:view (ข้อมูลภาษีบนหน้าฝ่ายขาย)", () => {
  for (const role of [...TAX, "admin"]) assert.equal(can(role, "tax:module"), true, role);
  for (const role of SALES) {
    assert.equal(can(role, "tax:module"), false, `${role} ต้องไม่เข้า /tax`);
    assert.equal(can(role, "history:view"), true, `${role} ยังต้องเห็นข้อมูลภาษีบนหน้าสินค้า/ลูกค้า`);
  }
  for (const role of ["finance", "rd", "pc", "ts", "marketing", "secretary"]) assert.equal(can(role, "tax:module"), false, role);
});

test("proxy: หน้า /tax/* เปิดได้เฉพาะคนถือ tax:module · ฝ่ายขายพิมพ์ URL เองก็ถูกเด้ง · API อ่านของหน้าฝ่ายขายยังเปิด", () => {
  for (const path of ["/tax", "/tax/registrations", "/tax/registrations/REG-1", "/tax/filings", "/tax/filings?start=excise:SX1"]) {
    for (const role of TAX) assert.equal(lockedOut({ role, extraCaps: [] }, path.split("?")[0], "GET", false), false, `${role} ${path}`);
    for (const role of SALES) assert.equal(lockedOut({ role, extraCaps: [] }, path.split("?")[0], "GET", false), true, `${role} ${path}`);
  }
  // แผงทะเบียน/หน้า SO ของฝ่ายขายยังอ่าน API เหล่านี้ได้
  for (const path of ["/api/excise-registrations/REG-1", "/api/excise-registrations/REG-1/requirements", "/api/tax/orders/from-sales-order"]) {
    assert.equal(lockedOut({ role: "ae", extraCaps: [] }, path, "GET", true), false, path);
  }
  // ไม่ไปกระทบหน้าอื่นที่ขึ้นต้นคล้ายกัน
  assert.equal(lockedOut({ role: "ae", extraCaps: [] }, "/taxonomy", "GET", false), true, "ไม่ใช่หน้าในระบบ (default-deny ตามเดิม)");
});

test("เมนู/การ์ด/ป้ายของ /tax ตามสิทธิ์ tax:module (ไม่ใช่ history:view)", () => {
  const systems = read("../../config/systems.js");
  assert.match(systems, /key: 'tax',[\s\S]*?isVisible: \(user\) => canUser\(user, 'tax:module'\),/);
  const menu = read("../../config/menuRegistry.js");
  const taxBlock = menu.slice(menu.indexOf("system: 'tax',"), menu.indexOf("system: 'tax',") + 900);
  assert.equal((taxBlock.match(/cap: 'tax:module'/g) || []).length, 3);
  assert.doesNotMatch(taxBlock, /cap: 'history:view'/);
  assert.match(read("../../app/api/nav/counts/route.js"), /if \(can\(user\.role, 'tax:module'\)\) \{\s*jobs\.push\(attempt\('taxRegistrations'/);
  assert.match(read("../nav/countScope.js"), /function taxScope\(user, trackKey\) \{\s*if \(!can\(user\?\.role, 'tax:module'\)\) return null;/);
});

test("ลิงก์ทะเบียน/บันทึกการยื่นจากหน้าฝ่ายขาย + แจ้งเตือน → ทางกลาง /go ที่พาไปตามสิทธิ์", () => {
  assert.equal(notificationHref("excise_registration", "REG-1"), "/go/registration/REG-1");
  assert.equal(notificationHref("excise_order", "TAX-1"), "/go/filing/TAX-1");
  const reg = read("../../app/go/registration/[id]/page.js");
  assert.match(reg, /if \(canUser\(user, 'tax:module'\)\) redirect\(`\/tax\/registrations\/\$\{encodeURIComponent\(id\)\}`\);/);
  assert.match(reg, /redirect\(`\/database\/products\/\$\{encodeURIComponent\(data\.productId\)\}\?registration=\$\{encodeURIComponent\(data\.id\)\}`\);/);
  const filing = read("../../app/go/filing/[id]/page.js");
  assert.match(filing, /if \(canUser\(user, 'tax:module'\)\) redirect\(`\/tax\/filings\/\$\{encodeURIComponent\(id\)\}`\);/);
  assert.match(filing, /redirect\(`\/sa\/sales-orders\/\$\{encodeURIComponent\(data\.salesOrderId\)\}`\);/);
  // หน้าสินค้าเปิดแผงจาก ?registration=
  assert.match(read("../../app/database/products/[id]/page.js"), /new URLSearchParams\(window\.location\.search\)\.get\("registration"\)/);
  // ไม่มีลิงก์ตรงเข้า /tax เหลือบนหน้าฝ่ายขาย
  for (const path of [
    "../../app/database/products/[id]/page.js", "../../app/database/customers/[id]/page.js", "../../app/sa/projects/[id]/page.js",
    "../../app/sales-planning/deals/[id]/page.js", "../salesPlanningLifecycle.js", "../sales/salesOrderWorkTrack.js",
  ]) {
    const src = read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.doesNotMatch(src, /[`'"]\/tax\/(registrations|filings)/, `${path} ต้องไม่ลิงก์ตรงเข้า /tax`);
  }
});
