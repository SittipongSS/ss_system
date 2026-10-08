import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ปุ่มพื้นสี (primary · accent · warning · danger) ต้อง **คงสีของโทน** ตอนชี้เมาส์
   🐞 2026-10-08: กฎฐาน `.btn:hover:not(:disabled)` หนัก (0,3,0) แต่กฎ hover ของโทนสีเขียนแค่
      `.btn-primary:hover` = (0,2,0) ⇒ แพ้กฎฐานทั้งพื้นและสีตัวหนังสือ — ปุ่ม "บันทึก" สีนาวีกลายเป็น
      พื้น --panel-2 ตอนชี้ ทั้งระบบ (จอสัมผัส hover ค้างหลังแตะ = "กดแล้วปุ่มซีด")
   เทสต์ของหน้าตาไม่เคยจับได้เพราะไม่มีตัวไหนคิด "น้ำหนักของ selector" — ไฟล์นี้คิดให้ */

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const GLOBALS = stripComments(read("../../app/globals.css"));

/** บล็อกชั้นนอกของสไตล์ชีต ตามลำดับในไฟล์ — { selectors[], body, index } (ข้าม @-rule ที่ซ้อนบล็อก) */
function blocks(css) {
  const out = [];
  let depth = 0;
  let start = 0;
  let head = "";
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") {
      if (depth === 0) head = css.slice(start, i).trim();
      depth += 1;
      if (depth === 1) start = i + 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        if (!head.startsWith("@")) {
          out.push({ selectors: splitTop(head, ",").map((s) => s.replace(/\s+/g, " ").trim()), body: css.slice(start, i), index: out.length });
        }
        start = i + 1;
      }
    }
  }
  return out;
}

/** แยกด้วยตัวคั่น เฉพาะที่อยู่นอกวงเล็บ */
function splitTop(text, sep) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/** น้ำหนัก [id, class, type] ของ selector เดี่ยว — รู้จัก :where() (ศูนย์) · :not()/:is() (ตัวที่หนักสุดข้างใน) */
function specificity(selector) {
  let a = 0; let b = 0; let c = 0;
  let i = 0;
  const s = selector.trim();
  while (i < s.length) {
    const ch = s[i];
    if (ch === "#") { a += 1; i += 1; while (i < s.length && /[\w-]/.test(s[i])) i += 1; continue; }
    if (ch === ".") { b += 1; i += 1; while (i < s.length && /[\w-]/.test(s[i])) i += 1; continue; }
    if (ch === "[") { b += 1; while (i < s.length && s[i] !== "]") i += 1; i += 1; continue; }
    if (ch === ":") {
      const pseudoElement = s[i + 1] === ":";
      i += pseudoElement ? 2 : 1;
      let name = "";
      while (i < s.length && /[\w-]/.test(s[i])) { name += s[i]; i += 1; }
      let arg = null;
      if (s[i] === "(") {
        let depth = 1; let j = i + 1;
        while (j < s.length && depth > 0) { if (s[j] === "(") depth += 1; if (s[j] === ")") depth -= 1; j += 1; }
        arg = s.slice(i + 1, j - 1);
        i = j;
      }
      if (pseudoElement) { c += 1; continue; }
      if (name === "where") continue;
      if (name === "not" || name === "is" || name === "has") {
        const best = splitTop(arg || "", ",").map(specificity).sort((x, y) => (y[0] - x[0]) || (y[1] - x[1]) || (y[2] - x[2]))[0] || [0, 0, 0];
        a += best[0]; b += best[1]; c += best[2];
        continue;
      }
      b += 1;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) { c += 1; while (i < s.length && /[\w-]/.test(s[i])) i += 1; continue; }
    i += 1;
  }
  return [a, b, c];
}

