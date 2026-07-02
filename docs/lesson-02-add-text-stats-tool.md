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
