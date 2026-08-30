import { readJson, writeJson } from "./store.js";
import { classifyUrls, extractUrls, hasPrMark } from "./urls.js";

function normalizePost(raw) {
  const replies = (raw.replies || []).map((r) => ({
    id: r.id || "",
    text: r.text_extra ? `${r.text || ""}\n${r.text_extra}` : r.text || "",
    timestamp: r.timestamp || "",
    username: r.username || raw.username || "",
  }));
  const text = raw.text_extra ? `${raw.text || ""}\n${raw.text_extra}` : raw.text || "";
  const allText = [text, ...replies.map((r) => r.text)].join("\n");
  const urls = extractUrls(allText);
  return {
    id: raw.id,
    username: raw.username || "",
    timestamp: raw.timestamp || "",
    text,
    permalink: raw.permalink || "",
    has_replies: Boolean(raw.has_replies || replies.length),
    is_reply: Boolean(raw.is_reply),
    source: "observed",
    replies,
    urls,
    networks: classifyUrls(urls),
    hasPr: hasPrMark(allText),
    likes: Number(raw.likes) || 0,
  };
}

export async function collectViral() {
  const observed = await readJson("viral_observed.json", { posts: [] });
  const seen = new Set();
  const posts = [];
  for (const raw of observed.posts || []) {
    if (!raw?.id || seen.has(raw.id)) continue;
    seen.add(raw.id);
    posts.push(normalizePost(raw));
  }

  const payload = {
    collectedAt: new Date().toISOString(),
    source: "observed",
    count: posts.length,
    posts,
  };
  await writeJson("viral_posts.json", payload);
  console.log(`競合収集: 手集め ${posts.length} 件`);
  return payload;
}
