// ── หน้าพื้นที่ (`SurveyZonePage`) — ยามของชุดแก้หลังตรวจจอ S2b กลุ่ม B ─────────────────────────────────────────────
//
// head-r3-25 กดบันทึกแล้วชน = จอพาไปที่ป้ายชน · head-r3-26 ช่องกรอกล็อกระหว่างบันทึก · planner-minor-1 ไม่มีช่องโหว่ใต้การ์ดภาพแบบ ·
// planner-minor-4 ขีดของช่องว่างหน้าตาเดียวกัน · head-r3-28 จัดผัง 768 เมื่อแผงแบบอยู่ในช่องภาพแบบ + ท้ายหน้า 1200 ไม่หักสามบรรทัด
//
// ⭐ Node ล้วน เรนเดอร์ JSX ไม่ได้ ⇒ ตรึงซอร์สหลังตัดคอมเมนต์ · ส่วนผังกริดใช้ **ตัวจำลองการวางแถวของกริด** (ย่อจากสเปก CSS Grid
//   §12 สำหรับสองคอลัมน์ที่มีแถวยืดหยุ่นแถวเดียว) ป้อนความสูงการ์ดที่วัดจากภาพจอตรวจ ⇒ ยามบอกเป็นพิกเซลว่ามีช่องโหว่ตรงไหน
//   ไม่ใช่แค่ว่า "แม่แบบเขียนแบบนี้" · ภาพจอจริงยังต้องถ่ายซ้ำตอนรวมงาน (Integrate: 1440 · 768 · 1200)
// ⚠️ สตริง/regex ในไฟล์นี้ห้ามมีทับตามด้วยดอกจันติดกัน (ตัวตัดคอมเมนต์กลืนโค้ดที่เหลือ)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const css = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
const count = (src, needle) => src.split(needle).length - 1;
const slice = (src, from, to) => {
  const start = src.indexOf(from);
  assert.ok(start !== -1, `หา "${from}" ไม่เจอ`);
  const end = src.indexOf(to, start + from.length);
  assert.ok(end !== -1, `หา "${to}" หลัง "${from}" ไม่เจอ`);
  return src.slice(start, end);
};
// แท็กเปิดของ JSX ทั้งแท็ก — นับวงเล็บปีกกา เพราะ `=>` / `>` ในค่า prop ไม่ใช่จุดปิดแท็ก
const jsxOpenTags = (src, start) => [...src.matchAll(start)].map((m) => {
  let depth = 0;
  for (let i = m.index + 1; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') depth -= 1;
    else if (src[i] === '>' && depth === 0) return src.slice(m.index, i + 1);
  }
  return src.slice(m.index);
});
// เนื้อของกฎ CSS ตามตัวเลือกตรงตัว (ตัวแรกที่เจอ)
const ruleBody = (sheet, selector) => {
  const at = sheet.indexOf(`${selector} {`);
  assert.ok(at !== -1, `ไม่มีกฎ ${selector}`);
  return sheet.slice(at + selector.length + 2, sheet.indexOf('}', at));
};

const ZONE = code(read('../../components/service/SurveyZonePage.js'));
const ZONE_CSS = css('../../components/service/SurveyZonePage.module.css');
const SAVE = slice(ZONE, 'const save = async', 'const title = surveyZoneTitle(');

/* ══ ตัวจำลองผังกริด — สองคอลัมน์ · แถว `auto` กับ `1fr` (แถวยืดหยุ่นแถวเดียว) · ความสูงคอนเทนเนอร์ไม่กำหนด (หน้าเลื่อน) ═══════════
   ย่อจากอัลกอริทึมขนาดแทร็กของ CSS Grid (§12.5–12.7):
   ① แถว = ความสูงของการ์ดที่อยู่แถวเดียว (ไม่คร่อม) ที่สูงที่สุดในแถวนั้น
   ② การ์ดที่คร่อมหลายแถว **ไม่โดนแถวยืดหยุ่น** — ส่วนที่ยังขาดเทให้แถวที่ไม่มีการ์ดแถวเดียวก่อน (เพดานยังไม่ถูกตั้ง) ไม่งั้นหารเท่า
   ③ การ์ดที่คร่อม **แถวยืดหยุ่น** — ส่วนที่ขาดลงแถว `1fr` แถวเดียว (ขนาด fr = ค่ามากสุดของทุกการ์ดที่ข้ามมัน)
   คืนตำแหน่งบน/ล่างของการ์ดแต่ละใบ (การ์ดไม่ยืดตามแถว — `align-items: start`) */
