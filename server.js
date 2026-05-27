import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
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

// ข่าวล่าสุด
let latestNews = null;

// TOPICS
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
    "tsmc"

};

// BUILD FEEDS
function buildFeeds() {

  return topics.map(

    t =>

      `https://news.google.com/rss/search?q=${encodeURIComponent(t)}`

  );
}

// GOOGLE TRANSLATE
async function translateText(
  text,
  target = "th"
) {

  try {

    const url =

      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;

    const res =
      await axios.get(url);

    return res.data[0]
      .map(x => x[0])
      .join("");

  } catch (e) {

    console.log(
      "Translate Error:",
      e.message
    );

    return text;
  }
}

// SENTIMENT
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

// FETCH NEWS
async function fetchFeeds() {

  const cached =
    cache.get("news");

  if (cached)
    return cached;

  const feeds =
    buildFeeds();

  let all = [];

  for (const url of feeds) {

    try {

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
                    x.title,
                    "th"
                  ),

                originalTitle:
                  x.title,

                source:
                  feed.title,

                summary:

                  await translateText(

                    x.contentSnippet ||

                    x.title ||

                    "ไม่มีรายละเอียด",

                    "th"

                  ),

                originalSummary:

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

  return all;
}

// SEND TELEGRAM
async function sendTelegram(news) {

  latestNews = news;

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

  } catch (e) {

    console.log(
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

      const chatId =
        update.message.chat.id;

      // PING
      if (
        text === "/ping"
      ) {

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:
              "🏓 BOT ONLINE"

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
              chatId,

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
                    text: "🟢 NVIDIA",
                    callback_data:
                      "nvidia"
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
                ]

              ]

            }

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
              chatId,

            text:

`📡 Topics ปัจจุบัน

${topics.join("\n")}`

          }

        );
      }

      // TOPIC
      if (
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
            )

            .map(t => {

              return (
                topicMap[t] || t
              );

            });

        cache.del("news");

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:

`✅ เปลี่ยน Topics แล้ว

${topics.join("\n")}`

          }

        );
      }

      // แปลไทย
      if (

        text.startsWith("/th ") ||

        text.startsWith("แปลไทย ")

      ) {

        const raw =

          text
            .replace("/th ", "")
            .replace("แปลไทย ", "");

        const translated =

          await translateText(
            raw,
            "th"
          );

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:
              translated

          }

        );
      }

      // แปลอังกฤษ
      if (

        text.startsWith("/en ") ||

        text.startsWith("แปลอังกฤษ ")

      ) {

        const raw =

          text
            .replace("/en ", "")
            .replace("แปลอังกฤษ ", "");

        const translated =

          await translateText(
            raw,
            "en"
          );

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:
              translated

          }

        );
      }

      // แปลข่าวล่าสุด
      if (
        text === "แปลไทย"
      ) {

        if (!latestNews)
          continue;

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:

`📰 ${latestNews.title}

📝 ${latestNews.summary}

🔗 ${latestNews.url}`

          }

        );
      }
    }

    // BUTTON CALLBACKS
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

📡 ${data}`

          }

        );
      }
    }

  } catch (e) {

    console.log(
      e.message
    );

  }
}

// HOME
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

// AUTO NEWS
setInterval(

  async () => {

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

    } catch {}

  },

  300000
);

// REALTIME COMMANDS
setInterval(

  async () => {

    await checkTelegramCommands();

  },

  5000
);

// START
app.listen(

  PORT,

  async () => {

    console.log(
      `Server running on ${PORT}`
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

    } catch {}

  }
);
