# URL Mask – Google-like Search Proxy

A production-ready Node.js/Express app that proxies Google search results through SerpApi and renders them under your own branded domain — keeping your short URL in the browser bar at all times.

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure your API key
Copy the example env file and add your SerpApi key:
```bash
copy .env.example .env
```
Then open `.env` and replace `your_secret_key_here` with your real key from [serpapi.com/manage-api-key](https://serpapi.com/manage-api-key).

### 3. Run the server
```bash
npm start
```
Visit **http://localhost:3000** in your browser.

---

## Project Structure

```
URL Mask/
├── views/
│   ├── index.ejs        Homepage (branded search box)
│   └── search.ejs       Results page (SERP feed)
├── public/
│   └── style.css        Google-inspired responsive UI
├── server.js            Express app + SerpApi proxy logic
├── package.json
├── .env                 Your secrets (never commit this!)
└── .env.example         Template — safe to commit
```

---

## Customization

| What                     | Where                              |
|--------------------------|------------------------------------|
| Brand name               | `views/index.ejs` and `views/search.ejs` — replace `SearchEngine` |
| Country / language       | `server.js` → `gl` and `hl` params |
| Port                     | `.env` → `PORT=3000`               |
| Styling                  | `public/style.css`                 |

---

## Environment Variables

| Variable      | Description                        | Required |
|---------------|------------------------------------|----------|
| `SERPAPI_KEY` | Your SerpApi secret key            | ✅ Yes   |
| `PORT`        | Port the server listens on (default `3000`) | No |

> **Never commit `.env` to version control.** Add it to `.gitignore`.

