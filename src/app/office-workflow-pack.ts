import type { Agent, AgentRole, CliProvider, Department, RoomTheme, WorkflowPackKey } from "../types";

export type UiLanguageLike = "ko" | "en" | "ja" | "zh";

type Localized = { ko: string; en: string; ja: string; zh: string };
type DeptPreset = {
  name: Localized;
  icon: string;
  agentPrefix: Localized;
  avatarPool: string[];
};

type StaffPreset = {
  nonLeaderDeptCycle: string[];
  roleTitles?: Partial<Record<AgentRole, Localized>>;
  planningLeadDeptIds?: string[];
};

type SeedProfile = {
  nameOffset: number;
  tone: Localized;
};

type PackPreset = {
  key: WorkflowPackKey;
  slug: string;
  label: Localized;
  summary: Localized;
  roomThemes: Record<string, RoomTheme>;
  departments: Partial<Record<string, DeptPreset>>;
  staff?: StaffPreset;
};

type OfficePackPresentation = {
  departments: Department[];
  agents: Agent[];
  roomThemes: Record<string, RoomTheme>;
};

export type OfficePackStarterAgentDraft = {
  name: string;
  name_ko: string;
  name_ja: string;
  name_zh: string;
  department_id: string | null;
  seed_order_in_department: number;
  role: AgentRole;
  acts_as_planning_leader: number;
  avatar_emoji: string;
  sprite_number: number;
  personality: string | null;
};

type OfficePackSeedProvider = Extract<CliProvider, "claude" | "codex">;
const OFFICE_SEED_SPRITE_POOL = Array.from({ length: 13 }, (_, idx) => idx + 1);

const DEV_THEMES: Record<string, RoomTheme> = {
  ceoOffice: { floor1: 0xe5d9b9, floor2: 0xdfd0a8, wall: 0x998243, accent: 0xa77d0c },
  planning: { floor1: 0xf0e1c5, floor2: 0xeddaba, wall: 0xae9871, accent: 0xd4a85a },
  dev: { floor1: 0xd8e8f5, floor2: 0xcce1f2, wall: 0x6c96b7, accent: 0x5a9fd4 },
  design: { floor1: 0xe8def2, floor2: 0xe1d4ee, wall: 0x9378ad, accent: 0x9a6fc4 },
  qa: { floor1: 0xf0cbcb, floor2: 0xedc0c0, wall: 0xae7979, accent: 0xd46a6a },
  devsecops: { floor1: 0xf0d5c5, floor2: 0xedcdba, wall: 0xae8871, accent: 0xd4885a },
  operations: { floor1: 0xd0eede, floor2: 0xc4ead5, wall: 0x6eaa89, accent: 0x5ac48a },
  breakRoom: { floor1: 0xf7e2b7, floor2: 0xf6dead, wall: 0xa99c83, accent: 0xf0c878 },
};

const DEPARTMENT_PERSON_NAME_POOL: Partial<Record<string, Localized[]>> = {
  planning: [
    { ko: "세이지", en: "Sage", ja: "セージ", zh: "赛吉" },
    { ko: "미나", en: "Mina", ja: "ミナ", zh: "米娜" },
    { ko: "주노", en: "Juno", ja: "ジュノ", zh: "朱诺" },
    { ko: "리안", en: "Rian", ja: "リアン", zh: "里安" },
    { ko: "하루", en: "Haru", ja: "ハル", zh: "晴" },
    { ko: "노아", en: "Noa", ja: "ノア", zh: "诺亚" },
  ],
  dev: [
    { ko: "아리아", en: "Aria", ja: "アリア", zh: "阿莉娅" },
    { ko: "테오", en: "Theo", ja: "テオ", zh: "西奥" },
    { ko: "카이", en: "Kai", ja: "カイ", zh: "凯" },
    { ko: "리암", en: "Liam", ja: "リアム", zh: "利亚姆" },
    { ko: "세나", en: "Sena", ja: "セナ", zh: "塞娜" },
    { ko: "로완", en: "Rowan", ja: "ローワン", zh: "罗恩" },
  ],
  design: [
    { ko: "도로", en: "Doro", ja: "ドロ", zh: "多罗" },
    { ko: "루나", en: "Luna", ja: "ルナ", zh: "露娜" },
    { ko: "픽셀", en: "Pixel", ja: "ピクセル", zh: "像素" },
    { ko: "유나", en: "Yuna", ja: "ユナ", zh: "优娜" },
    { ko: "미로", en: "Miro", ja: "ミロ", zh: "米洛" },
    { ko: "아이리스", en: "Iris", ja: "アイリス", zh: "爱丽丝" },
  ],
  qa: [
    { ko: "스피키", en: "Speaky", ja: "スピーキー", zh: "斯皮奇" },
    { ko: "호크", en: "Hawk", ja: "ホーク", zh: "霍克" },
    { ko: "베라", en: "Vera", ja: "ヴェラ", zh: "薇拉" },
    { ko: "퀸", en: "Quinn", ja: "クイン", zh: "奎因" },
    { ko: "토리", en: "Tori", ja: "トリ", zh: "托莉" },
    { ko: "하윤", en: "Hayoon", ja: "ハユン", zh: "夏允" },
  ],
  operations: [
    { ko: "아틀라스", en: "Atlas", ja: "アトラス", zh: "阿特拉斯" },
    { ko: "나리", en: "Nari", ja: "ナリ", zh: "娜莉" },
    { ko: "오웬", en: "Owen", ja: "オーウェン", zh: "欧文" },
    { ko: "다미", en: "Dami", ja: "ダミ", zh: "达米" },
    { ko: "키라", en: "Kira", ja: "キラ", zh: "琪拉" },
    { ko: "솔", en: "Sol", ja: "ソル", zh: "索尔" },
  ],
  devsecops: [
    { ko: "볼트S", en: "VoltS", ja: "ボルトS", zh: "伏特S" },
    { ko: "시온", en: "Sion", ja: "シオン", zh: "锡安" },
    { ko: "녹스", en: "Knox", ja: "ノックス", zh: "诺克斯" },
    { ko: "레이븐", en: "Raven", ja: "レイヴン", zh: "渡鸦" },
    { ko: "미라", en: "Mira", ja: "ミラ", zh: "米拉" },
    { ko: "알렉스", en: "Alex", ja: "アレックス", zh: "亚历克斯" },
  ],
};

