import test from "node:test";
import assert from "node:assert/strict";
import { detailTabFromSearch, SALES_DETAIL_TABS } from "../../lib/salesDetailTabs.js";

test("project and deal detail tabs share the agreed order", () => {
  assert.deepEqual(
    SALES_DETAIL_TABS.map((tab) => tab.key),
    ["overview", "timeline", "quotations", "tasks", "activities"],
  );
});

test("detailTabFromSearch preserves valid tabs and falls back to overview", () => {
  assert.equal(detailTabFromSearch("?tab=timeline"), "timeline");
  assert.equal(detailTabFromSearch("?tab=quotations"), "quotations");
  assert.equal(detailTabFromSearch("?tab=unknown"), "overview");
  assert.equal(detailTabFromSearch(""), "overview");
});
