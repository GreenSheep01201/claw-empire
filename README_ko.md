<p align="center">
  <img src="public/claw-empire.svg" width="80" alt="Claw-Empire" />
</p>

<h1 align="center">Claw-Empire</h1>

<p align="center">
  <strong>CEO 데스크에서 AI 에이전트 제국을 지휘하세요</strong><br>
  <b>CLI</b>, <b>OAuth</b>, <b>API 연동</b> 프로바이더(예: <b>Claude Code</b>, <b>Codex CLI</b>, <b>Gemini CLI</b>, <b>OpenCode</b>, <b>GitHub Copilot</b>, <b>Antigravity</b>)를 하나의 자율 에이전트 가상 회사로 운영하는 로컬 퍼스트 AI 에이전트 오피스 시뮬레이터
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
  <a href="#빠른-시작">빠른 시작</a> &middot;
  <a href="#ai-installation-guide">AI 설치 가이드</a> &middot;
  <a href="docs/releases/v2.0.1.md">릴리즈 노트</a> &middot;
  <a href="#openclaw-integration">OpenClaw 연동</a> &middot;
  <a href="#direct-messenger-without-openclaw">직접 메신저</a> &middot;
  <a href="#dollar-command-logic">$ 명령 로직</a> &middot;
  <a href="#주요-기능">주요 기능</a> &middot;
  <a href="#스크린샷">스크린샷</a> &middot;
  <a href="#기술-스택">기술 스택</a> &middot;
  <a href="#cli-프로바이더-설정">프로바이더</a> &middot;
  <a href="#보안">보안</a>
</p>

<p align="center">
  <a href="README.md">English</a> | <b>한국어</b> | <a href="README_jp.md">日本語</a> | <a href="README_zh.md">中文</a>
</p>

<p align="center">
  <img src="Sample_Img/Office.png" alt="Office View" width="100%" />
</p>

---

## Claw-Empire란?

Claw-Empire는 **CLI**, **OAuth**, **직접 API 키** 방식으로 연결된 AI 코딩 어시스턴트들을 완전한 **가상 소프트웨어 회사**로 탈바꿈시킵니다. 당신은 CEO입니다. AI 에이전트들은 당신의 직원입니다. 에이전트들이 부서 간 협업하고, 회의를 열고, 업무를 완수하며, 레벨업하는 모습을 아기자기한 픽셀 아트 오피스 화면으로 직접 확인하세요.

### 왜 Claw-Empire인가?

- **하나의 인터페이스, 다양한 AI 에이전트** — CLI/OAuth/API 기반 에이전트를 단일 대시보드에서 관리
- **로컬 퍼스트 & 프라이버시 보장** — 모든 데이터는 내 PC에. SQLite 데이터베이스, 클라우드 의존성 없음
- **시각적이고 직관적** — 픽셀 아트 오피스 뷰가 AI 오케스트레이션을 즐겁고 투명하게 만들어줌
- **진정한 자율 협업** — 에이전트들이 독립된 git worktree에서 작업하고, 회의에 참석하며, 결과물을 생산

---

## AI로 설치하기

> **아래 내용을 AI 코딩 에이전트(Claude Code, Codex, Gemini CLI 등)에 붙여넣기만 하세요:**
>
> ```
> Install Claw-Empire following the guide at:
> https://github.com/GreenSheep01201/claw-empire
> ```
>
> AI가 이 README를 읽고 모든 것을 자동으로 처리합니다.

---

## 최신 릴리즈 (v2.0.1)

- **오피스팩 부서 우선순위 hydration 연동** - `development` 외 팩은 hydration 전에는 pack profile(부서명/아이콘)을 우선 표시하고, hydration 완료 후에는 DB 메타데이터를 우선 사용합니다.
- **첫 설치자 초기 진입 보호** - 신규 설치 직후 DB hydration 이전에도 pack profile 기본값을 먼저 보여 초기 사용자가 팩 구성을 바로 확인할 수 있습니다.
- **병합 규칙 회귀 테스트 강화** - hydration 전/후 우선순위 전환과 타 팩 seed 에이전트 숨김 조건을 테스트로 고정했습니다.
- **Discord 토큰 기반 채널 자동 조회** - Discord Bot 토큰으로 길드/텍스트 채널을 자동 조회하는 API를 추가하고 `Bot <token>`/원문 토큰 입력을 모두 지원합니다.
- **설정 모달 자동 완성 UX 추가** - Discord 토큰 입력 시 채널 목록을 자동 로드하고, 선택한 채널의 대상 ID/기본 표시명을 자동 반영합니다.
- **Discord 수신기(양방향) 추가** - Discord 채널 폴링 수신기를 추가해 사용자가 보낸 메시지를 `/api/inbox`로 전달하며, 봇 메시지는 루프 방지를 위해 건너뜁니다.
- **수신 상태 가시성 강화** - `Discord 수신기` 상태 API/패널을 추가해 활성 여부, 폴링 채널 수, 마지막 오류를 설정 화면에서 바로 확인할 수 있습니다.
- **Discord 멀티 토큰 수신 격리** - 같은 채널 ID를 여러 토큰이 공유해도 토큰키+채널 기준으로 커서를 분리해 교차 라우팅을 방지합니다.
- **다국어 안내/오류 문구 보강** - Discord 채널 조회 로딩, 조회 결과, 인증 실패, 레이트리밋, 일반 실패 메시지를 KO/EN/JA/ZH로 제공하도록 정리했습니다.
- **Discord 경로 회귀 테스트 확장** - 채널 조회/인증 실패, 수신기 포워딩, 봇 메시지 필터링, 멀티 토큰 source 힌트, UI 자동 조회 동작 테스트를 추가했습니다.

- 상세 문서: [`docs/releases/v2.0.1.md`](docs/releases/v2.0.1.md)
- API 문서: [`docs/api.md`](docs/api.md), [`docs/openapi.json`](docs/openapi.json)
- 보안 정책: [`SECURITY.md`](SECURITY.md)

## 오피스팩 프로필 (v2.0.1)

오피스팩마다 협업 구조, 이름 시드, 워크플로우 성향이 다르게 적용됩니다.

