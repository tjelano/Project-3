## 2024-08-08 - Optimize Player Lookup
**Learning:** Frequent array scans using `Array.prototype.find()` on small arrays can be 5-6x slower than using a `Map`. While N is small (3-4), calling it multiple times in renders and callbacks adds up overhead.
**Action:** Use a `Map` wrapped in `useMemo` for O(1) object lookups by ID when the array items are queried frequently by their identifier in React component loops and callbacks.
