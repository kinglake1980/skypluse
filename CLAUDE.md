# CLAUDE.md — SkyPulse

实时航班动态 AI 解说大屏。在深色地图上渲染**京津冀空域**飞机,并由 AI 解说员产出**客观、克制**的区域态势解说与异动解释。**学习/演示用途,非航行、非调度。**

需求详见 [docs/PRD.md](docs/PRD.md)。

---

## 技术栈与数据流

- **前端**:Vite + React + TypeScript + Tailwind CSS + react-leaflet(深色瓦片)。负责**渲染 + 客户端插值**:订阅 SSE,按航向旋转、按高度着色绘制飞机,并在两帧快照之间用速度/航向做航位推算插值实现平滑滑行。
- **后端**:Node + Express + TypeScript。**单点轮询** OpenSky `/api/states/all`(约 10s 一次,OAuth2 client-credentials),**遵守限流**(令牌到期前刷新、429/5xx 指数退避带抖动),归一化后通过 **SSE 扇出**给所有前端连接;同时驱动解说与异动检测 agent。
- **AI**:用 `openai` 包(OpenAI 兼容 SDK)接 DeepSeek,**密钥只在后端**。

```
OpenSky /states/all ──(10s 轮询 · OAuth2 · 退避)──▶ 后端 Poller(单点)
                                                      │ 归一化 + 短时轨迹窗口
                          ┌───────────────────────────┼────────────────────────────┐
                          ▼                           ▼                            ▼
                   每周期 snapshot           每30s 聚合→解说 agent         异动检测→告警 agent
                          └──────────── SSE /api/stream (snapshot|narration|alert|status) ┘
                                                      ▼
                            前端:react-leaflet 渲染 + 客户端插值 + 解说/告警侧栏
```

---

## 目录约定

```
/client/src/components   前端 UI 组件(地图、飞机层、解说侧栏、告警面板、状态条、免责条)
/client/src/lib          前端插值/工具(纯函数:航位推算、着色、SSE 客户端)
/server/src/opensky      OpenSky 取数(OAuth2 令牌、轮询、归一化、退避)
/server/src/agents       AI agents(解说 agent、异动告警 agent)
/server/src/lib          后端纯函数(异动检测、聚合统计等),每个配同名 .test.ts
/shared/types.ts         前后端共享类型契约
/docs/PRD.md             产品需求文档
```

- 纯函数与逻辑放 `lib/`,并配**同名 `.test.ts`**(如 `detectAnomalies.ts` + `detectAnomalies.test.ts`)。
- 共享类型一律从 `/shared/types.ts` import,不在两端各自重复定义。

---

## 四条铁律(不可违背)

1. **凭证只在后端**:OpenSky 凭证与 DeepSeek 密钥仅存于 `/server/.env`,绝不进前端产物、绝不经接口/SSE 下发;前端不直连任何上游。
2. **后端单点轮询并守限流**:由后端单实例统一轮询 OpenSky;令牌到期前刷新;遇 429/5xx 走指数退避(带抖动);不并发刷数据。
3. **AI 客观克制**:解说与告警只做客观、中性描述;对紧急代码**只**解释其通常含义与管制通常处置;**绝不臆断、不渲染**某架飞机出事/坠毁/伤亡,不做预测,不给操作建议;不确定即说明不确定。
4. **界面常驻提示**:界面始终显示「数据可能延迟/不完整,仅供学习,不用于实际航行或调度」。

---

## 模型配置

- 用 `openai` SDK 接 DeepSeek:`baseURL = https://api.deepseek.com`,`apiKey = process.env.DEEPSEEK_API_KEY`。
- **区域解说(高频)**:`deepseek-v4-flash`(低延迟、低成本)。
- **深度分析(可选/低频)**:`deepseek-v4-pro`。
- 模型名通过环境变量可覆盖(`DEEPSEEK_MODEL`),便于上游模型名调整。
- DeepSeek 调用失败时**降级**:跳过该轮解说/告警,不阻塞数据流、不崩溃。

---

## 命令

```bash
# 开发(前后端并行)
npm run dev

# 构建
npm run build

# 测试(纯函数 .test.ts)
npm test
```

> 具体脚本在根 `package.json` 与各子包内定义;后端 dev 用 `tsx` 热跑,测试用 `vitest`。

---

## 工作流

- 按 [docs/PRD.md §8](docs/PRD.md) 的**竖切片**逐片推进。
- 每个切片**验证通过后提交到 GitHub**(一片一提交,提交信息标明切片号与可见效果)。
- 若下一切片出错且难以快速修复,**回滚到上一提交**的稳定状态再重做,避免在坏状态上叠加。
- 提交前自检:无密钥入库、`npm test` 通过、对应切片的验收标准达成。
