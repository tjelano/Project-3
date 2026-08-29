// Split out of ResourcePanel — City Walls was buried inside the "Cards in
// Hand" panel, easy to miss on a first playthrough (the user's own report:
// didn't notice it was even there until well into a match). Its own panel,
// stacked below ResourcePanel in the same right-side flow column
// GameHud.tsx already uses, so it doesn't need its own position tuning.
export function CityWallsPanel({
  ownCities,
  canBuildWallAt,
  onBuildWall,
  freeWallActive,
  onResolveFreeWall,
}: {
  // Vertex ids of every city the viewer owns — a wall can only ever go on
  // one of THEIR OWN cities, so each gets its own button rather than a
  // board picker.
  ownCities: string[]
  canBuildWallAt: (vertexId: string) => boolean
  onBuildWall: (vertexId: string) => void
  // Cities & Knights Engineering (Task 13) — true only while the viewer's
  // own free-wall pick (App.tsx's pendingFreeCityWall) is in progress. The
  // buttons below stay the SAME "Wall N" buttons Task 12 already renders —
  // Engineering doesn't get its own picker, just this affordance made free —
  // so this only changes which of onBuildWall/onResolveFreeWall the click
  // resolves through; canBuildWallAt (GameHud.tsx) already folds this same
  // flag into its own derivation, so the disabled state needs no separate
  // free-path prop here.
  freeWallActive: boolean
  onResolveFreeWall: (vertexId: string) => void
}) {
  // Only rendered once the viewer actually has a city to wall (GameHud.tsx
  // gates on citiesAndKnightsKnights && ownCities.length > 0), so a fresh
  // match never shows an empty panel.
  return (
    <div className="pointer-events-auto flex w-full flex-col gap-1 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <span className="font-body text-[10px] tracking-[0.2em] text-white/60 uppercase">City Walls</span>
      {/* One button per city the viewer already owns (ownCities arrives
          pre-sorted by vertex id, GameHud.tsx), each independently gated by
          canBuildWallAt (the same action-gate set every other HUD button
          applies, folded around ownership/no-existing-wall/board-wide-cap/
          affordability from game/knights.ts's canBuildCityWall). Labeled by
          ordinal position ("Wall 1", "Wall 2", ...) with the actual vertex
          id as a title tooltip — with 2+ un-walled cities (a normal
          midgame state) bare "Wall" text on every button would give no way
          to tell them apart. */}
      <div className="flex gap-1">
        {ownCities.map((vertexId, index) => (
          <button
            key={vertexId}
            type="button"
            title={vertexId}
            disabled={!canBuildWallAt(vertexId)}
            onClick={() => (freeWallActive ? onResolveFreeWall(vertexId) : onBuildWall(vertexId))}
            className="flex-1 rounded-full border border-glass-border bg-white/5 py-1 font-body text-[9px] tracking-[0.1em] text-white/70 uppercase transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-glass-border disabled:hover:text-white/70"
          >
            Wall {index + 1}
          </button>
        ))}
      </div>
    </div>
  )
}
