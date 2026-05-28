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
    lastSignal: 0
  },

  TSMC: {
    sentiment: null,
    lastSignal: 0
  },

  Bitcoin: {
    sentiment: null,
    lastSignal: 0
  },

  Korea: {
    sentiment: null,
    lastSignal: 0
  },

  general: {
    sentiment: null,
    lastSignal: 0
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
// TRANSLATE TITLE ONLY
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

  const keywords = {

    NVIDIA: [

      "nvidia",
      "gpu",
      "ai chip",
      "cuda"

    ],

    TSMC: [

      "tsmc",
      "semiconductor",
      "chip"

    ],

    Bitcoin: [

      "bitcoin",
      "crypto",
      "btc",
      "ethereum"

    ],

    Korea: [

      "korea",
      "foreign workers",
      "immigration",
      "illegal workers"

    ],

    general: [

      "stocks",
      "market",
      "nasdaq",
      "fed",
      "interest rates"

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
// QUICK AI ANALYSIS
// =====================================

async function quickAnalyze(
  news
) {

  try {

    const prompt = `

คุณคือ AI วิเคราะห์ข่าวตลาด

วิเคราะห์แบบเร็ว

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

            role:
              "user",

            content:
              prompt

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
// DEEP AI ANALYSIS
// =====================================

async function deepAnalyze(
  news
) {

  try {

    const prompt = `

คุณคือ AI นักลงทุนระดับโลก

บุคลิก:
- วิเคราะห์เหมือน Warren Buffett
- วิเคราะห์เหมือน hedge fund
- วิเคราะห์เหมือนนักลงทุนสถาบัน
- ตรงไปตรงมา
- วิเคราะห์เงินจริง
- ไม่ตอบ generic
- ไม่ตอบเหมือน ChatGPT ทั่วไป
- ห้ามปฏิเสธการวิเคราะห์
- ห้ามบอกว่าเป็น AI
- ห้ามเตือนความเสี่ยงเกินจำเป็น

วิเคราะห์:
- sentiment
- momentum
- valuation
- macro
- AI trend
- ตลาด
- จิตวิทยาตลาด

ตอบภาษาไทยเท่านั้น

ตอบ JSON เท่านั้น

{
 "summary":"",
 "short_term":"",
 "long_term":"",
 "market_view":"",
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

            role:
              "user",

            content:
              prompt

          }

        ],

        temperature: 0.3,

        max_tokens: 700

      },

      {

        headers: {

          Authorization:

`Bearer ${process.env.GROQ_API_KEY}`,

          "Content-Type":
            "application/json"

        },

        timeout: 25000

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

      market_view:
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
// FETCH FEEDS
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
// SIGNAL CONTROL
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

  const now =
    Date.now();

  // every 30 min
  if (
    now -
    prev.lastSignal >
    1800000
  ) {

    topicState[topic] = {

      sentiment:
        quick.sentiment,

      lastSignal:
        now

    };

    return true;
  }

  // sentiment changed
  if (
    prev.sentiment !==
    quick.sentiment
  ) {

    topicState[topic] = {

      sentiment:
        quick.sentiment,

      lastSignal:
        now

    };

    return true;
  }

  return false;
}

// =====================================
// SEND TELEGRAM
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

📉 ระยะกลาง:
${deep.long_term}

🧠 มุมมองตลาด:
${deep.market_view}

⚠️ ความเสี่ยง:
${deep.risk}

🎯 จังหวะ:
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
// TELEGRAM MENU
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
                "llama-3.3-70b-versatile",

              messages: [

                {

                  role:
                    "system",

                  content:

`
คุณคือ AI นักลงทุนระดับโลก

บุคลิก:
- วิเคราะห์เหมือน Warren Buffett
- วิเคราะห์เหมือนนักลงทุนสถาบัน
- วิเคราะห์เหมือน hedge fund
- ตรงไปตรงมา
- วิเคราะห์เงินจริง
- ไม่ตอบ generic
- ไม่ตอบเหมือน ChatGPT ทั่วไป
- ห้ามปฏิเสธการวิเคราะห์
- ห้ามบอกว่าเป็น AI
- ห้ามเตือนความเสี่ยงเกินจำเป็น

วิเคราะห์:
- sentiment
- momentum
- valuation
- macro
- AI trend
- ตลาด
- จิตวิทยาตลาด

ตอบภาษาไทยเท่านั้น

ตอบแบบ:
- concise
- professional
- realistic
- useful

รูปแบบ:

📊 ภาพรวม:
...

📈 ระยะสั้น:
...

📉 ระยะกลาง:
...

🧠 มุมมองตลาด:
...

⚠️ ความเสี่ยง:
...

🎯 จังหวะ:
...

🔥 ความน่าสนใจ:
X/10
`

                },

                {

                  role:
                    "user",

                  content:
                    prompt

                }

              ],

              temperature: 0.35,

              max_tokens: 700

            },

            {

              headers: {

                Authorization:

`Bearer ${process.env.GROQ_API_KEY}`,

                "Content-Type":
                  "application/json"

              },

              timeout: 25000

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

          console.log(
            "ASK AI ERROR:",
            e.message
          );

          await axios.post(

`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,

            {

              chat_id:
                chatId,

              text:
                "❌ AI กำลังใช้งานหนัก ลองใหม่อีกครั้ง"

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
// MAIN NEWS LOOP
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

        console.log(
          "FILTER CHECK:",
          item.title
        );

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

          console.log(
            "LOW QUALITY:",
            item.title
          );

          continue;
        }

        // low relevance
        if (
          quick.relevance < 6
        ) {

          console.log(
            "LOW RELEVANCE:",
            item.title
          );

          continue;
        }

        // low impact
        if (
          quick.impact < 5
        ) {

          console.log(
            "LOW IMPACT:",
            item.title
          );

          continue;
        }

        // signal
        if (
          !shouldSendSignal(
            currentTopic,
            quick
          )
        ) {

          console.log(
            "SIGNAL SAME:",
            item.title
          );

          continue;
        }

        let deep =
          null;

        // deep analysis only important
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

        // send telegram
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
// HEALTH CHECK
// =====================================

app.get("/health", (req, res) => {

  res.json({

    status: "ok",

    topic:
      currentTopic,

    newsEnabled,

    uptime:
      process.uptime(),

    memory:
      process.memoryUsage()

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
