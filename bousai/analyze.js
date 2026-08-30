import { DEFAULT_FREQUENCY, DEFAULT_SPLIT, THEME, VIRAL_TARGET } from "./config.js";
import {
  loadOwnPosts,
  loadPlaybook,
  loadWinners,
  readJson,
  saveWinners,
  writeJson,
} from "./store.js";
import { toJstHour } from "./time.js";
import { classifyNetwork } from "./urls.js";

function median(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function guessCategory(text) {
  const t = text || "";
  if (/非常食|缶詰|レトルト/.test(t)) return "food";
  if (/保存水|水\d|断水/.test(t)) return "water";
  if (/ラジオ|懐中電灯|ライト|電池|モバイルバッテリー/.test(t)) return "electronics";
  if (/トイレ|凝固/.test(t)) return "kit";
  if (/ヘルメット/.test(t)) return "gear";
  if (/救急|絆創膏/.test(t)) return "kit";
  if (/防災セット|防災グッズ/.test(t)) return "kit";
  return "other";
}

function analyzeFrequency(posts) {
  const byUser = new Map();
  for (const p of posts) {
    if (!p.username || !p.timestamp) continue;
    if (!byUser.has(p.username)) byUser.set(p.username, []);
    byUser.get(p.username).push(new Date(p.timestamp).getTime());
  }

  const perDay = [];
  const intervals = [];
  const hours = [];

  for (const times of byUser.values()) {
    const sorted = times.filter(Number.isFinite).sort((a, b) => a - b);
    for (const t of sorted) {
      const h = toJstHour(t);
      if (h !== null) hours.push(h);
    }
    if (sorted.length < 2) continue;
    const days = new Set(sorted.map((t) => new Date(t + 9 * 3600000).toISOString().slice(0, 10)));
    perDay.push(sorted.length / Math.max(1, days.size));
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = (sorted[i] - sorted[i - 1]) / 3600000;
      if (gap > 0.5 && gap < 36) intervals.push(gap);
    }
  }

  const hourBuckets = Array.from({ length: 24 }, () => 0);
  for (const h of hours) hourBuckets[h] += 1;
  const peakHoursJst = hourBuckets
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .filter((x) => x.count > 0)
    .slice(0, 3)
    .map((x) => x.hour)
    .sort((a, b) => a - b);

  return {
    postsPerDay: Math.max(1, Math.min(5, Math.round(median(perDay) || DEFAULT_FREQUENCY.postsPerDay))),
    hoursBetween: Math.max(
      3,
      Math.min(8, Math.round(median(intervals) || DEFAULT_FREQUENCY.hoursBetween))
    ),
    peakHoursJst: peakHoursJst.length ? peakHoursJst : DEFAULT_FREQUENCY.peakHoursJst,
    sampleUsers: byUser.size,
  };
}

function analyzeViral(posts) {
  const placements = {};
  const networks = { amazon: 0, rakuten: 0, other: 0 };
  const byCategory = {};
  const hooks = [];
  let touten = 0;
  let pr = 0;

  for (const p of posts) {
    const place = p.linkPlacement || "none";
    placements[place] = (placements[place] || 0) + 1;
    if (p.endsWithTouten) touten += 1;
    if (p.hasPr) pr += 1;
    const cat = guessCategory(`${p.text} ${(p.replies || []).map((r) => r.text).join(" ")}`);
    if (!byCategory[cat]) byCategory[cat] = { amazon: 0, rakuten: 0, other: 0 };
    for (const url of p.urls || []) {
      const net = classifyNetwork(url);
      networks[net] += 1;
      byCategory[cat][net] += 1;
    }
    if (p.text) {
      hooks.push({
        text: p.text.slice(0, 80),
        endsWithTouten: Boolean(p.endsWithTouten),
        placement: place,
      });
    }
  }

  const topPlacement = Object.entries(placements).sort((a, b) => b[1] - a[1])[0]?.[0] || "reply2";
  const linkPlacement = topPlacement === "none" ? DEFAULT_SPLIT.linkPlacement : topPlacement;

  return {
    sampleSize: posts.length,
    hookPatterns: hooks.filter((h) => h.endsWithTouten).slice(0, 8),
    toutenRate: posts.length ? touten / posts.length : 0,
    prRate: posts.length ? pr / posts.length : 0,
    placements,
    splitRules: {
      ...DEFAULT_SPLIT,
      linkPlacement,
      hookMaxLines: 2,
      cutAt: touten / Math.max(1, posts.length) >= 0.3 ? "読点" : "読点",
    },
    affiliatePlacement: linkPlacement,
    affiliateNetworks: { ...networks, byCategory },
    frequency: analyzeFrequency(posts),
  };
}

function analyzeOwn(ownPosts) {
  const networkClicks = { amazon: 0, rakuten: 0, byCategory: {} };
  const winningHooks = [];
  const winningProducts = [];

  for (const p of ownPosts) {
    const clicks = Number(p.metrics?.clicks || 0);
    const net = p.network;
    const cat = p.category || "other";
    if (net === "amazon" || net === "rakuten") {
      networkClicks[net] += clicks;
      if (!networkClicks.byCategory[cat]) {
        networkClicks.byCategory[cat] = { amazon: 0, rakuten: 0 };
      }
      networkClicks.byCategory[cat][net] += clicks;
    }
    if (p.verdict === "win") {
      if (p.hook) winningHooks.push({ text: p.hook, likes: p.metrics?.likes || 0, clicks });
      if (p.productId) {
        winningProducts.push({
          productId: p.productId,
          network: p.network,
          likes: p.metrics?.likes || 0,
          clicks,
        });
      }
    }
  }

  winningHooks.sort((a, b) => b.likes + b.clicks * 5 - (a.likes + a.clicks * 5));
  winningProducts.sort((a, b) => b.clicks - a.clicks || b.likes - a.likes);

  return {
    winningHooks: winningHooks.slice(0, 8),
    winningProducts: winningProducts.slice(0, 8),
    networkClicks,
  };
}

export async function analyzePlaybook() {
  const viralFile = await readJson("viral_posts.json", { posts: [], source: "none" });
  const posts = (viralFile.posts || []).slice(0, VIRAL_TARGET);
  const ownPosts = await loadOwnPosts();
  const prev = await loadPlaybook();

  const viral = analyzeViral(posts);
  viral.source = viralFile.source || prev.viral?.source || "seed";
  const own = analyzeOwn(ownPosts);

  const playbook = {
    updatedAt: new Date().toISOString(),
    theme: THEME,
    viral,
    own,
  };
  await writeJson("playbook.json", playbook);

  const winners = (await loadWinners()).filter((w) =>
    ownPosts.some((p) => p.id === w.id && p.verdict === "win")
  );
  await saveWinners(winners);

  console.log(
    `playbook 更新: 競合${viral.sampleSize}件 source=${viral.source} 頻度=${viral.frequency.postsPerDay}本/日 間隔=${viral.frequency.hoursBetween}h ピーク=${viral.frequency.peakHoursJst.join(",")}時 貼り方=${viral.affiliatePlacement}`
  );
  return playbook;
}
