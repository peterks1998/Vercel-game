(function () {
  "use strict";

  const SIZE = 4;
  const board = document.getElementById("board");
  const overlay = document.getElementById("overlay");
  const overlayMessage = document.getElementById("overlay-message");
  const overlayBtn = document.getElementById("overlay-btn");
  const newGameBtn = document.getElementById("new-game");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");

  const BEST_KEY = "game-2048-best";

  /** @type {number[][]} grid[row][col] = value (0 = empty) */
  let grid;
  let score = 0;
  let best = Number(localStorage.getItem(BEST_KEY)) || 0;
  let won = false;
  let over = false;
  let cellSize = 0;
  let gap = 12;

  bestEl.textContent = String(best);

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function cloneGrid(g) {
    return g.map((row) => row.slice());
  }

  function getEmptyCells(g) {
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (g[r][c] === 0) cells.push([r, c]);
      }
    }
    return cells;
  }

  function addRandomTile(g) {
    const empties = getEmptyCells(g);
    if (empties.length === 0) return null;
    const [r, c] = empties[Math.floor(Math.random() * empties.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    g[r][c] = value;
    return { r, c, value };
  }

  function startGame() {
    grid = emptyGrid();
    score = 0;
    won = false;
    over = false;
    scoreEl.textContent = "0";
    overlay.classList.add("hidden");
    addRandomTile(grid);
    addRandomTile(grid);
    render(grid, [], []);
  }

  // --- Movement logic ---
  // Operates on a single line (array of values, zeros removed at call site handled inside)
  function slideAndMergeLine(line) {
    const filtered = line.filter((v) => v !== 0);
    const merged = [];
    let gained = 0;
    for (let i = 0; i < filtered.length; i++) {
      if (i < filtered.length - 1 && filtered[i] === filtered[i + 1]) {
        const value = filtered[i] * 2;
        merged.push(value);
        gained += value;
        if (value === 2048) won = true;
        i++;
      } else {
        merged.push(filtered[i]);
      }
    }
    while (merged.length < SIZE) merged.push(0);
    return { line: merged, gained };
  }

  function getLine(g, dir, index) {
    const line = [];
    for (let i = 0; i < SIZE; i++) {
      if (dir === "left" || dir === "right") line.push(g[index][i]);
      else line.push(g[i][index]);
    }
    if (dir === "right" || dir === "down") line.reverse();
    return line;
  }

  function setLine(g, dir, index, line) {
    const ordered = dir === "right" || dir === "down" ? line.slice().reverse() : line;
    for (let i = 0; i < SIZE; i++) {
      if (dir === "left" || dir === "right") g[index][i] = ordered[i];
      else g[i][index] = ordered[i];
    }
  }

  function move(dir) {
    if (over) return;
    const before = cloneGrid(grid);
    let totalGained = 0;
    let moved = false;

    for (let index = 0; index < SIZE; index++) {
      const line = getLine(grid, dir, index);
      const { line: newLine, gained } = slideAndMergeLine(line);
      totalGained += gained;
      setLine(grid, dir, index, newLine);
    }

    moved = !gridsEqual(before, grid);

    if (moved) {
      score += totalGained;
      scoreEl.textContent = String(score);
      if (score > best) {
        best = score;
        bestEl.textContent = String(best);
        localStorage.setItem(BEST_KEY, String(best));
      }
      const spawned = addRandomTile(grid);
      render(grid, [], spawned ? [spawned] : []);

      if (won) {
        showOverlay("You win! 🎉", "Keep Going");
        won = false; // allow continued play without re-triggering
      } else if (!hasMoves(grid)) {
        over = true;
        showOverlay("Game Over", "Try Again");
      }
    }
  }

  function gridsEqual(a, b) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (a[r][c] !== b[r][c]) return false;
      }
    }
    return true;
  }

  function hasMoves(g) {
    if (getEmptyCells(g).length > 0) return true;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = g[r][c];
        if (c < SIZE - 1 && g[r][c + 1] === v) return true;
        if (r < SIZE - 1 && g[r + 1][c] === v) return true;
      }
    }
    return false;
  }

  function showOverlay(message, btnText) {
    overlayMessage.textContent = message;
    overlayBtn.textContent = btnText;
    overlay.classList.remove("hidden");
  }

  // --- Rendering ---
  function measure() {
    const rect = board.getBoundingClientRect();
    cellSize = (rect.width - gap * (SIZE + 1)) / SIZE;
  }

  function render(g, _removed, spawned) {
    measure();
    board.innerHTML = "";

    for (let i = 0; i < SIZE * SIZE; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      board.appendChild(cell);
    }

    const spawnedSet = new Set((spawned || []).map(({ r, c }) => `${r},${c}`));

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const value = g[r][c];
        if (value === 0) continue;
        const tile = document.createElement("div");
        tile.className = "tile";
        tile.dataset.value = String(value);
        tile.textContent = String(value);
        positionTile(tile, r, c);
        if (spawnedSet.has(`${r},${c}`)) {
          tile.style.animation = "pop 0.2s ease";
        }
        board.appendChild(tile);
      }
    }
  }

  function positionTile(tile, r, c) {
    const top = gap + r * (cellSize + gap);
    const left = gap + c * (cellSize + gap);
    tile.style.width = `${cellSize}px`;
    tile.style.height = `${cellSize}px`;
    tile.style.top = `${top}px`;
    tile.style.left = `${left}px`;
    tile.style.fontSize = `${cellSize * 0.42}px`;
  }

  // --- Input handling ---
  const KEY_DIRS = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
  };

  document.addEventListener("keydown", (e) => {
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
  overlayBtn.addEventListener("click", startGame);

  window.addEventListener("resize", () => render(grid, [], []));

  startGame();
})();
