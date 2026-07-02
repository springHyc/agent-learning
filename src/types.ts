export type Role = "user" | "assistant" | "tool";

export type Message = {
  role: Role;
  content: string;
  toolName?: string;
};

export type ToolCall = {
  type: "tool_call";
  toolName: string;
  args: Record<string, unknown>;
};

export type FinalAnswer = {
  type: "final";
  content: string;
};

export type ModelDecision = ToolCall | FinalAnswer;

export type Tool = {
  name: string;
  description: string;
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
