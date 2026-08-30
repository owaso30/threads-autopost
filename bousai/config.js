export const THEME = "暮らしと防災";

export const VIRAL_TARGET = 20;

export const SEARCH_QUERIES = [
  "防災",
  "非常食",
  "防災グッズ",
  "備蓄",
  "災害 備え",
];

export const TOPIC_SEARCH_TAGS = ["防災", "非常食", "備蓄"];

export const NEWS_WINDOW = {
  startMinutes: 19 * 60 + 45,
  endMinutes: 20 * 60 + 30,
};

export const DEFAULT_FREQUENCY = {
  postsPerDay: 3,
  hoursBetween: 4,
  peakHoursJst: [8, 12, 21],
};

export const DEFAULT_SPLIT = {
  cutAt: "読点",
  hookMaxLines: 2,
  linkPlacement: "reply2",
};

export const WIN_REUSE_DAYS = 7;
export const LOSE_AFTER_HOURS = 12;
export const WIN_LIKE_RATIO = 1.5;
export const LOSE_LIKE_RATIO = 0.5;

export const THREADS_API = "https://graph.threads.net/v1.0";
export const PUBLISH_WAIT_MS = 20000;
export const REPLY_WAIT_MS = 15000;

export const MAX_POST_LEN = 500;
