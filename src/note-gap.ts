import * as Renderer from "tja-renderer";

const privateApi = Renderer.Private as unknown as {
  RENDERABLE_NOTES: string[];
  JUDGEABLE_NOTES: string[];
  getEffectiveBpm?: (barParams: unknown, charIdx: number) => number;
};

const { RENDERABLE_NOTES, JUDGEABLE_NOTES } = privateApi;
type ParsedChart = Renderer.Private.ParsedChart;

function resolveEffectiveBpm(barParams: unknown, charIdx: number): number {
  if (typeof privateApi.getEffectiveBpm === "function") {
    return privateApi.getEffectiveBpm(barParams, charIdx);
  }

  const bpm = (barParams as { bpm?: number } | undefined)?.bpm;
  return typeof bpm === "number" ? bpm : 120;
}

export interface GapOptions {
  /** If true, return null when the previous renderable note is not judgeable. */
  requireJudgeable?: boolean;
  /** Maximum gap in measures before returning null. Defaults to no limit. */
  maxMeasures?: number;
}

interface BarSegment {
  fraction: number;
  bpm: number;
}

/**
 * Walk backwards from (currentBarIdx, currentCharIdx) to the previous renderable note,
 * collecting per-bar segments with their measure fractions and BPMs.
 * Returns null if no previous note is found (or options filter it out).
 */
function getGapSegments(
  chart: ParsedChart,
  currentBarIdx: number,
  currentCharIdx: number,
  options: GapOptions = {},
): BarSegment[] | null {
  const { requireJudgeable = false, maxMeasures } = options;
  const currentBar = chart.bars[currentBarIdx];
  const currentTotal = currentBar.length;
  const currentParams = chart.barParams?.[currentBarIdx];
  if (!currentParams) return null;
  const currentRatio = currentParams.measureRatio;
  const currentBpm = resolveEffectiveBpm(currentParams, currentCharIdx);

  // Check within current bar
  for (let i = currentCharIdx - 1; i >= 0; i--) {
    if (RENDERABLE_NOTES.includes(currentBar[i])) {
      if (requireJudgeable && !JUDGEABLE_NOTES.includes(currentBar[i])) return null;
      const fraction = ((currentCharIdx - i) / currentTotal) * currentRatio;
      return [{ fraction, bpm: resolveEffectiveBpm(currentParams, i) }];
    }
  }

  // Accumulate across previous bars
  const segments: BarSegment[] = [{ fraction: (currentCharIdx / currentTotal) * currentRatio, bpm: currentBpm }];
  let totalMeasures = segments[0].fraction;

  for (let b = currentBarIdx - 1; b >= 0; b--) {
    const prevBar = chart.bars[b];
    const prevParams = chart.barParams?.[b];
    const prevRatio = prevParams?.measureRatio ?? 1.0;
    if (!prevParams) return null;
    const prevBpm = resolveEffectiveBpm(prevParams, prevBar?.length ?? 0);

    if (!prevBar || prevBar.length === 0) {
      if (maxMeasures !== undefined && totalMeasures + prevRatio > maxMeasures + 0.001) return null;
      segments.push({ fraction: prevRatio, bpm: prevBpm });
      totalMeasures += prevRatio;
      continue;
    }

    const prevTotal = prevBar.length;

    for (let i = prevTotal - 1; i >= 0; i--) {
      if (RENDERABLE_NOTES.includes(prevBar[i])) {
        if (requireJudgeable && !JUDGEABLE_NOTES.includes(prevBar[i])) return null;
        const distInPrev = ((prevTotal - i) / prevTotal) * prevRatio;
        const candidateTotal = totalMeasures + distInPrev;
        if (maxMeasures !== undefined && candidateTotal > maxMeasures + 0.0001) return null;
        segments.push({ fraction: distInPrev, bpm: resolveEffectiveBpm(prevParams, i) });
        return segments;
      }
    }

    if (maxMeasures !== undefined && totalMeasures + prevRatio > maxMeasures) return null;
    segments.push({ fraction: prevRatio, bpm: prevBpm });
    totalMeasures += prevRatio;
  }

  return null;
}

/** Get gap to previous renderable note in measure fractions. */
export function getGapMeasures(
  chart: ParsedChart,
  barIdx: number,
  charIdx: number,
  options: GapOptions = {},
): number | null {
  const segments = getGapSegments(chart, barIdx, charIdx, options);
  if (!segments) return null;
  let total = 0;
  for (const seg of segments) {
    total += seg.fraction;
  }
  return total;
}

/** Get gap to previous renderable note in milliseconds, using per-bar BPM. */
export function getGapMs(chart: ParsedChart, barIdx: number, charIdx: number, options: GapOptions = {}): number | null {
  const segments = getGapSegments(chart, barIdx, charIdx, options);
  if (!segments) return null;
  let totalMs = 0;
  for (const seg of segments) {
    totalMs += (seg.fraction * 240000) / seg.bpm;
  }
  return totalMs;
}