import type { Tool } from "./types.js";

function getNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key];

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`参数 ${key} 必须是数字`);
  }

  return value;
}

function getString(args: Record<string, unknown>, key: string): string {
  const value = args[key];

  if (typeof value !== "string") {
    throw new Error(`参数 ${key} 必须是字符串`);
  }

  return value;
}

function countWords(text: string): number {
  const matches = text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?|[\u4e00-\u9fff]/g);

  return matches?.length ?? 0;
}

export const calculatorTool: Tool = {
  name: "calculator",
  description: "执行两个数字之间的基础四则运算",
  execute(args) {
    const a = getNumber(args, "a");
    const b = getNumber(args, "b");
    const operation = args.operation;

    switch (operation) {
      case "add":
        return String(a + b);
      case "subtract":
        return String(a - b);
      case "multiply":
        return String(a * b);
      case "divide":
        if (b === 0) {
          throw new Error("除数不能为 0");
        }
        return String(a / b);
      default:
        throw new Error("operation 必须是 add、subtract、multiply 或 divide");
    }
  },
};

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

export const currentTimeTool: Tool = {
  name: "current_time",
  description: "获取当前本地时间",
  execute() {
    return new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour12: false,
    });
  },
};

export const tools: Tool[] = [calculatorTool, currentTimeTool, textStatsTool];
