import {
  LOSE_AFTER_HOURS,
  LOSE_LIKE_RATIO,
  WIN_LIKE_RATIO,
  WIN_REUSE_DAYS,
} from "./config.js";
import { loadOwnPosts, loadWinners, saveOwnPosts, saveWinners } from "./store.js";
import { fetchMediaInsights } from "./threads.js";

function medianLikes(posts) {
  const likes = posts
    .map((p) => Number(p.metrics?.likes || 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (!likes.length) return 2;
  const mid = Math.floor(likes.length / 2);
  return likes.length % 2 ? likes[mid] : (likes[mid - 1] + likes[mid]) / 2;
}

function scoreOf(post) {
  return (Number(post.metrics?.likes || 0) || 0) + (Number(post.metrics?.clicks || 0) || 0) * 5;
}

function buildWinnerTemplates(posts, prev) {
  const byProduct = new Map();
  for (const post of posts.filter((p) => p.verdict === "win" && p.productId)) {
    const cur = byProduct.get(post.productId);
    if (!cur || scoreOf(post) > scoreOf(cur)) {
      byProduct.set(post.productId, post);
    }
  }

  const prevMap = new Map((prev || []).map((w) => [w.productId, w]));
  return [...byProduct.entries()].map(([productId, post]) => {
    const old = prevMap.get(productId);
    let reuseAfter = post.reuseAfter;
    if (!reuseAfter) {
      reuseAfter = new Date(
        new Date(post.postedAt).getTime() + WIN_REUSE_DAYS * 24 * 3600000
      ).toISOString();
    }
    if (old?.reuseAfter && new Date(old.reuseAfter).getTime() > new Date(reuseAfter).getTime()) {
      reuseAfter = old.reuseAfter;
    }
    return {
      id: post.id,
      productId,
      network: post.network,
      category: post.category,
      hook: post.hook,
      productPitch: post.productPitch || "",
      reply: post.reply || post.reply2,
      itemName: post.itemName || post.productName,
      keywords: post.keywords || null,
      affiliateUrl: post.affiliateUrl,
      likes: post.metrics?.likes || 0,
      clicks: post.metrics?.clicks || 0,
      generation: post.generation || 1,
      reuseAfter,
    };
  });
}

function classify(post, med, now) {
  const likes = Number(post.metrics?.likes || 0);
  const clicks = Number(post.metrics?.clicks || 0);
  const ageHours = (now.getTime() - new Date(post.postedAt).getTime()) / 3600000;

  if (clicks >= 1 || likes >= med * WIN_LIKE_RATIO) {
    return "win";
  }
  if (ageHours >= LOSE_AFTER_HOURS && likes < med * LOSE_LIKE_RATIO && clicks === 0) {
    return "lose";
  }
  return "pending";
}

async function insightsFor(post) {
  const ids = [post.id, ...(post.replyIds || [])].filter(Boolean);
  const merged = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0, clicks: 0 };
  for (const id of ids) {
    try {
      const m = await fetchMediaInsights(id);
      merged.views += m.views;
      merged.likes += m.likes;
      merged.replies += m.replies;
      merged.reposts += m.reposts;
      merged.quotes += m.quotes;
      merged.shares += m.shares;
      merged.clicks += m.clicks;
    } catch (err) {
      console.warn(`Insightsスキップ (${id}):`, err.message || err);
    }
  }
  return merged;
}

export async function refreshInsights({ now = new Date() } = {}) {
  const posts = await loadOwnPosts();
  if (!posts.length) {
    console.log("自投稿がまだないので Insights をスキップ");
    return { posts: [], winners: [] };
  }

  for (const post of posts) {
    const ageMs = now.getTime() - new Date(post.postedAt).getTime();
    if (ageMs < 30 * 60 * 1000) continue;
    post.metrics = await insightsFor(post);
    post.metricsAt = now.toISOString();
  }

  const med = medianLikes(posts);
  for (const post of posts) {
    post.verdict = classify(post, med, now);
    if (post.verdict === "win" && !post.reuseAfter) {
      post.reuseAfter = new Date(
        new Date(post.postedAt).getTime() + WIN_REUSE_DAYS * 24 * 3600000
      ).toISOString();
    }
  }

  await saveOwnPosts(posts);

  const prev = await loadWinners();
  const winners = buildWinnerTemplates(posts, prev);
  await saveWinners(winners);

  const wins = winners.length;
  const loses = posts.filter((p) => p.verdict === "lose").length;
  console.log(`自投稿分析: ${posts.length}件 / 勝ち${wins} / 負け${loses} / likes中央値${med}`);
  return { posts, winners, medianLikes: med };
}
