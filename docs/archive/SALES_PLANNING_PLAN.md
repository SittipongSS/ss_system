# Sales Planning Phase 1 Plan

## Goal

Phase 1 replaces the working Google Sheet with a controlled Sales Planning spine:

- `sales_deals` for pipeline, owner, stage, forecast month, probability, and value.
- `sales_targets` for monthly team/user targets.
- `sales_deal_activities` for lightweight follow-up notes.
- `sales_deal_stage_history` for stage changes.
- `sales_deal_forecasts` for forecast snapshots.
- API-first CRUD with `withUser`, capability gates, row scope, and `recordAudit`.
- `/sales-planning` as a usable first screen: dashboard, pipeline, and targets.

This phase does not link PM projects yet and does not create quotation entities. Those belong to phases 2 and 3.

## Boundary

Sales Planning owns commercial pre-win data. It may read customer/product master data for labels and context, but it does not write master data. PM keeps owning execution projects and timelines.

Row scope follows the sales org:

- `admin` and `ae_supervisor`: all teams.
- `senior_ae` and `ac`: own team.
- `ae`: own team for Phase 1 team collaboration, while `ownerId` still records accountability.
- non-sales roles: no Sales Planning access unless granted by future policy.

## Phase 1 Slice Implemented

- Migration `0063_sales_planning_core.sql`.
- Deal APIs:
  - `GET /api/sales-planning/deals`
  - `POST /api/sales-planning/deals`
  - `GET /api/sales-planning/deals/[id]`
  - `PATCH /api/sales-planning/deals/[id]`
  - `DELETE /api/sales-planning/deals/[id]`
- Target APIs:
  - `GET /api/sales-planning/targets`
  - `POST /api/sales-planning/targets`
  - `PATCH /api/sales-planning/targets/[id]`
  - `DELETE /api/sales-planning/targets/[id]`
- Activity APIs:
  - `GET /api/sales-planning/activities?dealId=...`
  - `POST /api/sales-planning/activities`
- Dashboard API:
  - `GET /api/sales-planning/dashboard?month=YYYY-MM`
- UI:
  - pipeline list and create/update deal form
  - monthly targets list and create/update target form
  - dashboard KPIs by selected month

## Phase 2 Slice Implemented

- Migration `0064_sales_pm_link.sql`.
- Deal stages expanded with:
  - `timeline_proposed`
  - `in_project`
- PM link hardening:
  - `sales_deals.projectId` partial unique index.
  - FK from `sales_deals.projectId` to `projects.id`.
- API:
  - `POST /api/sales-planning/deals/[id]/create-project`
- Behavior:
  - creates a PM project using existing PM helpers for project code, template tasks, holidays, and auto status.
  - writes `projects.metadata.salesDealId`.
  - writes `sales_deals.projectId`.
  - moves the deal to `timeline_proposed`, or `in_project` if already won/deposit-paid.
  - records audit logs for both the project creation and deal link.
- UI:
  - pipeline row can create a PM project from an unlinked deal.
  - linked deals show a PM shortcut.

## Phase 3 Slice Implemented

- Migration `0065_sales_quotations.sql`.
- Tables:
  - `quotations`
  - `quotation_lines`
- API:
  - `GET /api/sales-planning/deals/[id]/quotations`
  - `POST /api/sales-planning/deals/[id]/quotations`
  - `POST /api/sales-planning/quotations/[id]/accept`
- Behavior:
  - quotation lines freeze `unitPrice` when created.
  - default line seeding reads `project_products` from the linked PM project and reads product sale price from `products.retailPriceIncVat`.
  - accept quotation moves deal to `awaiting_confirm`, or `in_project` when deposit is already paid.
  - accepted quotation total becomes the deal `projectValue`.
- UI:
  - pipeline row has a QT action.
  - quotation modal lists quotations and their frozen lines.
  - linked deals can create a quotation from PM FG lines.
  - quotations can be accepted from the modal.

## Phase 4 Slice Implemented

- Migration `0066_excise_registration_project_link.sql`.
- Tax link:
  - `excise_registrations.projectId` added for traceability back to PM.
  - regular registration create accepts optional `projectId`.
- API:
  - `POST /api/excise-registrations/from-project`
- Behavior:
  - PM project triggers a Tax-owned registration draft creation.
  - route picks the first FG in `project_products` that is not already registered for the customer.
  - registration snapshots product/customer/tax data and stores `metadata.source = "pm-project"`.
  - audit log records the registration creation.
- UI:
  - PM project detail has a `สร้างทะเบียนภาษี` button when the user can edit products/tax registrations.
  - created draft opens directly in `/tax/registrations/[id]`.
- Migration `0067_shipment_prep.sql`.
- Shipment prep:
  - new `shipment_prep` and `shipment_prep_lines` tables.
  - one prep document per PM project via unique `shipment_prep.projectId`.
  - lines snapshot FG, description, and quantity from `project_products`.
- API:
  - `GET /api/pm/projects/[id]/shipment-prep`
  - `POST /api/pm/projects/[id]/shipment-prep`
- Behavior:
  - PM owns creation; warehouse receives a printable document only in this slice.
  - POST is idempotent: existing project prep is returned instead of duplicating.
  - audit log records document creation.
- UI:
  - PM project detail has a `เตรียมส่งของ` button for users who can edit that project.
  - `/pm/projects/[id]/shipment-prep` displays the A4-style document and print action.
