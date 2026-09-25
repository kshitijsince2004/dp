import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import db from '../../src/config/db.js';
import { resolveUserScope } from '../../src/modules/warehouse/warehouse.controller.js';

describe('Cross-Module Scope Security Tests', () => {
  let shoUser = null;
  let districtUser = null;

  before(async () => {
    shoUser = await db('users').where({ role: 'SHO', is_active: true }).first();
    districtUser = await db('users').where({ role: 'DISTRICT_OFFICER', is_active: true }).first();
  });

  it('SHO scope is strictly enforced to their assigned Police Station', () => {
    if (!shoUser) return;
    const scope = resolveUserScope(shoUser);
    assert.equal(scope.scopeType, 'PS');
    assert.equal(scope.scopeId, shoUser.ps_id);
  });

  it('District officer scope is strictly enforced to their assigned District', () => {
    if (!districtUser) return;
    const scope = resolveUserScope(districtUser);
    assert.equal(scope.scopeType, 'DISTRICT');
    assert.equal(scope.scopeId, districtUser.district_id);
  });
});
