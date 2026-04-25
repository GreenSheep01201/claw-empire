export function shouldTreatDirectChatAsTask(ceoMessage: string, messageType: string): boolean {
  if (messageType === "task_assign") return true;
  if (messageType === "report") return false;
  const text = ceoMessage.trim();
  if (!text) return false;
  if (/^\[(의사결정\s*회신|decision\s*reply|意思決定返信|决策回复)\]/i.test(text)) return false;

  if (/^\s*(task|todo|업무|지시|작업|할일|tarefa|trabalho)\s*[:-]/i.test(text)) return true;

  const taskKeywords =
    /(테스트|검증|확인해|진행해|수정해|구현해|반영해|처리해|해줘|부탁|검토|검수|리뷰|평가|분석|보고서|작성해|파악|업무|작업|요청|fix|implement|refactor|test|verify|check|review|audit|analyze|analysis|report|run|apply|update|debug|investigate|対応|確認|修正|実装|レビュー|監査|分析|报告|评估|测试|检查|修复|处理|审查|审核|crie|cria|criar|criando|faça|faca|faz|fazer|fazendo|monte|monta|montar|implemente|implementa|implementar|corrija|corrige|corrigir|conserte|conserta|consertar|ajuste|ajusta|ajustar|gere|gera|gerar|escreva|escreve|escrever|verifique|verifica|verificar|teste|testa|testar|revise|revisa|revisar|analise|analisa|analisar|investigue|investiga|investigar|melhore|melhora|melhorar|otimize|otimiza|otimizar|refatore|refatora|refatorar|atualize|atualiza|atualizar|adicione|adiciona|adicionar|remova|remove|remover|delete|deleta|deletar|relatorio|relatório|tarefa|trabalho|implementação|implementacao)/i;
  if (taskKeywords.test(text)) return true;

  const requestTone =
    /(해주세요|해 주세요|부탁해|부탁합니다|해줄래|해줘요|please|can you|could you|would you|お願いします|してください|请|麻烦|por favor|pode|poderia|consegue|conseguiria|me ajuda|me ajude)/i;
  if (requestTone.test(text) && text.length >= 12) return true;

  const requestIntent =
    /(필요해|필요합니다|원해|원합니다|받고싶|받고 싶|해보고 싶|want|need|i need|i want|してほしい|必要|想要|需要|preciso|necessito|quero|gostaria|gostariamos|preciso de|preciso da|preciso do)/i;
  if (
    requestIntent.test(text) &&
    /(검토|검수|리뷰|평가|분석|보고서|업무|작업|review|audit|analy|report|revisão|revisao|auditoria|análise|analise|relatório|relatorio|tarefa|trabalho|projeto)/i.test(text)
  ) {
    return true;
  }

  const analysisRequestVerb =
    /(찾아와|찾아와줘|찾아줘|파악해|파악해줘|조사해|조사해줘|점검해|점검해줘|정리해|정리해줘|추려줘|도출해|도출해줘|identify|find|inspect|investigate|analyze|review|audit|analise|analisa|analisar|investigue|investiga|investigar|inspecione|inspeciona|examine|examina|verifique|verifica|revise|revisa|audite|audita|encontre|encontra|identifique|identifica)/i;
  const softwareContext =
    /(소스코드|코드|repo|repository|프로젝트|모듈|파일|이슈|버그|취약점|리팩터|리팩토링|test|build|lint|tsc|보고서|report|projeto|código|codigo|código-fonte|codigo-fonte|repositório|repositorio|módulo|modulo|arquivo|issue|bug|vulnerabilidade|refator|refatoração|refatoracao|relatório|relatorio)/i;
  if (analysisRequestVerb.test(text) && softwareContext.test(text)) {
    return true;
  }

  return false;
}

export function isProjectProgressInquiry(text: string, messageType: string = "chat"): boolean {
  if (messageType === "task_assign") return false;
  const normalized = text.trim();
  if (!normalized) return false;

  const progressPatterns = [
    /(진행\s*상황|진행상황|진척|현황|어디까지|상태\s*(어때|어떄|어떤|좀|확인)|업데이트|task\s*현황|tasks?\s*상황)/i,
    /(project|task).*(status|progress|update|where are we|how far)/i,
    /(status|progress|update).*(project|task)/i,
    /(進捗|状況|ステータス|どこまで|更新)/i,
    /(进度|状态|进展|到哪了|更新)/i,
  ];
  if (!progressPatterns.some((pattern) => pattern.test(normalized))) return false;

  const projectScopeHints = [/(프로젝트|project|task|tasks|업무|작업)/i, /(このプロジェクト|项目|任务|進捗)/i];
  return (
    projectScopeHints.some((pattern) => pattern.test(normalized)) ||
    /어디까지|how far|どこまで|到哪了/i.test(normalized)
  );
}

