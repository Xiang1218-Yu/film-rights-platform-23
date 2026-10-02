export type ProjectStatus = 'development' | 'production' | 'post' | 'delivered';
export type AssetType = 'master' | 'trailer' | 'poster' | 'audio' | 'subtitle';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ChangeOrderStatus = 'pending' | 'approved' | 'rejected' | 'stale';
export type MilestoneStatus = 'open' | 'invoiced' | 'paid';

export interface Project { id: string; code: string; title: string; season: number; status: ProjectStatus; currency: string; budgetVersionId: string; deliveryDate: string; }
export interface BudgetLine { id: string; projectId: string; category: string; subcategory: string; planned: number; committed: number; actual: number; forecast: number; owner: string; risk: 'low' | 'medium' | 'high'; version: number; }
export interface Milestone { name: string; due: string; amount: number; status: MilestoneStatus; }
export interface Contract { id: string; projectId: string; vendor: string; scope: string; ceiling: number; committed: number; paid: number; version: number; milestones: Milestone[]; }
export interface Asset { id: string; projectId: string; name: string; type: AssetType; version: number; status: 'draft' | 'review' | 'approved' | 'locked'; owner: string; checksum: string; territories: string[]; platforms: string[]; availableFrom: string; availableTo: string; rightsTags: string[]; }
export interface Approval { id: string; projectId: string; entityType: 'budget' | 'asset' | 'delivery'; entityId: string; title: string; requestedBy: string; status: ApprovalStatus; approver: string; createdAt: string; comment?: string; }
export interface AuditEvent { id: string; action: string; entity: string; entityId: string; actor: string; at: string; details: string; }

// ---- 合同变更单（补充协议） ----
export interface ProposedMilestone { name: string; due: string; amount: number; }
export interface ChangeOrderChanges { ceiling?: number; committed?: number; scope?: string; milestones?: ProposedMilestone[]; budgetCommittedDelta: number; budgetForecastDelta: number; }
export interface ChangeOrderInput { title: string; reason: string; requestedBy?: string; approver?: string; budgetLineId: string; changes?: Partial<ChangeOrderChanges>; }
export interface ChangeOrderBase { contractVersion: number; budgetVersion: number; contract: { ceiling: number; committed: number; paid: number; scope: string; milestones: Milestone[] }; budgetLine: { id: string; planned: number; committed: number; forecast: number }; }
export interface ContractChangeOrder { id: string; projectId: string; contractId: string; budgetLineId: string; title: string; reason: string; requestedBy: string; approver: string; status: ChangeOrderStatus; createdAt: string; decidedAt?: string; comment?: string; changes: ChangeOrderChanges; base: ChangeOrderBase; beforeSnapshot?: { contract: Contract; budgetLine: BudgetLine }; afterSnapshot?: { contract: Contract; budgetLine: BudgetLine }; resubmitOf?: string; idempotencyKey?: string; requestFingerprint?: string; }
export type Result<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

const now = Date.now();
const iso = (days: number) => new Date(now + days * 86400000).toISOString().slice(0, 10);
const fmt = (n: number) => `¥${(n / 10000).toFixed(1)}万`;
const clone = <T>(value: T): T => structuredClone(value);
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(status: number, message: string): Result<T> => ({ ok: false, status, message });

