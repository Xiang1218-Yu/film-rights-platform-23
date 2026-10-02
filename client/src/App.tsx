import { useCallback, useEffect, useMemo, useState } from 'react';
type Project = { id: string; title: string; status: string; deliveryDate: string };
type Milestone = { name: string; due: string; amount: number; status: string };
type Contract = { id: string; vendor: string; scope: string; ceiling: number; committed: number; paid: number; version: number; milestones: Milestone[] };
type BudgetLine = { id: string; category: string; subcategory: string; planned: number; committed: number; forecast: number; actual: number; risk: string };
type ChangeOrderDiffs = { fields: { field: string; label: string; from: number | string; to: number | string }[]; milestonesAdded: { name: string; due: string; amount: number }[]; milestonesRemoved: Milestone[]; milestonesModified: { name: string; from: { due: string; amount: number }; to: { due: string; amount: number } }[]; budget: { lineId: string; category?: string; subcategory?: string; committedDelta: number; forecastDelta: number } };
type ChangeOrder = { id: string; contractId: string; budgetLineId: string; title: string; reason: string; requestedBy: string; approver: string; status: 'pending' | 'approved' | 'rejected' | 'stale'; createdAt: string; decidedAt?: string; comment?: string; resubmitOf?: string; changes: { ceiling?: number; committed?: number; scope?: string; milestones?: { name: string; due: string; amount: number }[]; budgetCommittedDelta: number; budgetForecastDelta: number }; beforeSnapshot?: { contract: { committed: number; ceiling: number }; budgetLine: { committed: number; forecast: number } }; afterSnapshot?: { contract: { committed: number; ceiling: number }; budgetLine: { committed: number; forecast: number } }; diffs: ChangeOrderDiffs };
type Summary = { planned: number; forecast: number; actual: number; variance: number; utilization: number; committed: number; contractExposure: number; assetCount: number; pendingApprovals: number; pendingChangeOrders: number; highRiskLines: { subcategory: string; forecast: number; planned: number }[]; lines: BudgetLine[]; contracts: Contract[]; assets: { id: string; name: string; type: string; version: number; status: string; availableTo: string }[]; approvals: { id: string; title: string; status: string; approver: string }[]; changeOrders: ChangeOrder[]; project: Project };
type Conflict = { severity: string; assetA: string; assetB: string; reason: string };
const money = (n: number) => `¥${(n / 10000).toFixed(0)}万`;
const signed = (n: number) => `${n < 0 ? '−' : '+'}${money(Math.abs(n))}`;
const api = '/api';
async function request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(`${api}${path}`, init); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.message || `请求失败 (${response.status})`); return body as T; }
const STATUS_LABEL: Record<string, string> = { pending: '待审批', approved: '已批准', rejected: '已驳回', stale: '已过期' };

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]); const [selected, setSelected] = useState('PRJ-001'); const [summary, setSummary] = useState<Summary>(); const [conflicts, setConflicts] = useState<Conflict[]>([]); const [tab, setTab] = useState<'overview'|'budget'|'rights'|'changes'>('overview'); const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = useCallback(async (id = 'PRJ-001') => { setLoading(true); setError(''); try { const items = await request<Project[]>('/projects'); const active = items.find(item => item.id === id) ?? items[0]; if (!active) throw new Error('服务端没有返回项目数据'); const [s, c] = await Promise.all([request<Summary>(`/projects/${active.id}/summary`), request<Conflict[]>(`/projects/${active.id}/rights-conflicts`)]); setProjects(items); setSelected(active.id); setSummary(s); setConflicts(c); } catch (reason) { setError(reason instanceof Error ? reason.message : '无法连接制作服务'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const notify = (text: string, isError = false) => { if (isError) setError(text); else setMessage(text); };
  const approve = async (id: string) => { try { await request(`/approvals/${id}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: 'approved', comment: '在控制台完成复核' }) }); setMessage('审批已通过，审计事件已写入'); await load(selected); } catch (reason) { setError(reason instanceof Error ? reason.message : '审批操作失败'); } };
  const decideChange = async (id: string, action: 'approve' | 'reject') => { try { await request(`/change-orders/${id}/${action}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ comment: action === 'approve' ? '财务复核通过，按变更单执行' : '财务复核未通过，请修订后重提' }) }); setMessage(action === 'approve' ? '变更单已批准：合同与预算已原子更新，快照与审计已保存' : '变更单已驳回，可修订后重提'); await load(selected); } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); await load(selected); } };
  const pay = async (contractId: string, milestone: string) => { try { await request(`/contracts/${contractId}/payments`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ milestone }) }); setMessage(`里程碑「${milestone}」付款已登记，在途变更单将按新版本复核`); await load(selected); } catch (reason) { setError(reason instanceof Error ? reason.message : '付款登记失败'); await load(selected); } };
  const variancePct = useMemo(() => summary ? Math.round(summary.variance / summary.planned * 100) : 0, [summary]);
  if (loading && !summary) return <main className="connection-state"><div className="loading">正在载入制作控制台…</div><small>正在通过 Vite API 代理连接本地制作服务</small></main>;
  if (!summary) return <main className="connection-state"><h2>无法连接制作服务</h2><p>{error || '服务端没有返回项目数据。'}</p><p>请从项目根目录运行 <code>npm run dev</code>，确认前端 5173 和 API 4104 均已启动。</p><button onClick={() => void load(selected)}>重新连接</button></main>;
  return <main><header><div><div className="eyebrow">STUDIO OPS / RIGHTS & FINANCE CONTROL</div><h1>FrameLedger <span>影视制作预算与资产版权协同</span></h1><p>将预算承诺、供应商付款、资产版本与跨地域版权窗口串成可审计的交付链路。</p></div><div className="header-actions"><select value={selected} onChange={e=>{setSelected(e.target.value); void load(e.target.value)}}>{projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select><span className="live"><i/> LIVE CONTROL</span></div></header>{message && <div className="toast" onClick={()=>setMessage('')}>{message} ×</div>}{error && <div className="toast error-toast" onClick={()=>setError('')}>{error} ×</div>}
    <section className="kpis"><div><small>FORECAST COST</small><b>{money(summary.forecast)}</b><span>预算偏差 <em className={summary.variance > 0 ? 'bad':''}>{variancePct}%</em></span></div><div><small>COMMITTED</small><b>{money(summary.committed)}</b><span>已锁定供应商与合同</span></div><div><small>ASSET REGISTER</small><b>{summary.assetCount}<em> 个</em></b><span>版本与交付状态纳管</span></div><div><small>RISK QUEUE</small><b>{summary.pendingApprovals + summary.pendingChangeOrders + conflicts.length}<em> 项</em></b><span>{conflicts.length} 条版权冲突 / {summary.pendingApprovals + summary.pendingChangeOrders} 个审批</span></div></section>
    <nav className="tabs"><button className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>项目驾驶舱</button><button className={tab==='budget'?'active':''} onClick={()=>setTab('budget')}>预算与合同</button><button className={tab==='changes'?'active':''} onClick={()=>setTab('changes')}>合同变更{summary.pendingChangeOrders ? ` · ${summary.pendingChangeOrders}` : ''}</button><button className={tab==='rights'?'active':''} onClick={()=>setTab('rights')}>资产版权图谱</button><span>交付日 {summary.project.deliveryDate}</span></nav>
    {tab==='overview' && <div className="grid"><section className="panel hero"><div className="panel-head"><div><div className="eyebrow">PROJECT HEALTH / {summary.project.id}</div><h2>{summary.project.title}</h2></div><span className="badge amber">{summary.project.status.toUpperCase()}</span></div><div className="progress-label"><span>成本消耗 {Math.round(summary.utilization*100)}%</span><b>{money(summary.actual)} / {money(summary.planned)}</b></div><div className="progress"><i style={{width:`${Math.min(100, summary.utilization*100)}%`}}/></div><div className="split"><div><small>合同暴露额</small><strong>{money(summary.contractExposure)}</strong></div><div><small>高风险预算项</small><strong className="bad">{summary.highRiskLines.length}</strong></div><div><small>版权冲突</small><strong className={conflicts.length ? 'bad':''}>{conflicts.length}</strong></div></div></section><section className="panel"><div className="panel-head"><h3>待审批队列</h3><span>{summary.approvals.filter(a=>a.status==='pending').length} PENDING</span></div>{summary.approvals.map(a=><div className="approval" key={a.id}><span className={`status ${a.status}`}/><div><b>{a.title}</b><small>{a.approver} · {a.id}</small></div>{a.status==='pending'?<button onClick={()=>approve(a.id)}>通过</button>:<em>已完成</em>}</div>)}</section><section className="panel wide"><div className="panel-head"><h3>交付风险雷达</h3><span>基于版本、授权窗口与预算预测</span></div>{conflicts.length ? conflicts.map((c,i)=><div className="risk-row" key={i}><strong className={c.severity}>{c.severity==='critical'?'CRITICAL':'WARNING'}</strong><div><b>{c.assetA}</b><small>↔ {c.assetB} · {c.reason}</small></div></div>):<div className="empty">当前项目未发现版权窗口冲突。</div>}</section></div>}
    {tab==='budget' && <div className="grid"><section className="panel wide"><div className="panel-head"><h3>预算版本 V3 / 成本基线</h3><span>实际 + 承诺 + 预测</span></div><div className="table"><div className="tr th"><span>科目</span><span>预算</span><span>已承诺</span><span>实际</span><span>预测</span><span>风险</span></div>{summary.lines.map(line=><div className="tr" key={line.id}><span><b>{line.category}</b><small>{line.subcategory}</small></span><span>{money(line.planned)}</span><span>{money(line.committed)}</span><span>{money(line.actual)}</span><span className={line.forecast>line.planned?'bad':''}>{money(line.forecast)}</span><span className={`risk ${line.risk}`}>{line.risk}</span></div>)}</div></section><section className="panel"><div className="panel-head"><h3>供应商付款里程碑</h3><span>付款将使在途变更单过期</span></div>{summary.contracts.map(c=><div className="contract" key={c.id}><b>{c.vendor}</b><small>{c.scope}</small><div className="contract-bar"><i style={{width:`${Math.min(100, Math.round(c.paid/c.committed*100))}%`}}/></div><span>{money(c.paid)} / {money(c.committed)}</span><em>{c.milestones.filter(m=>m.status!=='paid').length} 个待结点</em><div className="ms-list">{c.milestones.map(m=><div className="ms-row" key={m.name}><span>{m.name}<small>{m.due} · {money(m.amount)} · {m.status}</small></span>{m.status==='paid'?<em className="paid-tag">已付款</em>:<button onClick={()=>void pay(c.id, m.name)}>登记付款</button>}</div>)}</div></div>)}</section></div>}
    {tab==='changes' && <ChangesPanel summary={summary} onDecide={(id, action)=>void decideChange(id, action)} onChanged={()=>void load(selected)} notify={notify}/>}
    {tab==='rights' && <div className="grid"><section className="panel wide"><div className="panel-head"><h3>资产版本登记</h3><span>{summary.assets.length} assets / checksum tracked</span></div><div className="table"><div className="tr th"><span>资产</span><span>版本</span><span>状态</span><span>授权截止</span></div>{summary.assets.map(a=><div className="tr" key={a.id}><span><b>{a.name}</b><small>{a.id} · {a.type}</small></span><span>v{a.version}</span><span className={`pill ${a.status}`}>{a.status}</span><span>{a.availableTo}</span></div>)}</div></section><section className="panel"><div className="panel-head"><h3>授权冲突</h3><span>{conflicts.length} detected</span></div>{conflicts.map((c,i)=><div className="conflict" key={i}><strong>{c.severity}</strong><b>{c.assetA}</b><small>{c.reason}</small></div>)}</section></div>}
    <footer>FrameLedger baseline · 内存仓储 + REST API · 合同变更单批准后原子落账，前后快照与审计可追溯</footer></main>;
}

