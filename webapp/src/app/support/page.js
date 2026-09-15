"use client";

// ── หน้าแจ้งปัญหาระบบ (mig 0223) ─────────────────────────────────────────
//
// ⭐ **หน้าเดียว สองบทบาท** — ผู้ใช้ทั่วไปเห็นแท็บเดียว ("เรื่องของฉัน") แอดมิน
// เห็นแท็บคิวเพิ่ม · ไม่แยกหน้าแอดมิน เพราะมันคือรายการเดียวกัน ต่างกันแค่ scope
// ของ query ซึ่ง `listIssues` ตัดให้ที่ฝั่ง server แล้ว (กฎของ repo: ของอย่างเดียว
// ห้ามมีสองชุด)
//
// ⚠️ ขอบเขตการมองเห็นไม่ได้ตัดที่หน้าจอ — หน้านี้แสดงทุกอย่างที่ API ส่งมา
// ตัวตัดคือ `canReadIssueRow` + `listIssues` (มติ Q12)
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useLatestRun from "@/lib/ui/useLatestRun";
import { Bug, LifeBuoy } from "lucide-react";
import Workspace, { ListPanel, Metric, MetricStrip } from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import Tabs from "@/components/ui/Tabs";
import { TableScroll } from "@/components/ui/Table";
import ReportIssueModal from "@/components/issues/ReportIssueModal";
import { notifyToast } from "@/lib/feedback";
import { describeResponseError } from "@/lib/fetchError";
import { fmtDateTime, naText, NA } from "@/lib/format";
import { useRole } from "@/lib/roleContext";
import { isSystemAdmin } from "@/lib/issues/access";
import {
  ISSUE_IMPACT_LABELS, ISSUE_IMPACT_TONES, ISSUE_KIND_LABELS,
  ISSUE_STATUS_LABELS, ISSUE_STATUS_TONES,
} from "@/lib/issues/statuses";
import styles from "./page.module.css";
import { apiFetch } from "@/lib/apiFetch";

// อายุเรื่องเป็นคำที่คนอ่านแล้วรู้ทันทีว่า "ค้างนานไหม" — วันที่เต็มอยู่ใน title
function ageOf(createdAt) {
  const ms = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "เพิ่งแจ้ง";
  if (hours < 24) return `${hours} ชม.`;
  return `${Math.floor(hours / 24)} วัน`;
}

// แท็บของแอดมิน — คีย์ตรงกับสถานะจริง ไม่ต้องมีตารางแปลอีกชั้น
const ADMIN_TABS = [
  { key: "pending", label: "รอรับเรื่อง" },
  { key: "acknowledged", label: "กำลังแก้" },
  { key: "resolved", label: "รอยืนยัน" },
  { key: "mine", label: "ที่ฉันรับผิดชอบ" },
  { key: "all", label: "ทั้งหมด" },
];

