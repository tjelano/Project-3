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
