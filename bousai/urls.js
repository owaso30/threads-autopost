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
      host.includes("amzlinks.") ||
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

export function hasPrMark(text) {
  return /#PR\b|#広告\b|#アフィリエイト\b|プロモーション|広告を含み|\[Amazon PR\]|Amazon PR|\bPR\b|アソシエイトとして収入/i.test(
    text || ""
  );
}
