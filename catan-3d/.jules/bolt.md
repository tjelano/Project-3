## 2025-02-05 - Use Map for fast player lookups in array update loops
**Learning:** Reconstructing an entire array via `Array.prototype.map` inside a loop that also searches using `Array.prototype.find` (O(N^2) complexity) creates a massive performance bottleneck.
**Action:** Before the loop, build a `Map` (keyed by ID). Inside the loop, retrieve elements via `Map.prototype.get` and update elements via `Map.prototype.set`, then reconstruct the array once after the loop completes using `Map.prototype.get` on the original list of IDs (or iterating the initial objects).
