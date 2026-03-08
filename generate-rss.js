const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const RSS = require("rss");

const baseURL = "https://www.thedailystar.net";
const targetURL = "https://www.thedailystar.net/opinion";
const flareSolverrURL = process.env.FLARESOLVERR_URL || "http://localhost:8191";

fs.mkdirSync("./feeds", { recursive: true });

// ===== DATE PARSING =====
function parseItemDate(raw) {
  if (!raw || !raw.trim()) return new Date();

  const trimmed = raw.trim();

  const relMatch = trimmed.match(/^(\d+)\s+(minute|hour|day)s?\s+ago$/i);
  if (relMatch) {
    const n    = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const ms   = unit === "minute" ? n * 60_000
               : unit === "hour"   ? n * 3_600_000
               :                     n * 86_400_000;
    return new Date(Date.now() - ms);
  }

  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d;

  console.warn(`⚠️  Could not parse date: "${trimmed}" — using now()`);
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
    const htmlContent = await fetchWithFlareSolverr(targetURL);
    const $ = cheerio.load(htmlContent);
    const items = [];

    $("div.card").each((_, el) => {
      const $card = $(el);

      const titleElement = $card.find("h5.card-title a, h1.card-title a").first();
      const title = titleElement.text().trim();
      const href  = titleElement.attr("href");
      if (!title || !href) return;

      const link        = href.startsWith("http") ? href : baseURL + href;
      const intro       = $card.find("div.card-intro").text().trim()
                       || $card.find("p.intro").text().trim();
      const author      = $card.find("div.author a").text().trim();
      const rawDate     = $card.find("div.card-info span").first().text().trim();

      items.push({
        title,
        link,
        description: intro || (author ? `By ${author}` : ""),
        author,
        date: parseItemDate(rawDate),   // always a valid Date object
      });
    });

    console.log(`Found ${items.length} articles`);

    if (items.length === 0) {
      console.log("⚠️  No articles found, creating placeholder item");
      items.push({
        title:       "No articles found yet",
        link:        baseURL,
        description: "RSS feed could not scrape any articles.",
        author:      "",
        date:        new Date(),
      });
    }

    const feed = new RSS({
      title:       "The Daily Star – Opinion",
      description: "Latest opinion pieces from The Daily Star",
      feed_url:    `${baseURL}/opinion`,
      site_url:    baseURL,
      language:    "en",
      pubDate:     new Date().toUTCString(),
    });

    items.slice(0, 20).forEach(item => {
      feed.item({
        title:       item.title,
        url:         item.link,
        description: item.description,
        author:      item.author || undefined,
        date:        item.date,         // Date object → never "Invalid Date"
      });
    });

    fs.writeFileSync("./feeds/feed.xml", feed.xml({ indent: true }));
    console.log(`✅ RSS generated with ${items.length} items.`);

  } catch (err) {
    console.error("❌ Error generating RSS:", err.message);

    const feed = new RSS({
      title:       "The Daily Star – Opinion (error fallback)",
      description: "RSS feed could not scrape, showing placeholder",
      feed_url:    `${baseURL}/opinion`,
      site_url:    baseURL,
      language:    "en",
      pubDate:     new Date().toUTCString(),
    });
    feed.item({
      title:       "Feed generation failed",
      url:         baseURL,
      description: "An error occurred during scraping.",
      date:        new Date(),
    });
    fs.writeFileSync("./feeds/feed.xml", feed.xml({ indent: true }));
  }
}

generateRSS();
