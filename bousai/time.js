import { DEFAULT_FREQUENCY, NEWS_WINDOW } from "./config.js";

function toDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

export function getJstParts(date = new Date()) {
  const jst = new Date(toDate(date).getTime() + 9 * 60 * 60 * 1000);
  return {
    year: jst.getUTCFullYear(),
    month: jst.getUTCMonth(),
    day: jst.getUTCDate(),
    hour: jst.getUTCHours(),
    minute: jst.getUTCMinutes(),
    weekday: jst.getUTCDay(),
  };
}

export function jstDateKey(date = new Date()) {
  const { year, month, day } = getJstParts(date);
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function weekdayLabel(date = new Date()) {
  return ["日", "月", "火", "水", "木", "金", "土"][getJstParts(date).weekday];
}

export function toJstHour(isoOrDate) {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return null;
  return getJstParts(date).hour;
}

export function isNewsQuietWindow(date = new Date()) {
  const { hour, minute } = getJstParts(date);
  const t = hour * 60 + minute;
  return t >= NEWS_WINDOW.startMinutes && t < NEWS_WINDOW.endMinutes;
}

export function hoursUntil(from, to) {
  return (new Date(to).getTime() - new Date(from).getTime()) / 3600000;
}

export function shouldPostNow({ playbook, ownPosts, now = new Date() }) {
  if (isNewsQuietWindow(now)) {
    return { ok: false, reason: "20時ニュース投稿窓（19:45-20:30 JST）のためスキップ" };
  }

  const freq = {
    ...DEFAULT_FREQUENCY,
    ...(playbook?.viral?.frequency || {}),
  };
  const posts = [...(ownPosts || [])].sort(
    (a, b) => new Date(b.postedAt) - new Date(a.postedAt)
  );
  const todayKey = jstDateKey(now);
  const todayPosts = posts.filter((p) => p.postedAt && jstDateKey(p.postedAt) === todayKey);

  if (todayPosts.length >= freq.postsPerDay) {
    return {
      ok: false,
      reason: `当日上限 ${freq.postsPerDay} 本に到達済み`,
    };
  }

  const last = posts[0];
  if (last?.postedAt) {
    const elapsed = hoursUntil(last.postedAt, now);
    if (elapsed < freq.hoursBetween) {
      return {
        ok: false,
        reason: `前投稿から ${elapsed.toFixed(1)} 時間（間隔 ${freq.hoursBetween} 時間未満）`,
      };
    }
  }

  const hour = getJstParts(now).hour;
  const peaks = Array.isArray(freq.peakHoursJst) && freq.peakHoursJst.length
    ? freq.peakHoursJst
    : DEFAULT_FREQUENCY.peakHoursJst;
  const nearPeak = peaks.some((p) => Math.abs(Number(p) - hour) <= 1);
  const remaining = freq.postsPerDay - todayPosts.length;
  const hoursLeft = Math.max(0, 23 - hour);

  if (!nearPeak && remaining > 0 && hoursLeft > 3) {
    return {
      ok: false,
      reason: `ピーク時間帯（${peaks.join(",")}時 JST）まで待機`,
    };
  }

  return { ok: true, reason: "投稿可", frequency: freq };
}
