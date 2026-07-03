# Agent Learning

这是一个从零开始学习 Agent 工程的练习项目，主线使用 Node.js + TypeScript。

第一课先不接真实大模型 API，而是用一个本地的 `RuleBasedModel` 模拟“模型决策”。这样可以先看清楚 Agent 的核心结构：

1. 用户输入任务
2. Agent 把任务交给模型判断
3. 模型决定直接回答，或者调用工具
4. Agent 执行工具
5. Agent 把工具结果交回模型
6. 模型生成最终回答

## 运行

```bash
npm install
npm run dev
```

也可以传入自己的问题：

```bash
npm run dev -- "帮我计算 12 + 30"
npm run dev -- "现在几点"
```

默认使用本地 mock 模型。要体验 DeepSeek 真实模型，先配置 `.env`：

```bash
MODEL_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

然后运行：

```bash
npm run dev
```

## 验证

```bash
npm test
```

## 当前课程进度

- [第 1 课：最小 Agent 循环](./docs/lesson-01-minimal-agent-loop.md)
- [第 2 课：新增 text_stats 工具](./docs/lesson-02-add-text-stats-tool.md)
- [第 3 课：接入 DeepSeek 真实 Tool Calling](./docs/lesson-03-deepseek-tool-calling.md)
- 第 4 课：多工具与参数校验
- 第 5 课：RAG 知识库
- 第 6 课：浏览器自动化 Agent
