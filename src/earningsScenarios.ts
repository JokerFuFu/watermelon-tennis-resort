import { estimateEarnings, getEarningsSettings } from './earnings'
import type { EarningsEstimate, Project } from './types'

export interface EarningsScenario {
  id: 'low' | 'base' | 'high'
  label: string
  occupancyRate: number
  estimate: EarningsEstimate
}

/** Compare temporary occupancy assumptions without changing the saved project. */
export function getEarningsScenarios(project: Project): EarningsScenario[] {
  const settings = getEarningsSettings(project)
  const definitions = [
    { id: 'low' as const, label: '较低入住率', difference: -10 },
    { id: 'base' as const, label: '当前入住率', difference: 0 },
    { id: 'high' as const, label: '较高入住率', difference: 10 },
  ]
  return definitions.map(({ id, label, difference }) => {
    const occupancyRate = Math.min(100, Math.max(0, settings.occupancyRate + difference))
    return { id, label, occupancyRate, estimate: estimateEarnings({ ...project, earnings: { ...settings, occupancyRate } }) }
  })
}
