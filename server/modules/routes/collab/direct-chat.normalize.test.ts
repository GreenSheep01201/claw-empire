import { describe, expect, it } from "vitest";
import {
  detectProjectKindChoice,
  isAffirmativeReply,
  isNoPathReply,
  isProjectProgressInquiry,
  isTaskKickoffMessage,
  normalizeAgentReply,
  resolveContextualTaskMessage,
  shouldPreserveStructuredFallback,
  shouldTreatDirectChatAsTask,
} from "./direct-chat.ts";

describe("normalizeAgentReply", () => {
  it("중복된 전체 응답 블록을 1회로 축약한다", () => {
    const input = "안녕하세요! 디자인팀 도로롱입니다, 대표님 ㅎㅎ 안녕하세요! 디자인팀 도로롱입니다, 대표님 ㅎㅎ";
    expect(normalizeAgentReply(input)).toBe("안녕하세요! 디자인팀 도로롱입니다, 대표님 ㅎㅎ");
  });

  it("연속 중복된 문장 블록(A+B+C, A+B+C)을 1회로 축약한다", () => {
    const input =
      "죄송합니다 대표님, 지금 시간 바로 확인해볼게요!앗 대표님, 지금 새벽 1시 30분이에요… 이 시간에 아직 안 주무시고 일하고 계신 건가요? 대표님도 좀 쉬셔야죠! 앗 대표님, 지금 새벽 1시 30분이에요… 이 시간에 아직 안 주무시고 일하고 계신 건가요? 대표님도 좀 쉬셔야죠!";
    expect(normalizeAgentReply(input)).toBe(
      "죄송합니다 대표님, 지금 시간 바로 확인해볼게요! 앗 대표님, 지금 새벽 1시 30분이에요… 이 시간에 아직 안 주무시고 일하고 계신 건가요? 대표님도 좀 쉬셔야죠!",
    );
  });

  it("중복이 없는 응답은 유지한다", () => {
    const input = "네 대표님, 점검 후 10분 내에 결과 공유드리겠습니다.";
    expect(normalizeAgentReply(input)).toBe(input);
  });
});

