"use client";
// ── ภาพรวมฝ่ายวิจัยและพัฒนา (P2 · ม-29 · Q34 ก) ──────────────────────────
//
// ⭐ ตอบคำถามเดียว: **"งานของฝ่ายค้างตรงไหน และอะไรใกล้ถึงกำหนด"**
//
// ⚠️ **ยังไม่มีสถิติ/กราฟโดยตั้งใจ** — ทั้งระบบมีคำร้องหลักหน่วย กราฟที่มีจุดเดียว
// แย่กว่าไม่มีกราฟ · เติมเมื่อมีของจริงพอ (Q34: "โครงหน้าเผื่อไว้")
//
// ⚠️ ใช้ primitive กลางทั้งหน้า (`QueueCountStrip` · `RequestQueuePanel` ·
// `WorkspaceSection` · `Button`) — ห้ามเขียนคลาสดิบของชั้นเก่าเอง
// (`npm run audit:ui` มี ratchet คุมยอดชั้นเก่าไว้)
//
// ⭐ **หน้านี้ไม่มีตารางของตัวเองแล้ว** (มติผู้ใช้ 2026-08-08) — เดิมเขียนตาราง 6
// คอลัมน์ไว้เอง ส่วนคิวเปลี่ยนเป็น 4 คอลัมน์ไปแล้ว ⇒ สองหน้าที่ห่างกันคลิกเดียว
// กลายเป็นคนละดีไซน์ · ทั้งแถบตัวเลขและตารางใช้ของชุดเดียวกับ `/rd/requests` แล้ว
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import Workspace, { WorkspaceSection } from "@/components/ui/Workspace";
import Button from "@/components/ui/Button";
import ViewSwitcher from "@/components/ui/ViewSwitcher";
import { businessDate } from "@/lib/businessDate";
import {
  nextUpRows, queueCounts, requestNextStep, startHereRequest,
} from "@/lib/requests/queueBoard";
import QueueCountStrip from "@/components/requests/QueueCountStrip";
import { useQueueBoard } from "@/lib/requests/useQueueBoard";
import RequestQueuePanel from "@/components/requests/RequestQueuePanel";
import StartHereCard from "@/components/requests/StartHereCard";

const DEPT = "RD";

