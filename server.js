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

const cache = new NodeCache({
  stdTTL: 300
});

app.use(cors());

app.use(express.json());

const PORT =
  process.env.PORT || 3000;

const BASE_URL =
  "https://newsbot-ecau.onrender.com";

// TOPICS เริ่มต้น
let topics = [

  "AI",

  "crypto",

  "nvidia",

  "stock market",

  "Korea illegal workers"

];

// สร้าง RSS feeds
function buildFeeds() {

  return topics.map(

    t =>

      `https://news.google.com/rss/search?q=${encodeURIComponent(t)}`

  );
}

// แปลภาษา
async function translateText(text) {

  try {

    if (!text) {

      return "ไม่มีข้อมูล";

    }

    const url =

      "https://api.mymemory.translated.net/get?q=" +

      encodeURIComponent(text) +

      "&langpair=en|th";

    const res =
      await axios.get(url);

    const translated =

      res.data.responseData
        .translatedText;

    console.log(
      "Translated:",
      translated
    );

    return translated;

  } catch (e) {

    console.log(
      "Translate Error:",
      e.message
    );

    return text;
  }
}

// sentiment
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

  const lower =
    title.toLowerCase();

  let score = 0;

  bullishWords.forEach(w => {

    if (lower.includes(w)) {

      score += 20;

    }

  });

  bearishWords.forEach(w => {

    if (lower.includes(w)) {

      score -= 20;

    }

  });

  let sentiment =
    "NEUTRAL";

  if (score > 0) {

    sentiment = "BULLISH";

  }

  if (score < 0) {

    sentiment = "BEARISH";

  }

  return {

    sentiment,

    score

  };
}

// ดึงข่าว
async function fetchFeeds() {

  const cached =
    cache.get("news");

  if (cached) {

    console.log(
      "Using cache"
    );

    return cached;
  }

  const feeds =
    buildFeeds();

  let all = [];

  for (const url of feeds) {

    try {

      console.log(
        "Fetching:",
        url
      );

      const feed =

        await parser.parseURL(
          url
        );

      const items =

        await Promise.all(

          feed.items
            .slice(0, 5)

            .map(

              async (x, i) => ({

                id:
                  `${Date.now()}-${i}`,

                title:

                  await translateText(

                    x.title ||

                    "ไม่มีหัวข้อข่าว"

                  ),

                source:

                  feed.title ||

                  "Unknown Source",

                summary:

                  await translateText(

                    x.contentSnippet ||

                    x.content ||

                    x.title ||

                    "ไม่มีรายละเอียด"

                  ),

                url:
                  x.link,

                time:

                  x.pubDate ||

                  new Date()
                    .toISOString()

              })

            )

        );

      all.push(...items);

    } catch (e) {

      console.log(
        "Feed Error:",
        url
      );

      console.log(
        e.message
      );

    }
  }

  // กันข่าวซ้ำ
  const unique = [];

  const seen =
    new Set();

  for (const item of all) {

    if (
      !seen.has(item.title)
    ) {

      seen.add(item.title);

      unique.push(item);

    }
  }

  all =
    unique.slice(0, 20);

  cache.set(
    "news",
    all
  );

  console.log(
    "Total news:",
    all.length
  );

  return all;
}

// ส่ง Telegram
async function sendTelegram(news) {

  const analysis =

    analyzeSentiment(
      news.title
    );

  const emoji =

    analysis.sentiment ===
    "BULLISH"

      ? "🟢"

      : analysis.sentiment ===
        "BEARISH"

      ? "🔴"

      : "🟡";

  const message = `

📰 <b>${news.title}</b>

📡 ${news.source}

⏰ ${news.time}

${emoji}
<b>
${analysis.sentiment}
</b>

📊 Score:
${analysis.score}

📝
${news.summary}

🔗
${news.url}

`;

  try {

    await axios.post(

      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

      {

        chat_id:

          process.env
            .TELEGRAM_CHAT_ID,

        text:
          message,

        parse_mode:
          "HTML",

        disable_web_page_preview:
          false

      }

    );

    console.log(
      "Sent:",
      news.title
    );

  } catch (e) {

    console.log(
      "Telegram Error:",
      e.message
    );

  }
}

