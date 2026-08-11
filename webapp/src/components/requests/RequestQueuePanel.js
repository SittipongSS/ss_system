"use client";
import { TableScroll } from "@/components/ui/Table";
// คำร้องข้ามฝ่าย (mig 0173) — คำร้องของฉัน / คิวของฝ่ายตน
//
// เซลเปิดเคสถามราคาไป PC (บรรจุภัณฑ์) หรือ RD (หัวน้ำหอม/เนื้อสาร)
// RD/PC เห็นคิวงานที่รอตอบที่เดียว — ของเดิมไม่มีคิวเลย ต้องรอให้เซลตามเอง
//
// เป็น "แท็บหนึ่ง" ของหน้า /sa/requests (คิวของฝ่ายตน / คำร้องของฉัน) — หน้าแม่
// เป็นเจ้าของข้อมูลและตัวนับบนแท็บ พาเนลนี้เลือกแสดงตาม scope ที่ส่งมา
import { Fragment, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Building2, ChevronDown, ChevronRight, ChevronsDownUp,
  ChevronsUpDown, ClipboardList, FolderKanban, Layers, Search, Tag, User, Users,
} from "lucide-react";
import FilterPopover from "@/components/ui/FilterPopover";
import MenuSelect from "@/components/ui/MenuSelect";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { WorkspaceSection } from "@/components/ui/Workspace";
import { matchesQueueSearch, useQueueBoard } from "@/lib/requests/useQueueBoard";
import { fmtDate } from "@/lib/format";
import styles from "./requestForm.module.css";
import { requestProgress } from "@/lib/deptRequests";
import {
  QUEUE_COUNT_META, bouncedDaysText, groupQueueRows, matchesQueueCount, queueCounts,
  requestDueText, requestNextStep,
} from "@/lib/requests/queueBoard";
import { businessDate } from "@/lib/businessDate";
import {
  REQUEST_GROUP_OPTIONS, REQUEST_SORT_OPTIONS, filterRequestRows, groupRequestRows,
  requestFacetOptions, requestFilterCount, sortRequestRows,
} from "@/lib/requests/queueList";
import { REQUEST_COLUMNS, requestColumns } from "@/lib/requests/queueColumns";
import { RequestStatusBadge } from "@/components/requests/requestUi";
// ⚠️ ชื่อฝ่ายอ่านจากทะเบียน ไม่ใช่พิมพ์รหัส "RD" ลงข้อความ — จอเดียวกันเคยพูด
// ทั้ง "ฝ่ายวิจัยและพัฒนา" (หัวหน้า) และ "ฝ่าย RD" (ข้อความว่าง) ในหน้าเดียว
import { REQUEST_DEPT_LABELS, requestKindLabel, requestLineNoun } from "@/lib/master/requestTypes";

