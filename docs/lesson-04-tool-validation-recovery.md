# 第 4 课：工具参数校验与错误恢复

## 本节目标

把第三课里提到的“模型可能生成错误参数”落到代码里。

本节新增一个统一校验层：

```text
模型生成工具调用
-> Agent 找到工具
-> 校验 args 是否符合 tool.parameters
-> 校验通过才执行工具
-> 校验失败则把错误作为 observation 回传给模型
```

这样 Agent 不会盲目信任模型生成的参数。

## 为什么还要程序侧校验

第三课已经给每个工具增加了 `parameters` JSON Schema。

这份 schema 主要是给模型看的：

```text
告诉模型应该生成什么参数
```

但 schema 不能保证模型一定生成正确参数。

模型仍然可能生成：

- 缺少必填字段
- 参数类型错误
- enum 之外的值
- 多余字段
- 非法 JSON
- 语义上不合理的参数

所以第 4 课增加程序侧校验：

```text
schema 负责引导模型
validator 负责保护程序
```

这两层都需要。

## 本节新增文件

### `src/toolValidation.ts`

新增统一校验函数：

```ts
export function validateToolArgs(tool: Tool, args: Record<string, unknown>): ValidationResult {
  return validateValue(args, tool.parameters, "");
}
```

当前支持校验：

- `required`
- `additionalProperties: false`
- `type`
- `enum`
- 简单 object
- 简单 array items

它不是完整 JSON Schema 引擎，而是教学项目中够用的一层校验。

后续如果进入生产项目，可以替换为 `ajv`、`zod` 或其他成熟校验库。

## Agent.run 的变化

第三课的流程是：

```text
模型返回 tool_call
Agent 直接执行 tool.execute(args)
```

第 4 课改成：

```text
模型返回 tool_call
Agent 校验 args
校验通过：执行工具
校验失败：不执行工具，把错误作为 observation
```

核心代码：

```ts
const validation = validateToolArgs(tool, decision.args);
if (!validation.ok) {
  currentStep.observation = `工具参数校验失败：${validation.message}`;

  messages.push({
    role: "tool",
    toolName: decision.toolName,
    toolCallId,
    content: currentStep.observation,
  });
  steps.push(currentStep);
  continue;
}
```

这里的关键点是：

```text
校验失败也要写入 tool message
```

因为真实模型需要看到失败原因，才有机会修正参数并重试。

## 错误恢复流程

以模型第一次漏传 `b` 为例。

第一轮：

```ts
{
  type: "tool_call",
  toolName: "calculator",
  args: {
    a: 1,
    operation: "add",
  },
}
```

Agent 校验失败：

```text
工具参数校验失败：b 是必填参数
```

然后把这个错误作为 observation 回传：

```ts
{
  role: "tool",
  toolName: "calculator",
  toolCallId: "call_123",
  content: "工具参数校验失败：b 是必填参数",
}
```

第二轮模型看到错误后，可以修正：

```ts
{
  type: "tool_call",
  toolName: "calculator",
  args: {
    a: 1,
    b: 2,
    operation: "add",
  },
}
```

这就是最小错误恢复。

## 连续工具错误上限

只把错误回传给模型还不够。

如果模型一直生成错误参数，Agent 不能无限循环，也不能等到 `maxSteps` 抛出一个不够友好的异常。

所以本节给 `Agent` 增加了：

```ts
private readonly maxConsecutiveToolErrors = 2
```

含义是：

```text
连续工具错误达到 2 次后，Agent 主动停止执行，并返回最后一次错误。
```

这里统计的工具错误包括：

- 参数校验失败
- 工具执行抛错

工具执行成功后，连续错误计数会重置：

```ts
const observation = await tool.execute(decision.args);
consecutiveToolErrors = 0;
```

这样设计的目的：

```text
允许模型根据错误修正一次
但不允许模型一直用错误参数重试
```

这是比单纯 `maxSteps` 更贴近业务的保护机制。

## 本节新增测试

### 1. `tests/toolValidation.test.ts`

直接测试校验器：

- 正确参数通过
- 缺少必填字段失败
- 类型错误失败
- enum 之外的值失败

### 2. `tests/agentRecovery.test.ts`

测试 Agent 层恢复行为：

- 参数校验失败时，不执行工具
- 校验错误会作为 observation 写回 messages
- 模型可以根据错误修正参数并重试
- 连续工具错误达到上限时，Agent 会停止执行

这类测试比真实请求大模型更稳定，因为它不依赖网络、额度或模型随机性。

## 当前错误处理边界

目前已经处理：

- 参数结构校验失败
- 工具执行抛错
- 模型根据错误重试
- 连续工具错误上限

还没有处理：

- 区分可恢复错误和不可恢复错误
- 多工具候选冲突
- 用户确认高风险工具
- 用成熟 schema 校验库替换手写 validator

这些会在后续课程逐步补上。

## 本节要掌握的重点

1. `parameters` 是给模型看的，不是安全边界。
2. 程序必须校验模型生成的工具参数。
3. 校验失败时不要执行工具。
4. 校验失败也要作为 observation 回传给模型。
5. 真实 Agent 的可靠性来自“模型尝试 + 程序约束 + 错误反馈 + 可控重试”。

## 运行验证

```bash
npm test
```

本节测试不需要真实 DeepSeek API Key。

## 下一节预告

下一节可以继续扩展错误恢复能力：

```text
工具错误分类
重试次数限制
用户可读错误
高风险工具的人类确认
```

这些能力是从 demo Agent 走向真实业务 Agent 的关键。
