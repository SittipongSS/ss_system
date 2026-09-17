"use client";
// ── นำเข้าข้อมูลเก่าเข้าทะเบียนไซต์ (F-8) ──────────────────────────────────
//
// ⭐ **ที่มา**: ไซต์บริการของจริงมี 379 แห่งอยู่ในไฟล์ Excel ที่ทีมใช้กันมาหลายปี
//   ถ้าต้องคีย์มือทีละแห่ง (ไซต์ → โซน → เครื่องทีละตัว) ระบบจะไม่มีวันถูกใช้จริง
//
// ⚠️ **กติกาของหน้านี้: ตรวจก่อนเสมอ ไม่มีปุ่มนำเข้าที่ยังไม่ได้ดูผล**
//   ระบบไม่มีถังขยะ (deleted-data-recovery) — สร้าง 800 แถวผิดแล้วต้องไล่ลบมือ
//   ทีละแถว ⇒ พรีวิวไม่ใช่ของประดับ มันคือด่านเดียวที่มี
//
// ⚠️ แถวที่นำเข้าไม่ได้ **ไม่เงียบและไม่ถูกยัดลงฐานครึ่ง ๆ กลาง ๆ** — ออกเป็น
//   รายงานให้เอาไปแก้ในชีตแล้วอัปโหลดซ้ำได้ (แถวที่เข้าไปแล้วรอบสองจะขึ้น "มีอยู่แล้ว")
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Columns3, Download, FileSpreadsheet, ListChecks, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import StatusBadge from "@/components/ui/StatusBadge";
import Textarea from "@/components/ui/Textarea";
import Toast from "@/components/ui/Toast";
import Workspace, { Metric, MetricStrip, WorkspaceSection } from "@/components/ui/Workspace";
import { TableScroll } from "@/components/ui/Table";
import { IMPORT_FIELDS } from "@/lib/service/importSheet";
import { canImportServiceData } from "@/lib/permissions";
import { useDepartment, useRole, useTeam, useTeams } from "@/lib/roleContext";
import { fmtNumber, naText } from "@/lib/format";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

const STATUS_LABEL = { ok: "จะสร้าง", skip: "มีอยู่แล้ว", error: "นำเข้าไม่ได้" };
const STATUS_TONE = { ok: "success", skip: "neutral", error: "danger" };
/* หัวตารางที่ขาดไม่ได้ — อ่านจาก IMPORT_FIELDS ชุดเดียวกับตัวตรวจ ไม่พิมพ์ซ้ำเอง */
const REQUIRED_LABELS = IMPORT_FIELDS.filter((field) => field.required).map((field) => field.label).join(" · ");
const PROVINCE_LABEL = IMPORT_FIELDS.find((field) => field.key === "province")?.label || "จังหวัด";

/* เหตุผลของแถว — ตารางกับการ์ดจอแคบอ่านจากตัวนี้ตัวเดียว สองมุมมองจะได้ไม่เพี้ยนหากัน */
function problemText(row) {
  return [
    ...(row.blocking || []),
    ...(row.issues || []).map((issue) => `${issue.field}: ${issue.message}`),
    ...(row.skippedAssets || []).map((item) => `มีอยู่แล้ว ${item.already} — ข้าม ${item.wanted}`),
  ].join(" · ");
}

/* ⭐ จอ ≤640 = ผลรายแถวเป็นการ์ด (เส้นเดียวกับ @media ของโมดูล schedule/intake)
   ตาราง 860px บนมือถือตัดเหตุผลขาดกลางประโยคที่ขอบกล่องเลื่อน
   ฝั่งเซิร์ฟเวอร์ถือเป็นจอกว้าง — ผลการตรวจโผล่หลังกดปุ่มเสมอ จึงไม่มีจังหวะสลับให้เห็น */
