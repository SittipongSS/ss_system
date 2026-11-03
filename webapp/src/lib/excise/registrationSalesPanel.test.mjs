import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apiWriteAllowed, lockedOut } from "../../proxy.js";

/* ── ทะเบียนสรรพสามิต PR6b-1 (แผนรื้อสรรพสามิต หมวด 12.6 · มติเจ้าของ 02/11 V8 · V14 · V15) ──
   ฝ่ายขายทำงานทะเบียนจากแผงบนหน้าสินค้า/หน้า SO (ไม่พาไป /tax) · RA สร้างทะเบียนเองได้ ใบเข้าคิว RA ทันที */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("proxy: สร้างทะเบียน = SA (products:edit) หรือ RA (ra:approve) · ฝ่ายอื่นไม่ได้", () => {
  for (const role of ["ae", "ac", "senior_ae", "ae_supervisor", "ra", "admin"]) {
    const open = !lockedOut({ role, extraCaps: [] }, "/api/excise-registrations", "POST", true)
      && apiWriteAllowed("POST", "/api/excise-registrations", role, []);
    assert.equal(open, true, `${role} ต้องสร้างทะเบียนได้`);
  }
  for (const role of ["viewer", "executive", "rd", "pc", "wh", "fn", "marketing"]) {
    assert.equal(apiWriteAllowed("POST", "/api/excise-registrations", role, []), false, `${role} ต้องสร้างไม่ได้`);
  }
  // from-project ยังเป็นงานฝ่ายขาย — route ตรวจ products:edit เอง (RA ผ่าน proxy แต่ไปไม่ถึง)
  assert.match(code("../../app/api/excise-registrations/from-project/route.js"), /can\(user\.role, 'products:edit'\)|can\(user\?\.role, 'products:edit'\)/);
});

test("V15: RA สร้างเอง = เข้าคิว RA ทันที (pending_legal · metadata.source = 'ra') · แอดมิน/ฝ่ายขาย = ร่างตามเดิม", () => {
  const route = code("../../app/api/excise-registrations/route.js");
  assert.match(route, /const raCreated = can\(user\?\.role, 'ra:approve'\) && !can\(user\?\.role, 'products:edit'\);/);
  assert.match(route, /status: raCreated \? 'pending_legal' : 'draft',/);
  assert.match(route, /\.\.\.\(raCreated \? \{ source: 'ra' \} : \{\}\),/);
});

test("V15: ใบที่ RA สร้างเองตรวจเอกสารครบตอนอนุมัติ (ตัวตรวจเดียวกับด่านยื่น) · ใบทางฝ่ายขายไม่ตรวจซ้ำ", () => {
  const route = code("../../app/api/excise-registrations/[id]/route.js");
  assert.match(route, /if \(allowed\.has\('status'\) && body\.status === 'approved' && reg\.metadata\?\.source === 'ra'\) \{\s*let requirements;\s*try \{\s*requirements = await registrationRequirements\(supabase, id\);/);
  assert.match(route, /ทะเบียนที่ RA สร้างเองต้องมีเอกสารครบก่อนอนุมัติ/);
  assert.ok(route.indexOf("reg.metadata?.source === 'ra'") < route.indexOf("updated.approvedAt = new Date().toISOString();"),
    "ด่านต้องมาก่อนประทับการอนุมัติ");
});

test("V14: หน้าสินค้า + หน้า SO เปิดแผงทะเบียนตัวเดียวกัน · ไม่มีลิงก์ทะเบียนเข้า /tax จากสองหน้านี้", () => {
  const product = code("../../app/database/products/[id]/page.js");
  const salesOrder = code("../../app/sales-planning/sales-orders/[id]/page.js");
  for (const [name, src] of [["หน้าสินค้า", product], ["หน้า SO", salesOrder]]) {
    assert.match(src, /import RegistrationWorkModal from "@\/components\/excise\/RegistrationWorkModal";/, name);
    assert.match(src, /<RegistrationWorkModal\s/, name);
    assert.doesNotMatch(src, /\/tax\/registrations/, `${name} ต้องไม่ลิงก์เข้า /tax/registrations แล้ว`);
  }
  assert.doesNotMatch(product, /router\.push\(`\/tax\//, "สร้างคำขอแล้วไม่พาออกไป /tax");
  assert.match(salesOrder, /onOpenRegistration: \(line\) => setRegPanel\(\{ key: line\?\.productId \|\| line\?\.fgCode \|\| null \}\),/);
});

test("แผงทะเบียน: ข้อมูล/ด่านชุดเดียวกับหน้าทะเบียนของ RA — GET full · requirements · POST สร้าง · PATCH ยื่น · ไฟล์แนบของทะเบียน + ลูกค้า", () => {
  const panel = code("../../components/excise/RegistrationWorkModal.js");
  assert.match(panel, /`\/api\/excise-registrations\/\$\{encodeURIComponent\(registrationId\)\}\?full=1`/);
  assert.match(panel, /`\/api\/excise-registrations\/\$\{encodeURIComponent\(registrationId\)\}\/requirements`/);
  assert.match(panel, /apiJson\("\/api\/excise-registrations", \{\s*method: "POST",\s*json: \{ productId: item\.productId, customerId: item\.customerId \},/);
  assert.match(panel, /method: "PATCH", json: \{ status: "pending_legal" \}/);
  assert.match(panel, /entityType="registration"/);
  assert.match(panel, /entityType="customer"/);
  // ปุ่มยื่นติดด่าน = โชว์แล้วบอกเหตุ (ไม่ซ่อน)
  assert.match(panel, /disabled=\{!!busy \|\| !!submitBlocker\}/);
  assert.match(panel, /\{submitBlocker \? <small className=\{styles\.reason\}>\{submitBlocker\}<\/small> : null\}/);
  assert.doesNotMatch(panel, /href=\{?["`]\/tax\//, "แผงฝั่งขายไม่ลิงก์เข้า /tax");
});

test("หน้า /tax/registrations: ปุ่มสร้างตามสิทธิ์สร้าง (SA หรือ RA)", () => {
  const page = code("../../app/tax/registrations/page.js");
  assert.match(page, /const canCreate = canEdit \|\| canApproveRegistrations;/);
  assert.match(page, /\{canCreate && \(\s*<button className="btn btn-primary flex items-center gap-1\.5" onClick=\{openForm\}>/);
});
