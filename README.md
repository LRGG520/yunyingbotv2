# yunyingbotv2

Web3 项目运营分析平台（检索层 + 分析层），当前运行时为 PostgreSQL。

## 1. 项目定位

- 目标：对项目做结构化采集、因子分析、报告生成与人工复核。
- 形态：Web 控制台 + API + Worker。
- 重点：可追溯证据链、可复核分析结果、可持续扩展采集器。

## 2. 架构总览

- `apps/web`：任务创建、采集触发、分析查看与复核入口。
- `apps/api`：任务编排与查询 API，启动时自动执行 PG 迁移。
- `apps/worker`：异步任务执行（包含 Twitter browser queue）。
- `packages/application`：核心业务逻辑、仓储层、迁移脚本。
- `packages/shared`：共享类型定义。

## 3. 快速开始（5 分钟跑通）

1. 安装依赖

```bash
pnpm install
```

2. 配置环境变量（最小项）

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/yunyingbot
```

3. 启动 API

```bash
pnpm dev:api
```

4. 启动 Worker（新开终端）

```bash
pnpm dev:worker
```

5. 启动 Web（新开终端）

```bash
pnpm --filter @yunyingbot/web dev
```

访问地址：

- Web: `http://localhost:5173`
- API 健康检查: `http://localhost:3000/health`

## 4. 环境变量与配置

最少必填：

- `DATABASE_URL`

可选采集配置：

- 链上：`ONCHAIN_RPC_URL` 或 `ONCHAIN_RPC_*`
- Telegram：`TELEGRAM_*`
- Discord：`DISCORD_*`
- LLM：DeepSeek/OpenAI 兼容配置

注意：

- 本地 `.env` 不要提交到仓库。
- API 启动时会自动迁移数据库结构。

## 5. 目录结构与职责

- `apps/`：应用层入口（web/api/worker）
- `packages/application/`：业务域实现与数据访问
- `packages/application/src/db/postgres/migrations/`：PostgreSQL 迁移脚本
- `tests/pg-smoke-e2e.ts`：最小 PG 冒烟测试
- `docs/`：架构与迁移文档

## 6. 核心流程

1. 在 Web 创建任务（支持 URL / 文档 / 社区 / 链上输入）
2. 触发采集（public / whitepaper / twitter / onchain / tg / discord）
3. 运行因子分析并生成报告
4. 进行人工复核并生成版本快照
5. 在任务面板查看维度与因子明细

当前行为：

- 创建任务走强制新建（`disableDedupe: true`）
- 未选择任务时，右侧分析区显示空状态提示
- 任务命名规则：`Analysis_Task_*`
- 分级任务栏支持点击展开/收起与一键展开

## 7. 部署方式

本地开发：按“快速开始”步骤分别启动 web/api/worker。

Docker 一键拉起：

```bash
pnpm stack:up
```

停止：

```bash
pnpm stack:down
```

## 8. 测试与质量保障

全量类型检查：

```bash
pnpm check
```

最小 PG 冒烟测试：

```bash
pnpm test
```

## 9. 常见问题与排障

- API 启动报 `DATABASE_URL is required`：检查 `.env` 与启动命令是否注入环境变量。
- 采集不可用：通常是对应平台环境变量未配置（ONCHAIN/TELEGRAM/DISCORD）。
- Twitter browser 失败：检查浏览器可执行文件与 worker 运行环境。
- 页面不更新：确认 API/Worker 是否是最新进程，必要时重启服务。

## 10. 路线图与已知限制

- 持续完善 PG runtime 全链路一致性与迁移工具。
- 持续提升 Twitter/社区采集稳定性与证据质量。
- 补充更多集成测试与 CI smoke/E2E 覆盖。
