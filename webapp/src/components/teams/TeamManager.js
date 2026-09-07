"use client";
// ── ทะเบียนทีม — component เดียวที่ทุกฝ่ายใช้ร่วมกัน ───────────────────────
//
// ⭐ **มติผู้ใช้ 2026-08-28**: จัดทีมเองได้ไม่ต้องรอแอดมิน · แยกเฉพาะฝ่าย + *"TS ก็มีแยกทีม"*
// ⭐ **มติผู้ใช้ 2026-09-06**: รื้อทั้งเส้น — ทะเบียนเป็น **ตาราง** ทรงเดียวกับทะเบียนอื่น
//   ทั้งเว็บ (ค้นหา · กรอง · เรียง · สลับเป็นการ์ดเมื่อจอตั้ง) และงานระดับทีมย้ายไปอยู่
//   **หน้าทีมของตัวเอง** ที่มีลิงก์ถาวร ไม่ใช่ยัดทุกอย่างไว้ในโมดัลสามช่อง
//
// ⚠️ **หน้าเดียว ไม่ใช่หน้าละฝ่าย** — `/sa/teams` กับ `/service/teams` ส่ง `department`
//   คนละค่าเข้ามาที่ตัวเดียวกัน · `scripts/audit-ui.mjs` ระบุชื่อไฟล์นี้ไว้ตรง ๆ ในรายการ
//   เปลือกที่ใช้ร่วมกัน — แตกเป็นไฟล์ต่อฝ่ายเมื่อไรมันเพี้ยนหากันภายในสองเดือน
//
// ⚠️ สิ่งที่จอนี้ **ไม่มี** โดยตั้งใจ: สร้าง/ลบบัญชี · เปลี่ยน role · เปลี่ยนฝ่าย ·
//   รีเซ็ตรหัสผ่าน — ยังเป็นของแอดมินที่ /users เหมือนเดิม (และตั้งแต่ 2026-09-06
//   ทางกลับก็จริง: /users ไม่มีช่องทีมแล้ว ทีมมีเจ้าของที่นี่ที่เดียว)
import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Shield, UserRound, Users } from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/Modal";
import RowActionMenu from "@/components/ui/RowActionMenu";
import SkeletonRows from "@/components/ui/Skeleton";
import CountBadge from "@/components/ui/CountBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import Segmented from "@/components/ui/Segmented";
import Tag from "@/components/ui/Tag";
import Workspace, { MetricStrip, Metric, WorkspaceSection } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import { SortMenu, SortDirButton } from "@/components/ui/ViewMenus";
import DetailRow from "@/components/ui/DetailRow";
import { useResponsiveView } from "@/lib/useResponsiveView";
import {
  SALES_TEAM_DEPARTMENT, TEAM_KIND_LABELS, allowedKindsFor, normalizeTeamCode, suggestTeamCode,
  teamHref,
} from "@/lib/master/teams";
import { ROLE_LABELS, TEAM_ROLES } from "@/lib/permissions";
import { fmtNumber } from "@/lib/format";
import useTeamRegistry from "./useTeamRegistry";
import TeamFormFields from "./TeamFormFields";
import TeamAssignModal from "./TeamAssignModal";
import styles from "./TeamManager.module.css";

const STATUS_FILTERS = [
  { value: "active", label: "ใช้งานอยู่" },
  { value: "closed", label: "ปิดแล้ว" },
  { value: "all", label: "ทั้งหมด" },
];

const SORTS = [
  { value: "order", label: "ลำดับที่ตั้งไว้" },
  { value: "name", label: "ชื่อทีม" },
  { value: "members", label: "จำนวนสมาชิก" },
];

/* ⚠️ **ไม่มีค่าตั้งต้นให้กับสิ่งที่เป็นการตัดสินใจ** (docs/form-design-rules.md) —
   ฝ่ายที่มีทีมแบบเดียวไม่ต้องถาม แต่ฝ่ายขายมีสองแบบ ⇒ เริ่มที่ "ยังไม่เลือก" */
