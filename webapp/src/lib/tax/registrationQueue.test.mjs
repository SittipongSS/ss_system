import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AGE_LATE_DAYS, LATE_REGISTRATIONS_HREF, ageAnchor, ageInDays, ageLabel, ageTone, hasFactoryFacts,
  isLateRegistration, lateRegistrations, registrationAge, registrationProductFacts, wantsLateOnly,
} from "./registrationQueue.js";
import { EXCISE_VAT_RATE } from "./exciseBilling.js";
import { PERIODS, withinPeriod } from "./period.js";

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

/* ── H2 รอบสอง (มติเจ้าของ 19/10/2026): แถบค้างนานไม่สนตัวเลือกช่วงเวลา ──────────────
   🐞 เลือก "เดือนนี้/ไตรมาสนี้" แล้วแถบนับเฉพาะใบที่ **สร้าง** ในช่วงนั้น แต่คิวที่ `?late=1` เปิด
      ไม่มีช่วงเวลา ⇒ แถบบอก 1 ใบ กดไปเจอ 3 ใบ · ใบที่ค้างนานจริงคือใบที่สร้างก่อนช่วงอยู่แล้ว */
const PERIOD_TODAY = "2026-10-19";   // ไตรมาส 4 · เดือน ต.ค.
const PERIOD_ROWS = [
  // ค้างนาน — สร้างก่อนทั้งเดือนและไตรมาสนี้
  { id: "late-june", status: "pending_legal", createdAt: "2026-06-10T02:00:00Z", updatedAt: "2026-08-30T02:00:00Z" },
  // ค้างนาน — สร้างไตรมาสก่อน (ก.ย.)
  { id: "late-sep", status: "pending_legal", createdAt: "2026-09-05T02:00:00Z", updatedAt: "2026-09-20T02:00:00Z" },
  // ค้างนาน — สร้างเดือนนี้ (ขอบเวลาไทย: 1 ต.ค. 02:00 ไทย = 30 ก.ย. ตาม UTC)
  { id: "late-oct", status: "pending_legal", createdAt: "2026-09-30T19:00:00Z", updatedAt: "2026-10-05T02:00:00Z" },
  // ไม่ค้าง: ยื่นสี่วันก่อน · ใบเก่าที่ถูกตีกลับแล้วส่งกลับมาเมื่อวานซืน (อายุนับจากรอบล่าสุด)
  { id: "fresh-oct", status: "pending_legal", createdAt: "2026-10-15T02:00:00Z", updatedAt: "2026-10-15T02:00:00Z" },
  { id: "resubmitted", status: "pending_legal", createdAt: "2026-05-01T02:00:00Z", updatedAt: "2026-10-17T02:00:00Z" },
  // สถานะอื่นไม่เข้าคิวค้าง ไม่ว่าเก่าแค่ไหน
  { id: "old-draft", status: "draft", createdAt: "2026-01-01T02:00:00Z" },
  { id: "old-approved", status: "approved", createdAt: "2026-01-01T02:00:00Z", approvedAt: "2026-02-01T02:00:00Z" },
];

/** แถวที่หน้า /tax/registrations เหลือเมื่อเปิดจากลิงก์ของแถบ — ตัวกรองสองชั้นเดียวกับจอ (สถานะ + อายุ · ไม่มีช่วงเวลา) */
function openedByLateLink(rows, todayIso) {
  const url = new URL(LATE_REGISTRATIONS_HREF, "http://x");
  const status = url.searchParams.get("status");
  const lateOnly = wantsLateOnly(url.searchParams);
  return rows.filter((r) => r.status === status && (!lateOnly || isLateRegistration(r, todayIso)));
}

/* สองตัวเลขค้างนานของหน้า /tax ต่อหนึ่งตัวเลือกช่วง — ตรงกับสองบรรทัดใน app/tax/page.js
   (ยามซอร์สข้างล่างตรึงบรรทัดนั้นไว้): แถบ = ทั้งกอง · hint การ์ด "รออนุมัติ" = ชุดที่ตัดช่วงแล้ว */
function dashboardLate(rawRegs, range, todayIso) {
  const regs = rawRegs.filter((r) => withinPeriod(r.createdAt, range, todayIso));
  return {
    bar: lateRegistrations(rawRegs, todayIso),
    hint: lateRegistrations(regs, todayIso),
    pendingKpi: regs.filter((r) => r.status === "pending_legal").length,
  };
}