const GAP = 12; // --space-3 (ช่องของ `.body`)
const parseGrid = (body) => {
  const areas = [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim().split(/\s+/));
  const rowsDecl = body.match(/grid-template-rows:\s*([^;]+);/);
  const rows = rowsDecl ? rowsDecl[1].trim().split(/\s+/) : areas.map(() => 'auto');
  assert.equal(rows.length, areas.length, 'จำนวนแถวของ grid-template-rows ต้องเท่าแม่แบบพื้นที่');
  return { areas, rows };
};
const layoutOf = ({ areas, rows }, heights) => {
  const items = Object.entries(heights).map(([name, h]) => {
    const cells = areas.flatMap((line, r) => line.map((n, c) => (n === name ? { r, c } : null))).filter(Boolean);
    assert.ok(cells.length, `ไม่มีพื้นที่ "${name}" ในแม่แบบ`);
    const rs = cells.map((x) => x.r);
    return { name, h, from: Math.min(...rs), to: Math.max(...rs) };
  });
  const flex = rows.map((t) => t.endsWith('fr'));
  assert.ok(flex.filter(Boolean).length <= 1, 'ตัวจำลองรองรับแถวยืดหยุ่นแถวเดียว (สองแถว fr = สูงเท่ากันทุกแถว — ผังที่ทายไม่ได้)');
  const size = rows.map(() => 0);
  const single = items.filter((it) => it.from === it.to);
  for (const it of single) size[it.from] = Math.max(size[it.from], it.h);
  const hasSingle = rows.map((_, r) => single.some((it) => it.from === r));
  const crossesFlex = (it) => flex.slice(it.from, it.to + 1).some(Boolean);
  const spanning = items.filter((it) => it.from !== it.to && !crossesFlex(it)).sort((a, b) => (a.to - a.from) - (b.to - b.from));
  for (const it of spanning) {
    const span = [...Array(it.to - it.from + 1).keys()].map((k) => it.from + k);
    const extra = it.h - span.reduce((s, r) => s + size[r], 0) - GAP * (span.length - 1);
    if (extra <= 0) continue;
    const open = span.filter((r) => !hasSingle[r]);
    const into = open.length ? open : span;
    for (const r of into) size[r] += extra / into.length;
  }
  const fr = flex.indexOf(true);
  if (fr !== -1) {
    for (const it of items.filter(crossesFlex)) {
      let need = it.h - GAP * (it.to - it.from);
      for (let r = it.from; r <= it.to; r += 1) if (r !== fr) need -= size[r];
      size[fr] = Math.max(size[fr], need);
    }
  }
  const tops = [];
  rows.forEach((_, r) => { tops[r] = r === 0 ? 0 : tops[r - 1] + size[r - 1] + GAP; });
  return Object.fromEntries(items.map((it) => [it.name, { top: tops[it.from], bottom: tops[it.from] + it.h }]));
};
const gapBetween = (box, upper, lower) => box[lower].top - box[upper].bottom;

/* ความสูงการ์ดที่วัดจากภาพจอตรวจ (px) */
// planner-minor-1 · S14/b-caseA-1440-zone3-empty (ผู้วางคิว · บานขวาสองคอลัมน์ · พื้นที่จากแบบอ่านอย่างเดียว · แผงอยู่เหนือบาน)
const PLANNER_1440 = { size: 222, wide: 107, spots: 95, note: 97 };
// head-r3-28 · S01/zone2-768-full (หัวหน้า · หน้าเต็มจอ · แผง "แบบจากฝ่ายขาย" กางอยู่ในช่องภาพแบบ ~1,460px)
const HEAD_768_OPEN = { size: 334, wide: 1468, spots: 146, note: 176, cut: 44 };
// แผงพับ (ค่าตั้งต้นบนจอ <1000 ตามมติ head-r3-31) — ช่องภาพแบบเหลือ ~ช่องรูป + บรรทัดด่าน + หัวแผง
const HEAD_768_FOLDED = { size: 334, wide: 380, spots: 146, note: 176, cut: 44 };

