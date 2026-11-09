import { useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import * as api from "../../api";
import type { TFunction } from "./types";

export default function GitHubOAuthAppConfig({ t }: { t: TFunction }) {
  const [ghClientId, setGhClientId] = useState("");
  const [ghClientIdSaved, setGhClientIdSaved] = useState(false);
  const [ghClientIdLoaded, setGhClientIdLoaded] = useState(false);
  const inputId = useId();

  useEffect(() => {
    api
      .getSettingsRaw()
      .then((settings) => {
        const val = settings?.github_oauth_client_id;
        if (val) setGhClientId(String(val).replace(/^"|"$/g, ""));
        setGhClientIdLoaded(true);
      })
      .catch(() => setGhClientIdLoaded(true));
  }, []);

  const saveClientId = () => {
    const val = ghClientId.trim();
    api
      .saveSettingsPatch({ github_oauth_client_id: val || null })
      .then(() => {
        setGhClientIdSaved(true);
        setTimeout(() => setGhClientIdSaved(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="qg-card space-y-2" style={{ background: "var(--th-bg-surface)" }}>
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold" style={{ color: "var(--th-text-heading)" }}>
          {t({
            ko: "GitHub OAuth App (Private 리포 접근)",
            en: "GitHub OAuth App (Private repo access)",
            ja: "GitHub OAuth App（プライベートリポアクセス）",
            zh: "GitHub OAuth App（私有仓库访问）",
            fr: "Application OAuth GitHub (accès aux dépôts privés)",
          })}
        </h4>
        {ghClientIdSaved && (
          <span role="status" className="qg-badge qg-badge--accent">
            <Check size={14} aria-hidden="true" />
            {t({ ko: "저장됨", en: "Saved", ja: "保存済み", zh: "已保存", fr: "Enregistré" })}
          </span>
        )}
      </div>
      <p className="qg-field__hint leading-relaxed">
        {t({
          ko: "기본 GitHub 연결은 Copilot OAuth를 사용하여 Private 리포 접근이 제한됩니다. 자체 OAuth App을 등록하면 모든 리포에 접근 가능합니다.",
          en: "Default GitHub uses Copilot OAuth which limits private repo access. Register your own OAuth App for full access.",
          ja: "デフォルトの GitHub 接続は Copilot OAuth を使用し、プライベートリポへのアクセスが制限されます。自前の OAuth App を登録すると全リポにアクセスできます。",
          zh: "默认 GitHub 使用 Copilot OAuth，限制私有仓库访问。注册自己的 OAuth App 可获取完整访问权限。",
          fr: "Par défaut, GitHub passe par l'OAuth de Copilot, qui limite l'accès aux dépôts privés. Enregistrez votre propre application OAuth pour un accès complet.",
        })}
      </p>
      <details className="text-[13px] qg-text-muted">
        <summary className="cursor-pointer font-semibold" style={{ color: "var(--qg-accent)" }}>
          {t({
            ko: "OAuth App 만들기 가이드",
            en: "How to create OAuth App",
            ja: "OAuth App 作成ガイド",
            zh: "如何创建 OAuth App",
            fr: "Créer une application OAuth",
          })}
        </summary>
        <ol className="mt-2 ml-4 list-decimal space-y-1 qg-text-secondary">
          <li>GitHub → Settings → Developer settings → OAuth Apps → New OAuth App</li>
          <li>
            {t({
              ko: "Application name: 아무 이름 (예: My Climpire)",
              en: "Application name: any name (e.g. My Climpire)",
              ja: "Application name: 任意の名前（例: My Climpire）",
              zh: "Application name: 任意名称（如 My Climpire）",
              fr: "Nom de l'application : au choix (ex. : Mon Climpire)",
            })}
          </li>
          <li>Homepage URL: http://localhost:8800</li>
          <li>Callback URL: http://localhost:8800/oauth/callback</li>
          <li>
            {t({
              ko: "☑ Enable Device Flow 체크",
              en: "☑ Check 'Enable Device Flow'",
              ja: "☑ Enable Device Flow にチェック",
              zh: "☑ 勾选 Enable Device Flow",
              fr: "Cochez « Enable Device Flow »",
            })}
          </li>
          <li>
            {t({
              ko: "Register → Client ID를 아래에 붙여넣기",
              en: "Register → Paste Client ID below",
              ja: "Register → Client ID を下に貼り付け",
              zh: "Register → 将 Client ID 粘贴到下方",
              fr: "Cliquez sur Register, puis collez le Client ID ci-dessous",
            })}
          </li>
        </ol>
      </details>
      {ghClientIdLoaded && (
        <div className="qg-field">
          <label className="qg-field__label" htmlFor={inputId}>
            Client ID
          </label>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="text"
              placeholder="Iv23li..."
              value={ghClientId}
              onChange={(e) => setGhClientId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveClientId();
              }}
              className="qg-input flex-1 font-mono"
            />
            <button type="button" onClick={saveClientId} className="qg-btn qg-btn--primary shrink-0">
              {t({ ko: "저장", en: "Save", ja: "保存", zh: "保存", fr: "Enregistrer" })}
            </button>
          </div>
        </div>
      )}
      {ghClientId.trim() && (
        <p className="qg-field__hint">
          {t({
            ko: "저장 후 GitHub 계정을 재연결하세요 (위의 '연결하기' 또는 '계정 추가' 버튼).",
            en: "After saving, reconnect your GitHub account using the 'Connect' or 'Add Account' button above.",
            ja: "保存後、上の「接続」または「アカウント追加」ボタンで GitHub アカウントを再接続してください。",
            zh: "保存后，使用上方的'连接'或'添加账号'按钮重新连接 GitHub 账号。",
            fr: "Après l'enregistrement, reconnectez votre compte GitHub avec le bouton « Connecter » ou « Ajouter un compte » ci-dessus.",
          })}
        </p>
      )}
    </div>
  );
}
