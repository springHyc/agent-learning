export type Role = "system" | "user" | "assistant" | "tool";

export type JsonSchema = {
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: unknown[];
  items?: JsonSchema;
};

export type ToolParameters = JsonSchema & {
  type: "object";
  properties: Record<string, JsonSchema>;
};

export type RecordedToolCall = {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
};

export type Message = {
  role: Role;
  content: string;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: RecordedToolCall[];
};

export type ToolCall = {
  type: "tool_call";
  toolName: string;
  args: Record<string, unknown>;
  toolCallId?: string;
};

export type FinalAnswer = {
  type: "final";
  content: string;
};

export type ModelDecision = ToolCall | FinalAnswer;

export type Tool = {
  name: string;
  description: string; // 这是工具的简短描述，应该清楚地说明它的用途。模型选择工具的核心依据之一。
  parameters: ToolParameters;
  execute: (args: Record<string, unknown>) => Promise<string> | string;
};

export type AgentStep = {
  thought: string;
  action: "final" | "tool_call";
  toolName?: string;
  args?: Record<string, unknown>;
  observation?: string;
};

export type AgentResult = {
  answer: string;
  steps: AgentStep[];
};

export interface Model {
  decide(messages: Message[], tools: Tool[]): Promise<ModelDecision>;
}