describe("task intent upgrade", () => {
  it("고고 같은 승인 메시지를 task kickoff로 인식한다", () => {
    expect(isTaskKickoffMessage("고고")).toBe(true);
    expect(isTaskKickoffMessage("go go!")).toBe(true);
    expect(isTaskKickoffMessage("좋은 아침")).toBe(false);
  });

  it("다국어 긍정 응답을 인식한다", () => {
    expect(isAffirmativeReply("네 진행해줘")).toBe(true);
    expect(isAffirmativeReply("yes, go ahead")).toBe(true);
    expect(isAffirmativeReply("はい、お願いします")).toBe(true);
    expect(isAffirmativeReply("好的，开始吧")).toBe(true);
    expect(isAffirmativeReply("아니 지금은 말고")).toBe(false);
  });

  it("경로 없음 응답을 다국어로 인식한다", () => {
    expect(isNoPathReply("경로 없어")).toBe(true);
    expect(isNoPathReply("I don't have project path")).toBe(true);
    expect(isNoPathReply("新建项目吧")).toBe(true);
    expect(isNoPathReply("path 있어")).toBe(false);
  });

  it("프로젝트 종류 선택 응답을 인식한다", () => {
    expect(detectProjectKindChoice("기존 프로젝트")).toBe("existing");
    expect(detectProjectKindChoice("있던거야")).toBe("existing");
    expect(detectProjectKindChoice("기존거로 할게")).toBe("existing");
    expect(detectProjectKindChoice("2")).toBe("new");
    expect(detectProjectKindChoice("new project")).toBe("new");
    expect(detectProjectKindChoice("새 프로젝트!")).toBe("new");
    expect(detectProjectKindChoice("신규로 진행해")).toBe("new");
    expect(detectProjectKindChoice("2번으로 할게")).toBe("new");
    expect(detectProjectKindChoice("기존으로 진행")).toBe("existing");
    expect(detectProjectKindChoice("아직 모르겠어")).toBeNull();
  });

  it("검토/리뷰 요청 문장을 task 의도로 인식한다", () => {
    expect(shouldTreatDirectChatAsTask("우리 프로젝트의 디자인 검수가 필요해", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("소스코드 리뷰 보고서 작성해줘", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("I need a design review report", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("우리 소스코드에서 고쳐야할점 3가지 찾아와", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("프로젝트 취약점 3개 조사해줘", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("오늘 날씨 어때?", "chat")).toBe(false);
  });

  it("의사결정 회신 마커는 task 의도로 승격하지 않는다", () => {
    expect(shouldTreatDirectChatAsTask("[decision reply] 1", "chat")).toBe(false);
    expect(shouldTreatDirectChatAsTask("[의사결정 회신] 2", "chat")).toBe(false);
  });

  it("승인 메시지는 직전 업무요청 문맥으로 승격한다", () => {
    const contextual = resolveContextualTaskMessage("고고", [
      { content: "고고", messageType: "chat", createdAt: 3000 },
      { content: "현재 소스코드 디자인 평가를 받고싶어 업무 진행 가능해?", messageType: "chat", createdAt: 2000 },
      { content: "네 대표님, 가능합니다!", messageType: "chat", createdAt: 1000 },
    ]);
    expect(contextual).toBe("현재 소스코드 디자인 평가를 받고싶어 업무 진행 가능해?");
  });

  it("승격 여부 질문 뒤 긍정 응답이면 다국어로도 문맥 승격한다", () => {
    const contextual = resolveContextualTaskMessage(
      "yes, please proceed",
      [
        { content: "yes, please proceed", messageType: "chat", createdAt: 3000 },
        {
          content: "Can you evaluate the current source-code design and run the task?",
          messageType: "chat",
          createdAt: 2000,
        },
      ],
      [{ content: "I can do that. Should I start right away?", createdAt: 2500 }],
    );
    expect(contextual).toBe("Can you evaluate the current source-code design and run the task?");
  });

  it("긍정 응답이더라도 승격 질문 문맥이 없으면 승격하지 않는다", () => {
    const contextual = resolveContextualTaskMessage(
      "yes",
      [
        { content: "yes", messageType: "chat", createdAt: 3000 },
        { content: "점심 뭐 먹을까요?", messageType: "chat", createdAt: 2000 },
      ],
      [{ content: "날씨 좋네요", createdAt: 2500 }],
    );
    expect(contextual).toBeNull();
  });

  it("업무 문맥이 없으면 승인 메시지를 승격하지 않는다", () => {
    const contextual = resolveContextualTaskMessage("고고", [
      { content: "고고", messageType: "chat", createdAt: 3000 },
      { content: "날씨 좋네요", messageType: "chat", createdAt: 2000 },
      { content: "점심 뭐 먹을까요?", messageType: "chat", createdAt: 1000 },
    ]);
    expect(contextual).toBeNull();
  });

  it("프로젝트 진행현황 질의를 인식한다", () => {
    expect(isProjectProgressInquiry("지금 프로젝트 진행상황 어디까지 왔어?")).toBe(true);
    expect(isProjectProgressInquiry("Can you share the current project task progress?")).toBe(true);
    expect(isProjectProgressInquiry("プロジェクト進捗どこまで？")).toBe(true);
    expect(isProjectProgressInquiry("当前项目任务进度怎么样？")).toBe(true);
    expect(isProjectProgressInquiry("프로젝트 디자인 검토 보고서 작성해줘")).toBe(false);
  });

  it("Brazilian Portuguese imperative requests are recognized as task intent", () => {
    expect(shouldTreatDirectChatAsTask("crie um SVG de cartão de visita pra Tyber Empire", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("faça uma landing page do projeto", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("monte um relatório das vendas do mês", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("implemente o login social com Google", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("corrija o bug do botão de checkout", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("ajuste o layout da home", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("gere um logo em PNG transparente", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("revise o pull request #42 por favor", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("analise o código do módulo de pagamento", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("teste o endpoint /api/users", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("refatore o repositório pra TypeScript estrito", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("preciso de uma análise do projeto", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("quero um relatório de bugs do mês", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("pode atualizar o README do repositório?", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("tarefa: deploy do staging", "chat")).toBe(true);
    expect(shouldTreatDirectChatAsTask("oi, tudo bem?", "chat")).toBe(false);
    expect(shouldTreatDirectChatAsTask("que dia é hoje?", "chat")).toBe(false);
  });

  it("Brazilian Portuguese affirmative and cancel replies are routed correctly", () => {
    expect(isAffirmativeReply("sim, pode prosseguir")).toBe(true);
    expect(isAffirmativeReply("claro")).toBe(true);
    expect(isAffirmativeReply("beleza, manda bala")).toBe(true);
    expect(isAffirmativeReply("isso aí")).toBe(true);
    expect(isAffirmativeReply("fechou")).toBe(true);
    expect(isAffirmativeReply("não, espera")).toBe(false);
    expect(isAffirmativeReply("agora não")).toBe(false);
  });

  it("Brazilian Portuguese kickoff and project-kind choices work", () => {
    expect(isTaskKickoffMessage("vai")).toBe(true);
    expect(isTaskKickoffMessage("bora")).toBe(true);
    expect(isTaskKickoffMessage("manda bala")).toBe(true);
    expect(detectProjectKindChoice("projeto existente")).toBe("existing");
    expect(detectProjectKindChoice("novo projeto")).toBe("new");
    expect(detectProjectKindChoice("o atual")).toBe("existing");
  });

  it("구조화된 선택지/목록 안내는 원문 보존 대상으로 인식한다", () => {
    expect(
      shouldPreserveStructuredFallback("기존 프로젝트인가요, 신규 프로젝트인가요?\n1️⃣ 기존 프로젝트\n2️⃣ 신규 프로젝트"),
    ).toBe(true);
    expect(
      shouldPreserveStructuredFallback(
        "기존 프로젝트를 선택해주세요.\n1. Doro [최신]\n   경로: /Users/classys/Projects/claw-empire\n2. Claw-Empire\n   경로: /Users/classys/Projects/climpire",
      ),
    ).toBe(true);
    expect(shouldPreserveStructuredFallback("알겠습니다. 바로 진행하겠습니다.")).toBe(false);
  });
});
