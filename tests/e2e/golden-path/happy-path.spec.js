import { test, expect } from "@playwright/test";

// The golden path this whole platform exists to demonstrate (see README.md
// "What this app does"): create a room, a second player joins, they play a
// live move, chat works, and the analysis service's win-probability update
// makes it all the way back to both screens. Two browser contexts = two
// separate players, each with their own sessionStorage (playerName/Color),
// same as two people on two machines.
test("two players create/join a room, play a move, chat, and see analysis update", async ({ browser }) => {
  const player1 = await browser.newContext();
  const player2 = await browser.newContext();
  const page1 = await player1.newPage();
  const page2 = await player2.newPage();

  // --- Player 1 creates the room ---
  await page1.goto("/");
  await page1.locator("#createName").fill("Alice");
  await page1.locator("#createBtn").click();
  await page1.waitForURL(/game\.html\?room=/);
  const roomId = new URL(page1.url()).searchParams.get("room");
  expect(roomId).toBeTruthy();

  // --- Player 2 joins with the room code ---
  await page2.goto("/");
  await page2.locator("#joinCode").fill(roomId);
  await page2.locator("#joinName").fill("Bob");
  await page2.locator("#joinBtn").click();
  await page2.waitForURL(/game\.html\?room=/);

  // Both sides should reach a stable "white to move" status once game-service
  // has processed both join-room events and sent back game-state.
  await expect(page1.locator("#status")).toHaveText(/to move/);
  await expect(page2.locator("#status")).toHaveText(/to move/);

  // Per-player chess clock: starts once both seats are filled, rendered as
  // "M:SS" on both sides' player bars.
  await expect(page1.locator("#selfClock")).toHaveText(/^\d:\d{2}$/);
  await expect(page1.locator("#opponentClock")).toHaveText(/^\d:\d{2}$/);

  // --- Whichever side got white (room-service#1: a per-room coin flip now
  // decides this, not "whoever joined first") makes the opening move ---
  const player1Color = await page1.evaluate(() => sessionStorage.getItem("playerColor"));
  const whitePage = player1Color === "white" ? page1 : page2;
  const blackPage = player1Color === "white" ? page2 : page1;

  await whitePage.locator('[data-square="e2"]').click();
  await whitePage.locator('[data-square="e4"]').click();

  // game-service broadcasts game-state to the whole room, so both players'
  // move logs should update, not just the mover's. Moves render as paired
  // "1. e4 e5"-style rows (.move-row), not one <li> per half-move.
  await expect(whitePage.locator("#moveLog .move-row")).toHaveText(["1.e4"]);
  await expect(blackPage.locator("#moveLog .move-row")).toHaveText(["1.e4"]);

  // --- Analysis round trip: game-service -> Redis -> analysis-service ->
  // Redis -> game-service -> socket "analysis-update". The static markup
  // starts as bare "50%"; only a real analysis-update event adds the
  // "White "/"Black " prefix, so this proves the full pub/sub loop fired,
  // not just that the initial page state happens to say 50.
  await expect(page1.locator("#whiteProb")).toHaveText(/White \d+%/);
  await expect(page1.locator("#blackProb")).toHaveText(/Black \d+%/);

  // --- Chat is a fully separate service/socket from the game itself ---
  await page1.locator("#chatInput").fill("gg, good luck!");
  await page1.locator("#chatSend").click();
  await expect(page2.locator("#chatMessages")).toContainText("gg, good luck!");
  await expect(page2.locator("#chatMessages")).toContainText("Alice");

  await player1.close();
  await player2.close();
});

test("clicking an out-of-range square deselects instead of attempting an illegal move (frontend#6)", async ({ page }) => {
  await page.goto("/");
  await page.locator("#createName").fill("Solo");
  await page.locator("#createBtn").click();
  await page.waitForURL(/game\.html\?room=/);
  await expect(page.locator("#status")).toHaveText(/to move/);

  // Solo creator's color is now a per-room coin flip too (room-service#1),
  // not always white — a 3-square pawn push is out of range for either
  // side, but starting square/direction have to match whichever color this is.
  const soloColor = await page.evaluate(() => sessionStorage.getItem("playerColor"));
  const [from, to] = soloColor === "white" ? ["e2", "e5"] : ["e7", "e4"];
  await page.locator(`[data-square="${from}"]`).click();
  await expect(page.locator(`[data-square="${from}"]`)).toHaveClass(/selected/);

  // Not a legal destination and not another of the player's own pieces —
  // onSquareClick clears the selection client-side rather than emitting a
  // move the server would only have to reject (server-side rejection itself
  // is covered by tests/e2e/api/game-socket.test.js).
  await page.locator(`[data-square="${to}"]`).click();

  await expect(page.locator(".selected")).toHaveCount(0);
  await expect(page.locator("#moveError")).toHaveText("");
  await expect(page.locator("#moveLog .move-row")).toHaveCount(0);
});

test("clicking another of the player's own pieces re-selects it, chess.com-style (frontend#6)", async ({ page }) => {
  await page.goto("/");
  await page.locator("#createName").fill("Solo");
  await page.locator("#createBtn").click();
  await page.waitForURL(/game\.html\?room=/);
  await expect(page.locator("#status")).toHaveText(/to move/);

  const soloColor = await page.evaluate(() => sessionStorage.getItem("playerColor"));
  // Two of this side's own pawns, neither a legal destination of the other.
  const [first, second] = soloColor === "white" ? ["e2", "d2"] : ["e7", "d7"];
  await page.locator(`[data-square="${first}"]`).click();
  await page.locator(`[data-square="${second}"]`).click();

  await expect(page.locator(`[data-square="${second}"]`)).toHaveClass(/selected/);
  await expect(page.locator(`[data-square="${first}"]`)).not.toHaveClass(/selected/);
  await expect(page.locator("#moveError")).toHaveText("");
  await expect(page.locator("#moveLog .move-row")).toHaveCount(0);
});

