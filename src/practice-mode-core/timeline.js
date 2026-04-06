import { getEffectiveBpm, getEffectiveScroll } from '../../TJARenderer/src/tja-parser.ts';
import { NoteType } from '../../TJARenderer/src/primitives.ts';
import { NOTE_SMALL_RADIUS } from './constants.js';

const JUDGE_PARTICLE_COUNT = 18;
const JUDGEABLE_NOTE_SET = new Set([NoteType.Don, NoteType.Ka, NoteType.DonBig, NoteType.KaBig]);

function toLaneNoteType(noteType) {
  if (noteType === NoteType.Don || noteType === NoteType.DonBig) return 'don';
  if (noteType === NoteType.Ka || noteType === NoteType.KaBig) return 'ka';
  return null;
}

function isBigNoteType(noteType) {
  return noteType === NoteType.DonBig || noteType === NoteType.KaBig;
}

export function buildJudgeParticles() {
  return Array.from({ length: JUDGE_PARTICLE_COUNT }, (_, idx) => {
    const angle = (Math.PI * 2 * idx) / JUDGE_PARTICLE_COUNT + (Math.random() - 0.5) * 0.2;
    return {
      angle,
      speed: 430 + Math.random() * 270,
      radius: 2.6 + Math.random() * 3.2
    };
  });
}

export function buildTimeline(playableChart, initialTimeMs = 0) {
  const bars = playableChart?.bars || [];
  const barParams = playableChart?.barParams || [];
  const referenceBpm = Math.max(1, getChartReferenceBpm(playableChart));

  const computeSpeedScale = (scroll, bpm) => {
    const safeScroll = Number.isFinite(scroll) ? scroll : 1;
    const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : referenceBpm;
    return Math.max(0.05, Math.abs(safeScroll) * (safeBpm / referenceBpm));
  };

  let currentMs = initialTimeMs;
  let noteOrdinal = 0;
  const notes = [];
  const barLines = [];
  const flatEvents = [];
  const scrollAnchors = [];

  const pushScrollAnchor = (timeMs, scroll) => {
    if (!Number.isFinite(timeMs) || !Number.isFinite(scroll)) return;
    const last = scrollAnchors[scrollAnchors.length - 1];
    if (last && Math.abs(last.timeMs - timeMs) < 0.0001) {
      last.scroll = scroll;
      return;
    }
    scrollAnchors.push({ timeMs, scroll });
  };

  for (let barIndex = 0; barIndex < bars.length; barIndex += 1) {
    const bar = bars[barIndex] || [];
    const params = barParams[barIndex];
    if (!params) {
      continue;
    }

    if (barIndex > 0) {
      const barStartScroll = getEffectiveScroll(params, 0);
      const barStartBpm = getEffectiveBpm(params, 0);
      barLines.push({
        id: `bar-${barIndex}`,
        timeMs: currentMs,
        scroll: barStartScroll,
        bpm: barStartBpm,
        speedScale: computeSpeedScale(barStartScroll, barStartBpm)
      });
    }

    pushScrollAnchor(currentMs, getEffectiveScroll(params, 0));

    const timingSlices = Math.max(1, bar.length);
    const charTimings = new Array(bar.length + 1).fill(0);
    const delayChanges = [...(params.delayChanges || [])].sort((a, b) => a.index - b.index);
    let delayCursor = 0;
    let elapsedMs = 0;
    for (let i = 0; i < timingSlices; i += 1) {
      while (delayCursor < delayChanges.length && delayChanges[delayCursor].index <= i) {
        elapsedMs += Math.max(0, delayChanges[delayCursor].delaySeconds * 1000);
        delayCursor += 1;
      }
      if (i < bar.length) {
        charTimings[i] = elapsedMs;
      }
      const bpm = getEffectiveBpm(params, Math.min(i, bar.length));
      const stepMs = ((params.measureRatio / timingSlices) * 240000) / bpm;
      elapsedMs += stepMs;
      if (i + 1 <= bar.length) {
        charTimings[i + 1] = elapsedMs;
      }
    }
    while (delayCursor < delayChanges.length && delayChanges[delayCursor].index <= timingSlices) {
      elapsedMs += Math.max(0, delayChanges[delayCursor].delaySeconds * 1000);
      delayCursor += 1;
      charTimings[bar.length] = elapsedMs;
    }

    const scrollChanges = [...(params.scrollChanges || [])].sort((a, b) => a.index - b.index);
    for (const change of scrollChanges) {
      const idx = Math.max(0, Math.min(bar.length, change.index));
      pushScrollAnchor(currentMs + charTimings[idx], change.scroll);
    }

    for (let charIndex = 0; charIndex < bar.length; charIndex += 1) {
      const note = bar[charIndex];
      const eventTimeMs = currentMs + charTimings[charIndex];
      const eventScroll = getEffectiveScroll(params, charIndex);
      const eventBpm = getEffectiveBpm(params, charIndex);
      const eventSpeedScale = computeSpeedScale(eventScroll, eventBpm);

      flatEvents.push({
        barIndex,
        charIndex,
        note,
        timeMs: eventTimeMs,
        scroll: eventScroll,
        bpm: eventBpm,
        speedScale: eventSpeedScale
      });

      if (!JUDGEABLE_NOTE_SET.has(note)) continue;
      const laneType = toLaneNoteType(note);
      if (!laneType) continue;
      noteOrdinal += 1;
      notes.push({
        id: `${barIndex}-${charIndex}-${noteOrdinal}`,
        type: laneType,
        isBig: isBigNoteType(note),
        scroll: eventScroll,
        bpm: eventBpm,
        speedScale: eventSpeedScale,
        timeMs: eventTimeMs,
        judged: false,
        result: null,
        delta: null
      });
    }

    currentMs += elapsedMs;
  }

  const rolls = [];
  const balloons = [];
  const balloonCounts = Array.isArray(playableChart?.balloonCounts) ? playableChart.balloonCounts : [];
  let balloonOrdinal = 0;
  for (let i = 0; i < flatEvents.length; i += 1) {
    const current = flatEvents[i];
    if (current.note === NoteType.Drumroll || current.note === NoteType.DrumrollBig) {
      let endTimeMs = currentMs;
      let endScroll = current.scroll;
      let endBpm = current.bpm;
      let endSpeedScale = current.speedScale;
      for (let j = i + 1; j < flatEvents.length; j += 1) {
        if (flatEvents[j].note === NoteType.End) {
          endTimeMs = flatEvents[j].timeMs;
          endScroll = Number.isFinite(flatEvents[j].scroll) ? flatEvents[j].scroll : endScroll;
          endBpm = Number.isFinite(flatEvents[j].bpm) ? flatEvents[j].bpm : endBpm;
          endSpeedScale = Number.isFinite(flatEvents[j].speedScale) ? flatEvents[j].speedScale : endSpeedScale;
          break;
        }
      }
      rolls.push({
        id: `roll-${current.barIndex}-${current.charIndex}`,
        isBig: current.note === NoteType.DrumrollBig,
        scrollStart: current.scroll,
        bpmStart: current.bpm,
        speedScaleStart: current.speedScale,
        scrollEnd: endScroll,
        bpmEnd: endBpm,
        speedScaleEnd: endSpeedScale,
        startMs: current.timeMs,
        endMs: Math.max(current.timeMs + 80, endTimeMs)
      });
    } else if (current.note === NoteType.Balloon || current.note === NoteType.Kusudama) {
      let endTimeMs = currentMs;
      for (let j = i + 1; j < flatEvents.length; j += 1) {
        if (flatEvents[j].note === NoteType.End) {
          endTimeMs = flatEvents[j].timeMs;
          break;
        }
      }
      const requiredHitsRaw = balloonCounts[balloonOrdinal];
      const requiredHits = Number.isFinite(requiredHitsRaw)
        ? Math.max(1, Math.floor(requiredHitsRaw))
        : (current.note === NoteType.Kusudama ? 20 : 5);
      balloonOrdinal += 1;
      balloons.push({
        id: `balloon-${current.barIndex}-${current.charIndex}`,
        isBig: current.note === NoteType.Kusudama,
        scroll: current.scroll,
        bpm: current.bpm,
        speedScale: current.speedScale,
        timeMs: current.timeMs,
        endMs: Math.max(current.timeMs + 320, endTimeMs),
        requiredHits,
        remainingHits: requiredHits,
        popped: false,
        pulseAtMs: null
      });
    }
  }

  return {
    durationMs: currentMs,
    notes,
    barLines,
    rolls,
    balloons,
    scrollAnchors
  };
}