// ---- 种子数据（resetStore 用于测试隔离） ----
const seedProjects = (): Project[] => [
  { id: 'PRJ-001', code: 'NORTHSTAR-S1', title: 'Northstar / 北境回声', season: 1, status: 'post', currency: 'CNY', budgetVersionId: 'BUD-001-V3', deliveryDate: iso(44) },
  { id: 'PRJ-002', code: 'ORBIT-DOC', title: 'Orbit / 轨道之外', season: 1, status: 'production', currency: 'CNY', budgetVersionId: 'BUD-002-V2', deliveryDate: iso(126) }
];
const seedBudgetLines = (): BudgetLine[] => [
  { id: 'BL-101', projectId: 'PRJ-001', category: '制作', subcategory: '主演与主创', planned: 12800000, committed: 11200000, actual: 10400000, forecast: 13100000, owner: '制片部', risk: 'medium', version: 1 },
  { id: 'BL-102', projectId: 'PRJ-001', category: '制作', subcategory: '摄影器材与场地', planned: 6800000, committed: 6400000, actual: 5980000, forecast: 7020000, owner: '现场制片', risk: 'low', version: 1 },
  { id: 'BL-103', projectId: 'PRJ-001', category: '后期', subcategory: '调色、DIT、母版', planned: 5400000, committed: 4300000, actual: 2800000, forecast: 5750000, owner: '后期制片', risk: 'high', version: 1 },
  { id: 'BL-104', projectId: 'PRJ-001', category: '宣发', subcategory: '预告片与物料', planned: 3600000, committed: 1900000, actual: 1240000, forecast: 3200000, owner: '营销部', risk: 'medium', version: 1 },
  { id: 'BL-201', projectId: 'PRJ-002', category: '制作', subcategory: '跨国拍摄', planned: 9200000, committed: 5100000, actual: 3300000, forecast: 9000000, owner: '制片部', risk: 'medium', version: 2 }
];
const seedContracts = (): Contract[] => [
  { id: 'CTR-01', projectId: 'PRJ-001', vendor: '曜石后期制作', scope: '4K HDR 调色、声音、DCP 母版', ceiling: 5200000, committed: 4300000, paid: 2300000, version: 1, milestones: [{ name: '锁剪交付', due: iso(8), amount: 1200000, status: 'invoiced' }, { name: '母版验收', due: iso(36), amount: 2000000, status: 'open' }] },
  { id: 'CTR-02', projectId: 'PRJ-001', vendor: '远景国际版权', scope: '北美与欧洲音乐同步许可', ceiling: 880000, committed: 880000, paid: 440000, version: 1, milestones: [{ name: '签署', due: iso(-16), amount: 440000, status: 'paid' }, { name: '交付版权证明', due: iso(4), amount: 440000, status: 'invoiced' }] },
  { id: 'CTR-03', projectId: 'PRJ-002', vendor: '云帧视觉', scope: '纪录片航拍与卫星素材', ceiling: 1600000, committed: 1100000, paid: 600000, version: 2, milestones: [{ name: '素材包一', due: iso(20), amount: 500000, status: 'open' }] }
];
const seedAssets = (): Asset[] => [
  { id: 'AST-001', projectId: 'PRJ-001', name: '北境回声 S01E01 4K HDR Master', type: 'master', version: 7, status: 'review', owner: '后期制片', checksum: 'sha256:91b7…e2a1', territories: ['CN', 'HK', 'SG'], platforms: ['影院', 'StreamBox'], availableFrom: iso(-2), availableTo: iso(730), rightsTags: ['音乐-同步许可', '演员-全媒介'] },
  { id: 'AST-002', projectId: 'PRJ-001', name: '主预告 90s / Cut A', type: 'trailer', version: 4, status: 'approved', owner: '营销部', checksum: 'sha256:42ca…9b02', territories: ['CN'], platforms: ['StreamBox', '短视频'], availableFrom: iso(6), availableTo: iso(180), rightsTags: ['演员-宣传许可'] },
  { id: 'AST-003', projectId: 'PRJ-001', name: '片尾曲 / Winter Signal', type: 'audio', version: 2, status: 'locked', owner: '音乐版权', checksum: 'sha256:113c…78f0', territories: ['CN', 'US', 'CA'], platforms: ['影院', 'StreamBox'], availableFrom: iso(-40), availableTo: iso(52), rightsTags: ['音乐-同步许可'] },
  { id: 'AST-004', projectId: 'PRJ-002', name: 'Orbit E02 Satellite Plates', type: 'master', version: 3, status: 'review', owner: '视觉总监', checksum: 'sha256:8a10…4a9d', territories: ['全球'], platforms: ['影院'], availableFrom: iso(18), availableTo: iso(365), rightsTags: ['航拍-编辑许可'] }
];
const seedApprovals = (): Approval[] => [
  { id: 'APR-01', projectId: 'PRJ-001', entityType: 'budget', entityId: 'BUD-001-V3', title: '后期超支预案 V3', requestedBy: '制片主任', status: 'pending', approver: '财务负责人', createdAt: iso(-1) },
  { id: 'APR-02', projectId: 'PRJ-001', entityType: 'asset', entityId: 'AST-001', title: 'E01 最终母版锁定', requestedBy: '后期制片', status: 'pending', approver: '总制片人', createdAt: iso(-2) },
  { id: 'APR-03', projectId: 'PRJ-002', entityType: 'delivery', entityId: 'DEL-007', title: '海外节展交付包', requestedBy: '发行部', status: 'approved', approver: '法务负责人', createdAt: iso(-5), comment: '已补充航拍授权凭证' }
];
// 已批准的历史变更单：演示前后快照与审计轨迹
const seedChangeOrders = (): ContractChangeOrder[] => [
  {
    id: 'CO-001', projectId: 'PRJ-002', contractId: 'CTR-03', budgetLineId: 'BL-201',
    title: '补充协议：航拍加拍日与素材扩容', reason: '导演组新增两天航拍窗口，需补充卫星素材授权与加急交付。',
    requestedBy: '制片主任', approver: '财务负责人', status: 'approved', createdAt: iso(-9), decidedAt: iso(-6), comment: '费用在科目预测范围内，同意。',
    changes: { ceiling: 1600000, committed: 1100000, milestones: [{ name: '素材包一', due: iso(20), amount: 500000 }], budgetCommittedDelta: 200000, budgetForecastDelta: 200000 },
    base: { contractVersion: 1, budgetVersion: 1, contract: { ceiling: 1400000, committed: 900000, paid: 600000, scope: '纪录片航拍与卫星素材', milestones: [] }, budgetLine: { id: 'BL-201', planned: 9200000, committed: 4900000, forecast: 8800000 } },
    beforeSnapshot: {
      contract: { id: 'CTR-03', projectId: 'PRJ-002', vendor: '云帧视觉', scope: '纪录片航拍与卫星素材', ceiling: 1400000, committed: 900000, paid: 600000, version: 1, milestones: [] },
      budgetLine: { id: 'BL-201', projectId: 'PRJ-002', category: '制作', subcategory: '跨国拍摄', planned: 9200000, committed: 4900000, actual: 3300000, forecast: 8800000, owner: '制片部', risk: 'medium', version: 1 }
    },
    afterSnapshot: {
      contract: { id: 'CTR-03', projectId: 'PRJ-002', vendor: '云帧视觉', scope: '纪录片航拍与卫星素材', ceiling: 1600000, committed: 1100000, paid: 600000, version: 2, milestones: [{ name: '素材包一', due: iso(20), amount: 500000, status: 'open' }] },
      budgetLine: { id: 'BL-201', projectId: 'PRJ-002', category: '制作', subcategory: '跨国拍摄', planned: 9200000, committed: 5100000, actual: 3300000, forecast: 9000000, owner: '制片部', risk: 'medium', version: 2 }
    }
  }
];
const seedAuditEvents = (): AuditEvent[] => [
  { id: 'AUD-002', action: 'CHANGE_ORDER_APPROVE', entity: 'contract-change', entityId: 'CO-001', actor: '财务负责人', at: new Date(now - 6 * 86400000).toISOString(), details: '补充协议：航拍加拍日与素材扩容 已批准，合同与预算已原子更新' },
  { id: 'AUD-001', action: 'CREATE', entity: 'budget', entityId: 'BUD-001-V3', actor: '制片主任', at: new Date(now - 86400000).toISOString(), details: '从 V2 复制并调整后期科目' }
];

