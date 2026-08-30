import OpenAI from "openai";
import { MAX_POST_LEN, THEME } from "./config.js";
import { pickProduct, resolveAffiliateItem } from "./affiliate.js";
import { getJstParts, weekdayLabel } from "./time.js";

function clip(text, max) {
  const chars = [...String(text || "").trim()];
  if (chars.length <= max) return chars.join("");
  return chars.slice(0, max).join("").replace(/[、。\s]+$/, "");
}

function ensureToutenHook(hook) {
  let text = String(hook || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/#\S+/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const lines = text.split("\n").filter(Boolean).slice(0, 2);
  text = lines.join("\n");
  if (!/[、,]$/.test(text)) {
    const cut = text.search(/[、,]/);
    if (cut > 8) {
      text = text.slice(0, cut + 1);
    } else {
      text = `${text.replace(/[。！？.!?]+$/, "")}、`;
    }
  }
  return clip(text, 90);
}

function fitPost(text) {
  const raw = String(text || "").trim();
  if ([...raw].length <= MAX_POST_LEN) return raw;
  return clip(raw, MAX_POST_LEN - 1);
}

export function buildReply2({ product, item, pitch }) {
  const reason = clip(pitch || product.pitch || "", 60);
  const name = item.name || product.name;
  const shop = item.network === "amazon" ? "Amazon" : "楽天";
  const body = `${name}\n${reason}\n${item.url}\n#PR #防災`;
  return fitPost(body.includes(shop) ? body : `${shop}で探すならこれ。\n${body}`);
}

async function generateCopy({ product, playbook, weekday, reuseFrom }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY が必要です");
  }

  const viralHooks = (playbook?.viral?.hookPatterns || [])
    .map((h) => `- ${h.text}`)
    .slice(0, 6)
    .join("\n");
  const ownHooks = (playbook?.own?.winningHooks || [])
    .map((h) => `- ${h.text}`)
    .slice(0, 4)
    .join("\n");

  const response = await client.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "あなたは暮らしと防災のThreads発信者。恐怖を煽りすぎず、今日できる一手を短く書く。丸コピー禁止。独自の具体に落とす。",
      },
      {
        role: "user",
        content: `今日は${weekday}曜日です。テーマは「${THEME}」。商品の軸は「${product.name}」（${product.pitch}）。

【競合で効いているフック例（型だけ借りる。文面は使わない）】
${viralHooks || "（なし）"}

【自分の勝ちフック】
${ownHooks || "（まだなし）"}

${reuseFrom ? "過去に伸びた型の再利用。同じ意味でも言い回しは変える。\n" : ""}
【出力JSON】
{
  "hook": "親投稿。1〜2行。必ず読点「、」で終わる未完の文。リンクとハッシュタグ禁止",
  "body": "1リプ目の本編。200〜360字。売り込み禁止。備えの理由と今日できる一手",
  "productPitch": "2リプ目用の1文。商品を押し売りしない理由",
  "topic_tag": "防災または非常食など1語。#なし"
}

【ルール】
- フックは完結させない。読点で切って次が気になる状態
- 曜日が自然に使えるときだけ曜日を入れる（無理に入れない）
- 絵文字は0〜3個
- URL・#PR・店名の羅列は書かない
- 他人の投稿の言い回しを再利用しない`,
      },
    ],
  });

  let parsed;
  try {
    parsed = JSON.parse(response.choices[0].message.content);
  } catch {
    throw new Error(`生成JSONの解析に失敗: ${response.choices[0].message.content}`);
  }

  return {
    hook: ensureToutenHook(parsed.hook),
    body: fitPost(
      String(parsed.body || "")
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/#\S+/g, "")
        .trim()
    ),
    productPitch: String(parsed.productPitch || product.pitch || "").trim(),
    topicTag: String(parsed.topic_tag || "防災").replace(/[.#&\s]/g, "").slice(0, 50) || "防災",
  };
}

export async function generateThread({ products, playbook, ownPosts, winners, now = new Date() }) {
  const { product, reuseFrom } = pickProduct({ products, playbook, ownPosts, winners, now });
  const item = await resolveAffiliateItem(product, playbook);
  const { weekday } = { weekday: weekdayLabel(now) };
  const copy = await generateCopy({ product, playbook, weekday, reuseFrom });
  const reply2 = buildReply2({ product, item, pitch: copy.productPitch });

  return {
    product,
    item,
    reuseFrom,
    hook: copy.hook,
    body: copy.body,
    reply2,
    topicTag: copy.topicTag,
    weekday,
    postedHour: getJstParts(now).hour,
  };
}
