"use client";
// ── หน้าแรก = เมนูของทุกระบบที่บัญชีนี้เข้าได้ พร้อมตัวเลขงานค้างรายเมนู ─────
//
// มติ ADR 0016 (ผู้ใช้ 15 กันยายน 2026): หน้าแรกไม่มีรายการใบงาน ไม่มีคำทักทาย
// ไม่มีปุ่ม "ทำงานต่อ" — งานจริงทำในเมนูปลายทาง หน้านี้บอกแค่ว่า "ที่ไหนมีของค้าง"
//
// ⚠️ ตัวเลขมาจาก `/api/nav/counts` ชุดเดียวกับป้ายบนเมนู (เปลือกดึงแล้วแจกผ่าน
//    NavCountsContext) — หน้านี้ **ห้ามยิงคำขอเอง** และห้ามนิยามตัวเลขใหม่
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CircleCheck, LayoutGrid, LayoutDashboard } from 'lucide-react';
import { menuGroupsForUser } from '@/config/menuRegistry';
import { useNavCountsState, navCountFor, navHrefFor } from '@/lib/nav/useNavCounts';
import { countScopeFor } from '@/lib/nav/countScope';
import { SYSTEM_DISABLED_NOTE } from '@/config/systems';
import { businessDate } from '@/lib/businessDate';
import EmptyState from '@/components/ui/EmptyState';
import styles from './SystemMenuSheet.module.css';
import {
  FITS, INDEX_MIN_SYSTEMS, countKeyOf, legendState, panelBlocks, panelTotal, rowScope, rowState, sheetLayout,
} from './homeMenus';

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const EMPTY_DASH = '—';

/** เงาใต้แถวบนโผล่เมื่อไถพ้นแถบต้อนรับ — ตัวสลับอยู่ในหน้า เพราะแถบเป็นของหน้า
 *  ⚠️ IntersectionObserver ไม่ใช่ scroll listener (ตัวหลังยิงทุกเฟรม) และเขียน
 *     attribute ลง `.app-container` ที่หาจาก ref ของตัวเอง แล้วล้างคืนตอน unmount
 *     — เขียนลง documentElement จะค้างข้ามหน้า */
function useBandShadow(sentinelRef) {
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const shell = sentinel?.closest('.app-container');
    if (!sentinel || !shell || typeof IntersectionObserver === 'undefined') return undefined;
    /* พื้นที่สังเกตเริ่มใต้แถวบนพอดี ⇒ ตัวจับ "หลุดออก" เมื่อท้ายแถบไถขึ้นไปพ้นแถวบน
       (ถ้าไม่หักความสูงแถวบน ตัวจับจะหลุดตั้งแต่ยังไม่ได้ไถ) */
    const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 52;
    const observer = new IntersectionObserver(
      ([entry]) => { shell.toggleAttribute('data-home-scrolled', !entry.isIntersecting); },
      { rootMargin: `-${topbar}px 0px 0px 0px` },
    );
    observer.observe(sentinel);
    return () => { observer.disconnect(); shell.removeAttribute('data-home-scrolled'); };
  }, [sentinelRef]);
}

/** วันไทยของวันนี้ — คิดใน effect เท่านั้น (นาฬิกาตอน render = hydration ไม่ตรง) */
function useTodayLabel() {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const iso = businessDate();
    const date = new Date(`${iso}T00:00:00Z`);
    const day = WEEKDAYS[date.getUTCDay()];
    setLabel(`วัน${day}ที่ ${date.getUTCDate()} ${[
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
    ][date.getUTCMonth()]} ${date.getUTCFullYear() + 543}`);
  }, []);
  return label;
}

function Pill({ kind, children }) {
  return <span className={`topnav-count ${styles.pill} ${styles[kind]}`} aria-hidden="true">{children}</span>;
}

function CountSlot({ item, kind, state, user }) {
  if (kind === 'count') {
    // เลขเต็มหลัก: หน้านี้มีแค่ตัวเลข จะตัดเป็น 99+ ไม่ได้ (ลีด 138 · สินค้า 126)
    return <Pill kind={rowScope(item, user)}>{navCountFor(state?.counts, item.href)}</Pill>;
  }
  if (kind === 'failed') return <Pill kind="unknown">{EMPTY_DASH}</Pill>;
  if (kind === 'loading') return <span className={`skeleton ${styles.sk}`} aria-hidden="true" />;
  return null;
}

function rowAria(item, kind, state, user) {
  if (kind === 'off') return undefined;
  const key = countKeyOf(item);
  if (!key || !countScopeFor(key, user)) return undefined;
  const scope = countScopeFor(key, user);
  // 🔴 ยอดของฝ่าย/บริษัท ห้ามอ่านว่า "รอคุณ" (ADR 0016)
  const scopeLabel = scope === 'mine' ? 'ของฉัน' : (scope === 'dept' ? 'ทั้งฝ่าย' : 'ทั้งบริษัท');
  if (kind === 'count') return `${item.name} — ${navCountFor(state?.counts, item.href)} รายการ (${scopeLabel})`;
  if (kind === 'failed') return `${item.name} — นับจำนวนไม่สำเร็จ ยังไม่รู้ว่ามีกี่รายการ`;
  if (kind === 'loading') return `${item.name} — กำลังนับ`;
  return `${item.name} — ไม่มีค้าง`;
}

