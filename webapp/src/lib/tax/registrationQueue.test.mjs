import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AGE_LATE_DAYS, LATE_REGISTRATIONS_HREF, ageAnchor, ageInDays, ageLabel, ageTone, hasFactoryFacts,
  isLateRegistration, lateRegistrations, registrationAge, registrationProductFacts, wantsLateOnly,
} from "./registrationQueue.js";
import { EXCISE_VAT_RATE } from "./exciseBilling.js";

test("อายุงานนับเป็นวันเต็มจากวันไทยที่ส่งเข้ามา", () => {
  assert.equal(ageInDays("2026-08-01", "2026-08-28"), 27);
  assert.equal(ageInDays("2026-08-28T23:59:00+07:00", "2026-08-28"), 0);
  // timestamp เต็มก็ตัดเอาเฉพาะวัน — ไม่ปัดเศษชั่วโมงจนได้ครึ่งวัน
  assert.equal(ageInDays("2026-07-24T11:35:55.537+00:00", "2026-08-28"), 35);
});

test("ข้อมูลไม่ครบต้องได้ null ไม่ใช่ 0 — 0 แปลว่า 'เพิ่งยื่นวันนี้' ซึ่งโกหก", () => {
  assert.equal(ageInDays(null, "2026-08-28"), null);
  assert.equal(ageInDays("2026-08-01", null), null);
  assert.equal(ageInDays("ไม่ใช่วันที่", "2026-08-28"), null);
});

test("วันในอนาคตไม่ติดลบ — นาฬิกาเครื่องคนกรอกเร็วไปไม่ควรกลายเป็นอายุติดลบ", () => {
  assert.equal(ageInDays("2026-09-01", "2026-08-28"), 0);
});

test("โทนของอายุงานไล่ตามเกณฑ์", () => {
  assert.equal(ageTone(0), "neutral");
  assert.equal(ageTone(3), "neutral");
  assert.equal(ageTone(4), "warning");
  assert.equal(ageTone(7), "warning");
  assert.equal(ageTone(8), "danger");
  assert.equal(ageTone(null), "neutral");
});

test("ป้ายอายุอ่านรู้เรื่องโดยไม่ต้องคิดเลขเอง", () => {
  assert.equal(ageLabel(0), "วันนี้");
  assert.equal(ageLabel(1), "1 วัน");
  assert.equal(ageLabel(34), "34 วัน");
  assert.equal(ageLabel(null), null);
});

/* ⭐ ใบที่ถูกตีกลับแล้วส่งกลับมาใหม่ต้องนับอายุจาก **รอบล่าสุด** ไม่ใช่วันเปิดใบ
   ไม่งั้นใบที่ฝ่ายขายเพิ่งแก้เสร็จเมื่อวานจะโชว์ว่าค้างมาสามสัปดาห์ แล้วตัวเลข
   "ค้างนาน" บนหน้าภาพรวมจะไม่มีใครเชื่อ */
test("อายุนับจากจุดที่สถานะปัจจุบันเริ่ม ไม่ใช่วันเปิดใบ", () => {
  const reg = { status: "pending_legal", createdAt: "2026-08-01", updatedAt: "2026-08-26" };
  assert.equal(ageAnchor(reg), "2026-08-26");
  assert.equal(registrationAge(reg, "2026-08-28"), 2);

  // ฉบับร่างยังไม่เคยยื่น — จุดเริ่มคือวันเปิดใบจริง ๆ
  const draft = { status: "draft", createdAt: "2026-08-01", updatedAt: "2026-08-26" };
  assert.equal(ageAnchor(draft), "2026-08-01");

  // อนุมัติแล้วมีจุดเวลาของตัวเอง
  const done = { status: "approved", approvedAt: "2026-08-20", updatedAt: "2026-08-27" };
  assert.equal(ageAnchor(done), "2026-08-20");
});

test("ค้างนาน = เฉพาะใบที่รอฝ่าย RA และเรียงเก่าสุดขึ้นก่อน", () => {
  const rows = [
    { id: "a", status: "pending_legal", updatedAt: "2026-08-27" },  // 1 วัน
    { id: "b", status: "pending_legal", updatedAt: "2026-07-25" },  // 34 วัน
    { id: "c", status: "pending_legal", updatedAt: "2026-08-01" },  // 27 วัน
    { id: "d", status: "draft", createdAt: "2026-01-01" },          // ร่างค้างเป็นเรื่องของฝ่ายขาย
    { id: "e", status: "approved", approvedAt: "2026-01-01" },      // จบงานแล้ว
  ];
  const late = lateRegistrations(rows, "2026-08-28");
  assert.deepEqual(late.map((x) => x.row.id), ["b", "c"]);
  assert.equal(late[0].days, 34);
  assert.ok(AGE_LATE_DAYS > 0);
});

test("ไม่มีแถวก็ต้องไม่ระเบิด", () => {
  assert.deepEqual(lateRegistrations([], "2026-08-28"), []);
  assert.deepEqual(lateRegistrations(undefined, "2026-08-28"), []);
});

