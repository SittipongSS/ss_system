"use client";
// ── การ์ด "สัญญา" บนหน้าดีล (mig 0278) ───────────────────────────────────────
//
// โหลดข้อมูลของตัวเอง (แบบเดียวกับ EntityDocumentsPanel) เพื่อไม่ต้องขยาย payload
// ของหน้าดีลที่หนักอยู่แล้ว · การ์ดนี้เป็นทาง **สร้าง** สัญญาเส้นหลัก เพราะสัญญาต้อง
// รู้ดีลและใบเสนอราคาที่อนุมัติเสมอ ซึ่งเป็นบริบทที่มีอยู่แล้วตรงนี้
//
// ⚠️ ปุ่ม "ออกสัญญา" ขึ้นเสมอเมื่อแก้ดีลได้ — เหตุผลที่ออกไม่ได้จริงถูกบอกในโมดัล
//    (จาก /options ซึ่งเรียกด่านตัวเดียวกับ API) · ซ่อนปุ่มเงียบ ๆ = คนถามว่าปุ่มอยู่ไหน
// ⭐ การ์ดเป็น `DetailCard` (มติผู้ใช้ 2026-09-15 — ถอด TableShell) · ตารางระเบียนที่เกี่ยวข้อง
//    ในหน้ารายละเอียด = DetailCard + TableScroll · สัญญาออกได้หลังใบเสนอราคาอนุมัติ
//    แล้วพิมพ์ไปเซ็นและอัปโหลดฉบับลงนามกลับ (คำอธิบายเดิมของหัวการ์ด)
//
// ⭐ **ใช้สองที่: หน้าดีล และแท็บ "สัญญา" ของใบสั่งขาย** (มติผู้ใช้ 2026-09-15) —
//    ขยับการ์ดนี้ต้องนึกถึงทั้งสองจอ
// ⭐ **คอลัมน์ความคืบหน้าใช้รางตัวเดียวกับทะเบียน** (`contractListTrack`) — ร่างที่แนบ
//    เอกสารแทนสัญญาแล้วต้องบอกว่า "รอ AE Supervisor อนุมัติ" ไม่ใช่ป้าย "ร่าง" เฉย ๆ
//    ซึ่งอ่านเหมือนยังไม่มีใครทำอะไร
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileSignature, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import { DetailCard } from "@/components/ui/DetailPage";
import StepTrack from "@/components/ui/StepTrack";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableEmpty, TableScroll } from "@/components/ui/Table";
import ContractCreateModal from "@/components/salesPlanning/ContractCreateModal";
import { contractKindBadge, contractStatusBadge } from "@/components/salesPlanning/ui";
import { CONTRACT_SOURCE_LABELS, isExternalContract } from "@/lib/sales/contracts";
import { contractListTrack } from "@/lib/sales/contractListTrack";
import { fmtDate, naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";
import { httpLoadFailure, thrownLoadFailure } from "@/lib/ui/loadFailure";

export default function DealContractsCard({ dealId, canEdit = false, quotationId = "" }) {
  const [rows, setRows] = useState([]);
  /* 🐞 **"ยังไม่รู้" ≠ "ไม่มีสัญญา"** (รีวิว 25/09) — ของเดิมโหลดพัง/กำลังโหลดแล้วขึ้น "0 ฉบับ ·
     ยังไม่มีสัญญาของดีลนี้" · การ์ดนี้เป็นเนื้อหลักของแท็บ "สัญญา" บนทุก SO แล้ว และการ์ดผูกสัญญา
     ข้างบนชี้คนมาออกสัญญาที่นี่ ⇒ ว่างปลอม = ชวนออกร่างซ้ำ · กติกาเดียวกับ `useApiList`:
     พังต้องขึ้น StatusNotice + "ลองใหม่" และห้ามมีเลข 0 / "ยังไม่มี…" ข้างข้อความ error
     ⚠️ `loaded` = เคยโหลดสำเร็จ (ลิสต์ว่างจริงคือ "รู้แล้วว่าไม่มี") · รอบโหลดซ้ำหลังสร้างไม่ล้างแถวเดิม */
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!dealId) return;
    try {
      const res = await apiFetch(`/api/sales-planning/contracts?dealId=${encodeURIComponent(dealId)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFailure(httpLoadFailure(res.status, data?.error));
        return;
      }
      if (!Array.isArray(data)) {
        setFailure({ message: "ระบบตอบกลับในรูปแบบที่อ่านไม่ได้", detail: `HTTP ${res.status}` });
        return;
      }
      setRows(data);
      setLoaded(true);
      setFailure(null);
    } catch (err) {
      // การ์ดเสริม — โหลดไม่ได้ต้องไม่ทำให้ทั้งหน้าพัง แต่ต้องบอกว่าพัง ไม่ใช่ทำเป็นว่าง
      setFailure(thrownLoadFailure(err));
    }
  }, [dealId]);

  useEffect(() => { load(); }, [load]);
  const failed = !!failure && !loaded;

  return (
    <>
      <DetailCard
        icon={FileSignature}
        title="สัญญา"
        meta={loaded ? `${rows.length} ฉบับ` : failed ? "—" : "กำลังโหลด…"}
        actions={canEdit ? (
          /* ⚠️ ปุ่มโชว์เสมอเมื่อแก้ได้ แต่กดได้เมื่อรู้แล้วว่าดีลมีสัญญาอะไรบ้าง — ออกร่างตอนลิสต์ยังไม่ขึ้น
             = เสี่ยงออกฉบับซ้ำกับใบที่มีอยู่แล้ว (เหตุผลอยู่ใน `title`) */
          <Button
            size="sm"
            tone="accent"
            disabled={!loaded}
            title={loaded ? undefined : failed ? "โหลดสัญญาของดีลนี้ไม่สำเร็จ — กดลองใหม่ก่อน" : "กำลังโหลดสัญญาของดีลนี้"}
            onClick={() => setOpen(true)}
          >
            {/* ⚠️ บอกทั้งสองทางบนปุ่ม — "เอกสารภายนอกใช้แทนสัญญา" เคยมีอยู่แค่ในโมดัล
                คนที่ถือ PO ลูกค้าอยู่ในมือไม่มีทางรู้ว่ากดปุ่มนี้แล้วจะเจอทางนั้น */}
            <Plus size={13} aria-hidden="true" /> ออกสัญญา / เอกสารแทน
          </Button>
        ) : null}
      >
        {/* surface="embedded" ตัวเดียวกับที่ TableShell เคยส่ง ⇒ กฎ `.cardBody [data-surface="embedded"]`
            ตัดระยะซ้ำให้กรอบตารางเริ่มแนวเดียวกับหัวการ์ด */}
        {failure ? (
          <StatusNotice
            tone="error"
            title="โหลดสัญญาของดีลนี้ไม่สำเร็จ"
            detail={failure.detail}
            action={<Button size="sm" variant="ghost" onClick={load}>ลองใหม่</Button>}
          >
            {failure.message}
          </StatusNotice>
        ) : null}
        {/* พังก่อนเคยโหลดสำเร็จ = ไม่มีตาราง (ไม่มี "ยังไม่มีสัญญา…" ข้างข้อความ error) · พังรอบโหลดซ้ำ = แถวเดิมยังอยู่ */}
        {failed ? null : (
        <TableScroll surface="embedded" aria-busy={!loaded}>
          <table className="w-full text-sm">
            <thead>
              <tr><th>เลขที่</th><th>ชนิด</th><th>วันที่</th><th>สถานะ</th><th>ความคืบหน้า</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const track = contractListTrack(row);
                return (
                  <tr key={row.id} className="premium-row">
                    <td className="mono">
                      <Link prefetch={false} href={`/sa/contracts/${row.id}`} className="linklike">
                        {row.contractNo || "ฉบับร่าง"}
                      </Link>
                    </td>
                    <td>
                      {contractKindBadge(row.kind)}
                      {/* ⭐ ที่มาอยู่ใต้ชนิด ไม่ใช่คอลัมน์ของตัวเอง (ท่าเดียวกับทะเบียนสัญญา)
                          — ใบที่ใช้ PO/อีเมลแทนสัญญา เดินคนละเส้นและมีเอกสารคนละแบบ
                          ⇒ ไม่บอกที่มา = การ์ดนี้อ่านเหมือนทุกใบมีสัญญาจริงของเราเหมือนกันหมด */}
                      {isExternalContract(row)
                        ? <span className="cell-sub">{CONTRACT_SOURCE_LABELS.external}</span>
                        : null}
                    </td>
                    <td className="mono">{fmtDate(row.contractDate)}</td>
                    <td>{contractStatusBadge(row.status)}</td>
                    {/* 🐞 ช่องที่ใส่แถบขั้นต้องถอดเพดาน 220px ของเซลล์ (`ui-cell-wide`) — ไม่งั้นรางสี่หมุด
                        ถูกตัดหมุดสุดท้ายหายครึ่งตัว (วัดจริงบนหน้า SO 25/09: ราง 341px ในช่อง 274px)
                        · ใบที่ตายแล้วเป็นตัวหนังสือ ⇒ คงเพดาน + จุดไข่ปลาไว้ */}
                    <td className={track.closed ? undefined : "ui-cell-wide"}>
                      {/* ใบที่ตายแล้วไม่มีรางให้เดิน — บอกเหตุเป็นตัวหนังสือ (กติกาเดียวกับทะเบียน) */}
                      {track.closed
                        ? <span className="cell-sub">{row.status === "revised" ? "ถูกแทนด้วยฉบับแก้ไข" : naText(row.cancelReason)}</span>
                        : <StepTrack steps={track.steps} ariaLabel="ความคืบหน้าของสัญญา" />}
                    </td>
                  </tr>
                );
              })}
              {loaded && !rows.length && (
                <TableEmpty
                  colSpan={5}
                  title="ยังไม่มีสัญญาของดีลนี้"
                  description={canEdit ? "กด “ออกสัญญา / เอกสารแทน” เพื่อสร้างร่างจากใบเสนอราคาที่อนุมัติแล้ว" : undefined}
                />
              )}
            </tbody>
          </table>
        </TableScroll>
        )}
      </DetailCard>

      <ContractCreateModal
        open={open}
        dealId={dealId}
        quotationId={quotationId}
        onClose={() => setOpen(false)}
        onCreated={load}
      />
    </>
  );
}
