import OpenAI from "openai";

const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 本文末尾に必ず付けるハッシュタグ
const FIXED_HASHTAGS = ["楽天ROOM", "フォロバ100%"];

// 許可ジャンルのみ。その日のニュースから熱いものを選ぶ
const GENRES = [
  {
    id: "fx",
    name: "FX自動売買",
    query: "FX 自動売買 OR EA トレーディング",
    seedTags: ["FX", "自動売買"],
  },
  {
    id: "ai",
    name: "AI開発",
    query: "AI開発 OR 生成AI OR ChatGPT OR LLM",
    seedTags: ["AI", "AI開発"],
  },
  {
    id: "bitradex",
    name: "BitradeX",
    query: "BitradeX OR BitTrade OR ビットトレード",
    seedTags: ["BitradeX", "仮想通貨"],
  },
  {
    id: "crypto",
    name: "仮想通貨とエアドロップ",
    query: "仮想通貨 エアドロップ OR 暗号資産 OR Bitcoin OR Ethereum",
    seedTags: ["仮想通貨", "エアドロップ"],
  },
  {
    id: "nft",
    name: "NFTゲーム",
    query: "NFTゲーム OR GameFi OR ブロックチェーンゲーム",
    seedTags: ["NFT", "NFTゲーム"],
  },
  {
    id: "automation",
    name: "業務自動化",
    query: "業務自動化 OR RPA OR ノーコード 自動化",
    seedTags: ["業務自動化", "RPA"],
  },
];

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

function decodeXmlEntities(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : "";
}

function parseRssItems(xml, genre) {
  const items = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const title = extractTag(block, "title");
    const link = extractTag(block, "link");
    const description = extractTag(block, "description");
    const pubDateRaw = extractTag(block, "pubDate");
    const publishedAt = pubDateRaw ? Date.parse(pubDateRaw) : NaN;
    if (!title) continue;
    items.push({
      title,
      link,
      description: description.slice(0, 400),
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : 0,
      genreId: genre.id,
      genreName: genre.name,
      seedTags: genre.seedTags,
    });
  }
  return items;
}

