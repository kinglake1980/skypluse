import type { Aircraft } from '../../../shared/types';
import {
  buildSnapshotSummary,
  STANCE_LABEL,
  type SnapshotSummary,
} from '../lib/buildSnapshotSummary';
import { getLLM, isLLMConfigured, LLM_MODEL } from './llm';

const SYSTEM_PROMPT = `你是一名中性、克制的空域观察解说员,面向公众科普大屏。
职责:仅根据给到的“聚合统计数据”客观描述当前区域的整体空域态势——繁忙程度、高度与流向分布、密集区域、整体节奏。
硬性要求:
- 只描述群体/区域层面的客观现象,用简洁中文,2~4 句,口吻平稳中性。
- 不得点名或暗指任何具体航班、不得对任何航班的安全状况下结论、不得预测或臆断。
- 不得给出任何操作、规避、改航、调度或航行建议。
- 只使用所给数据,不臆造数字;数据缺失就不提。
- 不输出免责声明、不复述这些规则、不使用 markdown,直接给解说正文。`;

function buildUserPrompt(region: string, s: SnapshotSummary): string {
  const lines: string[] = [];
  lines.push(`区域:${region}`);
  lines.push(`在视航空器:${s.count} 架(态势:${STANCE_LABEL[s.stance]})`);
  lines.push(`垂直状态:爬升 ${s.climbing}、巡航 ${s.cruising}、下降 ${s.descending}`);
  lines.push(`高度分布(在空):低空 ${s.altBands.low}、中空 ${s.altBands.mid}、高空 ${s.altBands.high}`);
  if (s.avgAltitudeM != null) lines.push(`平均高度:${Math.round(s.avgAltitudeM)} 米`);
  if (s.avgSpeedMs != null) lines.push(`平均地速:${Math.round(s.avgSpeedMs)} 米/秒`);
  if (s.dominantHeadings.length) lines.push(`主要流向(航向方位):${s.dominantHeadings.join('、')}`);
  if (s.densestArea) lines.push(`最密集区域:${s.densestArea.label}(约 ${s.densestArea.count} 架)`);
  lines.push('请据此生成一段中性的区域空域态势解说。');
  return lines.join('\n');
}

interface Deps {
  getAircraft: () => Aircraft[];
  /** 读取当前活动范围(区域名 + bbox),支持多区域/全球切换 */
  getContext: () => { regionName: string; bbox: [number, number, number, number] };
  intervalMs: number;
  broadcast: (obj: unknown) => void;
}

/**
 * 启动解说循环:每约 intervalMs 用聚合摘要调 DeepSeek 流式生成中性解说,经 SSE 推送。
 * 返回停止函数。LLM 未配置或无数据/出错时安全跳过,不影响数据流。
 */
export function startCommentary(deps: Deps): () => void {
  const { getAircraft, getContext, intervalMs, broadcast } = deps;
  let running = false;

  async function runOnce() {
    if (running) return; // 上一轮还没结束(慢响应)则跳过本轮
    if (!isLLMConfigured()) return;
    const aircraft = getAircraft();
    if (aircraft.length === 0) return;

    running = true;
    const id = 'n_' + Date.now();
    const { regionName, bbox } = getContext();
    const summary = buildSnapshotSummary(aircraft, bbox);
    const stance = summary.stance;
    const stanceLabel = STANCE_LABEL[stance];

    try {
      broadcast({ type: 'narration_start', payload: { id, ts: Date.now() } });
      const client = getLLM();
      const stream = await client.chat.completions.create({
        model: LLM_MODEL,
        temperature: 0.4,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(regionName, summary) },
        ],
      });

      let text = '';
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          text += delta;
          broadcast({ type: 'narration_delta', payload: { id, delta } });
        }
      }

      broadcast({
        type: 'narration_done',
        payload: { id, text: text.trim(), stance, stanceLabel, intervalMs, ts: Date.now() },
      });
      console.log(`[commentary] ${stanceLabel} · ${text.trim().slice(0, 40)}…`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[commentary] 生成失败(跳过本轮):', msg);
      broadcast({ type: 'narration_error', payload: { id, message: msg } });
    } finally {
      running = false;
    }
  }

  const kickoff = setTimeout(runOnce, 3000); // 启动后稍等首轮取数
  const timer = setInterval(runOnce, intervalMs);
  return () => {
    clearTimeout(kickoff);
    clearInterval(timer);
  };
}
