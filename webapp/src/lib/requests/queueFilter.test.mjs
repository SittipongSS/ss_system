// ── ตัวเลขทุกตัวบนหน้าคิวคำร้อง = แถวที่เห็นหลังกด (ตรวจตัวเลข 20/10/2026 · M1–M5) ──────────
//
// กติกาเจ้าของ: ตัวเลขบนการ์ด/ป้าย/แท็บ/ตัวเลือก ต้องเท่ากับแถวที่ผู้ใช้เห็นหลังกดมันเป๊ะ ๆ — ตัวตัดสินเดียว
// (`passesQueueFilters`) ให้ทั้งตัวนับและตาราง · ตัวเลขของตัวเลือก/แท็บนับพร้อมตัวกรองอื่นที่ยังค้างอยู่
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterQueueRows, matchesQueueSearch, passesQueueFilters, queueFacetOptions, queueStripCounts,
} from './queueFilter.js';
import {
  QUEUE_COUNT_META, QUEUE_TABS, deptQueueRows, deptQueueTabs, matchesQueueCount, queueTabRows,
  visibleQueueRows,
} from './queueBoard.js';
import { FACET_NONE, filterRequestRows, requestFacet } from './queueList.js';
import { requestKindLabelFull } from '../master/requestTypes.js';

const TODAY = '2026-08-11';
const waitDept = { ackAt: '2026-08-01', answerStatus: 'pending' };
const waitRequester = { ackAt: '2026-08-01', readyAt: '2026-08-02', answerStatus: 'pending' };

let seq = 0;
const req = (over = {}) => {
  seq += 1;
  return {
    id: `R${seq}`, docNo: `RQ-260800${String(seq).padStart(2, '0')}`, title: `เรื่อง ${seq}`,
    status: 'acknowledged', dept: 'RD', kind: 'material_price', items: [waitDept],
    customerId: 'C1', customerName: 'ลอรีอัล', projectId: 'P1', projectCode: 'PJ-1', projectName: 'โครงการหนึ่ง',
    acknowledgedAt: '2026-08-01', _mine: false,
    ...over,
  };
};
const anan = { assigneeId: 'U1', assigneeName: 'Anan' };
const pakita = { assigneeId: 'U2', assigneeName: 'Pakita' };

/* ชุดที่ทุกมิติมีหลายค่า และทุกกล่องของแถบตัวเลขมีใบจริง — ตัวเลขที่ "ถูกเพราะเป็น 0 ทั้งหมด" จับอะไรไม่ได้ */
const ROWS = [
  req({ status: 'pending', items: [], acknowledgedAt: null }),                                    // ยังไม่รับเรื่อง
  req({ status: 'pending', items: [], acknowledgedAt: null, customerId: 'C2', customerName: 'เอสเต' }),
  req({ ...anan, committedDueDate: '2026-08-01' }),                                               // เลยกำหนด
  req({ ...anan, committedDueDate: '2026-08-05', customerId: 'C2', customerName: 'เอสเต', kind: 'scent_dev' }),
  req({ ...anan, committedDueDate: '2026-12-31', projectId: null }),                              // กำลังทำ มีวัน
  req({ ...pakita, committedDueDate: null, customerId: null, customerName: '' }),                  // ยังไม่ได้ให้วัน
  req({ ...pakita, committedDueDate: '2026-08-04', customerId: 'C2', customerName: 'เอสเต' }),     // เลยกำหนด คนละคน
  req({ ...pakita, committedDueDate: '2026-08-02', items: [waitRequester] }),                      // รอผู้ขอ เลยกำหนด
  req({ ...anan, committedDueDate: '2026-12-01', items: [waitRequester], kind: 'scent_dev', projectId: 'P2', projectCode: 'PJ-2', projectName: 'โครงการสอง' }),
  req({ ...pakita, items: [waitRequester], customerId: 'C2', customerName: 'เอสเต', _mine: true }),
  req({ dept: 'FN', ...anan, committedDueDate: '2026-08-03' }),
  req({ dept: 'FN', status: 'pending', items: [], acknowledgedAt: null, _mine: true }),
  req({ status: 'closed', ...anan, closedAt: '2026-08-05T03:00:00Z', answeredAt: '2026-08-04T03:00:00Z' }),
  req({ status: 'cancelled', cancelledAt: '2026-08-06T03:00:00Z', customerId: 'C2', customerName: 'เอสเต' }),
  req({ status: 'draft', items: [], _mine: true, bouncedAt: '2026-08-08T03:00:00Z' }),            // ตีกลับ ของฉัน
  req({ status: 'draft', items: [], _mine: false, bouncedAt: '2026-08-09T03:00:00Z', customerId: 'C2', customerName: 'เอสเต' }), // ของเพื่อน
  req({ status: 'draft', items: [], _mine: true }),                                               // ร่างไม่เคยส่ง
];

