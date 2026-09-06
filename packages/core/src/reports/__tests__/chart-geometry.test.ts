import { describe, expect, it } from 'vitest'
import {
  areaPath,
  axisTicks,
  bandBars,
  type ChartBox,
  linePath,
  niceMax,
  projectSeries,
  stackedPair,
} from '../chart-geometry'

const box: ChartBox = {
  width: 300,
  height: 100,
  padTop: 10,
  padBottom: 20,
  padLeft: 10,
  padRight: 10,
}

describe('niceMax', () => {
  it('rounds up to a readable axis top', () => {
    expect(niceMax(3847)).toBe(4000)
    expect(niceMax(760)).toBe(1000)
    expect(niceMax(120)).toBe(150)
    expect(niceMax(21)).toBe(25)
  })

  it('keeps the top close to the data instead of doubling it', () => {
    // El caso que motivó los escalones finos: 269 saltaba a 500 y la serie se
    // quedaba en la mitad de abajo del recuadro.
    expect(niceMax(269.33)).toBe(300)
    expect(niceMax(269.33) / 269.33).toBeLessThan(1.35)
  })

  it('never returns zero, so nothing divides by it', () => {
    expect(niceMax(0)).toBe(1)
    expect(niceMax(-5)).toBe(1)
    expect(niceMax(Number.NaN)).toBe(1)
  })
})

describe('axisTicks', () => {
  it('always includes the baseline and the top', () => {
    expect(axisTicks(1000, 2)).toEqual([0, 500, 1000])
  })
})

describe('projectSeries', () => {
  it('puts the max at the top of the plot and zero on the baseline', () => {
    const pts = projectSeries([0, 100], 100, box)
    expect(pts[0]?.y).toBe(box.height - box.padBottom) // 80
    expect(pts[1]?.y).toBe(box.padTop) // 10
  })

  it('spreads points across the full plot width', () => {
    const pts = projectSeries([1, 2, 3], 3, box)
    expect(pts[0]?.x).toBe(box.padLeft)
    expect(pts[2]?.x).toBe(box.width - box.padRight)
  })

  it('centres a lone point instead of pinning it to the left edge', () => {
    const pts = projectSeries([5], 5, box)
    expect(pts[0]?.x).toBe(box.padLeft + (box.width - box.padLeft - box.padRight) / 2)
  })

  it('does not let a negative value escape below the baseline', () => {
    const pts = projectSeries([-50], 100, box)
    expect(pts[0]?.y).toBe(box.height - box.padBottom)
  })
})

describe('linePath / areaPath', () => {
  it('draws straight segments, never curves', () => {
    const path = linePath(projectSeries([0, 50, 100], 100, box))
    expect(path.startsWith('M')).toBe(true)
    expect(path).toContain('L')
    expect(path).not.toMatch(/[CQS]/)
  })

  it('closes the area against the baseline', () => {
    const path = areaPath(projectSeries([10, 20], 100, box), box)
    expect(path.endsWith('Z')).toBe(true)
    expect(path).toContain(`,${box.height - box.padBottom}`)
  })

  it('returns empty string for an empty series instead of a broken path', () => {
    expect(linePath([])).toBe('')
    expect(areaPath([], box)).toBe('')
  })
})

describe('bandBars', () => {
  it('caps bar thickness so a wide chart does not get fat bars', () => {
    const bars = bandBars([1, 2], 2, { ...box, width: 1000 }, 0.55, 24)
    expect(bars[0]?.width).toBe(24)
  })

  it('leaves air in the band — the bar never fills its slot', () => {
    const bars = bandBars([1, 1, 1, 1, 1, 1, 1], 1, box)
    const band = (box.width - box.padLeft - box.padRight) / 7
    expect(bars[0]?.width).toBeLessThan(band)
  })

  it('grows every bar from the same baseline', () => {
    const bars = bandBars([10, 5], 10, box)
    const baseline = box.height - box.padBottom
    for (const b of bars) expect(b.y + b.height).toBeCloseTo(baseline, 5)
  })

  it('gives a zero value no height', () => {
    expect(bandBars([0, 10], 10, box)[0]?.height).toBe(0)
  })
})

describe('stackedPair', () => {
  it('splits proportionally and reserves the 2px surface gap', () => {
    const { aWidth, bWidth, gap } = stackedPair(75, 25, 202, 2)
    expect(gap).toBe(2)
    expect(aWidth + bWidth + gap).toBeCloseTo(202, 1)
    expect(aWidth).toBeCloseTo(150, 1)
  })

  it('drops the gap when only one side has value, so it fills the track', () => {
    const { aWidth, bWidth, gap } = stackedPair(10, 0, 100)
    expect(gap).toBe(0)
    expect(aWidth).toBe(100)
    expect(bWidth).toBe(0)
  })

  it('returns nothing to draw when both sides are zero', () => {
    expect(stackedPair(0, 0, 100)).toEqual({ aWidth: 0, bWidth: 0, gap: 0 })
  })
})
