const { performance } = require('perf_hooks');

const vertexIds = [1, 2, 3, 4, 5, 6];
const settlements = {
  1: { ownerId: 1 },
  3: { ownerId: 2 },
  5: { ownerId: 1 },
};
const thief = { id: 3 };

function runSet() {
  const victimIds = new Set();
  for (const vertexId of vertexIds) {
    const building = settlements[vertexId];
    if (building && building.ownerId !== thief.id) victimIds.add(building.ownerId);
  }
  if (victimIds.size > 0) {
    const candidates = [...victimIds];
    const victimId = candidates[Math.floor(Math.random() * candidates.length)];
  }
}

function runArray() {
  const victimIds = [];
  for (const vertexId of vertexIds) {
    const building = settlements[vertexId];
    if (building && building.ownerId !== thief.id && !victimIds.includes(building.ownerId)) {
      victimIds.push(building.ownerId);
    }
  }
  if (victimIds.length > 0) {
    const candidates = victimIds;
    const victimId = candidates[Math.floor(Math.random() * candidates.length)];
  }
}

const ITERS = 1000000;

let start = performance.now();
for (let i = 0; i < ITERS; i++) runSet();
const setTime = performance.now() - start;

start = performance.now();
for (let i = 0; i < ITERS; i++) runArray();
const arrayTime = performance.now() - start;

console.log(`Set time: ${setTime.toFixed(2)}ms`);
console.log(`Array time: ${arrayTime.toFixed(2)}ms`);
