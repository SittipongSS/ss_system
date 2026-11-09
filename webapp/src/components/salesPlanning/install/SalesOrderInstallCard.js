"use client";
// ── การ์ด "ติดตั้ง · เข้าบริการ" บนหน้าใบสั่งขาย (ขั้นเข้าติดตั้ง PR-2b · ม็อก A1 · mig 0425) ──────────────────
//
// ⭐ มติเจ้าของ 02/11 + 09/11/2026: ฝ่ายขายตอบรายไซต์ "ติดตั้ง / Service" แล้วขอคิวติดตั้งรายไซต์
//    · ก่อนติดตั้งมีด่านเดียว = งวด "ก่อนติดตั้ง" ที่บัญชีรับรอง (บรรทัดบนสุดของการ์ด)
//    · สัญญาทำหลังทุกไซต์ที่เลือกติดตั้งเสร็จ (ราย SO) — การ์ดชี้ ไม่ล็อก
// ⚠️ ทุกค่าที่จอโชว์มาจาก GET `/api/sales-planning/sales-orders/[id]/install` (ขั้นคำนวณที่ installQueue ฝั่ง server) ·
//    ด่านปุ่มถามตัวเดียวกับ API (`installOrderError` · `installModeError`) — ปุ่มกับ API ตอบคำเดียวกัน
// ⚠️ ไม่มีค่าตั้งต้นของโหมด — ไซต์ที่ยังไม่ตอบขึ้นว่ายังไม่เลือก (กติกาฟอร์ม: การตัดสินใจไม่มีค่าตั้งต้น)
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Wrench } from "lucide-react";
import { DetailCard } from "@/components/ui/DetailPage";
import Button from "@/components/ui/Button";
import Segmented from "@/components/ui/Segmented";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { apiJson } from "@/lib/apiFetch";
import { notifyToast } from "@/lib/feedback";
import { fmtDate } from "@/lib/format";
import { INSTALL_MODE_LABELS, INSTALL_MODES, installModeError } from "@/lib/service/installRequest";
import { INSTALL_DEPOSIT_TEXT } from "@/lib/service/installDeposit";
import InstallRequestModal from "./InstallRequestModal";
import styles from "./SalesOrderInstallCard.module.css";

/* สีของขั้น — งานของคนอื่นที่ยังรอ = warning · ถึงคิวช่าง/เสร็จ = success · Service = info */
const STAGE_TONE = Object.freeze({
  undecided: "neutral", not_requested: "neutral", awaiting_deposit: "warning", awaiting_ts: "warning",
  awaiting_customer: "warning", confirmed: "info", installed: "success", service: "info",
});

const timeText = (start, end) => (start && end ? `${String(start).slice(0, 5)}–${String(end).slice(0, 5)}` : "ทั้งวัน");

function siteSubline(site) {
  const r = site.request;
  if (!r) return "ยังไม่ตอบว่าติดตั้งหรือ Service";
  if (r.mode === "none") return "เครื่องอยู่แล้ว · ไม่เข้าคิวติดตั้ง";
  if (!r.requestedAt) return "เลือกติดตั้งแล้ว · ยังไม่ขอคิว";
  const asked = `ต้องการ ${fmtDate(r.requestedDate)} ${timeText(r.requestedStartTime, r.requestedEndTime)}`;
  const zones = site.zones.filter((z) => z.requested).length;
  const contact = [r.contactName, r.contactPhone].filter(Boolean).join(" ");
  return [asked, `${zones} โซน`, contact || null].filter(Boolean).join(" · ");
}

