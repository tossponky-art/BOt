
import { useEffect, useState } from "react";

export default function App() {
  const [news, setNews] = useState([]);

  async function load() {
    const res = await fetch("http://localhost:3000/api/news");
    const data = await res.json();
    setNews(data);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{
      background:"#020617",
      minHeight:"100vh",
      color:"#e2e8f0",
      padding:"20px",
      fontFamily:"monospace"
    }}>
      <h1 style={{color:"#00d9ff"}}>AI NEWS TELEGRAM BOT</h1>

      {news.map(item => (
        <div key={item.id}
          style={{
            border:"1px solid #1e293b",
            padding:"16px",
            marginBottom:"12px",
            borderRadius:"12px",
            background:"#0f172a"
          }}>
          <h3>{item.title}</h3>

          <p>{item.summary}</p>

          <div>
            {item.analysis.sentiment === "BULLISH" ? "🟢" :
             item.analysis.sentiment === "BEARISH" ? "🔴" : "🟡"}

            {" "}
            {item.analysis.sentiment}
          </div>

          <a href={item.url} target="_blank">
            OPEN SOURCE
          </a>
        </div>
      ))}
    </div>
  );
}