const PACK_SEED_PROFILE: Partial<Record<WorkflowPackKey, SeedProfile>> = {
  report: {
    nameOffset: 0,
    tone: {
      ko: "근거와 문서 완성도를 최우선으로 판단합니다.",
      en: "Prioritizes evidence quality and document completeness.",
      ja: "根拠の確かさと文書の完成度を最優先します。",
      zh: "以证据质量与文档完整度为最高优先级。",
    },
  },
  web_research_report: {
    nameOffset: 1,
    tone: {
      ko: "출처 신뢰도와 사실 검증을 중심으로 움직입니다.",
      en: "Focused on source credibility and fact verification.",
      ja: "情報源の信頼性と事実検証を中心に進めます。",
      zh: "聚焦来源可信度与事实核验。",
    },
  },
  novel: {
    nameOffset: 2,
    tone: {
      ko: "서사 몰입도와 캐릭터 일관성을 가장 중시합니다.",
      en: "Values narrative immersion and character consistency the most.",
      ja: "物語への没入感とキャラクターの一貫性を最重視します。",
      zh: "最重视叙事沉浸感与角色一致性。",
    },
  },
  video_preprod: {
    nameOffset: 3,
    tone: {
      ko: "콘티, 샷 구성, 제작 효율을 우선합니다.",
      en: "Prioritizes storyboard quality, shot composition, and production efficiency.",
      ja: "コンテ品質、ショット構成、制作効率を優先します。",
      zh: "优先保证分镜质量、镜头构成与制作效率。",
    },
  },
  roleplay: {
    nameOffset: 4,
    tone: {
      ko: "캐릭터 몰입감과 대화 리듬을 우선합니다.",
      en: "Prioritizes character immersion and dialogue rhythm.",
      ja: "キャラクター没入感と会話のテンポを優先します。",
      zh: "优先保障角色沉浸感与对话节奏。",
    },
  },
};

