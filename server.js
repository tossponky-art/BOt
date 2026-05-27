
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import cron from "node-cron";
import NodeCache from "node-cache";
import Parser from "rss-parser";

dotenv.config();

const app = express();
const parser = new Parser();
const cache = new NodeCache({ stdTTL: 600 });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const feeds = [
  "https://www.reddit.com/r/artificial/hot.rss",
  "https://www.reddit.com/r/stocks/hot.rss",
  "https://news.google.com/rss/search?q=nvidia",
  "https://news.google.com/rss/search?q=tsmc"
];

async function fetchFeeds() {
  const cached = cache.get("news");
  if (cached) return cached;

  let all = [];

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);

      const items = feed.items.slice(0, 5).map((x, i) => ({
        id: `${Date.now()}-${i}`,
        title: x.title,
        source: feed.title,
        summary: x.contentSnippet || "No summary",
        url: x.link,
        time: x.pubDate || new Date().toISOString()
      }));

      all.push(...items);
    } catch (e) {
      console.log("Feed error:", url);
    }
  }

  all = all.slice(0, 20);

  cache.set("news", all);

  return all;
}

function analyzeSentiment(title) {
  const bullishWords = ["surge", "rise", "bull", "growth", "profit", "record"];
  const bearishWords = ["crash", "hack", "drop", "lawsuit", "ban", "fear"];

  const lower = title.toLowerCase();

  let score = 0;

  bullishWords.forEach(w => {
    if (lower.includes(w)) score += 20;
  });

  bearishWords.forEach(w => {
    if (lower.includes(w)) score -= 20;
  });

  let sentiment = "NEUTRAL";

  if (score > 0) sentiment = "BULLISH";
  if (score < 0) sentiment = "BEARISH";

  return {
    sentiment,
    score
  };
}

async function sendTelegram(news) {
  const analysis = analyzeSentiment(news.title);

  const message = `
📰 <b>${news.title}</b>

📡 ${news.source}
⏰ ${news.time}

${analysis.sentiment === "BULLISH" ? "🟢" : analysis.sentiment === "BEARISH" ? "🔴" : "🟡"}
<b>${analysis.sentiment}</b> (${analysis.score})

📝 ${news.summary}

🔗 ${news.url}
`;

  await axios.post(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: false
    }
  );
}

app.get("/api/news", async (req, res) => {
  try {
    const news = await fetchFeeds();

    const ranked = news.map(n => ({
      ...n,
      analysis: analyzeSentiment(n.title)
    }))
    .sort((a,b) => Math.abs(b.analysis.score) - Math.abs(a.analysis.score));

    res.json(ranked);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/send", async (req, res) => {
  try {
    await sendTelegram(req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

cron.schedule("*/10 * * * *", async () => {
  console.log("AUTO FETCH RUNNING");

  try {
    const news = await fetchFeeds();

    for (const item of news.slice(0, 3)) {
      await sendTelegram(item);
    }

    console.log("Sent to Telegram");
  } catch (e) {
    console.log(e.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