function ChangesPanel({ summary, onDecide, onChanged, notify }: { summary: Summary; onDecide: (id: string, action: 'approve' | 'reject') => void; onChanged: () => void; notify: (text: string, isError?: boolean) => void }) {
  const [draft, setDraft] = useState<ChangeOrder | null>(null);
  return <div className="grid">
    <section className="panel wide"><div className="panel-head"><h3>合同变更单 / 补充协议</h3><span>{summary.pendingChangeOrders} 待审批 · 批准时才写入合同与预算</span></div>
      {summary.changeOrders.length === 0 && <div className="empty">暂无变更单。用下方表单提交第一单补充协议。</div>}
      {summary.changeOrders.map(order => <ChangeOrderCard key={order.id} order={order} summary={summary} onDecide={onDecide} onResubmit={()=>setDraft(order)}/>)}
    </section>
    <section className="panel wide"><ChangeOrderForm key={draft ? `re-${draft.id}` : 'new'} summary={summary} draft={draft} onSubmitted={()=>{ setDraft(null); onChanged(); }} notify={notify}/></section>
  </div>;
}

function ChangeOrderCard({ order, summary, onDecide, onResubmit }: { order: ChangeOrder; summary: Summary; onDecide: (id: string, action: 'approve' | 'reject') => void; onResubmit: () => void }) {
  const contract = summary.contracts.find(c => c.id === order.contractId);
  const d = order.diffs;
  return <div className={`co-card ${order.status}`}>
    <div className="co-head"><div><b>{order.title}</b><small>{order.id} · {contract?.vendor ?? order.contractId} · {order.requestedBy} → {order.approver} · {order.createdAt.slice(0, 10)}{order.resubmitOf ? ` · 重提自 ${order.resubmitOf}` : ''}</small></div><span className={`pill ${order.status}`}>{STATUS_LABEL[order.status]}</span></div>
    <p className="co-reason">{order.reason}</p>
    <div className="diffs">
      {d.fields.map(f => <div className="diff-line" key={f.field}><span>{f.label}</span><b>{typeof f.from === 'number' ? money(f.from) : f.from} → {typeof f.to === 'number' ? money(f.to) : f.to}</b></div>)}
      {(d.budget.committedDelta !== 0 || d.budget.forecastDelta !== 0) && <div className="diff-line"><span>预算科目 {d.budget.category} / {d.budget.subcategory}</span><b>承诺 {signed(d.budget.committedDelta)} · 预测 {signed(d.budget.forecastDelta)}</b></div>}
      {d.milestonesAdded.map(m => <div className="diff-line add" key={`a-${m.name}`}><span>＋ 新增里程碑「{m.name}」</span><b>{m.due} · {money(m.amount)}</b></div>)}
      {d.milestonesModified.map(m => <div className="diff-line mod" key={`m-${m.name}`}><span>~ 调整里程碑「{m.name}」</span><b>{m.from.due} {money(m.from.amount)} → {m.to.due} {money(m.to.amount)}</b></div>)}
      {d.milestonesRemoved.map(m => <div className="diff-line del" key={`r-${m.name}`}><span>－ 移除里程碑「{m.name}」</span><b>{m.due} · {money(m.amount)}</b></div>)}
    </div>
    {order.status === 'approved' && order.beforeSnapshot && order.afterSnapshot && <div className="snapshot">审计快照 · 合同承诺 {money(order.beforeSnapshot.contract.committed)} → {money(order.afterSnapshot.contract.committed)} · 科目承诺 {money(order.beforeSnapshot.budgetLine.committed)} → {money(order.afterSnapshot.budgetLine.committed)} · 科目预测 {money(order.beforeSnapshot.budgetLine.forecast)} → {money(order.afterSnapshot.budgetLine.forecast)}</div>}
    {order.comment && <div className="co-comment">审批意见：{order.comment}</div>}
    {(order.status === 'pending' || order.status === 'rejected' || order.status === 'stale') && <div className="co-actions">
      {order.status === 'pending' && <><button onClick={()=>onDecide(order.id, 'approve')}>批准并应用</button><button className="ghost" onClick={()=>onDecide(order.id, 'reject')}>驳回</button></>}
      {(order.status === 'rejected' || order.status === 'stale') && <button onClick={onResubmit}>修订并重提</button>}
    </div>}
  </div>;
}