| 팩 | 핵심 초점 | 대표 조직 구성 |
| --- | --- | --- |
| `development` (`DEV`) | 하위 호환을 유지하는 기본 개발 기준선 | 기획 / 개발 / 디자인 / QA-QC / DevSecOps / 운영 |
| `report` (`RPT`) | 정형 보고서와 문서 산출물 제작 | 편집기획실, 리서치엔진팀, 문서디자인팀, 검수팀 |
| `web_research_report` (`WEB`) | 출처 수집과 인용/근거 검증 중심 리서치 | 조사전략실, 크롤링팀, 팩트체크팀 |
| `novel` (`NOV`) | 세계관·서사·문체 일관성 중심 집필 | 세계관실, 서사엔진팀, 캐릭터 아트팀, 톤 검수팀 |
| `video_preprod` (`VID`) | 콘셉트/대본/샷리스트/편집노트 중심 프리프로덕션 | 프리프로덕션팀, 씬 엔진팀, 아트/촬영팀, 컷 검수팀 |
| `roleplay` (`RPG`) | 캐릭터 몰입형 대사 연기와 설정 일관성 | 캐릭터기획실, 대사엔진팀, 연출아트팀, 캐릭터검수팀 |

## 스크린샷

<table>
<tr>
<td width="50%">

**대시보드** — 실시간 KPI 지표, 에이전트 랭킹, 부서 현황을 한눈에

<img src="Sample_Img/Dashboard.png" alt="Dashboard" width="100%" />
</td>
<td width="50%">

**칸반 보드** — 부서 및 에이전트 필터가 적용된 드래그 앤 드롭 태스크 관리

<img src="Sample_Img/Kanban.png" alt="Kanban Board" width="100%" />
</td>
</tr>
<tr>
<td width="50%">

**스킬 라이브러리** — 카테고리별로 분류된 600개 이상의 에이전트 스킬 탐색 및 배정

<img src="Sample_Img/Skills.png" alt="Skills Library" width="100%" />
</td>
<td width="50%">

**멀티 프로바이더 CLI** — Claude Code, Codex, Gemini CLI, OpenCode를 모델 선택과 함께 설정

<img src="Sample_Img/CLI.png" alt="CLI Tools Settings" width="100%" />
</td>
</tr>
<tr>
<td width="50%">

**OAuth 연동** — 암호화된 토큰 저장소가 적용된 안전한 GitHub & Google OAuth

<img src="Sample_Img/OAuth.png" alt="OAuth Settings" width="100%" />
</td>
<td width="50%">

**회의록** — 다중 라운드 검토 승인이 포함된 AI 생성 회의 요약

<img src="Sample_Img/Meeting_Minutes.png" alt="Meeting Minutes" width="100%" />
</td>
</tr>
<tr>
<td width="50%">

**메신저 연동** — Telegram, WhatsApp, Discord, Google Chat, Slack, Signal, iMessage 세션을 설정하고 `$` CEO 디렉티브를 전송합니다

<img src="Sample_Img/telegram.png" alt="Messenger Integration" width="100%" />
</td>
<td width="50%">

**설정** — 회사명, CEO 이름, 기본 프로바이더 선호(CLI/OAuth/API), 언어 등 환경 설정

<img src="Sample_Img/Setting.png" alt="Settings" width="100%" />
</td>
</tr>
<tr>
<td width="50%">

**상세 리포트** — 요청 완료 후 보고 팝업, 보고서 이력, 상세 리포트 확인 화면 예시

<img src="Sample_Img/Report.png" alt="Detailed Report" width="100%" />
</td>
<td width="50%">

**PPT 생성 예시** — 보고 요청 기반 PPT 생성 결과 화면 예시

<p align="center">
  <img src="Sample_Img/PPT_Gen0.png" alt="PPT Generation Example 0" width="49%" />
  <img src="Sample_Img/PPT_Gen1.png" alt="PPT Generation Example 1" width="49%" />
</p>
</td>
</tr>
</table>

### 영상 출력 예시

인트로 영상 출력 샘플 미리보기:

<p align="center">
  <video src="Sample_Img/claw-empire-intro.mp4" controls muted playsinline width="100%"></video>
</p>

- 파일 바로가기: [`Sample_Img/claw-empire-intro.mp4`](Sample_Img/claw-empire-intro.mp4)

### PPT 샘플 소스

보고서 기반 PPT 생성 기능을 참고하거나 확장할 때 아래 샘플 소스를 활용할 수 있습니다.
사용 경로: **채팅창 > 보고 요청 버튼** 클릭 후 요청 내용을 입력하세요.

- 폴더: [`docs/reports/Sample_Slides`](docs/reports/Sample_Slides)
- 샘플 덱(`.pptx`): [`docs/reports/PPT_Sample.pptx`](docs/reports/PPT_Sample.pptx)
- HTML 슬라이드: [`slide-01.html`](docs/reports/Sample_Slides/slide-01.html), [`slide-02.html`](docs/reports/Sample_Slides/slide-02.html), [`slide-03.html`](docs/reports/Sample_Slides/slide-03.html), [`slide-04.html`](docs/reports/Sample_Slides/slide-04.html), [`slide-05.html`](docs/reports/Sample_Slides/slide-05.html), [`slide-06.html`](docs/reports/Sample_Slides/slide-06.html), [`slide-07.html`](docs/reports/Sample_Slides/slide-07.html), [`slide-08.html`](docs/reports/Sample_Slides/slide-08.html), [`slide-09.html`](docs/reports/Sample_Slides/slide-09.html)
- 빌드 스크립트: [`build-pptx.mjs`](docs/reports/Sample_Slides/build-pptx.mjs), [`build-pptx.cjs`](docs/reports/Sample_Slides/build-pptx.cjs), [`html2pptx.cjs`](docs/reports/Sample_Slides/html2pptx.cjs)

---

## 주요 기능

