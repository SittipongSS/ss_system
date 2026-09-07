"use client";
// ── หน้าทีมหนึ่งทีม — /sa/teams/[code] · /service/teams/[code] ───────────────
//
// ⭐ **มติผู้ใช้ 2026-09-06**: ทีมต้องมีหน้าของตัวเองที่ส่งลิงก์กันได้ · ของเดิมทุกอย่าง
//   ยัดอยู่ในโมดัลสามช่องบนหน้าทะเบียน ⇒ ไม่มีที่ให้โต (ประวัติ · ใครเข้าทีมเมื่อไร ·
//   เหตุผลที่ปิด) และไม่มี URL ให้ชี้เวลาคุยกัน
//
// ทรงเดียวกับหน้าสินค้า/ลูกค้า: เนื้อหาซ้าย **แผงจัดการ** ขวา — แผงขวาเป็นที่เดียว
// ที่มีปุ่มระดับ "ทั้งทีม" และ **ปุ่มที่กดไม่ได้ยังโชว์อยู่พร้อมเหตุผลเป็นข้อความจริง**
// (ปุ่มจาง ๆ เฉย ๆ คือสิ่งที่ทำให้คนคิดว่าระบบพัง — docs/form-design-rules.md)
import { useMemo, useState } from "react";
import { Check, Hash, Search, Shield, UserRound, Users } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/Modal";
import RowActionMenu from "@/components/ui/RowActionMenu";
import SkeletonRows from "@/components/ui/Skeleton";
import CountBadge from "@/components/ui/CountBadge";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { notifyToast } from "@/components/ui/Toast";
import Tag from "@/components/ui/Tag";
import Workspace from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { useRole } from "@/lib/roleContext";
import {
  TEAM_KIND_LABELS, normalizeTeamCode, otherTeamCodes, teamsBasePath,
} from "@/lib/master/teams";
import { ROLE_LABELS, TEAMS } from "@/lib/permissions";
import { fmtNumber, naText } from "@/lib/format";
import useTeamRegistry from "./useTeamRegistry";
import TeamFormFields from "./TeamFormFields";
import TeamAssignModal from "./TeamAssignModal";
import styles from "./TeamManager.module.css";

