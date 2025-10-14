const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const RSS = require("rss");

const baseURL = "https://www.thedailystar.net";
const targetURL = "https://www.thedailystar.net/opinion";

// Ensure feeds folder exists
fs.mkdirSync("./feeds", { recursive: true });

async function generateRSS() {
  try {
    const { data } = await axios.get(targetURL, {
      headers: { "User-Agent": "Mozilla/5.0 (Feed Generator Bot)" },
      timeout: 20000
    });

    const $ = cheerio.load(data);
    const items = [];

    $("a.card-title, a.node-title, .card-title a").each((_, el) => {
      const title = $(el).text().trim();
      const href = $(el).attr("href");
      if (title && href && !href.includes("#")) {
        const link = href.startsWith("http") ? href : baseURL + href;
        items.push({ title, link });
      }
    });

    console.log(`Found ${items.length} articles`);

    // Fallback: if no articles found, add a dummy item
    if (items.length === 0) {
      console.log("⚠️ No articles found, creating dummy item");
      items.push({
        title: "No articles found yet",
        link: baseURL
      });
    }

    // Create RSS feed
    const feed = new RSS({
      title: "The Daily Star – Opinion",
      description: "Latest opinion pieces from The Daily Star",
      feed_url: `${baseURL}/opinion`,
      site_url: baseURL,
      language: "en",
      pubDate: new Date().toUTCString()
    });

    items.slice(0, 20).forEach(item => {
      feed.item({
        title: item.title,
        url: item.link,
        date: new Date()
      });
    });

    const xml = feed.xml({ indent: true });
    fs.writeFileSync("./feeds/feed.xml", xml);
    console.log(`✅ RSS generated with ${items.length} items.`);
  } catch (err) {
    console.error("❌ Error generating RSS:", err.message);
    // Create dummy feed on error
    const feed = new RSS({
      title: "The Daily Star – Opinion (dummy feed)",
      description: "RSS feed could not scrape, showing placeholder",
      feed_url: `${baseURL}/opinion`,
      site_url: baseURL,
      language: "en",
      pubDate: new Date().toUTCString()
    });
    feed.item({
      title: "Feed generation failed",
      url: baseURL,
      date: new Date()
    });
    const xml = feed.xml({ indent: true });
    fs.writeFileSync("./feeds/feed.xml", xml);
  }
}

generateRSS();
