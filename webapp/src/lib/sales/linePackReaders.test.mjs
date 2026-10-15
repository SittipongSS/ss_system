// ── ยามตัวอ่านของเลขแพ็ค (งวด PR-2 · docs/qt-pack-column.md): ทุกที่ที่ "อ่าน" จำนวนของบรรทัดต้องถูกสำหรับบรรทัดที่มีเลขแพ็ค ──
//
// 🪤 โรคที่ยามนี้กัน — ตัวอ่านที่ **ไม่รู้ว่ามีตัวคูณ**: บรรทัด 2 แพ็ค × 12 เดือน × 3,500 = 84,000 ถูกอ่านเป็น "12 หน่วย"
//   (คิวผลิตร่างงาน 12 · ใบยื่นภาษียื่น 12 · กระดาษ FM-SA-04 พิมพ์ "12 เดือน" · ไฟล์ FC วาง 12 × 3,500 ข้าง 84,000)
//   ไม่มี error ไม่มีเทสต์แดง — และตัวอ่านที่หลุดรอบออกแบบทุกตัวอยู่ **นอก** โฟลเดอร์ฝ่ายขาย (คิวผลิต · รอบขายของโซน · FM-SA-04 · จอ RD)
//   ⇒ ยามเดินทั้งแอป ตั้งต้นที่ "ปฏิเสธ": ไฟล์ไหนอ่าน `.qty` ต้องขึ้นทะเบียนว่าอ่านของตารางอะไร/ด้วยตัวช่วยตัวไหน
//
// ห้าด่าน: GA select ที่เลือก qty ต้องเลือก packQty · GB ห้ามคูณ จำนวน × ราคา เอง · GC ทะเบียนไฟล์ที่อ่าน qty ·
//   GD ตัวโหลด ↔ ตัวอ่าน · GE ตัวเขียนของเลขแพ็คบนจอ (งวด PR-2: ไม่มีเลย · งวด PR-3: ช่องกรอกเดียว ไฟล์เดียว — ย้ายโดยเจตนา มติเจ้าของ 08/10
//   · งวด PR-5: ตัวเขียนของบรรทัดยังตัวเดียว + "ช่องตั้งต้นของแถวใหม่" หนึ่งช่องที่ขึ้นทะเบียนพร้อมรายชื่อผู้รับปิด + ขั้น ② ของฟอร์มใบสั่งขายย้อนหลัง
//     เป็นผู้ส่ง prop คู่ของคอลัมน์ — ย้ายโดยเจตนา มติเจ้าของ 23/09 + 08/10 ข้อ A1–A2 · ข้อวินิจฉัย 7 · หกแถว "ยกเว้นจนงวด PR-5" ของ GC ได้ชนิดจริง)
// 🕳️ ขอบของยาม (ตรวจ 09/10 — เขียนไว้ที่ docs/qt-pack-column.md ด้วย): ยามอ่านซอร์สด้วย regex ไม่ได้ตามข้อมูล
//   · ไฟล์ที่ขึ้นทะเบียนว่าอ่านตารางอื่น/ยกเว้น/อยู่ใต้โดเมนของตัวเอง แล้ว **รับบรรทัดใบเสนอราคา/ใบสั่งขายมาจากตัวโหลดไฟล์อื่น** — ไม่เห็น
//     (ที่เห็น: ไฟล์กลุ่มนี้แตะสองตารางบรรทัดเองไม่ได้ — GC ข้อสาม)
//   · อ่านจำนวนด้วยคีย์ที่คำนวณ (`row[key]`) · ผ่านชื่อแฝงของ select (`n:qty` แล้วอ่าน `.n`) · `Object.values(line)` — ไม่เห็น
//   · ผลคูณที่ตัวตั้งทั้งสองไม่มีชื่อ qty/price และไม่ได้ประกาศจากค่าชื่อนั้นภายใน 40 บรรทัดก่อนหน้า — ไม่เห็น
// ⚠️ G0 ป้อนตัวอย่าง "ต้องจับ / ต้องไม่จับ" ให้ตัวจับทุกตัว — ตัวจับที่เงียบเพราะ regex เลิกตรง ต้องแดงที่ G0 ไม่ใช่ผ่านทั้งไฟล์
// ⚠️ ไฟล์นี้อ่านซอร์สอย่างเดียว · เทสต์พฤติกรรมของตัวอ่านแต่ละตัวอยู่ที่ไฟล์เทสต์ของมันเอง (บรรทัดที่มีเลขแพ็ค 1 · ไม่มี 1 · ว่าง = เท่าเดิม)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PACK_LINE_CATEGORY, QUOTE_PACK_INPUT_OPEN, linePackIssues } from './linePacks.js';
import { SCENT_DESIGN_CATEGORIES } from '../requests/scentDesignOrders.js';

const SRC = new URL('../../', import.meta.url); // webapp/src/
const read = (relative) => readFileSync(new URL(relative, SRC), 'utf8');

/* ตัดคอมเมนต์ทิ้งก่อนอ่านโครงสร้าง (รู้จักสตริง — '//' ใน URL ไม่ใช่คอมเมนต์) · ท่าเดียวกับ linePackWritePaths.test.mjs */
function stripComments(src) {
  let out = ''; let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (two === '/*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      out += ch; i += 1;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') { out += src[i]; i += 1; }
        out += src[i]; i += 1;
      }
      out += src[i] ?? ''; i += 1; continue;
    }
    out += ch; i += 1;
  }
  return out;
}
const codeCache = new Map();
const code = (relative) => {
  if (!codeCache.has(relative)) codeCache.set(relative, stripComments(read(relative)));
  return codeCache.get(relative);
};

/* ทุกไฟล์โค้ดของแอปใต้ src/ ที่ไม่ใช่เทสต์ — คืน path แบบ relative ต่อ src/ */
function appSourceFiles() {
  const root = fileURLToPath(SRC);
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|jsx|mjs)$/.test(entry) && !/\.test\./.test(entry)) out.push(path.slice(root.length).replace(/^\/+/, ''));
    }
  })(root.replace(/\/+$/, ''));
  return out.sort();
}
const APP_FILES = appSourceFiles();

/* ═══ ตัวจับ (ฟังก์ชันล้วน — G0 ป้อนตัวอย่างให้ทุกตัว) ═══════════════════════════════════════════════════ */

const LINE_TABLE = '(quotation_lines|sales_order_lines)';

/* ก้อนปีกกา / ก้อนวงเล็บ ที่ซ้อนได้หนึ่งชั้น (พอสำหรับ `{ a, line: { qty } }` และ `(a = f(), { qty })`) */
const BRACES = '\\{((?:[^{}]|\\{[^{}]*\\})*)\\}';
const PARENS = '\\(((?:[^()]|\\([^()]*\\))*)\\)';
/** `qty` เป็น **คีย์** ของแบบแกะอ็อบเจกต์: `{ qty }` · `{ a, qty: n }` · `{ qty = 0 }` — ไม่ใช่ `{ packQty }` / `{ qtyNote }` */
const QTY_KEY = /(?:^|[{,])\s*qty\s*(?:[,}=:]|$)/;
const bracesNamingQty = (text) => [...text.matchAll(new RegExp(BRACES, 'g'))].some((match) => QTY_KEY.test(match[1]));

/**
 * แกะ `qty` ออกจากอ็อบเจกต์ (ตัวอ่านที่ไม่มีจุดให้ `.qty` จับ) — สี่ตำแหน่งที่ก้อนปีกกาเป็น "แบบแกะ" ไม่ใช่อ็อบเจกต์ที่สร้างใหม่:
 *   เป้าของการประกาศ/กำหนดค่า/วน  `const { qty } = line` · `({ qty } = line)` · `for (const { qty } of lines)`
 *   พารามิเตอร์ของ arrow            `lines.map(({ qty, unitPrice }) => …)`
 *   พารามิเตอร์ของ function         `function total({ qty }) {`
 *   พารามิเตอร์ของเมธอดย่อ / catch   `rowOf({ qty }) {`
 * ไม่จับของที่ **สร้าง** อ็อบเจกต์: `return { id, qty };` · `fn({ qty })` · `{ qty: 12 }`
 */
function destructuresQty(source) {
  for (const match of source.matchAll(new RegExp(`${BRACES}\\s*(?:=(?![=>])|\\b(?:of|in)\\b)`, 'g'))) if (QTY_KEY.test(match[1])) return true;
  for (const match of source.matchAll(new RegExp(`${PARENS}\\s*=>`, 'g'))) if (bracesNamingQty(match[1])) return true;
  for (const match of source.matchAll(new RegExp(`\\bfunction\\b\\s*\\*?\\s*[\\w$]*\\s*${PARENS}`, 'g'))) if (bracesNamingQty(match[1])) return true;
  const method = new RegExp(`(?<![\\w$.])(?!(?:if|for|while|switch|with|return|typeof|await|function)\\b)[\\w$]+\\s*${PARENS}\\s*\\{`, 'g');
  for (const match of source.matchAll(method)) if (bracesNamingQty(match[1])) return true;
  return false;
}

/** ไฟล์นี้อ่านช่อง qty ของอะไรสักอย่างไหม — สามรูป: จุด (`line.qty` · `row?.qty`) · วงเล็บเหลี่ยม (`row['qty']`) · แกะจากอ็อบเจกต์ (destructuresQty) */
const readsQty = (source) => /\.qty\b/.test(source) || /\[\s*(['"`])qty\1\s*\]/.test(source) || destructuresQty(source);

/* ── คูณ จำนวน × ราคา เอง ──
   ตัวตั้งฝั่งจำนวน = ชื่อที่ลงท้าย `qty`/`quantity` · ฝั่งราคา = ชื่อที่ลงท้าย `unitPrice`/`price` (ลำดับไหนก็ได้ · ในบรรทัดเดียว)
   สองท่าที่หลุดได้ถ้าดูแค่นั้น (ตรวจ 09/10) จึงเติม:
   · ผลคูณที่หักบรรทัดตรงเครื่องหมายคูณ (`a *⏎ b` · `a⏎ * b`) — ต่อบรรทัดก่อนจับ (joinContinuations)
   · ตัวตั้งที่เป็นชื่อแฝง: `const a = Number(qty);` แล้ว `a * unitPrice` — ชื่อที่ประกาศจากค่าฝั่งจำนวน/ฝั่งราคา (และชื่อที่ตั้งใหม่ตอนแกะ
     `{ qty: n, unitPrice: p }`) นับเป็นตัวตั้งฝั่งนั้นไปอีก ALIAS_WINDOW บรรทัด (ประมาณขอบของฟังก์ชันเดียวกัน) */
const QTY_NAME = '(?:qty|quantity)';
const PRICE_NAME = '(?:unitPrice|price)';
const ALIAS_WINDOW = 40;
const productOf = (left, right) => `${left}[^;\\n]{0,80}\\*[^;\\n]{0,80}${right}|${right}[^;\\n]{0,80}\\*[^;\\n]{0,80}${left}`;
const MULTIPLY = new RegExp(productOf(`${QTY_NAME}\\b`, `${PRICE_NAME}\\b`), 'i');
/** ต่อบรรทัดที่หักตรงเครื่องหมายคูณ (ไม่แตะ `**`) — จำนวนบรรทัดที่เหลือไม่เท่าเดิม ใช้กับตัวจับผลคูณเท่านั้น */
const joinContinuations = (source) => source.replace(/[ \t]*\n[ \t]*(?=\*(?!\*))/g, ' ').replace(/(?<=(?<!\*)\*)[ \t]*\n[ \t]*/g, ' ');
/** ชื่อแฝงที่บรรทัดนี้ประกาศ: `[ชื่อ, 'qty' | 'price']` — ชื่อที่ลงท้าย qty/price อยู่แล้วไม่ต้องนับ (ตัวจับพื้นเห็นเอง) */
function aliasesDeclaredOn(line) {
  const out = [];
  const add = (name, kind) => { if (!new RegExp(`(?:${QTY_NAME}|${PRICE_NAME})$`, 'i').test(name)) out.push([name, kind]); };
  const declared = line.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]*)/);
  if (declared) {
    if (new RegExp(`${QTY_NAME}\\b`, 'i').test(declared[2])) add(declared[1], 'qty');
    if (new RegExp(`${PRICE_NAME}\\b`, 'i').test(declared[2])) add(declared[1], 'price');
  }
  for (const match of line.matchAll(new RegExp(`(?<![\\w$.])${QTY_NAME}\\s*:\\s*([A-Za-z_$][\\w$]*)\\s*(?=[,}=])`, 'g'))) add(match[1], 'qty');
  for (const match of line.matchAll(new RegExp(`(?<![\\w$.])${PRICE_NAME}\\s*:\\s*([A-Za-z_$][\\w$]*)\\s*(?=[,}=])`, 'g'))) add(match[1], 'price');
  return out;
}
const escapeName = (name) => name.replace(/\$/g, '\\$');
function multiplyLines(source) {
  const lines = joinContinuations(source).split('\n');
  const aliases = []; // { name, kind, index }
  const hits = [];
  lines.forEach((line, index) => {
    const active = aliases.filter((alias) => index - alias.index <= ALIAS_WINDOW);
    const namesOf = (kind) => active.filter((alias) => alias.kind === kind).map((alias) => escapeName(alias.name));
    const side = (base, names) => (names.length ? `(?:${base}\\b|(?<![\\w$.])(?:${names.join('|')})\\b)` : `${base}\\b`);
    const matcher = active.length ? new RegExp(productOf(side(QTY_NAME, namesOf('qty')), side(PRICE_NAME, namesOf('price'))), 'i') : MULTIPLY;
    if (matcher.test(line)) hits.push(line);
    for (const [name, kind] of aliasesDeclaredOn(line)) aliases.push({ name, kind, index });
  });
  return hits;
}

