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

// TOPICS ปัจจุบัน
let topics = [
  "AI",
  "crypto",
  "nvidia"
];

// TOPIC MAP
const topicMap = {

  "หุ้น":
    "stock market",

  "คริปโต":
    "crypto",

  "บิตคอยน์":
    "bitcoin",

  "เอไอ":
    "AI",

  "AI":
    "AI",

  "ข่าวเกาหลี":
    "Korea news",

  "แรงงานเกาหลี":
    "Korea illegal workers",

  "หยางซาน":
    "Yangsan immigration",

  "ซัมซุง":
    "Samsung",

  "เทสลา":
    "Tesla",

  "เอ็นวิเดีย":
    "nvidia",

  "ทีเอสเอ็มซี":
    "tsmc",

  "ตลาดโลก":
    "global market",

  "ข่าวเทค":
    "technology"

};

// สร้าง RSS feeds
function buildFeeds() {

  return topics.map(

    t =>

      `https://news.google.com/rss/search?q=${encodeURIComponent(t)}`

  );
}

// translate
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

      res.data?.responseData
        ?.translatedText;

    if (
      translated &&
      translated !== text
    ) {

      console.log(
        "API Translate:",
        translated
      );

      return translated;
    }

    throw new Error();

  } catch {

    console.log(
      "Translate fallback"
    );

    return text;
  }
}

// sentiment
function analyzeSentiment(title) {

  const bullishWords = [

    "surge",
    "rise",
    "growth",
    "profit",
    "record",

    "พุ่ง",
    "กำไร",
    "โต"

  ];

  const bearishWords = [

    "crash",
    "drop",
    "fear",
    "lawsuit",

    "ร่วง",
    "กวาดล้าง",
    "จับ"

  ];

  const lower =
    title.toLowerCase();

  let score = 0;

  bullishWords.forEach(w => {

    if (lower.includes(w))
      score += 20;

  });

  bearishWords.forEach(w => {

    if (lower.includes(w))
      score -= 20;

  });

  let sentiment =
    "NEUTRAL";

  if (score > 0)
    sentiment = "BULLISH";

  if (score < 0)
    sentiment = "BEARISH";

  return {
    sentiment,
    score
  };
}

// fetch news
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
                    x.title
                  ),

                source:
                  feed.title,

                summary:

                  x.contentSnippet ||

                  x.title ||

                  "ไม่มีรายละเอียด",

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

// send telegram
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
<b>${analysis.sentiment}</b>

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
          "HTML"

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

// TELEGRAM COMMANDS
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

      if (!text)
        continue;

      // PING
      if (
        text === "/ping"
      ) {

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              update.message.chat.id,

            text:
              "🏓 BOT ONLINE"

          }

        );
      }

      // TOPICS
      if (
        text === "/topics"
      ) {

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              update.message.chat.id,

            text:

`📡 Topics ปัจจุบัน

${topics.join("\n")}`

          }

        );
      }

      // MENU
      if (
        text === "/menu"
      ) {

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              update.message.chat.id,

            text:
              "📡 เลือกหัวข้อข่าว",

            reply_markup: {

              inline_keyboard: [

                [
                  {
                    text: "🤖 AI",
                    callback_data: "AI"
                  },

                  {
                    text: "📈 หุ้น",
                    callback_data:
                      "stock market"
                  }
                ],

                [
                  {
                    text: "₿ Crypto",
                    callback_data:
                      "crypto"
                  },

                  {
                    text: "🪙 Bitcoin",
                    callback_data:
                      "bitcoin"
                  }
                ],

                [
                  {
                    text: "🟢 NVIDIA",
                    callback_data:
                      "nvidia"
                  },

                  {
                    text: "⚙️ TSMC",
                    callback_data:
                      "tsmc"
                  }
                ],

                [
                  {
                    text: "🇰🇷 เกาหลี",
                    callback_data:
                      "Korea news"
                  },

                  {
                    text:
                      "👮 แรงงาน",
                    callback_data:
                      "Korea illegal workers"
                  }
                ],

                [
                  {
                    text: "🏭 Samsung",
                    callback_data:
                      "Samsung"
                  },

                  {
                    text: "🚘 Tesla",
                    callback_data:
                      "Tesla"
                  }
                ]

              ]

            }

          }

        );
      }
    }

    // CALLBACK BUTTONS
    for (const update of updates) {

      if (
        update.callback_query
      ) {

        const data =
          update.callback_query
            .data;

        const chatId =

          update.callback_query
            .message.chat.id;

        topics = [data];

        cache.del("news");

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:

`✅ เปลี่ยน Topic แล้ว

📡 ${data}

⏳ รอ fetch รอบถัดไป`

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

// homepage
app.get("/", (req, res) => {

  res.send(
    "AI NEWS BOT RUNNING"
  );

});

// API
app.get(
  "/api/news",

  async (req, res) => {

    try {

      const news =
        await fetchFeeds();

      res.json(news);

    } catch (e) {

      res.status(500)
        .json({
          error:
            e.message
        });

    }
  }
);

// AUTO FETCH
cron.schedule(

  "*/5 * * * *",

  async () => {

    console.log(
      "AUTO FETCH RUNNING"
    );

    try {

      cache.del("news");

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

// CHECK COMMANDS
cron.schedule(

  "*/1 * * * *",

  async () => {

    await checkTelegramCommands();

  }
);

// SELF PING
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

// START SERVER
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
