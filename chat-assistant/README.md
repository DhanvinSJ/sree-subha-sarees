# AI chat assistant

An "Ask us" chat bubble for the website that answers customer questions about
services, prices, the saree collection and how to book. It only uses the shop
information written in `worker.js`, and sends people to call or WhatsApp
346-829-6459 for anything it does not know.

## What it costs

Nothing. It runs on Cloudflare's free plan:

- **Cloudflare Workers** (free): a small server that keeps the AI private.
- **Cloudflare Workers AI** (free, 10,000 "neurons" a day): the AI model,
  Llama 3.3 70B. That is roughly 100 to 150 questions a day. If the daily
  allowance runs out, the bubble says "please call or WhatsApp" until the next
  day. The free plan never charges you and no credit card is needed.

There is no API key to copy anywhere.

## Set it up and test it (about 10 minutes)

1. Create a free account at <https://dash.cloudflare.com/sign-up>.
2. In the dashboard, open **Workers & Pages**, click **Create**, choose
   **Start with Hello World**, name it `sree-subha-chat`, and click **Deploy**.
3. Click **Edit code**, delete everything in the editor, paste in the whole of
   `chat-assistant/worker.js`, and click **Deploy**.
4. Go back to the worker, open **Settings → Bindings → Add → Workers AI**,
   set the variable name to `AI`, and save.
5. Open your worker's address, which looks like
   `https://sree-subha-chat.YOUR-NAME.workers.dev`. You will see the website
   with an **Ask us** bubble at the bottom left. Ask it some questions.

Nothing on sreesubhasarees.com changes until the last step below.

## Turn it on for the website

This line at the bottom of `index.html` loads the chat bubble from the worker:

```html
<script src="https://sree-subha-chat.dhanvins-jayaharan.workers.dev/widget.js" defer></script>
```

## Changing what it knows

Edit the `SHOP_INFO` section near the top of `worker.js` (for example to add
opening hours or new prices), then paste the file into the Cloudflare editor
again and click **Deploy**. The website does not need to change.

## Turning it off

Delete the script line in `index.html`, or delete the worker in Cloudflare.
