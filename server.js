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

let newsEnabled = true;

const sentNews =
  new Set();

let latestNews = null;

let currentTopic =
  "general";

// FEEDS
const feedMap = {

  general: [

    "https://www.beartai.com/feed",

    "https://siamblockchain.com/feed",

    "https://news.google.com/rss/search?q=Nasdaq&hl=th&gl=TH&ceid=TH:th"

  ],

  AI: [

    "https://www.beartai.com/feed"

  ],

  Bitcoin: [

    "https://siamblockchain.com/feed",

    "https://news.google.com/rss/search?q=Bitcoin&hl=th&gl=TH&ceid=TH:th"

  ],

  NVIDIA: [

    "https://news.google.com/rss/search?q=NVIDIA&hl=th&gl=TH&ceid=TH:th"

  ],

  TSMC: [

    "https://news.google.com/rss/search?q=TSMC&hl=th&gl=TH&ceid=TH:th"

  ],

  Tesla: [

    "https://news.google.com/rss/search?q=Tesla&hl=th&gl=TH&ceid=TH:th"

  ],

  Korea: [

    "https://news.google.com/rss/search?q=เกาหลี&hl=th&gl=TH&ceid=TH:th"

  ],

  "Korea illegal workers": [

    "https://news.google.com/rss/search?q=แรงงานเกาหลี&hl=th&gl=TH&ceid=TH:th",

    "https://news.google.com/rss/search?q=Yangsan+immigration&hl=en&gl=US&ceid=US:en"

  ]

};

// CLEAN URL
function cleanGoogleUrl(url) {

  try {

    const match =
      url.match(
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

    const response =
      await axios.post(

`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,

        {

          contents: [

            {

              role: "user",

              parts: [

                {

                  text:

`ตอบเป็นภาษาไทยเสมอ

คุณคือ AI Assistant

ตอบสั้น กระชับ เข้าใจง่าย

คำถาม:

${prompt}`

                }

              ]

            }

          ]

        },

        {

          headers: {

            "Content-Type":
              "application/json"

          }

        }

      );

    return (

      response.data
        ?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text ||

      "❌ AI ไม่ตอบ"

    );

  } catch (e) {

    console.log(
      "Gemini Error:",
      e.response?.data || e.message
    );

    return "❌ AI ใช้งานไม่ได้ชั่วคราว";
  }
}

// SENTIMENT
function analyzeSentiment(title) {

  const bullishWords = [

    "surge",
    "rise",
    "growth",
    "profit",

    "พุ่ง",
    "กำไร"

  ];

  const bearishWords = [

    "crash",
    "drop",

    "ร่วง",
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

  const cacheKey =
    `news_${currentTopic}`;

  const cached =
    cache.get(cacheKey);

  if (cached)
    return cached;

  const feeds =

    feedMap[currentTopic] ||

    feedMap.general;

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

    } catch (e) {

      console.log(
        "Feed Error:",
        e.message
      );

    }
  }

  // unique
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
    cacheKey,
    all
  );

  return all;
}

// SEND TELEGRAM
async function sendTelegram(news) {

  try {

    if (!newsEnabled)
      return;

    if (
      sentNews.has(
        news.title
      )
    ) {

      return;
    }

    sentNews.add(
      news.title
    );

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
          "HTML"

      }

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

      // STOP
      if (
        text === "/stop"
      ) {

        newsEnabled = false;

        await axios.post(

`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:
              "🛑 ปิดข่าวแล้ว"

          }

        );
      }

      // START
      if (
        text === "/startnews"
      ) {

        newsEnabled = true;

        await axios.post(

`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:
              "✅ เปิดข่าวแล้ว"

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
              "📡 เลือกข่าว",

            reply_markup: {

              inline_keyboard: [

                [

                  {
                    text: "🤖 AI",
                    callback_data: "AI"
                  },

                  {
                    text: "📈 หุ้น",
                    callback_data: "general"
                  }

                ],

                [

                  {
                    text: "₿ Bitcoin",
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
            latestNews.title
          );

        const translatedSummary =

          await translateText(
            latestNews.summary
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

  } catch (e) {

    console.log(
      "Command Error:",
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

      if (!newsEnabled)
        return;

      const news =
        await fetchFeeds();

      for (
        const item of
        news
      ) {

        await sendTelegram(
          item
        );

      }

    } catch (e) {

      console.log(
        "Auto News Error:",
        e.message
      );

    }
  },

  300000
);

// COMMAND LOOP
setInterval(

  async () => {

    await checkTelegramCommands();

  },

  5000
);

// START
app.listen(

  PORT,

  () => {

    console.log(
      `Server running on ${PORT}`
    );

  }
);
