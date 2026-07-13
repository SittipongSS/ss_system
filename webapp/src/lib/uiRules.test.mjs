import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTITY_SELECT_RULES, searchableForEntity } from "./uiRules.js";

test("entity selector rules are consistent across the system", () => {
  assert.equal(ENTITY_SELECT_RULES.customer.searchable, true);
  assert.equal(ENTITY_SELECT_RULES.product.searchable, true);
  assert.equal(ENTITY_SELECT_RULES.brand.searchable, false);
  assert.equal(ENTITY_SELECT_RULES.mainCategory.searchable, true);
  assert.equal(ENTITY_SELECT_RULES.subCategory.searchable, true);
  assert.equal(searchableForEntity("customer", false), true);
  assert.equal(searchableForEntity("brand", true), false);
  assert.equal(searchableForEntity("phase", true), true);
});
