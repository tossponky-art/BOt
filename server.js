import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import Parser from "rss-parser";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const parser = new Parser({
  timeout: 10000
});

const PORT =
  process.env.PORT || 3000;

// =====================================
// USER PROFILE
// =====================================

const userProfile = {

  interests: [

    "AI",
    "NVIDIA",
    "TSMC",
    "Bitcoin",
    "Korea",
    "Immigration"

  ]

};

// =====================================
// SETTINGS
// =====================================

let currentTopic =
  "general";

let newsEnabled = true;

const sentNews =
  new Set();

// =====================================
// FEEDS
// =====================================

const feedMap = {

  general: [

    "https://news.google.com/rss/search?q=stock+market",

    "https://news.google.com/rss/search?q=nasdaq",

    "https://news.google.com/rss/search?q=federal+reserve"

  ],

  AI: [

    "https://news.google.com/rss/search?q=artificial+intelligence",

    "https://news.google.com/rss/search?q=openai",

    "https://news.google.com/rss/search?q=nvidia+ai"

  ],

  NVIDIA: [

    "https://news.google.com/rss/search?q=nvidia",

    "https://news.google.com/rss/search?q=nvidia+earnings"

  ],

  TSMC: [

    "https://news.google.com/rss/search?q=tsmc"

  ],

  Bitcoin: [

    "https://news.google.com/rss/search?q=bitcoin",

    "https://news.google.com/rss/search?q=crypto"

  ],

  Korea: [

    "https://news.google.com/rss/search?q=korea+immigration",

    "https://news.google.com/rss/search?q=foreign+workers+korea",

    "https://news.google.com/rss/search?q=yangsan+immigration"

  ]

};

// =====================================
// TRANSLATE
// =====================================

async function translateText(
  text
) {

  try {

    if (!text)
      return "";

    const url =

`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=th&dt=t&q=${encodeURIComponent(text)}`;

    const res =
      await axios.get(url);

    return res.data[0]
      .map(x => x[0])
      .join("");

  } catch {

    return text;
  }
}

// =====================================
// QUICK FILTER
// =====================================

function quickFilter(news) {

  const text =

`${news.title}
${news.summary}`
.toLowerCase();

  const keywords = [

    "ai",
    "nvidia",
    "tsmc",
    "bitcoin",
    "crypto",
    "immigration",
    "foreign workers",
    "raid",
    "deport",
    "federal reserve",
    "interest rate",
    "earnings",
    "stocks"

  ];

  for (
    const k of keywords
  ) {

    if (
      text.includes(k)
    ) {

      return true;
    }
  }

  return false;
}

// =====================================
// QUICK AI ANALYSIS
// FAST MODE
// =====================================

