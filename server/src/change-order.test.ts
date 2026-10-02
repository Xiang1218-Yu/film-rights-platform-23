import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { approveChangeOrder, auditEvents, budgetLines, changeOrders, contracts, projectSummary, recordPayment, rejectChangeOrder, resetStore, resubmitChangeOrder, submitChangeOrder } from './domain.js';
import { app } from './index.js';

const CTR = () => contracts.find(c => c.id === 'CTR-01')!;
const LINE = () => budgetLines.find(l => l.id === 'BL-103')!;
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
// 介于锁剪交付与母版验收之间的加急节点日期
const rushDue = () => { const d0 = CTR().milestones[0].due; return new Date(Date.parse(d0) + 10 * 86400000).toISOString().slice(0, 10); };

// 曜石后期 CTR-01 / 后期 BL-103：增加两轮调色与加急费的合法补充协议
const validInput = () => ({
  title: '补充协议：增加两轮调色与加急交付',
  reason: '平台交付窗口提前两周，需增加两轮调色并支付加急费。',
  budgetLineId: 'BL-103',
  changes: {
    ceiling: 5500000,
    committed: 4800000,
    scope: '4K HDR 调色（+2 轮）、声音、DCP 母版、加急交付',
    milestones: [
      { name: '锁剪交付', due: CTR().milestones[0].due, amount: 1200000 },
      { name: '加急调色评审', due: rushDue(), amount: 500000 },
      { name: '母版验收', due: CTR().milestones[1].due, amount: 2000000 }
    ],
    budgetCommittedDelta: 500000,
    budgetForecastDelta: 500000
  }
});

beforeEach(() => resetStore());

test('提交变更单：仅创建待审批记录，批准前合同与预算不被悄悄抬高', () => {
  const before = projectSummary('PRJ-001');
  const result = submitChangeOrder('CTR-01', validInput(), 'key-submit');
  assert.ok(result.ok);
  assert.equal(result.value.order.status, 'pending');
  assert.equal(result.value.order.base.contractVersion, 1);
  assert.equal(CTR().committed, 4300000);
  assert.equal(CTR().ceiling, 5200000);
  assert.equal(LINE().committed, 4300000);
  assert.equal(LINE().forecast, 5750000);
  assert.equal(projectSummary('PRJ-001').committed, before.committed);
  assert.ok(auditEvents.some(e => e.action === 'CHANGE_ORDER_SUBMIT' && e.entityId === result.value.order.id));
});

test('重复/并发提交：幂等键重放返回原单，待审批期间第二单被 409 拦截', () => {
  const first = submitChangeOrder('CTR-01', validInput(), 'key-dup');
  assert.ok(first.ok);
  const replay = submitChangeOrder('CTR-01', validInput(), 'key-dup');
  assert.ok(replay.ok && replay.value.replayed);
  assert.equal(replay.value.order.id, first.value.order.id);
  const conflict = submitChangeOrder('CTR-01', validInput(), 'key-other');
  assert.ok(!conflict.ok && conflict.status === 409);
  assert.match(conflict.message, /已存在待审批/);
  const hijack = submitChangeOrder('CTR-01', { ...validInput(), reason: '篡改内容' }, 'key-dup');
  assert.ok(!hijack.ok && hijack.status === 409);
  assert.equal(changeOrders.filter(o => o.contractId === 'CTR-01' && o.status === 'pending').length, 1);
});

test('拒绝低于已付款的变更', () => {
  const result = submitChangeOrder('CTR-01', { ...validInput(), changes: { ...validInput().changes, committed: 2000000, budgetCommittedDelta: -2300000, budgetForecastDelta: -2300000 } });
  assert.ok(!result.ok && result.status === 422);
  assert.match(result.message, /低于合同已付款/);
});

test('拒绝超预算的变更：科目承诺额不得超出计划', () => {
  const result = submitChangeOrder('CTR-01', { ...validInput(), changes: { ...validInput().changes, ceiling: 6200000, committed: 5800000, budgetCommittedDelta: 1500000, budgetForecastDelta: 1500000 } });
  assert.ok(!result.ok && result.status === 422);
  assert.match(result.message, /超预算/);
});

test('拒绝合同承诺与预算科目调整不一致的变更', () => {
  const result = submitChangeOrder('CTR-01', { ...validInput(), changes: { ...validInput().changes, budgetCommittedDelta: 300000 } });
  assert.ok(!result.ok && result.status === 422);
  assert.match(result.message, /不一致/);
});

test('拒绝无效里程碑重排', () => {
  const ms = validInput().changes.milestones;
  const shuffled = [ms[0], ms[2], ms[1]]; // 母版验收(更晚) 排在 加急调色评审(更早) 之前
  const result = submitChangeOrder('CTR-01', { ...validInput(), changes: { ...validInput().changes, milestones: shuffled } });
  assert.ok(!result.ok && result.status === 422);
  assert.match(result.message, /重排无效/);
});

