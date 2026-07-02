import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Agent } from "../src/agent.js";
import { RuleBasedModel } from "../src/ruleBasedModel.js";
import { tools } from "../src/tools.js";

describe("Agent", () => {
  it("调用 calculator 工具处理加法", async () => {
    const agent = new Agent(new RuleBasedModel(), tools);
    const result = await agent.run("帮我计算 12 + 30");

    assert.equal(result.answer, "工具 calculator 的执行结果是：42");
    assert.equal(result.steps[0]?.action, "tool_call");
    assert.equal(result.steps[0]?.toolName, "calculator");
  });

  it("不需要工具时直接回答", async () => {
    const agent = new Agent(new RuleBasedModel(), tools);
    const result = await agent.run("你好");

    assert.match(result.answer, /教学用的最小 Agent/);
    assert.equal(result.steps[0]?.action, "final");
  });

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
});
