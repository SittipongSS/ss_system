"use client";
// ── หน้าอุปกรณ์รายตัว ────────────────────────────────────────────────────
//
// ⭐ ค่าตั้งเครื่องจริงเคยอยู่ในรูปถ่ายหน้าจอที่เจ้าหน้าที่ส่งเข้า LINE ทุกเดือน — mig 0298
//   เพิ่งมีที่เก็บ (`settings`) แต่ยังไม่มีจอไหนแสดงสักจอ
//
// ⭐ และเครื่องหนึ่งตัวมีประวัติของตัวเอง (ติดตั้ง · ถูกเปลี่ยน · เอาไปแทนตัวอื่น ·
//   ถอดออก) ที่กระจายอยู่หลายตาราง — จอนี้เอามาเรียงให้อ่านเป็นเรื่องเดียว
//   ⚠️ ไม่มีตาราง event ของอุปกรณ์ โดยเจตนา (ดูเหตุผลใน lib/service/assetHistory.js)
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, Layers, MapPin, Package, Wrench } from "lucide-react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import DetailOverview from "@/components/ui/DetailOverview";
import { ContextCard, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { DocumentControlCard } from "@/components/ui/DocumentControlPanel";
import AssetMoveModal from "@/components/service/AssetMoveModal";
import Toast from "@/components/ui/Toast";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { canEditService } from "@/lib/permissions";
import {
  ASSET_CONDITION_LABELS, ASSET_STATUS_LABELS, isWarehouseSite,
} from "@/lib/service/sites";
import { MOVE_LABELS, assetMoveOwnerError } from "@/lib/service/assetMoves";
import { assetTimeline, settingOutlier, settingText } from "@/lib/service/assetHistory";
import { ASSET_KIND_LABELS, assetKindPerUnitRow } from "@/lib/service/assetKinds";
import { refillStatus } from "@/lib/service/refill";
import { VISIT_KIND_LABELS } from "@/lib/service/rounds";
import { isClosedVisit } from "@/lib/service/visitStatus";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

export default function ServiceAssetPage({ params }) {
  const { id } = use(params);   // = assetId · เฟส B ย้าย route ออกจากใต้ไซต์
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [moveKind, setMoveKind] = useState(null);   // null = ปิด · 'transfer' ฯลฯ = เปิด
  const [moveBusy, setMoveBusy] = useState(false);
  const [toast, setToast] = useState(null);
  // ตัวเลือกปลายทางโหลดตอนเปิดโมดัลเท่านั้น — ไซต์ทั้งระบบไม่ควรถูกดึงทุกครั้งที่เปิดหน้าเครื่อง
  const [pickerSites, setPickerSites] = useState([]);
  const [pickerZones, setPickerZones] = useState([]);

  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const canEdit = useMemo(
    () => canEditService({ role, team, teams, department }),
    [role, team, teams, department],
  );

  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`/api/service/assets/${id}/detail`);
      const body = await res.json().catch(() => null);
      if (!isLatest()) return;
      if (!res.ok) throw new Error(body?.error || "โหลดข้อมูลอุปกรณ์ไม่สำเร็จ");
      setData(body);
    } catch (e) {
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดข้อมูลอุปกรณ์ไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [id, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const asset = data?.asset || null;
  const assetsById = useMemo(
    () => new Map((data?.zoneAssets || []).concat(asset ? [asset] : []).map((a) => [a.id, a])),
    [data?.zoneAssets, asset],
  );

  const timeline = useMemo(() => assetTimeline({
    asset,
    results: data?.results || [],
    items: data?.items || [],
    visits: data?.visits || [],
    moves: data?.moves || [],
    assetsById,
  }), [asset, data, assetsById]);

  const outlier = useMemo(() => settingOutlier(asset, data?.zoneAssets || []), [asset, data?.zoneAssets]);

  /* วันที่คาดว่าน้ำหอมหมด — ตัวเดียวกับที่หน้าทะเบียนใช้ ห้ามคิดสูตรใหม่ที่นี่ */
  const refill = useMemo(() => {
    if (!asset) return null;
    const lastClosed = (data?.visits || [])
      .filter((v) => isClosedVisit(v) && v.actualDate)
      .sort((a, b) => String(b.actualDate).localeCompare(String(a.actualDate)))[0];
    const nextVisit = (data?.visits || [])
      .filter((v) => !isClosedVisit(v) && v.scheduledDate)
      .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)))[0];
    return refillStatus(asset, {
      lastSiteRefillDate: lastClosed?.actualDate || null,
      nextVisitDate: nextVisit?.scheduledDate || null,
    });
  }, [asset, data?.visits]);

  /* ⚠️ ปุ่มย้อนกลับต้องอ่านไซต์จาก **ข้อมูลที่โหลดมา** ไม่ใช่จาก route param อีกแล้ว
     (URL ใหม่ไม่มี siteId) · ตอนยังโหลดไม่เสร็จยังไม่รู้ไซต์ ⇒ ถอยไปทะเบียนเครื่อง
     ซึ่งเป็นที่ที่คนกดเข้ามาจริง ไม่ใช่ลิงก์เปล่าที่กดแล้วไม่ไปไหน */
  /* โหลดตัวเลือกปลายทางตอนเปิดโมดัลเท่านั้น (lazy) — ไซต์ทั้งระบบ 200+ ใบ
     ไม่ควรถูกดึงทุกครั้งที่มีคนเปิดหน้าเครื่องเฉย ๆ
     ⚠️ ขอ `kind=all` เพราะคำสั่ง "ถอนกลับคลัง" ต้องเห็นไซต์คลังด้วย ซึ่งค่าตั้งต้น
        ของ API ตัดออก (คลังไม่ใช่แถวในทะเบียนไซต์) */
  useEffect(() => {
    if (!moveKind || pickerSites.length) return;
    (async () => {
      try {
        const res = await apiFetch("/api/service/sites?kind=all");
        const rows = await res.json().catch(() => null);
        if (!res.ok) throw new Error(rows?.error || "โหลดรายการไซต์ไม่สำเร็จ");
        setPickerSites(Array.isArray(rows) ? rows : []);
      } catch (e) {
        setToast({ kind: "error", msg: e.message });
      }
    })();
  }, [moveKind, pickerSites.length]);

  /* โซนของไซต์ปลายทาง — โหลด **รายไซต์ตอนเลือกปลายทางแล้ว** ไม่ใช่ทั้งระบบ
     ⚠️ ไม่มีเส้น `/api/service/zones` ระดับบน (โซนอยู่ใต้ไซต์เสมอ) ⇒ ต้องยิง
        `/api/service/sites/[id]` ซึ่งคืนโซนของไซต์นั้นมาด้วย
     ⚠️ โซนไม่บังคับ — โหลดพลาดก็ปล่อยว่างไว้ ไม่ต้องขัดจังหวะคนที่กำลังกรอก */
  const loadZonesOf = useCallback(async (siteId) => {
    if (!siteId) { setPickerZones([]); return; }
    try {
      const res = await apiFetch(`/api/service/sites/${siteId}`);
      const body = await res.json().catch(() => null);
      setPickerZones(res.ok && Array.isArray(body?.zones) ? body.zones : []);
    } catch {
      setPickerZones([]);
    }
  }, []);

  const runMove = async (payload) => {
    setMoveBusy(true);
    try {
      const res = await apiFetch(`/api/service/assets/${id}/moves`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "บันทึกคำสั่งไม่สำเร็จ");
      setMoveKind(null);
      setToast({ kind: "success", msg: `${MOVE_LABELS[payload.kind]} เรียบร้อย` });
      await load({ background: true });
    } finally {
      setMoveBusy(false);
    }
  };

  /* ปุ่มที่โชว์ = คำสั่งที่ผ่านด่าน "เป็นเจ้าของคำสั่งนี้ไหม" เท่านั้น
     ⚠️ ตัวตัดสินตัวเดียวกับที่ API ใช้ — ถ้าสองฝั่งไม่ตรงกัน จอจะโชว์ปุ่มที่กดแล้วเด้ง */
  const moveAction = (kind, label) => (asset && !assetMoveOwnerError(asset, kind, { canEdit })
    ? { id: kind, kind: "edit", label: label || MOVE_LABELS[kind], onClick: () => setMoveKind(kind) }
    : null);

  const controlActions = asset ? [
    moveAction("install"),
    moveAction("transfer"),
    moveAction("return"),
    moveAction("repair"),
    moveAction("repair_done"),
    moveAction("condition", asset.condition === "broken" ? "แจ้งว่าซ่อมแล้ว" : "แจ้งว่าชำรุด"),
  ].filter(Boolean) : [];

  const dangerActions = asset && !assetMoveOwnerError(asset, "retire", { canEdit })
    ? [{ id: "retire", kind: "delete", label: MOVE_LABELS.retire, onClick: () => setMoveKind("retire") }]
    : [];

  const back = data?.site
    ? { href: `/service/sites/${data.site.id}`, label: naText(data.site.name) }
    : { href: '/service/assets', label: 'ทะเบียนเครื่อง' };

  if (loading) {
    return <Workspace icon={<Wrench size={20} aria-hidden="true" />} title="อุปกรณ์" back={back}><SkeletonRows rows={5} /></Workspace>;
  }
  if (loadError || !asset) {
    return (
      <Workspace icon={<Wrench size={20} aria-hidden="true" />} title="อุปกรณ์" back={back}>
        <p className="form-error" role="alert">{loadError || "ไม่พบอุปกรณ์"}</p>
      </Workspace>
    );
  }

  const { site, zone } = data;
  const perUnit = assetKindPerUnitRow(asset.kind);

  return (
    <Workspace hideHeader back={back}>
      <DetailOverview
        eyebrow={`${ASSET_KIND_LABELS[asset.kind] || asset.kind}${asset.serial ? ` · ${asset.serial}` : ""}`}
        title={asset.label}
        description={[site?.name, zone ? `โซน ${zone.name}` : null, asset.floor, asset.spot].filter(Boolean).join(" · ")}
        badges={(
          <>
            {/* 🪤 เคยเขียนสตริงสดสามทาง (`removed` → "ถอดออกแล้ว" ที่เหลือ → "ใช้งาน")
                ⇒ พอ mig 0332 เพิ่ม `in_stock` เครื่องในคลังขึ้นป้าย "ใช้งาน"
                และ mig 0335 เปลี่ยนความหมาย `removed` เป็น "ปลดระวาง" ป้ายก็ยังพูดคำเก่า
                ⇒ อ่านจากทะเบียนตัวเดียวเสมอ ห้ามเทียบสตริงเอง */}
            <span className={`ui-badge ${asset.status === "active" ? "success"
              : asset.status === "repair" ? "warning" : ""}`.trim()}>
              {ASSET_STATUS_LABELS[asset.status] || asset.status}
            </span>
            {/* สภาพเป็นแกนที่สอง — ขึ้นเฉพาะตอนชำรุด (ปกติไม่ต้องประกาศ) */}
            {asset.condition === "broken" && (
              <span className="ui-badge danger">{ASSET_CONDITION_LABELS.broken}</span>
            )}
            {asset.settings?.grade && <span className="ui-badge violet">{asset.settings.grade}</span>}
          </>
        )}
        facts={[
          { key: "setting", icon: Clock, label: "ค่าตั้งเครื่อง", value: settingText(asset.settings) },
          { key: "bottle", icon: Package, label: "ขนาดขวด", value: asset.bottleMl != null ? `${fmtNumber(asset.bottleMl)} ml` : null },
          { key: "rate", icon: Package, label: "อัตราใช้", value: asset.mlPerDay != null ? `${fmtNumber(asset.mlPerDay)} ml/วัน` : null },
          { key: "due", icon: Clock, label: "คาดว่าหมด", value: refill?.dueDate },
        ]}
      />

      {/* ⭐ บอกว่า "ต่าง" ไม่ได้บอกว่า "ผิด" — ตั้งใจให้ต่างกันก็มี (เครื่องหน้าประตู
          ต้องแรงกว่าเครื่องในห้อง) แต่ส่วนใหญ่คือไม่มีใครเห็นว่ามันต่าง */}
      {outlier && (
        <p className={styles.outlier}>
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            <b>{outlier.text}</b> — เทียบกับอีก {fmtNumber(outlier.peers)} ตัวในโซนเดียวกัน
            · ถ้าตั้งใจให้ต่างไม่ต้องแก้ ถ้าไม่ ให้ตั้งค่าใหม่รอบหน้า
          </span>
        </p>
      )}

      <DetailPageLayout
        aside={(
          <>
            {/* ⭐ ปุ่มระดับเครื่องทั้งชุดอยู่ที่เดียว (ม-49/ม-57) — ห้ามวางแยกในแถวหัว
                ⚠️ **ไม่มีสิทธิ์ = ไม่โชว์การ์ดทั้งใบ** · คำสั่งที่ไม่เข้ากับสถานะปัจจุบัน
                   ก็ไม่โชว์ (assetMoveOwnerError) เพราะมันไม่ใช่ "ติดด่านชั่วคราว"
                   แต่คือคำสั่งที่ไม่มีความหมายในสถานะนี้ · ส่วนด่านที่ผู้ใช้แก้ได้
                   (เหตุผล/ปลายทาง) ไปบอกในโมดัลตอนกด */}
            {canEdit && (
              <DocumentControlCard
                eyebrow="ASSET CONTROL"
                title="จัดการเครื่อง"
                status={ASSET_STATUS_LABELS[asset.status] || asset.status}
                statusColor={asset.status === "active" ? "var(--green)"
                  : asset.status === "in_stock" ? "var(--blue)"
                    : asset.status === "repair" ? "var(--amber)" : "var(--text-3)"}
                statusDescription={[
                  isWarehouseSite(site) ? "อยู่ในคลัง" : (site?.name ? `ติดตั้งที่ ${site.name}` : null),
                  asset.condition === "broken" ? `สภาพ${ASSET_CONDITION_LABELS.broken}` : null,
                ].filter(Boolean).join(" · ")}
                primaryAction={controlActions[0] || null}
                secondaryActions={controlActions.slice(1)}
                dangerActions={dangerActions}
                busy={moveBusy}
              />
            )}
            <ContextCard
              icon={MapPin} eyebrow="ที่ติดตั้ง" title={naText(site?.name)}
              subtitle={site?.customerName || undefined}
              facts={[
                { label: "โซน", value: zone?.name },
                { label: "ชั้น", value: asset.floor },
                { label: "จุดติดตั้ง", value: asset.spot },
                { label: "เขตวิ่งงาน", value: site?.routeZone },
              ]}
            />
            <ContextCard
              icon={Wrench} eyebrow="ทะเบียน" title={naText(asset.serial || asset.label)}
              facts={[
                { label: "ชนิด", value: ASSET_KIND_LABELS[asset.kind] || asset.kind },
                { label: "รุ่น", value: asset.model },
                { label: "สี", value: asset.colour },
                { label: perUnit ? "Serial" : "จำนวนจุด", value: perUnit ? asset.serial : (asset.qty != null ? fmtNumber(asset.qty) : null) },
                { label: "ติดตั้งเมื่อ", value: asset.installedAt },
                { label: "ถอดออกเมื่อ", value: asset.removedAt },
              ]}
            />
            {/* ⚠️ ContextCard รับ `href` ทั้งใบ ไม่มี footer — การ์ดทั้งใบเป็นลิงก์
                ไปหน้าโซน (รอบขาย · ยอดใช้จริง · ประวัติของโซนนั้น) */}
            {zone && (
              <ContextCard
                href={`/service/sites/${data.site.id}/zones/${zone.id}`}
                icon={Layers} eyebrow="โซน" title={zone.name}
                subtitle="ดูรอบขายและยอดใช้จริงของโซนนี้"
                facts={[{ label: "เครื่องในโซน", value: `${fmtNumber((data.zoneAssets || []).length)} ตัว` }]}
              />
            )}
          </>
        )}
      >
        <DetailCard icon={Clock} title={`ประวัติของเครื่องนี้ ${timeline.length} รายการ`}
          meta="ประกอบจากผลรายเครื่องตอนปิดงาน + วันติดตั้ง/ถอดในทะเบียน">
          {timeline.length === 0 ? (
            <p className={styles.muted}>ยังไม่มีร่องรอยของเครื่องนี้ — จะมีตั้งแต่ครั้งแรกที่เจ้าหน้าที่ปิดงานโดยติ๊กเครื่องนี้</p>
          ) : (
            <ul className={styles.timeline}>
              {timeline.map((row) => (
                <li key={row.key} data-kind={row.kind}>
                  <span className={styles.when}>{naText(row.date)}</span>
                  <span className={styles.what}>
                    <b>{row.label}</b>
                    {row.replacedBy && <span> → {row.replacedBy}</span>}
                    {row.detail && <span className={styles.reason}>{row.detail}</span>}
                    {row.used && <span className={styles.reason}>ใช้ไป: {row.used}</span>}
                  </span>
                  {row.visitId && (
                    <Link href={`/service/visits/${row.visitId}`} className={styles.visitLink}>ใบส่งงาน</Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DetailCard>

        <DetailCard icon={Package} title="ค่าตั้งและการประเมินวันหมด"
          meta="ค่าที่เคยอยู่แต่ในรูปถ่ายหน้าจอที่ส่งเข้าไลน์">
          <dl className={styles.specs}>
            <div><dt>ค่าตั้งเครื่อง</dt><dd>{naText(settingText(asset.settings))}</dd></div>
            <div><dt>ช่วงเวลาทำงาน</dt><dd>{naText(asset.settings?.schedule)}</dd></div>
            <div><dt>Grade</dt><dd>{naText(asset.settings?.grade)}</dd></div>
            <div><dt>ขนาดขวด</dt><dd>{asset.bottleMl == null ? naText(null) : `${fmtNumber(asset.bottleMl)} ml`}</dd></div>
            <div><dt>อัตราใช้ต่อวัน</dt><dd>{asset.mlPerDay == null ? naText(null) : `${fmtNumber(asset.mlPerDay)} ml`}</dd></div>
            {/* ⚠️ "ยังประเมินไม่ได้" ต้องพูดตรง ๆ — ป้ายใกล้หมดที่มั่วจะถูกเมินทั้งกระดาน
                ภายในสองสัปดาห์ แล้วป้ายจริงก็ถูกเมินไปด้วย */}
            <div><dt>สถานะน้ำหอม</dt><dd>{naText(refill?.label)}</dd></div>
            <div><dt>ล่าสุดเข้าเมื่อ</dt><dd>{naText(timeline.find((r) => r.visitId)?.date)}</dd></div>
            <div><dt>ชนิดงานล่าสุด</dt><dd>{naText(VISIT_KIND_LABELS[(data.visits || []).find((v) => v.id === timeline.find((r) => r.visitId)?.visitId)?.kind])}</dd></div>
          </dl>
          {asset.note && <p className={styles.note}>{asset.note}</p>}
        </DetailCard>
      </DetailPageLayout>

      <AssetMoveModal
        open={!!moveKind}
        kind={moveKind}
        asset={asset}
        fromSite={site}
        sites={pickerSites}
        zones={pickerZones}
        busy={moveBusy}
        onClose={() => !moveBusy && setMoveKind(null)}
        onToSite={loadZonesOf}
        onSubmit={runMove}
      />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
