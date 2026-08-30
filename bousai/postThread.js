import { WIN_REUSE_DAYS } from "./config.js";
import { generateThread } from "./generate.js";
import { loadOwnPosts, loadPlaybook, loadProducts, loadWinners, saveOwnPosts, saveWinners } from "./store.js";
import { createAndPublish } from "./threads.js";
import { shouldPostNow } from "./time.js";

export async function postAffiliateThread({ force = false, now = new Date() } = {}) {
  const playbook = await loadPlaybook();
  const ownPosts = await loadOwnPosts();
  const gate = shouldPostNow({ playbook, ownPosts, now });
  if (!force && !gate.ok) {
    console.log(`投稿スキップ: ${gate.reason}`);
    return { skipped: true, reason: gate.reason };
  }

  const products = await loadProducts();
  const winners = await loadWinners();
  const thread = await generateThread({ products, playbook, ownPosts, winners, now });

  console.log(`親:\n${thread.hook}`);
  if (thread.item.imageUrl) console.log(`画像: ${thread.item.imageUrl}`);
  console.log(`商品リプ (${thread.item.network}):\n${thread.reply}`);

  const rootId = await createAndPublish({
    text: thread.hook,
    topicTag: thread.topicTag,
    imageUrl: thread.item.imageUrl || "",
  });
  console.log(`親投稿: ${rootId}`);

  const replyId = await createAndPublish({
    text: thread.reply,
    replyToId: rootId,
  });
  console.log(`商品リプ: ${replyId}`);

  const record = {
    id: rootId,
    replyIds: [replyId],
    postedAt: now.toISOString(),
    hook: thread.hook,
    reply: thread.reply,
    productPitch: thread.productPitch || "",
    topicTag: thread.topicTag,
    productId: thread.product.id,
    productName: thread.product.name,
    itemName: thread.item.name,
    category: thread.product.category,
    network: thread.item.network,
    preferredNetwork: thread.item.preferred,
    fallback: Boolean(thread.item.fallback),
    affiliateUrl: thread.item.url,
    keywords: thread.product.keywords || null,
    trendSource: thread.product.trendSource || "",
    reuseFrom: thread.reuseFrom,
    generation: thread.generation || 1,
    metrics: { views: 0, likes: 0, replies: 0, clicks: 0 },
    verdict: "pending",
  };

  ownPosts.unshift(record);
  await saveOwnPosts(ownPosts.slice(0, 200));

  if (thread.reuseFrom) {
    const nextReuse = new Date(now.getTime() + WIN_REUSE_DAYS * 24 * 3600000).toISOString();
    const updated = winners.map((w) =>
      w.productId === thread.product.id || w.id === thread.reuseFrom
        ? { ...w, reuseAfter: nextReuse, generation: thread.generation || (w.generation || 1) + 1 }
        : w
    );
    await saveWinners(updated);
  }

  console.log(
    `投稿成功: ${rootId} / ${thread.product.id} / ${thread.item.network}` +
      (thread.reuseFrom ? ` / 再投稿 gen${thread.generation}` : "")
  );
  return { skipped: false, post: record };
}