function MenuRow({ item, state, user }) {
  const kind = rowState(item, state, user);
  const Icon = item.icon || LayoutDashboard;
  const lane = kind !== 'plain' && kind !== 'off';
  const className = ['topnav-item', styles.row,
    lane && styles.lane,
    item.utility && 'topnav-utility-item',
    kind === 'count' && styles.hasCount,
    kind === 'off' && 'is-disabled'].filter(Boolean).join(' ');

  if (kind === 'off') {
    return (
      <li>
        <span className={className} aria-disabled="true" title={`${item.name} — ${SYSTEM_DISABLED_NOTE}`}>
          <Icon size={16} className="ico" />
          <span>{item.name}</span>
          <span className="sr-only"> — {SYSTEM_DISABLED_NOTE}</span>
        </span>
      </li>
    );
  }
  const count = navCountFor(state?.counts, item.href);
  return (
    <li>
      <Link href={navHrefFor(item, count)} className={className} aria-label={rowAria(item, kind, state, user)}>
        <Icon size={16} className="ico" />
        <span>{item.name}</span>
        <span className={styles.slot}><CountSlot item={item} kind={kind} state={state} user={user} /></span>
      </Link>
    </li>
  );
}

function placeStyle(place) {
  return Object.fromEntries(FITS.flatMap((fit) => {
    const p = place[fit];
    return [[`--x${fit}`, p.x], [`--y${fit}`, p.y], [`--h${fit}`, p.h], [`--o${fit}`, p.o || 0]];
  }));
}

