const { performance } = require('perf_hooks');

const players = [
  { id: 1, name: 'Alice', resources: {} },
  { id: 2, name: 'Bob', resources: {} },
  { id: 3, name: 'Charlie', resources: {} },
  { id: 4, name: 'David', resources: {} },
];

const ITERATIONS = 10_000_000;

function runFind() {
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const id = (i % 4) + 1;
    const victim = players.find((p) => p.id === id);
  }
  const end = performance.now();
  console.log(`Array.find took ${end - start} ms`);
}

function runMap() {
  const playerById = new Map(players.map((p) => [p.id, p]));
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const id = (i % 4) + 1;
    const victim = playerById.get(id);
  }
  const end = performance.now();
  console.log(`Map.get took ${end - start} ms`);
}

runFind();
runMap();

const SIZE = 10000;
const revealedTileIds = new Set();
const settledTileIds = new Set();

for (let i = 0; i < SIZE; i++) {
    revealedTileIds.add(`tile_${i}`);
    if (i < SIZE - 50) {
        settledTileIds.add(`tile_${i}`);
    }
}

function approach1() {
    return [...revealedTileIds].filter((id) => !settledTileIds.has(id));
}

function approach2() {
    const justRevealed = [];
    for (const id of revealedTileIds) {
        if (!settledTileIds.has(id)) {
            justRevealed.push(id);
        }
    }
    return justRevealed;
}

const ITERATIONS_SET = 10000;

let startSet = performance.now();
for (let i = 0; i < ITERATIONS_SET; i++) {
    approach1();
}
let endSet = performance.now();
console.log(`Approach 1 (Array spread + filter): ${endSet - startSet} ms`);

startSet = performance.now();
for (let i = 0; i < ITERATIONS_SET; i++) {
    approach2();
}
endSet = performance.now();
console.log(`Approach 2 (Set iteration + push): ${endSet - startSet} ms`);
