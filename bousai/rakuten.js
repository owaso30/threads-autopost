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

async function searchAt(endpoint, keyword, { hits = "8", sort = "-reviewCount" } = {}) {
  const { applicationId, affiliateId, accessKey } = env();
  const params = new URLSearchParams({
    applicationId,
    keyword,
    hits: String(hits),
    sort,
    formatVersion: "2",
  });
  if (affiliateId) params.set("affiliateId", affiliateId);
  if (accessKey) params.set("accessKey", accessKey);

  const res = await fetch(`${endpoint}?${params}`, {
    headers: { "User-Agent": "threads-bousai-pdca/1.0" },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`楽天検索失敗 (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

function firstImageUrl(item) {
  const lists = [item.mediumImageUrls, item.smallImageUrls, item.mediumImageUrl, item.smallImageUrl];
  for (const entry of lists) {
    if (typeof entry === "string" && /^https?:\/\//i.test(entry)) return entry;
    if (Array.isArray(entry) && entry.length) {
      const u = entry[0]?.imageUrl || entry[0]?.url || entry[0];
      if (typeof u === "string" && /^https?:\/\//i.test(u)) return u;
    }
  }
  if (typeof item.imageUrl === "string" && /^https?:\/\//i.test(item.imageUrl)) return item.imageUrl;
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
  if (!items.length) return null;
  return items[Math.floor(Math.random() * Math.min(5, items.length))];
}

export async function searchRakutenItems(keyword, options = {}) {
  if (!rakutenConfigured() || !keyword) return [];
  const hits = options.hits || 8;
  const sort = options.sort || "-reviewCount";
  try {
    const data = env().accessKey
      ? await searchAt(NEW_ENDPOINT, keyword, { hits, sort })
      : await searchAt(LEGACY_ENDPOINT, keyword, { hits, sort });
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
    const data = env().accessKey
      ? await searchAt(NEW_ENDPOINT, keyword)
      : await searchAt(LEGACY_ENDPOINT, keyword);
    const item = pickItem(data);
    if (item) return item;
  } catch (err) {
    console.warn("楽天 第一エンドポイント失敗:", err.message || err);
  }

  try {
    const fallback = env().accessKey
      ? await searchAt(LEGACY_ENDPOINT, keyword)
      : await searchAt(NEW_ENDPOINT, keyword);
    return pickItem(fallback);
  } catch (err) {
    console.warn("楽天 フォールバック失敗:", err.message || err);
    return null;
  }
}
