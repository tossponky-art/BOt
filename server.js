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

let lastAskTime = 0;

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

    "https://news.google.com/rss/search?q=foreign+workers+korea"

  ]

};

// =====================================
// SIMPLE TITLE TRANSLATE
// =====================================

async function translateTitle(
  text
) {

  try {

    if (!text)
      return "";

    text =
      text.slice(0, 300);

    const url =

`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=th&dt=t&q=${encodeURIComponent(text)}`;

    const res =
      await axios.get(url, {

        timeout: 5000

      });

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

function quickFilter(
  item
) {

  const text =

`${item.title}
${item.summary}`
.toLowerCase();

  const keywords = {

    NVIDIA: [

      "nvidia",
      "gpu",
      "ai chip"

    ],

    TSMC: [

      "tsmc",
      "semiconductor",
      "chip"

    ],

    Bitcoin: [

      "bitcoin",
      "crypto",
      "btc"

    ],

    Korea: [

      "korea",
      "foreign workers",
      "immigration"

    ],

    general: [

      "stocks",
      "market",
      "nasdaq",
      "fed"

    ]

  };

  const target =
    keywords[
      currentTopic
    ] ||
    keywords.general;

  return target.some(
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

วิเคราะห์เร็วมาก

ตอบ JSON เท่านั้น

{
 "relevance":0,
 "impact":0,
 "important":true,
 "sentiment":"BULLISH/BEARISH/NEUTRAL"
}

ข่าว:
${news.title}

`;

    const response =
      await axios.post(

"https://api.groq.com/openai/v1/chat/completions",

      {

        model:
          "llama-3.1-8b-instant",

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

        },

        timeout: 10000

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
        "NEUTRAL"

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

ตอบภาษาไทยเท่านั้น

วิเคราะห์ข่าวนี้ให้:
- concise
- useful
- professional

ตอบ JSON เท่านั้น

{
 "summary":"",
 "short_term":"",
 "long_term":"",
 "risk":"",
 "action":"",
 "signal_strength":0
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

        temperature: 0.15,

        max_tokens: 450

      },

      {

        headers: {

          Authorization:

`Bearer ${process.env.GROQ_API_KEY}`,

          "Content-Type":
            "application/json"

        },

        timeout: 20000

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
            .slice(0, 3)

            .map((x, i) => ({

              id:
                `${Date.now()}-${i}`,

              title:
                x.title ||
                "No title",

              summary:

                x.contentSnippet ||
                "",

              url:
                x.link || ""

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
// SIGNAL CHANGE
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
        Date.now()

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
  deep = null
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

    sentNews.add(
      news.title
    );

    const thaiTitle =
      await translateTitle(
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

    let message = `

📰 <b>${thaiTitle}</b>

${emoji}
${thaiSentiment}

🔥 Relevance:
${quick.relevance}/10

📊 Impact:
${quick.impact}/10

`;

    // only important news
    if (
      deep
    ) {

      message += `

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

`;
    }

    message += `

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
      news.title
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

  if (isPolling)
    return;

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
              "🏓 Pong"

          }

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
              "🛑 หยุดส่งข่าวแล้ว"

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
              "✅ เริ่มส่งข่าวแล้ว"

          }

        );

        continue;
      }

      // ASK AI
      if (
        text.startsWith(
          "/ask "
        )
      ) {

        // cooldown
        const now =
          Date.now();

        if (
          now - lastAskTime <
          15000
        ) {

          await axios.post(

`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

            {

              chat_id:
                chatId,

              text:
                "⏳ กรุณารอ 15 วินาที"

            }

          );

          continue;
        }

        lastAskTime =
          now;

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
                "llama-3.1-8b-instant",

              messages: [

                {

                  role:
                    "system",

                  content:

`ตอบภาษาไทย concise analytical`

                },

                {

                  role:
                    "user",

                  content:
                    prompt

                }

              ],

              temperature: 0.3,

              max_tokens: 250

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

        } catch {

          await axios.post(

`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

            {

              chat_id:
                chatId,

              text:
                "❌ AI ใช้งานหนักเกินไป ลองใหม่อีกที"

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
// MAIN LOOP
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

        // keyword filter
        if (
          !quickFilter(
            item
          )
        ) {

          continue;
        }

        // quick ai
        const quick =

          await quickAnalyze(
            item
          );

        // low quality
        if (
          !quick.important
        ) {

          continue;
        }

        // low relevance
        if (
          quick.relevance < 6
        ) {

          continue;
        }

        // low impact
        if (
          quick.impact < 5
        ) {

          continue;
        }

        // signal unchanged
        if (
          !shouldSendSignal(
            currentTopic,
            quick
          )
        ) {

          continue;
        }

        let deep =
          null;

        // deep only important
        if (
          quick.relevance >=
            8 &&
          quick.impact >= 7
        ) {

          deep =
            await deepAnalyze(
              item
            );
        }

        // send
        await sendTelegram(
          item,
          quick,
          deep
        );

        // anti spam
        await new Promise(
          r =>
            setTimeout(
              r,
              4000
            )
        );
      }

    } catch (e) {

      console.log(
        "Loop Error:",
        e.message
      );

    }
  },

  600000
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
// KEEP ALIVE
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
// HEALTH
// =====================================

app.get("/health", (req, res) => {

  res.json({

    status: "ok",

    topic:
      currentTopic,

    newsEnabled,

    uptime:
      process.uptime()

  });

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
