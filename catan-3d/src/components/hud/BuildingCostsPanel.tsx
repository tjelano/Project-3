import type { ResourceType } from '../../game/types'
import { CollapsibleSection } from './CollapsibleSection'
import oreIcon from '../../assets/icons/ore.jpeg'
import brickIcon from '../../assets/icons/brick.jpeg'
import grainIcon from '../../assets/icons/grain.jpeg'
import woolIcon from '../../assets/icons/wool.jpeg'
import lumberIcon from '../../assets/icons/lumber.jpeg'

const RESOURCE_ICONS: Record<ResourceType, string> = {
  lumber: lumberIcon,
  brick: brickIcon,
  wool: woolIcon,
  grain: grainIcon,
  ore: oreIcon,
}

const RECIPES: { label: string; cost: string; costs: { resource: ResourceType; count: number }[] }[] = [
  {
    label: 'Settlement',
    cost: '1 Lumber, 1 Brick, 1 Wool, 1 Grain',
    costs: [
      { resource: 'lumber', count: 1 },
      { resource: 'brick', count: 1 },
      { resource: 'wool', count: 1 },
      { resource: 'grain', count: 1 },
    ],
  },
  {
    label: 'City',
    cost: '3 Ore, 2 Grain',
    costs: [
      { resource: 'ore', count: 3 },
      { resource: 'grain', count: 2 },
    ],
  },
  {
    label: 'Road',
    cost: '1 Lumber, 1 Brick',
    costs: [
      { resource: 'lumber', count: 1 },
      { resource: 'brick', count: 1 },
    ],
  },
  {
    label: 'Dev Card',
    cost: '1 Ore, 1 Grain, 1 Wool',
    costs: [
      { resource: 'ore', count: 1 },
      { resource: 'grain', count: 1 },
      { resource: 'wool', count: 1 },
    ],
  },
]

export function BuildingCostsPanel() {
  return (
    <div className="pointer-events-auto w-full rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <CollapsibleSection icon="🔨" label="Building Costs" defaultOpen>
        <div className="flex flex-col gap-2">
          {RECIPES.map((recipe) => (
            <div key={recipe.label} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="font-display text-xs text-gold/90">{recipe.label}</span>
                <div className="flex flex-wrap items-center gap-1">
                  {recipe.costs.flatMap(({ resource, count }) =>
                    Array.from({ length: count }, (_, i) => (
                      <img
                        key={`${resource}-${i}`}
                        src={RESOURCE_ICONS[resource]}
                        alt={resource}
                        className="h-4 w-4 rounded-full border border-white/15 object-cover"
                      />
                    )),
                  )}
                </div>
              </div>
              <div className="font-body text-[11px] text-white/65">{recipe.cost}</div>
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  )
}