function shiftTimeline(timeline, deltaMs) {
  if (!deltaMs) return timeline;
  return {
    ...timeline,
    durationMs: timeline.durationMs + deltaMs,
    notes: (timeline.notes || []).map((note) => ({ ...note, timeMs: note.timeMs + deltaMs })),
    barLines: (timeline.barLines || []).map((barLine) => ({ ...barLine, timeMs: barLine.timeMs + deltaMs })),
    rolls: (timeline.rolls || []).map((roll) => ({
      ...roll,
      startMs: roll.startMs + deltaMs,
      endMs: roll.endMs + deltaMs
    })),
    balloons: (timeline.balloons || []).map((balloon) => ({
      ...balloon,
      timeMs: balloon.timeMs + deltaMs,
      endMs: balloon.endMs + deltaMs,
      pulseAtMs: Number.isFinite(balloon.pulseAtMs) ? balloon.pulseAtMs + deltaMs : balloon.pulseAtMs
    })),
    scrollAnchors: (timeline.scrollAnchors || []).map((anchor) => ({
      ...anchor,
      timeMs: anchor.timeMs + deltaMs
    }))
  };
}

export function resolveTimelineAudioSync(timeline) {
  const firstNoteTimeMs = (timeline.notes || [])[0]?.timeMs;
  if (Number.isFinite(firstNoteTimeMs) && firstNoteTimeMs < 0) {
    return {
      timeline: shiftTimeline(timeline, -firstNoteTimeMs),
      audioSyncOffsetMs: firstNoteTimeMs
    };
  }
  return {
    timeline,
    audioSyncOffsetMs: 0
  };
}

export function getChartReferenceBpm(chart) {
  if (!chart) return 120;
  if (Number.isFinite(chart.bpm) && chart.bpm > 0) return chart.bpm;
  const firstParams = chart.barParams?.[0];
  if (firstParams && Number.isFinite(firstParams.initialBpm) && firstParams.initialBpm > 0) {
    return firstParams.initialBpm;
  }
  return 120;
}

export function computeScrollPxPerMsByBpm(referenceBpm) {
  const beat16Ms = 60000 / (referenceBpm * 4);
  const targetSpacingPx = NOTE_SMALL_RADIUS * 2;
  const value = targetSpacingPx / beat16Ms;
  return Math.max(0.2, Math.min(2.2, value));
}