// Telegram Commands
let lastUpdateId = 0;

async function checkTelegramCommands() {

  try {

    const res =

      await axios.get(

        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}`

      );

    const updates =
      res.data.result;

    for (const update of updates) {

      lastUpdateId =
        update.update_id;

      const text =

        update.message?.text;

      if (

        text &&

        text.startsWith("/topic ")

      ) {

        const raw =

          text.replace(
            "/topic ",
            ""
          );

        topics =

          raw
            .split(",")

            .map(
              x => x.trim()
            );

        cache.del("news");

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:

              process.env
                .TELEGRAM_CHAT_ID,

            text:

`✅ เปลี่ยน Topics แล้ว

${topics.join("\n")}

⏳ รอรอบ fetch ถัดไป`

          }

        );

        console.log(
          "Topics updated:",
          topics
        );
      }

      // ดู topics ปัจจุบัน
      if (text === "/topics") {

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:

              process.env
                .TELEGRAM_CHAT_ID,

            text:

`📡 Topics ปัจจุบัน

${topics.join("\n")}`

          }

        );

      }
    }

  } catch (e) {

    console.log(
      "Telegram Command Error:",
      e.message
    );

  }
}

// หน้าเว็บ
app.get("/", (req, res) => {

  res.send(
    "AI NEWS BOT RUNNING"
  );

});

// API ข่าว
app.get(
  "/api/news",

  async (req, res) => {

    try {

      const news =
        await fetchFeeds();

      const ranked =

        news

          .map(n => ({

            ...n,

            analysis:

              analyzeSentiment(
                n.title
              )

          }))

          .sort(

            (a, b) =>

              Math.abs(
                b.analysis.score
              )

              -

              Math.abs(
                a.analysis.score
              )

          );

      res.json(ranked);

    } catch (e) {

      res.status(500)
        .json({

          error:
            e.message

        });

    }
  }
);

// ส่ง manual
app.post(
  "/api/send",

  async (req, res) => {

    try {

      await sendTelegram(
        req.body
      );

      res.json({
        success: true
      });

    } catch (e) {

      res.status(500)
        .json({
          error:
            e.message
        });

    }
  }
);

// ข่าวทุก 5 นาที
cron.schedule(

  "*/5 * * * *",

  async () => {

    console.log(
      "AUTO FETCH RUNNING"
    );

    try {

      const news =
        await fetchFeeds();

      for (
        const item of
        news.slice(0, 3)
      ) {

        await sendTelegram(
          item
        );

      }

      console.log(
        "Sent to Telegram"
      );

    } catch (e) {

      console.log(
        e.message
      );

    }
  }
);

// เช็ก Telegram Commands ทุก 1 นาที
cron.schedule(

  "*/1 * * * *",

  async () => {

    await checkTelegramCommands();

  }
);

// กัน Render หลับ
setInterval(

  async () => {

    try {

      await axios.get(
        BASE_URL
      );

      console.log(
        "Self ping success"
      );

    } catch (e) {

      console.log(
        "Ping Error:",
        e.message
      );

    }

  },

  300000
);

// เปิด server
app.listen(

  PORT,

  async () => {

    console.log(
      `Server running on ${PORT}`
    );

    console.log(
      "FIRST FETCH START"
    );

    try {

      const news =
        await fetchFeeds();

      for (
        const item of
        news.slice(0, 3)
      ) {

        await sendTelegram(
          item
        );

      }

      console.log(
        "FIRST FETCH DONE"
      );

    } catch (e) {

      console.log(
        e.message
      );

    }
  }
);
