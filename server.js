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
// SYSTEM STATE
// =====================================

let currentTopic =
  "general";

let newsEnabled = true;

let lastUpdateId = 0;

let isPolling = false;

// =====================================
// CACHE
// =====================================

const sentNews =
  new Set();

const topicState = {

  NVIDIA: {
    sentiment: null,
    lastSignal: null
  },

  TSMC: {
    sentiment: null,
    lastSignal: null
  },

  Bitcoin: {
    sentiment: null,
    lastSignal: null
  },

  Korea: {
    sentiment: null,
    lastSignal: null
  }

};

// =====================================
// FEEDS
// =====================================

const feedMap = {

  general: [

    "https://news.google.com/rss/search?q=stock+market",

    "https://news.google.com/rss/search?q=federal+reserve",

    "https://news.google.com/rss/search?q=nasdaq"

  ],

  NVIDIA: [

    "https://news.google.com/rss/search?q=nvidia",

    "https://news.google.com/rss/search?q=nvidia+earnings",

    "https://news.google.com/rss/search?q=ai+gpu"

  ],

  TSMC: [

    "https://news.google.com/rss/search?q=tsmc",

    "https://news.google.com/rss/search?q=semiconductor"

  ],

  Bitcoin: [

    "https://news.google.com/rss/search?q=bitcoin",

    "https://news.google.com/rss/search?q=crypto"

  ],

  Korea: [

    "https://news.google.com/rss/search?q=korea+immigration",

    "https://news.google.com/rss/search?q=foreign+workers+korea",

    "https://news.google.com/rss/search?q=south+korea+illegal+workers"

  ]

};

// =====================================
// SAFE TRANSLATE
// =====================================

async function translateText(text) {

  try {

    if (!text) {

      return "";
    }

    text = text.replace(
      /https?:\/\/\S+/g,
      ""
    );

    text = text.replace(
      /[*_#`]/g,
      ""
    );

    text = text.slice(0, 1500);

    const url =

`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=th&dt=t&q=${encodeURIComponent(text)}`;

    const res =
      await axios.get(url, {

        timeout: 10000

      });

    if (
      !res.data ||
      !res.data[0]
    ) {

      return text;
    }

    const translated =
      res.data[0]
        .map(x => x[0])
        .join("");

    return translated || text;

  } catch (e) {

    console.log(
      "Translate Error:",
      e.message
    );

    return text;
  }
}

// =====================================
// QUICK FILTER
// =====================================

function quickFilter(
  item
) {

  const text =

`${item.title}
${item.summary}`
.toLowerCase();

  const keywords = [

    "nvidia",
    "tsmc",
    "bitcoin",
    "crypto",
    "federal reserve",
    "ai",
    "gpu",
    "immigration",
    "foreign workers",
    "semiconductor",
    "earnings",
    "stocks"

  ];

  return keywords.some(
    x => text.includes(x)
  );
}

// =====================================
// QUICK AI
// =====================================

async function quickAnalyze(
  news
) {

  try {

    const prompt = `

คุณคือ AI วิเคราะห์ข่าวตลาด

วิเคราะห์เร็ว

ตอบ JSON เท่านั้น

{
 "relevance":0,
 "impact":0,
 "important":true,
 "sentiment":"BULLISH/BEARISH/NEUTRAL",
 "signal":""
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

        max_tokens: 150

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
      "Quick AI Error:",
      e.message
    );

    return {

      relevance: 0,

      impact: 0,

      important: false,

      sentiment:
        "NEUTRAL",

      signal:
        "NONE"

    };
  }
}

// =====================================
// DEEP AI
// =====================================

async function deepAnalyze(
  news
) {

  try {

    const prompt = `

คุณคือ AI นักลงทุนระดับสูง

วิเคราะห์ข่าวนี้แบบมืออาชีพ

สำคัญมาก:
- ตอบเป็นภาษาไทยเท่านั้น
- ห้ามตอบอังกฤษ
- ห้ามใช้คำ generic
- วิเคราะห์แบบนักลงทุนจริง
- concise
- useful

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

ตัวอย่างการตอบที่ดี:

summary:
"TSMC ได้ประโยชน์จาก demand AI ที่ยังแรง"

short_term:
"sentiment ยังบวกต่อหุ้น semiconductor"

long_term:
"AI boom ยังสนับสนุนรายได้ระยะยาว"

risk:
"valuation เริ่มสูงและการแข่งขันรุนแรงขึ้น"

action:
"ยังถือได้ แต่ระวังแรงขายทำกำไร"

market_impact:
"บวกต่อหุ้น AI และ semiconductor"

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

        temperature: 0.15,

        max_tokens: 700

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
      "Deep AI Error:",
      e.message
    );

    return {

      summary:
        "AI วิเคราะห์ไม่ได้",

      market_impact:
        "ไม่สามารถประเมินได้",

      short_term:
        "ไม่มีข้อมูล",

      long_term:
        "ไม่มีข้อมูล",

      risk:
        "ไม่มีข้อมูล",

      action:
        "รอข้อมูลเพิ่มเติม",

      signal_strength: 0

    };
  }
}

