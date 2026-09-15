import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";

/* ── คิวคำร้องวาดหัว ListPanel เสมอ (มติผู้ใช้ 2026-09-15 · D1 = ใช่) ───────────────
   ⭐ มตินี้ **แทนมติ 2026-09-07** ("คิวเต็มหน้าห้ามวาดหัวเรื่องซ้ำสองชั้น")

   ประวัติ: 2026-09-07 ถอดหัวการ์ดของคิวเต็มหน้าทั้งสี่หน้า (`sectionHeader={false}`)
   เพราะหัวหน้า (Workspace "คำร้องข้ามฝ่าย") กับหัวการ์ด ("รายการคำร้อง") พูดซ้ำกัน
   และแถบนั้นกิน 81px ที่ /requests (1440×900)

   2026-09-15 ผู้ใช้ตัดสินให้ **รายการทุกชุด = แผงเดียว** (หัว: ไอคอน · ชื่อ · คำอธิบาย |
   ป้ายจำนวน → แถบเครื่องมือ → ตาราง/การ์ด → Pager) ทั้งระบบ — คิวคำร้องได้หัวกลับมา
   พร้อมป้ายจำนวนบนแถวเดียวกับชื่อ ⇒ `sectionHeader` และโหมดไม่ห่อ (`sectionTitle={null}`)
   ถูกถอดจาก `RequestQueuePanel` · ตัวสลับมุมมองย้ายจาก `headerRight` ของหน้าลงมาอยู่
   ท้ายแถบเครื่องมือของแผง (`toolbarEnd`)

   ด่านทรงรายการ (`scripts/listPanelShape.mjs` LP7) ก็กัน `sectionHeader` ไว้แล้ว —
   เทสต์นี้ล็อกทรงของผู้เรียกทุกจุดไว้ตรง ๆ ด้วย เพื่อให้พังพร้อมเหตุผลที่อ่านออก

   ⚠️ อ่านแท็กด้วย @babel/parser ไม่ใช่ regex — จุดเรียกมี JSX ซ้อนใน attribute
   (`toolbarEnd={<ViewSwitcher … />}`) regex แบบไม่โลภจะตัดแท็กขาดที่ `/>` ตัวแรก */

const WEBAPP = process.cwd();
const APP = path.join(WEBAPP, "src", "app");
const PANEL = path.join(WEBAPP, "src", "components", "requests", "RequestQueuePanel.js");

function pageFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) pageFiles(full, out);
    else if (entry.name === "page.js") out.push(full);
  }
  return out;
}

const SKIP = new Set(["loc", "start", "end", "extra", "range", "leadingComments", "trailingComments", "innerComments"]);
function walk(node, visit) {
  if (!node || typeof node.type !== "string") return;
  visit(node);
  for (const key of Object.keys(node)) {
    if (SKIP.has(key)) continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visit);
    } else if (child && typeof child.type === "string") {
      walk(child, visit);
    }
  }
}

const isNamed = (opening, name) => opening.name?.type === "JSXIdentifier" && opening.name.name === name;
const openings = (root, name) => {
  const found = [];
  walk(root, (node) => { if (node.type === "JSXOpeningElement" && isNamed(node, name)) found.push(node); });
  return found;
};
const attr = (opening, name) => opening.attributes.find((a) => a.type === "JSXAttribute" && a.name?.name === name);
const contains = (node, name) => !!node && openings(node, name).length > 0;

/* ค่าคงที่ของ attribute: ไม่มีค่า = true · "x" / {"x"} / {false} / {null} = ค่านั้น · อื่น ๆ = EXPR */
const EXPR = Symbol("expression");
function literal(attribute) {
  if (!attribute) return undefined;
  const value = attribute.value;
  if (!value) return true;
  if (value.type === "StringLiteral") return value.value;
  if (value.type !== "JSXExpressionContainer") return EXPR;
  const expr = value.expression;
  if (expr.type === "StringLiteral" || expr.type === "BooleanLiteral") return expr.value;
  if (expr.type === "NullLiteral") return null;
  return EXPR;
}

/* คิวเต็มหน้า = พาเนลได้เครื่องมือครบ (ค้นหา + กรอง/จัดกลุ่ม/เรียง + Pager)
   `tools` ตั้งต้นเป็น "full" ⇒ ไม่ส่งมาก็ถือว่าเต็ม · `false` = ค้นหาอย่างเดียว · "none" = ไม่มีแถบ */
function isFullQueue(call) {
  const tools = literal(attr(call, "tools"));
  return tools === undefined || tools === "full" || tools === true;
}

const calls = pageFiles(APP)
  .map((file) => ({ file, source: fs.readFileSync(file, "utf8") }))
  .filter((page) => page.source.includes("<RequestQueuePanel"))
  .flatMap((page) => {
    const ast = parse(page.source, { sourceType: "module", plugins: ["jsx"] });
    return openings(ast, "RequestQueuePanel").map((call) => ({
      ...page, ast, call, rel: path.relative(WEBAPP, page.file),
    }));
  });

