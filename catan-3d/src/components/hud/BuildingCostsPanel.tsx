const RECIPES: { label: string; cost: string }[] = [
  { label: 'Settlement', cost: '1 Lumber, 1 Brick, 1 Wool, 1 Grain' },
  { label: 'City', cost: '3 Ore, 2 Grain' },
  { label: 'Road', cost: '1 Lumber, 1 Brick' },
  { label: 'Dev Card', cost: '1 Ore, 1 Grain, 1 Wool' },
]

export function BuildingCostsPanel() {
  return (
    <div className="pointer-events-auto absolute top-20 left-4 w-52 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <span className="px-1 font-body text-[10px] tracking-[0.25em] text-white/50 uppercase">Building Costs</span>
      <div className="mt-2 flex flex-col gap-2">
        {RECIPES.map((recipe) => (
          <div key={recipe.label} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
            <div className="font-display text-xs text-gold/90">{recipe.label}</div>
            <div className="font-body text-[11px] text-white/65">{recipe.cost}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
