"use client";
// ── แท็บ "สิทธิ์เสริมรายคน" + "ประวัติการให้สิทธิ์" ในหน้า /users (รื้อระบบสิทธิ์งวด 3 · มติเจ้าของ 25/11/2026) ──────
//
// ⭐ แหล่งเดียว: `GET /api/users/grants` (ทะเบียน user_capability_grants · mig 0440) — ไม่อ่าน extraCaps ของรายชื่อมาแทน
//    ⇒ คนที่สำเนาใน app_metadata เพี้ยนจากทะเบียน (แก้มือในฐาน) ขึ้นแถบเตือน ไม่ใช่โชว์เงียบ ๆ
// ⭐ ให้/ถอนผ่าน `GrantDialog` ตัวเดียวกับโมดัลแก้ผู้ใช้ (งวด 2) — ไม่มีฟอร์มให้สิทธิ์ชุดที่สอง
// ⚠️ คนถือ users:view เห็นทุกอย่างแต่ไม่มีปุ่ม (มติข้อ 5) — `canManage` มาจากหน้า ไม่ตัดสินเองที่นี่
import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import { ListPanel } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import Tag from "@/components/ui/Tag";
import AlertBanner from "@/components/ui/AlertBanner";
import Button from "@/components/ui/Button";
import { apiJson } from "@/lib/apiFetch";
import { fmtDateTime, naText, NA } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/permissions";
import { capLabel, copyDrift, fmtDay, grantEffect, grantEvents, isMigratedGrant } from "@/lib/capabilityGrants";
import { GrantDialog } from "./GrantManager";
import styles from "./PermissionTabs.module.css";

const personName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email || "ผู้ใช้ที่ลบไปแล้ว";
const shortRole = (role) => naText(ROLE_LABELS[role] || role).replace(/\s*\([^)]*\)\s*$/, "");

const EFFECT_TAG = {
  ok: { tone: "success", text: "มีผล" },
  dup: { tone: "warning", text: "ซ้ำกับตำแหน่ง" },
  closed: { tone: "warning", text: "ระบบปิดอยู่" },
};

export function useAllGrants(enabled = true) {
  const [grants, setGrants] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!enabled) return; // คนที่ไม่มีสิทธิ์ดูหน้า ไม่ยิง API ที่รู้อยู่แล้วว่าได้ 403
    try {
      const data = await apiJson("/api/users/grants", { fallbackError: "โหลดทะเบียนสิทธิ์เสริมไม่สำเร็จ" });
      setGrants(data.grants || []);
      setError("");
    } catch (e) {
      setError(e.message || "โหลดทะเบียนสิทธิ์เสริมไม่สำเร็จ");
    }
  }, [enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { grants, error, reload };
}