export default function RdOverviewPage() {
  const router = useRouter();
  const board = useQueueBoard();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const res = await fetch("/api/sa/requests", { cache: "no-store" });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error || "โหลดคำร้องไม่สำเร็จ");
      setRequests(Array.isArray(d) ? d : []);
    } catch (e) { setLoadError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // วันไทย ไม่ใช่วัน UTC — ก่อนเจ็ดโมงเช้า toISOString() ยังให้เมื่อวาน แล้ว
  // "เลยกำหนด" จะนับผิดไปหนึ่งวันทุกเช้า
  const today = businessDate();
  // ⚠️ นับจาก **ใบของฝ่าย** เท่านั้น — `requests` ดิบมีใบที่คน RD เปิดถึงฝ่ายอื่นปนอยู่
  // ด้วย ซึ่งไม่ใช่งานที่ฝ่ายนี้ต้องตอบ · ตัวเลขที่นี่ต้องตรงกับหน้าคิวเป๊ะ ๆ
  const deptRows = useMemo(
    () => requests.filter((r) => r.dept === DEPT && r.status !== "draft"),
    [requests],
  );
  const counts = queueCounts(deptRows, { todayIso: today });
  // ⚠️ **เฉพาะใบที่รอฝ่ายอยู่** — `deptRows` มีใบที่ฝ่ายทำเสร็จแล้วรอฝ่ายขายไปรับ
  // ปนอยู่ด้วย · ชี้ใบพวกนั้นเป็น "เริ่มที่นี่" คือสั่งให้คน RD ไปทำงานที่ไม่ใช่ของตัวเอง
  const startHere = useMemo(
    () => startHereRequest(
      deptRows.filter((r) => requestNextStep(r)?.owner === "dept"),
      { todayIso: today },
    ),
    [deptRows, today],
  );
  /* ⭐ **คิวถัดไป ไม่ใช่ "ใกล้ถึงกำหนด"** (มติผู้ใช้ 2026-08-11 · แบบ ก) — ก้อนที่สอง
     ของหน้าเคยกรองด้วย `committedDueDate` 7 วัน ⇒ **ใบที่ยังไม่มีใครรับหายหมด**
     เพราะยังไม่มีใครให้วัน · ของด่วนที่สุดของฝ่ายจึงไม่เคยโผล่บนหน้าภาพรวมเลย
     ⚠️ เรียงชุดเดียวกับการ์ด "เริ่มที่นี่" และตัดใบที่การ์ดชี้ออกให้แล้ว (`nextUpRows`)
     — เรียงคนละชุดเมื่อไร การ์ดจะชี้ใบหนึ่งแต่ตารางขึ้นอีกใบเป็นอันดับหนึ่ง */
  const nextUp = useMemo(
    () => nextUpRows(
      deptRows.filter((r) => requestNextStep(r)?.owner === "dept"),
      { todayIso: today, limit: 5 },
    ),
    [deptRows, today],
  );

  return (
    <Workspace
      icon={<FlaskConical size={22} />}
      title="ภาพรวมฝ่ายวิจัยและพัฒนา"
      subtitle="งานที่ค้างอยู่กับฝ่าย และของที่ใกล้ถึงกำหนดที่รับปากไว้"
    >
      {/* ⚠️ ระยะห่างระหว่างก้อนมาจาก `flex flex-col gap-4` แบบเดียวกับหน้าอื่นที่ใช้
          `MetricStrip` + `WorkspaceSection` (ใบสั่งขาย · โครงการ · ดีล) — ทั้ง
          `.ui-metric-strip` และ `.ui-section` ไม่มี margin ของตัวเอง ⇒ ไม่มีตัวห่อ
          แล้วขอบสองกล่องจะชนกันเป็นเส้นคู่ */}
      <div className="flex flex-col gap-4">
      {/* ⭐ **การ์ด "เริ่มที่นี่" มาก่อนตัวเลข** (มติผู้ใช้ 2026-08-08) — แถบตัวเลขตอบว่า
          *มีอะไรค้างบ้าง* ซึ่งเป็นคำถามของหัวหน้า · คนที่เปิดหน้ามาทำงานถามว่า
          *เริ่มที่ใบไหน* ⇒ คำตอบนั้นต้องอยู่บนสุด */}
      {!loading && !loadError && (
        <StartHereCard pick={startHere} clearText="ไม่มีเรื่องรอฝ่ายตอบอยู่ตอนนี้" />
      )}

      {/* แถบตัวเลข 4 ตัว — **component เดียวกับในคิว** (`QueueCountStrip`)
          ⚠️ **0 ก็เป็นข้อมูล** — "ยังไม่รับเรื่อง 0" บอกว่างานไม่ค้าง ซึ่งเป็นสิ่งที่
          หัวหน้าเปิดมาดูเพื่อจะรู้ · ซ่อนตอนว่างทำให้แยกไม่ออกจาก "ยังโหลดไม่เสร็จ"
          ⚠️ ที่นี่ **นับทั้งฝ่าย** และกดแล้ว **ไปคิวที่แท็บที่ถูก** — ต่างจากในคิวที่นับ
          เฉพาะแท็บปัจจุบันและกดแล้วกรองในที่ · หน้าตาเดียวกัน พฤติกรรมตามหน้าที่ของหน้า */}
      {!loading && !loadError && (
        <QueueCountStrip
          counts={counts}
          note="กดเพื่อเปิดคิวที่กรองไว้"
          ariaLabel="งานค้างของฝ่าย — กดเพื่อเปิดคิว"
          onSelect={(key) => router.push(key === "waitingRequester"
            ? "/rd/requests?tab=waiting"
            : "/rd/requests?tab=todo")}
        />
      )}

      {/* ⭐ **ตารางเดียวกับคิว** (มติผู้ใช้ 2026-08-08) — เดิมหน้านี้เขียนตารางของตัวเอง
          6 คอลัมน์ (เลขที่ · ชนิด · เรื่อง/ลูกค้า · กำหนดส่ง · ก้าวถัดไป · สถานะ) ส่วนคิว
          เปลี่ยนเป็น 4 คอลัมน์ไปแล้ว ⇒ สองหน้าที่ห่างกันคลิกเดียวเป็นคนละดีไซน์
          (ผู้ใช้ทักเอง) · ใช้ `RequestQueuePanel` ตัวเดียวกันแล้วมันตามกันเองตลอดไป
          ⚠️ ปิดแถบตัวเลขในพาเนล — หน้านี้มีแถบของตัวเองข้างบนที่นับ **ทั้งฝ่าย**
          ส่วนของพาเนลจะนับเฉพาะแถวใกล้ถึงกำหนด ⇒ สองแถบป้ายเหมือนกันแต่คนละตัวเลข
          ⚠️ ปิดปุ่มเปิดคำร้อง — คิวของฝ่ายเป็นที่ **ตอบ** ไม่ใช่ที่เปิด */}
      <WorkspaceSection
        title="คิวถัดไป"
        subtitle="เรียงลำดับเดียวกับที่การ์ดข้างบนใช้เลือก — ห้าใบถัดไปหลังใบที่ชี้ไว้"
        /* ⚠️ ตัวสลับมุมมองอยู่คู่กับตารางที่มันคุม — หน้านี้มีตารางเดียวและอยู่ในหัวข้อนี้
           ต่างจากหน้าคิวที่ตารางเป็นเนื้อของทั้งหน้า ตัวสลับจึงขึ้นไปอยู่หัวการ์ดได้ */
        actions={(
          <div className="flex gap-3 items-center flex-wrap">
            <ViewSwitcher
              value={board.view} onChange={board.setView}
              modes={["table", "list"]} ariaLabel="มุมมองคิวถัดไป"
            />
            <Button onClick={() => router.push("/rd/requests")}>เปิดคิวทั้งหมด</Button>
          </div>
        )}
      >
        {/* ⚠️ `sectionTitle={null}` — พาเนลอยู่ในการ์ด "ใกล้ถึงกำหนด…" อยู่แล้ว
            ห่อซ้ำอีกชั้นจะได้การ์ดซ้อนการ์ด */}
        <RequestQueuePanel
          scope="queue" dept={DEPT} rows={nextUp} board={board}
          sectionTitle={null}
          emptyText="ไม่มีใบอื่นรอฝ่ายอยู่แล้ว — เหลือแค่ใบที่การ์ดข้างบนชี้ไว้"
          loading={loading} loadError={loadError} reload={reload}
        />
      </WorkspaceSection>
      </div>
    </Workspace>
  );
}
