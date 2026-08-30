import { searchAmazonItem, amazonConfigured } from "./amazon.js";
import { searchRakutenItem, rakutenConfigured } from "./rakuten.js";
import { proposeTrendProduct } from "./trends.js";

function availableNetworks() {
  const list = [];
  if (amazonConfigured()) list.push("amazon");
  if (rakutenConfigured()) list.push("rakuten");
  return list;
}

function pickRandomNetwork() {
  const list = availableNetworks();
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

async function fetchOn(network, product) {
  if (network === "amazon") {
    if (!amazonConfigured()) return null;
    return searchAmazonItem(product);
  }
  if (!rakutenConfigured()) return null;
  return searchRakutenItem(product?.keywords?.rakuten || product?.name);
}

export async function resolveAffiliateItem(product) {
  const preferred = pickRandomNetwork();
  if (!preferred) {
    throw new Error(
      `商品 ${product.id} のアフィリエイトリンクを作れませんでした。楽天または Amazon の Secrets を確認してください。`
    );
  }

  const first = await fetchOn(preferred, product);
  if (first) {
    console.log(`アフィ選定 ${product.id}: ${preferred}（ランダム）`);
    return { ...first, preferred, fallback: false, productId: product.id };
  }

  const other = preferred === "amazon" ? "rakuten" : "amazon";
  const second = await fetchOn(other, product);
  if (second) {
    console.warn(`アフィ ${preferred} が空のため ${other} にフォールバック (${product.id})`);
    return { ...second, preferred, fallback: true, productId: product.id };
  }

  throw new Error(
    `商品 ${product.id} のアフィリエイトリンクを作れませんでした。楽天または Amazon の Secrets を確認してください。`
  );
}

function productFromWinner(winner, products) {
  const found = products.find((p) => p.id === winner.productId);
  const keyword = winner.keywords?.rakuten || winner.keywords?.amazon || winner.itemName || found?.name;
  return {
    id: winner.productId,
    name: winner.itemName || winner.productName || found?.name || keyword,
    category: winner.category || found?.category || "other",
    pitch: winner.productPitch || found?.pitch || "",
    keywords: winner.keywords || found?.keywords || { rakuten: keyword, amazon: keyword },
  };
}

function pickCatalogProduct({ products, playbook, ownPosts, now }) {
  const recentIds = (ownPosts || [])
    .slice()
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
    .slice(0, 3)
    .map((p) => p.productId);
  const fresh = products.filter((p) => !recentIds.includes(p.id));
  const pool = fresh.length ? fresh : products;
  const seed =
    now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate() + now.getUTCHours();
  const winningIds = new Set((playbook?.own?.winningProducts || []).map((p) => p.id || p.productId));
  const ranked = [...pool].sort((a, b) => {
    const aw = winningIds.has(a.id) ? 1 : 0;
    const bw = winningIds.has(b.id) ? 1 : 0;
    return bw - aw;
  });
  return ranked[seed % ranked.length];
}

export async function chooseProduct({ products, playbook, ownPosts, winners, now = new Date() }) {
  const recentIds = (ownPosts || [])
    .slice()
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
    .slice(0, 3)
    .map((p) => p.productId);

  const due = (winners || [])
    .filter((w) => w.productId && w.reuseAfter && new Date(w.reuseAfter).getTime() <= now.getTime())
    .filter((w) => !recentIds.includes(w.productId))
    .sort(
      (a, b) =>
        (b.likes || 0) + (b.clicks || 0) * 5 - ((a.likes || 0) + (a.clicks || 0) * 5)
    );

  if (due[0]) {
    return { product: productFromWinner(due[0], products), reuse: due[0] };
  }

  try {
    const trend = await proposeTrendProduct({ playbook, ownPosts, now });
    if (trend) {
      console.log(`トレンド商品: ${trend.name} / ${trend.keywords.rakuten}`);
      return { product: trend, reuse: null };
    }
  } catch (err) {
    console.warn("トレンド商品の選定に失敗。カタログにフォールバック:", err.message || err);
  }

  const fallback = pickCatalogProduct({ products, playbook, ownPosts, now });
  if (!fallback) {
    throw new Error("投稿できる商品がありません");
  }
  return { product: fallback, reuse: null };
}
