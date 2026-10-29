import test from "node:test";
import assert from "node:assert/strict";
import { monthOf, quarterOf, withinPeriod } from "./period.js";

test("เดือน/ไตรมาสของวันไทย", () => {
  assert.equal(monthOf("2026-08-28"), "2026-08");
  assert.equal(quarterOf("2026-01-05"), "2026-Q1");
  assert.equal(quarterOf("2026-03-31"), "2026-Q1");
  assert.equal(quarterOf("2026-04-01"), "2026-Q2");
  assert.equal(quarterOf("2026-08-28"), "2026-Q3");
  assert.equal(quarterOf("2026-12-31"), "2026-Q4");
  assert.equal(quarterOf(null), null);
});

test("'ทั้งหมด' ไม่กรองอะไรเลย", () => {
  assert.equal(withinPeriod("2020-01-01", "all", "2026-08-28"), true);
  assert.equal(withinPeriod(null, "all", "2026-08-28"), true);
});

/* 🪤 กับดักเดิมของตัวกรองปีหน้าผู้บริหาร: แถวที่ไม่มีวันที่ถูกกลืนหายทั้งหมด
   ⇒ ตัวเลขบนจอน้อยกว่าของจริงโดยไม่มีอะไรฟ้อง */
test("แถวที่ไม่มีวันที่ต้องไม่หายจากจอ", () => {
  assert.equal(withinPeriod(null, "month", "2026-08-28"), true);
  assert.equal(withinPeriod("", "quarter", "2026-08-28"), true);
  assert.equal(withinPeriod("ไม่ใช่วันที่", "month", "2026-08-28"), true);
});

test("เดือนนี้/ไตรมาสนี้เทียบกับวันไทยที่ส่งเข้ามา", () => {
  assert.equal(withinPeriod("2026-08-01", "month", "2026-08-28"), true);
  assert.equal(withinPeriod("2026-07-31", "month", "2026-08-28"), false);
  assert.equal(withinPeriod("2026-07-31", "quarter", "2026-08-28"), true);  // Q3 = ก.ค.–ก.ย.
  assert.equal(withinPeriod("2026-06-30", "quarter", "2026-08-28"), false);
  // ปีต่างกันต้องไม่ชนกันแม้ไตรมาสเดียวกัน
  assert.equal(withinPeriod("2025-08-15", "quarter", "2026-08-28"), false);
});

/* ⭐ ของจริงที่พัง: `2026-08-01T02:00:00Z` = 1 ส.ค. **ตามเวลาไทย** (09:00 น.)
   แต่ถ้าตัดสตริงดิบจะได้ 2026-08-01 พอดี — เคสที่กัดคือฝั่งตรงข้าม:
   `2026-07-31T18:00:00Z` = 1 ส.ค. 01:00 น. ตามไทย ต้องนับเป็นเดือนสิงหาคม */
test("timestamp UTC ต้องถูกแปลงเป็นวันไทยก่อนเทียบเดือน", () => {
  assert.equal(withinPeriod("2026-07-31T18:00:00Z", "month", "2026-08-28"), true);
  // และวันสุดท้ายของเดือนตามไทยต้องไม่ถูกดันไปเดือนถัดไป
  assert.equal(withinPeriod("2026-08-31T16:59:00Z", "month", "2026-08-28"), true);
  assert.equal(withinPeriod("2026-08-31T17:00:00Z", "month", "2026-08-28"), false); // = 1 ก.ย. ไทย
});

/* ── การ์ด KPI → คิว: ช่วงเวลาต้องเดินทางไปกับลิงก์ (ตรวจตัวเลข M7 · 20/10/2026) ───────────────────────
   🐞 เลือก "เดือนนี้" แล้วการ์ด "ขึ้นทะเบียนแล้ว" บอกเลขของเดือนนี้ แต่กดแล้วคิวเปิดทุกใบตลอดกาล (ลิงก์มีแค่ ?status=)
   ⭐ ตรึงสามเรื่อง: (1) ช่วงวันของตัวเลือก = ชุดเดียวกับ withinPeriod เป๊ะ · (2) ลิงก์ไป-กลับผ่าน URL แล้วนับได้เท่าการ์ด
   (3) ตารางคิวกับไฟล์ที่โหลดใช้ตัวตัดสินตัวเดียวกัน */
import { dayParam, periodRange, taxQueueHref, withinDateRange } from "./period.js";
import { readFileSync } from "node:fs";