test("highlighting the king in check is off by default, opt-in, and persists across a reload (frontend#7)", async ({ browser }) => {
  const player1 = await browser.newContext();
  const player2 = await browser.newContext();
  const page1 = await player1.newPage();
  const page2 = await player2.newPage();

  await page1.goto("/");
  await page1.locator("#createName").fill("Alice");
  await page1.locator("#createBtn").click();
  await page1.waitForURL(/game\.html\?room=/);
  const roomId = new URL(page1.url()).searchParams.get("room");

  await page2.goto("/");
  await page2.locator("#joinCode").fill(roomId);
  await page2.locator("#joinName").fill("Bob");
  await page2.locator("#joinBtn").click();
  await page2.waitForURL(/game\.html\?room=/);

  // Room-service's coin flip decides who's actually white/black.
  const page1IsWhite = (await page1.evaluate(() => sessionStorage.getItem("playerColor"))) === "white";
  const [white, black] = page1IsWhite ? [page1, page2] : [page2, page1];

  async function move(page, from, to) {
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
  }

  // 1.e4 e5 2.Qh5 Nc6 3.Qxe5+ — delivers check along the open e-file,
  // king still on e8. Deliberately bad chess, just needs to be legal.
  // Moves render as paired rows (moveLog.textContent), so waiting on the
  // exact SAN text landing is the reliable way to sequence turns here —
  // row *count* alone is ambiguous (it only bumps on White's half).
  const sanLanded = (page, san) =>
    page.waitForFunction((text) => document.getElementById("moveLog").textContent.includes(text), san);

  await white.locator("#status").waitFor();
  await move(white, "e2", "e4");
  await sanLanded(black, "e4");
  await move(black, "e7", "e5");
  await sanLanded(white, "e5");
  await move(white, "d1", "h5");
  await sanLanded(black, "Qh5");
  await move(black, "b8", "c6");
  await sanLanded(white, "Nc6");
  await move(white, "h5", "e5");

  await expect(black.locator("#status")).toHaveText(/check!/);

  // Off by default: no highlight yet even though the king is in check.
  await expect(black.locator("#highlightCheckToggle")).not.toBeChecked();
  await expect(black.locator(".in-check")).toHaveCount(0);

  // Opting in highlights the actual side-to-move's king (e8), not just any square.
  await black.locator("#highlightCheckToggle").check();
  await expect(black.locator('[data-square="e8"]')).toHaveClass(/in-check/);
  await expect(black.locator(".in-check")).toHaveCount(1);

  // The setting is a client-side preference (localStorage), not tied to
  // this one check event — it survives a reload.
  await black.reload();
  await expect(black.locator("#highlightCheckToggle")).toBeChecked();
  await expect(black.locator('[data-square="e8"]')).toHaveClass(/in-check/);
});

test("end-of-game modal pops up on resignation, hides the resign button, and its Rematch button proposes a real rematch (frontend#8)", async ({ browser }) => {
  const player1 = await browser.newContext();
  const player2 = await browser.newContext();
  const page1 = await player1.newPage();
  const page2 = await player2.newPage();

  await page1.goto("/");
  await page1.locator("#createName").fill("Alice");
  await page1.locator("#createBtn").click();
  await page1.waitForURL(/game\.html\?room=/);
  const roomId = new URL(page1.url()).searchParams.get("room");

  await page2.goto("/");
  await page2.locator("#joinCode").fill(roomId);
  await page2.locator("#joinName").fill("Bob");
  await page2.locator("#joinBtn").click();
  await page2.waitForURL(/game\.html\?room=/);

  page1.once("dialog", (d) => d.accept());
  await page1.locator("#resignBtn").click();

  // Resigner's own view: modal shows the outcome, resign button actually
  // hides (regression check — .hidden vs. .resign-btn CSS specificity used
  // to lose this race and leave it visibly stuck).
  await expect(page1.locator("#endGameModal")).toBeVisible();
  await expect(page1.locator("#endGameText")).toHaveText(/resigned/);
  await expect(page1.locator("#resignBtn")).toBeHidden();

  // Opponent's view: same modal, and clicking Rematch there triggers the
  // real rematch-request flow (#rematchOffer), not a separate code path.
  await expect(page2.locator("#endGameModal")).toBeVisible();
  await page2.locator("#endGameRematchBtn").click();
  await expect(page2.locator("#endGameModal")).toBeHidden();
  await expect(page1.locator("#rematchOffer")).toBeVisible();
});

test("end-of-game modal's Rematch button replays a bot game immediately (frontend#8)", async ({ page }) => {
  await page.goto("/");
  await page.locator("#botName").fill("Solo");
  await page.locator("#playBotBtn").click();
  await page.waitForURL(/game\.html\?room=bot-/);
  const firstRoomId = new URL(page.url()).searchParams.get("room");

  page.once("dialog", (d) => d.accept());
  await page.locator("#resignBtn").click();
  await expect(page.locator("#endGameModal")).toBeVisible();

  await page.locator("#endGameRematchBtn").click();
  await page.waitForURL(/game\.html\?room=bot-/);
  expect(new URL(page.url()).searchParams.get("room")).not.toBe(firstRoomId);
  await expect(page.locator("#endGameModal")).toBeHidden();
});
