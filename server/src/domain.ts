export type ProjectStatus = 'development' | 'production' | 'post' | 'delivered';
export type AssetType = 'master' | 'trailer' | 'poster' | 'audio' | 'subtitle';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type MilestoneStatus = 'open' | 'invoiced' | 'paid';
export type ContractChangeStatus = ApprovalStatus;

export interface Project { id: string; code: string; title: string; season: number; status: ProjectStatus; currency: string; budgetVersionId: string; deliveryDate: string; }
export interface BudgetLine { id: string; projectId: string; category: string; subcategory: string; planned: number; committed: number; actual: number; forecast: number; owner: string; risk: 'low' | 'medium' | 'high'; version: number; }
export interface Milestone { id: string; name: string; due: string; amount: number; status: MilestoneStatus; }
export interface Contract { id: string; projectId: string; vendor: string; scope: string; ceiling: number; committed: number; paid: number; budgetLineId: string; version: number; milestones: Milestone[]; }
export interface Asset { id: string; projectId: string; name: string; type: AssetType; version: number; status: 'draft' | 'review' | 'approved' | 'locked'; owner: string; checksum: string; territories: string[]; platforms: string[]; availableFrom: string; availableTo: string; rightsTags: string[]; }
export interface Approval { id: string; projectId: string; entityType: 'budget' | 'asset' | 'delivery'; entityId: string; title: string; requestedBy: string; status: ApprovalStatus; approver: string; createdAt: string; comment?: string; }
export interface AuditEvent { id: string; action: string; entity: string; entityId: string; actor: string; at: string; details: string; }

export interface ProposedMilestone { id?: string; name: string; due: string; amount: number; status?: MilestoneStatus; }
export interface FieldDiff { field: string; label: string; before: unknown; after: unknown; }
export interface BudgetAdjustment {
  budgetLineId: string;
  category: string;
  subcategory: string;
  beforePlanned: number;
  beforeCommitted: number;
  beforeForecast: number;
  committedDelta: number;
  forecastDelta: number;
  afterCommitted: number;
  afterForecast: number;
}
export interface MilestoneDiff { action: 'added' | 'changed' | 'unchanged'; milestoneId: string; name: string; before?: Milestone; after: Milestone; changedFields: string[]; }
export interface ContractChangeSnapshot {
  contract: Contract;
  budgetLine: BudgetLine;
}
export interface ContractChangeDecision { decision: 'approved' | 'rejected'; by: string; at: string; comment?: string; }
export interface ContractChange {
  id: string;
  projectId: string;
  contractId: string;
  revision: number;
  status: ContractChangeStatus;
  reason: string;
  requestedBy: string;
  approver: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  decisionComment?: string;
  decisions: ContractChangeDecision[];
  baseContractVersion: number;
  baseBudgetVersion: number;
  fieldDiffs: FieldDiff[];
  budgetAdjustment: BudgetAdjustment;
  milestoneDiffs: MilestoneDiff[];
  proposed: {
    scope: string;
    ceiling: number;
    committed: number;
    budgetLineId: string;
    forecastDelta: number;
    milestones: Milestone[];
  };
  beforeSnapshot: ContractChangeSnapshot;
  afterSnapshot?: ContractChangeSnapshot;
}

export class DomainError extends Error {
  constructor(public code: 'not_found' | 'conflict' | 'validation' | 'stale', message: string) { super(message); this.name = 'DomainError'; }
}

