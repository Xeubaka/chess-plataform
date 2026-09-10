# Using AI "Skills" and Automation Loops While Building This

Two different ideas get lumped together under "AI development practices" —
worth keeping them separate:

1. **Skills** — reusable, written instructions you hand to an AI coding
   assistant so it applies the same standard every time, instead of you
   re-explaining context in every conversation.
2. **Automation loops** — scripts/pipelines that run *without* an AI model
   at all, reacting to signals (a failed test, a new PR) to catch problems
   and create tasks. `.github/workflows/bug-triage.yml` in this repo is a
   working example of loop #2 — no AI call in it, just automation reacting
   to CI status.

Both are worth having a real example of for this interview, since the JD
explicitly wants someone who improves engineering practices, not just ships
features.

## 1. A "skill" for this project (example, works in Claude Code)

A skill is just a markdown file with instructions that an AI coding tool
reads before acting. Here's one scoped to this repo — save it as
`.claude/skills/bug-hunter/SKILL.md` if you're using Claude Code locally:

```markdown
---
name: bug-hunter
description: Use after any change to a service in this repo, to check for
  regressions across service boundaries before committing.
---

When invoked:
1. Run `node --check` on every changed .js file, `python -m py_compile` on
   every changed .py file.
2. If `game-service` was changed, re-read `analysis-service/app.py` and
   confirm the Redis channel names and JSON message shape it publishes/
   expects still match (`moves:{roomId}` -> `{roomId, fen, moveCount}`,
   `analysis:{roomId}` -> `{white_win_pct, black_win_pct, ...}`).
3. If `nginx.conf` was changed, confirm every `location` block still points
   at a service name that exists in `docker-compose.yml`.
4. Report findings as a checklist: what was checked, what passed, what
   looks broken and why — don't just say "looks fine."
5. For anything broken, write it as a one-line task ready to paste into a
   GitHub issue, not just a vague warning.
```

**Why this is a good interview talking point:** it's not "I used AI to write
code for me" — it's "I encoded a repeatable cross-service check into a
reusable instruction set, the same way a linter config encodes a team
standard." That's a "shift-left" and "engineering practices" story, which is
exactly the language in the JD.

## 2. A real automation loop already in this repo

`.github/workflows/bug-triage.yml` does the "constantly verify and create
tasks" behavior you asked for, using plain CI — no AI involved:

- CI fails on `main` → the workflow fires
- It checks for an existing open issue labeled `ci-failure`
- If one exists, it comments with the new failure link (avoids issue spam)
- If not, it creates one with the branch, commit, and run link

This is deliberately simple and dependency-free so you can explain every
line of it in an interview. The next step up in sophistication (worth
knowing about, not necessarily building) is having a scheduled job **read**
recently filed `ci-failure`/`bug` issues and have an AI assistant draft a
first-pass diagnosis or reproduction script as a comment — turning "a human
has to first figure out what's even wrong" into "a first-pass triage is
already waiting when a human opens the issue." That's the difference
between *automation* (deterministic, rule-based — what's in this repo now)
and an *agentic loop* (an AI making judgment calls about what to do next) —
knowing that distinction and being able to say which one you'd reach for
and why is itself a good signal in an interview. `docs/LOOP_GUIDE.md` builds
this "next step up" for real, running against `SCOPE.md`'s backlog instead
of a hypothetical.

## 3. Where to actually practice this while you build

- Every time you finish a Phase in `CHECKPOINTS.md`, ask your AI coding
  assistant (with the skill above, or just directly) to review your diff
  for cross-service breakage before you commit — that's the habit, not a
  one-time setup.
- After Phase 6 (GitHub Actions wired up for real), deliberately introduce
  one bug, push it, and watch `bug-triage.yml` file the issue automatically
  — seeing the loop fire for real is worth more than reading about it.
