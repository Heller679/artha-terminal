// Minimal OpenRouter chat-completion helper. No SDK needed — plain fetch.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Calls a model on OpenRouter and returns its text reply.
 * @param {string} model - OpenRouter model slug, e.g. "anthropic/claude-sonnet-4.6"
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {{ jsonMode?: boolean }} [opts]
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
  };

  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // These two headers are optional but OpenRouter recommends them.
      "HTTP-Referer": "https://github.com/",
      "X-Title": "AI Council",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status} for model ${model}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`No content returned for model ${model}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return content;
}

/**
 * Calls a model and parses its reply as JSON, with one retry that asks it
 * to fix its own output if the first parse fails.
 */
export async function callModelJSON(model, systemPrompt, userPrompt) {
  const strictSystem = `${systemPrompt}\n\nRespond with ONLY valid JSON. No markdown fences, no commentary before or after.`;
  const raw = await callModel(model, strictSystem, userPrompt, { jsonMode: true });
  try {
    return JSON.parse(extractJson(raw));
  } catch (e) {
    // one repair attempt
    const repaired = await callModel(
      model,
      strictSystem,
      `Your previous reply could not be parsed as JSON. Reply again with ONLY valid JSON, nothing else. Here was your previous reply:\n\n${raw}`,
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
