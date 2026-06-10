import { config } from '../config';
import type { Aircraft } from '../../../shared/types';

/** 不可重试的硬错误(凭证缺失/4xx 非限流等) */
export class OpenSkyError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'OpenSkyError';
  }
}

/** 可重试错误(401 令牌失效、429 限流、5xx、网络抖动) */
class RetryableError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── OAuth2 client_credentials 令牌缓存 ──
let tokenCache: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  // 过期前 30s 刷新
  if (tokenCache && tokenCache.exp - 30_000 > now) return tokenCache.token;

  const { clientId, clientSecret, tokenUrl } = config.opensky;
  if (!clientId || !clientSecret) {
    throw new OpenSkyError(
      'missing_credentials',
      'OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET 未配置(请填 server/.env)',
    );
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (res.status === 401 || res.status === 400) {
    throw new OpenSkyError('auth_failed', `令牌获取被拒绝(HTTP ${res.status}),请检查凭证`);
  }
  if (!res.ok) {
    throw new RetryableError('token_http_' + res.status, `令牌获取失败 HTTP ${res.status}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, exp: now + json.expires_in * 1000 };
  return tokenCache.token;
}

/**
 * 把 OpenSky states 的单条 17/18 字段数组解析为 Aircraft。
 * 字段索引参考 docs/PRD.md §4.1。无有效经纬度则丢弃。
 */
function parseState(s: unknown[]): Aircraft | null {
  const lng = s[5];
  const lat = s[6];
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;

  const rawCall = s[1];
  const callsign = typeof rawCall === 'string' ? rawCall.trim() || null : null;
  const baro = typeof s[7] === 'number' ? (s[7] as number) : null;
  const geo = typeof s[13] === 'number' ? (s[13] as number) : null;

  return {
    icao24: String(s[0]),
    callsign,
    country: typeof s[2] === 'string' ? (s[2] as string) : null,
    lng,
    lat,
    altitude: baro ?? geo,
    velocity: typeof s[9] === 'number' ? (s[9] as number) : null,
    heading: typeof s[10] === 'number' ? (s[10] as number) : null,
    verticalRate: typeof s[11] === 'number' ? (s[11] as number) : null,
    squawk: typeof s[14] === 'string' ? (s[14] as string) : null,
    onGround: Boolean(s[8]),
  };
}

export interface StatesResult {
  /** OpenSky 快照时间(秒,epoch) */
  time: number;
  aircraft: Aircraft[];
}

/** 指数退避重试包装(仅对 RetryableError 重试) */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      const retryable =
        e instanceof RetryableError ||
        (e instanceof TypeError); // fetch 网络错误
      if (!retryable || attempt >= maxRetries) throw e;
      const base = Math.min(60_000, 2_000 * 2 ** attempt);
      const delay = base * (0.5 + Math.random()); // 抖动
      attempt++;
      console.warn(
        `[opensky] 第 ${attempt} 次退避重试,${Math.round(delay)}ms 后再试(${(e as Error).message})`,
      );
      await sleep(delay);
    }
  }
}

/** 按边界框拉取区域内航空器;bbox 为 null 时拉取全球(不带 bbox 参数) */
export async function getStates(
  bbox: [number, number, number, number] | null,
): Promise<StatesResult> {
  const url = new URL(config.opensky.statesUrl);
  if (bbox) {
    const [lamin, lomin, lamax, lomax] = bbox;
    url.searchParams.set('lamin', String(lamin));
    url.searchParams.set('lomin', String(lomin));
    url.searchParams.set('lamax', String(lamax));
    url.searchParams.set('lomax', String(lomax));
  }

  return withRetry(async () => {
    const token = await getToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (res.status === 401) {
      tokenCache = null; // 令牌失效,清缓存后重试会刷新
      throw new RetryableError('unauthorized', '令牌失效,将刷新后重试');
    }
    if (res.status === 429) {
      throw new RetryableError('rate_limited', 'OpenSky 限流(429)');
    }
    if (res.status >= 500) {
      throw new RetryableError('upstream_' + res.status, `OpenSky 服务端错误 ${res.status}`);
    }
    if (!res.ok) {
      throw new OpenSkyError('http_' + res.status, `OpenSky 请求失败 HTTP ${res.status}`);
    }

    const json = (await res.json()) as { time: number; states: unknown[][] | null };
    const aircraft = (json.states ?? [])
      .map(parseState)
      .filter((a): a is Aircraft => a !== null);
    return { time: json.time, aircraft };
  });
}