// =====================================
// FETCH NEWS
// =====================================

async function fetchFeeds() {

  try {

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
                x.link || "",

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

  } catch (e) {

    console.log(
      "Fetch Error:",
      e.message
    );

    return [];
  }
}

// =====================================
// SIGNAL CHANGE DETECTION
// =====================================

function shouldSendSignal(
  topic,
  quick
) {

  if (
    !topicState[topic]
  ) {

    return true;
  }

  const prev =
    topicState[topic];

  if (
    prev.sentiment !==
    quick.sentiment
  ) {

    topicState[topic] = {

      sentiment:
        quick.sentiment,

      lastSignal:
        quick.signal

    };

    return true;
  }

  if (
    prev.lastSignal !==
    quick.signal
  ) {

    topicState[topic] = {

      sentiment:
        quick.sentiment,

      lastSignal:
        quick.signal

    };

    return true;
  }

  return false;
}

// =====================================
// TELEGRAM SEND
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

    if (
      quick.relevance < 6
    ) {

      console.log(
        "Skip low relevance"
      );

      return;
    }

    if (
      quick.impact < 5
    ) {

      console.log(
        "Skip low impact"
      );

      return;
    }

    if (
      !shouldSendSignal(
        currentTopic,
        quick
      )
    ) {

      console.log(
        "No important signal change"
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

    const thaiSentiment =

      quick.sentiment ===
      "BULLISH"

        ? "บวก"

        : quick.sentiment ===
          "BEARISH"

        ? "ลบ"

        : "กลาง";

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
${thaiSentiment}

🔥 Relevance:
${quick.relevance}/10

📊 Impact:
${quick.impact}/10

⚡ ความแรงสัญญาณ:
${deep.signal_strength}/10

🧠 วิเคราะห์:
${deep.summary}

📈 ระยะสั้น:
${deep.short_term}

📉 ระยะยาว:
${deep.long_term}

⚠️ ความเสี่ยง:
${deep.risk}

🎯 คำแนะนำ:
${deep.action}

🌍 ผลต่อตลาด:
${deep.market_impact}

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
        "📡 เลือกหัวข้อข่าว",

      reply_markup: {

        inline_keyboard: [

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

          ],

          [

            {
              text: "📈 Market",
              callback_data:
                "general"
            }

          ]

        ]

      }

    }

  );
}

// =====================================
// TELEGRAM POLLING
// =====================================

async function checkTelegram() {

  if (isPolling) {

    return;
  }

  isPolling = true;

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

${data}

⚡ AI Signal Engine พร้อมทำงาน`

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

      if (
        text === "/menu"
      ) {

        await sendMenu(
          chatId
        );

        continue;
      }

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
              "🛑 หยุดส่งข่าวแล้ว"

          }

        );

        continue;
      }

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
              "✅ เริ่มส่งข่าวแล้ว"

          }

        );

        continue;
      }

      if (
        text.startsWith(
          "/ask "
        )
      ) {

        try {

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

`คุณคือ AI ผู้ช่วยวิเคราะห์ข่าวและตลาดการเงิน
ตอบเป็นภาษาไทย
ตอบแบบ concise analytical useful`

                },

                {

                  role:
                    "user",

                  content:
                    prompt

                }

              ],

              temperature: 0.3,

              max_tokens: 400

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

        } catch (e) {

          await axios.post(

`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

            {

              chat_id:
                chatId,

              text:
                "❌ AI Error"

            }

          );
        }

        continue;
      }
    }

  } catch (e) {

    console.log(
      "Telegram Error:",
      e.message
    );

  } finally {

    isPolling = false;
  }
}

// =====================================
// AUTO LOOP
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
        news
      ) {

        if (
          !quickFilter(
            item
          )
        ) {

          continue;
        }

        const quick =

          await quickAnalyze(
            item
          );

        if (
          !quick.important
        ) {

          continue;
        }

        const deep =

          await deepAnalyze(
            item
          );

        await sendTelegram(
          item,
          quick,
          deep
        );
      }

    } catch (e) {

      console.log(
        "Loop Error:",
        e.message
      );

    }
  },

  180000
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
// KEEP ALIVE ROUTE
// =====================================

app.get("/", (req, res) => {

  console.log(
    "PING:",
    new Date()
      .toISOString()
  );

  res.send(
    "HYBRID AI INTELLIGENCE SYSTEM RUNNING"
  );

});

// =====================================
// HEALTH CHECK
// =====================================

app.get("/health", (req, res) => {

  console.log(
    "HEALTH CHECK:",
    new Date()
      .toISOString()
  );

  res.json({

    status: "ok",

    uptime:
      process.uptime(),

    topic:
      currentTopic,

    newsEnabled,

    sentNews:
      sentNews.size

  });

});

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