const DIMS = ['kind', 'customer', 'project', 'owner'];
const COUNT_KEYS = [null, ...QUEUE_COUNT_META.map((m) => m.key)];
const SEARCHES = ['', 'เอสเต', 'RQ-2608000'];
const FILTER_SETS = [
  {},
  { owner: ['U1'] },
  { customer: ['C1'], owner: ['U2'] },
  { kind: ['scent_dev'] },
  { customer: ['C2', FACET_NONE] },
];
const STATES = COUNT_KEYS.flatMap((countFilter) => SEARCHES.flatMap((search) =>
  FILTER_SETS.map((filters) => ({ countFilter, search, filters, todayIso: TODAY }))));

const optionCount = (option) => Number(/\((\d+)\)$/.exec(option.label)?.[1]);

test('ตัวตัดสินเดียวให้ผลเท่าชั้นกรองเดิมของพาเนล (ตัวเลข → คำค้น → แผงกรอง) ทุกสถานะ', () => {
  for (const state of STATES) {
    const legacy = filterRequestRows(
      ROWS
        .filter((r) => (state.countFilter ? matchesQueueCount(r, state.countFilter, { todayIso: TODAY }) : true))
        .filter((r) => matchesQueueSearch(r, state.search, { kindLabel: requestKindLabelFull })),
      state.filters,
    );
    assert.deepEqual(filterQueueRows(ROWS, state).map((r) => r.id), legacy.map((r) => r.id), JSON.stringify(state));
  }
});

test('🔴 M1 ตัวเลขท้ายตัวเลือกในแผงกรอง = ติ๊กตัวนั้น (แทนตัวที่ติ๊กในมิตินั้น) แล้วตารางเหลือเท่านั้นเป๊ะ', () => {
  let checked = 0;
  for (const state of STATES) {
    for (const dim of DIMS) {
      for (const option of queueFacetOptions(ROWS, state, dim)) {
        const ticked = { ...state, filters: { ...state.filters, [dim]: [option.value] } };
        assert.equal(
          filterQueueRows(ROWS, ticked).length, optionCount(option),
          `${dim}=${option.label} · ${JSON.stringify(state)}`,
        );
        checked += 1;
      }
    }
  }
  assert.ok(checked > 200, `ต้องเทียบของจริงพอ (${checked})`);
});

test('M1 ติ๊กหลายตัวในมิติเดียว = ผลรวมของตัวเลขของตัวที่ติ๊ก (ในมิติเดียวกันเป็น "หรือ")', () => {
  for (const state of STATES) {
    for (const dim of DIMS) {
      const selected = state.filters[dim] || [];
      if (!selected.length) continue;
      const sum = queueFacetOptions(ROWS, state, dim)
        .filter((o) => selected.includes(o.value))
        .reduce((n, o) => n + optionCount(o), 0);
      assert.equal(filterQueueRows(ROWS, state).length, sum, `${dim} ${JSON.stringify(state)}`);
    }
  }
});

