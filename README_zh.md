<p align="center">
  <img src="public/claw-empire.svg" width="80" alt="Claw-Empire" />
</p>

<h1 align="center">Claw-Empire</h1>

<p align="center">
  <strong>从CEO办公桌指挥您的AI代理帝国</strong><br>
  一个本地优先的 AI 代理办公室模拟器，可将 <b>CLI</b>、<b>OAuth</b>、<b>API 连接</b> 的提供商（如 <b>Claude Code</b>、<b>Codex CLI</b>、<b>Gemini CLI</b>、<b>OpenCode</b>、<b>GitHub Copilot</b>、<b>Antigravity</b>）统一编排为自治虚拟公司
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.1-blue" alt="Releases" />
  <a href="https://github.com/GreenSheep01201/claw-empire/actions/workflows/ci.yml"><img src="https://github.com/GreenSheep01201/claw-empire/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/license-Apache%202.0-orange" alt="License" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="Platform" />
  <img src="https://img.shields.io/badge/AI-Claude%20%7C%20Codex%20%7C%20Gemini%20%7C%20OpenCode%20%7C%20Copilot%20%7C%20Antigravity-purple" alt="AI Agents" />
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> &middot;
  <a href="#ai-installation-guide">AI 安装指南</a> &middot;
  <a href="docs/releases/v2.0.1.md">发布说明</a> &middot;
  <a href="#openclaw-integration">OpenClaw 集成</a> &middot;
  <a href="#direct-messenger-without-openclaw">直连消息渠道</a> &middot;
  <a href="#dollar-command-logic">$ 命令逻辑</a> &middot;
  <a href="#功能特性">功能特性</a> &middot;
  <a href="#截图">截图</a> &middot;
  <a href="#技术栈">技术栈</a> &middot;
  <a href="#cli-提供商配置">提供商</a> &middot;
  <a href="#安全性">安全性</a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README_ko.md">한국어</a> | <a href="README_jp.md">日本語</a> | <b>中文</b>
</p>

<p align="center">
  <img src="Sample_Img/Office.png" alt="Office View" width="100%" />
</p>

---

## 什么是 Claw-Empire？

Claw-Empire 将通过 **CLI**、**OAuth** 或 **直接 API Key** 连接的 AI 编程助手，转化为一个完整模拟的**虚拟软件公司**。您是 CEO，AI 代理是员工。看着它们跨部门协作、召开会议、完成任务、不断成长 —— 一切都通过迷人的像素风格办公室界面直观呈现。

### 为什么选择 Claw-Empire？

- **统一界面，多款 AI 代理** — 在单一仪表板管理 CLI/OAuth/API 接入的代理
- **本地优先，隐私保障** — 所有数据存储在您的机器上，SQLite 数据库，无需云端依赖
- **可视化且直观** — 像素艺术风格的办公室视图，让 AI 编排变得有趣而透明
- **真正的自主协作** — 代理在独立的 git worktree 中工作、参加会议并产出成果

---

## 用 AI 安装

> **只需将以下内容粘贴到您的 AI 编程代理（Claude Code、Codex、Gemini CLI 等）：**
>
> ```
> Install Claw-Empire following the guide at:
> https://github.com/GreenSheep01201/claw-empire
> ```
>
> AI 将阅读此 README 并自动处理一切。

---

## 最新发布 (v2.0.1)

- **办公室 Pack 部门优先级改为 hydration 感知** - 在 `development` 之外的 Pack 中，hydration 前优先显示 pack profile（名称/图标），hydration 完成后优先采用 DB 元数据。
- **保护首次安装体验** - 新安装首次进入时，即使 DB 尚未 hydration，也会先展示 pack profile，避免初始界面缺失。
- **强化合并规则回归测试** - 已补充并固定 hydration 前后优先级切换，以及跨 Pack seed 代理隐藏条件测试。
- **Discord Token 自动频道发现** - 新增基于 Discord Bot Token 的频道发现 API，支持 `Bot <token>` 与原始 token 两种输入格式。
- **设置弹窗自动补全体验** - 在聊天会话编辑器输入 Discord token 后自动加载频道候选，并可自动填充目标 ID/默认显示名。
- **新增 Discord 接收器（双向）** - 引入轮询式 Discord 接收器，将用户消息转发到 `/api/inbox`，并过滤机器人消息避免回环。
- **接收状态可视化增强** - 新增 Discord 接收器状态 API 与设置页状态卡片，可直接查看启用状态、轮询频道数与最后错误。
- **Discord 多 Token 入站隔离** - 使用 tokenKey+channel 的游标与路由隔离，避免同频道多 token 场景下的消息串线。
- **多语言提示/错误文案补强** - Discord 频道加载、无结果、认证失败、限流与通用失败提示统一支持 KO/EN/JA/ZH。
- **Discord 回归测试扩展** - 增加频道发现/认证失败、接收器转发、机器人消息过滤、多 token source hint、UI 自动加载等测试。

