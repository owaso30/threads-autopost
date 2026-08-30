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

export function buildReply({ item, pitch }) {
  const shop = item.network === "amazon" ? "Amazon" : "楽天";
  const footer = `${shop} ⤵️\n${item.url}\n#PR #防災`;
  const budget = Math.max(80, MAX_POST_LEN - [...footer].length - 1);
  const review = clip(
    stripPartMarks(
      String(pitch || "")
        .replace(/※[\s\S]*/g, "")
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/#\S+/g, "")
        .trim()
    ),
    budget
  );
  return `${review}\n${footer}`;
}

function itemBrief(item, product) {
  const price = item?.price != null ? String(item.price) : "";
  return [
    `短い呼び（文面に出すならこれだけ）: ${product.name}`,
    `店: ${item?.network === "amazon" ? "Amazon" : "楽天"}`,
    `店の商品名（中身を想像する用。スペック・正式名称のコピペ禁止）: ${item?.name || product.name}`,
    price ? `価格の目安: ${price}` : "",
    item?.shop ? `ショップ: ${item.shop}` : "",
    `企画メモ（読み上げない）: ${product.pitch || ""}${product.trendSource ? " / 今のトレンドから選定" : ""}`,
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
    ? `【再投稿】核だけ残し、言い回しは全部変える。丸コピー禁止。先頭2行は別の「買いたくなる」フックに作り直す。リプも別の体験談にする。
元の親:
${stripPartMarks(reuse.hook)}
${reuse.productPitch ? `元のリプ: ${reuse.productPitch}` : ""}`
    : "";

  const avoid = (recentOpenings || []).filter(Boolean).slice(0, 5).join("\n") || "（なし）";

  const response = await client.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 1400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "あなたは暮らしと防災のThreadsで、実在する1商品を欲しくさせて売っている発信者。口調は友達に「これ買い」と送る感じ。カタログ説明・スペック読み上げ・優等生の備え解説は禁止。フックは言い過ぎでスクロールを止める。恐怖の煽りすぎと医療断言はしない。",
      },
      {
        role: "user",
        content: `今日は${weekday}曜日です。テーマは「${THEME}」。目的はクリックと購入意欲。啓発ではない。

【この投稿の実商品（体験の種。掲載文は写さない）】
${itemBrief(item, product)}

【競合で効いているフックの型（文面は使わない。強さ・口調だけ借りる）】
${viralHooks || "（なし）"}

【自分の勝ちフック】
${ownHooks || "（まだなし）"}

【最近使った書き出し（被せない）】
${avoid}

${reuseBlock}

【出力JSON】
{
  "hook": "親投稿。1行目がキャッチ。2行目で欲しくする。3行目以降は短い体験。リンクとハッシュタグ禁止",
  "productPitch": "リプ本文。使い勝手・見た目・置き心地の感想を3〜6文。購入先の説明文は禁止",
  "topic_tag": "防災または暮らしなど1語。#なし"
}

【親（hook）】
- 1行目は12〜28字。命令・断言・意外性。「これ買って」「家の空気変わった」「想像の何倍」系。優等生の「備えましょう」禁止
- 2行目で購買スイッチ。見た目、出しやすさ、場所を取らない、生活が楽、という瞬間
- 3〜5行で体験に着地。防災教科書・在宅避難の説明口調は弱める。日常の気持ちよさから自然に防災へ
- 商品の正式名称・ワット数・容量・セット内容は書かない

【リプ（productPitch）】
- 購入ページの説明の言い換えは禁止。スペック・「〜できます」「〜に最適です」禁止
- 実体験・感想だけ。触った感じ、見た目、出し入れ、置き場所、毎日使いたくなる理由を並べる
- 「友達に見せたら」「出しっぱなしにできる」「100均から乗り換えた」など、欲しくなる主観
- リンク・店名・ハッシュタグ・商品の長文タイトルは書かない（それ以外の場所で付ける）

【共通】
- 他人の文面は使わない。美容・玩具そのものは書かない
- 1/2 や 2/2 は書かない
- 曜日は自然なときだけ
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
  const productPitch = clip(
    stripPartMarks(clean(parsed.productPitch)).replace(/[、。\s]+$/g, ""),
    320
  );

  return {
    hook,
    productPitch:
      productPitch ||
      `家に置いてみたら、見た目と出しやすさで毎日使う側に回った。${product.name}、想像より暮らしに馴染む。`,
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
