"use client";
// ── ใบส่งงาน (F-5) ────────────────────────────────────────────────────────
//
// ⭐ ที่มา: เจ้าหน้าที่พิมพ์ข้อความ 20 บรรทัดส่ง LINE ทุกครั้ง แล้วแท็กหัวหน้า 4 คนท้ายใบ —
// **90% ของข้อความนั้นคือข้อมูลที่อยู่ในทะเบียนอยู่แล้ว** (ชื่อไซต์ · ชนิดงาน · กลิ่น ·
// จำนวนเครื่องแยกรุ่นแยกสี · ตำแหน่ง · ค่าตั้ง · ช่วงเวลาที่เข้าได้)
// ⇒ ระบบประกอบใบให้เอง เจ้าหน้าที่เขียนแค่ **สรุปงาน** กับ **เหตุผลของสิ่งที่ผิดปกติ**
//
// ⚠️ หน้านี้ยัง**ไม่ใช่ลิงก์สาธารณะ** — คนที่เปิดได้คือคนที่ผ่าน canViewService
// (การแชร์ให้ลูกค้าต้องมีโทเคน = migration ซึ่งอยู่นอกขอบเขต F-5) · ปุ่มพิมพ์ใช้
// หน้าต่างพิมพ์ของเบราว์เซอร์ เพราะใบนี้เป็นเอกสารภายใน ไม่ใช่เอกสารที่ต้องตรึงเลข
import { use, useCallback, useEffect, useMemo, useState } from "react";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import useLatestRun from "@/lib/ui/useLatestRun";
import {
  AlertTriangle, Camera, CheckCircle2, ClipboardList, Clock, MapPin, PenLine, Printer, Wrench,
} from "lucide-react";
import Button from "@/components/ui/Button";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import DetailOverview from "@/components/ui/DetailOverview";
import { ContextCard, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import { buildVisitReport } from "@/lib/service/visitReport";
import { accessWindowText } from "@/lib/service/sites";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

export default function VisitReportPage({ params }) {
  const { id } = use(params);
  const [data, setData] = useState(null);
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`/api/service/visits/${id}`);
      const body = await res.json().catch(() => null);
      if (!isLatest()) return;
      if (!res.ok) throw new Error(body?.error || "โหลดใบส่งงานไม่สำเร็จ");
      setData(body);
      // ไซต์ยิงแยกเพราะ GET นัดคืนแค่ของที่อยู่ใต้ไซต์ ไม่ได้คืนตัวไซต์เอง
      const siteRes = await apiFetch(`/api/service/sites/${body.visit.siteId}`);
      const siteBody = await siteRes.json().catch(() => null);
      if (isLatest() && siteRes.ok) setSite(siteBody?.site || null);
    } catch (e) {
      // ⚠️ ห้ามกลืน error เป็นใบเปล่า — "โหลดพัง" กับ "ยังไม่ได้ปิดงาน" คนละเรื่อง
      if (isLatest() && !opts?.background) setLoadError(e.message || "โหลดใบส่งงานไม่สำเร็จ");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [id, startRun]);
  useEffect(() => { load(); }, [load]);
  useRevalidateOnFocus(load);

  const report = useMemo(() => (data ? buildVisitReport({
    visit: data.visit, site, zones: data.zones, assets: data.assets,
    results: data.results, items: data.items,
    // ผลด่านรายโซนจาก server — ใบส่งงานตัดโซนที่งดบริการพร้อมเหตุ
    zoneGates: data.zoneGates,
  }) : null), [data, site]);

  const back = { href: "/service/schedule", label: "จัดคิวเจ้าหน้าที่" };

  if (loading) {
    return <Workspace icon={<ClipboardList size={20} aria-hidden="true" />} title="ใบส่งงาน" back={back}><SkeletonRows rows={5} /></Workspace>;
  }
  if (loadError || !report) {
    return (
      <Workspace icon={<ClipboardList size={20} aria-hidden="true" />} title="ใบส่งงาน" back={back}>
        <p className="form-error" role="alert">{loadError || "ไม่พบใบส่งงาน"}</p>
      </Workspace>
    );
  }

  const visit = data.visit;

  return (
    <Workspace hideHeader back={back}>
      <DetailOverview
        eyebrow={`ใบส่งงาน · ${report.code}`}
        title={site?.name || visit.siteId}
        description={[
          report.head.find((h) => h.label === "วันที่")?.value,
          report.head.find((h) => h.label === "งาน")?.value,
          visit.assigneeName,
        ].filter(Boolean).join(" · ")}
        badges={<span className={`ui-badge ${visit.status === "done" ? "success" : visit.status === "unable" ? "danger" : "warning"}`}>{report.statusLabel}</span>}
        actions={(
          <Button tone="neutral" onClick={() => window.print()} icon={<Printer size={15} aria-hidden="true" />}>
            พิมพ์ / บันทึก PDF
          </Button>
        )}
        facts={[
          { key: "time", icon: Clock, label: "เวลาที่เข้าจริง", value: report.head.find((h) => h.label === "เวลา")?.value },
          { key: "assets", icon: Wrench, label: "อุปกรณ์ที่ทำ", value: `${report.lines.filter((l) => l.outcome !== "unable").length} / ${report.lines.length}` },
          { key: "zone", icon: MapPin, label: "เขตวิ่งงาน", value: site?.routeZone },
          { key: "access", icon: Clock, label: "ช่วงที่เข้าได้", value: accessWindowText(site) },
        ]}
      />

      {/* ⭐ แถบ "ต้องดู" — ชั้นเดียวกับที่ตัดสินว่าใบไหนถูกดันขึ้นกระดิ่ง
          ใบปกติจะไม่มีแถบนี้เลย · ถ้าดันทุกใบ หัวหน้าจะปิดแจ้งเตือนภายในสัปดาห์เดียว */}
      {report.flags.length > 0 && (
        <section className={styles.flags} aria-label="สิ่งที่ต้องดู">
          {report.flags.map((flag) => (
            /* ⚠️ โทนส่งผ่าน data-tone ไม่ใช่ style={{}} — ratchet ของ audit:ui นับ
               inline style เป็นชั้นเก่าและขึ้นไม่ได้ (แพตเทิร์นเดียวกับ .line[data-outcome]) */
            <p key={flag.kind} className={styles.flag} data-tone={flag.tone}>
              <AlertTriangle size={14} aria-hidden="true" />
              <span><b>{flag.label}</b>{flag.detail ? ` — ${flag.detail}` : ""}</span>
            </p>
          ))}
        </section>
      )}

      <DetailPageLayout
        aside={(
          <>
            <ContextCard
              icon={MapPin} eyebrow="ไซต์" title={site?.name || visit.siteId}
              subtitle={site?.customerName || undefined}
              facts={[
                { label: "รหัสไซต์", value: site?.code },
                { label: "เขตวิ่งงาน", value: site?.routeZone },
                { label: "ผู้ติดต่อ", value: site?.contactName },
              ]}
            />
            <ContextCard
              icon={CheckCircle2} eyebrow="หลักฐาน" title="ที่แนบมากับใบนี้"
              facts={[
                { label: "รูปหน้างาน", value: report.attachments.length ? `${report.attachments.length} รูป` : null },
                { label: "ลายเซ็นผู้รับงาน", value: report.signatureUrl ? "มี" : null },
                { label: "เวลาที่ประทับ", value: visit.actualTimeEdited ? "แก้ย้อนหลังแล้ว" : "จากระบบ" },
              ]}
            />
          </>
        )}
      >
        <DetailCard icon={ClipboardList} title="รายละเอียดงาน"
          meta="ทุกบรรทัดในส่วนนี้ระบบดึงจากทะเบียน — เจ้าหน้าที่ไม่ได้พิมพ์">
          <dl className={styles.head}>
            {report.head.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{naText(row.value)}</dd>
              </div>
            ))}
          </dl>
        </DetailCard>

        <DetailCard icon={Wrench} title={`อุปกรณ์ ${report.lines.length} รายการ`}
          meta="ผลรายเครื่องที่เจ้าหน้าที่ติ๊กตอนปิดงาน">
          {report.lines.length === 0 ? (
            <p className={styles.muted}>นัดนี้ไม่ได้ผูกกับอุปกรณ์รายตัว</p>
          ) : report.lines.map((line) => (
            <div key={line.assetId} className={styles.line} data-outcome={line.outcome}>
              <div className={styles.lineHead}>
                <b>{line.label}</b>
                {/* ⭐ โซนที่ไม่ผ่านด่าน = "งดบริการ" (PR-C) — แถวยังอยู่บนใบเพราะ
                    เจ้าหน้าที่ต้องรู้ว่ามีเครื่องอยู่ตรงนั้น แต่ต้องเห็นชัดว่าห้ามทำ
                    ⚠️ ซ่อนแถวทิ้งไม่ได้ — จะอ่านเหมือนไซต์นี้ไม่มีเครื่องตัวนั้น */}
                {line.suspended && <span className="ui-badge danger">งดบริการ</span>}
                <span className={`ui-badge ${line.outcome === "done" ? "success" : line.outcome === "unable" ? "danger" : "violet"}`}>
                  {line.outcomeLabel}
                </span>
              </div>
              <p className={styles.lineMeta}>{naText([line.where, line.spec].filter(Boolean).join(" · "))}</p>
              {line.suspendedReason && <p className={styles.lineNote}>{line.suspendedReason}</p>}
              {line.replacedBy && <p className={styles.lineNote}>เปลี่ยนเป็น <b>{line.replacedBy}</b></p>}
              {line.reason && <p className={styles.lineNote}>{line.reason}</p>}
              {line.used.length > 0 && (
                <p className={styles.lineUsed}>
                  ใช้ไป: {line.used.map((u) => `${u.label}${u.qty != null ? ` ${fmtNumber(u.qty)}${u.unit ? ` ${u.unit}` : ""}` : ""}`).join(" · ")}
                </p>
              )}
            </div>
          ))}
        </DetailCard>

        {report.sharedItems.length > 0 && (
          <DetailCard icon={ClipboardList} title="ของที่ใช้กับทั้งไซต์"
            meta="บันทึกไว้เป็นหลักฐาน — ระบบไม่ตัดสต็อกและไม่ออกบิลจากรายการนี้">
            <ul className={styles.shared}>
              {report.sharedItems.map((item) => (
                <li key={item.id}>
                  {item.label}
                  <span>{item.qty == null ? naText(null) : `${fmtNumber(item.qty)}${item.unit ? ` ${item.unit}` : ""}`}</span>
                </li>
              ))}
            </ul>
          </DetailCard>
        )}

        {/* ⭐ ส่วนเดียวของใบที่เจ้าหน้าที่พิมพ์เอง — แยกให้เห็นชัดว่านี่คือคำพูดของคน
            ไม่ใช่ของที่ระบบประกอบ (หัวหน้าอ่านย้อนแล้วต้องแยกออก) */}
        {(report.summary || report.unableReason) && (
          <DetailCard icon={PenLine} title="สรุปโดยเจ้าหน้าที่" meta="ส่วนที่เจ้าหน้าที่เขียนเอง">
            {report.unableReason && <p className={styles.authored}>{report.unableReason}</p>}
            {report.summary && <p className={styles.authored}>{report.summary}</p>}
          </DetailCard>
        )}

        <DetailCard icon={Camera} title="หลักฐานหน้างาน"
          meta="รูปและลายเซ็นไม่บังคับ — แต่ใบที่ขาดจะขึ้นในสิ่งที่ต้องดู">
          <div className={styles.photos}>
            {report.attachments.map((att) => (
              <a key={att.url} href={att.url} target="_blank" rel="noreferrer noopener" className={styles.photo}>
                {att.kind === "before" ? "ก่อน" : att.kind === "after" ? "หลัง" : "รูป"}
              </a>
            ))}
            {report.signatureUrl && (
              <a href={report.signatureUrl} target="_blank" rel="noreferrer noopener" className={styles.photo}>
                ลายเซ็น
              </a>
            )}
            {report.attachments.length === 0 && !report.signatureUrl && (
              <p className={styles.muted}>ไม่มีรูปและลายเซ็นในใบนี้</p>
            )}
          </div>
        </DetailCard>
      </DetailPageLayout>
    </Workspace>
  );
}
