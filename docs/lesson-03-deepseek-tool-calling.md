# 第 3 课：接入 DeepSeek 真实 Tool Calling

## 本节目标

把前两课的 mock Agent 升级为可以接入真实 DeepSeek API 的 Agent。

本节完成后，同一套 `Agent.run()` 可以使用两种模型：

```text
MODEL_PROVIDER=mock      使用 RuleBasedModel，稳定、便于测试
MODEL_PROVIDER=deepseek  使用 DeepSeekModel，调用真实大模型
```

## 官方接口确认

接入真实模型前，先查官方文档，不猜接口。

本节依据 DeepSeek 官方文档确认了这些点：

- DeepSeek API 兼容 OpenAI API 格式，OpenAI base URL 是 `https://api.deepseek.com`。
- 当前模型名包含 `deepseek-v4-flash` 和 `deepseek-v4-pro`，旧的 `deepseek-chat`、`deepseek-reasoner` 官方标注将在 2026-07-24 15:59 UTC 弃用。
- Chat Completions 接口是 `POST /chat/completions`。
- `tools` 里当前只支持 function 类型。
- 模型返回 `tool_calls` 时，工具参数在 `function.arguments` 字段里，是 JSON 字符串。
- 官方明确提醒：模型生成的参数不一定总是合法 JSON，也可能幻觉出 schema 里没有的参数，因此代码里必须校验。

参考文档：

