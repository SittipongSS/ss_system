"use client";
// ── รายละเอียดไซต์: เครื่อง + รอบบริการ + ประวัติการเข้า (mig 0187/0188) ──
import { useCallback, useEffect, useMemo, useState } from "react";
import { use } from "react";
import { MapPin, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableShell } from "@/components/ui/Table";
import Toast from "@/components/ui/Toast";
import Workspace, { WorkspaceSection } from "@/components/ui/Workspace";
import ServiceSiteModal from "@/components/service/ServiceSiteModal";
import ServiceAssetModal from "@/components/service/ServiceAssetModal";
import ServicePlanModal from "@/components/service/ServicePlanModal";
import {
  ASSET_STATUS_LABELS,
  accessWindowText,
  assetRollup,
} from "@/lib/service/sites";
import { refillStatus } from "@/lib/service/refill";
import {
  VISIT_KIND_LABELS,
  VISIT_STATUS_LABELS,
  visitTimeText,
} from "@/lib/service/rounds";
import { toLocalISODate } from "@/lib/pm/dateHelpers";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canBeServiceAssignee, canEditService } from "@/lib/permissions";
import styles from "./page.module.css";
import { businessDate } from "@/lib/businessDate";

export default function ServiceSiteDetailPage({ params }) {
  const { id } = use(params);
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditService({ role, team, teams, department }), [role, team, teams, department]);

  const [site, setSite] = useState(null);
  const [assets, setAssets] = useState([]);
  // เข้าเติมล่าสุด + นัดครั้งหน้า — ตัวตั้งของการประเมินว่าน้ำหอมจะหมดวันไหน (S-4)
  const [schedule, setSchedule] = useState({ lastRefillDate: null, nextVisitDate: null });
  const [plans, setPlans] = useState([]);
  const [visits, setVisits] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingSite, setEditingSite] = useState(false);
  const [formAsset, setFormAsset] = useState(undefined); // undefined = ปิด · null = สร้าง
  const [formPlan, setFormPlan] = useState(undefined);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [siteRes, planRes, visitRes] = await Promise.all([
        fetch(`/api/service/sites/${id}`),
        fetch(`/api/service/plans?siteId=${id}`),
        fetch(`/api/service/visits?siteId=${id}`),
      ]);
      const siteData = await siteRes.json().catch(() => null);
      if (!siteRes.ok) throw new Error(siteData?.error || "โหลดข้อมูลไซต์ไม่สำเร็จ");
      setSite(siteData?.site || null);
      setAssets(Array.isArray(siteData?.assets) ? siteData.assets : []);
      setSchedule(siteData?.schedule || { lastRefillDate: null, nextVisitDate: null });

      const planData = await planRes.json().catch(() => null);
      if (!planRes.ok) throw new Error(planData?.error || "โหลดรอบบริการไม่สำเร็จ");
      setPlans(Array.isArray(planData) ? planData : []);

      const visitData = await visitRes.json().catch(() => null);
      if (!visitRes.ok) throw new Error(visitData?.error || "โหลดประวัติการเข้าไม่สำเร็จ");
      setVisits(Array.isArray(visitData?.visits) ? visitData.visits : []);
    } catch (e) {
      setLoadError(e.message || "โหลดข้อมูลไซต์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // รายชื่อช่างโหลดเมื่อจะ "เลือก" เท่านั้น
  useEffect(() => {
    if (formPlan === undefined || technicians.length) return;
    (async () => {
      try {
        const res = await fetch("/api/pm/assignable-users");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "โหลดรายชื่อช่างไม่สำเร็จ");
        setTechnicians((Array.isArray(data) ? data : []).filter(canBeServiceAssignee));
      } catch (e) {
        setToast({ kind: "error", msg: e.message });
      }
    })();
  }, [formPlan, technicians.length]);

  useEffect(() => {
    if (!editingSite || customers.length) return;
    (async () => {
      try {
        const res = await fetch("/api/customers");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "โหลดรายชื่อลูกค้าไม่สำเร็จ");
        setCustomers(Array.isArray(data) ? data : (data?.rows || []));
      } catch (e) {
        setToast({ kind: "error", msg: e.message });
      }
    })();
  }, [editingSite, customers.length]);

  const saveSite = async (form) => {
    const res = await fetch(`/api/service/sites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    setToast({ kind: "success", msg: "บันทึกข้อมูลไซต์แล้ว" });
    await load();
  };

  const saveAsset = async (form) => {
    const editing = !!formAsset;
    const url = editing
      ? `/api/service/sites/${id}/assets/${formAsset.id}`
      : `/api/service/sites/${id}/assets`;
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    setToast({ kind: "success", msg: editing ? `บันทึกเครื่อง ${data.label} แล้ว` : `เพิ่มเครื่อง ${data.label} แล้ว` });
    await load();
  };

  const removeAsset = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/service/sites/${id}/assets/${pendingDelete.row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "ลบไม่สำเร็จ");
      setToast({ kind: "success", msg: `ลบเครื่อง ${pendingDelete.row.label} แล้ว` });
      setPendingDelete(null);
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const savePlan = async (form) => {
    const editing = !!formPlan;
    // ⚠️ แก้รอบ **ไม่ลบนัดที่ gen ไปแล้ว** — เติมเพิ่มอย่างเดียว (generate=1)
    // นัดที่คนย้ายวัน/มอบหมายไปแล้วต้องไม่ถูก gen ทับ
    const res = await fetch(editing ? `/api/service/plans/${formPlan.id}?generate=1` : "/api/service/plans", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    const count = Array.isArray(data?.generated) ? data.generated.length : 0;
    setToast({
      kind: "success",
      msg: count ? `บันทึกรอบแล้ว · สร้างนัดให้ ${count} ครั้ง` : "บันทึกรอบแล้ว · ยังไม่มีนัดใหม่ที่ต้องสร้าง",
    });
    await load();
  };

  const removePlan = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/service/plans/${pendingDelete.row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "ลบไม่สำเร็จ");
      setToast({ kind: "success", msg: "ลบรอบแล้ว — นัดที่สร้างไว้ยังอยู่ในฐานะงานนอกรอบ" });
      setPendingDelete(null);
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const rollup = useMemo(() => assetRollup(assets), [assets]);
  const accessText = site ? accessWindowText(site) : "";

  // นัดที่จะถึง / ประวัติ — แยกกันเพราะคนละคำถาม ("ช่างจะมาเมื่อไหร่" กับ "ที่ผ่านมาทำอะไรบ้าง")
  const todayIso = businessDate();
  const upcoming = useMemo(
    () => visits.filter((v) => v.scheduledDate >= todayIso && v.status === "scheduled"),
    [visits, todayIso],
  );
  const history = useMemo(
    () => [...visits].filter((v) => v.scheduledDate < todayIso || v.status !== "scheduled")
      .sort((a, b) => String(b.scheduledDate).localeCompare(String(a.scheduledDate)))
      .slice(0, 20),
    [visits, todayIso],
  );

  if (loading) {
    return <Workspace icon={<MapPin size={20} aria-hidden="true" />} title="ไซต์บริการ" back={{ href: "/service/sites", label: "ทะเบียนไซต์" }}><SkeletonRows rows={5} /></Workspace>;
  }
  if (loadError || !site) {
    return (
      <Workspace icon={<MapPin size={20} aria-hidden="true" />} title="ไซต์บริการ" back={{ href: "/service/sites", label: "ทะเบียนไซต์" }}>
        <p className="form-error" role="alert">{loadError || "ไม่พบไซต์บริการ"}</p>
      </Workspace>
    );
  }

  return (
    <Workspace
      icon={<MapPin size={20} aria-hidden="true" />}
      title={site.name}
      subtitle={`${site.customerName || "-"}${site.code ? ` · ${site.code}` : ""}`}
      back={{ href: "/service/sites", label: "ทะเบียนไซต์" }}
      headerRight={canEdit ? (
        <Button tone="neutral" onClick={() => setEditingSite(true)} icon={<Pencil size={15} aria-hidden="true" />}>
          แก้ไขไซต์
        </Button>
      ) : null}
    >
      <WorkspaceSection title="ข้อมูลไซต์">
        <dl className={styles.info}>
          <div><dt>โซน</dt><dd>{site.zone || "-"}</dd></div>
          <div><dt>ที่อยู่</dt><dd>{site.address || "-"}</dd></div>
          <div><dt>ผู้ติดต่อ</dt><dd>{site.contactName || "-"}{site.contactPhone ? ` · ${site.contactPhone}` : ""}</dd></div>
          <div>
            <dt>ช่วงเวลาที่เข้าได้</dt>
            <dd>{accessText || <span className={styles.muted}>ไม่จำกัด</span>}</dd>
          </div>
          <div><dt>เงื่อนไขการเข้า</dt><dd>{site.accessNote || "-"}</dd></div>
          <div><dt>สถานะ</dt><dd><span className="ui-badge">{site.isActive === false ? "ปิดใช้งาน" : "ใช้งาน"}</span></dd></div>
          {site.mapUrl && (
            <div>
              <dt>แผนที่</dt>
              {/* ลิงก์ออกนอกระบบ — เปิดแท็บใหม่ + rel กัน tabnabbing */}
              <dd><a href={site.mapUrl} target="_blank" rel="noreferrer noopener">เปิดแผนที่</a></dd>
            </div>
          )}
          {site.note && <div className={styles.wide}><dt>หมายเหตุ</dt><dd>{site.note}</dd></div>}
        </dl>
      </WorkspaceSection>

      <WorkspaceSection
        title="เครื่องในไซต์"
        subtitle={`ใช้งาน ${rollup.active} · ส่งซ่อม ${rollup.repair} · ถอดออกแล้ว ${rollup.removed}`}
        actions={canEdit ? (
          <Button tone="primary" onClick={() => setFormAsset(null)} icon={<Plus size={15} aria-hidden="true" />}>
            เพิ่มเครื่อง
          </Button>
        ) : null}
      >
        {assets.length === 0 ? (
          <EmptyState icon={MapPin} dashed={canEdit} onClick={canEdit ? () => setFormAsset(null) : undefined} plain>
            {canEdit ? "ยังไม่มีเครื่องในไซต์นี้ — กดเพื่อเพิ่มเครื่องแรก" : "ยังไม่มีเครื่องในไซต์นี้"}
          </EmptyState>
        ) : (
          <TableShell>
            <table>
              <thead>
                <tr>
                  <th>เครื่อง</th>
                  <th>รุ่น / Serial</th>
                  <th>กลิ่นที่ใช้</th>
                  <th className={styles.numCol}>ขวด / อัตราใช้</th>
                  <th>คาดว่าหมด</th>
                  <th>สถานะ</th>
                  {canEdit && <th aria-label="การทำงาน" />}
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const refill = refillStatus(asset, {
                    lastSiteRefillDate: schedule.lastRefillDate,
                    nextVisitDate: schedule.nextVisitDate,
                  });
                  return (
                    <tr key={asset.id} className={asset.status === "removed" ? styles.inactive : undefined}>
                      <td>{asset.label}</td>
                      <td>
                        {asset.model || "-"}
                        {asset.serial ? <span className={styles.serial}> · {asset.serial}</span> : null}
                      </td>
                      <td>{asset.productName || "-"}</td>
                      <td className={styles.numCol}>
                        {asset.bottleMl ? `${Number(asset.bottleMl).toLocaleString("th-TH")} ml` : "-"}
                        {asset.mlPerDay ? ` / ${Number(asset.mlPerDay).toLocaleString("th-TH")} ต่อวัน` : ""}
                      </td>
                      {/* ⚠️ ข้อมูลไม่พอ = ไม่เดา · ป้ายที่มั่วจะทำให้ป้ายจริงถูกเมินไปด้วย */}
                      <td className={refill.state === "overdue" ? styles.overdue : refill.state === "soon" ? styles.soon : undefined}>
                        {refill.state === "unknown"
                          ? <span className={styles.muted}>{refill.label}</span>
                          : refill.label}
                      </td>
                      <td><span className="ui-badge">{ASSET_STATUS_LABELS[asset.status] || asset.status}</span></td>
                      {canEdit && (
                        <td>
                          <div className={styles.rowActions}>
                            <Button iconOnly tone="neutral" variant="quiet" aria-label={`แก้ไขเครื่อง ${asset.label}`} onClick={() => setFormAsset(asset)} icon={<Pencil size={14} aria-hidden="true" />} />
                            <Button iconOnly tone="danger" variant="quiet" aria-label={`ลบเครื่อง ${asset.label}`} onClick={() => setPendingDelete({ type: "asset", row: asset })} icon={<Trash2 size={14} aria-hidden="true" />} />
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableShell>
        )}
      </WorkspaceSection>

      <WorkspaceSection
        title="รอบบริการ"
        subtitle="ระบบสร้างนัดล่วงหน้า 90 วันตามรอบ แล้วต่อรอบให้เมื่อปิดงานจริง"
        actions={canEdit ? (
          <Button tone="primary" onClick={() => setFormPlan(null)} icon={<Plus size={15} aria-hidden="true" />}>
            สร้างรอบ
          </Button>
        ) : null}
      >
        {plans.length === 0 ? (
          <EmptyState icon={RefreshCw} dashed={canEdit} onClick={canEdit ? () => setFormPlan(null) : undefined} plain>
            {canEdit
              ? "ยังไม่มีรอบบริการ — สร้างรอบแล้วระบบจะวางนัดให้เอง"
              : "ยังไม่มีรอบบริการ"}
          </EmptyState>
        ) : (
          <TableShell>
            <table>
              <thead>
                <tr>
                  <th>ชนิดงาน</th>
                  <th>รอบ</th>
                  <th>ช่วงเวลา</th>
                  <th>ช่างประจำ</th>
                  <th>สถานะ</th>
                  {canEdit && <th aria-label="การทำงาน" />}
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id} className={plan.isActive === false ? styles.inactive : undefined}>
                    <td>{VISIT_KIND_LABELS[plan.kind] || plan.kind}</td>
                    <td>ทุก {plan.everyDays} วัน</td>
                    <td>{plan.startDate}{plan.endDate ? ` – ${plan.endDate}` : " – ไม่มีกำหนดสิ้นสุด"}</td>
                    <td>{plan.assigneeName || <span className={styles.muted}>ยังไม่กำหนด</span>}</td>
                    <td><span className="ui-badge">{plan.isActive === false ? "ปิดรอบ" : "ใช้งาน"}</span></td>
                    {canEdit && (
                      <td>
                        <div className={styles.rowActions}>
                          <Button iconOnly tone="neutral" variant="quiet" aria-label="แก้รอบบริการ" onClick={() => setFormPlan(plan)} icon={<Pencil size={14} aria-hidden="true" />} />
                          <Button iconOnly tone="danger" variant="quiet" aria-label="ลบรอบบริการ" onClick={() => setPendingDelete({ type: "plan", row: plan })} icon={<Trash2 size={14} aria-hidden="true" />} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="นัดที่จะถึง" subtitle={`${upcoming.length} นัด`}>
        {upcoming.length === 0 ? (
          <EmptyState icon={MapPin} plain>ยังไม่มีนัดที่จะถึงของไซต์นี้</EmptyState>
        ) : (
          <TableShell>
            <table>
              <thead>
                <tr><th>วันที่</th><th>เวลา</th><th>งาน</th><th>ช่าง</th><th>รหัส</th></tr>
              </thead>
              <tbody>
                {upcoming.map((visit) => (
                  <tr key={visit.id}>
                    <td>{visit.scheduledDate}</td>
                    <td>{visitTimeText(visit)}</td>
                    <td>{VISIT_KIND_LABELS[visit.kind] || visit.kind}</td>
                    <td>{visit.assigneeName || <span className={styles.muted}>ยังไม่มอบหมาย</span>}</td>
                    <td className="mono">{visit.code || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        )}
      </WorkspaceSection>

      <WorkspaceSection title="ประวัติการเข้า" subtitle="20 ครั้งล่าสุด">
        {history.length === 0 ? (
          <EmptyState icon={MapPin} plain>ยังไม่มีประวัติการเข้าไซต์นี้</EmptyState>
        ) : (
          <TableShell>
            <table>
              <thead>
                <tr><th>วันที่นัด</th><th>เข้าจริง</th><th>งาน</th><th>ช่าง</th><th>สถานะ</th><th>สรุปงาน</th></tr>
              </thead>
              <tbody>
                {history.map((visit) => (
                  <tr key={visit.id} className={visit.status === "cancelled" ? styles.inactive : undefined}>
                    <td>{visit.scheduledDate}</td>
                    {/* ช่องว่างตรงนี้มีความหมาย: นัดที่เลยวันแล้วแต่ไม่มีวันเข้าจริง = ยังไม่มีใครปิดงาน */}
                    <td>{visit.actualDate || <span className={styles.muted}>ยังไม่ปิดงาน</span>}</td>
                    <td>{VISIT_KIND_LABELS[visit.kind] || visit.kind}</td>
                    <td>{visit.assigneeName || "-"}</td>
                    <td><span className="ui-badge">{VISIT_STATUS_LABELS[visit.status] || visit.status}</span></td>
                    <td>{visit.summary || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        )}
      </WorkspaceSection>

      <ServiceSiteModal
        open={editingSite}
        site={site}
        customers={customers}
        onClose={() => setEditingSite(false)}
        onSave={saveSite}
      />

      <ServicePlanModal
        open={formPlan !== undefined}
        siteId={id}
        plan={formPlan}
        technicians={technicians}
        onClose={() => setFormPlan(undefined)}
        onSave={savePlan}
      />

      <ServiceAssetModal
        open={formAsset !== undefined}
        asset={formAsset}
        onClose={() => setFormAsset(undefined)}
        onSave={saveAsset}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        danger
        title={pendingDelete?.type === "plan" ? "ลบรอบบริการ" : "ลบเครื่องออกจากไซต์"}
        message={pendingDelete
          ? (pendingDelete.type === "plan"
            ? `ลบรอบทุก ${pendingDelete.row.everyDays} วัน?`
            : `ลบ ${pendingDelete.row.label} ออกจากไซต์นี้?`)
          : ""}
        detail={pendingDelete?.type === "plan"
          ? "นัดที่สร้างไว้แล้วยังอยู่บนตารางในฐานะงานนอกรอบ — ลูกค้าที่รู้แล้วว่าช่างจะมา จะไม่ถูกยกเลิกเงียบ ๆ"
          : "ถ้าเครื่องถูกถอดออกจริง ให้เปลี่ยนสถานะเป็น 'ถอดออกแล้ว' แทนการลบ เพื่อไม่ให้ประวัติการเข้าบริการหาย"}
        confirmLabel={pendingDelete?.type === "plan" ? "ลบรอบ" : "ลบเครื่อง"}
        busy={busy}
        onConfirm={pendingDelete?.type === "plan" ? removePlan : removeAsset}
        onClose={() => setPendingDelete(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
