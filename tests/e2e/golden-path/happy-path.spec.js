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

  // --- Player 1 (white, first joiner) makes the opening move ---
  await page1.locator('[data-square="e2"]').click();
  await page1.locator('[data-square="e4"]').click();

  // game-service broadcasts game-state to the whole room, so both players'
  // move logs should update, not just the mover's. Moves render as paired
  // "1. e4 e5"-style rows (.move-row), not one <li> per half-move.
  await expect(page1.locator("#moveLog .move-row")).toHaveText(["1.e4"]);
  await expect(page2.locator("#moveLog .move-row")).toHaveText(["1.e4"]);

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

  // e2 -> e5 is a three-square pawn push: illegal from the opening position.
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e5"]').click();

  await expect(page.locator("#moveError")).toContainText("Illegal move");
  await expect(page.locator("#moveLog .move-row")).toHaveCount(0);
});
