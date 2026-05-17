# Threads Auto Post Bot

楽天ROOM連携用のThreads自動投稿ボットです。
毎日21:00 JSTに日常トピックをベースにしたAI生成投稿を自動でThreadsに投稿します。

## セットアップ手順

### 1. GitHubリポジトリを作成
GitHubで新しいリポジトリを作成し、このフォルダの中身をすべてpushします。

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
| `THREADS_ACCESS_TOKEN` | ThreadsのアクセストークN |
| `THREADS_USER_ID` | 上で取得したid |
| `OPENAI_API_KEY` | OpenAIのAPIキー |

### 4. 動作確認
GitHubリポジトリの Actions タブ → Threads Auto Post → Run workflow で手動実行して確認します。

## 投稿タイミング
毎日21:00 JST（GitHub Actionsの仕様上±30分の誤差が出る場合あります）

## トークン更新（60日ごと）
Threadsのアクセストークンは60日で期限切れになります。
期限前にMeta Developer Portalで新しいトークンを生成し、GitHub Secretsの `THREADS_ACCESS_TOKEN` を更新してください。
