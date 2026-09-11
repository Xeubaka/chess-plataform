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

test("an illegal move is rejected in the UI and does not change the board", async ({ page }) => {
  await page.goto("/");
  await page.locator("#createName").fill("Solo");
  await page.locator("#createBtn").click();
  await page.waitForURL(/game\.html\?room=/);
  await expect(page.locator("#status")).toHaveText(/to move/);

  // Solo creator's color is now a per-room coin flip too (room-service#1),
  // not always white — a 3-square pawn push is illegal for either side, but
  // starting square/direction have to match whichever color this is.
  const soloColor = await page.evaluate(() => sessionStorage.getItem("playerColor"));
  const [from, to] = soloColor === "white" ? ["e2", "e5"] : ["e7", "e4"];
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();

  await expect(page.locator("#moveError")).toContainText("Illegal move");
  await expect(page.locator("#moveLog .move-row")).toHaveCount(0);
});
