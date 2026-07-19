// ── AI Council orchestrator ──────────────────────────────────────────────
// Runs the daily loop: proposal → debate → vote → implement → review.
// Writes a full transcript to council-logs/, and (if a change was approved)
// writes the new file content to disk. The GitHub Actions workflow then
// commits that to a branch and opens a Pull Request.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import {
  COUNCIL,
  JUDGE_MODEL,
  PROJECT_CONTEXT,
  MAX_PROPOSAL_WORDS,
  PROTECTED_PATHS,
} from "./config.mjs";
import { callModel, callModelJSON } from "./openrouter.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const LOG_DIR = path.join(REPO_ROOT, "council-logs");
const ROADMAP_PATH = path.join(REPO_ROOT, "ROADMAP.md");

const today = new Date().toISOString().slice(0, 10);

async function main() {
  console.log(`\n=== AI Council run: ${today} ===\n`);

  const roadmap = await safeReadFile(ROADMAP_PATH, "(no ROADMAP.md yet)");
  const repoSnapshot = await buildRepoSnapshot();

  // ── 1. Proposal round ──────────────────────────────────────────────
  console.log("Round 1: proposals...");
  const proposals = await Promise.all(
    COUNCIL.map((member) => proposeChange(member, roadmap, repoSnapshot))
  );
  logRound("1-proposals", proposals);

  // ── 2. Debate round ────────────────────────────────────────────────
  console.log("Round 2: debate...");
  const debates = await Promise.all(
    COUNCIL.map((member) => debate(member, proposals))
  );
  logRound("2-debate", debates);

  // ── 3. Vote / judge ────────────────────────────────────────────────
  console.log("Round 3: judging...");
  const verdict = await judge(proposals, debates);
  logRound("3-verdict", [verdict]);

  if (!verdict.approve) {
    console.log(`Judge rejected all proposals: ${verdict.reason}`);
    await writeSummary({ proposals, debates, verdict, implementation: null, review: null });
    return;
  }

  const winner = proposals.find((p) => p.id === verdict.winnerId);
  if (!winner) {
    console.log("Judge picked an unknown proposal id, aborting.");
    return;
  }
  console.log(`Winner: ${winner.label} — "${winner.title}"`);

  // ── 4. Implementation ──────────────────────────────────────────────
  console.log("Round 4: implementation...");
  const implementation = await implement(winner, repoSnapshot);
  logRound("4-implementation", [implementation]);

  if (!implementation.files || implementation.files.length === 0) {
    console.log("Winning model returned no files, aborting.");
    return;
  }

  // ── 5. Independent review ──────────────────────────────────────────
  console.log("Round 5: review...");
  const reviewerMember =
    COUNCIL.find((m) => m.id !== winner.id) ?? COUNCIL[0];
  const review = await review_(reviewerMember, winner, implementation);
  logRound("5-review", [review]);

  await writeSummary({ proposals, debates, verdict, implementation, review });

  if (!review.approved) {
    console.log(`Reviewer rejected the change: ${review.reason}`);
    return;
  }

  // ── 6. Apply the change to disk (only if it passes safety checks) ──
  const safe = applySafetyChecks(implementation.files);
  if (!safe.ok) {
    console.log(`Safety check blocked the change: ${safe.reason}`);
    return;
  }

  for (const file of implementation.files) {
    const fullPath = path.join(REPO_ROOT, file.path);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content, "utf8");
    console.log(`Wrote ${file.path}`);
  }

  // Signal to the GitHub Actions workflow what happened, via a small
  // JSON file it reads to build the PR title/body.
  await writeFile(
    path.join(REPO_ROOT, ".council-result.json"),
    JSON.stringify(
      {
        date: today,
        author: winner.label,
        title: winner.title,
        rationale: winner.rationale,
        reviewer: reviewerMember.label,
        files: implementation.files.map((f) => f.path),
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("\nDone. Change written to disk, ready to commit.\n");
}

// ── Round implementations ────────────────────────────────────────────────

async function proposeChange(member, roadmap, repoSnapshot) {
  const system = `You are ${member.label}, one voice on a council of AI models that improves a live website together. You must be concrete and modest in scope — propose ONE small improvement that could be built and reviewed in a single day. Never propose anything that touches the build config, dependencies, or fabricates data.`;
  const user = `Project context:\n${PROJECT_CONTEXT}\n\nCurrent roadmap notes:\n${roadmap}\n\nRepo structure (partial):\n${repoSnapshot}\n\nPropose ONE improvement. Reply as JSON: {"title": string, "rationale": string (max ${MAX_PROPOSAL_WORDS} words), "targetFiles": string[]}`;

  const result = await callModelJSON(member.model, system, user);
  return { id: member.id, label: member.label, ...result };
}

async function debate(member, proposals) {
  const others = proposals
    .map((p) => `[${p.id}] ${p.label}: "${p.title}" — ${p.rationale}`)
    .join("\n");
  const system = `You are ${member.label}, participating in a council debate before any change is made to a shared website. Be honest and specific. It is good and expected to disagree with proposals, including your own, if you find a flaw.`;
  const user = `Here are today's proposals from every council member:\n${others}\n\nFor EACH proposal, say whether it should be added and why, in one or two sentences. Reply as JSON: {"critiques": [{"id": string, "verdict": "add"|"reject", "reason": string}]}`;

  const result = await callModelJSON(member.model, system, user);
  return { id: member.id, label: member.label, ...result };
}

async function judge(proposals, debates) {
  const system = `You are the neutral judge for an AI council that improves a website. You did not submit a proposal. Pick the single best proposal based on the debate, favoring small, safe, high-value changes. You may reject all proposals if none are good enough.`;
  const proposalsText = proposals
    .map((p) => `[${p.id}] "${p.title}" — ${p.rationale}`)
    .join("\n");
  const debateText = debates
    .map(
      (d) =>
        `${d.label} says:\n` +
        d.critiques.map((c) => `  on [${c.id}]: ${c.verdict} — ${c.reason}`).join("\n")
    )
    .join("\n\n");

  const user = `Proposals:\n${proposalsText}\n\nDebate:\n${debateText}\n\nReply as JSON: {"approve": boolean, "winnerId": string|null, "reason": string}`;
  return callModelJSON(JUDGE_MODEL, system, user);
}

async function implement(winner, repoSnapshot) {
  const member = COUNCIL.find((m) => m.id === winner.id);
  const system = `You are ${winner.label}, implementing YOUR OWN winning proposal for a React + TypeScript + Vite project. Write complete, working file contents — not diffs, not snippets. Keep the change small and scoped to what you proposed. Never touch package.json, vite.config.ts, or anything under .github/ or scripts/council/.`;
  const user = `Your proposal: "${winner.title}" — ${winner.rationale}\nTarget files you suggested: ${JSON.stringify(winner.targetFiles)}\n\nRepo structure (partial):\n${repoSnapshot}\n\nReply as JSON: {"files": [{"path": string, "content": string}], "commitMessage": string}`;

  return callModelJSON(member.model, system, user);
}

async function review_(reviewer, winner, implementation) {
  const system = `You are ${reviewer.label}, independently reviewing a code change proposed and written by another AI (${winner.label}) before it is merged into a live website. Check for bugs, broken imports, security issues, or scope creep. Be skeptical.`;
  const filesText = implementation.files
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");
  const user = `Proposed change: "${winner.title}" — ${winner.rationale}\n\nFiles:\n${filesText}\n\nReply as JSON: {"approved": boolean, "reason": string}`;

  return callModelJSON(reviewer.model, system, user);
}

// ── Safety & utility ─────────────────────────────────────────────────────

function applySafetyChecks(files) {
  if (files.length > 2) {
    return { ok: false, reason: `Too many files changed (${files.length}).` };
  }
  for (const file of files) {
    const normalized = file.path.replace(/^\.?\//, "");
    if (normalized.includes("..")) {
      return { ok: false, reason: `Path traversal attempt: ${file.path}` };
    }
    if (PROTECTED_PATHS.some((p) => normalized.startsWith(p))) {
      return { ok: false, reason: `Protected path touched: ${file.path}` };
    }
    if (!normalized.startsWith("src/")) {
      return { ok: false, reason: `Change outside src/: ${file.path}` };
    }
  }
  return { ok: true };
}

async function buildRepoSnapshot() {
  const sectionsDir = path.join(REPO_ROOT, "src", "sections");
  const libDir = path.join(REPO_ROOT, "src", "lib");
  const [sections, lib] = await Promise.all([
    safeReaddir(sectionsDir),
    safeReaddir(libDir),
  ]);
  return [
    `src/sections/: ${sections.join(", ")}`,
    `src/lib/: ${lib.join(", ")}`,
  ].join("\n");
}

async function safeReaddir(dir) {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function safeReadFile(file, fallback) {
  try {
    return await readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function logRound(name, data) {
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(
    path.join(LOG_DIR, `${today}-${name}.json`),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

async function writeSummary({ proposals, debates, verdict, implementation, review }) {
  const lines = [];
  lines.push(`# AI Council — ${today}\n`);
  lines.push(`## Proposals\n`);
  for (const p of proposals) {
    lines.push(`**${p.label}**: ${p.title}\n> ${p.rationale}\n`);
  }
  lines.push(`## Debate\n`);
  for (const d of debates) {
    lines.push(`**${d.label}**`);
    for (const c of d.critiques) {
      lines.push(`- on [${c.id}]: **${c.verdict}** — ${c.reason}`);
    }
    lines.push("");
  }
  lines.push(`## Verdict\n`);
  lines.push(
    verdict.approve
      ? `✅ Approved: **${verdict.winnerId}** — ${verdict.reason}`
      : `❌ Rejected all proposals — ${verdict.reason}`
  );
  if (implementation) {
    lines.push(`\n## Implementation\n`);
    lines.push(`Files: ${implementation.files.map((f) => f.path).join(", ")}`);
    lines.push(`Commit message: ${implementation.commitMessage}`);
  }
  if (review) {
    lines.push(`\n## Review\n`);
    lines.push(
      review.approved
        ? `✅ Approved by reviewer — ${review.reason}`
        : `❌ Rejected by reviewer — ${review.reason}`
    );
  }
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(path.join(LOG_DIR, `${today}-summary.md`), lines.join("\n"), "utf8");
}

main().catch((err) => {
  console.error("Council run failed:", err);
  process.exit(1);
});