export default function SupportPage() {
  const role = useRole();
  const admin = isSystemAdmin({ role });

  const [open, setOpen] = useState([]);      // เรื่องที่ยังเดินอยู่ — ใช้ทั้งตัวเลขและสามแท็บแรก
  const [extra, setExtra] = useState(null);  // { tab, items } ของแท็บ "ทั้งหมด"/"ที่ฉันรับผิดชอบ"
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const fetchIssues = async (url) => {
    const res = await apiFetch(url, { cache: "no-store" });
    // ⚠️ **ห้ามกลืน error เป็นลิสต์ว่าง** — ของเดิมทำ `r.ok ? r.json() : { items: [] }`
    // ⇒ API ล่มแล้วหน้าขึ้นว่า "ไม่มีเรื่องในถังนี้" · แอดมินอ่านว่าไม่มีงานค้าง
    if (!res.ok) throw new Error(await describeResponseError(res, "โหลดรายการไม่สำเร็จ"));
    const body = await res.json().catch(() => ({}));
    return body.items || [];
  };

  /* ⭐ **โหลดรอบเดียวจบทั้งหน้า ผูกกับแท็บด้วย** (2026-08-11)
     ผู้ใช้ทั่วไปได้เรื่องของตัวเองทั้งหมดในคำขอเดียว (ไม่มีแท็บให้สลับ) · แอดมินดึง
     "ที่ยังเดินอยู่" ไว้ทำตัวเลขการ์ดเสมอ แล้วดึงก้อนของแท็บ "ทั้งหมด/ที่ฉันรับผิดชอบ"
     เพิ่มเมื่ออยู่แท็บนั้น

     🐞 **สองบั๊กที่ปิดพร้อมกันตรงนี้**
     1. ของเดิม `load()` ล้าง `extra` เป็น null แต่ effect ที่ดึง `extra` ผูกกับ
        `[admin, tab]` เท่านั้น ⇒ กด "รับเรื่อง" หรือแจ้งเรื่องใหม่ขณะอยู่แท็บ
        "ทั้งหมด" แล้วรายการกลายเป็นว่างจนกว่าจะสลับแท็บไปกลับ
     2. การดึงของแท็บไม่มี `loading` ของตัวเอง ⇒ สลับแท็บแล้วเห็น "ไม่มีเรื่องในถังนี้"
        แวบหนึ่งก่อนข้อมูลมา */
  // กันคำตอบมาผิดลำดับเมื่อกดสลับแท็บเร็วกว่าที่ API ตอบ (ดู lib/ui/latestRun)
  // — ไม่งั้นก้อน "ทั้งหมด" ที่ตอบช้ามาทับก้อน "ที่ฉันรับผิดชอบ" ที่ตอบก่อน
  const startRun = useLatestRun();
  const load = useCallback(async () => {
    const isLatest = startRun();
    setLoading(true); setError("");
    try {
      const openItems = await fetchIssues(admin ? "/api/issues?status=open" : "/api/issues");
      if (!isLatest()) return;
      setOpen(openItems);
      if (admin && (tab === "all" || tab === "mine")) {
        const items = await fetchIssues(tab === "all" ? "/api/issues" : "/api/issues?mine=1");
        if (!isLatest()) return;
        setExtra({ tab, items });
      } else {
        setExtra(null);
      }
    } catch (e) {
      if (isLatest()) setError(e.message);
    } finally { if (isLatest()) setLoading(false); }
  }, [admin, tab, startRun]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    pending: open.filter((r) => r.status === "pending").length,
    acknowledged: open.filter((r) => r.status === "acknowledged").length,
    resolved: open.filter((r) => r.status === "resolved").length,
    blocked: open.filter((r) => r.impact === "blocked").length,
  }), [open]);

  /* ⚠️ **ก้อนของแท็บ "ทั้งหมด/ที่ฉันรับผิดชอบ" ต้องตรงแท็บที่เลือกอยู่** — `extra` ติดป้าย
     `tab` ที่ดึงมาไว้ · ก้อนของอีกแท็บ = ยังไม่ได้โหลดก้อนนี้ (คนละเรื่องกับ "โหลดแล้วไม่มีของ")
     🐞 ของเดิมเก็บแค่ items ⇒ สลับ ทั้งหมด → ที่ฉันรับผิดชอบ แล้วแผงยังโชว์ 38 แถวของ
     "ทั้งหมด" พร้อมป้าย "38 เรื่อง" และปุ่ม "รับเรื่อง" กดได้ ใต้แท็บใหม่จนคำขอจบ
     (ก่อนย้ายเข้า ListPanel โครง `loading` ของ Workspace บังไว้ทั้งหน้า) */
  const bucketTab = admin && (tab === "all" || tab === "mine");
  const bucketStale = bucketTab && extra?.tab !== tab;
  const rows = !admin ? open
    : bucketTab ? (bucketStale ? [] : extra.items)
      : open.filter((r) => r.status === tab);

  /* ⭐ ยังไม่มีแถวของชุดนี้ = แผงเป็น skeleton · ป้ายจำนวน/ตัวเลขการ์ดเป็นขีด
     ไม่ใช่ 0 — "รอรับเรื่อง 0" ระหว่างโหลดอ่านได้ว่าไม่มีงานค้าง (มติผู้ใช้ 2026-09-15:
     Workspace ไม่บังทั้งหน้าแล้ว แท็บกับการ์ดตัวเลขยังอยู่ระหว่างโหลด)
     `bucketStale` นับเป็นกำลังโหลดด้วย — เฟรมแรกหลังกดแท็บ effect ยังไม่ยิง `loading` ยังเป็น false
     จะเห็น "ไม่มีเรื่องในถังนี้" แวบหนึ่ง · โหลดพัง (`error`) ต้องโชว์ข้อความ ไม่ใช่ skeleton ค้าง
     โหลดซ้ำชุดเดิมที่ยังมีแถว (หลังกด "รับเรื่อง") ตารางค้างไว้พร้อม aria-busy ไม่กระพริบ */
  const firstLoad = !rows.length && (loading || (bucketStale && !error));
  const metric = (n) => (loading && !open.length ? NA : n);

  // "รับเรื่อง" = self-assign + ขยับสถานะในปุ่มเดียว (มติ Q18) — กดจากคิวได้เลย
  // ไม่ต้องเปิดเข้าไปในเรื่องก่อน เพราะขั้นนี้ไม่ต้องอ่านอะไรเพิ่มเพื่อตัดสิน
  const acknowledge = async (id) => {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge" }),
      });
      if (!res.ok) throw new Error(await describeResponseError(res, "รับเรื่องไม่สำเร็จ"));
      notifyToast.success("รับเรื่องแล้ว");
      await load();
    } catch (e) { notifyToast.error(e.message); } finally { setBusyId(null); }
  };

  return (
    <Workspace
      icon={<LifeBuoy size={22} />}
      title="แจ้งปัญหาระบบ"
      subtitle={admin ? "คิวเรื่องที่ผู้ใช้แจ้งเข้ามาทั้งระบบ" : "เรื่องที่คุณแจ้งไว้ และสถานะการแก้"}
      headerRight={<Button tone="accent" onClick={() => setReporting(true)}>+ แจ้งเรื่องใหม่</Button>}
    >
      {admin && (
        <>
          <MetricStrip>
            <Metric label="ทำงานต่อไม่ได้" value={metric(counts.blocked)} tone={counts.blocked ? "danger" : undefined} note="ทุกสถานะที่ยังเดินอยู่" />
            <Metric label="รอรับเรื่อง" value={metric(counts.pending)} tone={counts.pending ? "warning" : undefined} />
            <Metric label="กำลังแก้" value={metric(counts.acknowledged)} />
            <Metric label="รอผู้แจ้งยืนยัน" value={metric(counts.resolved)} note="ปิดเองใน 7 วัน" />
          </MetricStrip>

          <Tabs
            tabs={ADMIN_TABS.map((t) => ({
              ...t,
              label: counts[t.key] ? `${t.label} (${counts[t.key]})` : t.label,
            }))}
            value={tab}
            onChange={setTab}
            ariaLabel="คิวเรื่องแจ้งปัญหา"
          />
        </>
      )}

      {/* แผงรายการ (มติผู้ใช้ 2026-09-15) — แท็บของแอดมินสลับ **ชุดข้อมูล** จึงอยู่เหนือแผง
          ตารางเดสก์ท็อปกับการ์ดมือถือ (สลับกันที่ 768) อยู่ในเนื้อแผงทั้งคู่ */}
      <ListPanel
        icon={<LifeBuoy size={17} aria-hidden="true" />}
        title={admin ? "รายการเรื่องแจ้งปัญหา" : "เรื่องที่คุณแจ้งไว้"}
        subtitle={admin ? "กดเลขที่หรือหัวเรื่องเพื่อเปิดเรื่อง · รับเรื่องจากคิวได้ทันที" : "กดเรื่องเพื่อดูสถานะการแก้และตอบกลับ"}
        count={firstLoad || (error && !rows.length) ? null : `${rows.length} เรื่อง`}
        loading={firstLoad}
      >
      {error && (
        <StatusNotice
          tone="error"
          className="mb-4"
          action={<Button size="sm" variant="ghost" onClick={() => load()}>ลองใหม่</Button>}
        >
          {error}
        </StatusNotice>
      )}

      {/* ⚠️ `action` ของ EmptyState รับ **object `{ label, onClick }`** ไม่ใช่ node —
          ส่ง <Button> เข้าไปจะได้ปุ่มเปล่าที่กดไม่ได้ และไม่มี error ให้เห็นเลย */}
      {!error && !rows.length && (
        <EmptyState
          plain
          icon={Bug}
          action={admin ? undefined : { label: "แจ้งเรื่องใหม่", onClick: () => setReporting(true) }}
        >
          {admin ? "ไม่มีเรื่องในถังนี้" : "ยังไม่มีเรื่องที่คุณแจ้งไว้ — เจอบั๊กหรือติดตรงไหน ส่งมาได้เลย"}
        </EmptyState>
      )}

      {!!rows.length && (
        <>
          {/* เดสก์ท็อป: ตาราง — `TableScroll` เป็น primitive กลาง ห้ามเขียนคลาส
              `premium-table` เอง (audit:ui นับเป็นชั้นสไตล์เก่าและตกทันที) */}
          <div className={styles.tableWrap}>
            <TableScroll aria-busy={loading || undefined}>
              <table>
                <thead>
                  <tr>
                    <th className={styles.colStatus}>สถานะ</th>
                    <th className={styles.colCode}>เลขที่</th>
                    <th>เรื่อง</th>
                    <th className={styles.colImpact}>ผลกระทบ</th>
                    <th className={styles.colOwner}>{admin ? "ผู้แจ้ง" : "ผู้รับผิดชอบ"}</th>
                    <th className={styles.colAge}>อายุ</th>
                    {admin && <th className={styles.colAct} />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <StatusBadge dot tone={ISSUE_STATUS_TONES[row.status]} label={ISSUE_STATUS_LABELS[row.status]} />
                      </td>
                      <td className={styles.code}>{naText(row.code)}</td>
                      <td>
                        <Link href={`/support/${row.id}`} className={styles.title}>{row.title || "(ไม่มีหัวข้อ)"}</Link>
                        <span className={styles.sub}>
                          {ISSUE_KIND_LABELS[row.kind]}{row.pageUrl ? ` · ${row.pageUrl}` : ""}
                        </span>
                      </td>
                      <td>
                        <StatusBadge size="sm" tone={ISSUE_IMPACT_TONES[row.impact]} label={ISSUE_IMPACT_LABELS[row.impact]} />
                      </td>
                      <td>
                        {admin ? (
                          <>
                            {naText(row.reportedByName)}
                            <span className={styles.sub}>
                              {[row.reporterRole, row.reporterDepartment, row.reporterTeam].filter(Boolean).join(" · ")}
                            </span>
                          </>
                        ) : (row.assigneeName || <span className={styles.dim}>ยังไม่มีผู้รับ</span>)}
                      </td>
                      <td className={styles.age} title={fmtDateTime(row.createdAt)}>{ageOf(row.createdAt)}</td>
                      {admin && (
                        <td>
                          {row.status === "pending" && (
                            <Button tone="primary" size="sm" disabled={busyId === row.id} onClick={() => acknowledge(row.id)}>
                              รับเรื่อง
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>

          {/* มือถือ: การ์ด — สถานะกับผลกระทบอยู่บรรทัดบนสุด (จุดตัดจอ 768 ใน page.module.css) */}
          <ul className={styles.cards}>
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/support/${row.id}`} className={styles.card}>
                  <span className={styles.cardTop}>
                    <StatusBadge size="sm" dot tone={ISSUE_STATUS_TONES[row.status]} label={ISSUE_STATUS_LABELS[row.status]} />
                    <StatusBadge size="sm" tone={ISSUE_IMPACT_TONES[row.impact]} label={ISSUE_IMPACT_LABELS[row.impact]} />
                  </span>
                  <span className={styles.cardTitle}>{row.title || "(ไม่มีหัวข้อ)"}</span>
                  <span className={styles.cardFoot}>
                    <span>{row.code}</span>
                    <span>{admin ? (naText(row.reportedByName)) : (row.assigneeName || "ยังไม่มีผู้รับ")}</span>
                    <span>{ageOf(row.createdAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      </ListPanel>

      <ReportIssueModal open={reporting} onClose={() => setReporting(false)} onCreated={load} />
    </Workspace>
  );
}
