## 2024-05-18 - React.memo() Failure with Inline Functions in R3F

**Learning:** When trying to memoize components in React Three Fiber (like `VertexSlot` and `EdgeSlot` inside `BoardInteractions`), wrapping them in `React.memo` is completely ineffective if parent components pass down inline arrow functions for event handlers (e.g. `onBuild={() => onBuildSettlement(vertex.id)}`). The new function reference on every render causes the shallow comparison to fail, defeating the optimization and potentially making performance worse.

**Action:** Refactor child components to accept raw IDs and call the handler themselves (e.g., `onClick={() => onBuild(vertex.id)}`), so the parent can pass a stable function reference (e.g. `onBuild={onBuildSettlement}`).

## 2024-08-08 - Optimize Player Lookup
**Learning:** Frequent array scans using `Array.prototype.find()` on small arrays can be 5-6x slower than using a `Map`. While N is small (3-4), calling it multiple times in renders and callbacks adds up overhead.
**Action:** Use a `Map` wrapped in `useMemo` for O(1) object lookups by ID when the array items are queried frequently by their identifier in React component loops and callbacks.
