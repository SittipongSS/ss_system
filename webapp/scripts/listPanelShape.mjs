#!/usr/bin/env node
/* ── ด่านทรงรายการ LIST_PANEL_SHAPE (มติผู้ใช้ 2026-09-15: รายการทุกชุด = แผงเดียว) ─────────
   รายการทุกชุดวาดเป็น `ListPanel` ใบเดียว: หัว (ไอคอน · ชื่อ · คำอธิบาย | ป้ายจำนวน) →
   แถบเครื่องมือ → เนื้อ (ข้อความผิดพลาด · EmptyState plain · ตาราง/การ์ด/ฟีด) → Pager
   กติกาเต็มอยู่ที่ UI_DESIGN_SYSTEM.md §รายการ — ListPanel

   **hard-zero · test-hosted** (บ้านคือ src/components/ui/listPanelShape.test.mjs ท่าเดียวกับ
   previewCoverage) — ไม่มี `_CAP` ให้ไต่ · ไฟล์ที่ยังไม่ย้ายอยู่ในทะเบียนย้ายรายหน่วย
   `scripts/listPanelPending/<UNIT>.json` ซึ่ง **หดได้อย่างเดียว** (⊆ LIST_PANEL_BASELINE ในเทสต์)

   ใช้: `node scripts/listPanelShape.mjs [ไฟล์…]` — พิมพ์ `file:line rule message` ของไฟล์ที่ระบุ
   (ไม่ระบุ = ทั้งต้นไม้) และออกด้วยรหัส 1 ถ้ามีสักจุด · การตามหาผู้เรียกยังอ่านทั้งต้นไม้เสมอ
   `node scripts/listPanelShape.mjs --adopters` — พิมพ์ JSON ของทุกไฟล์ที่วาด ListPanel (ในไฟล์หรือผ่านคอมโพเนนต์
   ที่ import) = ที่มาของ LIST_PANEL_ADOPTERS ในเทสต์ (แช่แข็งตอนงาน U0-Z 2026-09-15)

   ── อ่านอย่างไร ───────────────────────────────────────────────────────────────
   พาร์สด้วย @babel/parser (ประกาศใน devDependencies) · พาร์สไม่ผ่าน = PARSE violation ไม่ใช่ศูนย์เงียบ
   ชุดที่ตรวจ: `.js` ทุกไฟล์ใต้ src/app และ src/components **ยกเว้น src/components/ui/**`
   (ชั้น primitive เป็นคนวาด .toolbar · .search-glass · Pager เอง) และไฟล์เทสต์

   บทบาทผูกกับ **แหล่งที่ import มาจริง** (resolve `@/` → `src/`, path สัมพัทธ์, ตัด .js,
   ตาม re-export `export { default } from`) ⇒ ตั้งชื่อเล่น (`WorkspaceSection as SaSection`) ไม่หลุด
   และ `import Pager from "./Other"` ไม่ถูกนับเป็น Pager
     WORKSPACE (default ui/Workspace) · LIST_PANEL · SECTION (WorkspaceSection) · DETAIL_CARD ·
     CHART_CARD · PAGER · TABLE (TableScroll) · DATALIST (excise/DataList = ตาราง + Pager) ·
     SKELETON · EMPTY · COUNT_BADGE · CONTROL (FilterPopover · SortMenu · SortDirButton ·
     GroupMenu · CollapseAllButton · SortControl · ViewSwitcher) · RQP · RETIRED (TableShell ·
     TableToolbar · default ของ ui/Table)
   OVERLAY  = คอมโพเนนต์ที่วาด `children` ไว้ใต้ host ที่มี role="dialog"/aria-modal หรือใต้ OVERLAY อีกตัว
              (คำนวณเองเป็นทอด ๆ — ConfirmDialog → Modal · โมดัลตัวใหม่ถูกจับได้โดยไม่ต้องแก้ด่าน)
              หรือ host แบบนั้นในไฟล์เดียวกัน
   ALIAS    = ฟังก์ชันในไฟล์เดียวกันที่ทุก return เป็น element ของบทบาทหนึ่งพร้อม spread props
              หรือส่ง children ต่อ (Section ของหน้าต้นแบบ = SECTION)
   FRAMED   = host ที่ className ไม่คงที่ · มีคลาสที่ globals.css วาดกรอบ+มุมมน · หรือ styles.x
              ที่ .module.css วาดกรอบ+มุมมน

   coverage(element) = เดินขึ้นหา "ผู้ครอบ" ตัวแรก ผ่าน fragment · {} · ?: · && · .map/arrow ·
   const ที่ถือ JSX (ตัดสินทุกจุดที่ใช้) · ช่อง attribute ถูกบันทึกเป็น `ROLE.attr`
   หยุดที่ LIST_PANEL · SECTION · DETAIL_CARD · CHART_CARD · OVERLAY · FRAMED · WORKSPACE
   ถึงรากของคอมโพเนนต์ที่ไม่ใช่หน้า ⇒ ตามผู้เรียกทุกจุด (ไฟล์เดียวกัน + ผู้ import + re-export)
   ลึก ≤ 4 ชั้น กันวน · ผ่านต่อเมื่อ **ทุก** จุดเรียกผ่าน · ไม่มีจุดเรียกที่อ่านได้ = UNRESOLVED
   ⭐ ช่อง attribute ที่ไม่ใช่ children ของคอมโพเนนต์ในชุดที่ตรวจ ⇒ ตามเข้าไปดูว่าคอมโพเนนต์
   วาด prop นั้นไว้ที่ไหน (`<RequestQueuePanel headerActions={<ViewSwitcher/>}>` ⇒ ListPanel.actions)
   ความผิดบันทึกที่ **ไฟล์ของ element** เสมอ — ผู้เรียกแค่ตัดสิน coverage ⇒ คอมโพเนนต์ต้องย้าย
   ในหน่วยเดียวกับผู้เรียกทุกตัว

   ── กฎ (ศูนย์ทุกข้อ) ─────────────────────────────────────────────────────────────
   LP1 WORKSPACE_TOOLBAR          `toolbar` บน Workspace (React ทิ้ง prop ที่ไม่รู้จักเงียบ ๆ)
   LP2 PAGER_OUTSIDE_LIST_PANEL   Pager (รวม Pager ใน DataList ผ่านผู้เรียก) ไม่อยู่ใน ListPanel.children/OVERLAY
   LP3 LIST_CONTROL_OUTSIDE_TOOLBAR  CONTROL · host .search-glass/.toolbar ไม่อยู่ใน ListPanel.toolbar/OVERLAY
       (.toolbar ใน ListPanel.toolbar ก็ผิด — ส่งตัวควบคุม ไม่ใช่ .toolbar ซ้อน) · ข้อเท็จจริงที่ยอม:
       F1 .toolbar ที่มี TableScroll family="editable" เป็นพี่น้องใต้ element แม่ตัวเดียวกัน (ตารางย่อยในฟอร์ม)
          — ไม่มองทะลุคอมโพเนนต์ (ListPanel/WorkspaceSection/DetailCard) · .toolbar ในช่อง attribute ไม่ได้สิทธิ์
       F2 .toolbar ที่เป็นลูกคนเดียวของ SECTION (การ์ดตัวกรองของแดชบอร์ด · คลี่ fragment ก่อนนับ)
       F3 FilterPopover ใน Workspace.headerRight ของไฟล์ที่ไม่มี ListPanel/Pager (ตัวกรองทั้งหน้า)
       F4 ViewSwitcher ใน ListPanel.actions
   LP4 FLOATING_LIST_TABLE        TableScroll (family list/ไม่ระบุ) หรือ DataList ที่ลอยใน Workspace.children/rail
       ของหน้า static route (page.js ไม่มี `[`) · family ที่ไม่ใช่ค่าคงที่ = ผิดในตัว
   LP5 LIST_PANEL_SHAPE           ListPanel ขาด icon/title/count หรือมี spread · EmptyState ไม่ plain ใน
       ListPanel.children · Skeleton ใน ListPanel.children (ใช้ loading) · แผงซ้อนแผง
   LP6 LOADING_UNMOUNTS_TOOLBAR   Workspace loading ในไฟล์ที่มี ListPanel+toolbar · ทางเลือกที่ทางหนึ่ง Skeleton
       อีกทาง ListPanel+toolbar: ?: · && · if/else · `if (…) return <Skeleton/>` + คำสั่งถัดไป · `{x && …}{!x && …}`
       (ตาม const/let/คอมโพเนนต์ฝั่งแผง) · เงื่อนไขที่อ่านแค่ผล accessState() = ด่านสิทธิ์ครั้งแรก ไม่นับ
   LP7 RETIRED_API                import TableShell/TableToolbar/default ของ ui/Table · `sectionHeader` บน RQP
   LP8 RAW_PANEL_MARKUP           host คลาส ui-section* / ui-list-panel* นอก components/ui
   LP9 COUNT_IN_PAGE_HEADER       ป้าย (ui-badge · pill · status-pill · CountBadge) ใน Workspace.headerRight
       ของไฟล์ที่มี ListPanel
   LP-PREVIEW  หน้าต้นแบบอยู่นอก LP2/LP3/LP9 (เป็นแคตตาล็อก primitive) แต่ต้องมี ListPanel ที่มี
       count+toolbar และมี TableScroll+Pager ในเนื้อ พร้อม `<code>ListPanel</code>`
   LP10 ADOPTER_LOCK              LIST_PANEL_ADOPTERS (รายการแช่แข็งในเทสต์ · U0-Z 2026-09-15) = คู่ [ไฟล์, n]
       n = จำนวน element ListPanel ที่เขียน **ในไฟล์เอง** ตอนแช่แข็ง · ตกเมื่อ ไฟล์หายไป · ListPanel ในไฟล์ < n
       (แผงในคอมโพเนนต์ที่ import ไม่นับแทน — contracts ถอยทะเบียนสัญญาแต่ยังวาด RenewalsPanel ต้องตก) ·
       หรือ n = 0 แล้วไม่วาด ListPanel ผ่านคอมโพเนนต์ที่ import เลย (ลึก ≤ 4 · กันวน · ไม่ลงไป components/ui)
       ⇒ ไฟล์ที่ย้ายแล้วถอยกลับเงียบ ๆ ไม่ได้ · เพิ่มแผงไม่ต้องแก้ · ลบหน้า/ย้ายแผงเข้าคอมโพเนนต์/ยุบรายการตามมติ
       = แก้รายการในคอมมิตเดียวกัน · ตรวจเมื่อส่ง `adopters` ให้ scanListPanelShape
       (เทสต์ส่งเสมอ · CLI รายไฟล์ไม่รู้รายการ ⇒ LP10 ตกที่ npm test)

   ── จุดบอดที่รู้ตัว ──────────────────────────────────────────────────────────────
   - คอมโพเนนต์ที่ส่งเป็นค่า / ทะเบียน map (`{ brief: BriefBoard }`) / dynamic import ⇒ UNRESOLVED
   - cloneElement · ชื่อที่ถูกบัง (shadowed identifier) · className ที่ประกอบตอนรัน
   - `children` ของคอมโพเนนต์ถือว่าวางตรงที่ element นั้นวาง (ไม่ตามเข้าไปในคอมโพเนนต์)
   - LP6 ฝั่ง Skeleton ไม่ตามเข้าคอมโพเนนต์ (`<Loader/>` ที่ห่อ Skeleton) · JSX ที่ push ใส่ array
   - ทุกความผิดมี `panelTitle` (ชื่อแผงที่สังกัด หรือ null) ให้ witness ของ LIST_PANEL_EXEMPT จับคู่
   - Segmented เป็นขอบเขตของหน้าหรือของรายการ — static analysis ไม่รู้ (กติการีวิว)
   - ทะเบียนที่ไม่มีตัวควบคุมและไม่มี Pager ใน WorkspaceSection/การ์ดมีกรอบ และตารางลอยบนหน้า
     รายละเอียด (`[id]`) — ปิดด้วยงานย้ายตามขอบเขต · LP10 นับแผงในไฟล์ของไฟล์ที่ย้ายแล้ว · ไฟล์ใหม่พึ่งรีวิว */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as babelParse } from "@babel/parser";