test('🐞 M1 ภาพที่ตรวจเจอ: ติ๊กลูกค้าอยู่ ผู้รับเรื่องนับเฉพาะลูกค้านั้น · ติ๊ก RD ไม่ทำให้ตัวเลือกอื่นหาย', () => {
  const state = { countFilter: null, search: '', filters: { customer: ['C2'] }, todayIso: TODAY };
  const owners = Object.fromEntries(queueFacetOptions(ROWS, state, 'owner').map((o) => [o.value, optionCount(o)]));
  assert.equal(owners.U1, filterQueueRows(ROWS, { ...state, filters: { customer: ['C2'], owner: ['U1'] } }).length);
  // มิติที่ติ๊กอยู่ไม่ถูกตัวเองกรอง — ตัวเลือก C1 ยังอยู่ ติ๊กเพิ่มได้
  const customers = queueFacetOptions(ROWS, state, 'customer').map((o) => o.value);
  assert.ok(customers.includes('C1') && customers.includes('C2'));
  // ตัวเลขบนแถบที่กดค้างอยู่ก็เป็นชั้นหนึ่ง — ลูกค้าที่ไม่มีใบเลยกำหนดได้ (0)/ไม่ขึ้น
  const overdue = { ...state, filters: {}, countFilter: 'overdue' };
  for (const option of queueFacetOptions(ROWS, overdue, 'customer')) {
    assert.equal(filterQueueRows(ROWS, { ...overdue, filters: { customer: [option.value] } }).length, optionCount(option));
  }
});

test('M1 ตัวที่ติ๊กอยู่แต่ไม่มีใบในมุมมองนี้ยังอยู่ในลิสต์ (0) — ป้ายจาก labelRows · กดยกเลิกได้', () => {
  const historyRows = deptQueueRows(ROWS, { dept: 'RD', tab: 'history' });
  const state = { countFilter: null, search: '', filters: { owner: ['U2', 'U-ghost', FACET_NONE] }, todayIso: TODAY };
  const options = queueFacetOptions(historyRows, state, 'owner', { labelRows: ROWS });
  const byValue = Object.fromEntries(options.map((o) => [o.value, o.label]));
  assert.equal(byValue.U2, 'Pakita (0)', 'ชื่อคนมาจากชุดทุกแท็บ ไม่ใช่ id');
  assert.equal(byValue['U-ghost'], 'ไม่มีในมุมมองนี้ (0)');
  assert.match(byValue[FACET_NONE], /^ยังไม่มีคนรับ \(\d+\)$/);
  assert.equal(options[options.length - 1].value, FACET_NONE, '"ไม่ระบุ…" ท้ายสุดเสมอ');
  // ไม่ส่ง labelRows = ใช้ชุดที่นับ ⇒ ตั้งชื่อไม่ได้ แต่ยังอยู่ในลิสต์
  assert.equal(
    queueFacetOptions(historyRows, state, 'owner').find((o) => o.value === 'U2').label,
    'ไม่มีในมุมมองนี้ (0)',
  );
});

test('🔴 M2 แถบตัวเลข: กดช่องไหนก็ได้แถวเท่าเลขช่องนั้น — นับพร้อมคำค้น/แผงกรองที่ค้าง แม้มีช่องอื่นกดค้างอยู่', () => {
  let nonZero = 0;
  for (const state of STATES) {
    const counts = queueStripCounts(ROWS, state);
    for (const meta of QUEUE_COUNT_META) {
      const shown = filterQueueRows(ROWS, { ...state, countFilter: meta.key }).length;
      assert.equal(counts[meta.key], shown, `${meta.key} · ${JSON.stringify(state)}`);
      if (shown) nonZero += 1;
    }
  }
  assert.ok(nonZero > 30);
});

test('🐞 M2 ภาพที่ตรวจเจอ: ?owner= คนหนึ่ง แล้วกด "เลยกำหนด" — เลขบนช่อง = แถวของคนนั้น', () => {
  const rows = deptQueueRows(ROWS, { dept: 'RD', tab: 'todo' });
  const state = { countFilter: null, search: '', filters: { owner: ['U1'] }, todayIso: TODAY };
  const overdue = queueStripCounts(rows, state).overdue;
  assert.equal(overdue, filterQueueRows(rows, { ...state, countFilter: 'overdue' }).length);
  assert.ok(overdue < queueStripCounts(rows, { ...state, filters: {} }).overdue, 'ต้องต่างจากเลขทั้งแท็บจริง ๆ');
});

/* ── M3 คิวรายฝ่าย: ตัวจำลองหน้า `/rd|/finance|/service/requests` ──────────────────────
   แท็บ = `deptQueueRows` · ตาราง = พาเนล (`filterQueueRows`) · `setTab` ล้างตัวกรองตัวเลข คำค้น/แผงกรองตามไป */
