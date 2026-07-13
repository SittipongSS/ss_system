import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCompatibleProjectCustomer, isDealAvailableForProject } from './projectLink.js';

const project = { id: 'PJ-1', customerId: 'CUS-1' };

test('allows a customerless deal to adopt the project customer', () => {
  const deal = { id: 'DL-1', customerId: null, projectId: null, stage: 'qualified' };
  assert.equal(hasCompatibleProjectCustomer(deal, project), true);
  assert.equal(isDealAvailableForProject(deal, project), true);
});

test('allows an unlinked deal belonging to the same customer', () => {
  const deal = { id: 'DL-1', customerId: 'CUS-1', projectId: null, stage: 'quotation' };
  assert.equal(isDealAvailableForProject(deal, project), true);
});

test('rejects deals belonging to another customer', () => {
  const deal = { id: 'DL-1', customerId: 'CUS-2', projectId: null, stage: 'qualified' };
  assert.equal(hasCompatibleProjectCustomer(deal, project), false);
  assert.equal(isDealAvailableForProject(deal, project), false);
});

test('rejects lost or already linked deals', () => {
  assert.equal(isDealAvailableForProject({ customerId: null, projectId: null, stage: 'lost' }, project), false);
  assert.equal(isDealAvailableForProject({ customerId: null, projectId: 'PJ-2', stage: 'qualified' }, project), false);
});