- Migration `0068_sahamit_po_project_link.sql`.
- Sahamit PO to PM:
  - `sahamit_pos.projectId` links one PO to one PM project.
  - `POST /api/sahamit/po/[id]/create-project` creates a `RE-ORDER` project from active PO lines.
  - project FG links are seeded from resolved Sahamit FG codes, with duplicate FG lines aggregated.
  - project metadata stores `source = "sahamit-po"`, `sahamitPoId`, `poNumber`, destination, and delivery month.
  - creates a Sales Planning won/in-project stub so PO value counts in Sales dashboards without entering the open pipeline.
  - POST is idempotent: an already-linked PO returns the existing project.
- UI:
  - Sahamit PO detail has a `สร้าง RE-ORDER Project` confirmation action.
  - linked POs show `เปิด PM Project`.

## Deliberate Deferrals

- Approval thresholds: quote approval rules are still not enforced; this slice supports normal AE-created quotations only.
- Shipment prep remains document-only; no warehouse fulfillment status tracking yet.

## Phase 5 Slice Implemented

- No migration; this slice is derived from existing Sahamit FC data.
- Reverse calculation:
  - `requiredConfirmDate = first day of warehouseNeedMonth - requiredLeadTimeDays`.
  - default lead time is 90 working days for a conservative sales-confirm deadline.
  - latest effective FC round is used, respecting `coverMonths`.
- API:
  - `GET /api/sales-planning/sahamit-risk?month=YYYY-MM`
- Behavior:
  - only KA, admin, and sales-head users receive Sahamit risk data; other Sales Planning users receive `enabled:false`.
  - flags risk when latest FC received month is later than the required confirm month.
- UI:
  - Sales Planning dashboard shows a Sahamit FC risk KPI when available.
  - risk table lists FG, warehouse need month, required confirm month, latest FC month, and quantity.

## Phase 5 Follow-up Slice Implemented

- No migration; this slice centralizes win semantics in application code.
- Helper:
  - `src/lib/salesPlanningWin.js`
  - `buildWinPatch()` defines canonical won fields: stage, deposit, confirmed date, probability, project link, and win metadata.
  - `markWon()` updates an existing deal and writes stage history, forecast snapshot, and audit log.
  - `createWonDealStub()` creates direct won/in-project deals such as Sahamit PO re-order sales value.
- Behavior:
  - accepted quotations with deposit paid now flow through `markWon()`.
  - manual `won` stage updates use the same canonical win patch.
  - Sahamit PO to PM project creates the sales dashboard stub through `createWonDealStub()`.

## Phase 5 Governance Slice Implemented

- Migration `0069_sales_governance.sql`.
- Tables:
  - `sales_forecast_reviews`
  - `sales_deal_documents`
- API:
  - `GET/POST /api/sales-planning/forecast-reviews`
  - `GET/POST /api/sales-planning/documents`
  - `PATCH/DELETE /api/sales-planning/documents/[id]`
- Behavior:
  - forecast review is monthly and team-scoped, with `draft`, `approved`, and `rejected` status.
  - review summary snapshots current weighted forecast amount and deal count at save time.
  - document checklist items are scoped to a deal and follow sales view/edit permissions.
  - document status supports `pending`, `received`, and `waived`.
- UI:
  - Sales Planning shows a Forecast review panel below KPIs.
  - users with `salesplan:review` can approve/reject the selected month.
  - each deal row has a Docs action for checklist creation and status updates.

## Customer/Deal 360 Light Slice Implemented

- No migration; this slice is read-only aggregation.
- API:
  - `GET /api/sales-planning/deals/[id]/overview`
- Behavior:
  - uses the existing Sales Planning view permission and deal row scope.
  - aggregates deal, customer, quotations, documents, activities, stage history, forecast snapshots, PM project, project FG lines, shipment prep, tax registrations, and linked Sahamit PO when available.
  - non-critical downstream read failures are returned as warnings instead of breaking the whole overview.
- UI:
  - new page `/sales-planning/deals/[id]`.
  - Sales Planning table has a `360` action per deal.
  - overview shows commercial KPIs, PM execution, quotations, documents, downstream Tax/Sahamit context, and recent stage movement.

## Quotation Approval Slice Implemented

- Migration `0070_quotation_approvals.sql`.
- Tables:
  - adds approval fields to `quotations` while keeping the existing quotation `status` lifecycle stable.
- API:
  - `POST /api/sales-planning/quotations/[id]/approval`
- Behavior:
  - quotations at or above the initial approval threshold require approval before accept.
  - default threshold is `500,000` total amount and is stored in quotation metadata for traceability.
  - users with `salesplan:edit` can request approval.
  - users with `salesplan:review` can approve or reject.
  - accept route blocks pending/rejected approvals.
- UI:
  - quotation modal shows approval status and reason.
  - quotation modal exposes Request, Approve, Reject, and gated Accept actions.
  - Deal 360 shows quotation approval status.

## Deployment Notes

Run `supabase/migrations/0063_sales_planning_core.sql` manually in Supabase SQL Editor before deploying the web app, then run:

```sql
NOTIFY pgrst, 'reload schema';
```

The migration already includes the notify statement, but keep it visible in the deploy checklist because PostgREST schema cache is the common failure point.

After Phase 2, also run `supabase/migrations/0064_sales_pm_link.sql`.

After Phase 3, also run `supabase/migrations/0065_sales_quotations.sql`.

After Phase 4, also run:

- `supabase/migrations/0066_excise_registration_project_link.sql`
- `supabase/migrations/0067_shipment_prep.sql`
- `supabase/migrations/0068_sahamit_po_project_link.sql`

Phase 5 reverse-risk slice has no migration.

After Phase 5 governance, also run:

- `supabase/migrations/0069_sales_governance.sql`

After quotation approval, also run:

- `supabase/migrations/0070_quotation_approvals.sql`