| 기능                         | 설명                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **픽셀 아트 오피스**         | 6개 부서에 걸쳐 에이전트들이 이동, 업무, 회의를 진행하는 애니메이션 오피스 뷰                                                     |
| **워크플로우 팩 프로필**     | `development`, `report`, `web_research_report`, `novel`, `video_preprod`, `roleplay` 6종 내장 팩별로 라우팅 스키마, QA 규칙, 출력 템플릿을 다르게 적용 |
| **오피스 팩 프로필**         | 팩별 전용 부서 토폴로지, 이름/테마 시드 프리셋, 직원·부서 데이터 분리 운영을 지원 (개발 팩은 기존 DB 기준선 유지)               |
| **칸반 태스크 보드**         | Inbox, Planned, Collaborating, In Progress, Review, Done — 드래그 앤 드롭이 가능한 완전한 태스크 생애주기 관리                    |
| **CEO 채팅 & 디렉티브**      | 팀 리더와의 직접 소통; `$` 디렉티브에서 회의 여부와 작업 경로/컨텍스트(`project_path`, `project_context`) 기반 지시 지원          |
| **멀티 프로바이더 지원**     | Claude Code, Codex CLI, Gemini CLI, OpenCode, Antigravity — 하나의 대시보드에서 모두 관리                                         |
| **외부 API 프로바이더**      | 설정 > API 탭에서 에이전트를 외부 LLM API(OpenAI, Anthropic, Google, Ollama, OpenRouter, Together, Groq, Cerebras, 커스텀)에 연결 |
| **OAuth 연동**               | 로컬 SQLite에 AES 암호화된 토큰 저장을 사용하는 GitHub & Google OAuth                                                             |
| **실시간 WebSocket**         | 실시간 상태 업데이트, 활동 피드, 에이전트 상태 동기화                                                                             |
| **활성 에이전트 제어**       | 작업 중 에이전트 상태(프로세스/활동/유휴) 확인 및 멈춘 태스크 강제 중지                                                           |
| **작업 보고서 시스템**       | 완료 팝업, 보고서 이력, 팀별 보고 드릴다운, 기획팀장 최종 취합 아카이브                                                           |
| **직원관리**                 | 직원 채용·수정·삭제, 다국어 이름, 부서·직급·프로바이더 선택 및 성격 설정 지원                                                     |
| **에이전트 랭킹 & XP**       | 완료된 태스크로 XP를 획득하는 에이전트; 랭킹 보드에서 상위 성과자 추적                                                            |
| **스킬 라이브러리**          | 카테고리별로 정리된 600개 이상의 스킬 (Frontend, Backend, Design, AI, DevOps, Security 등), 커스텀 스킬 업로드 지원               |
| **회의 시스템**              | AI 생성 회의록과 다중 라운드 검토가 포함된 계획 및 임시 회의                                                                      |
| **Git Worktree 격리**        | 각 에이전트는 독립된 git 브랜치에서 작업하며 CEO 승인 시에만 병합                                                                 |
| **다국어 UI**                | 한국어, 영어, 일본어, 중국어 — 자동 감지 또는 수동 설정                                                                           |
| **메신저 연동**              | Telegram, Discord, Slack 등 — 내장 직접 채널 세션으로 `$` CEO 디렉티브 전송 및 태스크 업데이트 수신 (OpenClaw 선택 연동)          |
| **PowerPoint 내보내기**      | 회의록과 보고서로부터 프레젠테이션 슬라이드 생성                                                                                  |
| **통신 QA 스크립트**         | `test:comm:*` 스크립트로 CLI/OAuth/API 통신 상태를 재시도/증거 로그와 함께 검증                                                   |
| **인앱 업데이트 알림**       | GitHub 최신 릴리즈를 확인해 새 버전이 있으면 상단 배너로 OS별 `git pull` 안내와 릴리즈 노트 링크 제공                             |
| **부서 관리**                | 기획, 개발, 디자인, QA/QC, DevSecOps, 운영 — 전용 관리 탭에서 화살표/드래그앤드롭 순번 편집 가능                                  |
| **직원 직접선택**            | 프로젝트에 특정 직원을 지정하면 회의 및 업무 위임 시 해당 직원만 대상으로 운영                                                    |
| **스프라이트 등록 안전장치** | 중복 스프라이트 번호 파일 덮어쓰기 방지 (`409 sprite_number_exists` 응답)                                                         |
| **커스텀 스킬 업로드**       | UI에서 `.md` 스킬 파일을 업로드하여 CLI 대표자에게 커스텀 스킬을 학습시키며, 칠판 교실 애니메이션과 관리 인터페이스 제공          |

---

## 기술 스택

| 레이어             | 기술                                                |
| ------------------ | --------------------------------------------------- |
| **Frontend**       | React 19 + Vite 7 + Tailwind CSS 4 + TypeScript 5.9 |
| **픽셀 아트 엔진** | PixiJS 8                                            |
| **Backend**        | Express 5 + SQLite (설정 없는 내장 DB)              |
| **실시간 통신**    | WebSocket (ws)                                      |
| **유효성 검사**    | Zod 4                                               |
| **아이콘**         | Lucide React                                        |
| **라우팅**         | React Router 7                                      |
| **내보내기**       | PptxGenJS (PowerPoint 생성)                         |

<a id="ai-installation-guide">
## AI 설치 가이드

> 이 섹션은 AI 코딩 에이전트용입니다. 각 단계마다 검증 명령을 실행한 후 다음 단계로 진행하세요.

### 0단계: 사전 조건 확인

```bash
# Node.js 22+
node -v

# pnpm (없다면 corepack 활성화)
pnpm -v || corepack enable

# git
git --version
```

### 1단계: 클론 후 원클릭 셋업 실행

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

### 2단계: 셋업 결과 검증

macOS/Linux:

```bash
# 필수 파일 확인
[ -f .env ] && [ -f scripts/setup.mjs ] && echo "setup files ok"

# AGENTS 오케스트레이션 규칙 확인
grep -R "BEGIN claw-empire orchestration rules" ~/.openclaw/workspace/AGENTS.md AGENTS.md 2>/dev/null || true
grep -R "INBOX_SECRET_DISCOVERY_V2" ~/.openclaw/workspace/AGENTS.md AGENTS.md 2>/dev/null || true

# OpenClaw inbox 필수 .env 항목 확인
grep -E '^(INBOX_WEBHOOK_SECRET|OPENCLAW_CONFIG)=' .env || true
```

Windows PowerShell:

```powershell
if ((Test-Path .\.env) -and (Test-Path .\scripts\setup.mjs)) { "setup files ok" }
$agentCandidates = @("$env:USERPROFILE\.openclaw\workspace\AGENTS.md", ".\AGENTS.md")
$agentCandidates | ForEach-Object { if (Test-Path $_) { Select-String -Path $_ -Pattern "BEGIN claw-empire orchestration rules" } }
$agentCandidates | ForEach-Object { if (Test-Path $_) { Select-String -Path $_ -Pattern "INBOX_SECRET_DISCOVERY_V2" } }

# OpenClaw inbox 필수 .env 항목 확인
Get-Content .\.env | Select-String -Pattern '^(INBOX_WEBHOOK_SECRET|OPENCLAW_CONFIG)='
```

