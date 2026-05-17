# Threads Auto Post Bot

楽天ROOM連携用のThreads自動投稿ボットです。
毎日20:00〜20:15 JSTのあいだにランダムな時刻で、日常トピックをベースにしたAI生成投稿を自動でThreadsに投稿します。

## セットアップ手順

### 1. GitHubリポジトリにpush
GitHubで新しいリポジトリを作成し、このフォルダの中身をすべてpushします。  
自動投稿の設定は `.github/workflows/autopost.yml` にあります（リポジトリ直下ではなく、このパスが必須です）。

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/あなたのユーザー名/threads-autopost.git
git push -u origin main
```

### 2. Threads User IDを取得
ブラウザで以下にアクセスしてidを確認します：
```
https://graph.threads.net/v1.0/me?fields=id,username&access_token=あなたのアクセストークン
```
返ってきたJSONの `"id"` の値をメモしておきます。

### 3. GitHub Secretsに環境変数を登録
GitHubリポジトリの Settings → Secrets and variables → Actions → New repository secret から以下を登録します：

| Secret名 | 値 |
|---|---|
| `THREADS_ACCESS_TOKEN` | Threadsのアクセストークン |
| `THREADS_USER_ID` | 上で取得したid |
| `OPENAI_API_KEY` | OpenAIのAPIキー |

### 4. 動作確認
GitHubリポジトリの **Actions** タブ → 左の **Threads Auto Post** → **Run workflow** で手動実行します。  
ログに `投稿成功！ Post ID:` が出ればOKです。以降は毎日20:00〜20:15 JST頃に自動実行されます。

## 投稿タイミング
毎日20:00〜20:15 JSTのランダム時刻（起動は20:00 JST頃。GitHub Actionsの仕様上、さらに±30分ほどずれる場合があります）

## トークン更新（60日ごと）
Threadsのアクセストークンは60日で期限切れになります。
期限前にMeta Developer Portalで新しいトークンを生成し、GitHub Secretsの `THREADS_ACCESS_TOKEN` を更新してください。
