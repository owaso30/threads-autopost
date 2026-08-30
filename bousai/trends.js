import OpenAI from "openai";
import { createHash } from "node:crypto";
import { THEME } from "./config.js";
import { rakutenConfigured, searchRakutenItems } from "./rakuten.js";

const NEWS_QUERIES = [
  "防災 グッズ 新商品",
  "暮らし 便利グッズ",
  "南海トラフ 備え",
];

const MARKET_QUERIES = ["防災 新商品", "暮らし 便利グッズ 2026", "ポータブル電源 防災"];

function decodeXml(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return decodeXml(m?.[1] || "");
}

async function fetchNewsTitles(query) {
  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=ja&gl=JP&ceid=JP:ja";
  const res = await fetch(url, { headers: { "User-Agent": "threads-bousai-pdca/1.0" } });
  if (!res.ok) return [];
  const xml = await res.text();
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return blocks
    .map((b) => extractTag(b, "title"))
    .filter(Boolean)
    .slice(0, 6);
}

async function fetchMarketNames() {
  if (!rakutenConfigured()) return [];
  const names = [];
  for (const q of MARKET_QUERIES) {
    try {
      const items = await searchRakutenItems(q, { hits: 5, sort: "-reviewCount" });
      for (const it of items) names.push(it.name);
    } catch (err) {
      console.warn(`トレンド市場検索スキップ (${q}):`, err.message || err);
    }
  }
  return names.slice(0, 12);
}

function slugId(name) {
  const hash = createHash("sha1").update(String(name)).digest("hex").slice(0, 10);
  return `trend-${hash}`;
}

export async function proposeTrendProduct({ playbook, ownPosts, now = new Date() }) {
  if (!process.env.OPENAI_API_KEY) return null;

  const news = [];
  for (const q of NEWS_QUERIES) {
    try {
      news.push(...(await fetchNewsTitles(q)));
    } catch (err) {
      console.warn(`トレンドニューススキップ (${q}):`, err.message || err);
    }
  }

  let market = [];
  try {
    market = await fetchMarketNames();
  } catch (err) {
    console.warn("トレンド市場スキップ:", err.message || err);
  }

  const viral = (playbook?.viral?.hookPatterns || []).map((h) => h.text).slice(0, 6);
  const recent = (ownPosts || [])
    .slice(0, 8)
    .map((p) => p.itemName || p.productName)
    .filter(Boolean);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const month = now.getUTCMonth() + 1;
  const response = await client.chat.completions.create({
    model: "gpt-5.4-mini",
    max_completion_tokens: 400,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "あなたは暮らしと防災の商品キュレーター。今売れている・これから要る、少し先を見据えた画期的なグッズを1つだけ選ぶ。ありきたりな非常食セットやただの保存水、普通の懐中電灯は避ける。",
      },
      {
        role: "user",
        content: `テーマは「${THEME}」。今月は${month}月。楽天かAmazonで今すぐ検索できる実在しそうな商品に落とす。

【ニュース】
${news.slice(0, 12).map((t) => `- ${t}`).join("\n") || "（なし）"}

【市場で動いている商品名】
${market.map((t) => `- ${t}`).join("\n") || "（なし）"}

【伸びている投稿の型】
${viral.map((t) => `- ${t}`).join("\n") || "（なし）"}

【最近出した商品（被せない）】
${recent.map((t) => `- ${t}`).join("\n") || "（なし）"}

【出力JSON】
{
  "name": "短い商品カテゴリ名（例: 水なし全身洗浄スプレー）",
  "pitch": "なぜ今・これから必要か。40字以内",
  "keyword": "楽天とAmazonで同じ検索語。8〜24字",
  "category": "kit または electronics または gear または other"
}

画期的・省スペース・日常でも使える防災、新しめの暮らし便利に寄せる。美容コスメや玩具は禁止。`,
      },
    ],
  });

  let parsed;
  try {
    parsed = JSON.parse(response.choices[0].message.content);
  } catch {
    return null;
  }

  const name = String(parsed.name || "").trim();
  const keyword = String(parsed.keyword || name).trim();
  if (!name || !keyword) return null;

  return {
    id: slugId(name),
    name,
    category: ["kit", "electronics", "gear", "food", "water", "other"].includes(parsed.category)
      ? parsed.category
      : "other",
    pitch: String(parsed.pitch || "").trim() || "これから必要になる備え",
    keywords: { rakuten: keyword, amazon: keyword },
    trendSource: "feed",
  };
}