### 3단계: 실행 및 헬스체크

```bash
pnpm dev:local
```

다른 터미널에서:

```bash
curl -s http://127.0.0.1:8790/healthz
```

예상 응답: `{"ok":true,...}`

메신저 채널은 설정 UI에서 등록되며 SQLite(`settings.messengerChannels`)에 저장됩니다. `.env` 기반 메신저 토큰/채널 변수는 더 이상 사용하지 않습니다.

### 4단계: 메신저 + inbox(선택) 검증

```bash
curl -s http://127.0.0.1:8790/api/messenger/sessions
```

설정에 저장된 메신저 세션 목록이 반환됩니다.

```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H "content-type: application/json" \
  -H "x-inbox-secret: $INBOX_WEBHOOK_SECRET" \
  -d '{"source":"telegram","author":"ceo","text":"$README v1.1.5 inbox 점검","skipPlannedMeeting":true}'
```

예상 응답:

- 서버에 `INBOX_WEBHOOK_SECRET`이 설정되어 있고 `x-inbox-secret`이 일치하면 `200`
- 헤더 누락/불일치 시 `401`
- 서버에 `INBOX_WEBHOOK_SECRET`이 미설정이면 `503`

<a id="direct-messenger-without-openclaw"></a>

### 5단계: OpenClaw 없이 메신저 직접 연결

OpenClaw 없이도 Claw-Empire만으로 메신저 채널을 직접 운영할 수 있습니다.

1. `Settings > 채널 메시지`로 이동합니다.
2. `새 채팅 추가`를 누릅니다.
3. 메신저를 선택합니다 (`telegram`, `whatsapp`, `discord`, `googlechat`, `slack`, `signal`, `imessage`).
4. 세션 정보를 입력합니다.
   - `이름` (세션 라벨)
   - 메신저 토큰/인증정보
   - `채널/채팅 ID` (타깃)
   - 대화할 `Agent` 매핑
5. `확인`을 누르면 즉시 저장됩니다 (별도 전체 저장 버튼 불필요).
6. 세션 활성화 후 테스트합니다.
   - 일반 메시지 -> 해당 에이전트와 직접 대화
   - `$ ...` -> 디렉티브 플로우

참고:

