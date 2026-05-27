import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import Parser from "rss-parser";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const parser = new Parser();

const PORT =
  process.env.PORT || 3000;

// =====================================
// MEMORY
// =====================================

const userProfile = {

  interests: [

    "AI",
    "NVIDIA",
    "TSMC",
    "Bitcoin",
    "Korea",
    "Immigration"

  ],

  risk: "high"

};

// =====================================
// SETTINGS
// =====================================

let newsEnabled = true;

let currentTopic =
  "general";

const sentNews =
  new Set();

// =====================================
// FEEDS
// =====================================

const feedMap = {

  general: [

    "https://news.google.com/rss/search?q=stock+market",

    "https://news.google.com/rss/search?q=nasdaq"

  ],

  AI: [

    "https://news.google.com/rss/search?q=artificial+intelligence",

    "https://news.google.com/rss/search?q=openai"

  ],

  NVIDIA: [

    "https://news.google.com/rss/search?q=nvidia"

  ],

  TSMC: [

    "https://news.google.com/rss/search?q=tsmc"

  ],

  Bitcoin: [

    "https://news.google.com/rss/search?q=bitcoin",

    "https://news.google.com/rss/search?q=crypto"

  ],

  Korea: [

    "https://news.google.com/rss/search?q=korea",

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
// AI ANALYSIS
// =====================================

async function analyzeNews(news) {

  try {

    const prompt = `

คุณคือ AI นักลงทุน

วิเคราะห์ข่าวนี้แบบสั้น กระชับ

ตอบเป็น JSON เท่านั้น

{
 "summary":"",
 "impact":"",
 "sentiment":"",
 "score":0,
 "important":true
}

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

        temperature: 0.3

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

  } catch (e) {

    console.log(
      "AI Analyze Error:",
      e.message
    );

    return {

      summary:
        "วิเคราะห์ไม่ได้",

      impact:
        "unknown",

      sentiment:
        "NEUTRAL",

      score: 0,

      important: false

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

  return unique;
}

// =====================================
// SEND TELEGRAM
// =====================================

async function sendTelegram(
  news,
  analysis
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
      !analysis.important
    ) {

      console.log(
        "Skipped low quality news"
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

${emoji}
<b>${analysis.sentiment}</b>

📊 Score:
${analysis.score}

📌 AI Summary:
${analysis.summary}

📈 Impact:
${analysis.impact}

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
              text: "📈 ตลาด",
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
// TELEGRAM COMMANDS
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

`✅ เปลี่ยนหัวข้อเป็น:

${data}`

          }

        );

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

`คุณคือ AI Assistant ส่วนตัว

รู้ว่าผู้ใช้สน:
- AI
- NVIDIA
- หุ้นโลก
- เกาหลี
- Crypto

ตอบเป็นภาษาไทย`

              },

              {

                role:
                  "user",

                content:
                  prompt

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
// AUTO AI SIGNAL
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

        const analysis =

          await analyzeNews(
            item
          );

        await sendTelegram(
          item,
          analysis
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

  5000
);

// =====================================
// HOME
// =====================================

app.get("/", (req, res) => {

  res.send(
    "AI SIGNAL SYSTEM RUNNING"
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
