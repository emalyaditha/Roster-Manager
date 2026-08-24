import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth, verifyFirebaseIdToken } from '../server/auth';

function mockRes() {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe('requireAuth middleware', () => {
  test('rejects requests without a token (401)', async () => {
    const req: any = { headers: {} };
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => {
      nextCalled = true;
    });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  });

  test('rejects malformed authorization header (401)', async () => {
    const req: any = { headers: { authorization: 'Basic abc123' } };
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => {
      nextCalled = true;
    });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  });

  test('rejects garbage tokens (401), never throws', async () => {
    const req: any = { headers: { authorization: 'Bearer not.a.jwt' } };
    const res = mockRes();
    let nextCalled = false;
    await requireAuth(req, res, () => {
      nextCalled = true;
    });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  });
});

describe('verifyFirebaseIdToken', () => {
  test('throws on invalid token rather than trusting it', async () => {
    await assert.rejects(() => verifyFirebaseIdToken('garbage.token.value'));
  });
});
