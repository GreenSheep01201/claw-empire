# Claw-Empire 本番デプロイガイド

## 前提条件

- Node.js 22+
- pnpm 9+
- Linux (systemd)
- nginx (リバースプロキシ用)

---

## 1. インストール

```bash
# リポジトリをクローン
git clone https://github.com/GreenSheep01201/claw-empire.git
cd claw-empire

# 依存パッケージのインストール
pnpm install

# フロントエンドビルド
pnpm run build
```

---

## 2. 環境変数の設定

```bash
# テンプレートをコピー
cp deploy/.env.production.template deploy/.env.production

# 必須項目を設定
nano deploy/.env.production
```

**必須設定項目:**

| 変数 | 説明 | 生成コマンド |
|------|------|-------------|
| `OAUTH_ENCRYPTION_SECRET` | DB 内トークンの暗号化キー | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `API_AUTH_TOKEN` | リモートアクセス用 API トークン | 同上 |
| `INBOX_WEBHOOK_SECRET` | Webhook エンドポイント保護 | 同上 |

**CORS 設定 (リモートアクセス時):**

```
# Tailscale ネットワーク経由の場合
ALLOWED_ORIGIN_SUFFIXES=.ts.net

# 特定ドメインを許可する場合
ALLOWED_ORIGINS=https://claw.example.com
```

---

## 3. systemd サービスの設定

ユーザー単位のサービスとして設定します:

```bash
# ユーザー systemd ディレクトリを作成
mkdir -p ~/.config/systemd/user

# サービスファイルをコピー (テンプレート版)
cp deploy/claw-empire@.service ~/.config/systemd/user/claw-empire.service

# .env.production のパスを service ファイルに合わせて調整
# EnvironmentFile= の行が正しいパスを指していることを確認
nano ~/.config/systemd/user/claw-empire.service
```

**サービスの起動:**

```bash
# デーモン再読み込み
systemctl --user daemon-reload

# 起動
systemctl --user start claw-empire

# 自動起動の有効化
systemctl --user enable claw-empire

# ログイン不要での自動起動 (root 権限が必要)
sudo loginctl enable-linger $USER
```

**サービス状態の確認:**

```bash
systemctl --user status claw-empire
journalctl --user -u claw-empire -f  # ライブログ
```

---

## 4. nginx の設定

```bash
# nginx 設定ファイルをコピー
sudo cp deploy/nginx/claw-empire.conf /etc/nginx/sites-available/claw-empire

# ドメイン名を設定
sudo nano /etc/nginx/sites-available/claw-empire
# server_name の `claw.example.com` を実際のドメインに変更

# 有効化
sudo ln -s /etc/nginx/sites-available/claw-empire /etc/nginx/sites-enabled/

# 設定テスト
sudo nginx -t

# 再起動
sudo systemctl reload nginx
```

### HTTPS 化 (Let's Encrypt / certbot)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d claw.example.com
```

---

## 5. 動作確認

```bash
# ローカルからの確認
curl http://localhost:8790/api/health

# API トークン付きリモートアクセス確認
curl -H "Authorization: Bearer YOUR_API_AUTH_TOKEN" https://claw.example.com/api/health

# WebSocket 疎通確認
curl -i -N \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  http://localhost:8790/ws
```

---

## 6. Tailscale 経由のアクセス (LAN/VPN)

nginx を使わず Tailscale 経由で直接アクセスする場合:

```bash
# .env.production に追記
HOST=0.0.0.0
ALLOWED_ORIGIN_SUFFIXES=.ts.net
API_AUTH_TOKEN=YOUR_SECRET_TOKEN
```

ブラウザからのアクセス時は URL パラメーターでトークンを渡します:

```
http://100.x.x.x:8790?token=YOUR_SECRET_TOKEN
```

---

## 7. アップデート手順

```bash
cd claw-empire
git pull
pnpm install
pnpm run build
systemctl --user restart claw-empire
```

---

## トラブルシューティング

| 症状 | 確認箇所 |
|------|---------|
| 起動しない | `journalctl --user -u claw-empire -n 50` でログ確認 |
| WebSocket が切れる | nginx の `proxy_read_timeout` を延長 |
| CORS エラー | `ALLOWED_ORIGINS` / `ALLOWED_ORIGIN_SUFFIXES` を設定 |
| 401 Unauthorized | `API_AUTH_TOKEN` をヘッダー `Authorization: Bearer TOKEN` で送信 |
| OAuth が動かない | `OAUTH_BASE_URL` を公開 URL に設定、OAuth App の Callback URL も更新 |