export default function SalesOrderInstallCard({ orderId, onChanged }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busySite, setBusySite] = useState("");
  const [error, setError] = useState("");
  const [askFor, setAskFor] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoadError("");
      setData(await apiJson(`/api/sales-planning/sales-orders/${orderId}/install`, { fallbackError: "โหลดงานติดตั้งไม่สำเร็จ" }));
    } catch (e) {
      setLoadError(e?.message || "โหลดงานติดตั้งไม่สำเร็จ");
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  if (loadError) {
    return (
      <DetailCard icon={Wrench} eyebrow="INSTALLATION" title="ติดตั้ง · เข้าบริการ">
        <StatusNotice tone="error" action={<Button size="sm" variant="ghost" onClick={load}>ลองใหม่</Button>}>{loadError}</StatusNotice>
      </DetailCard>
    );
  }
  if (!data) return null;
  /* สวิตช์ปิด = ไม่มีการ์ด (ทั้งเส้นยังไม่เปิดใช้) · ใบที่ไม่มีไซต์ในงานบริการ = ไม่มีอะไรให้ติดตั้ง */
  if (!data.enabled || !data.sites?.length) return null;

  const writable = !data.blocker;
  const decided = data.sites.filter((s) => s.mode).length;

  async function chooseMode(site, mode) {
    setError("");
    setBusySite(site.siteId);
    try {
      await apiJson(`/api/sales-planning/sales-orders/${orderId}/install`, {
        method: "PUT", json: { siteId: site.siteId, mode }, fallbackError: "บันทึกไม่สำเร็จ",
      });
      notifyToast.success(mode === "install" ? `${site.siteCode || "ไซต์"}: ติดตั้ง — ขอคิวติดตั้งได้เลย` : `${site.siteCode || "ไซต์"}: Service · ไม่เข้าคิวติดตั้ง`);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e?.message || "บันทึกไม่สำเร็จ");
      await load();
    } finally {
      setBusySite("");
    }
  }

  const deposit = data.deposit || {};
  return (
    <DetailCard
      id="install"
      icon={Wrench}
      eyebrow="INSTALLATION"
      title="ติดตั้ง · เข้าบริการ"
      meta={`ตอบแล้ว ${decided}/${data.sites.length} ไซต์`}
    >
      <p className={styles.lead}>
        ไซต์ละหนึ่งคำตอบ: ติดตั้งเครื่องใหม่ หรือ Service เพราะเครื่องอยู่แล้ว · ติดตั้ง: ขอคิว › TS ยืนยันวัน › คอนเฟิร์มลูกค้า
      </p>
      {data.blocker && data.canEdit ? <StatusNotice tone="info" className={styles.notice}>{data.blocker}</StatusNotice> : null}
      {error ? <StatusNotice tone="error" className={styles.notice}>{error}</StatusNotice> : null}

      <div className={styles.deposit} data-state={deposit.state}>
        <span className={styles.depositLabel}>ก่อนติดตั้ง</span>
        <span className={styles.depositText}>
          {deposit.state === "blocked" ? deposit.reason : (deposit.detail || "มัดจำก่อนติดตั้งบัญชีรับรองครบแล้ว")}
        </span>
        <StatusBadge size="sm" tone={deposit.state === "blocked" ? "warning" : "success"} label={deposit.state === "blocked" ? "ยังไม่ผ่าน · SA → FN" : "ผ่าน"} title={INSTALL_DEPOSIT_TEXT.label} />
      </div>

      <ul className={styles.sites} aria-label="ไซต์ของใบสั่งขายนี้">
        {data.sites.map((site) => {
          const lockReason = (mode) => installModeError({
            mode, request: site.request, visits: site.hasPendingVisit ? [{ installRequestId: site.request?.id, status: "draft" }] : [],
          });
          const canAsk = writable && site.mode !== "none";
          const asked = Boolean(site.request?.requestedAt);
          const tsConfirmed = site.zones.some((z) => z.visit?.tsConfirmedAt);
          return (
            <li key={site.siteId} className={styles.site}>
              <div className={styles.siteName}>
                <span className={styles.code}>{site.siteCode || site.siteId}</span>
                <b>{site.siteName || "ไซต์"}</b>
                <small>{site.zones.length} โซน · {site.zones.map((z) => z.name).filter(Boolean).join(" · ")}</small>
              </div>
              <div className={styles.siteMode}>
                <Segmented
                  ariaLabel={`ติดตั้งหรือ Service · ${site.siteCode || site.siteId}`}
                  selection="radio"
                  /* ⚠️ ลูกศรย้ายโฟกัสอย่างเดียว — เลือก = บันทึกทันที ห้ามให้กดลูกศรผ่านแล้วเขียนฐาน */
                  activationMode="manual"
                  value={site.mode || null}
                  onChange={(mode) => { if (mode && mode !== site.mode) chooseMode(site, mode); }}
                  options={INSTALL_MODES.map((mode) => ({
                    value: mode,
                    label: mode === "install" ? "ติดตั้ง" : "Service",
                    disabled: !writable || busySite === site.siteId || Boolean(lockReason(mode)),
                    title: lockReason(mode) || INSTALL_MODE_LABELS[mode],
                  }))}
                />
                {!site.mode ? <small className={styles.pending}>ยังไม่เลือก</small> : null}
              </div>
              <div className={styles.siteState}>
                <StatusBadge size="sm" dot tone={STAGE_TONE[site.stage] || "neutral"} label={
                  site.stage === "installed" ? `ติดตั้งแล้ว ${site.installed}/${site.total} โซน` : site.stageLabel
                } />
                <small>{siteSubline(site)}</small>
                {site.zones.filter((z) => z.visit?.tsConfirmedAt).slice(0, 2).map((z) => (
                  <small key={z.zoneId} className={styles.visit}>
                    <CalendarClock size={13} aria-hidden="true" />
                    {z.name}: TS ยืนยัน {fmtDate(z.visit.scheduledDate)} {timeText(z.visit.startTime, z.visit.endTime)}
                    {z.visit.dateChangeReason ? ` · ปรับวันเพราะ ${z.visit.dateChangeReason}` : ""}
                  </small>
                ))}
              </div>
              <div className={styles.siteAct}>
                {canAsk ? (
                  <Button
                    size="sm"
                    variant={asked ? "ghost" : "primary"}
                    disabled={tsConfirmed}
                    title={tsConfirmed ? "TS ยืนยันวันแล้ว — เปลี่ยนวันผ่านขั้นคอนเฟิร์มลูกค้า" : undefined}
                    onClick={() => { setError(""); setAskFor(site); }}
                  >
                    {asked ? "แก้คำขอ" : "ขอคิวติดตั้ง"}
                  </Button>
                ) : null}
                {tsConfirmed ? <small className={styles.why}>TS ยืนยันวันแล้ว</small> : null}
              </div>
            </li>
          );
        })}
      </ul>

      {data.readiness ? (
        <p className={styles.readiness}>
          สัญญา (ราย SO):{" "}
          {data.readiness.ready
            ? "ติดตั้งครบทุกไซต์แล้ว — ออกสัญญาที่แท็บสัญญา"
            : `ทำเมื่อติดตั้งครบทุกไซต์ · ครบ ${data.readiness.done}/${data.readiness.total}${data.readiness.undecided ? ` · ยังไม่ตอบ ${data.readiness.undecided} ไซต์` : ""}`}
        </p>
      ) : null}

      {askFor ? (
        <InstallRequestModal
          orderId={orderId}
          site={askFor}
          deposit={deposit}
          todayIso={data.todayIso}
          onClose={() => setAskFor(null)}
          onSaved={async () => { setAskFor(null); await load(); onChanged?.(); }}
        />
      ) : null}
    </DetailCard>
  );
}