- [DeepSeek Your First API Call](https://api-docs.deepseek.com/)
- [DeepSeek Function Calling](https://api-docs.deepseek.com/guides/function_calling)
- [DeepSeek Chat Completion API](https://api-docs.deepseek.com/api/create-chat-completion/)

## 本节新增文件

### 1. `src/deepSeekModel.ts`

新增 `DeepSeekModel`，它和 `RuleBasedModel` 一样实现 `Model` 接口：

```ts
export class DeepSeekModel implements Model {
  async decide(messages: Message[], tools: Tool[]): Promise<ModelDecision> {
    // 调用 DeepSeek API
  }
}
```

这就是前两课抽象 `Model` 接口的价值：

```text
Agent.run 不关心底层模型来自规则，还是来自真实 LLM。
只要模型返回 ModelDecision，Agent 就能继续执行。
```

### 2. `src/env.ts`

新增轻量 `.env` 读取逻辑，避免为了教学项目额外引入 `dotenv`。

当前支持：

```text
KEY=value
KEY="value"
KEY='value'
```

如果环境变量已经存在，`.env` 不会覆盖它。

### 3. `.env.example`

新增配置示例：

```bash
MODEL_PROVIDER=mock
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

注意：真实 API Key 不要提交到 Git，也不要发到聊天窗口里。

## 为什么要给 Tool 增加 parameters

前两课的 `Tool` 只有：

```ts
export type Tool = {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
};
```

这对 mock 模型够用，因为 `RuleBasedModel` 是我们自己写规则生成参数。

但真实 LLM 不知道工具参数结构。它需要 JSON Schema 来理解：

- 这个工具需要哪些参数
- 每个参数是什么类型
- 哪些参数必填
- 某些参数是否只能取固定枚举值

所以第三课把 `Tool` 扩展为：

```ts
export type Tool = {
  name: string;
  description: string;
  parameters: ToolParameters;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
};
```

以 `calculator` 为例：

```ts
parameters: {
  type: "object",
  properties: {
    a: { type: "number", description: "参与运算的第一个数字" },
    b: { type: "number", description: "参与运算的第二个数字" },
    operation: {
      type: "string",
      description: "要执行的运算类型",
      enum: ["add", "subtract", "multiply", "divide"],
    },
  },
  required: ["a", "b", "operation"],
  additionalProperties: false,
}
```

这段 schema 会被转换成 DeepSeek API 的 `tools` 参数。

## 真实 Tool Calling 的两轮流程

真实 tool calling 不是一次 API 调用就结束，通常至少两轮。

### 第一轮：模型决定调用工具

发送给 DeepSeek：

```text
system prompt
user message
tools schema
```

DeepSeek 可能返回：

```json
{
  "tool_calls": [
    {
      "id": "call_123",
      "type": "function",
      "function": {
        "name": "calculator",
        "arguments": "{\"a\":2,\"b\":3,\"operation\":\"add\"}"
      }
    }
  ]
}
```

`DeepSeekModel.decide()` 会把它转换成项目内部统一的格式：

```ts
{
  type: "tool_call",
  toolName: "calculator",
  args: { a: 2, b: 3, operation: "add" },
  toolCallId: "call_123",
}
```

### 第二轮：程序执行工具，并把结果交回模型

`Agent.run()` 拿到工具调用后：

```text
找到 calculator
执行 calculator({ a: 2, b: 3, operation: "add" })
得到结果 5
```

然后要把两类消息放回上下文：

```ts
{
  role: "assistant",
  content: "",
  toolCalls: [
    {
      id: "call_123",
      toolName: "calculator",
      args: { a: 2, b: 3, operation: "add" },
    },
  ],
}
```

以及：

```ts
{
  role: "tool",
  toolName: "calculator",
  toolCallId: "call_123",
  content: "5",
}
```

其中 `toolCallId` 很关键。DeepSeek API 要求 tool message 必须用 `tool_call_id` 指明它是在回答哪一次工具调用。

## 为什么 Agent 要记录 assistant tool call

前两课里，Agent 执行完工具后只记录了：

```ts
{
  role: "tool",
  toolName: "calculator",
  content: "42",
}
```

这对 mock 模型够用，但对真实 API 不够。

真实 API 需要看到完整链路：

```text
user：帮我计算 2 + 3
assistant：我要调用 calculator，tool_call_id 是 call_123
tool：call_123 的结果是 5
assistant：最终回答
```

所以第三课修改了 `Agent.run()`：

1. 模型返回 `tool_call`
2. Agent 先记录 assistant tool call
3. Agent 执行本地工具
4. Agent 再记录 tool result
5. 下一轮 `decide` 把完整上下文发给模型

## 补充：Claude Code / Codex 也是这样做的吗

问题：

```text
Claude Code、Codex 也是这样来做的吗？
```

简短回答：

```text
是同一类架构，但不是同一复杂度。
```

我们现在写的最小 Agent 核心流程是：

```text
用户目标
-> 模型理解任务
-> 决定下一步
-> 调用工具
-> 工具返回观察结果
-> 模型继续判断
-> 直到完成或需要用户确认
```

Claude Code 和 Codex 这类 coding agent 的公开文档描述，和这个核心模式是一致的。

Claude Code 官方文档把它称为 `agentic loop`：模型会收集上下文、采取行动、验证结果，并根据上一步学到的信息继续调整。文档也明确区分了两个部分：

```text
models reason
tools act
```

也就是：

```text
模型负责推理和决策
工具负责真实动作
```

这和我们项目里的设计是对应的：

```text
RuleBasedModel / DeepSeekModel
≈ Claude / Codex 背后的模型决策层

tools.ts
≈ 文件读写、shell、git、搜索、浏览器、MCP 等工具集合

Agent.run()
≈ agent harness / 执行循环

messages
≈ 上下文窗口 / session history

tool_call_id
≈ 工具调用和工具结果之间的关联
```

但是 Claude Code / Codex 是工业级版本，会比我们的教学项目多很多层：

```text
上下文收集：读文件、搜索代码、理解 repo
工具系统：shell、文件编辑、git、浏览器、MCP、插件
权限系统：哪些动作能自动执行，哪些必须问用户
沙箱：限制能读写哪里、能不能访问网络
状态管理：session、历史、checkpoint、恢复
上下文压缩：长任务时压缩旧上下文
验证机制：跑测试、看报错、修复、再跑
多 agent：拆任务、并行执行、汇总结果
```

所以可以把关系理解成：

```text
我们现在写的 Agent.run()
≈ Claude Code / Codex 的最小内核
```

但不能反过来说 Claude Code / Codex 内部源码就一定和我们这样逐行实现。真实产品的内部实现是私有的，我们只能根据官方文档确认它们公开描述出来的架构模式。

学习上最重要的结论是：

```text
先掌握：模型决策 + 工具调用 + 观察结果 + 循环
再扩展：上下文工程 + 工具生态 + 权限安全 + 沙箱 + 验证闭环
```

这也是后续课程的方向。我们不是直接模仿 Claude Code / Codex 的全部复杂度，而是先把最小骨架跑通，然后一层一层补齐真实 Agent 产品需要的能力。

参考文档：

- [Claude Code: How Claude Code works](https://code.claude.com/docs/en/how-claude-code-works)
- [Codex Best Practices](https://developers.openai.com/codex/learn/best-practices)
- [Codex Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security)
- [Codex Model Context Protocol](https://developers.openai.com/codex/mcp)

## 补充：大模型是怎么决定调用哪个工具的

问题：

```text
大模型是怎么决定调用哪个工具的？
```

简短回答：

```text
大模型不是“真的执行工具”，而是根据上下文和工具说明，生成一个结构化的工具调用请求。
```

它看到的输入大概是：

```text
system prompt
+ 用户输入
+ 历史 messages
+ tools 列表
+ 每个 tool 的 name / description / parameters
= 模型判断下一步
```

然后模型输出两类结果之一：

```text
直接回答
```

或者：

```text
我要调用工具 X，参数是 Y
```

在我们项目里，这个结果会被 `DeepSeekModel.decide()` 转成统一的 `ModelDecision`：

```ts
{
  type: "tool_call",
  toolName: "calculator",
  args: {
    a: 12,
    b: 30,
    operation: "add",
  },
  toolCallId: "call_123",
}
```

### 1. `tool.name` 会影响模型选择

工具名要短、明确、语义稳定。

好的工具名：

```text
calculator
text_stats
current_time
```

不好的工具名：

```text
do_it
helper
process
tool1
```

原因是模型会把 `name` 当成重要语义线索。`calculator` 明确表示“计算器”，而 `helper` 几乎没有业务含义。

### 2. `tool.description` 是模型选择工具的重要依据

例如我们的 `text_stats`：

```ts
description: "统计文本的字符数、非空白字符数和词数"
```

这个描述清楚说明了工具适用场景。

如果写成：

```text
处理文本
```

就太泛了。模型可能不知道它应该用于统计、改写、翻译、摘要，还是格式化。

所以工具描述应该回答：

```text
这个工具能做什么？
什么时候应该用它？
什么时候不应该用它？
```

### 3. `parameters` 告诉模型怎么生成参数

真实大模型不知道你的函数签名。它需要 JSON Schema 来理解参数结构。

例如 `calculator` 的参数 schema：

```ts
parameters: {
  type: "object",
  properties: {
    a: { type: "number", description: "参与运算的第一个数字" },
    b: { type: "number", description: "参与运算的第二个数字" },
    operation: {
      type: "string",
      description: "要执行的运算类型",
      enum: ["add", "subtract", "multiply", "divide"],
    },
  },
  required: ["a", "b", "operation"],
  additionalProperties: false,
}
```

当用户说：

```text
帮我计算 12 + 30
```

模型更容易生成：

```json
{
  "a": 12,
  "b": 30,
  "operation": "add"
}
```

而不是：

```json
{
  "left": 12,
  "right": 30,
  "operator": "+"
}
```

`enum` 也很重要。它告诉模型 `operation` 只能从这些值里选：

```text
add / subtract / multiply / divide
```

这样模型更不容易生成 `plus`、`sum`、`+` 这种程序不认识的值。

### 4. `system prompt` 会影响工具调用策略

我们在 `DeepSeekModel` 里设置了：

```ts
"你是一个教学用 Agent。需要工具时只发起工具调用；拿到工具结果后，用简洁中文回答用户。"
```

这句话约束了模型行为：

- 需要工具时，先发起工具调用
- 拿到工具结果后，再组织最终回答
- 不要在没执行工具时假装知道结果

如果 system prompt 写得很弱，模型可能会直接回答：

```text
12 + 30 应该是 42
```

而不是调用 `calculator`。

这就是为什么 tool calling 不只依赖工具 schema，也依赖 prompt。

### 5. `messages` 让模型知道当前处于哪一轮

第一轮时，模型看到：

```text
user: 帮我计算 12 + 30
```

它应该返回工具调用。

第二轮时，模型看到：

```text
assistant: 我要调用 calculator，tool_call_id 是 call_123
tool: call_123 的结果是 42
```

它就应该生成最终回答，而不是再次调用工具。

所以 `messages` 不只是聊天记录，它也是 Agent 状态。

### 6. 模型会犯错，所以程序不能完全相信它

即使有 `name`、`description`、`parameters` 和 system prompt，模型仍然可能犯错。

常见错误包括：

- 选错工具
- 该调用工具时直接回答
- 不该调用工具时调用工具
- 参数缺字段
- 参数类型错
- 参数不是合法 JSON
- 生成 schema 以外的字段
- 把数字 `"12"` 当成字符串传入

所以 Agent 工程里有一个基本原则：

```text
模型负责提出意图
程序负责校验和执行
工具负责真实动作
Agent 负责循环和错误处理
```

这也是为什么我们的工具里仍然有参数校验：

```ts
if (typeof value !== "number" || Number.isNaN(value)) {
  throw new Error(`参数 ${key} 必须是数字`);
}
```

即使 schema 已经告诉模型 `a` 必须是 number，程序侧也仍然要检查。

### 7. 用一句话总结

大模型决定调用哪个工具，本质上是在做：

```text
根据用户目标和工具说明，生成一个结构化的“工具调用请求”。
```

真正执行工具的不是模型，而是我们的 `Agent.run()`。

这也是第 4 课要继续深入的主题：当模型选错工具、参数错、工具执行失败时，Agent 应该怎么校验、恢复和重试。

## 环境变量切换模型

默认使用 mock：

```bash
npm run dev -- "帮我计算 12 + 30"
```

使用 DeepSeek：

```bash
MODEL_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的 DeepSeek API Key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

然后运行：

```bash
npm run dev -- "帮我计算 12 + 30"
```

也可以直接运行脚本：

```bash
npm run dev:deepseek -- "帮我计算 12 + 30"
```

如果没有配置 `DEEPSEEK_API_KEY`，程序会主动报错，不会静默降级。

## 本节测试

新增测试文件：

```text
tests/deepSeekModel.test.ts
```

它没有真实请求 DeepSeek，而是注入假的 `fetchImpl`。

这样测试可以验证：

- DeepSeek 的 `tool_calls` 是否能转成内部 `ModelDecision`
- 第二轮发送工具结果时是否保留 `tool_call_id`
- 工具 schema 是否被放进请求体

真实 API 依赖网络、额度、Key 和模型稳定性，不适合作为单元测试。

## 本节要掌握的重点

1. Tool calling 不是模型真的执行工具，而是模型生成工具调用请求。
2. 真实 API 需要 JSON Schema 描述工具参数。
3. 工具调用参数必须在程序侧解析和校验。
4. `tool_call_id` 是真实 API 多轮工具调用的关键关联字段。
5. 单元测试不要依赖真实模型，真实模型适合做集成体验。
6. `Model` 接口让 mock 模型和真实模型可以被同一个 Agent 替换使用。

## 课后练习

配置好 DeepSeek API Key 后，分别运行：

```bash
npm run dev:deepseek -- "帮我计算 12 + 30"
npm run dev:deepseek -- "请统计文本：hello world"
npm run dev:deepseek -- "现在几点"
```

观察：

- DeepSeek 是否选择了正确工具
- 工具参数和 mock 模型有什么不同
- 最终回答是否比 mock 更自然
- 如果模型传错参数，程序会在哪里报错

## 下一节预告

下一节会继续做“多工具与参数校验”。

我们会把当前的工具参数校验从每个工具里分散处理，逐步整理成更清晰的工具输入验证层，并讨论真实模型经常会犯的几类工具调用错误。
