import { Agent } from "./agent.js";
import { DeepSeekModel } from "./deepSeekModel.js";
import { loadEnvFile } from "./env.js";
import { RuleBasedModel } from "./ruleBasedModel.js";
import { tools } from "./tools.js";
import type { Model } from "./types.js";

loadEnvFile();

function createModel(): Model {
  const provider = process.env.MODEL_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new RuleBasedModel();
    case "deepseek":
      return new DeepSeekModel({
        apiKey: process.env.DEEPSEEK_API_KEY ?? "",
        model: process.env.DEEPSEEK_MODEL,
        baseUrl: process.env.DEEPSEEK_BASE_URL,
      });
    default:
      throw new Error(`不支持的 MODEL_PROVIDER：${provider}`);
  }
}

const input = process.argv.slice(2).join(" ") || "帮我计算 12 + 30";
const agent = new Agent(createModel(), tools);
const result = await agent.run(input);

console.log("用户输入：");
console.log(input);
console.log();

console.log("执行步骤：");
for (const [index, step] of result.steps.entries()) {
  console.log(`${index + 1}. ${step.thought}`);

  if (step.toolName) {
    console.log(`   工具：${step.toolName}`);
    console.log(`   参数：${JSON.stringify(step.args)}`);
    console.log(`   观察：${step.observation}`);
  }
}
console.log();

console.log("最终回答：");
console.log(result.answer);
