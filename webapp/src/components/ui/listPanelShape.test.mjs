import test from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_FILE, checkLedgers, readLedgers, scanListPanelShape } from "../../../scripts/listPanelShape.mjs";

/* ── ด่านทรงรายการ LIST_PANEL_SHAPE (มติผู้ใช้ 2026-09-15: รายการทุกชุด = ListPanel ใบเดียว) ──
   ตัวตรวจอยู่ที่ scripts/listPanelShape.mjs (อ่านหัวไฟล์นั้นก่อน: บทบาท · coverage · กฎ LP1–LP9 ·
   ข้อเท็จจริง F1–F4 · จุดบอด) · บ้านของด่านอยู่ที่นี่ ไม่ใช่ audit-ui.mjs เพราะต้องเป็น
   **hard-zero** — ไม่มีเพดานให้ไต่ (ท่าเดียวกับ previewCoverage)

   หน้าที่ยังไม่ย้ายอยู่ใน **ทะเบียนย้ายรายหน่วย** scripts/listPanelPending/<UNIT>.json
   ทะเบียนต้องเท่ากับชุดไฟล์ที่ผิดเป๊ะ และ ⊆ LIST_PANEL_BASELINE ที่แช่แข็งไว้ ⇒ หดได้อย่างเดียว
   หน่วยไหนย้ายเสร็จ ถอนไฟล์ออกจากทะเบียนของตัวเอง ทะเบียนว่าง = ลบไฟล์ทิ้ง */

const WEBAPP = process.cwd();

/* ── ข้อยกเว้น — เฉพาะมติเจ้าของที่ปฏิเสธการย้าย (D1 · D4) เท่านั้น ─────────────────────
   รูปแบบ: { file, rule, witness: { panelTitle } | { headlessSection: true }, reason (≥ 60), decidedAt }
   รายการที่ไม่ตรงกับ violation สักจุด = ข้อยกเว้นค้าง ⇒ เทสต์ตก (ต้องลบทิ้ง)
   วันนี้ว่าง: D1 = ใช่ (คิวคำร้องได้หัวกลับมา) · D4 = ยอมรับข้อเสนอ · D3 (/service/today) ด่านไม่จับ */
const LIST_PANEL_EXEMPT = [];

/* ── ชุดไฟล์ตั้งต้นที่แช่แข็ง (U0-A · 2026-09-15) — ทะเบียนย้ายต้องเป็นสับเซตของชุดนี้เสมอ ──
   ⚠️ ห้ามเติม — ไฟล์ใหม่ที่ผิดทรงต้องแก้ให้ถูกตั้งแต่แรก ไม่ใช่ลงทะเบียนย้าย · U0-Z หดชุดนี้ */
const LIST_PANEL_BASELINE = Object.freeze([
  "src/app/audit/page.js",
  "src/app/database/customers/page.js",
  "src/app/database/formulas/page.js",
  "src/app/database/page.js",
  "src/app/database/products/page.js",
  "src/app/database/scents/page.js",
  "src/app/finance/payments/page.js",
  "src/app/finance/requests/page.js",
  "src/app/notifications/page.js",
  "src/app/pm/tasks/page.js",
  "src/app/production/board/page.js",
  "src/app/production/jobs/page.js",
  "src/app/production/lines/page.js",
  "src/app/production/page.js",
  "src/app/rd/page.js",
  "src/app/rd/requests/page.js",
  "src/app/rd/sales-orders/page.js",
  "src/app/requests/page.js",
  "src/app/sa/costing/page.js",
  "src/app/sa/forecast-review/page.js",
  "src/app/sa/projects/[id]/page.js",
  "src/app/sa/projects/page.js",
  "src/app/sahamit/forecast/page.js",
  "src/app/sahamit/material/page.js",
  "src/app/sahamit/po/page.js",
  "src/app/sahamit/reconcile/page.js",
  "src/app/sahamit/review/page.js",
  "src/app/sales-planning/contracts/page.js",
  "src/app/sales-planning/deals/[id]/page.js",
  "src/app/sales-planning/deals/page.js",
  "src/app/sales-planning/leads/page.js",
  "src/app/sales-planning/sales-orders/page.js",
  "src/app/sales-planning/targets/report/page.js",
  "src/app/service/assets/page.js",
  "src/app/service/intake/page.js",
  "src/app/service/page.js",
  "src/app/service/requests/page.js",
  "src/app/service/schedule/page.js",
  "src/app/service/sites/page.js",
  "src/app/settings/cost-templates/page.js",
  "src/app/settings/holidays/page.js",
  "src/app/settings/signature-coverage/page.js",
  "src/app/support/page.js",
  "src/app/tax/filings/page.js",
  "src/app/tax/registrations/[id]/page.js",
  "src/app/tax/registrations/page.js",
  "src/app/users/page.js",
  "src/components/excise/DataList.js",
  "src/components/excise/FilterBar.js",
  "src/components/materials/MaterialRegistryPanel.js",
  "src/components/pm/ProjectDealsHub.js",
  "src/components/requests/RequestQueuePanel.js",
  "src/components/salesPlanning/ContractAddendaCard.js",
  "src/components/salesPlanning/DealContractsCard.js",
  "src/components/salesPlanning/DealTimelineTable.js",
  "src/components/salesPlanning/RenewalsPanel.js",
  "src/components/salesPlanning/dashboard/MyDashboardTab.js",
  "src/components/service/AssetModelsPanel.js",
  "src/components/service/CustomerZonesPanel.js",
  "src/components/service/SurveyResultTable.js",
  "src/components/teams/TeamManager.js",
]);

/* ทะเบียนที่พักตามมติ — เหตุผลต้องอ้างวันที่ของมติ (สหมิตรพักทั้งเส้น 2026-09-08 · D2 = ไม่)
   `files` ตรึงไฟล์สหมิตรไว้ในทะเบียน UP — ย้ายไปทะเบียนอื่นหรือเปลี่ยนชื่อ UP.json ไม่หลุดเงื่อนไขวันที่ */
