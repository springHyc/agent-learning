# 第 1 课：最小 Agent 循环

## 本节目标

理解 Agent 和普通 ChatBot 的区别，并通过一个本地可运行的 TypeScript 项目看清楚 Agent 的基础结构。

本节暂时不接真实大模型 API，而是使用 `RuleBasedModel` 模拟模型决策。这样可以先排除 API Key、网络、计费、模型随机性等干扰，专注学习 Agent 的工程结构。

## Agent 的工程定义

Agent = 模型 + 工具 + 状态 + 执行循环。

普通 ChatBot 的流程通常是：

```text
用户输入 -> 模型回答
```

Agent 的流程多了“行动”和“观察”：

```text
用户输入 -> 模型判断 -> 是否调用工具 -> 执行工具 -> 观察结果 -> 再判断 -> 最终回答
```

关键原则：

```text
模型负责决策
程序负责执行
工具负责真实能力
日志和测试负责验证
```

模型本身不会真正查询数据库、访问接口、修改文件或操作浏览器。模型只能提出“想调用哪个工具”和“工具参数是什么”。真正执行动作的是我们的程序。

## 当前项目结构

核心文件：

- `src/types.ts`：定义模型、工具、消息、执行结果等类型契约
- `src/agent.ts`：Agent 执行循环
- `src/ruleBasedModel.ts`：教学用模拟模型
- `src/tools.ts`：本地工具集合
- `src/index.ts`：命令行入口
- `tests/agent.test.ts`：基础测试

## 代码角色映射

### 1. 大脑：`RuleBasedModel`

位置：`src/ruleBasedModel.ts`

它模拟真实 LLM 的决策行为：

- 看到简单数学表达式，例如 `12 + 30`，返回 `calculator` 工具调用
- 看到“几点 / 时间 / 日期 / 现在”，返回 `current_time` 工具调用
- 收到工具返回结果后，生成最终回答
- 不需要工具时，直接返回最终回答

它实现了统一的 `Model` 接口：

```ts
export interface Model {
  decide(messages: Message[], tools: Tool[]): Promise<ModelDecision>;
}
```

后续接 DeepSeek 时，我们会新增 `DeepSeekModel`，也实现这个接口。这样 `Agent` 不需要关心底层用的是 mock 模型还是真实 LLM。

### 2. 工具：`calculator` 和 `current_time`

位置：`src/tools.ts`

工具是 Agent 可以调用的外部能力。

当前有两个工具：

- `calculator`：执行两个数字之间的四则运算
- `current_time`：获取当前上海时区时间

工具统一实现 `Tool` 类型：

```ts
export type Tool = {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
};
```

这里有一个重要工程习惯：工具内部必须做参数校验。例如 `calculator` 会检查 `a` 和 `b` 是否是数字，也会处理除数为 0 的错误。

### 3. 执行循环：`Agent.run()`

位置：`src/agent.ts`

核心逻辑：

```text
初始化 messages
初始化 steps
循环最多 maxSteps 次
  调用 model.decide(messages, tools)
  如果模型返回 final
    结束并返回答案
  如果模型返回 tool_call
    查找工具
    执行工具
    把工具结果作为 tool message 放回 messages
继续下一轮
```

`messages` 是给模型看的上下文，`steps` 是给人看的执行轨迹。

当前的示例执行链路：

```text
用户：帮我计算 12 + 30
模型：我要调用 calculator，参数是 { a: 12, b: 30, operation: "add" }
程序：执行 calculator
工具：返回 42
程序：把 42 放回上下文
模型：工具 calculator 的执行结果是：42
```

### 4. 观察：`tool` message

位置：`src/agent.ts`

工具执行完成后，Agent 会把工具结果写回 `messages`：

```ts
messages.push({
  role: "tool",
  toolName: decision.toolName,
  content: observation,
});
```

这一步叫 observation，也就是“观察”。

没有 observation，模型只知道自己想调用工具，却不知道工具执行结果。Agent 的多步能力就来自这个循环：

```text
决策 -> 行动 -> 观察 -> 再决策
```

## 运行命令

进入项目：

```bash
cd /Users/hehe/study/agent-learning
```

运行默认示例：

```bash
npm run dev
```

运行计算示例：

```bash
npm run dev -- "帮我计算 8 * 7"
```

运行时间示例：

```bash
npm run dev -- "现在几点"
```

运行无需工具的示例：

```bash
npm run dev -- "你好"
```

## 验证

```bash
npm test
```

当前测试覆盖：

- 数学问题会调用 `calculator`
- 普通问候会直接回答，不调用工具

## 本节要掌握的重点

1. Agent 不是单次模型回答，而是一个执行循环。
2. 模型只负责决策，真实动作由程序执行。
3. 工具需要清晰的名称、描述、参数和返回结果。
4. 工具执行结果要回写到上下文，让模型继续判断。
5. `Model` 接口让 mock 模型和真实 LLM 可以替换。
6. 测试优先使用稳定的 mock 模型，真实模型用于体验和集成验证。

## 课后练习

观察下面三条命令的执行步骤：

```bash
npm run dev -- "帮我计算 8 * 7"
npm run dev -- "现在几点"
npm run dev -- "你好"
```

重点看：

- 哪些输入会触发工具调用
- 工具参数是怎么生成的
- 工具结果是怎么进入最终回答的
- 不调用工具时流程有什么不同

## 下一节预告

新增一个 `text_stats` 工具，让 Agent 可以统计文本的字符数和词数。

这个练习会帮助我们理解：给 Agent 新增一个工具时，需要同时处理工具实现、模型决策、执行轨迹和测试。
