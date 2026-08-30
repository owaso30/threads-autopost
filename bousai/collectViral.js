import {
  SEARCH_QUERIES,
  TOPIC_SEARCH_TAGS,
  VIRAL_TARGET,
} from "./config.js";
import { readJson, writeJson } from "./store.js";
import { fetchReplies, keywordSearch } from "./threads.js";
import { classifyUrls, extractUrls, hasPrMark, linkPlacementOf } from "./urls.js";

function normalizePost(raw, source) {
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
    source,
    replies,
    urls,
    networks: classifyUrls(urls),
    linkPlacement: linkPlacementOf({ rootText: text, replies }),
    hasPr: hasPrMark(allText),
    hookLines: text.split("\n").filter(Boolean).length,
    endsWithTouten: /[、,]$/.test(text.trim()),
  };
}

function isOwnOnlyResult(items, ownUsername) {
  if (!items.length) return true;
  const names = new Set(items.map((i) => (i.username || "").toLowerCase()));
  if (ownUsername && names.size === 1 && names.has(ownUsername.toLowerCase())) {
    return true;
  }
  return false;
}

async function searchOne(q, searchMode) {
  const { ok, status, data } = await keywordSearch({
    q,
    searchMode,
    limit: 25,
  });
  if (!ok) {
    console.warn(`keyword_search 失敗 (${q}): HTTP ${status} ${JSON.stringify(data).slice(0, 200)}`);
    return { items: [], error: data };
  }
  return { items: data?.data || [], error: null };
}

async function collectFromApi() {
  const collected = [];
  const seen = new Set();

  for (const q of SEARCH_QUERIES) {
    const { items } = await searchOne(q);
    for (const item of items) {
      if (!item?.id || seen.has(item.id) || item.is_reply) continue;
      seen.add(item.id);
      collected.push(item);
    }
  }

  for (const tag of TOPIC_SEARCH_TAGS) {
    const { items } = await searchOne(tag, "TAG");
    for (const item of items) {
      if (!item?.id || seen.has(item.id) || item.is_reply) continue;
      seen.add(item.id);
      collected.push(item);
    }
  }

  const limited = collected.slice(0, VIRAL_TARGET + 8);
  const enriched = [];
  for (const item of limited) {
    let replies = [];
    if (item.has_replies) {
      try {
        replies = await fetchReplies(item.id);
      } catch (err) {
        console.warn(`リプ取得スキップ (${item.id}):`, err.message || err);
      }
    }
    enriched.push(normalizePost({ ...item, replies }, "api"));
  }
  return enriched;
}

async function loadSeed() {
  const seed = await readJson("viral_seed.json", { posts: [] });
  return (seed.posts || []).map((p) => normalizePost(p, "seed"));
}

export async function collectViral() {
  let source = "seed";
  let posts = [];

  try {
    const apiPosts = await collectFromApi();
    const ownUsername = process.env.THREADS_USERNAME || "";
    const publicEnough = apiPosts.length >= 8 && !isOwnOnlyResult(apiPosts, ownUsername);
    if (publicEnough) {
      posts = apiPosts.slice(0, VIRAL_TARGET);
      source = "api";
      console.log(`競合収集: keyword_search で ${posts.length} 件`);
    } else {
      const seed = await loadSeed();
      const merged = [...apiPosts, ...seed];
      const seen = new Set();
      posts = [];
      for (const p of merged) {
        if (!p.id || seen.has(p.id)) continue;
        seen.add(p.id);
        posts.push(p);
        if (posts.length >= VIRAL_TARGET) break;
      }
      source = apiPosts.length ? "mixed" : "seed";
      console.log(
        `競合収集: 公開検索が不足（${apiPosts.length}件）のため seed を併用 → ${posts.length} 件 (${source})`
      );
    }
  } catch (err) {
    console.warn("keyword_search を使えないため seed を使用:", err.message || err);
    posts = (await loadSeed()).slice(0, VIRAL_TARGET);
    source = "seed";
  }

  const payload = {
    collectedAt: new Date().toISOString(),
    source,
    count: posts.length,
    posts,
  };
  await writeJson("viral_posts.json", payload);
  return payload;
}
