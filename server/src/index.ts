import express from 'express';
import { pathToFileURL } from 'node:url';
import { approve, approveChangeOrder, assets, budgetLines, contractChangeOrders, contracts, createApproval, dashboard, getChangeOrder, listChangeOrders, projectSummary, projects, recordPayment, rejectChangeOrder, resubmitChangeOrder, rightsConflicts, serializeChangeOrder, submitChangeOrder } from './domain.js';
import type { Result } from './domain.js';

export const app = express();
app.use(express.json());

const respond = <T>(res: express.Response, result: Result<T>, okStatus: number, map: (value: T) => unknown) => {
  if (!result.ok) return res.status(result.status).json({ message: result.message });
  return res.status(okStatus).json(map(result.value));
};

app.get('/api/dashboard', (_req, res) => res.json(dashboard()));
app.get('/api/projects', (_req, res) => res.json(projects));
app.get('/api/projects/:id/summary', (req, res) => { const result = projectSummary(req.params.id); if (!result.project) return res.status(404).json({ message: '项目不存在' }); res.json(result); });
app.get('/api/projects/:id/rights-conflicts', (req, res) => res.json(rightsConflicts(req.params.id)));
app.get('/api/projects/:id/assets', (req, res) => res.json(assets.filter(asset => asset.projectId === req.params.id)));
app.get('/api/projects/:id/contracts', (req, res) => res.json(contracts.filter(contract => contract.projectId === req.params.id)));
app.get('/api/projects/:id/change-orders', (req, res) => res.json(listChangeOrders(req.params.id)));
app.get('/api/budgets/:projectId/lines', (req, res) => res.json(budgetLines.filter(line => line.projectId === req.params.projectId)));
app.post('/api/approvals', (req, res) => res.status(201).json(createApproval(req.body)));
app.patch('/api/approvals/:id', (req, res) => { const result = approve(req.params.id, req.body.status, req.body.comment); if (!result) return res.status(404).json({ message: '审批不存在' }); res.json(result); });

// 合同变更单（补充协议）：提交时不改合同，批准时才原子写入合同与预算
app.get('/api/contracts/:id/change-orders', (req, res) => res.json(contractChangeOrders(req.params.id)));
app.get('/api/change-orders/:id', (req, res) => { const order = getChangeOrder(req.params.id); if (!order) return res.status(404).json({ message: '变更单不存在' }); res.json(serializeChangeOrder(order)); });
app.post('/api/contracts/:id/change-orders', (req, res) => {
  const result = submitChangeOrder(req.params.id, req.body, req.header('Idempotency-Key') ?? undefined);
  if (!result.ok) return res.status(result.status).json({ message: result.message });
  const { order, replayed } = result.value;
  return res.status(replayed ? 200 : 201).json(serializeChangeOrder(order));
});
app.post('/api/change-orders/:id/approve', (req, res) => respond(res, approveChangeOrder(req.params.id, req.body?.comment, req.body?.actor), 200, serializeChangeOrder));
app.post('/api/change-orders/:id/reject', (req, res) => respond(res, rejectChangeOrder(req.params.id, req.body?.comment, req.body?.actor), 200, serializeChangeOrder));
app.post('/api/change-orders/:id/resubmit', (req, res) => {
  const result = resubmitChangeOrder(req.params.id, req.body ?? {}, req.header('Idempotency-Key') ?? undefined);
  if (!result.ok) return res.status(result.status).json({ message: result.message });
  const { order, replayed } = result.value;
  return res.status(replayed ? 200 : 201).json(serializeChangeOrder(order));
});
app.post('/api/contracts/:id/payments', (req, res) => respond(res, recordPayment(req.params.id, req.body?.milestone, req.body?.actor), 200, contract => contract));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'film-rights-platform' }));

const port = Number(process.env.PORT || 4104);
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) app.listen(port, () => console.log(`film rights API listening on ${port}`));
