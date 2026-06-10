import OpenAI from 'openai';
import { config } from '../config';

/**
 * DeepSeek / OpenAI 兼容客户端工厂。
 * baseURL、模型 ID、API Key 全部来自 config(由环境变量驱动),
 * 换厂商只需改 .env 的 DEEPSEEK_BASE_URL / DEEPSEEK_MODEL / DEEPSEEK_API_KEY。
 * 密钥只在后端(铁律①)。
 */

let client: OpenAI | null = null;

/** 是否已配置可用的 LLM(缺 key 时 agent 应降级跳过,不崩溃) */
export function isLLMConfigured(): boolean {
  return Boolean(config.deepseek.apiKey);
}

/** 取(惰性创建)OpenAI 兼容客户端 */
export function getLLM(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseURL,
    });
  }
  return client;
}

/** 默认(高频解说)模型 ID */
export const LLM_MODEL = config.deepseek.model;
/** 深度分析(低频)模型 ID */
export const LLM_MODEL_PRO = config.deepseek.modelPro;
