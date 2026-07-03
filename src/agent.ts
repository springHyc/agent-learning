import type { AgentResult, AgentStep, Message, Model, Tool } from "./types.js";
import { validateToolArgs } from "./toolValidation.js";

export class Agent {
  private nextLocalToolCallId(stepIndex: number): string {
    return `local_call_${stepIndex + 1}`;
  }

  private buildToolFailureAnswer(
    consecutiveToolErrors: number,
    observation: string,
  ): string {
    return `工具连续失败 ${consecutiveToolErrors} 次，已停止执行。最后错误：${observation}`;
  }

  constructor(
    private readonly model: Model,
    private readonly tools: Tool[],
    private readonly maxSteps = 5, // 最大步骤数，防止模型陷入无限循环
    private readonly maxConsecutiveToolErrors = 2, // 连续工具错误上限，防止模型反复生成错误参数，避免一直循环到maxSteps再终止
  ) {}

  async run(userInput: string): Promise<AgentResult> {
    const messages: Message[] = [{ role: "user", content: userInput }];
    const steps: AgentStep[] = [];
    let consecutiveToolErrors = 0;

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

      const tool = this.tools.find(
        (candidate) => candidate.name === decision.toolName,
      );
      if (!tool) {
        throw new Error(`工具不存在：${decision.toolName}`);
      }

      const toolCallId =
        decision.toolCallId ?? this.nextLocalToolCallId(stepIndex);
      const currentStep: AgentStep = {
        thought: `模型决定调用工具 ${decision.toolName}`,
        action: "tool_call",
        toolName: decision.toolName,
        args: decision.args,
      };

      // 真实 LLM API 需要看到 assistant 发起过哪次 tool call；
      // 下一条 tool message 会用同一个 toolCallId 回答这次调用。
      messages.push({
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: toolCallId,
            toolName: decision.toolName,
            args: decision.args,
          },
        ],
      });

      const validation = validateToolArgs(tool, decision.args);
      if (!validation.ok) {
        consecutiveToolErrors += 1;
        currentStep.observation = `工具参数校验失败：${validation.message}`;

        // 校验失败也作为 observation 回传给模型，让模型有机会修正参数后重试。
        messages.push({
          role: "tool",
          toolName: decision.toolName,
          toolCallId,
          content: currentStep.observation,
        });
        steps.push(currentStep);

        if (consecutiveToolErrors >= this.maxConsecutiveToolErrors) {
          return {
            answer: this.buildToolFailureAnswer(
              consecutiveToolErrors,
              currentStep.observation,
            ),
            steps,
          };
        }

        continue;
      }

      try {
        const observation = await tool.execute(decision.args);
        consecutiveToolErrors = 0;
        currentStep.observation = observation;

        messages.push({
          role: "tool",
          toolName: decision.toolName,
          toolCallId,
          content: observation,
        });
      } catch (error) {
        consecutiveToolErrors += 1;
        const message = error instanceof Error ? error.message : String(error);
        currentStep.observation = `工具执行失败：${message}`;

        messages.push({
          role: "tool",
          toolName: decision.toolName,
          toolCallId,
          content: currentStep.observation,
        });
      }

      steps.push(currentStep);

      if (consecutiveToolErrors >= this.maxConsecutiveToolErrors) {
        return {
          answer: this.buildToolFailureAnswer(
            consecutiveToolErrors,
            currentStep.observation ?? "未知错误",
          ),
          steps,
        };
      }
    }

    throw new Error(`Agent 超过最大步骤数：${this.maxSteps}`);
  }
}