- 详细说明: [`docs/releases/v2.0.1.md`](docs/releases/v2.0.1.md)
- API 文档: [`docs/api.md`](docs/api.md), [`docs/openapi.json`](docs/openapi.json)
- 安全策略: [`SECURITY.md`](SECURITY.md)

## 办公室 Pack 档案 (v2.0.1)

每个办公室 Pack 都有不同的协作拓扑、命名种子与工作流偏好。

| Pack | 核心侧重点 | 代表组织结构 |
| --- | --- | --- |
| `development` (`DEV`) | 保持向后兼容的默认研发基线 | 企划 / 开发 / 设计 / QA-QC / DevSecOps / 运营 |
| `report` (`RPT`) | 结构化报告与文档交付 | 编辑企划室、调研引擎组、文档设计组、审校组 |
| `web_research_report` (`WEB`) | 以来源采集与引用核验为核心的调研 | 调研战略室、爬取组、事实核验组 |
| `novel` (`NOV`) | 以世界观、叙事和文风一致性为核心的创作 | 世界观组、叙事引擎组、角色美术组、语气审校组 |
| `video_preprod` (`VID`) | 围绕概念/脚本/镜头清单/剪辑备注的前期策划 | 前期策划组、场景引擎组、美术摄影组、镜头审校组 |
| `roleplay` (`RPG`) | 角色沉浸式对话与设定一致性 | 角色企划室、对话引擎组、演出美术组、角色审校组 |

## 截图

<table>
<tr>
<td width="50%">

**仪表板** — 实时 KPI 指标、代理排名和部门状态一览无余

<img src="Sample_Img/Dashboard.png" alt="Dashboard" width="100%" />
</td>
<td width="50%">

**看板** — 支持拖拽的任务管理，可按部门和代理筛选

<img src="Sample_Img/Kanban.png" alt="Kanban Board" width="100%" />
</td>
</tr>
<tr>
<td width="50%">

**技能库** — 浏览并分配 600+ 项跨类别的代理技能

<img src="Sample_Img/Skills.png" alt="Skills Library" width="100%" />
</td>
<td width="50%">

**多提供商 CLI** — 配置 Claude Code、Codex、Gemini CLI、OpenCode 并选择模型

<img src="Sample_Img/CLI.png" alt="CLI Tools Settings" width="100%" />
</td>
</tr>
<tr>
<td width="50%">

**OAuth 集成** — 安全的 GitHub 与 Google OAuth，加密令牌存储

<img src="Sample_Img/OAuth.png" alt="OAuth Settings" width="100%" />
</td>
<td width="50%">

**会议纪要** — AI 生成的会议摘要，支持多轮审阅与批准

<img src="Sample_Img/Meeting_Minutes.png" alt="Meeting Minutes" width="100%" />
</td>
</tr>
<tr>
<td width="50%">

**即时通讯集成** — 可配置 Telegram、WhatsApp、Discord、Google Chat、Slack、Signal、iMessage 会话并发送 `$` CEO 指令

<img src="Sample_Img/telegram.png" alt="Messenger Integration" width="100%" />
</td>
<td width="50%">

**设置** — 配置公司名称、CEO 名称、默认提供商偏好（CLI/OAuth/API）和语言偏好

<img src="Sample_Img/Setting.png" alt="Settings" width="100%" />
</td>
</tr>
<tr>
<td width="50%">

**详细报告** — 请求完成后的报告弹窗、报告历史与详细报告查看示例

<img src="Sample_Img/Report.png" alt="Detailed Report" width="100%" />
</td>
<td width="50%">

**PPT 生成示例** — 报告请求触发的 PPT 生成结果示例

<p align="center">
  <img src="Sample_Img/PPT_Gen0.png" alt="PPT Generation Example 0" width="49%" />
  <img src="Sample_Img/PPT_Gen1.png" alt="PPT Generation Example 1" width="49%" />
</p>
</td>
</tr>
</table>

### 视频输出示例

片头视频输出样例预览:

<p align="center">
  <video src="Sample_Img/claw-empire-intro.mp4" controls muted playsinline width="100%"></video>
</p>

- 文件直链: [`Sample_Img/claw-empire-intro.mp4`](Sample_Img/claw-empire-intro.mp4)

### PPT 示例源码

可通过以下样例快速参考或扩展“报告生成 PPT”的实现。
使用路径: **聊天窗口 > Report Request 按钮**，然后输入你的请求内容。

