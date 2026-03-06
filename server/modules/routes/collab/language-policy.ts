import { isLang, type Lang } from "../../../types/lang.ts";

export type L10n = Record<Lang, string[]>;

export type DirectivePolicy = {
  skipDelegation: boolean;
  skipDelegationReason: "no_task" | "lightweight" | null;
  skipPlannedMeeting: boolean;
  skipPlanSubtasks: boolean;
};

interface LanguagePolicyDeps {
  db: any;
}

const ROLE_LABEL: Record<string, string> = {
  team_leader: "チームリーダー",
  senior: "シニア",
  junior: "ジュニア",
  intern: "インターン",
};

const ROLE_LABEL_L10N: Record<string, Record<Lang, string>> = {
  team_leader: { ko: "팀장", en: "Team Lead", ja: "チームリーダー", zh: "组长" },
  senior: { ko: "시니어", en: "Senior", ja: "シニア", zh: "高级" },
  junior: { ko: "주니어", en: "Junior", ja: "ジュニア", zh: "初级" },
  intern: { ko: "인턴", en: "Intern", ja: "インターン", zh: "实习生" },
};

const DEPT_KEYWORDS: Record<string, string[]> = {
  dev: ["개발", "코딩", "프론트", "백엔드", "API", "서버", "코드", "버그", "프로그램", "앱", "웹"],
  design: ["디자인", "UI", "UX", "목업", "피그마", "아이콘", "로고", "배너", "레이아웃", "시안"],
  planning: ["기획", "전략", "분석", "리서치", "보고서", "PPT", "발표", "시장", "조사", "제안"],
  operations: ["운영", "배포", "인프라", "모니터링", "서버관리", "CI", "CD", "DevOps", "장애"],
  qa: ["QA", "QC", "품질", "테스트", "검수", "버그리포트", "회귀", "자동화테스트", "성능테스트", "리뷰"],
  devsecops: [
    "보안",
    "취약점",
    "인증",
    "SSL",
    "방화벽",
    "해킹",
    "침투",
    "파이프라인",
    "컨테이너",
    "도커",
    "쿠버네티스",
    "암호화",
  ],
};

function includesAnyTerm(content: string, terms: string[]): boolean {
  const normalized = content.toLowerCase().replace(/\s+/g, " ").trim();
  const compact = normalized.replace(/\s+/g, "");
  const includesTerm = (term: string): boolean => {
    const termNorm = term.toLowerCase();
    return normalized.includes(termNorm) || compact.includes(termNorm.replace(/\s+/g, ""));
  };
  return terms.some(includesTerm);
}

