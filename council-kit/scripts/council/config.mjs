// ── AI Council configuration ─────────────────────────────────────────────
// All models are called through OpenRouter (https://openrouter.ai), so you
// only need ONE API key (OPENROUTER_API_KEY) to reach all of them.
//
// IMPORTANT: model slugs change as providers release new versions. If a run
// fails with a "model not found" error, go to https://openrouter.ai/models,
// find the model's current slug, and update it below.

export const COUNCIL = [
  {
    id: "gpt",
    label: "GPT-5.6",
    model: "openai/gpt-5.6-sol",
  },
  {
    id: "claude",
    label: "Claude Sonnet 5",
    model: "anthropic/claude-sonnet-4.6",
  },
  {
    id: "grok",
    label: "Grok 4.5",
    model: "x-ai/grok-4.5",
  },
  {
    id: "kimi",
    label: "Kimi K3",
    model: "moonshotai/kimi-k3",
  },
];

// The judge picks the winning proposal after the debate round.
// Rotate this daily if you want — for now it's fixed to avoid a model
// ever judging its own proposal unfairly on day 1.
export const JUDGE_MODEL = "anthropic/claude-sonnet-4.6";

// Safety / scope limits — keep the daily change small and reviewable.
export const MAX_PROPOSAL_WORDS = 120;
export const MAX_FILES_PER_CHANGE = 2;

// Files/folders the council is NOT allowed to touch, ever.
export const PROTECTED_PATHS = [
  ".github/",
  "scripts/council/",
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  ".gitignore",
];

// A short description of the project, given to every model as context.
export const PROJECT_CONTEXT = `
Artha Terminal is a React + TypeScript + Vite web app: an India market
intelligence dashboard. It shows live news, FII/DII flows, a stock
screener, watchlists, alerts, a calendar, and a speculation module called
"Chanakya Watch". Data is fetched client-side through public CORS proxies —
there are no backend API keys. The app must never fabricate market data;
all figures must come from real fetched sources.
`.trim();
