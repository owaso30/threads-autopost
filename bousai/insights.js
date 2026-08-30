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

  const winners = posts
    .filter((p) => p.verdict === "win")
    .map((p) => ({
      id: p.id,
      productId: p.productId,
      network: p.network,
      category: p.category,
      hook: p.hook,
      likes: p.metrics?.likes || 0,
      clicks: p.metrics?.clicks || 0,
      reuseAfter: p.reuseAfter,
    }));
  await saveWinners(winners);

  const wins = winners.length;
  const loses = posts.filter((p) => p.verdict === "lose").length;
  console.log(`自投稿分析: ${posts.length}件 / 勝ち${wins} / 負け${loses} / likes中央値${med}`);
  return { posts, winners, medianLikes: med };
}