/** ค่าคงที่สตริงในไฟล์เดียวกัน: `const NAME = '…';` (template ที่มี `${` = อ่านไม่ได้ ⇒ null) */
function stringConstant(source, name) {
  const match = source.match(new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(['"\`])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1\\s*;`));
  if (!match) return null;
  if (match[1] === '`' && match[2].includes('${')) return null;
  return match[2];
}

/** รายชื่อคอลัมน์ของข้อความ select — ตัดที่จุลภาคชั้นนอก · ตัด "…" · `alias:col` = col · `col::cast` = col · ตารางฝัง = `@ชื่อ` */
function selectColumns(text) {
  const parts = []; let depth = 0; let current = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; } else current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean).map((part) => {
    if (part.includes('(')) return `@${part.slice(0, part.indexOf('(')).trim()}`;
    const name = part.replace(/"/g, '').split('::')[0];
    return (name.includes(':') ? name.split(':').pop() : name).trim();
  });
}

/**
 * ทุกคำสั่ง `.from('quotation_lines' | 'sales_order_lines')` ของไฟล์ → `{ table, kind, write, columns }`
 *   kind: 'columns' (อ่านรายชื่อคอลัมน์ได้) · 'all' (`.select()` ไม่มีอาร์กิวเมนต์ = ทุกคอลัมน์ — ท้าย insert/update/upsert)
 *       · 'none' (ไม่มี select — insert/update/delete ที่ไม่คืนแถว) · 'unreadable' (มี select แต่ยามอ่านอาร์กิวเมนต์ไม่ออก = **ไม่ผ่าน**)
 *   มองหา `.select(` ภายใน 300 ตัวอักษร และไม่ข้ามคำสั่ง (`;`) หรือ `.from(` ตัวถัดไป
 */
function lineTableQueries(source) {
  const out = [];
  for (const match of source.matchAll(new RegExp(`\\.from\\(\\s*(['"\`])${LINE_TABLE}\\1\\s*\\)`, 'g'))) {
    let rest = source.slice(match.index + match[0].length, match.index + match[0].length + 300);
    const nextFrom = rest.search(/\.from\(/);
    if (nextFrom >= 0) rest = rest.slice(0, nextFrom);
    const semicolon = rest.indexOf(';');
    if (semicolon >= 0) rest = rest.slice(0, semicolon);
    const write = (rest.match(/\.(insert|update|upsert|delete)\(/) || [])[1] || null;
    const select = rest.match(/\.select\(\s*/);
    if (!select) { out.push({ table: match[2], kind: 'none', write }); continue; }
    const after = rest.slice(select.index + select[0].length);
    if (after.startsWith(')')) { out.push({ table: match[2], kind: 'all', write }); continue; }
    let text = null;
    const literal = after.match(/^(['"`])((?:(?!\1)[^\\]|\\.)*)\1\s*[,)]/);
    if (literal) text = literal[1] === '`' && literal[2].includes('${') ? null : literal[2];
    else {
      const identifier = after.match(/^([A-Za-z_$][\w$]*)\s*[,)]/);
      if (identifier) text = stringConstant(source, identifier[1]);
    }
    if (text === null) { out.push({ table: match[2], kind: 'unreadable', write }); continue; }
    out.push({ table: match[2], kind: 'columns', write, columns: selectColumns(text) });
  }
  return out;
}

/** รายชื่อคอลัมน์ของตารางบรรทัดที่ **ฝัง** อยู่ในข้อความ select ใด ๆ: `lines:quotation_lines(id, qty)` */
const embeddedLineSelects = (source) => [...source.matchAll(new RegExp(`\\b${LINE_TABLE}\\s*(?:!\\w+)?\\s*\\(([^()]*)\\)`, 'g'))]
  .map((match) => ({ table: match[1], columns: selectColumns(match[2]) }));

/** จำนวนจุดที่ไฟล์นี้ **แตะสองตารางบรรทัดเอง**: `.from('quotation_lines' | 'sales_order_lines')` ทุกคำสั่ง (อ่านหรือเขียน · select รูปไหนก็นับ
 *  รวม `select('*')` ที่ GA มองว่าผ่าน) + รายชื่อฝังในข้อความ select ของตารางแม่ (`lines:sales_order_lines(*)`) */
const lineTableTouches = (source) => [...source.matchAll(new RegExp(`\\.from\\(\\s*(['"\`])${LINE_TABLE}\\1\\s*\\)`, 'g'))].length
  + [...source.matchAll(new RegExp(`\\b${LINE_TABLE}\\s*(?:!\\w+)?\\s*\\(`, 'g'))].length;

/** รายชื่อคอลัมน์ที่เลือก `qty` แต่ไม่เลือก `packQty` (`*` = ทุกคอลัมน์ = ผ่าน) */
const missesPack = (columns) => !columns.includes('*') && columns.includes('qty') && !columns.includes('packQty');

/** อาร์กิวเมนต์ของการเรียก `name(` / `name?.(` ทุกจุด (วงเล็บสมดุล) */
function callArguments(source, name) {
  const out = [];
  for (const match of source.matchAll(new RegExp(`(?<![\\w$])${name}(?:\\?\\.)?\\(`, 'g'))) {
    let depth = 0; let i = match.index + match[0].length - 1;
    for (; i < source.length; i += 1) {
      if (source[i] === '(') depth += 1;
      if (source[i] === ')') { depth -= 1; if (depth === 0) break; }
    }
    out.push(source.slice(match.index + match[0].length, i));
  }
  return out;
}

/** แท็กเปิดของคอนโทรลกรอกค่า (`<input …>` · `<Input …>` · `<MoneyInput …>` · `<Select …>` · `<select>` · `<textarea>` · `<Textarea>`) ทั้งก้อน prop */
function inputTags(source) {
  const out = [];
  for (const match of source.matchAll(/<(?:input|Input|MoneyInput|Select|select|textarea|Textarea|SearchableSelect)\b/g)) {
    let depth = 0; let i = match.index + match[0].length;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      if (source[i] === '}') depth -= 1;
      if (source[i] === '>' && depth === 0) break;
    }
    out.push(source.slice(match.index, i + 1));
  }
  return out;
}

/** ไฟล์นี้ **เขียน** คีย์ `packQty` ลงอ็อบเจกต์ไหม (`packQty: …`) */
const writesPackKey = (source) => /\bpackQty\s*:/.test(source);
/** ส่งเลขแพ็คเข้าตัวเขียน (แพตช์ของบรรทัด · คำขอ API) หรือผูกกับคอนโทรลกรอกค่าไหม — คืนรายการที่เจอ
 *  งวด PR-5 (แผน §5 G3 ง · §11 F4): + `patchRow` / `setRows` — ตัวแก้แถวของขั้น ② ของฟอร์มใบสั่งขายย้อนหลัง · `patchRow(key, { packQty })` ที่ไหนก็ตามบนจอ
 *  คือทางเขียนที่สอง (ตัวจับคีย์ `packQty:` ข้างบนมองไม่เห็นรูป shorthand — วันนี้ไม่มีไฟล์จอไหนส่งเลขแพ็คให้สองตัวนี้) */
const PACK_WRITERS = ['onPatch', 'setLine', 'onChange', 'apiFetch', 'apiJson', 'patchRow', 'setRows'];
const packWritePaths = (source) => [
  ...PACK_WRITERS.flatMap((name) => callArguments(source, name).filter((args) => /packQty/.test(args)).map((args) => `${name}(${args.slice(0, 60)})`)),
  ...inputTags(source).filter((tag) => /packQty/.test(tag)).map((tag) => tag.slice(0, 60)),
];

/* คำที่ตามด้วยวงเล็บเปิดแล้ว **ไม่ใช่** การเรียกฟังก์ชัน */
const NOT_CALLEES = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'await', 'void', 'new', 'in', 'of', 'yield', 'delete', 'throw', 'else', 'do', 'case', 'function']);
/** ชื่อผู้ถูกเรียกของวงเล็บเปิดที่ตำแหน่ง `open`: `f(` · `a.b(` · `f?.(` → `f` · `a.b` · `f` —
 *  วงเล็บจัดกลุ่ม · พารามิเตอร์ของ arrow / function · `if (` / `return (` = null */
function calleeOfParen(source, open) {
  const before = source.slice(Math.max(0, open - 120), open);
  if (/(?<![\w$])function\b\s*\*?\s*[\w$]*\s*$/.test(before)) return null;
  const match = before.match(/((?:[A-Za-z_$][\w$]*\s*\??\.\s*)*[A-Za-z_$][\w$]*)\s*(?:\?\.)?\s*$/);
  if (!match) return null;
  const name = match[1].replace(/\s+/g, '').replace(/\?\./g, '.');
  return NOT_CALLEES.has(name) ? null : name;
}
/**
 * ทุกจุดที่ซอร์สเอ่ยตัวระบุ `word` พร้อม "อยู่ในวงเล็บของใคร" — `callees` เรียงจากชั้นในสุดออกไป (null = วงเล็บที่ไม่ใช่การเรียก)
 *   `f(g(word))` → ['g', 'f'] · `value={word}` ใต้ `return (` → [null] · `const [word] = useState("")` → []
 * วงเล็บในสตริง '…' / "…" ไม่นับ (จุดที่เอ่ย `word` ในสตริงยังถูกรายงาน) · `balanced` เท็จ = ยามอ่านวงเล็บของไฟล์ไม่ลง ⇒ ผู้เรียกต้องถือว่า **ไม่ผ่าน**
 * งวด PR-5 (G3 ข): ใช้ถามว่า "ค่าของช่องตั้งต้นถูกส่งให้ใครบ้าง" — ดูชั้นในสุด (`T.qtyHint(historicalBulkQtyUnit(packQty, …))` = ส่งให้ตัวใน)
 */
function wordContexts(source, word) {
  const starts = new Set([...source.matchAll(new RegExp(`(?<![\\w$])${word}(?![\\w$])`, 'g'))].map((match) => match.index));
  const hits = []; const stack = []; let quote = null;
  for (let i = 0; i < source.length; i += 1) {
    if (starts.has(i)) hits.push({ index: i, callees: [...stack].reverse() });
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '(') stack.push(calleeOfParen(source, i));
    else if (ch === ')') {
      if (!stack.length) return { hits, balanced: false };
      stack.pop();
    }
  }
  return { hits, balanced: stack.length === 0 && quote === null };
}

/* ═══ ทะเบียน ═══════════════════════════════════════════════════════════════════════════════════════ */

/* GA — ไฟล์ที่ select `qty` ของตารางบรรทัดโดย **ไม่ต้อง** เลือก `packQty` พร้อมเหตุ (ลบเหตุไม่ได้ · ไฟล์ที่เลิกเลือก qty แล้วต้องถอดออก) */
const SELECT_WAIVERS = Object.freeze({
  'app/api/sa/requests/route.js': 'นับจำนวนกลิ่นของบรรทัดออกแบบกลิ่น (หมวด 03-xxx) — เลขแพ็คมีได้เฉพาะหมวด 02-001',
  'lib/materialPricesAdmin.js': 'บริบท PDR: นับจำนวนกลิ่นของบรรทัดออกแบบกลิ่น (หมวด 03-xxx) เท่านั้น',
  'app/api/sales-planning/sales-orders/route.js': 'ทะเบียนใบสั่งขาย: qty ป้อนตัวนับกลิ่นของบรรทัดออกแบบกลิ่นที่เดียว (ตัวตัดสินงานบริการไม่อ่าน qty)',
  'lib/sales/contractQuotationSource.js': 'สัญญาบริการพิมพ์คำบรรยายของบรรทัดกับ subtotal ของใบ — ไม่มีใครอ่าน qty',
  'app/api/service/intake/route.js': 'คิว TS: โหลด qty มาแต่ไม่มีตัวอ่าน (fgSummary ไม่ถูกเรียกจากเส้นนี้แล้ว · mig 0392)',
});
/* สองตัวนี้ "โหลดมาแต่ไม่มีใครอ่าน" — ยามยืนยันว่าไฟล์และตัวอ่านปลายทางที่ระบุไม่อ่าน `.qty` จริง */
const SELECT_WAIVER_UNREAD = Object.freeze({
  'lib/sales/contractQuotationSource.js': ['lib/sales/contractQuotationSource.js', 'lib/sales/contractDocument.js'],
  'app/api/service/intake/route.js': ['app/api/service/intake/route.js', 'lib/service/intake.js', 'lib/service/legacySetupQueue.js'],
});
const SELECTS_READ_FLOOR = 30; // จำนวน select ของสองตารางที่ยามอ่านรายชื่อคอลัมน์ได้ (วัด 09/10 = 30) — ต่ำกว่านี้ = ตัวจับเลิกเห็น
const EMBEDDED_READ_FLOOR = 11;

/* GB — ไฟล์ที่คูณ จำนวน × ราคา เองได้ พร้อมเหตุ */
const MULTIPLY_ALLOWED = Object.freeze({
  'lib/salesPlanning.js': 'ตัวกฎ: quoteLineMoney (แพ็ค × จำนวน × ราคา) — ที่เดียวของสูตรเงิน',
  'lib/sales/linePackParity.js': 'คู่แฝดทศนิยมเที่ยงของ CHECK 0407 (ตัวตรวจฐาน)',
  'lib/sales/quotationMasterTemplate.js': 'ตัวสร้างบรรทัดตัวอย่างของหน้าตั้งค่ามาตรฐานเอกสาร (lineAt · คูณ packFactorOf แล้ว)',
  // เจอเมื่อยามเริ่มตามชื่อแฝง (const q = Number(qty) … q * p) — มูลค่าคาดการณ์ของดีลรายหมวด คงสูตร จำนวน × ราคา ตามมติ D7 ของงานออกแบบ
  'lib/sales/dealValueItems.js': 'มูลค่าคาดการณ์ของดีลรายหมวด (sales_deal_value_items) — ไม่ใช่บรรทัดใบเสนอราคา ไม่มีเลขแพ็ค (มติ D7)',
  'app/api/sahamit/forecast/rounds/[id]/create-sales-deal/route.js': 'สหมิตร: FC ของสหมิตร (sahamit_forecast_lines) ไม่ใช่บรรทัดใบเสนอราคา',
  'app/api/sahamit/forecast/rounds/[id]/sync-sales-planning/route.js': 'สหมิตร: FC ของสหมิตร',
  'app/sahamit/forecast/page.js': 'สหมิตร: จอ FC',
  'app/sahamit/po/[id]/page.js': 'สหมิตร: บรรทัด PO',
  'app/sahamit/po/page.js': 'สหมิตร: บรรทัด PO',
  'app/sahamit/reconcile/page.js': 'สหมิตร: กระทบยอด FC/PO',
  'lib/sahamit/dashboard.js': 'สหมิตร: แดชบอร์ด FC/PO',
});

/* GC — โดเมนที่มีตารางจำนวนของตัวเองและไม่เคยรับบรรทัดใบเสนอราคา/ใบสั่งขาย (prefix → ตาราง) */
const OTHER_TABLE_PREFIXES = Object.freeze({
  'app/api/sahamit/': 'sahamit_po_lines / sahamit_forecast_lines',
  'app/sahamit/': 'sahamit_po_lines / sahamit_forecast_lines',
  'components/sahamit/': 'sahamit_po_lines / sahamit_forecast_lines',
  'lib/sahamit/': 'sahamit_po_lines / sahamit_forecast_lines',
  'app/api/sa/costing/': 'costing_requests / costing items',
  'app/sa/costing/': 'costing_requests / costing items',
  'components/costing/': 'costing_requests / costing items',
  'lib/costing': 'costing_requests / costing items',
  'components/materials/': 'material_price_revision_tiers',
  'lib/materialPrices.js': 'material_price_revision_tiers',
});

/* GC ข้อสาม — ไฟล์ที่ขึ้นทะเบียนว่า "ไม่ได้อ่านบรรทัดที่มีเลขแพ็ค" (other · waived · ใต้โดเมนข้างบน) แต่แตะสองตารางบรรทัดเองได้
   เพราะ GA ยกเว้นไว้พร้อมเหตุ (ตัวนับกลิ่นของบรรทัดออกแบบกลิ่น) — **ตรึงจำนวนจุดที่แตะ**: เพิ่มคำสั่งใหม่ในไฟล์เหล่านี้ = แดง
   🐞 ตรวจ 09/10: ก่อนมีข้อนี้ เติมฟังก์ชันที่ `.from('sales_order_lines').select('*')` แล้วบวก `Number(l.qty)` ลงไฟล์ที่ขึ้นทะเบียน
      เป็นตารางอื่น (lib/tax/reports.js) ยามเขียวทั้งไฟล์ — `select('*')` ไม่มีรายชื่อคอลัมน์ให้ GA ตรวจ และไฟล์มีแถวในทะเบียนอยู่แล้ว */
const LINE_TABLE_TOUCH_PINS = Object.freeze({
  'app/api/sa/requests/route.js': 1,
  'lib/materialPricesAdmin.js': 1,
});

/* GC — ทุกไฟล์นอกโดเมนข้างบนที่อ่าน qty · ชนิด:
     rule            ตัวกฎ/ตัวช่วยของเลขแพ็คเอง (PR-1 + linePackView) — มีเทสต์ของตัวเองยึด
     units           นับหน่วยของบรรทัด ⇒ ต้องเรียก `lineUnitsTotal(`
     display         โชว์จำนวนของบรรทัด ⇒ ต้องเรียกตัวช่วยฝั่งโชว์ (`linePackQtyText(` · `linePackFormulaText(` · `linePackQty(` · `hasPackColumn(`)
     edit            ตารางโหมดแก้ที่ไม่ได้โชว์เลขแพ็คเอง: รับกฎฝั่งจอทั้งตาราง (`quoteLinesPackView(` / ตัวห่อ `historicalZonesPackView(`) แล้วส่ง
                     `showPacks=` + `packEdit=` ให้เซลล์ร่วมเป็นคนวาด/เขียน ⇒ ต้องมีทั้งการเรียกนั้นและ prop คู่ (งวด PR-5 — ขั้น ② ของฟอร์มใบสั่งขายย้อนหลัง)
     carry:pack      ส่งจำนวนของบรรทัดต่อ **พร้อมเลขแพ็ค** ⇒ ต้องเอ่ย `packQty` / `linePackQty(`
     carry:<ไฟล์>    โชว์/ส่งต่อค่าที่ตัวนับในไฟล์นั้นคิดไว้แล้ว (ไฟล์นั้นต้องขึ้นทะเบียนเป็น units)
     paper           กระดาษ QT/SO — เทสต์กระดาษเป็นเจ้าของ (ขึ้นทะเบียนอย่างเดียว)
     waived:<เหตุ>   อ่านบรรทัดใบเสนอราคา/ใบสั่งขายแต่ไม่มีทางเจอบรรทัดที่มีเลขแพ็ค
     other:<ตาราง>   `.qty` ของตารางอื่น (ต้องบอกชื่อตาราง) */
const QTY_READERS = Object.freeze({
  // ── ตัวกฎและตัวช่วย ──
  'lib/salesPlanning.js': 'rule',
  'lib/sales/linePacks.js': 'rule',
  'lib/sales/linePackView.js': 'rule',
  'lib/sales/linePackParity.js': 'rule',
  'lib/sales/quoteLines.js': 'rule',
  'lib/sales/quotationApprovalFingerprint.js': 'rule',
  'lib/sales/salesOrderApprovalFingerprint.js': 'rule',
  // ── กระดาษ QT/SO ──
  'lib/sales/quotationMasterDocument.js': 'paper',
  'lib/sales/quotationMasterTemplate.js': 'paper',
  'lib/sales/issuedSalesOrderSnapshot.js': 'paper',
  // ── ตัวนับหน่วย ──
  'lib/pm/productionPlan.js': 'units',
  'lib/service/terms.js': 'units',
  'lib/sales/forecastBreakdown.js': 'units',
  // ── ตัวโชว์ ──
  /* งวด PR-4: ตัวเทียบของตารางงานบริการเทียบแพ็คกับ ④ และเดือนกับ ⑤ แยกตัว (ไม่นับหน่วยรวมอีก) ⇒ อ่านเลขแพ็คผ่านตัวช่วยฝั่งโชว์ */
  'lib/sales/serviceSetup.js': 'display',
  'components/salesPlanning/QuotationLineItems.js': 'display',
  'components/salesPlanning/QuoteLineCells.js': 'display',
  'components/salesPlanning/serviceSetup/ServiceSetupGrid.js': 'display',
  'components/salesPlanning/SpecDocumentContent.js': 'display',
  'components/salesPlanning/SalesOrderFollowUpDocs.js': 'display',
  'app/sales-planning/deals/page.js': 'display',
  'app/rd/sales-orders/page.js': 'display',
  'lib/sales/productSpecDocument.js': 'display',
  // งวด PR-3: กฎฝั่งจอของช่องกรอก (สูตรใต้ยอด · คำกำกับส่วนลด · ยอดเดิม) — อ่านจำนวนของบรรทัดผ่าน linePackFormulaText / lineUnitsTotal
  'lib/sales/linePackEdit.js': 'display',
  // ── ตัวส่งต่อ ──
  'app/api/sales-planning/quotations/[id]/revise/route.js': 'carry:pack',
  'app/api/sales-planning/sales-orders/[id]/spec-documents/new/route.js': 'carry:pack',
  'components/salesPlanning/serviceSetup/serviceSetupDraft.js': 'carry:pack',
  'lib/sales/productSpecStore.js': 'carry:pack',
  'lib/sales/productSpecDocOrder.js': 'carry:pack',
  'lib/sales/productSpecDocView.js': 'carry:pack',
  'components/salesPlanning/SalesOrderServiceTab.js': 'carry:lib/service/terms.js',
  // ── ใบสั่งขายย้อนหลัง ──
  /* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-5 · มติเจ้าของ 23/09 "ต้องไม่ควรแตกต่างจาก form ใบเสนอราคา" + 08/10 ข้อ A1–A2 · ข้อวินิจฉัย 7 ·
     แผน IMPL_PLAN_PR5 §5 แถว G4 · mig 0409): เดิมหกแถวนี้เป็น `waived:ใบสั่งขายย้อนหลัง — ไม่มี packQty จนงวด PR-5` (บรรทัดของใบย้อนหลังไม่มีเลขแพ็ค
     จึงไม่มีอะไรให้อ่านผิด) — วันนี้ทุกบรรทัดของใบย้อนหลังถือเลขแพ็ค (ตัวเขียนของ 0409 บังคับ) ⇒ ทุกไฟล์ได้ **ชนิดจริงที่ถูกบังคับ** เหมือนตัวอ่านอื่น:
       แผน · ฟอร์มฝั่ง lib · ตัวโหลดของเสริม = พกเลขแพ็คไปกับจำนวน (carry:pack) · ประโยคของหน้าต่างอนุมัติ · การ์ดโซน = โชว์ผ่านตัวช่วยกลาง (display)
       · ขั้น ② = ตารางโหมดแก้ (edit — ชนิดใหม่ของงวดนี้)
     ไม่ได้คลายด่าน: แถวยกเว้นหายไปหกแถว ไม่ได้เพิ่ม · ชนิดของแต่ละแถวถูกตรึงรายไฟล์ในด่าน GC ข้อสอง (เปลี่ยนกลับเป็น waived เงียบ ๆ = แดง) */
  'lib/sales/historicalOrderPlan.js': 'carry:pack',
  'lib/sales/historicalIntakeForm.js': 'carry:pack',
  'lib/sales/historicalOrderWorkflow.js': 'carry:pack',
  'lib/sales/historicalOrderCopy.js': 'display',
  'components/salesPlanning/HistoricalZonesCard.js': 'display',
  'components/salesPlanning/historicalWizard/WizardZonesStep.js': 'edit',
  // ── ยกเว้น (ไม่มีทางเจอบรรทัดที่มีเลขแพ็ค) ──
  'lib/requests/scentDesignOrders.js': 'waived:นับเฉพาะบรรทัดออกแบบกลิ่น (หมวด 03-xxx)',
  'lib/requests/soReconcile.js': 'waived:รับเฉพาะ scentDesignLines(…) (หมวด 03-xxx)',
  // ── ตารางอื่น ──
  'lib/sales/dealValueItems.js': 'other:sales_deal_value_items',
  'lib/sales/dealValueItemsRepo.js': 'other:sales_deal_value_items',
  'components/salesPlanning/DealValueLines.js': 'other:sales_deal_value_items',
  'components/salesPlanning/DealCreateModal.js': 'other:sales_deal_value_items',
  'app/sales-planning/deals/[id]/page.js': 'other:sales_deal_value_items',
  'lib/salesPlanningForecast.js': 'other:sales_deal_forecast_lines / sahamit_forecast_lines',
  'lib/salesPlanningReverse.js': 'other:sales_deal_forecast_lines',
  'app/api/sa/requests/route.js': 'other:dept_request_items',
  'lib/requests/formulaDevBoard.js': 'other:dept_request_items',
  'lib/requests/hops.js': 'other:dept_request_items',
  'lib/requests/lines.js': 'other:dept_request_items',
  'lib/requests/productDevLabel.js': 'other:dept_request_items',
  'lib/requests/requestLineEdit.js': 'other:dept_request_items',
  'components/requests/FormulaDevBoard.js': 'other:dept_request_items',
  'components/requests/ProductDevLines.js': 'other:dept_request_items',
  'lib/materialPricesAdmin.js': 'other:material_price_revision_tiers',
  'lib/pm/deliveries.js': 'other:material_deliveries',
  'components/pm/DeliveriesPanel.js': 'other:material_deliveries',
  'components/pm/ProductionJobModal.js': 'other:production_jobs',
  'app/production/board/page.js': 'other:production_jobs',
  'app/production/jobs/page.js': 'other:production_jobs',
  'app/api/production/jobs/route.js': 'other:production_jobs',
  'app/sa/projects/[id]/shipment-prep/page.js': 'other:shipment_prep_lines',
  'app/settings/design-preview/page.js': 'other:แถวตัวอย่างของหน้าตัวอย่างดีไซน์ (ไม่อ่านฐาน)',
  'lib/service/assetHistory.js': 'other:service_visit_items',
  'lib/service/consumption.js': 'other:service_visit_items',
  'lib/service/visitItems.js': 'other:service_visit_items',
  'lib/service/visitReport.js': 'other:service_visit_items',
  'app/service/visits/[id]/page.js': 'other:service_visit_items',
  'app/database/sites/[id]/zones/[zoneId]/page.js': 'other:service_visit_items',
  'components/service/CloseVisitSheet.js': 'other:service_visit_items / service_assets',
  'components/service/ServiceAssetModal.js': 'other:service_assets',
  'lib/service/importRepo.js': 'other:service_assets',
  'lib/service/sites.js': 'other:service_assets',
  'lib/service/visitLoad.js': 'other:service_assets',
  'components/service/SurveyResultTable.js': 'other:service_survey_zones',
  'lib/service/surveyDecision.js': 'other:service_survey_zones',
  'lib/service/surveyReportDocument.js': 'other:service_survey_zones',
  'lib/service/surveyReportTestKit.mjs': 'other:service_survey_zones',
  'lib/tax/billPrint.js': 'other:orders.items (ใบยื่นสรรพสามิต)',
  'lib/tax/reports.js': 'other:orders.items (ใบยื่นสรรพสามิต)',
});
const DISPLAY_HELPERS = /(?<![\w$])(?:linePackQtyText|linePackFormulaText|linePackQty|hasPackColumn)\(/;
const UNITS_HELPER = /(?<![\w$])lineUnitsTotal\(/;
/* ชนิด edit: กฎฝั่งจอทั้งตาราง (ของใบเสนอราคา หรือตัวห่อของฟอร์มใบสั่งขายย้อนหลัง) + prop คู่ที่ส่งให้เซลล์ร่วม */
const PACK_EDIT_VIEW = /(?<![\w$])(?:quoteLinesPackView|historicalZonesPackView)\(/;
const PACK_EDIT_PROPS = [/(?<![\w$])showPacks=\{/, /(?<![\w$])packEdit=\{/];
/* งวด PR-5 (G4): ชนิดของหกไฟล์ของใบสั่งขายย้อนหลัง — ตรึงรายแถว (คู่กับคอมเมนต์เหนือแถวใน QTY_READERS) */
const HISTORICAL_READER_KINDS = Object.freeze([
  ['lib/sales/historicalOrderPlan.js', 'carry:pack'],         // บรรทัดของแผน + p_lines พก packQty คู่กับ qty
  ['lib/sales/historicalIntakeForm.js', 'carry:pack'],        // แถวของฟอร์ม · body · ด่านเงินของแถว
  ['lib/sales/historicalOrderWorkflow.js', 'carry:pack'],     // lineZones[].packQty ของ GET ใบ
  ['lib/sales/historicalOrderCopy.js', 'display'],            // ประโยค "รายการ:" ของหน้าต่างอนุมัติ (linePackQtyText)
  ['components/salesPlanning/HistoricalZonesCard.js', 'display'], // ช่องจำนวนของการ์ดโซน (linePackQtyText)
  ['components/salesPlanning/historicalWizard/WizardZonesStep.js', 'edit'],
]);
/* แถวยกเว้นที่เหลือ (ตัวนับกลิ่นของหมวด 03-xxx สองไฟล์) — แถวยกเว้นใหม่ต้องมาเติมที่นี่พร้อมเหตุ ไม่ใช่งอกเงียบ ๆ */
const WAIVED_READERS = Object.freeze(['lib/requests/scentDesignOrders.js', 'lib/requests/soReconcile.js']);

/* GD — ตัวโหลดที่ป้อนตัวนับ/ตัวโชว์: select ของตารางที่ระบุต้องมี qty คู่กับ packQty และตัวอ่านปลายทางต้องเรียกตัวช่วย */
const LOADER_PINS = Object.freeze([
  ['lib/pm/productionJobsRepo.js', 'sales_order_lines', 'lib/pm/productionPlan.js', UNITS_HELPER],
  ['app/api/sales-planning/sales-orders/[id]/service/route.js', 'sales_order_lines', 'lib/service/terms.js', UNITS_HELPER],
  ['lib/sales/serviceSetupRepo.js', 'sales_order_lines', 'lib/sales/serviceSetup.js', DISPLAY_HELPERS],
  ['lib/sales/productSpecStore.js', 'quotation_lines', 'lib/sales/productSpecDocument.js', DISPLAY_HELPERS],
  ['lib/sales/productSpecDocOrder.js', 'sales_order_lines', 'lib/sales/productSpecStore.js', DISPLAY_HELPERS],
  ['lib/sales/productSpecFreeze.js', 'sales_order_lines', 'lib/sales/productSpecStore.js', DISPLAY_HELPERS],
  ['app/api/sales-planning/spec-documents/[id]/route.js', 'sales_order_lines', 'lib/sales/productSpecStore.js', DISPLAY_HELPERS],
  ['app/api/rd/sales-orders/route.js', 'sales_order_lines', 'app/rd/sales-orders/page.js', DISPLAY_HELPERS],
  ['app/api/sales-planning/forecast-report/route.js', 'quotation_lines', 'lib/sales/forecastBreakdown.js', UNITS_HELPER],
  ['app/api/tax/orders/from-sales-order/route.js', 'sales_order_lines', 'lib/excise/soFiling.js', UNITS_HELPER],
  ['lib/sales/handoffQueueData.js', 'sales_order_lines', 'lib/excise/soFiling.js', UNITS_HELPER],
]);

/* GE — ตัวเขียนของเลขแพ็คบนจอ (งวด PR-2: ไม่มีเลย · งวด PR-3: ช่องกรอกเดียวในไฟล์เดียว ·
   งวด PR-5: ตัวเขียนของบรรทัดยังตัวเดียว + ช่องตั้งต้นของแถวใหม่หนึ่งช่องที่ขึ้นทะเบียน + ขั้น ② ของฟอร์มใบสั่งขายย้อนหลังเป็นผู้ส่ง prop) */
/* ไฟล์จอ (components/ · app/ นอก app/api/) ที่เขียนคีย์ `packQty:` ได้ — เฉพาะตัวส่งต่อรูปของ view พร้อมเหตุ */
const PACK_CARRY_FILES = Object.freeze({
  'components/salesPlanning/serviceSetup/serviceSetupDraft.js': 'ctxLineOf: ส่งเลขแพ็คของบรรทัดจากก้อน GET ให้ตัวเทียบจำนวนในใบ (อ่านอย่างเดียว)',
});
/* งวด PR-3: ไฟล์จอไฟล์เดียวที่ **กรอก** เลขแพ็คได้ — เซลล์ร่วมของตารางรายการใบเสนอราคา (หน้าสร้าง = หน้าแก้ · ตาราง = การ์ด ใช้เซลล์เดียวกัน)
   ตัวเขียนเดียวของทั้งแอป: `onPatch?.({ packQty: text })` — `text` คือข้อความในช่องทั้งก้อนตามที่คนพิมพ์
   (รีวิว 09/10: ตัวกรองรายปุ่ม packInputText ถูกถอด — มันทิ้งปุ่มเงียบ ๆ จนตัวคูณเงินเป็นเลขที่ไม่มีใครพิมพ์ · ค่าที่ใช้ไม่ได้เป็นสถานะ invalid แทน) */
const PACK_INPUT_FILE = 'components/salesPlanning/QuoteLineCells.js';
const PACK_INPUT_WRITE = '{ packQty: text }';
/* ฟอร์มใบสั่งขายย้อนหลัง (ขั้น ②) ใช้เซลล์ร่วมตัวเดียวกับตารางของใบเสนอราคา — งวด PR-5: ส่ง prop คู่ของคอลัมน์เหมือนใบเสนอราคาทุกตัวอักษร
   แต่ **ไม่เขียนและไม่เอ่ยคีย์ของเลขแพ็คเอง** (ตัวเขียนคือ `onPatch` ของเซลล์ร่วม ซึ่งลงแถวผ่าน `patchRow` ของขั้น ②) */
const WIZARD_ZONES_FILE = 'components/salesPlanning/historicalWizard/WizardZonesStep.js';
const WIZARD_SERVICE_FIELDS_FILE = 'components/salesPlanning/historicalWizard/HistoricalLineServiceFields.js';
/* prop คู่ที่ขั้น ② **ต้อง** ส่ง — ข้อความเดียวกับที่ `QuotationLineItems` ส่ง (ความเท่ากันของสองฟอร์มทั้งหัว/ชุด prop ยึดที่ quoteLineCells.test.mjs) */
const WIZARD_PACK_PROPS = Object.freeze(['showPacks={showPacks}', 'packEdit={packView?.rows[index]}']);
/* ตัวจับของงวด PR-3 (`WIZARD_FORBIDDEN` — เจ็ดชื่อ ทั้งไฟล์ดิบของขั้น ②) **ยังอยู่ ไม่ได้ถูกถอด**: สามชื่อในนั้น (showPacks · packRequired · packEdit)
   กลายเป็น prop ที่ขั้น ② ส่งเอง จึงเหลือสี่ชื่อที่ **โค้ด (ตัดคอมเมนต์แล้ว)** ของขั้น ② และของช่องงานบริการของบรรทัดห้ามเอ่ย:
   คีย์ของเลขแพ็ค · กฎรายบรรทัดของใบเสนอราคา · hook ของใบเสนอราคา · prop โหมดแดงของใบเสนอราคา
   ⇒ ตัวเขียนตัวที่สองแบบ shorthand (`patchRow(row.key, { packQty })`) หรือการอ่าน `row.packQty` มาตัดสินเองในสองไฟล์นี้ = แดง
   (ขอบเขตของตัวจับขยายเป็นทั้งโฟลเดอร์ของฟอร์มแล้ว — ดู `WIZARD_PACK_BAN_FILES` ข้างล่าง · รีวิว 12/10 G3) */
const WIZARD_PACK_BAN = /\b(?:packQty|linePackEdit|useQuoteLinePackGate|packErrorsShown)\b/;
/* ไฟล์ของจอที่อยู่รอบช่องกรอก — ต้อง **ไม่** เขียนคีย์เอง (รับ/ส่งบรรทัดทั้งก้อน เลขแพ็คเดินทางไปกับ spread) · งวด PR-5: + ขั้น ② ของฟอร์มใบสั่งขายย้อนหลัง */
const PACK_NON_WRITERS = Object.freeze([
  'components/salesPlanning/QuotationLineItems.js', 'components/salesPlanning/useQuoteLinePackGate.js',
  'app/sales-planning/quotations/new/page.js', 'app/sales-planning/quotations/[id]/page.js',
  WIZARD_ZONES_FILE,
]);
/* งวด PR-5 (มติ D8 · แผน §2.7 + §5 G3 ข · R8): ไฟล์จอไฟล์ที่สองที่มีคอนโทรลผูกกับเลขแพ็ค — **ขึ้นทะเบียนโดยเจตนา** ในฐานะ "ช่องตั้งต้นของแถวใหม่"
   หน้าต่างเพิ่มหลายโซนของฟอร์มใบสั่งขายย้อนหลัง: เลขเดียวลงทุกบรรทัดที่จะเพิ่ม (ว่างได้ ไม่มีค่าตั้งต้น) — ไม่ใช่ตัวเขียนของบรรทัด:
   ไฟล์ไม่เขียนคีย์ ไม่แตะแถวที่มีอยู่ และส่งค่าของช่องให้ได้แค่ตัวตั้งค่าของช่องเอง กับ **ผู้รับปิดห้าตัว** ใน lib ของฟอร์ม (สามตัวตัดสิน/พูดถึงค่า ·
   สองตัวท้ายสร้างประโยคและแถว) — ผู้รับตัวที่หก = แดง · ตัวห่อสองตัวคือการเรียกที่ครอบผู้รับอยู่อีกชั้นตามที่แผนเขียน (คำใบ้หน่วย · ส่งแถวที่ lib สร้างขึ้นให้ขั้น ②) */
const PACK_SEED_INPUT_FILE = 'components/salesPlanning/historicalWizard/HistoricalBulkZonesModal.js';
const PACK_SEED_SINK_LIB = 'lib/sales/historicalIntakeForm.js';
const PACK_SEED_SINKS = Object.freeze([
  'historicalBulkPackIssue', 'historicalBulkFieldsIssue', 'historicalBulkQtyUnit', 'historicalBulkConsequence', 'historicalBulkAddRows',
]);
const PACK_SEED_WRAPPERS = Object.freeze(['T.qtyHint', 'onAdd']);
const PACK_SEED_STATE = 'const [packQty, setPackQty] = useState("")';
const PACK_SEED_VALUE = 'value={packQty}';
const PACK_SEED_SETS = Object.freeze(['""', 'event.target.value']); // เปิดหน้าต่างใหม่ = ล้าง · พิมพ์ = ข้อความในช่องทั้งก้อน (ไม่มีตัวกรอง)
/* 🔴 รีวิว 12/10 (G3) — ขอบเขตของตัวจับสี่ชื่อ = **ทุกไฟล์ .js ของโฟลเดอร์ฟอร์มใบสั่งขายย้อนหลัง** เว้นช่องตั้งต้นที่ขึ้นทะเบียนไฟล์เดียว
   (อ่านจากโฟลเดอร์ ⇒ ไฟล์ใหม่ของฟอร์มถูกครอบเองโดยไม่ต้องมีใครจำมาเติมชื่อ) · เดิมสองไฟล์: ขั้น ② กับช่องงานบริการของบรรทัด
   ทำไมต้องทั้งโฟลเดอร์: ก่อนงวด PR-5 เลขแพ็คที่หลงมาจากฟอร์มไม่มีผล (แผนไม่อ่าน) — วันนี้มันคูณเงิน และ **เปลือกของฟอร์ม** (`HistoricalOrderWizard.js`)
   คือที่ประกอบ body ของทั้งพรีวิวและบันทึก: `const packQty = zone.packQty || "1"; return { ...zone, packQty };` ที่นั่น = ช่องว่างถูกส่งเป็น 1 ⇒ แผนไม่มีข้อผิด
   ฟอร์มเชื่อยอดของแผน ขั้น ③ ④ โชว์ยอดคูณ 1 เหนือช่องที่ยังว่าง แล้วบันทึกเป็น ×1 (ฟอร์มไม่มีกฎช่องว่างของตัวเอง — แผนคือด่านเดียว)
   ตัวจับอีกสองตัวมองไม่เห็นรูปนี้: shorthand ไม่มี `packQty:` (ตัวจับคีย์) และ body ถูกประกอบในคำสั่งของมันเอง อาร์กิวเมนต์ของ apiJson จึงไม่เอ่ยเลขแพ็ค (ตัวจับตัวเขียน)
   — ตัวกลายพันธุ์สามตัวในเปลือก (ทางบันทึก · ทางพรีวิว · ทั้งคู่ผ่านตัวช่วยตัวเดียว) รอดทั้งชุดเทสต์ก่อนขยายขอบเขตนี้ · วันนี้ชื่อทั้งสี่ไม่มีในสิบไฟล์นั้นเลย (แม้ในคอมเมนต์) */
const WIZARD_DIR = 'components/salesPlanning/historicalWizard/';
const WIZARD_SHELL_FILE = `${WIZARD_DIR}HistoricalOrderWizard.js`;
const WIZARD_PACK_BAN_FILES = Object.freeze(APP_FILES.filter((file) => file.startsWith(WIZARD_DIR) && file.endsWith('.js') && file !== PACK_SEED_INPUT_FILE));
/* ไฟล์ใต้ app/api/ ที่เอ่ย `packQty`: ทางก๊อปของงวด PR-1 + ตัวโหลดของ GD + route ที่ส่งจำนวนผลิตต่อ */
const API_PACK_FILES = Object.freeze([
  'app/api/sales-planning/quotations/[id]/revise/route.js', // PR-1: ออก Rev. ก๊อปเลขแพ็คของบรรทัด
  'app/api/sales-planning/sales-orders/[id]/spec-documents/new/route.js', // FM-SA-04: ส่ง quantity.packQty ให้จอออกเอกสาร
  ...LOADER_PINS.map(([loader]) => loader).filter((file) => file.startsWith('app/api/')),
].sort());

const isScreenFile = (file) => file.startsWith('components/') || (file.startsWith('app/') && !file.startsWith('app/api/'));
const otherTablePrefixOf = (file) => Object.keys(OTHER_TABLE_PREFIXES).find((prefix) => file.startsWith(prefix)) || null;

/* ═══ G0 ตัวตั้งของยาม ═════════════════════════════════════════════════════════════════════════════ */

test('G0 ตัวตั้ง: เดินไฟล์ของแอปได้จริง · ตัวตัดคอมเมนต์ไม่กินโค้ด · ทุกแถวของทะเบียนชี้ไฟล์ที่มีอยู่', () => {
  assert.ok(APP_FILES.length > 500, `อ่านได้แค่ ${APP_FILES.length} ไฟล์ — ตัวเดินโฟลเดอร์น่าจะพัง`);
  assert.equal(stripComments("a('//x'); // ทิ้ง\n/* ทิ้ง */ b(`/*y*/`);"), "a('//x'); \n b(`/*y*/`);");
  const registered = [
    ...Object.keys(SELECT_WAIVERS), ...Object.values(SELECT_WAIVER_UNREAD).flat(), ...Object.keys(MULTIPLY_ALLOWED),
    ...Object.keys(QTY_READERS), ...LOADER_PINS.flatMap(([loader, , consumer]) => [loader, consumer]),
    ...Object.keys(PACK_CARRY_FILES), ...API_PACK_FILES, ...Object.keys(LINE_TABLE_TOUCH_PINS),
    PACK_INPUT_FILE, ...PACK_NON_WRITERS, ...WIZARD_PACK_BAN_FILES, PACK_SEED_INPUT_FILE, PACK_SEED_SINK_LIB,
    ...HISTORICAL_READER_KINDS.map(([file]) => file), ...WAIVED_READERS,
  ];
  for (const file of registered) assert.ok(APP_FILES.includes(file), `ทะเบียนชี้ไฟล์ที่ไม่มี: ${file}`);
  for (const [file, reason] of [...Object.entries(SELECT_WAIVERS), ...Object.entries(MULTIPLY_ALLOWED), ...Object.entries(PACK_CARRY_FILES)]) {
    assert.ok(String(reason).trim().length >= 10, `${file}: ต้องมีเหตุ`);
  }
});

test('G0 ตัวจับทุกตัวจับของที่ต้องจับ และไม่จับของที่ไม่ใช่ (ตัวจับที่เงียบเพราะ regex เลิกตรงต้องแดงที่นี่)', () => {
  /* อ่าน qty — จุด · วงเล็บเหลี่ยม · แกะจากอ็อบเจกต์ */
  for (const yes of ['const q = Number(line.qty);', 'row?.qty ?? null', 'sum + l.qty', '`${item.qty} ชิ้น`']) assert.equal(readsQty(yes), true, yes);
  for (const yes of ["const q = row['qty'];", 'row?.["qty"] ?? 0', 'total += line[`qty`];']) assert.equal(readsQty(yes), true, yes);
  for (const yes of [
    'const { qty } = row;', 'const { qty, unitPrice } = line;', 'const { id, qty: months = 0, ...rest } = line;', 'let { description,\n  qty,\n} = line;',
    'const { line: { qty } } = entry;', '({ qty } = line);', 'for (const { qty, unit } of lines) total += qty;',
    'const total = lines.reduce((sum, { qty }) => sum + Number(qty), 0);', 'rows.map(({ qty, unitPrice }) => `${qty}`)', 'const cell = async ({ id }, { qty = 0 }) => qty;',
    'function unitsOf({ qty }) { return Number(qty); }', 'export async function* walk(index, { qty }) {}', 'const view = { rowOf({ qty, unit }) { return qty; } };',
    'try { load(); } catch ({ qty }) { report(qty); }',
  ]) {
    assert.equal(destructuresQty(yes), true, yes);
    assert.equal(readsQty(yes), true, yes);
  }
  for (const no of [
    'qty: 12', 'line.packQty', 'line.qtyNote', 'packageQty', "row['packQty']", "row['qtyNote']",
    // สร้างอ็อบเจกต์ ไม่ใช่แกะ: คืนค่า · ส่งเป็นอาร์กิวเมนต์ · กำหนดให้ตัวแปร · prop ของ JSX
    'return { id, qty };', 'save({ qty });', 'const row = { qty, unit };', 'onPatch?.({ qty: value });', 'if (valid({ qty })) { go(); }', '<Row value={{ qty }} />',
    'const next = { ...line, qty: 1 };', 'const same = a.unit === b.unit;',
    // แกะคีย์อื่นที่ชื่อคล้าย
    'const { packQty } = line;', 'const { qtyNote, lineQty } = line;', 'rows.map(({ packQty }) => packQty)', 'function f({ quantity }) {}',
  ]) assert.equal(readsQty(no), false, no);

  /* คูณ จำนวน × ราคา */
  for (const yes of [
    'const a = Number(line.qty) * line.unitPrice;', 'total += row.price * row.qty', 'const v = qty * (ok ? price : 0);',
    'amount: lineQty * costPrice,', 'return Number(l.quantity || 0) * Number(product.unitPrice);', 'x = packFactorOf(p) * qty * unitPrice;',
  ]) assert.equal(multiplyLines(yes).length, 1, yes);
  for (const no of [
    'qty: line.qty, unitPrice: line.unitPrice', 'const total = lineUnitsTotal(line);', 'const net = quoteLineNet(line).lineTotal;',
    'const a = qty * 2; const b = price;', 'width: qty * 10', 'const tax = quantity * exciseRatePerUnit;',
  ]) assert.equal(multiplyLines(no).length, 0, no);
  /* ผลคูณที่หักบรรทัดตรงเครื่องหมายคูณ — ต่อบรรทัดก่อนจับ */
  assert.equal(joinContinuations('a *\n   b'), 'a * b');
  assert.equal(joinContinuations('a\n   * b'), 'a * b');
  assert.equal(joinContinuations('a **\n b'), 'a **\n b', 'ยกกำลังไม่ใช่การคูณ');
  assert.equal(joinContinuations('a;\nb = 1;'), 'a;\nb = 1;', 'บรรทัดอื่นไม่ถูกต่อ');
  for (const yes of [
    'const total = Number(line.qty) *\n  Number(line.unitPrice);', 'return qty\n    * unitPrice;', 'amount: row.price *\n\t\trow.qty,',
  ]) assert.equal(multiplyLines(yes).length, 1, yes);
  for (const no of ['const a = qty *\n  2;\nconst b = price;', 'const list = [\n  qty,\n  price * 2,\n];']) assert.equal(multiplyLines(no).length, 0, no);
  /* ตัวตั้งที่เป็นชื่อแฝงของจำนวน/ราคา (ประกาศจากค่าชื่อนั้น หรือถูกตั้งชื่อใหม่ตอนแกะ) */
  for (const yes of [
    'const a = Number(qty);\nreturn a * Number(unitPrice);',                                   // 🐞 ตัวอย่างของการตรวจ 09/10 (ท่อนหลังหักบรรทัดด้วย — ดูถัดไป)
    'const { qty, unitPrice } = line;\nconst a = Number(qty);\nreturn a *\n  Number(unitPrice);',
    'const months = Number(line.qty) || 0;\nconst rate = Number(line.unitPrice) || 0;\nconst gross = months * rate;',
    'const p = line.unitPrice;\nconst value = p * line.qty;',
    'const { qty: n, unitPrice: p } = line;\nreturn n * p;',
    'let units = row.quantity;\nunits = Math.max(0, units);\ntotal += units * row.price;',
  ]) assert.equal(multiplyLines(yes).length >= 1, true, yes);
  for (const no of [
    'const a = Number(qty);\nreturn a * 2;',                                                     // ชื่อแฝงของจำนวน คูณค่าที่ไม่ใช่ราคา
    'const units = lineUnitsTotal(line);\nconst value = units * rate;',                           // ไม่ได้ประกาศจากค่าชื่อ qty / price
    'const a = Number(qty);\nconst b = a + 1;\nconst c = b * d;',
    'const a = Number(qty);\nreturn a.price * 2;',                                               // อ่านช่องของชื่อแฝง ไม่ใช่คูณกับราคา
  ]) assert.equal(multiplyLines(no).length, 0, no);
  // ชื่อแฝงหมดอายุหลัง ALIAS_WINDOW บรรทัด (กันชื่อสั้น ๆ อย่าง a / n ของฟังก์ชันอื่นในไฟล์เดียวกันมาชน) — ขอบนี้เขียนไว้ที่หัวไฟล์
  const far = (gap) => `const a = Number(qty);\n${'x();\n'.repeat(gap)}return a * cost.unitPrice;`;
  assert.equal(multiplyLines(far(0)).length, 1);
  assert.equal(multiplyLines(far(ALIAS_WINDOW - 1)).length, 1, 'ยังอยู่ในระยะ');
  assert.equal(multiplyLines(far(ALIAS_WINDOW)).length, 0, 'พ้นระยะ = ไม่นับ (ขอบของยาม)');

  /* select ของตารางบรรทัด */
  const kinds = (source) => lineTableQueries(source).map((query) => query.kind);
  const columnsOf = (source) => lineTableQueries(source)[0]?.columns;
  assert.deepEqual(columnsOf(`supabase.from('sales_order_lines').select('id, "salesOrderId", qty, "packQty", unit')`), ['id', 'salesOrderId', 'qty', 'packQty', 'unit']);
  assert.deepEqual(columnsOf('supabase\n  .from("quotation_lines")\n  .select("id, qty")\n  .eq("id", x)'), ['id', 'qty']);
  assert.deepEqual(columnsOf("const COLS = 'id, description, qty, unit';\nq = supabase.from('quotation_lines').select(COLS).eq('a', 1);"), ['id', 'description', 'qty', 'unit']);
  assert.deepEqual(columnsOf("supabase.from('sales_order_lines').select('id, n:qty, code:metadata->>categoryCode, total::text')"), ['id', 'qty', 'metadata->>categoryCode', 'total']);
  assert.deepEqual(columnsOf("supabase.from('quotation_lines').select('*')"), ['*']);
  assert.deepEqual(kinds("supabase.from('quotation_lines').insert(rows).select()"), ['all'], '.select() ท้าย insert = ทุกคอลัมน์');
  assert.deepEqual(kinds("await supabase.from('quotation_lines').delete().eq('quotationId', id);\nconst x = supabase.from('quotations').select('id, qty');"), ['none'], 'ไม่ข้ามคำสั่งไปหยิบ select ของตารางอื่น');
  assert.deepEqual(kinds("supabase.from('sales_order_lines').select(columnsFor(user))"), ['unreadable']);
  assert.deepEqual(kinds('supabase.from(`sales_order_lines`).select(`id, ${EXTRA}`)'), ['unreadable']);
  assert.deepEqual(kinds("supabase.from('sales_orders').select('id, qty')"), [], 'ตารางอื่นไม่นับ');
  assert.equal(missesPack(['id', 'qty', 'unit']), true);
  assert.equal(missesPack(['id', 'qty', 'packQty']), false);
  assert.equal(missesPack(['*']), false);
  assert.equal(missesPack(['id', 'description']), false);
  assert.equal(missesPack(['id', 'packageQty', 'qtyNote']), false, 'ชื่อคล้ายไม่นับ');

  /* รายชื่อคอลัมน์ที่ฝังใน select ของตารางแม่ */
  assert.deepEqual(embeddedLineSelects("select('*, lines:quotation_lines(*)')"), [{ table: 'quotation_lines', columns: ['*'] }]);
  assert.deepEqual(embeddedLineSelects('`id, lines:sales_order_lines(id, qty, unit), deal:sales_deals(id)`'),
    [{ table: 'sales_order_lines', columns: ['id', 'qty', 'unit'] }]);
  assert.deepEqual(embeddedLineSelects("select('id, lines:sales_order_lines!inner(id)')"), [{ table: 'sales_order_lines', columns: ['id'] }]);
  assert.deepEqual(embeddedLineSelects(".from('sales_order_lines')"), [], 'ชื่อตารางใน .from() ไม่ใช่รายชื่อฝัง');

  /* จุดที่ไฟล์แตะสองตารางบรรทัดเอง — select รูปไหนก็นับ (รวม '*' ที่ GA มองว่าผ่าน) · เขียนก็นับ · รายชื่อฝังก็นับ */
  assert.equal(lineTableTouches("const { data } = await supabase.from('sales_order_lines').select('*').in('salesOrderId', ids);"), 1);
  assert.equal(lineTableTouches('supabase\n  .from("quotation_lines")\n  .select("id, qty")'), 1);
  assert.equal(lineTableTouches('await supabase.from(`sales_order_lines`).delete().eq("salesOrderId", id);'), 1);
  assert.equal(lineTableTouches("supabase.from('sales_orders').select('id, lines:sales_order_lines(*)')"), 1);
  assert.equal(lineTableTouches("supabase.from('quotations').select('*, lines:quotation_lines!inner(id, qty)')"), 1);
  assert.equal(lineTableTouches("a.from('quotation_lines').select('*'); b.from('sales_orders').select('id, lines:sales_order_lines(id)');"), 2);
  for (const no of [
    "supabase.from('sales_orders').select('id, qty')", "supabase.from('orders').select('items')", "supabase.rpc('copy_sales_order_lines', { p_id: id })",
    "const TABLE = 'quotation_lines';", 'load_quotation_lines(id)', "supabase.from('sales_order_line_zones').select('*')", "select('zones:sales_order_line_zones(id)')",
  ]) assert.equal(lineTableTouches(no), 0, no);

  /* ทางเขียนของเลขแพ็ค */
  assert.equal(writesPackKey('const row = { qty: 1, packQty: 2 };'), true);
  assert.equal(writesPackKey('...(pack !== null ? { packQty : pack } : {})'), true);
  assert.equal(writesPackKey('const pack = line.packQty; if (line.packQty === 2) {}'), false);
  assert.equal(writesPackKey('linePackQty(line) ? a : b'), false);
  assert.equal(packWritePaths('onPatch?.({ packQty: 2 })').length, 1);
  assert.equal(packWritePaths('setLine(index, { qty: 1, packQty: value })').length, 1);
  assert.equal(packWritePaths('await apiJson(url, { method: "PATCH", json: { lines: lines.map((l) => ({ packQty: l.packQty })) } })').length, 1);
  assert.equal(packWritePaths('<MoneyInput value={line.packQty} onChange={(v) => change(v)} />').length, 1);
  assert.equal(packWritePaths('<input className="x" value={draft.packQty ?? ""} />').length, 1);
  assert.equal(packWritePaths('<Select value={x} onChange={(e) => set(e.target.value > 1 ? a : b)}>{line.packQty}</Select>').length, 0, 'นอกแท็กเปิดไม่นับ');
  assert.equal(packWritePaths('onPatch?.({ qty: value ?? "" }); const pack = linePackQty(line);').length, 0);
  assert.equal(packWritePaths('<span role="group">{fmtNumber(pack)}</span>').length, 0);
  /* งวด PR-5: ตัวแก้แถวของขั้น ② นับเป็นตัวเขียน — รวมรูป shorthand ที่ตัวจับคีย์ `packQty:` มองไม่เห็น */
  assert.equal(writesPackKey('patchRow(row.key, { packQty })'), false, 'รูป shorthand ไม่มี `packQty:` — จึงต้องมีชื่อตัวแก้แถวในรายชื่อตัวเขียน');
  assert.equal(packWritePaths('patchRow(row.key, { packQty })').length, 1);
  assert.equal(packWritePaths('setRows(rows.map((row) => ({ ...row, packQty: seed })))').length, 1);
  assert.equal(packWritePaths('patchRow(row.key, { packsPerRound: value }); setRows([...rows, ...newRows.map((row) => withPackage(row, productId))]);').length, 0);

  /* งวด PR-5: "ค่าถูกส่งให้ใคร" — ผู้ถูกเรียกของวงเล็บที่ครอบตัวระบุ เรียงจากชั้นในสุด */
  const calleesOf = (source, word = 'packQty') => wordContexts(source, word).hits.map((hit) => hit.callees);
  assert.deepEqual(calleesOf('const issue = historicalBulkPackIssue(packQty);'), [['historicalBulkPackIssue']]);
  assert.deepEqual(calleesOf('T.qtyHint(historicalBulkQtyUnit(packQty, product?.saleUnit))'), [['historicalBulkQtyUnit', 'T.qtyHint']], 'ชั้นในสุดมาก่อน');
  assert.deepEqual(calleesOf('onAdd?.(historicalBulkAddRows({ zoneIds: planRows.map((row) => row.zoneId), rows, packQty, qty }), productId)'),
    [['historicalBulkAddRows', 'onAdd']], 'วงเล็บที่ปิดไปแล้ว (planRows.map) ไม่นับ · `?.(` = การเรียก');
  assert.deepEqual(calleesOf('const [packQty, setPackQty] = useState("");'), [[]], 'ประกาศ = ไม่อยู่ในวงเล็บของใคร · setPackQty ไม่ใช่ตัวระบุเดียวกัน');
  assert.deepEqual(calleesOf('return (\n  <Input value={packQty} onChange={(event) => setPackQty(event.target.value)} />\n);'), [[null]], 'วงเล็บของ return ไม่ใช่การเรียก');
  assert.deepEqual(calleesOf('if (packQty) send(a, (packQty));'), [[null], [null, 'send']], 'if ( · วงเล็บจัดกลุ่ม = null');
  assert.deepEqual(calleesOf('const send = (packQty) => patchRow(key, { packQty });'), [[null], ['patchRow']], 'พารามิเตอร์ของ arrow ไม่ใช่การเรียก');
  assert.deepEqual(calleesOf('function seed(packQty) { return packQty; }'), [[null], []], 'พารามิเตอร์ของ function ไม่ใช่การเรียก');
  assert.deepEqual(calleesOf('note("แพ็ค (ทุกบรรทัด"); use(packQty); row["packQty"] = 1;'), [['use'], []], 'วงเล็บในสตริงไม่นับ · ชื่อในสตริงยังถูกรายงาน');
  assert.deepEqual(calleesOf('f(packQtyNote, linePackQty, setPackQty, packQty$)'), [], 'ชื่อที่ยาวกว่าไม่ใช่ตัวระบุเดียวกัน');
  assert.equal(wordContexts('f(packQty', 'packQty').balanced, false, 'วงเล็บไม่ปิด = อ่านไม่ลง');
  assert.equal(wordContexts('f(packQty))', 'packQty').balanced, false);
  assert.equal(wordContexts('f("a', 'packQty').balanced, false, 'สตริงไม่ปิด = อ่านไม่ลง');
  assert.equal(wordContexts('f(g(packQty), "(")', 'packQty').balanced, true);

  /* งวด PR-5: ตัวจับของขั้น ② (สี่ชื่อ) — จับตัวเขียนตัวที่สอง/กฎของใบเสนอราคา · ไม่จับของที่ขั้น ② ใช้จริง และไม่จับ "แพ็คต่อรอบ" ของโซน */
  for (const caught of [
    'patchRow(row.key, { packQty })', 'const packQty = String(n);', 'row.packQty', 'packErrorsShown={x}', 'useQuoteLinePackGate(',
    'import { linePackEditView } from "@/lib/sales/linePackEdit";',
    /* รีวิว 12/10 (G3): ค่าตั้งต้นแบบ shorthand ตอนประกอบ body ในเปลือกของฟอร์ม — ทั้งสองบรรทัดของมัน */
    'state.zones.map((zone) => { const packQty = zone.packQty || "1"; return { ...zone, packQty }; })', 'return { ...zone, packQty };',
  ]) assert.match(caught, WIZARD_PACK_BAN, `ตัวจับของขั้น ② ต้องจับ ${caught}`);
  for (const allowed of [
    'packsPerRound', 'packView', 'packEdit', 'showPacks', 'packRequired', 'historicalPackErrorsShown', 'historicalZonesPackView', 'link.packsSeed',
    'packErrors', 'HistoricalSeedChip', 'historicalLineQuoteLink', 'showPacksPerRound · packsPerRound · SERVICE_PACKS_LABEL',
  ]) assert.doesNotMatch(allowed, WIZARD_PACK_BAN, `ตัวจับของขั้น ② ต้องไม่จับ ${allowed}`);
  assert.match('<QuoteLineMoneyCells showPacks={showPacks} packEdit={packView?.rows[index]} />', PACK_EDIT_PROPS[0]);
  assert.match('<QuoteLineMoneyCells showPacks={showPacks} packEdit={packView?.rows[index]} />', PACK_EDIT_PROPS[1]);
  assert.doesNotMatch('<QuoteLineServiceRounds showPacksPerRound={x} noPackEdit={y} />', new RegExp(PACK_EDIT_PROPS.map((re) => re.source).join('|')));
  assert.match('const view = quoteLinesPackView(lines, products, {});', PACK_EDIT_VIEW);
  assert.match('useMemo(() => historicalZonesPackView(rows, products, { errorsShown }), [rows])', PACK_EDIT_VIEW);
  assert.doesNotMatch('import { quoteLinesPackView } from "@/lib/sales/linePackEdit"; xquoteLinesPackView(x);', PACK_EDIT_VIEW, 'import เฉย ๆ / ชื่อที่ยาวกว่า ไม่ใช่การเรียก');
});

/* ═══ GA select ═══════════════════════════════════════════════════════════════════════════════════ */

test('GA 🔴 select ของ quotation_lines / sales_order_lines ที่เลือก qty ต้องเลือก packQty — เว้นไฟล์ที่ขึ้นทะเบียนยกเว้นพร้อมเหตุ', () => {
  const offenders = []; const unreadable = []; let readCount = 0; const waiverHits = new Set();
  for (const file of APP_FILES) {
    for (const query of lineTableQueries(code(file))) {
      if (query.kind === 'unreadable') { unreadable.push(`${file} (${query.table})`); continue; }
      if (query.kind === 'none') continue;
      readCount += 1;
      if (query.kind !== 'columns' || !missesPack(query.columns)) continue;
      if (file in SELECT_WAIVERS) waiverHits.add(file); else offenders.push(`${file} (${query.table}: ${query.columns.join(', ')})`);
    }
  }
  assert.deepEqual(unreadable, [], 'ยามอ่านอาร์กิวเมนต์ของ .select() ไม่ออก — เขียนเป็นสตริงตรง ๆ หรือค่าคงที่สตริงในไฟล์เดียวกัน (อ่านไม่ออก = ไม่ผ่าน ไม่ใช่ผ่าน)');
  assert.deepEqual(offenders, [],
    'select นี้เลือก qty ของบรรทัดแต่ไม่เลือก packQty — บรรทัดที่มีเลขแพ็คจะถูกอ่านเป็น ×1 เงียบ ๆ: เติม "packQty" แล้วให้ตัวอ่านใช้ lineUnitsTotal / ตัวช่วยของ linePackView');
  assert.deepEqual([...waiverHits].sort(), Object.keys(SELECT_WAIVERS).sort(), 'ไฟล์ยกเว้นที่ไม่ได้ select qty แบบไม่มี packQty แล้ว ต้องถอดออกจากทะเบียน');
  assert.ok(readCount >= SELECTS_READ_FLOOR, `ยามอ่าน select ของสองตารางได้ ${readCount} จุด (เคยได้ ${SELECTS_READ_FLOOR}) — ตัวจับน่าจะเลิกเห็น`);
});

test('GA รายชื่อคอลัมน์ของบรรทัดที่ฝังใน select ของตารางแม่: มี qty ต้องมี packQty (วันนี้มีแต่ (*) กับ (id))', () => {
  const offenders = []; let seen = 0;
  for (const file of APP_FILES) {
    for (const embedded of embeddedLineSelects(code(file))) {
      seen += 1;
      if (missesPack(embedded.columns)) offenders.push(`${file} (${embedded.table}: ${embedded.columns.join(', ')})`);
    }
  }
  assert.deepEqual(offenders, [], 'รายชื่อฝังเลือก qty แต่ไม่เลือก packQty');
  assert.ok(seen >= EMBEDDED_READ_FLOOR, `เจอรายชื่อฝัง ${seen} จุด (เคยเจอ ${EMBEDDED_READ_FLOOR})`);
});

test('GA เหตุของการยกเว้นยังจริง: เลขแพ็คมีได้เฉพาะหมวด 02-001 · ตัวนับกลิ่นอ่านเฉพาะบรรทัดออกแบบกลิ่น · ตัวที่ "โหลดมาเฉย ๆ" ไม่มีใครอ่าน', () => {
  assert.equal(PACK_LINE_CATEGORY, '02-001');
  assert.equal(SCENT_DESIGN_CATEGORIES.includes(PACK_LINE_CATEGORY), false, 'หมวดออกแบบกลิ่นต้องไม่มีหมวดที่มีเลขแพ็ค');
  assert.ok(SCENT_DESIGN_CATEGORIES.length > 0 && SCENT_DESIGN_CATEGORIES.every((codeOf) => /^03-\d{3}$/.test(codeOf)));
  /* เซิร์ฟเวอร์ปฏิเสธเลขแพ็คบนบรรทัดหมวดอื่นเสมอ (ช่องเปิดแล้วก็ตาม) ⇒ บรรทัดออกแบบกลิ่นไม่มีวันมีเลขแพ็ค */
  for (const category of SCENT_DESIGN_CATEGORIES) {
    assert.deepEqual(linePackIssues([{ productId: 'P', fgCode: `FG-321-${category}-0001`, packQty: 2 }], { open: true }).map((issue) => issue.code), ['not_allowed'], category);
  }
  /* ตัวนับกลิ่น: กรองบรรทัดออกแบบกลิ่นก่อนอ่าน qty */
  const scent = code('lib/requests/scentDesignOrders.js');
  const count = scent.slice(scent.indexOf('export function scentCountForOrder'), scent.indexOf('const usedBy'));
  assert.match(count, /const design = scentDesignLines\(lines\);/);
  assert.match(count, /for \(const line of design\) \{\s*const qty = Number\(line\.qty\);/);
  assert.equal((scent.match(/\.qty\b/g) || []).length, 1, 'scentDesignOrders.js อ่าน qty ที่เดียว (ตัวนับกลิ่น)');
  /* soReconcile ถูกเรียกด้วย scentDesignLines(…) เท่านั้น — สองจุด */
  const callers = APP_FILES.filter((file) => file !== 'lib/requests/soReconcile.js' && callArguments(code(file), 'soReconcile').length);
  assert.deepEqual(callers, ['app/requests/[id]/page.js', 'lib/requests/stages.js']);
  for (const file of callers) {
    for (const args of callArguments(code(file), 'soReconcile')) assert.match(args, /^\{ lines: scentDesignLines\(/, `${file}: soReconcile(${args.slice(0, 50)})`);
  }
  /* โหลด qty มาแต่ไม่มีใครอ่าน: ไฟล์และตัวอ่านปลายทางที่ระบุต้องไม่อ่าน .qty — เริ่มอ่านเมื่อไรต้องเลือก packQty และถอดออกจากยกเว้น */
  for (const [waived, readers] of Object.entries(SELECT_WAIVER_UNREAD)) {
    assert.ok(waived in SELECT_WAIVERS, waived);
    for (const file of readers) assert.equal(readsQty(code(file)), false, `${file} เริ่มอ่าน .qty แล้ว — การยกเว้นของ ${waived} ไม่จริงอีกต่อไป`);
  }
});

/* ═══ GB คูณเอง ═══════════════════════════════════════════════════════════════════════════════════ */

test('GB 🔴 ไม่มีไฟล์ไหนคูณ จำนวน × ราคา เอง — ยอดของบรรทัดอ่านจาก lineTotal / quoteLineNet (สูตรมีตัวคูณแพ็ค)', () => {
  const found = APP_FILES.filter((file) => multiplyLines(code(file)).length).sort();
  const offenders = found.filter((file) => !(file in MULTIPLY_ALLOWED)).map((file) => `${file}: ${multiplyLines(code(file))[0].trim().slice(0, 100)}`);
  assert.deepEqual(offenders, [],
    'ไฟล์นี้คูณ จำนวน × ราคา เอง — บรรทัดที่มีเลขแพ็คจะได้ยอดขาดตัวคูณ: ใช้ lineTotal ที่เก็บไว้ หรือ quoteLineNet(line) · ถ้าเป็นตารางอื่นจริง ๆ ขึ้นทะเบียน MULTIPLY_ALLOWED พร้อมเหตุ');
  assert.deepEqual(Object.keys(MULTIPLY_ALLOWED).filter((file) => !found.includes(file)), [], 'ไฟล์ในทะเบียนที่ไม่คูณเองแล้ว ต้องถอดออก');
});

/* ═══ GC ทะเบียนตัวอ่าน (ตั้งต้นที่ปฏิเสธ ทั้งแอป) ════════════════════════════════════════════════════ */

test('GC 🔴 ทุกไฟล์ที่อ่าน .qty ต้องขึ้นทะเบียน: โดเมนที่มีตารางของตัวเอง หรือ QTY_READERS พร้อมชนิด — ไฟล์ใหม่ไม่ผ่านจนกว่าจะบอกว่าอ่านอะไร', () => {
  const readers = APP_FILES.filter((file) => readsQty(code(file)));
  const unknown = readers.filter((file) => !otherTablePrefixOf(file) && !(file in QTY_READERS));
  assert.deepEqual(unknown, [],
    'ไฟล์นี้อ่านจำนวน (.qty) — ถ้าเป็นบรรทัดใบเสนอราคา/ใบสั่งขาย ใช้ lineUnitsTotal (นับหน่วย) หรือตัวช่วยของ linePackView (โชว์) แล้วขึ้นทะเบียน QTY_READERS '
    + 'เป็น units/display/carry · ถ้าเป็นตารางอื่น ขึ้นทะเบียนเป็น "other:<ชื่อตาราง>"');
  /* ไม่ซ้อน: ไฟล์ใต้โดเมนที่มีตารางของตัวเองไม่ต้อง (และห้าม) ขึ้นทะเบียนรายไฟล์ */
  assert.deepEqual(Object.keys(QTY_READERS).filter((file) => otherTablePrefixOf(file)), []);
  /* ไม่ค้าง: ไฟล์ในทะเบียนที่ไม่อ่าน .qty แล้ว ต้องถอดออก · prefix ที่ไม่มีไฟล์อ่าน .qty แล้ว ต้องถอดออก */
  assert.deepEqual(Object.keys(QTY_READERS).filter((file) => !readers.includes(file)), [], 'ไฟล์ในทะเบียนที่ไม่อ่าน .qty แล้ว');
  for (const prefix of Object.keys(OTHER_TABLE_PREFIXES)) {
    assert.ok(readers.some((file) => file.startsWith(prefix)), `prefix ${prefix} ไม่มีไฟล์อ่าน .qty แล้ว — ถอดออก`);
    assert.ok(OTHER_TABLE_PREFIXES[prefix].trim().length >= 5, `${prefix}: ต้องบอกชื่อตาราง`);
  }
  /* ตัวเลขของวันนี้ (บันทึกไว้ให้คนอ่านผลพิสูจน์เห็นว่ายามมองอะไร): อ่าน .qty ทั้งหมด / ใต้ prefix / ในทะเบียน */
  const underPrefix = readers.filter((file) => otherTablePrefixOf(file)).length;
  assert.equal(readers.length, underPrefix + Object.keys(QTY_READERS).length);
  assert.ok(readers.length >= 120, `ยามเห็นไฟล์ที่อ่าน .qty แค่ ${readers.length} ไฟล์ — ตัวจับน่าจะเลิกเห็น`);
});

test('GC ชนิดของแต่ละแถวในทะเบียนถูกบังคับ: units เรียก lineUnitsTotal · display เรียกตัวช่วยฝั่งโชว์ · edit รับกฎฝั่งจอทั้งตาราง + ส่ง prop คู่ · carry พกเลขแพ็ค · ยกเว้น/ตารางอื่นต้องบอกเหตุ', () => {
  const kinds = {};
  for (const [file, entry] of Object.entries(QTY_READERS)) {
    const source = code(file);
    const [kind, ...rest] = entry.split(':');
    const detail = rest.join(':').trim();
    kinds[kind] = (kinds[kind] || 0) + 1;
    if (kind === 'units') assert.match(source, UNITS_HELPER, `${file}: ขึ้นทะเบียนเป็นตัวนับหน่วย แต่ไม่เรียก lineUnitsTotal(`);
    else if (kind === 'display') assert.match(source, DISPLAY_HELPERS, `${file}: ขึ้นทะเบียนเป็นตัวโชว์ แต่ไม่เรียกตัวช่วยของ linePackView`);
    else if (kind === 'edit') {
      assert.equal(detail, '', `${file}: ชนิด edit ไม่มีรายละเอียดต่อท้าย`);
      assert.ok(isScreenFile(file), `${file}: ชนิด edit ใช้กับไฟล์จอ (ตารางโหมดแก้) เท่านั้น`);
      assert.match(source, PACK_EDIT_VIEW, `${file}: ขึ้นทะเบียนเป็นตารางโหมดแก้ แต่ไม่รับกฎฝั่งจอทั้งตาราง (quoteLinesPackView / historicalZonesPackView)`);
      for (const prop of PACK_EDIT_PROPS) assert.match(source, prop, `${file}: ตารางโหมดแก้ต้องส่ง showPacks= และ packEdit= ให้เซลล์ร่วม — ไม่ส่ง = บรรทัดแพ็คถูกวาด/คิดเป็น ×1`);
    } else if (kind === 'carry' && detail === 'pack') assert.match(source, /\bpackQty\b|(?<![\w$])linePackQty\(/, `${file}: ส่งจำนวนของบรรทัดต่อแต่ไม่พกเลขแพ็ค`);
    else if (kind === 'carry') {
      assert.ok(QTY_READERS[detail]?.startsWith('units'), `${file}: ต้นทาง ${detail} ต้องขึ้นทะเบียนเป็น units`);
      assert.doesNotMatch(source, /\.from\(\s*['"`](?:quotation_lines|sales_order_lines)['"`]/, `${file}: ตัวส่งต่อต้องไม่โหลดบรรทัดเอง`);
    } else if (kind === 'waived' || kind === 'other') assert.ok(detail.length >= 5, `${file}: ${kind} ต้องบอก${kind === 'other' ? 'ชื่อตาราง' : 'เหตุ'}`);
    else assert.ok(kind === 'rule' || kind === 'paper', `${file}: ไม่รู้จักชนิด "${entry}"`);
    /* ไฟล์ที่บอกว่าอ่านตารางอื่น ต้องไม่ select qty ของตารางบรรทัดเอง (เว้นไฟล์ที่ GA ยกเว้นพร้อมเหตุ) */
    if (kind === 'other' && !(file in SELECT_WAIVERS)) {
      const own = lineTableQueries(source).filter((query) => query.kind === 'columns' && query.columns.includes('qty'));
      assert.deepEqual(own, [], `${file}: ขึ้นทะเบียนเป็นตารางอื่น แต่ select qty ของตารางบรรทัด`);
    }
  }
  /* ตัวนับที่ต้องมีครบ (ถอดออกจากทะเบียนเงียบ ๆ ไม่ได้) */
  for (const file of ['lib/pm/productionPlan.js', 'lib/service/terms.js', 'lib/sales/forecastBreakdown.js']) {
    assert.equal(QTY_READERS[file], 'units', file);
  }
  assert.match(code('lib/excise/soFiling.js'), UNITS_HELPER, 'ใบยื่นสรรพสามิตนับหน่วยรวมของบรรทัด');
  assert.equal(readsQty(code('lib/excise/soFiling.js')), false, 'soFiling.js ไม่อ่าน line.qty ตรง ๆ แล้ว');
  assert.equal(QTY_READERS['lib/sales/serviceSetup.js'], 'display', 'ตัวเทียบของตารางงานบริการยังอยู่ในทะเบียน');
  /* งวด PR-5 (G4): หกไฟล์ของใบสั่งขายย้อนหลังถือชนิดจริงรายแถว — เปลี่ยนกลับเป็น waived / other / ถอดแถว = แดงที่นี่ (ไม่ใช่เงียบ)
     และแถวยกเว้นของทั้งทะเบียนเหลือสองไฟล์ที่รู้จัก (ตัวนับกลิ่นของหมวด 03-xxx) — "ยกเว้น" ไม่ใช่ทางลัดของไฟล์ที่อ่านบรรทัดใบสั่งขายย้อนหลังอีกต่อไป */
  for (const [file, kind] of HISTORICAL_READER_KINDS) {
    assert.equal(QTY_READERS[file], kind, `${file}: ชนิดของตัวอ่านใบสั่งขายย้อนหลังถูกตรึงตั้งแต่งวด PR-5 — บรรทัดของใบย้อนหลังมีเลขแพ็คทุกบรรทัด ห้ามกลับไปยกเว้น`);
  }
  const waived = Object.entries(QTY_READERS).filter(([, entry]) => entry.startsWith('waived:')).map(([file]) => file).sort();
  assert.deepEqual(waived, [...WAIVED_READERS].sort(), 'แถวยกเว้นของทะเบียนเปลี่ยน — แถวใหม่ต้องพิสูจน์ว่าไม่มีทางเจอบรรทัดที่มีเลขแพ็ค แล้วมาเติม WAIVED_READERS พร้อมเหตุ');
  for (const entry of Object.values(QTY_READERS)) assert.doesNotMatch(entry, /PR-5|ใบสั่งขายย้อนหลัง/, 'ไม่เหลือเหตุยกเว้น "จนงวด PR-5" ในทะเบียน');
  assert.equal(kinds.edit, 1, `ตารางโหมดแก้ที่ขึ้นทะเบียนเป็น edit มีขั้น ② ของฟอร์มใบสั่งขายย้อนหลังไฟล์เดียว (ตารางของใบเสนอราคาเป็น display — โชว์เองด้วย) · ${JSON.stringify(kinds)}`);
  assert.ok(kinds.units >= 3 && kinds.display >= 11 && kinds.carry >= 10 && kinds.other >= 30, JSON.stringify(kinds));
});

test('GC 🔴 ไฟล์ที่ขึ้นทะเบียนว่าไม่ได้อ่านบรรทัดที่มีเลขแพ็ค (ตารางอื่น · ยกเว้น · ใต้โดเมนของตัวเอง) แตะ quotation_lines / sales_order_lines เองไม่ได้', () => {
  /* แถวของทะเบียนเป็นคำประกาศ "ไฟล์นี้ไม่เจอบรรทัดที่มีเลขแพ็ค" — ตัวอ่านใหม่ที่ถูกเติมลงไฟล์เดียวกันจะซ่อนอยู่หลังแถวนั้น
     ⇒ ไฟล์กลุ่มนี้ต้องไม่มีทั้ง `.from(<ตารางบรรทัด>)` และรายชื่อฝังของตารางบรรทัด ไม่ว่า select จะเขียนรูปไหน
     เว้นไฟล์ที่ GA ยกเว้นพร้อมเหตุ ซึ่งถูกตรึงจำนวนจุดที่แตะ (LINE_TABLE_TOUCH_PINS) */
  const declared = [
    ...Object.entries(QTY_READERS).filter(([, entry]) => /^(?:other|waived):/.test(entry)).map(([file]) => file),
    ...APP_FILES.filter((file) => otherTablePrefixOf(file)),
  ];
  assert.ok(declared.length >= 100, `ไฟล์ในกลุ่มนี้เหลือ ${declared.length} — ตัวคัดน่าจะเลิกเห็น`);
  const offenders = declared.filter((file) => !(file in LINE_TABLE_TOUCH_PINS) && lineTableTouches(code(file)) > 0);
  assert.deepEqual(offenders, [],
    'ไฟล์นี้ขึ้นทะเบียนว่าอ่านตารางอื่น/ยกเว้น แต่โหลดบรรทัดใบเสนอราคา/ใบสั่งขายเอง — ตัวอ่านใหม่ต้องใช้ lineUnitsTotal หรือตัวช่วยของ linePackView '
    + 'แล้วเปลี่ยนชนิดของแถวในทะเบียนเป็น units/display/carry (หรือย้ายตัวอ่านไปไฟล์ของมันเอง)');
  for (const [file, count] of Object.entries(LINE_TABLE_TOUCH_PINS)) {
    assert.ok(file in SELECT_WAIVERS, `${file}: ตรึงจำนวนจุดได้เฉพาะไฟล์ที่ GA ยกเว้นพร้อมเหตุ`);
    assert.ok(declared.includes(file), `${file}: ไม่ได้อยู่ในกลุ่มที่ข้อนี้ตรวจแล้ว — ถอดออกจาก LINE_TABLE_TOUCH_PINS`);
    assert.equal(lineTableTouches(code(file)), count, `${file}: จำนวนจุดที่แตะตารางบรรทัดเปลี่ยน — คำสั่งใหม่ต้องเลือก packQty และอ่านผ่านตัวช่วย (หรือพิสูจน์เหตุยกเว้นใหม่แล้วแก้ตัวเลขนี้)`);
  }
  /* ตัวจับเห็นของจริง: ไฟล์ที่โหลดบรรทัดอยู่จริงวันนี้ต้องถูกนับ (กันตัวจับเงียบ) */
  for (const file of ['lib/pm/productionJobsRepo.js', 'lib/sales/serviceSetupRepo.js', 'app/api/sales-planning/deals/[id]/quotations/route.js']) {
    assert.ok(lineTableTouches(code(file)) >= 1, `${file}: ตัวจับไม่เห็นคำสั่งของตารางบรรทัด`);
  }
});

/* ═══ GD ตัวโหลด ↔ ตัวอ่าน ════════════════════════════════════════════════════════════════════════ */

test('GD 🔴 ตัวโหลดที่ป้อนตัวนับ/ตัวโชว์เลือก packQty คู่กับ qty และตัวอ่านปลายทางเรียกตัวช่วย — ขาดฝั่งใดฝั่งหนึ่ง = บรรทัดแพ็คถูกอ่านเป็น ×1', () => {
  for (const [loader, table, consumer, helper] of LOADER_PINS) {
    const selects = lineTableQueries(code(loader)).filter((query) => query.table === table && query.kind === 'columns' && query.columns.includes('qty'));
    assert.ok(selects.length >= 1, `${loader}: ไม่เจอ select ของ ${table} ที่เลือก qty (ทะเบียนค้าง หรือ select เปลี่ยนรูป)`);
    for (const query of selects) assert.ok(query.columns.includes('packQty'), `${loader}: select ของ ${table} ไม่มี packQty (${query.columns.join(', ')})`);
    assert.match(code(consumer), helper, `${consumer}: ตัวอ่านของ ${loader} ต้องเรียกตัวช่วยของเลขแพ็ค`);
  }
  /* ตัวอ่านของใบที่โหลดด้วย * (รายการใบเสนอราคาของดีล · หน้าใบ) ได้คอลัมน์มาเองอยู่แล้ว — ยืนยันว่ายังเป็น * */
  assert.match(code('app/api/sales-planning/deals/[id]/quotations/route.js'), /const quoteSelect = '\*, lines:quotation_lines\(\*\)';/);
  /* จอรายการดีล: บรรทัดที่มีเลขแพ็คได้สูตรสามตัว · บรรทัดอื่นนิพจน์เดิมอยู่หลัง ?? ครบ */
  assert.match(code('app/sales-planning/deals/page.js'),
    /<span className="mono">\{linePackFormulaText\(line\) \?\? <>\{line\.qty\} x \{money\(line\.unitPrice\)\}<\/>\}<\/span>/);
});

/* ═══ GE ตัวเขียนของเลขแพ็คบนจอ ═════════════════════════════════════════════════════════════════════ */

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · **มติเจ้าของ 08/10 ข้อ A2: "บังคับใส่"** · แผน IMPL_PLAN_PR3 §4 แถว 16 + §12 C9):
   เดิมด่านนี้ยึดว่า "สวิตช์ปิด · ไม่มีจอไหนเขียนคีย์ packQty · ไม่มีช่องกรอกที่ผูกกับเลขแพ็ค" — วันนี้ช่องกรอกเปิดใช้ ด่านจึงยึด
   "มีตัวเขียน **ตัวเดียว** ที่ขึ้นทะเบียนด้วยชื่อ" แทน: ไฟล์จอที่เขียนคีย์ = ตัวส่งต่อเดิม + เซลล์ร่วมของตารางรายการไฟล์เดียว ·
   ในไฟล์นั้นเขียนคีย์จุดเดียว · หน้าและตัวห่อของตารางไม่เขียนเอง
   ไม่ได้คลายด่าน: ไฟล์จอไฟล์ที่สองที่เขียนคีย์ · ตัวเขียนตัวที่สอง · ช่องเงิน (MoneyInput — รับทศนิยม) ที่ผูกกับเลขแพ็ค ยังแดงเหมือนเดิม */
/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-5 · มติเจ้าของ 23/09 "ต้องไม่ควรแตกต่างจาก form ใบเสนอราคา" + 08/10 ข้อ A1–A2 · ข้อวินิจฉัย 7 ·
   แผน IMPL_PLAN_PR5 §5 แถว G3 ก–ค · จ + §11 F4 / F7): เดิม "ไฟล์จอที่มีตัวเขียน/คอนโทรลผูกกับเลขแพ็คมีไฟล์เดียว (เซลล์ร่วม)" และข้อท้ายของเทสต์นี้
   ยึดว่าฟอร์มใบสั่งขายย้อนหลังไม่เอ่ยชื่อของช่องกรอกสักชื่อ — วันนี้ฟอร์มใบสั่งขายย้อนหลังมีคอลัมน์ "แพ็ค/เดือน" แล้ว (mig 0409) ด่านจึงยึด:
     · ไฟล์จอที่เขียนคีย์ `packQty:` — **เท่าเดิม** (ตัวส่งต่อที่ขึ้นทะเบียน + เซลล์ร่วม)
     · **ตัวเขียนของบรรทัดยังตัวเดียว** (`onPatch?.({ packQty: text })` ของเซลล์ร่วม) — ขั้น ② ใช้ตัวนี้ผ่าน prop ไม่มีตัวที่สอง
     · ไฟล์จอที่มีคอนโทรลผูกกับเลขแพ็ค = เซลล์ร่วม + **ช่องตั้งต้นของแถวใหม่หนึ่งไฟล์ที่ขึ้นทะเบียนด้วยชื่อ** (หน้าต่างเพิ่มหลายโซน — เทสต์ถัดไปยึดว่ามันทำอะไรได้บ้าง)
     · รายชื่อตัวเขียนที่ตัวจับมองหาเพิ่ม `patchRow` / `setRows` · ขั้น ② เข้ารายชื่อ "ไฟล์รอบช่องกรอกที่ห้ามเขียนคีย์เอง"
   ไม่ได้คลายด่าน: ไฟล์จอไฟล์ที่สามที่ผูกคอนโทรลกับเลขแพ็ค · ไฟล์จอไฟล์ที่สองที่เขียนคีย์ · ตัวเขียนตัวที่สอง · ช่องเงิน/ตัวเลือกที่ผูกกับเลขแพ็ค ยังแดงเหมือนเดิม
   · ข้อ "ฟอร์มใบสั่งขายย้อนหลังไม่เอ่ยชื่อของช่องกรอก" ย้ายไปเป็นเทสต์ของมันเองข้างล่าง (ตัวจับยังอยู่ — สี่ชื่อบนโค้ดของสองไฟล์) */
test('GE 🔴 ช่องกรอกเปิด (งวด PR-3 → PR-5): สวิตช์เปิด · จอที่เขียนคีย์ packQty = ตัวส่งต่อที่ขึ้นทะเบียน + เซลล์ร่วมของตารางรายการไฟล์เดียว · ตัวเขียนของบรรทัดตัวเดียว (onPatch ของเซลล์ร่วม) · คอนโทรลที่ผูกเลขแพ็ค = เซลล์ร่วม + ช่องตั้งต้นที่ขึ้นทะเบียนไฟล์เดียว', () => {
  assert.equal(QUOTE_PACK_INPUT_OPEN, true);
  const screens = APP_FILES.filter(isScreenFile);
  assert.ok(screens.length > 300, `เจอไฟล์จอแค่ ${screens.length} ไฟล์`);
  const keyWriters = screens.filter((file) => writesPackKey(code(file))).sort();
  assert.deepEqual(keyWriters, [...Object.keys(PACK_CARRY_FILES), PACK_INPUT_FILE].sort(),
    'ไฟล์จอที่เขียนคีย์ packQty ต้องมีแค่ตัวส่งต่อที่ขึ้นทะเบียน กับเซลล์ร่วมของตารางรายการ — ช่องกรอกที่สอง (หรือหน้าที่ตั้งค่าเลขแพ็คเอง) ต้องไม่มี');
  /* ทุกทางที่จอส่งเลขแพ็คเข้าตัวเขียน (onPatch / setLine / onChange / apiFetch / apiJson / patchRow / setRows) หรือผูกกับคอนโทรลกรอกค่า —
     อยู่ในสองไฟล์ที่ขึ้นทะเบียนด้วยชื่อ: เซลล์ร่วม (ตัวเขียนของบรรทัด) กับหน้าต่างเพิ่มหลายโซนของฟอร์มใบสั่งขายย้อนหลัง (ช่องตั้งต้นของแถวใหม่) */
  const writers = screens.flatMap((file) => packWritePaths(code(file)).map((hit) => [file, hit]));
  assert.deepEqual([...new Set(writers.map(([file]) => file))].sort(), [PACK_INPUT_FILE, PACK_SEED_INPUT_FILE].sort(),
    'ตัวเขียน/คอนโทรลของเลขแพ็คอยู่นอกสองไฟล์ที่ขึ้นทะเบียน — ช่องใหม่ต้องตัดสินตามมติแล้วมาขึ้นทะเบียนที่นี่พร้อมรายชื่อผู้รับ (ไม่ใช่เติมชื่อไฟล์เฉย ๆ)');
  const source = code(PACK_INPUT_FILE);
  // ตัวเขียน: `onPatch?.({ packQty: text })` ครั้งเดียว — ค่าที่เขียนคือข้อความในช่องตามที่คนพิมพ์ (ไม่มีตัวกรองรายปุ่ม — รีวิว 09/10 · ยามของ onChange อยู่ที่ quoteLineCells.test.mjs)
  assert.deepEqual(callArguments(source, 'onPatch').filter((args) => /packQty/.test(args)), [PACK_INPUT_WRITE]);
  assert.equal((source.match(/\bpackQty\s*:/g) || []).length, 1, `${PACK_INPUT_FILE}: เขียนคีย์ packQty ได้จุดเดียว`);
  for (const name of PACK_WRITERS.filter((writer) => writer !== 'onPatch')) {
    assert.deepEqual(callArguments(source, name).filter((args) => /packQty/.test(args)), [], `${PACK_INPUT_FILE}: ${name}(…packQty…) — ตัวเขียนที่สอง`);
  }
  // ตัวเขียนของบรรทัดตัวเดียวทั้งจอ: นอกเซลล์ร่วมไม่มีไฟล์จอไหนเรียกตัวเขียนในรายชื่อด้วยเลขแพ็ค (ช่องตั้งต้นมีแต่แท็กของช่องเอง — เทสต์ถัดไป)
  const callWriters = screens.filter((file) => PACK_WRITERS.some((name) => callArguments(code(file), name).some((args) => /packQty/.test(args))));
  assert.deepEqual(callWriters, [PACK_INPUT_FILE], 'ตัวเขียนของบรรทัด (แพตช์ของแถว · คำขอ API) ที่พกเลขแพ็คมีได้ในเซลล์ร่วมไฟล์เดียว');
  // ช่องกรอก: คอนโทรลที่เอ่ยเลขแพ็คมีได้ไม่เกินหนึ่งแท็ก และต้องเป็น <Input> ธรรมดา — ไม่ใช่ช่องเงิน (รับทศนิยม) ไม่ใช่ตัวเลือก
  const packTags = inputTags(source).filter((tag) => /packQty/.test(tag));
  assert.ok(packTags.length <= 1, `${PACK_INPUT_FILE}: มีคอนโทรลที่ผูกกับเลขแพ็ค ${packTags.length} ตัว`);
  for (const tag of packTags) assert.match(tag, /^<Input\b/, 'ช่อง "แพ็ค/เดือน" ต้องเป็นคอนโทรลจำนวนเต็ม (Input) ไม่ใช่ MoneyInput / Select');
  for (const file of screens) {
    for (const tag of inputTags(code(file))) {
      if (/^<(?:MoneyInput|Select|select|SearchableSelect|textarea|Textarea)\b/.test(tag)) assert.doesNotMatch(tag, /packQty|packEdit/, `${file}: ${tag.slice(0, 60)}`);
    }
  }
  /* หน้าสร้าง · หน้าแก้ · ตัวห่อของตาราง · hook ของด่านฝั่งจอ · ขั้น ② ของฟอร์มใบสั่งขายย้อนหลัง: ไม่เขียนคีย์เอง
     (เลขแพ็คเดินทางไปกับบรรทัดทั้งก้อน — payload ของสองหน้าไม่ถูกแตะ · แถวของขั้น ② รับแพตช์จากเซลล์ร่วม) */
  for (const file of PACK_NON_WRITERS) assert.doesNotMatch(code(file), /\bpackQty\s*:/, `${file}: ห้ามเขียนคีย์ packQty`);
  /* ตัวส่งต่อที่ขึ้นทะเบียน: พกค่าที่อ่านมาเท่านั้น (linePackQty(line)) ไม่ตั้งค่าเอง */
  for (const file of Object.keys(PACK_CARRY_FILES)) {
    for (const match of code(file).matchAll(/\bpackQty\s*:\s*([^,}\n]+)/g)) assert.equal(match[1].trim(), 'linePackQty(line)', `${file}: ${match[0]}`);
  }
});

/* ⭐ ของใหม่ของงวด PR-5 (มติ D8 · แผน IMPL_PLAN_PR5 §2.7 + §5 แถว G3 ข · §11 F7 / R8 · มติเจ้าของ 08/10 ข้อ A2 + ข้อ 5 "ไม่มีค่าตั้งต้นเงียบ"):
   หน้าต่าง "เพิ่มหลายโซน" ของฟอร์มใบสั่งขายย้อนหลังมีช่อง "แพ็ค/เดือน (ทุกบรรทัด)" — ช่องกรอกที่สองของทั้งแอปที่ผูกกับเลขแพ็ค ขึ้นทะเบียนโดยเจตนา
   เพราะลูกค้ามี 43–247 โซน (กรอกทีละบรรทัดไม่ไหว) · สิ่งที่ทำให้มัน **ไม่ใช่ตัวเขียนตัวที่สอง** คือรายการข้างล่าง ซึ่งเทสต์นี้ยึดทุกข้อ:
     · คอนโทรลเดียว เป็น <Input type="text" inputMode="numeric"> (เก็บทุกตัวอักษรเหมือนช่องในตาราง — ไม่ใช่ช่องเงิน/type="number"/maxLength)
     · ไฟล์ไม่เขียนคีย์ของเลขแพ็ค และไม่เรียกตัวเขียนตัวไหนด้วยเลขแพ็ค
     · ค่าของช่องไปได้แค่: ตัวตั้งค่าของช่องเอง (ล้างตอนเปิด · ข้อความที่พิมพ์ทั้งก้อน) กับผู้รับปิดห้าตัวของ lib ฟอร์ม — **ผู้รับตัวที่หก = แดง**
       (ดูวงเล็บชั้นในสุดที่ครอบตัวระบุ: `T.qtyHint(historicalBulkQtyUnit(packQty, …))` = ส่งให้ตัวใน) · การเรียกชั้นนอกที่ครอบผู้รับอยู่มีได้สองตัวตามแผน
     · แถวใหม่เกิดจาก `historicalBulkAddRows` ของ lib เท่านั้น แล้วเข้าขั้น ② ทาง `onAdd` (ต่อท้าย — ไม่แตะแถวที่มีอยู่) */
test('GE 🔴 งวด PR-5 ช่องตั้งต้นของแถวใหม่ (หน้าต่างเพิ่มหลายโซนของฟอร์มใบสั่งขายย้อนหลัง): คอนโทรลเดียวเป็น Input ข้อความ · ไม่เขียนคีย์ ไม่เรียกตัวเขียน · ค่าของช่องไปได้แค่ตัวตั้งค่าของช่องกับผู้รับปิดห้าตัวของ lib (ตัวที่หก = แดง)', () => {
  const source = code(PACK_SEED_INPUT_FILE);
  /* คอนโทรลเดียว และเป็นช่องข้อความ */
  const hits = packWritePaths(source);
  assert.equal(hits.length, 1, `${PACK_SEED_INPUT_FILE}: ต้องมีแค่แท็กของช่องเอง — เจอ ${JSON.stringify(hits)}`);
  const tags = inputTags(source).filter((tag) => /packQty/.test(tag));
  assert.equal(tags.length, 1, `${PACK_SEED_INPUT_FILE}: คอนโทรลที่ผูกกับเลขแพ็คต้องมีตัวเดียว`);
  const [tag] = tags;
  assert.match(tag, /^<Input\b/, 'ช่องตั้งต้นต้องเป็น Input ธรรมดา (ไม่ใช่ MoneyInput / Select)');
  assert.match(tag, /\stype="text"\s/);
  assert.match(tag, /\sinputMode="numeric"\s/);
  assert.doesNotMatch(tag, /type="number"|maxLength|\smax=|\smin=|placeholder=|defaultValue/, 'ห้ามสิ่งที่ตัด/เติมค่าก่อนโค้ดเห็น (รีวิว 09/10) และห้ามค่าตั้งต้น/placeholder ที่อ่านเป็นค่า');
  assert.ok(tag.includes(PACK_SEED_VALUE), 'ช่องผูกกับ state ของตัวเอง');
  assert.ok(tag.includes('onChange={(event) => setPackQty(event.target.value)}'), 'onChange เก็บข้อความในช่องทั้งก้อน — ไม่มีเงื่อนไข ไม่มีตัวแปลง');
  /* ไม่เขียนคีย์ · ไม่เรียกตัวเขียน */
  assert.equal(writesPackKey(source), false, `${PACK_SEED_INPUT_FILE}: ห้ามเขียนคีย์ packQty เอง (ส่งด้วย shorthand ให้ lib เท่านั้น)`);
  for (const name of PACK_WRITERS) {
    assert.deepEqual(callArguments(source, name).filter((args) => /packQty/.test(args)), [], `${PACK_SEED_INPUT_FILE}: ${name}(…packQty…) — ช่องตั้งต้นห้ามเป็นตัวเขียน`);
  }
  /* ค่าของช่องถูกส่งให้ใคร — ทุกจุดที่โค้ดเอ่ยตัวระบุ packQty */
  const { hits: uses, balanced } = wordContexts(source, 'packQty');
  assert.equal(balanced, true, 'ยามอ่านวงเล็บของไฟล์ไม่ลง — อ่านไม่ลง = ไม่ผ่าน (ไม่ใช่ผ่าน)');
  const called = uses.filter((use) => use.callees[0]);
  const bare = uses.filter((use) => !use.callees[0]);
  assert.deepEqual([...new Set(called.map((use) => use.callees[0]))].sort(), [...PACK_SEED_SINKS].sort(),
    'ผู้รับค่าของช่องตั้งต้น (วงเล็บชั้นในสุด) ต้องเป็นห้าตัวของ lib ฟอร์มพอดี — ตัวที่หก หรือผู้รับที่เลิกใช้แล้วค้างในทะเบียน = แดง');
  assert.deepEqual([...new Set(uses.flatMap((use) => use.callees).filter(Boolean))].sort(), [...PACK_SEED_SINKS, ...PACK_SEED_WRAPPERS].sort(),
    'การเรียกที่ครอบเลขแพ็คไม่ว่าชั้นไหน = ผู้รับห้าตัว + ตัวห่อสองตัวที่แผนเขียนไว้ (คำใบ้หน่วย · ส่งแถวที่ lib สร้างให้ขั้น ②)');
  /* จุดที่ไม่ได้อยู่ในการเรียกใคร: ประกาศ state กับ value ของช่อง — สองจุดพอดี */
  const labelOf = (use) => (source.startsWith(PACK_SEED_STATE, use.index - 'const ['.length) ? 'state'
    : source.startsWith(PACK_SEED_VALUE, use.index - 'value={'.length) ? 'value'
      : source.slice(Math.max(0, use.index - 20), use.index + 30));
  assert.deepEqual(bare.map(labelOf), ['state', 'value'], 'นอกการเรียกผู้รับ ไฟล์เอ่ยเลขแพ็คได้สองที่: ประกาศ state · value ของช่อง');
  assert.deepEqual(callArguments(source, 'setPackQty').sort(), [...PACK_SEED_SETS].sort(),
    'ตัวตั้งค่าของช่องถูกเรียกสองแบบเท่านั้น: ล้างตอนเปิดหน้าต่าง · ข้อความที่พิมพ์ทั้งก้อน (ไม่มีค่าตั้งต้น ไม่มีตัวกรอง ไม่มีใครเติมค่าให้)');
  /* ผู้รับทั้งห้ามีอยู่จริงใน lib ของฟอร์ม และไฟล์นี้ import จากที่นั่น — ไม่คุยกับกฎของเลขแพ็คโดยตรง (R8) */
  for (const sink of PACK_SEED_SINKS) {
    assert.match(code(PACK_SEED_SINK_LIB), new RegExp(`export function ${sink}\\(`), `${PACK_SEED_SINK_LIB}: ต้อง export ${sink}`);
    assert.match(source, new RegExp(`import \\{[^}]*\\b${sink}\\b[^}]*\\} from "@/lib/sales/historicalIntakeForm";`), `${sink} ต้องมาจาก lib ของฟอร์ม`);
  }
  assert.doesNotMatch(source, /@\/lib\/sales\/linePack|@\/lib\/salesPlanning/, 'หน้าต่างไม่ import กฎของเลขแพ็ค/สูตรเงินเอง — ตัดสินและคิดที่ lib ของฟอร์มที่เดียว');
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-5 · มติเจ้าของ 23/09 "ต้องไม่ควรแตกต่างจาก form ใบเสนอราคา" + 08/10 ข้อ A1–A2 · ข้อวินิจฉัย 7 ·
   แผน IMPL_PLAN_PR5 §5 แถว G3 ง + §11 F4): เดิม (ข้อท้ายของเทสต์ GE งวด PR-3) "ไฟล์ดิบของขั้น ② ไม่เอ่ยเจ็ดชื่อของช่องกรอก — ทั้งโค้ดและคอมเมนต์ ·
   แถวของมันในทะเบียน GC เป็นแถวยกเว้นจนงวด PR-5" — วันนี้ขั้น ② **ต้อง** ส่ง prop คู่ของคอลัมน์ (ข้อความเดียวกับใบเสนอราคา) ด่านจึงยึด:
     · มี prop คู่ครบ (ถอดตัวใดตัวหนึ่ง = ฟอร์มใบสั่งขายย้อนหลังกลับไปคิดยอด ×1 บนจอ)
     · **ตัวจับยังอยู่**: สามชื่อจากเจ็ด (showPacks · packRequired · packEdit) เป็น prop ของขั้น ② เองแล้ว เหลือสี่ชื่อที่โค้ดของขั้น ②
       และของช่องงานบริการของบรรทัดห้ามเอ่ย — ตัวอย่าง "ต้องจับ / ต้องไม่จับ" อยู่ที่ G0
     · ขั้น ② ไม่มีคอนโทรลของตัวเองที่ผูกกับเลขแพ็ค ไม่เรียกตัวเขียนด้วยเลขแพ็ค · แถวของมันในทะเบียน GC เป็นชนิด edit (ถูกบังคับ)
   ไม่ได้คลายด่าน: `patchRow(row.key, { packQty })` · `const packQty = …` · `row.packQty` · hook / โหมดแดงของใบเสนอราคา ในสองไฟล์นี้ ยังแดง
   (เปลี่ยนจาก "ไฟล์ดิบ" เป็น "โค้ดที่ตัดคอมเมนต์แล้ว" เพราะคอมเมนต์ของขั้น ② ต้องอธิบายคอลัมน์นี้ได้ — ชื่อในโค้ดยังห้ามเหมือนเดิม) */
test('GE 🔴 งวด PR-5 ขั้น ② ของฟอร์มใบสั่งขายย้อนหลัง: ส่ง prop คู่ของคอลัมน์ “แพ็ค/เดือน” เหมือนใบเสนอราคา · โค้ดของขั้น ② และของช่องงานบริการของบรรทัดไม่เขียน/ไม่เอ่ยคีย์ของเลขแพ็ค (ตัวเขียนตัวที่สองแบบ shorthand = แดง) · ทะเบียน GC = edit', () => {
  const zones = code(WIZARD_ZONES_FILE);
  /* แท็กของหัวคอลัมน์และของเซลล์เงินในขั้น ② — อย่างละแท็กเดียว (มากกว่า = มีตารางที่สองที่ยามนี้ไม่ได้ดู) */
  const tagOf = (name) => {
    const opens = [...zones.matchAll(new RegExp(`<${name}(?![\\w$])`, 'g'))];
    assert.equal(opens.length, 1, `${WIZARD_ZONES_FILE}: ต้องมี <${name}> แท็กเดียว (เจอ ${opens.length})`);
    return zones.slice(opens[0].index, zones.indexOf('/>', opens[0].index) + 2);
  };
  assert.ok(tagOf('QuoteLineHeadCells').includes(WIZARD_PACK_PROPS[0]), `${WIZARD_ZONES_FILE}: หัวตารางต้องรับ ${WIZARD_PACK_PROPS[0]} (ไม่ส่ง = ไม่มีหัวคอลัมน์ “แพ็ค/เดือน”)`);
  for (const prop of WIZARD_PACK_PROPS) {
    assert.ok(tagOf('QuoteLineMoneyCells').includes(prop), `${WIZARD_ZONES_FILE}: เซลล์เงินต้องรับ ${prop} — ไม่ส่ง = ไม่มีช่อง “แพ็ค/เดือน” และยอดบนจอคิด ×1`);
    assert.ok(code('components/salesPlanning/QuotationLineItems.js').includes(prop), `ตารางของใบเสนอราคาส่ง ${prop} ข้อความเดียวกัน`);
  }
  /* ขอบเขตของตัวจับ (รีวิว 12/10 · G3): ทั้งโฟลเดอร์ของฟอร์ม เว้นช่องตั้งต้นที่ขึ้นทะเบียน — ตัวเดินโฟลเดอร์ต้องเห็นไฟล์จริง (รายการสั้นผิดปกติ = แดง ไม่ใช่ผ่านเงียบ)
     และเปลือกที่ประกอบ body ของพรีวิวกับบันทึกต้องอยู่ในรายการ */
  const wizardFiles = APP_FILES.filter((file) => file.startsWith(WIZARD_DIR) && file.endsWith('.js'));
  assert.ok(wizardFiles.length >= 11, `โฟลเดอร์ฟอร์มใบสั่งขายย้อนหลังมีไฟล์ .js แค่ ${wizardFiles.length} — ตัวเดินโฟลเดอร์น่าจะพัง`);
  assert.deepEqual([...WIZARD_PACK_BAN_FILES].sort(), wizardFiles.filter((file) => file !== PACK_SEED_INPUT_FILE).sort(),
    'ตัวจับครอบทุกไฟล์ .js ของโฟลเดอร์ฟอร์ม เว้นช่องตั้งต้นที่ขึ้นทะเบียนไฟล์เดียว');
  for (const file of [WIZARD_ZONES_FILE, WIZARD_SERVICE_FIELDS_FILE, WIZARD_SHELL_FILE]) assert.ok(WIZARD_PACK_BAN_FILES.includes(file), `${file} ต้องอยู่ในขอบเขตของตัวจับ`);
  assert.equal(WIZARD_PACK_BAN_FILES.includes(PACK_SEED_INPUT_FILE), false);
  assert.ok((code(WIZARD_SHELL_FILE).match(/historicalWizardBody\(/g) || []).length >= 2,
    `${WIZARD_SHELL_FILE}: เปลือกคือที่ประกอบ body ของพรีวิวและของการบันทึก — ถ้าย้ายที่ประกอบ ไฟล์ปลายทางต้องอยู่ในขอบเขตนี้ด้วย`);
  for (const file of WIZARD_PACK_BAN_FILES) {
    assert.doesNotMatch(code(file), WIZARD_PACK_BAN,
      `${file}: โค้ดห้ามเอ่ยคีย์ของเลขแพ็ค / กฎรายบรรทัด / hook / prop โหมดแดงของใบเสนอราคา — ตัวเขียนของเลขแพ็คคือ onPatch ของเซลล์ร่วมตัวเดียว`);
    assert.deepEqual(packWritePaths(code(file)), [], `${file}: ไม่มีตัวเขียน/คอนโทรลของตัวเองที่ผูกกับเลขแพ็ค`);
    assert.equal(writesPackKey(code(file)), false, `${file}: ห้ามเขียนคีย์ packQty`);
  }
  /* ตัวจับเห็นไฟล์จริง (กันตัวจับเงียบเพราะไฟล์ว่าง/ย้าย): ขั้น ② เรียกตัวแก้แถวของตัวเองจริง และช่องงานบริการ export ชิปรับค่าจริง */
  assert.ok(callArguments(zones, 'patchRow').length >= 5, `${WIZARD_ZONES_FILE}: ตัวจับต้องเห็นการเรียก patchRow จริง`);
  assert.ok(callArguments(zones, 'setRows').length >= 5, `${WIZARD_ZONES_FILE}: ตัวจับต้องเห็นการเรียก setRows จริง`);
  assert.match(code(WIZARD_SERVICE_FIELDS_FILE), /export function HistoricalSeedChip\(/);
  /* ทะเบียน GC: ขั้น ② เป็นตารางโหมดแก้ (ชนิดถูกบังคับในด่าน GC ข้อสอง) — ไม่ใช่แถวยกเว้นอีกต่อไป */
  assert.equal(QTY_READERS[WIZARD_ZONES_FILE], 'edit', 'ขั้น ② ของฟอร์มใบสั่งขายย้อนหลังขึ้นทะเบียนเป็นตารางโหมดแก้ตั้งแต่งวด PR-5 (เดิมแถวยกเว้น)');
  assert.equal(WIZARD_SERVICE_FIELDS_FILE in QTY_READERS, false, 'ช่องงานบริการของบรรทัดไม่อ่านจำนวนของบรรทัด (ถ้าเริ่มอ่าน ด่าน GC ข้อหนึ่งจะถามชนิด)');
});

/* งวด PR-3: รายการไม่ขยับ — ด่านใหม่ (ยื่น · อนุมัติ · ส่ง · บันทึก) เรียก linePackIssues กับบรรทัดทั้งก้อน ไม่เอ่ยชื่อคีย์ และไม่มี route ไหนอ่าน/ตั้ง/ล้างเลขแพ็คเอง */
test('GE ใต้ app/api/ มีแต่ทางก๊อปของงวด PR-1 กับตัวโหลด/ตัวส่งต่อของงวด PR-2 ที่เอ่ย packQty — ไม่มี route ไหนอ่านเลขแพ็คจากคำขอหรือเขียนมันเอง (ด่านของงวด PR-3 ไม่เอ่ยชื่อคีย์)', () => {
  const mentions = APP_FILES.filter((file) => file.startsWith('app/api/') && /\bpackQty\b/.test(code(file))).sort();
  assert.deepEqual(mentions, API_PACK_FILES, 'route ใหม่เอ่ย packQty — ถ้าเป็นตัวโหลดให้ขึ้น LOADER_PINS · ทางเขียนต้องผ่านตัว normalize + ด่าน linePackIssues (ไม่แตะคีย์เอง)');
  /* ตัวโหลดเอ่ยเลขแพ็คในข้อความ select เท่านั้น — ไม่อ่านจากคำขอ ไม่เขียนลงแถว */
  for (const [loader] of LOADER_PINS.filter(([file]) => file.startsWith('app/api/'))) {
    const outsideStrings = code(loader).replace(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g, "''");
    assert.doesNotMatch(outsideStrings, /\bpackQty\b/, `${loader}: เอ่ย packQty นอกข้อความ select`);
  }
  for (const file of mentions) assert.doesNotMatch(code(file), /body\??\.packQty|json\(\)[^;]*packQty/, `${file}: route ห้ามอ่านเลขแพ็คจากคำขอเอง — บรรทัดเข้าทางตัว normalize เท่านั้น`);
});
