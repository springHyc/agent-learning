import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Agent } from "../src/agent.js";
import type { Message, Model, ModelDecision } from "../src/types.js";
import { calculatorTool } from "../src/tools.js";

class InvalidThenFinalModel implements Model {
  async decide(messages: Message[]): Promise<ModelDecision> {
    if (messages.length === 1) {
      return {
        type: "tool_call",
        toolName: "calculator",
        args: {
          a: 1,
          operation: "add",
        },
      };
    }

    return {
      type: "final",
      content: messages.at(-1)?.content ?? "",
    };
  }
}

class InvalidThenRetryModel implements Model {
  async decide(messages: Message[]): Promise<ModelDecision> {
    const lastMessage = messages.at(-1);

    if (messages.length === 1) {
      return {
        type: "tool_call",
        toolName: "calculator",
        args: {
          a: 1,
          operation: "add",
        },
      };
    }

    if (lastMessage?.role === "tool" && lastMessage.content.startsWith("工具参数校验失败")) {
      return {
        type: "tool_call",
        toolName: "calculator",
        args: {
          a: 1,
          b: 2,
          operation: "add",
        },
      };
    }

    return {
      type: "final",
      content: `修正后结果：${lastMessage?.content}`,
    };
  }
}

class AlwaysInvalidModel implements Model {
  async decide(): Promise<ModelDecision> {
    return {
      type: "tool_call",
      toolName: "calculator",
      args: {
        a: 1,
        operation: "add",
      },
    };
  }
}

describe("Agent 参数校验与错误恢复", () => {
  it("参数校验失败时不执行工具，并把错误作为 observation", async () => {
    const agent = new Agent(new InvalidThenFinalModel(), [calculatorTool]);
    const result = await agent.run("请计算 1 + 2");

    assert.equal(result.steps[0]?.action, "tool_call");
    assert.equal(result.steps[0]?.observation, "工具参数校验失败：b 是必填参数");
    assert.equal(result.answer, "工具参数校验失败：b 是必填参数");
  });

  it("模型可以根据参数校验错误修正参数并重试", async () => {
    const agent = new Agent(new InvalidThenRetryModel(), [calculatorTool]);
    const result = await agent.run("请计算 1 + 2");

    assert.equal(result.steps[0]?.observation, "工具参数校验失败：b 是必填参数");
    assert.equal(result.steps[1]?.toolName, "calculator");
    assert.equal(result.steps[1]?.observation, "3");
    assert.equal(result.answer, "修正后结果：3");
  });

  it("连续工具错误达到上限时停止执行", async () => {
    const agent = new Agent(new AlwaysInvalidModel(), [calculatorTool], 5, 2);
    const result = await agent.run("请计算 1 + 2");

    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[0]?.observation, "工具参数校验失败：b 是必填参数");
    assert.equal(result.steps[1]?.observation, "工具参数校验失败：b 是必填参数");
    assert.equal(
      result.answer,
      "工具连续失败 2 次，已停止执行。最后错误：工具参数校验失败：b 是必填参数",
    );
  });
});
