import { useCallback, useEffect, useMemo, useState } from 'react';

type ApprovalStatus = 'pending' | 'approved' | 'rejected';
type Milestone = { id: string; name: string; due: string; amount: number; status: 'open' | 'invoiced' | 'paid' };
type Contract = { id: string; vendor: string; scope: string; ceiling: number; committed: number; paid: number; budgetLineId: string; version: number; milestones: Milestone[] };
type BudgetLine = { id: string; category: string; subcategory: string; planned: number; committed: number; actual: number; forecast: number; risk: string };
type Asset = { id: string; name: string; type: string; version: number; status: string; availableTo: string };
type Approval = { id: string; title: string; status: ApprovalStatus; approver: string };
type Project = { id: string; title: string; status: string; deliveryDate: string };
type FieldDiff = { field: string; label: string; before: unknown; after: unknown };
type ContractChange = {
  id: string; contractId: string; revision: number; status: ApprovalStatus; reason: string; requestedBy: string; approver: string;
  baseContractVersion: number; baseBudgetVersion: number; fieldDiffs: FieldDiff[];
  budgetAdjustment: { budgetLineId: string; category: string; subcategory: string; committedDelta: number; forecastDelta: number; afterCommitted: number; afterForecast: number };
  milestoneDiffs: { action: string; milestoneId: string; name: string; before?: Milestone; after: Milestone; changedFields: string[] }[];
  proposed: { scope: string; ceiling: number; committed: number; budgetLineId: string; forecastDelta: number; milestones: Milestone[] };
  decisionComment?: string; updatedAt: string;
};
type Summary = {
  project: Project; planned: number; forecast: number; actual: number; variance: number; utilization: number; committed: number;
  contractExposure: number; assetCount: number; pendingApprovals: number; highRiskLines: BudgetLine[]; lines: BudgetLine[];
  contracts: Contract[]; assets: Asset[]; approvals: Approval[]; contractChanges: ContractChange[];
};
type Conflict = { severity: string; assetA: string; assetB: string; reason: string };
type FormState = { contractId: string; reason: string; requestedBy: string; approver: string; scope: string; ceiling: string; committed: string; forecastDelta: string; milestones: { name: string; due: string; amount: string }[]; addName: string; addDue: string; addAmount: string };

