import { CONNECTABLE_PROVIDERS } from "./constants";
import type { OAuthConnectCardProps } from "./types";

export default function OAuthConnectCards({
  t,
  oauthStatus,
  deviceCode,
  deviceStatus,
  deviceError,
  onConnect,
  onStartDeviceCodeFlow,
}: OAuthConnectCardProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold qg-text-secondary">
        {t({
          ko: "OAuth 계정 추가",
          en: "Add OAuth Account",
          ja: "OAuth アカウント追加",
          zh: "添加 OAuth 账号",
          fr: "Ajouter un compte OAuth",
        })}
      </h4>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CONNECTABLE_PROVIDERS.map(({ id, label, Logo, description }) => {
          const providerInfo = oauthStatus.providers[id];
          const isConnected = Boolean(providerInfo?.executionReady ?? providerInfo?.connected);
          const isDetectedOnly = Boolean(providerInfo?.detected) && !isConnected;
          const storageOk = oauthStatus.storageReady;
          const isGitHub = id === "github-copilot";

          return (
            <div
              key={id}
              className="qg-card flex flex-col items-center gap-2"
              style={{
                borderColor: isConnected ? "var(--qg-accent)" : undefined,
                background: isConnected ? "var(--qg-accent-soft)" : "var(--th-bg-surface)",
                opacity: storageOk ? 1 : 0.6,
              }}
            >
              <Logo className="w-8 h-8" />
              <span className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
                {label}
              </span>
              <span className="text-center text-[13px] leading-tight qg-text-muted">{t(description)}</span>

              {!storageOk ? (
                <span className="qg-badge">
                  {t({
                    ko: "암호화 키 필요",
                    en: "Encryption key required",
                    ja: "暗号化キーが必要",
                    zh: "需要加密密钥",
                    fr: "Clé de chiffrement requise",
                  })}
                </span>
              ) : (
                <>
                  {isConnected ? (
                    <span className="qg-badge qg-badge--accent">
                      {t({ ko: "실행 가능", en: "Runnable", ja: "実行可能", zh: "可执行", fr: "Utilisable" })}
                    </span>
                  ) : isDetectedOnly ? (
                    <span className="qg-badge">
                      {t({ ko: "감지됨", en: "Detected", ja: "検出済み", zh: "已检测", fr: "Détecté" })}
                    </span>
                  ) : null}

                  {isGitHub ? (
                    deviceCode && deviceStatus === "polling" ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <div
                          className="select-all rounded-[var(--qg-radius)] px-3 py-1.5 font-mono text-sm tracking-widest"
                          style={{ background: "var(--th-bg-surface-hover)", color: "var(--th-text-heading)" }}
                        >
                          {deviceCode.userCode}
                        </div>
                        <span role="status" className="text-[13px] qg-text-muted motion-safe:animate-pulse">
                          {t({
                            ko: "코드 입력 대기 중...",
                            en: "Waiting for code...",
                            ja: "コード入力待機中...",
                            zh: "等待输入代码...",
                            fr: "En attente du code…",
                          })}
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void onStartDeviceCodeFlow()}
                        className="qg-btn qg-btn--primary qg-btn--sm"
                      >
                        {isConnected || isDetectedOnly
                          ? t({
                              ko: "계정 추가",
                              en: "Add Account",
                              ja: "アカウント追加",
                              zh: "添加账号",
                              fr: "Ajouter un compte",
                            })
                          : t({ ko: "연결하기", en: "Connect", ja: "接続", zh: "连接", fr: "Connecter" })}
                      </button>
                    )
                  ) : (
                    <button type="button" onClick={() => onConnect(id)} className="qg-btn qg-btn--primary qg-btn--sm">
                      {isConnected || isDetectedOnly
                        ? t({
                            ko: "계정 추가",
                            en: "Add Account",
                            ja: "アカウント追加",
                            zh: "添加账号",
                            fr: "Ajouter un compte",
                          })
                        : t({ ko: "연결하기", en: "Connect", ja: "接続", zh: "连接", fr: "Connecter" })}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {deviceStatus === "complete" && (
        <div className="space-y-1.5">
          <div
            role="status"
            className="rounded-[var(--qg-radius)] px-3 py-2 text-[13px]"
            style={{ background: "var(--qg-accent-soft)", color: "var(--th-text-heading)" }}
          >
            {t({
              ko: "GitHub 연결 완료!",
              en: "GitHub connected!",
              ja: "GitHub 接続完了!",
              zh: "GitHub 已连接!",
              fr: "GitHub connecté !",
            })}
          </div>
          <div className="qg-field__hint">
            {t({
              ko: "Copilot 구독이 있으면 AI 모델을 사용할 수 있고, 없어도 프로젝트 관리의 GitHub 리포 가져오기 기능은 정상 작동합니다.",
              en: "With a Copilot subscription you can use AI models. Without it, GitHub repo import in Project Manager still works.",
              ja: "Copilot サブスクリプションがあれば AI モデルを利用できます。なくてもプロジェクト管理の GitHub リポインポートは利用可能です。",
              zh: "有 Copilot 订阅可使用 AI 模型；没有订阅也可正常使用项目管理的 GitHub 仓库导入功能。",
              fr: "Avec un abonnement Copilot, vous accédez aux modèles d'IA. Sans abonnement, l'import de dépôts GitHub dans les projets fonctionne quand même.",
            })}
          </div>
        </div>
      )}

      {deviceError && (
        <div role="alert" className="qg-field__error">
          {deviceError}
        </div>
      )}
    </div>
  );
}