const now = Date.now();
const iso = (days: number) => new Date(now + days * 86400000).toISOString().slice(0, 10);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}-${(sequence += 1)}`;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const finiteAmount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const money = (value: number) => `¥${value.toLocaleString('zh-CN')}`;

function audit(action: string, entity: string, entityId: string, actor: string, details: string) {
  auditEvents.unshift({ id: nextId('AUD'), action, entity, entityId, actor, at: new Date().toISOString(), details });
}

export const projects: Project[] = [
  { id: 'PRJ-001', code: 'NORTHSTAR-S1', title: 'Northstar / 北境回声', season: 1, status: 'post', currency: 'CNY', budgetVersionId: 'BUD-001-V3', deliveryDate: iso(44) },
  { id: 'PRJ-002', code: 'ORBIT-DOC', title: 'Orbit / 轨道之外', season: 1, status: 'production', currency: 'CNY', budgetVersionId: 'BUD-002-V2', deliveryDate: iso(126) }
];
export const budgetLines: BudgetLine[] = [
  { id: 'BL-101', projectId: 'PRJ-001', category: '制作', subcategory: '主演与主创', planned: 12800000, committed: 11200000, actual: 10400000, forecast: 13100000, owner: '制片部', risk: 'medium', version: 1 },
  { id: 'BL-102', projectId: 'PRJ-001', category: '制作', subcategory: '摄影器材与场地', planned: 6800000, committed: 6400000, actual: 5980000, forecast: 7020000, owner: '现场制片', risk: 'low', version: 1 },
  { id: 'BL-103', projectId: 'PRJ-001', category: '后期', subcategory: '调色、DIT、母版', planned: 6000000, committed: 4300000, actual: 2800000, forecast: 5850000, owner: '后期制片', risk: 'high', version: 1 },
  { id: 'BL-104', projectId: 'PRJ-001', category: '宣发', subcategory: '预告片与物料', planned: 3400000, committed: 1900000, actual: 1240000, forecast: 3250000, owner: '营销部', risk: 'medium', version: 1 },
  { id: 'BL-201', projectId: 'PRJ-002', category: '制作', subcategory: '跨国拍摄', planned: 9200000, committed: 5100000, actual: 3300000, forecast: 9000000, owner: '制片部', risk: 'medium', version: 1 }
];
export const contracts: Contract[] = [
  { id: 'CTR-01', projectId: 'PRJ-001', vendor: '曜石后期制作', scope: '4K HDR 调色、声音、DCP 母版', ceiling: 5200000, committed: 4300000, paid: 2300000, budgetLineId: 'BL-103', version: 1, milestones: [{ id: 'MS-CTR-01-1', name: '锁剪交付', due: iso(8), amount: 1200000, status: 'invoiced' }, { id: 'MS-CTR-01-2', name: '母版验收', due: iso(36), amount: 2000000, status: 'open' }] },
  { id: 'CTR-02', projectId: 'PRJ-001', vendor: '远景国际版权', scope: '北美与欧洲音乐同步许可', ceiling: 880000, committed: 880000, paid: 440000, budgetLineId: 'BL-104', version: 1, milestones: [{ id: 'MS-CTR-02-1', name: '签署', due: iso(-16), amount: 440000, status: 'paid' }, { id: 'MS-CTR-02-2', name: '交付版权证明', due: iso(4), amount: 440000, status: 'invoiced' }] },
  { id: 'CTR-03', projectId: 'PRJ-002', vendor: '云帧视觉', scope: '纪录片航拍与卫星素材', ceiling: 1600000, committed: 1100000, paid: 600000, budgetLineId: 'BL-201', version: 1, milestones: [{ id: 'MS-CTR-03-1', name: '素材包一', due: iso(20), amount: 500000, status: 'open' }] }
];
export const assets: Asset[] = [
  { id: 'AST-001', projectId: 'PRJ-001', name: '北境回声 S01E01 4K HDR Master', type: 'master', version: 7, status: 'review', owner: '后期制片', checksum: 'sha256:91b7…e2a1', territories: ['CN', 'HK', 'SG'], platforms: ['影院', 'StreamBox'], availableFrom: iso(-2), availableTo: iso(730), rightsTags: ['音乐-同步许可', '演员-全媒介'] },
  { id: 'AST-002', projectId: 'PRJ-001', name: '主预告 90s / Cut A', type: 'trailer', version: 4, status: 'approved', owner: '营销部', checksum: 'sha256:42ca…9b02', territories: ['CN'], platforms: ['StreamBox', '短视频'], availableFrom: iso(6), availableTo: iso(180), rightsTags: ['演员-宣传许可'] },
  { id: 'AST-003', projectId: 'PRJ-001', name: '片尾曲 / Winter Signal', type: 'audio', version: 2, status: 'locked', owner: '音乐版权', checksum: 'sha256:113c…78f0', territories: ['CN', 'US', 'CA'], platforms: ['影院', 'StreamBox'], availableFrom: iso(-40), availableTo: iso(52), rightsTags: ['音乐-同步许可'] },
  { id: 'AST-004', projectId: 'PRJ-002', name: 'Orbit E02 Satellite Plates', type: 'master', version: 3, status: 'review', owner: '视觉总监', checksum: 'sha256:8a10…4a9d', territories: ['全球'], platforms: ['影院'], availableFrom: iso(18), availableTo: iso(365), rightsTags: ['航拍-编辑许可'] }
];
export const approvals: Approval[] = [
  { id: 'APR-01', projectId: 'PRJ-001', entityType: 'budget', entityId: 'BUD-001-V3', title: '后期超支预案 V3', requestedBy: '制片主任', status: 'pending', approver: '财务负责人', createdAt: iso(-1) },
  { id: 'APR-02', projectId: 'PRJ-001', entityType: 'asset', entityId: 'AST-001', title: 'E01 最终母版锁定', requestedBy: '后期制片', status: 'pending', approver: '总制片人', createdAt: iso(-2) },
  { id: 'APR-03', projectId: 'PRJ-002', entityType: 'delivery', entityId: 'DEL-007', title: '海外节展交付包', requestedBy: '发行部', status: 'approved', approver: '法务负责人', createdAt: iso(-5), comment: '已补充航拍授权凭证' }
];
export const contractChanges: ContractChange[] = [];
export const auditEvents: AuditEvent[] = [{ id: 'AUD-01', action: 'CREATE', entity: 'budget', entityId: 'BUD-001-V3', actor: '制片主任', at: new Date(now - 86400000).toISOString(), details: '从 V2 复制并调整后期科目' }];

export function projectSummary(projectId = projects[0].id) {
  const lines = budgetLines.filter(line => line.projectId === projectId);
  const projectContracts = contracts.filter(contract => contract.projectId === projectId);
  const projectAssets = assets.filter(asset => asset.projectId === projectId);
  const projectApprovals = approvals.filter(approval => approval.projectId === projectId);
  const projectContractChanges = contractChanges.filter(change => change.projectId === projectId);
  const planned = lines.reduce((sum, line) => sum + line.planned, 0);
  const forecast = lines.reduce((sum, line) => sum + line.forecast, 0);
  const actual = lines.reduce((sum, line) => sum + line.actual, 0);
  return { project: projects.find(project => project.id === projectId), planned, forecast, actual, variance: forecast - planned, utilization: planned ? actual / planned : 0, committed: lines.reduce((sum, line) => sum + line.committed, 0), contractExposure: projectContracts.reduce((sum, contract) => sum + contract.ceiling, 0), assetCount: projectAssets.length, pendingApprovals: projectApprovals.filter(item => item.status === 'pending').length, highRiskLines: lines.filter(line => line.risk === 'high'), lines, contracts: projectContracts, assets: projectAssets, approvals: projectApprovals, contractChanges: projectContractChanges };
}

export function rightsConflicts(projectId = projects[0].id) {
  const list = assets.filter(asset => asset.projectId === projectId);
  const conflicts: { severity: 'critical' | 'warning'; assetA: string; assetB: string; reason: string }[] = [];
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
    const a = list[i], b = list[j];
    const sameTag = a.rightsTags.some(tag => b.rightsTags.includes(tag));
    const sameTerritory = a.territories.includes('全球') || b.territories.includes('全球') || a.territories.some(territory => b.territories.includes(territory));
    if (sameTag && sameTerritory && a.availableTo >= b.availableFrom && b.availableTo >= a.availableFrom) conflicts.push({ severity: a.status === 'locked' || b.status === 'locked' ? 'critical' : 'warning', assetA: a.name, assetB: b.name, reason: `同一授权标签在重叠窗口内覆盖相同地域：${a.rightsTags.filter(tag => b.rightsTags.includes(tag)).join('、')}` });
  }
  return conflicts;
}

export function approve(id: string, status: ApprovalStatus, comment = '') {
  const item = approvals.find(approval => approval.id === id); if (!item) return undefined;
  item.status = status; item.comment = comment; audit(status.toUpperCase(), item.entityType, item.entityId, '当前审批人', comment || `${item.title} 已${status === 'approved' ? '通过' : '驳回'}`); return item;
}
export function createApproval(input: Pick<Approval, 'projectId' | 'entityType' | 'entityId' | 'title' | 'requestedBy' | 'approver'>) { const item: Approval = { ...input, id: nextId('APR'), status: 'pending', createdAt: new Date().toISOString() }; approvals.unshift(item); return item; }
export function dashboard() { return projects.map(project => projectSummary(project.id)).map(summary => ({ id: summary.project?.id, title: summary.project?.title, status: summary.project?.status, forecast: summary.forecast, variance: summary.variance, pendingApprovals: summary.pendingApprovals, rightsConflicts: rightsConflicts(summary.project?.id).length })); }

export interface SubmitContractChangeInput {
  contractId: string;
  reason: string;
  requestedBy: string;
  approver: string;
  scope?: string;
  ceiling: number;
  committed: number;
  budgetLineId?: string;
  forecastDelta: number;
  milestones: ProposedMilestone[];
  idempotencyKey?: string;
}

export interface ContractChangeResult { change: ContractChange; duplicate: boolean; }

function getContract(contractId: string) {
  const contract = contracts.find(item => item.id === contractId);
  if (!contract) throw new DomainError('not_found', '合同不存在');
  return contract;
}

function getBudgetLine(budgetLineId: string, projectId: string) {
  const line = budgetLines.find(item => item.id === budgetLineId);
  if (!line || line.projectId !== projectId) throw new DomainError('not_found', '预算科目不存在或不属于该项目');
  return line;
}

function requireText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new DomainError('validation', `${label}不能为空`);
  return value.trim();
}

function validateMilestones(contract: Contract, proposed: ProposedMilestone[]): Milestone[] {
  if (!Array.isArray(proposed) || proposed.length === 0) throw new DomainError('validation', '至少保留一个付款里程碑');
  const byId = new Map(contract.milestones.map(milestone => [milestone.id, milestone]));
  const seen = new Set<string>();
  const result: Milestone[] = [];
  let paidIndex = 0;
  let total = 0;

  proposed.forEach((item, index) => {
    if (!item || typeof item !== 'object') throw new DomainError('validation', `第 ${index + 1} 个里程碑无效`);
    const name = requireText(item.name, `第 ${index + 1} 个里程碑名称`);
    if (!validDate(item.due)) throw new DomainError('validation', `里程碑「${name}」日期无效，格式必须为 YYYY-MM-DD`);
    if (!finiteAmount(item.amount) || item.amount <= 0) throw new DomainError('validation', `里程碑「${name}」金额必须大于 0`);
    total += item.amount;

    if (item.id) {
      const existing = byId.get(item.id);
      if (existing) {
        if (seen.has(item.id)) throw new DomainError('validation', `里程碑 ${item.id} 重复提交`);
        seen.add(item.id);
        if (existing.status === 'paid') {
          if (index !== paidIndex) throw new DomainError('validation', '已付款里程碑不能被重排');
          if (item.name !== existing.name || item.amount !== existing.amount || item.due !== existing.due || (item.status && item.status !== existing.status)) throw new DomainError('validation', '已付款里程碑不能调整');
        }
        if (existing.status === 'invoiced') {
          if (index > contract.milestones.findIndex(milestone => milestone.id === existing.id)) throw new DomainError('validation', '已开票里程碑不能被重排到后序位置');
          if (item.name !== existing.name || item.amount !== existing.amount || (item.status && item.status !== existing.status)) throw new DomainError('validation', '已开票里程碑只能调整到期日');
        }
        if (item.status && item.status !== existing.status) throw new DomainError('validation', `里程碑「${name}」状态不能由变更单修改`);
        result.push({ id: existing.id, name: item.name, due: item.due, amount: item.amount, status: existing.status });
      } else {
        if (item.status && item.status !== 'open') throw new DomainError('validation', '新增里程碑只能使用 open 状态');
        result.push({ id: nextId(`MS-${contract.id}-NEW`), name, due: item.due, amount: item.amount, status: 'open' });
      }
    } else {
      if (item.status && item.status !== 'open') throw new DomainError('validation', '新增里程碑只能使用 open 状态');
      result.push({ id: nextId(`MS-${contract.id}-NEW`), name, due: item.due, amount: item.amount, status: 'open' });
    }
    if (item.id && byId.get(item.id)?.status === 'paid') paidIndex += 1;
  });

  contract.milestones.forEach(existing => {
    if (!seen.has(existing.id)) throw new DomainError('validation', `里程碑「${existing.name}」缺失，付款里程碑不能删除`);
  });
  const originalLockedOrder = contract.milestones
    .map((milestone, index) => ({ id: milestone.id, index, locked: milestone.status !== 'open' }))
    .filter(item => item.locked);
  const proposedLockedOrder = result
    .map((milestone, index) => ({ id: milestone.id, index, locked: contract.milestones.some(item => item.id === milestone.id && item.status !== 'open') }))
    .filter(item => item.locked);
  if (proposedLockedOrder.length !== originalLockedOrder.length || proposedLockedOrder.some((item, index) => item.id !== originalLockedOrder[index]?.id || item.index !== index)) throw new DomainError('validation', '无效重排：已付款或已开票里程碑不能改变位置');
  if (total < contract.paid) throw new DomainError('validation', `里程碑总额 ${money(total)} 低于已付款 ${money(contract.paid)}`);
  return result;
}

function buildChange(contract: Contract, input: SubmitContractChangeInput, revision: number): ContractChange {
  const reason = requireText(input.reason, '提交理由');
  const requestedBy = requireText(input.requestedBy, '申请人');
  const approver = requireText(input.approver, '审批人');
  if (!finiteAmount(input.ceiling) || input.ceiling < 0) throw new DomainError('validation', '合同上限金额无效');
  if (!finiteAmount(input.committed) || input.committed < 0) throw new DomainError('validation', '合同承诺金额无效');
  if (!finiteAmount(input.forecastDelta)) throw new DomainError('validation', '预算预测调整额无效');
  if (input.ceiling < contract.paid || input.committed < contract.paid) throw new DomainError('validation', `变更后金额不能低于已付款 ${money(contract.paid)}`);
  if (input.committed > input.ceiling) throw new DomainError('validation', '合同承诺金额不能超过合同上限');

  const scope = input.scope === undefined ? contract.scope : requireText(input.scope, '合同范围');
  const budgetLineId = input.budgetLineId ?? contract.budgetLineId;
  if (budgetLineId !== contract.budgetLineId) throw new DomainError('validation', '合同变更单只能调整当前预算科目的金额；不能把合同转移到其他科目');
  const line = getBudgetLine(budgetLineId, contract.projectId);
  const milestones = validateMilestones(contract, input.milestones);
  const milestoneTotal = milestones.reduce((sum, milestone) => sum + milestone.amount, 0);
  if (milestoneTotal > input.ceiling) throw new DomainError('validation', `里程碑总额 ${money(milestoneTotal)} 超过合同上限 ${money(input.ceiling)}`);

  const committedDelta = input.committed - contract.committed;
  const afterCommitted = line.committed + committedDelta;
  const afterForecast = line.forecast + input.forecastDelta;
  if (input.forecastDelta < committedDelta) throw new DomainError('validation', '预算 forecast 调整额不能小于合同 committed 增量');
  if (input.ceiling > line.planned) throw new DomainError('validation', `合同上限 ${money(input.ceiling)} 超过预算科目计划额 ${money(line.planned)}`);
  if (afterCommitted > line.planned) throw new DomainError('validation', `预算科目 committed 将达到 ${money(afterCommitted)}，超过计划额 ${money(line.planned)}`);
  if (afterForecast > line.planned) throw new DomainError('validation', `预算科目 forecast 将达到 ${money(afterForecast)}，超过计划额 ${money(line.planned)}（超预算）`);
  if (afterCommitted < line.actual) throw new DomainError('validation', '变更后 committed 不能低于实际付款');
  if (afterForecast < afterCommitted) throw new DomainError('validation', '变更后 forecast 不能低于 committed');

  const fieldDiffs: FieldDiff[] = [];
  if (scope !== contract.scope) fieldDiffs.push({ field: 'scope', label: '合同范围', before: contract.scope, after: scope });
  if (input.ceiling !== contract.ceiling) fieldDiffs.push({ field: 'ceiling', label: '合同上限', before: contract.ceiling, after: input.ceiling });
  if (input.committed !== contract.committed) fieldDiffs.push({ field: 'committed', label: '合同承诺', before: contract.committed, after: input.committed });

  const oldById = new Map(contract.milestones.map(milestone => [milestone.id, milestone]));
  const milestoneDiffs: MilestoneDiff[] = milestones.map(milestone => {
    const before = oldById.get(milestone.id);
    const changedFields = before ? ['name', 'due', 'amount', 'status'].filter(field => JSON.stringify((before as unknown as Record<string, unknown>)[field]) !== JSON.stringify((milestone as unknown as Record<string, unknown>)[field])) : [];
    return { action: before ? (changedFields.length ? 'changed' : 'unchanged') : 'added', milestoneId: milestone.id, name: milestone.name, before: before ? clone(before) : undefined, after: clone(milestone), changedFields };
  });

  const budgetAdjustment: BudgetAdjustment = {
    budgetLineId: line.id, category: line.category, subcategory: line.subcategory,
    beforePlanned: line.planned, beforeCommitted: line.committed, beforeForecast: line.forecast,
    committedDelta, forecastDelta: input.forecastDelta, afterCommitted, afterForecast
  };
  const timestamp = new Date().toISOString();
  return {
    id: nextId('CCO'), projectId: contract.projectId, contractId: contract.id, revision,
    status: 'pending', reason, requestedBy, approver, idempotencyKey: input.idempotencyKey?.trim() || undefined,
    createdAt: timestamp, updatedAt: timestamp, decisions: [],
    baseContractVersion: contract.version, baseBudgetVersion: line.version,
    fieldDiffs, budgetAdjustment, milestoneDiffs,
    proposed: { scope, ceiling: input.ceiling, committed: input.committed, budgetLineId, forecastDelta: input.forecastDelta, milestones },
    beforeSnapshot: { contract: clone(contract), budgetLine: clone(line) }
  };
}

function assertFresh(change: ContractChange, contract: Contract, line: BudgetLine) {
  if (contract.version !== change.baseContractVersion || JSON.stringify(contract) !== JSON.stringify(change.beforeSnapshot.contract)) throw new DomainError('stale', '合同在审批期间已变化，请基于最新版本重提变更单');
  if (line.version !== change.baseBudgetVersion || JSON.stringify(line) !== JSON.stringify(change.beforeSnapshot.budgetLine)) throw new DomainError('stale', '预算科目在审批期间已变化，请基于最新版本重提变更单');
  validateProposal(contract, line, change.proposed);
}

function validateProposal(contract: Contract, line: BudgetLine, proposed: ContractChange['proposed']) {
  const normalized: SubmitContractChangeInput = {
    contractId: contract.id, reason: 'revalidation', requestedBy: 'system', approver: 'system',
    scope: proposed.scope, ceiling: proposed.ceiling, committed: proposed.committed,
    budgetLineId: proposed.budgetLineId, forecastDelta: proposed.forecastDelta,
    milestones: normalizeMilestonesForContract(contract, proposed.milestones)
  };
  buildChange(contract, normalized, 0);
}

function normalizeMilestonesForContract(contract: Contract, milestones: Milestone[]): ProposedMilestone[] {
  const current = new Set(contract.milestones.map(milestone => milestone.id));
  return milestones.map(milestone => current.has(milestone.id)
    ? { ...milestone }
    : { name: milestone.name, due: milestone.due, amount: milestone.amount });
}

export function submitContractChange(input: SubmitContractChangeInput): ContractChangeResult {
  const contract = getContract(input.contractId);
  const key = input.idempotencyKey?.trim();
  if (key) {
    const duplicate = contractChanges.find(change => change.idempotencyKey === key);
    if (duplicate) {
      if (duplicate.contractId !== contract.id || duplicate.requestedBy !== requireText(input.requestedBy, '申请人')) throw new DomainError('conflict', '幂等键已用于其他合同变更申请');
      return { change: duplicate, duplicate: true };
    }
  }
  const pending = contractChanges.find(change => change.contractId === contract.id && change.status === 'pending');
  if (pending) throw new DomainError('conflict', `合同已有审批中的变更单 ${pending.id}，不能重复或并发提交`);
  const change = buildChange(contract, input, 1);
  contractChanges.unshift(change);
  audit('CREATE', 'contract_change', change.id, change.requestedBy, `提交合同变更单：${contract.id}；${change.reason}`);
  return { change, duplicate: false };
}

export function decideContractChange(id: string, decision: 'approved' | 'rejected', actor: string, comment = ''): ContractChange {
  const change = contractChanges.find(item => item.id === id);
  if (!change) throw new DomainError('not_found', '合同变更单不存在');
  if (change.status !== 'pending') throw new DomainError('conflict', `变更单已${change.status === 'approved' ? '批准' : '驳回'}，不能重复审批`);
  const contract = getContract(change.contractId);
  const at = new Date().toISOString();
  actor = requireText(actor, '审批人');

  if (decision === 'rejected') {
    change.status = 'rejected';
    change.updatedAt = at;
    change.decidedAt = at;
    change.decidedBy = actor;
    change.decisionComment = comment;
    change.decisions.push({ decision, by: actor, at, comment });
    audit('REJECT', 'contract_change', change.id, actor, comment || `驳回合同 ${contract.id} 变更单`);
    return change;
  }

  const line = getBudgetLine(change.proposed.budgetLineId, contract.projectId);
  assertFresh(change, contract, line);
  const proposed = change.proposed;
  const beforeContract = clone(contract);
  const beforeLine = clone(line);
  contract.scope = proposed.scope;
  contract.ceiling = proposed.ceiling;
  contract.committed = proposed.committed;
  contract.budgetLineId = proposed.budgetLineId;
  contract.milestones = clone(proposed.milestones);
  contract.version += 1;
  line.committed = change.budgetAdjustment.afterCommitted;
  line.forecast = change.budgetAdjustment.afterForecast;
  line.version += 1;

  change.status = 'approved';
  change.updatedAt = at;
  change.decidedAt = at;
  change.decidedBy = actor;
  change.decisionComment = comment;
  change.baseContractVersion = contract.version;
  change.baseBudgetVersion = line.version;
  change.afterSnapshot = { contract: clone(contract), budgetLine: clone(line) };
  change.decisions.push({ decision, by: actor, at, comment });
  audit('APPROVE', 'contract_change', change.id, actor, comment || `批准合同 ${contract.id} 变更单`);
  audit('APPLY', 'contract', contract.id, actor, `原子应用变更单 ${change.id}：上限 ${money(beforeContract.ceiling)} → ${money(contract.ceiling)}，committed ${money(beforeContract.committed)} → ${money(contract.committed)}`);
  audit('APPLY', 'budget_line', line.id, actor, `原子应用变更单 ${change.id}：committed ${money(beforeLine.committed)} → ${money(line.committed)}，forecast ${money(beforeLine.forecast)} → ${money(line.forecast)}`);
  return change;
}

export interface ResubmitContractChangeInput {
  reason?: string;
  approver?: string;
  scope?: string;
  ceiling?: number;
  committed?: number;
  budgetLineId?: string;
  forecastDelta?: number;
  milestones?: ProposedMilestone[];
}

export function resubmitContractChange(id: string, input: ResubmitContractChangeInput = {}, actor?: string): ContractChange {
  const change = contractChanges.find(item => item.id === id);
  if (!change) throw new DomainError('not_found', '合同变更单不存在');
  if (change.status !== 'rejected' && change.status !== 'pending') throw new DomainError('conflict', '只有已驳回或需要刷新的变更单可以重提');
  const contract = getContract(change.contractId);
  const otherPending = contractChanges.find(item => item.id !== change.id && item.contractId === contract.id && item.status === 'pending');
  if (otherPending) throw new DomainError('conflict', `合同已有审批中的变更单 ${otherPending.id}`);
  if (change.status === 'pending') {
    const currentLine = getBudgetLine(change.proposed.budgetLineId, contract.projectId);
    if (JSON.stringify(contract) === JSON.stringify(change.beforeSnapshot.contract) && JSON.stringify(currentLine) === JSON.stringify(change.beforeSnapshot.budgetLine)) throw new DomainError('conflict', '当前变更单仍是最新版本，无需重提');
    const at = new Date().toISOString();
    change.status = 'rejected';
    change.updatedAt = at;
    change.decidedAt = at;
    change.decidedBy = actor?.trim() || change.requestedBy;
    change.decisionComment = '基础合同或预算已变化，系统按过期申请关闭后重提';
    change.decisions.push({ decision: 'rejected', by: change.decidedBy, at, comment: change.decisionComment });
    audit('REJECT', 'contract_change', change.id, change.decidedBy, change.decisionComment);
  }

  const merged: SubmitContractChangeInput = {
    contractId: contract.id,
    reason: input.reason ?? change.reason,
    requestedBy: actor?.trim() || change.requestedBy,
    approver: input.approver ?? change.approver,
    scope: input.scope ?? change.proposed.scope,
    ceiling: input.ceiling ?? change.proposed.ceiling,
    committed: input.committed ?? change.proposed.committed,
    budgetLineId: input.budgetLineId ?? change.proposed.budgetLineId,
    forecastDelta: input.forecastDelta ?? change.proposed.forecastDelta,
    milestones: input.milestones ?? normalizeMilestonesForContract(contract, change.proposed.milestones),
    idempotencyKey: change.idempotencyKey
  };
  const rebuilt = buildChange(contract, merged, change.revision + 1);
  const timestamp = new Date().toISOString();
  change.revision = rebuilt.revision;
  change.status = 'pending';
  change.reason = rebuilt.reason;
  change.approver = rebuilt.approver;
  change.updatedAt = timestamp;
  change.decidedAt = undefined;
  change.decidedBy = undefined;
  change.decisionComment = undefined;
  change.baseContractVersion = rebuilt.baseContractVersion;
  change.baseBudgetVersion = rebuilt.baseBudgetVersion;
  change.fieldDiffs = rebuilt.fieldDiffs;
  change.budgetAdjustment = rebuilt.budgetAdjustment;
  change.milestoneDiffs = rebuilt.milestoneDiffs;
  change.proposed = rebuilt.proposed;
  change.beforeSnapshot = rebuilt.beforeSnapshot;
  change.afterSnapshot = undefined;
  audit('RESUBMIT', 'contract_change', change.id, change.requestedBy, `重提合同变更单 revision ${change.revision}：${change.reason}`);
  return change;
}

export function getContractChange(id: string) {
  const change = contractChanges.find(item => item.id === id);
  if (!change) throw new DomainError('not_found', '合同变更单不存在');
  return change;
}
