# 第 2 课：新增 text_stats 工具

## 本节目标

通过给 Agent 新增一个 `text_stats` 工具，理解“扩展 Agent 能力”需要改哪些位置，以及为什么工具参数校验和测试很重要。

这一节仍然使用 `RuleBasedModel`，不接真实大模型。原因是：新增工具时，我们先要把程序侧的工具契约、执行流程和测试跑稳，再接 LLM 会更清楚哪些问题来自程序，哪些问题来自模型。

## 本节新增能力

新增工具：

```text
text_stats
```

它可以统计一段文本的：

- 字符数
- 非空白字符数
- 词数

示例输入：

```bash
npm run dev -- "请统计文本：hello world"
```

预期会触发 `text_stats` 工具，工具返回：

```json
{"text":"hello world","characters":11,"nonWhitespaceCharacters":10,"words":2}
```

## 新增工具需要改哪些地方

### 1. 实现工具

位置：`src/tools.ts`

新增了 `textStatsTool`：

```ts
export const textStatsTool: Tool = {
  name: "text_stats",
  description: "统计文本的字符数、非空白字符数和词数",
  execute(args) {
    const text = getString(args, "text");
    const characters = Array.from(text).length;
    const nonWhitespaceCharacters = Array.from(text.replace(/\s/g, "")).length;
    const words = countWords(text);

    return JSON.stringify({
      text,
      characters,
      nonWhitespaceCharacters,
      words,
    });
  },
};
```

重点不是统计逻辑本身，而是工具的工程结构：

- `name`：模型用它选择工具
- `description`：告诉模型这个工具能做什么
- `execute`：程序真正执行的函数
- 参数校验：工具不能相信模型传入的参数一定正确

### 2. 注册工具

位置：`src/tools.ts`

把工具加入工具列表：

```ts
export const tools: Tool[] = [calculatorTool, currentTimeTool, textStatsTool];
```

只实现工具但不注册，Agent 就看不到它。

### 3. 让模型能选择工具

位置：`src/ruleBasedModel.ts`

新增了 `parseTextStatsRequest`，用于识别类似这样的输入：

```text
请统计文本：hello world
请统计“hello world”的字符数
```

当识别成功时，模型返回工具调用：

```ts
return {
  type: "tool_call",
  toolName: "text_stats",
  args: textStats,
};
```

这一步模拟真实 LLM 的 tool calling。真实 LLM 以后也会做同样的事情：根据用户输入和工具描述，决定是否调用某个工具，并生成参数。

## `decide` 方法详解

位置：`src/ruleBasedModel.ts`

`decide` 可以理解成 Agent 的“决策函数”。

它不负责执行工具，只负责回答一个问题：

```text
根据当前上下文和可用工具，下一步应该直接回答，还是调用某个工具？
```

方法签名：

```ts
async decide(messages: Message[], tools: Tool[]): Promise<ModelDecision>
```

它接收两个参数：

### 1. `messages`

`messages` 表示当前对话上下文。

一开始，用户输入会被放进去：

```ts
[
  { role: "user", content: "帮我计算 12 + 30" }
]
```

工具执行后，Agent 会把工具结果也放进去：

```ts
[
  { role: "user", content: "帮我计算 12 + 30" },
  { role: "tool", toolName: "calculator", content: "42" }
]
```

`RuleBasedModel` 目前只看最后一条消息：

```ts
const lastMessage = getLastMessage(messages);
```

真实 LLM 通常会看完整 `messages`，包括 system、user、assistant、tool 等多种消息。

### 2. `tools`

`tools` 表示当前 Agent 能用哪些工具。

例如：

```ts
[calculatorTool, currentTimeTool, textStatsTool]
```

`decide` 不应该凭空调用一个不存在的工具，所以每次返回工具调用前都会检查：

```ts
hasTool(tools, "calculator")
```

这也是 Agent 工程里的一个重要边界：模型可以提出工具调用，但程序要验证这个工具是否真实存在、是否允许调用。

### 3. 返回值：`ModelDecision`

`decide` 的返回值只有两种。

第一种是最终回答：

```ts
{
  type: "final",
  content: "..."
}
```

表示：不需要再调用工具了，可以直接回答用户。

第二种是工具调用：

```ts
{
  type: "tool_call",
  toolName: "calculator",
  args: { a: 12, b: 30, operation: "add" }
}
```

表示：下一步要调用某个工具，并传入这些参数。

注意：`decide` 只是“提出调用”，并不真的执行工具。真正执行工具的是 `Agent.run()`。

### 4. 第一段逻辑：看到工具结果后生成最终回答

```ts
if (lastMessage.role === "tool") {
  return {
    type: "final",
    content: `工具 ${lastMessage.toolName} 的执行结果是：${lastMessage.content}`,
  };
}
```

这段逻辑的意思是：

```text
如果最后一条消息是工具返回结果，说明工具已经执行完。
现在可以基于工具观察结果生成最终回答。
```

以 `帮我计算 12 + 30` 为例：

```text
第一轮 decide：我要调用 calculator
Agent.run 执行 calculator
工具返回 42
Agent.run 把 42 作为 tool message 放回 messages
第二轮 decide：看到 tool message，生成最终回答
```

这就是 Agent 里的 observation，也就是“观察”。

### 5. 第二段逻辑：识别数学问题

```ts
const math = parseMathExpression(lastMessage.content);
if (math && hasTool(tools, "calculator")) {
  return {
    type: "tool_call",
    toolName: "calculator",
    args: math,
  };
}
```

如果用户输入：

```text
帮我计算 12 + 30
```

`parseMathExpression` 会解析出：

