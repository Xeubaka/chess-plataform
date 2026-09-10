# Running an Agentic Loop Against SCOPE.md

`docs/AI_DEV_LOOP.md` draws the line between *automation* (deterministic, rule-based — `bug-triage.yml`) and an *agentic loop* (an AI making judgment calls about what to do next), and calls the latter "worth knowing about, not necessarily building." This is that loop, built: a repeatable way to point Claude Code at `docs/SCOPE.md` and have it work through the backlog one checkbox at a time.

There are two ways to run it. Pick based on how "hands-off" you want to be.

## A. Local session loop

Runs directly against your local files, right now, using Claude Code's `/loop` skill. No git remote required — this works even before Tier 0 in `docs/SCOPE.md` is done.

**How it works:** `/loop` with an interval re-runs a prompt on a schedule inside your current session; without an interval, it self-paces (asks itself when to check back in). Either way, the session needs to stay around to keep firing.

**Example invocation** (dynamic self-pacing, checks back every 20-30 min by default):
```
/loop Open docs/SCOPE.md in this repo. Find the first unchecked item under
Tier 1 or Tier 2 (skip Tier 0 and Tier 3 — those need my explicit go-ahead
first). Implement it end-to-end: code changes, any doc updates it implies,
and run the relevant check (node --check on changed .js files, python -m
py_compile on changed .py files, or the real test suite / tests/e2e for
anything touching a running service). Check the box for that item in
docs/SCOPE.md. Then stop — don't start a second item in the same cycle. If
everything above Tier 3 is checked, say so and stop the loop.
```

**Or with a fixed interval** (e.g. every 2 hours while you're around):
```
/loop 2h Open docs/SCOPE.md ... [same prompt as above]
```

**Notes:**
- It will not commit or push anything unless you separately tell it to — git operations aren't implied by "implement it."
- Review the diff after each cycle before letting the next one fire. Nothing stops you from just watching it work.
- Stop it anytime by telling it to stop, or `/loop` with no args to check status.

## B. Cloud-scheduled routine

True fire-and-forget: runs on a cron schedule independent of whether your machine is on. Uses Claude Code's `/schedule` skill (backed by scheduled cloud agents).

**Prerequisite: Tier 0 in `docs/SCOPE.md` must be done first.** Cloud-scheduled agents run remotely — they can't see your local `C:\` drive. They need to check the code out from a git remote, so `git init` + push to GitHub has to happen before this path works at all. The local loop (Section A) has no such requirement.

**Setup**, once Tier 0 is done:
```
/schedule create a routine, cadence <your cron schedule, e.g. daily>,
against this repo, prompt: [same prompt template as Section A, Section C
below]
```

**Tradeoff vs. the local loop:** changes land as commits/reviewable diffs on a schedule, not live in front of you while it works. You lose the "watch it happen" visibility of Section A, but gain not needing to keep a session open. Good once you trust the loop's judgment on Tier 1/2 items; less good while you're still calibrating what "safe to auto-implement" means for this repo.

## C. Shared prompt template

Both mechanisms should use the same underlying instruction, so behavior doesn't drift depending on which one fired:

> Open `docs/SCOPE.md`. Find the first unchecked item under Tier 1 or Tier 2 — skip Tier 0 (needs a human to run git/push commands) and Tier 3 (flag it and stop; don't implement without explicit approval, per `docs/SCOPE.md`'s own framing of those as optional stretch goals). Implement the item end-to-end: code + any doc updates it implies. Run the relevant check for what you touched. Check the box for that item. **Stop after one item** — don't chain into the next unchecked item in the same cycle, even if there's time left. If nothing is left above Tier 3, say so plainly and stop scheduling further cycles.

The "one item per cycle" rule is deliberate: this repo is small enough that racing through the whole backlog unsupervised would produce a pile of unreviewed changes rather than a series of reviewable ones. One checkbox per cycle keeps every change small enough to actually look at.

## D. Guardrails

- **Cadence:** hours or daily, not minutes. This is a teaching repo — there's no production urgency, and a slower cadence gives you time to review each change before the next one lands.
- **Never let either mechanism push without you reviewing first**, at least until you've watched a few cycles and trust the pattern.
- **Tier 0 and Tier 3 always require an explicit human go-ahead** — the prompt template above encodes this, but it's worth restating: those are exactly the categories (irreversible git history, or large/architectural changes) where an autonomous loop should stop and ask rather than proceed on its own judgment.
