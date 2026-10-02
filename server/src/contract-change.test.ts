import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditEvents, budgetLines, contractChanges, contracts, decideContractChange, DomainError,
  projectSummary, resubmitContractChange, submitContractChange, type SubmitContractChangeInput
} from './domain.js';

const milestoneInput = (contractId: string) => {
  const contract = contracts.find(item => item.id === contractId)!;
  return contract.milestones.map(milestone => ({ id: milestone.id, name: milestone.name, due: milestone.due, amount: milestone.amount, status: milestone.status }));
};
const ctr03Input = (overrides: Partial<SubmitContractChangeInput> = {}): SubmitContractChangeInput => ({
  contractId: 'CTR-03',
  reason: '追加航拍结算与卫星素材加急处理',
  requestedBy: '纪录片制片',
  approver: '财务负责人',
  ceiling: 1600000,
  committed: 1300000,
  forecastDelta: 200000,
  milestones: [
    ...milestoneInput('CTR-03'),
    { name: '加急卫星素材包', due: '2099-12-31', amount: 200000 }
  ],
  idempotencyKey: `key-${Date.now()}-${Math.random()}`,
  ...overrides
});
const ctr01Input = (overrides: Partial<SubmitContractChangeInput> = {}): SubmitContractChangeInput => ({
  contractId: 'CTR-01',
  reason: '新增调色轮次与加急费',
  requestedBy: '后期制片',
  approver: '财务负责人',
  scope: '4K HDR 调色、声音、DCP 母版；新增 2 轮调色',
  ceiling: 5200000,
  committed: 4450000,
  forecastDelta: 150000,
  milestones: [
    ...milestoneInput('CTR-01'),
    { name: '追加调色轮次与加急', due: '2099-11-30', amount: 500000 }
  ],
  idempotencyKey: `key-${Date.now()}-${Math.random()}`,
  ...overrides
});

test('contract change records reasons, field diffs, budget subject and milestone additions', () => {
  const { change, duplicate } = submitContractChange(ctr03Input());
  assert.equal(duplicate, false);
  assert.equal(change.status, 'pending');
  assert.match(change.reason, /加急/);
  assert.deepEqual(change.fieldDiffs.map(item => item.field), ['committed']);
  assert.equal(change.budgetAdjustment.budgetLineId, 'BL-201');
  assert.equal(change.budgetAdjustment.committedDelta, 200000);
  assert.equal(change.budgetAdjustment.forecastDelta, 200000);
  assert.equal(change.milestoneDiffs.at(-1)?.action, 'added');
  assert.equal(change.beforeSnapshot.contract.committed, 1100000);
  assert.equal(change.beforeSnapshot.budgetLine.committed, 5100000);
  decideContractChange(change.id, 'rejected', '财务负责人', '测试清理：不通过');
});

test('duplicate idempotency key returns same request while concurrent pending submission is rejected', () => {
  const key = 'duplicate-key-ctr01';
  const first = submitContractChange(ctr01Input({ idempotencyKey: key }));
  assert.equal(first.duplicate, false);
  const retry = submitContractChange(ctr01Input({ idempotencyKey: key }));
  assert.equal(retry.duplicate, true);
  assert.equal(retry.change.id, first.change.id);
  assert.throws(() => submitContractChange(ctr01Input({ idempotencyKey: 'different-key' })), (error: unknown) =>
    error instanceof DomainError && error.code === 'conflict' && /审批中/.test(error.message));
  decideContractChange(first.change.id, 'rejected', '财务负责人', '测试清理：释放合同');
});

test('approval atomically updates contract and budget committed/forecast and stores snapshot with audit', () => {
  const contract = contracts.find(item => item.id === 'CTR-03')!;
  const line = budgetLines.find(item => item.id === 'BL-201')!;
  const committedBefore = contract.committed;
  const committedVersionBefore = contract.version;
  const lineCommittedBefore = line.committed;
  const lineVersionBefore = line.version;
  const forecastBefore = line.forecast;
  const { change } = submitContractChange(ctr03Input({ idempotencyKey: 'approve-key' }));
  const approved = decideContractChange(change.id, 'approved', '财务负责人', '加急费与新增里程碑已复核');

  assert.equal(approved.status, 'approved');
  assert.equal(contract.committed, committedBefore + 200000);
  assert.equal(contract.version, committedVersionBefore + 1);
  assert.equal(line.committed, lineCommittedBefore + 200000);
  assert.equal(line.forecast, forecastBefore + 200000);
  assert.equal(line.version, lineVersionBefore + 1);
  assert.equal(approved.afterSnapshot?.contract.committed, contract.committed);
  assert.equal(approved.afterSnapshot?.budgetLine.forecast, line.forecast);
  assert.ok(auditEvents.some(event => event.action === 'APPLY' && event.entity === 'contract' && event.entityId === 'CTR-03'));
  assert.ok(auditEvents.some(event => event.action === 'APPROVE' && event.entity === 'contract_change'));
  assert.equal(projectSummary('PRJ-002').contractChanges.some(item => item.id === change.id), true);
});

