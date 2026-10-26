// Sree Subha Sarees – AI chat assistant (Cloudflare Worker)
//
// This one file does everything:
//   GET  /           -> a test page: the live website with the chat bubble on top
//   GET  /widget.js  -> the chat bubble script that the website loads
//   POST /chat       -> answers a customer question using Cloudflare Workers AI
//
// It runs on Cloudflare's free plan. The AI model is Workers AI, which is
// included free (10,000 "neurons" a day). If that daily allowance runs out,
// the free plan simply stops answering until the next day and the bubble
// tells customers to call or WhatsApp instead. There are no charges.
//
// To change what the assistant knows, edit SHOP_INFO below and redeploy.

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Websites allowed to use this assistant.
const ALLOWED_ORIGINS = [
  "https://sreesubhasarees.com",
  "https://www.sreesubhasarees.com",
  "https://dhanvinsj.github.io",
];

const SHOP_INFO = `
BUSINESS
- Name: Sree Subha Sarees. Run by Subhadra (customers also call her Subha).
- Location: 225 Fluor Daniel Dr, Sugar Land, TX.
- Areas served: Sugar Land, Stafford, Missouri City, Pearland, Houston, Katy, Cypress, Fulshear.
- On-site visits are available (home, venue or hotel) for draping.
- Phone: 346-829-6459 (call or WhatsApp). WhatsApp link: https://wa.me/13468296459
- Email: subhadra.jayaharan@gmail.com
- Instagram: @sreesubhasarees
- Rated 5.0 on Google from 32 reviews.
- Opening hours are not published. For availability and appointments, customers should call or WhatsApp 346-829-6459.

SERVICES
- Saree draping: from $40, about 1 hour. For weddings, poojas, festivals, parties and special occasions. Styles from traditional South Indian to modern minimalist drapes; Bengali style and 9 yard (Madisar) draping have been done for clients.
- Pre-pleated saree: from $35, 1 day service. Saree is ironed, pleated and ready to wear, so draping on the day takes about 5 minutes. Good for travel too.
- Saree pico (edging on the border to stop fraying): $15, quick turnaround.
- Saree falls (lining stitched along the bottom edge for a better drape): $25, in matching or complementary colours.
- Cloth alteration is also offered (ask for price).

SALES COLLECTION
- Lightweight designer sarees (georgette, chiffon, soft silk blends): from $40.
- Fancy sarees (many designs, all occasions): from $40.
- Budget sarees (everyday and casual wear): from $25.
- Pure cotton sarees: available now (ask for price).
- Silk-cotton sarees with zari borders, ikat patterns, tasselled pallus: available now (ask for price).
- Art silk sarees, good for weddings, receptions and gifting: available now (ask for price).
- 9 yard cotton sarees for Madisar and traditional drapes: available now (ask for price).
- Kurtis in many colours, designs and sizes: available now (ask for price).
- Readymade saree blouses in a range of sizes and colours: available now (ask for price).
- Women's 100% cotton printed T-shirts, sizes M, L, XL, XXL: from $10.
- Dhotis for men, white and cream with gold zari or coloured borders: available now (ask for price).

HOW TO BOOK
- Call or WhatsApp 346-829-6459, or use the "Send a Message" form on the website, which opens WhatsApp.
`;

const SYSTEM_PROMPT = `You are the friendly assistant on the Sree Subha Sarees website.
Answer customer questions using ONLY the shop information below.

Rules:
- Keep answers short: 1 to 4 sentences, plain text, no markdown.
- Never make up prices, hours, availability, discounts or policies. If something is not in the information, say you are not sure and suggest calling or WhatsApping Subhadra at 346-829-6459.
- When someone wants to book or check a date, point them to call or WhatsApp 346-829-6459.
- Prices marked "from" are starting prices; the final price depends on the saree and the work.
- Reply in the same language the customer writes in.
- Only help with questions about the shop, its sarees and services, and saree care or draping. Politely decline anything else.

SHOP INFORMATION:
${SHOP_INFO}`;

