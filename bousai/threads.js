import { PUBLISH_WAIT_MS, REPLY_WAIT_MS, THREADS_API } from "./config.js";

function credentials() {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!accessToken || !userId) {
    throw new Error("THREADS_ACCESS_TOKEN と THREADS_USER_ID が必要です");
  }
  return { accessToken, userId };
}

export async function threadsGet(path, params = {}) {
  const { accessToken } = credentials();
  const url = new URL(`${THREADS_API}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function threadsPost(path, params = {}) {
  const { accessToken } = credentials();
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(`${THREADS_API}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function createAndPublish({ text, topicTag, replyToId }) {
  const { userId } = credentials();
  const payload = { media_type: "TEXT", text };
  if (topicTag) payload.topic_tag = topicTag;
  if (replyToId) payload.reply_to_id = replyToId;

  const created = await threadsPost(`${userId}/threads`, payload);
  if (!created.data?.id) {
    throw new Error(`コンテナ作成失敗 (HTTP ${created.status}): ${JSON.stringify(created.data)}`);
  }

  await new Promise((r) => setTimeout(r, replyToId ? REPLY_WAIT_MS : PUBLISH_WAIT_MS));

  const published = await threadsPost(`${userId}/threads_publish`, {
    creation_id: created.data.id,
  });
  if (!published.data?.id) {
    throw new Error(`公開失敗 (HTTP ${published.status}): ${JSON.stringify(published.data)}`);
  }
  return published.data.id;
}

export async function fetchMediaInsights(mediaId) {
  const { ok, status, data } = await threadsGet(`${mediaId}/insights`, {
    metric: "views,likes,replies,reposts,quotes,shares",
  });
  if (!ok) {
    throw new Error(`Insights取得失敗 (HTTP ${status}): ${JSON.stringify(data)}`);
  }
  const metrics = { views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0, clicks: 0 };
  for (const row of data?.data || []) {
    const name = row.name;
    const value = row.values?.[0]?.value ?? row.total_value?.value ?? 0;
    if (name in metrics) metrics[name] = Number(value) || 0;
  }
  return metrics;
}
