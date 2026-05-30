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
毎日 **20:00〜20:15 JST** のランダム時刻に投稿します。

GitHub Actions の定時起動は **1〜3時間遅れる** ことがあります（公式ドキュメントでも注意あり）。そのため:

1. ワークフローは **15:03 JST 頃**（06:03 UTC）に早めに起動
2. `index.js` が **20:00 JST まで待機**してから投稿
3. 起動が遅れて 20:00 を過ぎた場合は、待たずにすぐ投稿

手動実行（Run workflow）のときは待機しません。

## 定時実行されないときの確認
画面上部の「`workflow_dispatch` イベントのみ」表示は**正常**です。手動用の案内で、定時（`schedule`）が無効なわけではありません。

1. **Actions** 一覧のフィルタで **Event → schedule** を選び、20時前後の実行があるか確認
2. 左の **Threads Auto Post** が **Disabled** になっていないか（有効化する）
3. **Settings → Actions → General** で Actions が有効か
4. ワークフローを `main` に push した**当日の20:03以降**は、初回の定時実行は**翌日20:03頃**になることがある
5. 手動は成功するが定時だけ動かない場合、GitHub側の遅延・スキップの可能性あり（数十分〜数時間ずれることもある）

## ハッシュタグについて
Threadsアプリではタグは **# なしの青いリンク**（例: `楽天ROOM`）で表示されます。これはアプリの仕様で、投稿に失敗しているわけではありません。APIでは `topic_tag` でタグ付けしています。

## トークン更新（60日ごと）
Threadsのアクセストークンは60日で期限切れになります。
期限前にMeta Developer Portalで新しいトークンを生成し、GitHub Secretsの `THREADS_ACCESS_TOKEN` を更新してください。
