import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { RESPONSE_WARNING_KEYS, responseWarningText } from "./apiWarnings.js";

test("responseWarningText รวมทุกคีย์ ตัดซ้ำ ตัดค่าว่าง", () => {
  assert.equal(responseWarningText(null), "");
  assert.equal(responseWarningText({ id: "DL-1" }), "");
  assert.equal(responseWarningText({ warning: "  " }), "");
  assert.equal(
    responseWarningText({ warning: "ก", stageHistoryWarning: "ข", historyWarning: "ก", leadWarning: 3 }),
    "ก · ข",
  );
});

/* ── คีย์เตือนที่ API ส่งต้องมีจออ่าน ─────────────────────────────────────────
   🐞 2026-09-11 server ส่ง `warning` / `stageHistoryWarning` / `historyWarning` /
   `leadWarning` กลับมาพร้อม 2xx แต่ไม่มีจอไหนอ่าน ⇒ ของประกอบเขียนไม่ลงแล้วเงียบเท่าเดิม
   ด่านนี้: ทุกคีย์ `…Warning` ที่ route ใส่ลงคำตอบ ต้องอยู่ใน RESPONSE_WARNING_KEYS */
const WEBAPP = process.cwd();
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(WEBAPP, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (entry.name === "route.js") out.push(rel);
  }
  return out;
}

test("ทุกคีย์ …Warning ที่ API ส่งกลับ ต้องเป็นคีย์ที่จออ่าน", () => {
  const unknown = [];
  for (const file of walk("src/app/api")) {
    const source = fs.readFileSync(path.join(WEBAPP, file), "utf8");
    // `...(xWarning ? { xWarning } : {})` · `{ xWarning: … }` · `xWarning,` ในอ็อบเจกต์ที่ส่งกลับ
    for (const m of source.matchAll(/\?\s*\{\s*(_?\w*[wW]arning)\b/g)) {
      if (!RESPONSE_WARNING_KEYS.includes(m[1])) unknown.push(`${file}: ${m[1]}`);
    }
  }
  assert.deepEqual(unknown, [], `คีย์เตือนที่ไม่มีจอไหนอ่าน:\n${unknown.join("\n")}`);
});
