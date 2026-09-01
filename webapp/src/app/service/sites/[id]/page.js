"use client";
// ── รายละเอียดไซต์: เครื่อง + รอบบริการ + ประวัติการเข้า (mig 0187/0188) ──
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtNumber, fmtPhone, naText, NA } from "@/lib/format";
import { floorLabel } from "@/lib/service/zoneCode";
import { use } from "react";
import { Boxes, CalendarClock, History, Layers, MapPin, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import { TableShell } from "@/components/ui/Table";
import Toast from "@/components/ui/Toast";
import Workspace from "@/components/ui/Workspace";
import DetailOverview, { DetailStateBadge } from "@/components/ui/DetailOverview";
import { DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard, DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";
import ServiceSiteModal from "@/components/service/ServiceSiteModal";
import ServiceAssetModal from "@/components/service/ServiceAssetModal";
import ServicePlanModal from "@/components/service/ServicePlanModal";
import ServiceZoneModal from "@/components/service/ServiceZoneModal";
import {
  ASSET_STATUS_LABELS,
  accessWindowText,
  assetRollup,
} from "@/lib/service/sites";
import { ASSET_KIND_LABELS, assetKindPerUnitRow } from "@/lib/service/assetKinds";
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
import { apiFetch } from "@/lib/apiFetch";

export default function ServiceSiteDetailPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(() => canEditService({ role, team, teams, department }), [role, team, teams, department]);

  const [site, setSite] = useState(null);
  const [zones, setZones] = useState([]);
  const [assets, setAssets] = useState([]);
  // เข้าเติมล่าสุด + นัดครั้งหน้า — ตัวตั้งของการประเมินว่าน้ำหอมจะหมดวันไหน (S-4)
  const [schedule, setSchedule] = useState({ lastRefillDate: null, nextVisitDate: null });
  // ข้อผูกพันจำนวนรอบจากใบเสนอราคา (mig 0326) — ฟอร์มวางรอบเทียบกับความถี่ที่กำลังตั้ง
  const [roundsSold, setRoundsSold] = useState(null);
  const [plans, setPlans] = useState([]);
  const [visits, setVisits] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingSite, setEditingSite] = useState(false);
  const [formAsset, setFormAsset] = useState(undefined); // undefined = ปิด · null = สร้าง
  const [formZone, setFormZone] = useState(undefined);
  const [formPlan, setFormPlan] = useState(undefined);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [siteRes, planRes, visitRes] = await Promise.all([
        apiFetch(`/api/service/sites/${id}`),
        apiFetch(`/api/service/plans?siteId=${id}`),
        apiFetch(`/api/service/visits?siteId=${id}`),
      ]);
      const siteData = await siteRes.json().catch(() => null);
      if (!siteRes.ok) throw new Error(siteData?.error || "โหลดข้อมูลไซต์ไม่สำเร็จ");
      setSite(siteData?.site || null);
      setZones(Array.isArray(siteData?.zones) ? siteData.zones : []);
      setAssets(Array.isArray(siteData?.assets) ? siteData.assets : []);
      setSchedule(siteData?.schedule || { lastRefillDate: null, nextVisitDate: null });
      setRoundsSold(siteData?.roundsSold ?? null);

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

  // รายชื่อเจ้าหน้าที่บริการโหลดเมื่อจะ "เลือก" เท่านั้น
  useEffect(() => {
    if (formPlan === undefined || technicians.length) return;
    (async () => {
      try {
        const res = await apiFetch("/api/pm/assignable-users");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "โหลดรายชื่อเจ้าหน้าที่บริการไม่สำเร็จ");
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
        const res = await apiFetch("/api/customers");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "โหลดรายชื่อลูกค้าไม่สำเร็จ");
        setCustomers(Array.isArray(data) ? data : (data?.rows || []));
      } catch (e) {
        setToast({ kind: "error", msg: e.message });
      }
    })();
  }, [editingSite, customers.length]);

  const saveSite = async (form) => {
    const res = await apiFetch(`/api/service/sites/${id}`, {
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
    const res = await apiFetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    setToast({ kind: "success", msg: editing ? `บันทึกเครื่อง ${data.label} แล้ว` : `เพิ่มเครื่อง ${data.label} แล้ว` });
    await load();
  };

  const saveZone = async (form) => {
    const editing = !!formZone;
    const url = editing
      ? `/api/service/sites/${id}/zones/${formZone.id}`
      : `/api/service/sites/${id}/zones`;
    const res = await apiFetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "บันทึกไม่สำเร็จ");
    setToast({ kind: "success", msg: editing ? `บันทึกโซน ${data.name} แล้ว` : `เพิ่มโซน ${data.name} แล้ว` });
    await load();
  };

  const removeZone = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/service/sites/${id}/zones/${pendingDelete.row.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "ลบไม่สำเร็จ");
      setToast({ kind: "success", msg: `ลบโซน ${pendingDelete.row.name} แล้ว` });
      setPendingDelete(null);
      await load();
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const removeAsset = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/service/sites/${id}/assets/${pendingDelete.row.id}`, { method: "DELETE" });
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
    const res = await apiFetch(editing ? `/api/service/plans/${formPlan.id}?generate=1` : "/api/service/plans", {
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

  const removeSite = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/service/sites/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "ลบไม่สำเร็จ");
      setPendingDelete(null);
      // toast ของหน้าที่กำลังจะออกจากมันไม่มีความหมาย — บอกที่ทะเบียนแทนหลังย้ายหน้า
      router.push("/service/sites?deleted=" + encodeURIComponent(site?.name || id));
    } catch (e) {
      setToast({ kind: "error", msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const removePlan = async () => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/service/plans/${pendingDelete.row.id}`, { method: "DELETE" });
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
  const zonesById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  // เครื่องที่ยังใช้งานแต่ไม่สังกัดโซน — แถบ backfill: ของเก่าเกิดก่อนมีโซน (mig 0298)
  const unzonedActive = useMemo(
    () => assets.filter((a) => a.status !== "removed" && !a.zoneId).length,
    [assets],
  );

  // นัดที่จะถึง / ประวัติ — แยกกันเพราะคนละคำถาม ("เจ้าหน้าที่จะมาเมื่อไหร่" กับ "ที่ผ่านมาทำอะไรบ้าง")
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

  /* ── Control Panel ของไซต์ ────────────────────────────────────────────────
     ไซต์ไม่มีแกนอนุมัติแบบลูกค้า/สินค้า — มีแกนเดียวคือใช้งาน/ปิดใช้งาน จึงให้แกนนั้น
     เป็น status ของการ์ด control ไปเลย (ไม่มี workflowSteps ให้ส่ง)
     ⚠️ ปุ่มระดับไซต์ (แก้ไข/ลบ) ย้ายเข้า Control Panel ทั้งชุด — ห้ามวางแยกไว้ในแถวหัว
     อีก เหมือนที่หน้าลูกค้า/สินค้าห้ามไว้ (ม-49/ม-57) */
  const siteAside = (
    <>
      <DocumentSummaryCard
        title="สรุปไซต์"
        rows={[
          { id: "contact", label: "ผู้ติดต่อ", value: site.contactName ? `${site.contactName}${site.contactPhone ? ` · ${fmtPhone(site.contactPhone)}` : ""}` : "" },
          { id: "routeZone", label: "เขตวิ่งงาน", value: site.routeZone },
          { id: "access", label: "ช่วงเวลาที่เข้าได้", value: accessText || "ไม่จำกัด" },
        ]}
      />

      <DocumentControlCard
        eyebrow="SITE CONTROL"
        title="จัดการไซต์"
        status={site.isActive === false ? "ปิดใช้งาน" : "ใช้งาน"}
        statusColor={site.isActive === false ? "var(--text-3)" : "var(--green)"}
        statusDescription={site.isActive === false
          ? "ไซต์นี้ถูกปิดใช้งาน — ไม่ขึ้นในรายการเลือกของระบบอื่น"
          : "ไซต์พร้อมใช้งาน — รับรอบบริการและนัดใหม่ได้"}
        primaryAction={canEdit ? { id: "edit", kind: "edit", label: "แก้ไขไซต์", onClick: () => setEditingSite(true) } : null}
        /* API มีด่านครบอยู่แล้ว (เครื่อง/โซน/ประวัตินัด บล็อกการลบ) — ปุ่มโชว์เสมอ
           ติดด่านค่อยบอกเหตุตอนกด ไม่ซ่อนปุ่มไว้ล่วงหน้า (เหตุผลเดียวกับทีม) */
        dangerActions={canEdit ? [{ id: "delete", kind: "delete", label: "ลบไซต์", onClick: () => setPendingDelete({ type: "site", row: site }) }] : []}
      />
    </>
  );

  return (
    <Workspace hideHeader back={{ href: "/service/sites", label: "ทะเบียนไซต์" }}>
      <DetailOverview
        eyebrow="SERVICE SITE"
        title={`${site.code ? `${site.code} · ` : ""}${site.name}`}
        description={<><span>{naText(site.customerName)}</span><span>{naText(site.province)}</span></>}
        badges={<DetailStateBadge label={site.isActive === false ? "ปิดใช้งาน" : "ใช้งาน"} color={site.isActive === false ? "var(--text-3)" : "var(--green)"} />}
        facts={[
          { key: "zones", icon: Layers, label: "โซน", value: `${zones.length} โซน` },
          { key: "assets", icon: Boxes, label: "อุปกรณ์", value: `${rollup.active} ใช้งาน${assets.length !== rollup.active ? ` / ${assets.length}` : ""}` },
          { key: "plans", icon: RefreshCw, label: "รอบบริการ", value: `${plans.length} รอบ` },
          { key: "upcoming", icon: CalendarClock, label: "นัดที่จะถึง", value: `${upcoming.length} นัด` },
        ]}
      />

      <div className="mt-[18px]">
      <DetailPageLayout asideLabel="สรุปไซต์และการดำเนินการ" aside={siteAside}>
      <DetailCard icon={MapPin} eyebrow="Site profile" title="ข้อมูลไซต์">
        <dl className={styles.info}>
          <div><dt>เขตวิ่งงาน</dt><dd>{naText(site.routeZone)}</dd></div>
          {/* จังหวัด (mig 0315) — ตัวตนถาวรของไซต์ ตรึงอยู่ในรหัส · คนละช่องกับที่อยู่
              ซึ่งเป็นข้อความหน้างาน (ไซต์เก่าก่อน 0315 ยังไม่มีค่า จึงขึ้นขีด) */}
          <div><dt>จังหวัด</dt><dd>{naText(site.province)}</dd></div>
          <div><dt>ที่อยู่</dt><dd>{naText(site.address)}</dd></div>
          <div><dt>ผู้ติดต่อ</dt><dd>{naText(site.contactName)}{site.contactPhone ? ` · ${fmtPhone(site.contactPhone)}` : ""}</dd></div>
          <div>
            <dt>ช่วงเวลาที่เข้าได้</dt>
            <dd>{accessText || <span className={styles.muted}>ไม่จำกัด</span>}</dd>
          </div>
          <div><dt>เงื่อนไขการเข้า</dt><dd>{naText(site.accessNote)}</dd></div>
          {site.mapUrl && (
            <div>
              <dt>แผนที่</dt>
              {/* ลิงก์ออกนอกระบบ — เปิดแท็บใหม่ + rel กัน tabnabbing */}
              <dd><a href={site.mapUrl} target="_blank" rel="noreferrer noopener">เปิดแผนที่</a></dd>
            </div>
          )}
          {site.note && <div className={styles.wide}><dt>หมายเหตุ</dt><dd>{site.note}</dd></div>}
        </dl>
      </DetailCard>

      <DetailCard
        icon={Layers}
        eyebrow="Zones"
        title="โซนในไซต์"
        meta="พื้นที่ย่อยที่ติดตามการใช้/รอบบริการแยกกัน — โซนอยู่ถาวร ใบสั่งขายใหม่มาผูกโซนเดิมได้"
        actions={canEdit ? (
          <Button tone="primary" onClick={() => setFormZone(null)} icon={<Plus size={15} aria-hidden="true" />}>
            เพิ่มโซน
          </Button>
        ) : null}
      >
        {zones.length === 0 ? (
          <EmptyState icon={Layers} dashed={canEdit} onClick={canEdit ? () => setFormZone(null) : undefined} plain>
            {canEdit ? "ยังไม่มีโซนในไซต์นี้ — เช่น Lobby · Reception · ห้องน้ำชั้น 2" : "ยังไม่มีโซนในไซต์นี้"}
          </EmptyState>
        ) : (
          <TableShell>
            <table>
              <thead>
                <tr>
                  <th>โซน</th>
                  <th className={styles.numCol}>อุปกรณ์</th>
                  <th>สถานะ</th>
                  {canEdit && <th aria-label="การทำงาน" />}
                </tr>
              </thead>
              <tbody>
                {zones.map((zone) => {
                  const zoneAssets = assets.filter((a) => a.zoneId === zone.id && a.status !== "removed");
                  return (
                    <tr key={zone.id} className={zone.isActive === false ? styles.inactive : undefined}>
                      <td>
                        {/* ⭐ ชื่อโซนกดเข้าหน้าโซน — รอบขาย/ยอดใช้จริง/ประวัติของโซนนั้น
                            อยู่ในฐานข้อมูลมาตั้งแต่ mig 0297 แต่ไม่มีทางเข้ามาก่อนหน้านี้ */}
                        <Link href={`/service/sites/${site.id}/zones/${zone.id}`} className={styles.zoneLink}>
                          {zone.name}
                        </Link>
                        {zone.code ? <span className={styles.serial}> · {zone.code}</span> : null}
                        {/* ชั้น/อาคาร (mig 0315) — ชั้นอยู่ในรหัสอยู่แล้วแต่ในรูปย่อ (GF/04)
                            บรรทัดนี้อ่านออกโดยไม่ต้องแกะรหัส */}
                        <div className={styles.muted}>
                          {[zone.building, floorLabel(zone.floor)].filter(Boolean).join(" · ")}
                          {zone.note ? `${zone.building || zone.floor ? " · " : ""}${zone.note}` : ""}
                        </div>
                      </td>
                      <td className={styles.numCol}>{zoneAssets.length}</td>
                      <td><span className="ui-badge">{zone.isActive === false ? "ปิดใช้งาน" : "ใช้งาน"}</span></td>
                      {canEdit && (
                        <td>
                          <div className={styles.rowActions}>
                            <Button iconOnly tone="neutral" variant="quiet" aria-label={`แก้ไขโซน ${zone.name}`} onClick={() => setFormZone(zone)} icon={<Pencil size={14} aria-hidden="true" />} />
                            <Button iconOnly tone="danger" variant="quiet" aria-label={`ลบโซน ${zone.name}`} onClick={() => setPendingDelete({ type: "zone", row: zone })} icon={<Trash2 size={14} aria-hidden="true" />} />
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
      </DetailCard>

      <DetailCard
        icon={Boxes}
        eyebrow="Assets"
        title="อุปกรณ์ในไซต์"
        /* ⚠️ ต้องครบทุกกอง ไม่งั้นตัวเลขไม่รวมกันเป็น total แล้วคนอ่านเห็นเป็นบั๊ก
           (mig 0332 เพิ่ม in_stock เข้ามา) · กองที่เป็นศูนย์ตัดทิ้งเพื่อไม่ให้แถวยาวเปล่า ๆ */
        meta={[
          `ใช้งาน ${rollup.active}`,
          rollup.inStock ? `อยู่ในคลัง ${rollup.inStock}` : null,
          `ส่งซ่อม ${rollup.repair}`,
          rollup.removed ? `ปลดระวาง ${rollup.removed}` : null,
          rollup.broken ? `ชำรุด ${rollup.broken}` : null,
        ].filter(Boolean).join(" · ")}
        actions={canEdit ? (
          <Button tone="primary" onClick={() => setFormAsset(null)} icon={<Plus size={15} aria-hidden="true" />}>
            เพิ่มอุปกรณ์
          </Button>
        ) : null}
      >
        {/* แถบ backfill — อุปกรณ์เก่าเกิดก่อนมีโซน (mig 0298) ต้องมีคนไล่จัดเข้าโซน
            โชว์เฉพาะเมื่อไซต์เริ่มมีโซนแล้ว (ไซต์ที่ยังไม่ใช้โซนไม่ต้องโดนทวง) */}
        {zones.length > 0 && unzonedActive > 0 && (
          <p className={styles.backfillNote} role="status">
            อุปกรณ์ {unzonedActive} รายการยังไม่ระบุโซน — กดแก้ไขรายตัวเพื่อเลือกโซน
            แล้วการใช้ต่อรอบจะเริ่มนับเป็นของโซนนั้น
          </p>
        )}
        {assets.length === 0 ? (
          <EmptyState icon={MapPin} dashed={canEdit} onClick={canEdit ? () => setFormAsset(null) : undefined} plain>
            {canEdit ? "ยังไม่มีอุปกรณ์ในไซต์นี้ — กดเพื่อเพิ่มรายการแรก" : "ยังไม่มีอุปกรณ์ในไซต์นี้"}
          </EmptyState>
        ) : (
          <TableShell>
            <table>
              <thead>
                <tr>
                  <th>อุปกรณ์</th>
                  <th>โซน</th>
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
                  // ชนิดแถวรวม (reed/สบู่/แอลกอฮอล์) โชว์จำนวนจุดคู่ชนิดเสมอ
                  const kindText = `${ASSET_KIND_LABELS[asset.kind] || asset.kind || ""}${!assetKindPerUnitRow(asset.kind) && asset.qty ? ` · ${fmtNumber(asset.qty)} จุด` : ""}`;
                  return (
                    <tr key={asset.id} className={asset.status === "removed" ? styles.inactive : undefined}>
                      <td>
                        {/* ชื่อเครื่องกดเข้าหน้าอุปกรณ์ — ค่าตั้งเครื่องกับประวัติรายตัว
                            (ติดตั้ง · ถูกเปลี่ยน · เอาไปแทนตัวอื่น) อยู่ที่นั่น */}
                        <Link href={`/service/assets/${asset.id}`} className={styles.zoneLink}>
                          {asset.label}
                        </Link>
                        {kindText ? <div className={styles.muted}>{kindText}</div> : null}
                      </td>
                      <td>{asset.zoneId ? naText(zonesById.get(asset.zoneId)?.name) : <span className={styles.muted}>ยังไม่ระบุ</span>}</td>
                      <td>
                        {naText(asset.model)}
                        {asset.colour ? ` (${asset.colour})` : ""}
                        {asset.serial ? <span className={styles.serial}> · {asset.serial}</span> : null}
                      </td>
                      <td>{naText(asset.productName)}</td>
                      <td className={styles.numCol}>
                        {asset.bottleMl ? `${fmtNumber(asset.bottleMl)} ml` : NA}
                        {asset.mlPerDay ? ` / ${fmtNumber(asset.mlPerDay)} ต่อวัน` : ""}
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
      </DetailCard>

      <DetailCard
        icon={RefreshCw}
        eyebrow="Service rounds"
        title="รอบบริการ"
        meta="ระบบสร้างนัดล่วงหน้า 90 วันตามรอบ แล้วต่อรอบให้เมื่อปิดงานจริง"
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
                  <th>เจ้าหน้าที่ประจำ</th>
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
      </DetailCard>

      <DetailCard icon={CalendarClock} eyebrow="Upcoming visits" title="นัดที่จะถึง" meta={`${upcoming.length} นัด`}>
        {upcoming.length === 0 ? (
          <EmptyState icon={MapPin} plain>ยังไม่มีนัดที่จะถึงของไซต์นี้</EmptyState>
        ) : (
          <TableShell>
            <table>
              <thead>
                <tr><th>วันที่</th><th>เวลา</th><th>งาน</th><th>เจ้าหน้าที่</th><th>รหัส</th></tr>
              </thead>
              <tbody>
                {upcoming.map((visit) => (
                  <tr key={visit.id}>
                    <td>{visit.scheduledDate}</td>
                    <td>{visitTimeText(visit)}</td>
                    <td>{VISIT_KIND_LABELS[visit.kind] || visit.kind}</td>
                    <td>{visit.assigneeName || <span className={styles.muted}>ยังไม่มอบหมาย</span>}</td>
                    <td className="mono">{naText(visit.code)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        )}
      </DetailCard>

      <DetailCard icon={History} eyebrow="Visit history" title="ประวัติการเข้า" meta="20 ครั้งล่าสุด">
        {history.length === 0 ? (
          <EmptyState icon={MapPin} plain>ยังไม่มีประวัติการเข้าไซต์นี้</EmptyState>
        ) : (
          <TableShell>
            <table>
              <thead>
                <tr><th>วันที่นัด</th><th>เข้าจริง</th><th>งาน</th><th>เจ้าหน้าที่</th><th>สถานะ</th><th>สรุปงาน</th><th aria-label="ใบส่งงาน" /></tr>
              </thead>
              <tbody>
                {history.map((visit) => (
                  <tr key={visit.id} className={visit.status === "cancelled" ? styles.inactive : undefined}>
                    <td>{visit.scheduledDate}</td>
                    {/* ช่องว่างตรงนี้มีความหมาย: นัดที่เลยวันแล้วแต่ไม่มีวันเข้าจริง = ยังไม่มีใครปิดงาน */}
                    <td>{visit.actualDate || <span className={styles.muted}>ยังไม่ปิดงาน</span>}</td>
                    <td>{VISIT_KIND_LABELS[visit.kind] || visit.kind}</td>
                    <td>{naText(visit.assigneeName)}</td>
                    <td><span className="ui-badge">{VISIT_STATUS_LABELS[visit.status] || visit.status}</span></td>
                    <td>{naText(visit.summary)}</td>
                    {/* ประวัติต้องกดเข้าใบได้ — ไม่งั้นคอลัมน์ "สรุปงาน" ที่ตัดสั้น
                        คือทั้งหมดที่คนอ่านย้อนหลังได้ */}
                    <td><a className="linklike" href={`/service/visits/${visit.id}`}>ใบส่งงาน</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
        )}
      </DetailCard>
      </DetailPageLayout>
      </div>

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
        roundsSold={roundsSold}
        onClose={() => setFormPlan(undefined)}
        onSave={savePlan}
      />

      <ServiceAssetModal
        open={formAsset !== undefined}
        asset={formAsset}
        zones={zones}
        onClose={() => setFormAsset(undefined)}
        onSave={saveAsset}
      />

      <ServiceZoneModal
        open={formZone !== undefined}
        zone={formZone}
        onClose={() => setFormZone(undefined)}
        onSave={saveZone}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        danger
        title={pendingDelete?.type === "plan" ? "ลบรอบบริการ"
          : pendingDelete?.type === "zone" ? "ลบโซนออกจากไซต์"
            : pendingDelete?.type === "site" ? "ลบไซต์บริการ"
              : "ลบอุปกรณ์ออกจากไซต์"}
        message={pendingDelete
          ? (pendingDelete.type === "plan"
            ? `ลบรอบทุก ${pendingDelete.row.everyDays} วัน?`
            : pendingDelete.type === "zone"
              ? `ลบโซน ${pendingDelete.row.name}?`
              : pendingDelete.type === "site"
                ? `ลบไซต์ ${pendingDelete.row?.name}?`
                : `ลบ ${pendingDelete.row.label} ออกจากไซต์นี้?`)
          : ""}
        detail={pendingDelete?.type === "plan"
          ? "นัดที่สร้างไว้แล้วยังอยู่บนตารางในฐานะงานนอกรอบ — ลูกค้าที่รู้แล้วว่าเจ้าหน้าที่จะมา จะไม่ถูกยกเลิกเงียบ ๆ"
          : pendingDelete?.type === "zone"
            ? "โซนที่มีรอบขายผูกอยู่จะลบไม่ได้ (ปิดใช้งานแทนเพื่อเก็บประวัติ) · อุปกรณ์ในโซนไม่หาย แต่จะกลับไปกอง 'ยังไม่ระบุโซน'"
            : pendingDelete?.type === "site"
              ? "ลบได้เฉพาะไซต์ที่ยังไม่มีเครื่อง/โซน/ประวัตินัด — มีของค้างอยู่จะลบไม่ผ่านพร้อมบอกว่าติดอะไร ถ้าไซต์นี้เลิกใช้แล้วให้ปิดใช้งานแทน (แก้ไขไซต์ → สถานะ)"
              : "ถ้าอุปกรณ์ถูกถอดออกจริง ให้เปลี่ยนสถานะเป็น 'ถอดออกแล้ว' แทนการลบ เพื่อไม่ให้ประวัติการเข้าบริการหาย"}
        confirmLabel={pendingDelete?.type === "plan" ? "ลบรอบ" : pendingDelete?.type === "zone" ? "ลบโซน" : pendingDelete?.type === "site" ? "ลบไซต์" : "ลบอุปกรณ์"}
        busy={busy}
        onConfirm={pendingDelete?.type === "plan" ? removePlan : pendingDelete?.type === "zone" ? removeZone : pendingDelete?.type === "site" ? removeSite : removeAsset}
        onClose={() => setPendingDelete(null)}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