const deptPage = (requests, dept, state) => ({
  tabCount: (tab) => filterQueueRows(deptQueueRows(requests, { dept, tab }), state, { except: 'count' }).length,
  rowsAfterSetTab: (tab) => filterQueueRows(deptQueueRows(requests, { dept, tab }), { ...state, countFilter: null }).length,
});

test('🔴 M3 เลขบนแท็บคิวฝ่าย = แถวหลังกดแท็บนั้น (รวมกดแท็บที่เปิดอยู่ซ้ำ) ทุกสถานะที่ค้างมา', () => {
  for (const dept of ['RD', 'FN']) {
    for (const state of STATES) {
      const page = deptPage(ROWS, dept, state);
      for (const t of deptQueueTabs(dept)) {
        assert.equal(page.tabCount(t.key), page.rowsAfterSetTab(t.key), `${dept} ${t.key} ${JSON.stringify(state)}`);
      }
    }
  }
});

test('🐞 M3 ภาพที่ตรวจเจอ: กด "กำลังดำเนินการ" ในแท็บรอ RD แล้วไปแท็บรอผู้ขอ — ค้างไว้ = ตารางว่างทั้งที่แท็บบอกว่ามีใบ', () => {
  const waiting = deptQueueRows(ROWS, { dept: 'RD', tab: 'waiting' });
  assert.ok(waiting.length > 0);
  assert.equal(filterQueueRows(waiting, { countFilter: 'working', todayIso: TODAY }).length, 0, 'ตัวกรองที่ค้างจะให้ 0');
  assert.equal(deptPage(ROWS, 'RD', { countFilter: 'working', todayIso: TODAY }).rowsAfterSetTab('waiting'), waiting.length);
});

/* ── M4 + M5 คิวรวม `/requests`: ตัวจำลองหน้า (ลำดับชั้นเดียวกับ page.js) ─────────────────────
   ชุดหลัก (ทีม/ดีล) → ฝ่าย → แท็บ/ขอบเขต (`visibleQueueRows`) → พาเนล (`filterQueueRows`) */
function requestsPage({ linked = ROWS, scope = 'mine', tab = 'todo', myDepts = ['RD'], dept = 'all', state }) {
  const requests = dept === 'all' ? linked : linked.filter((r) => r.dept === dept);
  const defaultTab = myDepts.length ? 'todo' : 'mine';
  const table = (over = {}) => {
    const t = over.tab === undefined ? tab : (over.tab ?? defaultTab);
    const d = over.dept ?? dept;
    const st = over.state ?? state;
    const set = d === 'all' ? linked : linked.filter((r) => r.dept === d);
    return filterQueueRows(visibleQueueRows(set, { scope, tab: t, myDepts }), st);
  };
  const deptCountBase = filterQueueRows(visibleQueueRows(linked, { scope, tab, myDepts }), state);
  return {
    requests, table, defaultTab,
    roleTabCount: (t) => filterQueueRows(queueTabRows(requests, { tab: t, myDepts }), state, { except: 'count' }).length,
    openCount: filterQueueRows(visibleQueueRows(requests, { scope, tab: defaultTab, myDepts }), state, { except: 'count' }).length,
    historyCount: filterQueueRows(visibleQueueRows(requests, { scope, tab: 'history', myDepts }), state, { except: 'count' }).length,
    deptChip: (d) => (d === 'all' ? deptCountBase.length : deptCountBase.filter((r) => r.dept === d).length),
    // แถบนับจากชุดของแท็บ (ก่อนพาเนล) — `rows` ของหน้า
    strip: queueStripCounts(visibleQueueRows(requests, { scope, tab, myDepts }), state),
    banner: requests.filter((r) => matchesQueueCount(r, 'bounced')).length,
  };
}