- 目录: [`docs/reports/Sample_Slides`](docs/reports/Sample_Slides)
- 示例演示文稿（`.pptx`）: [`docs/reports/PPT_Sample.pptx`](docs/reports/PPT_Sample.pptx)
- HTML 幻灯片: [`slide-01.html`](docs/reports/Sample_Slides/slide-01.html), [`slide-02.html`](docs/reports/Sample_Slides/slide-02.html), [`slide-03.html`](docs/reports/Sample_Slides/slide-03.html), [`slide-04.html`](docs/reports/Sample_Slides/slide-04.html), [`slide-05.html`](docs/reports/Sample_Slides/slide-05.html), [`slide-06.html`](docs/reports/Sample_Slides/slide-06.html), [`slide-07.html`](docs/reports/Sample_Slides/slide-07.html), [`slide-08.html`](docs/reports/Sample_Slides/slide-08.html), [`slide-09.html`](docs/reports/Sample_Slides/slide-09.html)
- 构建脚本: [`build-pptx.mjs`](docs/reports/Sample_Slides/build-pptx.mjs), [`build-pptx.cjs`](docs/reports/Sample_Slides/build-pptx.cjs), [`html2pptx.cjs`](docs/reports/Sample_Slides/html2pptx.cjs)

---

## 功能特性

| 功能                  | 描述                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **像素风格办公室**    | 动态办公室视图，代理可在 6 个部门之间行走、工作和参加会议                                                                            |
| **工作流 Pack 档案**  | 内置 `development`、`report`、`web_research_report`、`novel`、`video_preprod`、`roleplay` 六类 Pack，可按 Pack 切换路由结构、QA 规则与输出模板 |
| **办公室 Pack 档案**  | 支持按 Pack 独立管理部门拓扑、命名/主题种子，以及员工与部门数据（开发 Pack 维持既有 DB 基线行为）                                   |
| **看板任务面板**      | 完整任务生命周期 — 收件箱、已计划、协作中、进行中、审阅中、已完成 — 支持拖拽操作                                                     |
| **CEO 聊天与指令**    | 与团队负责人直接沟通；`$` 指令支持会议选择与项目路径/上下文路由（`project_path`、`project_context`）                                 |
| **多提供商支持**      | Claude Code、Codex CLI、Gemini CLI、OpenCode、Antigravity — 统一仪表板管理                                                           |
| **外部 API 提供商**   | 通过设置 > API 选项卡将代理连接到外部 LLM API（OpenAI、Anthropic、Google、Ollama、OpenRouter、Together、Groq、Cerebras、自定义端点） |
| **OAuth 集成**        | GitHub 与 Google OAuth，AES 加密令牌本地存储于 SQLite                                                                                |
| **实时 WebSocket**    | 实时状态更新、活动动态及代理状态同步                                                                                                 |
| **活跃代理控制**      | 查看工作中代理的进程/活动/空闲元数据，并可对卡住任务执行强制停止                                                                     |
| **任务报告系统**      | 完成报告弹窗、历史列表、团队报告详情与规划负责人最终汇总归档                                                                         |
| **员工管理**          | 员工招聘、编辑、删除，支持多语言姓名、部门/职级/提供商选择及性格设定                                                                 |
| **代理排名与经验值**  | 代理完成任务可获得经验值，排行榜追踪顶尖表现者                                                                                       |
| **技能库**            | 600+ 分类技能（前端、后端、设计、AI、DevOps、安全等），支持自定义技能上传                                                            |
| **会议系统**          | 支持计划内及临时会议，AI 生成纪要并支持多轮审阅                                                                                      |
| **Git Worktree 隔离** | 每个代理在独立的 git 分支中工作，仅在 CEO 批准后合并                                                                                 |
| **多语言界面**        | 英语、韩语、日语、中文 — 自动检测或手动设置                                                                                          |
| **即时通讯集成**      | Telegram、Discord、Slack 等 — 通过内置直连频道会话发送 `$` CEO 指令并接收任务更新（OpenClaw 可选）                                   |
| **PowerPoint 导出**   | 从会议纪要和报告生成演示文稿幻灯片                                                                                                   |
| **通信 QA 脚本**      | 内置 `test:comm:*` 脚本，可带重试与证据日志验证 CLI/OAuth/API 连通性                                                                 |
| **应用内更新提示**    | 检查 GitHub 最新发布，发现新版本时在顶部显示含 OS 区分 `git pull` 指引和发布说明链接的横幅                                           |
| **部门管理**          | 规划、开发、设计、QA/QC、DevSecOps、运营 — 专用管理选项卡支持箭头/拖拽排序编辑                                                       |
| **员工手动指派**      | 为项目指定特定员工后，会议和任务委派仅针对指定员工运行                                                                               |
| **精灵注册安全防护**  | 通过 `409 sprite_number_exists` 响应防止重复精灵编号文件覆盖                                                                         |
| **自定义技能上传**    | 通过 UI 上传 `.md` 技能文件为 CLI 代表培训自定义技能，配有黑板教室动画和管理界面                                                     |

---

## 技术栈

| 层级             | 技术                                                |
| ---------------- | --------------------------------------------------- |
| **前端**         | React 19 + Vite 7 + Tailwind CSS 4 + TypeScript 5.9 |
| **像素艺术引擎** | PixiJS 8                                            |
| **后端**         | Express 5 + SQLite（零配置嵌入式数据库）            |
| **实时通信**     | WebSocket (ws)                                      |
| **数据校验**     | Zod 4                                               |
| **图标**         | Lucide React                                        |
| **路由**         | React Router 7                                      |
| **导出**         | PptxGenJS（PowerPoint 生成）                        |

