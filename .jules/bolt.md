## 2024-05-18 - React.memo() Failure with Inline Functions in R3F

**Learning:** When trying to memoize components in React Three Fiber (like `VertexSlot` and `EdgeSlot` inside `BoardInteractions`), wrapping them in `React.memo` is completely ineffective if parent components pass down inline arrow functions for event handlers (e.g. `onBuild={() => onBuildSettlement(vertex.id)}`). The new function reference on every render causes the shallow comparison to fail, defeating the optimization and potentially making performance worse.

**Action:** Refactor child components to accept raw IDs and call the handler themselves (e.g., `onClick={() => onBuild(vertex.id)}`), so the parent can pass a stable function reference (e.g. `onBuild={onBuildSettlement}`).

## 2024-08-08 - Optimize Player Lookup
**Learning:** Frequent array scans using `Array.prototype.find()` on small arrays can be 5-6x slower than using a `Map`. While N is small (3-4), calling it multiple times in renders and callbacks adds up overhead.
**Action:** Use a `Map` wrapped in `useMemo` for O(1) object lookups by ID when the array items are queried frequently by their identifier in React component loops and callbacks.

## 2024-11-20 - Array instead of Set for small collections
**Learning:** When dealing with very small collections (e.g. Catan vertices on a tile, max 6), using `Array` with `Array.includes()` can be significantly faster (up to ~30%) than instantiating a `Set` and spreading it back into an Array (`[...set]`). The V8 engine overhead of Set allocation and the spread operator outweighs the O(N) lookup cost of `includes()` for N <= 6.
**Action:** Use Arrays instead of Sets when you know the collection size is strictly bound to a very small number and the resulting collection will immediately need to be converted to an array for random access or iteration.
## 2024-06-25 - [O(N^2) Array Filter to Map Optimization]
**Learning:** [Using `Array.filter` inside a loop leads to a performance bottleneck of O(N*M). V8 JavaScript array optimizations favor a single-pass mapped frequency count `const counts = new Map()` loop which makes performance O(N+M).]
**Action:** [Avoid `Array.filter` in loops when resolving count or matching conditions across arrays; favor Map objects for single-pass O(N) evaluations when array length scale varies significantly.]