export const projects = seedProjects();
export const budgetLines = seedBudgetLines();
export const contracts = seedContracts();
export const assets = seedAssets();
export const approvals = seedApprovals();
export const changeOrders: ContractChangeOrder[] = seedChangeOrders();
export const auditEvents = seedAuditEvents();

let changeOrderSeq = 2;
let auditSeq = 3;
const replaceAll = <T>(target: T[], source: T[]) => { target.length = 0; target.push(...source); };
export function resetStore() {
  replaceAll(projects, seedProjects()); replaceAll(budgetLines, seedBudgetLines()); replaceAll(contracts, seedContracts());
  replaceAll(assets, seedAssets()); replaceAll(approvals, seedApprovals()); replaceAll(changeOrders, seedChangeOrders());
  replaceAll(auditEvents, seedAuditEvents()); changeOrderSeq = 2; auditSeq = 3;
}

function audit(action: string, entity: string, entityId: string, actor: string, details: string) {
  auditEvents.unshift({ id: `AUD-${String(auditSeq++).padStart(3, '0')}`, action, entity, entityId, actor, at: new Date().toISOString(), details });
}

export function projectSummary(projectId = projects[0].id) {
  const lines = budgetLines.filter(line => line.projectId === projectId);
  const projectContracts = contracts.filter(contract => contract.projectId === projectId);
  const projectAssets = assets.filter(asset => asset.projectId === projectId);
  const projectApprovals = approvals.filter(approval => approval.projectId === projectId);
  const projectChangeOrders = changeOrders.filter(order => order.projectId === projectId);
  const planned = lines.reduce((sum, line) => sum + line.planned, 0);
  const forecast = lines.reduce((sum, line) => sum + line.forecast, 0);
  const actual = lines.reduce((sum, line) => sum + line.actual, 0);
  return { project: projects.find(project => project.id === projectId), planned, forecast, actual, variance: forecast - planned, utilization: planned ? actual / planned : 0, committed: lines.reduce((sum, line) => sum + line.committed, 0), contractExposure: projectContracts.reduce((sum, contract) => sum + contract.ceiling, 0), assetCount: projectAssets.length, pendingApprovals: projectApprovals.filter(item => item.status === 'pending').length, pendingChangeOrders: projectChangeOrders.filter(order => order.status === 'pending').length, highRiskLines: lines.filter(line => line.risk === 'high'), lines, contracts: projectContracts, assets: projectAssets, approvals: projectApprovals, changeOrders: projectChangeOrders.map(serializeChangeOrder) };
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
export function createApproval(input: Pick<Approval, 'projectId' | 'entityType' | 'entityId' | 'title' | 'requestedBy' | 'approver'>) { const item: Approval = { ...input, id: `APR-${Date.now()}`, status: 'pending', createdAt: new Date().toISOString() }; approvals.unshift(item); return item; }
export function dashboard() { return projects.map(project => projectSummary(project.id)).map(summary => ({ id: summary.project?.id, title: summary.project?.title, status: summary.project?.status, forecast: summary.forecast, variance: summary.variance, pendingApprovals: summary.pendingApprovals, rightsConflicts: rightsConflicts(summary.project?.id).length })); }

// ---- 合同变更单：提交 / 审批 / 驳回 / 重提 / 付款 ----

const fingerprint = (contractId: string, input: ChangeOrderInput) => JSON.stringify({ contractId, title: input.title, reason: input.reason, budgetLineId: input.budgetLineId, changes: input.changes });
const sameSchedule = (proposed: ProposedMilestone[], current: Milestone[]) => proposed.length === current.length && proposed.every((p, i) => p.name === current[i].name && p.due === current[i].due && p.amount === current[i].amount);

// 提交与批准共用同一套校验：低于已付款、超预算、无效重排等在此集中拦截
function validateChangeOrder(changes: ChangeOrderChanges, contract: Contract, line: BudgetLine): string | null {
  const newCommitted = changes.committed ?? contract.committed;
  const newCeiling = changes.ceiling ?? contract.ceiling;
  if (!Number.isFinite(newCommitted) || !Number.isFinite(newCeiling)) return '合同金额必须是有效数字';
  if (newCommitted < 0 || newCeiling < 0) return '合同金额不能为负';
  if (newCommitted < contract.paid) return `变更后承诺额 ${fmt(newCommitted)} 低于合同已付款 ${fmt(contract.paid)}`;
  if (newCeiling < newCommitted) return `合同额度上限 ${fmt(newCeiling)} 不能低于承诺额 ${fmt(newCommitted)}`;
  if (changes.scope !== undefined && !changes.scope.trim()) return '服务范围不能为空';
  if (!Number.isFinite(changes.budgetCommittedDelta) || !Number.isFinite(changes.budgetForecastDelta)) return '预算调整必须是有效数字';
  if (changes.budgetCommittedDelta !== newCommitted - contract.committed) return '预算科目承诺调整与合同承诺变更不一致';
  if (line.committed + changes.budgetCommittedDelta > line.planned) return `超预算：科目「${line.subcategory}」承诺额将达 ${fmt(line.committed + changes.budgetCommittedDelta)}，超出计划 ${fmt(line.planned)}`;
  if (line.forecast + changes.budgetForecastDelta < line.committed + changes.budgetCommittedDelta) return '科目预测不足以覆盖变更后的承诺额';
  if (changes.milestones) {
    const proposed = changes.milestones;
    if (proposed.length === 0) return '里程碑付款计划不能为空';
    const names = new Set<string>();
    for (const m of proposed) {
      if (!m.name?.trim()) return '里程碑名称不能为空';
      if (names.has(m.name)) return `里程碑名称重复：${m.name}`;
      names.add(m.name);
      if (!Number.isFinite(m.amount) || m.amount <= 0) return `里程碑「${m.name}」金额必须为正数`;
      if (Number.isNaN(Date.parse(m.due))) return `里程碑「${m.name}」到期日无效`;
    }
    // 已付款 / 已开票里程碑是财务事实，变更不得篡改
    for (const m of contract.milestones.filter(item => item.status !== 'open')) {
      const p = proposed.find(item => item.name === m.name);
      const label = m.status === 'paid' ? '已付款' : '已开票';
      if (!p) return `${label}里程碑「${m.name}」不可移除`;
      if (p.amount !== m.amount || p.due !== m.due) return `${label}里程碑「${m.name}」不可修改`;
    }
    // 无效重排：付款计划必须按到期日升序
    for (let i = 1; i < proposed.length; i += 1) if (proposed[i].due < proposed[i - 1].due) return '里程碑重排无效：付款计划必须按到期日升序排列';
    const total = proposed.reduce((sum, m) => sum + m.amount, 0);
    if (total > newCeiling) return `里程碑总额 ${fmt(total)} 超出合同额度上限 ${fmt(newCeiling)}`;
  }
  return null;
}

function normalizeChanges(input: ChangeOrderInput): ChangeOrderChanges {
  const num = (value: unknown) => (value === undefined || value === null ? undefined : Number(value));
  return {
    ceiling: num(input.changes?.ceiling),
    committed: num(input.changes?.committed),
    scope: input.changes?.scope,
    milestones: input.changes?.milestones?.map(m => ({ name: String(m.name ?? ''), due: String(m.due ?? ''), amount: Number(m.amount) })),
    budgetCommittedDelta: Number(input.changes?.budgetCommittedDelta ?? 0),
    budgetForecastDelta: Number(input.changes?.budgetForecastDelta ?? 0)
  };
}

function createChangeOrder(contract: Contract, input: ChangeOrderInput, idempotencyKey: string | undefined, resubmitOf?: string): Result<{ order: ContractChangeOrder; replayed: boolean }> {
  if (idempotencyKey) {
    const replay = changeOrders.find(order => order.idempotencyKey === idempotencyKey);
    if (replay) {
      if (replay.contractId === contract.id && replay.requestFingerprint === fingerprint(contract.id, input)) return ok({ order: replay, replayed: true });
      return fail(409, '幂等键已被其他变更申请使用，请更换后重试');
    }
  }
  const line = budgetLines.find(item => item.id === input.budgetLineId);
  if (!line || line.projectId !== contract.projectId) return fail(400, '预算科目不存在或不属于该合同所在项目');
  if (changeOrders.some(order => order.contractId === contract.id && order.status === 'pending')) return fail(409, '该合同已存在待审批的变更单，请先完成审批或驳回');
  if (!input.title?.trim()) return fail(400, '必须填写变更标题');
  if (!input.reason?.trim()) return fail(400, '必须填写变更理由');
  const changes = normalizeChanges(input);
  const fieldTouched = (changes.ceiling !== undefined && changes.ceiling !== contract.ceiling) || (changes.committed !== undefined && changes.committed !== contract.committed) || (changes.scope !== undefined && changes.scope !== contract.scope);
  const milestoneTouched = changes.milestones !== undefined && !sameSchedule(changes.milestones, contract.milestones);
  const budgetTouched = changes.budgetCommittedDelta !== 0 || changes.budgetForecastDelta !== 0;
  if (!fieldTouched && !milestoneTouched && !budgetTouched) return fail(400, '变更内容为空：至少调整一项合同字段、预算科目或里程碑');
  const error = validateChangeOrder(changes, contract, line);
  if (error) return fail(422, error);
  const order: ContractChangeOrder = {
    id: `CO-${String(changeOrderSeq++).padStart(3, '0')}`, projectId: contract.projectId, contractId: contract.id, budgetLineId: line.id,
    title: input.title.trim(), reason: input.reason.trim(), requestedBy: input.requestedBy ?? '制片主任', approver: input.approver ?? '财务负责人',
    status: 'pending', createdAt: new Date().toISOString(), changes,
    base: { contractVersion: contract.version, budgetVersion: line.version, contract: { ceiling: contract.ceiling, committed: contract.committed, paid: contract.paid, scope: contract.scope, milestones: clone(contract.milestones) }, budgetLine: { id: line.id, planned: line.planned, committed: line.committed, forecast: line.forecast } },
    resubmitOf, idempotencyKey, requestFingerprint: fingerprint(contract.id, input)
  };
  changeOrders.unshift(order);
  audit(resubmitOf ? 'CHANGE_ORDER_RESUBMIT' : 'CHANGE_ORDER_SUBMIT', 'contract-change', order.id, order.requestedBy, `${contract.vendor} 变更单已提交：${order.title}${resubmitOf ? `（重提自 ${resubmitOf}）` : ''}`);
  return ok({ order, replayed: false });
}

export function submitChangeOrder(contractId: string, input: ChangeOrderInput, idempotencyKey?: string): Result<{ order: ContractChangeOrder; replayed: boolean }> {
  const contract = contracts.find(item => item.id === contractId);
  if (!contract) return fail(404, '合同不存在');
  return createChangeOrder(contract, input, idempotencyKey);
}

function applyChangeOrder(contract: Contract, line: BudgetLine, changes: ChangeOrderChanges) {
  if (changes.ceiling !== undefined) contract.ceiling = changes.ceiling;
  if (changes.committed !== undefined) contract.committed = changes.committed;
  if (changes.scope !== undefined) contract.scope = changes.scope;
  if (changes.milestones) {
    const current = new Map(contract.milestones.map(m => [m.name, m]));
    contract.milestones = changes.milestones.map(p => ({ name: p.name, due: p.due, amount: p.amount, status: current.get(p.name)?.status ?? ('open' as MilestoneStatus) }));
  }
  line.committed += changes.budgetCommittedDelta;
  line.forecast += changes.budgetForecastDelta;
}

function goStale(order: ContractChangeOrder, actor: string, message: string): Result<ContractChangeOrder> {
  order.status = 'stale'; order.decidedAt = new Date().toISOString(); order.comment = message;
  audit('CHANGE_ORDER_STALE', 'contract-change', order.id, actor, message);
  return fail(409, message);
}

export function approveChangeOrder(id: string, comment = '', actor = '财务负责人'): Result<ContractChangeOrder> {
  const order = changeOrders.find(item => item.id === id);
  if (!order) return fail(404, '变更单不存在');
  if (order.status !== 'pending') return fail(409, `变更单当前状态为 ${order.status}，无法批准`);
  const contract = contracts.find(item => item.id === order.contractId);
  const line = budgetLines.find(item => item.id === order.budgetLineId);
  if (!contract || !line) return fail(500, '变更单引用的合同或预算科目不存在');
  // 乐观并发：审批期间合同或预算被其他操作更新，则申请过期，绝不用旧快照覆盖新状态
  if (contract.version !== order.base.contractVersion) return goStale(order, actor, `合同在审批期间已更新（v${order.base.contractVersion} → v${contract.version}），变更单已过期，请基于最新状态重提`);
  if (line.version !== order.base.budgetVersion) return goStale(order, actor, `预算科目在审批期间已更新（v${order.base.budgetVersion} → v${line.version}），变更单已过期，请基于最新状态重提`);
  // 批准前按当前状态完整复核（防御性）
  const error = validateChangeOrder(order.changes, contract, line);
  if (error) return fail(422, `批准校验失败：${error}`);
  // 原子应用：快照 → 变更 → 版本递增 → 审计，同步事务边界内全部成功才落账
  const beforeSnapshot = { contract: clone(contract), budgetLine: clone(line) };
  applyChangeOrder(contract, line, order.changes);
  contract.version += 1;
  line.version += 1;
  order.beforeSnapshot = beforeSnapshot;
  order.afterSnapshot = { contract: clone(contract), budgetLine: clone(line) };
  order.status = 'approved';
  order.decidedAt = new Date().toISOString();
  order.comment = comment;
  audit('CHANGE_ORDER_APPROVE', 'contract-change', order.id, actor, `${order.title} 已批准，合同与预算已原子更新${comment ? `：${comment}` : ''}`);
  return ok(order);
}

export function rejectChangeOrder(id: string, comment = '', actor = '财务负责人'): Result<ContractChangeOrder> {
  const order = changeOrders.find(item => item.id === id);
  if (!order) return fail(404, '变更单不存在');
  if (order.status !== 'pending') return fail(409, `变更单当前状态为 ${order.status}，无法驳回`);
  order.status = 'rejected';
  order.decidedAt = new Date().toISOString();
  order.comment = comment || '未填写驳回意见';
  audit('CHANGE_ORDER_REJECT', 'contract-change', order.id, actor, `${order.title} 已驳回：${order.comment}`);
  return ok(order);
}

export function resubmitChangeOrder(id: string, amendments: Partial<ChangeOrderInput> = {}, idempotencyKey?: string): Result<{ order: ContractChangeOrder; replayed: boolean }> {
  const source = changeOrders.find(item => item.id === id);
  if (!source) return fail(404, '变更单不存在');
  if (source.status !== 'rejected' && source.status !== 'stale') return fail(409, '仅被驳回或已过期的变更单可以重提');
  const contract = contracts.find(item => item.id === source.contractId);
  if (!contract) return fail(500, '变更单引用的合同不存在');
  const merged: ChangeOrderInput = {
    title: amendments.title ?? source.title,
    reason: amendments.reason ?? source.reason,
    requestedBy: amendments.requestedBy ?? source.requestedBy,
    approver: amendments.approver ?? source.approver,
    budgetLineId: amendments.budgetLineId ?? source.budgetLineId,
    changes: { ...source.changes, ...amendments.changes }
  };
  return createChangeOrder(contract, merged, idempotencyKey, source.id);
}

// 部分付款登记：付款是审批期间最常见的合同状态漂移来源，递增版本号使在途变更单过期
export function recordPayment(contractId: string, milestoneName: string, actor = '财务负责人'): Result<Contract> {
  const contract = contracts.find(item => item.id === contractId);
  if (!contract) return fail(404, '合同不存在');
  const milestone = contract.milestones.find(item => item.name === milestoneName);
  if (!milestone) return fail(404, `里程碑「${milestoneName}」不存在`);
  if (milestone.status === 'paid') return fail(409, `里程碑「${milestoneName}」已付款，请勿重复登记`);
  milestone.status = 'paid';
  contract.paid += milestone.amount;
  contract.version += 1;
  audit('PAYMENT', 'contract', contract.id, actor, `里程碑「${milestoneName}」付款 ${fmt(milestone.amount)}，合同累计已付 ${fmt(contract.paid)}`);
  return ok(contract);
}

export function getChangeOrder(id: string) { return changeOrders.find(order => order.id === id); }
export function listChangeOrders(projectId: string) { return changeOrders.filter(order => order.projectId === projectId).map(serializeChangeOrder); }
export function contractChangeOrders(contractId: string) { return changeOrders.filter(order => order.contractId === contractId).map(serializeChangeOrder); }

// 字段差异：以提交时的基线快照为基准，审批期间合同漂移不会让差异描述失真
export function serializeChangeOrder(order: ContractChangeOrder) {
  const line = budgetLines.find(item => item.id === order.budgetLineId);
  const { changes, base } = order;
  const fields: { field: string; label: string; from: number | string; to: number | string }[] = [];
  if (changes.ceiling !== undefined && changes.ceiling !== base.contract.ceiling) fields.push({ field: 'ceiling', label: '合同额度上限', from: base.contract.ceiling, to: changes.ceiling });
  if (changes.committed !== undefined && changes.committed !== base.contract.committed) fields.push({ field: 'committed', label: '合同承诺额', from: base.contract.committed, to: changes.committed });
  if (changes.scope !== undefined && changes.scope !== base.contract.scope) fields.push({ field: 'scope', label: '服务范围', from: base.contract.scope, to: changes.scope });
  const proposed = changes.milestones ?? [];
  const milestonesAdded = proposed.filter(p => !base.contract.milestones.some(m => m.name === p.name));
  const milestonesRemoved = changes.milestones ? base.contract.milestones.filter(m => !proposed.some(p => p.name === m.name)) : [];
  const milestonesModified = proposed
    .filter(p => { const m = base.contract.milestones.find(item => item.name === p.name); return m && (m.due !== p.due || m.amount !== p.amount); })
    .map(p => { const m = base.contract.milestones.find(item => item.name === p.name)!; return { name: p.name, from: { due: m.due, amount: m.amount }, to: { due: p.due, amount: p.amount } }; });
  return {
    ...order,
    diffs: {
      fields,
      milestonesAdded,
      milestonesRemoved,
      milestonesModified,
      budget: { lineId: order.budgetLineId, category: line?.category, subcategory: line?.subcategory, committedDelta: changes.budgetCommittedDelta, forecastDelta: changes.budgetForecastDelta }
    }
  };
}