<a id="ai-installation-guide">
## AI 安装指南

> 本节面向 AI 编程代理。请逐步执行，并在每一步运行验证命令后再继续。

### 第 0 步：检查前置条件

```bash
# Node.js 22+
node -v

# pnpm（如缺失则启用 corepack）
pnpm -v || corepack enable

# git
git --version
```

### 第 1 步：克隆并执行一键安装

```bash
git clone https://github.com/GreenSheep01201/claw-empire.git
cd claw-empire
git submodule update --init --recursive
bash install.sh
```

Windows PowerShell:

```powershell
git clone https://github.com/GreenSheep01201/claw-empire.git
cd claw-empire
git submodule update --init --recursive
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

### 第 2 步：验证安装结果

macOS/Linux:

```bash
# 关键文件检查
[ -f .env ] && [ -f scripts/setup.mjs ] && echo "setup files ok"

# 检查 AGENTS 编排规则
grep -R "BEGIN claw-empire orchestration rules" ~/.openclaw/workspace/AGENTS.md AGENTS.md 2>/dev/null || true
grep -R "INBOX_SECRET_DISCOVERY_V2" ~/.openclaw/workspace/AGENTS.md AGENTS.md 2>/dev/null || true

# 检查 OpenClaw inbox 必要 .env 项
grep -E '^(INBOX_WEBHOOK_SECRET|OPENCLAW_CONFIG)=' .env || true
```

Windows PowerShell:

```powershell
if ((Test-Path .\.env) -and (Test-Path .\scripts\setup.mjs)) { "setup files ok" }
$agentCandidates = @("$env:USERPROFILE\.openclaw\workspace\AGENTS.md", ".\AGENTS.md")
$agentCandidates | ForEach-Object { if (Test-Path $_) { Select-String -Path $_ -Pattern "BEGIN claw-empire orchestration rules" } }
$agentCandidates | ForEach-Object { if (Test-Path $_) { Select-String -Path $_ -Pattern "INBOX_SECRET_DISCOVERY_V2" } }

# 检查 OpenClaw inbox 必要 .env 项
Get-Content .\.env | Select-String -Pattern '^(INBOX_WEBHOOK_SECRET|OPENCLAW_CONFIG)='
```

### 第 3 步：启动并健康检查

```bash
pnpm dev:local
```

在另一个终端执行：

```bash
curl -s http://127.0.0.1:8790/healthz
```

期望结果：`{"ok":true,...}`

消息渠道在设置 UI 中配置，并持久化到 SQLite（`settings.messengerChannels`）。`.env` 中的消息令牌/频道变量已不再使用。

### 第 4 步：可选消息渠道 + inbox 验证

```bash
curl -s http://127.0.0.1:8790/api/messenger/sessions
```

将返回设置中保存的消息会话列表。

```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H "content-type: application/json" \
  -H "x-inbox-secret: $INBOX_WEBHOOK_SECRET" \
  -d '{"source":"telegram","author":"ceo","text":"$README v1.1.6 inbox 校验","skipPlannedMeeting":true}'
```

期望结果：

- 服务器已配置 `INBOX_WEBHOOK_SECRET` 且 `x-inbox-secret` 匹配时返回 `200`
- 头缺失或不匹配时返回 `401`
- 服务器未配置 `INBOX_WEBHOOK_SECRET` 时返回 `503`

<a id="direct-messenger-without-openclaw"></a>

### 第 5 步：不依赖 OpenClaw 的消息渠道直连

无需 OpenClaw，也可以仅用 Claw-Empire 直接配置并运行消息渠道。

1. 打开 `Settings > 频道消息`。
2. 点击 `新增聊天`。
3. 选择消息渠道（`telegram`, `whatsapp`, `discord`, `googlechat`, `slack`, `signal`, `imessage`）。
4. 填写会话信息：
   - `名称`（会话标签）
   - 渠道 token/凭证
   - `Channel/Chat ID`（目标）
   - 对话 `Agent` 映射
5. 点击 `确认` 即立即保存（不需要额外“全局保存”）。
6. 启用会话并测试：
   - 普通消息 -> 与映射 Agent 直接对话
   - `$ ...` -> 指令流程

说明：

- 消息会话会保存到 SQLite（`settings.messengerChannels`）。
- 消息渠道 token 在落库时会使用 AES-256-GCM 加密，密钥优先使用 `OAUTH_ENCRYPTION_SECRET`（未设置时回退到 `SESSION_SECRET`），仅在运行时收发阶段解密。
- `.env` 中的消息渠道变量（`TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `SLACK_BOT_TOKEN` 等）不再使用。
- `/api/inbox` + `INBOX_WEBHOOK_SECRET` 仅用于 webhook/inbox 流程（含 OpenClaw bridge）。

---

## 快速开始

### 环境要求

