import type { Message, Model, ModelDecision, Tool } from "./types.js";

type ParsedMath = {
  a: number;
  b: number;
  operation: "add" | "subtract" | "multiply" | "divide";
};

type ParsedTextStats = {
  text: string;
};

function getLastMessage(messages: Message[]): Message {
  const lastMessage = messages.at(-1);

  if (!lastMessage) {
    throw new Error("messages 不能为空");
  }

  return lastMessage;
}

function parseMathExpression(content: string): ParsedMath | null {
  const match = content.match(/(-?\d+(?:\.\d+)?)\s*([+\-*/x×÷])\s*(-?\d+(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  const [, left, operator, right] = match;
  const operationMap: Record<string, ParsedMath["operation"]> = {
    "+": "add",
    "-": "subtract",
    "*": "multiply",
    x: "multiply",
    "×": "multiply",
    "/": "divide",
    "÷": "divide",
  };

  return {
    a: Number(left),
    b: Number(right),
    operation: operationMap[operator],
  };
}

function parseTextStatsRequest(content: string): ParsedTextStats | null {
  if (!/(统计|字数|字符数|词数|文本)/.test(content)) {
    return null;
  }

  const quotedText = content.match(/[“"](.+?)[”"]/s);
  if (quotedText?.[1]?.trim()) {
    return { text: quotedText[1].trim() };
  }

  const textAfterColon = content.match(/[：:]\s*(.+)$/s);
  if (textAfterColon?.[1]?.trim()) {
    return { text: textAfterColon[1].trim() };
  }

  return null;
}

function hasTool(tools: Tool[], toolName: string): boolean {
  return tools.some((tool) => tool.name === toolName);
}

export class RuleBasedModel implements Model {
  async decide(messages: Message[], tools: Tool[]): Promise<ModelDecision> {
    const lastMessage = getLastMessage(messages);

    if (lastMessage.role === "tool") {
      return {
        type: "final",
        content: `工具 ${lastMessage.toolName} 的执行结果是：${lastMessage.content}`,
      };
    }

    const math = parseMathExpression(lastMessage.content);
    if (math && hasTool(tools, "calculator")) {
      return {
        type: "tool_call",
        toolName: "calculator",
        args: math,
      };
    }

    const textStats = parseTextStatsRequest(lastMessage.content);
    if (textStats && hasTool(tools, "text_stats")) {
      return {
        type: "tool_call",
        toolName: "text_stats",
        args: textStats,
      };
    }

    if (/几点|时间|日期|现在/.test(lastMessage.content) && hasTool(tools, "current_time")) {
      return {
        type: "tool_call",
        toolName: "current_time",
        args: {},
      };
    }

    return {
      type: "final",
      content:
        "这是一个教学用的最小 Agent。我现在会计算简单表达式、查询当前时间，也会统计文本。",
    };
  }
}
