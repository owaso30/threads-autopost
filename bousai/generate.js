import OpenAI from "openai";
import { MAX_POST_LEN, THEME } from "./config.js";
import { chooseProduct, resolveAffiliateItem } from "./affiliate.js";
import { getJstParts, weekdayLabel } from "./time.js";

function clip(text, max) {
  const chars = [...String(text || "").trim()];
  if (chars.length <= max) return chars.join("");
  return chars.slice(0, max).join("").replace(/[、。\s]+$/, "");
}

function stripPartMarks(text) {
  return String(text || "")
    .replace(/[1-9]\/[1-9]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fitPost(text) {
  const raw = String(text || "").trim();
  if ([...raw].length <= MAX_POST_LEN) return raw;
  return clip(raw, MAX_POST_LEN - 1);
}

function punchLayout(hook) {
  let text = String(hook || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/#\S+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return `${lines[0]}\n${lines.slice(1).join("\n")}`;
  }
  const one = lines[0] || text;
  const m = one.match(/^(.{6,36}?)([。！？!?]|、)/);
  if (m && m[0].length < one.length - 8) {
    const rest = one.slice(m[0].length).trim();
    if (rest) return `${m[1].trim()}${/[！？!?]/.test(m[2]) ? m[2] : ""}\n${rest}`;
  }
  return one;
}

export function buildReply({ product, item, pitch }) {
  const reason = clip(String(pitch || product.pitch || "").replace(/※[\s\S]*/g, "").trim(), 60);
  const name = item.name || product.name;
  const shop = item.network === "amazon" ? "Amazon" : "楽天";
  const parts = [reason, name, item.url, "#PR #防災"];
  const body = parts.filter(Boolean).join("\n");
  return fitPost(body.includes(shop) ? body : `${shop}\n${body}`);
}

function itemBrief(item, product) {
  const price = item?.price != null ? String(item.price) : "";
  return [
    `店: ${item?.network === "amazon" ? "Amazon" : "楽天"}`,
    `商品名: ${item?.name || product.name}`,
    price ? `価格: ${price}` : "",
    item?.shop ? `ショップ: ${item.shop}` : "",
    `軸: ${product.name} / ${product.pitch}${product.trendSource ? "（今のトレンドから選定）" : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateCopy({ product, item, playbook, weekday, reuse, recentOpenings }) {
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

  const reuseBlock = reuse?.hook
    ? `【再投稿】過去に伸びた投稿の核は残し、言い回しだけ変える。丸コピー禁止。先頭2行は別の強いフックに作り直す。
元の親:
${stripPartMarks(reuse.hook)}
${reuse.productPitch ? `元のリプ理由: ${reuse.productPitch}` : ""}`
    : "";

  const avoid = (recentOpenings || []).filter(Boolean).slice(0, 5).join("\n") || "（なし）";

  const response = await client.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 1000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "あなたは暮らしと防災のThreads発信者。実在する1商品ありきで書く。丸コピー禁止。フックは少し言い過ぎで目が止まる。恐怖の煽りすぎと医療断言はしない。",
      },
      {
        role: "user",
        content: `今日は${weekday}曜日です。テーマは「${THEME}」。

【この投稿の実商品（これありきで書く。抽象的な防災一般論は禁止）】
${itemBrief(item, product)}

【競合で効いているフックの型（文面は使わない。強さだけ借りる）】
${viralHooks || "（なし）"}

【自分の勝ちフック】
${ownHooks || "（まだなし）"}

【最近使った書き出し（被せない）】
${avoid}

${reuseBlock}

【出力JSON】
{
  "hook": "親投稿。先頭2行が本体。そのあと体験で着地。リンクとハッシュタグ禁止",
  "productPitch": "リプ用の1文。この実商品を推す短い理由",
  "topic_tag": "防災または非常食など1語。#なし"
}

【ルール】
- 商品ありき。上の商品名の特徴・用途に寄せる。カタログの軸を棒読みしない
- 先頭2行に全力。スクロールを止める。やや言い過ぎ、感情強め、具体的な不便や驚き。「備えましょう」系の優等生は禁止
- 1行目は短く強く。2行目で引っかける。3行目以降で実商品の体験に着地
- 他人の文面は使わない。美容・玩具そのものは書かない
- 1/2 や 2/2 は書かない
- 曜日が自然なときだけ入れる
- 絵文字は0〜3個
- URL・#PRは書かない`,
      },
    ],
  });

  let parsed;
  try {
    parsed = JSON.parse(response.choices[0].message.content);
  } catch {
    throw new Error(`生成JSONの解析に失敗: ${response.choices[0].message.content}`);
  }

  const clean = (s) =>
    String(s || "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/#\S+/g, "")
      .trim();

  let hook = fitPost(stripPartMarks(punchLayout(clean(parsed.hook))));

  return {
    hook,
    productPitch: String(parsed.productPitch || product.pitch || "").trim(),
    topicTag: String(parsed.topic_tag || "防災").replace(/[.#&\s]/g, "").slice(0, 50) || "防災",
  };
}

export async function generateThread({ products, playbook, ownPosts, winners, now = new Date() }) {
  const { product, reuse } = await chooseProduct({ products, playbook, ownPosts, winners, now });
  const item = await resolveAffiliateItem(product);
  const weekday = weekdayLabel(now);
  const recentOpenings = (ownPosts || [])
    .slice(0, 8)
    .map((p) => String(p.hook || "").split("\n")[0])
    .filter(Boolean);
  const copy = await generateCopy({
    product,
    item,
    playbook,
    weekday,
    reuse,
    recentOpenings,
  });
  const reply = buildReply({
    product,
    item,
    pitch: copy.productPitch,
  });

  return {
    product,
    item,
    reuseFrom: reuse?.id || null,
    generation: (reuse?.generation || 0) + 1,
    hook: copy.hook,
    reply,
    productPitch: copy.productPitch,
    topicTag: copy.topicTag,
    weekday,
    postedHour: getJstParts(now).hour,
  };
}
