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
  Building2, ChevronDown, ChevronRight,
  FolderKanban, MessageCircleQuestion, Search, Tag, User, Users,
} from "lucide-react";
import FilterPopover from "@/components/ui/FilterPopover";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import SkeletonRows from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { WorkspaceSection } from "@/components/ui/Workspace";
import { matchesQueueSearch, useQueueBoard } from "@/lib/requests/useQueueBoard";
import { fmtDate, fmtTime, NA } from "@/lib/format";
import styles from "./requestForm.module.css";
import { requestProgress } from "@/lib/deptRequests";
import {
  QUEUE_COUNT_META, bouncedDaysText, groupQueueRows, matchesQueueCount, queueCounts,
  requestDueText, requestQueueStatus,
} from "@/lib/requests/queueBoard";
import { businessDate } from "@/lib/businessDate";
import {
  REQUEST_GROUP_OPTIONS, REQUEST_SORT_OPTIONS, filterRequestRows, groupRequestRows,
  requestFacetOptions, requestFilterCount, sortRequestRows,
} from "@/lib/requests/queueList";
import { REQUEST_COLUMNS, requestColumns } from "@/lib/requests/queueColumns";
import { requestQueueTrack } from "@/lib/requests/queueTrack";
import { requestAssignee } from "@/lib/requests/assign";
import { requestSideText, requestWaitLabel } from "@/lib/requests/replyTurn";
import { requestClosure } from "@/lib/requests/closure";
import { RequestStatusBadge } from "@/components/requests/requestUi";
import StatusBadge from "@/components/ui/StatusBadge";
// รางขั้นตัวเดียวกับตารางใบสั่งขาย/ทะเบียนการชำระ — คำร้องเดินสี่ขั้น (queueTrack)
import StepTrack from "@/components/ui/StepTrack";
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
  // ⚠️ `doc` กว้างขึ้นเพราะรางสี่ขั้นย้ายเข้ามาอยู่ในเซลล์เดียวกัน (2026-08-18)
  const COL_WIDTH = {
    next: styles.colNext, due: styles.colDue, progress: styles.colProgress, doc: styles.colDoc,
    deal: styles.colDeal, created: styles.colDue, closed: styles.colDue,
  };
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

  /* ⭐ **"ไม่จัดกลุ่ม" = ไม่มีหัวกลุ่มจริง ๆ** (มติผู้ใช้ 2026-08-15) — ของเดิมพอเลือก
     "ไม่จัดกลุ่ม" ยังตกไปหา `groupQueueRows` ซึ่งแทรกแถบความเร่ง (ยังไม่มีใครรับ /
     ตีกลับ / เลยกำหนด …) ให้อยู่ดี ⇒ ปุ่มบอกว่าไม่จัดกลุ่มแต่จอยังมีหัวข้อคั่น
     ซึ่งขัดกับตารางอื่นทั้งระบบที่ "ไม่จัดกลุ่ม" แปลว่าแบนราบ
     ⚠️ **การ์ดที่ฝังในหน้าดีล/โครงการ (`showTools` เท็จ) ยังจัดตามความเร่งเหมือนเดิม**
     — ที่นั่นไม่มีปุ่มให้เปิดกลุ่มคืน และแถบความเร่งคือสิ่งเดียวที่บอกว่าใบไหนต้องรีบ
     ⚠️ ลำดับความเร่งไม่ได้หายไปด้วย — ยังเรียงด้วย `compareRequestUrgency` ตามเดิม
     (ถ้าหน้านั้นตั้งต้นด้วย `urgency`) แค่ไม่มีเส้นคั่นให้เห็นเป็นบล็อก */
  const groups = useMemo(() => {
    if (showTools) {
      return groupRequestRows(visibleRows, groupBy)
        || [{ key: "__flat", label: "", rows: visibleRows, flat: true }];
    }
    return groupQueueRows(visibleRows, { todayIso: today })
      .map((g) => ({ key: g.group, label: g.label, rows: g.rows }));
  }, [visibleRows, groupBy, today, showTools]);

  /* ⚠️ **หัวกลุ่มหายเมื่อมีกลุ่มเดียวและเปลี่ยนการจัดกลุ่มไม่ได้** — การ์ดบนหน้าดีล
     มักมี 1-3 ใบ · หัวข้อ "ยังไม่มีใครรับเรื่อง · 1" เหนือแถวเดียวคือเส้นที่ไม่ได้
     แบ่งอะไร · ในคิวยังโชว์เสมอ เพราะที่นั่นหัวกลุ่มคือสิ่งที่ทำให้ลำดับความเร่งมองเห็นได้ */
  const collapsedSet = collapsed instanceof Set ? collapsed : new Set();
  const isCollapsed = (key) => collapsedSet.has(key);
  const allCollapsed = groups.length > 0 && groups.every((g) => collapsedSet.has(g.key));
  // แบนราบ (ไม่จัดกลุ่ม) = ไม่มีหัวกลุ่มให้กด · การ์ดฝังยังโชว์เมื่อมีมากกว่าหนึ่งกลุ่ม
  const flatMode = groups.length === 1 && groups[0]?.flat;
  const showGroupHeads = !flatMode && (showTools || groups.length > 1);
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

  /* ── ก้อน "คืบหน้า" — ป้ายสถานะ + ราง + ตัวเลขรายบรรทัด ──────────────────
     ⭐ **ยุบเข้าเซลล์ "คำร้อง"** (มติผู้ใช้ 2026-08-18) — ของเดิมเป็นคอลัมน์ท้ายสุด
     ⇒ ตากวาดจากเลขที่ใบ (ซ้ายสุด) ไปหาว่ามันเดินถึงไหน (ขวาสุด) ข้ามทั้งตารางทุกแถว
     · สองช่องนี้ตอบคำถามชุดเดียวกัน ("ใบไหน · ถึงไหนแล้ว") จึงอยู่เซลล์เดียวกัน
     ⚠️ **ก้อนเดียว สองที่วาง** — คีย์ `progress` ยังอยู่ในทะเบียนและยังมีตัววาด
     (หน้าอื่นส่งรายชื่อคอลัมน์เองได้) · ห้ามก๊อปโค้ดแยกสองชุด ไม่งั้นเพี้ยนหากัน
     ⚠️ วาดที่เดียวต่อแถวเสมอ — เซลล์ "คำร้อง" จะวาดก็ต่อเมื่อ **ไม่มี** คอลัมน์
     `progress` แยกอยู่ */
  const progressBlock = (ask, p) => {
    const queueStatus = requestQueueStatus(ask);
    const track = requestQueueTrack(ask);
    /* ⚠️ **สามชิ้นบนของก้อนนี้เป็นของคอลัมน์ `next`** (มติผู้ใช้ 2026-08-20 · เอาป้าย
       สถานะกลับเข้าตาราง) — ป้าย · ชื่อคนที่ถืออยู่ · เหตุผลตีกลับ วาดที่นั่นแล้ว ⇒
       ที่นี่เหลือแค่รางกับตัวเลข ไม่งั้นข้อมูลเดียวกันขึ้นสองช่องในแถวเดียว */
    const hasStatusCol = cols.includes("next");
    return (
      <>
        {/* ⭐ **ป้ายกับรางไม่ขึ้นพร้อมกัน** (มติผู้ใช้ 2026-08-18 — "ป้ายกับเส้นมันซ้ำมั้ย")
            ทั้งคู่ตอบคำถามเดียวกัน ("ใบนี้อยู่ขั้นไหน") ⇒ ในตารางใช้ **ราง** อย่างเดียว
            ⭐ **ไม่สลับตามความกว้างแล้ว** (มติผู้ใช้ 2026-08-18 รอบสอง: *"อยากให้เห็นเส้น
            จนถึงแท็บเล็ต ไม่ติดที่จะเลื่อนแนวนอน ดีกว่าข้อมูลหาย"*) — ของเดิมสลับเป็นป้าย
            ที่ ≤1200px ตามตาราง SO · แต่ตารางคิวโผล่เฉพาะจอนอนกว้างกว่า 820px อยู่แล้ว
            (`useResponsiveView` — แคบกว่านั้นเป็นการ์ดซึ่งมีป้ายของตัวเอง) ⇒ กติกาความกว้าง
            อีกชั้นมีแต่ทำให้ทรงเปลี่ยนหลายจังหวะโดยไม่ได้อะไรกลับมา
            ⚠️ ใบยกเลิกไม่มีราง ⇒ ยังต้องมีป้าย ไม่งั้นเซลล์จะว่างเปล่า */}
        {track.cancelled && !hasStatusCol && (
          <StatusBadge tone={queueStatus.tone} size="sm">{queueStatus.label}</StatusBadge>
        )}
        {/* ใครถืออยู่ (มติ 2026-08-11 · แบบ ก) — ป้ายบอกได้แค่ *ฝั่งไหน*
            ชื่อคนที่รับเรื่องคือสิ่งที่ทำให้ตามงานต่อได้จริง */}
        {!hasStatusCol && queueStatus.owner === "dept" && requestAssignee(ask).name
          && !cols.includes("owner") && (
          <div className={styles.subText}>{requestAssignee(ask).name}</div>
        )}
        {/* ใบตีกลับ — ใครส่งคืนและเพราะอะไร อ่านได้จากคิวเลย */}
        {!hasStatusCol && queueStatus.bounced && (ask.bouncedByName || ask.bounceReason) && (
          <div className={`${styles.subText} ${styles.overdue}`}>
            {[ask.bouncedByName, ask.bounceReason].filter(Boolean).join(" · ").slice(0, 70)}
          </div>
        )}
        {!track.cancelled && <StepTrack steps={track.steps} ariaLabel="ขั้นของคำร้อง" compact />}
        {/* หน่วยมาจากทะเบียนหัวข้อ — พัฒนากลิ่นนับเป็น "กลิ่น" ·
            ใบที่ไม่มีบรรทัด (สอบถาม) ไม่มีตัวเลขให้นับ ⇒ ไม่เขียนอะไรเลย
            ดีกว่าเขียน N/A ซ้ำทุกแถวใต้ราง */}
        {p.total > 0 && (
          <div className={styles.subText}>{p.done} / {p.total} {requestLineNoun(ask.kind)}</div>
        )}
      </>
    );
  };

  const cell = (key, ask) => {
    const due = requestDueText(ask, { todayIso: today });
    // ใบตีกลับไม่มีกำหนดส่งให้นับถอยหลัง — สิ่งที่ต้องทวงคือค้างมากี่วัน
    const bounced = bouncedDaysText(ask, { todayIso: today });
    const p = requestProgress(ask.items || []);
    switch (key) {
      /* ⚠️ สองโทน: ตาฝ่าย / รออีกฝั่ง — **สีสงวนให้เจ้าของก้าว** ไม่ใช่ให้ชนิดคำร้อง
         ⭐ `ui-badge-cell` ทำให้ป้ายทุกแถวกว้างเท่ากัน ⇒ ขอบเรียงเป็นเส้นตรงลงมา
         ตากวาดคอลัมน์ได้เป็นแนว (กฎ 1 · UI_DESIGN_SYSTEM.md) */
      /* ⭐ **ช่องสถานะช่องเดียว มีทั้งคำและสี** (มติผู้ใช้ 2026-08-15) — คำมาจาก
         `requestQueueStatus` (ก้าวถัดไป + สถานะจริงของใบที่จบแล้ว) · โทนบอกว่า
         **ใครค้าง**: ฟ้า = ตาฝ่ายเรา · เทา = รอฝั่งอื่น · เหลือง = ยังไม่มีใครรับ ·
         แดง = ตีกลับ ⇒ กวาดตาลงคอลัมน์แล้วรู้ทันทีว่าใบไหนเป็นงานเรา
         ⚠️ ใช้ `<StatusBadge>` กลาง ไม่ใช่ `.ui-badge` + สีเองแบบเดิม — โทนสี
         ประกาศที่ Badge.module.css ที่เดียวทั้งระบบ */
      /* ⭐ **ป้าย + ราง อยู่คอลัมน์เดียวกัน** (มติผู้ใช้ 2026-08-20) — สองอย่างนี้ตอบ
         คำถามต่อกันเป็นชุด ("ตาใคร" แล้ว "เดินถึงไหนแล้ว") · ของเดิมป้ายอยู่คอลัมน์แรก
         ส่วนรางอยู่ท้ายเซลล์ "คำร้อง" ⇒ ตาต้องกระโดดข้ามชื่อเรื่องกลับไปกลับมา
         ⚠️ เซลล์ "คำร้อง" เหลือ **ตัวตนของใบล้วน ๆ** (เลขที่ · เรื่อง · ชนิด/ลูกค้า)
         และไม่วาดรางซ้ำเมื่อมีคอลัมน์นี้อยู่ */
      case "next": {
        const queueStatus = requestQueueStatus(ask);
        const track = requestQueueTrack(ask);
        return (
          <>
            <StatusBadge tone={queueStatus.tone} size="sm">{queueStatus.label}</StatusBadge>
            {/* ⚠️ **ไม่มีชื่อผู้รับผิดชอบใต้ป้ายแล้ว** (มติผู้ใช้ 2026-08-20 — ทับมติ
                2026-08-11 แบบ ก ที่ยกชื่อคนมาไว้ตรงนี้) · ชื่อบัญชีในระบบยาวจริง
                ("ProjectCo.Jeab : Project Management, R&D") ⇒ ตกสองบรรทัดในช่องแคบ
                แล้วกลบทั้งป้ายและรางที่อยู่ใต้มัน — โรคเดียวกับที่เคยทำให้ป้ายปุ่ม
                "มอบหมาย" ต้องตัดชื่อออก (IS-26080021)
                ⚠️ อยากเห็นว่าใครถือ = เปิดคอลัมน์ "ผู้รับผิดชอบ" (มีในทะเบียนคอลัมน์
                อยู่แล้ว) หรือดูในใบ — ไม่ใช่ยัดกลับมาที่นี่ */}
            {/* ใบตีกลับ — ใครส่งคืนและเพราะอะไร อ่านได้จากคิวเลย */}
            {queueStatus.bounced && (ask.bouncedByName || ask.bounceReason) && (
              <div className={`${styles.subText} ${styles.overdue}`}>
                {[ask.bouncedByName, ask.bounceReason].filter(Boolean).join(" · ").slice(0, 70)}
              </div>
            )}
            {/* ใบยกเลิกไม่มีรางให้เดิน — ป้ายด้านบนพูดจบแล้ว (ลากรางที่ตายแล้วมาแสดง
                ทำให้อ่านเหมือนใบยังเดินอยู่ · กติกาเดียวกับ `queueTrack`) */}
            {!track.cancelled && (
              <div className={styles.docProgress}>
                <StepTrack steps={track.steps} ariaLabel="ขั้นของคำร้อง" compact />
                {p.total > 0 && (
                  <div className={styles.subText}>
                    {p.done} / {p.total} {requestLineNoun(ask.kind)}
                  </div>
                )}
              </div>
            )}
          </>
        );
      }
      /* ⭐ **เลขที่บน · เรื่องล่าง** (มติผู้ใช้ 2026-08-17) — ทรงเดียวกับเซลล์แรกของ
         ตาราง QT/SO · เลขที่เป็น `mono` ตัวหนา ⇒ ตัวเลขตรงกันทุกแถว กวาดตาเทียบได้
         ⚠️ ใบร่างยังไม่มีเลข — เขียน "ร่าง" ไม่ใช่ขีด · เลขออกตอนกดส่ง (trigger ทำให้
         `docNo` แก้ไม่ได้อีก) ⇒ ช่องว่างที่นี่อ่านได้ว่าข้อมูลหาย ทั้งที่ยังไม่มีเลขจริง
         ⚠️ บรรทัดรองตัดชนิด/ลูกค้า/ฝ่ายออกเมื่อมีคอลัมน์ของมันเองอยู่แล้ว (ชุด "linked"
         ไม่มีคอลัมน์พวกนั้น จึงต้องได้ครบในเซลล์เดียว) */
      case "doc":
        return (
          <>
            <div className={styles.docNoCell}>
              {ask.docNo
                ? <strong className="mono">{ask.docNo}</strong>
                : <span className={styles.muted}>ร่าง</span>}
              {/* ⭐ **ป้ายด่วนเกาะเลขที่ใบ** (มติผู้ใช้ 2026-08-19) — ย้ายมาจากเซลล์
                  "ชนิด" ที่มันไปดันให้ทุกแถวสูงขึ้นอีกบรรทัด · ตรงนี้เกาะท้ายเลขที่
                  ในบรรทัดเดิม ⇒ ความเร่งอ่านคู่กับตัวใบเลย ไม่กินความสูงเพิ่ม
                  ⚠️ หลบให้คอลัมน์ "ด่วน" แยกเมื่อผู้เรียกใส่มาเอง — ไม่งั้นป้ายเดียวกัน
                  ขึ้นสองช่องในแถวเดียว (เซลล์ "ชนิด" หลบให้เซลล์นี้ด้วยกติกาเดียวกัน) */}
              {ask.urgent && !cols.includes("urgent") && (
                <span className={`ui-badge ${styles.urgentTag}`}>ด่วน</span>
              )}
            </div>
            <div className={styles.docCell}>
              {ask.title || ask.customerName || <span className={styles.muted}>ราคากลาง</span>}
            </div>
            <div className={styles.subText}>
              {[
                cols.includes("kind") ? null : requestKindLabel(ask.kind),
                /* ลูกค้าอยู่ในบรรทัดรองเฉพาะตอนไม่มีคอลัมน์ของตัวเอง (ชุด "linked") */
                !cols.includes("customer") && ask.title && ask.customerName ? ask.customerName : null,
                ask.formulaCode ? `สูตร ${ask.formulaCode}` : null,
                /* วันที่ร้องขออยู่ในบรรทัดรองเฉพาะตอนไม่มีคอลัมน์ของตัวเอง (การ์ดบนหน้าดีล) */
                ask.createdAt && !cols.includes("created") ? `ร้องขอ ${fmtDate(ask.createdAt)}` : null,
              ].filter(Boolean).join(" · ")}
              {/* รหัสลูกค้าเกาะท้ายชื่อกิจการ — ตัวเชื่อมกับรหัสกลิ่น/MU · ย้ายไปอยู่
                  คอลัมน์ "ลูกค้า" แทนเมื่อคอลัมน์นั้นมีอยู่ */}
              {!cols.includes("customer") && ask.customerArCode
                ? <span className={styles.arCode}>{ask.customerArCode}</span> : null}
              {/* ฝ่ายปลายทางอยู่ท้ายบรรทัดรองเฉพาะตอนไม่มีที่อื่นให้อยู่ — คอลัมน์
                  "ถึงฝ่าย" ของตัวเอง (ชุด linked) หรือใต้ชนิด (ชุด queue) */}
              {cols.includes("dept") || cols.includes("kind") ? "" : ` → ${ask.dept}`}
            </div>
            {/* ⚠️ **ก้อนสถานะ+ราง ย้ายไปคอลัมน์ "สถานะ" แล้ว** (มติผู้ใช้ 2026-08-20) —
                วาดที่นี่เฉพาะตอนไม่มีทั้งคอลัมน์ `next` และ `progress` (การ์ดบนหน้าดีล
                ส่งรายชื่อคอลัมน์เอง) ⇒ ไม่มีทางขึ้นสองที่ในตารางเดียว */}
            {!cols.includes("progress") && !cols.includes("next") && (
              <div className={styles.docProgress}>{progressBlock(ask, p)}</div>
            )}
          </>
        );
      /* ⭐ **ชนิดบน · ฝ่ายปลายทางล่าง** — ป้ายด่วนย้ายไปเกาะเลขที่ใบในเซลล์ "คำร้อง"
         แล้ว (มติผู้ใช้ 2026-08-19) · ของเดิมอยู่บรรทัดบนของเซลล์นี้ ⇒ แถวที่ด่วนสูงกว่า
         แถวอื่นทั้งแถวเพื่อป้ายเดียว
         ⚠️ ยังวาดที่นี่ได้ **เฉพาะตอนไม่มีเซลล์ `doc` ให้เกาะ** (ผู้เรียกส่งรายชื่อ
         คอลัมน์เองได้) — ไม่งั้นป้ายจะหายไปเงียบ ๆ เมื่อมีแต่คอลัมน์ชนิด
         ⚠️ ฝ่ายอยู่ที่นี่เฉพาะตอนไม่มีคอลัมน์ "ถึงฝ่าย" แยก — ไม่งั้นฝ่ายเดียวกัน
         ขึ้นสองช่องในแถวเดียว (กติกาเดียวกับที่เซลล์ `doc` ใช้กับชนิด/ลูกค้า) */
      case "kind":
        return (
          <>
            {ask.urgent && !cols.includes("urgent") && !cols.includes("doc") && (
              <div><span className={`ui-badge ${styles.urgentTag}`}>ด่วน</span></div>
            )}
            <div className={styles.kindCell}>{requestKindLabel(ask.kind)}</div>
            {!cols.includes("dept") && ask.dept
              ? <div className={styles.subText}>→ {ask.dept}</div> : null}
          </>
        );
      /* ⭐ **สองบรรทัด: รหัส AR + แบรนด์ บน · ชื่อกิจการ ล่าง** (มติผู้ใช้ 2026-08-20)
         ยังเป็นทรง "รหัสบน · ชื่อล่าง" (มติ 2026-08-12) แต่แบรนด์ขึ้นไปเกาะบรรทัดรหัส
         แทนที่จะกินบรรทัดที่สาม ⇒ ทุกแถวเตี้ยลงหนึ่งบรรทัดในคิวที่มี 100+ ใบ
         ⚠️ แบรนด์มาจากดีลต้นทาง ⇒ ใบที่ไม่ผูกดีลไม่มีแบรนด์ ซึ่งถูกแล้ว ไม่ใช่ข้อมูลหาย
         ⚠️ แบรนด์ยาวถูกตัดด้วย ellipsis ไม่ใช่ตกบรรทัด — ตกบรรทัดเมื่อไรก็กลับไปเป็น
         สามบรรทัดเหมือนเดิม (รหัสห้ามตัด จึงเป็นตัวที่ได้ที่ก่อนเสมอ) */
      case "customer":
        if (!ask.customerName && !ask.customerArCode) return <span className={styles.muted}>{NA}</span>;
        return (
          <>
            {(ask.customerArCode || ask.customerBrand) && (
              <div className={styles.customerHead}>
                {ask.customerArCode ? <span className="ar-code ar-code-block">{ask.customerArCode}</span> : null}
                {/* จุดคั่นแบบเดียวกับ "รหัส · ชื่อ" ที่ใช้ทั้งระบบ — ขึ้นเฉพาะตอนมีของ
                    ทั้งสองข้าง ไม่งั้นจะเหลือจุดลอยหน้าหรือหลังคำ */}
                {ask.customerArCode && ask.customerBrand
                  ? <span className={styles.dot} aria-hidden="true">·</span> : null}
                {ask.customerBrand
                  ? <span className={`${styles.subText} ${styles.customerBrand}`}>{ask.customerBrand}</span>
                  : null}
              </div>
            )}
            <div className={styles.customerCell}>{ask.customerName || <span className={styles.muted}>{NA}</span>}</div>
          </>
        );
      /* ⚠️ ช่องว่างเมื่อไม่ด่วน ไม่ใช่ขีดหรือคำว่า "ปกติ" — คอลัมน์นี้มีไว้ให้ **สะดุดตา**
         ตอนกวาดลงมา · เติมอะไรทุกแถวเท่ากับกลบสิ่งที่ตั้งใจให้เห็น */
      case "urgent":
        return ask.urgent ? <span className={`ui-badge ${styles.urgentTag}`}>ด่วน</span> : null;
      /* ⭐ **รหัสบน · ชื่อดีลล่าง** (มติผู้ใช้ 2026-08-20) — ทรงเดียวกับเซลล์ลูกค้า
         ⚠️ ใบภายในไม่ผูกดีลได้ขีด ไม่ใช่ช่องว่าง (ขีด = ถามแล้วไม่มี · ช่องว่าง = ระบบ
         ไม่รู้ ซึ่งคนละเรื่อง — กติกาเดียวกับทั้งระบบ) */
      case "deal":
        if (!ask.dealId) return <span className={styles.muted}>{NA}</span>;
        return (
          <>
            <div className={styles.docNoCell}>
              <strong className="mono">{ask.dealCode || ask.dealId}</strong>
            </div>
            {ask.dealName ? <div className={styles.subText}>{ask.dealName}</div> : null}
          </>
        );
      /* ⭐ **วันที่อยู่บรรทัดบนเสมอ ทั้งสามคอลัมน์วัน** (มติผู้ใช้ 2026-08-20) — ของเดิม
         ช่องกำหนดส่งเอา "อีก 15 วัน" ขึ้นก่อน ⇒ สามคอลัมน์ที่อยู่ติดกันอ่านคนละทรง
         ตากวาดแนวนอนแล้วสะดุดทุกช่อง · คำขยาย (เหลือกี่วัน · ใครตอบเมื่อไร) ลงบรรทัดรอง
         ⭐ **เวลาต่อท้ายวันที่ร้องขอ** — ใบที่เข้ามาวันเดียวกันหลายใบ เรียงลำดับก่อนหลัง
         ไม่ได้เลยถ้ามีแต่วันที่ (คิวตั้งต้นเรียงด้วยวันที่ร้องขอ) */
      case "created":
        if (!ask.createdAt) return <span className={styles.muted}>{NA}</span>;
        return (
          <>
            <div className={styles.smallCell}>{fmtDate(ask.createdAt)}</div>
            <div className={styles.subText}>{fmtTime(ask.createdAt)}</div>
          </>
        );
      /* ⭐ สองฝั่งของการปิดเรื่อง: บน = ฝ่ายผู้รับตอบเสร็จ · ล่าง = ผู้ขอกดปิด
         ⚠️ ใบที่ยังไม่จบต้องอ่านออกว่า "ยังไม่ปิด" ไม่ใช่ช่องว่างที่อ่านได้ว่าข้อมูลหาย */
      case "closed": {
        // วันที่ขึ้นก่อน คำอธิบายลงบรรทัดรอง (กติกาเดียวกับอีกสองช่องวัน)
        /* 🐞 ใบยกเลิกเก็บเวลาไว้ที่ `cancelledAt` ไม่ใช่ `closedAt` ⇒ เคยขึ้น "ยังไม่ปิด"
           ทั้งที่ใบจบไปแล้ว (เจอตอนไล่ดูแท็บประวัติ 2026-08-15) · ยกเลิกไม่มีสองฝั่ง
           ให้แยก — ไม่มีใครตอบ ไม่มีใครปิด มีแค่วันที่ยกเลิก */
        if (ask.cancelledAt) {
          return (
            <>
              <div className={styles.smallCell}>{fmtDate(ask.cancelledAt)}</div>
              <div className={styles.subText}>ยกเลิก</div>
            </>
          );
        }
        if (!ask.answeredAt && !ask.closedAt) return <span className={styles.muted}>ยังไม่ปิด</span>;
        /* ⚠️ **บรรทัดบนต้องเป็นวันเสมอ** — ใบที่ฝ่ายตอบแล้วแต่ผู้ขอยังไม่ปิด ถ้าเอา
           คำว่า "ผู้ขอยังไม่ปิด" ขึ้นก่อน คอลัมน์นี้จะมีบางแถวขึ้นต้นด้วยคำ บางแถว
           ขึ้นต้นด้วยเลข ⇒ กวาดตาลงคอลัมน์แล้วเทียบวันกันไม่ได้ · เอาวันที่มีจริง
           (ปิด > ตอบ) ขึ้นบน แล้วให้บรรทัดรองบอกว่าวันนั้นคือวันอะไรและค้างที่ใคร */
        /* ⭐ **ปิดสองฝั่ง** (มติผู้ใช้ 2026-08-20) — ตราเดียวยังไม่จบ ⇒ บรรทัดบนโชว์วัน
           ของฝั่งที่กดแล้ว บรรทัดรองบอกว่ารออีกฝั่ง · ครบเมื่อไรถึงโชว์วันทั้งคู่ */
        if (!requestClosure(ask).complete) {
          return (
            <>
              <div className={styles.smallCell}>{fmtDate(ask.closedAt || ask.answeredAt)}</div>
              <div className={styles.subText}>
                {ask.answeredAt
                  ? requestWaitLabel(ask, "requester", "ปิด")
                  : requestWaitLabel(ask, "dept", "ตอบ")}
              </div>
            </>
          );
        }
        return (
          <>
            <div className={styles.smallCell}>{fmtDate(ask.closedAt || ask.answeredAt)}</div>
            <div className={styles.subText}>
              {[
                ask.answeredAt ? `${requestSideText(ask, "dept", "ตอบ")} ${fmtDate(ask.answeredAt)}` : null,
                ask.closedAt ? `${requestSideText(ask, "requester", "ปิด")} ${fmtDate(ask.closedAt)}` : null,
              ].filter(Boolean).join(" · ")}
            </div>
          </>
        );
      }
      case "dept":
        return <span className={styles.smallCell}>{ask.dept}</span>;
      case "owner": {
        // ผู้รับผิดชอบก่อน แล้วถอยไปคนที่กดรับเรื่อง (mig 0230 · `requestAssignee`)
        const who = requestAssignee(ask);
        return who.name || <span className={styles.muted}>ยังไม่มีผู้รับ</span>;
      }
      /* ⭐ **"เหลือกี่วัน" เป็นบรรทัดหลัก วันที่เป็นบรรทัดรอง** (มติผู้ใช้ 2026-08-11 ·
         แบบ ก) — คนกวาดคิวถามว่า *ทันไหม* ไม่ได้ถามว่า *วันที่เท่าไร*
         ⚠️ ใบที่ยังไม่มีใครให้วันขึ้น "ยังไม่ให้วัน" ไม่ใช่ขีด — ขีดอ่านได้ทั้ง
         "ไม่มีกำหนด" และ "ระบบไม่รู้" ซึ่งคนละเรื่องกัน */
      case "due":
        if (bounced) {
          return (
            <>
              <div className={styles.smallCell}>{fmtDate(bounced.date)}</div>
              <div className={`${styles.subText} ${styles.overdue}`}>{bounced.note}</div>
            </>
          );
        }
        if (due) {
          return (
            <>
              <div className={styles.smallCell}>{fmtDate(due.date)}</div>
              {due.note && (
                <div className={`${styles.subText} ${due.overdue ? styles.overdue : ""}`.trim()}>
                  {due.note}
                </div>
              )}
            </>
          );
        }
        return <span className={styles.muted}>ยังไม่ให้วัน</span>;
      /* ⭐ **สถานะ + รางสี่ขั้น + ตัวเลขรายบรรทัด อยู่ช่องเดียวกัน** (มติผู้ใช้ 2026-08-17) —
         ป้ายตอบว่า "ตอนนี้ค้างที่ใคร" · รางตอบว่า "ผ่านอะไรมาแล้วและเหลืออะไร" ·
         ตัวเลขตอบว่า "ของในใบเสร็จไปกี่ชิ้น" ⇒ สามคำถามที่คนกวาดคิวถามต่อกันเป็นชุด
         ⚠️ ตรรกะของรางอยู่ที่ `lib/requests/queueTrack.js` (มีเทสต์) — ที่นี่วาดอย่างเดียว
         ⚠️ ใบยกเลิกไม่มีราง — ป้ายอย่างเดียว (รางที่ตายแล้วอ่านเหมือนใบยังเดินอยู่) */
      case "progress":
        return progressBlock(ask, p);
      case "status":
        return <RequestStatusBadge request={ask} />;
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
          <input autoComplete="off"
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
            {/* ปุ่มจัดกลุ่ม/เรียงมาจากชุดกลาง `ui/ViewMenus` (ยกมารวม 2026-08-15) —
                เดิมประกอบเองที่นี่ ซึ่งแปลว่าไอคอน/ป้าย/tooltip จะเพี้ยนจากตารางอื่นทีละนิด */}
            <GroupMenu
              title="จัดกลุ่มรายการคำร้อง"
              value={groupBy}
              onChange={(value) => setGroupBy?.(value)}
              options={REQUEST_GROUP_OPTIONS}
            />
            {groups.length > 1 && (
              <CollapseAllButton
                collapsed={allCollapsed}
                onToggle={() => setCollapsed?.(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))}
              />
            )}
            <div className="spacer" />
            <SortMenu
              value={sortKey}
              defaultValue="urgency"
              onChange={(key) => setSort?.(key)}
              options={REQUEST_SORT_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
            />
            <SortDirButton dir={sortDir} onToggle={() => toggleSortDir?.()} />
          </>
        )}
      </div>
      )}

      {loading ? (
        <SkeletonRows rows={4} />
      ) : loadError ? (
        <div className={`glass-panel ${styles.loadError}`}>{loadError}</div>
      ) : visibleRows.length === 0 ? (
        <EmptyState icon={MessageCircleQuestion}>
          {/* ⚠️ ว่างเพราะ "ไม่มีงาน" กับว่างเพราะ "ตัวกรองตัดหมด" ต้องอ่านคนละแบบ —
              ไม่งั้นคนจะปิดหน้าไปทั้งที่งานยังอยู่ แค่ถูกกรองอยู่ */}
          {countFilter
            ? `ไม่มีคำร้องที่ "${QUEUE_COUNT_META.find((m) => m.key === countFilter)?.label}" — กดตัวเลขซ้ำเพื่อดูทั้งหมด`
            : emptyText
              || (scope === "queue"
                ? `ไม่มีคำร้องรอ ${dept || "ฝ่ายคุณ"} ตอบ`
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
                {g.label}
                {g.sub ? <span className={styles.arCode}>{g.sub}</span> : null}
                {` · ${g.rows.length}`}
              </button>
              )}
              {!isCollapsed(g.key) && g.rows.map((ask) => {
                const p = requestProgress(ask.items || []);
                const cardStatus = requestQueueStatus(ask);
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
                    {/* การ์ดใช้ป้ายสถานะชุดเดียวกับตาราง — สองมุมมองต้องพูดตรงกัน */}
                    <span className={styles.cardTop}>
                      <StatusBadge tone={cardStatus.tone} size="sm">{cardStatus.label}</StatusBadge>
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
                        // วันที่ร้องขอ — ชุดเดียวกับตาราง (การ์ดกับตารางต้องพูดตรงกัน)
                        ask.createdAt ? `ร้องขอ ${fmtDate(ask.createdAt)}` : null,
                      ].filter(Boolean).join(" · ")}
                      {ask.customerArCode ? <span className={styles.arCode}>{ask.customerArCode}</span> : null}
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
                        {g.sub ? <span className={styles.arCode}>{g.sub}</span> : null}
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
                        <td
                          key={key}
                          className={REQUEST_COLUMNS[key].num ? "num" : undefined}
                        >
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
      icon={<MessageCircleQuestion size={17} />}
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