async function quickAnalyze(
  news
) {

  try {

    const prompt = `

คุณคือ AI Signal Filter

วิเคราะห์เร็ว

ตอบ JSON เท่านั้น

{
 "relevance":0,
 "impact":0,
 "important":true,
 "sentiment":""
}

ข่าว:
${news.title}

`;

    const response =
      await axios.post(

"https://api.groq.com/openai/v1/chat/completions",

      {

        model:
          "llama-3.3-70b-versatile",

        messages: [

          {

            role: "user",

            content: prompt

          }

        ],

        temperature: 0.1,

        max_tokens: 120

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

    const raw =

      response.data
        ?.choices?.[0]
        ?.message?.content;

    const clean =
      raw.replace(
        /```json|```/g,
        ""
      );

    return JSON.parse(clean);

  } catch {

    return {

      relevance: 0,

      impact: 0,

      important: false,

      sentiment:
        "NEUTRAL"

    };
  }
}

// =====================================
// DEEP AI ANALYSIS
// ONLY IMPORTANT NEWS
// =====================================

async function deepAnalyze(
  news
) {

  try {

    const prompt = `

คุณคือ AI Financial Intelligence Analyst

วิเคราะห์ข่าวนี้เชิงลึก

ตอบ JSON เท่านั้น

{
 "summary":"",
 "market_impact":"",
 "short_term":"",
 "long_term":"",
 "risk":"",
 "action":"",
 "signal_strength":0
}

วิเคราะห์แบบ:
- นักลงทุนมืออาชีพ
- concise
- useful
- analytical
- ไม่ generic

ข่าว:
${news.title}

รายละเอียด:
${news.summary}

`;

    const response =
      await axios.post(

"https://api.groq.com/openai/v1/chat/completions",

      {

        model:
          "llama-3.3-70b-versatile",

        messages: [

          {

            role: "user",

            content: prompt

          }

        ],

        temperature: 0.2,

        max_tokens: 600

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

    const raw =

      response.data
        ?.choices?.[0]
        ?.message?.content;

    const clean =
      raw.replace(
        /```json|```/g,
        ""
      );

    return JSON.parse(clean);

  } catch {

    return {

      summary:
        "No summary",

      market_impact:
        "Unknown",

      short_term:
        "Unknown",

      long_term:
        "Unknown",

      risk:
        "Unknown",

      action:
        "Hold",

      signal_strength: 0

    };
  }
}

// =====================================
// FETCH NEWS
// =====================================

async function fetchFeeds() {

  const feeds =

    feedMap[currentTopic] ||

    feedMap.general;

  let all = [];

  for (const url of feeds) {

    try {

      const feed =
        await parser.parseURL(
          encodeURI(url)
        );

      const items =
        feed.items
          .slice(0, 5)

          .map((x, i) => ({

            id:
              `${Date.now()}-${i}`,

            title:
              x.title ||

              "No title",

            summary:

              x.contentSnippet ||

              "No summary",

            url:
              x.link ||

              "",

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

  return unique;
}

// =====================================
// SEND TELEGRAM
// =====================================

async function sendTelegram(
  news,
  quick,
  deep
) {

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

    // FILTER LOW QUALITY
    if (
      quick.relevance < 5
    ) {

      console.log(
        "Skip low relevance"
      );

      return;
    }

    if (
      quick.impact < 4
    ) {

      console.log(
        "Skip low impact"
      );

      return;
    }

    sentNews.add(
      news.title
    );

    const thaiTitle =

      await translateText(
        news.title
      );

    const thaiSummary =

      await translateText(
        deep.summary
      );

    const thaiMarket =

      await translateText(
        deep.market_impact
      );

    const thaiShort =

      await translateText(
        deep.short_term
      );

    const thaiLong =

      await translateText(
        deep.long_term
      );

    const thaiRisk =

      await translateText(
        deep.risk
      );

    const thaiAction =

      await translateText(
        deep.action
      );

    const emoji =

      quick.sentiment ===
      "BULLISH"

        ? "🟢"

        : quick.sentiment ===
          "BEARISH"

        ? "🔴"

        : "🟡";

    const message = `

📰 <b>${thaiTitle}</b>

${emoji}
<b>${quick.sentiment}</b>

🔥 Relevance:
${quick.relevance}/10

📊 Impact:
${quick.impact}/10

⚡ Signal:
${deep.signal_strength}/10

🧠 วิเคราะห์:
${thaiSummary}

📈 ระยะสั้น:
${thaiShort}

📉 ระยะยาว:
${thaiLong}

⚠️ ความเสี่ยง:
${thaiRisk}

🎯 คำแนะนำ:
${thaiAction}

🌍 ผลต่อตลาด:
${thaiMarket}

🔗 ${news.url}

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
// MENU
// =====================================

async function sendMenu(
  chatId
) {

  await axios.post(

`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

    {

      chat_id:
        chatId,

      text:
        "📡 เลือกหัวข้อ",

      reply_markup: {

        inline_keyboard: [

          [

            {
              text: "🤖 AI",
              callback_data: "AI"
            },

            {
              text: "📈 Market",
              callback_data:
                "general"
            }

          ],

          [

            {
              text: "🟢 NVIDIA",
              callback_data:
                "NVIDIA"
            },

            {
              text: "⚙️ TSMC",
              callback_data:
                "TSMC"
            }

          ],

          [

            {
              text: "₿ Bitcoin",
              callback_data:
                "Bitcoin"
            },

            {
              text: "🇰🇷 Korea",
              callback_data:
                "Korea"
            }

          ]

        ]

      }

    }

  );
}

// =====================================
// TELEGRAM
// =====================================

let lastUpdateId = 0;

async function checkTelegram() {

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

      // CALLBACK
      if (
        update.callback_query
      ) {

        const data =
          update.callback_query
            .data;

        const chatId =

          update.callback_query
            .message.chat.id;

        currentTopic =
          data;

        sentNews.clear();

        await axios.post(

`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

          {

            chat_id:
              chatId,

            text:

`✅ เปลี่ยนหัวข้อ:

${data}

⚡ Fast AI Filtering
🧠 Deep AI Analysis`

          }

        );

        const news =
          await fetchFeeds();

        for (
          const item of
          news.slice(0, 3)
        ) {

          // QUICK FILTER
          if (
            !quickFilter(
              item
            )
          ) {

            continue;
          }

          // FAST AI
          const quick =

            await quickAnalyze(
              item
            );

          // SKIP
          if (
            !quick.important
          ) {

            continue;
          }

          // DEEP AI
          const deep =

            await deepAnalyze(
              item
            );

          // SEND
          await sendTelegram(
            item,
            quick,
            deep
          );
        }

        continue;
      }

      const text =
        update.message?.text;

      if (!text)
        continue;

      const chatId =
        update.message.chat.id;

      // MENU
      if (
        text === "/menu"
      ) {

        await sendMenu(
          chatId
        );

        continue;
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

        continue;
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

        continue;
      }

      // AI CHAT
      if (
        text.startsWith("/ask ")
      ) {

        const prompt =
          text.replace(
            "/ask ",
            ""
          );

        const response =
          await axios.post(

"https://api.groq.com/openai/v1/chat/completions",

          {

            model:
              "llama-3.3-70b-versatile",

            messages: [

              {

                role:
                  "system",

                content:

`คุณคือ AI Intelligence Assistant

ตอบแบบ:
- analytical
- concise
- useful
- ไม่ generic
- เน้น signal`

              },

              {

                role:
                  "user",

                content:
                  prompt

              }

            ],

            temperature: 0.3,

            max_tokens: 500

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

        const answer =

          response.data
            ?.choices?.[0]
            ?.message?.content;

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
    }

  } catch (e) {

    console.log(
      "Telegram Error:",
      e.message
    );

  }
}

// =====================================
// AUTO SIGNAL LOOP
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
        news.slice(0, 5)
      ) {

        // QUICK FILTER
        if (
          !quickFilter(
            item
          )
        ) {

          continue;
        }

        // FAST AI
        const quick =

          await quickAnalyze(
            item
          );

        if (
          !quick.important
        ) {

          continue;
        }

        // DEEP AI
        const deep =

          await deepAnalyze(
            item
          );

        // SEND
        await sendTelegram(
          item,
          quick,
          deep
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
// TELEGRAM LOOP
// =====================================

setInterval(

  async () => {

    await checkTelegram();

  },

  3000
);

// =====================================
// HOME
// =====================================

app.get("/", (req, res) => {

  res.send(
    "HYBRID AI INTELLIGENCE SYSTEM RUNNING"
  );

});

// =====================================
// START
// =====================================

app.listen(

  PORT,

  () => {

    console.log(
      `Server running on ${PORT}`
    );

  }
);