test("หาจุดเรียก RequestQueuePanel ได้ครบ — คิวเต็มหน้า 4 หน้า + การ์ดที่ฝัง", () => {
  const full = calls.filter((c) => isFullQueue(c.call));
  const embedded = calls.filter((c) => !isFullQueue(c.call));
  assert.ok(full.length >= 4, `เจอคิวเต็มหน้าแค่ ${full.length} จุด — ตัวจับน่าจะพัง`);
  assert.ok(embedded.length >= 3, `เจอการ์ดที่ฝังแค่ ${embedded.length} จุด (/rd · หน้าดีล · หน้าโครงการ) — ตัวจับน่าจะพัง`);
});

test("ไม่มีจุดไหนปิดหัวแผง — sectionHeader ถูกถอด (มติผู้ใช้ 2026-09-15 แทน 2026-09-07)", () => {
  const offenders = calls
    .filter((c) => attr(c.call, "sectionHeader"))
    .map((c) => c.rel);
  assert.deepEqual(
    offenders,
    [],
    "คิวคำร้องวาดหัว ListPanel เสมอ (รายการทุกชุด = แผงเดียว) · ลบ sectionHeader ออก\n"
      + offenders.map((f) => `  · ${f}`).join("\n"),
  );
});

test("ไม่มีจุดไหนสั่งไม่ห่อแผง — sectionTitle={null}/ว่าง ถูกถอด (แผงซ้อนแผง)", () => {
  const offenders = calls
    .filter((c) => {
      const title = literal(attr(c.call, "sectionTitle"));
      return title === null || title === "" || title === false;
    })
    .map((c) => c.rel);
  assert.deepEqual(
    offenders,
    [],
    "โหมด sectionTitle={null} (ผู้เรียกห่อเอง) ถูกถอดแล้ว — ส่งชื่อแผงให้พาเนลวาดหัวเอง ไม่ห่อ WorkspaceSection ซ้อน",
  );
});

test("คิวเต็มหน้า: ตัวสลับมุมมองอยู่ท้ายแถบเครื่องมือของแผง (toolbarEnd) ไม่ใช่หัวหน้า", () => {
  const full = calls.filter((c) => isFullQueue(c.call));
  const missing = full
    .filter((c) => !contains(attr(c.call, "toolbarEnd"), "ViewSwitcher"))
    .map((c) => c.rel);
  assert.deepEqual(missing, [], "คิวเต็มหน้าต้องส่ง <ViewSwitcher> ผ่าน toolbarEnd (แถบเดียวกับตัวกรองที่มันคุม)");

  const inPageHeader = full
    .filter((c) => openings(c.ast, "Workspace").some((ws) => contains(attr(ws, "headerRight"), "ViewSwitcher")))
    .map((c) => c.rel);
  assert.deepEqual(inPageHeader, [], "ตัวสลับมุมมองของคิวห้ามค้างอยู่ใน Workspace headerRight (มติ 2026-09-15)");
});

test("การ์ดที่ฝังในหน้าอื่นต้องมีชื่อแผงของตัวเอง — ไม่งั้นเป็นตารางไม่มีชื่อ", () => {
  const embedded = calls.filter((c) => !isFullQueue(c.call));
  const untitled = embedded
    .filter((c) => {
      const title = literal(attr(c.call, "sectionTitle"));
      return typeof title !== "string" || !title.trim();
    })
    .map((c) => c.rel);
  assert.deepEqual(untitled, [], "การ์ดที่ฝัง (tools none/false) ไม่มี Pager — ชื่อแผงคือสิ่งเดียวที่บอกว่าก้อนนี้คืออะไร");
});

/* ── ตัว primitive เองต้องวาด ListPanel เสมอ ─────────────────────────────────────
   ไม่มีทางแยกที่คืน body เปล่า (โหมด sectionTitle={null} เดิม) หรือห่อ WorkspaceSection
   ไม่มีหัว (โหมด sectionHeader={false} เดิม) — สองทางนั้นคือของที่มตินี้ถอด */
test("RequestQueuePanel คืน <ListPanel> ทางเดียว — ไม่มี sectionHeader/โหมดไม่ห่อ", () => {
  const source = fs.readFileSync(PANEL, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(source, /sectionHeader/, "sectionHeader ถูกถอดแล้ว (มติผู้ใช้ 2026-09-15)");
  assert.doesNotMatch(source, /if\s*\(!sectionTitle\)\s*return/, "ห้ามคืน body เปล่า — แผงรายการวาดเองเสมอ");
  assert.doesNotMatch(source, /<WorkspaceSection\b/, "คิวคำร้องเป็นรายการ ⇒ ListPanel ไม่ใช่ WorkspaceSection");
  assert.match(source, /return \(\s*<ListPanel\b/, "ต้องคืน <ListPanel …> เป็นทางออกเดียว");
  assert.match(source, /toolbarEnd/, "ต้องรับ toolbarEnd ให้หน้าคิวส่งตัวสลับมุมมองเข้าแถบเครื่องมือ");
});