const PARKED = Object.freeze({ UP: { date: "2026-09-08", files: /^src\/(?:app|components)\/sahamit\// } });
/* ชื่อทะเบียนที่มีได้ = หน่วยในแผนงานเท่านั้น (U0 ไม่มีทะเบียน) */
const UNITS = Object.freeze(["U1", "U2a", "U2b", "U3", "U4", "U5a", "U5b", "U6", "U7", "U8", "UP"]);

/* witness ต้องตรงกับแผงของความผิดจริง (`panelTitle` จากด่าน) — ไม่ใช่แค่ไฟล์ + กฎ
   ไม่งั้นข้อยกเว้นเดียวยกเว้นทุกความผิดของกฎนั้นทั้งไฟล์ รวมของที่งอกใหม่ในแผงอื่น */
const witnessOk = (w) => !!w && ((typeof w.panelTitle === "string" && !!w.panelTitle.trim()) || w.headlessSection === true);
const witnessMatches = (w, v) => (typeof w.panelTitle === "string" ? v.panelTitle === w.panelTitle : v.panelTitle == null);
const exemptionCovers = (e, v) => e.file === v.file && e.rule === v.rule && witnessOk(e.witness) && witnessMatches(e.witness, v);

function exemptionProblems(entries, violations) {
  const problems = [];
  for (const [i, e] of entries.entries()) {
    const label = `LIST_PANEL_EXEMPT[${i}] ${e.file || "?"}`;
    if (typeof e.file !== "string" || typeof e.rule !== "string" || !witnessOk(e.witness)
      || typeof e.reason !== "string" || e.reason.length < 60 || !/^\d{4}-\d{2}-\d{2}$/.test(e.decidedAt || "")) {
      problems.push(`${label}: ต้องมี file · rule · witness ({ panelTitle } | { headlessSection: true }) · reason ≥ 60 · decidedAt`);
      continue;
    }
    if (!violations.some((v) => exemptionCovers(e, v))) {
      problems.push(`${label} (${e.rule}): ไม่ตรงกับ violation สักจุด (ไฟล์ · กฎ · แผงตาม witness) — ลบข้อยกเว้นทิ้ง`);
    }
  }
  return problems;
}
const applyExemptions = (violations, entries) =>
  violations.filter((v) => !entries.some((e) => exemptionCovers(e, v)));

// ── ต้นไม้จริง ─────────────────────────────────────────────────────────────────

const REAL = scanListPanelShape({ root: WEBAPP });
const REMAINING = applyExemptions(REAL.violations, LIST_PANEL_EXEMPT);
const fmt = (v) => `${v.file}:${v.line} ${v.rule} ${v.message}${v.via ? ` · via ${v.via}` : ""}`;

test("พาร์สได้ทุกไฟล์ — พาร์สไม่ผ่านต้องเป็นความผิด ไม่ใช่ศูนย์เงียบ", () => {
  assert.deepEqual(REAL.parseFailures, []);
  assert.ok(REAL.scanned.length > 300, `ตรวจแค่ ${REAL.scanned.length} ไฟล์ — ชุดที่ตรวจหายไปครึ่งหนึ่งแปลว่าตัวอ่านไฟล์พัง`);
});

test("⭐ ทะเบียนย้ายเท่ากับชุดไฟล์ที่ผิดทรงรายการเป๊ะ (i)–(v)", () => {
  const problems = checkLedgers({
    violations: REMAINING, ledgers: readLedgers(WEBAPP), baseline: LIST_PANEL_BASELINE, parked: PARKED, units: UNITS,
  });
  const unledgered = new Set(problems.filter((p) => p.code === "i-unledgered").map((p) => p.message.split(" ")[0]));
  const detail = REMAINING.filter((v) => unledgered.has(v.file)).map(fmt);
  assert.deepEqual(problems.map((p) => p.message), [],
    `${detail.length ? `จุดที่ผิดนอกทะเบียน:\n${detail.join("\n")}\n` : ""}`
    + "แก้ที่ต้นเหตุตามกติกา UI_DESIGN_SYSTEM.md §รายการ — ListPanel (อ่านหัว scripts/listPanelShape.mjs)");
});

test("ไฟล์ต้นแบบของ U0 สะอาด: /sa/quotations และหน้าต้นแบบ", () => {
  const dirty = REAL.violations.filter((v) => v.file === "src/app/sales-planning/quotations/page.js" || v.file === PREVIEW_FILE);
  assert.deepEqual(dirty.map(fmt), []);
});

test("LIST_PANEL_BASELINE แช่แข็ง — ไม่ซ้ำ เรียงแล้ว", () => {
  assert.equal(new Set(LIST_PANEL_BASELINE).size, LIST_PANEL_BASELINE.length, "มีไฟล์ซ้ำใน baseline");
  assert.deepEqual([...LIST_PANEL_BASELINE].sort(), [...LIST_PANEL_BASELINE], "baseline ต้องเรียงตามตัวอักษร");
  assert.ok(Object.isFrozen(LIST_PANEL_BASELINE));
});

test("LIST_PANEL_EXEMPT มีรูปแบบถูกและไม่ค้าง", () => {
  assert.deepEqual(exemptionProblems(LIST_PANEL_EXEMPT, REAL.violations), []);
  // ตัวตรวจข้อยกเว้นต้องจับได้จริง — ยิงกระสุนทดสอบ
  const v = [{ file: "src/app/x/page.js", line: 1, rule: "LP9", message: "", via: "", panelTitle: "คิวของฉัน" }];
  const entry = (witness, file = "src/app/x/page.js") => ({ file, rule: "LP9", witness, reason: "ก".repeat(60), decidedAt: "2026-09-15" });
  assert.equal(exemptionProblems([{ ...entry({}), reason: "สั้น" }], v).length, 1);
  assert.equal(exemptionProblems([entry({ headlessSection: true }, "src/app/y/page.js")], v).length, 1);
  assert.deepEqual(exemptionProblems([entry({ panelTitle: "คิวของฉัน" })], v), []);
  // witness ต้องตรงกับแผงของความผิด — ชื่อแผงผิด = ค้าง · headlessSection ใช้ได้เฉพาะความผิดที่ไม่มีแผง
  assert.equal(exemptionProblems([entry({ panelTitle: "ฟีดล่าสุด" })], v).length, 1);
  assert.equal(exemptionProblems([entry({ headlessSection: true })], v).length, 1);
  assert.deepEqual(exemptionProblems([entry({ headlessSection: true })], [{ ...v[0], panelTitle: null }]), []);
});

test("LIST_PANEL_EXEMPT ยกเว้นเฉพาะความผิดในแผงที่ witness ระบุ — ความผิดในแผงอื่นของไฟล์เดียวกันยังตก", () => {
  const base = { file: "src/app/x/page.js", line: 1, rule: "LP9", message: "", via: "" };
  const violations = [{ ...base, panelTitle: "คิวของฉัน" }, { ...base, line: 9, panelTitle: "ฟีดล่าสุด" }, { ...base, line: 12, panelTitle: null }];
  const entries = [{ file: base.file, rule: "LP9", witness: { panelTitle: "คิวของฉัน" }, reason: "ก".repeat(60), decidedAt: "2026-09-15" }];
  assert.deepEqual(applyExemptions(violations, entries).map((x) => x.line), [9, 12]);
});

test("ด่านรายงาน panelTitle ของทุกความผิด (ชื่อแผงที่สังกัด · ไม่มีแผง = null)", () => {
  const r = scanListPanelShape({
    sources: {
      "src/app/sec/page.js": `import Workspace, { WorkspaceSection } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
export default function P() {
  return <Workspace><WorkspaceSection title="ทะเบียน"><div className="toolbar"><input /></div><TableScroll /></WorkspaceSection><div className="search-glass"><input /></div></Workspace>;
}
`,
    },
  });
  assert.deepEqual(r.violations.map((x) => [x.rule, x.panelTitle]), [["LP3", "ทะเบียน"], ["LP3", null]]);
});

// ── ตรวจทะเบียนเองก็ต้องตกได้จริง (i)–(v) ─────────────────────────────────────────

const V = (file) => ({ file, line: 1, rule: "LP3", message: "", via: "" });
const L = (name, files, reason = "หน่วยทดสอบ") => ({ name, unit: name, reason, files });
const codes = (problems) => problems.map((p) => p.code).sort();

test("ทะเบียน: ตรงกันเป๊ะ = ผ่าน", () => {
  assert.deepEqual(checkLedgers({ violations: [V("a.js"), V("b.js")], ledgers: [L("U1", ["a.js"]), L("U2", ["b.js"])], baseline: ["a.js", "b.js"] }), []);
});

test("ทะเบียน (i): ไฟล์สะอาดแล้วแต่ยังค้างในทะเบียน ⇒ ตก", () => {
  assert.deepEqual(codes(checkLedgers({ violations: [V("a.js")], ledgers: [L("U1", ["a.js", "b.js"])], baseline: ["a.js", "b.js"] })), ["i-clean"]);
});

test("ทะเบียน (i): ผิดทรงแต่ไม่อยู่ในทะเบียน ⇒ ตก", () => {
  assert.deepEqual(codes(checkLedgers({ violations: [V("a.js"), V("c.js")], ledgers: [L("U1", ["a.js"])], baseline: ["a.js", "c.js"] })), ["i-unledgered"]);
});

test("ทะเบียน (ii): ไฟล์เดียวอยู่สองทะเบียน ⇒ ตก", () => {
  assert.deepEqual(codes(checkLedgers({ violations: [V("a.js")], ledgers: [L("U1", ["a.js"]), L("U2", ["a.js"])], baseline: ["a.js"] })), ["ii-duplicate"]);
});

test("ทะเบียน (iii): ทะเบียนว่าง ⇒ ตก (ต้องลบไฟล์)", () => {
  assert.deepEqual(codes(checkLedgers({ violations: [], ledgers: [L("U1", [])], baseline: [] })), ["iii-empty"]);
});

test("ทะเบียน (iv): ไฟล์นอก baseline ⇒ ตก (ทะเบียนโตไม่ได้)", () => {
  assert.deepEqual(codes(checkLedgers({ violations: [V("z.js")], ledgers: [L("U1", ["z.js"])], baseline: ["a.js"] })), ["iv-baseline"]);
});

const PARK = { UP: { date: "2026-09-08", files: /^src\/app\/sahamit\// } };
const PARK_REASON = `พักตามมติรื้อทั้งเส้น 2026-09-08 ${"—".repeat(50)}`;

test("ทะเบียน (v): ทะเบียนที่พักต้องมีเหตุผลที่อ้างวันที่ของมติ", () => {
  const args = (reason) => ({ violations: [V("a.js")], ledgers: [L("UP", ["a.js"], reason)], baseline: ["a.js"], parked: PARK });
  assert.deepEqual(codes(checkLedgers(args("พักไว้ก่อน"))), ["v-parked"]);
  assert.deepEqual(codes(checkLedgers(args("ยาวพอแต่ไม่อ้างวันที่ ".repeat(5)))), ["v-parked"]);
  assert.deepEqual(checkLedgers(args(PARK_REASON)), []);
});

test("ทะเบียน (v): ไฟล์ของทะเบียนที่พักย้ายไปทะเบียนอื่น ⇒ ตก · เปลี่ยนชื่อ UP.json ⇒ ตก", () => {
  const po = "src/app/sahamit/po/page.js";
  const review = "src/app/sahamit/review/page.js";
  const units = ["U8", "UP"];
  const moved = checkLedgers({
    violations: [V(po), V(review)], ledgers: [L("UP", [po], PARK_REASON), L("U8", [review])], baseline: [po, review], parked: PARK, units,
  });
  assert.deepEqual(codes(moved), ["v-parked"]);
  const renamed = checkLedgers({
    violations: [V(po)], ledgers: [L("UPx", [po], "สั้น")], baseline: [po], parked: PARK, units,
  });
  assert.deepEqual(codes(renamed), ["unit", "v-parked"]);
  assert.deepEqual(checkLedgers({ violations: [V(po)], ledgers: [L("UP", [po], PARK_REASON)], baseline: [po], parked: PARK, units }), []);
});

// ── fixture: ทุกกฎมีกรณียิงโดนและกรณีผ่าน ──────────────────────────────────────────

const GLOBALS_CSS = ".glass-panel { border: 1px solid var(--border); border-radius: var(--radius-lg); }\n";
const scan = (tree) => scanListPanelShape({ sources: { "src/app/globals.css": GLOBALS_CSS, ...tree } });
const rules = (result, file) => [...new Set(result.violations.filter((v) => v.file === file).map((v) => v.rule))].sort();
const IMPORTS = `import Workspace, { ListPanel, WorkspaceSection } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import Pager from "@/components/ui/Pager";
import FilterPopover from "@/components/ui/FilterPopover";
import { SortMenu } from "@/components/ui/ViewMenus";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import CountBadge from "@/components/ui/CountBadge";
import Modal from "@/components/Modal";`;
const page = (jsx, extra = "", pre = "") => `"use client";
${IMPORTS}
${extra}
export default function Page({ loading, rows }) {
${pre}
  return (
    ${jsx}
  );
}
`;
const LP = (attrs = "") => `<ListPanel icon={<i />} title="ทะเบียน" count="1 ใบ" ${attrs}>`;
const MODAL = `export default function Modal({ open, title, toolbar, children }) {
  if (!open) return null;
  return <div role="dialog" aria-modal="true"><header>{title}{toolbar}</header><div className="drawer-body">{children}</div></div>;
}
`;

test("alias ของ import (SaWorkspace · SaSection · SaPanel) ยังเป็นบทบาทเดิม", () => {
  const head = `import SaWorkspace, { ListPanel as SaPanel, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import Pager from "@/components/ui/Pager";`;
  const r = scan({
    "src/app/a/page.js": `${head}\nexport default function A() { return <SaWorkspace toolbar={<span />}><SaSection title="x"><Pager /></SaSection></SaWorkspace>; }`,
    "src/app/b/page.js": `${head}\nexport default function B() { return <SaWorkspace><SaPanel icon={<i />} title="t" count="1 ใบ"><Pager /></SaPanel></SaWorkspace>; }`,
  });
  assert.deepEqual(rules(r, "src/app/a/page.js"), ["LP1", "LP2"]);
  assert.deepEqual(rules(r, "src/app/b/page.js"), []);
});

test("LP1: toolbar ของ Modal ไม่ใช่ Workspace toolbar · <Workspace toolbar> ยิงโดน", () => {
  const r = scan({
    "src/components/Modal.js": MODAL,
    "src/app/m/page.js": page(`<Workspace><Modal open toolbar={<SortMenu />}><Pager /></Modal></Workspace>`),
    "src/app/w/page.js": page(`<Workspace toolbar={<SortMenu />}><div /></Workspace>`),
  });
  assert.deepEqual(rules(r, "src/app/m/page.js"), []);
  assert.deepEqual(rules(r, "src/app/w/page.js"), ["LP1", "LP3"]);
});

test("LP3: toolbar={<FilterBar/>} — FilterBar คืน div.toolbar ยิงโดน · คืน fragment ผ่าน", () => {
  const caller = page(`<Workspace>${LP("toolbar={<FilterBar><FilterPopover /></FilterBar>}")}<TableScroll /><Pager /></ListPanel></Workspace>`,
    `import FilterBar from "@/components/excise/FilterBar";`);
  const withDiv = scan({
    "src/components/excise/FilterBar.js": `export default function FilterBar({ children }) { return <div className="toolbar"><div className="search-glass"><input /></div>{children}</div>; }`,
    "src/app/t/page.js": caller,
  });
  assert.deepEqual(rules(withDiv, "src/components/excise/FilterBar.js"), ["LP3"]);
  assert.deepEqual(rules(withDiv, "src/app/t/page.js"), []);
  const withFragment = scan({
    "src/components/excise/FilterBar.js": `export default function FilterBar({ children }) { return <><div className="search-glass"><input /></div><div className="spacer" />{children}</>; }`,
    "src/app/t/page.js": caller,
  });
  assert.deepEqual(rules(withFragment, "src/components/excise/FilterBar.js"), []);
  assert.deepEqual(rules(withFragment, "src/app/t/page.js"), []);
});

test("LP3: const tb = (<SortMenu/>) — ใน toolbar ผ่าน · ใน children ยิงโดน", () => {
  const pre = "  const tb = (<SortMenu />);";
  const r = scan({
    "src/app/ok/page.js": page(`<Workspace>${LP("toolbar={tb}")}<TableScroll /></ListPanel></Workspace>`, "", pre),
    "src/app/bad/page.js": page(`<Workspace>${LP()}{tb}<TableScroll /></ListPanel></Workspace>`, "", pre),
  });
  assert.deepEqual(rules(r, "src/app/ok/page.js"), []);
  assert.deepEqual(rules(r, "src/app/bad/page.js"), ["LP3"]);
});

test("LP6: loading ? <SkeletonRows/> : <ListPanel toolbar> และ Workspace loading ยิงโดน · loading ของแผงผ่าน", () => {
  const r = scan({
    "src/app/ternary/page.js": page(`<Workspace>{loading ? <SkeletonRows /> : ${LP("toolbar={<SortMenu />}")}<TableScroll /></ListPanel>}</Workspace>`),
    "src/app/shell/page.js": page(`<Workspace loading={loading}>${LP("toolbar={<SortMenu />}")}<TableScroll /></ListPanel></Workspace>`),
    "src/app/ok/page.js": page(`<Workspace>${LP("toolbar={<SortMenu />} loading={loading}")}<TableScroll /></ListPanel></Workspace>`),
  });
  assert.deepEqual(rules(r, "src/app/ternary/page.js"), ["LP6"]);
  assert.deepEqual(rules(r, "src/app/shell/page.js"), ["LP6"]);
  assert.deepEqual(rules(r, "src/app/ok/page.js"), []);
});

test("LP6: สลับ Skeleton ↔ แผง toolbar ทางไหนก็ยิงโดน (const · คอมโพเนนต์ · let if/else · && คู่ · early return)", () => {
  const panel = `${LP("toolbar={<SortMenu />}")}<TableScroll /></ListPanel>`;
  const r = scan({
    "src/app/const/page.js": page(`<Workspace>{loading ? <SkeletonRows /> : panel}</Workspace>`, "", `  const panel = (${panel});`),
    "src/app/component/page.js": page(`<Workspace>{loading ? <SkeletonRows /> : <Registry />}</Workspace>`, `function Registry() { return ${panel}; }`),
    "src/app/letelse/page.js": page(`<Workspace>{body}</Workspace>`, "", `  let body;\n  if (loading) body = <SkeletonRows />;\n  else body = ${panel};`),
    "src/app/pair/page.js": page(`<Workspace>{loading && <SkeletonRows />}{!loading && ${panel}}</Workspace>`),
    "src/app/early/page.js": page(`<Workspace>${panel}</Workspace>`, "", "  if (loading) return <SkeletonRows />;"),
  });
  for (const file of ["const", "component", "letelse", "pair", "early"]) {
    assert.deepEqual(rules(r, `src/app/${file}/page.js`), ["LP6"], file);
  }
});

test("LP6 ผ่าน: ด่านสิทธิ์ accessState() · && พี่น้องที่เงื่อนไขไม่เกี่ยวกัน · มุมมองอื่นที่มี Skeleton ของตัวเอง", () => {
  const panel = `${LP("toolbar={<SortMenu />} loading={loading}")}<TableScroll /></ListPanel>`;
  const r = scan({
    "src/app/gate/page.js": page(`<Workspace>${panel}</Workspace>`, `import { accessState } from "@/lib/accessGate";`,
      "  const gate = accessState(rows, true);\n  if (gate === \"loading\") return <SkeletonRows />;"),
    "src/app/gateternary/page.js": page(`gate === "loading" ? <SkeletonRows /> : <Workspace>${panel}</Workspace>`, `import { accessState } from "@/lib/accessGate";`,
      "  const gate = accessState(rows, true);"),
    "src/app/unrelated/page.js": page(`<Workspace>{rows && <SkeletonRows />}{loading && ${panel}}</Workspace>`),
    "src/app/cards/page.js": page(`<Workspace>{rows ? <Cards /> : ${panel}}</Workspace>`, "function Cards() { return <SkeletonRows />; }"),
  });
  for (const file of ["gate", "gateternary", "unrelated", "cards"]) {
    assert.deepEqual(rules(r, `src/app/${file}/page.js`), [], file);
  }
  // ด่านสิทธิ์ต้องมาจาก accessState ของจริง — ชื่อ gate เฉย ๆ ไม่พอ
  const fake = scan({ "src/app/fake/page.js": page(`<Workspace>${panel}</Workspace>`, "", "  const gate = rows ? \"ok\" : \"loading\";\n  if (gate === \"loading\") return <SkeletonRows />;") });
  assert.deepEqual(rules(fake, "src/app/fake/page.js"), ["LP6"]);
});

test("let ที่กำหนดค่า JSX หลายครั้ง ตัดสินที่จุดอ่าน (ไม่ใช่ฝั่งซ้ายของอีกบรรทัด)", () => {
  const pagerPre = "  let pager = null;\n  if (rows > 20) pager = <Pager />;\n  else pager = <span>ทั้งหมด</span>;";
  const r = scan({
    "src/app/pager/page.js": page(`<Workspace>${LP()}<TableScroll />{pager}</ListPanel></Workspace>`, "", pagerPre),
    "src/app/tools/page.js": page(`<Workspace>${LP("toolbar={tools}")}<TableScroll /></ListPanel></Workspace>`, "",
      "  let tools;\n  if (rows) tools = <SortMenu />;\n  else tools = <><SortMenu /><FilterPopover /></>;"),
    "src/app/loose/page.js": page(`<Workspace>${LP()}<TableScroll /></ListPanel>{pager}</Workspace>`, "", pagerPre),
  });
  assert.deepEqual(rules(r, "src/app/pager/page.js"), []);
  assert.deepEqual(rules(r, "src/app/tools/page.js"), []);
  assert.deepEqual(rules(r, "src/app/loose/page.js"), ["LP2"]);
});

test("OVERLAY เป็นทอด ๆ: คอมโพเนนต์ที่ส่ง children ต่อเข้า <Modal> (ข้ามไฟล์ · ไฟล์เดียวกัน) ผ่าน · วาด children นอกโมดัล ยิงโดน", () => {
  const importSheet = `import FormSheet from "@/components/fpm/FormSheet";`;
  const r = scan({
    "src/components/Modal.js": MODAL,
    "src/components/fpm/FormSheet.js": `import Modal from "@/components/Modal";
export default function FormSheet({ open, title, children }) { return <Modal open={open} title={title}>{children ? <div className="extra">{children}</div> : null}</Modal>; }
`,
    "src/components/fpm/Leaky.js": `import Modal from "@/components/Modal";
export default function Leaky({ children }) { return <><Modal open>{null}</Modal>{children}</>; }
`,
    "src/app/cross/page.js": page(`<Workspace>${LP()}<TableScroll /></ListPanel><FormSheet open><div className="search-glass"><input /></div><SortMenu /></FormSheet></Workspace>`, importSheet),
    "src/app/same/page.js": page(`<Workspace>${LP()}<TableScroll /></ListPanel><Sheet><SortMenu /></Sheet></Workspace>`,
      `function Sheet({ children }) { return <Modal open title="x">{children}</Modal>; }`),
    "src/app/leaky/page.js": page(`<Workspace><Leaky><SortMenu /></Leaky></Workspace>`, `import Leaky from "@/components/fpm/Leaky";`),
  });
  assert.deepEqual(rules(r, "src/app/cross/page.js"), []);
  assert.deepEqual(rules(r, "src/app/same/page.js"), []);
  assert.deepEqual(rules(r, "src/app/leaky/page.js"), ["LP3"]);
});

test("LP2: คอมโพเนนต์แบบ DataList — Pager ผ่านเมื่อผู้เรียกครอบด้วย ListPanel · ผู้เรียกคนที่สองปล่อยลอย ยิงโดน", () => {
  const dataList = `import { TableScroll } from "@/components/ui/Table";
import Pager from "@/components/ui/Pager";
export default function DataList({ rows }) { return <><TableScroll><table /></TableScroll><Pager /></>; }
`;
  const importLine = `import DataList from "@/components/excise/DataList";`;
  const tree = {
    "src/components/excise/DataList.js": dataList,
    "src/app/one/page.js": page(`<Workspace>${LP()}<DataList rows={rows} /></ListPanel></Workspace>`, importLine),
  };
  const single = scan(tree);
  assert.deepEqual(rules(single, "src/components/excise/DataList.js"), []);
  assert.deepEqual(rules(single, "src/app/one/page.js"), []);
  const double = scan({ ...tree, "src/app/two/page.js": page(`<Workspace><DataList rows={rows} /></Workspace>`, importLine) });
  assert.ok(rules(double, "src/components/excise/DataList.js").includes("LP2"), "Pager ของ DataList ต้องตกเมื่อผู้เรียกบางรายไม่ครอบ");
  assert.deepEqual(rules(double, "src/app/two/page.js"), ["LP4"]);
});

test("คอมโพเนนต์ที่ถูกเรียกใน <Modal> ของอีกไฟล์เท่านั้น ผ่าน", () => {
  const r = scan({
    "src/components/Modal.js": MODAL,
    "src/components/x/Picker.js": `import { SortMenu } from "@/components/ui/ViewMenus";
export default function Picker() { return <div className="toolbar"><SortMenu /><div className="search-glass"><input /></div></div>; }
`,
    "src/app/p/page.js": page(`<Workspace><Modal open><Picker /></Modal></Workspace>`, `import Picker from "@/components/x/Picker";`),
  });
  assert.deepEqual(rules(r, "src/components/x/Picker.js"), []);
  assert.deepEqual(rules(r, "src/app/p/page.js"), []);
});

test("ALIAS: Section ของหน้าต้นแบบรอบ TableScroll ผ่าน · ตารางลอยใน Workspace ยิงโดน", () => {
  const sectionAlias = `function Section({ group, active, ...props }) {
  if (group !== active) return null;
  return <WorkspaceSection {...props} />;
}`;
  const r = scan({
    "src/app/sec/page.js": page(`<Workspace><Section group="a" active="a" title="ตาราง"><TableScroll /></Section></Workspace>`, sectionAlias),
    "src/app/float/page.js": page(`<Workspace><TableScroll /></Workspace>`),
  });
  assert.deepEqual(rules(r, "src/app/sec/page.js"), []);
  assert.deepEqual(rules(r, "src/app/float/page.js"), ["LP4"]);
});

test("toolbar-label ไม่ใช่ toolbar · div.toolbar ในเนื้อแผงยิงโดน", () => {
  const r = scan({
    "src/app/label/page.js": page(`<Workspace>${LP()}<span className="toolbar-label">ช่วงวันที่</span><TableScroll /></ListPanel></Workspace>`),
    "src/app/bar/page.js": page(`<Workspace>${LP()}<div className="toolbar"><button type="button" /></div><TableScroll /></ListPanel></Workspace>`),
    "src/app/nested/page.js": page(`<Workspace>${LP('toolbar={<div className="toolbar"><input /></div>}')}<TableScroll /></ListPanel></Workspace>`),
  });
  assert.deepEqual(rules(r, "src/app/label/page.js"), []);
  assert.deepEqual(rules(r, "src/app/bar/page.js"), ["LP3"]);
  assert.match(r.violations.find((v) => v.file === "src/app/nested/page.js")?.message || "", /ซ้อนใน ListPanel toolbar/);
});

test("F1: .toolbar คู่ตาราง family=editable ผ่าน · คู่ตาราง matrix ยิงโดน", () => {
  const form = (family) => page(`<Workspace><WorkspaceSection title="ฟอร์ม"><div><div className="toolbar"><button type="button" /></div><TableScroll family="${family}" /></div></WorkspaceSection></Workspace>`);
  const r = scan({
    "src/app/editable/page.js": form("editable"),
    "src/app/matrix/page.js": form("matrix"),
    // ทรง CostingRequestForm: ตารางอยู่ในกิ่ง ?: ของพี่น้อง
    "src/app/conditional/page.js": page(`<Workspace><WorkspaceSection title="ฟอร์ม"><div><div className="toolbar"><button type="button" /></div>{rows ? <TableScroll family="editable" /> : <EmptyState plain>ว่าง</EmptyState>}</div></WorkspaceSection></Workspace>`),
  });
  assert.deepEqual(rules(r, "src/app/editable/page.js"), []);
  assert.deepEqual(rules(r, "src/app/matrix/page.js"), ["LP3"]);
  assert.deepEqual(rules(r, "src/app/conditional/page.js"), []);
});

test("F1 แคบ: ตาราง editable ต้องเป็นพี่น้องจริง — ในแผงข้าง ๆ ไม่นับ · .toolbar ใน ListPanel toolbar ไม่ได้สิทธิ์", () => {
  const r = scan({
    "src/app/broad/page.js": page(`<Workspace><div className="toolbar"><button type="button">กรอง</button></div>${LP()}<TableScroll family="editable" /></ListPanel></Workspace>`),
    "src/app/nested/page.js": page(`<Workspace>${LP('toolbar={<div className="toolbar"><button type="button" /></div>}')}<TableScroll family="editable" /></ListPanel></Workspace>`),
  });
  assert.deepEqual(rules(r, "src/app/broad/page.js"), ["LP3"]);
  assert.deepEqual(rules(r, "src/app/nested/page.js"), ["LP3"]);
  assert.match(r.violations.find((v) => v.file === "src/app/nested/page.js")?.message || "", /ซ้อนใน ListPanel toolbar/);
});

test("F2: .toolbar ลูกคนเดียวของ SECTION ผ่าน · SECTION ถือ toolbar + TableScroll ยิงโดน (รวมตารางใน fragment)", () => {
  const r = scan({
    "src/app/filter/page.js": page(`<Workspace><WorkspaceSection title="ตัวกรอง KPI"><div className="toolbar"><input /></div></WorkspaceSection></Workspace>`),
    "src/app/list/page.js": page(`<Workspace><WorkspaceSection title="ทะเบียน"><div className="toolbar"><input /></div><TableScroll /></WorkspaceSection></Workspace>`),
    "src/app/fragment/page.js": page(`<Workspace><WorkspaceSection title="ทะเบียน"><div className="toolbar"><input /></div><><TableScroll /></></WorkspaceSection></Workspace>`),
  });
  assert.deepEqual(rules(r, "src/app/filter/page.js"), []);
  assert.deepEqual(rules(r, "src/app/list/page.js"), ["LP3"]);
  assert.deepEqual(rules(r, "src/app/fragment/page.js"), ["LP3"]);
});

test("F3: FilterPopover ใน headerRight ของหน้าที่ไม่มีรายการ ผ่าน · หน้าที่มี ListPanel ยิงโดน", () => {
  const r = scan({
    "src/app/dash/page.js": page(`<Workspace headerRight={<FilterPopover />}><div /></Workspace>`),
    "src/app/list/page.js": page(`<Workspace headerRight={<FilterPopover />}>${LP()}<TableScroll /></ListPanel></Workspace>`),
  });
  assert.deepEqual(rules(r, "src/app/dash/page.js"), []);
  assert.deepEqual(rules(r, "src/app/list/page.js"), ["LP3"]);
});

test("F4: ViewSwitcher ใน ListPanel actions ผ่าน · ใน headerRight ยิงโดน", () => {
  const r = scan({
    "src/app/ok/page.js": page(`<Workspace>${LP("actions={<ViewSwitcher />}")}<TableScroll /></ListPanel></Workspace>`),
    "src/app/bad/page.js": page(`<Workspace headerRight={<ViewSwitcher />}>${LP()}<TableScroll /></ListPanel></Workspace>`),
  });
  assert.deepEqual(rules(r, "src/app/ok/page.js"), []);
  assert.deepEqual(rules(r, "src/app/bad/page.js"), ["LP3"]);
});

test("ตาม prop เข้าคอมโพเนนต์: headerActions={<ViewSwitcher/>} ที่ถูกวางใน ListPanel actions ผ่าน", () => {
  const queue = (wrap) => `import { ListPanel, WorkspaceSection } from "@/components/ui/Workspace";
export default function Queue({ headerActions = null }) {
  return ${wrap};
}
`;
  const caller = page(`<Workspace><Queue headerActions={<ViewSwitcher />} /></Workspace>`, `import Queue from "@/components/requests/Queue";`);
  const inPanel = scan({
    "src/components/requests/Queue.js": queue(`<ListPanel icon={<i />} title="คิว" count="2 เรื่อง" actions={headerActions}><div /></ListPanel>`),
    "src/app/q/page.js": caller,
  });
  assert.deepEqual(rules(inPanel, "src/app/q/page.js"), []);
  const inSection = scan({
    "src/components/requests/Queue.js": queue(`<WorkspaceSection title="คิว" actions={headerActions}><div /></WorkspaceSection>`),
    "src/app/q/page.js": caller,
  });
  assert.deepEqual(rules(inSection, "src/app/q/page.js"), ["LP3"]);
});

test("import Pager from \"./Other\" ไม่ใช่ Pager", () => {
  const r = scan({
    "src/app/o/page.js": `import Workspace from "@/components/ui/Workspace";
import Pager from "./Other";
export default function O() { return <Workspace><Pager /></Workspace>; }
`,
  });
  assert.deepEqual(rules(r, "src/app/o/page.js"), []);
});

test("LP4: ตารางลอยบน static route ยิงโดน · [id] route ผ่าน · wrapper className ไม่คงที่ ผ่าน · family นิพจน์ยิงโดน", () => {
  const float = `import { TableScroll } from "@/components/ui/Table";
export default function Float() { return <TableScroll />; }
`;
  const r = scan({
    "src/app/r/page.js": page(`<Workspace><TableScroll /></Workspace>`),
    "src/app/r/[id]/page.js": page(`<Workspace><TableScroll /></Workspace>`),
    "src/app/wrap/page.js": page(`<Workspace><div className={rows ? "a" : "b"}><TableScroll /></div></Workspace>`),
    "src/app/fam/page.js": page(`<Workspace>${LP()}<TableScroll family={rows} /></ListPanel></Workspace>`),
    "src/components/x/Float.js": float,
    "src/app/detail/[id]/page.js": page(`<Workspace><Float /></Workspace>`, `import Float from "@/components/x/Float";`),
  });
  assert.deepEqual(rules(r, "src/app/r/page.js"), ["LP4"]);
  assert.deepEqual(rules(r, "src/app/r/[id]/page.js"), []);
  assert.deepEqual(rules(r, "src/app/wrap/page.js"), []);
  assert.deepEqual(rules(r, "src/app/fam/page.js"), ["LP4"]);
  assert.deepEqual(rules(r, "src/components/x/Float.js"), [], "คอมโพเนนต์ถูกตัดสินตาม route ของผู้เรียก ([id] = ผ่าน)");
  const onStatic = scan({
    "src/components/x/Float.js": float,
    "src/app/list/page.js": page(`<Workspace><Float /></Workspace>`, `import Float from "@/components/x/Float";`),
  });
  assert.deepEqual(rules(onStatic, "src/components/x/Float.js"), ["LP4"]);
});

test("PARSE: ไฟล์ที่พาร์สไม่ผ่านถูกรายงาน", () => {
  const r = scan({ "src/app/broken/page.js": "export default function Broken() { return <div>; }\n" });
  assert.deepEqual(rules(r, "src/app/broken/page.js"), ["PARSE"]);
  assert.equal(r.parseFailures.length, 1);
});

test("OVERLAY คำนวณเอง: คอมโพเนนต์ใหม่ที่วาด children ใน role=dialog ถูกจับได้โดยไม่ต้องแก้ด่าน", () => {
  const sheet = (attrs) => `export default function Sheet({ children }) { return <aside ${attrs}>{children}</aside>; }\n`;
  const caller = page(`<Workspace><Sheet><SortMenu /><Pager /></Sheet></Workspace>`, `import Sheet from "@/components/x/Sheet";`);
  const dialog = scan({ "src/components/x/Sheet.js": sheet('role="dialog" aria-label="แผ่น"'), "src/app/s/page.js": caller });
  assert.deepEqual(rules(dialog, "src/app/s/page.js"), []);
  const plain = scan({ "src/components/x/Sheet.js": sheet('aria-label="แผ่น"'), "src/app/s/page.js": caller });
  assert.deepEqual(rules(plain, "src/app/s/page.js"), ["LP2", "LP3"]);
});

test("LP5: ขาด count · spread · EmptyState ไม่ plain · Skeleton ในแผง · แผงซ้อนแผง", () => {
  const r = scan({
    "src/app/nocount/page.js": page(`<Workspace><ListPanel icon={<i />} title="t"><TableScroll /></ListPanel></Workspace>`),
    "src/app/spread/page.js": page(`<Workspace><ListPanel {...rows} icon={<i />} title="t" count="1 ใบ"><div /></ListPanel></Workspace>`),
    "src/app/empty/page.js": page(`<Workspace>${LP()}<EmptyState>ว่าง</EmptyState></ListPanel></Workspace>`),
    "src/app/plain/page.js": page(`<Workspace>${LP()}<EmptyState plain>ว่าง</EmptyState></ListPanel></Workspace>`),
    "src/app/plainfalse/page.js": page(`<Workspace>${LP()}<EmptyState plain={false}>ว่าง</EmptyState></ListPanel></Workspace>`),
    "src/app/skeleton/page.js": page(`<Workspace>${LP()}<SkeletonRows /></ListPanel></Workspace>`),
    "src/app/nested/page.js": page(`<Workspace>${LP()}<WorkspaceSection title="x"><div /></WorkspaceSection></ListPanel></Workspace>`),
  });
  for (const file of ["nocount", "spread", "empty", "plainfalse", "skeleton", "nested"]) {
    assert.deepEqual(rules(r, `src/app/${file}/page.js`), ["LP5"], file);
  }
  assert.deepEqual(rules(r, "src/app/plain/page.js"), []);
});

test("LP7: import TableShell · sectionHeader บน RequestQueuePanel", () => {
  const r = scan({
    "src/app/shell/page.js": page(`<Workspace><TableShell /></Workspace>`, `import { TableShell } from "@/components/ui/Table";`),
    "src/app/queue/page.js": page(`<Workspace><RequestQueuePanel sectionHeader={false} /></Workspace>`, `import RequestQueuePanel from "@/components/requests/RequestQueuePanel";`),
    "src/app/ok/page.js": page(`<Workspace><RequestQueuePanel /></Workspace>`, `import RequestQueuePanel from "@/components/requests/RequestQueuePanel";`),
  });
  assert.deepEqual(rules(r, "src/app/shell/page.js"), ["LP7"]);
  assert.deepEqual(rules(r, "src/app/queue/page.js"), ["LP7"]);
  assert.deepEqual(rules(r, "src/app/ok/page.js"), []);
});

test("LP8: markup ui-section เขียนเอง ยิงโดน · คลาสที่ขึ้นต้นคล้ายกันไม่นับ", () => {
  const r = scan({
    "src/app/raw/page.js": page(`<Workspace><section className="ui-section"><div className="ui-section-body" /></section></Workspace>`),
    "src/app/ok/page.js": page(`<Workspace><section className="ui-sectioned" /></Workspace>`),
  });
  assert.deepEqual(rules(r, "src/app/raw/page.js"), ["LP8"]);
  assert.deepEqual(rules(r, "src/app/ok/page.js"), []);
});

test("LP9: ป้ายจำนวนใน headerRight ของหน้าที่มี ListPanel ยิงโดน · หน้าไม่มีรายการผ่าน", () => {
  const r = scan({
    "src/app/badge/page.js": page(`<Workspace headerRight={<span className="ui-badge">3 ใบ</span>}>${LP()}<TableScroll /></ListPanel></Workspace>`),
    "src/app/count/page.js": page(`<Workspace headerRight={<CountBadge count={3} />}>${LP()}<TableScroll /></ListPanel></Workspace>`),
    "src/app/dash/page.js": page(`<Workspace headerRight={<span className="ui-badge">3 ใบ</span>}><div /></Workspace>`),
  });
  assert.deepEqual(rules(r, "src/app/badge/page.js"), ["LP9"]);
  assert.deepEqual(rules(r, "src/app/count/page.js"), ["LP9"]);
  assert.deepEqual(rules(r, "src/app/dash/page.js"), []);
});

test("LP-PREVIEW: หน้าต้นแบบต้องสาธิต ListPanel (count · toolbar · TableScroll · Pager · <code>ListPanel</code>)", () => {
  const missing = scan({ [PREVIEW_FILE]: page(`<Workspace><div /></Workspace>`) });
  assert.deepEqual(rules(missing, PREVIEW_FILE), ["LP-PREVIEW"]);
  const demo = scan({
    [PREVIEW_FILE]: page(`<Workspace><code>ListPanel</code>${LP("toolbar={<SortMenu />}")}<TableScroll /><Pager /></ListPanel><SortMenu /></Workspace>`),
  });
  assert.deepEqual(rules(demo, PREVIEW_FILE), [], "หน้าต้นแบบอยู่นอก LP2/LP3/LP9 — ตัวควบคุมวางโชว์เดี่ยวได้");
});
