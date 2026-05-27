import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import NodeCache from "node-cache";
import Parser from "rss-parser";

dotenv.config();

const app = express();

const parser = new Parser({
  timeout: 15000
});

const cache = new NodeCache({
  stdTTL: 180
});

app.use(cors());
app.use(express.json());

const PORT =
  process.env.PORT || 3000;

// =====================================
// SETTINGS
// =====================================

let newsEnabled = true;

let latestNews = null;

let currentTopic =
  "general";

const sentNews =
  new Set();

// =====================================
// FEEDS
// =====================================

const feedMap = {

  general: [

    "https://www.beartai.com/feed",

    "https://siamblockchain.com/feed",

    "https://news.google.com/rss/search?q=nasdaq",

    "https://news.google.com/rss/search?q=stock+market"

  ],

  AI: [

    "https://www.beartai.com/feed",

    "https://news.google.com/rss/search?q=artificial+intelligence",

    "https://news.google.com/rss/search?q=openai"

  ],

  Bitcoin: [

    "https://siamblockchain.com/feed",

    "https://news.google.com/rss/search?q=bitcoin",

    "https://news.google.com/rss/search?q=crypto"

  ],

  NVIDIA: [

    "https://news.google.com/rss/search?q=nvidia"

  ],

  TSMC: [

    "https://news.google.com/rss/search?q=tsmc"

  ],

  Tesla: [

    "https://news.google.com/rss/search?q=tesla"

  ],

  Korea: [

    "https://news.google.com/rss/search?q=korea"

  ],

  "Korea illegal workers": [

    "https://news.google.com/rss/search?q=korea+illegal+workers",

    "https://news.google.com/rss/search?q=yangsan+immigration",

    "https://news.google.com/rss/search?q=foreign+workers+korea"

  ]

};

// =====================================
// CLEAN GOOGLE URL
// =====================================

function cleanGoogleUrl(url) {

  try {

    if (!url)
      return "";

    if (
      !url.includes(
        "news.google.com"
      )
    ) {

      return url;
    }

    const parsed =
      new URL(url);

    const actualUrl =
      parsed.searchParams.get(
        "url"
      );

    if (actualUrl) {

      return decodeURIComponent(
        actualUrl
      );

    }

    return url;

  } catch {

    return url;
  }
}

// =====================================
// TRANSLATE
// =====================================