async function fetchGenreNews(genre) {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(genre.query) +
    "&hl=ja&gl=JP&ceid=JP:ja";

  const res = await fetch(url, {
    headers: { "User-Agent": "threads-autopost/1.0" },
  });
  if (!res.ok) {
    throw new Error(`ニュース取得失敗 (${genre.name}): HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseRssItems(xml, genre);
}

function scoreArticle(article, now = Date.now()) {
  const ageHours = article.publishedAt
    ? (now - article.publishedAt) / 3600000
    : 72;
  // 新しいほど高得点。48時間超は大きく減点
  const freshness = Math.max(0, 48 - ageHours);
  const heatKeywords =
    /急騰|急落|上場|提携|規制|破綻|爆益|アップデート|リリース|承認|停止|ハッキング|エアドロ|AI|自動/i;
  const heatBonus = heatKeywords.test(article.title + article.description) ? 12 : 0;
  return freshness + heatBonus;
}

async function pickHottestStory() {
  const results = await Promise.allSettled(GENRES.map((g) => fetchGenreNews(g)));
  const articles = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      articles.push(...result.value.slice(0, 8));
    } else {
      console.warn(`ジャンル取得スキップ (${GENRES[i].name}):`, result.reason?.message || result.reason);
    }
  });

  if (articles.length === 0) {
    throw new Error("全ジャンルでニュースを取得できませんでした");
  }

  const now = Date.now();
  const recent = articles.filter((a) => !a.publishedAt || now - a.publishedAt < 72 * 3600000);
  const pool = recent.length > 0 ? recent : articles;

  pool.sort((a, b) => scoreArticle(b, now) - scoreArticle(a, now));

  // 同点付近なら日付シードでブレを入れて、毎日まったく同じ見出しに固定しすぎない
  const top = pool.slice(0, Math.min(5, pool.length));
  const chosen = top[getDateSeed() % top.length];
  return { chosen, candidates: top };
}

function sanitizeHashtag(tag) {
  return String(tag)
    .replace(/^#/, "")
    .replace(/[.\s&@!?,;:＃]/g, "")
    .trim();
}

// Threads topic_tag: 1〜50文字、ピリオドと&は不可
function sanitizeTopicTag(tag) {
  const cleaned = sanitizeHashtag(tag).replace(/[.&]/g, "");
  if (!cleaned || cleaned.length > 50) return "";
  return cleaned;
}

function buildHashtagLine(extraTags, topicTag = "") {
  const tags = [];
  const seen = new Set();
  if (topicTag) seen.add(topicTag.toLowerCase()); // 公式トピックと本文タグの二重指定を避ける

  for (const raw of [...FIXED_HASHTAGS, ...extraTags]) {
    const tag = sanitizeHashtag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(`#${tag}`);
    if (tags.length >= 6) break; // 固定2 + 記事由来
  }

  return tags.join(" ");
}

function pickTopicTag(parsed, story) {
  const candidates = [
    parsed.topic_tag,
    ...(Array.isArray(parsed.hashtags) ? parsed.hashtags : []),
    ...story.seedTags,
    story.genreName,
  ];
  for (const raw of candidates) {
    const tag = sanitizeTopicTag(raw);
    if (!tag) continue;
    // 固定ハッシュタグは公式トピックにしない（記事内容のタグを優先）
    if (FIXED_HASHTAGS.some((f) => f.toLowerCase() === tag.toLowerCase())) continue;
    return tag;
  }
  return sanitizeTopicTag(story.seedTags[0]) || "AI";
}

async function generatePost(story) {
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  const { year, month, day } = getJstDateParts();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const weekday = weekdays[new Date(Date.UTC(year, month, day)).getUTCDay()];
  const monthLabel = month + 1;

  const response = await client.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 900,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "あなたはFX・仮想通貨・AI・業務自動化に詳しい実務寄りのThreads発信者。ありきたりなまとめは禁止。背景→考察→転換→見通しの起承転結で、読みやすく書く。",
      },
      {
        role: "user",
        content: `今日は${monthLabel}月${day}日（${weekday}曜日）JSTです。

次のニュースを素材に、Threads投稿をJSONで作ってください。

【ジャンル】${story.genreName}
【見出し】${story.title}
【概要】${story.description || "（概要なし）"}
【参考リンク】${story.link || "なし"}

【出力JSONスキーマ】
{
  "body": "投稿本文（ハッシュタグなし。改行あり）",
  "topic_tag": "記事内容を最もよく表す公式トピック1語。#なし",
  "hashtags": ["記事内容に合う追加タグ2〜4個。#なし"]
}

【本文ルール】
- 360〜450文字程度（日本語。空白・改行含む）
- 起承転結を必ず守る（各パートのあいだは空行で区切る）
  - 起: 唐突に結論から入らない。いま何が話題か、記事の背景・前提を1〜2文で導入
  - 承: 今回のニュースで何が起きたかを具体的に
  - 転: 自分の意見・違和感・見落とされがちな論点（ここが核）
  - 結: 今後の見通しと、見るべきポイントを一文で締める
- 読みやすさのため、1文は短め。段落は4つ（起承転結）に分け、段落間は空行
- カタログ的な一般論・「〜が注目されています」だけの文は禁止
- 断定しすぎず、リスクや前提にも触れる
- URLは書かない
- 楽天ROOM・フォロバ・つながり募集の話は本文に書かない
- 絵文字は3〜6個。各段落にバランスよく置き、装飾過多にしない
- ハッシュタグは body に入れない（topic_tag / hashtags 配列のみ）

【topic_tagルール】
- この投稿の主題を一言で表す語（例: エアドロップ, GameFi, 生成AI, FX自動売買）
- 記事・ジャンルに最適化する。汎用語（ニュース, 話題, 今日）は禁止
- 楽天ROOM や フォロバ100% は使わない
- ピリオド(.)と&は使わない。50文字以内

【hashtagsルール】
- topic_tag と重複しない語を選ぶ
- ジャンルに関連する具体語を優先
- 「ニュース」「注目」「今日」など曖昧語は禁止
- 楽天ROOM と フォロバ100% はこちらで付けるので含めない`,
      },
    ],
  });

  let parsed;
  try {
    parsed = JSON.parse(response.choices[0].message.content);
  } catch {
    throw new Error(`投稿JSONの解析に失敗: ${response.choices[0].message.content}`);
  }

  let body = String(parsed.body || "")
    .trim()
    .replace(/#\S+/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!body) {
    throw new Error("生成本文が空です");
  }

  const topicTag = pickTopicTag(parsed, story);
  const extraTags = [
    ...(Array.isArray(parsed.hashtags) ? parsed.hashtags : []),
    ...story.seedTags,
  ];
  const tagLine = buildHashtagLine(extraTags, topicTag);
  let post = `${body}\n\n${tagLine}`;

  // Threads上限500。絵文字はUTF-8バイト換算されうるので余裕を見る
  const MAX_LEN = 480;
  if ([...post].length > MAX_LEN) {
    const maxBody = MAX_LEN - [...tagLine].length - 2;
    let truncated = [...body].slice(0, Math.max(160, maxBody)).join("");
    const lastBreak = Math.max(
      truncated.lastIndexOf("\n\n"),
      truncated.lastIndexOf("。"),
      truncated.lastIndexOf("！"),
      truncated.lastIndexOf("？")
    );
    if (lastBreak > 120) {
      truncated = truncated.slice(0, lastBreak + (truncated[lastBreak] === "\n" ? 0 : 1)).trim();
    }
    post = `${truncated}\n\n${tagLine}`;
  }

  return { text: post, topicTag };
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

async function postToThreads(text, topicTag) {
  const { status: createStatus, data: createData } = await threadsPost(
    `${THREADS_USER_ID}/threads`,
    {
      media_type: "TEXT",
      text,
      topic_tag: topicTag,
      access_token: THREADS_ACCESS_TOKEN,
    }
  );

  if (!createData.id) {
    throw new Error(
      `コンテナ作成失敗 (HTTP ${createStatus}): ${JSON.stringify(createData)}`
    );
  }

  console.log(`コンテナ作成成功: ${createData.id}`);

  await new Promise((resolve) => setTimeout(resolve, 30000));

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

  const { chosen, candidates } = await pickHottestStory();
  console.log("候補トピック:");
  for (const c of candidates) {
    console.log(`- [${c.genreName}] ${c.title}`);
  }
  console.log(`採用: [${chosen.genreName}] ${chosen.title}`);

  const { text: postText, topicTag } = await generatePost(chosen);
  console.log(`生成された投稿文:\n${postText}`);
  console.log(`公式トピックタグ: ${topicTag}（Threads上は # なしの青リンク）`);

  const postId = await postToThreads(postText, topicTag);
  console.log(`投稿成功！ Post ID: ${postId}`);
}

main().catch((err) => {
  console.error("エラーが発生しました:", err);
  process.exit(1);
});