function ChangeOrderForm({ summary, draft, onSubmitted, notify }: { summary: Summary; draft: ChangeOrder | null; onSubmitted: () => void; notify: (text: string, isError?: boolean) => void }) {
  const [contractId, setContractId] = useState(draft?.contractId ?? summary.contracts[0]?.id ?? '');
  const contract = summary.contracts.find(c => c.id === contractId);
  const statusOf = (name: string) => contract?.milestones.find(m => m.name === name)?.status ?? 'open';
  const [title, setTitle] = useState(draft?.title ?? '');
  const [reason, setReason] = useState(draft?.reason ?? '');
  const [budgetLineId, setBudgetLineId] = useState(draft?.budgetLineId ?? summary.lines[0]?.id ?? '');
  const [ceiling, setCeiling] = useState(draft?.changes.ceiling ?? contract?.ceiling ?? 0);
  const [committed, setCommitted] = useState(draft?.changes.committed ?? contract?.committed ?? 0);
  const [scope, setScope] = useState(draft?.changes.scope ?? contract?.scope ?? '');
  const [forecastDelta, setForecastDelta] = useState(draft?.changes.budgetForecastDelta ?? 0);
  const [rows, setRows] = useState<Milestone[]>(() => (draft?.changes.milestones ?? contract?.milestones ?? []).map(m => ({ ...m, status: statusOf(m.name) })));
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const selectContract = (id: string) => { const next = summary.contracts.find(c => c.id === id); setContractId(id); setCeiling(next?.ceiling ?? 0); setCommitted(next?.committed ?? 0); setScope(next?.scope ?? ''); setForecastDelta(0); setRows((next?.milestones ?? []).map(m => ({ ...m }))); };
  const committedDelta = committed - (contract?.committed ?? 0);
  const updateRow = (i: number, patch: Partial<Milestone>) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, { name: '', due: summary.project.deliveryDate, amount: 100000, status: 'open' }]);
  const removeRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));
  const submit = async () => {
    setBusy(true);
    try {
      const payload = { title, reason, requestedBy: '制片主任', approver: '财务负责人', budgetLineId, changes: { ceiling: Number(ceiling), committed: Number(committed), scope, milestones: rows.map(r => ({ name: r.name, due: r.due, amount: Number(r.amount) })), budgetCommittedDelta: committedDelta, budgetForecastDelta: Number(forecastDelta) } };
      const path = draft ? `/change-orders/${draft.id}/resubmit` : `/contracts/${contractId}/change-orders`;
      await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey }, body: JSON.stringify(payload) });
      notify(draft ? '变更单已重提，等待财务审批' : '变更单已提交：审批通过前合同与预算不会变化');
      setIdemKey(crypto.randomUUID());
      onSubmitted();
    } catch (reason) { notify(reason instanceof Error ? reason.message : '提交失败', true); }
    finally { setBusy(false); }
  };
  return <>
    <div className="panel-head"><h3>{draft ? `重提变更单（源单 ${draft.id}）` : '提交合同变更单'}</h3><span>理由 · 字段差异 · 预算科目 · 里程碑</span></div>
    <div className="co-form">
      <label>合同<select value={contractId} disabled={!!draft} onChange={e=>selectContract(e.target.value)}>{summary.contracts.map(c=><option key={c.id} value={c.id}>{c.vendor}（{c.id}）</option>)}</select></label>
      <label>预算科目<select value={budgetLineId} onChange={e=>setBudgetLineId(e.target.value)}>{summary.lines.map(l=><option key={l.id} value={l.id}>{l.category} / {l.subcategory}（计划 {money(l.planned)}）</option>)}</select></label>
      <label className="full">变更标题<input value={title} placeholder="例：补充协议：增加两轮调色与加急交付" onChange={e=>setTitle(e.target.value)}/></label>
      <label className="full">变更理由<textarea value={reason} placeholder="说明业务背景与费用依据，财务审批时可见" onChange={e=>setReason(e.target.value)}/></label>
      <label>新承诺额（元）<input type="number" step={10000} value={committed} onChange={e=>setCommitted(Number(e.target.value))}/></label>
      <label>新额度上限（元）<input type="number" step={10000} value={ceiling} onChange={e=>setCeiling(Number(e.target.value))}/></label>
      <label>预测调整（元）<input type="number" step={10000} value={forecastDelta} onChange={e=>setForecastDelta(Number(e.target.value))}/></label>
      <label>服务范围<input value={scope} onChange={e=>setScope(e.target.value)}/></label>
      <div className="full hint">承诺调整 {signed(committedDelta)} 将同步到预算科目 · 合同已付款 {money(contract?.paid ?? 0)}，承诺额不得低于该值 · 已付款/已开票里程碑已锁定</div>
      <div className="full ms-editor">
        <small>里程碑付款计划（需按到期日升序）</small>
        {rows.map((row, i) => { const locked = row.status !== 'open'; return <div className={`ms-edit-row${locked ? ' locked' : ''}`} key={i}>
          <input value={row.name} placeholder="里程碑名称" disabled={locked} onChange={e=>updateRow(i, { name: e.target.value })}/>
          <input type="date" value={row.due} disabled={locked} onChange={e=>updateRow(i, { due: e.target.value })}/>
          <input type="number" step={10000} value={row.amount} disabled={locked} onChange={e=>updateRow(i, { amount: Number(e.target.value) })}/>
          {locked ? <span className="tag">{row.status === 'paid' ? '已付款' : '已开票'}</span> : <button type="button" className="ghost" onClick={()=>removeRow(i)}>删除</button>}
        </div>; })}
        <button type="button" className="ghost add-ms" onClick={addRow}>＋ 添加里程碑</button>
      </div>
      <div className="full co-submit"><button disabled={busy} onClick={()=>void submit()}>{busy ? '提交中…' : draft ? '重提变更单' : '提交变更单（不改动合同）'}</button><span className="hint">重复点击/网络重试由幂等键去重；同一合同同时只允许一单待审批</span></div>
    </div>
  </>;
}
