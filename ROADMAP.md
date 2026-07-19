# Roadmap notes for the AI Council

This file is read by the council every day before it proposes changes.
The council should work on the SINGLE next unfinished step below, and nothing
more. Do the smallest step that fully works. Do not jump ahead to later steps.

## TOP PRIORITY — Global Macro News section (build it in tiny steps)

Goal (the finished picture, for context only — do NOT build all at once):
A new "Global" tab showing world news that can move markets, with impact
tags, an "India impact" note per item, and a High/Medium/Low severity marker.

Build it ONE tiny step at a time, in this exact order. Each step must be
complete, wired in, and build successfully on its own before the next step
is attempted. Only do the FIRST step that isn't done yet.

### Step 1 — an empty Global tab, fully wired into navigation
Add a new "Global" entry to the site's navigation/tabs, and a new section
component that, for now, just displays a heading like "Global Macro" and the
text "Coming soon." Nothing else — no data fetching yet. The ONLY goal of
this step is: the tab appears in the nav, clicking it shows the placeholder
section, and the site builds. Make sure it's actually reachable by the user.

### Step 2 — show a static list of source names
In the Global section, replace "Coming soon" with a simple hardcoded list of
the world news SOURCES you plan to use later (just their names as text, e.g.
"Reuters World Business", "Oil & Energy", "Central Banks"). Still no live
fetching. Goal: a visible list, site builds.

### Step 3 — fetch and show real headlines from ONE source
Wire up live fetching for ONE global source only, reusing the existing
news-fetching/proxy approach already in the codebase. Show its real
headlines as a list of links. Validate that each link is a safe http/https
URL before displaying it. If the source can't be reached, show an honest
"unavailable" message — never invented headlines. Goal: real headlines from
one source, site builds.

### Step 4 — add a few more global sources
Add 2-3 more real global sources to the same feed. Same safety rules.

### Step 5 — add impact tags
Tag each news item with what it affects: Equities, Oil/Energy,
Currency/Rupee, Interest Rates, or Geopolitics.

### Step 6 — add an "India impact" one-liner per item
A short note on how the global event could affect Indian markets.

### Step 7 — add a High/Medium/Low severity marker, color-coded.

## Things to avoid
- Do the ONE next unfinished step only. Never combine steps.
- Never fabricate news or data. Unreachable source = honest "unavailable".
- Always fully wire new UI into navigation so the user can actually reach it.
- Only ever validate and display safe http/https links.
- Do not break or change the existing India-focused sections.
- Keep each change small enough to review and build in one run.

## Ideas parked for later
- (optional: bigger ideas for after the Global section is done)
