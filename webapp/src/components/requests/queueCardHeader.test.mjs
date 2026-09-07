import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/* ── หน้าคิวเต็มหน้าห้ามวาดหัวเรื่องซ้ำสองชั้น (2026-09-07) ───────────────────
   🐞 ที่มา: ทั้งสี่หน้าคิววาดหัวเรื่องสองครั้ง —

     หัวหน้า (Workspace)   "คำร้องข้ามฝ่าย" / "คิวคำร้องฝ่ายวิจัยและพัฒนา" …
     หัวการ์ด (WorkspaceSection) "รายการคำร้อง"  ← ไอคอนตัวเดียวกัน

   ป้าย "N ใบ" บนหัวการ์ดก็ซ้ำกับ Pager ใต้ตารางที่เขียน "ทั้งหมด N เรื่อง"
   ⇒ แถบนี้กิน 81px โดยไม่บอกอะไรใหม่เลย

   วัดจริงที่ /requests (1440×900): ของเหนือตารางรวม 639px = 71% ของจอ 900
   ถอดหัวการ์ดออกเหลือ 562px และ Pager ยังบอก "ทั้งหมด 135 เรื่อง" อยู่เหมือนเดิม

   ⚠️ กฎนี้ใช้กับ **คิวเต็มหน้า** เท่านั้น — การ์ดที่ฝังในหน้าดีล/โครงการ/ภาพรวมฝ่าย
   (`tools="none"` หรือ `tools={false}`) ไม่มี Pager และหัวการ์ดคือสิ่งเดียวที่บอกว่า
   ก้อนนั้นคืออะไร ถอดเมื่อไรกลายเป็นตารางลอย ๆ ไม่มีชื่อ */

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

/* ดึงแท็ก <RequestQueuePanel …/> ออกมาทั้งก้อน — ทุกจุดในระบบเขียนเป็นแท็กปิดในตัว */
function panelCall(source) {
  const hit = source.match(/<RequestQueuePanel[\s\S]*?\/>/);
  return hit ? hit[0] : null;
}

/* คิวเต็มหน้า = พาเนลได้เครื่องมือครบ ⇒ มี Pager ที่บอกจำนวนอยู่แล้ว
   `tools` ตั้งต้นเป็น "full" ⇒ ไม่ส่งมาก็ถือว่าเต็ม */
function isFullQueue(call) {
  const tools = call.match(/tools=(?:\{)?"?([\w]+)"?(?:\})?/);
  return !tools || tools[1] === "full" || tools[1] === "true";
}

const queuePages = pageFiles(APP)
  .map((file) => ({ file, source: fs.readFileSync(file, "utf8") }))
  .filter((page) => page.source.includes("<RequestQueuePanel"))
  .map((page) => ({ ...page, call: panelCall(page.source) }));

test("หาจุดเรียก RequestQueuePanel ได้ครบทุกหน้า", () => {
  assert.ok(queuePages.length >= 4, `เจอแค่ ${queuePages.length} หน้า — ตัวจับน่าจะพัง`);
  const unparsed = queuePages.filter((p) => !p.call).map((p) => path.relative(WEBAPP, p.file));
  assert.deepEqual(unparsed, [], "อ่านแท็ก <RequestQueuePanel …/> ไม่ออก — ถ้าเปลี่ยนไปเขียนแบบมีลูก ต้องแก้ด่านนี้");
});

test("คิวเต็มหน้าต้องปิดหัวการ์ด — หัวเรื่องอยู่บนหัวหน้าแล้ว", () => {
  const offenders = queuePages
    .filter((page) => isFullQueue(page.call))
    .filter((page) => /<Workspace\b/.test(page.source))
    .filter((page) => !/sectionHeader=\{false\}/.test(page.call))
    .map((page) => path.relative(WEBAPP, page.file));

  assert.deepEqual(
    offenders,
    [],
    "หน้าพวกนี้มีหัวเรื่องของตัวเอง (Workspace) และพาเนลได้เครื่องมือครบ (มี Pager บอกจำนวน)\n"
      + "⇒ หัวการ์ด \"รายการคำร้อง\" ซ้ำเปล่า ๆ กิน 81px · ส่ง sectionHeader={false}\n"
      + offenders.map((f) => `  · ${f}`).join("\n"),
  );
});

test("การ์ดที่ฝังในหน้าอื่นต้องยังมีหัวการ์ด — ไม่งั้นเป็นตารางไม่มีชื่อ", () => {
  const embedded = queuePages.filter((page) => !isFullQueue(page.call));
  assert.ok(embedded.length > 0, "ไม่เจอการ์ดแบบฝังเลย — ตัวจับน่าจะพัง");
  const stripped = embedded
    .filter((page) => /sectionHeader=\{false\}/.test(page.call))
    .map((page) => path.relative(WEBAPP, page.file));
  assert.deepEqual(stripped, [], "การ์ดที่ฝัง (tools none/false) ไม่มี Pager — ถอดหัวการ์ดแล้วไม่เหลืออะไรบอกว่าก้อนนี้คืออะไร");
});

test("ปิดหัวการ์ดแล้วห้ามส่ง headerActions มาด้วย — ปุ่มจะหายเงียบ", () => {
  const clash = queuePages
    .filter((page) => /sectionHeader=\{false\}/.test(page.call) && /headerActions=/.test(page.call))
    .map((page) => path.relative(WEBAPP, page.file));
  assert.deepEqual(clash, [], "headerActions วาดอยู่ในแถบหัวการ์ด ปิดแถบแล้วปุ่มหายไปโดยไม่มี error");
});

/* ── ตัว primitive เองต้องยังห่อการ์ดอยู่ ────────────────────────────────────
   `sectionHeader={false}` = ไม่มีแถบหัว **แต่ยังมีการ์ด**
   ต่างจาก `sectionTitle={null}` ซึ่งแปลว่าไม่ห่อการ์ดเลย (ผู้เรียกห่อเอง)
   สองอย่างนี้อยู่ติดกันในโค้ด สลับกันเมื่อไรตารางหลุดออกนอกการ์ดโดยไม่มี error */
test("sectionHeader ตั้งต้นเปิด และปิดแล้วยังต้องห่อ WorkspaceSection", () => {
  const source = fs.readFileSync(PANEL, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(source, /sectionHeader\s*=\s*true/, "ต้องตั้งต้นเปิด — การ์ดที่ฝังในหน้าอื่นพึ่งหัวการ์ดอยู่");
  assert.match(
    source,
    /if\s*\(!sectionHeader\)\s*return\s*<WorkspaceSection>\{body\}<\/WorkspaceSection>;/,
    "ปิดหัวการ์ดต้องยังคืน <WorkspaceSection> — คืน body เปล่าคือความหมายของ sectionTitle={null}",
  );
});
