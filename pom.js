const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const RSS = require("rss");

const feedURL = "https://feeds.science.org/rss/science.xml";
const baseURL = "https://www.science.org";
const flareSolverrURL = process.env.FLARESOLVERR_URL || "http://localhost:8191";

fs.mkdirSync("./feeds", { recursive: true });

// ===== DATE PARSING =====
function parseItemDate(raw) {
  if (!raw || !raw.trim()) return new Date();
  const d = new Date(raw.trim());
  if (!isNaN(d.getTime())) return d;
  console.warn(`⚠️  Could not parse date: "${raw.trim()}" — using now()`);
  return new Date();
}

// ===== FLARESOLVERR =====
async function fetchWithFlareSolverr(url) {
  console.log(`Fetching ${url} via FlareSolverr...`);
  const response = await axios.post(
    `${flareSolverrURL}/v1`,
    { cmd: "request.get", url, maxTimeout: 60000 },
    { headers: { "Content-Type": "application/json" }, timeout: 65000 }
  );
  if (response.data?.solution) {
    console.log("✅ FlareSolverr successfully bypassed protection");
    return response.data.solution.response;
  }
  throw new Error("FlareSolverr did not return a solution");
}

// ===== MAIN =====
async function generateRSS() {
  try {
    const xmlContent = await fetchWithFlareSolverr(feedURL);

    // xmlMode: true — critical for correct RSS/XML parsing
    const $ = cheerio.load(xmlContent, { xmlMode: true });
    const items = [];

    $("item").each((_, el) => {
      const $item = $(el);

      const title = $item.find("title").first().text().trim();
      // <link> in RSS 2.0 holds URL as text; <guid> as a reliable fallback
      const link =
        $item.find("link").first().text().trim() ||
        $item.find("guid").first().text().trim();
      if (!title || !link) return;

      const description =
        $item.find("description").first().text().trim() || "";

      // dc:creator is standard for Science Mag; author is the fallback
      const author =
        $item.find("dc\\:creator").first().text().trim() ||
        $item.find("creator").first().text().trim() ||
        $item.find("author").first().text().trim();

      const rawDate = $item.find("pubDate").first().text().trim();

      const categories = $item
        .find("category")
        .map((_, c) => $(c).text().trim())
        .get()
        .filter(Boolean);

      items.push({
        title,
        link,
        description,
        author,
        date: parseItemDate(rawDate),
        categories,
      });
    });

    console.log(`Found ${items.length} articles`);

    // Pull channel-level metadata from the source feed
    const channelTitle =
      $("channel > title").first().text().trim() || "Science Magazine";
    const channelDesc =
      $("channel > description").first().text().trim() ||
      "Latest research and news from Science Magazine";

    if (items.length === 0) {
      console.warn("⚠️  No items parsed — creating placeholder");
      items.push({
        title: "No articles found",
        link: baseURL,
        description: "RSS feed returned no parseable items.",
        author: "",
        date: new Date(),
        categories: [],
      });
    }

    const feed = new RSS({
      title: channelTitle,
      description: channelDesc,
      feed_url: feedURL,
      site_url: baseURL,
      language: "en",
      pubDate: new Date().toUTCString(),
    });

    items.forEach((item) => {
      const entry = {
        title: item.title,
        url: item.link,
        description: item.description,
        date: item.date,
      };
      if (item.author) entry.author = item.author;
      if (item.categories.length) entry.categories = item.categories;
      feed.item(entry);
    });

    fs.writeFileSync("./feeds/feed1.xml", feed.xml({ indent: true }));
    console.log(`✅ RSS generated with ${items.length} items.`);
  } catch (err) {
    console.error("❌ Error generating RSS:", err.message);

    const feed = new RSS({
      title: "Science Magazine (error fallback)",
      description: "Feed generation failed — placeholder only",
      feed_url: feedURL,
      site_url: baseURL,
      language: "en",
      pubDate: new Date().toUTCString(),
    });
    feed.item({
      title: "Feed generation failed",
      url: baseURL,
      description: "An error occurred during feed fetch/parse.",
      date: new Date(),
    });
    fs.writeFileSync("./feeds/feed1.xml", feed.xml({ indent: true }));
  }
}

generateRSS();