test('已付款/已开票里程碑不可移除或修改', () => {
  const ctr2 = () => contracts.find(c => c.id === 'CTR-02')!;
  const base = { title: '音乐许可补充', reason: '追加授权窗口', budgetLineId: 'BL-101' };
  const dropped = submitChangeOrder('CTR-02', { ...base, changes: { milestones: [{ name: '交付版权证明', due: ctr2().milestones[1].due, amount: 440000 }], budgetForecastDelta: 100000 } });
  assert.ok(!dropped.ok && dropped.status === 422);
  assert.match(dropped.message, /已付款里程碑「签署」不可移除/);
  const modified = submitChangeOrder('CTR-02', { ...base, changes: { milestones: [{ name: '签署', due: ctr2().milestones[0].due, amount: 400000 }, { name: '交付版权证明', due: ctr2().milestones[1].due, amount: 440000 }], budgetForecastDelta: 100000 } });
  assert.ok(!modified.ok && modified.status === 422);
  assert.match(modified.message, /已付款里程碑「签署」不可修改/);
});

test('拒绝空变更与缺失理由', () => {
  const noReason = submitChangeOrder('CTR-01', { ...validInput(), reason: '  ' });
  assert.ok(!noReason.ok && noReason.status === 400);
  const empty = submitChangeOrder('CTR-01', { title: '空单', reason: '测试', budgetLineId: 'BL-103', changes: {} });
  assert.ok(!empty.ok && empty.status === 400);
  assert.match(empty.message, /变更内容为空/);
});

test('批准时原子更新合同与预算，保存前后快照与审计，刷新后读模型一致', () => {
  const submitted = submitChangeOrder('CTR-01', validInput(), 'key-apply');
  assert.ok(submitted.ok);
  const id = submitted.value.order.id;
  const approved = approveChangeOrder(id, '同意，按补充协议执行');
  assert.ok(approved.ok);
  assert.equal(CTR().committed, 4800000);
  assert.equal(CTR().ceiling, 5500000);
  assert.equal(CTR().scope, '4K HDR 调色（+2 轮）、声音、DCP 母版、加急交付');
  assert.deepEqual(CTR().milestones.map(m => m.name), ['锁剪交付', '加急调色评审', '母版验收']);
  assert.equal(CTR().milestones[1].status, 'open');
  assert.equal(CTR().version, 2);
  assert.equal(LINE().committed, 4800000);
  assert.equal(LINE().forecast, 6250000);
  assert.equal(LINE().version, 2);
  const order = changeOrders.find(o => o.id === id)!;
  assert.equal(order.status, 'approved');
  assert.equal(order.beforeSnapshot?.contract.committed, 4300000);
  assert.equal(order.afterSnapshot?.contract.committed, 4800000);
  assert.equal(order.beforeSnapshot?.budgetLine.forecast, 5750000);
  assert.equal(order.afterSnapshot?.budgetLine.forecast, 6250000);
  assert.ok(auditEvents.some(e => e.action === 'CHANGE_ORDER_APPROVE' && e.entityId === id));
  // 刷新后一致性：重新汇总与重复读取结果稳定
  const summary = projectSummary('PRJ-001');
  assert.equal(summary.contracts.find(c => c.id === 'CTR-01')?.committed, 4800000);
  assert.equal(summary.lines.find(l => l.id === 'BL-103')?.forecast, 6250000);
  assert.equal(summary.pendingChangeOrders, 0);
  const again = projectSummary('PRJ-001');
  assert.deepEqual(again.lines.map(l => [l.id, l.committed, l.forecast]), summary.lines.map(l => [l.id, l.committed, l.forecast]));
  const serialized = summary.changeOrders.find(o => o.id === id)!;
  assert.ok(serialized.diffs.fields.some(f => f.field === 'committed' && f.from === 4300000 && f.to === 4800000));
  assert.equal(serialized.diffs.milestonesAdded[0].name, '加急调色评审');
});

test('驳回后可修订重提，重提批准后才生效', () => {
  const submitted = submitChangeOrder('CTR-01', validInput(), 'key-rej');
  assert.ok(submitted.ok);
  const id = submitted.value.order.id;
  const rejected = rejectChangeOrder(id, '加急费依据不足，请补充报价单');
  assert.ok(rejected.ok);
  assert.equal(CTR().committed, 4300000);
  assert.equal(LINE().forecast, 5750000);
  const approveRejected = approveChangeOrder(id);
  assert.ok(!approveRejected.ok && approveRejected.status === 409);
  const resubmitted = resubmitChangeOrder(id, { reason: '已补充供应商加急报价单与调色轮次确认函。' });
  assert.ok(resubmitted.ok);
  assert.equal(resubmitted.value.order.resubmitOf, id);
  assert.equal(resubmitted.value.order.status, 'pending');
  assert.equal(resubmitted.value.order.reason, '已补充供应商加急报价单与调色轮次确认函。');
  assert.ok(auditEvents.some(e => e.action === 'CHANGE_ORDER_RESUBMIT'));
  const approved = approveChangeOrder(resubmitted.value.order.id);
  assert.ok(approved.ok);
  assert.equal(CTR().committed, 4800000);
});

