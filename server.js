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

let latestNews = null;

// TOPICS
let topics = [
  "AI",
  "NVIDIA",
  "TSMC",
  "Tesla",
  "Nasdaq",
  "Bitcoin",
  "Korea illegal workers"
];

// FEEDS
const feeds = [

  // AI ไทย
  "https://www.beartai.com/feed",

  // Crypto
  "https://siamblockchain.com/feed",

  // หุ้นโลก
  "https://news.google.com/rss/search?q=Nasdaq&hl=th&gl=TH&ceid=TH:th",

  "https://news.google.com/rss/search?q=NVIDIA&hl=th&gl=TH&ceid=TH:th",

  "https://news.google.com/rss/search?q=TSMC&hl=th&gl=TH&ceid=TH:th",

  "https://news.google.com/rss/search?q=Tesla&hl=th&gl=TH&ceid=TH:th",

  "https://news.google.com/rss/search?q=Bitcoin&hl=th&gl=TH&ceid=TH:th",

  // เกาหลี
  "https://news.google.com/rss/search?q=แรงงานเกาหลี&hl=th&gl=TH&ceid=TH:th",

  "https://news.google.com/rss/search?q=Yangsan+immigration&hl=en&gl=US&ceid=US:en",

  "https://news.google.com/rss/search?q=Korea+illegal+workers&hl=en&gl=US&ceid=US:en"

];

// CLEAN URL
function cleanGoogleUrl(url) {

  try {

    const match = url.match(
      /url=(.*?)&/
    );

    if (match?.[1]) {

      return decodeURIComponent(
        match[1]
      );

    }

    return url;

  } catch {

    return url;
  }
}

// TRANSLATE
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

  } catch {

    return text;
  }
}

// GEMINI AI
async function askAI(prompt) {

  try {

    const res =
      await axios.post(

`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,

        {

          contents: [

            {

              parts: [

                {

                  text:

`ตอบเป็นภาษาไทยเสมอ

คุณคือ AI Assistant ข่าว หุ้น Crypto AI และเกาหลี

คำถาม:

${prompt}`

                }

              ]

            }

          ]

        }

      );

    return res.data
      .candidates?.[0]
      ?.content?.parts?.[0]
      ?.text ||

      "❌ AI Error";

  } catch (e) {

    return `❌ AI Error

${e.message}`;
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

  let all = [];

  for (const url of feeds) {

    try {

      const feed =
        await parser.parseURL(
          url
        );

      const items =
        feed.items
          .slice(0, 5)

          .map((x, i) => ({

            id:
              `${Date.now()}-${i}`,

            title:
              x.title,

            source:
              feed.title,

            summary:

              x.contentSnippet ||

              "ไม่มีรายละเอียด",

            url:
              cleanGoogleUrl(
                x.link
              ),

            time:

              x.pubDate ||

              new Date()
                .toISOString()

          }));

      all.push(...items);

    } catch {}
  }

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

      reply_markup: {

        inline_keyboard: [

          [

            {

              text:
                "🌐 แปลไทย",

              callback_data:
                "translate_latest"

            }

          ]

        ]

      }

    }

  );
}

// TELEGRAM
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

      // ASK AI
      if (
        text.startsWith("/ask ")
      ) {

        const prompt =

          text.replace(
            "/ask ",
            ""
          );

        const answer =
          await askAI(
            prompt
          );

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:
              answer

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
              "📡 เลือกเมนู",

            reply_markup: {

              inline_keyboard: [

                [

                  {
                    text: "🤖 AI",
                    callback_data: "AI"
                  },

                  {
                    text: "📈 หุ้นโลก",
                    callback_data: "Nasdaq"
                  }

                ],

                [

                  {
                    text: "₿ Crypto",
                    callback_data: "Bitcoin"
                  },

                  {
                    text: "🟢 NVIDIA",
                    callback_data: "NVIDIA"
                  }

                ],

                [

                  {
                    text: "⚙️ TSMC",
                    callback_data: "TSMC"
                  },

                  {
                    text: "🚘 Tesla",
                    callback_data: "Tesla"
                  }

                ],

                [

                  {
                    text: "🇰🇷 เกาหลี",
                    callback_data: "Korea"
                  },

                  {
                    text: "👮 แรงงาน",
                    callback_data:
                      "Korea illegal workers"
                  }

                ]

              ]

            }

          }

        );
      }

      // TRANSLATE
      if (
        text === "แปลไทย"
      ) {

        if (!latestNews)
          continue;

        const translatedTitle =

          await translateText(
            latestNews.title,
            "th"
          );

        const translatedSummary =

          await translateText(
            latestNews.summary,
            "th"
          );

        await axios.post(

          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:

`📰 ${translatedTitle}

📝 ${translatedSummary}

🔗 ${latestNews.url}`

          }

        );
      }
    }

    // BUTTONS
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

        // translate
        if (
          data ===
          "translate_latest"
        ) {

          if (!latestNews)
            continue;

          const translatedTitle =

            await translateText(
              latestNews.title,
              "th"
            );

          const translatedSummary =

            await translateText(
              latestNews.summary,
              "th"
            );

          await axios.post(

            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

            {

              chat_id:
                chatId,

              text:

`📰 ${translatedTitle}

📝 ${translatedSummary}

🔗 ${latestNews.url}`

            }

          );

          continue;
        }

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

// REALTIME
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
