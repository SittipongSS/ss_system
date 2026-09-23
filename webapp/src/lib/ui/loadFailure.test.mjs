import test from "node:test";
import assert from "node:assert/strict";
import { ApiNetworkError, NETWORK_ERROR_MSG } from "@/lib/apiFetch";
import {
  LOAD_FAILURE_DETAIL_LABEL, httpLoadFailure, sourcesFailureDetail, thrownLoadFailure,
} from "./loadFailure.js";

/* ── "ไทยนำ + ดิบเป็นบรรทัดเล็ก" (มติเจ้าของ 23/09/2569) ─────────────────────────────
 *
 * 🐞 ที่มา: กล่องแจ้งโหลดพังของ /tax* /sahamit* ขึ้นข้อความดิบของเซิร์ฟเวอร์เป็นตัวเนื้อ
 *    (`column orders.updatedAt does not exist`) — คนหน้างานอ่านไม่ออก แต่ **สตริงนั้นคือสิ่งที่ไขคดี
 *    orders.updatedAt ได้ในไม่กี่นาที** ⇒ ห้ามทิ้ง ย้ายไปเป็นบรรทัดรองเท่านั้น
 * ⭐ เทสต์ชุดนี้ล็อกสองข้อที่ขัดกัน: ตัวนำต้องเป็นไทยเสมอ และข้อความดิบต้องรอดครบทุกตัวอักษร
 */

const RAW = "column orders.updatedAt does not exist";

test("ป้ายของบรรทัดรองเป็นคำเดียวทั้งระบบ", () => {
  assert.equal(LOAD_FAILURE_DETAIL_LABEL, "รายละเอียดสำหรับแจ้งปัญหา");
});

test("⭐ 500 พร้อมข้อความดิบของฐาน: ตัวนำเป็นไทย · ข้อความดิบอยู่ครบในบรรทัดรอง", () => {
  const failure = httpLoadFailure(500, RAW);
  assert.match(failure.message, /[\u0E00-\u0E7F]/, "ตัวนำต้องเป็นภาษาไทย");
  assert.ok(!failure.message.includes(RAW), "ข้อความดิบห้ามอยู่ในตัวนำ");
  assert.ok(failure.detail.includes(RAW), "ข้อความดิบต้องรอดครบทุกตัวอักษร");
  assert.match(failure.detail, /^HTTP 500/, "บรรทัดรองบอก status ด้วย — ช่วยแยก 500 ของเรากับ 504 ของเกตเวย์");
});

test("5xx ที่ขึ้นต้นเป็นไทยแต่ต่อข้อความดิบไว้ท้าย ไม่ถูกเชื่อเป็นตัวนำ (ไม่ผ่าซอยสตริง)", () => {
  const server = `อ่านข้อมูลประกอบคิวไม่สำเร็จ: ${RAW}`;
  const failure = httpLoadFailure(500, server);
  assert.ok(!failure.message.includes(RAW));
  assert.ok(failure.detail.includes(server), "ทั้งก้อนไปบรรทัดรอง ไม่ตัดที่ ':'");
});

test("4xx ที่เซิร์ฟเวอร์พูดไทยมาแล้ว = ประโยคที่คนเขียนให้คนอ่าน ⇒ ใช้เป็นตัวนำ", () => {
  const failure = httpLoadFailure(403, "ดูคิวขึ้นทะเบียนได้เฉพาะฝ่าย RA");
  assert.equal(failure.message, "ดูคิวขึ้นทะเบียนได้เฉพาะฝ่าย RA");
  assert.equal(failure.detail, "HTTP 403");
});

test("4xx ข้อความอังกฤษ (`forbidden` ของ http.js) ได้ประโยคไทยตาม status · ข้อความเดิมอยู่บรรทัดรอง", () => {
  const forbidden = httpLoadFailure(403, "forbidden");
  assert.match(forbidden.message, /ไม่มีสิทธิ์/);
  assert.equal(forbidden.detail, "HTTP 403 — forbidden");
  assert.match(httpLoadFailure(401, "unauthorized").message, /เข้าสู่ระบบ/);
  assert.match(httpLoadFailure(404, "not found").message, /ไม่พบ/);
  assert.match(httpLoadFailure(409, "conflict").message, /[\u0E00-\u0E7F]/);
});

