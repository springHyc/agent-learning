import type {
  Message,
  Model,
  ModelDecision,
  RecordedToolCall,
  Tool,
} from "./types.js";

type DeepSeekModelOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  systemPrompt?: string;
  fetchImpl?: typeof fetch;
};

type DeepSeekToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type DeepSeekMessage =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: DeepSeekToolCall[];
    }
  | {
      role: "tool";
      content: string;
      tool_call_id: string;
    };

type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: DeepSeekToolCall[];
    };
  }>;
};

const debugColors = {
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  reset: "\x1b[0m",
} as const;

function isDebugEnabled(): boolean {
  return process.env.AGENT_DEBUG === "1";
}

function debugLog(
  title: string,
  value?: unknown,
  color: string = debugColors.cyan,
): void {
  if (!isDebugEnabled()) {
    return;
  }

  console.log(`${color}[DeepSeekModel] ${title}${debugColors.reset}`);
  if (value !== undefined) {
    console.dir(value, {
      depth: null,
      colors: true,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(
  value: string,
  context: string,
): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;

  if (!isRecord(parsed)) {
    throw new Error(`${context} 必须是 JSON 对象`);
  }

  return parsed;
}

function parseToolArguments(argumentsText: string): Record<string, unknown> {
  try {
    return parseJsonObject(argumentsText, "DeepSeek 返回的工具参数");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法解析工具参数：${message}`);
  }
}

function getFirstAssistantMessage(
  response: DeepSeekChatResponse,
): NonNullable<
  NonNullable<DeepSeekChatResponse["choices"]>[number]["message"]
> {
  const message = response.choices?.[0]?.message;

  if (!message) {
    throw new Error("DeepSeek 响应缺少 choices[0].message");
  }

  return message;
}

function toDeepSeekTool(tool: Tool): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}

function toDeepSeekToolCall(toolCall: RecordedToolCall): DeepSeekToolCall {
  return {
    id: toolCall.id,
    type: "function",
    function: {
      name: toolCall.toolName,
      arguments: JSON.stringify(toolCall.args),
    },
  };
}

export class DeepSeekModel implements Model {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly systemPrompt: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DeepSeekModelOptions) {
    if (!options.apiKey) {
      throw new Error("缺少 DEEPSEEK_API_KEY，请在环境变量或 .env 中配置");
    }

    this.apiKey = options.apiKey;
    this.model = options.model ?? "deepseek-v4-flash";
    this.baseUrl = (options.baseUrl ?? "https://api.deepseek.com").replace(
      /\/+$/,
      "",
    );
    this.systemPrompt =
      options.systemPrompt ??
      "你是一个教学用 Agent。需要工具时只发起工具调用；拿到工具结果后，用简洁中文回答用户。";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async decide(messages: Message[], tools: Tool[]): Promise<ModelDecision> {
    const requestBody = {
      model: this.model,
      messages: this.toDeepSeekMessages(messages),
      tools: tools.map(toDeepSeekTool),
      tool_choice: "auto",
      thinking: { type: "disabled" },
      temperature: 0,
      stream: false,
    };

    debugLog("request messages", requestBody.messages, debugColors.blue);

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(
        `DeepSeek API 请求失败 (${response.status}): ${responseText}`,
      );
    }

    const responseJson = JSON.parse(responseText) as DeepSeekChatResponse;
    debugLog("raw response", responseJson, debugColors.yellow);
    const assistantMessage = getFirstAssistantMessage(responseJson);
    const toolCall = assistantMessage.tool_calls?.[0];

    if (toolCall) {
      debugLog("selected tool call", toolCall, debugColors.green);

      return {
        type: "tool_call",
        toolName: toolCall.function.name,
        args: parseToolArguments(toolCall.function.arguments),
        toolCallId: toolCall.id,
      };
    }

    debugLog("final answer", assistantMessage.content, debugColors.green);

    return {
      type: "final",
      content: assistantMessage.content ?? "",
    };
  }

  private toDeepSeekMessages(messages: Message[]): DeepSeekMessage[] {
    return [
      {
        role: "system",
        content: this.systemPrompt,
      },
      ...messages.map((message): DeepSeekMessage => {
        if (message.role === "tool") {
          if (!message.toolCallId) {
            throw new Error("发送给 DeepSeek 的 tool message 缺少 toolCallId");
          }

          return {
            role: "tool",
            content: message.content,
            tool_call_id: message.toolCallId,
          };
        }

        if (message.role === "assistant") {
          return {
            role: "assistant",
            content: message.content || null,
            tool_calls: message.toolCalls?.map(toDeepSeekToolCall),
          };
        }

        return {
          role: message.role,
          content: message.content,
        };
      }),
    ];
  }
}