function Panel({ block, place, state, user }) {
  const Icon = block.icon || LayoutDashboard;
  const headingId = `home-sys-${block.system}-title`;
  if (block.disabled) {
    return (
      <div className={`${styles.cell} ${styles.off}`} style={placeStyle(place)}>
        <section className={styles.offLine} aria-labelledby={headingId} title={`${block.label} — ${SYSTEM_DISABLED_NOTE}`}>
          <Icon size={16} className={styles.headIcon} aria-hidden="true" />
          <h2 id={headingId}>{block.label}</h2>
          <small className="nav-disabled-note">{SYSTEM_DISABLED_NOTE}</small>
        </section>
      </div>
    );
  }
  return (
    <div className={styles.cell} style={placeStyle(place)}>
      <section className={styles.block} id={`home-sys-${block.system}`} tabIndex={-1} aria-labelledby={headingId}>
        <div className={styles.head}>
          <Icon size={16} className={styles.headIcon} aria-hidden="true" />
          <h2 id={headingId}>{block.label}</h2>
        </div>
        <ul className={styles.rows} role="list">
          {block.flow.map((item) => <MenuRow key={item.href} item={item} state={state} user={user} />)}
        </ul>
        <div className={styles.spacer} aria-hidden="true" />
        {block.util.length > 0 && (
          <ul className={`${styles.rows} ${styles.util}`} role="list">
            {block.util.map((item) => <MenuRow key={item.href} item={item} state={state} user={user} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

/** ชิปสารบัญบนมือถือ — แตะแล้วเลื่อนไปที่แผง โดย **ไม่เพิ่มประวัติเบราว์เซอร์**
 *  (ปุ่มย้อนกลับครั้งเดียวต้องออกจากหน้าแรกได้) */
function IndexChip({ block, state, user }) {
  const total = panelTotal(block, state, user);
  const Icon = block.icon || LayoutDashboard;
  let badge = null;
  let aria = `ไปที่แผง${block.label}`;
  if (total.loading) {
    badge = <span className={`skeleton ${styles.sk}`} aria-hidden="true" />;
    aria += ' — กำลังนับ';
  } else if (total.failed) {
    badge = <Pill kind="unknown">{EMPTY_DASH}</Pill>;
    aria += ` — นับไม่สำเร็จ ${total.failed} เมนู ยังไม่รู้ยอดรวม`;
  } else if (total.mine || total.shared) {
    badge = (
      <span className={styles.chipPills} aria-hidden="true">
        {total.mine ? <Pill kind="mine">{total.mine}</Pill> : null}
        {total.shared ? <Pill kind="shared">{total.shared}</Pill> : null}
      </span>
    );
    aria += ' — งานค้าง'
      + (total.mine ? ` ของฉัน ${total.mine} รายการ` : '')
      + (total.mine && total.shared ? ' ·' : '')
      + (total.shared ? ` ทั้งฝ่ายหรือทั้งบริษัท ${total.shared} รายการ` : '');
  }
  const jump = (event) => {
    const section = document.getElementById(`home-sys-${block.system}`);
    if (!section) return;
    event.preventDefault();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    section.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    section.focus({ preventScroll: true });
  };
  return (
    <li>
      {/* href คงไว้ให้เปิดแท็บใหม่/ไม่มี JS ยังใช้ได้ — แต่การกดปกติไม่เขียน hash */}
      <a className={styles.chip} href={`#home-sys-${block.system}`} onClick={jump} aria-label={aria}>
        <Icon size={16} className="ico" aria-hidden="true" />
        <span className={styles.chipName}>{block.label}</span>
        {badge}
      </a>
    </li>
  );
}

function Legend({ blocks, state, user }) {
  const legend = legendState(blocks, state, user);
  if (legend.loading) {
    return (
      <p className={styles.legend} role="status">
        <span className={styles.legendLead}>ตัวเลขงานค้าง</span>
        <span className={styles.legendItem}><span className={`skeleton ${styles.sk}`} aria-hidden="true" />กำลังนับ</span>
      </p>
    );
  }
  if (legend.allZero) {
    return (
      <p className={styles.legend} role="status">
        <span className={`${styles.legendItem} ${styles.ok}`}><CircleCheck size={15} aria-hidden="true" />ไม่มีตัวเลขงานค้าง</span>
      </p>
    );
  }
  return (
    <p className={styles.legend}>
      <span className={styles.legendLead}>ตัวเลขงานค้าง</span>
      {legend.mine && <span className={styles.legendItem}><Pill kind="mine">N</Pill>ของฉัน</span>}
      {legend.shared && <span className={styles.legendItem}><Pill kind="shared">N</Pill>ทั้งฝ่าย / ทั้งบริษัท</span>}
      {legend.failedCount > 0 && (
        <span className={`${styles.legendItem} ${styles.warn}`} role="status" title="ขีดแปลว่ายังไม่รู้จำนวน ไม่ใช่ศูนย์">
          <Pill kind="unknown">{EMPTY_DASH}</Pill>นับไม่สำเร็จ {legend.failedCount} เมนู
          <span className="sr-only"> ขีดแปลว่ายังไม่รู้จำนวน ไม่ใช่ศูนย์</span>
        </span>
      )}
    </p>
  );
}

export default function SystemMenuSheet({ user }) {
  const state = useNavCountsState();
  const todayLabel = useTodayLabel();
  const sentinelRef = useRef(null);
  useBandShadow(sentinelRef);
  const groups = useMemo(() => menuGroupsForUser(user), [user]);
  const blocks = useMemo(() => panelBlocks(groups), [groups]);
  const layouts = useMemo(() => Object.fromEntries(FITS.map((fit) => [fit, sheetLayout(blocks, fit)])), [blocks]);

  const frameVars = Object.fromEntries(FITS.map((fit) => [`--used-${fit}`, Math.max(2, layouts[fit].cols)]));
  const sheetVars = Object.fromEntries(FITS.map((fit) => [`--n-${fit}`, layouts[fit].cols]));
  const openBlocks = blocks.filter((block) => !block.disabled);

  return (
    <div className={styles.home}>
      {/* แถบต้อนรับกรมท่า — ต่อจากแถวบนของหัวโดยไม่มีรอยต่อ */}
      <div className={styles.band}>
        <div className={styles.frame} style={frameVars}>
          {/* ที่ว่างของ DeniedNotice (แบรนช์ claude/ui-visibility) — ยังไม่มีในรอบนี้ */}
          <header className={styles.top}>
            <div className={styles.title}>
              <h1 id="home-main" tabIndex={-1}>เมนูทุกระบบ</h1>
              {/* ช่องวันที่จองที่ไว้ตั้งแต่เรนเดอร์แรก — ข้อความมาทีหลังใน effect */}
              <p className={styles.meta}>{todayLabel}</p>
            </div>
            {blocks.length > 0 && <Legend blocks={blocks} state={state} user={user} />}
          </header>
        </div>
        {/* ตัวจับว่าไถพ้นแถบแล้วหรือยัง — สูง 0 ไม่ดันอะไรเลย */}
        <span ref={sentinelRef} aria-hidden="true" className={styles.sentinel} />
      </div>

      <div className={`${styles.frame} ${styles.body}`} style={frameVars}>
        {blocks.length === 0 ? (
          <div className={styles.none}>
            <EmptyState icon={LayoutGrid} plain>
              <strong>ยังไม่มีระบบที่บัญชีนี้เข้าถึงได้</strong>
              <span>ติดต่อผู้ดูแลระบบเพื่อตรวจสอบบทบาทและสิทธิ์การใช้งาน</span>
            </EmptyState>
          </div>
        ) : (
          <>
            {openBlocks.length >= INDEX_MIN_SYSTEMS && (
              <nav className={styles.indexNav} aria-label="ไปยังแผงของแต่ละระบบ">
                <ul className={styles.index} role="list">
                  {openBlocks.map((block) => (
                    <IndexChip key={block.system} block={block} state={state} user={user} />
                  ))}
                </ul>
              </nav>
            )}
            <nav className={styles.sheet} style={sheetVars} aria-label="เมนูทุกระบบ" aria-busy={state?.status === 'loading'}>
              {blocks.map((block, i) => (
                <Panel
                  key={block.system}
                  block={block}
                  place={Object.fromEntries(FITS.map((fit) => [fit, layouts[fit].place[i]]))}
                  state={state}
                  user={user}
                />
              ))}
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
