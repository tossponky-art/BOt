
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
  // AI
  "https://www.reddit.com/r/artificial/hot.rss",

  // หุ้น
  "https://www.reddit.com/r/stocks/hot.rss",

  // Crypto
  "https://www.reddit.com/r/CryptoCurrency/hot.rss",

  // NVIDIA / TSMC
  "https://news.google.com/rss/search?q=nvidia",
  "https://news.google.com/rss/search?q=tsmc",

  // ข่าวเกาหลี
  "https://news.google.com/rss/search?q=Korea+illegal+workers",
  "https://news.google.com/rss/search?q=Yangsan+immigration",
  "https://news.google.com/rss/search?q=Yangsan+foreign+worker+raid",
  "https://news.google.com/rss/search?q=Seochang+Korea",

  // Tech/Crypto
  "https://feeds.feedburner.com/CoinDesk"
];

async function translateText(text) {
  try {
    const res = await fetch(
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=th&dt=t&q=" +
      encodeURIComponent(text)
    );

    const data = await res.json();

    return data[0].map(x => x[0]).join("");
  } catch {
    return text;
  }
}

async function fetchFeeds() {
  const cached = cache.get("news");

  if (cached) return cached;

  let all = [];

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);

      const items = await Promise.all(
        feed.items.slice(0, 5).map(async (x, i) => ({
          id: `${Date.now()}-${i}`,

          title: await translateText(
            x.title || "ไม่มีหัวข้อข่าว"
          ),

          source: feed.title,

          summary: await translateText(
            x.contentSnippet || "ไม่มีรายละเอียด"
          ),

          url: x.link,

          time: x.pubDate || new Date().toISOString()
        }))
      );

      all.push(...items);

    } catch (e) {
      console.log("Feed error:", url);
    }
  }

  // กันข่าวซ้ำ
  const unique = [];
  const seen = new Set();

  for (const item of all) {
    if (!seen.has(item.title)) {
      seen.add(item.title);
      unique.push(item);
    }
  }

  // จำกัดจำนวน
  all = unique.slice(0, 20);

  cache.set("news", all);

  return all;
}

function analyzeSentiment(title) {

  const bullishWords = [
    "surge",
    "rise",
    "bull",
    "growth",
    "profit",
    "record",
    "พุ่ง",
    "กำไร",
    "โต"
  ];

  const bearishWords = [
    "crash",
    "hack",
    "drop",
    "lawsuit",
    "ban",
    "fear",
    "ร่วง",
    "ฟ้อง",
    "จับ",
    "กวาดล้าง"
  ];

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

  const emoji =
    analysis.sentiment === "BULLISH"
      ? "🟢"
      : analysis.sentiment === "BEARISH"
      ? "🔴"
      : "🟡";

  const message = `
📰 <b>${news.title}</b>

📡 ${news.source}

⏰ ${news.time}

${emoji} <b>${analysis.sentiment}</b>

📊 Score: ${analysis.score}

📝 ${news.summary}

🔗 ${news.url}
`;

  try {

    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: false
      }
    );

    console.log("Sent:", news.title);

  } catch (e) {

    console.log("Telegram Error:", e.message);

  }
}

app.get("/", (req, res) => {

  res.send("AI NEWS BOT RUNNING");

});

app.get("/api/news", async (req, res) => {

  try {

    const news = await fetchFeeds();

    const ranked = news
      .map(n => ({
        ...n,
        analysis: analyzeSentiment(n.title)
      }))
      .sort(
        (a, b) =>
          Math.abs(b.analysis.score) -
          Math.abs(a.analysis.score)
      );

    res.json(ranked);

  } catch (e) {

    res.status(500).json({
      error: e.message
    });

  }
});

app.post("/api/send", async (req, res) => {

  try {

    await sendTelegram(req.body);

    res.json({
      success: true
    });

  } catch (e) {

    res.status(500).json({
      error: e.message
    });

  }
});

// ทุก 10 นาที
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
