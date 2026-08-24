import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAVE_CODE_TO_TYPE,
  isPartialLeaveCode,
  isPartialLeaveAction,
  getShortLeaveCutoff,
  getDisplayCode,
  canApplyLeaveToCode,
} from '../src/utils/leave';

describe('leave mappings', () => {
  test('LEAVE_CODE_TO_TYPE covers the core leave codes', () => {
    assert.equal(LEAVE_CODE_TO_TYPE['LEAVE'], 'Annual Leave');
    assert.equal(LEAVE_CODE_TO_TYPE['Short Leave'], 'Short Leave');
  });
});

describe('isPartialLeaveCode', () => {
  test('identifies partial leave codes', () => {
    assert.equal(isPartialLeaveCode('Short Leave'), true);
    assert.equal(isPartialLeaveCode('RTD'), false);
  });
});

describe('isPartialLeaveAction', () => {
  test('detects partial leave from action text', () => {
    assert.equal(isPartialLeaveAction('Short Leave taken AM'), true);
    assert.equal(isPartialLeaveAction('Half Day (Annual)'), true);
    assert.equal(isPartialLeaveAction('Work on Roster'), false);
    assert.equal(isPartialLeaveAction(null), false);
  });
});

describe('getShortLeaveCutoff', () => {
  test('returns a code string for a base code', () => {
    const result = getShortLeaveCutoff('NWD');
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });
});

describe('getDisplayCode', () => {
  test('maps display codes deterministically', () => {
    assert.equal(getDisplayCode('LEAVE'), 'LEAVE');
  });
});

describe('canApplyLeaveToCode', () => {
  test('allows leave on eligible work codes only', () => {
    assert.equal(canApplyLeaveToCode('NWD'), true);
    assert.equal(canApplyLeaveToCode('RTD'), true);
    assert.equal(canApplyLeaveToCode('DOF'), false);
  });
});
