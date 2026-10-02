import express from 'express';
import { approve, assets, budgetLines, contracts, contractChanges, createApproval, dashboard, decideContractChange, getContractChange, projectSummary, projects, resubmitContractChange, rightsConflicts, submitContractChange, DomainError } from './domain.js';

const app = express();
app.use(express.json());
function domainError(res: express.Response, error: unknown) {
  if (error instanceof DomainError) {
    const status = error.code === 'not_found' ? 404 : error.code === 'validation' ? 400 : 409;
    return res.status(status).json({ code: error.code, message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: '服务端处理失败' });
}
app.get('/api/dashboard', (_req, res) => res.json(dashboard()));
app.get('/api/projects', (_req, res) => res.json(projects));
app.get('/api/projects/:id/summary', (req, res) => { const result = projectSummary(req.params.id); if (!result.project) return res.status(404).json({ message: '项目不存在' }); res.json(result); });
app.get('/api/projects/:id/rights-conflicts', (req, res) => res.json(rightsConflicts(req.params.id)));
app.get('/api/projects/:id/assets', (req, res) => res.json(assets.filter(asset => asset.projectId === req.params.id)));
app.get('/api/projects/:id/contracts', (req, res) => res.json(contracts.filter(contract => contract.projectId === req.params.id)));
app.get('/api/projects/:id/contract-changes', (req, res) => res.json(contractChanges.filter(change => change.projectId === req.params.id)));
app.get('/api/budgets/:projectId/lines', (req, res) => res.json(budgetLines.filter(line => line.projectId === req.params.projectId)));
app.post('/api/approvals', (req, res) => res.status(201).json(createApproval(req.body)));
app.patch('/api/approvals/:id', (req, res) => { const result = approve(req.params.id, req.body.status, req.body.comment); if (!result) return res.status(404).json({ message: '审批不存在' }); res.json(result); });
app.post('/api/contract-changes', (req, res) => {
  try {
    const result = submitContractChange(req.body);
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { return domainError(res, error); }
});
app.get('/api/contract-changes/:id', (req, res) => { try { return res.json(getContractChange(req.params.id)); } catch (error) { return domainError(res, error); } });
app.post('/api/contract-changes/:id/decision', (req, res) => {
  try {
    const decision = req.body.decision === 'approved' || req.body.decision === 'rejected' ? req.body.decision : undefined;
    if (!decision) return res.status(400).json({ code: 'validation', message: 'decision 必须是 approved 或 rejected' });
    return res.json(decideContractChange(req.params.id, decision, req.body.actor ?? '当前审批人', req.body.comment ?? ''));
  } catch (error) { return domainError(res, error); }
});
app.post('/api/contract-changes/:id/resubmit', (req, res) => {
  try { return res.json(resubmitContractChange(req.params.id, req.body ?? {}, req.body?.requestedBy)); }
  catch (error) { return domainError(res, error); }
});
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'film-rights-platform' }));
const port = Number(process.env.PORT || 4104); app.listen(port, () => console.log(`film rights API listening on ${port}`));