/* ══ head-r3-25 — กดบันทึกแล้วชน: จอพาไปที่ป้ายชนและโฟกัสป้าย ══════════════════════════════════════════════════════ */

test('🔴 head-r3-25: กดบันทึกแล้วชน = ป้ายชนขึ้นกลางจอและรับโฟกัส · แถวใหม่ที่ไหลเข้ามาเองระหว่างพิมพ์ไม่ดึงโฟกัส', () => {
  assert.match(ZONE, /const conflictRef = useRef\(null\);/);
  assert.match(ZONE, /const \[conflictJump, setConflictJump\] = useState\(0\);/);
  assert.match(ZONE, /useEffect\(\(\) => \{\s*if \(!conflictJump\) return;\s*conflictRef\.current\?\.scrollIntoView\(\{ block: "center" \}\);\s*conflictRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*\}, \[conflictJump\]\);/,
    'นับรอบ — ชนซ้ำรอบสองต้องพากลับไปอีก · เลื่อนก่อนแล้วโฟกัสแบบไม่เลื่อนซ้ำ (ท่าเดียวกับ staleRef ของตารางสรุปส่งผล)');
  const [notice] = jsxOpenTags(ZONE, /<p className=\{styles\.conflict\}/g);
  assert.equal(notice, '<p className={styles.conflict} role="status" ref={conflictRef} tabIndex={-1}>',
    'ป้ายรับโฟกัสจากโค้ดได้แต่ไม่อยู่ในลำดับ Tab');
  // ทางเดียวที่พาจอไป = ป้ายชนที่เกิดจากการกดบันทึก (409 หลังลองซ้ำแล้ว)
  assert.equal(count(ZONE, 'setConflictJump('), 1);
  assert.match(SAVE, /setConflict\(true\);\s*setConflictJump\(\(n\) => n \+ 1\);\s*return;/);
  // แถวใหม่ที่ตัวรับแถวตัดสินว่า "ชน" ระหว่างที่คนกำลังพิมพ์ = ขึ้นป้ายเฉย ๆ ไม่ย้ายโฟกัสออกจากช่องที่พิมพ์อยู่
  assert.match(ZONE, /else if \(verdict === "conflict"\) setConflict\(true\);\n/);
  // วงโฟกัสเฉพาะคีย์บอร์ด · บานขวาจอดใต้แถบบนของแอปกับหัวบานที่ติดบน
  assert.match(ZONE_CSS, /\.conflict:focus \{ outline: none; \}/);
  assert.match(ZONE_CSS, /\.conflict:focus-visible \{ outline: 2px solid var\(--accent-ink\); outline-offset: 2px; \}/);
  assert.match(ZONE_CSS, /\.page\[data-layout="pane"\] \.conflict \{ scroll-margin-top: calc\(var\(--scroll-anchor-top\) \+ var\(--survey-zone-head-h\)\); \}/);
});

/* ══ head-r3-26 — ระหว่างบันทึก ช่องกรอกทุกช่องล็อก (พื้นที่จากแบบและพื้นที่ลงหน้างาน) ═══════════════════════════════════ */

