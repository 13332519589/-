# Context State Manager

一个 TypeScript 长对话上下文状态管理核心库。它把原始消息、结构化记忆和可重建工作摘要分层保存，并通过 provenance、确定性状态转换、冲突检测和审计事件降低“错误记忆”造成的幻觉风险。它不声称消除模型幻觉。

## 架构与数据流

`ingestMessage → extractor → schema/evidence validation → deterministic conflict/correction rules → atomic store + audit → relevance retrieval → verified ContextPackage → prompt builder`

- **Raw Conversation**：所有消息是最高真实性来源。
- **Structured Memory**：记忆包含类型、状态、范围、时间稳定性、原始消息 ID 和审计轨迹。助手输出最多成为 `assistant_claim`，不会升级成用户事实。
- **Working Summary**：每次从 raw + structured memory 重建，不读取上一份摘要，因此不会发生摘要递归漂移。
- **Store**：`InMemoryStore` 用于测试；`SQLiteStore` 使用 WAL 和单聚合事务，接口可替换 PostgreSQL。向量索引是可选加速器，不能作为权威事实源。

用户明确更正且原文证据可验证时，旧项变为 `superseded`；无法确认更正时两项均保留为 `contradicted`。长期记忆默认关闭，项目/会话范围通过 `scope` 隔离。动态信息过期后被放入 `uncertainties` 并带有原始日期。

## 运行

```bash
npm install
npm run check
npm run example
```

```ts
import { ContextManager, SQLiteStore } from 'context-state-manager';
const manager = new ContextManager(new SQLiteStore('context.sqlite'));
await manager.ingestMessage({
  id: 'm1', conversationId: 'c1', role: 'user',
  text: '我的目标是考A大学。', timestamp: new Date().toISOString()
});
const prompt = manager.buildPromptContext({conversationId:'c1', text:'我的目标是什么？'});
```

`LLMExtractor` 可接入任意 LLM，但必须返回 Zod 校验的候选项；候选的 `quote` 和 `content` 必须是消息原文。LLM 不能自行执行 supersede、invalidate 或 confirmed_fact 状态变更。

## API

`ingestMessage`, `extractContext`, `classifyMemory`, `storeMemory`, `updateMemory`, `supersedeMemory`, `detectConflict`, `retrieveRelevantContext`, `generateWorkingSummary`, `verifyMemorySource`, `invalidateMemory`, `buildPromptContext` 均已导出或由 `ContextManager` 提供；另有 `inspectMemory`, `exportMemory`, `deleteMemory`, `deleteConversation`, `setLongTermEnabled`。

## 验证与限制

14 个单元/集成测试覆盖长期保留、更新、冲突、助手污染、纠错、摘要重建、时间有效性、作用域、SQLite 持久化、删除和事务回滚。当前离线 `RuleExtractor` 只演示少量中文模式；生产环境应使用受约束的 LLM extractor、人工/外部来源验证器、加密与访问控制、规范化 PostgreSQL 表和真正的 embedding/vector provider。删除向量索引采用可重试 pending outbox；若外部 provider 暂时不可用，应用应监控待删除队列。

## Production integration

`ProductionLLMExtractor` accepts only the current message and caller-supplied candidate memories. It validates a strict Zod result containing `quote`, `sourceMessageId`, and optional `normalizedContent`; the LLM cannot mutate state or authorize transitions. `RuleExtractor` remains the offline fallback.

Memory relations are classified as `SAME`, `EXTENDS`, `SUPERSEDES`, `CONTRADICTS`, `INDEPENDENT`, or `UNCERTAIN`. Only deterministic policy changes state. `explainMemory(id)` returns source messages, verbatim evidence, normalized content, audit rationale, superseded items, and conflicts.

The optional HTTP integration layer is exported by `createContextServer(manager)` and exposes `POST /messages`, `GET /context`, `GET /memories`, `POST /memories/:id/correct`, `DELETE /memories/:id`, `DELETE /conversations/:id`, and `POST /context/build`.

## MCP integration

This release uses the official `@modelcontextprotocol/sdk` version `1.32.2` and the SDK `McpServer` plus `StdioServerTransport`; no MCP wire protocol is implemented locally. Start the local server with:

```bash
npm install
npm run mcp
# or CONTEXT_DB_PATH=/path/context.sqlite npm run mcp
```

The six tools are `remember_context` (write), `search_context` (read), `get_context` (read), `explain_memory` (read), `correct_memory` (write), and `forget_memory` (destructive write). An MCP-compatible client can connect over stdio; the test suite uses the official SDK `Client` and linked in-memory transport as an MCP Inspector-compatible protocol check. A typical stdio configuration is:

```json
{"mcpServers":{"context-state-manager":{"command":"npm","args":["run","mcp"],"cwd":"/absolute/path/context-state-manager"}}}
```

The default SQLite file is `context.sqlite`; long-term memory remains disabled unless explicitly enabled by the host application. MCP handlers never touch storage directly and all writes go through `ContextManager`. This system does not eliminate hallucinations. It primarily reduces risks caused by context loss, memory contamination, source confusion, and summary drift.

## Remote MCP deployment

The remote endpoint uses the official SDK `StreamableHTTPServerTransport` at `POST /mcp`; stdio remains available with `npm run mcp`. Remote production startup requires `NODE_ENV=production` and `CONTEXT_MCP_TOKEN`; missing authentication configuration fails closed. Bearer tokens are compared in constant time and mapped to a server-derived principal. Tool handlers use that principal for tenant/conversation/memory isolation; model-supplied identity fields are ignored.

Environment variables are documented in `.env.example`: `NODE_ENV`, `PORT`, `CONTEXT_DB_PATH`, and `CONTEXT_MCP_TOKEN`. The service also exposes unauthenticated `GET /health` with only status and version. Request bodies are limited to 1 MiB, malformed JSON and invalid tool schemas are rejected, and structured logs include request ID, tool, principal hash, outcome, latency, and timestamp without message text or tokens.

Build and run the non-root image:

```bash
docker build -t context-state-manager .
docker run --rm -p 3000:3000 -v context-data:/data \
  -e NODE_ENV=production -e CONTEXT_MCP_TOKEN="$CONTEXT_MCP_TOKEN" context-state-manager
curl http://localhost:3000/health
```

A remote MCP client connects to `http://host:3000/mcp` with `Authorization: Bearer <token>`. Account/workspace availability for ChatGPT remote MCP connections depends on the applicable OpenAI product plan and workspace permissions; this server does not modify or monitor ChatGPT clients. The current remote implementation is stateless per request and is intended for a deployment with shared persistent storage; horizontal scaling should add a shared store and coordinated session strategy.
