const URL_RE = /https?:\/\/[^\s)\]】」』>]+/gi;

export function extractUrls(text) {
  if (!text) return [];
  const matches = String(text).match(URL_RE) || [];
  return matches.map((u) => u.replace(/[.,、。]+$/, ""));
}

export function classifyNetwork(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host.includes("amazon.") ||
      host.includes("amzn.to") ||
      host.includes("amzn.asia") ||
      host.includes("a.co")
    ) {
      return "amazon";
    }
    if (
      host.includes("rakuten.") ||
      host.includes("afl.rakuten") ||
      host.includes("r10.to") ||
      host.includes("room.rakuten")
    ) {
      return "rakuten";
    }
    return "other";
  } catch {
    return "other";
  }
}

export function classifyUrls(urls) {
  const counts = { amazon: 0, rakuten: 0, other: 0 };
  for (const url of urls) {
    counts[classifyNetwork(url)] += 1;
  }
  return counts;
}

export function linkPlacementOf({ rootText, replies }) {
  const rootUrls = extractUrls(rootText);
  if (rootUrls.length) return "body";

  const replyList = Array.isArray(replies) ? replies : [];
  for (let i = 0; i < replyList.length; i += 1) {
    const urls = extractUrls(replyList[i]?.text || "");
    if (urls.length) {
      if (i === 0) return "reply1";
      if (i === 1) return "reply2";
      return `reply${i + 1}`;
    }
  }

  const blob = [rootText, ...replyList.map((r) => r.text || "")].join("\n");
  if (/プロフィール|固定|ハイライト|bio/i.test(blob) && /http|リンク|見て/i.test(blob)) {
    return "profile";
  }
  return "none";
}

export function hasPrMark(text) {
  return /#PR\b|#広告\b|#アフィリエイト\b|プロモーション|広告を含み/i.test(text || "");
}