test("ไม่มี body ให้อ่าน (เกตเวย์ตอบ HTML) = ยังมีตัวนำไทย และบรรทัดรองบอก status", () => {
  const failure = httpLoadFailure(502, undefined);
  assert.match(failure.message, /ขัดข้อง/);
  assert.equal(failure.detail, "HTTP 502");
});

test("ช่อง error ที่เป็นก้อน ไม่กลายเป็น [object Object]", () => {
  assert.equal(httpLoadFailure(500, { message: RAW, code: "42703" }).detail, `HTTP 500 — ${RAW}`);
  assert.ok(!httpLoadFailure(500, { code: "42703" }).detail.includes("[object Object]"));
});

test("ข้อความดิบยาวผิดปกติถูกตัดที่เพดาน — กล่องยังเป็นกล่อง", () => {
  const failure = httpLoadFailure(500, "x".repeat(5000));
  assert.ok(failure.detail.length < 600);
  assert.ok(failure.detail.endsWith("…"));
});

test("เน็ตหลุด: ข้อความไทยของ apiFetch เป็นตัวนำ · ไม่มีบรรทัดรอง (Failed to fetch ไม่ช่วยใคร)", () => {
  const failure = thrownLoadFailure(new ApiNetworkError());
  assert.equal(failure.message, NETWORK_ERROR_MSG);
  assert.equal(failure.detail, null);
});

test("200 ที่ body อ่านไม่ออก: ตัวนำไทย · ข้อความของตัว parse อยู่บรรทัดรอง", () => {
  const failure = thrownLoadFailure(new SyntaxError("Unexpected token < in JSON at position 0"));
  assert.match(failure.message, /อ่านไม่ได้/);
  assert.match(failure.detail, /Unexpected token/);
});

test("ของที่ถูกโยนแบบอื่น: ตัวนำไทยกลาง · ข้อความเดิมไม่หาย", () => {
  const failure = thrownLoadFailure(new TypeError("Cannot read properties of undefined"));
  assert.match(failure.message, /[\u0E00-\u0E7F]/);
  assert.match(failure.detail, /Cannot read properties/);
  assert.deepEqual(thrownLoadFailure(undefined), { message: "ดึงข้อมูลไม่สำเร็จ", detail: null });
});

test("หลายแหล่ง: บรรทัดรองพ่วงทุกแหล่งที่ล้มพร้อมชื่อสาย ไม่ใช่แหล่งแรก", () => {
  const detail = sourcesFailureDetail([
    { label: "การขึ้นทะเบียน", error: "ระบบขัดข้องระหว่างดึงข้อมูล", detail: "HTTP 504 — upstream timeout" },
    { label: "การยื่นชำระภาษี", error: "ระบบขัดข้องระหว่างดึงข้อมูล", detail: `HTTP 500 — ${RAW}` },
  ]);
  assert.match(detail, /\[การขึ้นทะเบียน\] HTTP 504/);
  assert.match(detail, new RegExp(`\\[การยื่นชำระภาษี\\] HTTP 500 — ${RAW}`), "ตัวที่ไขคดีมักอยู่ก้อนหลัง");
});

test("หลายแหล่ง: ไม่มีข้อความดิบเลย (เน็ตหลุดล้วน) = ไม่มีบรรทัดรอง · ข้อความซ้ำไม่พิมพ์ซ้ำ", () => {
  assert.equal(sourcesFailureDetail([{ label: "PO", detail: null }]), null);
  assert.equal(sourcesFailureDetail([]), null);
  assert.equal(sourcesFailureDetail(undefined), null);
  assert.equal(
    sourcesFailureDetail([{ label: "PO", detail: "HTTP 500" }, { label: "PO", detail: "HTTP 500" }]),
    "[PO] HTTP 500",
  );
});