test('🔴 M4 /requests: แท็บบทบาท · ชิปฝ่าย · แถบตัวเลข = แถวหลังกด (ทุกสถานะ ทุกแท็บ ทุกฝ่ายที่เลือกค้าง)', () => {
  for (const state of STATES) {
    for (const tab of QUEUE_TABS.map((t) => t.key)) {
      for (const dept of ['all', 'RD', 'FN']) {
        const page = requestsPage({ tab, dept, state });
        const cleared = { ...state, countFilter: null };
        for (const t of QUEUE_TABS) {
          assert.equal(page.roleTabCount(t.key), page.table({ tab: t.key, state: cleared }).length, `แท็บ ${t.key} ${tab} ${dept} ${JSON.stringify(state)}`);
        }
        // สลับฝ่ายไม่ล้างอะไรเลย ⇒ เลขชิปนับพร้อมทุกชั้น
        for (const d of ['all', 'RD', 'FN']) {
          assert.equal(page.deptChip(d), page.table({ dept: d }).length, `ฝ่าย ${d} ${tab} ${JSON.stringify(state)}`);
        }
        for (const meta of QUEUE_COUNT_META) {
          assert.equal(page.strip[meta.key], page.table({ state: { ...state, countFilter: meta.key } }).length, meta.key);
        }
      }
    }
  }
});

test('🔴 M4 /requests ขอบเขตทีม/ทั้งหมด: "ในคิว" / "ประวัติ" = แถวหลังกด', () => {
  for (const state of STATES) {
    for (const scope of ['team', 'all']) {
      const page = requestsPage({ scope, tab: 'history', state });
      const cleared = { ...state, countFilter: null };
      // "ในคิว" ถอด ?tab= ⇒ แท็บตั้งต้น
      assert.equal(page.openCount, page.table({ tab: null, state: cleared }).length, JSON.stringify(state));
      assert.equal(page.historyCount, page.table({ tab: 'history', state: cleared }).length, JSON.stringify(state));
    }
  }
});

test('🐞 M4 ภาพที่ตรวจเจอ: กดแถบเตือนตีกลับ (ไปแท็บ "ที่ฉันเปิด") แล้วกลับแท็บ "รอฉันตอบ" — เลขแท็บ = แถว', () => {
  const state = { countFilter: 'bounced', search: '', filters: {}, todayIso: TODAY };
  const page = requestsPage({ tab: 'mine', state });
  const todo = page.roleTabCount('todo');
  assert.ok(todo > 0);
  // ตัวกรองที่ค้างมา (ของเดิม) ให้ 0 — ในแท็บรอฉันตอบไม่มีกล่อง "ตีกลับ" ให้กดล้างด้วย
  assert.equal(page.table({ tab: 'todo' }).length, 0);
  assert.equal(page.table({ tab: 'todo', state: { ...state, countFilter: null } }).length, todo);
});

test('🔴 M5 แถบเตือนใบตีกลับ = แถวหลังกด "ดูใบที่ตีกลับ" ทั้งขอบเขตของฉันและทีม/ทั้งหมด', () => {
  for (const state of STATES) {
    for (const scope of ['mine', 'team', 'all']) {
      const linked = scope === 'mine' ? ROWS.filter((r) => r._mine || r.status !== 'draft') : ROWS;
      const page = requestsPage({ linked, scope, state });
      // ปุ่ม: ล้างคำค้น + แผงกรอง → แท็บ (ของฉัน = 'mine' · ทีม/ทั้งหมด = ถอด ?tab=) → ตั้งตัวกรอง "ตีกลับ"
      const after = page.table({
        tab: scope === 'mine' ? 'mine' : null,
        state: { countFilter: 'bounced', search: '', filters: {}, todayIso: TODAY },
      });
      assert.equal(page.banner, after.length, `${scope} ${JSON.stringify(state)}`);
      assert.ok(after.every((r) => r._mine), 'ใบตีกลับของเพื่อนไม่อยู่ในชุดที่แถบนับ');
    }
  }
  // ภาพที่ตรวจเจอ: ทีมมีใบตีกลับของเพื่อนด้วย — เดิมแถบ 1 ตาราง 2
  assert.equal(requestsPage({ scope: 'team', state: STATES[0] }).banner, 1);
});

