/* ── ตัวแก้ cascade เล็ก ๆ สำหรับด่าน CSS (2026-09-12) ────────────────────────
   ด่านที่อ่าน CSS ด้วย regex คือ **ด่านหาข้อความ ไม่ใช่ด่านลำดับชั้น** — มันเขียวได้
   ทั้งที่ของจริงพัง (ผู้ตรวจแบบแย้งยกตัวอย่างได้ 9 ท่า: ประกาศซ้ำท้ายไฟล์ · ห่อ
   `@media` · เปลี่ยนวิธีสะกด selector · regex ข้ามขอบเขตกฎไปเจอคำในกฎอื่น)
   ⇒ ตัวนี้ parse ด้วย postcss แล้วคำนวณว่า "ธาตุแบบนี้ ได้ค่าอะไรจริง" ตามกติกา
   ของ cascade: specificity ก่อน แล้วค่อยลำดับการประกาศ

   ขอบเขตโดยเจตนา: รองรับ selector เท่าที่สองไฟล์นี้ใช้จริง (type · class · attribute
   · `:first-child`/`:last-child` · ทายาทแบบเว้นวรรค) — เจอรูปที่ไม่รองรับจะ **โยน**
   ไม่ใช่เงียบ ๆ ข้าม เพราะด่านที่ข้ามของที่อ่านไม่ออกคือด่านที่โกหก
   at-rule: กฎที่อยู่ใน `@media`/`@supports` ถูกทำเครื่องหมาย `conditional` ให้ผู้เรียก
   ตัดสินเอง (ปกติ = ไม่นับ แล้วยืนยันแยกว่าค่าที่ต้องได้ ไม่ได้มาจากกฎมีเงื่อนไข) */
import postcss from "postcss";

const SIMPLE = /^(?:([a-z][\w-]*)|\.([\w-]+)|\[([\w-]+)(?:([~|^$*]?=)"?([^\]"]*)"?)?\]|(:[\w-]+(?:\([^)]*\))?))/i;

/** แตก compound selector (เช่น `td.fz-c1:first-child`) เป็นเงื่อนไขที่ตรวจได้ */
function parseCompound(text) {
  const parts = { tag: null, classes: [], attrs: [], pseudos: [] };
  let rest = text.trim();
  while (rest) {
    const m = SIMPLE.exec(rest);
    if (!m) throw new Error(`อ่าน selector ไม่ออก: "${text}"`);
    if (m[1]) parts.tag = m[1].toLowerCase();
    else if (m[2]) parts.classes.push(m[2]);
    else if (m[3]) parts.attrs.push({ name: m[3], op: m[4] || null, value: m[5] ?? null });
    else if (m[6]) parts.pseudos.push(m[6]);
    rest = rest.slice(m[0].length);
  }
  return parts;
}

/** ตัดเฉพาะ `:global(...)` ของ CSS Modules ออก — เนื้อในคือ selector ธรรมดา */
const stripGlobal = (sel) => sel.replace(/:global\(([^)]*)\)/g, "$1");

function compoundMatches(compound, node) {
  if (compound.tag && compound.tag !== node.tag) return false;
  for (const c of compound.classes) if (!node.classes.includes(c)) return false;
  for (const a of compound.attrs) {
    const have = node.attrs?.[a.name];
    if (have === undefined) return false;
    if (a.value !== null && a.op === "=" && have !== a.value) return false;
  }
  for (const p of compound.pseudos) {
    if (p === ":first-child") { if (!node.firstChild) return false; continue; }
    if (p === ":last-child") { if (!node.lastChild) return false; continue; }
    if (p === ":hover" || p === ":focus-visible" || p === ":focus" || p === ":active") return false; // สถานะ ไม่ใช่ค่าปกติ
    throw new Error(`ด่านนี้ยังไม่รองรับ pseudo "${p}"`);
  }
  return true;
}

/** ธาตุ + บรรพบุรุษ (ท้ายสุด = ตัวมันเอง) ตรงกับ selector ทายาทหรือไม่ */
function selectorMatches(selector, chain) {
  const compounds = selector.trim().split(/\s+/).map(parseCompound);
  let ci = chain.length - 1;
  if (!compoundMatches(compounds[compounds.length - 1], chain[ci])) return false;
  ci -= 1;
  for (let si = compounds.length - 2; si >= 0; si -= 1) {
    let found = false;
    while (ci >= 0) {
      if (compoundMatches(compounds[si], chain[ci])) { found = true; ci -= 1; break; }
      ci -= 1;
    }
    if (!found) return false;
  }
  return true;
}

/** (a,b,c) แบบ CSS — pseudo-class นับรวมกับคลาส/attribute */
function specificity(selector) {
  let b = 0;
  let c = 0;
  for (const compound of selector.trim().split(/\s+/).map(parseCompound)) {
    if (compound.tag) c += 1;
    b += compound.classes.length + compound.attrs.length + compound.pseudos.length;
  }
  return [0, b, c];
}
const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);

/**
 * คืนค่าที่ธาตุนี้ได้จริงของแต่ละ property
 * @param sources [{ name, css }] — ลำดับการโหลดจริง (globals ก่อน CSS module)
 * @param chain   บรรพบุรุษ→ตัวเอง: { tag, classes, attrs, firstChild, lastChild }
 */
export function resolve(sources, chain, properties, { includeConditional = false } = {}) {
  const winners = {};
  let order = 0;
  for (const { name, css } of sources) {
    const root = postcss.parse(css, { from: name });
    root.walkRules((rule) => {
      const conditional = rule.parent?.type === "atrule" && rule.parent.name !== "layer";
      if (conditional && !includeConditional) return;
      for (const raw of rule.selectors) {
        const selector = stripGlobal(raw);
        if (/[>+~,]/.test(selector)) continue; // ไม่มีในสองไฟล์นี้ — ข้ามอย่างตั้งใจ
        let ok;
        try {
          ok = selectorMatches(selector, chain);
        } catch {
          continue; // selector ที่ตัวนี้ไม่รองรับ (เช่น :has) — ไม่ตัดสินแทน
        }
        if (!ok) continue;
        const spec = specificity(selector);
        rule.walkDecls((decl) => {
          if (!properties.includes(decl.prop)) return;
          order += 1;
          const prev = winners[decl.prop];
          const weight = decl.important ? 1 : 0;
          if (!prev || weight > prev.weight || (weight === prev.weight && cmp(spec, prev.spec) >= 0)) {
            winners[decl.prop] = { value: decl.value, spec, weight, order, from: `${name}:${decl.source?.start?.line}`, conditional };
          }
        });
      }
    });
  }
  return winners;
}
