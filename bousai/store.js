import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "data");

export function dataPath(name) {
  return path.join(DATA_DIR, name);
}

export async function readJson(name, fallback) {
  try {
    const raw = await readFile(dataPath(name), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT" && fallback !== undefined) {
      return fallback;
    }
    throw err;
  }
}

export async function writeJson(name, value) {
  await mkdir(DATA_DIR, { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(dataPath(name), text, "utf8");
}

export async function loadProducts() {
  const data = await readJson("products.json", { products: [] });
  return Array.isArray(data.products) ? data.products : [];
}

export async function loadPlaybook() {
  return readJson("playbook.json", {
    updatedAt: "",
    theme: "暮らしと防災",
    viral: {},
    own: {},
  });
}

export async function loadOwnPosts() {
  const data = await readJson("own_posts.json", { posts: [] });
  return Array.isArray(data.posts) ? data.posts : [];
}

export async function saveOwnPosts(posts) {
  await writeJson("own_posts.json", { posts });
}

export async function loadWinners() {
  const data = await readJson("winners.json", { winners: [] });
  return Array.isArray(data.winners) ? data.winners : [];
}

export async function saveWinners(winners) {
  await writeJson("winners.json", { winners });
}
