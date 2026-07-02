import type { AgentResult, AgentStep, Message, Model, Tool } from "./types.js";

export class Agent {
  constructor(
    private readonly model: Model,
    private readonly tools: Tool[],
    private readonly maxSteps = 5,
  ) {}

  async run(userInput: string): Promise<AgentResult> {
    const messages: Message[] = [{ role: "user", content: userInput }];
    const steps: AgentStep[] = [];

    for (let stepIndex = 0; stepIndex < this.maxSteps; stepIndex += 1) {
      const decision = await this.model.decide(messages, this.tools);

      if (decision.type === "final") {
        steps.push({
          thought: "模型判断已经可以给出最终回答",
          action: "final",
        });

        return {
          answer: decision.content,
          steps,
        };
      }

      const tool = this.tools.find((candidate) => candidate.name === decision.toolName);
      if (!tool) {
        throw new Error(`工具不存在：${decision.toolName}`);
      }

      const currentStep: AgentStep = {
        thought: `模型决定调用工具 ${decision.toolName}`,
        action: "tool_call",
        toolName: decision.toolName,
        args: decision.args,
      };

      try {
        const observation = await tool.execute(decision.args);
        currentStep.observation = observation;

        messages.push({
          role: "tool",
          toolName: decision.toolName,
          content: observation,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        currentStep.observation = `工具执行失败：${message}`;

        messages.push({
          role: "tool",
          toolName: decision.toolName,
          content: currentStep.observation,
        });
      }

      steps.push(currentStep);
    }

    throw new Error(`Agent 超过最大步骤数：${this.maxSteps}`);
  }
}
