// ── AI Council orchestrator ──────────────────────────────────────────────
// Runs the daily loop: proposal → debate → vote → implement → review.
// Writes a full transcript to council-logs/, and (if a change was approved)
// writes the new file content to disk. The GitHub Actions workflow then
// commits that to a branch and opens a Pull Request.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execAsync = promisify(exec);
import {
  COUNCIL,
  JUDGE_MODEL,
  PROJECT_CONTEXT,
  MAX_PROPOSAL_WORDS,
  MAX_FILES_PER_CHANGE,
  PROTECTED_PATHS,
  ALLOWED_OUTSIDE_SRC,
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
  let implementation = await implement(winner, repoSnapshot);
  logRound("4-implementation", [implementation]);

  if (!implementation.files || implementation.files.length === 0) {
    console.log("Winning model returned no files, aborting.");
    return;
  }

  // ── 5. Independent review (AI reads the code) ──────────────────────
  console.log("Round 5: review...");
  const reviewerMember =
    COUNCIL.find((m) => m.id !== winner.id) ?? COUNCIL[0];
  let review = await review_(reviewerMember, winner, implementation);
  logRound("5-review", [review]);

  // If the reviewer flags something, let the author fix it once before
  // we even try to build.
  let revision = null;
  if (!review.approved) {
    console.log(`Reviewer found an issue: ${review.reason}`);
    console.log("Round 5b: author revising to address the feedback...");
    revision = await revise(winner, implementation, review);
    if (revision.files && revision.files.length > 0) {
      implementation = revision;
      console.log("Round 5c: re-reviewing the revised change...");
      review = await review_(reviewerMember, winner, implementation);
      logRound("5c-rereview", [review]);
    }
  }

  if (!review.approved) {
    console.log(`Reviewer still rejects the change after one revision: ${review.reason}`);
    await writeSummary({ proposals, debates, verdict, implementation, review, revision, buildResult: null });
    return;
  }

  // ── 6. Safety checks before we ever write to disk ──────────────────
  let safe = applySafetyChecks(implementation.files);
  if (!safe.ok) {
    console.log(`Safety check blocked the change: ${safe.reason}`);
    await writeSummary({ proposals, debates, verdict, implementation, review, revision, buildResult: null });
    return;
  }

  // ── 7. Build-verify loop — actually try to build the site. If it
  // fails, feed the real error messages back to the author to fix.
  // Repeat up to MAX_BUILD_ATTEMPTS times. ──────────────────────────
  const MAX_BUILD_ATTEMPTS = 3;
  let buildResult = null;
  let buildPassed = false;

  for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt++) {
    console.log(`Round 6.${attempt}: writing files and running real build...`);
    const backups = await writeFilesWithBackup(implementation.files);
    buildResult = await runBuild();

    if (buildResult.ok) {
      console.log(`Build passed on attempt ${attempt}.`);
      buildPassed = true;
      break;
    }

    console.log(`Build failed on attempt ${attempt}. Restoring files and asking author to fix.`);
    await restoreBackups(backups); // put the repo back before trying again

    if (attempt < MAX_BUILD_ATTEMPTS) {
      const fixed = await fixBuildError(winner, implementation, buildResult.errors);
      if (!fixed.files || fixed.files.length === 0) {
        console.log("Author returned no fix, giving up.");
        break;
      }
      const fixedSafe = applySafetyChecks(fixed.files);
      if (!fixedSafe.ok) {
        console.log(`Fixed version failed safety check: ${fixedSafe.reason}`);
        break;
      }
      implementation = fixed;
    }
  }

  await writeSummary({ proposals, debates, verdict, implementation, review, revision, buildResult });

  if (!buildPassed) {
    console.log("Change could not be made to build after several attempts. Nothing will be committed.");
    return;
  }

  // Files are already written to disk (from the successful build attempt).
  for (const file of implementation.files) {
    console.log(`Kept ${file.path}`);
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

  // Read the existing code the model needs to see: the files it plans to
  // edit, plus the key files new sections must integrate with (nav, App).
  const integration = await keyIntegrationFiles();
  const toRead = [...(winner.targetFiles ?? []), ...integration];
  const existingCode = await readSourceFiles(toRead);

  const system = `You are ${winner.label}, implementing YOUR OWN winning proposal for a React + TypeScript + Vite project. You are shown the ACTUAL current contents of the relevant files. Base your change on this real code — do not invent function names, imports, props, or tabs that aren't there. When adding a new tab/section, PRESERVE every existing tab and section; add to them, never replace or remove them. Write complete, working file contents — not diffs. Never touch package.json, vite.config.ts, or anything under .github/ or scripts/council/.`;
  const user = `Your proposal: "${winner.title}" — ${winner.rationale}\nTarget files you suggested: ${JSON.stringify(winner.targetFiles)}\n\nRepo structure (partial):\n${repoSnapshot}\n\nActual current contents of the relevant files:\n${existingCode}\n\nReply as JSON: {"files": [{"path": string, "content": string}], "commitMessage": string}`;

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

async function revise(winner, implementation, review) {
  const member = COUNCIL.find((m) => m.id === winner.id);
  const system = `You are ${winner.label}. A reviewer found a problem with the code you wrote. Fix ONLY the problem they raised — do not add new features or change the scope. Return complete, corrected file contents, not diffs. Never touch package.json, vite.config.ts, or anything under .github/ or scripts/council/.`;
  const filesText = implementation.files
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");
  const user = `Your change: "${winner.title}" — ${winner.rationale}\n\nYour current code:\n${filesText}\n\nThe reviewer rejected it for this reason:\n"${review.reason}"\n\nFix it. Reply as JSON: {"files": [{"path": string, "content": string}], "commitMessage": string}`;

  return callModelJSON(member.model, system, user);
}

async function fixBuildError(winner, implementation, errors) {
  const member = COUNCIL.find((m) => m.id === winner.id);
  const system = `You are ${winner.label}. Your code change was written to a real React + TypeScript + Vite project and the build FAILED. Fix the code so the build passes. The errors are real compiler/build output — read them carefully. Common causes: importing a function or member that does not exist, wrong prop types, missing imports, typos. Return complete corrected file contents. Only touch files under src/. Never touch package.json, vite.config.ts, .github/, or scripts/council/.`;
  const filesText = implementation.files
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");
  const user = `Your change: "${winner.title}"\n\nYour current code:\n${filesText}\n\nThe build failed with these errors:\n${errors}\n\nFix the code so it builds. Reply as JSON: {"files": [{"path": string, "content": string}], "commitMessage": string}`;

  return callModelJSON(member.model, system, user);
}

// ── Build running & file backup ──────────────────────────────────────────

// Writes each proposed file, saving the previous content (or marking it as
// newly created) so we can restore the repo if the build fails.
async function writeFilesWithBackup(files) {
  const backups = [];
  for (const file of files) {
    const fullPath = path.join(REPO_ROOT, file.path);
    let previous = null;
    let existed = true;
    try {
      previous = await readFile(fullPath, "utf8");
    } catch {
      existed = false;
    }
    backups.push({ fullPath, previous, existed });
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content, "utf8");
  }
  return backups;
}