const PACK_PRESETS: Record<WorkflowPackKey, PackPreset> = {
  development: {
    key: "development",
    slug: "DEV",
    label: {
      ko: "개발 오피스",
      en: "Development Office",
      ja: "開発オフィス",
      zh: "开发办公室",
    },
    summary: {
      ko: "기본 개발 조직 구조",
      en: "Default engineering organization",
      ja: "標準の開発組織",
      zh: "默认开发组织",
    },
    roomThemes: DEV_THEMES,
    departments: {},
  },
  report: {
    key: "report",
    slug: "RPT",
    label: {
      ko: "보고서 오피스",
      en: "Report Office",
      ja: "レポートオフィス",
      zh: "报告办公室",
    },
    summary: {
      ko: "리서치/문서화 중심 팀 구성",
      en: "Research and documentation focused crew",
      ja: "調査・文書化中心の構成",
      zh: "以调研与文档为核心的团队",
    },
    roomThemes: {
      ceoOffice: { floor1: 0xf0e8dc, floor2: 0xebdfce, wall: 0x8f7a63, accent: 0xbd8b57 },
      planning: { floor1: 0xe6ecf6, floor2: 0xdde5f1, wall: 0x5f7394, accent: 0x7090bd },
      dev: { floor1: 0xe7f0ed, floor2: 0xddeae5, wall: 0x5c7d73, accent: 0x6ea495 },
      design: { floor1: 0xf4ecf4, floor2: 0xece2ed, wall: 0x82658a, accent: 0xa076ab },
      qa: { floor1: 0xf8efe9, floor2: 0xf0e3d8, wall: 0x8c6c5f, accent: 0xb67b63 },
      devsecops: { floor1: 0xe8edf0, floor2: 0xdee5ea, wall: 0x596778, accent: 0x6f85a0 },
      operations: { floor1: 0xe9f1e7, floor2: 0xe0ebdc, wall: 0x5f7d5b, accent: 0x76a06b },
      breakRoom: { floor1: 0xf5efe4, floor2: 0xede4d3, wall: 0x8f866d, accent: 0xc2a26b },
    },
    departments: {
      planning: {
        name: { ko: "편집기획실", en: "Editorial Planning", ja: "編集企画室", zh: "编辑企划室" },
        icon: "📚",
        agentPrefix: { ko: "편집 PM", en: "Editorial PM", ja: "編集PM", zh: "编辑PM" },
        avatarPool: ["📚", "🗂️", "🧭"],
      },
      dev: {
        name: { ko: "리서치엔진팀", en: "Research Engine", ja: "リサーチエンジン", zh: "调研引擎组" },
        icon: "🧠",
        agentPrefix: { ko: "리서처", en: "Researcher", ja: "リサーチャー", zh: "研究员" },
        avatarPool: ["🧠", "📊", "📝"],
      },
      design: {
        name: { ko: "문서디자인팀", en: "Doc Design", ja: "ドキュメントデザイン", zh: "文档设计组" },
        icon: "🧾",
        agentPrefix: { ko: "문서 디자이너", en: "Doc Designer", ja: "資料デザイナー", zh: "文档设计师" },
        avatarPool: ["🧾", "🎨", "📐"],
      },
      qa: {
        name: { ko: "검수팀", en: "Review Desk", ja: "レビュー班", zh: "审校组" },
        icon: "🔎",
        agentPrefix: { ko: "검수관", en: "Reviewer", ja: "レビュア", zh: "审校员" },
        avatarPool: ["🔎", "✅", "🧪"],
      },
    },
    staff: {
      nonLeaderDeptCycle: ["planning", "planning", "dev", "qa", "design", "planning", "dev", "qa", "operations"],
    },
  },
  web_research_report: {
    key: "web_research_report",
    slug: "WEB",
    label: {
      ko: "웹 리서치 오피스",
      en: "Web Research Office",
      ja: "Web調査オフィス",
      zh: "网页调研办公室",
    },
    summary: {
      ko: "소스 수집과 근거 검증 중심",
      en: "Source collection and citation verification",
      ja: "情報源収集と根拠検証中心",
      zh: "以来源收集与证据校验为核心",
    },
    roomThemes: {
      ceoOffice: { floor1: 0xddebf1, floor2: 0xd2e3eb, wall: 0x4e6f7f, accent: 0x3d90b5 },
      planning: { floor1: 0xe2eef6, floor2: 0xd8e7f1, wall: 0x55728d, accent: 0x5f95c6 },
      dev: { floor1: 0xe2f1ef, floor2: 0xd8ebe8, wall: 0x4d7a72, accent: 0x4fa69a },
      design: { floor1: 0xeceff7, floor2: 0xe2e8f2, wall: 0x606c88, accent: 0x748ec5 },
      qa: { floor1: 0xf0f3f7, floor2: 0xe6ecf2, wall: 0x5d6f80, accent: 0x7a93b0 },
      devsecops: { floor1: 0xe4edf5, floor2: 0xd9e4ef, wall: 0x4e617a, accent: 0x5f7fa5 },
      operations: { floor1: 0xe5f3ec, floor2: 0xdbeadf, wall: 0x52755d, accent: 0x5fa777 },
      breakRoom: { floor1: 0xe8f0f4, floor2: 0xdce8ef, wall: 0x5f7380, accent: 0x7ca0b9 },
    },
    departments: {
      planning: {
        name: { ko: "조사전략실", en: "Research Strategy", ja: "調査戦略室", zh: "调研战略室" },
        icon: "🧭",
        agentPrefix: { ko: "전략 분석가", en: "Strategy Analyst", ja: "戦略アナリスト", zh: "策略分析师" },
        avatarPool: ["🧭", "🗺️", "📌"],
      },
      dev: {
        name: { ko: "크롤링팀", en: "Crawler Team", ja: "クロール班", zh: "爬取组" },
        icon: "🕸️",
        agentPrefix: { ko: "수집 엔지니어", en: "Collection Engineer", ja: "収集エンジニア", zh: "采集工程师" },
        avatarPool: ["🕸️", "🔗", "🧠"],
      },
      qa: {
        name: { ko: "팩트체크팀", en: "Fact Check", ja: "ファクトチェック", zh: "事实核验组" },
        icon: "✅",
        agentPrefix: { ko: "검증관", en: "Verifier", ja: "検証官", zh: "核验员" },
        avatarPool: ["✅", "🔍", "📎"],
      },
    },
    staff: {
      nonLeaderDeptCycle: ["planning", "dev", "qa", "dev", "planning", "qa", "operations", "devsecops"],
    },
  },
  novel: {
    key: "novel",
    slug: "NOV",
    label: {
      ko: "소설 스튜디오",
      en: "Novel Studio",
      ja: "小説スタジオ",
      zh: "小说工作室",
    },
    summary: {
      ko: "세계관/캐릭터/서사 중심 구성",
      en: "Worldbuilding, character and narrative setup",
      ja: "世界観・キャラ・物語中心",
      zh: "世界观/角色/叙事导向",
    },
    roomThemes: {
      ceoOffice: { floor1: 0xefe3d8, floor2: 0xe7d6c9, wall: 0x7c5d4b, accent: 0xb86b45 },
      planning: { floor1: 0xf2e7dc, floor2: 0xebddcf, wall: 0x7f624e, accent: 0xb97c4f },
      dev: { floor1: 0xe8e0f2, floor2: 0xdfd6eb, wall: 0x6e5a90, accent: 0x8d76bb },
      design: { floor1: 0xf6e3ea, floor2: 0xf0d8e1, wall: 0x885a6d, accent: 0xbc708f },
      qa: { floor1: 0xf3ece4, floor2: 0xece1d7, wall: 0x7f6b5a, accent: 0xa88468 },
      devsecops: { floor1: 0xe8e6ef, floor2: 0xddd9e8, wall: 0x5f5f7f, accent: 0x7b7ca8 },
      operations: { floor1: 0xe6efe8, floor2: 0xdce8e0, wall: 0x58735f, accent: 0x6b9a79 },
      breakRoom: { floor1: 0xf0e3cf, floor2: 0xe8d6bd, wall: 0x8a6f55, accent: 0xbc8b58 },
    },
    departments: {
      planning: {
        name: { ko: "세계관실", en: "Worldbuilding", ja: "世界観室", zh: "世界观组" },
        icon: "🌌",
        agentPrefix: { ko: "세계관 작가", en: "Lore Writer", ja: "設定作家", zh: "设定作者" },
        avatarPool: ["🌌", "📜", "🧭"],
      },
      dev: {
        name: { ko: "서사엔진팀", en: "Narrative Engine", ja: "物語エンジン", zh: "叙事引擎组" },
        icon: "✍️",
        agentPrefix: { ko: "서사 설계자", en: "Narrative Architect", ja: "物語設計者", zh: "叙事架构师" },
        avatarPool: ["✍️", "🖋️", "📘"],
      },
      design: {
        name: { ko: "캐릭터 아트팀", en: "Character Art", ja: "キャラアート", zh: "角色美术组" },
        icon: "🎭",
        agentPrefix: { ko: "캐릭터 디자이너", en: "Character Designer", ja: "キャラデザ", zh: "角色设计师" },
        avatarPool: ["🎭", "🧵", "🎨"],
      },
      qa: {
        name: { ko: "톤 검수팀", en: "Tone QA", ja: "トーン検証", zh: "语气审校组" },
        icon: "🪶",
        agentPrefix: { ko: "문체 검수관", en: "Style Reviewer", ja: "文体レビュア", zh: "文风审校员" },
        avatarPool: ["🪶", "📖", "✅"],
      },
    },
    staff: {
      nonLeaderDeptCycle: ["planning", "design", "dev", "design", "planning", "qa", "design", "operations"],
    },
  },
  video_preprod: {
    key: "video_preprod",
    slug: "VID",
    label: {
      ko: "영상 프리프로덕션",
      en: "Video Pre-production",
      ja: "映像プリプロ",
      zh: "视频前期策划",
    },
    summary: {
      ko: "콘티/샷리스트/편집 노트 중심",
      en: "Storyboard and shot-list focused setup",
      ja: "コンテ・ショットリスト中心",
      zh: "分镜与镜头清单导向",
    },
    roomThemes: {
      ceoOffice: { floor1: 0x1f1f25, floor2: 0x17171c, wall: 0x343748, accent: 0xd18d35 },
      planning: { floor1: 0x25212b, floor2: 0x1c1923, wall: 0x44405b, accent: 0xbc7d47 },
      dev: { floor1: 0x1d2631, floor2: 0x17202a, wall: 0x334961, accent: 0x4c8fca },
      design: { floor1: 0x2a2230, floor2: 0x211a27, wall: 0x544063, accent: 0xc274b7 },
      qa: { floor1: 0x2a2425, floor2: 0x211d1f, wall: 0x5a494b, accent: 0xb98862 },
      devsecops: { floor1: 0x1f242c, floor2: 0x182028, wall: 0x3b4d62, accent: 0x6f8fb0 },
      operations: { floor1: 0x1f2a25, floor2: 0x18211d, wall: 0x3e5d50, accent: 0x62a789 },
      breakRoom: { floor1: 0x2a2622, floor2: 0x211d1a, wall: 0x564c43, accent: 0xbd8a49 },
    },
    departments: {
      planning: {
        name: { ko: "프리프로덕션팀", en: "Pre-production", ja: "プリプロ班", zh: "前期策划组" },
        icon: "🎬",
        agentPrefix: { ko: "프로듀서", en: "Producer", ja: "プロデューサ", zh: "制片" },
        avatarPool: ["🎬", "📽️", "🧭"],
      },
      dev: {
        name: { ko: "씬 엔진팀", en: "Scene Engine", ja: "シーン設計", zh: "场景引擎组" },
        icon: "🎞️",
        agentPrefix: { ko: "씬 디렉터", en: "Scene Director", ja: "シーン監督", zh: "场景导演" },
        avatarPool: ["🎞️", "🧱", "🔧"],
      },
      design: {
        name: { ko: "아트/촬영팀", en: "Art & Camera", ja: "アート撮影", zh: "美术摄影组" },
        icon: "📷",
        agentPrefix: { ko: "촬영 디자이너", en: "Camera Designer", ja: "撮影デザイナ", zh: "摄影设计师" },
        avatarPool: ["📷", "🎨", "💡"],
      },
      qa: {
        name: { ko: "컷 검수팀", en: "Cut QA", ja: "カット検証", zh: "镜头审校组" },
        icon: "🧪",
        agentPrefix: { ko: "컷 검수관", en: "Cut Reviewer", ja: "カットレビュア", zh: "镜头审校员" },
        avatarPool: ["🧪", "✅", "📌"],
      },
    },
    staff: {
      nonLeaderDeptCycle: ["planning", "design", "operations", "dev", "design", "planning", "qa", "operations"],
    },
  },
  roleplay: {
    key: "roleplay",
    slug: "RPG",
    label: {
      ko: "롤플레이 스튜디오",
      en: "Roleplay Studio",
      ja: "ロールプレイスタジオ",
      zh: "角色扮演工作室",
    },
    summary: {
      ko: "캐릭터 연기와 대사 몰입 중심",
      en: "Character role and dialogue immersion",
      ja: "キャラ演技と会話没入",
      zh: "角色演绎与对话沉浸",
    },
    roomThemes: {
      ceoOffice: { floor1: 0xf3e7dc, floor2: 0xebdbc9, wall: 0x7d5c4d, accent: 0xbe6f53 },
      planning: { floor1: 0xefe6f6, floor2: 0xe5dbef, wall: 0x6a5d91, accent: 0x8a74c0 },
      dev: { floor1: 0xe6edf8, floor2: 0xdce6f4, wall: 0x576d91, accent: 0x6f8fd1 },
      design: { floor1: 0xf6e3f2, floor2: 0xefd8e9, wall: 0x835b80, accent: 0xc36eb4 },
      qa: { floor1: 0xf5efe6, floor2: 0xeee3d8, wall: 0x7f6d5c, accent: 0xb7956d },
      devsecops: { floor1: 0xe8ecf5, floor2: 0xdde4ef, wall: 0x566479, accent: 0x6d86ab },
      operations: { floor1: 0xe9f2ea, floor2: 0xdfeadf, wall: 0x5b7660, accent: 0x6fae7e },
      breakRoom: { floor1: 0xf4e8d5, floor2: 0xecdcc3, wall: 0x8a7458, accent: 0xc59a5e },
    },
    departments: {
      planning: {
        name: { ko: "캐릭터기획실", en: "Character Planning", ja: "キャラ企画室", zh: "角色企划室" },
        icon: "🎭",
        agentPrefix: { ko: "캐릭터 플래너", en: "Character Planner", ja: "キャラ企画", zh: "角色策划" },
        avatarPool: ["🎭", "🧠", "📜"],
      },
      dev: {
        name: { ko: "대사엔진팀", en: "Dialogue Engine", ja: "会話エンジン", zh: "对话引擎组" },
        icon: "🗣️",
        agentPrefix: { ko: "대사 연출가", en: "Dialogue Director", ja: "台詞演出", zh: "台词导演" },
        avatarPool: ["🗣️", "💬", "🎙️"],
      },
      design: {
        name: { ko: "연출아트팀", en: "Stage Art", ja: "演出アート", zh: "演出美术组" },
        icon: "🎨",
        agentPrefix: { ko: "연출 디자이너", en: "Stage Designer", ja: "演出デザイナ", zh: "演出设计师" },
        avatarPool: ["🎨", "✨", "🎬"],
      },
      qa: {
        name: { ko: "캐릭터검수팀", en: "Character QA", ja: "キャラ検証", zh: "角色审校组" },
        icon: "🔐",
        agentPrefix: { ko: "설정 검수관", en: "Lore Reviewer", ja: "設定レビュア", zh: "设定审校员" },
        avatarPool: ["🔐", "✅", "🧪"],
      },
    },
    staff: {
      nonLeaderDeptCycle: ["planning", "design", "dev", "design", "qa", "planning", "operations", "design"],
    },
  },
};

