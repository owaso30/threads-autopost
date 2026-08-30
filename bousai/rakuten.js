import { RAKUTEN_REFERER } from "./config.js";

const LEGACY_ENDPOINT =
  "https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601";
const NEW_ENDPOINT =
  "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260401";

function env() {
  return {
    applicationId: process.env.RAKUTEN_APPLICATION_ID || "",
    affiliateId: process.env.RAKUTEN_AFFILIATE_ID || "",
    accessKey: process.env.RAKUTEN_ACCESS_KEY || "",
  };
}

export function rakutenConfigured() {
  return Boolean(env().applicationId);
}

function searchHeaders() {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: RAKUTEN_REFERER,
    Origin: new URL(RAKUTEN_REFERER).origin,
    Accept: "application/json",
  };
}

function primaryEndpoint() {
  return env().accessKey ? NEW_ENDPOINT : LEGACY_ENDPOINT;
}

async function searchAt(endpoint, keyword, { hits = "8", sort = "-reviewCount" } = {}) {
  const { applicationId, affiliateId, accessKey } = env();
  const params = new URLSearchParams({
    applicationId,
    keyword,
    hits: String(hits),
    sort,
    formatVersion: "2",
    imageFlag: "1",
  });
  if (affiliateId) params.set("affiliateId", affiliateId);
  if (accessKey) params.set("accessKey", accessKey);

  let res = await fetch(`${endpoint}?${params}`, { headers: searchHeaders() });
  let data = await res.json();
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    res = await fetch(`${endpoint}?${params}`, { headers: searchHeaders() });
    data = await res.json();
  }
  if (!res.ok) {
    throw new Error(`楽天検索失敗 (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

/** Threads は最短辺 320px 以上。楽天サムネはデフォルト 128px なので拡大する */
function forThreadsImage(url) {
  if (!url || typeof url !== "string") return "";
  let u = url.trim().replace(/^http:\/\//i, "https://");
  if (!/^https:\/\//i.test(u)) return "";
  if (/[?&]_ex=/i.test(u)) {
    u = u.replace(/([?&]_ex=)\d+x\d+/i, "$1800x800");
  } else {
    u += (u.includes("?") ? "&" : "?") + "_ex=800x800";
  }
  return u;
}

function pickUrl(value) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (value && typeof value === "object") {
    const nested = value.imageUrl || value.url;
    if (typeof nested === "string" && /^https?:\/\//i.test(nested)) return nested;
  }
  return "";
}

function firstImageUrl(item) {
  const lists = [
    item.mediumImageUrls,
    item.smallImageUrls,
    item.mediumImageUrl,
    item.smallImageUrl,
    item.imageUrl,
  ];
  for (const entry of lists) {
    const direct = pickUrl(entry);
    if (direct) return forThreadsImage(direct);
    if (Array.isArray(entry)) {
      for (const row of entry) {
        const u = pickUrl(row);
        if (u) return forThreadsImage(u);
      }
    }
  }
  return "";
}

function mapItem(raw) {
  const first = raw?.Item || raw;
  if (!first) return null;
  const url = first.affiliateUrl || first.itemUrl || "";
  const name = first.itemName || first.name || "";
  if (!url || !name) return null;
  return {
    network: "rakuten",
    name: String(name).slice(0, 80),
    url,
    imageUrl: firstImageUrl(first),
    price: first.itemPrice ?? first.price ?? null,
    shop: first.shopName || "",
    concrete: true,
  };
}

function pickItem(data) {
  const items = (Array.isArray(data?.Items) ? data.Items : []).map(mapItem).filter(Boolean);
  const withImage = items.filter((i) => i.imageUrl);
  const pool = withImage.length ? withImage : items;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * Math.min(5, pool.length))];
}

export async function searchRakutenItems(keyword, options = {}) {
  if (!rakutenConfigured() || !keyword) return [];
  const hits = options.hits || 8;
  const sort = options.sort || "-reviewCount";
  try {
    const data = await searchAt(primaryEndpoint(), keyword, { hits, sort });
    return (Array.isArray(data?.Items) ? data.Items : []).map(mapItem).filter(Boolean);
  } catch (err) {
    console.warn("楽天一覧検索失敗:", err.message || err);
    return [];
  }
}

export async function searchRakutenItem(keyword) {
  if (!rakutenConfigured()) return null;
  if (!keyword) return null;

  try {
    const data = await searchAt(primaryEndpoint(), keyword);
    return pickItem(data);
  } catch (err) {
    console.warn("楽天検索失敗:", err.message || err);
    return null;
  }
}