const MAX_MESSAGE_CHARS = 500;
const MAX_HISTORY = 8;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, url) });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(testPage(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (request.method === "GET" && url.pathname === "/widget.js") {
      return new Response("(" + chatWidget.toString() + ")();", {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    if (request.method === "POST" && url.pathname === "/chat") {
      const headers = { "Content-Type": "application/json", ...corsHeaders(origin, url) };
      if (origin && !isAllowedOrigin(origin, url)) {
        return Response.json({ error: "Not allowed" }, { status: 403, headers });
      }
      return handleChat(request, env, headers);
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleChat(request, env, headers) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400, headers });
  }

  const history = Array.isArray(body.messages) ? body.messages.slice(-MAX_HISTORY) : [];
  const messages = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "Bad request" }, { status: 400, headers });
  }

  try {
    const result = await env.AI.run(MODEL, {
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 300,
      temperature: 0.3,
    });
    const reply = (result && result.response ? String(result.response) : "").trim();
    if (!reply) throw new Error("Empty reply");
    return Response.json({ reply }, { headers });
  } catch (err) {
    console.error("AI error", err);
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}

function isAllowedOrigin(origin, url) {
  return (
    origin === url.origin ||
    ALLOWED_ORIGINS.includes(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
}

function corsHeaders(origin, url) {
  if (!origin || !isAllowedOrigin(origin, url)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function testPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Chat assistant test – Sree Subha Sarees</title>
<meta name="robots" content="noindex" />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond&family=Jost:wght@400;500&display=swap" rel="stylesheet" />
<style>
  html, body { margin: 0; height: 100%; }
  iframe { border: 0; width: 100%; height: 100%; display: block; }
  .test-banner { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483000; background: #4a1528; color: #f5e9c8; font: 14px/1.4 sans-serif; text-align: center; padding: 6px 10px; }
</style>
</head>
<body>
<div class="test-banner">Chat assistant test page. Try the &quot;Ask us&quot; bubble at the bottom left.</div>
<iframe src="https://sreesubhasarees.com/" title="Sree Subha Sarees website"></iframe>
<script src="/widget.js" defer></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// The chat bubble. This function is sent to the browser as /widget.js, so it
// must not use anything from outside its own body.
// ---------------------------------------------------------------------------
function chatWidget() {
  if (window.__ssChatLoaded) return;
  window.__ssChatLoaded = true;

  var script = document.currentScript;
  var endpoint = new URL("/chat", script ? script.src : location.href).href;
  var PHONE = "346-829-6459";
  var history = [];
  var busy = false;

  var css = `
  .ssc-launch { position: fixed; left: 2rem; bottom: 2rem; z-index: 2147483001; display: flex; align-items: center; gap: .5rem;
    background: #4a1528; color: #f5e9c8; border: 1px solid #c9a84c; padding: .8rem 1.1rem; cursor: pointer;
    font: 500 .85rem 'Jost', sans-serif; letter-spacing: .05em; box-shadow: 0 4px 20px rgba(74,21,40,.35);
    clip-path: polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px)); transition: transform .2s; }
  .ssc-launch:hover { transform: scale(1.05); }
  .ssc-panel { position: fixed; left: 2rem; bottom: 5.5rem; z-index: 2147483001; width: 360px; max-width: calc(100vw - 2rem);
    height: 500px; max-height: calc(100vh - 8rem); display: none; flex-direction: column; background: #fdf6ee;
    border: 1px solid rgba(201,168,76,.5); box-shadow: 0 10px 40px rgba(45,26,16,.3); font-family: 'Jost', sans-serif; color: #2d1a10; }
  .ssc-panel.open { display: flex; }
  .ssc-head { background: #4a1528; color: #f5e9c8; padding: .8rem 1rem; display: flex; align-items: center; justify-content: space-between; }
  .ssc-title { font-family: 'Cormorant Garamond', serif; font-size: 1.25rem; }
  .ssc-sub { font-size: .7rem; color: #e8c97a; letter-spacing: .05em; }
  .ssc-close { background: none; border: 0; color: #f5e9c8; font-size: 1.4rem; cursor: pointer; line-height: 1; }
  .ssc-body { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: .6rem; }
  .ssc-msg { max-width: 85%; padding: .6rem .8rem; font-size: .9rem; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; }
  .ssc-bot { align-self: flex-start; background: #fff; border: 1px solid rgba(201,168,76,.3); }
  .ssc-user { align-self: flex-end; background: #4a1528; color: #f5e9c8; }
  .ssc-typing { color: #7a5c48; font-style: italic; }
  .ssc-chips { display: flex; flex-wrap: wrap; gap: .4rem; }
  .ssc-chip { background: none; border: 1px solid #c9a84c; color: #4a1528; padding: .3rem .6rem; font: .78rem 'Jost', sans-serif; cursor: pointer; }
  .ssc-chip:hover { background: #f5e9c8; }
  .ssc-form { display: flex; border-top: 1px solid rgba(201,168,76,.3); }
  .ssc-input { flex: 1; border: 0; padding: .8rem; font: .9rem 'Jost', sans-serif; background: #fff; color: #2d1a10; outline: none; min-width: 0; }
  .ssc-send { border: 0; background: #c9a84c; color: #4a1528; padding: 0 1rem; font: 500 .85rem 'Jost', sans-serif; cursor: pointer; }
  .ssc-send:disabled { opacity: .5; cursor: default; }
  .ssc-foot { font-size: .68rem; color: #7a5c48; text-align: center; padding: .35rem .5rem .5rem; background: #fff; }
  .ssc-foot a { color: #4a1528; }
  @media (max-width: 900px) {
    .ssc-launch { left: 1rem; bottom: 1rem; }
    .ssc-panel { left: 1rem; bottom: 4.5rem; }
  }`;

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  var launch = el("button", "ssc-launch", "💬 Ask us");
  launch.setAttribute("aria-label", "Open chat assistant");

  var panel = el("div", "ssc-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat with Sree Subha Sarees");

  var head = el("div", "ssc-head");
  var titles = el("div");
  titles.appendChild(el("div", "ssc-title", "Sree Subha Sarees"));
  titles.appendChild(el("div", "ssc-sub", "AI assistant · usually instant"));
  var close = el("button", "ssc-close", "×");
  close.setAttribute("aria-label", "Close chat");
  head.appendChild(titles);
  head.appendChild(close);

  var body = el("div", "ssc-body");
  var form = el("form", "ssc-form");
  var input = el("input", "ssc-input");
  input.type = "text";
  input.placeholder = "Ask about prices, services, sarees...";
  input.maxLength = 500;
  var send = el("button", "ssc-send", "Send");
  send.type = "submit";
  form.appendChild(input);
  form.appendChild(send);

  var foot = el("div", "ssc-foot");
  foot.innerHTML =
    'AI answers can be wrong. To book, call <a href="tel:13468296459">' + PHONE +
    '</a> or <a href="https://wa.me/13468296459" target="_blank" rel="noopener">WhatsApp</a>.';

  panel.appendChild(head);
  panel.appendChild(body);
  panel.appendChild(form);
  panel.appendChild(foot);
  document.body.appendChild(panel);
  document.body.appendChild(launch);

  addBot("Hi! 🙏 I can answer questions about our saree draping, pre-pleating, falls, pico and the sarees we sell. What would you like to know?");
  var chips = el("div", "ssc-chips");
  ["How much is saree draping?", "Do you do pre-pleating?", "Can you come to my home?", "What sarees do you sell?"].forEach(function (q) {
    var c = el("button", "ssc-chip", q);
    c.type = "button";
    c.addEventListener("click", function () { ask(q); });
    chips.appendChild(c);
  });
  body.appendChild(chips);

  launch.addEventListener("click", function () {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) input.focus();
  });
  close.addEventListener("click", function () { panel.classList.remove("open"); });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    ask(input.value);
  });

  function ask(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    if (chips.parentNode) chips.parentNode.removeChild(chips);
    input.value = "";
    addMsg(text, "ssc-user");
    history.push({ role: "user", content: text });
    busy = true;
    send.disabled = true;
    var typing = addMsg("Typing…", "ssc-bot ssc-typing");

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-8) }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.reply) throw new Error("failed");
        typing.remove();
        addBot(res.d.reply);
        history.push({ role: "assistant", content: res.d.reply });
      })
      .catch(function () {
        typing.remove();
        history.pop();
        addBot("Sorry, I can't answer right now. Please call or WhatsApp Subhadra at " + PHONE + ".");
      })
      .then(function () {
        busy = false;
        send.disabled = false;
        input.focus();
      });
  }

  function addBot(text) { return addMsg(text, "ssc-bot"); }

  function addMsg(text, cls) {
    var m = el("div", "ssc-msg " + cls, text);
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
    return m;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
}