const WEBAPP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* หน้าต้นแบบ = แคตตาล็อก primitive ทุกตัว (รวมตัวควบคุมที่วางโชว์เดี่ยว ๆ) ⇒ อยู่นอก LP2/LP3/LP9
   แต่ต้องสาธิต ListPanel ของจริงแทน (LP-PREVIEW) — ไม่ใช่ข้อยกเว้นลอย ๆ */
export const PREVIEW_FILE = "src/app/settings/design-preview/page.js";
export const LEDGER_DIR = "scripts/listPanelPending";
const MAX_DEPTH = 4;

const ROLE_EXPORTS = {
  "src/components/ui/Workspace": { default: "WORKSPACE", ListPanel: "LIST_PANEL", WorkspaceSection: "SECTION" },
  "src/components/ui/DetailPage": { DetailCard: "DETAIL_CARD" },
  "src/components/ui/ChartCard": { default: "CHART_CARD" },
  "src/components/ui/Pager": { default: "PAGER" },
  "src/components/ui/Table": { TableScroll: "TABLE", TableShell: "RETIRED", TableToolbar: "RETIRED", default: "RETIRED" },
  "src/components/excise/DataList": { default: "DATALIST" },
  "src/components/ui/Skeleton": { default: "SKELETON" },
  "src/components/ui/EmptyState": { default: "EMPTY" },
  "src/components/ui/CountBadge": { default: "COUNT_BADGE" },
  "src/components/ui/FilterPopover": { default: "CONTROL" },
  "src/components/ui/ViewMenus": { SortMenu: "CONTROL", SortDirButton: "CONTROL", GroupMenu: "CONTROL", CollapseAllButton: "CONTROL" },
  "src/components/ui/SortControl": { default: "CONTROL" },
  "src/components/ui/ViewSwitcher": { default: "CONTROL" },
  "src/components/requests/RequestQueuePanel": { default: "RQP" },
};
const STOP_ROLES = new Set(["LIST_PANEL", "SECTION", "DETAIL_CARD", "CHART_CARD", "WORKSPACE"]);
const ROUTE_ENTRY = /^src\/app\/(?:.+\/)?(?:page|layout|template|loading|error|not-found|global-error|default)\.js$/;
const isStaticPage = (rel) => /^src\/app\/(?:.+\/)?page\.js$/.test(rel) && !rel.includes("[");
const FN_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "ObjectMethod", "ClassMethod", "ClassPrivateMethod"]);
const SKIP_KEYS = new Set(["loc", "start", "end", "extra", "comments", "leadingComments", "trailingComments", "innerComments", "errors", "tokens", "range"]);
const isRawPanelToken = (t) => t === "ui-section" || t === "ui-section-header" || t === "ui-section-title"
  || t === "ui-section-body" || t.startsWith("ui-list-panel");
const COUNT_TOKENS = ["ui-badge", "pill", "status-pill"];

/* สำเนาตัวตัดสินจาก tableBoxWidth.test.mjs (import ไฟล์เทสต์ไม่ได้ — จะลงทะเบียนเทสต์ของมันซ้ำ)
   คลาสเดี่ยวที่กฎเดียวตั้งทั้งเส้นขอบ (≥1px) และมุมมน = "การ์ดที่มีกรอบ" */
export function framedCardClasses(css) {
  const names = new Set();
  for (const hit of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = hit[1].trim();
    const body = hit[2];
    if (selector.startsWith("@")) continue;
    if (!/border(?:-top)?:\s*[1-9]/.test(body)) continue;
    if (!/border-radius/.test(body)) continue;
    for (const part of selector.split(",")) {
      const one = part.trim().match(/^\.([A-Za-z][\w-]*)$/);
      if (one) names.add(one[1]);
    }
  }
  return names;
}

function forEachChild(node, fn) {
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === "string") fn(item, key);
    } else if (value && typeof value.type === "string") {
      fn(value, key);
    }
  }
}

const keyName = (node) => (node?.type === "Identifier" ? node.name : node?.type === "StringLiteral" ? node.value : null);
const lineOf = (node) => node?.loc?.start?.line || 1;
const attrName = (attr) => (attr.name.type === "JSXNamespacedName" ? `${attr.name.namespace.name}:${attr.name.name.name}` : attr.name.name);
const attrOf = (el, name) => el.openingElement.attributes.find((a) => a.type === "JSXAttribute" && attrName(a) === name) || null;
const hasSpread = (el) => el.openingElement.attributes.some((a) => a.type === "JSXSpreadAttribute");
const jsxIdentName = (el) => (el.openingElement.name.type === "JSXIdentifier" ? el.openingElement.name.name : null);

function literalAttr(el, name) {
  const attr = attrOf(el, name);
  if (!attr) return { present: false };
  const v = attr.value;
  if (!v) return { present: true, literal: true, value: true };
  if (v.type === "StringLiteral") return { present: true, literal: true, value: v.value };
  if (v.type === "JSXExpressionContainer" && v.expression.type === "StringLiteral") {
    return { present: true, literal: true, value: v.expression.value };
  }
  return { present: true, literal: false };
}

/* `plain={false}` · `plain={null}` ไม่ใช่ plain — มีแค่ชื่อ attribute ไม่พอ */
const isFalsyLiteral = (e) => (e.type === "BooleanLiteral" && !e.value) || e.type === "NullLiteral"
  || (e.type === "Identifier" && e.name === "undefined") || (e.type === "NumericLiteral" && e.value === 0)
  || (e.type === "StringLiteral" && e.value === "");

/* นับลูก JSX แบบคลี่ fragment — `<><TableScroll/></>` นับเป็นลูกหนึ่งตัว ไม่ใช่ศูนย์ · ข้อความที่ไม่ใช่ช่องว่างก็นับ */
function countJsxChildren(children) {
  let n = 0;
  for (const c of children) {
    if (c.type === "JSXFragment") n += countJsxChildren(c.children);
    else if (c.type === "JSXElement") n += 1;
    else if (c.type === "JSXExpressionContainer") n += c.expression.type === "JSXEmptyExpression" ? 0 : 1;
    else if (c.type === "JSXText") n += c.value.trim() ? 1 : 0;
  }
  return n;
}

/* ── ระบบไฟล์: ของจริงบนดิสก์ หรือ `sources` ในหน่วยความจำ (fixture ของเทสต์) ─────────── */
function createFs(root, sources) {
  if (sources) {
    const map = new Map(Object.entries(sources).map(([rel, text]) => [rel.replaceAll("\\", "/"), text]));
    return {
      read: (rel) => (map.has(rel) ? map.get(rel) : null),
      exists: (rel) => map.has(rel),
      listJs: (dir) => [...map.keys()].filter((rel) => rel.startsWith(`${dir}/`) && rel.endsWith(".js")),
    };
  }
  const walk = (relDir, out) => {
    const abs = path.join(root, relDir);
    if (!fs.existsSync(abs)) return out;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(rel, out);
      } else if (entry.name.endsWith(".js")) {
        out.push(rel);
      }
    }
    return out;
  };
  return {
    read: (rel) => {
      try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return null; }
    },
    exists: (rel) => fs.existsSync(path.join(root, rel)),
    listJs: (dir) => walk(dir, []),
  };
}