export default function TeamDetail({ department, code }) {
  const isAdmin = useRole() === "admin";
  const reg = useTeamRegistry(department);
  const { teams, people, canManage, membersOf, leadOf, crewTeamByUser, loading, loadError, saving, call } = reg;

  const [edit, setEdit] = useState(null);        // ฟอร์มแก้ทีม
  const [moving, setMoving] = useState(null);    // คนที่กำลังย้าย (ทีมขาย)
  const [crewOpen, setCrewOpen] = useState(false);
  const [crewIds, setCrewIds] = useState([]);
  const [crewQ, setCrewQ] = useState("");

  const team = useMemo(() => teams.find((t) => t.code === code) || null, [teams, code]);
  const members = useMemo(() => membersOf(team), [membersOf, team]);
  const lead = team ? leadOf(team) : null;
  const base = teamsBasePath(department);
  const closed = team?.isActive === false;

  const salesTeams = useMemo(
    () => teams.filter((t) => t.kind === "sales" && t.isActive !== false),
    [teams],
  );

  /* ── รหัสทีมแก้ได้ไหม (มติผู้ใช้ 2026-09-07) ────────────────────────────
     ⚠️ จอรู้ได้แค่สองข้อ — ทีมตั้งต้น และ "ยังมีคนอยู่" · ของค้างอีก 19 ตารางต้องถามฐาน
     ⇒ ล็อกเฉพาะสองข้อที่รู้แน่ ที่เหลือปล่อยให้กดแล้วให้เซิร์ฟเวอร์บอกเหตุ
     (กติกาเดียวกับปุ่มลบทีม: ไม่ซ่อนเพื่อให้เหตุผลที่ตีกลับถูกอ่าน) */
  const codeLocked = !!team && (TEAMS.includes(team.code) || members.length > 0);
  const codeLockReason = !team ? "" : (TEAMS.includes(team.code)
    ? "ทีมตั้งต้นของระบบ — รหัสถูกอ้างในข้อมูลเก่าทั้งระบบ"
    : (members.length > 0 ? `ทีมนี้มีสมาชิก ${fmtNumber(members.length)} คน — ย้ายออกก่อนจึงจะเปลี่ยนรหัสได้` : ""));
  /* ⚠️ ปุ่มบันทึกต้องดับด้วย **กติกาเดียวกับเซิร์ฟเวอร์** ไม่ใช่แค่ "ไม่ว่าง" —
     ไม่งั้นกดได้แล้วโดนตีกลับด้วยเหตุที่จอรู้อยู่แล้วตั้งแต่ตอนพิมพ์ */
  const editCodeError = (() => {
    if (!edit || codeLocked) return "";
    const next = (edit.code || "").trim().toUpperCase();
    if (next === team?.code) return "";
    return normalizeTeamCode(next, {
      department,
      existingCodes: otherTeamCodes(teams.map((t) => t.code), team?.code),
    }).error || "";
  })();

  const saveMove = async (payload) => {
    const done = await call(`/api/users/${moving.id}/team`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }, `ย้ายทีมของ ${moving.name} แล้ว`);
    if (done) setMoving(null);
  };

  const removeFromTeam = async (person) => {
    if (team.kind === "sales") {
      const rest = (person.teams || []).filter((c) => c !== team.code);
      if (!rest.length) {
        /* เส้น API ของทีมขายไม่รับ "ไม่มีทีมเลย" (ต้องเลือกอย่างน้อยหนึ่ง) — บอกทางออก
           แทนที่จะปล่อยให้กดแล้วเจอ 400 ที่อ่านไม่ออกว่าให้ทำอะไรต่อ */
        await confirmAction({
          title: `นำ ${person.name} ออกจากทีมนี้ไม่ได้`,
          description: "ทีมนี้เป็นทีมเดียวที่เขาสังกัดอยู่ — ใช้ “ย้ายทีม” เพื่อเลือกทีมใหม่แทน",
          confirmLabel: "เข้าใจแล้ว",
          cancelLabel: null,
        });
        return;
      }
      await call(`/api/users/${person.id}/team`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams: rest, team: rest.includes(person.team) ? person.team : rest[0] }),
      }, `นำ ${person.name} ออกจาก ${team.name} แล้ว`);
      return;
    }
    await call(`/api/teams/${encodeURIComponent(team.code)}/members`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: members.filter((m) => m.id !== person.id).map((m) => m.id) }),
    }, `นำ ${person.name} ออกจาก ${team.name} แล้ว`);
  };

  const setLead = (person) => call(`/api/teams/${encodeURIComponent(team.code)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId: person.id, leadName: person.name }),
  }, `ตั้ง ${person.name} เป็นหัวหน้าทีมแล้ว`);

  if (loading) {
    return <Workspace icon={<Users size={20} aria-hidden="true" />} title="กำลังเปิดหน้าทีม"><SkeletonRows rows={6} /></Workspace>;
  }
  if (loadError || !team) {
    return (
      <Workspace icon={<Users size={20} aria-hidden="true" />} title="หน้าทีม"
        back={base ? { href: base, label: "ทะเบียนทีม" } : undefined}>
        <StatusNotice tone="error" role="alert">
          {loadError || `ไม่พบทีมรหัส ${code} ในทะเบียนของฝ่ายนี้`}
        </StatusNotice>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<Users size={20} aria-hidden="true" />}
      title={`${team.code} · ${team.name}`}
      subtitle={team.kind === "sales"
        ? "ทีมขาย — สมาชิกอยู่ที่บัญชีผู้ใช้ ย้ายทีละคน และคนหนึ่งอยู่ได้หลายทีม"
        : "ทีมปฏิบัติงาน — จัดคนอย่างเดียว ไม่กระทบสิทธิ์ และคนหนึ่งอยู่ได้ทีมเดียวในฝ่ายนี้"}
      back={base ? { href: base, label: "ทะเบียนทีม" } : undefined}
      headerRight={(
        <span className={styles.headBadges}>
          <Tag tone={team.kind === "sales" ? "violet" : "teal"}>{TEAM_KIND_LABELS[team.kind]}</Tag>
          {closed
            ? <StatusBadge tone="neutral" label="ปิดใช้งาน" />
            : <StatusBadge tone="success" label="ใช้งานอยู่" />}
          <CountBadge count={members.length} label="จำนวนสมาชิก" />
        </span>
      )}
    >
      <DetailPageLayout
        asideLabel="แผงจัดการทีม"
        aside={(
          <DetailCard icon={Shield} eyebrow="TEAM CONTROL" title="จัดการทีมนี้">
            <p className={styles.controlStatus} data-closed={closed ? "yes" : undefined}>
              {closed ? "ปิดใช้งานแล้ว" : "ใช้งานอยู่"}
            </p>
            <p className={styles.sub}>
              {closed
                ? "ทีมที่ปิดแล้วจะไม่ขึ้นให้เลือกใหม่ แต่ยังอ่านชื่อได้ในรายงานย้อนหลัง"
                : "ทีมนี้ขึ้นให้เลือกในงานของฝ่ายตามปกติ"}
            </p>
            <dl className={styles.facts}>
              <div><dt>ฝ่าย</dt><dd>{team.department}</dd></div>
              <div><dt>ประเภท</dt><dd>{TEAM_KIND_LABELS[team.kind]}</dd></div>
              <div><dt>หัวหน้าทีม</dt><dd>{naText(lead?.name)}</dd></div>
              <div><dt>สมาชิก</dt><dd>{fmtNumber(members.length)} คน</dd></div>
              <div><dt>สร้างโดย</dt><dd>{naText(team.createdByName)}</dd></div>
            </dl>

            {canManage && (
              <div className={styles.acts}>
                {/* ⚠️ ป้ายปุ่มต้องบอกว่าแก้อะไรได้ **ตามสถานะจริง** — รหัสแก้ได้เฉพาะทีมที่
                    ยังไม่มีใครใช้ ⇒ เขียนตายตัวว่า "แก้รหัส" ไม่ได้ */}
                <Button tone="primary" onClick={() => setEdit({ ...team })}>
                  {codeLocked ? "แก้ชื่อ / หัวหน้าทีม / หมายเหตุ" : "แก้รหัส / ชื่อ / หัวหน้าทีม / หมายเหตุ"}
                </Button>
                {team.kind === "crew" && !closed && (
                  <Button tone="neutral" onClick={() => { setCrewIds(members.map((m) => m.id)); setCrewOpen(true); }}>
                    จัดสมาชิก
                  </Button>
                )}
                {closed ? (
                  <Button tone="neutral" disabled={saving}
                    onClick={() => call(`/api/teams/${encodeURIComponent(team.code)}`, {
                      method: "PATCH", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ isActive: true }),
                    }, `เปิดใช้งานทีม ${team.name} แล้ว`)}>
                    เปิดใช้งานอีกครั้ง
                  </Button>
                ) : (
                  <>
                    {/* เหตุผลเป็นข้อความจริงเหนือปุ่ม ไม่ใช่ปุ่มจาง ๆ ที่ไม่บอกอะไร */}
                    {members.length > 0 && (
                      <p className={styles.why}>
                        ยังมีสมาชิก {fmtNumber(members.length)} คน — ย้ายออกให้หมดก่อนจึงจะปิดทีมได้
                      </p>
                    )}
                    <Button tone="neutral" disabled={saving || members.length > 0}
                      onClick={async () => {
                        const ok = await confirmAction({
                          title: `ปิดทีม ${team.name}`,
                          description: "ทีมที่ปิดแล้วจะไม่ขึ้นให้เลือกใหม่ แต่ยังอ่านชื่อได้ในรายงานย้อนหลัง · เปิดกลับได้จากหน้านี้",
                          confirmLabel: "ปิดทีม",
                          tone: "danger",
                        });
                        if (ok) {
                          await call(`/api/teams/${encodeURIComponent(team.code)}`, {
                            method: "PATCH", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ isActive: false }),
                          }, `ปิดทีม ${team.name} แล้ว`);
                        }
                      }}>
                      ปิดทีม
                    </Button>
                  </>
                )}
                {/* ⭐ **ลบทีม = ของแอดมิน** (มติ 2026-08-30) · ปุ่มไม่ซ่อนเพื่อให้เหตุผล
                    ที่เซิร์ฟเวอร์ตีกลับ (ติดดีล/เป้า/สัญญาอะไรอยู่) ถูกอ่าน */}
                {isAdmin && (
                  <>
                    {members.length > 0 && (
                      <p className={styles.why}>ทีมที่ยังมีคนอยู่ลบไม่ได้ — ย้ายคนออกก่อน</p>
                    )}
                    <Button tone="danger" variant="quiet" disabled={saving || members.length > 0}
                      onClick={async () => {
                        const ok = await confirmAction({
                          title: `ลบทีม ${team.name}`,
                          description: "ลบได้เฉพาะทีมที่ยังไม่มีใครใช้ (ไม่มีดีล ลีด เป้า สัญญา หรือคนสังกัด) — ถ้าเคยใช้แล้วระบบจะตีกลับพร้อมบอกว่าติดอะไรอยู่ ให้ใช้ “ปิดทีม” แทน",
                          confirmLabel: "ลบทีม",
                          tone: "danger",
                        });
                        if (!ok) return;
                        const done = await call(`/api/teams/${encodeURIComponent(team.code)}`, { method: "DELETE" },
                          `ลบทีม ${team.name} แล้ว`);
                        if (done && base) window.location.assign(base);
                      }}>
                      ลบทีม
                    </Button>
                  </>
                )}
              </div>
            )}
          </DetailCard>
        )}
      >
        <DetailCard icon={Hash} eyebrow="ข้อมูลทีม" title={team.name}>
          <dl className={styles.facts}>
            <div>
              <dt>รหัสทีม</dt>
              {/* ⚠️ รหัสถูกก๊อปเป็นข้อความลง 20 คอลัมน์ใน 19 ตาราง — เปลี่ยนไม่ได้ตลอดกาล */}
              <dd className={styles.code}>{team.code}</dd>
            </div>
            <div><dt>หมายเหตุ</dt><dd>{naText(team.note)}</dd></div>
          </dl>
          {lead?.stale && (
            <StatusNotice tone="warning">
              หัวหน้าทีมที่บันทึกไว้ ({lead.name}) ไม่ได้อยู่ในทีมนี้แล้ว — ตั้งหัวหน้าใหม่จากรายชื่อด้านล่าง
            </StatusNotice>
          )}
        </DetailCard>

        <DetailCard
          icon={UserRound}
          eyebrow="สมาชิก"
          title={`${fmtNumber(members.length)} คน`}
          actions={canManage && team.kind === "crew" && !closed ? (
            <Button tone="neutral" size="sm" onClick={() => { setCrewIds(members.map((m) => m.id)); setCrewOpen(true); }}>
              จัดสมาชิก
            </Button>
          ) : null}
        >
          {members.length === 0 ? (
            <EmptyState icon={UserRound} plain>
              {team.kind === "crew"
                ? "ยังไม่มีคนในทีมนี้ — กด “จัดสมาชิก” เพื่อเลือกคนเข้าทีม"
                : "ยังไม่มีคนในทีมนี้ — จัดคนเข้าทีมได้จากรายชื่อ “ยังไม่อยู่ทีมไหน” ที่หน้าทะเบียน"}
            </EmptyState>
          ) : (
            <TableScroll family="list" surface="embedded" cells="stacked" minWidth={560}>
              <table>
                <thead>
                  <tr>
                    <th>คน</th>
                    {team.kind === "sales" && <th>ทีมหลัก</th>}
                    {team.kind === "sales" && <th>อยู่ทีมอื่นด้วย</th>}
                    <th aria-label="การจัดการ" />
                  </tr>
                </thead>
                <tbody>
                  {members.map((person) => {
                    const others = (person.teams || []).filter((c) => c !== team.code);
                    return (
                      <tr key={person.id}>
                        <td>
                          <span className={styles.personName}>
                            {person.name}
                            {lead?.id === person.id && (
                              <Tag tone="accent" icon={Shield}>หัวหน้าทีม</Tag>
                            )}
                          </span>
                          <span className={styles.sub}>{ROLE_LABELS[person.role] || person.role}</span>
                        </td>
                        {team.kind === "sales" && (
                          <td>
                            {person.team === team.code
                              ? <StatusBadge tone="success" label="ทีมนี้" />
                              : <span className={styles.sub}>{naText(person.team)}</span>}
                          </td>
                        )}
                        {team.kind === "sales" && (
                          <td>{others.length ? others.join(" · ") : naText(null)}</td>
                        )}
                        <td className="text-center">
                          {canManage && (
                            <RowActionMenu
                              busy={saving}
                              label={`การจัดการของ ${person.name}`}
                              items={[
                                team.kind === "sales" && {
                                  id: "move", label: "ย้ายทีม / แก้ทีมที่สังกัด",
                                  onClick: () => setMoving(person),
                                },
                                {
                                  id: "lead",
                                  label: "ตั้งเป็นหัวหน้าทีม",
                                  disabled: lead?.id === person.id,
                                  disabledReason: lead?.id === person.id ? "เป็นหัวหน้าทีมอยู่แล้ว" : undefined,
                                  onClick: () => setLead(person),
                                },
                                {
                                  id: "remove", label: "นำออกจากทีมนี้", tone: "danger", separatorBefore: true,
                                  onClick: () => removeFromTeam(person),
                                },
                              ].filter(Boolean)}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          )}
        </DetailCard>
      </DetailPageLayout>

      {/* ── แก้ทีม — ฟอร์มตัวเดียวกับตอนสร้าง ─────────────────────────── */}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`แก้ทีม ${team.name}`} size="sm"
        footer={(
          <>
            <Button tone="neutral" onClick={() => setEdit(null)} disabled={saving}>ยกเลิก</Button>
            <Button tone="primary" disabled={saving || !edit?.name?.trim() || !!editCodeError}
              onClick={async () => {
                const nextCode = (edit.code || "").trim().toUpperCase();
                const renaming = !codeLocked && nextCode !== team.code;
                const done = await call(`/api/teams/${encodeURIComponent(team.code)}`, {
                  method: "PATCH", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: edit.name.trim(), leadId: edit.leadId, leadName: edit.leadName, note: edit.note,
                    /* ⚠️ ส่ง `code` เฉพาะตอนที่แก้ได้จริง — ส่งไปทุกครั้งแปลว่าเซิร์ฟเวอร์
                       ต้องวิ่งสแกนการใช้งาน 19 ตารางทุกครั้งที่มีคนแก้แค่หมายเหตุ */
                    ...(renaming ? { code: nextCode } : {}),
                  }),
                }, renaming ? `เปลี่ยนรหัสทีมเป็น ${nextCode} แล้ว` : "บันทึกทีมแล้ว");
                if (!done) return;
                setEdit(null);
                /* ⚠️ รหัสคือ URL ของหน้านี้ — ไม่ย้ายตาม = หน้าค้างอยู่ที่รหัสที่ไม่มีแล้ว
                   แล้วรีเฟรชทีเดียวได้ "ไม่พบทีม" (ใช้ท่าเดียวกับปุ่มลบ) */
                if (renaming && base) window.location.assign(`${base}/${encodeURIComponent(nextCode)}`);
              }}>
              บันทึก
            </Button>
          </>
        )}
      >
        {edit && (
          <TeamFormFields
            mode="edit"
            department={department}
            value={edit}
            onChange={setEdit}
            members={members}
            existingCodes={teams.map((t) => t.code)}
            ownCode={team.code}
            codeLocked={codeLocked}
            codeLockReason={codeLockReason}
          />
        )}
        {/* ⭐ ช่องที่ยังแก้ได้บนจอ **ยังตกด่านเซิร์ฟเวอร์ได้** — จอรู้แค่เรื่องสมาชิก
            ส่วนดีล/ลีด/เป้า/ลูกค้า/สินค้าที่ค้างอยู่ ต้องถามฐาน ⇒ บอกไว้ก่อนกด */}
        {edit && !codeLocked && (edit.code || "").trim().toUpperCase() !== team.code && (
          <StatusNotice tone="warning">
            {/* ⚠️ `StatusNotice` ไม่แปลง markdown — `**...**` ออกมาเป็นดอกจันจริงบนจอ
                (เจอตอน UAT 2026-09-07 · ของเดิมในฟอร์มสร้างทีมก็เป็นแบบนี้อยู่) */}
            เปลี่ยนรหัสได้เฉพาะทีมที่<strong>ยังไม่มีใครใช้</strong> — ระบบจะไล่ดูดีล ลีด เป้า สัญญา
            ลูกค้า และสินค้าตอนกดบันทึก ถ้าเจอของค้างจะตีกลับพร้อมบอกว่าติดอะไรอยู่
          </StatusNotice>
        )}
      </Modal>

      <TeamAssignModal
        person={moving}
        teams={salesTeams}
        saving={saving}
        onClose={() => setMoving(null)}
        onSave={saveMove}
      />

      {/* ── จัดสมาชิกทีมปฏิบัติงาน ─────────────────────────────────────
          ⚠️ บันทึกทั้งชุดครั้งเดียว ไม่ใช่ยิงทีละคน — ยิงทีละคนแล้วล้มกลางทางจะเหลือ
             ทีมครึ่ง ๆ ที่คนกดไม่รู้ว่าถึงไหนแล้ว
          ⭐ **ติ๊กคนที่อยู่ทีมอื่นได้** (มติ 2026-09-06) — ระบบย้ายให้ในการกดครั้งเดียว
             และบอกก่อนกดว่าจะย้ายมาจากทีมไหน · ของเดิมกางชื่อทุกคนในฝ่ายเป็นไทล์
             ไม่มีช่องค้น ไม่บอกว่าใครอยู่ทีมไหน แล้วตีกลับทั้งชุดตอนบันทึก */}
      <Modal open={crewOpen} onClose={() => setCrewOpen(false)} title={`จัดสมาชิก ${team.name}`}
        subtitle="คนหนึ่งอยู่ได้ทีมเดียวในฝ่ายนี้ — ติ๊กคนที่อยู่ทีมอื่นได้ ระบบจะย้ายให้" size="md"
        footer={(
          <>
            <Button tone="neutral" onClick={() => setCrewOpen(false)} disabled={saving}>ยกเลิก</Button>
            <Button tone="primary" disabled={saving}
              onClick={async () => {
                const done = await call(`/api/teams/${encodeURIComponent(team.code)}/members`, {
                  method: "PUT", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userIds: crewIds }),
                }, `จัดสมาชิกทีม ${team.name} แล้ว`);
                if (!done) return;
                /* ถอนออกจากทีมเดิมไม่สำเร็จ = คนนั้นค้างอยู่สองทีม — ต้องบอก ไม่ใช่เงียบ
                   (เซิร์ฟเวอร์เลือกอาการนี้แทน "ไม่มีทีมเลย" เพราะเห็นได้และกดซ้ำแล้วหาย) */
                if (done.stuck?.length) {
                  notifyToast.error(`${done.stuck.join(", ")} ยังค้างอยู่ทีมเดิมด้วย — กดบันทึกอีกครั้ง`);
                  return;
                }
                setCrewOpen(false);
              }}>
              บันทึกสมาชิก
            </Button>
          </>
        )}
      >
        <div className="search-glass">
          <Search size={16} color="var(--text-3)" aria-hidden="true" />
          <input autoComplete="off" value={crewQ} onChange={(e) => setCrewQ(e.target.value)}
            placeholder="ค้นชื่อ หรือ ตำแหน่ง" aria-label="ค้นหาเจ้าหน้าที่" />
        </div>

        {/* สรุปผลของการติ๊ก **ก่อนกด** — ย้ายเข้ามาจากทีมไหนบ้าง และใครหลุดออกไป */}
        {(() => {
          const current = new Set(members.map((m) => m.id));
          const incoming = crewIds
            .filter((id) => !current.has(id) && crewTeamByUser.get(id))
            .map((id) => ({
              name: people.find((p) => p.id === id)?.name || id,
              from: teams.find((t) => t.code === crewTeamByUser.get(id))?.name || crewTeamByUser.get(id),
            }));
          const leaving = members.filter((m) => !crewIds.includes(m.id));
          if (!incoming.length && !leaving.length) return null;
          return (
            <StatusNotice tone="info">
              {incoming.length > 0 && (
                <p>ย้ายเข้าทีมนี้ {fmtNumber(incoming.length)} คน — {incoming.map((x) => `${x.name} (จาก ${x.from})`).join(" · ")}</p>
              )}
              {leaving.length > 0 && (
                <p>ออกจากทีมนี้ {fmtNumber(leaving.length)} คน — {leaving.map((m) => m.name).join(" · ")} · จะกลายเป็น “ยังไม่อยู่ทีมไหน”</p>
              )}
            </StatusNotice>
          );
        })()}

        <ul className={styles.picker}>
          {people
            .filter((p) => {
              const needle = crewQ.trim().toLowerCase();
              if (!needle) return true;
              return `${p.name} ${ROLE_LABELS[p.role] || p.role}`.toLowerCase().includes(needle);
            })
            .map((p) => {
              const on = crewIds.includes(p.id);
              const at = crewTeamByUser.get(p.id);
              const other = at && at !== team.code;
              return (
                <li key={p.id}>
                  <button type="button" aria-pressed={on}
                    onClick={() => setCrewIds((ids) => (on ? ids.filter((x) => x !== p.id) : [...ids, p.id]))}>
                    <span className={styles.tick} aria-hidden="true">{on ? <Check size={13} /> : null}</span>
                    <span className={styles.pickerName}>
                      {p.name}
                      <span className={styles.sub}>{ROLE_LABELS[p.role] || p.role}</span>
                    </span>
                    {other
                      ? <Tag tone="warning">{teams.find((t) => t.code === at)?.name || at}</Tag>
                      : at === team.code
                        ? <Tag tone="success">ทีมนี้</Tag>
                        : <span className={styles.sub}>ยังไม่มีทีม</span>}
                  </button>
                </li>
              );
            })}
        </ul>
      </Modal>

    </Workspace>
  );
}