async function translateText(
  text,
  target = "th"
) {

  try {

    if (!text)
      return "";

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

// =====================================
// GROQ AI
// =====================================

async function askAI(prompt) {

  try {

    const response =
      await axios.post(

"https://api.groq.com/openai/v1/chat/completions",

      {

        model:
          "llama-3.3-70b-versatile",

        messages: [

          {

            role: "system",

            content:

`ตอบเป็นภาษาไทยเสมอ

คุณคือ AI Assistant ด้าน:
- หุ้นโลก
- AI
- Crypto
- ข่าวเกาหลี
- ข่าวแรงงาน

ตอบสั้น กระชับ เข้าใจง่าย`

          },

          {

            role: "user",

            content: prompt

          }

        ]

      },

      {

        headers: {

          Authorization:

`Bearer ${process.env.GROQ_API_KEY}`,

          "Content-Type":
            "application/json"

        }

      }

    );

    return (

      response.data
        ?.choices?.[0]
        ?.message?.content ||

      "❌ AI ไม่ตอบ"

    );

  } catch (e) {

    console.log(
      "Groq Error:",
      e.response?.data || e.message
    );

    return "❌ AI ใช้งานไม่ได้";
  }
}

// =====================================
// SENTIMENT
// =====================================

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

// =====================================
// FETCH NEWS
// =====================================

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

  for (const rawUrl of feeds) {

    try {

      const safeUrl =
        encodeURI(rawUrl);

      console.log(
        "Fetching:",
        safeUrl
      );

      const feed =
        await parser.parseURL(
          safeUrl
        );

      const items =
        feed.items
          .slice(0, 5)

          .map((x, i) => ({

            id:
              `${Date.now()}-${i}`,

            title:
              x.title ||

              "ไม่มีหัวข้อข่าว",

            source:
              feed.title ||

              "Unknown Source",

            summary:

              x.contentSnippet ||

              "ไม่มีรายละเอียด",

            url:
              cleanGoogleUrl(
                x.link || ""
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

  // UNIQUE
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

  console.log(
    `Fetched ${all.length} news`
  );

  return all;
}

// =====================================
// SEND TELEGRAM
// =====================================

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

    // AUTO TRANSLATE
    const thaiTitle =
      await translateText(
        news.title
      );

    const thaiSummary =
      await translateText(
        news.summary
      );

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

📰 <b>${thaiTitle}</b>

📡 ${news.source}

⏰ ${news.time}

${emoji}
<b>${analysis.sentiment}</b>

📊 Score:
${analysis.score}

📝
${thaiSummary}

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

    console.log(
      "Sent:",
      thaiTitle
    );

  } catch (e) {

    console.log(
      "Telegram Error:",
      e.message
    );

  }
}

// =====================================
// TELEGRAM COMMANDS
// =====================================

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

      // =====================================
      // CALLBACK BUTTONS
      // =====================================

      if (
        update.callback_query
      ) {

        const data =
          update.callback_query
            .data;

        const chatId =

          update.callback_query
            .message.chat.id;

        // =====================================
        // TRANSLATE BUTTON
        // =====================================

        if (
          data ===
          "translate_latest"
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

`🌐 แปลไทย

📰 ${translatedTitle}

📝 ${translatedSummary}

🔗 ${latestNews.url}`

            }

          );

          continue;
        }

        // =====================================
        // CHANGE TOPIC
        // =====================================

        currentTopic =
          data;

        sentNews.clear();

        cache.flushAll();

        await axios.post(

`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:

`✅ เปลี่ยนหัวข้อแล้ว

📡 ${data}`

          }

        );

        // SEND NEW NEWS
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

        continue;
      }

      // =====================================
      // NORMAL TEXT
      // =====================================

      const text =
        update.message?.text;

      if (!text)
        continue;

      const chatId =
        update.message.chat.id;

      // =====================================
      // PING
      // =====================================

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

        continue;
      }

      // =====================================
      // STOP NEWS
      // =====================================

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
              "🛑 ปิดส่งข่าวแล้ว"

          }

        );

        continue;
      }

      // =====================================
      // START NEWS
      // =====================================

      if (
        text === "/startnews"
      ) {

        newsEnabled = true;

        sentNews.clear();

        await axios.post(

`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:
              "✅ เปิดส่งข่าวแล้ว"

          }

        );

        continue;
      }

      // =====================================
      // MENU
      // =====================================

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

        continue;
      }

      // =====================================
      // ASK AI
      // =====================================

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

        continue;
      }

      // =====================================
      // MANUAL TRANSLATE
      // =====================================

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

`🌐 แปลไทย

📰 ${translatedTitle}

📝 ${translatedSummary}

🔗 ${latestNews.url}`

          }

        );

        continue;
      }
    }

  } catch (e) {

    console.log(
      "Command Error:",
      e.message
    );

  }
}

// =====================================
// HOME
// =====================================

app.get("/", (req, res) => {

  res.send(
    "AI NEWS BOT RUNNING"
  );

});

// =====================================
// API
// =====================================

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

// =====================================
// AUTO NEWS
// =====================================

setInterval(

  async () => {

    try {

      if (!newsEnabled)
        return;

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

    } catch (e) {

      console.log(
        "Auto Error:",
        e.message
      );

    }
  },

  300000
);

// =====================================
// REALTIME COMMAND LOOP
// =====================================

setInterval(

  async () => {

    await checkTelegramCommands();

  },

  5000
);

// =====================================
// START SERVER
// =====================================

app.listen(

  PORT,

  () => {

    console.log(
      `Server running on ${PORT}`
    );

  }
);