test('changes below paid amount, invalid milestone reordering, and over-budget are rejected before saving', () => {
  const ctr01 = contracts.find(item => item.id === 'CTR-01')!;
  assert.throws(() => submitContractChange({
    ...ctr01Input({ idempotencyKey: 'below-paid' }),
    ceiling: 2000000,
    committed: 2000000,
    milestones: milestoneInput('CTR-01')
  }), /不能低于已付款/);

  assert.throws(() => submitContractChange({
    ...ctr01Input({ contractId: 'CTR-02', idempotencyKey: 'invalid-reorder', scope: contracts[1].scope }),
    ceiling: 880000,
    committed: 880000,
    forecastDelta: 0,
    milestones: [...milestoneInput('CTR-02').reverse()]
  }), /重排/);

  assert.throws(() => submitContractChange({
    ...ctr01Input({ idempotencyKey: 'over-budget' }),
    ceiling: 5200000,
    committed: 5200000,
    forecastDelta: 900000,
    milestones: milestoneInput('CTR-01')
  }), /超预算/);
  assert.equal(contractChanges.filter(item => item.contractId === 'CTR-01' && item.status === 'pending').length, 0);
  assert.equal(ctr01.version, 1);
});

test('rejected change does not mutate ledger and can be revised and resubmitted', () => {
  const contract = contracts.find(item => item.id === 'CTR-02')!;
  const line = budgetLines.find(item => item.id === 'BL-104')!;
  const contractBefore = { committed: contract.committed, version: contract.version };
  const lineBefore = { forecast: line.forecast, committed: line.committed, version: line.version };
  const { change } = submitContractChange({
    contractId: 'CTR-02', reason: '补充版权加急窗口费用', requestedBy: '法务', approver: '财务',
    ceiling: 880000, committed: 880000, forecastDelta: 100000,
    milestones: [
      milestoneInput('CTR-02')[0],
      { id: 'MS-CTR-02-2', name: '交付版权证明', due: '2099-12-20', amount: 440000, status: 'invoiced' }
    ], idempotencyKey: 'reject-resubmit'
  });
  decideContractChange(change.id, 'rejected', '财务', '先补齐供应商补充协议');
  assert.deepEqual({ committed: contract.committed, version: contract.version }, contractBefore);
  assert.deepEqual({ forecast: line.forecast, committed: line.committed, version: line.version }, lineBefore);

  assert.throws(() => resubmitContractChange(change.id, { forecastDelta: 200000 }), /超预算/);
  const resubmitted = resubmitContractChange(change.id, { forecastDelta: 100000 });
  assert.equal(resubmitted.status, 'pending');
  assert.equal(resubmitted.revision, 2);
  decideContractChange(resubmitted.id, 'approved', '财务', '补充协议已归档');
  assert.equal(line.forecast, lineBefore.forecast + 100000);
  assert.equal(contract.version, 2);
});

test('approval after contract or budget mutation fails stale checks, then refresh and resubmit succeeds', () => {
  const contract = contracts.find(item => item.id === 'CTR-01')!;
  const line = budgetLines.find(item => item.id === 'BL-103')!;
  const { change } = submitContractChange(ctr01Input({ idempotencyKey: 'stale-contract' }));
  contract.paid += 100000;
  contract.version += 1;
  assert.throws(() => decideContractChange(change.id, 'approved', '财务'), /合同在审批期间已变化/);
  assert.equal(change.status, 'pending');
  assert.equal(contract.committed, 4300000);
  contract.paid -= 100000;
  contract.version -= 1;

  const forecastBeforeBudgetMutation = line.forecast;
  line.forecast += 100000;
  line.version += 1;
  assert.throws(() => decideContractChange(change.id, 'approved', '财务'), /预算科目在审批期间已变化/);
  assert.equal(change.status, 'pending');
  assert.equal(contract.committed, 4300000);
  assert.equal(line.committed, 4300000);

  const resubmitted = resubmitContractChange(change.id, { committed: 4350000, forecastDelta: 50000 });
  decideContractChange(resubmitted.id, 'approved', '财务', '刷新后按最新预算重提并通过');
  assert.equal(contract.committed, 4350000);
  assert.equal(line.committed, 4350000);
  assert.equal(line.forecast, forecastBeforeBudgetMutation + 150000);
  assert.equal(contract.version, 2);
  assert.equal(line.version, 3);
});
