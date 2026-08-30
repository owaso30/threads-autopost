export const THEME = "暮らしと防災";

export const NEWS_WINDOW = {
  startMinutes: 19 * 60 + 45,
  endMinutes: 20 * 60 + 30,
};

export const DEFAULT_FREQUENCY = {
  postsPerDay: 3,
  hoursBetween: 4,
  peakHoursJst: [8, 12, 21],
};

export const WIN_REUSE_DAYS = 7;
export const LOSE_AFTER_HOURS = 12;
export const WIN_LIKE_RATIO = 1.5;
export const LOSE_LIKE_RATIO = 0.5;

export const THREADS_API = "https://graph.threads.net/v1.0";
export const PUBLISH_WAIT_MS = 20000;
export const REPLY_WAIT_MS = 15000;

/** 楽天 Developers の Allowed websites。GitHub Actions からの検索に Referer が必須 */
export const RAKUTEN_REFERER =
  process.env.RAKUTEN_REFERER || "https://growfolio-note.com/";

export const MAX_POST_LEN = 500;
