import { loadEnv } from "./loadEnv.js";

const COMMANDS = ["collect", "analyze", "post", "insights", "learn", "cycle"];

async function run(command, { force = false } = {}) {
  switch (command) {
    case "collect": {
      const { collectViral } = await import("./collectViral.js");
      return collectViral();
    }
    case "insights": {
      const { refreshInsights } = await import("./insights.js");
      return refreshInsights();
    }
    case "analyze": {
      const { analyzePlaybook } = await import("./analyze.js");
      return analyzePlaybook();
    }
    case "post": {
      const { postAffiliateThread } = await import("./postThread.js");
      return postAffiliateThread({ force });
    }
    case "learn": {
      const { collectViral } = await import("./collectViral.js");
      const { refreshInsights } = await import("./insights.js");
      const { analyzePlaybook } = await import("./analyze.js");
      await collectViral();
      await refreshInsights();
      return analyzePlaybook();
    }
    case "cycle": {
      const { collectViral } = await import("./collectViral.js");
      const { refreshInsights } = await import("./insights.js");
      const { analyzePlaybook } = await import("./analyze.js");
      const { postAffiliateThread } = await import("./postThread.js");
      await collectViral();
      await refreshInsights();
      await analyzePlaybook();
      return postAffiliateThread({ force });
    }
    default:
      throw new Error(`不明なコマンド: ${command}（${COMMANDS.join("|")}）`);
  }
}

const command = process.argv[2] || "cycle";
const force = process.argv.includes("--force");

await loadEnv();
console.log(`=== 暮らしと防災 PDCA: ${command} ===`);
if (process.env.THREADS_ACCESS_TOKEN && process.env.THREADS_USER_ID) {
  console.log("Threadsトークン: 読み込み済み（keyword_search を試行）");
} else {
  console.log("Threadsトークン: 未設定（.env または環境変数が必要。無いと seed にフォールバック）");
}

run(command, { force })
  .then((result) => {
    if (result && result.skipped) {
      process.exitCode = 0;
    }
  })
  .catch((err) => {
    console.error("エラーが発生しました:", err);
    process.exit(1);
  });
