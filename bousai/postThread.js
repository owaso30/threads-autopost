import { WIN_REUSE_DAYS } from "./config.js";
import { generateThread } from "./generate.js";
import { loadOwnPosts, loadPlaybook, loadProducts, loadWinners, saveOwnPosts } from "./store.js";
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
  if (!products.length) {
    throw new Error("data/products.json が空です");
  }
  const winners = await loadWinners();
  const thread = await generateThread({ products, playbook, ownPosts, winners, now });

  console.log(`親フック:\n${thread.hook}`);
  console.log(`1リプ:\n${thread.body}`);
  console.log(`2リプ (${thread.item.network}):\n${thread.reply2}`);

  const rootId = await createAndPublish({
    text: thread.hook,
    topicTag: thread.topicTag,
  });
  console.log(`親投稿: ${rootId}`);

  const reply1Id = await createAndPublish({
    text: thread.body,
    replyToId: rootId,
  });
  console.log(`1リプ: ${reply1Id}`);

  const reply2Id = await createAndPublish({
    text: thread.reply2,
    replyToId: reply1Id,
  });
  console.log(`2リプ: ${reply2Id}`);

  const record = {
    id: rootId,
    replyIds: [reply1Id, reply2Id],
    postedAt: now.toISOString(),
    hook: thread.hook,
    body: thread.body,
    reply2: thread.reply2,
    topicTag: thread.topicTag,
    productId: thread.product.id,
    productName: thread.product.name,
    category: thread.product.category,
    network: thread.item.network,
    preferredNetwork: thread.item.preferred,
    fallback: Boolean(thread.item.fallback),
    affiliateUrl: thread.item.url,
    reuseFrom: thread.reuseFrom,
    metrics: { views: 0, likes: 0, replies: 0, clicks: 0 },
    verdict: "pending",
    reuseAfter: new Date(now.getTime() + WIN_REUSE_DAYS * 24 * 3600000).toISOString(),
  };

  ownPosts.unshift(record);
  await saveOwnPosts(ownPosts.slice(0, 200));
  console.log(`投稿成功: ${rootId} / ${thread.product.id} / ${thread.item.network}`);
  return { skipped: false, post: record };
}