test("periodRange: เดือน/ไตรมาสของวันไทย รวมหัวท้าย · ทั้งหมด = null", () => {
  assert.deepEqual(periodRange("month", "2026-10-20"), { from: "2026-10-01", to: "2026-10-31" });
  assert.deepEqual(periodRange("month", "2026-09-30"), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(periodRange("month", "2028-02-10"), { from: "2028-02-01", to: "2028-02-29" }, "ปีอธิกสุรทิน");
  assert.deepEqual(periodRange("month", "2026-02-10"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(periodRange("quarter", "2026-10-20"), { from: "2026-10-01", to: "2026-12-31" });
  assert.deepEqual(periodRange("quarter", "2026-08-28"), { from: "2026-07-01", to: "2026-09-30" });
  assert.deepEqual(periodRange("quarter", "2026-01-01"), { from: "2026-01-01", to: "2026-03-31" });
  assert.equal(periodRange("all", "2026-10-20"), null);
  assert.equal(periodRange("month", null), null);
});

/* แถวทดสอบ: ขอบเดือน/ไตรมาสทั้งฝั่ง UTC และฝั่งไทย + วันล้วน + ค่าว่าง/ผิดรูป */
const BOUNDARY_VALUES = [
  "2026-09-30T16:59:59Z", // 30 ก.ย. 23:59 ไทย
  "2026-09-30T17:00:00Z", // 1 ต.ค. 00:00 ไทย
  "2026-09-30T18:00:00Z", // 1 ต.ค. 01:00 ไทย — ตัวที่ตัด 10 ตัวแรกแล้วหลุด
  "2026-10-01T00:00:00Z",
  "2026-10-15T09:00:00Z",
  "2026-10-31T16:59:00Z", // 31 ต.ค. 23:59 ไทย
  "2026-10-31T17:00:00Z", // 1 พ.ย. ไทย
  "2026-12-31T16:59:00Z", // สิ้นไตรมาส 4 ไทย
  "2026-12-31T17:00:00Z", // 1 ม.ค. 2027 ไทย
  "2026-07-01T00:00:00+07:00",
  "2026-06-30T17:00:00Z", // 1 ก.ค. ไทย
  "2026-10-01", "2026-09-30", "2025-10-15T03:00:00Z",
  null, "", "ไม่ใช่วันที่",
];

test("⭐ ช่วงวันของตัวเลือก = withinPeriod เป๊ะ (เดือน/ไตรมาส · ขอบวันไทย · แถวไม่มีวันที่)", () => {
  for (const today of ["2026-10-20", "2026-09-01", "2026-12-31", "2026-07-01"]) {
    for (const range of ["month", "quarter", "all"]) {
      const span = periodRange(range, today);
      const byPeriod = BOUNDARY_VALUES.filter((v) => withinPeriod(v, range, today));
      const byRange = BOUNDARY_VALUES.filter((v) => withinDateRange(v, span?.from || "", span?.to || ""));
      assert.deepEqual(byRange, byPeriod, `${range} @ ${today}`);
    }
  }
});

test("🔴 แถวที่สร้าง 01:00 น. ไทยของวันที่ 1 อยู่ในเดือนนั้นทั้งบนการ์ดและในคิว", () => {
  const span = periodRange("month", "2026-10-20");
  assert.equal(withinPeriod("2026-09-30T18:00:00Z", "month", "2026-10-20"), true);
  assert.equal(withinDateRange("2026-09-30T18:00:00Z", span.from, span.to), true);
  // ตัวเดิม (ตัด 10 ตัวแรก = วันตาม UTC) ทำมันหลุด — ห้ามกลับไปใช้
  assert.equal("2026-09-30T18:00:00Z".slice(0, 10) >= span.from, false);
});

test("withinDateRange: ไม่มีขอบ = ผ่าน · ขอบเดียวก็ได้ · แถวไม่มีวันที่ผ่านเสมอ (กติกาเดียวกับ withinPeriod)", () => {
  assert.equal(withinDateRange("2020-01-01", "", ""), true);
  assert.equal(withinDateRange("2026-10-05", "2026-10-01", ""), true);
  assert.equal(withinDateRange("2026-09-05", "2026-10-01", ""), false);
  assert.equal(withinDateRange("2026-10-05", "", "2026-10-04"), false);
  assert.equal(withinDateRange(null, "2026-10-01", "2026-10-31"), true);
  assert.equal(withinDateRange(undefined, "2026-10-01", "2026-10-31"), true);
});

test("taxQueueHref: ทั้งหมด = ?status= อย่างเดียว · เดือน/ไตรมาส = พาช่วงวันไปด้วย", () => {
  assert.equal(taxQueueHref("/tax/registrations", "approved", "all", "2026-10-20"), "/tax/registrations?status=approved");
  assert.equal(
    taxQueueHref("/tax/registrations", "approved", "month", "2026-10-20"),
    "/tax/registrations?status=approved&from=2026-10-01&to=2026-10-31",
  );
  assert.equal(
    taxQueueHref("/tax/filings", "pending", "quarter", "2026-08-28"),
    "/tax/filings?status=pending&from=2026-07-01&to=2026-09-30",
  );
});

test("dayParam: รับเฉพาะ YYYY-MM-DD — ลิงก์พิมพ์ผิดต้องไม่กลายเป็นตัวกรองที่ทำให้คิวว่าง", () => {
  assert.equal(dayParam("2026-10-01"), "2026-10-01");
  assert.equal(dayParam("2026-10-1"), "");
  assert.equal(dayParam("bogus"), "");
  assert.equal(dayParam(null), "");
});

/* ⭐ ไป-กลับ: การ์ดนับ (สถานะ × ช่วง) → ลิงก์ → URL → ช่องจาก–ถึงของคิว → ตารางกรอง ⇒ ต้องได้เท่าการ์ด */
test("⭐ ไป-กลับ: เลขบนการ์ด = แถวในคิวหลังกด (ทุกสถานะ × ทุกช่วง)", () => {
  const today = "2026-10-20";
  const rows = BOUNDARY_VALUES.flatMap((createdAt, i) => [
    { id: `a${i}`, status: "approved", createdAt },
    { id: `p${i}`, status: "pending_legal", createdAt },
  ]);
  for (const range of ["all", "month", "quarter"]) {
    for (const status of ["approved", "pending_legal"]) {
      // ฝั่งการ์ด (หน้า /tax): ตัดตามช่วงแล้วนับสถานะ
      const card = rows.filter((r) => withinPeriod(r.createdAt, range, today)).filter((r) => r.status === status).length;
      // ฝั่งคิว: อ่าน URL แบบเดียวกับ effect ตอนเปิดหน้า แล้วกรองแบบเดียวกับ `rows` ของตาราง
      const url = new URL(taxQueueHref("/tax/registrations", status, range, today), "https://x.test");
      const from = dayParam(url.searchParams.get("from"));
      const to = dayParam(url.searchParams.get("to"));
      const queue = rows
        .filter((r) => r.status === url.searchParams.get("status"))
        .filter((r) => withinDateRange(r.createdAt, from, to)).length;
      assert.equal(queue, card, `${status} · ${range}`);
    }
  }
});

/* ── ยามซอร์ส: ตาราง + ไฟล์ที่โหลด + ลิงก์ของการ์ด ใช้ตัวตัดสินชุดเดียวกัน ─────────────────────────── */
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("ยาม: คิวสองหน้าอ่าน from/to จาก URL และกรองด้วย withinDateRange (ไม่ตัด 10 ตัวแรกของ timestamp)", () => {
  for (const rel of ["../../app/tax/registrations/page.js", "../../app/tax/filings/page.js"]) {
    const src = read(rel);
    assert.match(src, /dayParam\(params\.get\("from"\)\)/, rel);
    assert.match(src, /dayParam\(params\.get\("to"\)\)/, rel);
    assert.match(src, /if \(!withinDateRange\(\w\.createdAt, from, to\)\) return false;/, rel);
    assert.doesNotMatch(src, /createdAt \|\| ""\)\.slice\(0, 10\)/, `${rel} ยังตัดวันตาม UTC`);
  }
});

test("ยาม: ไฟล์ Excel/พิมพ์ (reports.js) ตัดช่วงด้วย withinDateRange ทั้งสองรายงาน — จอกับไฟล์ชุดเดียวกัน", () => {
  const src = read("./reports.js");
  assert.match(src, /import \{ withinDateRange \} from '@\/lib\/tax\/period';/);
  assert.match(src, /const inRange = \(value, from, to\) => withinDateRange\(value, from, to\);/);
  assert.match(src, /\(r\) => inRange\(r\.createdAt, from, to\)/);
  assert.match(src, /\(o\) => inRange\(o\.createdAt, from, to\)/);
  assert.doesNotMatch(src, /new Date\(from\)/, "เที่ยงคืน UTC ≠ เที่ยงคืนไทย");
});

test("ยาม: ZIP ไฟล์แนบทะเบียน (registrationFiles.js) ตัดช่วงด้วย withinDateRange — ชุดเดียวกับตาราง/Excel", () => {
  const src = read("./registrationFiles.js");
  assert.match(src, /import \{ withinDateRange \} from '@\/lib\/tax\/period';/);
  assert.match(src, /withinDateRange\(r\.createdAt, from, to\)/);
  assert.doesNotMatch(src, /new Date\(from\)/, "เที่ยงคืน UTC ≠ เที่ยงคืนไทย");
});

test("ยาม: การ์ด KPI บนภาพรวมพาช่วงเวลาไป · แถบค้างนานยังไม่พา (มติ 19/10)", () => {
  const src = read("../../app/tax/page.js");
  assert.match(src, /const goReg = \(status\) => router\.push\(taxQueueHref\("\/tax\/registrations", status, timeRange, todayIso\)\);/);
  assert.match(src, /const goFil = \(status\) => router\.push\(taxQueueHref\("\/tax\/filings", status, timeRange, todayIso\)\);/);
  assert.match(src, /router\.push\(LATE_REGISTRATIONS_HREF\)/);
});
