// SkyPulse 共享类型契约(前后端共用)
// 与 docs/PRD.md §4 数据契约保持一致。

/** 单架航空器的归一化状态(源自 OpenSky /states/all) */
export interface Aircraft {
  /** 唯一标识(主键),OpenSky icao24,小写十六进制 */
  icao24: string;
  /** 呼号,已 trim;可能缺失 */
  callsign: string | null;
  /** 注册国 */
  country: string | null;
  /** 经度 */
  lng: number;
  /** 纬度 */
  lat: number;
  /** 气压高度(米);可能缺失。用于按高度着色 */
  altitude: number | null;
  /** 地速(米/秒);可能缺失 */
  velocity: number | null;
  /** 航向(度,0–360);可能缺失。用于图标旋转 */
  heading: number | null;
  /** 垂直速率(米/秒,负为下降);可能缺失。用于快速下降检测 */
  verticalRate: number | null;
  /** 应答机代码(如 "2000"、"7700");可能缺失。用于紧急代码检测 */
  squawk: string | null;
  /** 是否在地面 */
  onGround: boolean;
}

/** 一帧区域快照:统计 + 全部在视航空器 */
export interface Snapshot {
  /** 服务器生成该帧的时间(ms epoch) */
  serverTime: number;
  /** 数据新鲜度:距上游最后联系的估算秒数 */
  dataAgeSec: number;
  /** 聚焦边界框 [lamin, lomin, lamax, lomax] */
  bbox: [number, number, number, number];
  /** 区域统计 */
  stats: SnapshotStats;
  /** 在视航空器列表 */
  aircraft: Aircraft[];
}

/** 快照聚合统计(供解说与状态条使用) */
export interface SnapshotStats {
  /** 在视总数 */
  count: number;
  /** 爬升中(verticalRate 明显为正) */
  climbing: number;
  /** 下降中(verticalRate 明显为负) */
  descending: number;
  /** 巡航/平飞 */
  cruising: number;
}

/** AI 区域态势解说 */
export interface Commentary {
  /** 唯一 id */
  id: string;
  /** 生成时间(ms epoch) */
  ts: number;
  /** 解说正文(客观、克制) */
  text: string;
  /** 生成时所依据的统计快照 */
  stats: SnapshotStats;
}

/** 异动类别 */
export type AlertKind =
  | 'emergency_code' // 紧急应答机代码 7500/7600/7700
  | 'rapid_descent' // 快速下降
  | 'suspected_holding'; // 疑似盘旋

/** 告警严重度(仅用于排序/样式,非事故判断) */
export type AlertSeverity = 'info' | 'notice';

/** 异动告警:客观说明现象/代码的通常含义,绝不臆断事故 */
export interface Alert {
  /** 唯一 id(用于去重/冷却) */
  id: string;
  /** 关联航空器 */
  icao24: string;
  /** 呼号(便于展示) */
  callsign: string | null;
  /** 异动类别 */
  kind: AlertKind;
  /** 严重度 */
  severity: AlertSeverity;
  /** 客观解释文本(含非事故免责语义) */
  text: string;
  /** 触发证据(阈值命中详情) */
  evidence: AlertEvidence;
  /** 生成时间(ms epoch) */
  ts: number;
}

/** 告警触发证据 */
export interface AlertEvidence {
  squawk?: string;
  /** 命中时的垂直速率(米/秒) */
  verticalRate?: number;
  /** 窗口内累计航向变化(度) */
  headingChangeDeg?: number;
  /** 判定窗口长度(秒) */
  windowSec?: number;
}

/** 后端轮询/连接健康状态(可选事件) */
export interface StatusEvent {
  /** 上游是否可用 */
  upstreamOk: boolean;
  /** 是否处于退避中 */
  backoff: boolean;
  /** 下次重试的等待秒数(退避时) */
  retryInSec?: number;
  /** 说明文本 */
  message?: string;
}

// ── SSE 事件契约 ──
// 端点:GET /api/stream。每条事件以 SSE `event:` 类型 + `data:` JSON 下发。

/** SSE 事件类型名(对应 SSE 的 event 字段) */
export type SSEEventName =
  | 'snapshot'
  | 'narration'
  | 'alert'
  | 'status'
  | 'heartbeat';

/** 强类型 SSE 事件载荷映射 */
export interface SSEEventPayloadMap {
  snapshot: Snapshot;
  narration: Commentary;
  alert: Alert;
  status: StatusEvent;
  heartbeat: { ts: number };
}

/** 判别联合:便于前端按 type 分发 */
export type SSEEvent =
  | { type: 'snapshot'; data: Snapshot }
  | { type: 'narration'; data: Commentary }
  | { type: 'alert'; data: Alert }
  | { type: 'status'; data: StatusEvent }
  | { type: 'heartbeat'; data: { ts: number } };
