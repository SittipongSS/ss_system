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
  AlertTriangle, Camera, ClipboardList, Clock, MapPin, MessageCircleQuestion, PenLine, Printer, Wrench,
} from "lucide-react";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Workspace from "@/components/ui/Workspace";
import DetailOverview from "@/components/ui/DetailOverview";
import { ContextCard, DetailCard, DetailPageLayout } from "@/components/ui/DetailPage";
import StatusNotice from "@/components/ui/StatusNotice";
import { buildVisitReport } from "@/lib/service/visitReport";
import { isClosedVisit, isDraftVisit, isOpenVisit } from "@/lib/service/visitStatus";
import { SURVEY_VISIT_KIND } from "@/lib/service/surveyVisit";
import { canDoFieldWork, canEditService } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { fmtDate, fmtNumber, naText } from "@/lib/format";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

/* flag ที่มีความหมายเฉพาะใบที่ปิดแล้ว — ระหว่างทำยังไม่ถึงจังหวะเซ็น/ถ่ายรูปส่งงาน */
const CLOSE_ONLY_FLAGS = new Set(["no_signature", "no_photo"]);

export default function VisitReportPage({ params }) {
  const { id } = use(params);
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const [data, setData] = useState(null);
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // 404 ≠ โหลดพัง — ใบที่ไม่มีต้องบอกคนละอย่างกับเน็ตสะดุด (อันหลังกดลองใหม่ได้) · ทรงเดียวกับหน้าเครื่อง
  const [notFound, setNotFound] = useState(false);

  const startRun = useLatestRun();
  const load = useCallback(async (opts) => {
    const isLatest = startRun();
    if (!opts?.background) setLoading(true);
    setLoadError("");
    try {
      const res = await apiFetch(`/api/service/visits/${id}`);
      const body = await res.json().catch(() => null);
      if (!isLatest()) return;
      // รอบเบื้องหลังที่ล้มต้องเงียบ — ไม่พลิกใบที่อ่านอยู่เป็น "ไม่พบ"
      if (!opts?.background) setNotFound(res.status === 404);
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
    /* ⭐ รวมเครื่องที่นัดนี้แตะแต่ย้ายออกไปแล้ว (`resultAssets`) — นัดถอนเครื่องที่ปิดแล้ว
       ทุกเครื่องไม่มีไซต์ ⇒ ไม่รวม = ใบส่งงานของนัดถอนว่างทั้งใบ */
    visit: data.visit, site, zones: data.zones, assets: [...(data.assets || []), ...(data.resultAssets || [])],
    results: data.results, items: data.items,
    // ผลด่านรายโซนจาก server — ใบส่งงานตัดโซนที่งดบริการพร้อมเหตุ
    zoneGates: data.zoneGates,
  }) : null), [data, site]);

  /* ย้อนกลับไปเมนูที่คนดูมีจริง — เจ้าหน้าที่หน้างาน (ไม่มีเมนูจัดคิว) กลับ "งานวันนี้"
     ซึ่งเป็นที่ที่เขากดปุ่ม "ใบส่งงาน" มา · คนอื่นกลับหน้าจัดคิวเหมือนเดิม */
  const back = useMemo(() => {
    const user = { role, team, teams, department };
    return canDoFieldWork(user) && !canEditService(user)
      ? { href: "/service/today", label: "งานวันนี้" }
      : { href: "/service/schedule", label: "จัดคิวเจ้าหน้าที่" };
  }, [role, team, teams, department]);

  /* ⭐ เปลือกโหลด/ไม่พบ/พัง เป็น hideHeader เหมือนหน้าที่โหลดเสร็จ — ทรงเดียวกันทั้งสี่หน้า
     (เครื่อง · ไซต์ · โซน · ใบส่งงาน) · ลำดับ: ไม่พบ (404) มาก่อนโหลดพัง
     🐞 เดิม `!res.ok` โยนทิ้งทุกกรณี ⇒ ใบที่ถูกลบขึ้น "โหลดใบส่งงานไม่สำเร็จ" + ปุ่มลองใหม่
        อ่านเหมือนเน็ตสะดุดที่กดซ้ำแล้วจะหาย · สาขา "ไม่พบ" ไม่เคยถูกเรียกเลย */
  /* ♿ hideHeader ถอด h1 ของ Workspace ออกด้วย — ใบที่โหลดเสร็จได้ h1 จาก DetailOverview
     แต่สามเปลือกนี้ไม่มีหัวเรื่องเลย ⇒ h1 ซ่อนตา (sr-only) ชื่อเดียวกับการ์ดหัวเดิม · หน้าตาไม่เปลี่ยน */
  const shell = (body) => (
    <Workspace hideHeader back={back}>
      <h1 className="sr-only">ใบส่งงาน</h1>
      {body}
    </Workspace>
  );
  if (loading) return shell(<SkeletonRows rows={5} />);
  if (notFound || (!loadError && !report)) {
    return shell(
      <EmptyState icon={ClipboardList}>
        ไม่พบใบส่งงานนี้
        <small>อาจถูกลบไปแล้ว หรือรหัสในลิงก์ไม่ถูกต้อง</small>
      </EmptyState>,
    );
  }
  if (loadError) {
    return shell(
      <StatusNotice tone="error" title="โหลดใบส่งงานไม่สำเร็จ"
        action={<Button size="sm" onClick={() => load()}>ลองใหม่</Button>}>
        {loadError}
      </StatusNotice>,
    );
  }

  const visit = data.visit;
  const headValue = (label) => report.head.find((h) => h.label === label)?.value;
  // วันที่ต้องผ่าน fmtDate — ทั้งระบบใช้ DD/MM/YYYY (🐞 เดิมขึ้น ISO "2026-09-14" บนใบที่พิมพ์ส่ง)
  const dateText = headValue("วันที่") ? fmtDate(headValue("วันที่")) : null;
  /* นัดประเมินพื้นที่ไม่มีผลรายเครื่อง — งานจริงอยู่ที่ใบประเมิน ⇒ การ์ดอุปกรณ์ที่ว่าง
     กับ "อุปกรณ์ที่ทำ 0 / 0" ไม่บอกอะไร (มีบรรทัดเมื่อไรก็กลับมาแสดงเอง) */
  const isSurvey = visit.kind === SURVEY_VISIT_KIND;
  const hideAssets = isSurvey && report.lines.length === 0;
  /* ⚠️ ตัดที่จอเท่านั้น — reportFlags ยังเป็นตัวตัดสินกระดิ่ง (shouldPushReport)
     🐞 เดิมนัดที่ "กำลังทำ" ขึ้นแถบเหลือง "ไม่มีลายเซ็น/ไม่มีรูป" อ่านเหมือนใบมีปัญหา */
  const flags = isClosedVisit(visit) ? report.flags : report.flags.filter((f) => !CLOSE_ONLY_FLAGS.has(f.kind));
  /* แถบนี้เหลือเฉพาะของที่ไม่อยู่ใน "รายละเอียดงาน"
     🐞 เดิมมีเขตวิ่งงาน + ช่วงที่เข้าได้ซ้ำกับการ์ดล่าง — มือถือกางช่องละแถว
     จอแรกจึงเห็นแต่หัวใบ เนื้อใบไปเริ่มใต้แถบเมนูล่าง
     🐞 นัดประเมินพื้นที่ (ไม่มีช่องอุปกรณ์) เหลือช่องเดียว "เวลาที่เข้าจริง" ยืดเต็มการ์ด
        แล้วซ้ำแถว "เวลา" ที่อยู่ใต้ลงไปไม่กี่พิกเซล ⇒ เหลือช่องเดียวเมื่อไร ไม่ต้องมีแถบ */
  const overviewFacts = [
    { key: "time", icon: Clock, label: "เวลาที่เข้าจริง", value: headValue("เวลา") },
    ...(hideAssets ? [] : [
      { key: "assets", icon: Wrench, label: "อุปกรณ์ที่ทำ", value: `${report.lines.filter((l) => l.outcome !== "unable").length} / ${report.lines.length}` },
    ]),
  ];

  return (
    <Workspace hideHeader back={back}>
      <DetailOverview
        eyebrow={`ใบส่งงาน · ${report.code}`}
        title={site?.name || visit.siteId}
        description={[dateText, headValue("งาน"), visit.assigneeName].filter(Boolean).join(" · ")}
        badges={<span className={`ui-badge ${visit.status === "done" ? "success" : visit.status === "unable" ? "danger" : "warning"}`}>{report.statusLabel}</span>}
        actions={(
          <Button tone="neutral" onClick={() => window.print()} icon={<Printer size={15} aria-hidden="true" />}>
            พิมพ์ / บันทึก PDF
          </Button>
        )}
        facts={overviewFacts.length > 1 ? overviewFacts : []}
      />

      {/* ⭐ แถบ "ต้องดู" — ชั้นเดียวกับที่ตัดสินว่าใบไหนถูกดันขึ้นกระดิ่ง
          ใบปกติจะไม่มีแถบนี้เลย · ถ้าดันทุกใบ หัวหน้าจะปิดแจ้งเตือนภายในสัปดาห์เดียว */}
      {flags.length > 0 && (
        <section className={styles.flags} aria-label="สิ่งที่ต้องดู">
          {flags.map((flag) => (
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
            {/* นัดประเมินพื้นที่ — ผลหน้างานจริงบันทึกที่ใบประเมิน (ใบคำร้อง) ต้องไปถึงได้จากใบนี้ */}
            {isSurvey && visit.requestId && (
              <ContextCard
                href={`/service/surveys/${visit.requestId}`}
                icon={MessageCircleQuestion} eyebrow="ประเมินพื้นที่" title="ผลบันทึกหน้างาน"
                subtitle={visit.note || undefined}
              />
            )}
            {/* เขตวิ่งงานอยู่ในแถว "ไซต์" ของรายละเอียดงานแล้ว · การ์ดหลักฐานเดิมซ้ำการ์ด
                "หลักฐานหน้างาน" ส่วนเวลาที่แก้ย้อนหลังขึ้นในแถบต้องดูอยู่แล้ว */}
            <ContextCard
              href={`/service/sites/${visit.siteId}`}
              icon={MapPin} eyebrow="ไซต์" title={site?.name || visit.siteId}
              subtitle={site?.customerName || undefined}
              facts={[
                { label: "รหัสไซต์", value: site?.code },
                { label: "ผู้ติดต่อ", value: site?.contactName },
              ]}
            />
          </>
        )}
      >
        {/* 🐞 จอ 320 บรรทัดนี้ขาดกลางคำ "เจ้า|หน้าที่ไม่ได้พิมพ์" — ICU ตัดคำประสมไทยแท้ได้
            และ thaiText ดูแลเฉพาะคำทับศัพท์ ⇒ ตรึงวลีท้ายไว้ด้วยกัน บรรทัดจะตัดที่ "— " แทน */}
        <DetailCard icon={ClipboardList} title="รายละเอียดงาน"
          meta={<>ทุกบรรทัดในส่วนนี้ระบบดึงจากทะเบียน — <span className={styles.keepTogether}>เจ้าหน้าที่ไม่ได้พิมพ์</span></>}>
          <dl className={styles.head}>
            {report.head.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{naText(row.label === "วันที่" && row.value ? dateText : row.value)}</dd>
              </div>
            ))}
          </dl>
        </DetailCard>

        {!hideAssets && (
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
        )}

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

        {/* 🐞 ประโยคหลังชี้ไปที่แถบ "สิ่งที่ต้องดู" ซึ่งนัดที่ยังไม่ปิดไม่มี (flag ไม่มีรูป/ลายเซ็น
            ขึ้นเฉพาะใบที่ปิดแล้ว — CLOSE_ONLY_FLAGS ข้างบน) ⇒ ใบที่ยังทำอยู่บอกว่าแนบได้ตอนไหนแทน
            (ช่องรูปหน้างาน/ลายเซ็นผู้รับงานอยู่ในชีตปิดงาน — CloseVisitSheet) */}
        {/* 🐞 รอบก่อนแยกแค่ปิด/ไม่ปิด ⇒ ใบ "ยกเลิก"/"เลื่อนแล้ว" ขึ้น "แนบได้ตอนปิดงาน"
            ทั้งที่ใบพวกนั้นไม่มีวันถูกปิด · ร่างยังเดินต่อไปถึงปิดงานได้ (ผ่านด่านแล้วเป็นนัดไว้) */}
        <DetailCard icon={Camera} title="หลักฐานหน้างาน"
          meta={isClosedVisit(visit)
            ? "รูปและลายเซ็นไม่บังคับ — แต่ใบที่ขาดจะขึ้นในสิ่งที่ต้องดู"
            : isOpenVisit(visit) || isDraftVisit(visit)
              ? "รูปและลายเซ็นไม่บังคับ — แนบได้ตอนปิดงาน"
              : "รูปและลายเซ็นไม่บังคับ"}>
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
