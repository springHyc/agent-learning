import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateToolArgs } from "../src/toolValidation.js";
import { calculatorTool } from "../src/tools.js";

describe("validateToolArgs", () => {
  it("接受符合 schema 的参数", () => {
    const result = validateToolArgs(calculatorTool, {
      a: 1,
      b: 2,
      operation: "add",
    });

    assert.deepEqual(result, { ok: true });
  });

  it("拒绝缺少必填字段的参数", () => {
    const result = validateToolArgs(calculatorTool, {
      a: 1,
      operation: "add",
    });

    assert.deepEqual(result, {
      ok: false,
      message: "b 是必填参数",
    });
  });

  it("拒绝类型错误的参数", () => {
    const result = validateToolArgs(calculatorTool, {
      a: "1",
      b: 2,
      operation: "add",
    });

    assert.deepEqual(result, {
      ok: false,
      message: "a 类型错误，期望 number，实际是 string",
    });
  });

  it("拒绝 enum 之外的参数", () => {
    const result = validateToolArgs(calculatorTool, {
      a: 1,
      b: 2,
      operation: "plus",
    });

    assert.deepEqual(result, {
      ok: false,
      message: "operation 必须是 add、subtract、multiply、divide 之一",
    });
  });
});
