const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const RSS = require("rss");

const baseURL = "https://www.thedailystar.net";
const targetURL = "https://www.thedailystar.net/opinion";
const flareSolverrURL = process.env.FLARESOLVERR_URL || "http://localhost:8191";

// Ensure feeds folder exists
fs.mkdirSync("./feeds", { recursive: true });

async function fetchWithFlareSolverr(url) {
  try {
    console.log(`Fetching ${url} via FlareSolverr...`);
    
    const response = await axios.post(
      `${flareSolverrURL}/v1`,
      {
        cmd: "request.get",
        url: url,
        maxTimeout: 60000
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 65000
      }
    );

    if (response.data && response.data.solution) {
      console.log("✅ FlareSolverr successfully bypassed protection");
      return response.data.solution.response;
    } else {
      throw new Error("FlareSolverr did not return a solution");
    }
  } catch (error) {
    console.error("❌ FlareSolverr error:", error.message);
    throw error;
  }
}

async function generateRSS() {
  try {
    // Fetch page content using FlareSolverr
    const htmlContent = await fetchWithFlareSolverr(targetURL);
    
    const $ = cheerio.load(htmlContent);
    const items = [];

    // Scrape all articles
    $("div.card-content.quote-two").each((_, el) => {
      const aTag = $(el).find("h3.title a");
      const title = aTag.text().trim();
      const href = aTag.attr("href");
      const intro = $(el).find("p.intro").text().trim();

      if (title && href) {
        const link = href.startsWith("http") ? href : baseURL + href;
        items.push({ title, link, description: intro });
      }
    });

    console.log(`Found ${items.length} articles`);

    // Fallback: dummy item if no articles found
    if (items.length === 0) {
      console.log("⚠️ No articles found, creating dummy item");
      items.push({
        title: "No articles found yet",
        link: baseURL,
        description: "RSS feed could not scrape any articles."
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
        description: item.description,
        date: new Date()
      });
    });

    // Write feed.xml
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
      description: "An error occurred during scraping.",
      date: new Date()
    });
    fs.writeFileSync("./feeds/feed.xml", feed.xml({ indent: true }));
  }
}

generateRSS();
