import { searchAmazonItem, amazonConfigured } from "./amazon.js";
import { searchRakutenItem, rakutenConfigured } from "./rakuten.js";

const AMAZON_CATEGORIES = new Set(["electronics"]);
const RAKUTEN_CATEGORIES = new Set(["kit", "food"]);

function clicksFor(playbook, category, network) {
  const byCat = playbook?.own?.networkClicks?.byCategory?.[category] || {};
  if (typeof byCat[network] === "number") return byCat[network];
  return playbook?.own?.networkClicks?.[network] || 0;
}

function viralBias(playbook, category) {
  const byCat = playbook?.viral?.affiliateNetworks?.byCategory?.[category];
  if (byCat && (byCat.amazon || byCat.rakuten)) {
    if ((byCat.amazon || 0) > (byCat.rakuten || 0)) return "amazon";
    if ((byCat.rakuten || 0) > (byCat.amazon || 0)) return "rakuten";
  }
  const all = playbook?.viral?.affiliateNetworks || {};
  if ((all.amazon || 0) > (all.rakuten || 0)) return "amazon";
  if ((all.rakuten || 0) > (all.amazon || 0)) return "rakuten";
  return null;
}

export function pickNetwork(product, playbook) {
  const fixed = product?.network;
  if (fixed === "amazon" || fixed === "rakuten") return fixed;

  const category = product?.category || "";
  const amazonClicks = clicksFor(playbook, category, "amazon");
  const rakutenClicks = clicksFor(playbook, category, "rakuten");
  if (amazonClicks !== rakutenClicks) {
    return amazonClicks > rakutenClicks ? "amazon" : "rakuten";
  }

  const bias = viralBias(playbook, category);
  if (bias) return bias;

  if (AMAZON_CATEGORIES.has(category)) return "amazon";
  if (RAKUTEN_CATEGORIES.has(category)) return "rakuten";
  return "amazon";
}

async function fetchOn(network, product) {
  if (network === "amazon") {
    if (!amazonConfigured()) return null;
    return searchAmazonItem(product);
  }
  if (!rakutenConfigured()) return null;
  return searchRakutenItem(product?.keywords?.rakuten || product?.name);
}

export async function resolveAffiliateItem(product, playbook) {
  const preferred = pickNetwork(product, playbook);
  const first = await fetchOn(preferred, product);
  if (first) {
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

export function pickProduct({ products, playbook, ownPosts, winners, now = new Date() }) {
  const reuse = (winners || []).find((w) => {
    if (!w.productId || !w.reuseAfter) return false;
    return new Date(w.reuseAfter).getTime() <= now.getTime();
  });
  if (reuse) {
    const found = products.find((p) => p.id === reuse.productId);
    if (found) {
      return { product: found, reuseFrom: reuse.id || reuse.rootId || null };
    }
  }

  const recentIds = (ownPosts || [])
    .slice()
    .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt))
    .slice(0, 4)
    .map((p) => p.productId);
  const fresh = products.filter((p) => !recentIds.includes(p.id));
  const pool = fresh.length ? fresh : products;
  const seed = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate() + now.getUTCHours();
  const winningIds = new Set((playbook?.own?.winningProducts || []).map((p) => p.id || p.productId));
  const ranked = [...pool].sort((a, b) => {
    const aw = winningIds.has(a.id) ? 1 : 0;
    const bw = winningIds.has(b.id) ? 1 : 0;
    return bw - aw;
  });
  return { product: ranked[seed % ranked.length], reuseFrom: null };
}