```ts
{ a: 12, b: 30, operation: "add" }
```

于是 `decide` 返回：

```ts
{
  type: "tool_call",
  toolName: "calculator",
  args: { a: 12, b: 30, operation: "add" }
}
```

此时 `decide` 的工作结束。后面由 `Agent.run()` 找到 `calculator` 工具并执行。

### 6. 第三段逻辑：识别文本统计问题

```ts
const textStats = parseTextStatsRequest(lastMessage.content);
if (textStats && hasTool(tools, "text_stats")) {
  return {
    type: "tool_call",
    toolName: "text_stats",
    args: textStats,
  };
}
```

如果用户输入：

```text
请统计文本：hello world
```

`parseTextStatsRequest` 会解析出：

```ts
{ text: "hello world" }
```

于是 `decide` 返回：

```ts
{
  type: "tool_call",
  toolName: "text_stats",
  args: { text: "hello world" }
}
```

这一步模拟真实 LLM 的 tool calling 行为：根据用户需求选择工具，并生成工具参数。

### 7. 第四段逻辑：识别时间问题

```ts
if (/几点|时间|日期|现在/.test(lastMessage.content) && hasTool(tools, "current_time")) {
  return {
    type: "tool_call",
    toolName: "current_time",
    args: {},
  };
}
```

如果用户输入：

```text
现在几点
```

`decide` 会返回：

```ts
{
  type: "tool_call",
  toolName: "current_time",
  args: {}
}
```

`current_time` 不需要参数，所以 `args` 是空对象。

### 8. 兜底逻辑：直接回答

```ts
return {
  type: "final",
  content:
    "这是一个教学用的最小 Agent。我现在会计算简单表达式、查询当前时间，也会统计文本。",
};
```

如果输入既不是数学问题，也不是文本统计，也不是时间问题，就直接回答。

例如：

```text
你好
```

这时没有必要调用工具，直接返回 `final`。

### 9. 用伪代码理解 `decide`

完整逻辑可以简化成：

```text
拿到最后一条消息

如果最后一条是工具返回结果：
  生成最终回答

否则如果像数学问题，并且有 calculator 工具：
  返回 calculator 工具调用

否则如果像文本统计问题，并且有 text_stats 工具：
  返回 text_stats 工具调用

否则如果像时间问题，并且有 current_time 工具：
  返回 current_time 工具调用

否则：
  直接回答
```

### 10. `decide` 和 `Agent.run()` 的关系

`decide` 是“大脑决策”，`Agent.run()` 是“执行循环”。

关系可以这样理解：

```text
decide：我想调用 calculator，参数是 12 和 30
Agent.run：好，我去找到 calculator 并执行
calculator：结果是 42
Agent.run：把 42 放回 messages
decide：看到工具结果后，生成最终回答
```

后续接 DeepSeek 时，`RuleBasedModel.decide` 会变成 `DeepSeekModel.decide`。

区别是：

```text
现在：用规则判断下一步
以后：用真实 LLM 判断下一步
```

但它们都必须返回同一种 `ModelDecision`。这就是我们先抽象 `Model` 接口的原因。

### 4. 补测试

位置：`tests/agent.test.ts`

新增测试：

```ts
it("调用 text_stats 工具统计文本", async () => {
  const agent = new Agent(new RuleBasedModel(), tools);
  const result = await agent.run("请统计文本：hello world");

  assert.equal(
    result.answer,
    '工具 text_stats 的执行结果是：{"text":"hello world","characters":11,"nonWhitespaceCharacters":10,"words":2}',
  );
  assert.equal(result.steps[0]?.action, "tool_call");
  assert.equal(result.steps[0]?.toolName, "text_stats");
});
```

测试锁住两件事：

- Agent 确实调用了 `text_stats`
- 最终回答包含正确的工具结果

## 为什么工具返回 JSON

这一节让 `text_stats` 返回 JSON 字符串，而不是自然语言。

原因：

1. 结构稳定，方便测试。
2. 后续接真实 LLM 时，模型更容易理解结构化观察结果。
3. 如果以后要在前端展示，可以直接解析成对象。

工具返回值不一定都必须是 JSON，但只要结果有结构，优先用 JSON 会更稳。

## 本节要掌握的重点

1. 新增 Agent 能力通常不是只写一个函数。
2. 工具必须有稳定的名称、描述、参数和返回结果。
3. 工具内部要校验参数，因为模型可能传错。
4. 工具注册后，Agent 才能把它交给模型选择。
5. mock 模型适合做稳定测试，真实模型适合做集成体验。

## 运行命令

进入项目：

```bash
cd /Users/hehe/study/agent-learning
```

运行文本统计：

```bash
npm run dev -- "请统计文本：hello world"
```

运行引号文本统计：

```bash
npm run dev -- "请统计“Agent 工程很好玩”的字符数"
```

运行测试：

```bash
npm test
```

## 课后练习

你可以试着运行下面几条命令，观察 `参数` 和 `观察`：

```bash
npm run dev -- "请统计文本：React + TypeScript"
npm run dev -- "请统计“Agent 工程很好玩”的字符数"
npm run dev -- "请统计文本：hello    world"
```

重点看：

- `text` 参数是怎么提取出来的
- 空格是否会影响 `characters` 和 `nonWhitespaceCharacters`
- 中文字符在 `words` 里是怎么计数的

## 下一节预告

下一节开始接入 DeepSeek 真实大模型。

我们会保留当前的 `RuleBasedModel` 用于测试，同时新增 `DeepSeekModel` 用于真实 tool calling。这样可以做到：

```text
测试时用 mock，稳定可控
体验时用 DeepSeek，接近真实 Agent
```
