# PM Interview Assistant

An AI-powered, Bring Your Own Key (BYOK) web application designed to help Product Managers prepare for interviews in real-time.

## Features
- **Free to Host:** 100% frontend (HTML/CSS/JS) application that can be hosted on GitHub Pages, Vercel, or Netlify for free.
- **BYOK (Bring Your Own Key):** Users enter their own Groq API key, securely stored locally in their browser.
- **Ultra-Fast AI Models:** Uses Groq's LPU inference engine with `llama-3.1-8b-instant` for instantaneous text generation.
- **High Accuracy Voice-to-Text:** Uses Groq's `whisper-large-v3` API via raw browser MediaRecorder for accurate transcription instead of relying on browser Web Speech APIs.
- **Customizable System Prompts:** Edit the system instructions to make the Copilot act exactly as you need.

## Setup & Deployment
1. Clone the repository.
2. Open `index.html` in your browser or deploy the folder to Vercel/Netlify.
3. Open Settings and enter your Groq API key (starts with `gsk_`).
4. (Optional) Edit the Custom System Prompt.

## Privacy & Security
The API key is stored securely in your browser's `localStorage` and is never sent anywhere except directly to Groq's official API endpoints.
