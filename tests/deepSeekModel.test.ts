import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeepSeekModel } from "../src/deepSeekModel.js";
import type { Message } from "../src/types.js";
import { tools } from "../src/tools.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("DeepSeekModel", () => {
  it("把 DeepSeek tool_calls 转成 Agent 使用的 tool_call 决策", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return jsonResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "calculator",
                    arguments: '{"a":2,"b":3,"operation":"add"}',
                  },
                },
              ],
            },
          },
        ],
      });
    };

    const model = new DeepSeekModel({ apiKey: "test-key", fetchImpl });
    const decision = await model.decide([{ role: "user", content: "帮我计算 2 + 3" }], tools);

    assert.deepEqual(decision, {
      type: "tool_call",
      toolName: "calculator",
      args: { a: 2, b: 3, operation: "add" },
      toolCallId: "call_123",
    });
    assert.equal(requestBody?.model, "deepseek-v4-flash");
    assert.equal(requestBody?.tool_choice, "auto");

    const requestTools = requestBody?.tools;
    assert.ok(Array.isArray(requestTools));
    assert.equal(requestTools[0]?.type, "function");
  });

  it("发送工具结果时保留 tool_call_id，并读取最终回答", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return jsonResponse({
        choices: [
          {
            message: {
              content: "计算结果是 5。",
            },
          },
        ],
      });
    };

    const messages: Message[] = [
      { role: "user", content: "帮我计算 2 + 3" },
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
      },
      {
        role: "tool",
        toolName: "calculator",
        toolCallId: "call_123",
        content: "5",
      },
    ];

    const model = new DeepSeekModel({ apiKey: "test-key", fetchImpl });
    const decision = await model.decide(messages, tools);

    assert.deepEqual(decision, {
      type: "final",
      content: "计算结果是 5。",
    });

    const requestMessages = requestBody?.messages;
    assert.ok(Array.isArray(requestMessages));
    assert.deepEqual(requestMessages.at(-1), {
      role: "tool",
      content: "5",
      tool_call_id: "call_123",
    });
  });
});