const money = (n: number) => `¥${(n / 10000).toFixed(1)}万`;
const api = '/api';
const blankForm = (contract?: Contract): FormState => ({
  contractId: contract?.id ?? '', reason: '', requestedBy: '制片主任', approver: '财务负责人', scope: contract?.scope ?? '',
  ceiling: String(contract?.ceiling ?? ''), committed: String(contract?.committed ?? ''), forecastDelta: '0',
  milestones: contract ? contract.milestones.map(milestone => ({ name: milestone.name, due: milestone.due, amount: String(milestone.amount) })) : [],
  addName: '', addDue: '', addAmount: ''
});
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `请求失败 (${response.status})`);
  return body as T;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState('PRJ-001');
  const [summary, setSummary] = useState<Summary>();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [tab, setTab] = useState<'overview' | 'budget' | 'rights'>('overview');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(() => blankForm());

  const load = useCallback(async (id = 'PRJ-001') => {
    setLoading(true); setError('');
    try {
      const items = await request<Project[]>('/projects');
      const active = items.find(item => item.id === id) ?? items[0];
      if (!active) throw new Error('服务端没有返回项目数据');
      const [s, c] = await Promise.all([request<Summary>(`/projects/${active.id}/summary`), request<Conflict[]>(`/projects/${active.id}/rights-conflicts`)]);
      setProjects(items); setSelected(active.id); setSummary(s); setConflicts(c);
      setForm(current => {
        const kept = s.contracts.find(contract => contract.id === current.contractId);
        return kept ? current : blankForm(s.contracts[0]);
      });
    } catch (reason) { setError(reason instanceof Error ? reason.message : '无法连接制作服务'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const chooseContract = (contractId: string) => setForm(current => ({ ...blankForm(summary?.contracts.find(contract => contract.id === contractId)), reason: current.reason, requestedBy: current.requestedBy, approver: current.approver }));
  const refresh = async (ok: string) => { setMessage(ok); await load(selected); };
  const approveGeneral = async (id: string) => {
    try { await request(`/approvals/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved', comment: '在控制台完成复核' }) }); await refresh('审批已通过，审计事件已写入'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '审批操作失败'); }
  };
  const submitChange = async () => {
    const contract = summary?.contracts.find(item => item.id === form.contractId);
    if (!contract) return;
    const committed = Number(form.committed);
    const forecastDelta = Math.max(committed - contract.committed, Number(form.forecastDelta) || 0);
    const payload = {
      contractId: form.contractId, reason: form.reason, requestedBy: form.requestedBy, approver: form.approver,
      scope: form.scope, ceiling: Number(form.ceiling), committed, forecastDelta,
      milestones: form.milestones.map((milestone, index) => {
        const existing = contract.milestones[index];
        return existing?.name === milestone.name ? { id: existing.id, ...milestone, amount: Number(milestone.amount) } : { ...milestone, amount: Number(milestone.amount) };
      }),
      idempotencyKey: `${form.contractId}-${Date.now()}`
    };
    try { await request('/contract-changes', { method: 'POST', body: JSON.stringify(payload) }); await refresh('合同变更单已提交；批准前合同与预算保持原值'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '提交失败'); }
  };
  const decide = async (change: ContractChange, decision: 'approved' | 'rejected') => {
    try { await request(`/contract-changes/${change.id}/decision`, { method: 'POST', body: JSON.stringify({ decision, actor: '当前审批人', comment: decision === 'approved' ? '控制台批准并原子入账' : '控制台驳回，请修正后重提' }) }); await refresh(decision === 'approved' ? '变更已批准，合同与预算已原子更新' : '变更已驳回，合同与预算未改动'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '审批失败'); }
  };
  const resubmit = async (change: ContractChange) => {
    try { await request(`/contract-changes/${change.id}/resubmit`, { method: 'POST', body: JSON.stringify({}) }); await refresh('已基于最新合同/预算刷新并重提'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '重提失败'); }
  };
  const variancePct = useMemo(() => summary ? Math.round(summary.variance / summary.planned * 100) : 0, [summary]);
  const selectedContract = summary?.contracts.find(contract => contract.id === form.contractId) ?? summary?.contracts[0];

  if (loading && !summary) return <main className="connection-state"><div className="loading">正在载入制作控制台…</div><small>正在通过 Vite API 代理连接本地制作服务</small></main>;
  if (!summary) return <main className="connection-state"><h2>无法连接制作服务</h2><p>{error || '服务端没有返回项目数据。'}</p><p>请从项目根目录运行 <code>npm run dev</code>，确认前端 5173 和 API 4104 均已启动。</p><button onClick={() => void load(selected)}>重新连接</button></main>;

  return <main>
    <header><div><div className="eyebrow">STUDIO OPS / RIGHTS & FINANCE CONTROL</div><h1>FrameLedger <span>影视制作预算与资产版权协同</span></h1><p>预算承诺、供应商补充协议、付款里程碑与版权窗口统一走可审计变更单；批准前财务台账不会被悄悄抬高。</p></div><div className="header-actions"><select value={selected} onChange={e => { setSelected(e.target.value); void load(e.target.value); }}>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select><span className="live"><i /> LIVE CONTROL</span></div></header>
    {message && <div className="toast" onClick={() => setMessage('')}>{message} ×</div>}{error && <div className="toast error-toast" onClick={() => setError('')}>{error} ×</div>}
    <section className="kpis"><div><small>FORECAST COST</small><b>{money(summary.forecast)}</b><span>预算偏差 <em className={summary.variance > 0 ? 'bad' : ''}>{variancePct}%</em></span></div><div><small>COMMITTED</small><b>{money(summary.committed)}</b><span>已锁定供应商与合同</span></div><div><small>CONTRACT CHANGES</small><b>{summary.contractChanges.length}<em> 单</em></b><span>{summary.contractChanges.filter(c => c.status === 'pending').length} 个等待财务批准</span></div><div><small>RISK QUEUE</small><b>{summary.pendingApprovals + conflicts.length}<em> 项</em></b><span>{conflicts.length} 条版权冲突 / {summary.pendingApprovals} 个审批</span></div></section>
    <nav className="tabs"><button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>项目驾驶舱</button><button className={tab === 'budget' ? 'active' : ''} onClick={() => setTab('budget')}>预算与合同变更</button><button className={tab === 'rights' ? 'active' : ''} onClick={() => setTab('rights')}>资产版权图谱</button><span>交付日 {summary.project.deliveryDate}</span></nav>

    {tab === 'overview' && <div className="grid"><section className="panel hero"><div className="panel-head"><div><div className="eyebrow">PROJECT HEALTH / {summary.project.id}</div><h2>{summary.project.title}</h2></div><span className="badge amber">{summary.project.status.toUpperCase()}</span></div><div className="progress-label"><span>成本消耗 {Math.round(summary.utilization * 100)}%</span><b>{money(summary.actual)} / {money(summary.planned)}</b></div><div className="progress"><i style={{ width: `${Math.min(100, summary.utilization * 100)}%` }} /></div><div className="split"><div><small>合同暴露额</small><strong>{money(summary.contractExposure)}</strong></div><div><small>高风险预算项</small><strong className="bad">{summary.highRiskLines.length}</strong></div><div><small>版权冲突</small><strong className={conflicts.length ? 'bad' : ''}>{conflicts.length}</strong></div></div></section><section className="panel"><div className="panel-head"><h3>待审批队列</h3><span>{summary.approvals.filter(a => a.status === 'pending').length} PENDING</span></div>{summary.approvals.map(a => <div className="approval" key={a.id}><span className={`status ${a.status}`} /><div><b>{a.title}</b><small>{a.approver} · {a.id}</small></div>{a.status === 'pending' ? <button onClick={() => approveGeneral(a.id)}>通过</button> : <em>已完成</em>}</div>)}</section><section className="panel wide"><div className="panel-head"><h3>交付风险雷达</h3><span>基于版本、授权窗口与预算预测</span></div>{conflicts.length ? conflicts.map((c, i) => <div className="risk-row" key={i}><strong className={c.severity}>{c.severity === 'critical' ? 'CRITICAL' : 'WARNING'}</strong><div><b>{c.assetA}</b><small>↔ {c.assetB} · {c.reason}</small></div></div>) : <div className="empty">当前项目未发现版权窗口冲突。</div>}</section></div>}

    {tab === 'budget' && <div className="grid"><section className="panel wide"><div className="panel-head"><div><h3>预算版本 / 成本基线</h3><small>committed 与 forecast 仅在变更单批准时同步落账</small></div><span>实际 + 承诺 + 预测</span></div><div className="table budget-table"><div className="tr th"><span>科目</span><span>预算</span><span>已承诺</span><span>实际</span><span>预测</span><span>风险</span></div>{summary.lines.map(line => <div className="tr" key={line.id}><span><b>{line.category}</b><small>{line.subcategory}</small></span><span>{money(line.planned)}</span><span>{money(line.committed)}</span><span>{money(line.actual)}</span><span className={line.forecast > line.planned ? 'bad' : ''}>{money(line.forecast)}</span><span className={`risk ${line.risk}`}>{line.risk}</span></div>)}</div></section>
      <section className="panel change-form"><div className="panel-head"><div><h3>新增合同变更单</h3><small>提交理由、字段差异、预算科目、里程碑调整</small></div></div><label>选择合同<select value={form.contractId} onChange={e => chooseContract(e.target.value)}>{summary.contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.id} · {contract.vendor} v{contract.version}</option>)}</select></label><label>提交理由<textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="例如：补充协议新增 2 轮调色与加急费" /></label><div className="form-row"><label>申请人<input value={form.requestedBy} onChange={e => setForm({ ...form, requestedBy: e.target.value })} /></label><label>审批人<input value={form.approver} onChange={e => setForm({ ...form, approver: e.target.value })} /></label></div><label>合同范围<textarea value={form.scope} onChange={e => setForm({ ...form, scope: e.target.value })} /></label><div className="form-row three"><label>合同上限<input type="number" value={form.ceiling} onChange={e => setForm({ ...form, ceiling: e.target.value })} /></label><label>合同承诺<input type="number" value={form.committed} onChange={e => setForm({ ...form, committed: e.target.value })} /></label><label>forecast Δ（至少等于承诺增量）<input type="number" value={form.forecastDelta} onChange={e => setForm({ ...form, forecastDelta: e.target.value })} /></label></div>{selectedContract && <div className="milestone-editor"><b>里程碑调整</b>{form.milestones.map((milestone, index) => <div className="milestone-row" key={`${selectedContract.milestones[index]?.id ?? index}`}><input value={milestone.name} onChange={e => setForm({ ...form, milestones: form.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item) })} /><input type="date" value={milestone.due} onChange={e => setForm({ ...form, milestones: form.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, due: e.target.value } : item) })} /><input type="number" value={milestone.amount} onChange={e => setForm({ ...form, milestones: form.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, amount: e.target.value } : item) })} /><em>{selectedContract.milestones[index]?.status ?? 'open'}</em></div>)}<div className="milestone-row new"><input placeholder="新增里程碑" value={form.addName} onChange={e => setForm({ ...form, addName: e.target.value })} /><input type="date" value={form.addDue} onChange={e => setForm({ ...form, addDue: e.target.value })} /><input type="number" placeholder="金额" value={form.addAmount} onChange={e => setForm({ ...form, addAmount: e.target.value })} /><button type="button" onClick={() => { if (!form.addName || !form.addDue || !form.addAmount) return; setForm({ ...form, milestones: [...form.milestones, { name: form.addName, due: form.addDue, amount: form.addAmount }], addName: '', addDue: '', addAmount: '' }); }}>加入</button></div></div>}<button className="primary" onClick={submitChange}>提交变更单</button></section>
      <section className="panel"><div className="panel-head"><h3>供应商付款里程碑</h3><span>付款暴露额</span></div>{summary.contracts.map(c => <div className="contract" key={c.id}><b>{c.vendor} <small>v{c.version} · {c.budgetLineId}</small></b><small>{c.scope}</small><div className="contract-bar"><i style={{ width: `${Math.round(c.paid / c.committed * 100)}%` }} /></div><span>{money(c.paid)} / {money(c.committed)} · 上限 {money(c.ceiling)}</span><em>{c.milestones.filter(m => m.status !== 'paid').length} 个待结点</em><div className="mini-list">{c.milestones.map(m => <small key={m.id}>{m.name} · {m.due} · {money(m.amount)} · {m.status}</small>)}</div></div>)}</section>
      <section className="panel wide"><div className="panel-head"><h3>合同变更单 / 审批审计</h3><span>{summary.contractChanges.filter(c => c.status === 'pending').length} PENDING</span></div>{summary.contractChanges.length === 0 && <div className="empty">还没有变更单。提交后可批准、驳回或在刷新后重提。</div>}{summary.contractChanges.map(change => <ChangeCard key={change.id} change={change} onDecide={decide} onResubmit={resubmit} />)}</section></div>}

    {tab === 'rights' && <div className="grid"><section className="panel wide"><div className="panel-head"><h3>资产版本登记</h3><span>{summary.assets.length} assets / checksum tracked</span></div><div className="table"><div className="tr th"><span>资产</span><span>版本</span><span>状态</span><span>授权截止</span></div>{summary.assets.map(a => <div className="tr" key={a.id}><span><b>{a.name}</b><small>{a.id} · {a.type}</small></span><span>v{a.version}</span><span className={`pill ${a.status}`}>{a.status}</span><span>{a.availableTo}</span></div>)}</div></section><section className="panel"><div className="panel-head"><h3>授权冲突</h3><span>{conflicts.length} detected</span></div>{conflicts.map((c, i) => <div className="conflict" key={i}><strong>{c.severity}</strong><b>{c.assetA}</b><small>{c.reason}</small></div>)}</section></div>}
    <footer>FrameLedger · 变更单乐观版本锁 + before/after 快照 + committed/forecast 原子入账</footer></main>;
}

function ChangeCard({ change, onDecide, onResubmit }: { change: ContractChange; onDecide: (change: ContractChange, decision: 'approved' | 'rejected') => void; onResubmit: (change: ContractChange) => void }) {
  const [open, setOpen] = useState(false);
  return <div className={`change-order ${change.status}`}><div><span className={`status ${change.status}`} /><b>{change.id} · {change.contractId} · rev{change.revision}</b><small>{change.reason}</small><small>{change.requestedBy} → {change.approver} · base Cv{change.baseContractVersion}/Bv{change.baseBudgetVersion} · {new Date(change.updatedAt).toLocaleString()}</small></div><div className="change-actions"><button onClick={() => setOpen(!open)}>{open ? '收起差异' : '查看差异'}</button>{change.status === 'pending' && <><button className="primary" onClick={() => onDecide(change, 'approved')}>批准</button><button onClick={() => onDecide(change, 'rejected')}>驳回</button></>}{change.status === 'rejected' && <button onClick={() => onResubmit(change)}>刷新重提</button>}</div>{open && <div className="diff-box"><small>{change.budgetAdjustment.category} / {change.budgetAdjustment.subcategory}：committed {money(change.budgetAdjustment.committedDelta)}，forecast {money(change.budgetAdjustment.forecastDelta)}，批准后 {money(change.budgetAdjustment.afterCommitted)} / {money(change.budgetAdjustment.afterForecast)}</small>{change.fieldDiffs.map(diff => <small key={diff.field}>{diff.label}: {String(diff.before)} → {String(diff.after)}</small>)}{change.milestoneDiffs.filter(diff => diff.action !== 'unchanged').map(diff => <small key={diff.milestoneId}>{diff.action === 'added' ? '新增' : '调整'}里程碑：{diff.after.name} · {diff.after.due} · {money(diff.after.amount)} {diff.changedFields.length ? `(${diff.changedFields.join('、')})` : ''}</small>)}{change.decisionComment && <small>审批意见：{change.decisionComment}</small>}</div>}</div>;
}