function normalizeForSearch(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function compactForSearch(value: unknown): string {
  return normalizeForSearch(value).replace(/\s+/g, "");
}

function collectDepartmentAliases(input: unknown): string[] {
  const base = String(input ?? "").trim();
  if (!base) return [];
  const out = new Set<string>();
  const add = (value: string) => {
    const normalized = normalizeForSearch(value);
    if (normalized.length < 2) return;
    out.add(normalized);
  };

  add(base);
  add(base.replace(/[\s_-]+/g, ""));
  add(base.replace(/\s*(팀장|팀|부서|department|dept|team|チーム|部門|组长|组|組|部门)\s*$/i, ""));
  add(base.replace(/[(){}\[\]<>]/g, " "));

  return [...out];
}

export function initializeCollabLanguagePolicy(deps: LanguagePolicyDeps) {
  const { db } = deps;

  function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function readSettingString(key: string): string | undefined {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    if (!row) return undefined;
    try {
      const parsed = JSON.parse(row.value);
      return typeof parsed === "string" ? parsed : row.value;
    } catch {
      return row.value;
    }
  }

  function getPreferredLanguage(): Lang {
    const settingLang = readSettingString("language");
    return isLang(settingLang) ? settingLang : "en";
  }

  function detectLang(text: string): Lang {
    const ko = text.match(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g)?.length ?? 0;
    const ja = text.match(/[\u3040-\u309F\u30A0-\u30FF]/g)?.length ?? 0;
    const zh = text.match(/[\u4E00-\u9FFF]/g)?.length ?? 0;
    const total = text.replace(/\s/g, "").length || 1;
    if (ko / total > 0.15) return "ko";
    if (ja / total > 0.15) return "ja";
    if (zh / total > 0.3) return "zh";
    return "en";
  }

  function resolveLang(text?: string, fallback?: Lang): Lang {
    const settingLang = readSettingString("language");
    if (isLang(settingLang)) return settingLang;
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (trimmed) return detectLang(trimmed);
    return fallback ?? getPreferredLanguage();
  }

  function l(ko: string[], en: string[], ja?: string[], zh?: string[]): L10n {
    return {
      ko,
      en,
      ja: ja ?? en.map((s) => s),
      zh: zh ?? en.map((s) => s),
    };
  }

  function pickL(pool: L10n, lang: Lang): string {
    const arr = pool[lang];
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function getFlairs(agentName: string, lang: Lang): string[] {
    const flairs: Record<string, Record<Lang, string[]>> = {
      Aria: {
        ko: ["코드 리뷰 중에", "리팩토링 구상하면서", "PR 체크하면서"],
        en: ["reviewing code", "planning a refactor", "checking PRs"],
        ja: ["コードレビュー中に", "リファクタリングを考えながら", "PR確認しながら"],
        zh: ["审查代码中", "规划重构时", "检查PR时"],
      },
      Bolt: {
        ko: ["빠르게 코딩하면서", "API 설계하면서", "성능 튜닝하면서"],
        en: ["coding fast", "designing APIs", "tuning performance"],
        ja: ["高速コーディング中", "API設計しながら", "パフォーマンスチューニング中"],
        zh: ["快速编码中", "设计API时", "调优性能时"],
      },
      Nova: {
        ko: ["새로운 기술 공부하면서", "프로토타입 만들면서", "실험적인 코드 짜면서"],
        en: ["studying new tech", "building a prototype", "writing experimental code"],
        ja: ["新技術を勉強しながら", "プロトタイプ作成中", "実験的なコード書き中"],
        zh: ["学习新技术中", "制作原型时", "编写实验代码时"],
      },
      Pixel: {
        ko: ["디자인 시안 작업하면서", "컴포넌트 정리하면서", "UI 가이드 업데이트하면서"],
        en: ["working on mockups", "organizing components", "updating the UI guide"],
        ja: ["デザインモックアップ作業中", "コンポーネント整理しながら", "UIガイド更新中"],
        zh: ["制作设计稿中", "整理组件时", "更新UI指南时"],
      },
      Luna: {
        ko: ["애니메이션 작업하면서", "컬러 팔레트 고민하면서", "사용자 경험 분석하면서"],
        en: ["working on animations", "refining the color palette", "analyzing UX"],
        ja: ["アニメーション作業中", "カラーパレット検討中", "UX分析しながら"],
        zh: ["制作动画中", "调整调色板时", "分析用户体验时"],
      },
      Sage: {
        ko: ["시장 분석 보고서 보면서", "전략 문서 정리하면서", "경쟁사 리서치하면서"],
        en: ["reviewing market analysis", "organizing strategy docs", "researching competitors"],
        ja: ["市場分析レポート確認中", "戦略文書整理中", "競合リサーチしながら"],
        zh: ["查看市场分析报告", "整理战略文件时", "调研竞品时"],
      },
      Clio: {
        ko: ["데이터 분석하면서", "기획서 작성하면서", "사용자 인터뷰 정리하면서"],
        en: ["analyzing data", "drafting a proposal", "organizing user interviews"],
        ja: ["データ分析中", "企画書作成中", "ユーザーインタビュー整理中"],
        zh: ["分析数据中", "撰写企划书时", "整理用户访谈时"],
      },
      Atlas: {
        ko: ["서버 모니터링하면서", "배포 파이프라인 점검하면서", "운영 지표 확인하면서"],
        en: ["monitoring servers", "checking deploy pipelines", "reviewing ops metrics"],
        ja: ["サーバー監視中", "デプロイパイプライン点検中", "運用指標確認中"],
        zh: ["监控服务器中", "检查部署流水线时", "查看运营指标时"],
      },
      Turbo: {
        ko: ["자동화 스크립트 돌리면서", "CI/CD 최적화하면서", "인프라 정리하면서"],
        en: ["running automation scripts", "optimizing CI/CD", "cleaning up infra"],
        ja: ["自動化スクリプト実行中", "CI/CD最適化中", "インフラ整理中"],
        zh: ["运行自动化脚本中", "优化CI/CD时", "整理基础设施时"],
      },
      Hawk: {
        ko: ["테스트 케이스 리뷰하면서", "버그 리포트 분석하면서", "품질 지표 확인하면서"],
        en: ["reviewing test cases", "analyzing bug reports", "checking quality metrics"],
        ja: ["テストケースレビュー中", "バグレポート分析中", "品質指標確認中"],
        zh: ["审查测试用例中", "分析缺陷报告时", "查看质量指标时"],
      },
      Lint: {
        ko: ["자동화 테스트 작성하면서", "코드 검수하면서", "회귀 테스트 돌리면서"],
        en: ["writing automated tests", "inspecting code", "running regression tests"],
        ja: ["自動テスト作成中", "コード検査中", "回帰テスト実行中"],
        zh: ["编写自动化测试中", "检查代码时", "运行回归测试时"],
      },
      Vault: {
        ko: ["보안 감사 진행하면서", "취약점 스캔 결과 보면서", "인증 로직 점검하면서"],
        en: ["running a security audit", "reviewing vuln scan results", "checking auth logic"],
        ja: ["セキュリティ監査中", "脆弱性スキャン結果確認中", "認証ロジック点検中"],
        zh: ["进行安全审计中", "查看漏洞扫描结果时", "检查认证逻辑时"],
      },
      Pipe: {
        ko: ["파이프라인 구축하면서", "컨테이너 설정 정리하면서", "배포 자동화 하면서"],
        en: ["building pipelines", "configuring containers", "automating deployments"],
        ja: ["パイプライン構築中", "コンテナ設定整理中", "デプロイ自動化中"],
        zh: ["构建流水线中", "配置容器时", "自动化部署时"],
      },
    };
    const agentFlairs = flairs[agentName];
    if (agentFlairs) return agentFlairs[lang] ?? agentFlairs.en;
    const defaults: Record<Lang, string[]> = {
      ko: ["업무 처리하면서", "작업 진행하면서", "일하면서"],
      en: ["working on tasks", "making progress", "getting things done"],
      ja: ["業務処理中", "作業進行中", "仕事しながら"],
      zh: ["处理业务中", "推进工作时", "忙着干活时"],
    };
    return defaults[lang];
  }

  function getRoleLabel(role: string, lang: Lang): string {
    return ROLE_LABEL_L10N[role]?.[lang] ?? ROLE_LABEL[role] ?? role;
  }

  function classifyIntent(msg: string, lang: Lang) {
    const checks: Record<string, RegExp[]> = {
      greeting: [
        /안녕|하이|반가|좋은\s*(아침|오후|저녁)/i,
        /hello|hi\b|hey|good\s*(morning|afternoon|evening)|howdy|what'?s\s*up/i,
        /こんにちは|おはよう|こんばんは|やあ|どうも/i,
        /你好|嗨|早上好|下午好|晚上好/i,
      ],
      presence: [
        /자리|있어|계세요|계신가|거기|응답|들려|보여|어디야|어딨/i,
        /are you (there|here|around|available|at your desk)|you there|anybody|present/i,
        /いますか|席に|いる？|応答/i,
        /在吗|在不在|有人吗/i,
      ],
      whatDoing: [
        /뭐\s*해|뭐하|뭘\s*해|뭐\s*하고|뭐\s*하는|하는\s*중|진행\s*중|바쁘|바빠|한가/i,
        /what are you (doing|up to|working on)|busy|free|what'?s going on|occupied/i,
        /何してる|忙しい|暇|何やってる/i,
        /在做什么|忙吗|有空吗|在干嘛/i,
      ],
      report: [
        /보고|현황|상태|진행|어디까지|결과|리포트|성과/i,
        /report|status|progress|update|how('?s| is) (it|the|your)|results/i,
        /報告|進捗|状況|ステータス/i,
        /报告|进度|状态|进展/i,
      ],
      praise: [
        /잘했|수고|고마|감사|훌륭|대단|멋져|최고|짱/i,
        /good (job|work)|well done|thank|great|awesome|amazing|excellent|nice|kudos|bravo/i,
        /よくやった|お疲れ|ありがとう|素晴らしい|すごい/i,
        /做得好|辛苦|谢谢|太棒了|厉害/i,
      ],
      encourage: [
        /힘내|화이팅|파이팅|응원|열심히|잘\s*부탁|잘\s*해|잘해봐/i,
        /keep (it )?up|go for it|fighting|you (got|can do) (this|it)|cheer|hang in there/i,
        /頑張|ファイト|応援/i,
        /加油|努力|拜托/i,
      ],
      joke: [
        /ㅋ|ㅎ|웃|재밌|장난|농담|심심|놀자/i,
        /lol|lmao|haha|joke|funny|bored|play/i,
        /笑|面白い|冗談|暇/i,
        /哈哈|笑|开玩笑|无聊/i,
      ],
      complaint: [
        /느려|답답|왜\s*이래|언제\s*돼|빨리|지연|늦/i,
        /slow|frustrat|why (is|so)|when (will|is)|hurry|delay|late|taking (too )?long/i,
        /遅い|イライラ|なぜ|いつ|急いで/i,
        /慢|着急|为什么|快点|延迟/i,
      ],
      opinion: [
        /어때|생각|의견|아이디어|제안|건의|어떨까|괜찮/i,
        /what do you think|opinion|idea|suggest|how about|thoughts|recommend/i,
        /どう思う|意見|アイデア|提案/i,
        /怎么看|意见|想法|建议/i,
      ],
      canDo: [
        /가능|할\s*수|되나|될까|할까|해줘|해\s*줄|맡아|부탁/i,
        /can you|could you|possible|able to|handle|take care|would you|please/i,
        /できる|可能|お願い|頼む|やって/i,
        /能不能|可以|拜托|帮忙|处理/i,
      ],
      question: [
        /\?|뭐|어디|언제|왜|어떻게|무엇|몇/i,
        /\?|what|where|when|why|how|which|who/i,
        /\?|何|どこ|いつ|なぜ|どう/i,
        /\?|什么|哪里|什么时候|为什么|怎么/i,
      ],
    };

    const langIdx = { ko: 0, en: 1, ja: 2, zh: 3 }[lang];
    void langIdx;

    const result: Record<string, boolean> = {};
    for (const [key, patterns] of Object.entries(checks)) {
      result[key] = patterns.some((p) => p.test(msg));
    }
    return result;
  }

  function analyzeDirectivePolicy(content: string): DirectivePolicy {
    const text = content.trim();

    // Meeting skip is now controlled exclusively via API parameter (skipPlannedMeeting: true).
    // Text-based keyword matching for "회의 없이" etc. has been removed for safety.
    const isNoMeeting = false;

    const isNoTask = includesAnyTerm(text, [
      "업무 생성 없이",
      "태스크 생성 없이",
      "작업 생성 없이",
      "sub task 없이",
      "delegation 없이",
      "하달 없이",
      "no task",
      "no delegation",
      "without delegation",
      "do not delegate",
      "don't delegate",
      "タスク作成なし",
      "タスク作成不要",
      "委任なし",
      "割り当てなし",
      "下達なし",
      "不创建任务",
      "无需创建任务",
      "不下达",
      "不委派",
      "不分配",
    ]);

    const hasLightweightSignal = includesAnyTerm(text, [
      "응답 테스트",
      "응답테스트",
      "테스트 중",
      "테스트만",
      "ping",
      "헬스 체크",
      "health check",
      "status check",
      "상태 확인",
      "확인만",
      "ack test",
      "smoke test",
      "応答テスト",
      "応答確認",
      "テストのみ",
      "pingテスト",
      "状態確認",
      "動作確認",
      "响应测试",
      "响应确认",
      "仅测试",
      "测试一下",
      "状态检查",
      "健康检查",
      "ping测试",
    ]);

    const hasWorkSignal = includesAnyTerm(text, [
      "업무",
      "작업",
      "하달",
      "착수",
      "실행",
      "진행",
      "작성",
      "수정",
      "구현",
      "배포",
      "리뷰",
      "검토",
      "정리",
      "조치",
      "할당",
      "태스크",
      "delegate",
      "assign",
      "implement",
      "deploy",
      "fix",
      "review",
      "plan",
      "subtask",
      "task",
      "handoff",
      "業務",
      "作業",
      "指示",
      "実行",
      "進行",
      "作成",
      "修正",
      "実装",
      "配布",
      "レビュー",
      "検討",
      "整理",
      "対応",
      "割当",
      "委任",
      "計画",
      "タスク",
      "任务",
      "工作",
      "下达",
      "执行",
      "进行",
      "编写",
      "修改",
      "实现",
      "部署",
      "评审",
      "审核",
      "处理",
      "分配",
      "委派",
      "计划",
      "子任务",
    ]);

    const isLightweight = hasLightweightSignal && !hasWorkSignal;
    const skipDelegation = isNoTask || isLightweight;
    const skipDelegationReason: DirectivePolicy["skipDelegationReason"] = isNoTask
      ? "no_task"
      : isLightweight
        ? "lightweight"
        : null;
    const skipPlannedMeeting = !skipDelegation && isNoMeeting;
    const skipPlanSubtasks = skipPlannedMeeting;

    return {
      skipDelegation,
      skipDelegationReason,
      skipPlannedMeeting,
      skipPlanSubtasks,
    };
  }

  function shouldExecuteDirectiveDelegation(policy: DirectivePolicy, explicitSkipPlannedMeeting: boolean): boolean {
    if (!policy.skipDelegation) return true;
    if (explicitSkipPlannedMeeting && policy.skipDelegationReason === "lightweight") return true;
    return false;
  }

  function detectTargetDepartments(message: string): string[] {
    const found = new Set<string>();
    for (const [deptId, keywords] of Object.entries(DEPT_KEYWORDS)) {
      for (const kw of keywords) {
        if (message.includes(kw)) {
          found.add(deptId);
          break;
        }
      }
    }

    // Dynamic department aliases: supports office-pack specific localized names.
    const messageNormalized = normalizeForSearch(message);
    const messageCompact = compactForSearch(message);
    const departments = db.prepare("SELECT id, name, name_ko, name_ja, name_zh FROM departments").all() as Array<{
      id: string;
      name: string;
      name_ko?: string | null;
      name_ja?: string | null;
      name_zh?: string | null;
    }>;
    for (const dept of departments) {
      const aliases = [
        ...collectDepartmentAliases(dept.id),
        ...collectDepartmentAliases(dept.name),
        ...collectDepartmentAliases(dept.name_ko),
        ...collectDepartmentAliases(dept.name_ja),
        ...collectDepartmentAliases(dept.name_zh),
      ];
      for (const alias of aliases) {
        const aliasCompact = alias.replace(/\s+/g, "");
        if (messageNormalized.includes(alias) || (aliasCompact && messageCompact.includes(aliasCompact))) {
          found.add(dept.id);
          break;
        }
      }
    }

    return [...found];
  }

  return {
    DEPT_KEYWORDS,
    pickRandom,
    getPreferredLanguage,
    resolveLang,
    detectLang,
    l,
    pickL,
    getFlairs,
    getRoleLabel,
    classifyIntent,
    analyzeDirectivePolicy,
    shouldExecuteDirectiveDelegation,
    detectTargetDepartments,
  };
}