test('审批期间合同被付款更新：申请过期且不得覆盖新状态，重提后基于最新状态批准', () => {
  const submitted = submitChangeOrder('CTR-01', validInput(), 'key-stale');
  assert.ok(submitted.ok);
  const id = submitted.value.order.id;
  const paid = recordPayment('CTR-01', '锁剪交付');
  assert.ok(paid.ok);
  assert.equal(CTR().paid, 3500000);
  assert.equal(CTR().version, 2);
  const result = approveChangeOrder(id);
  assert.ok(!result.ok && result.status === 409);
  assert.match(result.message, /已过期/);
  assert.equal(changeOrders.find(o => o.id === id)?.status, 'stale');
  assert.equal(CTR().committed, 4300000); // 过期申请未覆盖合同
  assert.equal(LINE().committed, 4300000);
  const resubmitted = resubmitChangeOrder(id, {});
  assert.ok(resubmitted.ok, resubmitted.ok ? '' : resubmitted.message);
  const approved = approveChangeOrder(resubmitted.value.order.id);
  assert.ok(approved.ok, approved.ok ? '' : approved.message);
  assert.equal(CTR().committed, 4800000);
  assert.equal(CTR().milestones.find(m => m.name === '锁剪交付')?.status, 'paid'); // 付款事实保留
});

test('审批期间预算科目被其他合同变更更新：申请过期', () => {
  const a = submitChangeOrder('CTR-01', validInput(), 'key-a');
  const b = submitChangeOrder('CTR-02', { title: '音乐许可补充', reason: '追加授权窗口', budgetLineId: 'BL-103', changes: { budgetForecastDelta: 200000 } }, 'key-b');
  assert.ok(a.ok && b.ok);
  assert.ok(approveChangeOrder(b.value.order.id).ok); // BL-103 版本递增
  const result = approveChangeOrder(a.value.order.id);
  assert.ok(!result.ok && result.status === 409);
  assert.equal(changeOrders.find(o => o.id === a.value.order.id)?.status, 'stale');
  assert.equal(CTR().committed, 4300000);
});

test('部分付款：登记、防重复、阻止低于已付额的变更', () => {
  const first = recordPayment('CTR-01', '锁剪交付');
  assert.ok(first.ok);
  assert.equal(CTR().paid, 3500000);
  assert.equal(CTR().milestones[0].status, 'paid');
  assert.ok(auditEvents.some(e => e.action === 'PAYMENT' && e.entityId === 'CTR-01'));
  const duplicate = recordPayment('CTR-01', '锁剪交付');
  assert.ok(!duplicate.ok && duplicate.status === 409);
  const missing = recordPayment('CTR-01', '不存在的节点');
  assert.ok(!missing.ok && missing.status === 404);
  const low = submitChangeOrder('CTR-01', { ...validInput(), changes: { ...validInput().changes, committed: 3000000, budgetCommittedDelta: -1300000, budgetForecastDelta: -1300000 } });
  assert.ok(!low.ok && low.status === 422);
  assert.match(low.message, /低于合同已付款/);
});

test('批准校验失败：状态漂移被防御性复核拦截，数据保持不变', () => {
  const submitted = submitChangeOrder('CTR-01', validInput(), 'key-def');
  assert.ok(submitted.ok);
  const id = submitted.value.order.id;
  LINE().planned = 4500000; // 模拟外部基线调整（未走版本号）
  const result = approveChangeOrder(id);
  assert.ok(!result.ok && result.status === 422);
  assert.match(result.message, /批准校验失败/);
  assert.equal(CTR().committed, 4300000);
  assert.equal(LINE().committed, 4300000);
  assert.equal(changeOrders.find(o => o.id === id)?.status, 'pending');
});

test('批准校验：不存在或已结案的变更单返回冲突', () => {
  const missing = approveChangeOrder('CO-999');
  assert.ok(!missing.ok && missing.status === 404);
  const submitted = submitChangeOrder('CTR-01', validInput(), 'key-twice');
  assert.ok(submitted.ok);
  assert.ok(approveChangeOrder(submitted.value.order.id).ok);
  const again = approveChangeOrder(submitted.value.order.id);
  assert.ok(!again.ok && again.status === 409);
  const rejectAgain = rejectChangeOrder(submitted.value.order.id);
  assert.ok(!rejectAgain.ok && rejectAgain.status === 409);
});

