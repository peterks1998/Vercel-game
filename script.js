(function () {
  "use strict";

  const SIZE = 4;
  const MOVE_DURATION = 130; // ms, must be >= CSS top/left transition duration
  const board = document.getElementById("board");
  const overlay = document.getElementById("overlay");
  const overlayMessage = document.getElementById("overlay-message");
  const overlayBtn = document.getElementById("overlay-btn");
  const overlayMenuBtn = document.getElementById("overlay-menu-btn");
  const newGameBtn = document.getElementById("new-game");
  const gameMenuBtn = document.getElementById("game-menu");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");

  const menuScreen = document.getElementById("menu-screen");
  const highscoresScreen = document.getElementById("highscores-screen");
  const gameScreen = document.getElementById("game-screen");
  const menuPlayBtn = document.getElementById("menu-play");
  const menuHighscoresBtn = document.getElementById("menu-highscores");
  const highscoresBackBtn = document.getElementById("highscores-back");
  const highscoresList = document.getElementById("highscores-list");

  const SCREENS = { menu: menuScreen, highscores: highscoresScreen, game: gameScreen };

  const BEST_KEY = "game-2048-best";
  const HIGHSCORES_KEY = "game-2048-highscores";
  const MAX_HIGHSCORES = 10;

  const VECTORS = {
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
  };

  /** @type {{id:number, r:number, c:number, value:number, merged:boolean}[]} */
  let tiles = [];
  /** @type {Map<number, HTMLElement>} */
  const tileElements = new Map();
  let nextId = 1;

  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY)) || 0;
  let won = false;
  let over = false;
  let animating = false;
  let scoreSaved = false;
  let cellSize = 0;
  const gap = 12;

  bestEl.textContent = String(best);

  function showScreen(name) {
    Object.entries(SCREENS).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== name);
    });
  }

  function getHighScores() {
    try {
      const raw = JSON.parse(localStorage.getItem(HIGHSCORES_KEY));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function saveHighScore(value) {
    if (value <= 0) return;
    const list = getHighScores();
    list.push({ score: value, date: Date.now() });
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list.slice(0, MAX_HIGHSCORES)));
  }

  function recordScoreOnce() {
    if (!scoreSaved && score > 0) {
      saveHighScore(score);
      scoreSaved = true;
    }
  }

  function renderHighScores() {
    const list = getHighScores();
    highscoresList.innerHTML = "";

    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "highscores-empty";
      empty.textContent = "No scores yet — play a game!";
      highscoresList.appendChild(empty);
      return;
    }

    list.forEach((entry, i) => {
      const li = document.createElement("li");
      const dateStr = new Date(entry.date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      li.innerHTML = `<span class="rank">${i + 1}</span><span class="hs-score">${entry.score}</span><span class="hs-date">${dateStr}</span>`;
      highscoresList.appendChild(li);
    });
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function occupiedSet() {
    return new Set(tiles.map((t) => `${t.r},${t.c}`));
  }

  function getEmptyCells() {
    const occupied = occupiedSet();
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!occupied.has(`${r},${c}`)) cells.push([r, c]);
      }
    }
    return cells;
  }

  function buildValueGrid() {
    const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    tiles.forEach((t) => {
      g[t.r][t.c] = t.value;
    });
    return g;
  }

  function addRandomTile() {
    const cells = getEmptyCells();
    if (cells.length === 0) return null;
    const [r, c] = cells[Math.floor(Math.random() * cells.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    const tile = { id: nextId++, r, c, value, merged: false };
    tiles.push(tile);
    return tile;
  }

  function hasMoves() {
    if (getEmptyCells().length > 0) return true;
    const g = buildValueGrid();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = g[r][c];
        if (c < SIZE - 1 && g[r][c + 1] === v) return true;
        if (r < SIZE - 1 && g[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  function startGame() {
    tiles = [];
    tileElements.clear();
    nextId = 1;
    score = 0;
    won = false;
    over = false;
    animating = false;
    scoreSaved = false;
    scoreEl.textContent = "0";
    overlay.classList.add("hidden");

    board.innerHTML = "";
    for (let i = 0; i < SIZE * SIZE; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      board.appendChild(cell);
    }
    measure();

    const t1 = addRandomTile();
    const t2 = addRandomTile();
    if (t1) createTileElement(t1);
    if (t2) createTileElement(t2);
  }

  function move(dir) {
    if (over || animating) return;
    const vector = VECTORS[dir];
    const rowOrder = [0, 1, 2, 3];
    const colOrder = [0, 1, 2, 3];
    if (vector.dr === 1) rowOrder.reverse();
    if (vector.dc === 1) colOrder.reverse();

    const cellTile = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    tiles.forEach((t) => {
      t.merged = false;
      cellTile[t.r][t.c] = t;
    });

    let moved = false;
    let scoreGained = 0;
    const removed = [];

    for (const r of rowOrder) {
      for (const c of colOrder) {
        const tile = cellTile[r][c];
        if (!tile) continue;

        let farR = r;
        let farC = c;
        let nr = r + vector.dr;
        let nc = c + vector.dc;
        while (inBounds(nr, nc) && cellTile[nr][nc] === null) {
          farR = nr;
          farC = nc;
          nr += vector.dr;
          nc += vector.dc;
        }
        const nextTile = inBounds(nr, nc) ? cellTile[nr][nc] : null;

        if (nextTile && !nextTile.merged && nextTile.value === tile.value) {
          cellTile[r][c] = null;
          tile.r = nr;
          tile.c = nc;
          nextTile.value *= 2;
          nextTile.merged = true;
          scoreGained += nextTile.value;
          if (nextTile.value === 2048) won = true;
          removed.push(tile);
          moved = true;
        } else {
          cellTile[r][c] = null;
          cellTile[farR][farC] = tile;
          if (farR !== r || farC !== c) moved = true;
          tile.r = farR;
          tile.c = farC;
        }
      }
    }

    if (!moved) return;

    animating = true;
    updatePositions();

    score += scoreGained;
    scoreEl.textContent = String(score);
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      localStorage.setItem(BEST_KEY, String(best));
    }

    setTimeout(() => {
      removed.forEach((t) => {
        const el = tileElements.get(t.id);
        if (el) el.remove();
        tileElements.delete(t.id);
      });
      tiles = tiles.filter((t) => !removed.includes(t));

      tiles.forEach((t) => {
        if (t.merged) {
          const el = tileElements.get(t.id);
          if (!el) return;
          el.textContent = String(t.value);
          el.dataset.value = String(t.value);
          el.classList.remove("merged");
          void el.offsetWidth;
          el.classList.add("merged");
        }
      });

      const spawned = addRandomTile();
      if (spawned) createTileElement(spawned);

      animating = false;

      if (won) {
        showOverlay("You win! \u{1F389}", "Keep Going", "win");
        won = false;
      } else if (!hasMoves()) {
        over = true;
        recordScoreOnce();
        showOverlay("Game Over", "Try Again", "over");
      }
    }, MOVE_DURATION);
  }

  let overlayMode = "over";

  function showOverlay(message, btnText, mode) {
    overlayMessage.textContent = message;
    overlayBtn.textContent = btnText;
    overlayMode = mode;
    overlay.classList.remove("hidden");
  }

  // --- Rendering ---
  function measure() {
    const rect = board.getBoundingClientRect();
    cellSize = (rect.width - gap * (SIZE + 1)) / SIZE;
  }

  function positionTile(el, r, c) {
    const top = gap + r * (cellSize + gap);
    const left = gap + c * (cellSize + gap);
    el.style.width = `${cellSize}px`;
    el.style.height = `${cellSize}px`;
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.fontSize = `${cellSize * 0.42}px`;
  }

  function createTileElement(tile) {
    const el = document.createElement("div");
    el.className = "tile";
    el.dataset.value = String(tile.value);
    el.textContent = String(tile.value);
    positionTile(el, tile.r, tile.c);
    board.appendChild(el);
    tileElements.set(tile.id, el);
    return el;
  }

  function updatePositions() {
    tiles.forEach((t) => {
      const el = tileElements.get(t.id);
      if (el) positionTile(el, t.r, t.c);
    });
  }

  // --- Input handling ---
  const KEY_DIRS = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
  };

  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("hidden")) return;
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    move(dir);
  });

  let touchStartX = 0;
  let touchStartY = 0;

  board.addEventListener(
    "touchstart",
    (e) => {
      const t = e.changedTouches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    },
    { passive: true }
  );

  board.addEventListener(
    "touchend",
    (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const THRESHOLD = 24;

      if (Math.max(absX, absY) < THRESHOLD) return;

      if (absX > absY) {
        move(dx > 0 ? "right" : "left");
      } else {
        move(dy > 0 ? "down" : "up");
      }
    },
    { passive: true }
  );

  newGameBtn.addEventListener("click", startGame);
  overlayBtn.addEventListener("click", () => {
    if (overlayMode === "win") {
      overlay.classList.add("hidden");
    } else {
      startGame();
    }
  });

  gameMenuBtn.addEventListener("click", () => {
    recordScoreOnce();
    showScreen("menu");
  });

  overlayMenuBtn.addEventListener("click", () => {
    recordScoreOnce();
    overlay.classList.add("hidden");
    showScreen("menu");
  });

  menuPlayBtn.addEventListener("click", () => {
    showScreen("game");
    startGame();
  });

  menuHighscoresBtn.addEventListener("click", () => {
    renderHighScores();
    showScreen("highscores");
  });

  highscoresBackBtn.addEventListener("click", () => {
    showScreen("menu");
  });

  window.addEventListener("resize", () => {
    if (!gameScreen.classList.contains("hidden")) {
      measure();
      updatePositions();
    }
  });

  showScreen("menu");
})();