test('🔴 head-r3-26: ระหว่างบันทึก ทุกช่องกรอกและทุกปุ่มที่แก้ร่างดับ — ไม่ใช่แค่ปุ่มบันทึก · รูปไม่ล็อก (ขึ้นระบบทันที)', () => {
  assert.match(ZONE, /const \[sending, setSending\] = useState\(false\);\s*const saving = busy \|\| sending;/,
    'คลุมทั้งรอบของ save (รวมลองซ้ำหลัง 409) และคำขอ + โหลดใหม่ของหน้าแม่');
  // ตั้งธงหลังด่านที่ไม่ยิงคำขอ (ร่างที่ server จะตีกลับ · ไม่มีส่วนไหนต่างจากฐาน) · ปลดในบล็อก finally ทุกทางออก
  assert.ok(SAVE.indexOf('setSending(true)') > SAVE.indexOf('setError(plan.blocker'));
  assert.ok(SAVE.indexOf('setSending(true)') > SAVE.indexOf('let payload = pick(baseRef.current?.sig);'));
  assert.match(SAVE, /setSending\(true\);\s*try \{\s*for \(let attempt = 0; attempt < 2; attempt \+= 1\) \{/);
  assert.match(SAVE, /\} finally \{\s*setSending\(false\);\s*\}\s*\};\s*$/);

  // ช่องกรอกทุกช่องของหน้า: ขนาด ก/ย/ส · ชื่อส่วน · ชื่อจุด · บันทึกของจุด · หมายเหตุ
  const fields = jsxOpenTags(ZONE, /<(Input|Textarea)\b/g);
  assert.equal(fields.length, 5);
  for (const tag of fields) assert.match(tag, /\bdisabled=\{saving\}/, tag);
  // ปุ่มที่แก้ร่าง: เพิ่มส่วน · เพิ่มจุด (ลงหน้างาน + จากแบบ) · ตั้งชื่อส่วน · ลบส่วน · ลบจุด (จากแบบ) · เมนู ⋯ ของจุด (ลงหน้างาน)
  const addRows = jsxOpenTags(ZONE, /<button type="button" className=\{styles\.addRow\}/g);
  assert.equal(addRows.length, 3);
  for (const tag of addRows) assert.match(tag, /\bdisabled=\{saving\}/, tag);
  const icons = jsxOpenTags(ZONE, /<button type="button" className=\{styles\.iconBtn\}/g);
  const draftIcons = icons.filter((tag) => /aria-label=\{`(ตั้งชื่อ\$\{row\.name\}|ลบ\$\{row\.name\}|ลบจุดที่ )/.test(tag));
  assert.equal(draftIcons.length, 3);
  for (const tag of draftIcons) assert.match(tag, /\bdisabled=\{saving\}/, tag);
  const [spotMenu] = jsxOpenTags(ZONE, /<RowActionMenu\b/g);
  assert.match(spotMenu, /\bbusy=\{saving\}/);
  // ลบไฟล์เดิมเป็นคำขอของตัวเอง (ไม่ใช่ร่าง) — ดับเฉพาะไฟล์ที่กำลังลบตามเดิม
  const oldFile = icons.find((tag) => tag.includes('ลบ ${file.name}'));
  assert.match(oldFile, /disabled=\{removingFile === file\.id\}/);
  // รูปขึ้นระบบทันที ไม่รอปุ่มบันทึก (สองกฎการบันทึก) ⇒ แผงไฟล์แนบไม่ผูกกับธงนี้
  for (const tag of jsxOpenTags(ZONE, /<AttachmentsPanel\b/g)) assert.doesNotMatch(tag, /saving/, tag);

  // ปุ่มที่ดับ: ไม่มีพื้นชี้เมาส์ · ปุ่มลบไม่แดง — กฎอยู่หลังกฎ hover ทุกตัว (ความจำเพาะเท่ากัน ตัวหลังชนะ)
  const off = ZONE_CSS.indexOf('.addRow:disabled,\n.iconBtn:disabled,\n.iconBtn[data-tone="danger"]:disabled {');
  assert.ok(off !== -1, 'มีกฎปุ่มดับของหน้าพื้นที่');
  for (const hover of ['.addRow:hover', '.iconBtn:hover', '.iconBtn[data-tone="danger"]:hover']) {
    assert.ok(ZONE_CSS.indexOf(hover) !== -1 && ZONE_CSS.indexOf(hover) < off, `${hover} ต้องมาก่อนกฎปุ่มดับ`);
  }
  assert.match(ZONE_CSS.slice(off), /^[^}]*color: var\(--text-3\);[^}]*cursor: progress;/);
});

/* ══ planner-minor-1 · head-r3-28 — ผังสองคอลัมน์ของพื้นที่จากแบบ ═══════════════════════════════════════════════════════ */

// อ่านแม่แบบในตัวเทสต์ (ไม่ใช่ระดับไฟล์) — กฎที่หายไปตกเฉพาะข้อของมัน ไม่ล้มทั้งไฟล์
const deskGrid = () => parseGrid(ruleBody(ZONE_CSS, '.body:has(> [data-area="plan"])'));
const panelGrid = () => parseGrid(ruleBody(ZONE_CSS, '.body[data-drawings]'));

test('planner-minor-1: บานขวา 1440 ของผู้วางคิว — หมายเหตุต่อใต้การ์ดภาพแบบด้วยช่องปกติ · การ์ด ③ ต่อใต้การ์ด ① (① ③ ซ้าย · ② ④ ขวา)', () => {
  const DESK = deskGrid();
  assert.deepEqual(DESK.areas, [['size', 'wide'], ['size', 'note'], ['spots', 'note'], ['spots', 'cut']]);
  assert.deepEqual(DESK.rows, ['auto', '1fr', 'auto', 'auto']);
  const box = layoutOf(DESK, PLANNER_1440);
  assert.equal(gapBetween(box, 'wide', 'note'), GAP, 'ไม่มีช่องโหว่ใต้การ์ดภาพแบบ (เดิม ~140px ในภาพจอตรวจ)');
  assert.equal(gapBetween(box, 'size', 'spots'), GAP);
  assert.equal(box.size.top, 0);
  assert.equal(box.wide.top, 0);
  // แม่แบบเดิมของงวด S2b ให้ช่องโหว่จริงตามภาพจอ (ภาพแบบจบ y≈1050 · หมายเหตุเริ่ม y≈1190) — ตัวจำลองต้องเห็นมัน (ยามของตัวจำลองเอง)
  const shipped = parseGrid('"size wide" "spots wide" "spots note" "spots cut"; grid-template-rows: auto 1fr auto auto;');
  assert.equal(gapBetween(layoutOf(shipped, PLANNER_1440), 'wide', 'note'), PLANNER_1440.size - PLANNER_1440.wide + 2 * GAP);
});

test('head-r3-28 (768): แผงแบบอยู่ในช่องภาพแบบ — ① ③ ④ ทางออก ซ้อนชิดฝั่งซ้าย · ② กินทั้งคอลัมน์ขวา · หมายเหตุอยู่ข้างแผงทั้งตอนกางและพับ', () => {
  const WITH_PANEL = panelGrid();
  assert.deepEqual(WITH_PANEL.areas, [['size', 'wide'], ['spots', 'wide'], ['note', 'wide'], ['cut', 'wide']]);
  assert.deepEqual(WITH_PANEL.rows, ['auto', 'auto', 'auto', '1fr']);
  for (const heights of [HEAD_768_OPEN, HEAD_768_FOLDED]) {
    const box = layoutOf(WITH_PANEL, heights);
    assert.equal(gapBetween(box, 'size', 'spots'), GAP);
    assert.equal(gapBetween(box, 'spots', 'note'), GAP);
    assert.equal(gapBetween(box, 'note', 'cut'), GAP);
    assert.equal(box.wide.top, 0);
    // ตำแหน่งหมายเหตุไม่ขึ้นกับความสูงของแผง — กางหรือพับ หมายเหตุอยู่ที่เดิม (การ์ดไม่สลับฝั่ง ไม่กระโดด)
    assert.equal(box.note.top, heights.size + heights.spots + 2 * GAP);
  }
  assert.ok(layoutOf(WITH_PANEL, HEAD_768_OPEN).note.top < HEAD_768_OPEN.wide, 'แผงกาง: หมายเหตุอยู่ข้างแผง ไม่ถูกดันไปไว้หลังแผง');
  // แม่แบบชุด ก กับแผงที่กาง = อาการในภาพจอตรวจ (หมายเหตุเริ่มหลังแผง ~1,480px) — เหตุที่ต้องมีชุด ข
  const desk = layoutOf(deskGrid(), HEAD_768_OPEN);
  assert.ok(desk.note.top > desk.wide.bottom);

  // ชุด ข ขึ้นเฉพาะตอนแผงอยู่ในช่องภาพแบบจริง — เงื่อนไขเดียวกับบรรทัดที่วาดแผง (หน้าเต็มจอ + พื้นที่จากแบบ + หน้าส่งแผงมา)
  assert.match(ZONE, /<div className=\{styles\.body\} data-drawings=\{drawing && layout === "page" && drawings \? "" : undefined\}>/);
  const drawingBranch = slice(ZONE, '<Section area="plan"', '<Section area="note"');
  assert.match(drawingBranch, /\{layout === "page" && drawings \? drawings : null\}/);
  assert.equal(count(ZONE, 'data-drawings'), 1);
  // คอลัมน์เดียว (บานแคบ · มือถือ) ยังชนะ: ชุด ข อยู่ก่อนกฎทั้งสอง (ความจำเพาะเท่ากัน ตัวหลังชนะ)
  const at = ZONE_CSS.indexOf('.body[data-drawings] {');
  assert.ok(at > ZONE_CSS.indexOf('.body:has(> [data-area="plan"]) {'));
  assert.ok(at < ZONE_CSS.indexOf('.page[data-cols="1"] .body {'));
  assert.ok(at < ZONE_CSS.lastIndexOf('@media (max-width: 680px)'));
  assert.match(ZONE_CSS.slice(ZONE_CSS.lastIndexOf('@media (max-width: 680px)')),
    /\.body:has\(> \[data-area="plan"\]\) \{\s*grid-template-areas: none;\s*grid-template-rows: none;/);
  // ไม่มีเส้นจอใหม่ — ทุกจุดตัดของไฟล์เป็นของระบบ (680)
  const cuts = [...ZONE_CSS.matchAll(/@media\s*\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual([...new Set(cuts)], ['max-width: 680px']);
});

test('head-r3-28 (1200): ท้ายหน้าตัดบรรทัดได้ — บรรทัดสถานะได้แถวของตัวเองเมื่อไม่พอข้างปุ่ม · ปุ่มลงแถวถัดไปชิดขวา', () => {
  const foot = ruleBody(ZONE_CSS, '.foot');
  assert.match(foot, /flex-wrap: wrap;/);
  assert.match(foot, /gap: var\(--space-2\) var\(--space-3\);/, 'ช่องระหว่างแถวแคบกว่าช่องระหว่างคอลัมน์ — แถบติดขอบไม่สูงเกินจำเป็น');
  assert.match(foot, /margin-top: auto;/);
  const acts = ruleBody(ZONE_CSS, '.footActs');
  assert.match(acts, /flex: none;/);
  assert.match(acts, /margin-inline-start: auto;/);
  // บรรทัดสถานะยืดเต็มที่ (ฐาน = ความยาวจริงของประโยค ⇒ ตัวตัดแถวรู้ว่าพอไหม) — ไม่ใช่ความกว้างตายตัว
  assert.match(ruleBody(ZONE_CSS, '.footCopy'), /flex: 1 1 auto;/);
  // ไม่มีปุ่ม = ไม่มีกล่องปุ่ม (กล่องว่างที่ถูกตัดลงแถวสองคือระยะเปล่าใต้บรรทัดสถานะ)
  assert.match(ZONE_CSS, /\.footActs:empty \{ display: none; \}/);
  // มือถือคงเดิม: ปุ่มยืดเต็มแถว (บรรทัดสถานะซ่อนจากตา)
  assert.match(ZONE_CSS.slice(ZONE_CSS.indexOf('@media (max-width: 680px)')), /\.footActs \{ flex: 1 1 auto; \}/);
});

/* ══ planner-minor-4 — ขีดของช่องว่างสองช่องบนหน้าเดียวกันหน้าตาเดียวกัน ════════════════════════════════════════════════ */

test('planner-minor-4: ขีดของ "จุดติดตั้งโดยประมาณ" ที่ว่าง = ขีดตัวเดียวกับ "หมายเหตุพื้นที่" ที่ว่าง (ไม่ใช่ตัวเทาเล็กของ .empty)', () => {
  assert.match(ZONE, /\nconst EMPTY_DASH = naText\(null\);\n/);
  const drawingSpots = slice(ZONE, '<Section area="spots" id={sectionId("spots")} number={3} title={drawing.spots.label}', '</Section>');
  assert.match(drawingSpots, /\{spots\.length === 0 && !edit \? EMPTY_DASH : null\}/);
  assert.doesNotMatch(drawingSpots, /styles\.empty/);
  assert.match(ZONE, /<ReadableText text=\{note\} className=\{styles\.readText\} empty=\{EMPTY_DASH\} \/>/);
  assert.equal(count(ZONE, 'EMPTY_DASH'), 3, 'ประกาศ + สองที่ใช้');
  // ReadableText คืนค่า `empty` ตรง ๆ เมื่อไม่มีข้อความ ⇒ สองที่เป็นตัวหนังสือเปล่าในเนื้อการ์ดแบบเดียวกัน
  assert.match(read('../../components/ui/ReadableText.js'), /if \(!content\) return empty;/);
  // ประโยค "ยังไม่ได้ระบุจุด" ของพื้นที่ลงหน้างานยังเป็นคำบอกตัวเทา (คนละความหมายกับขีด)
  assert.match(ZONE, /<p className=\{styles\.empty\}>ยังไม่ได้ระบุจุด<\/p>/);
});
