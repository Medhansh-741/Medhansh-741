import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const site = "https://medhanshk.me";
const username = "Medhansh-741";
const assets = new URL("../assets/", import.meta.url);
const width = 360;
const escape = (text) => String(text).replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function panel(title, height, content, theme) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">
<title>${escape(title)}</title>
<style>
svg { color: ${theme.foreground}; font-family: system-ui, sans-serif; ${theme.levels.map((color, index) => `--level-${index}: ${color};`).join(" ")} }
text { fill: currentColor; }
.muted { fill: ${theme.muted}; }
</style>
${content}
</svg>\n`;
}

function line(text, x, y, size = 13, weight = 400, muted = false) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}"${muted ? ' class="muted"' : ""}>${escape(text)}</text>`;
}

async function request(url, headers) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.json();
}

function countPullRequests(query) {
  const url = new URL("https://api.github.com/search/issues");
  url.search = new URLSearchParams({ q: query, per_page: "1" });
  const headers = process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {};
  return request(url, headers).then(({ total_count, incomplete_results }) => {
    if (!Number.isInteger(total_count) || incomplete_results) throw new Error("GitHub search returned incomplete stats");
    return total_count;
  });
}

async function renderStats() {
  const [payload, opened, reviewed] = await Promise.all([
    request(`${site}/api/github?username=${username}`),
    countPullRequests(`is:pr is:public author:${username}`),
    countPullRequests(`is:pr is:public reviewed-by:${username}`),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 364);
  const days = new Map(payload.contributions.map((day) => [day.date, day]));
  const monthFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" });
  const offset = start.getUTCDay();
  const labels = [];
  let lastLabelX = -Infinity;
  let total = 0;
  const cells = Array.from({ length: 365 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    const key = day.toISOString().slice(0, 10);
    const contribution = days.get(key);
    if (!contribution) throw new Error(`Missing contribution data for ${key}`);
    total += contribution.count;
    const slot = offset + index;
    const x = 20 + Math.floor(slot / 7) * 6;
    const y = 136 + (slot % 7) * 6;
    if ((index === 0 || day.getUTCDate() === 1) && x - lastLabelX >= 22 && x <= 322) {
      labels.push(line(monthFormat.format(day), x, 128, 10, 400, true));
      lastLabelX = x;
    }
    return `<rect x="${x}" y="${y}" width="5" height="5" rx=".6" fill="var(--level-${contribution.level})"/>`;
  });
  const format = new Intl.NumberFormat("en-US");
  const metrics = [
    { value: total, label: "Contributions", period: "Last 365 days" },
    { value: opened, label: "Public PRs opened", period: "All time" },
    { value: reviewed, label: "Public PRs reviewed", period: "All time" },
  ].filter(({ label, value }) => label !== "Public PRs reviewed" || value > 0);
  const figures = metrics.map(({ value, label, period }, index) => {
    const x = 20 + index * (metrics.length === 2 ? 160 : 110);
    return [
      line(format.format(value), x, 64, index === 0 ? 30 : 25, 700),
      line(label, x, 85, 11, 600),
      line(period, x, 101, 10, 400, true),
    ].join("");
  });
  const title = ["GitHub activity", ...metrics.map(({ value, label, period }) =>
    `${format.format(value)} ${label.toLowerCase()} (${period.toLowerCase()})`)].join(". ");
  const content = [line("GitHub activity", 20, 26, 16, 700), ...figures, ...labels, ...cells].join("\n");
  const themes = [
    { file: "stats.svg", foreground: "#171717", muted: "#57606a", levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"] },
    { file: "stats-dark.svg", foreground: "#f0f6fc", muted: "#9198a1", levels: ["#21262d", "#0e4429", "#006d32", "#26a641", "#39d353"] },
  ];
  await Promise.all(themes.map((theme) => writeFile(new URL(theme.file, assets), panel(title, 191, content, theme))));
}

await mkdir(assets, { recursive: true });
await renderStats();
console.log(`Rendered profile statistics in ${fileURLToPath(assets)}`);
