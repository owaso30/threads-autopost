import crypto from "node:crypto";

const HOST = "webservices.amazon.co.jp";
const REGION = "us-west-2";
const SERVICE = "ProductAdvertisingAPI";
const MARKETPLACE = "www.amazon.co.jp";

function env() {
  return {
    tag: process.env.AMAZON_ASSOCIATE_TAG || "",
    accessKey: process.env.AMAZON_PAAPI_ACCESS_KEY || "",
    secretKey: process.env.AMAZON_PAAPI_SECRET_KEY || "",
  };
}

export function amazonConfigured() {
  return Boolean(env().tag);
}

export function amazonPaapiConfigured() {
  const { tag, accessKey, secretKey } = env();
  return Boolean(tag && accessKey && secretKey);
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function amzDate(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso, date: iso.slice(0, 8) };
}

function signPaapi({ target, payload }) {
  const { accessKey, secretKey } = env();
  const { amz, date } = amzDate();
  const canonicalHeaders = [
    "content-encoding:amz-1.0",
    "content-type:application/json; charset=utf-8",
    `host:${HOST}`,
    `x-amz-date:${amz}`,
    `x-amz-target:${target}`,
    "",
  ].join("\n");
  const signedHeaders = "content-encoding;content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = [
    "POST",
    "/paapi5/searchitems",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");

  const credentialScope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amz,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretKey}`, date);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    amz,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function paapiSearchItems(keyword) {
  const { tag } = env();
  const payload = JSON.stringify({
    PartnerTag: tag,
    PartnerType: "Associates",
    Marketplace: MARKETPLACE,
    Keywords: keyword,
    SearchIndex: "All",
    ItemCount: 3,
    Resources: ["ItemInfo.Title", "Offers.Listings.Price", "Images.Primary.Large"],
  });
  const target = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems";
  const signed = signPaapi({ target, payload });

  const res = await fetch(`https://${HOST}/paapi5/searchitems`, {
    method: "POST",
    headers: {
      "content-encoding": "amz-1.0",
      "content-type": "application/json; charset=utf-8",
      host: HOST,
      "x-amz-date": signed.amz,
      "x-amz-target": target,
      authorization: signed.authorization,
    },
    body: payload,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`PA-API失敗 (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  const items = data?.SearchResult?.Items || [];
  if (!items.length) return null;
  const item = items[Math.floor(Math.random() * items.length)];
  if (!item?.DetailPageURL) return null;
  return {
    network: "amazon",
    name: item.ItemInfo?.Title?.DisplayValue || keyword,
    url: item.DetailPageURL,
    imageUrl: item.Images?.Primary?.Large?.URL || "",
    price: item.Offers?.Listings?.[0]?.Price?.DisplayAmount || null,
    shop: "Amazon",
    concrete: true,
  };
}

export function amazonSearchUrl(keyword) {
  const { tag } = env();
  const url = new URL("https://www.amazon.co.jp/s");
  url.searchParams.set("k", keyword);
  if (tag) url.searchParams.set("tag", tag);
  return url.toString();
}

export function amazonAsinUrl(asin) {
  const { tag } = env();
  const url = new URL(`https://www.amazon.co.jp/dp/${encodeURIComponent(asin)}`);
  if (tag) url.searchParams.set("tag", tag);
  return url.toString();
}

export async function searchAmazonItem(product) {
  if (!amazonConfigured()) return null;
  const keyword = product?.keywords?.amazon || product?.name || "";
  const asin = product?.asin || "";

  if (amazonPaapiConfigured() && keyword) {
    try {
      const item = await paapiSearchItems(keyword);
      if (item) return item;
    } catch (err) {
      console.warn("Amazon PA-API失敗。タグ付きURLにフォールバック:", err.message || err);
    }
  }

  if (asin) {
    return {
      network: "amazon",
      name: product.name || keyword || asin,
      url: amazonAsinUrl(asin),
      price: null,
      shop: "Amazon",
      concrete: true,
      imageUrl: "",
    };
  }

  if (!keyword) return null;
  return {
    network: "amazon",
    name: product.name || keyword,
    url: amazonSearchUrl(keyword),
    price: null,
    shop: "Amazon",
    concrete: false,
    imageUrl: "",
  };
}