function createProject(root, sources) {
  const vfs = createFs(root, sources);
  const universe = [...vfs.listJs("src/app"), ...vfs.listJs("src/components")]
    .filter((rel) => !/\.test\.js$/.test(rel))
    .sort();
  const universeSet = new Set(universe);
  const scanSet = universe.filter((rel) => !rel.startsWith("src/components/ui/"));
  const recs = new Map();
  const cssCache = new Map();
  const globalFramed = framedCardClasses(vfs.read("src/app/globals.css") || "");

  function resolveModule(fromRel, source) {
    let base;
    if (source.startsWith("@/")) base = `src/${source.slice(2)}`;
    else if (source.startsWith("./") || source.startsWith("../")) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), source));
    else return null;
    base = base.replace(/\.(?:m?js|jsx)$/, "");
    if (universeSet.has(`${base}.js`) || vfs.exists(`${base}.js`)) return base;
    if (universeSet.has(`${base}/index.js`)) return `${base}/index`;
    return base;
  }

  function info(rel) {
    if (recs.has(rel)) return recs.get(rel);
    if (!universeSet.has(rel)) {
      recs.set(rel, null);
      return null;
    }
    const code = vfs.read(rel) || "";
    const rec = { rel, mod: rel.replace(/\.js$/, ""), code, ast: null, parseError: null };
    recs.set(rel, rec);
    try {
      rec.ast = babelParse(code, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });
      if (rec.ast.errors?.length) {
        const first = rec.ast.errors[0];
        rec.parseError = { line: first.loc?.line || 1, message: first.message };
      }
    } catch (error) {
      rec.parseError = { line: error.loc?.line || 1, message: error.message };
    }
    if (rec.ast && !rec.parseError) indexRec(rec);
    return rec;
  }

  function indexRec(rec) {
    rec.parent = new Map();
    rec.parentKey = new Map();
    rec.elements = [];
    rec.idents = new Map();
    rec.localFns = new Map();
    rec.fnName = new Map();
    rec.branches = [];
    rec.ifs = [];
    rec.fragments = [];
    rec.imports = new Map();
    rec.cssImports = new Map();
    rec.exports = new Map();
    rec.defaultExportFn = null;

    const visit = (node) => {
      if (node.type === "JSXElement") rec.elements.push(node);
      else if (node.type === "Identifier") {
        if (!rec.idents.has(node.name)) rec.idents.set(node.name, []);
        rec.idents.get(node.name).push(node);
      } else if (node.type === "ConditionalExpression" || node.type === "LogicalExpression") rec.branches.push(node);
      else if (node.type === "IfStatement") rec.ifs.push(node);
      else if (node.type === "JSXFragment") rec.fragments.push(node);
      else if (node.type === "FunctionDeclaration" && node.id) {
        rec.localFns.set(node.id.name, node);
        rec.fnName.set(node, node.id.name);
      } else if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && node.init) {
        const fn = FN_TYPES.has(node.init.type) ? node.init
          : (node.init.type === "CallExpression" && node.init.arguments[0] && FN_TYPES.has(node.init.arguments[0].type)) ? node.init.arguments[0]
            : null;
        if (fn) {
          rec.localFns.set(node.id.name, fn);
          rec.fnName.set(fn, node.id.name);
        }
      }
      forEachChild(node, (child, key) => {
        rec.parent.set(child, node);
        rec.parentKey.set(child, key);
        visit(child);
      });
    };
    visit(rec.ast.program);

    const specName = (node) => (node.type === "Identifier" ? node.name : node.value);
    for (const node of rec.ast.program.body) {
      if (node.type === "ImportDeclaration") {
        const source = node.source.value;
        if (/\.css$/.test(source)) {
          const cssRel = source.startsWith("@/") ? `src/${source.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(rec.rel), source));
          for (const s of node.specifiers) rec.cssImports.set(s.local.name, cssRel);
          continue;
        }
        const mod = resolveModule(rec.rel, source);
        for (const s of node.specifiers) {
          const imported = s.type === "ImportDefaultSpecifier" ? "default" : s.type === "ImportNamespaceSpecifier" ? "*" : specName(s.imported);
          rec.imports.set(s.local.name, { mod, imported, node });
        }
      } else if (node.type === "ExportNamedDeclaration") {
        if (node.source) {
          const mod = resolveModule(rec.rel, node.source.value);
          for (const s of node.specifiers) {
            if (s.type === "ExportSpecifier") rec.exports.set(specName(s.exported), { fromMod: mod, imported: specName(s.local) });
          }
        } else if (node.declaration) {
          const d = node.declaration;
          if (d.id?.type === "Identifier") rec.exports.set(d.id.name, { local: d.id.name });
          if (d.type === "VariableDeclaration") {
            for (const decl of d.declarations) if (decl.id.type === "Identifier") rec.exports.set(decl.id.name, { local: decl.id.name });
          }
        } else {
          for (const s of node.specifiers) rec.exports.set(specName(s.exported), { local: s.local.name });
        }
      } else if (node.type === "ExportDefaultDeclaration") {
        const d = node.declaration;
        if (FN_TYPES.has(d.type)) {
          rec.exports.set("default", { local: d.id?.name || null, fnNode: d });
          rec.defaultExportFn = d;
          if (!rec.fnName.has(d)) rec.fnName.set(d, d.id?.name || "default");
        } else if (d.type === "Identifier") {
          rec.exports.set("default", { local: d.name });
        } else if (d.type === "CallExpression") {
          const arg = d.arguments.find((a) => a.type === "Identifier" || FN_TYPES.has(a.type));
          if (arg?.type === "Identifier") rec.exports.set("default", { local: arg.name });
          else if (arg) {
            rec.exports.set("default", { local: null, fnNode: arg });
            if (!rec.fnName.has(arg)) rec.fnName.set(arg, "default");
          }
        }
      }
    }
    if (!rec.defaultExportFn) {
      const ex = rec.exports.get("default");
      if (ex?.local && rec.localFns.has(ex.local)) rec.defaultExportFn = rec.localFns.get(ex.local);
      else if (ex?.fnNode) rec.defaultExportFn = ex.fnNode;
    }
  }

  function resolveExport(mod, name, seen = new Set()) {
    const key = `${mod}#${name}`;
    if (!mod || seen.has(key)) return { mod, name };
    seen.add(key);
    const rec = info(`${mod}.js`);
    if (!rec?.exports) return { mod, name };
    const ex = rec.exports.get(name);
    if (ex?.fromMod) return resolveExport(ex.fromMod, ex.imported, seen);
    if (ex?.local && !rec.localFns.has(ex.local) && rec.imports.has(ex.local)) {
      const imp = rec.imports.get(ex.local);
      if (imp.mod) return resolveExport(imp.mod, imp.imported, seen);
    }
    return { mod, name, rec, ex };
  }
  const roleOf = (origin) => ROLE_EXPORTS[origin.mod]?.[origin.name] || null;
  const defOf = (origin) => {
    if (!origin.rec || !origin.ex) return null;
    const fn = origin.ex.fnNode || (origin.ex.local ? origin.rec.localFns.get(origin.ex.local) : null);
    return fn ? { rec: origin.rec, fn } : null;
  };

  /* ── OVERLAY: host role="dialog"/aria-modal ที่มี {children} อยู่ข้างใน ── */
  const isDialogHost = (el) => {
    const role = literalAttr(el, "role");
    return (role.literal && role.value === "dialog") || !!attrOf(el, "aria-modal");
  };
  const overlayMemo = new WeakMap();
  function rendersChildrenInDialog(rec, fn) {
    if (overlayMemo.has(fn)) return overlayMemo.get(fn);
    overlayMemo.set(fn, false); // กันวน
    if (!subtreeHas(fn.body, (n) => n.type === "Identifier" && n.name === "children")) return false;
    let found = false;
    const within = (node, inDialog) => {
      if (found) return;
      if (!inDialog && node.type === "JSXElement" && jsxIdentName(node)) {
        /* host role="dialog" ในไฟล์ · หรือ **คอมโพเนนต์ที่เป็น OVERLAY เอง** (ส่งต่อเป็นทอด ๆ:
           ConfirmDialog วาด children ใน <Modal> ⇒ ConfirmDialog ก็เป็นโมดัล) */
        const b = binding(rec, node);
        if (b.host ? isDialogHost(node) : b.overlay) inDialog = true;
      }
      if (inDialog && node.type === "JSXExpressionContainer") {
        const e = node.expression;
        if ((e.type === "Identifier" && e.name === "children")
          || (e.type === "MemberExpression" && !e.computed && e.property.name === "children" && e.object.type === "Identifier" && e.object.name === "props")) {
          found = true;
          return;
        }
      }
      forEachChild(node, (child) => within(child, inDialog));
    };
    within(fn.body, false);
    overlayMemo.set(fn, found);
    return found;
  }

  /* ── ALIAS: ทุก return เป็น element บทบาทเดียวกัน พร้อม spread หรือส่ง children ต่อ ── */
  const aliasMemo = new WeakMap();
  function returnsOf(fn) {
    if (fn.body.type !== "BlockStatement") return [fn.body];
    const out = [];
    const seek = (node) => {
      if (node !== fn.body && FN_TYPES.has(node.type)) return;
      if (node.type === "ReturnStatement") out.push(node.argument);
      forEachChild(node, seek);
    };
    seek(fn.body);
    return out;
  }
  function forwardsChildren(el) {
    const kids = el.children.filter((c) => !(c.type === "JSXText" && !c.value.trim()));
    if (kids.length !== 1 || kids[0].type !== "JSXExpressionContainer") return false;
    const e = kids[0].expression;
    return (e.type === "Identifier" && e.name === "children")
      || (e.type === "MemberExpression" && !e.computed && e.property.name === "children");
  }
  function aliasRole(rec, fn) {
    if (aliasMemo.has(fn)) return aliasMemo.get(fn);
    aliasMemo.set(fn, null); // กันวน
    let role = null;
    let ok = true;
    for (const arg of returnsOf(fn)) {
      if (!arg || arg.type === "NullLiteral" || (arg.type === "BooleanLiteral" && !arg.value)
        || (arg.type === "Identifier" && arg.name === "undefined")) continue;
      if (arg.type !== "JSXElement") { ok = false; break; }
      const b = binding(rec, arg);
      if (b.host || !b.role || (!hasSpread(arg) && !forwardsChildren(arg)) || (role && role !== b.role)) { ok = false; break; }
      role = b.role;
    }
    const result = ok ? role : null;
    aliasMemo.set(fn, result);
    return result;
  }

  const bindingMemo = new WeakMap();
  function binding(rec, el) {
    if (bindingMemo.has(el)) return bindingMemo.get(el);
    let result;
    const nameNode = el.openingElement.name;
    if (nameNode.type !== "JSXIdentifier") {
      result = { host: false, role: null };
    } else if (/^[a-z]/.test(nameNode.name) || nameNode.name.includes("-")) {
      result = { host: true, tag: nameNode.name };
    } else {
      result = componentBinding(rec, nameNode.name);
    }
    bindingMemo.set(el, result);
    return result;
  }
  function componentBinding(rec, name) {
    const imp = rec.imports.get(name);
    if (imp) {
      if (!imp.mod) return { host: false, role: null, name };
      const origin = resolveExport(imp.mod, imp.imported);
      const def = defOf(origin);
      return {
        host: false,
        name,
        origin,
        role: roleOf(origin),
        overlay: def ? rendersChildrenInDialog(def.rec, def.fn) : false,
        def,
      };
    }
    const fn = rec.localFns.get(name);
    if (fn) {
      return { host: false, name, role: aliasRole(rec, fn), overlay: rendersChildrenInDialog(rec, fn), def: { rec, fn } };
    }
    return { host: false, role: null, name };
  }
  const roleEl = (rec, el) => {
    const b = binding(rec, el);
    return b.host ? null : b.role;
  };

  /* ── className ───────────────────────────────────────────────────────────── */
  function classInfo(rec, el) {
    const attr = attrOf(el, "className");
    const out = { tokens: new Set(), dynamic: false, styleRefs: [] };
    if (!attr || !attr.value) return out;
    const addTokens = (text, trimStart, trimEnd) => {
      const parts = text.split(/\s+/);
      parts.forEach((part, i) => {
        if (!part) return;
        if (i === 0 && trimStart && !/^\s/.test(text)) return;          // ต่อกับนิพจน์ข้างหน้า
        if (i === parts.length - 1 && trimEnd && !/\s$/.test(text)) return; // ต่อกับนิพจน์ข้างหลัง
        out.tokens.add(part);
      });
    };
    const styleRef = (e) => {
      if ((e.type === "MemberExpression" || e.type === "OptionalMemberExpression") && e.object.type === "Identifier" && rec.cssImports.has(e.object.name)) {
        const name = e.computed ? (e.property.type === "StringLiteral" ? e.property.value : null) : e.property.name;
        if (name) {
          out.styleRefs.push({ css: rec.cssImports.get(e.object.name), name });
          return true;
        }
      }
      return false;
    };
    const v = attr.value;
    const expr = v.type === "JSXExpressionContainer" ? v.expression : v;
    if (expr.type === "StringLiteral") addTokens(expr.value, false, false);
    else if (expr.type === "TemplateLiteral") {
      expr.quasis.forEach((q, i) => addTokens(q.value.cooked ?? q.value.raw, i > 0, i < expr.quasis.length - 1));
      for (const e of expr.expressions) if (!styleRef(e)) out.dynamic = true;
    } else if (!styleRef(expr)) {
      out.dynamic = true;
    }
    return out;
  }
  function moduleFramed(cssRel) {
    if (!cssCache.has(cssRel)) cssCache.set(cssRel, framedCardClasses(vfs.read(cssRel) || ""));
    return cssCache.get(cssRel);
  }
  function isFramedHost(rec, el) {
    const c = classInfo(rec, el);
    if (c.dynamic) return true;
    for (const t of c.tokens) if (globalFramed.has(t)) return true;
    return c.styleRefs.some((ref) => moduleFramed(ref.css).has(ref.name));
  }

  /* ── ผู้ import ทุกไฟล์ (index ตามต้นทางจริงหลังตาม re-export) ────────────────── */
  let importIndex = null;
  function importersOf(mod, name) {
    if (!importIndex) {
      importIndex = new Map();
      for (const rel of universe) {
        const rec = info(rel);
        if (!rec?.imports) continue;
        for (const [local, imp] of rec.imports) {
          if (!imp.mod) continue;
          const origin = resolveExport(imp.mod, imp.imported);
          const key = `${origin.mod}#${origin.name}`;
          if (!importIndex.has(key)) importIndex.set(key, []);
          importIndex.get(key).push({ rec, local });
        }
      }
    }
    return importIndex.get(`${mod}#${name}`) || [];
  }

  function usagesOf(rec, fn) {
    const out = [];
    const localNames = [...rec.localFns].filter(([, f]) => f === fn).map(([n]) => n);
    for (const el of rec.elements) {
      const n = jsxIdentName(el);
      if (n && localNames.includes(n) && !rec.imports.has(n)) out.push({ rec, el });
    }
    for (const [exportName, ex] of rec.exports) {
      const target = ex.fnNode || (ex.local ? rec.localFns.get(ex.local) : null);
      if (target !== fn) continue;
      for (const imp of importersOf(rec.mod, exportName)) {
        for (const el of imp.rec.elements) if (jsxIdentName(el) === imp.local) out.push({ rec: imp.rec, el });
      }
    }
    return out;
  }

  const enclosingFunction = (rec, node) => {
    let cur = rec.parent.get(node);
    while (cur && !FN_TYPES.has(cur.type)) cur = rec.parent.get(cur);
    return cur || null;
  };
  const within = (node, scope) => node.start >= scope.start && node.end <= scope.end;
  const isComponentFn = (rec, fn) => /^[A-Z]/.test(rec.fnName.get(fn) || "") || rec.defaultExportFn === fn;
  const fnKey = (rec, fn) => `${rec.rel}@${fn.start}`;

  function isReference(rec, id) {
    const p = rec.parent.get(id);
    const k = rec.parentKey.get(id);
    if (!p) return false;
    switch (p.type) {
      case "VariableDeclarator": return k !== "id";
      case "MemberExpression": case "OptionalMemberExpression": return k !== "property" || p.computed;
      case "ObjectProperty": return k === "value" || p.computed;
      case "ObjectMethod": case "ClassMethod": case "ClassProperty": return k !== "key" || p.computed;
      case "ImportSpecifier": case "ImportDefaultSpecifier": case "ImportNamespaceSpecifier": case "ExportSpecifier":
      case "LabeledStatement": case "BreakStatement": case "ContinueStatement": case "CatchClause":
      case "ObjectPattern": case "ArrayPattern": case "RestElement": case "ClassDeclaration":
        return false;
      case "AssignmentPattern": return k === "right";
      /* `pager = <Pager/>` — ฝั่งซ้ายคือจุดเขียน ไม่ใช่จุดอ่าน · นับเป็นจุดใช้เมื่อไร `let` ที่ถูกกำหนดค่า
         หลายครั้งจะถูกตัดสินที่ฝั่งซ้ายของอีกบรรทัด ⇒ UNRESOLVED ปลอม */
      case "AssignmentExpression": return k !== "left";
      case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": return k === "body";
      default: return true;
    }
  }
  function referencesIn(rec, name, scope, exclude) {
    return (rec.idents.get(name) || []).filter((id) => id !== exclude && within(id, scope) && isReference(rec, id));
  }

  /* ── coverage ─────────────────────────────────────────────────────────────── */
  const term = (kind, ctx, extra) => ({ kind, chain: ctx.chain, ...extra });

  function walkUp(rec, start, ctx) {
    let child = start;
    let slot = null;
    for (;;) {
      const parent = rec.parent.get(child);
      const key = rec.parentKey.get(child);
      if (!parent) return [term("unresolved", ctx, { reason: `ไม่มีจุดวางใน ${rec.rel}` })];
      switch (parent.type) {
        case "JSXAttribute":
          slot = attrName(parent);
          break;
        case "JSXOpeningElement":
          break;
        case "JSXElement": {
          const s = key === "openingElement" ? (slot || "?") : "children";
          slot = null;
          const hit = elementStop(rec, parent, s, ctx);
          if (hit) return hit;
          break;
        }
        case "JSXFragment": case "JSXExpressionContainer": case "ArrayExpression": case "ObjectExpression":
        case "SpreadElement": case "AwaitExpression": case "ParenthesizedExpression":
          break;
        case "ObjectProperty":
          if (key !== "value") return [term("dead", ctx)];
          break;
        case "ConditionalExpression":
          if (key === "test") return [term("dead", ctx)];
          break;
        case "LogicalExpression":
          if (key === "left" && parent.operator === "&&") return [term("dead", ctx)];
          break;
        case "SequenceExpression":
          if (parent.expressions[parent.expressions.length - 1] !== child) return [term("dead", ctx)];
          break;
        case "CallExpression": case "OptionalCallExpression": case "NewExpression":
          if (key === "callee") return [term("dead", ctx)];
          break;
        case "MemberExpression": case "OptionalMemberExpression": {
          const gp = rec.parent.get(parent);
          if (key === "object" && gp && /CallExpression$/.test(gp.type) && rec.parentKey.get(parent) === "callee") {
            child = gp; // [<A/>].filter(Boolean) · rows.map(…) — ผลของ call คือของที่ถูกวาง
            continue;
          }
          return [term("dead", ctx)];
        }
        case "ReturnStatement":
          return fromFunction(rec, enclosingFunction(rec, parent), ctx);
        case "ArrowFunctionExpression":
          if (key === "body") return fromFunction(rec, parent, ctx);
          return [term("dead", ctx)];
        case "VariableDeclarator":
          if (key === "init" && parent.id.type === "Identifier") return fromBinding(rec, parent.id.name, parent, ctx);
          return [term("unresolved", ctx, { reason: `แตกโครงสร้าง (destructuring) ที่ ${rec.rel}:${lineOf(parent)}` })];
        case "AssignmentExpression":
          if (key === "right" && parent.left.type === "Identifier") return fromBinding(rec, parent.left.name, parent, ctx);
          return [term("unresolved", ctx, { reason: `กำหนดค่าให้ ${parent.left.type} ที่ ${rec.rel}:${lineOf(parent)}` })];
        case "ExpressionStatement": case "BinaryExpression": case "UnaryExpression": case "TemplateLiteral":
        case "IfStatement": case "SwitchStatement": case "ThrowStatement": case "ForOfStatement": case "ForInStatement":
          return [term("dead", ctx)];
        default:
          return [term("unresolved", ctx, { reason: `${parent.type} ที่ ${rec.rel}:${lineOf(parent)}` })];
      }
      child = parent;
    }
  }

  function elementStop(rec, el, slot, ctx) {
    const b = binding(rec, el);
    const stop = (role) => (ctx.noStop ? null : [term("stop", ctx, { role, slot, rec, el })]);
    if (b.host) {
      if (isDialogHost(el)) return stop("OVERLAY");
      if (isFramedHost(rec, el)) return stop("FRAMED");
      return null;
    }
    if (b.overlay) return stop("OVERLAY");
    if (STOP_ROLES.has(b.role)) return stop(b.role);
    if (!ctx.noStop && slot !== "children" && slot !== "?" && b.def && !b.def.rec.rel.startsWith("src/components/ui/")) {
      return propFlow(rec, el, b.def, slot, ctx);
    }
    return null;
  }

  /* ช่อง attribute ของคอมโพเนนต์ในชุดที่ตรวจ ⇒ ตามดูว่าคอมโพเนนต์วาด prop นั้นที่ไหน
     หา prop ไม่เจอ (spread/rest) ⇒ คืน null = ถือว่าวางตรงที่ element วาง */
  function propFlow(useRec, useEl, def, prop, ctx) {
    const { rec, fn } = def;
    const p0 = fn.params[0];
    let refs = null;
    if (p0?.type === "ObjectPattern") {
      for (const property of p0.properties) {
        if (property.type !== "ObjectProperty" || property.computed || keyName(property.key) !== prop) continue;
        let value = property.value;
        if (value.type === "AssignmentPattern") value = value.left;
        if (value.type === "Identifier") refs = referencesIn(rec, value.name, fn, value);
      }
    } else if (p0?.type === "Identifier") {
      refs = (rec.idents.get(p0.name) || [])
        .filter((id) => within(id, fn) && id !== p0)
        .map((id) => ({ id, parent: rec.parent.get(id) }))
        .filter(({ id, parent }) => parent && (parent.type === "MemberExpression" || parent.type === "OptionalMemberExpression")
          && rec.parentKey.get(id) === "object" && !parent.computed && parent.property.name === prop)
        .map(({ parent }) => parent);
    }
    if (!refs || !refs.length) return null;
    if (ctx.depth >= MAX_DEPTH) return [term("unresolved", ctx, { reason: `ตาม prop ${prop} ลึกเกิน ${MAX_DEPTH} ชั้น` })];
    const sub = {
      ...ctx,
      depth: ctx.depth + 1,
      override: { key: fnKey(rec, fn), rec: useRec, el: useEl, parent: ctx.override },
      chain: [...ctx.chain, `${useRec.rel}:${lineOf(useEl)} ${prop}→${rec.rel}`],
    };
    return refs.flatMap((ref) => walkUp(rec, ref, sub));
  }

  function fromFunction(rec, fn, ctx) {
    if (!fn) return [term("unresolved", ctx, { reason: `return นอกฟังก์ชันที่ ${rec.rel}` })];
    if (isComponentFn(rec, fn)) {
      const key = fnKey(rec, fn);
      if (ctx.override?.key === key) {
        const o = ctx.override;
        return walkUp(o.rec, o.el, { ...ctx, override: o.parent });
      }
      if (ROUTE_ENTRY.test(rec.rel) && rec.defaultExportFn === fn) return [term("root", ctx, { rec })];
      return fromComponent(rec, fn, ctx);
    }
    const parent = rec.parent.get(fn);
    if (fn.type === "FunctionDeclaration" && fn.id) return fromBinding(rec, fn.id.name, fn, ctx);
    if (parent?.type === "VariableDeclarator" && rec.parentKey.get(fn) === "init" && parent.id.type === "Identifier") {
      return fromBinding(rec, parent.id.name, parent, ctx);
    }
    if (parent?.type === "CallExpression" && parent.arguments[0] === fn) {
      const gp = rec.parent.get(parent);
      if (gp?.type === "VariableDeclarator" && gp.id.type === "Identifier") return fromBinding(rec, gp.id.name, gp, ctx);
    }
    return walkUp(rec, fn, ctx);
  }

  function fromComponent(rec, fn, ctx) {
    const key = fnKey(rec, fn);
    const name = rec.fnName.get(fn) || "default";
    if (ctx.seen.has(key)) return [term("dead", ctx)];
    if (ctx.depth >= MAX_DEPTH) return [term("unresolved", ctx, { reason: `ผู้เรียก <${name}> ลึกเกิน ${MAX_DEPTH} ชั้น` })];
    const usages = usagesOf(rec, fn);
    if (!usages.length) {
      return [term("unresolved", ctx, { reason: `ไม่พบจุดเรียก <${name}> ที่อ่านได้ (ส่งเป็นค่า/ทะเบียน/dynamic import)`, rec })];
    }
    const seen = new Set(ctx.seen).add(key);
    return usages.flatMap((u) => walkUp(u.rec, u.el, {
      ...ctx,
      depth: ctx.depth + 1,
      seen,
      chain: [...ctx.chain, `<${name}> ใน ${u.rec.rel}:${lineOf(u.el)}`],
    }));
  }

  function fromBinding(rec, name, declNode, ctx) {
    const scope = enclosingFunction(rec, declNode) || rec.ast.program;
    const key = `bind:${rec.rel}@${scope.start}:${name}`;
    if (ctx.seen.has(key)) return [term("dead", ctx)];
    const exclude = declNode.type === "VariableDeclarator" ? declNode.id : declNode.type === "FunctionDeclaration" ? declNode.id : declNode.left;
    const refs = referencesIn(rec, name, scope, exclude);
    if (!refs.length) return [term("dead", ctx)];
    const sub = { ...ctx, seen: new Set(ctx.seen).add(key) };
    return refs.flatMap((ref) => {
      const p = rec.parent.get(ref);
      if (p && /CallExpression$/.test(p.type) && rec.parentKey.get(ref) === "callee") return walkUp(rec, p, sub);
      return walkUp(rec, ref, sub);
    });
  }

  const coverMemo = new WeakMap();
  function coverage(rec, el) {
    if (!coverMemo.has(el)) coverMemo.set(el, walkUp(rec, el, { depth: 0, seen: new Set(), override: null, noStop: false, chain: [] }));
    return coverMemo.get(el);
  }
  function rootsOf(rec, el) {
    return walkUp(rec, el, { depth: 0, seen: new Set(), override: null, noStop: true, chain: [] });
  }

  const describe = (t) => {
    const hops = t.chain.length ? ` ← ${t.chain.join(" ← ")}` : "";
    if (t.kind === "stop") return `${t.role}.${t.slot} (${t.rec.rel}:${lineOf(t.el)})${hops}`;
    if (t.kind === "root") return `ราก ${t.rec.rel}${hops}`;
    return `UNRESOLVED ${t.reason || ""}${hops}`;
  };

  function subtreeHas(node, predicate) {
    let found = false;
    const seek = (n) => {
      if (found) return;
      if (predicate(n)) { found = true; return; }
      forEachChild(n, seek);
    };
    seek(node);
    return found;
  }
  const nearestElement = (rec, node) => {
    let cur = rec.parent.get(node);
    let key = rec.parentKey.get(node);
    let viaAttr = false;
    while (cur && cur.type !== "JSXElement") {
      if (cur.type === "JSXAttribute") viaAttr = true;
      key = rec.parentKey.get(cur);
      cur = rec.parent.get(cur);
    }
    return cur ? { el: cur, viaAttr: viaAttr || key === "openingElement" } : null;
  };

  /* F1 — ตาราง editable ที่เป็น **พี่น้อง** ของ .toolbar: ลงผ่าน host · fragment · {} · ?: · && ได้ ·
     element คอมโพเนนต์ (ListPanel · WorkspaceSection · DetailCard · อื่น ๆ) ดูแค่ตัวมันเองว่าเป็น
     TableScroll family="editable" ไหม ไม่มองทะลุเข้าไป */
  function siblingHasEditableTable(rec, node, skip) {
    let found = false;
    const seek = (n) => {
      if (found || n === skip) return;
      if (n.type === "JSXElement") {
        const b = binding(rec, n);
        if (!b.host) {
          if (b.role === "TABLE") {
            const f = literalAttr(n, "family");
            found = f.literal && f.value === "editable";
          }
          return;
        }
      }
      forEachChild(n, seek);
    };
    seek(node);
    return found;
  }

  /* ── LP6 ─────────────────────────────────────────────────────────────────── */
  function namesIn(rec, node) {
    const out = new Set();
    const seek = (n) => {
      if (n.type === "Identifier" && isReference(rec, n)) out.add(n.name);
      forEachChild(n, seek);
    };
    seek(node);
    return out;
  }

  /* เงื่อนไขที่อ่านแค่ผลของ `accessState()` (ด่านสิทธิ์: "loading" มีเฉพาะก่อนรู้ role ครั้งแรก ไม่กลับมาอีก)
     ไม่ใช่การโหลดข้อมูลซ้ำ ⇒ Skeleton ของด่านสิทธิ์ไม่ถอดแถบเครื่องมือระหว่างที่คนพิมพ์ · ผูกกับแหล่ง import จริง */
  const MOUNT_ONLY_SOURCES = { "src/lib/accessGate": new Set(["accessState"]) };
  function mountOnlyTest(rec, test) {
    const names = namesIn(rec, test);
    if (!names.size) return false;
    for (const name of names) {
      const decls = (rec.idents.get(name) || []).filter((id) => rec.parent.get(id)?.type === "VariableDeclarator" && rec.parentKey.get(id) === "id");
      if (!decls.length) return false;
      for (const id of decls) {
        const init = rec.parent.get(id).init;
        if (init?.type !== "CallExpression" || init.callee.type !== "Identifier") return false;
        const imp = rec.imports.get(init.callee.name);
        if (!imp?.mod || !MOUNT_ONLY_SOURCES[imp.mod]?.has(imp.imported)) return false;
      }
    }
    return true;
  }

  /* กิ่งนี้วาด Skeleton / ListPanel ที่มี toolbar ไหม — ตาม const · let (ทุกจุดที่กำหนดค่า) · ฟังก์ชันในไฟล์เดียวกัน
     ฝั่งแผงตามเข้าคอมโพเนนต์ในไฟล์เดียวกันหรือที่ import มาด้วย (ลึก ≤ MAX_DEPTH · ไม่ลง components/ui)
     ฝั่ง Skeleton **ไม่** ตามเข้าคอมโพเนนต์ — การ์ด/มุมมองอื่นที่มี Skeleton ของตัวเองไม่ใช่การสลับตอนโหลด */
  const rendersMemo = { SKELETON: new WeakMap(), PANEL: new WeakMap() };
  function renders(rec, node, kind, depth = 0) {
    const memo = rendersMemo[kind];
    if (memo.has(node)) return memo.get(node);
    memo.set(node, false); // กันวน
    let found = false;
    const seek = (n) => {
      if (found) return;
      if (n.type === "JSXElement") {
        const b = binding(rec, n);
        if (!b.host) {
          if (kind === "SKELETON" ? b.role === "SKELETON" : b.role === "LIST_PANEL" && !!attrOf(n, "toolbar")) {
            found = true;
            return;
          }
          if (kind === "PANEL" && !b.role && b.def && depth < MAX_DEPTH && !b.def.rec.rel.startsWith("src/components/ui/")
            && renders(b.def.rec, b.def.fn.body, kind, depth + 1)) {
            found = true;
            return;
          }
        }
      } else if (n.type === "Identifier" && isReference(rec, n)) {
        const targets = [];
        if (rec.localFns.has(n.name)) {
          targets.push(rec.localFns.get(n.name).body);
        } else {
          for (const id of rec.idents.get(n.name) || []) {
            const p = rec.parent.get(id);
            const k = rec.parentKey.get(id);
            if (p?.type === "VariableDeclarator" && k === "id" && p.init) targets.push(p.init);
            else if (p?.type === "AssignmentExpression" && k === "left") targets.push(p.right);
          }
        }
        if (targets.some((t) => renders(rec, t, kind, depth))) {
          found = true;
          return;
        }
      }
      forEachChild(n, seek);
    };
    seek(node);
    memo.set(node, found);
    return found;
  }

  /* ── witness ของข้อยกเว้น: ชื่อแผงที่ความผิดสังกัด (ListPanel · WorkspaceSection · DetailCard ตัวใกล้สุด) ──
     หาในไฟล์ก่อน (ตัวเอง → บรรพบุรุษ) แล้วค่อยตาม coverage ข้ามผู้เรียก · ไม่มีแผง = null (headlessSection)
     title ที่ไม่ใช่ค่าคงที่ = ข้อความซอร์สของนิพจน์ (เช่น `sectionTitle`) */
  const TITLED_ROLES = new Set(["LIST_PANEL", "SECTION", "DETAIL_CARD"]);
  function titleText(rec, el) {
    const attr = attrOf(el, "title");
    if (!attr?.value) return null;
    const e = attr.value.type === "JSXExpressionContainer" ? attr.value.expression : attr.value;
    if (e.type === "StringLiteral") return e.value;
    if (e.type === "TemplateLiteral" && !e.expressions.length) return e.quasis[0].value.cooked ?? e.quasis[0].value.raw;
    return rec.code.slice(e.start, e.end);
  }
  function panelTitleOf(rec, node) {
    for (let cur = node; cur; cur = rec.parent.get(cur)) {
      if (cur.type === "JSXElement" && TITLED_ROLES.has(roleEl(rec, cur))) return titleText(rec, cur);
    }
    if (node.type !== "JSXElement") return null;
    const t = coverage(rec, node).find((x) => x.kind === "stop" && TITLED_ROLES.has(x.role));
    return t ? titleText(t.rec, t.el) : null;
  }

  /* ── กฎรายไฟล์ ────────────────────────────────────────────────────────────── */
  function checkFile(rec, out) {
    const push = (node, rule, message, via = "") => out.push({
      file: rec.rel, line: lineOf(node), rule, message, via, panelTitle: panelTitleOf(rec, node),
    });
    const isPreview = rec.rel === PREVIEW_FILE;
    const listPanels = rec.elements.filter((el) => roleEl(rec, el) === "LIST_PANEL");
    const listPanelsWithToolbar = listPanels.filter((el) => attrOf(el, "toolbar"));
    const hasInFilePager = rec.elements.some((el) => ["PAGER", "DATALIST"].includes(roleEl(rec, el)));

    for (const imp of rec.imports.values()) {
      if (!imp.mod) continue;
      if (roleOf(resolveExport(imp.mod, imp.imported)) === "RETIRED") {
        push(imp.node, "LP7", "RETIRED_API: TableShell/TableToolbar/default ของ ui/Table ถูกถอดแล้ว — รายการใช้ ListPanel + TableScroll · ตารางในหน้ารายละเอียดใช้ DetailCard + TableScroll");
      }
    }

    const okList = (t, slots) => t.kind === "dead" || (t.kind === "stop" && (t.role === "OVERLAY" || (t.role === "LIST_PANEL" && slots.includes(t.slot))));
    const firstBad = (terms, good) => terms.find((t) => !good(t));

    for (const el of rec.elements) {
      const b = binding(rec, el);
      const role = b.host ? null : b.role;

      if (role === "WORKSPACE" && attrOf(el, "toolbar")) {
        push(el, "LP1", "WORKSPACE_TOOLBAR: Workspace ไม่มี toolbar แล้ว — เครื่องมือของรายการส่งเข้า ListPanel toolbar · แท็บที่สลับชุดข้อมูลวางเป็นลูกคนแรกของ Workspace");
      }
      if (role === "RQP" && attrOf(el, "sectionHeader")) {
        push(el, "LP7", "RETIRED_API: sectionHeader ถูกถอด — คิวคำร้องวาดหัว ListPanel เสมอ (มติผู้ใช้ 2026-09-15)");
      }

      if (role === "LIST_PANEL") {
        const missing = ["icon", "title", "count"].filter((name) => !attrOf(el, name));
        if (missing.length || hasSpread(el)) {
          push(el, "LP5", `LIST_PANEL_SHAPE: ListPanel ${missing.length ? `ขาด ${missing.join(" · ")}` : ""}${missing.length && hasSpread(el) ? " และ " : ""}${hasSpread(el) ? "มี {...spread}" : ""} — ส่ง icon/title/count ตรง ๆ (count ระหว่างโหลดส่ง null)`);
        }
      }

      if (role === "PAGER" && !isPreview) {
        const bad = firstBad(coverage(rec, el), (t) => okList(t, ["children"]));
        if (bad) {
          push(el, "LP2", bad.kind === "unresolved"
            ? "PAGER_OUTSIDE_LIST_PANEL: หาจุดเรียกไม่ได้ — วาด ListPanel ในไฟล์นี้"
            : "PAGER_OUTSIDE_LIST_PANEL: Pager ต้องอยู่ในเนื้อของ ListPanel (ท้ายรายการ)", describe(bad));
        }
      }

      if (role === "CONTROL" && !isPreview) {
        const origin = b.origin || {};
        const isFilter = origin.mod === "src/components/ui/FilterPopover";
        const isSwitcher = origin.mod === "src/components/ui/ViewSwitcher";
        const bad = firstBad(coverage(rec, el), (t) => okList(t, ["toolbar"])
          || (isSwitcher && t.kind === "stop" && t.role === "LIST_PANEL" && t.slot === "actions")              // F4
          || (isFilter && t.kind === "stop" && t.role === "WORKSPACE" && t.slot === "headerRight"
            && t.rec === rec && !listPanels.length && !hasInFilePager));                                     // F3
        if (bad) {
          push(el, "LP3", bad.kind === "unresolved"
            ? `LIST_CONTROL_OUTSIDE_TOOLBAR: <${b.name}> หาจุดเรียกไม่ได้ — วาด ListPanel ในไฟล์นี้`
            : `LIST_CONTROL_OUTSIDE_TOOLBAR: <${b.name}> ต้องอยู่ใน ListPanel toolbar`, describe(bad));
        }
      }

      if (b.host) {
        const cls = classInfo(rec, el);
        const tokens = cls.tokens;
        const rawPanel = [...tokens].filter(isRawPanelToken);
        if (rawPanel.length) {
          push(el, "LP8", `RAW_PANEL_MARKUP: คลาส ${rawPanel.join(" ")} เขียนเองนอก components/ui — ใช้ ListPanel (รายการ) หรือ WorkspaceSection`);
        }
        if (tokens.has("search-glass") && !isPreview) {
          const bad = firstBad(coverage(rec, el), (t) => okList(t, ["toolbar"]));
          if (bad) {
            push(el, "LP3", bad.kind === "unresolved"
              ? "LIST_CONTROL_OUTSIDE_TOOLBAR: .search-glass หาจุดเรียกไม่ได้ — วาด ListPanel ในไฟล์นี้"
              : "LIST_CONTROL_OUTSIDE_TOOLBAR: ช่องค้นหา .search-glass ต้องอยู่ใน ListPanel toolbar", describe(bad));
          }
        }
        if (tokens.has("toolbar") && !isPreview) {
          const near = nearestElement(rec, el);
          /* F1: ตาราง editable ต้องเป็น **พี่น้อง** ของ .toolbar ใต้ element แม่ตัวเดียวกัน (ลงผ่าน host ·
             fragment · {} · ?: ได้ แต่ไม่มองทะลุคอมโพเนนต์ เช่น ListPanel/WorkspaceSection/DetailCard)
             และ .toolbar ที่อยู่ในช่อง attribute (เช่น ListPanel toolbar) ไม่ได้สิทธิ์นี้ */
          const f1 = near && !near.viaAttr && near.el.children.some((c) => c !== el && siblingHasEditableTable(rec, c, el));
          const f2 = near && !near.viaAttr && roleEl(rec, near.el) === "SECTION" && countJsxChildren(near.el.children) === 1;
          if (!f1 && !f2) {
            const terms = coverage(rec, el);
            const nested = terms.find((t) => t.kind === "stop" && t.role === "LIST_PANEL" && t.slot === "toolbar");
            const bad = nested || firstBad(terms, (t) => t.kind === "dead" || (t.kind === "stop" && t.role === "OVERLAY"));
            if (bad) {
              push(el, "LP3", nested
                ? "LIST_CONTROL_OUTSIDE_TOOLBAR: .toolbar ซ้อนใน ListPanel toolbar — ส่งตัวควบคุมเป็น fragment ไม่ใช่ .toolbar ซ้ำ"
                : bad.kind === "unresolved"
                  ? "LIST_CONTROL_OUTSIDE_TOOLBAR: .toolbar หาจุดเรียกไม่ได้ — วาด ListPanel ในไฟล์นี้"
                  : "LIST_CONTROL_OUTSIDE_TOOLBAR: .toolbar ของรายการต้องเป็น ListPanel toolbar (ListPanel ห่อ .toolbar ให้เอง)", describe(bad));
            }
          }
        }
        if (COUNT_TOKENS.some((t) => tokens.has(t)) && !isPreview && listPanels.length) {
          const bad = coverage(rec, el).find((t) => t.kind === "stop" && t.role === "WORKSPACE" && t.slot === "headerRight" && t.rec === rec);
          if (bad) push(el, "LP9", "COUNT_IN_PAGE_HEADER: ป้ายจำนวนบนหัวหน้าซ้ำกับป้ายของ ListPanel — ถอดออก (จำนวนอยู่ที่ count ของแผง)", describe(bad));
        }
      }
      if (role === "COUNT_BADGE" && !isPreview && listPanels.length) {
        const bad = coverage(rec, el).find((t) => t.kind === "stop" && t.role === "WORKSPACE" && t.slot === "headerRight" && t.rec === rec);
        if (bad) push(el, "LP9", "COUNT_IN_PAGE_HEADER: CountBadge บนหัวหน้าซ้ำกับป้ายของ ListPanel — ถอดออก", describe(bad));
      }

      if (role === "TABLE" || role === "DATALIST") {
        const family = role === "TABLE" ? literalAttr(el, "family") : { present: false };
        if (family.present && !family.literal) {
          push(el, "LP4", "FLOATING_LIST_TABLE: family ต้องเป็นค่าคงที่ (list · editable · matrix) — ด่านอ่านนิพจน์ไม่ได้");
        } else if (!family.present || family.value === "list") {
          for (const t of coverage(rec, el)) {
            if (t.kind !== "stop" || t.role !== "WORKSPACE" || !["children", "rail"].includes(t.slot)) continue;
            const page = rootsOf(t.rec, t.el).find((r) => r.kind === "root" && isStaticPage(r.rec.rel));
            if (page) {
              push(el, "LP4", `FLOATING_LIST_TABLE: ตารางรายการลอยใน Workspace ของ ${page.rec.rel} — ห่อด้วย ListPanel`, describe(t));
              break;
            }
          }
        }
      }

      if (role === "EMPTY" || role === "SKELETON" || role === "LIST_PANEL" || role === "SECTION" || role === "DETAIL_CARD") {
        const plainAttr = role === "EMPTY" ? attrOf(el, "plain") : null;
        const plain = !!plainAttr && !(plainAttr.value?.type === "JSXExpressionContainer" && isFalsyLiteral(plainAttr.value.expression));
        if (!(role === "EMPTY" && plain)) {
          const bad = coverage(rec, el).find((t) => t.kind === "stop" && t.role === "LIST_PANEL" && t.slot === "children");
          if (bad) {
            const what = role === "EMPTY" ? "EmptyState ในแผงรายการต้องเป็น plain"
              : role === "SKELETON" ? "Skeleton ในแผงรายการ — ใช้ prop loading ของ ListPanel (หัวกับแถบเครื่องมือยังอยู่)"
                : "แผงซ้อนแผง — ListPanel ใบเดียวต่อหนึ่งรายการ ไม่ซ้อน ListPanel/WorkspaceSection/DetailCard";
            push(el, "LP5", `LIST_PANEL_SHAPE: ${what}`, describe(bad));
          }
        }
      }

      if (role === "WORKSPACE" && attrOf(el, "loading") && listPanelsWithToolbar.length) {
        push(el, "LP6", "LOADING_UNMOUNTS_TOOLBAR: Workspace loading ถอดทั้งหน้ารวมแถบเครื่องมือของ ListPanel — ย้ายไปที่ loading ของ ListPanel");
      }
    }

    /* LP6(b) — สองทางเลือกที่ทางหนึ่งวาด Skeleton อีกทางวาด ListPanel+toolbar (ตาม const/let/คอมโพเนนต์ด้วย):
       ① ?: · && · || · ??   ② if/else (รวม `let body` ที่กำหนดค่าคนละกิ่ง)   ③ `if (…) return <Skeleton/>`
       กับคำสั่งถัดไปในบล็อกเดียวกัน   ④ `{x && <Skeleton/>}{!x && <ListPanel toolbar>}` พี่น้องที่เงื่อนไขอ่านชื่อร่วมกัน
       เงื่อนไขที่อ่านแค่ผล accessState() (ด่านสิทธิ์ครั้งแรก) ไม่นับ */
    const LP6_SWAP = "LOADING_UNMOUNTS_TOOLBAR: สลับ Skeleton กับ ListPanel ที่มี toolbar ⇒ ช่องค้นหาหลุดโฟกัสทุกครั้งที่โหลด — ใช้ loading ของ ListPanel";
    const hasSkeleton = (nodes) => nodes.some((n) => n && renders(rec, n, "SKELETON"));
    const hasToolbarPanel = (nodes) => nodes.some((n) => n && renders(rec, n, "PANEL"));
    const swaps = (a, b) => (hasSkeleton(a) && hasToolbarPanel(b)) || (hasSkeleton(b) && hasToolbarPanel(a));
    for (const node of rec.branches) {
      const [test, a, c] = node.type === "ConditionalExpression" ? [node.test, node.consequent, node.alternate] : [node.left, node.left, node.right];
      if (!mountOnlyTest(rec, test) && swaps([a], [c])) push(node, "LP6", LP6_SWAP);
    }
    for (const node of rec.ifs) {
      if (mountOnlyTest(rec, node.test)) continue;
      const other = [node.alternate];
      const cons = node.consequent;
      const exits = cons.type === "ReturnStatement" || (cons.type === "BlockStatement" && cons.body.at(-1)?.type === "ReturnStatement");
      const holder = rec.parent.get(node);
      if (exits && Array.isArray(holder?.body)) other.push(...holder.body.slice(holder.body.indexOf(node) + 1));
      if (swaps([cons], other)) push(node, "LP6", LP6_SWAP);
    }
    for (const host of [...rec.elements, ...rec.fragments]) {
      const pairs = host.children.filter((c) => c.type === "JSXExpressionContainer"
        && c.expression.type === "LogicalExpression" && c.expression.operator === "&&");
      for (let i = 0; i < pairs.length; i += 1) {
        for (let j = i + 1; j < pairs.length; j += 1) {
          const [p, q] = [pairs[i].expression, pairs[j].expression];
          if (mountOnlyTest(rec, p.left) || mountOnlyTest(rec, q.left)) continue;
          const shared = [...namesIn(rec, p.left)].some((name) => namesIn(rec, q.left).has(name));
          if (shared && swaps([p.right], [q.right])) push(pairs[i], "LP6", LP6_SWAP);
        }
      }
    }

    if (isPreview) {
      const demo = listPanels.find((el) => attrOf(el, "count") && attrOf(el, "toolbar")
        && el.children.some((c) => subtreeHas(c, (x) => x.type === "JSXElement" && roleEl(rec, x) === "TABLE"))
        && el.children.some((c) => subtreeHas(c, (x) => x.type === "JSXElement" && roleEl(rec, x) === "PAGER")));
      if (!demo) push(rec.ast.program, "LP-PREVIEW", "หน้าต้นแบบต้องมี ListPanel ที่ส่ง count + toolbar และมี TableScroll + Pager ในเนื้อ");
      const named = rec.elements.some((el) => jsxIdentName(el) === "code"
        && el.children.some((c) => c.type === "JSXText" && c.value.trim() === "ListPanel"));
      if (!named) push(rec.ast.program, "LP-PREVIEW", "หน้าต้นแบบต้องมีชื่อ <code>ListPanel</code> เป็นตัวหนังสือที่คนอ่านเห็น");
    }
  }

  /* ── LP10 ADOPTER_LOCK: ไฟล์วาด ListPanel ในไฟล์ หรือผ่านคอมโพเนนต์ที่ import มา ──
     ตาม element ที่ผูกกับคอมโพเนนต์นอกไฟล์ (รวม re-export · RQP) ลึก ≤ 4 · กันวนด้วยเส้นทางปัจจุบัน
     (ไม่ใช่ชุด "เคยเยี่ยม" — ไฟล์เดียวกันที่ถูกตัดความลึกทางหนึ่งยังต้องตามได้จากทางที่สั้นกว่า)
     ไม่ดำดิ่งเข้า components/ui — primitive เป็นผู้ *นิยาม* แผง ไม่ใช่ผู้ย้ายเข้าแผง */
  function rendersListPanel(rel, depth = 0, trail = new Set()) {
    const rec = info(rel);
    if (!rec?.elements || trail.has(rel)) return false;
    if (rec.elements.some((el) => roleEl(rec, el) === "LIST_PANEL")) return true;
    if (depth >= MAX_DEPTH) return false;
    trail.add(rel);
    try {
      for (const el of rec.elements) {
        const b = binding(rec, el);
        if (b.host || !b.def || b.def.rec === rec || b.def.rec.rel.startsWith("src/components/ui/")) continue;
        if (rendersListPanel(b.def.rec.rel, depth + 1, trail)) return true;
      }
      return false;
    } finally {
      trail.delete(rel);
    }
  }

  /* จำนวน element ListPanel ที่เขียนในไฟล์นี้เอง (ผูกบทบาทตามแหล่ง import · ชื่อเล่นไม่หลุด) — ไม่นับที่มาจากคอมโพเนนต์ที่ import */
  function inFileListPanels(rel) {
    const rec = info(rel);
    return rec?.elements ? rec.elements.filter((el) => roleEl(rec, el) === "LIST_PANEL").length : 0;
  }

  return { info, scanSet, universe, checkFile, rendersListPanel, inFileListPanels };
}

function normalizeRel(root, file) {
  const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  const rel = path.relative(root, abs).replaceAll("\\", "/");
  return rel.startsWith("..") ? file.replaceAll("\\", "/") : rel;
}

/* `sources` = ต้นไม้ในหน่วยความจำ { "src/app/x/page.js": code, "src/app/globals.css": css } สำหรับ fixture
   (ไม่ส่ง = อ่านจากดิสก์ใต้ root) · `files` = กรองผลเฉพาะไฟล์เหล่านี้ (การตามผู้เรียกยังอ่านทั้งต้นไม้)
   `adopters` = LIST_PANEL_ADOPTERS ของ LP10 = `[[ไฟล์, จำนวน ListPanel ในไฟล์ตอนแช่แข็ง], …]`
   — ไม่ส่ง = ไม่ตรวจ LP10 (เทสต์ต้นไม้จริงส่งเสมอ · fixture ส่งเอง) */
export function scanListPanelShape({ root = WEBAPP, files, sources, adopters = [] } = {}) {
  const project = createProject(root, sources);
  const wanted = files ? new Set(files.map((f) => (sources ? f : normalizeRel(root, f)))) : null;
  const violations = [];
  const parseFailures = [];
  for (const rel of project.scanSet) {
    if (wanted && !wanted.has(rel)) continue;
    const rec = project.info(rel);
    if (rec.parseError) {
      parseFailures.push(`${rel}:${rec.parseError.line} ${rec.parseError.message}`);
      violations.push({ file: rel, line: rec.parseError.line, rule: "PARSE", message: `พาร์สไม่ผ่าน — ${rec.parseError.message}`, via: "" });
      continue;
    }
    project.checkFile(rec, violations);
  }
  const inScan = new Set(project.scanSet);
  for (const [rel, frozenInFile] of adopters) {
    if (wanted && !wanted.has(rel)) continue;
    const rec = inScan.has(rel) ? project.info(rel) : null;
    if (rec?.parseError) continue; // PARSE รายงานแล้ว
    const inFile = rec ? project.inFileListPanels(rel) : 0;
    if (!rec) {
      violations.push({
        file: rel, line: 1, rule: "LP10", via: "", panelTitle: null,
        message: "ADOPTER_LOCK: ไฟล์ใน LIST_PANEL_ADOPTERS ไม่อยู่แล้ว (หรือหลุดจากชุดที่ตรวจ) — ลบหน้า = ลบรายการในเทสต์ในคอมมิตเดียวกัน",
      });
    } else if (inFile < frozenInFile) {
      // แผงของไฟล์เองถอยกลับ — คอมโพเนนต์ที่ import มามีแผง (RenewalsPanel ของ contracts) ไม่นับแทน
      violations.push({
        file: rel, line: 1, rule: "LP10", via: "", panelTitle: null,
        message: `ADOPTER_LOCK: ListPanel ที่เขียนในไฟล์นี้เหลือ ${inFile} จาก ${frozenInFile} ที่แช่แข็งไว้ — รายการของไฟล์นี้ถอยกลับเป็นแผงอื่น`
          + " (แผงในคอมโพเนนต์ที่ import ไม่นับแทน) · คืนแผงรายการ · ย้ายแผงเข้าคอมโพเนนต์หรือยุบรายการตามมติ = แก้ตัวเลขในเทสต์ในคอมมิตเดียวกัน",
      });
    } else if (!project.rendersListPanel(rel)) {
      violations.push({
        file: rel, line: 1, rule: "LP10", via: "", panelTitle: null,
        message: "ADOPTER_LOCK: ไฟล์นี้ย้ายเข้า ListPanel แล้ว (LIST_PANEL_ADOPTERS) แต่ไม่วาด ListPanel ทั้งในไฟล์และผ่านคอมโพเนนต์ที่ import — คืนแผงรายการ · ยุบรายการตามมติ = ลบรายการในเทสต์ในคอมมิตเดียวกัน",
      });
    }
  }
  const seen = new Set();
  const unique = violations.filter((v) => {
    const key = `${v.file}:${v.line}:${v.rule}:${v.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
  return { violations: unique, parseFailures, scanned: wanted ? project.scanSet.filter((rel) => wanted.has(rel)) : project.scanSet };
}

/* ทุกไฟล์ในชุดที่ตรวจที่วาด ListPanel (ในไฟล์หรือผ่านคอมโพเนนต์ที่ import) = ที่มาของ LIST_PANEL_ADOPTERS
   คืน `[[ไฟล์, จำนวน ListPanel ที่เขียนในไฟล์เอง], …]` เรียงตามไฟล์ · 0 = วาดผ่านคอมโพเนนต์ที่ import อย่างเดียว
   ใช้ตัวตัดสินเดียวกับ LP10 ⇒ รายการที่สร้างวันไหนผ่าน LP10 วันนั้นเสมอ · ไฟล์ที่พาร์สไม่ผ่านไม่นับ */
export function listPanelAdopters({ root = WEBAPP, sources } = {}) {
  const project = createProject(root, sources);
  return project.scanSet
    .filter((rel) => !project.info(rel)?.parseError && project.rendersListPanel(rel))
    .map((rel) => [rel, project.inFileListPanels(rel)]);
}

/* ── ทะเบียนย้าย scripts/listPanelPending/<UNIT>.json = { unit, reason, files } ─────────── */
export function readLedgers(root = WEBAPP) {
  const dir = path.join(root, LEDGER_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({ name: name.replace(/\.json$/, ""), ...JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) }));
}

/* ตรวจทะเบียนเทียบกับชุด violation — คืนรายการปัญหา `{ code, message }` (ว่าง = ผ่าน)
   (i)  ไฟล์ในทะเบียนรวมกัน === ไฟล์ที่มี violation เป๊ะ (สะอาดแล้วต้องถอน · ผิดใหม่ต้องไม่หลุดทะเบียน)
   (ii) ไฟล์เดียวอยู่สองทะเบียนไม่ได้ · (iii) ทะเบียนว่าง = ลบไฟล์ทิ้ง
   (iv) ทุกไฟล์ ⊆ baseline ที่แช่แข็ง (ทะเบียนหดได้อย่างเดียว)
   (v)  ทะเบียนที่พักตามมติ (`parked` = { ชื่อ: { date, files: RegExp } }) ต้องมีเหตุผล ≥ 60 ตัวอักษรที่อ้างวันที่ของมติ
        และไฟล์ที่ตรง `files` ต้องอยู่ในทะเบียนนั้นเท่านั้น (ย้ายไปทะเบียนอื่น = หลุดเงื่อนไขวันที่)
   `units` = ชื่อหน่วยที่รู้จัก — ทะเบียนชื่ออื่น (รวมเปลี่ยนชื่อ UP.json) ตก */
export function checkLedgers({ violations, ledgers, baseline, parked = {}, units = null }) {
  const problems = [];
  const violating = new Set(violations.map((v) => v.file));
  const base = new Set(baseline);
  const owner = new Map();
  for (const ledger of ledgers) {
    const label = `${ledger.name}.json`;
    if (units && !units.includes(ledger.name)) {
      problems.push({ code: "unit", message: `${label}: ไม่ใช่หน่วยที่รู้จัก (${units.join(" · ")}) — ห้ามตั้งทะเบียนชื่อใหม่หรือเปลี่ยนชื่อทะเบียน` });
    }
    if (ledger.unit !== ledger.name) problems.push({ code: "shape", message: `${label}: unit "${ledger.unit}" ต้องตรงกับชื่อไฟล์` });
    if (!Array.isArray(ledger.files) || !ledger.files.length) {
      problems.push({ code: "iii-empty", message: `${label}: ทะเบียนว่าง — ย้ายครบแล้วให้ลบไฟล์ทะเบียนทิ้ง` });
      continue;
    }
    for (const file of ledger.files) {
      if (owner.has(file)) problems.push({ code: "ii-duplicate", message: `${file} อยู่ทั้ง ${owner.get(file)}.json และ ${label}` });
      else owner.set(file, ledger.name);
      if (!base.has(file)) problems.push({ code: "iv-baseline", message: `${label}: ${file} ไม่อยู่ใน LIST_PANEL_BASELINE — ทะเบียนหดได้อย่างเดียว ของใหม่ต้องทำให้ถูกตั้งแต่แรก` });
      if (!violating.has(file)) problems.push({ code: "i-clean", message: `${label}: ${file} สะอาดแล้ว — ถอนออกจากทะเบียน` });
    }
    const date = parked[ledger.name]?.date;
    if (date && !(typeof ledger.reason === "string" && ledger.reason.length >= 60 && ledger.reason.includes(date))) {
      problems.push({ code: "v-parked", message: `${label}: ทะเบียนที่พักตามมติต้องมีเหตุผล ≥ 60 ตัวอักษรที่อ้างวันที่ ${date}` });
    }
  }
  for (const [name, park] of Object.entries(parked)) {
    if (!park.files) continue;
    for (const [file, ownerName] of owner) {
      if (park.files.test(file) && ownerName !== name) {
        problems.push({ code: "v-parked", message: `${file}: เป็นไฟล์ของทะเบียนที่พัก ${name} (มติ ${park.date}) — ต้องอยู่ใน ${name}.json ไม่ใช่ ${ownerName}.json` });
      }
    }
  }
  for (const file of violating) {
    if (!owner.has(file)) problems.push({ code: "i-unledgered", message: `${file} ผิดทรงรายการแต่ไม่อยู่ในทะเบียนย้าย` });
  }
  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes("--adopters")) {
    // หนึ่งไฟล์ต่อบรรทัด = วางลง LIST_PANEL_ADOPTERS ในเทสต์ได้ตรง ๆ
    const pairs = listPanelAdopters({ root: WEBAPP });
    console.log(`[\n${pairs.map((pair) => `  ${JSON.stringify(pair).replace(",", ", ")},`).join("\n")}\n]`);
    process.exit(0);
  }
  const { violations, scanned } = scanListPanelShape({ root: WEBAPP, files: args.length ? args : undefined });
  if (args.length && scanned.length < args.length) {
    console.log(`⚠️ ${args.length - scanned.length} พาธไม่อยู่ในชุดที่ตรวจ (src/app · src/components ยกเว้น components/ui)`);
  }
  for (const v of violations) console.log(`${v.file}:${v.line} ${v.rule} ${v.message}${v.via ? `\n    via ${v.via}` : ""}`);
  const owner = new Map();
  for (const ledger of readLedgers(WEBAPP)) for (const file of ledger.files || []) owner.set(file, ledger.unit);
  const files = [...new Set(violations.map((v) => v.file))];
  const unledgered = files.filter((file) => !owner.has(file));
  console.log(`\nLIST_PANEL_SHAPE: ${violations.length} จุด ใน ${files.length} ไฟล์ (ตรวจ ${scanned.length} ไฟล์)`
    + ` · อยู่ในทะเบียนย้าย ${files.length - unledgered.length} · นอกทะเบียน ${unledgered.length}`);
  for (const file of unledgered) console.log(`  นอกทะเบียน: ${file}`);
  process.exit(violations.length ? 1 : 0);
}
