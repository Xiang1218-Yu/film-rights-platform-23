# FrameLedger · 影视制作预算与资产版权协同平台

React + Vite + TypeScript 前端，Node.js + Express + TypeScript 服务端。面向中型影视制作团队，演示预算版本、成本预测、合同里程碑、资产版本、授权窗口冲突与审批审计的协同闭环。

## 启动

```bash
npm install
npm run dev
```

前端默认 Vite 端口 5175，API 默认 `http://localhost:4104`。

## 业务能力

- 项目 / 季 / 交付日期与预算基线；计划、承诺、实际、预测成本四账合一
- 供应商合同额度、付款里程碑与付款暴露额；部分付款登记防重复
- 合同变更单（补充协议）：提交理由、字段差异、预算科目与里程碑调整
  - 提交时不改合同，批准时才原子更新合同与预算 committed/forecast
  - 审批 / 驳回 / 重提；前后快照与审计事件全程留痕
  - 拒绝低于已付款、无效里程碑重排、超预算（承诺超科目计划）的变更
  - 乐观并发：审批期间合同或预算被更新则在途申请过期，不得覆盖新状态
  - 幂等键去重 + 一合同一单在途，重复/并发提交安全
- 母版、预告、海报、音频、字幕等资产版本和 checksum 登记
- 地域、平台、有效期、版权标签冲突检测
- 预算 / 资产 / 交付审批队列和审计事件
- React 控制台支持项目切换、预算表、风险雷达、审批操作、合同变更台和版权资产视图

当前使用内存数据，领域服务按模块设计，后续可替换 PostgreSQL、对象存储、工作流和版权方台账服务。

## 合同变更单 API

- `POST /api/contracts/:id/change-orders` 提交变更单（`Idempotency-Key` 头去重，重放返回原单）
- `POST /api/change-orders/:id/approve` 批准：校验通过后原子更新合同与预算，保存前后快照
- `POST /api/change-orders/:id/reject` 驳回；`POST /api/change-orders/:id/resubmit` 修订重提
- `POST /api/contracts/:id/payments` 登记里程碑付款（递增合同版本，使在途变更单过期）
- `GET /api/projects/:id/change-orders` / `GET /api/contracts/:id/change-orders` 查询含字段差异

## 测试

```bash
npm test   # 变更单提交/审批/驳回/重提、过期保护、部分付款、并发与刷新一致性
```
