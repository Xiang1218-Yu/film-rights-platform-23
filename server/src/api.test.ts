import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const base = 'http://127.0.0.1:4199';
async function waitForServer(retries = 40) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('test API server did not start');
}

test('contract change API maps validation, decision and stale refresh flows', async () => {
  const server = spawn(process.execPath, ['--import', 'tsx/esm', 'src/index.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: '4199' },
    stdio: 'ignore'
  });
  try {
    await waitForServer();
    const post = async (path: string, body: unknown) => {
      const response = await fetch(`${base}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const milestones = [
      { id: 'MS-CTR-01-1', name: '锁剪交付', due: '2099-01-01', amount: 1200000, status: 'invoiced' },
      { id: 'MS-CTR-01-2', name: '母版验收', due: '2099-02-01', amount: 2000000, status: 'open' },
      { name: '追加调色轮次与加急', due: '2099-03-01', amount: 600000 }
    ];
    const valid = {
      contractId: 'CTR-01', reason: '新增调色轮次与加急费', requestedBy: '后期制片', approver: '财务负责人',
      ceiling: 5200000, committed: 4450000, forecastDelta: 150000, milestones
    };

    const invalid = await post('/contract-changes', { ...valid, idempotencyKey: 'api-invalid', ceiling: 1000000, committed: 1000000 });
    assert.equal(invalid.status, 400);
    assert.match(invalid.body.message, /不能低于已付款/);

    const created = await post('/contract-changes', { ...valid, idempotencyKey: 'api-valid' });
    assert.equal(created.status, 201);
    const id = created.body.change.id;
    const duplicate = await post('/contract-changes', { ...valid, idempotencyKey: 'api-valid' });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.body.duplicate, true);
    const concurrent = await post('/contract-changes', { ...valid, idempotencyKey: 'api-concurrent' });
    assert.equal(concurrent.status, 409);

    const approved = await post(`/contract-changes/${id}/decision`, { decision: 'approved', actor: '财务负责人', comment: 'API 批准' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.afterSnapshot.contract.committed, 4450000);
    const summaryResponse = await fetch(`${base}/api/projects/PRJ-001/summary`);
    const summary = await summaryResponse.json();
    const contract = summary.contracts.find((item: { id: string }) => item.id === 'CTR-01');
    const line = summary.lines.find((item: { id: string }) => item.id === 'BL-103');
    assert.equal(contract.committed, 4450000);
    assert.equal(line.forecast, 6000000);
  } finally {
    server.kill('SIGTERM');
  }
});