const decl = (body, prop) => {
  const m = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;]+);`).exec(`${body};`);
  return m ? m[1].trim() : null;
};

const ALL = blocks(GLOBALS);
const BASE_HOVER = ALL.find((blk) => blk.selectors.includes(".btn:hover:not(:disabled)"));
const TONES = ["primary", "accent", "warning", "danger"];
const hoverRules = (tone) => ALL.filter((blk) => blk.selectors.some((sel) => sel.startsWith(`.btn-${tone}:hover`)));
const restRule = (tone) => ALL.find((blk) => blk.selectors.length === 1 && blk.selectors[0] === `.btn-${tone}` && decl(blk.body, "background"));

test("ตัวคิดน้ำหนัก selector ถูกกับกรณีที่ไฟล์นี้พึ่ง", () => {
  assert.deepEqual(specificity(".btn:hover:not(:disabled)"), [0, 3, 0]);
  assert.deepEqual(specificity(".btn-primary:hover"), [0, 2, 0]);
  assert.deepEqual(specificity(".btn-primary:hover:not(:disabled):where(.btn:not(.ghost, .action-outline))"), [0, 3, 0]);
  assert.deepEqual(specificity(".btn.action-outline:hover"), [0, 3, 0]);
  assert.deepEqual(specificity(".card .btn-primary[aria-disabled=\"true\"]"), [0, 3, 0]);
  assert.deepEqual(specificity("button.btn::before"), [0, 1, 2]);
});

test("กฎฐานของ hover ยังอยู่ และตั้งทั้งพื้นและสีตัวหนังสือ — เหตุที่โทนสีต้องตั้งทั้งคู่เอง", () => {
  assert.ok(BASE_HOVER, "ไม่พบ `.btn:hover:not(:disabled)` — ถ้าเปลี่ยนรูป selector ของกฎฐาน ต้องทบทวนเทสต์นี้ทั้งไฟล์");
  assert.ok(decl(BASE_HOVER.body, "background"));
  assert.ok(decl(BASE_HOVER.body, "color"));
});

for (const tone of TONES) {
  test(`.btn-${tone}: ชี้เมาส์แล้วคงสีของโทน — กฎ hover หนักเท่ากฎฐาน ประกาศทีหลัง ตั้งพื้น + สีตัวหนังสือ`, () => {
    const rest = restRule(tone);
    assert.ok(rest, `ไม่พบกฎพื้นของ .btn-${tone}`);
    const rules = hoverRules(tone);
    assert.equal(rules.length, 1, `.btn-${tone} ต้องมีกฎ hover ของปุ่มพื้นสีกฎเดียว (พบ ${rules.length})`);
    const [rule] = rules;
    assert.equal(rule.selectors.length, 1);
    const [sel] = rule.selectors;

    // น้ำหนักเท่ากฎฐานพอดี: น้อยกว่า = แพ้กฎฐาน (บั๊กเดิม) · มากกว่า = ไปชนะกฎของหน้าที่เคยชนะ
    assert.deepEqual(specificity(sel), specificity(BASE_HOVER.selectors[0]), `${sel} ต้องหนักเท่า .btn:hover:not(:disabled)`);
    assert.ok(rule.index > BASE_HOVER.index, "กฎ hover ของโทนสีต้องประกาศหลังกฎฐาน (น้ำหนักเท่ากัน ตัวหลังชนะ)");

    // ปุ่ม disabled ไม่ตอบสนองการชี้ · ใช้กับปุ่ม `.btn` พื้นสีเท่านั้น (ไม่ใช่ปุ่มไอคอน/ghost/outline)
    assert.ok(sel.includes(":not(:disabled)"), "ต้องมี :not(:disabled)");
    const where = /:where\(([^]*)\)$/.exec(sel)?.[1] || "";
    assert.ok(where.startsWith(".btn"), "ต้องจำกัดที่ `.btn` ใน :where() — ปุ่มไอคอนมี hover ของตัวเอง");
    for (const transparent of [".ghost", ".action-outline", ".action-ghost"]) {
      assert.ok(where.includes(transparent), `ต้องกัน ${transparent} ออกใน :where() — แบบพื้นโปร่งใช้ hover --panel-2 ของตัวเอง`);
    }

    // กฎฐานตั้งสีตัวหนังสือเป็น --text ⇒ กฎนี้ต้องตั้งกลับเป็นสีเดียวกับตอนไม่ชี้ และตั้งพื้นเอง
    assert.ok(decl(rule.body, "background"), "ต้องตั้ง background");
    assert.equal(decl(rule.body, "color"), decl(rest.body, "color"), "สีตัวหนังสือตอนชี้ต้องเท่ากับตอนไม่ชี้");
    assert.notEqual(decl(rule.body, "background"), decl(BASE_HOVER.body, "background"), "พื้นตอนชี้ต้องไม่ใช่พื้นของปุ่มธรรมดา");
  });
}

test("ไม่มีโทนพื้นสีตัวไหนตกหล่น — `.btn-*` ที่มีพื้นสีของตัวเองต้องอยู่ในชุดที่เทสต์นี้ตรวจ", () => {
  const filled = ALL
    .filter((blk) => blk.selectors.length === 1 && /^\.btn-[a-z]+$/.test(blk.selectors[0]))
    .filter((blk) => {
      const bg = decl(blk.body, "background");
      return bg && bg !== "transparent" && !/^var\(--panel(-\d)?\)$/.test(bg);
    })
    .map((blk) => blk.selectors[0].slice(5));
  assert.deepEqual([...new Set(filled)].sort(), [...TONES].sort(),
    "มีโทนพื้นสีใหม่ (หรือหายไป) — เพิ่มกฎ hover แบบเดียวกับสี่โทนเดิม แล้วเติมชื่อใน TONES");
});

test("ปุ่มพื้นโปร่งของโทนสี (ghost · outline) ยังได้ hover --panel-2 ของตัวเอง — กฎของมันหนักไม่น้อยกว่ากฎโทนสี", () => {
  const toneWeight = specificity(hoverRules("danger")[0].selectors[0]);
  for (const sel of [".btn.ghost:hover", ".btn.action-outline:hover", ".btn.action-ghost:hover"]) {
    const rule = ALL.find((blk) => blk.selectors.includes(sel));
    assert.ok(rule, `ไม่พบ ${sel}`);
    assert.deepEqual(specificity(sel), toneWeight, `${sel} เคยหนักเท่ากฎฐาน — ถ้าเปลี่ยน ต้องทบทวนการกันใน :where()`);
    assert.equal(decl(rule.body, "background"), "var(--panel-2)");
  }
});
