import OpenAI from "openai";

const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 日常トピックのリスト（毎回ランダムに選ばれる）
const DAILY_TOPICS = [
  "最近のアプリ開発事情・AI",
  "最近の副業事情・副業で稼ぐ話",
  "最近のトレード事情・FXや仮想通貨でどう稼ぐか",
  "最近のNFTゲーム事情・Web3の未来",
  "最近ハマっているガジェット",
  "もし転職するなら・目指すべきIT職種",
  "今日の晩ごはん・料理",
  "季節の変わり目と体調",
  "週末の過ごし方・お出かけ",
  "掃除・片付けのタイミング",
  "今の季節に欲しいもの",
  "最近ハマっているドリンク・食べ物",
  "買い物で失敗したこと・成功したこと",
  "節約・ポイント活用の話",
  "最近ちょっとした発見があったこと",
];

// Threads API の topic_tag（画面上は # なしの青リンクになるのが仕様）
const TOPIC_TAG = "楽天ROOM";

// 日常トピック本文のあとに毎回付ける定型文（必要ならここだけ編集）
// #楽天ROOM は本文に書かず topic_tag のみで付ける（二重指定だと API が unknown error になることがある）
const RAKUTEN_ROOM_FOOTER =
  "\n\n楽天ROOMで主にファッション・インテリアなどを紹介しています。つながり大歓迎＆フォロバ100%です🙌";

// 今日の日付をシードにして毎日違うトピックを選ぶ
function getJstDateParts(date = new Date()) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth(),
    day: jst.getUTCDate(),
  };
}

function getDateSeed(date = new Date()) {
  const { year, month, day } = getJstDateParts(date);
  return year * 10000 + (month + 1) * 100 + day;
}

// 定時実行時の投稿目標時刻（20:00 JST + 日替わり0〜15分）
function getScheduledPostTargetUtc() {
  const { year, month, day } = getJstDateParts();
  const randomSec = getDateSeed() % 901;
  // 20:00 JST = 11:00 UTC
  return new Date(Date.UTC(year, month, day, 11, 0, randomSec));
}

async function waitUntilPostWindowIfScheduled() {
  if (process.env.SCHEDULED_RUN !== "true") return;

  const target = getScheduledPostTargetUtc();
  const waitMs = target.getTime() - Date.now();
  // Actions を長時間占有しない（通常は最大15分程度。これ以上なら起動時刻設定ミスとみなす）
  const MAX_WAIT_MS = 20 * 60 * 1000;

  if (waitMs > MAX_WAIT_MS) {
    console.log(
      `定時投稿: 待機が${Math.floor(waitMs / 60000)}分になるためスキップしてすぐ投稿します`
    );
  } else if (waitMs > 0) {
    const min = Math.floor(waitMs / 60000);
    const sec = Math.floor((waitMs % 60000) / 1000);
    console.log(`定時投稿: 20:00 JST窓まで ${min}分${sec}秒 待機します`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  } else {
    console.log("定時投稿: 20:00 JST窓を過ぎているため、すぐ投稿します（GitHub Actions 起動遅延）");
  }
}

function getTodaysTopic() {
  const index = getDateSeed() % DAILY_TOPICS.length;
  return DAILY_TOPICS[index];
}

async function generatePost(topic) {
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const weekday = weekdays[today.getDay()];

  const response = await client.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 300,
    messages: [
      {
        role: "user",
        content: `あなたは楽天ROOMで日用品・ファッション・インテリアなどを紹介している主婦目線のThreadsユーザーです。

今日は${month}月${day}日（${weekday}曜日）です。

以下のトピックをベースに、Threads投稿文を1つ作成してください。

【トピック】${topic}

【ルール】
- 丁寧すぎず、フランクすぎない「丁寧寄りのカジュアル」なトーン
- 日常のリアルな感想・共感を誘う内容にする（トピックの話だけで完結させる）
- 楽天ROOM・商品探し・つながり募集には一切触れない（別途定型文が後から付く）
- URLやハッシュタグは含めない（#楽天ROOM は別途付与される）
- 100〜200文字程度
- 絵文字を2〜4個使う

投稿文のみを出力してください。前置きや説明は不要です。`,
      },
    ],
  });

  const body = response.choices[0].message.content.trim().replace(/#\S+/g, "");
  return body + RAKUTEN_ROOM_FOOTER;
}

async function threadsPost(path, params) {
  const body = new URLSearchParams(params);
  const res = await fetch(`https://graph.threads.net/v1.0/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function postToThreads(text) {
  // Step 1: コンテナ作成（公式は form-urlencoded。JSON だと unknown error になることがある）
  const { status: createStatus, data: createData } = await threadsPost(
    `${THREADS_USER_ID}/threads`,
    {
      media_type: "TEXT",
      text,
      topic_tag: TOPIC_TAG,
      access_token: THREADS_ACCESS_TOKEN,
    }
  );

  if (!createData.id) {
    throw new Error(
      `コンテナ作成失敗 (HTTP ${createStatus}): ${JSON.stringify(createData)}`
    );
  }

  console.log(`コンテナ作成成功: ${createData.id}`);

  // Step 2: 30秒待機（Threads APIの仕様）
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Step 3: 公開
  const { status: publishStatus, data: publishData } = await threadsPost(
    `${THREADS_USER_ID}/threads_publish`,
    {
      creation_id: createData.id,
      access_token: THREADS_ACCESS_TOKEN,
    }
  );

  if (!publishData.id) {
    throw new Error(
      `公開失敗 (HTTP ${publishStatus}): ${JSON.stringify(publishData)}`
    );
  }

  return publishData.id;
}

async function main() {
  console.log("=== Threads Auto Post 開始 ===");

  await waitUntilPostWindowIfScheduled();

  const topic = getTodaysTopic();
  console.log(`今日のトピック: ${topic}`);

  const postText = await generatePost(topic);
  console.log(`生成された投稿文:\n${postText}`);
  console.log(`トピックタグ: ${TOPIC_TAG}（Threads上は # なしで表示されます）`);

  const postId = await postToThreads(postText);
  console.log(`投稿成功！ Post ID: ${postId}`);
}

main().catch((err) => {
  console.error("エラーが発生しました:", err);
  process.exit(1);
});