- 메신저 세션은 SQLite(`settings.messengerChannels`)에 저장됩니다.
- 메신저 토큰은 SQLite 저장 시 AES-256-GCM으로 암호화되며 `OAUTH_ENCRYPTION_SECRET`(없으면 `SESSION_SECRET`)을 사용합니다. 런타임 송수신 시에만 복호화됩니다.
- `.env` 메신저 변수(`TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `SLACK_BOT_TOKEN` 등)는 사용하지 않습니다.
- `/api/inbox` + `INBOX_WEBHOOK_SECRET`은 웹훅/inbox 연동(OpenClaw 브리지 포함)에만 필요합니다.

---

## 빠른 시작

### 사전 요구사항

| 도구        | 버전  | 설치                                |
| ----------- | ----- | ----------------------------------- |
| **Node.js** | >= 22 | [nodejs.org](https://nodejs.org/)   |
| **pnpm**    | 최신  | `corepack enable` (Node.js에 내장)  |
| **Git**     | 무관  | [git-scm.com](https://git-scm.com/) |

### 원클릭 셋업 (권장)

| 플랫폼                   | 명령어                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **macOS / Linux**        | `git clone https://github.com/GreenSheep01201/claw-empire.git && cd claw-empire && bash install.sh`                                    |
| **Windows (PowerShell)** | `git clone https://github.com/GreenSheep01201/claw-empire.git; cd claw-empire; powershell -ExecutionPolicy Bypass -File .\install.ps1` |

이미 클론되어 있다면:

| 플랫폼                   | 명령어                                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **macOS / Linux**        | `git submodule update --init --recursive && bash scripts/openclaw-setup.sh`                                      |
| **Windows (PowerShell)** | `git submodule update --init --recursive; powershell -ExecutionPolicy Bypass -File .\scripts\openclaw-setup.ps1` |

### OpenClaw `.env` 필수값 (`/api/inbox` 사용 시)

채팅 웹훅 연동 전 `.env`에 아래 두 값을 설정하세요.

- `INBOX_WEBHOOK_SECRET=<충분히 긴 랜덤 시크릿>`
- `OPENCLAW_CONFIG=<openclaw.json 절대경로>` (따옴표 없이 권장)

`scripts/openclaw-setup.sh` / `scripts/openclaw-setup.ps1`는 `INBOX_WEBHOOK_SECRET`이 비어 있으면 자동 생성합니다.
초기 설치(`bash install.sh` / `install.ps1`)도 동일 셋업 스크립트를 거치므로 처음부터 자동 반영됩니다.
이미 클론된 저장소에서 `git pull`만 한 경우에도 `pnpm dev*` / `pnpm start*` 최초 실행 시 필요 조건에서 1회 자동 보정되며, 이후 반복 실행을 막기 위해 `CLAW_MIGRATION_V1_0_5_DONE=1`이 저장됩니다.

`/api/inbox`는 서버 측 `INBOX_WEBHOOK_SECRET` 설정과 `x-inbox-secret` 헤더의 정확한 일치가 필요합니다.

- 헤더 누락/불일치 -> `401`
- 서버 설정 누락(`INBOX_WEBHOOK_SECRET`) -> `503`

### 수동 셋업 (대체 경로)

<details>
<summary><b>macOS / Linux</b></summary>

```bash
# 1. 저장소 클론
git clone https://github.com/GreenSheep01201/claw-empire.git
cd claw-empire

# 2. corepack으로 pnpm 활성화
corepack enable

# 3. 의존성 설치
pnpm install

# 4. 로컬 환경 파일 생성
cp .env.example .env

# 5. 무작위 암호화 시크릿 생성
node -e "
  const fs = require('fs');
  const crypto = require('crypto');
  const p = '.env';
  const content = fs.readFileSync(p, 'utf8');
  fs.writeFileSync(p, content.replace('__CHANGE_ME__', crypto.randomBytes(32).toString('hex')));
"

# 6. AGENTS.md 오케스트레이션 규칙 설정 (AI 에이전트에게 Claw-Empire 프로젝트 매니저 역할을 부여)
pnpm setup -- --port 8790

# 7. 개발 서버 시작
pnpm dev:local
```

</details>

<details>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
# 1. 저장소 클론
git clone https://github.com/GreenSheep01201/claw-empire.git
cd claw-empire

# 2. corepack으로 pnpm 활성화
corepack enable

# 3. 의존성 설치
pnpm install

# 4. 로컬 환경 파일 생성
Copy-Item .env.example .env

# 5. 무작위 암호화 시크릿 생성
node -e "const fs=require('fs');const crypto=require('crypto');const p='.env';const c=fs.readFileSync(p,'utf8');fs.writeFileSync(p,c.replace('__CHANGE_ME__',crypto.randomBytes(32).toString('hex')))"

# 6. AGENTS.md 오케스트레이션 규칙 설정 (AI 에이전트에게 Claw-Empire 프로젝트 매니저 역할을 부여)
pnpm setup -- --port 8790

# 7. 개발 서버 시작
pnpm dev:local
```

</details>

### AGENTS.md 설정

`pnpm setup` 명령은 AI 에이전트의 `AGENTS.md` 파일에 **CEO 디렉티브 오케스트레이션 규칙**을 주입합니다. 이를 통해 AI 코딩 에이전트(Claude Code, Codex 등)가 다음을 수행할 수 있습니다:

- `$` 접두사 **CEO 디렉티브** 해석 및 우선순위 태스크 위임
- Claw-Empire REST API 호출로 태스크 생성, 에이전트 배정, 상태 보고
- 안전한 병렬 개발을 위한 독립 git worktree 환경에서 작업

```bash
# 기본: AGENTS.md 위치 자동 감지
pnpm setup

# 커스텀 경로
pnpm setup -- --agents-path /path/to/your/AGENTS.md

# 커스텀 포트
pnpm setup -- --port 8790
```

<a id="openclaw-integration"></a>

### OpenClaw 연동 셋업 (Telegram/WhatsApp/Discord/Google Chat/Slack/Signal/iMessage)

`install.sh` / `install.ps1` (또는 `scripts/openclaw-setup.*`)은 가능한 경우 `OPENCLAW_CONFIG`를 자동 감지하여 `.env`에 기록합니다.

권장 `.env` 형식: `OPENCLAW_CONFIG`는 절대경로(따옴표 없이 권장).
`v1.0.5`에서는 호환성을 위해 따옴표/선행 `~` 값도 런타임에서 정규화됩니다.

기본 경로:

| OS                | 경로                                    |
| ----------------- | --------------------------------------- |
| **macOS / Linux** | `~/.openclaw/openclaw.json`             |
| **Windows**       | `%USERPROFILE%\.openclaw\openclaw.json` |

수동 실행:

```bash
# macOS / Linux
bash scripts/openclaw-setup.sh --openclaw-config ~/.openclaw/openclaw.json
```

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File .\scripts\openclaw-setup.ps1 -OpenClawConfig "$env:USERPROFILE\.openclaw\openclaw.json"
```

세션 확인:

```bash
curl -s http://127.0.0.1:8790/api/gateway/targets
```

<a id="dollar-command-logic"></a>

### `$` 명령어 기반 OpenClaw 채팅 의뢰 로직

채팅 메시지가 `$`로 시작하면 Claw-Empire는 CEO 디렉티브로 처리합니다.

1. 오케스트레이터가 팀장 회의 진행 여부를 먼저 확인합니다.
2. 오케스트레이터가 작업 프로젝트 경로/컨텍스트(`project_path` 또는 `project_context`)를 확인합니다.
3. `$` 접두사가 포함된 메시지를 `x-inbox-secret` 헤더와 함께 `POST /api/inbox`로 전달합니다.
4. 회의를 생략하면 `"skipPlannedMeeting": true`를 함께 보냅니다.
5. 서버는 이를 `directive`로 저장하고 전체 공지 후 기획팀(및 멘션된 부서)에 위임합니다.

`x-inbox-secret`가 없거나 `INBOX_WEBHOOK_SECRET`와 불일치하면 서버는 `401`을 반환합니다.
서버에 `INBOX_WEBHOOK_SECRET`이 설정되지 않으면 `503`을 반환합니다.

회의 포함:

```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H "content-type: application/json" \
  -H "x-inbox-secret: $INBOX_WEBHOOK_SECRET" \
  -d '{"source":"telegram","author":"ceo","text":"$금요일까지 QA 승인 포함 v0.2 배포 준비","project_path":"/workspace/my-project"}'
```

회의 생략:

```bash
curl -X POST http://127.0.0.1:8790/api/inbox \
  -H "content-type: application/json" \
  -H "x-inbox-secret: $INBOX_WEBHOOK_SECRET" \
  -d '{"source":"telegram","author":"ceo","text":"$프로덕션 로그인 버그 즉시 핫픽스","skipPlannedMeeting":true,"project_context":"기존 작업하던 climpire 프로젝트"}'
```

브라우저에서 접속:

| URL                             | 설명                      |
| ------------------------------- | ------------------------- |
| `http://127.0.0.1:8800`         | Frontend (Vite 개발 서버) |
| `http://127.0.0.1:8790/healthz` | API 헬스 체크             |

---

## 환경 변수

`.env.example`을 `.env`로 복사하세요. 모든 시크릿은 로컬에 저장됩니다 — `.env`는 절대 커밋하지 마세요.

| 변수                                   | 필수 여부                     | 설명                                                                                                                |
| -------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `OAUTH_ENCRYPTION_SECRET`              | **필수**                      | SQLite의 OAuth 토큰 및 메신저 채널 토큰을 AES-256-GCM으로 암호화할 때 사용                                          |
| `SESSION_SECRET`                       | 폴백                          | `OAUTH_ENCRYPTION_SECRET` 미설정 시에만 사용하는 레거시 폴백 키                                                     |
| `PORT`                                 | 선택                          | 서버 포트 (기본값: `8790`)                                                                                          |
| `HOST`                                 | 선택                          | 바인드 주소 (기본값: `127.0.0.1`)                                                                                   |
| `API_AUTH_TOKEN`                       | 권장                          | 루프백 외부 API/WebSocket 접근용 Bearer 토큰                                                                        |
| `INBOX_WEBHOOK_SECRET`                 | **`/api/inbox` 사용 시 필수** | `x-inbox-secret` 헤더와 일치해야 하는 공유 시크릿                                                                   |
| `OPENCLAW_CONFIG`                      | OpenClaw 사용 시 권장         | 게이트웨이 타깃 조회/채팅 릴레이에 사용하는 `openclaw.json` 절대경로                                                |
| `DB_PATH`                              | 선택                          | SQLite 데이터베이스 경로 (기본값: `./claw-empire.sqlite`)                                                           |
| `LOGS_DIR`                             | 선택                          | 로그 디렉토리 (기본값: `./logs`)                                                                                    |
| `OAUTH_GITHUB_CLIENT_ID`               | 선택                          | GitHub OAuth 앱 클라이언트 ID                                                                                       |
| `OAUTH_GITHUB_CLIENT_SECRET`           | 선택                          | GitHub OAuth 앱 클라이언트 시크릿                                                                                   |
| `OAUTH_GOOGLE_CLIENT_ID`               | 선택                          | Google OAuth 클라이언트 ID                                                                                          |
| `OAUTH_GOOGLE_CLIENT_SECRET`           | 선택                          | Google OAuth 클라이언트 시크릿                                                                                      |
| `OPENAI_API_KEY`                       | 선택                          | OpenAI API 키 (Codex용)                                                                                             |
| `REVIEW_MEETING_ONESHOT_TIMEOUT_MS`    | 선택                          | 회의 one-shot 타임아웃(밀리초). 기본값 `65000`, 하위호환으로 `600` 이하 값은 초 단위로 해석                         |
| `UPDATE_CHECK_ENABLED`                 | 선택                          | 인앱 업데이트 확인 배너 활성화 (`1` 기본값, `0`이면 비활성화)                                                       |
| `UPDATE_CHECK_REPO`                    | 선택                          | 업데이트 확인에 사용할 GitHub 저장소 슬러그 (기본값: `GreenSheep01201/claw-empire`)                                 |
| `UPDATE_CHECK_TTL_MS`                  | 선택                          | 업데이트 확인 캐시 TTL(밀리초) (기본값: `1800000`)                                                                  |
| `UPDATE_CHECK_TIMEOUT_MS`              | 선택                          | GitHub 요청 타임아웃(밀리초) (기본값: `4000`)                                                                       |
| `AUTO_UPDATE_ENABLED`                  | 선택                          | `settings.autoUpdateEnabled`가 없을 때 사용할 자동 업데이트 기본값 (`0` 기본값)                                     |
| `AUTO_UPDATE_CHANNEL`                  | 선택                          | 허용 업데이트 채널: `patch`(기본), `minor`, `all`                                                                   |
| `AUTO_UPDATE_IDLE_ONLY`                | 선택                          | `in_progress` 태스크/활성 CLI 프로세스가 없을 때만 적용 (`1` 기본값)                                                |
| `AUTO_UPDATE_CHECK_INTERVAL_MS`        | 선택                          | 자동 업데이트 확인 주기(밀리초) (기본값: `UPDATE_CHECK_TTL_MS` 따름)                                                |
| `AUTO_UPDATE_INITIAL_DELAY_MS`         | 선택                          | 서버 시작 후 첫 자동 업데이트 확인까지 대기 시간(밀리초) (기본값 `60000`, 최소 `60000`)                             |
| `AUTO_UPDATE_TARGET_BRANCH`            | 선택                          | 브랜치 가드 및 `git fetch/pull` 대상으로 사용할 브랜치명 (기본값 `main`)                                            |
| `AUTO_UPDATE_GIT_FETCH_TIMEOUT_MS`     | 선택                          | 업데이트 적용 중 `git fetch` 타임아웃(밀리초) (기본값 `120000`)                                                     |
| `AUTO_UPDATE_GIT_PULL_TIMEOUT_MS`      | 선택                          | 업데이트 적용 중 `git pull --ff-only` 타임아웃(밀리초) (기본값 `180000`)                                            |
| `AUTO_UPDATE_INSTALL_TIMEOUT_MS`       | 선택                          | 업데이트 적용 중 `pnpm install --frozen-lockfile` 타임아웃(밀리초) (기본값 `300000`)                                |
| `AUTO_UPDATE_COMMAND_OUTPUT_MAX_CHARS` | 선택                          | stdout/stderr 캡처 시 메모리에 유지할 최대 문자 수(초과분은 tail 유지, 기본값 `200000`)                             |
| `AUTO_UPDATE_TOTAL_TIMEOUT_MS`         | 선택                          | 1회 업데이트 적용 전체 타임아웃 상한(밀리초) (기본값 `900000`)                                                      |
| `AUTO_UPDATE_RESTART_MODE`             | 선택                          | 자동 적용 후 재시작 정책: `notify`(기본), `exit`, `command`                                                         |
| `AUTO_UPDATE_EXIT_DELAY_MS`            | 선택                          | `exit` 모드에서 프로세스 종료 전 대기 시간(밀리초) (기본값 `10000`, 최소 `1200`)                                    |
| `AUTO_UPDATE_RESTART_COMMAND`          | 선택                          | 재시작 정책이 `command`일 때 실행할 실행파일+인자 형식 명령(셸 메타문자 + 셸 실행기 직접 호출 거부, 서버 권한 실행) |

`API_AUTH_TOKEN`을 활성화하면 원격 브라우저 클라이언트는 런타임에 토큰을 입력합니다. 토큰은 `sessionStorage`에만 저장되며 Vite 빌드 산출물에는 포함되지 않습니다.
`OPENCLAW_CONFIG`는 절대경로를 권장하며, `v1.0.5`에서는 따옴표/선행 `~` 값도 자동 정규화됩니다.

---

## 실행 모드

```bash
# 개발 (로컬 전용, 권장)
pnpm dev:local          # 127.0.0.1에 바인딩

# 개발 (네트워크 접근 가능)
pnpm dev                # 0.0.0.0에 바인딩

# 프로덕션 빌드
pnpm build              # TypeScript 검사 + Vite 빌드
pnpm start              # API/백엔드 서버 실행 (프로덕션 모드에서는 dist 제공)

# 헬스 체크
curl -fsS http://127.0.0.1:8790/healthz
```

### CI 검증 (현재 PR 파이프라인)

모든 Pull Request에서 `.github/workflows/ci.yml`은 아래 순서로 실행됩니다.

1. 워크플로우 파일 숨은/양방향 유니코드 가드
2. `pnpm install --frozen-lockfile`
3. `pnpm run format:check`
4. `pnpm run lint`
5. `pnpm exec playwright install --with-deps`
6. `pnpm run test:ci` (`test:web --coverage` + `test:api --coverage` + `test:e2e`)

PR 전 로컬 권장 점검:

```bash
pnpm run format:check
pnpm run lint
pnpm run build
pnpm run test:ci
```

### 통신 QA 점검 (v1.1.6)

```bash
# 개별 점검
pnpm run test:comm:llm
pnpm run test:comm:oauth
pnpm run test:comm:api

# 통합 점검 (레거시 진입점 포함)
pnpm run test:comm:suite
pnpm run test:comm-status
```

`test:comm:suite`는 기계 판독용 증거를 `logs/`에, 요약 리포트를 `docs/`에 생성합니다.

### 프로젝트 경로 QA 스모크 (v1.1.6)

```bash
# API 인증 토큰 필요
QA_API_AUTH_TOKEN="<API_AUTH_TOKEN>" pnpm run test:qa:project-path
```

`test:qa:project-path`는 경로 보조 API, 프로젝트 생성 흐름, 중복 `project_path` 충돌 응답, 정리(cleanup) 동작을 점검합니다.

### 인앱 업데이트 배너

GitHub에 더 최신 릴리즈가 게시되면, Claw-Empire는 UI 상단에 pull 안내와 릴리즈 노트 링크를 포함한 배너를 표시합니다.

- Windows PowerShell: `git pull; pnpm install`
- macOS/Linux 셸: `git pull && pnpm install`
- pull/install 후 서버를 재시작하세요.

### 자동 업데이트 (안전 모드, 옵트인)

릴리즈 동기화를 자동화하려면 보수적 안전 모드 자동 업데이트를 활성화할 수 있습니다.

- `GET /api/update-auto-status` — 자동 업데이트 런타임/설정 상태 조회 (**인증 필요**)
- `POST /api/update-auto-config` — 서버 재시작 없이 자동 업데이트 런타임 토글(`enabled`) 변경 (**인증 필요**)
- `POST /api/update-apply` — 온디맨드 업데이트 파이프라인 실행 (`dry_run` / `force` / `force_confirm` 지원, **인증 필요**)
  - `force=true`는 대부분의 안전 가드를 우회하므로 반드시 `force_confirm=true`를 함께 전달해야 합니다.
  - 단, `dirty_worktree`, `channel_check_unavailable` 가드는 우회되지 않으며 항상 적용이 차단됩니다.
  - 재시작 정책(`notify|exit|command`)은 자동 실행/수동 실행 모두에 동일하게 적용됩니다.
  - `notify` 모드에서는 성공 시 `manual_restart_required` 사유가 결과에 포함됩니다.

기본 동작은 기존과 동일하게 **비활성화(OFF)** 이며, 활성화 시 서버가 바쁘거나 저장소가 fast-forward 가능한 깨끗한 상태가 아니면 자동 적용을 건너뜁니다.
`AUTO_UPDATE_CHANNEL` 값이 잘못되면 경고 로그를 남기고 `patch`로 자동 폴백합니다.

#### 트러블슈팅: `git_pull_failed` / 브랜치 분기(diverged)

적용 결과에 `error: "git_pull_failed"`(또는 `git_fetch_failed`)와 함께 `manual_recovery_may_be_required`가 포함되면 저장소 상태를 운영자가 점검해야 합니다.

1. `GET /api/update-auto-status`의 `runtime.last_result`, `runtime.last_error`를 확인합니다.
2. 서버 저장소에서 분기 상태를 점검합니다.
   - `git fetch origin main`
   - `git status`
   - `git log --oneline --decorate --graph --max-count 20 --all`
3. 팀 운영 정책에 맞게 fast-forward 가능한 깨끗한 상태로 복구합니다(예: 로컬 커밋 rebase 또는 `origin/main` 기준으로 reset).
4. `POST /api/update-apply`를 다시 실행합니다(필요하면 `{"dry_run": true}`로 사전 점검).

자동 업데이트 루프는 설정된 주기대로 계속 동작하며, 저장소가 안전 상태로 돌아오면 다음 주기에서 다시 적용을 시도합니다.

⚠️ `AUTO_UPDATE_RESTART_COMMAND`는 서버 권한으로 실행되는 고권한 기능입니다.
명령 파서는 셸 메타문자(`;`, `|`, `&`, `` ` ``, `$`, `<`, `>`)를 거부하고, `sh`/`bash`/`zsh`/`cmd`/`powershell`/`pwsh` 같은 셸 실행기 직접 호출도 차단합니다.
셸/인터프리터 래퍼 없이, 고정된 실행 파일 + 인자 형태로만 설정하세요(동적 입력 조합 금지).

---

<a id="cli-프로바이더-설정"></a>

## 프로바이더 설정 (CLI / OAuth / API)

Claw-Empire는 아래 3가지 방식의 프로바이더를 지원합니다:

- **CLI 도구** — 로컬 CLI 설치 후 프로세스 기반으로 실행
- **OAuth 계정** — 지원 프로바이더를 보안 토큰 교환으로 연결
- **직접 API 키** — **Settings > API** 탭에서 외부 LLM API 직접 연결

CLI 모드로 사용하려면 최소 하나 이상 설치하세요:

| 프로바이더                                                    | 설치                                 | 인증                           |
| ------------------------------------------------------------- | ------------------------------------ | ------------------------------ |
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `npm i -g @anthropic-ai/claude-code` | `claude` (안내에 따라 진행)    |
| [Codex CLI](https://github.com/openai/codex)                  | `npm i -g @openai/codex`             | `.env`에 `OPENAI_API_KEY` 설정 |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli)     | `npm i -g @google/gemini-cli`        | 설정 패널에서 OAuth 인증       |
| [OpenCode](https://github.com/opencode-ai/opencode)           | `npm i -g opencode`                  | 프로바이더별 설정              |

앱 내 **Settings > CLI Tools** 패널에서 프로바이더와 모델을 설정하세요.

또는 CLI 설치 없이 **Settings > API** 탭에서 에이전트를 외부 LLM API에 연결할 수 있습니다. API 키는 로컬 SQLite 데이터베이스에 암호화(AES-256-GCM)되어 저장됩니다 — `.env`나 소스 코드에는 포함되지 않습니다.
스킬 학습/해제 자동화는 현재 CLI 연동 프로바이더를 기준으로 동작합니다.

---

## 프로젝트 구조

```
claw-empire/
├── .github/
│   └── workflows/
│       └── ci.yml             # PR CI (Unicode 가드, 포맷, 린트, 테스트)
├── server/
│   ├── index.ts              # 백엔드 진입점
│   ├── server-main.ts        # 런타임 연결/부트스트랩
│   ├── modules/              # routes/workflow/bootstrap lifecycle
│   ├── test/                 # 백엔드 테스트 설정/헬퍼
│   └── vitest.config.ts      # 백엔드 단위 테스트 설정
├── src/
│   ├── app/                  # 앱 셸, 레이아웃, 상태 오케스트레이션
│   ├── api/                  # 프론트엔드 API 모듈
│   ├── components/           # UI (office/taskboard/chat/settings)
│   ├── hooks/                # polling/websocket 훅
│   ├── test/                 # 프론트엔드 테스트 설정
│   ├── types/                # 프론트엔드 타입 정의
│   ├── App.tsx
│   ├── api.ts
│   └── i18n.ts
├── tests/
│   └── e2e/                  # Playwright E2E 시나리오
├── public/sprites/           # 픽셀 아트 에이전트 스프라이트
├── scripts/
│   ├── setup.mjs             # 환경/부트스트랩 셋업
│   ├── auto-apply-v1.0.5.mjs # 시작 시 마이그레이션 보조
│   ├── openclaw-setup.sh     # 원클릭 셋업 (macOS/Linux)
│   ├── openclaw-setup.ps1    # 원클릭 셋업 (Windows PowerShell)
│   ├── prepare-e2e-runtime.mjs
│   ├── preflight-public.sh   # 릴리즈 전 보안 검사
│   └── generate-architecture-report.mjs
├── install.sh                # scripts/openclaw-setup.sh 실행 래퍼
├── install.ps1               # scripts/openclaw-setup.ps1 실행 래퍼
├── docs/                     # 설계 및 아키텍처 문서
├── AGENTS.md                 # 로컬 에이전트/오케스트레이션 규칙
├── CONTRIBUTING.md           # 브랜치/PR/리뷰 정책
├── eslint.config.mjs         # Flat ESLint 설정
├── .env.example              # 환경 변수 템플릿
└── package.json
```

---

## 보안

Claw-Empire는 보안을 최우선으로 설계되었습니다:

- **로컬 퍼스트 아키텍처** — 모든 데이터는 SQLite에 로컬로 저장; 외부 클라우드 서비스 불필요
- **암호화된 OAuth + 메신저 토큰** — 사용자 OAuth 토큰과 직접 메신저 채널 토큰은 **서버 측 SQLite에만 저장**되며, AES-256-GCM + `OAUTH_ENCRYPTION_SECRET`(`SESSION_SECRET` 폴백)으로 암호화됩니다. 브라우저에는 리프레시 토큰이 전달되지 않습니다
- **빌트인 OAuth Client ID** — 소스 코드에 포함된 GitHub/Google OAuth client ID/secret은 **공개 OAuth 앱 자격증명**이며 사용자 시크릿이 아닙니다. [Google 문서](https://developers.google.com/identity/protocols/oauth2/native-app)에 따르면 설치형/데스크톱 앱의 client secret은 "시크릿으로 취급되지 않습니다." 이는 오픈소스 앱(VS Code, Thunderbird, GitHub CLI 등)의 표준 관행입니다. 이 자격증명은 앱 자체를 식별할 뿐이며, 개인 토큰은 항상 별도로 암호화됩니다
- **소스 코드에 개인 자격증명 없음** — 모든 사용자별 토큰(GitHub, Google OAuth)은 로컬 SQLite에 암호화되어 저장되며, 소스 코드에는 포함되지 않습니다
- **저장소에 시크릿 없음** — 포괄적인 `.gitignore`로 `.env`, `*.pem`, `*.key`, `credentials.json` 등 차단
- **프리플라이트 보안 검사** — 공개 릴리즈 전 `pnpm run preflight:public` 실행으로 작업 트리와 git 히스토리의 유출된 시크릿 스캔
- **기본값은 localhost** — 개발 서버는 `127.0.0.1`에 바인딩되어 네트워크에 노출되지 않음

## API 문서 & 보안 정책 요약

- **API 문서** — 엔드포인트 개요/사용법은 [`docs/api.md`](docs/api.md), 스키마/도구 연동은 [`docs/openapi.json`](docs/openapi.json)에서 확인하세요.
- **보안 정책** — 취약점 제보/정책은 [`SECURITY.md`](SECURITY.md)를 참고하고, 공개 릴리즈 전에는 `pnpm run preflight:public` 실행을 권장합니다.

---

## 기여하기

기여를 환영합니다! 다음 절차를 따라주세요:

1. 저장소를 포크합니다
2. `dev` 기준으로 기능 브랜치를 생성합니다 (`git checkout -b feature/amazing-feature`)
3. 변경 사항을 커밋합니다 (`git commit -m 'Add amazing feature'`)
4. PR 전에 로컬 검증을 수행합니다:
   - `pnpm run format:check`
   - `pnpm run lint`
   - `pnpm run build`
   - `pnpm run test:ci`
5. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`)
6. Pull Request는 기본적으로 `dev` 브랜치로 엽니다 (외부 기여 통합 브랜치)
7. `main`은 유지보수자 승인 긴급 핫픽스에만 사용하고, 이후 `main -> dev` 역병합을 수행합니다

상세 정책: [`CONTRIBUTING.md`](CONTRIBUTING.md)

---

## 라이선스

[Apache 2.0](LICENSE) — 개인 및 상업적 사용 모두 무료.

---

<div align="center">

**픽셀과 열정으로 만들었습니다.**

_Claw-Empire — AI 에이전트들이 일하러 오는 곳._

</div>