test('HTTP：并发提交只创建一单，批准后刷新各读模型一致', async () => {
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const before = await (await fetch(`${base}/api/projects/PRJ-001/summary`)).json();
    assert.equal(before.contracts.find((c: { id: string }) => c.id === 'CTR-01').committed, 4300000);
    const post = (key: string) => fetch(`${base}/api/contracts/CTR-01/change-orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(validInput()) });
    const responses = await Promise.all([post('http-key'), post('http-key'), post('http-key')]);
    assert.deepEqual(responses.map(r => r.status).sort((x, y) => x - y), [200, 200, 201]);
    const bodies = await Promise.all(responses.map(r => r.json()));
    assert.ok(bodies.every(b => b.id === bodies[0].id));
    const dup = await post('http-key-2');
    assert.equal(dup.status, 409);
    const list = await (await fetch(`${base}/api/contracts/CTR-01/change-orders`)).json();
    assert.equal(list.filter((o: { status: string }) => o.status === 'pending').length, 1);
    const id = bodies[0].id;
    const approved = await fetch(`${base}/api/change-orders/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment: '财务复核通过' }) });
    assert.equal(approved.status, 200);
    const again = await fetch(`${base}/api/change-orders/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(again.status, 409);
    // 刷新后一致性：重复拉取的读模型完全稳定且反映已批准状态
    const after1 = await (await fetch(`${base}/api/projects/PRJ-001/summary`)).json();
    const after2 = await (await fetch(`${base}/api/projects/PRJ-001/summary`)).json();
    assert.deepEqual(after1, after2);
    assert.equal(after1.contracts.find((c: { id: string }) => c.id === 'CTR-01').committed, 4800000);
    assert.equal(after1.lines.find((l: { id: string }) => l.id === 'BL-103').committed, 4800000);
    assert.equal(after1.lines.find((l: { id: string }) => l.id === 'BL-103').forecast, 6250000);
    assert.equal(after1.pendingChangeOrders, 0);
    const orders = await (await fetch(`${base}/api/projects/PRJ-001/change-orders`)).json();
    const done = orders.find((o: { id: string }) => o.id === id);
    assert.equal(done.status, 'approved');
    assert.equal(done.beforeSnapshot.contract.committed, 4300000);
    assert.equal(done.afterSnapshot.contract.committed, 4800000);
    assert.ok(done.diffs.fields.some((f: { field: string }) => f.field === 'committed'));
  } finally {
    server.close();
  }
});

test('HTTP：付款后批准在途变更单返回 409 过期，重提后成功', async () => {
  const server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const headers = { 'Content-Type': 'application/json' };
    const created = await fetch(`${base}/api/contracts/CTR-01/change-orders`, { method: 'POST', headers, body: JSON.stringify(validInput()) });
    const order = await created.json();
    await fetch(`${base}/api/contracts/CTR-01/payments`, { method: 'POST', headers, body: JSON.stringify({ milestone: '锁剪交付' }) });
    const stale = await fetch(`${base}/api/change-orders/${order.id}/approve`, { method: 'POST', headers, body: '{}' });
    assert.equal(stale.status, 409);
    const resubmitted = await fetch(`${base}/api/change-orders/${order.id}/resubmit`, { method: 'POST', headers, body: JSON.stringify({ reason: '基于最新付款状态重提。' }) });
    assert.equal(resubmitted.status, 201);
    const resub = await resubmitted.json();
    const approved = await fetch(`${base}/api/change-orders/${resub.id}/approve`, { method: 'POST', headers, body: '{}' });
    assert.equal(approved.status, 200);
    const contract = (await (await fetch(`${base}/api/projects/PRJ-001/contracts`)).json()).find((c: { id: string }) => c.id === 'CTR-01');
    assert.equal(contract.committed, 4800000);
    assert.equal(contract.paid, 3500000);
    assert.equal(contract.milestones.find((m: { name: string }) => m.name === '锁剪交付').status, 'paid');
  } finally {
    server.close();
  }
});

// 保持日期辅助函数被使用（避免 lint 噪音），并验证种子数据满足校验前提
test('种子数据自洽：里程碑升序、已批准历史单快照完整', () => {
  assert.ok(day(0).length === 10);
  for (const contract of contracts) {
    for (let i = 1; i < contract.milestones.length; i += 1) assert.ok(contract.milestones[i].due >= contract.milestones[i - 1].due);
  }
  const history = changeOrders.find(o => o.id === 'CO-001')!;
  assert.equal(history.status, 'approved');
  assert.equal(history.beforeSnapshot?.contract.committed, 900000);
  assert.equal(history.afterSnapshot?.contract.committed, 1100000);
});
