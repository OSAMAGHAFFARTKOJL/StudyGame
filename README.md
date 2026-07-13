# StudyRealm

StudyRealm turns an academic PDF into a game-like learning quest with story chapters, narrated lessons, bubble MCQs, XP, coins, ranks, badges, and a progress map.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy On Vercel

1. Push this folder to GitHub.
2. Import the repository in Vercel.
3. Add environment variables:

```bash
FIREWORKS_API_KEY=your_fireworks_key_here
FIREWORKS_MODEL=accounts/fireworks/models/gpt-oss-120b
```

The app has a built-in fallback generator, so it still demos without API keys. With `FIREWORKS_API_KEY`, `/api/study` uses the Fireworks OpenAI-compatible endpoint to generate stronger chapters and MCQs.

For real exam-style MCQs, `FIREWORKS_API_KEY` is required. Without it, the app shows a visible fallback warning and uses only a basic local generator.

## Notes

- PDF text extraction runs in the browser through PDF.js from CDN.
- Pollinations image URLs create game-like chapter backgrounds.
- Keep API keys in Vercel environment variables. Do not hardcode secrets in source files.