test("H2 มติ 19/10: แถบนับทั้งกอง ⇒ เลขบนแถบ = แถวที่คิวเปิดได้ ทุกตัวเลือกช่วงเวลา", () => {
  const opened = openedByLateLink(PERIOD_ROWS, PERIOD_TODAY);
  assert.deepEqual(opened.map((r) => r.id), ["late-june", "late-sep", "late-oct"]);
  assert.deepEqual(PERIODS.map((p) => p.key), ["all", "month", "quarter"]);
  for (const { key } of PERIODS) {
    const { bar, hint, pendingKpi } = dashboardLate(PERIOD_ROWS, key, PERIOD_TODAY);
    assert.equal(bar.length, opened.length, `ช่วง ${key}: เลขบนแถบต้องเท่าแถวที่เปิดได้`);
    assert.deepEqual(new Set(bar.map((x) => x.row.id)), new Set(opened.map((r) => r.id)), `ช่วง ${key}: ใบชุดเดียวกัน`);
    // hint ยังเป็นส่วนย่อยของเลขบนการ์ดตามช่วง (KPI ตามช่วงไม่แตะ) — ไม่มีวัน "รออนุมัติ 1 · ค้างเกิน 3"
    assert.ok(hint.length <= pendingKpi, `ช่วง ${key}: hint ต้องไม่เกินเลขบนการ์ด`);
  }
  // ใบที่ค้างนานที่สุดบนแถบคือใบที่สร้างก่อนทุกช่วง — ตัดช่วงก่อนนับเมื่อไรใบนี้หายก่อนเพื่อน
  assert.equal(dashboardLate(PERIOD_ROWS, "month", PERIOD_TODAY).bar[0].row.id, "late-june");
});

test("H2 มติ 19/10: นับหลังตัดช่วง (ทางเดิมของแถบ) ได้เลขต่ำกว่าแถวที่เปิดได้ — ห้ามกลับไปทางนั้น", () => {
  const opened = openedByLateLink(PERIOD_ROWS, PERIOD_TODAY);
  const scoped = (range) => dashboardLate(PERIOD_ROWS, range, PERIOD_TODAY).hint.map((x) => x.row.id);
  assert.equal(scoped("all").length, opened.length);
  // 🐞 ของเดิม: "เดือนนี้" แถบบอก 1 ใบ · "ไตรมาสนี้" ก็ 1 ใบ (ก.ย. อยู่ไตรมาส 3) แต่กดไปเจอ 3 ใบ
  // (late-oct นับเป็นเดือนนี้เพราะตัดเดือนด้วยวันไทย ไม่ใช่วัน UTC)
  assert.deepEqual(scoped("month"), ["late-oct"]);
  assert.deepEqual(scoped("quarter"), ["late-oct"]);
});

test("H2 มติ 19/10: จอนับแถบจากทั้งกอง (rawRegs) · hint การ์ด 'รออนุมัติ' ยังนับตามช่วง · ชุดเดียวกับที่คิวโหลด", () => {
  const dash = readFileSync(new URL("../../app/tax/page.js", import.meta.url), "utf8");
  // แถบ: ทั้งกอง ไม่ใช่ `regs` ที่ตัดช่วงแล้ว
  assert.match(dash, /const late = useMemo\(\(\) => lateRegistrations\(rawRegs, todayIso\), \[rawRegs, todayIso\]\);/);
  assert.match(dash, /\{late\.length > 0 && \(/);
  assert.match(dash, /ทะเบียนค้างรออนุมัติเกิน \{AGE_LATE_DAYS\} วัน · \{late\.length\} ใบ/);
  // KPI ตามช่วงไม่แตะ — hint/โทนของการ์ด "รออนุมัติ" เป็นส่วนย่อยของเลขบนการ์ดนั้น
  assert.match(dash, /const lateInPeriod = useMemo\(\(\) => lateRegistrations\(regs, todayIso\), \[regs, todayIso\]\);/);
  assert.match(dash, /hint=\{lateInPeriod\.length \? `ค้างเกิน \$\{AGE_LATE_DAYS\} วัน \$\{lateInPeriod\.length\} ใบ` : undefined\}/);
  assert.match(dash, /tone=\{lateInPeriod\.length \? "danger" : "warning"\}/);
  // เลือกช่วงอื่นอยู่ แถบต้องบอกว่าไม่ขึ้นกับช่วง ไม่งั้นเลขบนแถบกับ hint ดูขัดกันเอง
  assert.match(dash, /\{timeRange !== "all" && " · นับทุกใบที่ค้าง ไม่ขึ้นกับช่วงเวลาที่เลือก"\}/);
  // ฐานเดียวกัน: ภาพรวมกับคิวยิง endpoint เดียวกัน และไม่มีใครส่งช่วงเวลาไป server (ตัดช่วงที่จอเท่านั้น)
  const queue = readFileSync(new URL("../../app/tax/registrations/page.js", import.meta.url), "utf8");
  const regsUrl = (src) => src.match(/useApiList\("(\/api\/excise-registrations[^"]*)"\)/)?.[1];
  assert.equal(regsUrl(dash), "/api/excise-registrations?slim=1");
  assert.equal(regsUrl(queue), "/api/excise-registrations?view=queue");
  const route = readFileSync(new URL("../../app/api/excise-registrations/route.js", import.meta.url), "utf8");
  const getHandler = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
  assert.deepEqual([...getHandler.matchAll(/params\.get\('([^']+)'\)/g)].map((m) => m[1]).sort(), ["slim", "view"],
    "GET ทะเบียนรับแค่ slim/view — ถ้าเพิ่มตัวกรองช่วงเวลาฝั่ง server เมื่อไร แถบกับคิวอาจได้คนละกอง");
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
