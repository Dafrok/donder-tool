import * as Renderer from 'tja-renderer';
import { getGapMs } from './note-gap.ts';

const { NoteType, RENDERABLE_NOTES, parseTJA } = Renderer.Private;
type ParsedChart = Renderer.Private.ParsedChart;

type NoteGaps = (number | null)[][];
type ChartGaps = Record<string, NoteGaps>;
type CourseGaps = ChartGaps | Record<string, ChartGaps>;
type ChartNoteTypes = Record<string, number[]>;
type CourseNoteTypes = ChartNoteTypes | Record<string, ChartNoteTypes>;

export interface TjaAnalysisJson {
  courses: Record<string, CourseGaps>;
  noteTypes: Record<string, CourseNoteTypes>;
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function computeNoteGaps(chart: ParsedChart): NoteGaps {
  const gaps: NoteGaps = [];

  for (let barIndex = 0; barIndex < chart.bars.length; barIndex++) {
    const bar = chart.bars[barIndex] || [];
    const barGaps: (number | null)[] = [];

    for (let charIndex = 0; charIndex < bar.length; charIndex++) {
      const note = bar[charIndex];
      if (!RENDERABLE_NOTES.includes(note)) {
        continue;
      }

      const gap = getGapMs(chart, barIndex, charIndex, { requireJudgeable: true });
      barGaps.push(gap !== null ? roundMs(gap) : null);
    }

    gaps.push(barGaps);
  }

  return gaps;
}

function simplifyNoteType(note: string): number | null {
  if (note === NoteType.Don || note === NoteType.DonBig) return 1;
  if (note === NoteType.Ka || note === NoteType.KaBig) return 2;
  return null;
}

function computeNoteTypes(chart: ParsedChart): number[] {
  const noteTypes: number[] = [];

  for (let barIndex = 0; barIndex < chart.bars.length; barIndex++) {
    const bar = chart.bars[barIndex] || [];
    for (let charIndex = 0; charIndex < bar.length; charIndex++) {
      const note = bar[charIndex];
      const simplified = simplifyNoteType(note);
      if (simplified !== null) {
        noteTypes.push(simplified);
      }
    }
  }

  return noteTypes;
}

function analyzeLeafChart(chart: ParsedChart): { gaps: ChartGaps; noteTypes: ChartNoteTypes } {
  if (!chart.branches) {
    return {
      gaps: { unbranched: computeNoteGaps(chart) },
      noteTypes: { unbranched: computeNoteTypes(chart) }
    };
  }

  const gaps: ChartGaps = {};
  const noteTypes: ChartNoteTypes = {};
  for (const [branchName, branchChart] of Object.entries(chart.branches)) {
    if (branchChart) {
      gaps[branchName] = computeNoteGaps(branchChart);
      noteTypes[branchName] = computeNoteTypes(branchChart);
    }
  }
  return { gaps, noteTypes };
}

function analyzeChart(chart: ParsedChart): { gaps: CourseGaps; noteTypes: CourseNoteTypes } {
  if (!chart.playerSides) {
    return analyzeLeafChart(chart);
  }

  const gaps: Record<string, ChartGaps> = {};
  const noteTypes: Record<string, ChartNoteTypes> = {};
  for (const [side, sideChart] of Object.entries(chart.playerSides)) {
    const analyzed = analyzeLeafChart(sideChart);
    gaps[side] = analyzed.gaps;
    noteTypes[side] = analyzed.noteTypes;
  }
  return { gaps, noteTypes };
}

export function analyzeTjaToJson(content: string): TjaAnalysisJson {
  const parsed = parseTJA(content);
  const courses: Record<string, CourseGaps> = {};
  const noteTypes: Record<string, CourseNoteTypes> = {};

  for (const [courseName, chart] of Object.entries(parsed)) {
    const analyzed = analyzeChart(chart);
    courses[courseName] = analyzed.gaps;
    noteTypes[courseName] = analyzed.noteTypes;
  }

  return { courses, noteTypes };
}
