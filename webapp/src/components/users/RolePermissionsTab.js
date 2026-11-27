"use client";
// ── แท็บ "สิทธิ์ตามตำแหน่ง" ในหน้า /users (รื้อระบบสิทธิ์งวด 3 · มติเจ้าของ 25/11/2026) ───────────────────
//
// ⭐ อ่านอย่างเดียว — สิทธิ์ตามตำแหน่งอยู่ในโค้ด (มติทาง A) · แก้ที่นี่ไม่ได้ และไม่มีปุ่มให้แก้
// ⭐ ข้อมูลทั้งหมดมาจาก `capsFor(role)` + ทะเบียนป้าย `lib/capabilityCatalog.js` — ไม่มีตารางที่ต้องดูแลซ้ำ
// ⚠️ cap บอกแค่ "ถือสิทธิ์" — ด่านจริงหลายตัวแคบอีกชั้น (ป้ายฟ้า `scope`) ห้ามเขียนจอนี้ให้ดูกว้างกว่าที่ระบบทำ
import { useEffect, useMemo, useRef } from "react";
import useStickyState, { useStickySet } from "@/lib/ui/useStickyState";
import {
  Briefcase, Building2, Calculator, ChartLine, Check, FlaskConical, FolderKanban, Hammer, Handshake,
  IdCard, Landmark, MessageCircleQuestion, Minus, Package, Shield, Wallet, Wrench,
} from "lucide-react";
import Segmented from "@/components/ui/Segmented";
import Tag from "@/components/ui/Tag";
import { ListPanel } from "@/components/ui/Workspace";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import {
  DEPARTMENTS, DEPARTMENT_NAMES_TH, GRANTABLE_CAPS, ROLES, ROLE_LABELS, capsFor, departmentFor,
} from "@/lib/permissions";
import {
  CAPABILITY_MODULES, CAP_TIER_LABELS, EVERYONE_CAP_NOTE, moduleClosed, moduleLevel,
} from "@/lib/capabilityCatalog";
import { naText } from "@/lib/format";
import styles from "./PermissionTabs.module.css";

const ICONS = {
  Briefcase, Building2, Calculator, ChartLine, FlaskConical, FolderKanban, Hammer, Handshake,
  Landmark, MessageCircleQuestion, Package, Shield, Wallet, Wrench,
};
const ModuleIcon = ({ name }) => {
  const Icon = ICONS[name];
  return Icon ? <Icon size={15} aria-hidden="true" /> : null;
};

/* ป้ายตำแหน่งแบบสั้น — ตัดวงเล็บอังกฤษท้ายชื่อออก (ชื่อเต็มอยู่ที่หัวการ์ดทีละตำแหน่ง) */
const shortRole = (role) => (ROLE_LABELS[role] || role).replace(/\s*\([^)]*\)\s*$/, "");

/** กลุ่มตำแหน่งตามฝ่าย เรียงตาม DEPARTMENTS — คนดูอ่านเป็นฝ่ายก่อนเสมอ */
function groupRoles(counts, hideUnused) {
  return DEPARTMENTS.map((dept) => ({
    dept,
    roles: ROLES.filter((r) => departmentFor(r) === dept && (!hideUnused || counts[r])),
  })).filter((g) => g.roles.length);
}

function LevelChip({ level }) {
  return <span className={styles.level} data-level={level}>{CAP_TIER_LABELS[level]}</span>;
}