export default function RequestQueuePanel({
  scope = "mine", dept = null, rows = [],
  // 🐞 **เคยรับทะเบียน 9 ชุด (materials · products · projects · deals · salesOrders ·
  // scents · formulas · productTypes · mentionPeople) แล้วไม่ได้ใช้สักตัว** — ตกค้าง
  // จากตอนที่ฟอร์มเปิดคำร้องยังเป็นโมดัลอยู่ในพาเนลนี้ · หน้าแม่จึงยิง 8 endpoint
  // ทุกครั้งที่เปิดคิว เพื่อส่งของที่ไม่มีใครอ่านต่อ ⇒ ถอดทั้งชุด
  // ⚠️ `reload` ยังรับไว้ — ผู้เรียกใช้หลังกดสร้าง/แก้เพื่อดึงใหม่ · ที่ถอดคือ
  // **ปุ่มรีเฟรชบนจอ** ซึ่งทั้งระบบไม่มีที่อื่น และหน้าที่ต้องกดเองแปลว่าข้อมูลไม่สด
  // โดยปริยาย ⇒ ผู้ใช้จะกดทุกครั้งเพราะไม่กล้าเชื่อสิ่งที่เห็น
  loading = false, loadError = "", reload,
  /* ⭐ **สถานะมาจากหน้าแม่ได้ แต่ไม่บังคับ** (`useQueueBoard`) — หน้าคิววางตัวสลับ
     มุมมองไว้ในหัวการ์ด ซึ่งอยู่คนละชั้นกับพาเนล จึงต้องส่งฮุกลงมา · ส่วนการ์ดบน
     หน้าดีล/โครงการไม่มีเครื่องมือเลย ⇒ ไม่ส่งก็ได้ พาเนลถือของตัวเอง
     ⚠️ การบังคับให้ทุกที่ต้องรู้จักฮุกก่อน คือเหตุผลหนึ่งที่เคยมีตารางสำเนาที่สอง */
  board = null,
  // ⚠️ ข้อความตอนว่างต้องพูดถึง **ชุดแถวที่ผู้เรียกส่งมา** — ภาพรวมฝ่ายส่งเฉพาะใบที่
  // ใกล้ถึงกำหนด 7 วัน ⇒ "ไม่มีคำร้องรอฝ่าย … ตอบ" ที่เป็นค่าตั้งต้นจะโกหก
  emptyText = null,
  // ⭐ ห่อด้วยการ์ดที่มีหัวข้อ + จำนวน ตามต้นแบบ · ส่ง null เมื่อผู้เรียกห่อเองอยู่แล้ว
  // (ภาพรวมฝ่ายวางพาเนลนี้ไว้ในหัวข้อ "ใกล้ถึงกำหนด…" ⇒ ซ้อนการ์ดสองชั้นไม่ได้)
  sectionTitle = "รายการคำร้อง",
  sectionSubtitle = "ค้นหา กรอง จัดกลุ่ม และติดตามทุกใบ",
  unit = "เรื่อง",
  /* ⚠️ **ปิดเครื่องมือเมื่อพาเนลไม่ใช่รายการทั้งก้อน** — หน้าภาพรวมฝ่ายวางพาเนลนี้ไว้
     ในการ์ด "คิวถัดไป" ซึ่งส่งมาแค่ไม่กี่ใบที่คัดมาแล้ว · ให้กรอง/จัดกลุ่มซ้อนบนชุดที่
     คัดมาแล้วอีกชั้นคือการเชิญให้คนเข้าใจผิดว่านี่คือคิวทั้งหมด
     "full" = ค้นหา + กรอง/จัดกลุ่ม/เรียง · "search" = ค้นหาอย่างเดียว · "none" = ไม่มีแถบ
     ⚠️ รับ `true`/`false` ต่อได้ด้วย — ผู้เรียกเดิมส่งแบบนั้นอยู่ */
  tools = "full",
  /* ชุดคอลัมน์ — ชื่อชุดในทะเบียน ("queue" · "linked") หรือระบุเป็นอาร์เรย์เอง */
  columns = "queue",
  /* ปุ่มเพิ่มบนหัวการ์ด (ต่อจากป้ายจำนวน) — การ์ดบนหน้าดีลมีทางลัดเปิดคำร้องของตัวเอง */
  headerActions = null,
}) {
  const router = useRouter();
  // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า toISOString() ยังให้เมื่อวาน แล้ว
  // "เลยกำหนด" จะนับผิดไปหนึ่งวันทุกเช้า
  const today = businessDate();
  const ownBoard = useQueueBoard();
  const {
    view, countFilter, setCountFilter, search, setSearch,
    filters = {}, setFilter, clearFilters,
    groupBy = "none", setGroupBy, collapsed, setCollapsed, toggleGroup,
    sortKey = "urgency", sortDir = "asc", setSort, toggleSortDir,
  } = board || ownBoard;

  /* ความกว้างตายตัวของคอลัมน์ที่เนื้อคงที่ — ที่เหลือปล่อยให้ยืดตามเนื้อ
     (คลาสอยู่ใน requestForm.module.css ตามด่าน audit:ui ห้าม inline style) */
  const COL_WIDTH = { next: styles.colNext, due: styles.colDue, progress: styles.colProgress };
  // รับได้ทั้ง "full"/"search"/"none" และ true/false ของผู้เรียกเดิม
  const toolLevel = tools === true ? "full" : tools === false ? "search" : tools;
  const showTools = toolLevel === "full";
  const showToolbar = toolLevel !== "none";

  // ⭐ **ตัวเลขบนแถบกดกรองได้** — "เลยกำหนด 2" คือคำถามแรกที่หัวหน้าเปิดคิวมาถาม
  // แต่เดิมตอบได้แค่ว่ามีกี่ใบ ไม่ได้บอกว่าใบไหน ⇒ ต้องไล่กวาดตาทั้งตารางเอง
  // ⚠️ กรองที่จอได้ **เพราะชุดข้อมูลนี้ผ่านด่านขอบเขตของ API มาแล้ว** — ต่างจาก
  // ตัวสลับขอบเขตบนหน้าแม่ที่ต้องกรองฝั่ง server (กับดักข้อ 9 ของแผน)
  const visibleRows = useMemo(
    () => sortRequestRows(
      filterRequestRows(
        rows
          .filter((r) => (countFilter ? matchesQueueCount(r, countFilter, { todayIso: today }) : true))
          .filter((r) => matchesQueueSearch(r, search, { kindLabel: requestKindLabel })),
        showTools ? filters : {},
      ),
      { key: sortKey, dir: sortDir },
    ),
    [rows, countFilter, search, today, filters, sortKey, sortDir, showTools],
  );

  /* ⭐ **สองโหมดจัดกลุ่ม รูปร่างเดียวกัน** — เลือกมิติเอง (ฝ่าย/ชนิด/ลูกค้า/ผู้รับเรื่อง)
     หรือปล่อยไว้ให้จัดตามความเร่ง (`groupQueueRows` ของเดิม ซึ่งเป็นสิ่งที่ทำให้ใบ
     ตีกลับกับใบที่ยังไม่มีใครรับขึ้นบนสุด) · ทั้งสองโหมดคืน `{ key, label, rows }`
     เหมือนกัน ⇒ ตารางกับการ์ดวาดโค้ดชุดเดียว ไม่ใช่สองสำเนา */
  const groups = useMemo(() => (
    (showTools && groupRequestRows(visibleRows, groupBy))
    || groupQueueRows(visibleRows, { todayIso: today })
      .map((g) => ({ key: g.group, label: g.label, rows: g.rows }))
  ), [visibleRows, groupBy, today, showTools]);

  /* ⚠️ **หัวกลุ่มหายเมื่อมีกลุ่มเดียวและเปลี่ยนการจัดกลุ่มไม่ได้** — การ์ดบนหน้าดีล
     มักมี 1-3 ใบ · หัวข้อ "ยังไม่มีใครรับเรื่อง · 1" เหนือแถวเดียวคือเส้นที่ไม่ได้
     แบ่งอะไร · ในคิวยังโชว์เสมอ เพราะที่นั่นหัวกลุ่มคือสิ่งที่ทำให้ลำดับความเร่งมองเห็นได้ */
  const collapsedSet = collapsed instanceof Set ? collapsed : new Set();
  const isCollapsed = (key) => collapsedSet.has(key);
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsedSet.has(g.key));
  const showGroupHeads = showTools || groups.length > 1;
  const filterCount = requestFilterCount(filters);
  // ⚠️ ตัวเลือกในแผงกรองสร้างจาก `rows` (ทั้งก้อนก่อนกรอง) ไม่ใช่ `visibleRows` —
  // ไม่งั้นพอเลือก "RD" แล้วตัวเลือก "PC" หายจากแผง = ยกเลิกตัวเลือกตัวเองไม่ได้
  const facetGroups = useMemo(() => [
    { key: "dept", label: "ฝ่ายที่ขอไป", icon: Building2 },
    { key: "kind", label: "ชนิดคำร้อง", icon: Tag },
    { key: "customer", label: "ลูกค้า", icon: Users },
    { key: "project", label: "โครงการ", icon: FolderKanban },
    { key: "owner", label: "ผู้รับเรื่อง", icon: User },
  ].map((g) => ({
    ...g,
    options: requestFacetOptions(rows, g.key),
    selected: filters[g.key] || [],
    onChange: (values) => setFilter?.(g.key, values),
  })), [rows, filters, setFilter]);

  /* ── คอลัมน์: ทะเบียนบอกว่ามีอะไร ที่นี่บอกว่าวาดยังไง ──────────────────
     ⚠️ **ทุกคีย์ในทะเบียนต้องมีตัววาดที่นี่** — `queueColumns.test.mjs` สแกนไฟล์นี้
     เช็คไว้ · ขาดไปแล้วคอลัมน์นั้นจะเป็นช่องว่างเงียบ ๆ ไม่มี error ให้เห็น */
  const cols = requestColumns(columns);
  const cell = (key, ask) => {
    const next = requestNextStep(ask);
    const due = requestDueText(ask, { todayIso: today });
    // ใบตีกลับไม่มีกำหนดส่งให้นับถอยหลัง — สิ่งที่ต้องทวงคือค้างมากี่วัน
    const bounced = bouncedDaysText(ask, { todayIso: today });
    const p = requestProgress(ask.items || []);
    switch (key) {
      /* ⚠️ สองโทน: ตาฝ่าย / รออีกฝั่ง — **สีสงวนให้เจ้าของก้าว** ไม่ใช่ให้ชนิดคำร้อง
         ⭐ `ui-badge-cell` ทำให้ป้ายทุกแถวกว้างเท่ากัน ⇒ ขอบเรียงเป็นเส้นตรงลงมา
         ตากวาดคอลัมน์ได้เป็นแนว (กฎ 1 · UI_DESIGN_SYSTEM.md) */
      case "next":
        return next ? (
          <>
            <span
              className={`ui-badge ui-badge-cell ui-badge-w-nextstep ${styles.nextStep}`}
              data-owner={next.owner}
            >
              {next.label}
            </span>
            {/* ⭐ **ใครถืออยู่** (มติผู้ใช้ 2026-08-11 · แบบ ก) — ป้ายบอกได้แค่ *ฝั่งไหน*
                ชื่อคนที่รับเรื่องคือสิ่งที่ทำให้ตามงานต่อได้จริง
                ⚠️ โชว์เฉพาะตอนเป็นตาฝ่าย และเฉพาะตอนไม่มีคอลัมน์ "ผู้รับเรื่อง"
                แยกอยู่แล้ว — ไม่งั้นชื่อเดียวกันขึ้นสองช่องในแถวเดียว */}
            {next.owner === "dept" && ask.acknowledgedByName && !cols.includes("owner") && (
              <div className={styles.subText}>{ask.acknowledgedByName}</div>
            )}
            {/* ใบตีกลับ — ใครส่งคืนและเพราะอะไร อ่านได้จากคิวเลย */}
            {next.bounced && (ask.bouncedByName || ask.bounceReason) && (
              <div className={`${styles.subText} ${styles.overdue}`}>
                {[ask.bouncedByName, ask.bounceReason].filter(Boolean).join(" · ").slice(0, 70)}
              </div>
            )}
          </>
        ) : <span className={styles.muted}>—</span>;
      /* ⭐ "ใบนี้คือใบอะไร" — เรื่องเป็นตัวหลัก · เลขที่/ชนิด/ลูกค้า/ฝ่ายเป็นบรรทัดรอง
         ⚠️ บรรทัดรองตัดชนิด/ฝ่ายออกเมื่อมีคอลัมน์ของมันเองอยู่แล้ว (ชุด "linked") */
      case "doc":
        return (
          <>
            <div className={styles.docCell}>
              {ask.title || ask.customerName || <span className={styles.muted}>ราคากลาง</span>}
              {ask.urgent && <span className={`ui-badge ${styles.urgentTag}`}>ด่วน</span>}
            </div>
            <div className={styles.subText}>
              {[
                ask.docNo || "ร่าง",
                cols.includes("kind") ? null : requestKindLabel(ask.kind),
                ask.title && ask.customerName ? ask.customerName : null,
                ask.formulaCode ? `สูตร ${ask.formulaCode}` : null,
              ].filter(Boolean).join(" · ")}
              {cols.includes("dept") ? "" : ` → ${ask.dept}`}
            </div>
          </>
        );
      case "kind":
        return <span className={styles.kindCell}>{requestKindLabel(ask.kind)}</span>;
      case "dept":
        return <span className={styles.smallCell}>{ask.dept}</span>;
      case "owner":
        return ask.acknowledgedByName || <span className={styles.muted}>ยังไม่มีผู้รับ</span>;
      /* ⭐ **"เหลือกี่วัน" เป็นบรรทัดหลัก วันที่เป็นบรรทัดรอง** (มติผู้ใช้ 2026-08-11 ·
         แบบ ก) — คนกวาดคิวถามว่า *ทันไหม* ไม่ได้ถามว่า *วันที่เท่าไร*
         ⚠️ ใบที่ยังไม่มีใครให้วันขึ้น "ยังไม่ให้วัน" ไม่ใช่ขีด — ขีดอ่านได้ทั้ง
         "ไม่มีกำหนด" และ "ระบบไม่รู้" ซึ่งคนละเรื่องกัน */
      case "due":
        if (bounced) {
          return (
            <>
              <div className={styles.overdue}>{bounced.note}</div>
              <div className={styles.subText}>{fmtDate(bounced.date)}</div>
            </>
          );
        }
        if (due) {
          return (
            <>
              <div className={due.overdue ? styles.overdue : undefined}>
                {due.note || fmtDate(due.date)}
              </div>
              {due.note && <div className={styles.subText}>{fmtDate(due.date)}</div>}
            </>
          );
        }
        return <span className={styles.muted}>ยังไม่ให้วัน</span>;
      case "progress":
        return p.total > 0 ? (
          <>
            <div>{p.done} / {p.total}</div>
            {/* หน่วยมาจากทะเบียนหัวข้อ — พัฒนากลิ่นนับเป็น "กลิ่น" */}
            <div className={styles.subText}>{requestLineNoun(ask.kind)}</div>
          </>
        ) : <span className={styles.muted}>—</span>;
      case "status":
        return <RequestStatusBadge status={ask.status} />;
      default:
        return null;
    }
  };

  // ── เปิดคำร้อง = สามสเต็ปในปุ่มเดียว ─────────────────────────────────────
  //
  // ⭐ ปุ่มเดียว "ส่งคำร้อง" ไม่ใช่ "สร้างร่าง" แล้วให้ไปกดส่งอีกหน้า (มติ 2026-08-03
  // ให้ทำงานคล้ายเธรด — ไม่มีใครร่างโพสต์ในเธรดไว้แล้วกลับมากดส่งทีหลัง) · ที่สำคัญ
  // กว่านั้น: ไฟล์แนบกับ @mention จะแขวนอยู่บนร่างที่ไม่มีใครเห็น ถ้าหยุดแค่ร่าง
  //
  // กลไกร่างยังอยู่ข้างใน เพราะสองอย่างต้องมี id ของคำร้องก่อน:
  //   1 POST     → ได้ร่าง + id (ยังไม่กินเลขที่)
  //   2 upload   → ไฟล์แนบเกาะ id นั้น
  //   3 PATCH ส่ง → ออกเลขที่ + ลงเธรดคำร้อง/เธรดดีล + ยิงแจ้งเตือนคนที่ถูก @
  // ⚠️ ล้มกลางทางแล้ว **ไม่ rollback ร่างทิ้ง** — ของที่พิมพ์มายังอยู่ พาไปหน้า
  // รายละเอียดให้กดส่งเองได้ ดีกว่าลบแล้วให้พิมพ์ใหม่ทั้งใบ
  const body = (
    <>
      {/* ── แถบเครื่องมือ — ค้นหา + ตัวกรองที่ใช้อยู่ (ต้นแบบหน้างานของฉัน) ──
          ⭐ **ค้นหาเป็นของใหม่** (มติผู้ใช้ 2026-08-08) — คิวไม่เคยมีช่องค้นหาเลย
          ทั้งที่พอมีเรื่องเกิน 20 ใบ การหา "ใบของลูกค้า A" ต้องกวาดตาเอง
          ⚠️ ค้นจากสิ่งที่ตาเห็นในตารางเท่านั้น (`matchesQueueSearch`) */}
      {showToolbar && (
      <div className="toolbar">
        <div className={`search-glass ${styles.searchBox}`}>
          <Search size={18} color="var(--text-3)" />
          <input
            type="text" value={search} placeholder="ค้นหาเลขที่ / เรื่อง / ลูกค้า…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {countFilter && (
          /* ตัวกรองที่ใช้อยู่เป็นปุ่มกดล้าง — ต้นแบบหน้างานของฉันใช้ทรงเดียวกัน */
          <Button size="sm" onClick={() => setCountFilter(null)}>
            กรอง: {QUEUE_COUNT_META.find((m) => m.key === countFilter)?.label} ×
          </Button>
        )}
        {/* ── ชุดเดียวกับหน้ารายการดีล: กรอง → จัดกลุ่ม → ย่อ/ขยาย → เรียง+ทิศ ──
            (มติผู้ใช้ 2026-08-11 · แบบ จ) — หน้าดีลประกาศชุดนี้เป็นมาตรฐานของระบบ
            ไว้เองตั้งแต่ 2026-07-18 · คิวคำร้องเคยมีแค่ช่องค้นหา ⇒ ตอบคำถาม
            "ใบของลูกค้านี้มีกี่ใบ" หรือ "ใครถืออยู่บ้าง" ไม่ได้เลย */}
        {showTools && (
          <>
            <FilterPopover
              count={filterCount}
              onClear={() => clearFilters?.()}
              groups={facetGroups}
            />
            <MenuSelect
              icon={Layers}
              label="จัดกลุ่ม"
              title="จัดกลุ่มรายการคำร้อง"
              value={groupBy}
              onChange={(value) => setGroupBy?.(value)}
              options={REQUEST_GROUP_OPTIONS}
              isActive={(value) => value !== "none"}
            />
            {groups.length > 1 && (
              <Button
                iconOnly
                onClick={() => setCollapsed?.(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))}
                title={allCollapsed ? "ขยายทุกกลุ่ม" : "ย่อทุกกลุ่ม"}
                aria-label={allCollapsed ? "ขยายทุกกลุ่ม" : "ย่อทุกกลุ่ม"}
                icon={allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
              />
            )}
            <div className="spacer" />
            <MenuSelect
              icon={ArrowUpDown}
              label="เรียง"
              title="เรียงลำดับ"
              value={sortKey}
              onChange={(key) => setSort?.(key)}
              options={REQUEST_SORT_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
              showValue
              isActive={(key) => key !== "urgency"}
            />
            <Button
              iconOnly
              className="ui-sort-direction"
              onClick={() => toggleSortDir?.()}
              title={sortDir === "asc" ? "น้อย → มาก" : "มาก → น้อย"}
              aria-label={sortDir === "asc" ? "เรียงจากน้อยไปมาก" : "เรียงจากมากไปน้อย"}
              icon={sortDir === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
            />
          </>
        )}
      </div>
      )}

      {loading ? (
        <SkeletonRows rows={4} />
      ) : loadError ? (
        <div className={`glass-panel ${styles.loadError}`}>{loadError}</div>
      ) : visibleRows.length === 0 ? (
        <EmptyState icon={ClipboardList}>
          {/* ⚠️ ว่างเพราะ "ไม่มีงาน" กับว่างเพราะ "ตัวกรองตัดหมด" ต้องอ่านคนละแบบ —
              ไม่งั้นคนจะปิดหน้าไปทั้งที่งานยังอยู่ แค่ถูกกรองอยู่ */}
          {countFilter
            ? `ไม่มีคำร้องที่ "${QUEUE_COUNT_META.find((m) => m.key === countFilter)?.label}" — กดตัวเลขซ้ำเพื่อดูทั้งหมด`
            : emptyText
              || (scope === "queue"
                ? `ไม่มีคำร้องรอ${REQUEST_DEPT_LABELS[dept] ? `ฝ่าย${REQUEST_DEPT_LABELS[dept].name}` : "ฝ่ายคุณ"}ตอบ`
                : "ยังไม่มีคำร้องของคุณ — กด \"เปิดคำร้อง\" เพื่อเริ่ม")}
        </EmptyState>
      ) : view === "list" ? (
        /* ── มุมมองการ์ด — จอตั้ง/จอแคบ ────────────────────────────────────
           ⚠️ **ข้อมูลชุดเดียวกับตาราง จัดกลุ่มด้วย groupQueueRows ตัวเดียวกัน** —
           การ์ดที่เลือกฟิลด์เองจะเพี้ยนจากตารางทันทีที่มีคนเพิ่มคอลัมน์
           ⚠️ ไม่มีแถบสีขอบการ์ด — ความเร่งด่วนบอกด้วยป้ายข้อความเหมือนในตาราง */
        <div className={styles.queueCards}>
          {groups.map((g) => (
            <Fragment key={g.key}>
              {/* หัวกลุ่มกดย่อ/ขยายได้ทั้งสองมุมมอง — ทรงเดียวกับหน้ารายการดีล */}
              {showGroupHeads && (
              <button
                type="button" className={styles.cardGroupLabel} data-group={g.key}
                onClick={() => toggleGroup?.(g.key)} aria-expanded={!isCollapsed(g.key)}
              >
                {isCollapsed(g.key) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                {g.label} · {g.rows.length}
              </button>
              )}
              {!isCollapsed(g.key) && g.rows.map((ask) => {
                const p = requestProgress(ask.items || []);
                const next = requestNextStep(ask);
                const due = requestDueText(ask, { todayIso: today });
                // ใบตีกลับไม่มีกำหนดส่งให้นับถอยหลัง — สิ่งที่ต้องทวงคือค้างมากี่วัน
                const bounced = bouncedDaysText(ask, { todayIso: today });
                return (
                  <button
                    key={ask.id} type="button" className={styles.queueCard}
                    onClick={() => router.push(`/requests/${ask.id}`)}
                  >
                    {/* ⭐ ก้าวถัดไปขึ้นก่อน — เหมือนคอลัมน์แรกของตาราง · การ์ดกับตาราง
                        ต้องตอบคำถามเดียวกันด้วยลำดับเดียวกัน ไม่งั้นคนที่สลับมุมมอง
                        ต้องเรียนรู้สองแบบ */}
                    <span className={styles.cardTop}>
                      {next
                        ? (
                          <span className={`ui-badge ${styles.nextStep}`} data-owner={next.owner}>
                            {next.label}
                          </span>
                        )
                        : <span className={styles.muted}>จบแล้ว</span>}
                      {ask.urgent && <span className={`ui-badge ${styles.urgentTag}`}>ด่วน</span>}
                    </span>
                    <span className={styles.cardTitle}>
                      {ask.title || ask.customerName || "ราคากลาง"}
                    </span>
                    <span className={styles.subText}>
                      {[
                        ask.docNo || "ร่าง",
                        requestKindLabel(ask.kind),
                        ask.title && ask.customerName ? ask.customerName : null,
                        ask.formulaCode ? `สูตร ${ask.formulaCode}` : null,
                      ].filter(Boolean).join(" · ")}
                      {` → ${ask.dept}`}
                    </span>
                    {/* ⭐ ใบตีกลับบอกใครส่งคืนและเพราะอะไรตั้งแต่ในการ์ด (2026-08-11) */}
                    {bounced && (ask.bouncedByName || ask.bounceReason) && (
                      <span className={`${styles.subText} ${styles.overdue}`}>
                        {[ask.bouncedByName, ask.bounceReason].filter(Boolean).join(" · ").slice(0, 70)}
                      </span>
                    )}
                    <span className={styles.cardMeta}>
                      {bounced && (
                        <span className={`ui-badge ${styles.overdue}`}>ตีกลับ · {bounced.note}</span>
                      )}
                      {!bounced && due && (
                        <span className={`ui-badge ${due.overdue ? styles.overdue : ""}`.trim()}>
                          กำหนด {fmtDate(due.date)}{due.note ? ` · ${due.note}` : ""}
                        </span>
                      )}
                      {p.total > 0 && (
                        <span className="ui-badge">{p.done} / {p.total} รายการ</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      ) : (
        <TableScroll cells="stacked">
          {/* ⭐ **คอลัมน์มาจากทะเบียน ไม่ใช่เขียนตายในตาราง** (มติผู้ใช้ 2026-08-11 ·
              แบบ ข) — ของเดิมมีตารางคำร้องสองสำเนา: คิว 4 คอลัมน์กับการ์ดบนหน้า
              ดีล/โครงการ 6 คอลัมน์ · ใบเดียวกันจึงอ่านได้คนละเรื่องสองหน้า และใบ
              ตีกลับ (ม-102) โผล่แค่ในคิว · ดูเหตุผลเต็มที่ `lib/requests/queueColumns.js`
              ⚠️ หัวกับเนื้ออ่านจาก `cols` ตัวเดียวกัน ⇒ สลับลำดับกันไม่ได้อีก
              (เคยสลับกันอยู่สองคอลัมน์: "คืบหน้า" ลอยอยู่เหนือป้ายก้าวถัดไป) */}
          <table className="premium-table">
            <thead>
              <tr>
                {cols.map((key) => (
                  <th
                    key={key}
                    className={`${COL_WIDTH[key] || ""} ${REQUEST_COLUMNS[key].num ? "num" : ""}`.trim() || undefined}
                  >
                    {REQUEST_COLUMNS[key].label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* ⭐ แถวคั่นกลุ่ม — ทำให้ลำดับที่ compareRequestUrgency จัดไว้
                  **มองเห็นได้** · เรียงถูกแล้วแต่คนอ่านไม่รู้ว่าเส้นแบ่งอยู่ตรงไหน
                  ⚠️ จัดกลุ่มจริงที่ groupQueueRows ไม่ใช่แทรกเส้นตอนคีย์เปลี่ยน
                  (ตัวเรียงไม่ได้เรียงตามลำดับกลุ่มเป๊ะ ๆ จะได้หัวข้อซ้ำกลางตาราง) */}
              {groups.map((g) => (
                <Fragment key={g.key}>
                  {showGroupHeads && (
                  <tr className={styles.groupRow} data-group={g.key}>
                    <td colSpan={cols.length}>
                      <button
                        type="button" onClick={() => toggleGroup?.(g.key)}
                        aria-expanded={!isCollapsed(g.key)}
                      >
                        {isCollapsed(g.key) ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                        <strong>{g.label}</strong>
                        <span className="ui-badge">{g.rows.length} {unit}</span>
                      </button>
                    </td>
                  </tr>
                  )}
                  {!isCollapsed(g.key) && g.rows.map((ask) => (
                    <tr
                      key={ask.id} className={styles.rowLink}
                      onClick={() => router.push(`/requests/${ask.id}`)}
                    >
                      {cols.map((key) => (
                        <td key={key} className={REQUEST_COLUMNS[key].num ? "num" : undefined}>
                          {cell(key, ask)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </>
  );

  // ⭐ ห่อด้วยการ์ดหัวข้อ + ป้ายจำนวน ตามต้นแบบหน้างานของฉัน (มติผู้ใช้ 2026-08-08)
  // ⚠️ ป้ายนับ **แถวที่เห็นจริงหลังกรอง** ไม่ใช่จำนวนที่โหลดมา — ไม่งั้นกรองแล้ว
  // ตัวเลขบนหัวการ์ดจะขัดกับจำนวนแถวข้างล่างทันที
  if (!sectionTitle) return body;
  return (
    <WorkspaceSection
      icon={<ClipboardList size={17} />}
      title={sectionTitle}
      subtitle={sectionSubtitle}
      actions={(
        <>
          <span className="ui-badge">{visibleRows.length} {unit}</span>
          {headerActions}
        </>
      )}
    >
      {body}
    </WorkspaceSection>
  );
}
