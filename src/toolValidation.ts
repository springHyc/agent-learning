import type { JsonSchema, Tool } from "./types.js";

// 这不是完整 JSON Schema 实现，只覆盖本课程工具需要的安全边界。
// 生产项目可以替换成 ajv、zod 等成熟校验库。
export type ValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

function describePath(path: string): string {
  return path || "参数";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isType(value: unknown, type: JsonSchema["type"]): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case undefined:
      return true;
    default:
      return false;
  }
}

function validateValue(value: unknown, schema: JsonSchema, path: string): ValidationResult {
  // 先校验基础类型，避免后续 object/array 分支访问非法结构。
  if (!isType(value, schema.type)) {
    return {
      ok: false,
      message: `${describePath(path)} 类型错误，期望 ${schema.type}，实际是 ${Array.isArray(value) ? "array" : typeof value}`,
    };
  }

  // enum 用来限制模型只能生成程序认识的固定值，例如 add/subtract。
  if (schema.enum && !schema.enum.includes(value)) {
    return {
      ok: false,
      message: `${describePath(path)} 必须是 ${schema.enum.map(String).join("、")} 之一`,
    };
  }

  if (schema.type === "object" && schema.properties) {
    if (!isRecord(value)) {
      return {
        ok: false,
        message: `${describePath(path)} 类型错误，期望 object`,
      };
    }

    // required 防止模型漏传工具执行所需的关键参数。
    const required = schema.required ?? [];
    for (const key of required) {
      if (!(key in value)) {
        return {
          ok: false,
          message: `${describePath(path ? `${path}.${key}` : key)} 是必填参数`,
        };
      }
    }

    // additionalProperties=false 可以拦住模型幻觉出来的多余字段。
    if (schema.additionalProperties === false) {
      const allowedKeys = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
          return {
            ok: false,
            message: `${describePath(path ? `${path}.${key}` : key)} 不是允许的参数`,
          };
        }
      }
    }

    // 递归校验子字段，这样错误信息能定位到具体路径，例如 items[0].name。
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (key in value) {
        const childResult = validateValue(value[key], childSchema, path ? `${path}.${key}` : key);
        if (!childResult.ok) {
          return childResult;
        }
      }
    }
  }

  if (schema.type === "array" && schema.items && Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const childResult = validateValue(item, schema.items, `${path}[${index}]`);
      if (!childResult.ok) {
        return childResult;
      }
    }
  }

  return { ok: true };
}

export function validateToolArgs(tool: Tool, args: Record<string, unknown>): ValidationResult {
  // Tool.parameters 是模型看到的 schema，同时也是 Agent 执行前的校验依据。
  return validateValue(args, tool.parameters, "");
}