export function GrantRegistryTab({ users = [], registry, canManage, onChanged }) {
  const { grants, error, reload } = registry;
  const [dialog, setDialog] = useState(null); // { user } | { pick: true }
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const active = useMemo(() => (grants || []).filter((g) => !g.revokedAt)
    .sort((a, b) => personName(byId.get(a.userId)).localeCompare(personName(byId.get(b.userId)), "th") || a.cap.localeCompare(b.cap)),
  [grants, byId]);
  const holders = new Set(active.map((g) => g.userId));
  const dead = active.filter((g) => grantEffect(g, byId.get(g.userId)?.role) !== "ok");
  const drift = users.filter((u) => {
    const rows = active.filter((g) => g.userId === u.id);
    return (rows.length || (u.extraCaps || []).length) && copyDrift(u, rows);
  });

  const changed = async () => { await reload(); await onChanged?.(); };

  return (
    <ListPanel
      icon={<ShieldCheck size={17} aria-hidden="true" />}
      title="สิทธิ์เสริมรายคน"
      subtitle="สิทธิ์เพิ่มจากตำแหน่ง มีผลข้ามทุกทีม · ให้/ถอนต้องกรอกเหตุผลและเลือกวันหมดอายุ"
      count={grants === null ? null : `${holders.size} คน · ${active.length} สิทธิ์`}
      loading={grants === null && !error}
      skeletonRows={4}
      actions={canManage && (
        <Button tone="accent" icon={<Plus size={15} aria-hidden="true" />} onClick={() => setDialog({ pick: true })}>
          ให้สิทธิ์เสริม
        </Button>
      )}
    >
      {(error || dead.length > 0 || drift.length > 0) && (
        <div className={styles.bannerWrap}>
          {error && <AlertBanner tone="danger" icon={TriangleAlert}>{error}</AlertBanner>}
          {dead.length > 0 && (
            <AlertBanner tone="warning" icon={TriangleAlert}>
              <strong>{dead.length} สิทธิ์เสริมไม่มีผล</strong> — ซ้ำกับที่ตำแหน่งมีอยู่แล้ว หรืออยู่ในระบบที่ปิด · ถอนได้โดยไม่มีใครเสียอะไร
            </AlertBanner>
          )}
          {drift.length > 0 && (
            <AlertBanner tone="danger" icon={TriangleAlert}>
              <strong>สำเนาสิทธิ์ของ {drift.map(personName).join(" · ")} ไม่ตรงทะเบียน</strong> — มีคนแก้ extraCaps นอกปุ่มจัดการ ·
              เปิด &quot;จัดการ&quot; ของคนนั้นแล้วให้/ถอนหนึ่งครั้งเพื่อเขียนสำเนาใหม่
            </AlertBanner>
          )}
        </div>
      )}
      <TableScroll family="list" surface="embedded">
        <table>
          <thead>
            <tr>
              <th>ผู้ใช้</th>
              <th>สิทธิ์เสริม</th>
              <th>ผลจริง</th>
              <th>เหตุผล</th>
              <th>หมดอายุ</th>
              <th>ให้โดย</th>
              {canManage && <th className="text-center">จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {grants !== null && active.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="text-center py-10 text-[var(--text-3)]">
                  ยังไม่มีใครถือสิทธิ์เสริม
                  <span className={styles.sub}>สิทธิ์ที่ให้เพิ่มจากตำแหน่งจะมาอยู่ที่นี่</span>
                </td>
              </tr>
            ) : active.map((g) => {
              const u = byId.get(g.userId);
              const effect = grantEffect(g, u?.role);
              return (
                <tr key={g.id}>
                  <td>
                    <span className={styles.strong}>{personName(u)}</span>
                    <span className={styles.sub}>{shortRole(u?.role)}</span>
                  </td>
                  <td className={effect === "ok" ? undefined : styles.strike}>{capLabel(g.cap)}</td>
                  <td><Tag tone={EFFECT_TAG[effect].tone}>{EFFECT_TAG[effect].text}</Tag></td>
                  <td className={styles.reason}>{g.reason}</td>
                  <td className="whitespace-nowrap">{g.expiresOn ? `ถึง ${fmtDay(g.expiresOn)}` : "ไม่มีกำหนด"}</td>
                  <td>
                    {g.grantedByName}
                    {/* ของเดิม: เวลานี้คือเวลาย้ายเข้าทะเบียน ไม่ใช่เวลาที่ให้จริง (ไม่มีใครบันทึกไว้) */}
                    <span className={styles.sub}>{isMigratedGrant(g) ? `ย้ายเข้าทะเบียน ${fmtDateTime(g.grantedAt)}` : fmtDateTime(g.grantedAt)}</span>
                  </td>
                  {canManage && (
                    <td className="text-center">
                      <Button size="sm" tone="neutral" onClick={() => u && setDialog({ user: u })} disabled={!u}>จัดการ</Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
      {dialog && (
        <GrantDialog
          user={dialog.user || null}
          users={users}
          onClose={() => setDialog(null)}
          onChanged={changed}
        />
      )}
    </ListPanel>
  );
}

const EVENT_TAG = {
  grant: { tone: "success", text: "ให้" },
  migrated: { tone: "info", text: "ย้ายของเดิม" },
  revoke: { tone: "neutral", text: "ถอน" },
  expired: { tone: "warning", text: "หมดอายุ" },
};

export function GrantHistoryTab({ users = [], registry }) {
  const { grants, error } = registry;
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const events = useMemo(() => grantEvents(grants || []), [grants]);
  return (
    <ListPanel
      icon={<History size={17} aria-hidden="true" />}
      title="ประวัติการให้สิทธิ์"
      subtitle="ให้ · ถอน · หมดอายุ ของสิทธิ์เสริมทุกคน · ก่อน 25/11/2026 ระบบไม่ได้บันทึกว่าใครให้เมื่อไร"
      count={grants === null ? null : `${events.length} รายการ`}
      loading={grants === null && !error}
      skeletonRows={4}
    >
      {error && <div className={styles.bannerWrap}><AlertBanner tone="danger" icon={TriangleAlert}>{error}</AlertBanner></div>}
      <TableScroll family="list" surface="embedded">
        <table>
          <thead>
            <tr><th>เมื่อไร</th><th>ผู้ใช้</th><th>เหตุการณ์</th><th>สิทธิ์</th><th>ผู้ทำ</th><th>เหตุผล / หมายเหตุ</th></tr>
          </thead>
          <tbody>
            {grants !== null && events.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-[var(--text-3)]">ยังไม่มีประวัติ</td></tr>
            ) : events.map((e) => {
              const u = byId.get(e.g.userId);
              return (
                <tr key={e.key}>
                  <td className="whitespace-nowrap">{fmtDateTime(e.at)}</td>
                  <td>
                    <span className={styles.strong}>{personName(u)}</span>
                    <span className={styles.sub}>{shortRole(u?.role)}</span>
                  </td>
                  <td><Tag tone={EVENT_TAG[e.kind].tone}>{EVENT_TAG[e.kind].text}</Tag></td>
                  <td>{capLabel(e.g.cap)}</td>
                  <td>{e.kind === "grant" || e.kind === "migrated" ? e.g.grantedByName : (e.g.revokedByName || "ระบบ")}</td>
                  <td className={styles.reason}>
                    {e.kind === "grant" || e.kind === "migrated"
                      ? <>{e.g.reason}<span className={styles.sub}>{e.g.expiresOn ? `ถึง ${fmtDay(e.g.expiresOn)}` : "ไม่มีกำหนด"}</span></>
                      : (e.g.revokeNote || (e.kind === "expired" ? `ครบกำหนด ${fmtDay(e.g.expiresOn)}` : NA))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </ListPanel>
  );
}
