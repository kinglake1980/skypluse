import type { AlertKind } from '../../../shared/types';
import type { DetectedEvent } from '../lib/detectEvents';
import { getLLM, isLLMConfigured, LLM_MODEL } from './llm';

const DISCLAIMER = '以上为一般性说明,非对该航班的判断。';

/** 确定性兜底解释(LLM 不可用/失败时使用,也作为 LLM 的事实基准) */
function baseExplanation(ev: DetectedEvent): string {
  switch (ev.kind) {
    case 'emergency_code': {
      const code = ev.evidence.squawk;
      if (code === '7500')
        return `应答机 7500 通常表示可能存在非法干扰(劫持)情形,管制一般会保持常规处置并按程序优先协调与协助。${DISCLAIMER}`;
      if (code === '7600')
        return `应答机 7600 通常表示无线电通信失效,机组会按通信失效程序飞行,管制一般优先提供间隔与引导。${DISCLAIMER}`;
      return `应答机 7700 为一般紧急代码,通常表示机组宣布紧急状态,一般会获得管制的优先处置与协助。${DISCLAIMER}`;
    }
    case 'rapid_descent':
      return `该航空器出现较快的高度下降,这也可能只是正常的进近下降或按指令调整高度;具体以实际运行为准。${DISCLAIMER}`;
    case 'suspected_holding':
      return `该航空器短时间内航向多次明显变化,常见于等待航线(盘旋待降)或机动调整等情形。${DISCLAIMER}`;
  }
}

const SYSTEM_PROMPT = `你是中性、克制的空域科普解说员。针对给定的“现象/代码”,只用 1~2 句简洁中文客观说明:该代码或现象通常代表什么、管制一般如何处置。
硬性要求:
- 只做一般性说明,绝不臆断该航班的原因、状态或结果,绝不渲染危险或事故,绝不预测“会坠毁/出事”等。
- 不得给出任何操作、规避或航行建议。
- 明确点出该现象也可能是常规情形(如快速下降也可能只是正常进近)。
- 必须以这句话结尾:「${DISCLAIMER}」
- 不使用 markdown,直接输出说明文本。`;

function userPrompt(ev: DetectedEvent): string {
  const base = baseExplanation(ev);
  const kindCn: Record<AlertKind, string> = {
    emergency_code: `紧急应答机代码 ${ev.evidence.squawk}`,
    rapid_descent: `快速下降(垂直速率约 ${ev.evidence.verticalRate} 米/秒)`,
    suspected_holding: `疑似盘旋(约 ${ev.evidence.windowSec}s 内累计航向变化约 ${ev.evidence.headingChangeDeg}°)`,
  };
  return `现象:${kindCn[ev.kind]}\n参考事实(可改写但不得偏离其含义):${base}\n请据此生成一句客观说明。`;
}

/**
 * 为单个异动生成客观解释。LLM 不可用或失败时返回确定性兜底文本。
 * 始终保证以免责说明结尾。
 */
export async function explainEvent(ev: DetectedEvent): Promise<string> {
  if (!isLLMConfigured()) return baseExplanation(ev);
  try {
    const client = getLLM();
    const res = await client.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(ev) },
      ],
    });
    let text = res.choices?.[0]?.message?.content?.trim() || '';
    if (!text) return baseExplanation(ev);
    if (!text.includes('非对该航班的判断')) text += ` ${DISCLAIMER}`;
    return text;
  } catch (e) {
    console.error('[alert] 解释生成失败,使用兜底:', e instanceof Error ? e.message : String(e));
    return baseExplanation(ev);
  }
}
