// ── แผง "รายการงาน" ของหน้าจัดคิวเจ้าหน้าที่ — ประกอบแถว/กลุ่มจากนัดข้ามสัปดาห์ ──
//
// ⭐ มติผู้ใช้ 2026-09-22: "ไม่มี panel รายการงาน มีแต่ปฏิทิน อยากโชว์รายการคิวที่รอ ที่จัดแล้ว"
//    ⇒ รายการงานวางคู่กับตารางสัปดาห์ (ทางเลือก B) · ไม่ผูกกับสัปดาห์ที่เปิด
// 🐞 ของเดิม "คิวรอจัด" โผล่เฉพาะร่างในสัปดาห์ที่เปิด — ร่างของรอบบริการ (สร้างล่วงหน้า 90 วัน)
//    กับงานถอนเครื่อง (วันที่ = วันที่เกิด) หายจากทุกจอเมื่อพ้นสัปดาห์ · นัดค้างมองไม่เห็นเลย
//    ต้องกดย้อนสัปดาห์เอง (docs/service-field-operations.md ข้อ F-6 สัญญา "คิวรอจัดถาวร" ไว้)
//
// ⚠️ ไฟล์นี้ **ประกอบอย่างเดียว ไม่ตัดสินเอง** — ถัง/กลุ่ม/ช่วงวันมาจาก scheduleQueue.js
//    ด่านมาจาก visitGate.js ตัวเดียวกับ server · สถานะมาจาก visitStatus.js
//    ห้ามเทียบสตริงสถานะหรือเจ้าของด่านตรงนี้
import { VISIT_KIND_LABELS, VISIT_STATUS_LABELS, overlappingVisitIds, visitTimeText, visitWarnings } from './rounds';
import { evaluateVisitGate, gateBlockedItems, GATE_OWNERS, visitSkipsContractGates } from './visitGate';
import { gateContextForSite } from './gateContext';
import { isDraftVisit, isLiveVisit, isShortfallVisit } from './visitStatus';
import { NO_TEAM } from './crewTeams';
import { MAX_ASSETS_PER_DAY } from './visitLoad';
import {
  QUEUE_BUCKETS,
  WAITING_GROUPS,
  WAITING_GROUP_LABELS,
  addDaysIso,
  freeCrewOn,
  inQueueRange,
  isStaleDraft,
  overdueDaysOf,
  queueBucketOf,
  queueHaystack,
  queueWindow,
  staffLoadOn,
  teamViewVisit,
  waitingGroupOf,
} from './scheduleQueue';
import { fmtMonthShort } from '@/lib/format';

const DAY_LABELS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
/* ป้ายผลของนัดที่ปิดแล้ว — ตารางสีแบบเดียวกับ VISIT_STATUS_LABELS (ไม่ใช่ชุดสถานะใหม่) */
const CLOSED_TONES = { done: 'success', partial: 'warning', unable: 'danger' };