export function normalizeOfficeWorkflowPack(value: unknown): WorkflowPackKey {
  if (typeof value !== "string") return "development";
  return value in PACK_PRESETS ? (value as WorkflowPackKey) : "development";
}

function pickText(locale: UiLanguageLike, text: Localized): string {
  switch (locale) {
    case "ko":
      return text.ko;
    case "ja":
      return text.ja || text.en;
    case "zh":
      return text.zh || text.en;
    case "en":
    default:
      return text.en;
  }
}

function localizedNumberedName(
  locale: UiLanguageLike,
  prefix: Localized,
  order: number,
): { name: string; name_ko: string; name_ja: string; name_zh: string } {
  return {
    name: `${prefix.en} ${order}`,
    name_ko: `${prefix.ko} ${order}`,
    name_ja: `${prefix.ja} ${order}`,
    name_zh: `${prefix.zh} ${order}`,
  };
}

function localizedStaffDisplayName(params: {
  packKey: WorkflowPackKey;
  deptId: string;
  order: number;
  fallbackPrefix: Localized;
}): { name: string; name_ko: string; name_ja: string; name_zh: string } {
  const { packKey, deptId, order, fallbackPrefix } = params;
  const pool = DEPARTMENT_PERSON_NAME_POOL[deptId];
  if (!pool || pool.length === 0) {
    return localizedNumberedName("en", fallbackPrefix, order);
  }
  const seedOffset = PACK_SEED_PROFILE[packKey]?.nameOffset ?? 0;
  const base = pool[(order - 1 + seedOffset) % pool.length] ?? pool[0];
  const cycle = Math.floor((order - 1) / pool.length) + 1;
  const suffix = cycle > 1 ? ` ${cycle}` : "";
  return {
    name: `${base.en}${suffix}`,
    name_ko: `${base.ko}${suffix}`,
    name_ja: `${base.ja}${suffix}`,
    name_zh: `${base.zh}${suffix}`,
  };
}