const emptyDraft = (department) => {
  const kinds = allowedKindsFor(department);
  /* `codeTouched` = คนพิมพ์รหัสเองแล้ว ⇒ หยุดให้รหัสเดินตามชื่อ
     (ไม่ส่งขึ้นเซิร์ฟเวอร์ — เป็นสถานะของฟอร์มล้วน) */
  return { kind: kinds.length === 1 ? kinds[0] : "", name: "", note: "", code: "", codeTouched: false };
};

export default function TeamManager({ department, title, subtitle }) {
  const reg = useTeamRegistry(department);
  const { teams, canManage, membersOf, leadOf, unassigned, loading, loadError, saving, call } = reg;

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [needLead, setNeedLead] = useState(false);
  const [sortKey, setSortKey] = useState("order");
  const [dir, setDir] = useState("asc");
  const [draft, setDraft] = useState(null);   // ฟอร์มสร้างทีม (null = ปิด)
  const [assigning, setAssigning] = useState(null);  // คนที่กำลังจัดเข้าทีมครั้งแรก
  const [view] = useResponsiveView({ portrait: "card", landscape: "table" });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const enriched = teams.map((team) => {
      const members = membersOf(team);
      const lead = leadOf(team);
      return { team, members, lead };
    });
    const filtered = enriched.filter(({ team, members, lead }) => {
      if (status === "active" && team.isActive === false) return false;
      if (status === "closed" && team.isActive !== false) return false;
      if (needLead && lead?.name && !lead.stale) return false;
      if (!needle) return true;
      /* ⚠️ **ตาเห็นบนแถว = ต้องค้นเจอ** — รวมชื่อสมาชิกด้วย เพราะคำถามจริงของหัวหน้า
         คือ "สมชายอยู่ทีมไหน" ไม่ใช่ "ทีมชื่ออะไร" · ของเดิมไม่มีช่องค้นหาเลย */
      const hay = [
        team.code, team.name, team.note, TEAM_KIND_LABELS[team.kind], lead?.name,
        ...members.map((m) => m.name),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "name") return a.team.name.localeCompare(b.team.name, "th");
      if (sortKey === "members") return a.members.length - b.members.length;
      return 0; // "order" = ลำดับจาก sortTeams (ใช้งานก่อน · sortOrder · ชื่อ)
    });
    return dir === "desc" ? sorted.reverse() : sorted;
  }, [teams, membersOf, leadOf, q, status, needLead, sortKey, dir]);

  const activeCount = teams.filter((t) => t.isActive !== false).length;
  const noLeadCount = teams.filter((t) => t.isActive !== false && !leadOf(t)?.name).length;
  const peopleCount = reg.people.length;

  /* เมนูท้ายแถว — **ปุ่มที่กดไม่ได้ยังโชว์ พร้อมเหตุผล** (กฎ "ไม่มีสิทธิ์=ไม่โชว์ ·
     ติดด่าน=โชว์แล้วบอกเหตุ")
     🐞 ของเดิมเปิดโมดัลยืนยันที่ `onConfirm` เป็น undefined ⇒ กดปุ่มแดงแล้วโมดัลปิดเฉย ๆ
        ไม่มี toast ไม่มี error — แยกไม่ออกจาก "ลบสำเร็จ" */
  const menuFor = ({ team, members }) => {
    const href = teamHref(department, team.code);
    const closed = team.isActive === false;
    return [
      { id: "open", label: "เปิดหน้าทีม", icon: Users, href },
      closed
        ? {
          id: "reopen",
          label: "เปิดใช้งานอีกครั้ง",
          onClick: () => call(`/api/teams/${encodeURIComponent(team.code)}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: true }),
          }, `เปิดใช้งานทีม ${team.name} แล้ว`),
        }
        : {
          id: "close",
          label: "ปิดทีม",
          tone: "warning",
          separatorBefore: true,
          disabled: members.length > 0,
          disabledReason: members.length > 0
            ? `ยังมีสมาชิก ${fmtNumber(members.length)} คน — ย้ายออกให้หมดก่อน`
            : undefined,
          onClick: () => call(`/api/teams/${encodeURIComponent(team.code)}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: false }),
          }, `ปิดทีม ${team.name} แล้ว`),
        },
    ].filter(Boolean);
  };

  const existingCodes = useMemo(() => teams.map((t) => t.code), [teams]);
  /* ⚠️ ปุ่มสร้างต้องดับด้วยกติกาเดียวกับเซิร์ฟเวอร์ ไม่ใช่แค่ "ชื่อไม่ว่าง" */
  const draftCodeError = draft
    ? normalizeTeamCode(draft.code, { department, existingCodes }).error || ""
    : "";

  /* รหัสเดินตามชื่อจนกว่าคนจะพิมพ์รหัสเอง — พิมพ์เองแล้วห้ามเขียนทับ
     ⚠️ ของเดิมรหัสมาจากตัวสร้างอย่างเดียว ⇒ ชื่อไทยล้วนได้ `SA` · `SA-2` ซึ่งอ่านไม่ออก
        ว่าเป็นทีมไหน และมันคือรหัสที่จะถูกก๊อปลง 20+ คอลัมน์ตลอดไป */
  const changeDraft = (next) => {
    const touched = draft?.codeTouched || (next.code ?? "") !== (draft?.code ?? "");
    if (touched) { setDraft({ ...next, codeTouched: true }); return; }
    /* ⚠️ **เติมให้เฉพาะรหัสที่ใช้ได้จริง** — ชื่อไทยล้วนทำให้ตัวสร้างคืนแค่ `SA`
       ซึ่งตกด่านของตัวเอง ⇒ ระบบเติมค่าผิดให้แล้วขึ้นข้อความแดงต่อว่าคนพิมพ์
       (เห็นตอน UAT 2026-09-07) · เติมไม่ได้ก็ปล่อยว่าง ให้ placeholder ทำหน้าที่ */
    const guess = suggestTeamCode(department, next.name, existingCodes);
    const usable = !normalizeTeamCode(guess, { department, existingCodes }).error;
    setDraft({ ...next, codeTouched: false, code: usable ? guess : "" });
  };

  const createTeam = async () => {
    const code = (draft.code || "").trim().toUpperCase();
    const done = await call("/api/teams", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim(), department, kind: draft.kind, note: draft.note || null, code,
      }),
    }, `สร้างทีม ${draft.name.trim()} (${code}) แล้ว`);
    if (done) setDraft(null);
  };

  return (
    <Workspace
      icon={<Users size={20} aria-hidden="true" />}
      title={title}
      subtitle={subtitle}
      headerRight={canManage ? (
        /* ⭐ terracotta = "เริ่มของใหม่" หน้าละหนึ่งปุ่ม (navy = ยืนยันสิ่งที่ทำอยู่) */
        <Button tone="accent" onClick={() => setDraft(emptyDraft(department))}
          icon={<Plus size={15} aria-hidden="true" />}>
          สร้างทีม
        </Button>
      ) : null}
    >
      {loadError && <StatusNotice tone="error" role="alert">{loadError}</StatusNotice>}

      {loading ? <SkeletonRows rows={5} /> : loadError ? null : (
        <>
          {/* ⭐ แถบตัวเลข = สิ่งที่หัวหน้าต้องจัดการก่อน · สองใบขวากดแล้วกรองได้จริง
              (ตัวเลขที่กดไม่ได้ทำให้คนถามว่า "แล้วคนที่ยังไม่มีทีมอยู่ไหน") */}
          <MetricStrip>
            <Metric icon={<Users size={16} aria-hidden="true" />} label="ทีมที่ใช้งาน"
              value={fmtNumber(activeCount)}
              note={teams.length - activeCount ? `ปิดแล้ว ${fmtNumber(teams.length - activeCount)} ทีม` : "ยังไม่มีทีมที่ปิด"} />
            <Metric icon={<UserRound size={16} aria-hidden="true" />} label="คนในฝ่าย"
              value={fmtNumber(peopleCount)}
              note={`อยู่ทีมแล้ว ${fmtNumber(peopleCount - unassigned.length)}`} />
            <Metric as="button" type="button" tone="warning" icon={<UserRound size={16} aria-hidden="true" />}
              label="ยังไม่อยู่ทีมไหน" value={fmtNumber(unassigned.length)} note="กดเพื่อไปที่รายชื่อ"
              onClick={() => document.getElementById("unassigned")?.scrollIntoView({ behavior: "smooth", block: "start" })} />
            <Metric as="button" type="button" tone={noLeadCount ? "warning" : undefined}
              icon={<Shield size={16} aria-hidden="true" />} label="ยังไม่ตั้งหัวหน้าทีม"
              value={fmtNumber(noLeadCount)} note="กดเพื่อกรอง" active={needLead}
              onClick={() => setNeedLead((v) => !v)} />
          </MetricStrip>

          <WorkspaceSection
            icon={<Users size={18} aria-hidden="true" />}
            title="ทะเบียนทีม"
            actions={<CountBadge count={rows.length} label="จำนวนทีมที่แสดง" />}
          >
            {/* ลำดับแถบเครื่องมือเป็นข้อตกลงของเว็บ: ค้นหา · ตัวกรอง · spacer · เรียง */}
            <div className="toolbar">
              <div className="search-glass">
                <Search size={16} color="var(--text-3)" aria-hidden="true" />
                <input autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)}
                  placeholder="ค้นชื่อทีม · รหัส · หัวหน้าทีม · ชื่อสมาชิก" aria-label="ค้นหาทีม" />
              </div>
              <Segmented ariaLabel="สถานะทีม" options={STATUS_FILTERS} value={status} onChange={setStatus} />
              <div className="spacer" />
              <SortMenu value={sortKey} onChange={setSortKey} options={SORTS} defaultValue="order" />
              <SortDirButton dir={dir} onToggle={() => setDir((d) => (d === "asc" ? "desc" : "asc"))} />
            </div>

            {rows.length === 0 ? (
              <EmptyState icon={Users}>
                {teams.length === 0
                  ? (canManage ? "ฝ่ายนี้ยังไม่มีทีม — สร้างทีมแรกได้ที่ปุ่มมุมขวาบน" : "ฝ่ายนี้ยังไม่มีทีม")
                  : "ไม่มีทีมที่ตรงกับที่กรองไว้ — ลองล้างคำค้นหรือสลับสถานะ"}
              </EmptyState>
            ) : view === "card" ? (
              <div className={styles.cards}>
                {rows.map(({ team, members, lead }) => (
                  <Link key={team.code} href={teamHref(department, team.code)} className={styles.card}
                    data-inactive={team.isActive === false ? "yes" : undefined}>
                    <span className={styles.cardTop}>
                      <b className={styles.code}>{team.code}</b>
                      <Tag tone={team.kind === "sales" ? "violet" : "teal"}>{TEAM_KIND_LABELS[team.kind]}</Tag>
                      {team.isActive === false && <StatusBadge tone="neutral" label="ปิดใช้งาน" />}
                    </span>
                    <b className={styles.cardName}>{team.name}</b>
                    <span className={styles.cardMeta}>
                      {lead?.name ? `หัวหน้าทีม ${lead.name}` : "ยังไม่ตั้งหัวหน้าทีม"}
                      {" · "}{fmtNumber(members.length)} คน
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <TableScroll family="list" surface="embedded" cells="stacked" minWidth={780}>
                <table>
                  <thead>
                    <tr>
                      <th>ทีม</th>
                      <th>ประเภท</th>
                      <th>หัวหน้าทีม</th>
                      <th>สมาชิก</th>
                      <th>สถานะ</th>
                      <th aria-label="การจัดการ" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ team, members, lead }) => {
                      const href = teamHref(department, team.code);
                      return (
                        <DetailRow key={team.code} href={href}>
                          {/* ⚠️ รหัสนำ ชื่อรอง — กติกา entity ของระบบ (ตาราง = รหัสบน · ชื่อล่าง) */}
                          <td>
                            <Link href={href} className={styles.code}>{team.code}</Link>
                            <span className={styles.sub}>{team.name}</span>
                          </td>
                          <td>
                            <Tag tone={team.kind === "sales" ? "violet" : "teal"}>
                              {TEAM_KIND_LABELS[team.kind]}
                            </Tag>
                          </td>
                          <td>
                            {lead?.name
                              ? (
                                <>
                                  {lead.name}
                                  {/* หัวหน้าที่ไม่ได้อยู่ในทีมแล้ว = ข้อมูลค้าง ต้องเห็นว่าค้าง */}
                                  {lead.stale && <span className={styles.sub}>ไม่ได้อยู่ในทีมนี้แล้ว</span>}
                                </>
                              )
                              : <StatusBadge tone="warning" label="ยังไม่ตั้ง" />}
                          </td>
                          <td>
                            {fmtNumber(members.length)} คน
                            {members.length > 0 && (
                              <span className={styles.sub}>
                                {members.slice(0, 3).map((m) => m.name).join(" · ")}
                                {members.length > 3 ? ` · +${fmtNumber(members.length - 3)}` : ""}
                              </span>
                            )}
                          </td>
                          <td>
                            {team.isActive === false
                              ? <StatusBadge tone="neutral" label="ปิดใช้งาน" />
                              : <StatusBadge tone="success" label="ใช้งานอยู่" />}
                          </td>
                          <td className="text-center">
                            {canManage && (
                              <RowActionMenu items={menuFor({ team, members })} busy={saving}
                                label={`การจัดการของทีม ${team.name}`} />
                            )}
                          </td>
                        </DetailRow>
                      );
                    })}
                  </tbody>
                </table>
              </TableScroll>
            )}
          </WorkspaceSection>

          {/* ⭐ ถังนี้ต้องมีเสมอแม้ว่าง — ถังที่หายไปคือคนที่หายไปจากสายตา
              ⚠️ ตั้งแต่ /users ถอดช่องทีมออก (2026-09-06) **ที่นี่คือทางเดียว**
                 ที่บัญชีขายเปิดใหม่จะถูกจัดเข้าทีม */}
          <WorkspaceSection
            id="unassigned"
            icon={<UserRound size={18} aria-hidden="true" />}
            title="ยังไม่อยู่ทีมไหน"
            /* ⚠️ **คำอธิบายต้องตรงกับความหมายของทีมในฝ่ายนั้น** — ทีมขายผูกสิทธิ์
               (ไม่มีทีม = ไม่เห็นข้อมูล) ส่วนทีมปฏิบัติงานไม่แตะสิทธิ์เลย
               🐞 ของเดิมเขียนข้อความของทีมขายไว้ตายตัว ⇒ บนจอฝ่ายบริการมันขัดกับ
                  คำโปรยของหน้าเดียวกันตรง ๆ ("ไม่กระทบสิทธิ์การเข้าถึงข้อมูล")
                  แล้วคนอ่านต้องเดาว่าบรรทัดไหนจริง (พบตอน UAT 2026-09-07) */
            subtitle={department === SALES_TEAM_DEPARTMENT
              ? "คนของฝ่ายนี้ที่ยังไม่ถูกจัดเข้าทีม — คนที่ไม่มีทีมจะไม่เห็นข้อมูลของทีมไหนเลย"
              : "คนของฝ่ายนี้ที่ยังไม่ถูกจัดเข้าทีม — จัดคนเข้าทีมได้ที่หน้าทีม ปุ่ม “จัดสมาชิก”"}
            actions={<CountBadge count={unassigned.length} tone={unassigned.length ? "warning" : "neutral"} label="จำนวนคนที่ยังไม่อยู่ทีมไหน" />}
          >
            {unassigned.length === 0 ? (
              <EmptyState icon={UserRound} plain>ทุกคนในฝ่ายอยู่ทีมครบแล้ว</EmptyState>
            ) : (
              <ul className={styles.people}>
                {unassigned.map((person) => {
                  /* ⚠️ ตำแหน่งนอกสายทีมขายไม่มีทีมโดยดีไซน์ (หัวหน้าฝ่าย/เลขา/แอดมิน)
                     🐞 ของเดิมวาดปุ่ม "จัดเข้าทีม" ให้เขาด้วย แล้วเซิร์ฟเวอร์ตอบ 400 ทุกครั้ง
                        — คนที่เจอบ่อยที่สุดคือหัวหน้าฝ่ายขายซึ่งเป็นเจ้าของหน้านี้เอง */
                  const eligible = department !== "SA" || TEAM_ROLES.includes(person.role);
                  return (
                    <li key={person.id}>
                      <UserRound size={15} aria-hidden="true" />
                      <span className={styles.personName}>{person.name}</span>
                      <span className={styles.sub}>{ROLE_LABELS[person.role] || person.role}</span>
                      {!eligible ? (
                        <span className={styles.reason}>ตำแหน่งนี้ดูได้ทุกทีมอยู่แล้ว จึงไม่ต้องสังกัดทีม</span>
                      ) : canManage && department === "SA" ? (
                        /* 🔴 **ปุ่มนี้คือทางเดียวที่บัญชีขายเปิดใหม่จะได้ทีมแรก** — ตั้งแต่หน้าผู้ใช้
                           ถอดช่องทีมออก (2026-09-06) บัญชีขายเกิดมาไม่มีทีมเสมอ และโมดัลหลัง
                           สร้างบัญชีก็พามาหน้านี้พร้อมคำสัญญาว่าจัดต่อได้ที่นี่
                           🐞 ตอนรื้อหน้าทะเบียน (#1633) ปุ่มนี้หายไป ⇒ ไม่มีทางไหนในระบบเลยที่จะ
                              ให้ทีมแรกกับเขาได้ · ถอดอีกครั้งเมื่อไรต้องมีทางอื่นมาแทนก่อน */
                        <Button tone="neutral" variant="quiet" size="sm" className={styles.rowAction}
                          onClick={() => setAssigning(person)}>
                          จัดเข้าทีม
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </WorkspaceSection>
        </>
      )}

      {/* ── สร้างทีม — ฟอร์มตัวเดียวกับตอนแก้ (TeamFormFields) ───────────── */}
      <Modal open={!!draft} onClose={() => setDraft(null)} title="สร้างทีม"
        subtitle={`ฝ่าย ${department}`} size="sm"
        footer={(
          <>
            <Button tone="neutral" onClick={() => setDraft(null)} disabled={saving}>ยกเลิก</Button>
            <Button tone="primary"
              disabled={saving || !draft?.name?.trim() || !draft?.kind || !!draftCodeError}
              onClick={createTeam}>
              สร้างทีม
            </Button>
          </>
        )}
      >
        {draft && (
          <TeamFormFields
            mode="create"
            department={department}
            value={draft}
            onChange={changeDraft}
            existingCodes={existingCodes}
          />
        )}
      </Modal>

      <TeamAssignModal
        person={assigning}
        teams={teams.filter((t) => t.kind === "sales" && t.isActive !== false)}
        saving={saving}
        onClose={() => setAssigning(null)}
        onSave={async (payload) => {
          const done = await call(`/api/users/${assigning.id}/team`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }, `จัด ${assigning.name} เข้าทีมแล้ว`);
          if (done) setAssigning(null);
        }}
      />
    </Workspace>
  );
}