async function restoreBackups(backups) {
  const { unlink } = await import("node:fs/promises");
  for (const b of backups) {
    if (b.existed) {
      await writeFile(b.fullPath, b.previous, "utf8");
    } else {
      try {
        await unlink(b.fullPath);
      } catch {
        /* nothing to remove */
      }
    }
  }
}

// Runs the real production build. Returns {ok, errors}.
async function runBuild() {
  try {
    await execAsync("npm run build", {
      cwd: REPO_ROOT,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 5 * 60 * 1000, // 5 minute cap
    });
    return { ok: true, errors: "" };
  } catch (e) {
    // stdout+stderr contain the TypeScript / Vite error messages we want
    // to feed back to the model.
    const out = `${e.stdout ?? ""}\n${e.stderr ?? ""}`.trim();
    // keep only the last chunk so we don't overwhelm the model's context
    const trimmed = out.length > 6000 ? out.slice(-6000) : out;
    return { ok: false, errors: trimmed || String(e).slice(0, 2000) };
  }
}

// ── Safety & utility ─────────────────────────────────────────────────────

function applySafetyChecks(files) {
  if (files.length > MAX_FILES_PER_CHANGE) {
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
    if (!normalized.startsWith("src/") && !ALLOWED_OUTSIDE_SRC.includes(normalized)) {
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

// Reads the actual contents of a set of source files so the implementing
// model can SEE the existing code instead of guessing. Only reads files
// under src/ (or the allowed tsconfig files), skips anything missing, and
// caps total size so we never blow past the model's context window.
async function readSourceFiles(relPaths) {
  const MAX_TOTAL = 60_000; // characters across all files
  const MAX_PER_FILE = 20_000;
  const seen = new Set();
  const chunks = [];
  let total = 0;

  for (const rel of relPaths) {
    const normalized = rel.replace(/^\.?\//, "");
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    // only read inside src/ or the allowed config files
    if (!normalized.startsWith("src/") && !ALLOWED_OUTSIDE_SRC.includes(normalized)) {
      continue;
    }
    if (normalized.includes("..")) continue;

    const full = path.join(REPO_ROOT, normalized);
    let content;
    try {
      content = await readFile(full, "utf8");
    } catch {
      continue; // file doesn't exist (e.g. a brand-new file) — skip
    }
    if (content.length > MAX_PER_FILE) {
      content = content.slice(0, MAX_PER_FILE) + "\n/* ...truncated... */";
    }
    if (total + content.length > MAX_TOTAL) break;
    total += content.length;
    chunks.push(`--- ${normalized} ---\n${content}`);
  }

  return chunks.length ? chunks.join("\n\n") : "(no existing file contents available)";
}

// The files a new/edited section almost always needs to integrate with,
// so the model can see how tabs and navigation are wired before editing.
async function keyIntegrationFiles() {
  const candidates = [
    "src/App.tsx",
    "src/sections/Chrome.tsx",
    "src/sections/Header.tsx",
  ];
  const existing = [];
  for (const c of candidates) {
    try {
      await readFile(path.join(REPO_ROOT, c), "utf8");
      existing.push(c);
    } catch {
      /* skip missing */
    }
  }
  return existing;
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

async function writeSummary({ proposals, debates, verdict, implementation, review, revision, buildResult }) {
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
  if (revision) {
    lines.push(`\n## Revision (author fixed reviewer's feedback)\n`);
    lines.push(`Commit message: ${revision.commitMessage}`);
  }
  if (review) {
    lines.push(`\n## Review\n`);
    lines.push(
      review.approved
        ? `✅ Approved by reviewer — ${review.reason}`
        : `❌ Rejected by reviewer — ${review.reason}`
    );
  }
  if (buildResult) {
    lines.push(`\n## Build check\n`);
    lines.push(
      buildResult.ok
        ? `✅ The site builds successfully with this change.`
        : `❌ The change could not be made to build. Nothing was committed.`
    );
  }
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(path.join(LOG_DIR, `${today}-summary.md`), lines.join("\n"), "utf8");
}

main().catch((err) => {
  console.error("Council run failed:", err);
  process.exit(1);
});