function resolveSeedSpriteNumber(
  params: {
    packKey: WorkflowPackKey;
    deptId: string;
    role: AgentRole;
    order: number;
  },
  usedSpriteNumbers: Set<number>,
): number {
  const seed = `${params.packKey}:${params.deptId}:${params.role}:${params.order}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const poolSize = OFFICE_SEED_SPRITE_POOL.length;
  const start = hash % poolSize;
  for (let offset = 0; offset < poolSize; offset += 1) {
    const candidate = OFFICE_SEED_SPRITE_POOL[(start + offset) % poolSize];
    if (candidate != null && !usedSpriteNumbers.has(candidate)) {
      return candidate;
    }
  }
  return OFFICE_SEED_SPRITE_POOL[start] ?? 1;
}

function buildSeedPersonality(params: {
  packKey: WorkflowPackKey;
  deptId: string;
  role: AgentRole;
  locale: UiLanguageLike;
  defaultPrefix: Localized;
  departmentName: { ko: string; en: string; ja: string; zh: string };
}): string | null {
  if (params.packKey === "development") return null;
  const tone = PACK_SEED_PROFILE[params.packKey]?.tone;
  if (!tone) return null;
  const locale = params.locale;
  const roleLabelMap: Record<UiLanguageLike, Record<AgentRole, string>> = {
    ko: {
      team_leader: "팀 리드",
      senior: "시니어",
      junior: "주니어",
      intern: "인턴",
    },
    en: {
      team_leader: "team lead",
      senior: "senior member",
      junior: "junior member",
      intern: "intern",
    },
    ja: {
      team_leader: "チームリーダー",
      senior: "シニア",
      junior: "ジュニア",
      intern: "インターン",
    },
    zh: {
      team_leader: "团队负责人",
      senior: "高级成员",
      junior: "初级成员",
      intern: "实习成员",
    },
  };
  const focusByLocale: Record<UiLanguageLike, string> = {
    ko: params.defaultPrefix.ko?.trim() || `${params.departmentName.ko} 담당`,
    en: params.defaultPrefix.en?.trim() || `${params.departmentName.en} coverage`,
    ja: params.defaultPrefix.ja?.trim() || `${params.departmentName.ja}担当`,
    zh: params.defaultPrefix.zh?.trim() || `${params.departmentName.zh}职责`,
  };
  const roleLabel = roleLabelMap[locale][params.role];
  const focus = focusByLocale[locale];
  const toneText = pickText(locale, tone);
  if (locale === "ko") return `${toneText} ${focus} 역할의 ${roleLabel}입니다.`;
  if (locale === "ja") return `${toneText} ${focus}を担当する${roleLabel}として動きます。`;
  if (locale === "zh") return `${toneText} 作为负责${focus}的${roleLabel}推进工作。`;
  return `${toneText} Serves as a ${roleLabel} focused on ${focus}.`;
}

function buildPackDepartmentDescription(params: {
  locale: UiLanguageLike;
  packSummary: Localized;
  departmentName: Localized;
}): string {
  const { locale, packSummary, departmentName } = params;
  const summary = pickText(locale, packSummary);
  const deptName = pickText(locale, departmentName);
  if (locale === "ko") return `${deptName}입니다. ${summary} 목표를 중심으로 협업합니다.`;
  if (locale === "ja") return `${deptName}です。${summary}の目標達成に向けて連携します。`;
  if (locale === "zh") return `${deptName}团队。围绕${summary}目标协作推进。`;
  return `${deptName} team. Collaborates to deliver the ${summary.toLowerCase()} goal.`;
}

function buildPackDepartmentPrompt(params: {
  locale: UiLanguageLike;
  packSummary: Localized;
  departmentName: Localized;
}): string {
  const { locale, packSummary, departmentName } = params;
  const summary = pickText(locale, packSummary);
  const deptName = pickText(locale, departmentName);
  if (locale === "ko") {
    return `[부서 역할] ${deptName}\n[업무 기준] ${summary}\n요청을 실행 가능한 단계로 나누고, 근거와 산출물을 명확히 제시하세요.`;
  }
  if (locale === "ja") {
    return `[部署の役割] ${deptName}\n[業務基準] ${summary}\n依頼を実行可能なステップに分解し、根拠と成果物を明確に提示してください。`;
  }
  if (locale === "zh") {
    return `[部门职责] ${deptName}\n[执行基准] ${summary}\n请将请求拆分为可执行步骤，并清晰提供依据与产出物。`;
  }
  return `[Department Role] ${deptName}\n[Execution Standard] ${summary}\nBreak requests into actionable steps and clearly provide rationale and deliverables.`;
}

export function getOfficePackMeta(packKey: WorkflowPackKey): { label: Localized; summary: Localized } {
  const preset = PACK_PRESETS[packKey] ?? PACK_PRESETS.development;
  return { label: preset.label, summary: preset.summary };
}

export function getOfficePackRoomThemes(packKey: WorkflowPackKey): Record<string, RoomTheme> {
  const preset = PACK_PRESETS[packKey] ?? PACK_PRESETS.development;
  return preset.roomThemes;
}

export function listOfficePackOptions(locale: UiLanguageLike): Array<{
  key: WorkflowPackKey;
  label: string;
  summary: string;
  slug: string;
  accent: number;
}> {
  return (Object.keys(PACK_PRESETS) as WorkflowPackKey[]).map((key) => ({
    key,
    label:
      key === "development"
        ? locale === "ko"
          ? "CTA 오피스"
          : locale === "ja"
            ? "CTA オフィス"
            : locale === "zh"
              ? "CTA 办公室"
              : "CTA Office"
        : pickText(locale, PACK_PRESETS[key].label),
    summary:
      key === "development"
        ? locale === "ko"
          ? "Coin Trading Agent 운영 팩"
          : locale === "ja"
            ? "Coin Trading Agent 運用パック"
            : locale === "zh"
              ? "Coin Trading Agent 运营包"
              : "Coin Trading Agent operating pack"
        : pickText(locale, PACK_PRESETS[key].summary),
    slug: key === "development" ? "CTA" : PACK_PRESETS[key].slug,
    accent: PACK_PRESETS[key].roomThemes.ceoOffice?.accent ?? 0x5a9fd4,
  }));
}

export function buildOfficePackPresentation(params: {
  packKey: WorkflowPackKey;
  locale: UiLanguageLike;
  departments: Department[];
  agents: Agent[];
  customRoomThemes: Record<string, RoomTheme>;
}): OfficePackPresentation {
  const { packKey, locale, departments, agents, customRoomThemes } = params;
  if (packKey === "development") {
    return {
      departments,
      agents,
      roomThemes: customRoomThemes,
    };
  }

  const preset = PACK_PRESETS[packKey] ?? PACK_PRESETS.development;
  const transformedDepartments = departments.map((dept) => {
    const deptPreset = preset.departments[dept.id];
    if (!deptPreset) return dept;
    const localizedName: Localized = {
      ko: deptPreset.name.ko || dept.name_ko || dept.name,
      en: deptPreset.name.en || dept.name,
      ja: deptPreset.name.ja || dept.name_ja || dept.name,
      zh: deptPreset.name.zh || dept.name_zh || dept.name,
    };
    return {
      ...dept,
      icon: deptPreset.icon,
      name: deptPreset.name.en,
      name_ko: deptPreset.name.ko,
      name_ja: deptPreset.name.ja,
      name_zh: deptPreset.name.zh,
      description: buildPackDepartmentDescription({
        locale,
        packSummary: preset.summary,
        departmentName: localizedName,
      }),
      prompt: buildPackDepartmentPrompt({
        locale,
        packSummary: preset.summary,
        departmentName: localizedName,
      }),
    };
  });

  return {
    departments: transformedDepartments,
    agents,
    roomThemes: {
      ...customRoomThemes,
      ...preset.roomThemes,
    },
  };
}

export function resolveOfficePackSeedProvider(params: {
  packKey: WorkflowPackKey;
  departmentId?: string | null;
  role: AgentRole;
  seedIndex: number;
  seedOrderInDepartment?: number;
}): OfficePackSeedProvider {
  if (params.packKey === "development") return "claude";
  const dept = String(params.departmentId ?? "")
    .trim()
    .toLowerCase();
  if (dept === "planning") {
    const order = params.seedOrderInDepartment ?? params.seedIndex;
    return order % 2 === 0 ? "codex" : "claude";
  }
  if (dept === "dev" || dept === "design") return "claude";
  if (dept === "devsecops" || dept === "operations" || dept === "qa") return "codex";
  return params.seedIndex % 2 === 0 ? "codex" : "claude";
}

export function buildOfficePackStarterAgents(params: {
  packKey: WorkflowPackKey;
  departments: Department[];
  targetCount?: number;
  locale?: UiLanguageLike;
}): OfficePackStarterAgentDraft[] {
  const { packKey, departments } = params;
  const locale = params.locale ?? "en";
  if (packKey === "development") return [];
  const preset = PACK_PRESETS[packKey] ?? PACK_PRESETS.development;
  const departmentById = new Map(departments.map((department) => [department.id, department]));
  const baseDeptOrder = ["planning", "dev", "design", "qa", "operations", "devsecops"].filter((deptId) =>
    departmentById.has(deptId),
  );
  if (baseDeptOrder.length === 0) return [];

  const nonLeaderCycle = (preset.staff?.nonLeaderDeptCycle ?? []).filter((deptId) => departmentById.has(deptId)) || [];
  const planningLeadDeptIds =
    (preset.staff?.planningLeadDeptIds ?? ["planning"]).filter((deptId) => departmentById.has(deptId)) || [];
  const workerCycle = nonLeaderCycle.length > 0 ? nonLeaderCycle : baseDeptOrder;
  const rolePool: AgentRole[] = ["senior", "junior", "intern"];
  const desiredCount = Math.max(baseDeptOrder.length + 2, params.targetCount ?? Math.min(10, baseDeptOrder.length * 2));

  const perDeptCounter = new Map<string, number>();
  const usedSpriteNumbers = new Set<number>();
  const result: OfficePackStarterAgentDraft[] = [];

  const resolveDeptPrefix = (deptId: string): Localized => {
    const presetInfo = preset.departments[deptId];
    if (presetInfo) return presetInfo.agentPrefix;
    const department = departmentById.get(deptId);
    const baseName = department?.name ?? deptId;
    const baseNameKo = department?.name_ko ?? baseName;
    const baseNameJa = department?.name_ja ?? baseName;
    const baseNameZh = department?.name_zh ?? baseName;
    return {
      ko: `${baseNameKo} 팀원`,
      en: `${baseName} Member`,
      ja: `${baseNameJa} メンバー`,
      zh: `${baseNameZh} 成员`,
    };
  };

  const resolveAvatar = (deptId: string, order: number): string => {
    const presetInfo = preset.departments[deptId];
    if (presetInfo && presetInfo.avatarPool.length > 0) {
      return presetInfo.avatarPool[(order - 1) % presetInfo.avatarPool.length] ?? presetInfo.icon;
    }
    return departmentById.get(deptId)?.icon ?? "🤖";
  };

  const pushAgent = (deptId: string, role: AgentRole) => {
    const nextOrder = (perDeptCounter.get(deptId) ?? 0) + 1;
    perDeptCounter.set(deptId, nextOrder);
    const prefix = resolveDeptPrefix(deptId);
    const department = departmentById.get(deptId);
    const localizedNames = localizedStaffDisplayName({
      packKey,
      deptId,
      order: nextOrder,
      fallbackPrefix: prefix,
    });
    const spriteNumber = resolveSeedSpriteNumber(
      {
        packKey,
        deptId,
        role,
        order: nextOrder,
      },
      usedSpriteNumbers,
    );
    usedSpriteNumbers.add(spriteNumber);
    result.push({
      ...localizedNames,
      department_id: deptId,
      seed_order_in_department: nextOrder,
      role,
      acts_as_planning_leader: role === "team_leader" && planningLeadDeptIds.includes(deptId) ? 1 : 0,
      avatar_emoji: resolveAvatar(deptId, nextOrder),
      sprite_number: spriteNumber,
      personality: buildSeedPersonality({
        packKey,
        deptId,
        role,
        locale,
        defaultPrefix: prefix,
        departmentName: {
          ko: department?.name_ko || department?.name || deptId,
          en: department?.name || department?.name_ko || deptId,
          ja: department?.name_ja || department?.name || deptId,
          zh: department?.name_zh || department?.name || deptId,
        },
      }),
    });
  };

  for (const deptId of baseDeptOrder) {
    pushAgent(deptId, "team_leader");
  }

  let cursor = 0;
  while (result.length < desiredCount) {
    const deptId = workerCycle[cursor % workerCycle.length];
    const role = rolePool[cursor % rolePool.length] ?? "junior";
    if (!deptId) break;
    pushAgent(deptId, role);
    cursor += 1;
  }

  return result;
}