export default function RolePermissionsTab({ users = [] }) {
  /* มุมมอง/ตัวกรอง/กลุ่มที่พับ จำไว้เมื่อออกจากหน้าแล้วกดกลับ — คีย์นำหน้า "roles." (อยู่ในหน้า /users) */
  const [view, setView] = useStickyState("roles.view", "matrix");
  const [hideUnused, setHideUnused] = useStickyState("roles.hideUnused", false);
  const [role, setRole] = useStickyState("roles.role", null);
  const [collapsed, setCollapsed] = useStickySet("roles.collapsed");
  const toggleDept = (dept) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(dept)) next.delete(dept); else next.add(dept);
    return next;
  });

  const counts = useMemo(() => {
    const out = {};
    for (const u of users) if (!u.disabled && u.role) out[u.role] = (out[u.role] || 0) + 1;
    return out;
  }, [users]);
  const groups = useMemo(() => groupRoles(counts, hideUnused), [counts, hideUnused]);
  const capsOf = useMemo(() => Object.fromEntries(ROLES.map((r) => [r, new Set(capsFor(r))])), []);
  const used = ROLES.filter((r) => counts[r]).length;
  const current = role || groups[0]?.roles[0] || ROLES[0];

  const openRole = (r) => { setRole(r); setView("detail"); };
  /* เปิดจากตารางภาพรวม = ตำแหน่งที่เลือกอาจอยู่ล่างสุดของแถบซ้าย ⇒ เลื่อนแถบ (ไม่ใช่ทั้งหน้า) มาให้เห็น */
  const railRef = useRef(null);
  useEffect(() => {
    const rail = railRef.current;
    const el = rail?.querySelector("[aria-current]");
    if (view === "detail" && rail && el) rail.scrollTop = Math.max(0, el.offsetTop - rail.clientHeight / 2);
  }, [view, current]);

  return (
    <ListPanel
      icon={<IdCard size={17} aria-hidden="true" />}
      title="สิทธิ์ตามตำแหน่ง"
      subtitle={`${EVERYONE_CAP_NOTE} · สิทธิ์ตามตำแหน่งอยู่ในระบบ แก้ที่หน้านี้ไม่ได้`}
      count={`${ROLES.length} ตำแหน่ง · มีคนใช้ ${used}`}
      toolbar={(
        <div className={styles.toolbar}>
          <Segmented
            ariaLabel="มุมมองสิทธิ์ตามตำแหน่ง"
            selection="radio"
            value={view}
            onChange={setView}
            options={[{ value: "matrix", label: "ภาพรวมทุกตำแหน่ง" }, { value: "detail", label: "ทีละตำแหน่ง" }]}
          />
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={hideUnused} onChange={(e) => setHideUnused(e.target.checked)} />
            ซ่อนตำแหน่งที่ยังไม่มีคนใช้
          </label>
        </div>
      )}
    >
      {view === "matrix" ? (
        <>
          <div className={styles.legend}>
            {[0, 1, 2, 3].map((lv) => (
              <span key={lv} className={styles.legendItem}>
                <LevelChip level={lv} />{["ไม่มี", "อ่านอย่างเดียว", "เพิ่ม/แก้/ตอบ", "อนุมัติ/ลบ/จัดการ"][lv]}
              </span>
            ))}
            <span className={styles.legendNote}>กดชื่อตำแหน่งเพื่อดูทีละสิทธิ์</span>
          </div>
          <TableScroll family="matrix" surface="embedded" className={styles.matrix}>
            <table>
              <thead>
                <tr>
                  <th>ตำแหน่ง</th>
                  <th className="num">คน</th>
                  {CAPABILITY_MODULES.map((m) => (
                    <th key={m.key} className={styles.modCol} data-closed={moduleClosed(m) || undefined}
                      title={moduleClosed(m) ? `${m.name} — ปิดอยู่ทั้งระบบ` : m.name}>
                      {m.name}{moduleClosed(m) && <span className={styles.closedNote}>ปิดอยู่</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => [
                  <TableGroupRow
                    key={`g-${g.dept}`}
                    colSpan={CAPABILITY_MODULES.length + 2}
                    label={`${g.dept} · ${DEPARTMENT_NAMES_TH[g.dept] || g.dept}`}
                    badge={`${g.roles.length} ตำแหน่ง`}
                    collapsed={collapsed.has(g.dept)}
                    onToggle={() => toggleDept(g.dept)}
                  />,
                  ...(collapsed.has(g.dept) ? [] : g.roles).map((r) => (
                    <tr key={r}>
                      <td>
                        {/* ปุ่มจริง ไม่ใช่ onClick บน <tr> — คีย์บอร์ดกดได้ (ด่าน a11y hard-zero) */}
                        <button type="button" className={styles.roleButton} onClick={() => openRole(r)}
                          title="ดูทีละสิทธิ์ของตำแหน่งนี้">
                          <span className={styles.strong}>{shortRole(r)}</span>
                          <span className={styles.code}>{r}</span>
                        </button>
                      </td>
                      <td className="num">{counts[r] || naText(null)}</td>
                      {CAPABILITY_MODULES.map((m) => (
                        <td key={m.key} className={styles.modCol} data-closed={moduleClosed(m) || undefined}>
                          <LevelChip level={moduleLevel(capsOf[r], m)} />
                        </td>
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </TableScroll>
        </>
      ) : (
        <div className={styles.split}>
          <nav ref={railRef} className={styles.rail} aria-label="เลือกตำแหน่ง">
            {groups.map((g) => (
              <div key={g.dept}>
                <div className={styles.railGroup}>{g.dept} · {DEPARTMENT_NAMES_TH[g.dept] || g.dept}</div>
                {g.roles.map((r) => (
                  <button key={r} type="button" className={styles.railItem} aria-current={r === current || undefined}
                    data-unused={!counts[r] || undefined} onClick={() => setRole(r)}>
                    <span>{shortRole(r)}</span>
                    <span className={styles.railCount}>{counts[r] || 0} คน</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <RoleDetail role={current} caps={capsOf[current]} count={counts[current] || 0} />
        </div>
      )}
    </ListPanel>
  );
}

function RoleDetail({ role, caps, count }) {
  const dept = departmentFor(role);
  return (
    <section className={styles.detail} aria-label={ROLE_LABELS[role] || role}>
      <header className={styles.detailHead}>
        <h3>{ROLE_LABELS[role] || role}</h3>
        <p>{dept} · {DEPARTMENT_NAMES_TH[dept] || ""} · <span className={styles.code}>{role}</span> · {count} คนใช้ตำแหน่งนี้</p>
        <p className={styles.muted}>
          ป้ายฟ้า = ถือสิทธิ์แล้วยังแคบลงอีกชั้นตามฝ่าย/ทีม · ป้าย &quot;ให้รายคนได้&quot; = แจกเป็นสิทธิ์เสริมกับคนในตำแหน่งนี้ได้
        </p>
      </header>
      {CAPABILITY_MODULES.map((m) => {
        const any = m.caps.some((c) => caps.has(c.cap));
        return (
          <div key={m.key} className={styles.module}>
            <div className={styles.moduleName}>
              <ModuleIcon name={m.icon} />{m.name}
              {moduleClosed(m) && <Tag>ปิดอยู่</Tag>}
              {!any && <span className={styles.muted}>ไม่มี</span>}
            </div>
            <ul className={styles.capList}>
              {m.caps.map((c) => {
                const on = caps.has(c.cap);
                return (
                  <li key={c.cap} className={styles.cap} data-on={on || undefined}>
                    {on ? <Check size={14} aria-label="มี" className={styles.yes} /> : <Minus size={14} aria-label="ไม่มี" className={styles.no} />}
                    <span>{c.label}</span>
                    {on && c.scope && <Tag tone="info">{c.scope}</Tag>}
                    {!on && GRANTABLE_CAPS.includes(c.cap) && !moduleClosed(m) && <Tag tone="accent">ให้รายคนได้</Tag>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
