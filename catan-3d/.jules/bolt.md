## 2024-05-18 - Extract static object keys outside React components
**Learning:** Extracting `Object.keys()` out of frequently running hooks like `useMemo` avoids array re-allocation on every render/memoization cycle. Node.js benchmark showed an improvement from ~550ms to ~90ms for 10,000,000 iterations.
**Action:** Always extract constant/static data processing, like `Object.keys` or `Object.values` on constant maps, to module-level constants.