| 工具        | 版本     | 安装方式                            |
| ----------- | -------- | ----------------------------------- |
| **Node.js** | >= 22    | [nodejs.org](https://nodejs.org/)   |
| **pnpm**    | 最新版   | `corepack enable`（Node.js 内置）   |
| **Git**     | 任意版本 | [git-scm.com](https://git-scm.com/) |

### 一键安装（推荐）

| 平台                     | 命令                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **macOS / Linux**        | `git clone https://github.com/GreenSheep01201/claw-empire.git && cd claw-empire && bash install.sh`                                    |
| **Windows (PowerShell)** | `git clone https://github.com/GreenSheep01201/claw-empire.git; cd claw-empire; powershell -ExecutionPolicy Bypass -File .\install.ps1` |

如果仓库已克隆：

| 平台                     | 命令                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **macOS / Linux**        | `git submodule update --init --recursive && bash scripts/openclaw-setup.sh`                                      |
| **Windows (PowerShell)** | `git submodule update --init --recursive; powershell -ExecutionPolicy Bypass -File .\scripts\openclaw-setup.ps1` |

### OpenClaw `.env` 必填项（使用 `/api/inbox` 时）

发送聊天 Webhook 前，请在 `.env` 设置以下两项：

- `INBOX_WEBHOOK_SECRET=<足够长的随机密钥>`
- `OPENCLAW_CONFIG=<openclaw.json 绝对路径>`（推荐不加引号）

`scripts/openclaw-setup.sh` / `scripts/openclaw-setup.ps1` 在 `INBOX_WEBHOOK_SECRET` 缺失时会自动生成。
首次安装（`bash install.sh` / `install.ps1`）同样会执行这些 setup 脚本，因此从第一天开始就自动生效。
对于已克隆仓库仅执行 `git pull` 的场景，`pnpm dev*` / `pnpm start*` 首次运行也会按需自动修复一次，并写入 `CLAW_MIGRATION_V1_0_5_DONE=1` 防止重复执行。

`/api/inbox` 要求服务端 `INBOX_WEBHOOK_SECRET` 与 `x-inbox-secret` 头完全一致。

- 头缺失/不匹配 -> `401`
- 服务端配置缺失（`INBOX_WEBHOOK_SECRET`） -> `503`

### 手动安装（备用）

<details>
<summary><b>macOS / Linux</b></summary>

```bash
# 1. 克隆仓库
git clone https://github.com/GreenSheep01201/claw-empire.git
cd claw-empire

# 2. 通过 corepack 启用 pnpm
corepack enable

# 3. 安装依赖
pnpm install

# 4. 创建本地环境文件
cp .env.example .env

# 5. 生成随机加密密钥
node -e "
  const fs = require('fs');
  const crypto = require('crypto');
  const p = '.env';
  const content = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, content.replace('__CHANGE_ME__', crypto.randomBytes(32).toString('hex')));
"

# 6. 设置 AGENTS.md 编排规则（教 AI 代理成为 Claw-Empire 项目经理）
pnpm setup -- --port 8790

# 7. 启动开发服务器
pnpm dev:local
```

</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
# 1. 克隆仓库
git clone https://github.com/GreenSheep01201/claw-empire.git
cd claw-empire

# 2. 通过 corepack 启用 pnpm
corepack enable

# 3. 安装依赖
pnpm install

# 4. 创建本地环境文件
Copy-Item .env.example .env

# 5. 生成随机加密密钥
node -e "const fs=require('fs');const crypto=require('crypto');const p='.env';const c=fs.readFileSync(p,'utf8');fs.writeFileSync(p,c.replace('__CHANGE_ME__',crypto.randomBytes(32).toString('hex')))"

# 6. 设置 AGENTS.md 编排规则（教 AI 代理成为 Claw-Empire 项目经理）
pnpm setup -- --port 8790

# 7. 启动开发服务器
pnpm dev:local
```

</details>

### AGENTS.md 设置

`pnpm setup` 命令将 **CEO 指令编排规则** 注入到 AI 代理的 `AGENTS.md` 文件中。这使 AI 编程代理（Claude Code、Codex 等）能够：

- 解析 `$` 前缀 **CEO 指令**，进行优先任务委派
- 调用 Claw-Empire REST API 创建任务、分配代理、报告状态
- 在独立的 git worktree 环境中进行安全的并行开发

```bash
# 默认：自动检测 AGENTS.md 位置
pnpm setup

# 自定义路径
pnpm setup -- --agents-path /path/to/your/AGENTS.md

# 自定义端口
pnpm setup -- --port 8790
```

<a id="openclaw-integration"></a>

### OpenClaw 集成设置（Telegram/WhatsApp/Discord/Google Chat/Slack/Signal/iMessage）

`install.sh` / `install.ps1`（或 `scripts/openclaw-setup.*`）会在可用时自动检测并写入 `OPENCLAW_CONFIG` 到 `.env`。

推荐 `.env` 形式：`OPENCLAW_CONFIG` 使用绝对路径（推荐不加引号）。
`v1.0.5` 为兼容性也支持在运行时规范化外层引号与前导 `~`。

默认路径：

| OS                | 路径                                    |
| ----------------- | --------------------------------------- |
| **macOS / Linux** | `~/.openclaw/openclaw.json`             |
| **Windows**       | `%USERPROFILE%\.openclaw\openclaw.json` |

手动命令：

```bash
# macOS / Linux
bash scripts/openclaw-setup.sh --openclaw-config ~/.openclaw/openclaw.json
```

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File .\scripts\openclaw-setup.ps1 -OpenClawConfig "$env:USERPROFILE\.openclaw\openclaw.json"
```

会话验证：

```bash
curl -s http://127.0.0.1:8790/api/gateway/targets
```

<a id="dollar-command-logic"></a>

### `$` 命令的 OpenClaw 聊天委托逻辑

当聊天消息以 `$` 开头时，Claw-Empire 会将其作为 CEO 指令处理：

1. 编排器先询问是否召开组长会议。
2. 编排器会再确认项目路径/上下文（`project_path` 或 `project_context`）。
3. 将带 `$` 前缀的消息携带 `x-inbox-secret` 头发送到 `POST /api/inbox`。
4. 若跳过会议，则附带 `"skipPlannedMeeting": true`。
5. 服务器按 `directive` 存储并全员广播，然后委派给企划组（以及被提及的部门）。

若 `x-inbox-secret` 缺失，或与 `INBOX_WEBHOOK_SECRET` 不一致，服务器将返回 `401`。
若服务端未配置 `INBOX_WEBHOOK_SECRET`，服务器将返回 `503`。

召开会议：

```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H "content-type: application/json" \
  -H "x-inbox-secret: $INBOX_WEBHOOK_SECRET" \
  -d '{"source":"telegram","author":"ceo","text":"$请在周五前完成带 QA 签核的 v0.2 发布","project_path":"/workspace/my-project"}'
```

跳过会议：

```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H "content-type: application/json" \
  -H "x-inbox-secret: $INBOX_WEBHOOK_SECRET" \
  -d '{"source":"telegram","author":"ceo","text":"$立即修复生产环境登录故障","skipPlannedMeeting":true,"project_context":"之前在做的 climpire 项目"}'
```

在浏览器中打开：

| URL                             | 描述                    |
| ------------------------------- | ----------------------- |
| `http://127.0.0.1:8800`         | 前端（Vite 开发服务器） |
| `http://127.0.0.1:8790/healthz` | API 健康检查            |

---

## 环境变量

将 `.env.example` 复制为 `.env`。所有密钥均保存在本地，切勿提交 `.env` 文件。

| 变量                                | 是否必填                     | 描述                                                                   |
| ----------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `OAUTH_ENCRYPTION_SECRET`           | **必填**                     | 用于以 AES-256-GCM 加密 SQLite 中的 OAuth 令牌与消息渠道 token         |
| `SESSION_SECRET`                    | 回退                         | 仅在未设置 `OAUTH_ENCRYPTION_SECRET` 时使用的兼容回退密钥              |
| `PORT`                              | 否                           | 服务器端口（默认：`8790`）                                             |
| `HOST`                              | 否                           | 绑定地址（默认：`127.0.0.1`）                                          |
| `API_AUTH_TOKEN`                    | 推荐                         | 非 loopback API/WebSocket 访问使用的 Bearer 令牌                       |
| `INBOX_WEBHOOK_SECRET`              | **使用 `/api/inbox` 时必填** | 必须与 `x-inbox-secret` 请求头一致的共享密钥                           |
| `OPENCLAW_CONFIG`                   | 使用 OpenClaw 时推荐         | 网关目标发现/聊天转发使用的 `openclaw.json` 绝对路径                   |
| `DB_PATH`                           | 否                           | SQLite 数据库路径（默认：`./claw-empire.sqlite`）                      |
| `LOGS_DIR`                          | 否                           | 日志目录（默认：`./logs`）                                             |
| `OAUTH_GITHUB_CLIENT_ID`            | 否                           | GitHub OAuth 应用客户端 ID                                             |
| `OAUTH_GITHUB_CLIENT_SECRET`        | 否                           | GitHub OAuth 应用客户端密钥                                            |
| `OAUTH_GOOGLE_CLIENT_ID`            | 否                           | Google OAuth 客户端 ID                                                 |
| `OAUTH_GOOGLE_CLIENT_SECRET`        | 否                           | Google OAuth 客户端密钥                                                |
| `OPENAI_API_KEY`                    | 否                           | OpenAI API 密钥（用于 Codex）                                          |
| `REVIEW_MEETING_ONESHOT_TIMEOUT_MS` | 否                           | 会议 one-shot 超时（毫秒）。默认 `65000`，向后兼容：`<= 600` 按秒解释  |
| `UPDATE_CHECK_ENABLED`              | 否                           | 启用应用内更新检查横幅（默认 `1`，设为 `0` 可关闭）                    |
| `UPDATE_CHECK_REPO`                 | 否                           | 更新检查使用的 GitHub 仓库标识（默认：`GreenSheep01201/claw-empire`）  |
| `UPDATE_CHECK_TTL_MS`               | 否                           | 更新检查缓存 TTL（毫秒，默认：`1800000`）                              |
| `UPDATE_CHECK_TIMEOUT_MS`           | 否                           | GitHub 请求超时（毫秒，默认：`4000`）                                  |
| `AUTO_UPDATE_ENABLED`               | 否                           | 当 `settings.autoUpdateEnabled` 缺失时使用的自动更新默认值（默认 `0`） |

启用 `API_AUTH_TOKEN` 后，远程浏览器客户端会在运行时输入令牌。该令牌仅保存在 `sessionStorage`，不会嵌入 Vite 构建产物。
`OPENCLAW_CONFIG` 建议使用绝对路径；在 `v1.0.5` 中，外层引号和前导 `~` 也会自动规范化。

---

## 运行模式

```bash
# 开发模式（仅本地，推荐）
pnpm dev:local          # 绑定到 127.0.0.1

# 开发模式（网络可访问）
pnpm dev                # 绑定到 0.0.0.0

# 生产构建
pnpm build              # TypeScript 检查 + Vite 构建
pnpm start              # 启动 API/后端服务（生产模式下会提供 dist）

# 健康检查
curl -fsS http://127.0.0.1:8790/healthz
```

### CI 校验（当前 PR 流水线）

每个 Pull Request 都会执行 `.github/workflows/ci.yml`，顺序如下：

1. 工作流文件隐藏/双向 Unicode 守卫
2. `pnpm install --frozen-lockfile`
3. `pnpm run format:check`
4. `pnpm run lint`
5. `pnpm exec playwright install --with-deps`
6. `pnpm run test:ci`（`test:web --coverage` + `test:api --coverage` + `test:e2e`）

PR 前本地建议校验：

```bash
pnpm run format:check
pnpm run lint
pnpm run build
pnpm run test:ci
```

### 通信 QA 检查（v1.1.6）

```bash
# 单项检查
pnpm run test:comm:llm
pnpm run test:comm:oauth
pnpm run test:comm:api

# 集成检查（含兼容旧入口）
pnpm run test:comm:suite
pnpm run test:comm-status
```

`test:comm:suite` 会将机器可读证据写入 `logs/`，并将汇总报告写入 `docs/`。

### 项目路径 QA 冒烟（v1.1.6）

```bash
# 需要 API 认证令牌
QA_API_AUTH_TOKEN="<API_AUTH_TOKEN>" pnpm run test:qa:project-path
```

`test:qa:project-path` 用于验证路径辅助 API、项目创建流程、重复 `project_path` 冲突响应和清理行为。

### 应用内更新横幅

当 GitHub 发布了更高版本时，Claw-Empire 会在 UI 顶部显示包含 pull 操作说明和发布说明链接的横幅。

- Windows PowerShell: `git pull; pnpm install`
- macOS/Linux shell: `git pull && pnpm install`
- pull/install 后请重启服务。

### 自动更新（安全模式，按需开启）

若要自动同步版本，请在 Settings 中启用 `Auto Update (Global)`。

- `GET /api/update-auto-status` — 查看自动更新运行态/配置态（**需要认证**）
- `POST /api/update-auto-config` — 无需重启即可即时更新自动更新开关（`enabled`，**需要认证**）
- `POST /api/update-apply` — 按需执行更新流程（支持 `dry_run` / `force` / `force_confirm`，**需要认证**）
  - `dirty_worktree`、`channel_check_unavailable` 守卫不可被 `force` 覆盖。

默认行为仍为 **OFF**。若 `AUTO_UPDATE_CHANNEL` 配置非法，服务端会记录告警并回退到 `patch`。

---

<a id="cli-提供商配置"></a>

## 提供商配置（CLI / OAuth / API）

Claw-Empire 支持三种提供商接入路径：

- **CLI 工具** — 安装本地 CLI 并通过本地进程执行任务
- **OAuth 账号** — 通过安全令牌交换连接受支持提供商
- **直接 API Key** — 在 **设置 > API** 选项卡绑定外部 LLM API

若使用 CLI 模式，请至少安装其中一款：

| 提供商                                                        | 安装方式                             | 认证                              |
| ------------------------------------------------------------- | ------------------------------------ | --------------------------------- |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `npm i -g @anthropic-ai/claude-code` | `claude`（按提示操作）            |
| [Codex CLI](https://github.com/openai/codex)                  | `npm i -g @openai/codex`             | 在 `.env` 中设置 `OPENAI_API_KEY` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli)     | `npm i -g @google/gemini-cli`        | 通过设置面板进行 OAuth 认证       |
| [OpenCode](https://github.com/opencode-ai/opencode)           | `npm i -g opencode`                  | 按提供商要求配置                  |

在应用内的 **设置 > CLI 工具** 面板中配置提供商和模型。

此外，还可以无需安装 CLI 工具，直接通过 **设置 > API** 选项卡将代理连接到外部 LLM API。API 密钥以加密形式（AES-256-GCM）存储在本地 SQLite 数据库中，不会保存在 `.env` 或源代码中。
技能学习/取消学习自动化目前面向具备 CLI 连接能力的提供商。

---

## 项目结构

```
claw-empire/
├── .github/
│   └── workflows/
│       └── ci.yml             # PR CI（Unicode 守卫、format、lint、test）
├── server/
│   ├── index.ts              # 后端入口
│   ├── server-main.ts        # 运行时装配/启动
│   ├── modules/              # routes/workflow/bootstrap lifecycle
│   ├── test/                 # 后端测试配置/辅助
│   └── vitest.config.ts      # 后端单测配置
├── src/
│   ├── app/                  # 应用外壳、布局、状态编排
│   ├── api/                  # 前端 API 模块
│   ├── components/           # UI（office/taskboard/chat/settings）
│   ├── hooks/                # polling/websocket hooks
│   ├── test/                 # 前端测试配置
│   ├── types/                # 前端类型定义
│   ├── App.tsx
│   ├── api.ts
│   └── i18n.ts
├── tests/
│   └── e2e/                  # Playwright E2E 场景
├── public/sprites/           # 像素风代理精灵图
├── scripts/
│   ├── setup.mjs             # 环境/启动配置
│   ├── auto-apply-v1.0.5.mjs # 启动时迁移辅助
│   ├── openclaw-setup.sh     # 一键安装（macOS/Linux）
│   ├── openclaw-setup.ps1    # 一键安装（Windows PowerShell）
│   ├── prepare-e2e-runtime.mjs
│   ├── preflight-public.sh   # 发布前安全检查
│   └── generate-architecture-report.mjs
├── install.sh                # scripts/openclaw-setup.sh 包装脚本
├── install.ps1               # scripts/openclaw-setup.ps1 包装脚本
├── docs/                     # 设计与架构文档
├── AGENTS.md                 # 本地代理/编排规则
├── CONTRIBUTING.md           # 分支/PR/评审策略
├── eslint.config.mjs         # Flat ESLint 配置
├── .env.example              # 环境变量模板
└── package.json
```

---

## 安全性

Claw-Empire 在设计上充分考虑了安全性：

- **本地优先架构** — 所有数据本地存储于 SQLite，无需外部云服务
- **加密 OAuth + 消息渠道令牌** — 用户 OAuth 令牌与消息渠道 token **仅存储在服务器端 SQLite** 中，使用 AES-256-GCM + `OAUTH_ENCRYPTION_SECRET`（`SESSION_SECRET` 回退）加密。浏览器永远不会接收刷新令牌
- **内置 OAuth Client ID** — 源代码中嵌入的 GitHub 和 Google OAuth client ID/secret 是**公开的 OAuth 应用凭据**，而非用户密钥。根据 [Google 文档](https://developers.google.com/identity/protocols/oauth2/native-app)，安装型/桌面应用的 client secret "不被视为密钥"。这是开源应用（VS Code、Thunderbird、GitHub CLI 等）的标准做法。这些凭据仅用于标识应用本身，您的个人令牌始终单独加密
- **源代码中无个人凭据** — 所有用户特定令牌（GitHub、Google OAuth）均加密存储在本地 SQLite 数据库中，不会出现在源代码中
- **仓库中无密钥** — 全面的 `.gitignore` 配置屏蔽 `.env`、`*.pem`、`*.key`、`credentials.json` 等敏感文件
- **发布前安全检查** — 在任何公开发布前运行 `pnpm run preflight:public`，扫描工作区和 git 历史中泄露的密钥
- **默认绑定本地** — 开发服务器绑定到 `127.0.0.1`，不对外网暴露

## API 文档与安全策略速览

- **API 文档** — 接口概览/使用说明见 [`docs/api.md`](docs/api.md)，Schema 与工具集成见 [`docs/openapi.json`](docs/openapi.json)。
- **安全策略** — 漏洞提交流程与安全策略见 [`SECURITY.md`](SECURITY.md)，公开发布前建议执行 `pnpm run preflight:public`。

---

## 参与贡献

欢迎贡献！请遵循以下步骤：

1. Fork 本仓库
2. 基于 `dev` 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 提交您的更改（`git commit -m 'Add amazing feature'`）
4. PR 前请先完成本地校验：
   - `pnpm run format:check`
   - `pnpm run lint`
   - `pnpm run build`
   - `pnpm run test:ci`
5. 推送到分支（`git push origin feature/amazing-feature`）
6. Pull Request 默认请提交到 `dev` 分支（外部贡献集成分支）
7. `main` 仅用于维护者批准的紧急 hotfix，随后必须执行 `main -> dev` 回合并

完整策略：[`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## 许可证

[Apache 2.0](LICENSE) — 个人和商业用途均可免费使用。

---

<div align="center">

**以像素为笔，以热情为墨。**

_Claw-Empire — AI 代理的工作天地。_

</div>