export function isTaskKickoffMessage(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[!?.。！？…~]+$/g, "");
  if (!normalized) return false;
  if (/^(고고|ㄱㄱ|가자|가즈아|진행|진행해|시작|시작해|착수|착수해|바로 진행|바로해)$/i.test(normalized)) return true;
  if (/^(go|go go|gogo|let'?s go|start|proceed|execute|go ahead)$/i.test(normalized)) return true;
  if (/^(vai|bora|manda|manda bala|toca|toca o barco|começa|comeca|começar|comecar|iniciar|prossegue|prossiga|prosseguir|executa|executar|segue|seguir|fecha|fechou)$/i.test(normalized))
    return true;
  return false;
}

export function isAffirmativeReply(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[!?.。！？…~]+$/g, "");
  if (!normalized) return false;

  const negativePatterns = [
    /^(아니|아니요|아뇨|노|안됨|하지마|중지|멈춰|스탑|stop|no|nope|nah|don'?t|not now|later|아직|다음에|やめて|いいえ|不要|不用|不行|先不要|n[aã]o|nao|negativo|de jeito nenhum|nem pensar|cancela|para com isso|depois|mais tarde|agora n[aã]o)/i,
  ];
  if (negativePatterns.some((pattern) => pattern.test(normalized))) return false;

  const affirmativePatterns = [
    /^(네|예|응|ㅇㅇ|좋아|좋아요|오케이|ok|okay|sure|yep|yeah|yes|go|go ahead|proceed|do it|start|let'?s go|let?s do it|진행|시작|착수|바로 해|콜|ㄱㄱ|고고)/i,
    /^(はい|了解|お願いします|進めて|進めてください|開始して|いいよ|いいです|実行して)/i,
    /^(好|好的|可以|行|开始吧|继续|请开始|执行吧|马上开始)/i,
    /^(sim|claro|beleza|blz|pode|pode ser|isso|isso a[ií]|isso ai|positivo|com certeza|certo|certinho|t[aá] bom|ta bom|tudo certo|tudo bem|fechou|fechado|combinado|bora|vai|manda|manda bala|valeu|aprovado|prossegue|prossiga|segue|segue o jogo|segue o baile|de boa|tranquilo)/i,
  ];
  return affirmativePatterns.some((pattern) => pattern.test(normalized));
}

export function isAgentEscalationPrompt(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  const patterns = [
    /(바로\s*)?(시작|진행|착수).*(할까요|할까|할게요\?|해도 될까요|진행해도 될까요)/i,
    /(업무|작업|요청|평가|리뷰|검토).*(진행|시작).*(할까요|해볼까요|해도 될까요)/i,
    /(shall i|should i|would you like me to|may i|can i).*(start|proceed|execute|run|begin)/i,
    /(start now|proceed now|go ahead\?)/i,
    /(開始|進行).*(しましょうか|していいですか|しますか)/i,
    /(现在|现在就).*(开始|执行).*(吗|？|\?)/i,
    /(要不要|是否).*(开始|执行)/i,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

export function isCancelReply(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  return /^(취소|중지|멈춰|그만|나중에|cancel|stop|abort|later|not now|いいえ|中止|不要|先不要|cancela|cancelar|cancelado|para|parar|parou|chega|deixa|deixa pra l[aá]|depois|mais tarde|agora n[aã]o|esquece|abandona|aborta|abortar)/i.test(
    normalized,
  );
}

export function isNoPathReply(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;
  const patterns = [
    /(경로|프로젝트).*없/,
    /(모르겠|몰라|기억안)/,
    /(no path|don't have.*path|no project path|without path|unknown path)/i,
    /(create new project|new project please|make new project)/i,
    /(路径).*没有|没有路径|新建项目|新项目/,
    /(パス).*ない|新規プロジェクト/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

export function detectProjectKindChoice(text: string): "existing" | "new" | null {
  const raw = text.trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const compact = normalized.replace(/[^\p{L}\p{N}]+/gu, "");

  const numericExisting =
    /(?:^|\s)1(?:번|번째)?(?:으로|로)?(?:\s|$)/.test(normalized) || /1️⃣/.test(raw) || compact === "1";
  const numericNew = /(?:^|\s)2(?:번|번째)?(?:으로|로)?(?:\s|$)/.test(normalized) || /2️⃣/.test(raw) || compact === "2";
  if (numericExisting && !numericNew) return "existing";
  if (numericNew && !numericExisting) return "new";

  const existingHit =
    /(?:기존\s*프로젝트|기존\b|기존으로|기존거|있던\s*거|원래\s*있던|existing\s*project|existing\s*one|\bexisting\b|already\s*project|already\s*existing|既存プロジェクト|既存|已有项目|已有|projeto\s*existente|existente|\batual\b|projeto\s*atual|j[aá]\s*existente|que\s*j[aá]\s*existe)/i.test(
      raw,
    ) ||
    compact.includes("기존프로젝트") ||
    compact.includes("projetoexistente") ||
    compact.includes("projetoatual");
  const newHit =
    /(신규\s*프로젝트|신규\b|신규로|새\s*프로젝트|새로\s*프로젝트|새거|new\s*project|\bnew\b|新規プロジェクト|新規|新项目|projeto\s*novo|novo\s*projeto|\bnovo\b)/i.test(
      raw,
    ) ||
    compact.includes("새프로젝트") ||
    compact.includes("신규프로젝트") ||
    compact.includes("newproject") ||
    compact.includes("projetonovo") ||
    compact.includes("novoprojeto");

  if (existingHit && !newHit) return "existing";
  if (newHit && !existingHit) return "new";
  return null;
}

export function shouldPreserveStructuredFallback(fallback: string): boolean {
  const text = fallback.trim();
  if (!text) return false;

  if (/[1-9]️⃣/.test(text)) return true;
  if (/(회신|reply|選択|请选择|번호)\s*[:(]/i.test(text)) return true;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;

  const hasListLikeLine = lines.some((line) => /^(\d+[.)]|[-*•])\s+/.test(line) || /^[1-9]️⃣/.test(line));
  if (hasListLikeLine) return true;

  const hasPathLabel = lines.some((line) => /(path|경로|パス|路径)\s*:/i.test(line));
  if (hasPathLabel) return true;

  return false;
}

function isTaskReadinessMessage(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  if (shouldTreatDirectChatAsTask(normalized, "chat")) return true;
  const readinessPatterns = [
    /(업무|작업|지시|요청|평가|리뷰|검토|분석|문서화|구현|수정|개선|진행).*(가능|할\s*수|할수|되나|될까)/i,
    /(가능|할\s*수|할수|가능해|가능합|can\s+you|possible).*(업무|작업|지시|요청|평가|리뷰|검토|분석|문서화|구현|수정|개선|진행)/i,
    /(go ahead|can proceed|ready to start|start this)/i,
  ];
  return readinessPatterns.some((pattern) => pattern.test(normalized));
}

type RecentCeoMessage = {
  content: string;
  messageType?: string | null;
  createdAt?: number | null;
};

export function resolveContextualTaskMessage(
  currentMessage: string,
  recentCeoMessages: RecentCeoMessage[],
  recentAgentMessages: Array<{ content: string; createdAt?: number | null }> = [],
): string | null {
  const kickoff = isTaskKickoffMessage(currentMessage);
  const affirmative = isAffirmativeReply(currentMessage);
  if (!kickoff && !affirmative) return null;
  const current = currentMessage.trim();

  const escalationPromptTs = recentAgentMessages
    .filter((row) => isAgentEscalationPrompt(row.content))
    .map((row) => row.createdAt ?? 0)
    .sort((a, b) => b - a)[0];
  if (affirmative && !kickoff && !escalationPromptTs) return null;

  for (const row of recentCeoMessages) {
    const candidate = (row.content || "").trim();
    if (!candidate) continue;
    if (candidate === current) continue;
    if (affirmative && escalationPromptTs) {
      const candidateTs = row.createdAt ?? 0;
      if (candidateTs > escalationPromptTs) continue;
    }
    if (shouldTreatDirectChatAsTask(candidate, row.messageType ?? "chat") || isTaskReadinessMessage(candidate)) {
      return candidate;
    }
  }
  return null;
}

function splitSentences(text: string): string[] {
  return (
    text
      .match(/[^.!?…。！？]+[.!?…。！？]?/gu)
      ?.map((part) => part.trim())
      .filter(Boolean) ?? [text.trim()]
  ).filter(Boolean);
}

function collapseAdjacentRepeatedSentenceBlocks(sentences: string[]): string[] {
  const next = [...sentences];
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let blockSize = Math.floor(next.length / 2); blockSize >= 1; blockSize -= 1) {
      for (let start = 0; start + blockSize * 2 <= next.length; start += 1) {
        let equal = true;
        for (let i = 0; i < blockSize; i += 1) {
          if (next[start + i] !== next[start + blockSize + i]) {
            equal = false;
            break;
          }
        }
        if (equal) {
          next.splice(start + blockSize, blockSize);
          changed = true;
          break outer;
        }
      }
    }
  }
  return next;
}

export function normalizeAgentReply(content: string): string {
  const trimmed = (content || "").trim();
  if (!trimmed) return "";

  const mergedWhitespace = trimmed
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
  if (!mergedWhitespace) return "";

  const repeatedBlock = mergedWhitespace.match(/^(.{6,}?)(?:\s+\1)+$/su);
  if (repeatedBlock?.[1]) {
    return repeatedBlock[1].trim();
  }

  const lines = mergedWhitespace
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length >= 2 && lines.every((line) => line === lines[0])) {
    return lines[0];
  }

  const dedupedSentences = collapseAdjacentRepeatedSentenceBlocks(splitSentences(mergedWhitespace));
  const sentenceNormalized = dedupedSentences.join(" ").trim();
  return sentenceNormalized || mergedWhitespace;
}