/** "อ. 22 ก.ย." จากวันที่ล้วน — ไม่เลื่อนโซนเวลา (สตริงวันที่ไม่ใช่เวลา) */
export function dayText(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAY_LABELS[weekday]} ${d} ${fmtMonthShort(iso)}`;
}

/* จำนวนวันระหว่างสองวันที่ (b − a) — ใช้บอก "อีก 3 วัน" */
const daysBetween = (a, b) => {
  const toUtc = (iso) => {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
};

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/* โทนของป้ายเจ้าของด่าน — SA = สีแบรนด์อ่อน (เรื่องของฝ่ายขาย) · เงิน = อำพัน · TS = ฟ้า
   ⚠️ เทียบกับ GATE_OWNERS ไม่ใช่สตริงลอย ๆ */
export function ownerTone(owner) {
  if (owner === GATE_OWNERS.TS) return 'info';
  if (owner === GATE_OWNERS.FN) return 'warning';
  if (owner === GATE_OWNERS.SA) return 'accent';
  return 'neutral';
}

/* ต้นเรื่องของนัด — คนจัดคิวต้องรู้ว่าร่างมาจากไหน (มติ 2026-08-28: TS ไม่ใช่ต้นทางของงาน) */
export function originText(visit) {
  if (visit?.requestId) return 'จากคำร้องประเมินพื้นที่';
  if (visit?.planId) return 'จากรอบบริการ';
  if (visit?.kind === 'remove') return 'ถอนเครื่อง · ลูกค้าไม่ต่อสัญญา';
  return 'งานนอกรอบ';
}

function relativeText(visit, bucket, win) {
  const date = visit?.scheduledDate;
  if (!date) return { text: '', tone: '' };
  if (bucket === 'waiting' && isStaleDraft(visit, win)) {
    const n = overdueDaysOf(visit, win);
    return { text: `วันเสนอผ่านไปแล้ว ${n} วัน — เลือกวันใหม่ก่อนปล่อย`, tone: 'warn' };
  }
  if (bucket === 'overdue') return { text: `ค้าง ${overdueDaysOf(visit, win)} วัน`, tone: 'bad' };
  if (bucket === 'closed') {
    const actual = visit.actualDate || date;
    if (actual === date) return { text: '', tone: '' };
    const n = daysBetween(date, actual);
    return { text: n > 0 ? `เข้าช้ากว่านัด ${n} วัน` : `เข้าก่อนนัด ${-n} วัน`, tone: '' };
  }
  const n = daysBetween(win.todayIso, date);
  if (n === 0) return { text: 'วันนี้', tone: '' };
  if (n === 1) return { text: 'พรุ่งนี้', tone: '' };
  return { text: `อีก ${n} วัน`, tone: '' };
}

function statusOf(visit, bucket) {
  if (bucket === 'overdue') {
    /* "เริ่มแล้วยังไม่ปิด" อ่านจากเวลาที่ประทับ (ปุ่มเริ่มงานเป็นทางเดียวที่ทำให้เป็น in_progress) */
    const inProgress = !!visit.actualStartTime && !visit.actualEndTime;
    return {
      label: VISIT_STATUS_LABELS[visit.status] || visit.status,
      tone: inProgress ? 'success' : 'info',
      text: inProgress
        ? 'เริ่มงานแล้วยังไม่ปิด — ตามให้ปิดงาน'
        : !visit.assigneeId
          ? 'ยังไม่มีเจ้าหน้าที่ — มอบหมาย หรือเลื่อนวัน'
          : 'ยังไม่เริ่มงาน — เลื่อนวัน หรือบันทึกว่าทำไม่ได้',
    };
  }
  if (bucket === 'scheduled') {
    if (visit.gateOverrideReason) {
      return {
        label: 'ข้ามด่าน', tone: 'warning',
        text: `โดย ${visit.gateOverrideByName || 'หัวหน้า'}: ${visit.gateOverrideReason}`,
      };
    }
    if (visit.actualStartTime && !visit.actualEndTime) {
      return { label: VISIT_STATUS_LABELS[visit.status] || visit.status, tone: 'success', text: `เริ่มงาน ${String(visit.actualStartTime).slice(0, 5)} น.` };
    }
    return null;
  }
  if (bucket === 'closed') {
    return {
      label: VISIT_STATUS_LABELS[visit.status] || visit.status,
      tone: CLOSED_TONES[visit.status] || (isShortfallVisit(visit) ? 'warning' : 'success'),
      text: visit.unableReason || visit.summary || '',
    };
  }
  return null;
}

/**
 * ประกอบรายการงานทั้งแผง
 *
 * @param visits       นัดจาก `/api/service/visits/queue` (ร่างทุกวัน + นัดเปิด + ปิดใน 14 วัน)
 * @param sitesById    Map ไซต์ (id → site)
 * @param gateContext  บริบทด่านของไซต์ที่มีร่าง (จาก API ตัวเดียวกัน)
 * @param workload     { [siteId]: { assets, packs } }
 * @param crewPeople   เจ้าหน้าที่หน้างาน [{ id, name }] — ใช้นับ "วันนั้นว่างกี่คน"
 * @param teamNames    Map teamCode → ชื่อทีม
 */
export function buildScheduleQueue({
  visits = [], sitesById = new Map(), gateContext = {}, workload = {},
  todayIso, teamFilter, crewByUser = new Map(), crewPeople = [], teamNames = new Map(),
  bucket = 'waiting', range = 'all', search = '', farOn = false, within = null,
} = {}) {
  const win = queueWindow(todayIso);
  const needle = String(search || '').trim().toLowerCase();

  // ภาระ/เวลาทับนับจากนัดที่ "อยู่บนตาราง" เท่านั้น — ร่างไม่นับภาระ (มติ 2026-08-28)
  const live = visits.filter(isLiveVisit);
  const overlapIds = overlappingVisitIds(live);
  const loadCache = new Map();
  const loadOn = (date) => {
    if (!loadCache.has(date)) loadCache.set(date, staffLoadOn(live, date, workload));
    return loadCache.get(date);
  };
  const teamOf = (userId) => (userId ? crewByUser.get(userId) || NO_TEAM : null);
  const teamLabel = (userId) => {
    const code = teamOf(userId);
    if (!code || code === NO_TEAM) return '';
    return teamNames.get(code) || '';
  };
  const peopleInView = crewPeople.filter((p) => teamViewVisit({ assigneeId: p.id }, teamFilter, crewByUser));

  const rows = [];
  for (const visit of visits) {
    const b = queueBucketOf(visit, win);
    if (!b) continue;
    if (!teamViewVisit(visit, teamFilter, crewByUser)) continue;
    const site = sitesById.get(visit.siteId) || null;
    const draft = b === 'waiting';
    const gate = draft
      ? evaluateVisitGate(visit, gateContextForSite(gateContext, visit.siteId, { site }))
      : null;
    const group = draft ? waitingGroupOf(gate, visit, win) : null;
    const blocked = draft ? gateBlockedItems(gate) : [];
    const siteLoad = workload[visit.siteId] || null;
    const assets = siteLoad?.assets || 0;
    const packs = siteLoad?.packs || 0;
    const rel = relativeText(visit, b, win);

    // ── เจ้าหน้าที่ ──
    const date = visit.scheduledDate;
    const soon = date && date <= win.weekUntil;
    let who;
    if (!visit.assigneeId) {
      who = { text: 'ยังไม่มอบหมาย', tone: (b === 'overdue' || soon || isStaleDraft(visit, win)) ? 'warn' : '', sub: 'ทุกทีมหยิบได้', linkId: null };
    } else if (draft) {
      /* ⚠️ ร่างที่ตั้งชื่อไว้ **ยังไม่ใช่งานของคนนั้น** — ห้ามลิงก์ไปงานวันนี้ของเขา
         และต้องเขียนให้ชัดว่ายังไม่ถึงมือ (กฎ "ร่างต้องไม่อ่านเป็นงานของเจ้าหน้าที่") */
      who = { text: `ตั้งไว้ ${visit.assigneeName || ''}`.trim(), tone: '', sub: 'ยังไม่ถึงมือเจ้าหน้าที่', linkId: null };
    } else {
      const extra = Array.isArray(visit.assistantIds) && visit.assistantIds.length ? ` · ไปด้วย +${visit.assistantIds.length}` : '';
      who = { text: visit.assigneeName || '', tone: '', sub: `${teamLabel(visit.assigneeId)}${extra}`.replace(/^ · /, ''), linkId: visit.assigneeId };
    }

    // ── ภาระวันนั้น (เฉพาะวันนี้เป็นต้นไป) ──
    let dayLoad = null;
    if (date && date >= win.todayIso && (b === 'waiting' || b === 'scheduled')) {
      if (visit.assigneeId) {
        const load = loadOn(date).get(visit.assigneeId) || { visits: 0, assets: 0, packs: 0 };
        const total = draft ? load.assets + assets : load.assets;
        const name = firstName(visit.assigneeName);
        dayLoad = {
          text: draft
            ? `ถ้าปล่อย วันนั้น${name}รวม ${total}/${MAX_ASSETS_PER_DAY} จุด`
            : `วันนั้นของ${name} ${total}/${MAX_ASSETS_PER_DAY} จุด`,
          tone: total > MAX_ASSETS_PER_DAY ? 'warn' : '',
          projected: total,
        };
      } else if (peopleInView.length) {
        const { free, total } = freeCrewOn(live, date, peopleInView);
        dayLoad = { text: `วันนั้นว่าง ${free.length} จาก ${total} คน`, tone: free.length ? 'ok' : 'warn', free };
      }
    }

    const status = statusOf(visit, b);
    const warns = b === 'overdue' || b === 'scheduled'
      ? visitWarnings(visit, { site, overlapIds }).map((w) => w.message)
      : [];
    /* ข้อที่แก้ได้บนการ์ดมีลิงก์แก้ต่อท้ายอยู่แล้ว ⇒ ตัดครึ่งหลังของเหตุที่เป็นคำสั่งซ้ำทิ้ง
       ("ยังไม่มอบหมาย — เลือกเจ้าหน้าที่…" + ลิงก์ "เลือกเจ้าหน้าที่" = พูดสองครั้ง) */
    const gateItems = blocked.map((item) => ({
      key: item.key, owner: item.owner, ownerTone: ownerTone(item.owner),
      reason: item.fix ? String(item.reason).split(' — ')[0] : item.reason,
      fix: item.fix || null,
    }));
    const kindLabel = VISIT_KIND_LABELS[visit.kind] || visit.kind;
    const dateLine = b === 'closed' ? `เข้า ${dayText(visit.actualDate || date)}` : dayText(date);
    const timeLine = b === 'closed' ? (visit.actualDate && visit.actualDate !== date ? `นัด ${dayText(date)}` : '') : visitTimeText(visit);
    const origin = originText(visit);
    const ready = group === 'ready';
    const stale = draft && isStaleDraft(visit, win);
    /* ป้ายหัวการ์ด (เฉพาะรอจัด) + บรรทัดผ่านด่าน — ประกอบที่นี่เพื่อให้ **ค้นเจอทุกอย่างที่ตาเห็น** */
    const tag = !draft ? null
      : stale ? { tone: 'warning', label: 'วันเสนอผ่านแล้ว' }
        : ready ? { tone: 'success', label: 'พร้อมปล่อย' }
          : { tone: 'warning', label: 'ติดด่าน' };
    const readyText = ready
      ? (visitSkipsContractGates(visit) ? 'ผ่านด่าน · งานนี้ไม่ต้องตรวจสัญญา/เงิน' : 'ผ่านด่านครบ')
      : '';
    const row = {
      id: visit.id,
      visit,
      site,
      bucket: b,
      group,
      gate,
      ready,
      stale,
      tag,
      readyText,
      code: visit.code || visit.id,
      kind: visit.kind,
      kindLabel,
      siteCode: [site?.code, site?.routeZone].filter(Boolean).join(' · '),
      siteName: site?.name || visit.siteId,
      customer: site?.customerName || '',
      dateLine,
      timeLine,
      rel,
      who,
      siteLoadText: assets || packs ? `${assets} จุด · ${packs} แพ็ค` : '',
      dayLoad,
      gateItems,
      status,
      warns,
      origin,
      actions: {
        release: draft,
        open: b === 'overdue',
        assign: b === 'scheduled' && !visit.assigneeId,
        report: b === 'closed',
      },
    };
    row.haystack = queueHaystack([
      row.code, kindLabel, row.siteCode, row.siteName, row.customer, dateLine, timeLine, rel.text,
      who.text, who.sub, status?.label, status?.text, origin,
      ...gateItems.map((g) => `${g.owner || ''} ${g.reason}`), ...warns,
      dayLoad?.text, row.siteLoadText, tag?.label, readyText,
    ]);
    rows.push(row);
  }

  // ── ตัวเลขบนเม็ดถัง — หลังกรองทีม ก่อนค้นหา · ร่างไกลที่ยังติดด่านไม่นับ (เลขต้องลงถึง 0 ได้) ──
  const counts = Object.fromEntries(QUEUE_BUCKETS.map((k) => [k, 0]));
  let farCount = 0;
  const rangeCounts = { all: 0, '7d': 0, unassigned: 0 };
  for (const row of rows) {
    if (row.bucket === 'waiting' && row.group === 'far') { farCount += 1; continue; }
    counts[row.bucket] += 1;
    if (row.bucket === 'scheduled') {
      for (const r of Object.keys(rangeCounts)) if (inQueueRange(row.visit, r, win)) rangeCounts[r] += 1;
    }
  }

  // ── แถวของถังที่เปิดอยู่ ──
  const inWithin = (row) => !within || (row.visit.scheduledDate >= within.from && row.visit.scheduledDate <= within.to);
  const showFar = farOn || !!needle || !!within;
  const listed = rows.filter((row) => {
    if (row.bucket !== bucket) return false;
    if (bucket === 'waiting') {
      if (row.group === 'far' && !showFar) return false;
      if (!inWithin(row)) return false;
    }
    if (bucket === 'scheduled' && !inQueueRange(row.visit, range, win)) return false;
    if (needle && !row.haystack.includes(needle)) return false;
    return true;
  });

  const byDateThenTime = (a, b) => (a.visit.scheduledDate || '').localeCompare(b.visit.scheduledDate || '')
    || String(a.visit.startTime || '99').localeCompare(String(b.visit.startTime || '99'))
    || String(a.code).localeCompare(String(b.code));

  let groups = [];
  if (bucket === 'waiting') {
    const tallyKeys = (items, key) => items.filter((r) => r.gateItems.some((g) => g.key === key)).length;
    for (const key of WAITING_GROUPS) {
      const items = listed.filter((r) => r.group === key)
        .sort((a, b) => (Number(b.stale) - Number(a.stale)) || byDateThenTime(a, b));
      if (!items.length) continue;
      let sub = '';
      if (key === 'ready') sub = 'ผ่านด่านครบ — ปล่อยขึ้นตารางได้เลย';
      if (key === 'ts') sub = `ขาดเจ้าหน้าที่ ${tallyKeys(items, 'assignee')} · นอกช่วงเข้าไซต์ ${tallyKeys(items, 'access')}`;
      if (key === 'others') {
        const owners = new Map();
        for (const r of items) for (const g of r.gateItems) if (g.owner && g.owner !== GATE_OWNERS.TS) owners.set(g.owner, (owners.get(g.owner) || 0) + 1);
        sub = `${[...owners].map(([o, n]) => `${o} ${n}`).join(' · ')} — แจ้งเจ้าของเรื่องแทนการกดซ้ำ`;
      }
      if (key === 'far') sub = 'รอบบริการสร้างร่างล่วงหน้า 90 วัน ยังไม่ต้องรีบ';
      groups.push({
        key, label: WAITING_GROUP_LABELS[key], sub,
        tone: key === 'ready' ? 'ok' : key === 'ts' ? 'warn' : 'quiet',
        total: `${items.length} ใบ`, collapsible: key === 'others' || key === 'far', rows: items,
      });
    }
  } else if (bucket === 'overdue') {
    const byPerson = new Map();
    for (const r of listed) {
      const key = r.visit.assigneeId || '__none__';
      if (!byPerson.has(key)) byPerson.set(key, []);
      byPerson.get(key).push(r);
    }
    groups = [...byPerson.entries()].map(([key, items]) => {
      items.sort(byDateThenTime);
      const first = items[0].visit;
      const team = key === '__none__' ? '' : teamLabel(key);
      return {
        key: `od-${key}`,
        label: key === '__none__' ? 'ยังไม่มอบหมาย' : `${first.assigneeName || ''}${team ? ` · ${team}` : ''}`,
        sub: key === '__none__' ? 'นัดที่ขึ้นตารางแล้วแต่ยังไม่มีคนไป' : '',
        tone: key === '__none__' ? 'warn' : '',
        total: `${items.length} นัด`,
        personId: key === '__none__' ? null : key,
        personName: key === '__none__' ? '' : firstName(first.assigneeName),
        oldest: first.scheduledDate,
        rows: items,
      };
    }).sort((a, b) => (Number(!!a.personId) - Number(!!b.personId)) || a.oldest.localeCompare(b.oldest));
  } else if (bucket === 'scheduled') {
    const byDay = new Map();
    for (const r of [...listed].sort(byDateThenTime)) {
      const key = r.visit.scheduledDate;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(r);
    }
    groups = [...byDay.entries()].map(([date, items]) => {
      const assets = items.reduce((sum, r) => sum + (workload[r.visit.siteId]?.assets || 0), 0);
      const packs = items.reduce((sum, r) => sum + (workload[r.visit.siteId]?.packs || 0), 0);
      const n = daysBetween(win.todayIso, date);
      const prefix = n === 0 ? 'วันนี้ · ' : n === 1 ? 'พรุ่งนี้ · ' : '';
      return {
        key: `d-${date}`, label: `${prefix}${dayText(date)}`, sub: '', tone: '',
        total: `${items.length} นัด · ${assets} จุด · ${packs} แพ็ค`, rows: items,
      };
    });
  } else if (bucket === 'closed') {
    const byActual = (a, b) => (b.visit.actualDate || '').localeCompare(a.visit.actualDate || '') || String(a.code).localeCompare(String(b.code));
    const shortfall = listed.filter((r) => isShortfallVisit(r.visit)).sort(byActual);
    const done = listed.filter((r) => !isShortfallVisit(r.visit)).sort(byActual);
    if (shortfall.length) groups.push({ key: 'cl-follow', label: 'ต้องตามต่อ — ทำไม่ครบ / ทำไม่ได้', sub: '', tone: 'warn', total: `${shortfall.length} นัด`, rows: shortfall });
    if (done.length) groups.push({ key: 'cl-done', label: 'เข้าแล้ว', sub: '', tone: 'ok', total: `${done.length} นัด`, rows: done });
  }

  const flat = groups.flatMap((g) => g.rows);
  return { win, counts, rangeCounts, farCount, groups, listedCount: flat.length, rows };
}

/** ร่างของสัปดาห์ที่ตารางเปิดอยู่ (ไม่ขึ้นกริด — ตารางบอกเป็นข้อความเท่านั้น) */
export function draftsInRange(visits = [], { from, to }, teamFilter, crewByUser) {
  return visits.filter((v) => isDraftVisit(v)
    && v.scheduledDate >= from && v.scheduledDate <= to
    && teamViewVisit(v, teamFilter, crewByUser)).length;
}

/** ช่วงวันของ "สัปดาห์" สำหรับชิป "วันเสนอ 21–27 ก.ย." */
export function weekChipText(from) {
  const to = addDaysIso(from, 6);
  const [, , d1] = from.split('-').map(Number);
  const [, , d2] = to.split('-').map(Number);
  return `วันเสนอ ${d1}–${d2} ${fmtMonthShort(to)}`;
}