/* ── H2 (ตรวจตัวเลข 2026-10-08): แถบ "ค้างรออนุมัติเกิน 8 วัน · 9 ใบ" เปิดคิวรออนุมัติทั้งหมด 17 ใบ ── */
test("H2: เลขบนแถบค้างนาน = แถวที่คิวเหลือเมื่อเปิดจากลิงก์ของแถบ", () => {
  const today = "2026-08-28";
  const rows = [
    { id: "late-34", status: "pending_legal", updatedAt: "2026-07-25" },
    { id: "late-8", status: "pending_legal", updatedAt: "2026-08-20" },   // ขอบพอดี 8 วัน = นับ
    { id: "fresh-7", status: "pending_legal", updatedAt: "2026-08-21" },  // 7 วัน = ยังไม่ค้าง
    { id: "fresh-0", status: "pending_legal", updatedAt: "2026-08-28" },
    { id: "old-draft", status: "draft", createdAt: "2026-01-01" },
    { id: "old-rejected", status: "rejected", updatedAt: "2026-01-01" },
  ];
  // คิวเปิดจากลิงก์: สถานะ + อายุ — ตัวกรองสองชั้นเดียวกับที่หน้า /tax/registrations ใช้
  const url = new URL(LATE_REGISTRATIONS_HREF, "http://x");
  assert.equal(url.pathname, "/tax/registrations");
  const status = url.searchParams.get("status");
  const lateOnly = wantsLateOnly(url.searchParams);
  assert.equal(status, "pending_legal");
  assert.equal(lateOnly, true);
  const opened = rows.filter((r) => r.status === status && (!lateOnly || isLateRegistration(r, today)));
  assert.deepEqual(opened.map((r) => r.id), ["late-34", "late-8"]);
  assert.equal(opened.length, lateRegistrations(rows, today).length);
  // 🐞 ของเดิมเปิดแค่ `?status=pending_legal` ⇒ ได้ 4 ใบ ไม่ใช่ 2
  assert.equal(rows.filter((r) => r.status === status).length, 4);
});

test("isLateRegistration: เฉพาะใบรอ RA · ไม่มีวันที่ = ไม่นับ (ไม่เดา)", () => {
  assert.equal(isLateRegistration({ status: "pending_legal", updatedAt: "2026-08-01" }, "2026-08-28"), true);
  assert.equal(isLateRegistration({ status: "approved", approvedAt: "2026-01-01" }, "2026-08-28"), false);
  assert.equal(isLateRegistration({ status: "pending_legal" }, "2026-08-28"), false);
  assert.equal(isLateRegistration(null, "2026-08-28"), false);
  assert.equal(wantsLateOnly(new URLSearchParams("status=pending_legal")), false);
  assert.equal(wantsLateOnly(null), false);
});

test("H2: จอใช้ลิงก์/ตัวตัดสินตัวเดียวกันนี้ (แถบบนภาพรวม · ตัวกรองในคิว · ไฟล์ที่โหลด)", () => {
  const dash = readFileSync(new URL("../../app/tax/page.js", import.meta.url), "utf8");
  assert.match(dash, /onClick=\{\(\) => router\.push\(LATE_REGISTRATIONS_HREF\)\}/);
  const queue = readFileSync(new URL("../../app/tax/registrations/page.js", import.meta.url), "utf8");
  assert.match(queue, /if \(wantsLateOnly\(params\)\) setLateOnly\(true\);/);
  assert.match(queue, /if \(lateOnly && !isLateRegistration\(r, todayIso\)\) return false;/);
  // ตัวกรองอายุไม่มีคู่ฝั่ง server ⇒ ไฟล์ต้องได้ id ของแถวที่เห็น ไม่ใช่รออนุมัติทั้งกอง
  assert.match(queue, /searching: !!search\.trim\(\) \|\| lateOnly/);
});

// ── ตัวเลขสินค้าบนคิว (ให้เท่ารายงาน) ─────────────────────────────────────
test("ราคาถอด VAT ใช้ค่าที่ทะเบียนเก็บไว้ก่อน ไม่มีถึงหารกลับ", () => {
  const stored = registrationProductFacts(
    { retailPriceIncVat: 107, retailPriceExVat: 99 }, { vatRate: EXCISE_VAT_RATE },
  );
  assert.equal(stored.retailPriceExVat, 99);

  // ไม่มีค่าเก็บไว้ → หารกลับด้วยอัตราเดียวกับที่ใบยื่นใช้ (ห้าม hardcode 1.07 ซ้ำ)
  const derived = registrationProductFacts({ retailPriceIncVat: 107 }, { vatRate: EXCISE_VAT_RATE });
  assert.equal(Math.round(derived.retailPriceExVat), 100);
});

test("สินค้าที่ยังไม่มีราคา/ขนาด ต้องได้ null ไม่ใช่ 0 หรือ NaN", () => {
  const empty = registrationProductFacts(null, { vatRate: EXCISE_VAT_RATE });
  assert.equal(empty.retailPriceIncVat, null);
  assert.equal(empty.retailPriceExVat, null);
  assert.equal(empty.volume, null);
  // 🐞 ราคา 0 = "ยังไม่มีฐานภาษี" ⇒ ถอด VAT ต้องไม่กลายเป็น 0 ที่ดูเหมือนราคาจริง
  assert.equal(registrationProductFacts({ retailPriceIncVat: 0 }, { vatRate: EXCISE_VAT_RATE }).retailPriceExVat, null);
});

test("คอลัมน์ต้นทุนหายทั้งคอลัมน์เมื่อสิทธิ์ถูกกรองออกหมด", () => {
  const { factory } = registrationProductFacts(
    { costPrice: 120, materialCost: 60, laborCost: 30, shippingCost: 10, factoryProfit: 20 },
    { vatRate: EXCISE_VAT_RATE },
  );
  assert.equal(hasFactoryFacts(factory), true);
  // เลียนแบบผลของ redactProductMargin กับคนที่ไม่มีสิทธิ์เลย — เหลือ {} ⇒ ไม่ต้องมีคอลัมน์
  assert.equal(hasFactoryFacts({}), false);
  assert.equal(hasFactoryFacts(null), false);
  // FN เห็นราคาผลิตอย่างเดียว (ไม่เห็นแจกแจง) ⇒ คอลัมน์ยังต้องขึ้น
  assert.equal(hasFactoryFacts({ costPrice: 120 }), true);
});
