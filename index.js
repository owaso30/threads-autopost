import OpenAI from "openai";

const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 日常トピックのリスト（毎回ランダムに選ばれる）
const DAILY_TOPICS = [
  "今日の朝ごはん・料理",
  "季節の変わり目と体調",
  "週末の過ごし方・お出かけ",
  "掃除・片付けのタイミング",
  "今の季節に欲しいもの",
  "最近ハマっているドリンク・食べ物",
  "子どものこと・家族のこと",
  "天気と気分の関係",
  "夜のリラックスタイムの過ごし方",
  "最近お気に入りの場所・コーナー",
  "買い物で失敗したこと・成功したこと",
  "今の部屋・インテリアへの不満と理想",
  "朝のルーティン",
  "節約・ポイント活用の話",
  "最近ちょっとした発見があったこと",
];

// 今日の日付をシードにして毎日違うトピックを選ぶ
function getTodaysTopic() {
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const index = seed % DAILY_TOPICS.length;
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
    model: "gpt-4o-mini",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `あなたは楽天ROOMで日用品・ファッション・インテリアなどを紹介している主婦目線のThreadsユーザーです。

今日は${month}月${day}日（${weekday}曜日）です。

以下のトピックをベースに、Threads投稿文を1つ作成してください。

【トピック】${topic}

【ルール】
- 丁寧すぎず、フランクすぎない「丁寧寄りのカジュアル」なトーン
- 日常のリアルな感想・共感を誘う内容
- 最後に楽天ROOMで商品を探したくなるような自然な一言でつなげる（「楽天ROOMで探してみました」「楽天ROOMで見つけたんですが」など、押しつけがましくなく）
- URLやハッシュタグは含めない
- 全体で120〜200文字程度
- 絵文字を2〜3個使う

投稿文のみを出力してください。前置きや説明は不要です。`,
      },
    ],
  });

  return response.choices[0].message.content.trim();
}

async function postToThreads(text) {
  // Step 1: コンテナ作成
  const createRes = await fetch(
    `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "TEXT",
        text: text,
        access_token: THREADS_ACCESS_TOKEN,
      }),
    }
  );

  const createData = await createRes.json();

  if (!createData.id) {
    throw new Error(`コンテナ作成失敗: ${JSON.stringify(createData)}`);
  }

  console.log(`コンテナ作成成功: ${createData.id}`);

  // Step 2: 30秒待機（Threads APIの仕様）
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Step 3: 公開
  const publishRes = await fetch(
    `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: createData.id,
        access_token: THREADS_ACCESS_TOKEN,
      }),
    }
  );

  const publishData = await publishRes.json();

  if (!publishData.id) {
    throw new Error(`公開失敗: ${JSON.stringify(publishData)}`);
  }

  return publishData.id;
}

async function main() {
  console.log("=== Threads Auto Post 開始 ===");

  const topic = getTodaysTopic();
  console.log(`今日のトピック: ${topic}`);

  const postText = await generatePost(topic);
  console.log(`生成された投稿文:\n${postText}`);

  const postId = await postToThreads(postText);
  console.log(`投稿成功！ Post ID: ${postId}`);
}

main().catch((err) => {
  console.error("エラーが発生しました:", err);
  process.exit(1);
});
