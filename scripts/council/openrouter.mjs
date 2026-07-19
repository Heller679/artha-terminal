// Minimal OpenRouter chat-completion helper. No SDK needed — plain fetch.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Big enough for a model to write out complete file contents without being
// cut off mid-reply (which was causing "Unexpected end of JSON input").
const MAX_TOKENS = 16000;

/**
 * Calls a model on OpenRouter and returns its text reply.
 * Retries a few times on network/timeout/5xx errors before giving up.
 */
export async function callModel(model, systemPrompt, userPrompt, opts = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable.");
  }

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: MAX_TOKENS,
  };

  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/",
          "X-Title": "AI Council",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // 5xx / 429 are transient — worth retrying; 4xx usually isn't.
        if ((res.status >= 500 || res.status === 429) && attempt < MAX_ATTEMPTS) {
          lastErr = new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
          await sleep(attempt * 2000);
          continue;
        }
        throw new Error(`OpenRouter error ${res.status} for model ${model}: ${text.slice(0, 500)}`);
      }

      // Read the body as text first, so a malformed/truncated body doesn't
      // throw an opaque error — we can retry instead.
      const rawBody = await res.text();
      let data;
      try {
        data = JSON.parse(rawBody);
      } catch {
        if (attempt < MAX_ATTEMPTS) {
          lastErr = new Error("Malformed response body from OpenRouter.");
          await sleep(attempt * 2000);
          continue;
        }
        throw new Error(`Malformed response body from OpenRouter for model ${model}.`);
      }

      const choice = data?.choices?.[0];
      const content = choice?.message?.content;

      // If the model was cut off (hit the token ceiling), retry once with a
      // reminder to be concise, rather than returning half-written JSON.
      if (choice?.finish_reason === "length" && attempt < MAX_ATTEMPTS) {
        lastErr = new Error("Reply was truncated (hit length limit).");
        await sleep(1000);
        continue;
      }

      if (!content) {
        if (attempt < MAX_ATTEMPTS) {
          lastErr = new Error("Empty content returned.");
          await sleep(attempt * 2000);
          continue;
        }
        throw new Error(`No content returned for model ${model}: ${JSON.stringify(data).slice(0, 500)}`);
      }
      return content;
    } catch (e) {
      lastErr = e;
      // network-level error (fetch threw) — retry
      if (attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 2000);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error("callModel failed.");
}

/**
 * Calls a model and parses its reply as JSON, with one repair attempt if the
 * first parse fails.
 */
export async function callModelJSON(model, systemPrompt, userPrompt) {
  const strictSystem = `${systemPrompt}\n\nRespond with ONLY valid JSON. No markdown fences, no commentary before or after.`;
  const raw = await callModel(model, strictSystem, userPrompt, { jsonMode: true });
  try {
    return JSON.parse(extractJson(raw));
  } catch {
    const repaired = await callModel(
      model,
      strictSystem,
      `Your previous reply could not be parsed as valid JSON (it may have been cut off or malformed). Reply again with ONLY complete, valid JSON, nothing else. If your previous reply was long, keep file contents complete but avoid unnecessary length. Here was your previous reply:\n\n${raw}`,
      { jsonMode: true }
    );
    return JSON.parse(extractJson(repaired));
  }
}

function extractJson(text) {
  const start = text.search(/[{[]/);
  if (start < 0) throw new Error("No JSON found in model output.");
  return text.slice(start);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