/* ── ยามซอร์ส: จอใช้ตัวตัดสินเดียวกันนี้ ไม่นับเอง ─────────────────────────────────────── */
const live = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('ยาม: พาเนลกรองตารางและนับตัวเลือกด้วยสถานะชุดเดียวกัน', () => {
  const panel = live('../../components/requests/RequestQueuePanel.js');
  assert.match(panel, /\(\) => \(\{ countFilter, search, filters: showTools \? filters : \{\}, todayIso: today \}\)/);
  assert.match(panel, /sortRequestRows\(filterQueueRows\(rows, queueState\), \{ key: sortKey, dir: sortDir \}\)/);
  assert.match(panel, /options: queueFacetOptions\(rows, queueState, g\.key, \{ labelRows: labelRows \|\| rows \}\)/);
  assert.doesNotMatch(panel, /requestFacetOptions\(|filterRequestRows\(|matchesQueueCount\(/, 'ห้ามกลับไปกรอง/นับเองชั้นละที่');
});

test('ยาม: คิวรายฝ่ายสามหน้านับแถบ/แท็บด้วยตัวตัดสินของพาเนล · สลับแท็บล้างตัวกรองตัวเลข · เมนูซ้ำเริ่มคิวใหม่', () => {
  for (const page of ['rd', 'finance', 'service']) {
    const src = live(`../../app/${page}/requests/page.js`);
    assert.match(src, /countFilter: board\.countFilter, search: board\.search, filters: board\.filters, todayIso: businessDate\(\)/, page);
    assert.match(src, /const counts = queueStripCounts\(rows, queueState\);/, page);
    assert.match(src, /filterQueueRows\(deptQueueRows\(requests, \{ dept: DEPT, tab: key \}\), queueState, \{ except: "count" \}\)\.length/, page);
    assert.match(src, /count: tabCount\(t\.key\),/, page);
    assert.match(src, /labelRows=\{requests\}/, page);
    assert.doesNotMatch(src, /queueCounts\(/, page);
    // URL เปล่า (เมนู) = ล้างทุกชั้นแล้วเขียน ?tab=todo ทับ
    assert.match(src, /const bareUrl = searchParams\.toString\(\) === "";/, page);
    assert.match(src, /if \(!bareUrl\) return;\s*setSearch\(""\); clearFilters\(\); setCountFilter\(null\);\s*router\.replace\(`?"?\/\w+\/requests\?tab=todo"?`?, \{ scroll: false \}\);/, page);
  }
});

test('ยาม: /requests นับทุกตัวเลขด้วยตัวตัดสินของพาเนล · แถบเตือนตีกลับใช้กติกาเดียวกับกล่อง', () => {
  const src = live('../../app/requests/page.js');
  assert.match(src, /const counts = queueStripCounts\(rows, queueState\);/);
  assert.match(src, /count: filterQueueRows\(queueTabRows\(requests, \{ tab: t\.key, myDepts \}\), queueState, \{ except: "count" \}\)\.length/);
  assert.match(src, /filterQueueRows\(visibleQueueRows\(linkedRequests, \{ scope: activeScope, tab, myDepts \}\), queueState\)/);
  assert.equal((src.match(/queueState, \{ except: "count" \},/g) || []).length, 2, '"ในคิว" + "ประวัติ"');
  assert.match(src, /requests\.filter\(\(r\) => matchesQueueCount\(r, "bounced"\)\)/);
  assert.match(src, /board\.setSearch\(""\);\s*board\.clearFilters\(\);\s*setTab\(roleTabsApply \? "mine" : null\);\s*board\.setCountFilter\("bounced"\);/);
  assert.match(src, /<Button size="sm" onClick=\{showBounced\}>/);
  assert.match(src, /labelRows=\{rawRequests\}/);
  assert.doesNotMatch(src, /queueCounts\(/);
  // ⚠️ /requests ไม่เขียน ?tab= เองตอน URL เปล่า — `?tab=todo` บีบขอบเขตเป็น "ของฉัน" (#1038)
  assert.doesNotMatch(src, /bareUrl/);
});

test('matchesQueueSearch ยังเรียกผ่าน useQueueBoard ได้ (ผู้เรียกเดิม) และเป็นตัวเดียวกัน', async () => {
  const hook = await import('./useQueueBoard.js');
  assert.equal(hook.matchesQueueSearch, matchesQueueSearch);
  assert.equal(passesQueueFilters(ROWS[0], { search: ROWS[0].docNo }), true);
  assert.equal(passesQueueFilters(ROWS[0], { search: 'ไม่มีคำนี้แน่นอน' }), false);
  assert.equal(requestFacet(ROWS[0], 'owner').key, FACET_NONE);
});