const NARROW_QUERY = "(max-width: 640px)";
function subscribeNarrow(onChange) {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const readNarrow = () => window.matchMedia(NARROW_QUERY).matches;
const readNarrowOnServer = () => false;

export default function ServiceImportPage() {
  const role = useRole();
  const team = useTeam();
  const teams = useTeams();
  const department = useDepartment();
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, readNarrowOnServer);
  const allowed = useMemo(
    () => canImportServiceData({ role, team, teams, department }),
    [role, team, teams, department],
  );

  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [pasted, setPasted] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [toast, setToast] = useState(null);

  /* ส่งคำขอเดียวกันทั้ง preview และ commit — ต่างกันแค่ปลายทางกับ expected
     ⚠️ commit ต้องส่ง **ไฟล์เดิม** ไปใหม่ ไม่ใช่ส่งแผนที่หน้าจอถืออยู่กลับไป */
  const send = useCallback(async (path, expected = null) => {
    if (file) {
      const form = new FormData();
      form.append("file", file);
      if (sheetName) form.append("sheetName", sheetName);
      if (expected) form.append("expected", JSON.stringify(expected));
      return apiFetch(path, { method: "POST", body: form });
    }
    return apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: pasted, expected }),
    });
  }, [file, pasted, sheetName]);

  const preview = useCallback(async (nextSheet = sheetName) => {
    if (!file && !pasted.trim()) { setError("เลือกไฟล์ .xlsx หรือวางข้อมูลจาก Excel ก่อน"); return; }
    setBusy(true); setError(""); setDone(null);
    try {
      const form = new FormData();
      let res;
      if (file) {
        form.append("file", file);
        if (nextSheet) form.append("sheetName", nextSheet);
        res = await apiFetch("/api/service/import/preview", { method: "POST", body: form });
      } else {
        res = await apiFetch("/api/service/import/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: pasted }),
        });
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "ตรวจข้อมูลไม่สำเร็จ");
      setResult(body);
      if (body.sheetName) setSheetName(body.sheetName);
    } catch (e) {
      setResult(null);
      setError(e.message || "ตรวจข้อมูลไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, [file, pasted, sheetName]);

  const commit = useCallback(async () => {
    if (!result?.summary) return;
    const { newSites, newZones, newAssets } = result.summary;
    /* ⚠️ ยืนยันด้วย **ตัวเลขที่จะเกิดขึ้นจริง** ไม่ใช่ "แน่ใจไหม" ลอย ๆ — โมดัลที่
       ไม่บอกผลลัพธ์คือโมดัลที่คนกดผ่านโดยไม่อ่าน (กติกาเดียวกับ approvalPrompt) */
    const accepted = await confirmAction({
      title: "ยืนยันนำเข้าข้อมูลเก่า",
      description: `จะสร้างของใหม่ในทะเบียนจาก ${fmtNumber(result.summary.ok)} แถวที่พร้อม`,
      detail: [
        "⚠️ ย้อนกลับเองไม่ได้ — ระบบไม่มีถังขยะ ลบทีหลังต้องไล่ลบทีละรายการ",
        "",
        "สิ่งที่จะเกิดขึ้นทันที:",
        `· ไซต์บริการใหม่ ${fmtNumber(newSites)} แห่ง`,
        `· โซนใหม่ ${fmtNumber(newZones)} โซน`,
        `· เครื่อง/อุปกรณ์ใหม่ ${fmtNumber(newAssets)} รายการ`,
        "· แถวที่มีอยู่แล้วจะถูกข้าม ไม่สร้างซ้อน",
      ].join("\n"),
      confirmLabel: "นำเข้า",
      danger: true,
    });
    if (!accepted) return;

    setBusy(true); setError("");
    try {
      const res = await send("/api/service/import/commit", { newSites, newZones, newAssets });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "นำเข้าไม่สำเร็จ");
      setDone(body);
      setResult(null);
      setToast({
        kind: body.errors?.length ? "error" : "success",
        msg: `นำเข้าแล้ว — ไซต์ ${body.created.sites} · โซน ${body.created.zones} · เครื่อง ${body.created.assets}`,
      });
    } catch (e) {
      setError(e.message || "นำเข้าไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }, [result, send]);

  /* รายงานแถวที่ต้องแก้ — เปิดใน Excel ได้ตรง (BOM หน้าไฟล์ ไม่งั้นภาษาไทยเพี้ยน) */
  const downloadReport = useCallback((rows) => {
    const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [["แถวที่", "สถานะ", "ลูกค้า", "ไซต์", "ปัญหา"].map(escape).join(",")];
    for (const row of rows) {
      lines.push([
        row.rowNumber, STATUS_LABEL[row.status] || row.status,
        row.customerName, row.siteName, row.problems.join(" · "),
      ].map(escape).join(","));
    }
    const blob = new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "service-import-report.csv";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, []);

  /* ⚠️ **บทบาทมาทีหลังการเรนเดอร์แรกเสมอ** (AppLayout ยิงถาม Supabase ก่อนจะ set
     context) ⇒ ถ้าตัดสินตอน role ยังเป็น null หน้าจะขึ้น "ไม่มีสิทธิ์" แวบหนึ่งให้
     คนที่มีสิทธิ์เห็นทุกครั้งที่เปิด — เห็นจริงบนจอตอนตรวจ 2026-08-28 */
  if (!role) {
    return (
      <Workspace icon={<Upload size={20} aria-hidden="true" />} title="นำเข้าข้อมูลเก่า">
        <SkeletonRows rows={3} />
      </Workspace>
    );
  }
  if (!allowed) {
    return (
      <Workspace icon={<Upload size={20} aria-hidden="true" />} title="นำเข้าข้อมูลเก่า">
        {/* 🐞 ข้อความเดิมเขียนว่า "หัวหน้าฝ่ายบริการขึ้นไป" ซึ่ง **กว้างกว่าด่านจริง** ⇒ หัวหน้า
            ฝ่าย TS ที่เปิด URL ตรงจะอ่านว่าตัวเองมีสิทธิ์ แล้วโดนปฏิเสธ — อาการที่คนจะ
            รายงานว่า "ระบบพัง" ไม่ใช่ "ไม่มีสิทธิ์" (มติ 2026-08-30: แอดมินคนเดียว)
            ⚠️ ไม่มีสิทธิ์แล้วต้องบอก **ทางที่เหลือจริง** ไม่ใช่ปิดประตูเฉย ๆ */}
        <EmptyState icon={AlertTriangle}>
          นำเข้าข้อมูลเก่าได้เฉพาะผู้ดูแลระบบ — เขียนทีเดียวหลายร้อยแถวและถอนคืนไม่ได้
          (ระบบไม่มีถังขยะ) · ถ้าต้องเพิ่มไซต์เก่าตอนนี้ ทำได้ทีละใบที่ทะเบียนไซต์บริการ
          ปุ่ม “เพิ่มไซต์ย้อนหลัง” (ไซต์ · โซน · จุดติดตั้ง)
        </EmptyState>
      </Workspace>
    );
  }

  const summary = result?.summary;
  const rows = result?.rows || [];
  const report = result?.report || [];

  return (
    <Workspace
      icon={<Upload size={20} aria-hidden="true" />}
      title="นำเข้าข้อมูลเก่า"
      subtitle="อ่านชีตเดิมของทีมเข้าทะเบียนไซต์ · โซน · เครื่อง — ตรวจก่อนทุกครั้ง"
    >
      {/* ── 1. เลือกแหล่งข้อมูล ── */}
      <WorkspaceSection icon={<FileSpreadsheet size={17} aria-hidden="true" />} title="เลือกข้อมูลที่จะนำเข้า" bodyClassName={styles.card}>
        <div className={styles.sourceRow}>
          <label className={styles.fileBox}>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className={styles.fileInput}
              onChange={(e) => {
                const picked = e.target.files?.[0] || null;
                setFile(picked); setPasted(""); setSheetName(""); setResult(null); setDone(null); setError("");
              }}
            />
            <FileSpreadsheet size={16} aria-hidden="true" />
            <span>{file ? file.name : "เลือกไฟล์ .xlsx"}</span>
          </label>
          <span className={styles.or}>หรือ</span>
          {/* ⭐ variant="data" — ของที่วางมาคือ **ตารางดิบ** (TSV) ไม่ใช่ประโยคไทย
              คอลัมน์ต้องเรียงตรงกันถึงจะตาดูออกว่าวางมาครบกี่ช่อง */}
          <Textarea
            variant="data"
            className={styles.paste}
            placeholder="วางตารางที่ก๊อปจาก Excel (รวมแถวหัวตาราง)"
            value={pasted}
            aria-label="ข้อมูลที่ก๊อปจาก Excel"
            onChange={(e) => {
              setPasted(e.target.value);
              if (e.target.value) { setFile(null); if (fileRef.current) fileRef.current.value = ""; }
              setResult(null); setDone(null);
            }}
          />
        </div>

        {/* 🐞 จอแรกเคยไม่บอกเลยว่าชีตต้องมีหัวตารางอะไร — รู้ก็ต่อเมื่อกดตรวจแล้วตก */}
        {!result && (
          <p className={styles.note}>
            <b>หัวตารางที่ต้องมี:</b> {REQUIRED_LABELS} (ไซต์ใหม่ต้องมี{PROVINCE_LABEL}ด้วย) —
            คอลัมน์อื่นที่ระบบรู้จักจะขึ้นให้ดูหลังกดตรวจ
          </p>
        )}

        {/* ชีตในไฟล์ — ⭐ ข้อมูลจริงอยู่ในชีตที่ "ซ่อน" (Sheet3) จึงต้องโชว์ทุกชีต
            พร้อมป้ายว่าซ่อนอยู่ ไม่ใช่ให้เห็นแต่ชีตแรก */}
        {result?.sheets?.length > 1 && (
          <div className={styles.sheets}>
            <span className={styles.sheetLabel}>ชีตในไฟล์</span>
            {result.sheets.map((sheet) => (
              <button
                key={sheet.name}
                type="button"
                className={`${styles.sheetChip} ${sheet.name === sheetName ? styles.sheetOn : ""}`}
                onClick={() => { setSheetName(sheet.name); preview(sheet.name); }}
              >
                {sheet.name}
                {sheet.hidden && <em className={styles.hiddenTag}>ซ่อนอยู่</em>}
              </button>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <Button tone="neutral" onClick={() => preview()} disabled={busy}>
            {busy ? "กำลังตรวจ…" : "ตรวจข้อมูล"}
          </Button>
          {summary && summary.ok > 0 && (
            <Button tone="primary" onClick={commit} disabled={busy}>
              นำเข้า {fmtNumber(summary.ok)} แถวที่พร้อม
            </Button>
          )}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {result?.blocked && <p className="form-error" role="alert">{result.blocked}</p>}
      </WorkspaceSection>

      {/* ── 2. คอลัมน์ที่จับได้ ── */}
      {result?.headerMatch && (
        <WorkspaceSection icon={<Columns3 size={17} aria-hidden="true" />} title="คอลัมน์ที่ระบบอ่านได้" bodyClassName={styles.card}>
          <ul className={styles.chips}>
            {IMPORT_FIELDS
              .filter((field) => result.headerMatch.map[field.key] !== undefined)
              .map((field) => (
                <li key={field.key} className={styles.chipOk}>
                  {field.label}
                  {field.carriedOnly && <em className={styles.carried}>ติดรายงาน ไม่ลงฐาน</em>}
                </li>
              ))}
          </ul>
          {result.headerMatch.ignored?.length > 0 && (
            <p className={styles.note}>
              <b>ไม่นำเข้าโดยตั้งใจ:</b>{" "}
              {result.headerMatch.ignored.map((item) => `${item.label} (${item.reason})`).join(" · ")}
            </p>
          )}
          {result.headerMatch.unmatched?.length > 0 && (
            <p className={styles.note}>
              <b>ระบบไม่รู้จัก:</b>{" "}
              {result.headerMatch.unmatched.map((item) => item.header).join(" · ")}
              {" "}— คอลัมน์เหล่านี้จะไม่ถูกนำเข้า แก้ชื่อหัวตารางในชีตให้ตรงแล้วตรวจใหม่ได้
            </p>
          )}
        </WorkspaceSection>
      )}

      {/* ── 3. สรุป + รายแถว ── */}
      {summary && (
        <WorkspaceSection icon={<ListChecks size={17} aria-hidden="true" />} title="ผลการตรวจ" bodyClassName={styles.card}>
          {/* 🐞 เดิมเป็นตัวเล็กบรรทัดเดียว ตัวเลขที่ต้องดูก่อนกดนำเข้าจมหาย และบนมือถือ
              เส้นคั่นค้างท้ายแถวแรก · ⚠️ ของที่จะสร้างแยกเป็นช่องเอง ไม่ยัดลงหมายเหตุ —
              หมายเหตุของ Metric โดนตัด … บนจอแคบ เลขหลักร้อยของชีตจริงจะหายครึ่ง */}
          <MetricStrip className={styles.summaryStrip} data-density="compact" aria-label="สรุปผลการตรวจ">
            <Metric
              label="พร้อมนำเข้า"
              value={fmtNumber(summary.ok)}
              note={`จาก ${fmtNumber(summary.rows)} แถวในชีต`}
              tone={summary.ok ? "success" : undefined}
            />
            <Metric label="มีอยู่แล้ว" value={fmtNumber(summary.skip)} />
            <Metric label="นำเข้าไม่ได้" value={fmtNumber(summary.error)} tone={summary.error ? "danger" : undefined} />
            <Metric label="ไซต์ใหม่" value={fmtNumber(summary.newSites)} />
            <Metric label="โซนใหม่" value={fmtNumber(summary.newZones)} />
            <Metric label="เครื่องใหม่" value={fmtNumber(summary.newAssets)} />
          </MetricStrip>

          {/* ⭐ แพ็ค/ปริมาณต่อเดือนอยู่ที่ "รอบขาย" ซึ่งต้องมีใบสั่งขาย — บอกตรง ๆ
              ว่าเห็นแล้วแต่เก็บไม่ได้ ดีกว่าเงียบแล้วให้คนคิดว่านำเข้าครบ */}
          {(summary.carriedPacks > 0 || summary.carriedMl > 0) && (
            <p className={styles.note}>
              <b>ไม่ได้นำเข้า:</b> จำนวนแพ็ค {fmtNumber(summary.carriedPacks)} แถว ·
              ปริมาณต่อเดือน {fmtNumber(summary.carriedMl)} แถว — สองอย่างนี้เป็นข้อผูกพันของ
              <b> รอบขาย</b> ต้องมาจากใบสั่งขายที่อนุมัติแล้ว (หน้า “งานเข้าใหม่”) จึงจะเก็บได้
            </p>
          )}

          {/* ห่อไว้ — ลูกตรงของ .card ถูกยืดเต็มกว้าง ปุ่ม sm เคยกลายเป็นแถบยาวทั้งการ์ด */}
          {report.length > 0 && (
            <div className={styles.actions}>
              <Button tone="neutral" size="sm" onClick={() => downloadReport(report)}
                icon={<Download size={15} aria-hidden="true" />}>
                ดาวน์โหลดรายงานที่ต้องแก้ ({fmtNumber(report.length)} แถว)
              </Button>
            </div>
          )}

          {narrow ? (
            <ul className={styles.rowCards} aria-label="ผลการตรวจรายแถว">
              {rows.map((row) => {
                const problems = problemText(row);
                return (
                  <li key={row.rowNumber} className={styles.rowCard}>
                    <div className={styles.rowCardHead}>
                      <span className={styles.rowNo}>แถว {row.rowNumber}</span>
                      <StatusBadge tone={STATUS_TONE[row.status]} label={STATUS_LABEL[row.status]} />
                    </div>
                    {problems && <p className={styles.rowCardProblems}>{problems}</p>}
                    <dl className={styles.rowCardMeta}>
                      <dt>ลูกค้า</dt>
                      <dd className={styles.rowCardWide}>{naText(row.customerName)}</dd>
                      <dt>ไซต์</dt>
                      <dd className={styles.rowCardWide}>
                        {naText(row.siteName)}
                        {row.site?.action === "create" && <em className={styles.new}>ใหม่</em>}
                      </dd>
                      <dt>โซน</dt>
                      <dd>
                        {naText(row.zone?.name)}
                        {row.zone?.action === "create" && <em className={styles.new}>ใหม่</em>}
                      </dd>
                      <dt>เครื่อง</dt>
                      <dd>{row.assets?.length ? fmtNumber(row.assets.length) : naText(null)}</dd>
                    </dl>
                  </li>
                );
              })}
            </ul>
          ) : (
            <TableScroll family="list" minWidth={860}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">แถว</th>
                    <th scope="col">สถานะ</th>
                    {/* ⭐ เหตุผลต้องอยู่ติดสถานะ — เดิมเป็นคอลัมน์ท้ายของตาราง 860px
                        มือถือเห็น "นำเข้าไม่ได้" แต่ไม่เห็นว่าเพราะอะไร */}
                    <th scope="col">ปัญหา</th>
                    <th scope="col">ลูกค้า</th>
                    <th scope="col">ไซต์</th>
                    <th scope="col">โซน</th>
                    <th scope="col">เครื่อง</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.rowNumber} className={row.status === "error" ? styles.rowBad : ""}>
                      <td>{row.rowNumber}</td>
                      <td>
                        <StatusBadge className="ui-badge-cell" tone={STATUS_TONE[row.status]} label={STATUS_LABEL[row.status]} />
                      </td>
                      <td className={styles.problems}>{problemText(row) || naText(null)}</td>
                      <td>{naText(row.customerName)}</td>
                      <td>
                        {naText(row.siteName)}
                        {row.site?.action === "create" && <em className={styles.new}>ใหม่</em>}
                      </td>
                      <td>
                        {naText(row.zone?.name)}
                        {row.zone?.action === "create" && <em className={styles.new}>ใหม่</em>}
                      </td>
                      <td>{row.assets?.length ? fmtNumber(row.assets.length) : naText(null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </WorkspaceSection>
      )}

      {/* ── 4. ผลหลังนำเข้า ── */}
      {done && (
        <WorkspaceSection icon={<CheckCircle2 size={17} aria-hidden="true" />} title="นำเข้าเรียบร้อย" bodyClassName={styles.card}>
          <MetricStrip data-density="compact" aria-label="สิ่งที่สร้างแล้ว">
            <Metric label="ไซต์ใหม่" value={fmtNumber(done.created.sites)} />
            <Metric label="โซนใหม่" value={fmtNumber(done.created.zones)} />
            <Metric label="เครื่องใหม่" value={fmtNumber(done.created.assets)} />
          </MetricStrip>
          {done.errors?.length > 0 && (
            <ul className={styles.errorList}>
              {done.errors.map((message) => <li key={message}>{message}</li>)}
            </ul>
          )}
          {done.report?.length > 0 && (
            <p className={styles.note}>
              ยังมี {fmtNumber(done.report.length)} แถวที่ต้องแก้ในชีตแล้วอัปโหลดใหม่ —
              แถวที่เข้าไปแล้วรอบหน้าจะขึ้นว่า “มีอยู่แล้ว” ไม่สร้างซ้ำ{" "}
              <button type="button" className={styles.linkBtn} onClick={() => downloadReport(done.report)}>
                ดาวน์โหลดรายงาน
              </button>
            </p>
          )}
          <Link className={styles.link} href="/database/sites">ไปที่ทะเบียนไซต์บริการ</Link>
        </WorkspaceSection>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </Workspace>
  );
}
