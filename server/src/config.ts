import 'dotenv/config';

function num(v: string | undefined, fallback: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const DEFAULT_BBOX: [number, number, number, number] = [38.0, 114.0, 41.5, 119.0];

function parseBbox(raw: string | undefined): [number, number, number, number] {
  if (!raw) return DEFAULT_BBOX;
  const parts = raw.split(',').map((s) => Number(s.trim()));
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    return parts as [number, number, number, number];
  }
  return DEFAULT_BBOX;
}

export const config = {
  port: num(process.env.PORT, 8787),
  pollIntervalMs: num(process.env.POLL_INTERVAL_MS, 10_000),
  /** 全球模式更长的轮询间隔(数据量大、扣额度高) */
  globalPollIntervalMs: num(process.env.GLOBAL_POLL_INTERVAL_MS, 30_000),
  narrationIntervalMs: num(process.env.NARRATION_INTERVAL_MS, 30_000),
  /** 跟随视野的最大经纬跨度(度),超过则夹取 */
  maxViewportDeg: num(process.env.MAX_VIEWPORT_DEG, 60),
  /** 单帧最多下发给前端渲染的飞机数(全球模式抽稀上限) */
  maxGlobalRender: num(process.env.MAX_GLOBAL_RENDER, 800),
  bbox: parseBbox(process.env.REGION_BBOX),
  regionName: process.env.REGION_NAME ?? '京津冀',
  events: {
    rapidDescentMps: num(process.env.RAPID_DESCENT_MPS, -10),
    holdingWindowMs: num(process.env.HOLDING_WINDOW_MS, 90_000),
    holdingTurnDeg: num(process.env.HOLDING_TURN_DEG, 270),
    /** 同一航空器同类告警的冷却期(毫秒) */
    cooldownMs: num(process.env.ALERT_COOLDOWN_MS, 300_000),
  },
  opensky: {
    clientId: process.env.OPENSKY_CLIENT_ID ?? '',
    clientSecret: process.env.OPENSKY_CLIENT_SECRET ?? '',
    tokenUrl:
      'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
    statesUrl: 'https://opensky-network.org/api/states/all',
  },
  // DeepSeek / OpenAI 兼容端点:baseURL、模型 ID、API Key 全部可配置
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    // 高频解说默认模型;深度分析模型可单独覆盖
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
    modelPro: process.env.DEEPSEEK_MODEL_PRO ?? 'deepseek-v4-pro',
  },
} as const;
