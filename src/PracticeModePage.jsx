import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Select,
  Switch
} from '@fluentui/react-components';
import { DismissRegular, PauseRegular, PlayRegular } from '@fluentui/react-icons';
import JSZip from 'jszip';
import PracticeBreadcrumb from './practice-mode/PracticeBreadcrumb.jsx';
import PracticeToolbar from './practice-mode/PracticeToolbar.jsx';
import PracticeStage from './practice-mode/PracticeStage.jsx';
import { parseTJA } from '../TJARenderer/src/tja-parser.ts';
import {
  BAD_WINDOW,
  BALLOON_POP_FX_MS,
  BALLOON_PULSE_MS,
  BRANCH_SCROLL_THEME,
  DEFAULT_NOTE_SCROLL_PX_PER_MS,
  DON_KEYS,
  HIT_FLASH_MS,
  HIT_NOTE_FLY_MS,
  HIT_NOTE_HOLD_MS,
  JUDGE_FEEDBACK_MS,
  JUDGE_FLASH_MS,
  KA_KEYS,
  LANE_TARGET_X,
  MOBILE_TOOLBAR_BREAKPOINT,
  NOTE_SMALL_RADIUS,
  PRE_ROLL_MS,
  ROLL_COUNT_HOLD_MS,
  TOUCH_GUIDE_VIBRATION_MS,
  buildJudgeParticles,
  buildTimeline,
  computeScrollPxPerMsByBpm,
  decodeTjaBytes,
  extractWavePath,
  findBestCandidate,
  getAudioMimeType,
  getBranchOptions,
  getChartReferenceBpm,
  getCourseOptions,
  getHitResult,
  getPreferredBranchSelection,
  isAudioPath,
  joinPath,
  markExpiredMisses,
  normalizePath,
  pathBase,
  pathDir,
  readText,
  resolveChartByBranch,
  resolvePlayableChart,
  resolveTimelineAudioSync,
  summarizeResults
} from './practice-mode-core.js';

const PRACTICE_AUDIO_COMPENSATION_STORAGE_KEY = 'taiko-rating.practice.audio-compensation-ms.v1';
const PRACTICE_TOUCH_DRUM_OFFSET_X_STORAGE_KEY = 'taiko-rating.practice.touch-drum-offset-x.v1';
const PRACTICE_TOUCH_DRUM_OFFSET_Y_STORAGE_KEY = 'taiko-rating.practice.touch-drum-offset-y.v1';
const PRACTICE_TOUCH_DRUM_SCALE_STORAGE_KEY = 'taiko-rating.practice.touch-drum-scale-percent.v1';
const PRACTICE_TOUCH_BOTTOM_DEADZONE_STORAGE_KEY = 'taiko-rating.practice.touch-bottom-deadzone-px.v1';
const PRACTICE_TOUCH_BOTTOM_DEADZONE_MASK_HIDDEN_STORAGE_KEY = 'taiko-rating.practice.touch-bottom-deadzone-mask-hidden.v1';
const PRACTICE_DRIFT_MONITOR_VISIBLE_STORAGE_KEY = 'taiko-rating.practice.drift-monitor-visible.v1';
const PRACTICE_GLOBAL_SPEED_MULTIPLIER_STORAGE_KEY = 'taiko-rating.practice.global-speed-multiplier.v1';
const PRACTICE_SCROLL_SPEED_MULTIPLIER_STORAGE_KEY = 'taiko-rating.practice.scroll-speed-multiplier.v1';
const DRIFT_MONITOR_UPDATE_MS = 180;
const DRIFT_SMOOTH_FACTOR = 0.12;
const DRIFT_CORRECTION_MIN_RATIO = 0.55;
const DRIFT_CORRECTION_MAX_RATIO = 1.0;
const DRIFT_CORRECTION_RAMP_MS = 3500;
const DRIFT_BASELINE_FORCE_DELAY_MS = 320;
const DRIFT_INTEGRAL_ENABLE_AFTER_MS = 900;
const DRIFT_INTEGRAL_GAIN_PER_SEC = 0.38;
const DRIFT_INTEGRAL_LEAK_PER_SEC = 0.08;
const DRIFT_INTEGRAL_MAX_MS = 26;
const DRIFT_TARGET_DEADZONE_MS = 1;
const DRIFT_PERSISTENT_CHASE_GAIN_PER_SEC = 8.5;
const DRIFT_PERSISTENT_CHASE_MAX_STEP_MS = 6;
const DRIFT_PERSISTENT_CHASE_MAX_MS = 150;
const MAX_DRIFT_SAMPLE_MS = 220;
const MAX_DRIFT_CORRECTION_MS = 110;
const DRIFT_BASELINE_WARMUP_MS = 160;
const DRIFT_BASELINE_WINDOW_MS = 2200;
const DRIFT_BASELINE_MIN_SAMPLES = 12;
const DRIFT_BASELINE_ADAPT_FACTOR = 0.1;

const COURSE_LABEL_MAP = {
  edit: '魔王里',
  oni: '魔王',
  hard: '困难',
  normal: '普通',
  easy: '简单'
};

const BRANCH_LABEL_MAP = {
  normal: '普通谱面',
  expert: '玄人谱面',
  master: '达人谱面'
};

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}

function PracticeModePage() {
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const touchGuideCanvasRef = useRef(null);
  const rafRef = useRef(0);
  const playStartRef = useRef(0);
  const scheduledStartRef = useRef(0);
  const pausedAtMsRef = useRef(-PRE_ROLL_MS);
  const pendingResetAfterSeekRef = useRef(false);
  const missIgnoreBeforeMsRef = useRef(-Infinity);
  const suppressNotesBeforeMsRef = useRef(-Infinity);
  const hasUsedBarSeekRef = useRef(false);
  const audioStartTimerRef = useRef(0);
  const audioRef = useRef(typeof Audio !== 'undefined' ? new Audio() : null);
  const sfxCtxRef = useRef(null);
  const sfxCompressorRef = useRef(null);
  const sfxMasterGainRef = useRef(null);
  const sfxReverbSendRef = useRef(null);
  const sfxNoiseBufferRef = useRef(null);
  const hitFxRef = useRef([]);
  const judgeFxRef = useRef([]);
  const balloonFxRef = useRef([]);
  const hitNoteFxRef = useRef([]);
  const touchGuidePulseRef = useRef([]);
  const hitFxRafRef = useRef(0);
  const driftEstimateMsRef = useRef(0);
  const driftDisplayUpdateAtRef = useRef(0);
  const driftBaselineMsRef = useRef(0);
  const driftBaselineAppliedMsRef = useRef(0);
  const driftBaselineAccumMsRef = useRef(0);
  const driftBaselineSampleCountRef = useRef(0);
  const driftBaselineLockedRef = useRef(false);
  const driftBaselineForcedAtBarStartRef = useRef(false);
  const driftBaselineForceTargetMsRef = useRef(Number.POSITIVE_INFINITY);
  const driftResidualIntegralMsRef = useRef(0);
  const driftLastAudioElapsedMsRef = useRef(-1);
  const driftPersistentCorrectionMsRef = useRef(0);

  const [, setStatusText] = useState('准备就绪：导入本地 TJA 后点击开始。按键：F/J=咚，D/K=咔。');
  const [songTitle, setSongTitle] = useState('');
  const [difficultyText, setDifficultyText] = useState('');
  const [baseChartForBranch, setBaseChartForBranch] = useState(null);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [selectedCourseKey, setSelectedCourseKey] = useState('');
  const [courseChartsByKey, setCourseChartsByKey] = useState({});
  const [availableBranches, setAvailableBranches] = useState([]);
  const [branchSelection, setBranchSelection] = useState('master');
  const [notes, setNotes] = useState([]);
  const [barLines, setBarLines] = useState([]);
  const [rolls, setRolls] = useState([]);
  const [rollHitCounts, setRollHitCounts] = useState({});
  const [rollBalloonHits, setRollBalloonHits] = useState(0);
  const [streakHits, setStreakHits] = useState(0);
  const [balloons, setBalloons] = useState([]);
  const [durationMs, setDurationMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [nowMs, setNowMs] = useState(-PRE_ROLL_MS);
  const [scrollPxPerMs, setScrollPxPerMs] = useState(DEFAULT_NOTE_SCROLL_PX_PER_MS);
  const [chartStartOffsetMs, setChartStartOffsetMs] = useState(0);
  const [audioSyncOffsetMs, setAudioSyncOffsetMs] = useState(0);
  const [audioObjectUrl, setAudioObjectUrl] = useState('');
  const [audioMimeType, setAudioMimeType] = useState('');
  const [hitFxTick, setHitFxTick] = useState(0);
  const [clockDriftMs, setClockDriftMs] = useState(0);
  const [globalSpeedMultiplier, setGlobalSpeedMultiplier] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const raw = window.localStorage.getItem(PRACTICE_GLOBAL_SPEED_MULTIPLIER_STORAGE_KEY);
    const parsed = Number.parseFloat(String(raw ?? '1'));
    return Number.isFinite(parsed) ? roundToTwo(Math.max(0.1, Math.min(8, parsed))) : 1;
  });
  const [scrollSpeedMultiplier, setScrollSpeedMultiplier] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const raw = window.localStorage.getItem(PRACTICE_SCROLL_SPEED_MULTIPLIER_STORAGE_KEY);
    const parsed = Number.parseFloat(String(raw ?? '1'));
    return Number.isFinite(parsed) ? roundToTwo(Math.max(0.1, Math.min(8, parsed))) : 1;
  });
  const [isMobileToolbar, setIsMobileToolbar] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= MOBILE_TOOLBAR_BREAKPOINT : false
  ));
  const [touchAudioLatencyCompensationMs, setTouchAudioLatencyCompensationMs] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(PRACTICE_AUDIO_COMPENSATION_STORAGE_KEY);
    const parsed = Number.parseFloat(String(raw ?? '0'));
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const [touchDrumOffsetX, setTouchDrumOffsetX] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(PRACTICE_TOUCH_DRUM_OFFSET_X_STORAGE_KEY);
    const parsed = Number.parseFloat(String(raw ?? '0'));
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const [touchDrumOffsetY, setTouchDrumOffsetY] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(PRACTICE_TOUCH_DRUM_OFFSET_Y_STORAGE_KEY);
    const parsed = Number.parseFloat(String(raw ?? '0'));
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const [touchDrumScalePercent, setTouchDrumScalePercent] = useState(() => {
    if (typeof window === 'undefined') return 100;
    const raw = window.localStorage.getItem(PRACTICE_TOUCH_DRUM_SCALE_STORAGE_KEY);
    const parsed = Number.parseFloat(String(raw ?? '100'));
    return Number.isFinite(parsed) ? parsed : 100;
  });
  const [touchBottomDeadzonePx, setTouchBottomDeadzonePx] = useState(() => {
    if (typeof window === 'undefined') return 100;
    const raw = window.localStorage.getItem(PRACTICE_TOUCH_BOTTOM_DEADZONE_STORAGE_KEY);
    const parsed = Number.parseFloat(String(raw ?? '100'));
    return Number.isFinite(parsed) ? parsed : 100;
  });
  const [isTouchBottomDeadzoneMaskHidden, setIsTouchBottomDeadzoneMaskHidden] = useState(() => {
    if (typeof window === 'undefined') return false;
    const raw = window.localStorage.getItem(PRACTICE_TOUCH_BOTTOM_DEADZONE_MASK_HIDDEN_STORAGE_KEY);
    return raw === '1';
  });
  const [isDriftMonitorVisible, setIsDriftMonitorVisible] = useState(() => {
    if (typeof window === 'undefined') return false;
    const raw = window.localStorage.getItem(PRACTICE_DRIFT_MONITOR_VISIBLE_STORAGE_KEY);
    return raw === '1';
  });
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [isSpeedDialogOpen, setIsSpeedDialogOpen] = useState(false);
  const [compensationInputValue, setCompensationInputValue] = useState('0');
  const [touchDrumOffsetXInputValue, setTouchDrumOffsetXInputValue] = useState('0');
  const [touchDrumOffsetYInputValue, setTouchDrumOffsetYInputValue] = useState('0');
  const [touchDrumScaleInputValue, setTouchDrumScaleInputValue] = useState('100');
  const [touchBottomDeadzoneInputValue, setTouchBottomDeadzoneInputValue] = useState('100');
  const [hideTouchBottomDeadzoneMaskInputValue, setHideTouchBottomDeadzoneMaskInputValue] = useState(false);
  const [showDriftMonitorInputValue, setShowDriftMonitorInputValue] = useState(false);
  const [globalSpeedInputValue, setGlobalSpeedInputValue] = useState('1');
  const [scrollSpeedInputValue, setScrollSpeedInputValue] = useState('1');
  const [courseInputValue, setCourseInputValue] = useState('');
  const [branchInputValue, setBranchInputValue] = useState('master');

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const stopAudioPlayback = useCallback(() => {
    if (audioStartTimerRef.current) {
      window.clearTimeout(audioStartTimerRef.current);
      audioStartTimerRef.current = 0;
    }
    scheduledStartRef.current = 0;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.muted = false;
    }
  }, []);

  const pauseAudioPlayback = useCallback(() => {
    if (audioStartTimerRef.current) {
      window.clearTimeout(audioStartTimerRef.current);
      audioStartTimerRef.current = 0;
    }
    scheduledStartRef.current = 0;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.muted = false;
    }
  }, []);

  const resetPlayback = useCallback(() => {
    stopLoop();
    stopAudioPlayback();
    hitFxRef.current = [];
    judgeFxRef.current = [];
    balloonFxRef.current = [];
    hitNoteFxRef.current = [];
    touchGuidePulseRef.current = [];
    setIsPlaying(false);
    setIsPaused(false);
    setNowMs(-PRE_ROLL_MS);
    pausedAtMsRef.current = -PRE_ROLL_MS;
    missIgnoreBeforeMsRef.current = -Infinity;
    suppressNotesBeforeMsRef.current = -Infinity;
    hasUsedBarSeekRef.current = false;
    setNotes((prev) => prev.map((note) => ({ ...note, judged: false, result: null, delta: null })));
    setRollHitCounts({});
    setRollBalloonHits(0);
    setStreakHits(0);
    setBalloons((prev) => prev.map((balloon) => ({
      ...balloon,
      remainingHits: balloon.requiredHits,
      popped: false,
      pulseAtMs: null
    })));
    driftEstimateMsRef.current = 0;
    driftDisplayUpdateAtRef.current = 0;
    driftBaselineMsRef.current = 0;
    driftBaselineAppliedMsRef.current = 0;
    driftBaselineAccumMsRef.current = 0;
    driftBaselineSampleCountRef.current = 0;
    driftBaselineLockedRef.current = false;
    driftBaselineForcedAtBarStartRef.current = false;
    driftBaselineForceTargetMsRef.current = Number.POSITIVE_INFINITY;
    driftResidualIntegralMsRef.current = 0;
    driftLastAudioElapsedMsRef.current = -1;
    driftPersistentCorrectionMsRef.current = 0;
    setClockDriftMs(0);
    setHitFxTick((prev) => prev + 1);
    setStatusText('已重置，点击开始进行练习。');
  }, [stopLoop, stopAudioPlayback]);

  const pauseForDialogOpen = useCallback(() => {
    if (!isPlaying) return;
    const current = nowMs;
    pausedAtMsRef.current = current;
    setNowMs(current);
    setIsPlaying(false);
    setIsPaused(true);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (audioStartTimerRef.current) {
      window.clearTimeout(audioStartTimerRef.current);
      audioStartTimerRef.current = 0;
    }
    scheduledStartRef.current = 0;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.muted = false;
    }
    setStatusText('已暂停。');
  }, [isPlaying, nowMs]);

  const openSettingsDialog = useCallback(() => {
    pauseForDialogOpen();
    setCompensationInputValue(String(touchAudioLatencyCompensationMs));
    setTouchDrumOffsetXInputValue(String(touchDrumOffsetX));
    setTouchDrumOffsetYInputValue(String(touchDrumOffsetY));
    setTouchDrumScaleInputValue(String(touchDrumScalePercent));
    setTouchBottomDeadzoneInputValue(String(touchBottomDeadzonePx));
    setHideTouchBottomDeadzoneMaskInputValue(isTouchBottomDeadzoneMaskHidden);
    setShowDriftMonitorInputValue(isDriftMonitorVisible);
    setIsSettingsDialogOpen(true);
  }, [
    touchAudioLatencyCompensationMs,
    touchDrumOffsetX,
    touchDrumOffsetY,
    touchDrumScalePercent,
    touchBottomDeadzonePx,
    isTouchBottomDeadzoneMaskHidden,
    isDriftMonitorVisible,
    pauseForDialogOpen
  ]);

  const closeSettingsDialog = useCallback(() => {
    setIsSettingsDialogOpen(false);
  }, []);

  const openSpeedDialog = useCallback(() => {
    pauseForDialogOpen();
    setGlobalSpeedInputValue(globalSpeedMultiplier.toFixed(2));
    setScrollSpeedInputValue(scrollSpeedMultiplier.toFixed(2));
    const defaultCourseKey = selectedCourseKey || availableCourses[0]?.value || '';
    const defaultBranch = branchSelection || availableBranches[0] || 'master';
    setCourseInputValue(defaultCourseKey);
    setBranchInputValue(defaultBranch);
    setIsSpeedDialogOpen(true);
  }, [globalSpeedMultiplier, scrollSpeedMultiplier, selectedCourseKey, availableCourses, branchSelection, availableBranches, pauseForDialogOpen]);

  const closeSpeedDialog = useCallback(() => {
    setIsSpeedDialogOpen(false);
  }, []);

  const handleSettingsDialogOpenChange = useCallback((_, data) => {
    const nextOpen = Boolean(data?.open);
    if (nextOpen) {
      pauseForDialogOpen();
    }
    setIsSettingsDialogOpen(nextOpen);
  }, [pauseForDialogOpen]);

  const handleSpeedDialogOpenChange = useCallback((_, data) => {
    const nextOpen = Boolean(data?.open);
    if (nextOpen) {
      pauseForDialogOpen();
    }
    setIsSpeedDialogOpen(nextOpen);
  }, [pauseForDialogOpen]);

  const saveSpeedSetting = useCallback(() => {
    const parsedGlobal = Number.parseFloat(String(globalSpeedInputValue || '1'));
    const parsedScroll = Number.parseFloat(String(scrollSpeedInputValue || '1'));
    const safeGlobal = Number.isFinite(parsedGlobal) ? roundToTwo(Math.max(0.1, Math.min(8, parsedGlobal))) : 1;
    const safeScroll = Number.isFinite(parsedScroll) ? roundToTwo(Math.max(0.1, Math.min(8, parsedScroll))) : 1;

    const currentChartTime = isPaused ? pausedAtMsRef.current : nowMs;
    const requestedCourseKey = courseInputValue || selectedCourseKey;
    const requestedBranch = branchInputValue || branchSelection;

    let nextCourseKey = selectedCourseKey;
    let nextBaseChart = baseChartForBranch;
    let nextAvailableBranches = availableBranches;
    let nextBranchSelection = branchSelection;

    if (requestedCourseKey && courseChartsByKey[requestedCourseKey]) {
      nextCourseKey = requestedCourseKey;
      nextBaseChart = courseChartsByKey[requestedCourseKey];
      nextAvailableBranches = getBranchOptions(nextBaseChart);
      nextBranchSelection = nextAvailableBranches.includes(requestedBranch)
        ? requestedBranch
        : getPreferredBranchSelection(nextAvailableBranches);
    } else if (availableBranches.includes(requestedBranch)) {
      nextBranchSelection = requestedBranch;
    }

    const didCourseChange = nextCourseKey !== selectedCourseKey;
    const didBranchChange = nextBranchSelection !== branchSelection;
    const didGlobalSpeedChange = Math.abs(safeGlobal - globalSpeedMultiplier) > 0.0001;
    const shouldForceReset = didCourseChange || didBranchChange || didGlobalSpeedChange;

    setGlobalSpeedMultiplier(safeGlobal);
    setScrollSpeedMultiplier(safeScroll);

    if (didCourseChange) {
      setSelectedCourseKey(nextCourseKey);
      setDifficultyText(nextCourseKey.toUpperCase());
    }
    if (nextBaseChart !== baseChartForBranch) {
      setBaseChartForBranch(nextBaseChart);
      setAvailableBranches(nextAvailableBranches);
    }
    if (didBranchChange) {
      setBranchSelection(nextBranchSelection);
    }
    setCourseInputValue(nextCourseKey);
    setBranchInputValue(nextBranchSelection);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PRACTICE_GLOBAL_SPEED_MULTIPLIER_STORAGE_KEY, String(safeGlobal));
      window.localStorage.setItem(PRACTICE_SCROLL_SPEED_MULTIPLIER_STORAGE_KEY, String(safeScroll));
    }

    if (audioRef.current) {
      audioRef.current.playbackRate = safeGlobal;
    }

    if (shouldForceReset) {
      resetPlayback();
    } else if (isPlaying) {
      playStartRef.current = performance.now() - ((currentChartTime + touchAudioLatencyCompensationMs - audioSyncOffsetMs) / safeGlobal);
      scheduledStartRef.current = 0;
      setNowMs(currentChartTime);
    } else if (isPaused) {
      pausedAtMsRef.current = currentChartTime;
      setNowMs(currentChartTime);
    }

    setGlobalSpeedInputValue(safeGlobal.toFixed(2));
    setScrollSpeedInputValue(safeScroll.toFixed(2));

    setIsSpeedDialogOpen(false);
  }, [
    globalSpeedInputValue,
    scrollSpeedInputValue,
    courseInputValue,
    branchInputValue,
    selectedCourseKey,
    branchSelection,
    availableBranches,
    baseChartForBranch,
    courseChartsByKey,
    isPlaying,
    isPaused,
    nowMs,
    touchAudioLatencyCompensationMs,
    audioSyncOffsetMs,
    globalSpeedMultiplier,
    resetPlayback
  ]);

  const saveCompensationSetting = useCallback(() => {
    const parsed = Number.parseFloat(String(compensationInputValue || '0'));
    const safeValue = Number.isFinite(parsed) ? Math.max(-300, Math.min(300, parsed)) : 0;
    const parsedOffsetX = Number.parseFloat(String(touchDrumOffsetXInputValue || '0'));
    const parsedOffsetY = Number.parseFloat(String(touchDrumOffsetYInputValue || '0'));
    const parsedScale = Number.parseFloat(String(touchDrumScaleInputValue || '100'));
    const parsedDeadzone = Number.parseFloat(String(touchBottomDeadzoneInputValue || '100'));
    const safeOffsetX = Number.isFinite(parsedOffsetX) ? Math.max(-300, Math.min(300, parsedOffsetX)) : 0;
    const safeOffsetY = Number.isFinite(parsedOffsetY) ? Math.max(-300, Math.min(300, parsedOffsetY)) : 0;
    const safeScale = Number.isFinite(parsedScale) ? Math.max(10, Math.min(500, parsedScale)) : 100;
    const safeBottomDeadzone = Number.isFinite(parsedDeadzone) ? Math.max(0, Math.min(400, parsedDeadzone)) : 100;
    setTouchAudioLatencyCompensationMs(safeValue);
    setTouchDrumOffsetX(safeOffsetX);
    setTouchDrumOffsetY(safeOffsetY);
    setTouchDrumScalePercent(safeScale);
    setTouchBottomDeadzonePx(safeBottomDeadzone);
    setIsTouchBottomDeadzoneMaskHidden(hideTouchBottomDeadzoneMaskInputValue);
    setIsDriftMonitorVisible(showDriftMonitorInputValue);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(PRACTICE_AUDIO_COMPENSATION_STORAGE_KEY, String(safeValue));
      window.localStorage.setItem(PRACTICE_TOUCH_DRUM_OFFSET_X_STORAGE_KEY, String(safeOffsetX));
      window.localStorage.setItem(PRACTICE_TOUCH_DRUM_OFFSET_Y_STORAGE_KEY, String(safeOffsetY));
      window.localStorage.setItem(PRACTICE_TOUCH_DRUM_SCALE_STORAGE_KEY, String(safeScale));
      window.localStorage.setItem(PRACTICE_TOUCH_BOTTOM_DEADZONE_STORAGE_KEY, String(safeBottomDeadzone));
      window.localStorage.setItem(
        PRACTICE_TOUCH_BOTTOM_DEADZONE_MASK_HIDDEN_STORAGE_KEY,
        hideTouchBottomDeadzoneMaskInputValue ? '1' : '0'
      );
      window.localStorage.setItem(
        PRACTICE_DRIFT_MONITOR_VISIBLE_STORAGE_KEY,
        showDriftMonitorInputValue ? '1' : '0'
      );
    }
    setIsSettingsDialogOpen(false);
  }, [
    compensationInputValue,
    touchDrumOffsetXInputValue,
    touchDrumOffsetYInputValue,
    touchDrumScaleInputValue,
    touchBottomDeadzoneInputValue,
    hideTouchBottomDeadzoneMaskInputValue,
    showDriftMonitorInputValue
  ]);

  const summary = useMemo(() => summarizeResults(notes), [notes]);
  const ngCount = useMemo(() => summary.bad + summary.miss, [summary.bad, summary.miss]);

  const effectiveScrollPxPerMs = useMemo(() => {
    return scrollPxPerMs * scrollSpeedMultiplier;
  }, [scrollPxPerMs, scrollSpeedMultiplier]);

  const getSfxContext = useCallback(async () => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (sfxCtxRef.current && sfxCtxRef.current.state === 'closed') {
      sfxCtxRef.current = null;
      sfxCompressorRef.current = null;
      sfxMasterGainRef.current = null;
      sfxReverbSendRef.current = null;
      sfxNoiseBufferRef.current = null;
    }

    if (!sfxCtxRef.current) {
      const ctx = new AudioCtx();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -22;
      compressor.knee.value = 18;
      compressor.ratio.value = 3.2;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.11;

      const master = ctx.createGain();
      master.gain.value = 1.4;
      master.connect(compressor);

      const reverb = ctx.createConvolver();
      const reverbSeconds = 0.28;
      const reverbBuffer = ctx.createBuffer(2, Math.floor(ctx.sampleRate * reverbSeconds), ctx.sampleRate);
      for (let ch = 0; ch < 2; ch += 1) {
        const channel = reverbBuffer.getChannelData(ch);
        for (let i = 0; i < channel.length; i += 1) {
          const t = i / channel.length;
          const decay = Math.pow(1 - t, 2.6);
          channel[i] = (Math.random() * 2 - 1) * decay * 0.34;
        }
      }
      reverb.buffer = reverbBuffer;

      const reverbSend = ctx.createGain();
      reverbSend.gain.value = 0.18;

      reverbSend.connect(reverb);
      reverb.connect(compressor);
      compressor.connect(ctx.destination);

      const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.16), ctx.sampleRate);
      const channel = noiseBuffer.getChannelData(0);
      for (let i = 0; i < channel.length; i += 1) {
        channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length);
      }

      sfxCtxRef.current = ctx;
      sfxCompressorRef.current = compressor;
      sfxMasterGainRef.current = master;
      sfxReverbSendRef.current = reverbSend;
      sfxNoiseBufferRef.current = noiseBuffer;
    }

    if (sfxCtxRef.current.state === 'suspended') {
      try {
        await sfxCtxRef.current.resume();
      } catch (_) {
        // Ignore resume failures.
      }
    }

    return sfxCtxRef.current;
  }, []);

  const playInputSfx = useCallback(async (inputType) => {
    const ctx = await getSfxContext();
    const master = sfxMasterGainRef.current;
    const reverbSend = sfxReverbSendRef.current;
    const noiseBuffer = sfxNoiseBufferRef.current;
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    const connectVoice = (node, dry = 1, wet = 0.15) => {
      const dryGain = ctx.createGain();
      dryGain.gain.value = dry;
      node.connect(dryGain);
      dryGain.connect(master);
      if (reverbSend && wet > 0) {
        const wetGain = ctx.createGain();
        wetGain.gain.value = wet;
        node.connect(wetGain);
        wetGain.connect(reverbSend);
      }
    };

    const addModalResonance = (frequency, peakGain, decaySeconds, filterType = 'bandpass', qValue = 10) => {
      if (!noiseBuffer) return;
      const exciter = ctx.createBufferSource();
      exciter.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(frequency, now);
      filter.Q.setValueAtTime(filterType === 'bandpass' ? qValue : 0.7, now);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.exponentialRampToValueAtTime(peakGain, now + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, now + decaySeconds);
      exciter.connect(filter);
      filter.connect(env);
      connectVoice(env, 1, 0.12);
      exciter.start(now);
      exciter.stop(now + Math.min(0.12, decaySeconds + 0.03));
    };

    if (inputType === 'don') {
      const subOsc = ctx.createOscillator();
      const bodyOsc = ctx.createOscillator();
      const toneOsc = ctx.createOscillator();
      const donGain = ctx.createGain();
      const donFilter = ctx.createBiquadFilter();
      const donDrive = ctx.createWaveShaper();

      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i += 1) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 1.35);
      }
      donDrive.curve = curve;
      donDrive.oversample = '4x';

      donFilter.type = 'lowpass';
      donFilter.frequency.setValueAtTime(1250, now);
      donFilter.Q.setValueAtTime(0.65, now);

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(96, now);
      subOsc.frequency.exponentialRampToValueAtTime(82, now + 0.2);

      bodyOsc.type = 'sine';
      bodyOsc.frequency.setValueAtTime(142, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(108, now + 0.17);

      toneOsc.type = 'triangle';
      toneOsc.frequency.setValueAtTime(212, now);
      toneOsc.frequency.exponentialRampToValueAtTime(168, now + 0.12);

      donGain.gain.setValueAtTime(0.0001, now);
      donGain.gain.exponentialRampToValueAtTime(1.35, now + 0.003);
      donGain.gain.exponentialRampToValueAtTime(0.62, now + 0.04);
      donGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);

      subOsc.connect(donGain);
      bodyOsc.connect(donGain);
      toneOsc.connect(donGain);
      donGain.connect(donDrive);
      donDrive.connect(donFilter);
      connectVoice(donFilter, 1, 0.16);

      subOsc.start(now);
      bodyOsc.start(now);
      toneOsc.start(now);
      subOsc.stop(now + 0.24);
      bodyOsc.stop(now + 0.21);
      toneOsc.stop(now + 0.17);

      const fundamental = 156 * (1 + (Math.random() - 0.5) * 0.03);
      addModalResonance(fundamental, 0.42, 0.15, 'bandpass', 8);
      addModalResonance(fundamental * 1.56, 0.24, 0.11, 'bandpass', 9);

      if (noiseBuffer) {
        const stick = ctx.createBufferSource();
        stick.buffer = noiseBuffer;
        const stickFilter = ctx.createBiquadFilter();
        stickFilter.type = 'highpass';
        stickFilter.frequency.setValueAtTime(1350, now);
        const stickGain = ctx.createGain();
        stickGain.gain.setValueAtTime(0.0001, now);
        stickGain.gain.exponentialRampToValueAtTime(0.16, now + 0.0018);
        stickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.013);
        stick.connect(stickFilter);
        stickFilter.connect(stickGain);
        connectVoice(stickGain, 1, 0.02);
        stick.start(now);
        stick.stop(now + 0.016);
      }
    } else {
      const woodOscA = ctx.createOscillator();
      const woodOscB = ctx.createOscillator();
      const woodGain = ctx.createGain();
      const woodHP = ctx.createBiquadFilter();
      const woodPeak = ctx.createBiquadFilter();

      woodOscA.type = 'triangle';
      woodOscB.type = 'sine';
      woodOscA.frequency.setValueAtTime(1460, now);
      woodOscA.frequency.exponentialRampToValueAtTime(1180, now + 0.045);
      woodOscB.frequency.setValueAtTime(1980, now);
      woodOscB.frequency.exponentialRampToValueAtTime(1560, now + 0.036);

      woodHP.type = 'highpass';
      woodHP.frequency.setValueAtTime(760, now);
      woodPeak.type = 'peaking';
      woodPeak.frequency.setValueAtTime(1880, now);
      woodPeak.Q.setValueAtTime(0.95, now);
      woodPeak.gain.setValueAtTime(3.7, now);

      woodGain.gain.setValueAtTime(0.0001, now);
      woodGain.gain.exponentialRampToValueAtTime(0.56, now + 0.0015);
      woodGain.gain.exponentialRampToValueAtTime(0.15, now + 0.014);
      woodGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.046);

      woodOscA.connect(woodGain);
      woodOscB.connect(woodGain);
      woodGain.connect(woodHP);
      woodHP.connect(woodPeak);
      connectVoice(woodPeak, 1, 0.018);

      woodOscA.start(now);
      woodOscB.start(now);
      woodOscA.stop(now + 0.045);
      woodOscB.stop(now + 0.04);

      const rimFund = 980 * (1 + (Math.random() - 0.5) * 0.028);
      addModalResonance(rimFund, 0.2, 0.034, 'bandpass', 12);
      addModalResonance(rimFund * 1.36, 0.12, 0.025, 'bandpass', 13);

      if (noiseBuffer) {
        const rimStick = ctx.createBufferSource();
        rimStick.buffer = noiseBuffer;
        const rimHP = ctx.createBiquadFilter();
        const rimBP = ctx.createBiquadFilter();
        rimHP.type = 'highpass';
        rimHP.frequency.setValueAtTime(1400, now);
        rimBP.type = 'bandpass';
        rimBP.frequency.setValueAtTime(2480, now);
        rimBP.Q.setValueAtTime(1.7, now);
        const rimStickGain = ctx.createGain();
        rimStickGain.gain.setValueAtTime(0.0001, now);
        rimStickGain.gain.exponentialRampToValueAtTime(0.14, now + 0.0012);
        rimStickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.0095);
        rimStick.connect(rimHP);
        rimHP.connect(rimBP);
        rimBP.connect(rimStickGain);
        connectVoice(rimStickGain, 1, 0.002);
        rimStick.start(now);
        rimStick.stop(now + 0.01);
      }
    }
  }, [getSfxContext]);

  const pushHitFlash = useCallback((inputType) => {
    const ensureFxAnimation = () => {
      if (hitFxRafRef.current) {
        return;
      }

      const animateHitFx = () => {
        const nowPerf = performance.now();
        hitFxRef.current = hitFxRef.current.filter((fx) => nowPerf - fx.time <= HIT_FLASH_MS);
        judgeFxRef.current = judgeFxRef.current.filter((fx) => nowPerf - fx.time <= JUDGE_FEEDBACK_MS);
        balloonFxRef.current = balloonFxRef.current.filter((fx) => nowPerf - fx.time <= BALLOON_POP_FX_MS);
        hitNoteFxRef.current = hitNoteFxRef.current.filter((fx) => nowPerf - fx.time <= HIT_NOTE_FLY_MS);
        setHitFxTick((prev) => prev + 1);
        if (hitFxRef.current.length > 0 || judgeFxRef.current.length > 0 || balloonFxRef.current.length > 0 || hitNoteFxRef.current.length > 0) {
          hitFxRafRef.current = requestAnimationFrame(animateHitFx);
        } else {
          hitFxRafRef.current = 0;
        }
      };

      hitFxRafRef.current = requestAnimationFrame(animateHitFx);
    };

    const now = performance.now();
    hitFxRef.current = [...hitFxRef.current.filter((fx) => now - fx.time <= HIT_FLASH_MS), {
      time: now,
      type: inputType
    }];
    setHitFxTick((prev) => prev + 1);
    ensureFxAnimation();
  }, []);

  const pushJudgeFeedback = useCallback((result, deltaMs) => {
    const configMap = {
      perfect: { text: '良', fill: '#ffd65c', stroke: '#2a3342', burstColor: [255, 218, 92] },
      good: { text: '可', fill: '#ffffff', stroke: '#2a3342', burstColor: [255, 255, 255] },
      bad: { text: '不可', fill: '#6fb1ff', stroke: '#2a3342', burstColor: null }
    };
    const config = configMap[result];
    if (!config) return;

    const roundedDelta = Number.isFinite(deltaMs) ? Math.round(deltaMs) : null;
    const deltaText = Number.isFinite(roundedDelta)
      ? `${roundedDelta > 0 ? '+' : ''}${roundedDelta}ms`
      : '';
    const deltaFill = Number.isFinite(roundedDelta)
      ? (roundedDelta > 0 ? '#9fd4ff' : (roundedDelta < 0 ? '#ffc392' : '#ffffff'))
      : '#ffffff';

    const now = performance.now();
    judgeFxRef.current = [...judgeFxRef.current.filter((fx) => now - fx.time <= JUDGE_FEEDBACK_MS), {
      time: now,
      particles: config.burstColor ? buildJudgeParticles() : [],
      deltaText,
      deltaFill,
      deltaStroke: '#2a3342',
      ...config
    }];
    setHitFxTick((prev) => prev + 1);

    if (hitFxRafRef.current) {
      return;
    }

    const animateHitFx = () => {
      const nowPerf = performance.now();
      hitFxRef.current = hitFxRef.current.filter((fx) => nowPerf - fx.time <= HIT_FLASH_MS);
      judgeFxRef.current = judgeFxRef.current.filter((fx) => nowPerf - fx.time <= JUDGE_FEEDBACK_MS);
      balloonFxRef.current = balloonFxRef.current.filter((fx) => nowPerf - fx.time <= BALLOON_POP_FX_MS);
      hitNoteFxRef.current = hitNoteFxRef.current.filter((fx) => nowPerf - fx.time <= HIT_NOTE_FLY_MS);
      setHitFxTick((prev) => prev + 1);
      if (hitFxRef.current.length > 0 || judgeFxRef.current.length > 0 || balloonFxRef.current.length > 0 || hitNoteFxRef.current.length > 0) {
        hitFxRafRef.current = requestAnimationFrame(animateHitFx);
      } else {
        hitFxRafRef.current = 0;
      }
    };
    hitFxRafRef.current = requestAnimationFrame(animateHitFx);
  }, []);

  const pushRollComboFeedback = useCallback((nextCount) => {
    const now = performance.now();
    judgeFxRef.current = [...judgeFxRef.current.filter((fx) => now - fx.time <= JUDGE_FEEDBACK_MS && !fx.isRollCombo), {
      time: now,
      text: String(nextCount),
      fill: '#ffb66b',
      stroke: '#2a3342',
      burstColor: null,
      particles: [],
      fontSize: 40,
      isRollCombo: true
    }];
    setHitFxTick((prev) => prev + 1);

    if (hitFxRafRef.current) {
      return;
    }

    const animateHitFx = () => {
      const nowPerf = performance.now();
      hitFxRef.current = hitFxRef.current.filter((fx) => nowPerf - fx.time <= HIT_FLASH_MS);
      judgeFxRef.current = judgeFxRef.current.filter((fx) => nowPerf - fx.time <= JUDGE_FEEDBACK_MS);
      balloonFxRef.current = balloonFxRef.current.filter((fx) => nowPerf - fx.time <= BALLOON_POP_FX_MS);
      hitNoteFxRef.current = hitNoteFxRef.current.filter((fx) => nowPerf - fx.time <= HIT_NOTE_FLY_MS);
      setHitFxTick((prev) => prev + 1);
      if (hitFxRef.current.length > 0 || judgeFxRef.current.length > 0 || balloonFxRef.current.length > 0 || hitNoteFxRef.current.length > 0) {
        hitFxRafRef.current = requestAnimationFrame(animateHitFx);
      } else {
        hitFxRafRef.current = 0;
      }
    };
    hitFxRafRef.current = requestAnimationFrame(animateHitFx);
  }, []);

  const pushHitNoteFx = useCallback((note) => {
    const now = performance.now();
    const sideJitter = (Math.random() - 0.5) * 18;
    hitNoteFxRef.current = [
      ...hitNoteFxRef.current.filter((fx) => now - fx.time <= HIT_NOTE_FLY_MS),
      {
        time: now,
        type: note.type,
        isBig: note.isBig,
        sideJitter
      }
    ];
    setHitFxTick((prev) => prev + 1);

    if (hitFxRafRef.current) {
      return;
    }

    const animateHitFx = () => {
      const nowPerf = performance.now();
      hitFxRef.current = hitFxRef.current.filter((fx) => nowPerf - fx.time <= HIT_FLASH_MS);
      judgeFxRef.current = judgeFxRef.current.filter((fx) => nowPerf - fx.time <= JUDGE_FEEDBACK_MS);
      balloonFxRef.current = balloonFxRef.current.filter((fx) => nowPerf - fx.time <= BALLOON_POP_FX_MS);
      hitNoteFxRef.current = hitNoteFxRef.current.filter((fx) => nowPerf - fx.time <= HIT_NOTE_FLY_MS);
      setHitFxTick((prev) => prev + 1);
      if (hitFxRef.current.length > 0 || judgeFxRef.current.length > 0 || balloonFxRef.current.length > 0 || hitNoteFxRef.current.length > 0) {
        hitFxRafRef.current = requestAnimationFrame(animateHitFx);
      } else {
        hitFxRafRef.current = 0;
      }
    };
    hitFxRafRef.current = requestAnimationFrame(animateHitFx);
  }, []);

  const pushBalloonBurst = useCallback(() => {
    const now = performance.now();
    const particles = Array.from({ length: 22 }, (_, idx) => {
      const angle = (Math.PI * 2 * idx) / 22 + (Math.random() - 0.5) * 0.16;
      return {
        angle,
        speed: 300 + Math.random() * 260,
        radius: 2.8 + Math.random() * 3.2
      };
    });

    balloonFxRef.current = [...balloonFxRef.current.filter((fx) => now - fx.time <= BALLOON_POP_FX_MS), {
      time: now,
      particles
    }];
    setHitFxTick((prev) => prev + 1);

    if (hitFxRafRef.current) {
      return;
    }

    const animateHitFx = () => {
      const nowPerf = performance.now();
      hitFxRef.current = hitFxRef.current.filter((fx) => nowPerf - fx.time <= HIT_FLASH_MS);
      judgeFxRef.current = judgeFxRef.current.filter((fx) => nowPerf - fx.time <= JUDGE_FEEDBACK_MS);
      balloonFxRef.current = balloonFxRef.current.filter((fx) => nowPerf - fx.time <= BALLOON_POP_FX_MS);
      hitNoteFxRef.current = hitNoteFxRef.current.filter((fx) => nowPerf - fx.time <= HIT_NOTE_FLY_MS);
      setHitFxTick((prev) => prev + 1);
      if (hitFxRef.current.length > 0 || judgeFxRef.current.length > 0 || balloonFxRef.current.length > 0 || hitNoteFxRef.current.length > 0) {
        hitFxRafRef.current = requestAnimationFrame(animateHitFx);
      } else {
        hitFxRafRef.current = 0;
      }
    };
    hitFxRafRef.current = requestAnimationFrame(animateHitFx);
  }, []);

  const replaceAudioObjectUrl = useCallback((nextUrl) => {
    setAudioObjectUrl((prev) => {
      if (prev && prev !== nextUrl) {
        URL.revokeObjectURL(prev);
      }
      return nextUrl;
    });
  }, []);

  const rebuildTimelineByBranch = useCallback((baseChart, selectedBranch) => {
    const resolvedChart = resolveChartByBranch(baseChart, selectedBranch);
    if (!resolvedChart) {
      setNotes([]);
      setBarLines([]);
      setRolls([]);
      setRollHitCounts({});
      setRollBalloonHits(0);
      setStreakHits(0);
      setBalloons([]);
      setDurationMs(0);
      setScrollPxPerMs(DEFAULT_NOTE_SCROLL_PX_PER_MS);
      setAudioSyncOffsetMs(0);
      setIsPaused(false);
      pausedAtMsRef.current = -PRE_ROLL_MS;
      missIgnoreBeforeMsRef.current = -Infinity;
      suppressNotesBeforeMsRef.current = -Infinity;
      hasUsedBarSeekRef.current = false;
      driftBaselineForcedAtBarStartRef.current = false;
      driftBaselineForceTargetMsRef.current = Number.POSITIVE_INFINITY;
      driftResidualIntegralMsRef.current = 0;
      driftLastAudioElapsedMsRef.current = -1;
      driftPersistentCorrectionMsRef.current = 0;
      return;
    }

    const baseTimeline = buildTimeline(resolvedChart, chartStartOffsetMs);
    const { timeline, audioSyncOffsetMs: nextAudioSyncOffsetMs } = resolveTimelineAudioSync(baseTimeline);
    setNotes(timeline.notes || []);
    setBarLines(timeline.barLines || []);
    setRolls(timeline.rolls || []);
    setRollHitCounts({});
    setRollBalloonHits(0);
    setStreakHits(0);
    setBalloons(timeline.balloons || []);
    setDurationMs(timeline.durationMs || 0);
    setScrollPxPerMs(computeScrollPxPerMsByBpm(getChartReferenceBpm(resolvedChart)));
    setAudioSyncOffsetMs(nextAudioSyncOffsetMs);
    setNowMs(-PRE_ROLL_MS);
    setIsPaused(false);
    pausedAtMsRef.current = -PRE_ROLL_MS;
    missIgnoreBeforeMsRef.current = -Infinity;
    suppressNotesBeforeMsRef.current = -Infinity;
    hasUsedBarSeekRef.current = false;
    driftBaselineForcedAtBarStartRef.current = false;
    const firstTimelineNoteMs = (timeline.notes || [])[0]?.timeMs;
    driftBaselineForceTargetMsRef.current = Number.isFinite(firstTimelineNoteMs)
      ? firstTimelineNoteMs + DRIFT_BASELINE_FORCE_DELAY_MS
      : chartStartOffsetMs + DRIFT_BASELINE_FORCE_DELAY_MS;
    driftResidualIntegralMsRef.current = 0;
    driftLastAudioElapsedMsRef.current = -1;
    driftPersistentCorrectionMsRef.current = 0;
  }, [chartStartOffsetMs]);

  const getCurrentChartTimeMs = useCallback(() => {
    const nowPerf = performance.now();
    const perfClockMs = (nowPerf - playStartRef.current) * globalSpeedMultiplier + audioSyncOffsetMs - touchAudioLatencyCompensationMs;
    let current = perfClockMs;

    if (audioRef.current && audioObjectUrl) {
      // Keep using the pre-roll clock until the audio handoff timer finishes.
      if (scheduledStartRef.current) {
        current = nowPerf - scheduledStartRef.current + audioSyncOffsetMs - touchAudioLatencyCompensationMs;
      } else if (!audioRef.current.paused && Number.isFinite(audioRef.current.currentTime)) {
        const audioClockMs = audioRef.current.currentTime * 1000 + audioSyncOffsetMs - touchAudioLatencyCompensationMs;
        const audioElapsedMs = audioRef.current.currentTime * 1000;
        const rawDrift = Math.max(-MAX_DRIFT_SAMPLE_MS, Math.min(MAX_DRIFT_SAMPLE_MS, audioClockMs - perfClockMs));
        const smoothedDrift = driftEstimateMsRef.current + (rawDrift - driftEstimateMsRef.current) * DRIFT_SMOOTH_FACTOR;
        driftEstimateMsRef.current = smoothedDrift;

        const forceBaselineTargetMs = driftBaselineForceTargetMsRef.current;
        if (
          !driftBaselineForcedAtBarStartRef.current
          && Number.isFinite(forceBaselineTargetMs)
          && current >= forceBaselineTargetMs
        ) {
          driftBaselineMsRef.current = smoothedDrift;
          driftBaselineAppliedMsRef.current = smoothedDrift;
          driftBaselineAccumMsRef.current = smoothedDrift;
          driftBaselineSampleCountRef.current = 1;
          driftBaselineLockedRef.current = true;
          driftBaselineForcedAtBarStartRef.current = true;
        }

        if (audioElapsedMs >= DRIFT_BASELINE_WARMUP_MS && audioElapsedMs <= DRIFT_BASELINE_WINDOW_MS) {
          driftBaselineAccumMsRef.current += smoothedDrift;
          driftBaselineSampleCountRef.current += 1;
        }

        if (
          !driftBaselineLockedRef.current &&
          audioElapsedMs > DRIFT_BASELINE_WINDOW_MS &&
          driftBaselineSampleCountRef.current >= DRIFT_BASELINE_MIN_SAMPLES
        ) {
          driftBaselineMsRef.current = driftBaselineAccumMsRef.current / driftBaselineSampleCountRef.current;
          driftBaselineLockedRef.current = true;
        }

        const baselineTarget = driftBaselineLockedRef.current
          ? driftBaselineMsRef.current
          : (driftBaselineSampleCountRef.current > 0
            ? driftBaselineAccumMsRef.current / driftBaselineSampleCountRef.current
            : 0);
        driftBaselineAppliedMsRef.current += (baselineTarget - driftBaselineAppliedMsRef.current) * DRIFT_BASELINE_ADAPT_FACTOR;

        const residualDrift = smoothedDrift - driftBaselineAppliedMsRef.current;

        // Ramp correction strength during early playback so startup jitter is filtered,
        // then converge toward near-zero felt sync delta after lane starts rolling.
        const correctionRamp = Math.max(0, Math.min(1, audioElapsedMs / DRIFT_CORRECTION_RAMP_MS));
        const correctionRatio =
          DRIFT_CORRECTION_MIN_RATIO + (DRIFT_CORRECTION_MAX_RATIO - DRIFT_CORRECTION_MIN_RATIO) * correctionRamp;

        const residualCorrectionMs = Math.max(
          -MAX_DRIFT_CORRECTION_MS,
          Math.min(MAX_DRIFT_CORRECTION_MS, residualDrift * correctionRatio)
        );
        let integralCorrectionMs = driftResidualIntegralMsRef.current;
        const prevAudioElapsedMs = driftLastAudioElapsedMsRef.current;
        const deltaAudioMs = prevAudioElapsedMs >= 0
          ? Math.max(0, Math.min(120, audioElapsedMs - prevAudioElapsedMs))
          : 0;
        driftLastAudioElapsedMsRef.current = audioElapsedMs;
        if (deltaAudioMs > 0) {
          const dt = deltaAudioMs / 1000;
          driftResidualIntegralMsRef.current -= driftResidualIntegralMsRef.current * DRIFT_INTEGRAL_LEAK_PER_SEC * dt;
          if (audioElapsedMs >= DRIFT_INTEGRAL_ENABLE_AFTER_MS && driftBaselineForcedAtBarStartRef.current) {
            driftResidualIntegralMsRef.current += residualDrift * DRIFT_INTEGRAL_GAIN_PER_SEC * dt;
          }
          driftResidualIntegralMsRef.current = Math.max(
            -DRIFT_INTEGRAL_MAX_MS,
            Math.min(DRIFT_INTEGRAL_MAX_MS, driftResidualIntegralMsRef.current)
          );
          integralCorrectionMs = driftResidualIntegralMsRef.current;
        }
        // Apply learned baseline directly so fixed device offset truly affects chart clock,
        // then use capped residual correction plus integral and persistent chase terms.
        let persistentCorrectionMs = driftPersistentCorrectionMsRef.current;
        if (deltaAudioMs > 0) {
          const dt = deltaAudioMs / 1000;
          const provisionalCurrent =
            perfClockMs + driftBaselineAppliedMsRef.current + residualCorrectionMs + integralCorrectionMs + persistentCorrectionMs;
          const provisionalFeltDeltaMs = audioClockMs - provisionalCurrent;
          if (Math.abs(provisionalFeltDeltaMs) > DRIFT_TARGET_DEADZONE_MS) {
            const signedDeadzone = Math.sign(provisionalFeltDeltaMs) * DRIFT_TARGET_DEADZONE_MS;
            const chaseError = provisionalFeltDeltaMs - signedDeadzone;
            const chaseDeltaMs = Math.max(
              -DRIFT_PERSISTENT_CHASE_MAX_STEP_MS,
              Math.min(
                DRIFT_PERSISTENT_CHASE_MAX_STEP_MS,
                chaseError * DRIFT_PERSISTENT_CHASE_GAIN_PER_SEC * dt
              )
            );
            persistentCorrectionMs += chaseDeltaMs;
            persistentCorrectionMs = Math.max(
              -DRIFT_PERSISTENT_CHASE_MAX_MS,
              Math.min(DRIFT_PERSISTENT_CHASE_MAX_MS, persistentCorrectionMs)
            );
            driftPersistentCorrectionMsRef.current = persistentCorrectionMs;
          }
        }

        current =
          perfClockMs + driftBaselineAppliedMsRef.current + residualCorrectionMs + integralCorrectionMs + persistentCorrectionMs;
        const feltSyncDeltaMs = audioClockMs - current;

        if (nowPerf - driftDisplayUpdateAtRef.current >= DRIFT_MONITOR_UPDATE_MS) {
          driftDisplayUpdateAtRef.current = nowPerf;
          setClockDriftMs(Math.round(feltSyncDeltaMs));
        }
      }
    }

    return current;
  }, [audioObjectUrl, audioSyncOffsetMs, touchAudioLatencyCompensationMs, globalSpeedMultiplier]);

  const runFrame = useCallback(() => {
    const current = getCurrentChartTimeMs();
    const now = performance.now();
    hitFxRef.current = hitFxRef.current.filter((fx) => now - fx.time <= HIT_FLASH_MS);
    judgeFxRef.current = judgeFxRef.current.filter((fx) => now - fx.time <= JUDGE_FEEDBACK_MS);
    balloonFxRef.current = balloonFxRef.current.filter((fx) => now - fx.time <= BALLOON_POP_FX_MS);
    hitNoteFxRef.current = hitNoteFxRef.current.filter((fx) => now - fx.time <= HIT_NOTE_FLY_MS);
    setNowMs(current);

    setNotes((prev) => {
      const ignoreBeforeMs = Math.max(missIgnoreBeforeMsRef.current, suppressNotesBeforeMsRef.current);
      const { changed, next, missedCount } = markExpiredMisses(prev, current, ignoreBeforeMs);
      if (missedCount > 0) {
        setStreakHits(0);
      }
      return changed ? next : prev;
    });

    if (current > durationMs + BAD_WINDOW + 400) {
      setIsPlaying(false);
      setIsPaused(false);
      setStatusText('练习结束。可以重置后再次开始。');
      stopLoop();
      stopAudioPlayback();
      return;
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, [durationMs, stopLoop, stopAudioPlayback, getCurrentChartTimeMs]);

  const startPlayback = useCallback(() => {
    if (!notes.length) {
      setStatusText('请先导入一个可解析的 TJA。');
      return;
    }
    stopLoop();
    stopAudioPlayback();
    const scheduledStart = performance.now() + PRE_ROLL_MS;
    scheduledStartRef.current = scheduledStart;
    playStartRef.current = scheduledStart;
    setIsPlaying(true);
    setIsPaused(false);
    setNowMs(-PRE_ROLL_MS);
    driftEstimateMsRef.current = 0;
    driftDisplayUpdateAtRef.current = 0;
    driftBaselineMsRef.current = 0;
    driftBaselineAppliedMsRef.current = 0;
    driftBaselineAccumMsRef.current = 0;
    driftBaselineSampleCountRef.current = 0;
    driftBaselineLockedRef.current = false;
    driftBaselineForcedAtBarStartRef.current = false;
    const firstNoteMs = notes[0]?.timeMs;
    driftBaselineForceTargetMsRef.current = Number.isFinite(firstNoteMs)
      ? firstNoteMs + DRIFT_BASELINE_FORCE_DELAY_MS
      : chartStartOffsetMs + DRIFT_BASELINE_FORCE_DELAY_MS;
    driftResidualIntegralMsRef.current = 0;
    driftLastAudioElapsedMsRef.current = -1;
    driftPersistentCorrectionMsRef.current = 0;
    setClockDriftMs(0);
    setRollBalloonHits(0);
    setStreakHits(0);
    setRollHitCounts({});
    setNotes((prev) => prev.map((note) => ({ ...note, judged: false, result: null, delta: null })));
    setBalloons((prev) => prev.map((balloon) => ({
      ...balloon,
      remainingHits: balloon.requiredHits,
      popped: false,
      pulseAtMs: null
    })));
    hitFxRef.current = [];
    judgeFxRef.current = [];
    balloonFxRef.current = [];
    hitNoteFxRef.current = [];
    touchGuidePulseRef.current = [];
    setHitFxTick((prev) => prev + 1);
    pausedAtMsRef.current = -PRE_ROLL_MS;
    pendingResetAfterSeekRef.current = false;
    missIgnoreBeforeMsRef.current = -Infinity;
    suppressNotesBeforeMsRef.current = -Infinity;
    hasUsedBarSeekRef.current = false;
    setStatusText('开始练习：F/J=咚，D/K=咔。');
    void getSfxContext();
    if (audioRef.current && audioObjectUrl) {
      audioRef.current.src = audioObjectUrl;

      if (audioMimeType && !audioRef.current.canPlayType(audioMimeType)) {
        setStatusText(`当前浏览器可能不支持该音频格式（${audioMimeType}）。`);
      }

      audioRef.current.currentTime = 0;
      audioRef.current.muted = true;
      audioRef.current.playbackRate = globalSpeedMultiplier;
      audioRef.current.play().then(() => {
        audioStartTimerRef.current = window.setTimeout(() => {
          if (!audioRef.current) return;
          // Keep the gesture-unlocked playback session; restart from zero at pre-roll boundary.
          audioRef.current.currentTime = 0;
          audioRef.current.muted = false;
          // Use boundary time as fallback anchor when audio clock is temporarily unavailable.
          playStartRef.current = performance.now();
          scheduledStartRef.current = 0;
        }, PRE_ROLL_MS);
      }).catch(() => {
        setStatusText('音频播放被浏览器拦截，请再次点击“开始”重试。');
      });
    }
    rafRef.current = requestAnimationFrame(runFrame);
  }, [notes, chartStartOffsetMs, runFrame, stopLoop, stopAudioPlayback, audioObjectUrl, audioMimeType, getSfxContext, globalSpeedMultiplier]);

  const pausePlayback = useCallback(() => {
    if (!isPlaying) return;
    const current = getCurrentChartTimeMs();
    pausedAtMsRef.current = current;
    setNowMs(current);
    setIsPlaying(false);
    setIsPaused(true);
    stopLoop();
    pauseAudioPlayback();
    setStatusText('已暂停。');
  }, [isPlaying, getCurrentChartTimeMs, stopLoop, pauseAudioPlayback]);

  const resumePlayback = useCallback(() => {
    if (!isPaused) return;
    let resumeFromMs = pausedAtMsRef.current;
    let shouldResetFromFirstBar = false;

    if (hasUsedBarSeekRef.current && notes.length) {
      const barTimes = [
        chartStartOffsetMs,
        ...(barLines || []).map((barLine) => barLine.timeMs)
      ]
        .filter((timeMs) => Number.isFinite(timeMs))
        .sort((a, b) => a - b)
        .filter((timeMs, idx, arr) => idx === 0 || Math.abs(timeMs - arr[idx - 1]) > 0.5);

      if (barTimes.length) {
        const firstBarStart = barTimes[0];
        let currentBarStartIndex = 0;
        for (let i = 0; i < barTimes.length; i += 1) {
          if (barTimes[i] <= resumeFromMs + 1) {
            currentBarStartIndex = i;
          } else {
            break;
          }
        }

        const rewindIndex = Math.max(0, currentBarStartIndex - 1);
        const rewindTarget = barTimes[rewindIndex];
        const prepEnd = barTimes[rewindIndex + 1] ?? rewindTarget;
        suppressNotesBeforeMsRef.current = prepEnd > rewindTarget + 0.5 ? prepEnd : -Infinity;

        shouldResetFromFirstBar = Math.abs(rewindTarget - firstBarStart) <= 0.5;
        if (shouldResetFromFirstBar) {
          // Returning to the first bar from pause is treated as a full run reset.
          pendingResetAfterSeekRef.current = true;
          suppressNotesBeforeMsRef.current = -Infinity;
          missIgnoreBeforeMsRef.current = -Infinity;
        }

        if (!shouldResetFromFirstBar && Math.abs(rewindTarget - resumeFromMs) > 0.5) {
          pendingResetAfterSeekRef.current = true;
        }

        resumeFromMs = rewindTarget;
        pausedAtMsRef.current = rewindTarget;
        setNowMs(rewindTarget);
      }
    }

    if (shouldResetFromFirstBar) {
      hasUsedBarSeekRef.current = false;
      startPlayback();
      return;
    }

    hasUsedBarSeekRef.current = false;

    if (pendingResetAfterSeekRef.current) {
      setNotes((prev) => prev.map((note) => ({ ...note, judged: false, result: null, delta: null })));
      setRollHitCounts({});
      setRollBalloonHits(0);
      setStreakHits(0);
      setBalloons((prev) => prev.map((balloon) => ({
        ...balloon,
        remainingHits: balloon.requiredHits,
        popped: false,
        pulseAtMs: null
      })));
      hitFxRef.current = [];
      judgeFxRef.current = [];
      balloonFxRef.current = [];
      hitNoteFxRef.current = [];
      touchGuidePulseRef.current = [];
      setHitFxTick((prev) => prev + 1);
      pendingResetAfterSeekRef.current = false;
    }

    playStartRef.current = performance.now() - ((resumeFromMs + touchAudioLatencyCompensationMs - audioSyncOffsetMs) / globalSpeedMultiplier);
    scheduledStartRef.current = 0;

    if (audioRef.current && audioObjectUrl) {
      const nextAudioTime = Math.max(0, (resumeFromMs + touchAudioLatencyCompensationMs - audioSyncOffsetMs) / 1000);
      audioRef.current.currentTime = nextAudioTime;
      audioRef.current.muted = false;
      audioRef.current.playbackRate = globalSpeedMultiplier;
      audioRef.current.play().catch(() => {
        setStatusText('音频播放被浏览器拦截，请再次点击“继续”重试。');
      });
    }

    setIsPaused(false);
    setIsPlaying(true);
    setStatusText('继续播放。');
    rafRef.current = requestAnimationFrame(runFrame);
  }, [isPaused, notes.length, chartStartOffsetMs, barLines, audioObjectUrl, audioSyncOffsetMs, touchAudioLatencyCompensationMs, runFrame, startPlayback, globalSpeedMultiplier]);

  const seekToChartTime = useCallback((targetMs) => {
    if (!Number.isFinite(targetMs)) return;

    const clamped = Math.max(chartStartOffsetMs, Math.min(durationMs, targetMs));
    setNowMs(clamped);
    pausedAtMsRef.current = clamped;

    if (audioRef.current && audioObjectUrl) {
      const nextAudioTime = Math.max(0, (clamped + touchAudioLatencyCompensationMs - audioSyncOffsetMs) / 1000);
      audioRef.current.currentTime = nextAudioTime;
    }

    if (isPlaying) {
      playStartRef.current = performance.now() - ((clamped + touchAudioLatencyCompensationMs - audioSyncOffsetMs) / globalSpeedMultiplier);
      scheduledStartRef.current = 0;
    }
  }, [audioObjectUrl, audioSyncOffsetMs, touchAudioLatencyCompensationMs, chartStartOffsetMs, durationMs, isPlaying, globalSpeedMultiplier]);

  const seekByBarLine = useCallback((direction) => {
    if (!notes.length || !isPaused) return;
    hasUsedBarSeekRef.current = true;
    const step = direction >= 0 ? 1 : -1;
    const barTimes = [
      chartStartOffsetMs,
      ...(barLines || []).map((barLine) => barLine.timeMs)
    ]
      .filter((timeMs) => Number.isFinite(timeMs))
      .sort((a, b) => a - b)
      .filter((timeMs, idx, arr) => idx === 0 || Math.abs(timeMs - arr[idx - 1]) > 0.5);

    if (!barTimes.length) {
      seekToChartTime(step > 0 ? durationMs : chartStartOffsetMs);
      return;
    }

    const current = isPlaying
      ? getCurrentChartTimeMs()
      : (isPaused ? pausedAtMsRef.current : nowMs);

    const currentBarStartIndex = (() => {
      let idx = 0;
      for (let i = 0; i < barTimes.length; i += 1) {
        if (barTimes[i] <= current + 1) {
          idx = i;
        } else {
          break;
        }
      }
      return idx;
    })();

    let target;
    if (step > 0) {
      target = barTimes.find((timeMs) => timeMs > current + 1) ?? barTimes[barTimes.length - 1];
    } else {
      const rewindIndex = Math.max(0, currentBarStartIndex - 1);
      target = barTimes[rewindIndex];
    }
    // While paused seeking, always show the target bar notes; prep suppression is only for resume rollback.
    suppressNotesBeforeMsRef.current = -Infinity;

    if (target > current + 0.5) {
      missIgnoreBeforeMsRef.current = Math.max(missIgnoreBeforeMsRef.current, target);
    }

    const hasJumped = Math.abs(target - current) > 0.5;
    if (hasJumped) {
      pendingResetAfterSeekRef.current = true;
    }

    // Rewinding while paused should immediately show notes again on the lane.
    if (step < 0 && isPaused && hasJumped) {
      setNotes((prev) => prev.map((note) => ({ ...note, judged: false, result: null, delta: null })));
      setRollHitCounts({});
      setRollBalloonHits(0);
      setStreakHits(0);
      setBalloons((prev) => prev.map((balloon) => ({
        ...balloon,
        remainingHits: balloon.requiredHits,
        popped: false,
        pulseAtMs: null
      })));
      hitFxRef.current = [];
      judgeFxRef.current = [];
      balloonFxRef.current = [];
      hitNoteFxRef.current = [];
      touchGuidePulseRef.current = [];
      setHitFxTick((prev) => prev + 1);
      pendingResetAfterSeekRef.current = false;
    }

    seekToChartTime(target);
    if (isPaused) {
      setStatusText(`已暂停：已跳转到${step > 0 ? '下一' : '上一'}小节。`);
    }
  }, [notes.length, chartStartOffsetMs, barLines, durationMs, isPlaying, isPaused, getCurrentChartTimeMs, nowMs, seekToChartTime]);

  const handleInput = useCallback((inputType) => {
    if (!isPlaying) return;
    const current = getCurrentChartTimeMs();
    if (current < suppressNotesBeforeMsRef.current) return;

    if (inputType === 'don') {
      const activeIndex = balloons.findIndex((balloon) =>
        !balloon.popped && current >= balloon.timeMs && current <= balloon.endMs && balloon.remainingHits > 0
      );
      if (activeIndex >= 0) {
        const currentBalloon = balloons[activeIndex];
        const updated = [...balloons];
        const nextHits = Math.max(0, currentBalloon.remainingHits - 1);
        updated[activeIndex] = {
          ...currentBalloon,
          remainingHits: nextHits,
          popped: nextHits <= 0,
          pulseAtMs: current
        };
        setBalloons(updated);
        setRollBalloonHits((prev) => prev + 1);
        if (nextHits <= 0) {
          pushBalloonBurst();
        }
      }
    }

    const activeRoll = rolls.find((roll) => current >= roll.startMs && current <= roll.endMs);
    if (activeRoll) {
      setRollHitCounts((prev) => ({
        ...prev,
        [activeRoll.id]: (prev[activeRoll.id] || 0) + 1
      }));
      setRollBalloonHits((prev) => {
        const nextCount = prev + 1;
        pushRollComboFeedback(nextCount);
        return nextCount;
      });
    }

    const index = findBestCandidate(notes, current, inputType, suppressNotesBeforeMsRef.current);
    if (index < 0) return;

    const note = notes[index];
    const delta = current - note.timeMs;
    const result = getHitResult(Math.abs(delta));
    if (!result) return;

    if (result === 'perfect' || result === 'good') {
      setStreakHits((prev) => prev + 1);
    } else {
      setStreakHits(0);
    }

    const next = [...notes];
    next[index] = {
      ...note,
      judged: true,
      result,
      delta
    };
    setNotes(next);
    if (result === 'perfect' || result === 'good') {
      pushHitNoteFx(note);
    }
    pushJudgeFeedback(result, delta);
  }, [isPlaying, getCurrentChartTimeMs, notes, pushJudgeFeedback, pushRollComboFeedback, pushHitNoteFx, balloons, pushBalloonBurst, rolls]);

  const getTouchArcGeometry = useCallback((zoneWidth, zoneHeight) => {
    const width = Math.max(1, zoneWidth);
    const height = Math.max(1, zoneHeight);
    // Keep the drum centered in the lower touch zone and leave clear whitespace around it.
    const visualPadding = 18;
    const pulseScaleSafety = 1.05;
    const outerEffectSafety = 18;
    const defaultSafeRadiusByWidth = (width / 2 - visualPadding - outerEffectSafety) / pulseScaleSafety;
    const defaultSafeRadiusByHeight = (height / 2 - visualPadding - outerEffectSafety) / pulseScaleSafety;
    const baseRadius = Math.max(24, Math.min(width * 0.32, height * 0.42, defaultSafeRadiusByWidth, defaultSafeRadiusByHeight));
    const centerX = Math.max(0, Math.min(width, width / 2 + touchDrumOffsetX));
    const centerY = Math.max(0, Math.min(height, height / 2 + touchDrumOffsetY));

    const scaledRadius = baseRadius * (touchDrumScalePercent / 100);
    const arcRadius = Math.max(8, scaledRadius);
    return {
      centerX,
      centerY,
      radius: arcRadius
    };
  }, [touchDrumOffsetX, touchDrumOffsetY, touchDrumScalePercent]);

  const triggerInputFeedback = useCallback((inputType) => {
    if (!isPlaying) {
      if (isPaused) {
        resumePlayback();
      } else if (notes.length) {
        startPlayback();
      } else {
        const now = performance.now();
        touchGuidePulseRef.current = [
          ...touchGuidePulseRef.current.filter((pulse) => now - pulse.time <= TOUCH_GUIDE_VIBRATION_MS),
          { time: now, type: inputType }
        ];
        pushHitFlash(inputType);
        void playInputSfx(inputType);
      }
      return;
    }

    const now = performance.now();
    touchGuidePulseRef.current = [
      ...touchGuidePulseRef.current.filter((pulse) => now - pulse.time <= TOUCH_GUIDE_VIBRATION_MS),
      { time: now, type: inputType }
    ];
    pushHitFlash(inputType);
    void playInputSfx(inputType);
    handleInput(inputType);
  }, [isPlaying, isPaused, notes.length, resumePlayback, startPlayback, pushHitFlash, playInputSfx, handleInput]);

  const handlePracticePointerDown = useCallback((event) => {
    const frame = event.currentTarget;
    if (!frame) return;
    const touchCanvasRect = touchGuideCanvasRef.current?.getBoundingClientRect?.();
    if (!touchCanvasRect) return;

    // Only touch interactions inside the touch-guide canvas should trigger drum feedback.
    const isInsideTouchZone = (
      event.clientX >= touchCanvasRect.left &&
      event.clientX <= touchCanvasRect.right &&
      event.clientY >= touchCanvasRect.top &&
      event.clientY <= touchCanvasRect.bottom
    );
    if (!isInsideTouchZone) {
      return;
    }

    const deadzoneTopClientY = touchCanvasRect.bottom - touchBottomDeadzonePx;
    if (event.clientY >= deadzoneTopClientY) {
      event.preventDefault();
      return;
    }

    const frameRect = frame.getBoundingClientRect();
    const localX = event.clientX - frameRect.left;
    const localY = event.clientY - frameRect.top;

    const zoneOffsetX = touchCanvasRect.left - frameRect.left;
    const zoneOffsetY = touchCanvasRect.top - frameRect.top;
    const zoneX = localX - zoneOffsetX;
    const zoneY = localY - zoneOffsetY;

    const arc = getTouchArcGeometry(touchCanvasRect.width, touchCanvasRect.height);
    const deadzoneTop = Math.max(0, touchCanvasRect.height - touchBottomDeadzonePx);
    if (zoneY >= deadzoneTop) {
      event.preventDefault();
      return;
    }
    const dx = zoneX - arc.centerX;
    const dy = zoneY - arc.centerY;
    const isDon = dx * dx + dy * dy <= arc.radius * arc.radius;

    event.preventDefault();

    triggerInputFeedback(isDon ? 'don' : 'ka');
  }, [
    getTouchArcGeometry,
    touchBottomDeadzonePx,
    triggerInputFeedback
  ]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = String(event.key || '').toLowerCase();
      if (DON_KEYS.has(key)) {
        event.preventDefault();
        triggerInputFeedback('don');
      } else if (KA_KEYS.has(key)) {
        event.preventDefault();
        triggerInputFeedback('ka');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [triggerInputFeedback]);

  useEffect(() => {
    if (!isPlaying && !isPaused) {
      stopLoop();
      stopAudioPlayback();
    }
  }, [isPlaying, isPaused, stopLoop, stopAudioPlayback]);

  useEffect(() => {
    return () => {
      stopLoop();
      stopAudioPlayback();
      replaceAudioObjectUrl('');
      if (hitFxRafRef.current) {
        cancelAnimationFrame(hitFxRafRef.current);
        hitFxRafRef.current = 0;
      }
      if (sfxCtxRef.current) {
        sfxCtxRef.current.close().catch(() => {});
        sfxCtxRef.current = null;
        sfxCompressorRef.current = null;
        sfxMasterGainRef.current = null;
        sfxReverbSendRef.current = null;
        sfxNoiseBufferRef.current = null;
      }
    };
  }, [stopLoop, stopAudioPlayback, replaceAudioObjectUrl]);

  useEffect(() => {
    if (!baseChartForBranch) return;
    stopLoop();
    stopAudioPlayback();
    setIsPlaying(false);
    setIsPaused(false);
    rebuildTimelineByBranch(baseChartForBranch, branchSelection);
  }, [baseChartForBranch, branchSelection, rebuildTimelineByBranch, stopLoop, stopAudioPlayback]);

  const applyImportedTjaText = useCallback((tjaText, fileLabel, audioBlob = null) => {
    const parsed = parseTJA(tjaText);
    const courseEntries = getCourseOptions(parsed);
    if (!courseEntries.length) {
      throw new Error('未解析到任何有效难度。');
    }

    const selectableCourses = courseEntries
      .map((entry) => ({
        ...entry,
        playableChart: resolvePlayableChart(entry.chart)
      }))
      .filter((entry) => Boolean(entry.playableChart));

    if (!selectableCourses.length) {
      throw new Error('未找到可游玩的单人谱面。');
    }

    const initialCourse = selectableCourses[0];
    const playableChart = initialCourse.playableChart;

    const branchOptions = getBranchOptions(playableChart);
    const initialBranchSelection = getPreferredBranchSelection(branchOptions);
    const resolvedChart = resolveChartByBranch(playableChart, initialBranchSelection);
    const headerOffsetSec = Number.parseFloat(String(playableChart.headers?.OFFSET || '0'));
    const resolvedChartStartOffsetMs = Number.isFinite(headerOffsetSec) ? -headerOffsetSec * 1000 : 0;
    const baseTimeline = buildTimeline(resolvedChart, resolvedChartStartOffsetMs);
    const { timeline, audioSyncOffsetMs: nextAudioSyncOffsetMs } = resolveTimelineAudioSync(baseTimeline);
    if (!timeline.notes.length) {
      throw new Error('该谱面没有可判定音符。');
    }

    const audioUrl = audioBlob ? URL.createObjectURL(audioBlob) : '';
    replaceAudioObjectUrl(audioUrl);
    setAudioMimeType(audioBlob?.type || '');

    const nextAvailableCourses = selectableCourses.map((entry) => ({
      value: entry.normalizedKey,
      label: COURSE_LABEL_MAP[entry.normalizedKey] || String(entry.originalKey || entry.normalizedKey).toUpperCase()
    }));
    const nextCourseChartsByKey = selectableCourses.reduce((acc, entry) => {
      acc[entry.normalizedKey] = entry.playableChart;
      return acc;
    }, {});

    setSongTitle(playableChart.title || fileLabel.replace(/\.tja$/i, ''));
    setDifficultyText(initialCourse.normalizedKey.toUpperCase());
    setBaseChartForBranch(playableChart);
    setAvailableCourses(nextAvailableCourses);
    setSelectedCourseKey(initialCourse.normalizedKey);
    setCourseChartsByKey(nextCourseChartsByKey);
    setAvailableBranches(branchOptions);
    setBranchSelection(initialBranchSelection);
    setCourseInputValue(initialCourse.normalizedKey);
    setBranchInputValue(initialBranchSelection);
    setChartStartOffsetMs(resolvedChartStartOffsetMs);
    setAudioSyncOffsetMs(nextAudioSyncOffsetMs);
    setNotes(timeline.notes);
    setBarLines(timeline.barLines || []);
    setRolls(timeline.rolls || []);
    setBalloons(timeline.balloons || []);
    const firstTimelineNoteMs = (timeline.notes || [])[0]?.timeMs;
    driftBaselineForceTargetMsRef.current = Number.isFinite(firstTimelineNoteMs)
      ? firstTimelineNoteMs + DRIFT_BASELINE_FORCE_DELAY_MS
      : resolvedChartStartOffsetMs + DRIFT_BASELINE_FORCE_DELAY_MS;
    driftResidualIntegralMsRef.current = 0;
    driftLastAudioElapsedMsRef.current = -1;
    driftPersistentCorrectionMsRef.current = 0;
    setRollBalloonHits(0);
    setStreakHits(0);
    setDurationMs(timeline.durationMs);
    setScrollPxPerMs(computeScrollPxPerMsByBpm(getChartReferenceBpm(resolvedChart)));
    setNowMs(-PRE_ROLL_MS);

    const audioHint = audioBlob ? '，已加载音频' : '，未找到音频';
    setStatusText(`导入成功：${timeline.notes.length} 个可判定音符${audioHint}。点击开始即可游玩。`);
  }, [replaceAudioObjectUrl]);

  const importFromZip = useCallback(async (zipFile) => {
    const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
    const allFiles = Object.values(zip.files).filter((entry) => !entry.dir);
    const tjaEntries = allFiles.filter((entry) => normalizePath(entry.name).toLowerCase().endsWith('.tja'));
    if (!tjaEntries.length) {
      throw new Error('ZIP 中未找到 .tja 文件。');
    }

    const selectedTja = tjaEntries[0];
    const tjaBytes = await selectedTja.async('uint8array');
    const tjaText = decodeTjaBytes(tjaBytes);

    const fileMap = new Map();
    for (const entry of allFiles) {
      fileMap.set(normalizePath(entry.name).toLowerCase(), entry);
    }

    const wavePath = extractWavePath(tjaText);
    let audioEntry = null;
    if (wavePath) {
      const resolvedPath = joinPath(pathDir(selectedTja.name), wavePath).toLowerCase();
      audioEntry = fileMap.get(resolvedPath) || null;
    }

    if (!audioEntry) {
      audioEntry = allFiles.find((entry) => isAudioPath(entry.name)) || null;
    }

    let audioBlob = null;
    if (audioEntry) {
      const bytes = await audioEntry.async('uint8array');
      audioBlob = new Blob([bytes], { type: getAudioMimeType(audioEntry.name) });
    }
    applyImportedTjaText(tjaText, pathBase(selectedTja.name), audioBlob);
  }, [applyImportedTjaText]);

  const importLocalCharts = useCallback(async (event) => {
    const file = Array.from(event.target.files || [])[0];
    event.target.value = '';

    if (!file) {
      setStatusText('请选择 .tja 或 .zip 文件。');
      return;
    }

    stopLoop();
    stopAudioPlayback();
    setIsPlaying(false);
    setIsPaused(false);

    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.zip')) {
        await importFromZip(file);
      } else if (lowerName.endsWith('.tja')) {
        const text = await readText(file);
        applyImportedTjaText(text, file.name, null);
      } else {
        throw new Error('仅支持 .tja 或 .zip 文件。');
      }
    } catch (error) {
      setStatusText(`导入失败：${error?.message || String(error)}`);
      setBaseChartForBranch(null);
      setAvailableCourses([]);
      setSelectedCourseKey('');
      setCourseChartsByKey({});
      setAvailableBranches([]);
      setBranchSelection('master');
      setCourseInputValue('');
      setBranchInputValue('master');
      setChartStartOffsetMs(0);
      setAudioSyncOffsetMs(0);
      setNotes([]);
      setBarLines([]);
      setRolls([]);
      setBalloons([]);
      driftBaselineForceTargetMsRef.current = Number.POSITIVE_INFINITY;
      driftResidualIntegralMsRef.current = 0;
      driftLastAudioElapsedMsRef.current = -1;
      driftPersistentCorrectionMsRef.current = 0;
      setRollBalloonHits(0);
      setStreakHits(0);
      setDurationMs(0);
      setScrollPxPerMs(DEFAULT_NOTE_SCROLL_PX_PER_MS);
      replaceAudioObjectUrl('');
      setAudioMimeType('');
      setSongTitle('');
      setDifficultyText('');
      setIsPaused(false);
      pausedAtMsRef.current = -PRE_ROLL_MS;
      missIgnoreBeforeMsRef.current = -Infinity;
      suppressNotesBeforeMsRef.current = -Infinity;
      hasUsedBarSeekRef.current = false;
    }
  }, [stopLoop, stopAudioPlayback, importFromZip, applyImportedTjaText, replaceAudioObjectUrl]);

  const visibleNotes = useMemo(() => {
    return notes
      .filter((note) => note.timeMs >= suppressNotesBeforeMsRef.current)
      .filter((note) => !note.judged || note.result === 'miss')
      .map((note) => {
        const noteScroll = Number.isFinite(note.scroll) ? note.scroll : 1;
        const direction = noteScroll < 0 ? -1 : 1;
        const speedScale = Number.isFinite(note.speedScale)
          ? Math.max(0.05, note.speedScale)
          : Math.max(0.05, Math.abs(noteScroll));
        const x = LANE_TARGET_X + (note.timeMs - nowMs) * effectiveScrollPxPerMs * speedScale * direction;
        return {
          ...note,
          x
        };
      })
      .filter((note) => note.x > -60 && note.x < 1800);
  }, [notes, nowMs, effectiveScrollPxPerMs]);

  const visibleBarLines = useMemo(() => {
    return barLines
      .map((barLine) => {
        const lineScroll = Number.isFinite(barLine.scroll) ? barLine.scroll : 1;
        const direction = lineScroll < 0 ? -1 : 1;
        const speedScale = Number.isFinite(barLine.speedScale)
          ? Math.max(0.05, barLine.speedScale)
          : Math.max(0.05, Math.abs(lineScroll));
        return {
          ...barLine,
          x: LANE_TARGET_X + (barLine.timeMs - nowMs) * effectiveScrollPxPerMs * speedScale * direction
        };
      })
      .filter((barLine) => barLine.x > -80 && barLine.x < 1920);
  }, [barLines, nowMs, effectiveScrollPxPerMs]);

  const visibleRolls = useMemo(() => {
    return rolls
      .map((roll) => {
        const startScroll = Number.isFinite(roll.scrollStart) ? roll.scrollStart : 1;
        const endScroll = Number.isFinite(roll.scrollEnd) ? roll.scrollEnd : startScroll;
        const startDirection = startScroll < 0 ? -1 : 1;
        const endDirection = endScroll < 0 ? -1 : 1;
        const startSpeedScale = Number.isFinite(roll.speedScaleStart)
          ? Math.max(0.05, roll.speedScaleStart)
          : Math.max(0.05, Math.abs(startScroll));
        const endSpeedScale = Number.isFinite(roll.speedScaleEnd)
          ? Math.max(0.05, roll.speedScaleEnd)
          : Math.max(0.05, Math.abs(endScroll));
        const xStart = LANE_TARGET_X + (roll.startMs - nowMs) * effectiveScrollPxPerMs * startSpeedScale * startDirection;
        const xEnd = LANE_TARGET_X + (roll.endMs - nowMs) * effectiveScrollPxPerMs * endSpeedScale * endDirection;
        return {
          ...roll,
          xStart,
          xEnd
        };
      })
      .filter((roll) => roll.xEnd > -120 && roll.xStart < 1920);
  }, [rolls, nowMs, effectiveScrollPxPerMs]);

  const visibleBalloons = useMemo(() => {
    return balloons
      .map((balloon) => {
        const isHoldingAtJudge = nowMs >= balloon.timeMs && nowMs <= balloon.endMs && !balloon.popped;
        const balloonScroll = Number.isFinite(balloon.scroll) ? balloon.scroll : 1;
        const balloonDirection = balloonScroll < 0 ? -1 : 1;
        const balloonSpeedScale = Number.isFinite(balloon.speedScale)
          ? Math.max(0.05, balloon.speedScale)
          : Math.max(0.05, Math.abs(balloonScroll));
        const approachX = nowMs > balloon.endMs
          ? LANE_TARGET_X + (balloon.endMs - nowMs) * effectiveScrollPxPerMs * balloonSpeedScale * balloonDirection
          : LANE_TARGET_X + (balloon.timeMs - nowMs) * effectiveScrollPxPerMs * balloonSpeedScale * balloonDirection;
        const pulseElapsed = Number.isFinite(balloon.pulseAtMs) ? nowMs - balloon.pulseAtMs : Infinity;
        const pulseScale = pulseElapsed >= 0 && pulseElapsed <= BALLOON_PULSE_MS
          ? 1 + Math.sin((pulseElapsed / BALLOON_PULSE_MS) * Math.PI) * 0.18
          : 1;
        return {
          ...balloon,
          x: isHoldingAtJudge ? LANE_TARGET_X : approachX,
          scale: pulseScale,
          isHoldingAtJudge
        };
      })
      .filter((balloon) => !balloon.popped && balloon.x > -220 && balloon.x < 1920);
  }, [balloons, nowMs, effectiveScrollPxPerMs]);

  const activeRollForDisplay = useMemo(() => {
    return rolls.find((roll) => nowMs >= roll.startMs && nowMs <= roll.endMs + ROLL_COUNT_HOLD_MS) || null;
  }, [rolls, nowMs]);

  const scrollTheme = useMemo(() => {
    if (!availableBranches.length) {
      return BRANCH_SCROLL_THEME.normal;
    }
    return BRANCH_SCROLL_THEME[branchSelection] || BRANCH_SCROLL_THEME.normal;
  }, [availableBranches.length, branchSelection]);

  const branchOptionsForDialog = useMemo(() => {
    const courseKey = courseInputValue || selectedCourseKey;
    const selectedCourseChart = courseChartsByKey[courseKey] || baseChartForBranch;
    return getBranchOptions(selectedCourseChart);
  }, [courseInputValue, selectedCourseKey, courseChartsByKey, baseChartForBranch]);

  const drawLaneCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 220;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const renderWidth = Math.floor(width * dpr);
    const renderHeight = Math.floor(height * dpr);
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      canvas.width = renderWidth;
      canvas.height = renderHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    const statusBarHeight = 66;
    const progressAreaHeight = 32;
    const baseLaneTop = statusBarHeight;
    const baseLaneBottom = Math.max(baseLaneTop + 120, height - progressAreaHeight);
    const baseLaneHeight = Math.max(120, baseLaneBottom - baseLaneTop);
    const judgeXBase = Math.max(60, Math.min(width - 60, LANE_TARGET_X));
    const baseOutlineWidth = 4;
    const baseSmallRadius = NOTE_SMALL_RADIUS;
    const baseBigRadius = Math.round((baseSmallRadius * 4) / 3 + baseOutlineWidth + 1);
    const baseJudgeSmallRadius = baseSmallRadius;
    const baseJudgeBigRadius = baseBigRadius;
    const noteCoreScale = 0.93;
    const baseLeftPanelPadding = Math.max(26, Math.floor(baseLaneHeight * 0.12));
    const baseDesiredDrumOuterRadius = baseJudgeBigRadius + 14;
    const baseRequiredPanelWidth = baseDesiredDrumOuterRadius * 2 + baseLeftPanelPadding * 2;
    const baseMinPanelWidthByDrumCount = Math.ceil(baseDesiredDrumOuterRadius * 2 * 2.5);
    const maxPanelWidth = Math.max(140, width - 180);
    const rawDrumAreaRight = Math.min(
      maxPanelWidth,
      Math.max(120, judgeXBase - baseJudgeBigRadius - 24, baseRequiredPanelWidth, baseMinPanelWidthByDrumCount)
    );
    const laneFlyInRealWidth = 1800 - LANE_TARGET_X;
    const stackOrangeAboveLane = width <= 760;
    const rowWidthScale = stackOrangeAboveLane
      ? Math.min(1, width / laneFlyInRealWidth)
      : Math.min(1, width / (rawDrumAreaRight + laneFlyInRealWidth));
    const laneHeightScale = rowWidthScale + (1 - rowWidthScale) * 0.20;
    const topOrangeHeight = stackOrangeAboveLane
      ? Math.max(52, Math.round(56 * laneHeightScale))
      : 0;
    const topOrangeDividerThickness = stackOrangeAboveLane ? 5 : 0;
    const topOrangeUsableTop = baseLaneTop;
    const topOrangeUsableHeight = stackOrangeAboveLane
      ? Math.max(20, topOrangeHeight - topOrangeDividerThickness)
      : 0;

    const laneTop = baseLaneTop + topOrangeHeight;
    const maxLaneHeight = Math.max(82, height - progressAreaHeight - laneTop);
    const laneHeight = Math.min(baseLaneHeight * laneHeightScale, maxLaneHeight);
    const laneBottom = laneTop + laneHeight;
    const laneY = laneTop + Math.floor(laneHeight / 2);
    const laneShrinkGap = Math.max(0, baseLaneBottom - laneBottom);
    const frameWrap = canvas.parentElement;
    if (frameWrap) {
      frameWrap.style.setProperty('--practice-lane-shrink-gap', `${laneShrinkGap}px`);
    }
    const noteJudgeOutlineWidth = baseOutlineWidth * rowWidthScale;
    const dynamicSmallRadius = baseSmallRadius * rowWidthScale;
    const dynamicBigRadius = baseBigRadius * rowWidthScale;
    const dynamicJudgeSmallRadius = dynamicSmallRadius;
    const dynamicJudgeBigRadius = dynamicBigRadius;
    const smallNoteWhiteRingWidth = dynamicSmallRadius * 0.11;
    const smallNoteCoreRadius = (dynamicSmallRadius - noteJudgeOutlineWidth - smallNoteWhiteRingWidth) * noteCoreScale;
    const leftPanelPadding = Math.max(12, Math.round(baseLeftPanelPadding * rowWidthScale));
    const desiredDrumOuterRadius = dynamicJudgeBigRadius + Math.max(8, Math.round(14 * rowWidthScale));
    const drumAreaRight = stackOrangeAboveLane ? 0 : rawDrumAreaRight * rowWidthScale;
    const laneClipLeft = stackOrangeAboveLane ? 0 : Math.min(width - 1, drumAreaRight);
    const laneDisplayWidth = laneFlyInRealWidth * rowWidthScale;
    const shouldRenderRightMask = rowWidthScale >= 0.999 && width > laneClipLeft + laneFlyInRealWidth;
    const rightMaskWidth = shouldRenderRightMask
      ? Math.max(0, width - laneClipLeft - laneDisplayWidth)
      : 0;
    const laneClipRight = shouldRenderRightMask
      ? laneClipLeft + laneDisplayWidth
      : Math.min(width, laneClipLeft + laneDisplayWidth);
    const rightMaskLeft = laneClipRight;
    const laneShift = stackOrangeAboveLane ? 0 : drumAreaRight;
    const judgeXBaseScaled = LANE_TARGET_X * rowWidthScale;
    const judgeX = Math.max(
      laneClipLeft + dynamicJudgeBigRadius + 8,
      Math.min(laneClipRight - dynamicJudgeBigRadius - 8, judgeXBaseScaled + laneShift)
    );
    const drumVerticalPadding = stackOrangeAboveLane
      ? Math.max(7, Math.round(9 * rowWidthScale))
      : 0;
    const minOuterRadius = Math.max(14, Math.round(36 * rowWidthScale));
    const maxOuterRadiusByPanel = stackOrangeAboveLane
      ? Math.max(Math.round(minOuterRadius * 0.75), Math.floor(topOrangeHeight * 0.44))
      : Math.max(Math.round(minOuterRadius * 0.75), Math.floor((drumAreaRight - leftPanelPadding * 2) / 2));
    const maxOuterRadiusByTopBand = stackOrangeAboveLane
      ? Math.max(10, Math.floor(topOrangeUsableHeight / 2) - drumVerticalPadding)
      : Number.POSITIVE_INFINITY;
    const drumOuterRadius = stackOrangeAboveLane
      ? Math.max(10, Math.min(desiredDrumOuterRadius * 0.9, maxOuterRadiusByPanel, maxOuterRadiusByTopBand))
      : Math.max(minOuterRadius, Math.min(desiredDrumOuterRadius, maxOuterRadiusByPanel));
    const minCenterX = leftPanelPadding + drumOuterRadius;
    const maxCenterX = stackOrangeAboveLane
      ? Math.max(minCenterX, width - leftPanelPadding - drumOuterRadius)
      : Math.max(minCenterX, drumAreaRight - leftPanelPadding - drumOuterRadius);
    const drumCenterX = stackOrangeAboveLane
      ? Math.floor(Math.max(minCenterX, Math.min(width * 0.14, maxCenterX)))
      : Math.floor(minCenterX + (maxCenterX - minCenterX) * 0.76);
    const drumCenterY = stackOrangeAboveLane
      ? topOrangeUsableTop + Math.floor(topOrangeUsableHeight / 2)
      : laneY;
    const minRimThickness = Math.max(3, Math.round(8 * rowWidthScale));
    const drumRimThickness = Math.max(minRimThickness, Math.floor(drumOuterRadius * 0.16));
    const minInnerRadius = Math.max(8, Math.round(22 * rowWidthScale));
    const drumInnerRadius = Math.max(minInnerRadius, drumOuterRadius - drumRimThickness);
    const drawStreakOnDrum = () => {
      if (streakHits < 10) return;
      const streakText = String(streakHits);
      const streakFont = Math.max(20, Math.floor(drumInnerRadius * 0.92));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${streakFont}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#2a3342';
      ctx.lineWidth = Math.max(3, Math.floor(streakFont * 0.16));
      ctx.strokeText(streakText, drumCenterX, drumCenterY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(streakText, drumCenterX, drumCenterY);
    };

    const nowPerf = performance.now();
    const activeDonFx = hitFxRef.current.some((fx) => fx.type === 'don' && nowPerf - fx.time >= 0 && nowPerf - fx.time <= HIT_FLASH_MS);
    const activeKaFx = hitFxRef.current.some((fx) => fx.type === 'ka' && nowPerf - fx.time >= 0 && nowPerf - fx.time <= HIT_FLASH_MS);
    const progressRatio = durationMs > 0 ? Math.max(0, Math.min(1, nowMs / durationMs)) : 0;
    const progressPercent = Math.round(progressRatio * 100);
    const totalBars = notes.length ? Math.max(1, (barLines?.length || 0) + 1) : 0;
    let currentBar = 0;
    if (totalBars > 0) {
      let passedBarLines = 0;
      for (const barLine of barLines || []) {
        if (nowMs >= barLine.timeMs) {
          passedBarLines += 1;
        } else {
          break;
        }
      }
      currentBar = Math.min(totalBars, Math.max(1, passedBarLines + 1));
    }
    const progressText = totalBars > 0
      ? `${progressPercent}%  ${currentBar}/${totalBars} 小节`
      : `${progressPercent}%  -/- 小节`;
    const driftText = Number.isFinite(clockDriftMs)
      ? `延迟 ${clockDriftMs > 0 ? '+' : ''}${clockDriftMs}ms`
      : '延迟 --ms';
    const laneInfoText = isDriftMonitorVisible ? driftText : '';

    ctx.fillStyle = '#b83a10';
    if (stackOrangeAboveLane) {
      ctx.fillRect(0, baseLaneTop, width, topOrangeHeight);
      ctx.strokeStyle = '#242d3a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, laneTop - 2.5);
      ctx.lineTo(width, laneTop - 2.5);
      ctx.stroke();
    } else {
      ctx.fillRect(0, laneTop, drumAreaRight, laneBottom - laneTop);
      ctx.strokeStyle = '#242d3a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(drumAreaRight - 2.5, laneTop);
      ctx.lineTo(drumAreaRight - 2.5, laneBottom);
      ctx.stroke();
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '900 18px "Microsoft YaHei", "Noto Sans SC", sans-serif';
    ctx.fillStyle = '#ffe7cb';
    if (laneInfoText) {
      if (stackOrangeAboveLane) {
        const progressX = Math.min(width - 180, drumCenterX + drumOuterRadius + 12);
        ctx.fillText(laneInfoText, progressX, drumCenterY);
      } else {
        ctx.fillText(laneInfoText, 12, laneBottom - 16);
      }
    }

    ctx.fillStyle = scrollTheme.base;
    ctx.fillRect(laneClipLeft, laneTop, Math.max(0, laneClipRight - laneClipLeft), laneBottom - laneTop);

    if (scrollTheme.overlay && scrollTheme.overlay !== 'rgba(0, 0, 0, 0)') {
      ctx.fillStyle = scrollTheme.overlay;
      ctx.fillRect(laneClipLeft, laneTop, Math.max(0, laneClipRight - laneClipLeft), laneBottom - laneTop);
    }

    if (rightMaskWidth > 0) {
      ctx.fillStyle = '#b83a10';
      ctx.fillRect(rightMaskLeft, laneTop, width - rightMaskLeft, laneBottom - laneTop);

      ctx.strokeStyle = '#242d3a';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(rightMaskLeft + 2.5, laneTop);
      ctx.lineTo(rightMaskLeft + 2.5, laneBottom);
      ctx.stroke();
    }

    // Draw status bar first so gameplay feedback can render above it.
    ctx.fillStyle = '#1f2633';
    ctx.fillRect(0, 0, width, statusBarHeight);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '900 19px "Microsoft YaHei", "Noto Sans SC", sans-serif';
    const statusItems = [
      { text: `良 ${summary.perfect}`, color: '#ffd65c' },
      { text: `可 ${summary.good}`, color: '#ffffff' },
      { text: `不可 ${ngCount}`, color: '#6fb1ff' },
      { text: `连打 ${rollBalloonHits}`, color: '#ffb66b' }
    ];
    let statusX = 16;
    for (const item of statusItems) {
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, statusX, statusBarHeight / 2);
      statusX += ctx.measureText(item.text).width + 30;
      if (statusX > width - 120) break;
    }

    if (stackOrangeAboveLane) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, baseLaneTop, width, topOrangeHeight);
      ctx.clip();
    }

    if (activeKaFx) {
      const kaGlow = ctx.createRadialGradient(drumCenterX, drumCenterY, drumInnerRadius * 0.8, drumCenterX, drumCenterY, drumOuterRadius * 1.08);
      kaGlow.addColorStop(0, 'rgba(70, 170, 255, 0)');
      kaGlow.addColorStop(0.62, 'rgba(70, 170, 255, 0.58)');
      kaGlow.addColorStop(1, 'rgba(70, 170, 255, 0.08)');
      ctx.fillStyle = kaGlow;
      ctx.beginPath();
      ctx.arc(drumCenterX, drumCenterY, drumOuterRadius * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    const drumBaseWarmWhite = '#f2eddc';
    const drumRimColor = activeKaFx ? '#4f9fff' : drumBaseWarmWhite;
    const drumFaceColor = activeDonFx ? '#ff4e42' : drumBaseWarmWhite;

    ctx.fillStyle = drumRimColor;
    ctx.beginPath();
    ctx.arc(drumCenterX, drumCenterY, drumOuterRadius, 0, Math.PI * 2);
    ctx.fill();

    if (activeDonFx) {
      const donGlow = ctx.createRadialGradient(drumCenterX, drumCenterY, drumInnerRadius * 0.25, drumCenterX, drumCenterY, drumInnerRadius * 1.7);
      donGlow.addColorStop(0, 'rgba(255, 72, 72, 0.94)');
      donGlow.addColorStop(0.52, 'rgba(255, 72, 72, 0.5)');
      donGlow.addColorStop(1, 'rgba(255, 98, 98, 0)');
      ctx.fillStyle = donGlow;
      ctx.beginPath();
      ctx.arc(drumCenterX, drumCenterY, drumInnerRadius * 1.95, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = drumFaceColor;
    ctx.beginPath();
    ctx.arc(drumCenterX, drumCenterY, drumInnerRadius, 0, Math.PI * 2);
    ctx.fill();

    // Thin separator between rim and face.
    ctx.strokeStyle = 'rgba(69, 76, 88, 0.85)';
    ctx.lineWidth = Math.max(0.8, 1.5 * rowWidthScale);
    ctx.beginPath();
    ctx.arc(drumCenterX, drumCenterY, drumInnerRadius + 0.75, 0, Math.PI * 2);
    ctx.stroke();

    if (!stackOrangeAboveLane) {
      drawStreakOnDrum();
    }

    ctx.strokeStyle = '#1f2633';
    ctx.lineWidth = Math.max(1, 4 * rowWidthScale);
    ctx.beginPath();
    ctx.arc(drumCenterX, drumCenterY, drumOuterRadius, 0, Math.PI * 2);
    ctx.stroke();

    if (stackOrangeAboveLane) {
      ctx.restore();
      drawStreakOnDrum();
    }

    // Keep the lane and notes fully separated from the left drum panel.
    ctx.save();
    ctx.beginPath();
    ctx.rect(laneClipLeft, laneTop, Math.max(0, laneClipRight - laneClipLeft), laneBottom - laneTop);
    ctx.clip();

    for (const fx of hitFxRef.current) {
      const elapsed = nowPerf - fx.time;
      if (elapsed < 0 || elapsed > HIT_FLASH_MS) continue;
      const progress = elapsed / HIT_FLASH_MS;
      const alpha = Math.pow(1 - progress, 1.6) * (fx.type === 'don' ? 0.42 : 0.38);
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      if (fx.type === 'don') {
        gradient.addColorStop(0, `rgba(255, 82, 82, ${alpha})`);
        gradient.addColorStop(0.46, `rgba(255, 82, 82, ${alpha * 0.35})`);
      } else {
        gradient.addColorStop(0, `rgba(76, 164, 255, ${alpha})`);
        gradient.addColorStop(0.46, `rgba(76, 164, 255, ${alpha * 0.35})`);
      }
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, laneTop, width, laneBottom - laneTop);
    }

    for (const barLine of visibleBarLines) {
      const x = Math.floor(barLine.x * rowWidthScale + laneShift) + 0.5;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(x, laneTop);
      ctx.lineTo(x, laneBottom);
      ctx.stroke();
    }

    // Circular judgement frame: outer ring for big notes, inner ring for small notes.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.58)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = noteJudgeOutlineWidth;
    ctx.beginPath();
    ctx.arc(judgeX, laneY, dynamicJudgeBigRadius - noteJudgeOutlineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = noteJudgeOutlineWidth;
    ctx.beginPath();
    ctx.arc(judgeX, laneY, dynamicJudgeSmallRadius - noteJudgeOutlineWidth / 2, 0, Math.PI * 2);
    ctx.stroke();

    // Innermost circle matches the small-note colored core circle size.
    ctx.fillStyle = 'rgba(188, 198, 212, 0.58)';
    ctx.beginPath();
    ctx.arc(judgeX, laneY, smallNoteCoreRadius, 0, Math.PI * 2);
    ctx.fill();

    const layeredVisibleNotes = [...visibleNotes].sort((a, b) => b.x - a.x);
    for (const note of layeredVisibleNotes) {
      const x = note.x * rowWidthScale + laneShift;
      const radius = note.isBig ? dynamicBigRadius : dynamicSmallRadius;
      const blackBorderWidth = noteJudgeOutlineWidth;
      const whiteRingWidth = noteJudgeOutlineWidth * 1.1;
      const whiteRingRadius = radius - blackBorderWidth;
      const coreRadius = (whiteRingRadius - whiteRingWidth) * noteCoreScale;

      // Arcade-like layering: black rim -> white ring -> colored center.
      ctx.fillStyle = '#0c0f14';
      ctx.beginPath();
      ctx.arc(x, laneY, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, laneY, whiteRingRadius, 0, Math.PI * 2);
      ctx.fill();

      if (note.type === 'don') {
        ctx.fillStyle = '#e95a24';
      } else {
        ctx.fillStyle = '#3f8ff0';
      }
      ctx.beginPath();
      ctx.arc(x, laneY, coreRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const roll of visibleRolls) {
      const xStart = Math.max(-80, Math.min(width + 80, roll.xStart * rowWidthScale + laneShift));
      const xEnd = Math.max(-80, Math.min(width + 80, roll.xEnd * rowWidthScale + laneShift));
      const left = Math.min(xStart, xEnd);
      const right = Math.max(xStart, xEnd);
      const barHeight = roll.isBig
        ? dynamicBigRadius * 2
        : dynamicSmallRadius * 2;
      const y = laneY - barHeight / 2;

      ctx.fillStyle = '#f7c63a';
      ctx.strokeStyle = '#c98812';
      ctx.lineWidth = 3;

      const widthPx = Math.max(10, right - left);
      const radius = barHeight / 2;
      const bodyWidth = Math.max(radius * 2, widthPx);

      // Standard drumroll capsule: front semicircle + middle body + end semicircle.
      ctx.beginPath();
      ctx.moveTo(left + radius, y);
      ctx.lineTo(left + bodyWidth - radius, y);
      ctx.arc(left + bodyWidth - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(left + radius, y + barHeight);
      ctx.arc(left + radius, y + radius, radius, Math.PI / 2, -Math.PI / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    for (const balloon of visibleBalloons) {
      const x = balloon.x * rowWidthScale + laneShift;
      const baseRadius = balloon.isBig
        ? dynamicBigRadius
        : dynamicSmallRadius;
      const holdRadius = balloon.isBig
        ? dynamicJudgeBigRadius + 2
        : dynamicJudgeBigRadius - 4;
      const targetRadius = balloon.isHoldingAtJudge ? holdRadius : baseRadius;
      const radius = targetRadius * (balloon.scale || 1);
      const bodyGradient = ctx.createRadialGradient(x - 6, laneY - 8, 3, x, laneY, radius);
      bodyGradient.addColorStop(0, '#ffd77a');
      bodyGradient.addColorStop(0.58, '#ffad2e');
      bodyGradient.addColorStop(1, '#e27f08');

      ctx.fillStyle = bodyGradient;
      ctx.strokeStyle = '#9a5f10';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, laneY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const countText = String(Math.max(0, balloon.remainingHits));
      const fontSize = Math.max(12, Math.floor(radius * 0.74));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 ${fontSize}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
      ctx.lineWidth = Math.max(2, Math.floor(fontSize * 0.15));
      ctx.strokeStyle = '#2a3342';
      ctx.strokeText(countText, x, laneY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(countText, x, laneY);
    }

    for (const popFx of balloonFxRef.current) {
      const elapsed = nowPerf - popFx.time;
      if (elapsed < 0 || elapsed > BALLOON_POP_FX_MS) continue;
      const progress = elapsed / BALLOON_POP_FX_MS;
      const alpha = Math.pow(1 - progress, 1.5);

      const core = ctx.createRadialGradient(judgeX, laneY, 0, judgeX, laneY, dynamicBigRadius * (0.55 + progress * 0.9));
      core.addColorStop(0, `rgba(255, 224, 132, ${(0.82 * alpha).toFixed(3)})`);
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(judgeX, laneY, dynamicBigRadius * (0.55 + progress * 0.9), 0, Math.PI * 2);
      ctx.fill();

      for (const particle of popFx.particles || []) {
        const dist = dynamicJudgeBigRadius * 0.45 + particle.speed * (elapsed / 1000) * (1 - progress * 0.2);
        const px = judgeX + Math.cos(particle.angle) * dist;
        const py = laneY + Math.sin(particle.angle) * dist;
        const pr = Math.max(0.8, particle.radius * (1 - progress * 0.45));
        ctx.fillStyle = `rgba(255, 196, 78, ${(0.96 * alpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    for (const judgeFx of judgeFxRef.current) {
      const elapsed = nowPerf - judgeFx.time;
      if (elapsed < 0 || elapsed > JUDGE_FEEDBACK_MS) continue;

      if (judgeFx.burstColor) {
        const flashProgress = Math.max(0, Math.min(1, elapsed / JUDGE_FLASH_MS));
        const burstAlpha = Math.pow(1 - flashProgress, 1.45);
        const [r, g, b] = judgeFx.burstColor;

        const coreRadius = dynamicJudgeSmallRadius * (0.7 + flashProgress * 0.35);
        const core = ctx.createRadialGradient(judgeX, laneY, 0, judgeX, laneY, coreRadius);
        core.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${(0.55 * burstAlpha).toFixed(3)})`);
        core.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(judgeX, laneY, coreRadius, 0, Math.PI * 2);
        ctx.fill();

        for (const particle of judgeFx.particles || []) {
          const dist = dynamicJudgeBigRadius * 0.72 + particle.speed * (elapsed / 1000) * (1 - flashProgress * 0.2);
          const px = judgeX + Math.cos(particle.angle) * dist;
          const py = laneY + Math.sin(particle.angle) * dist;
          const pr = particle.radius * (1 - flashProgress * 0.32);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(0.96 * burstAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(0.7, pr), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const textProgress = Math.max(0, Math.min(1, elapsed / JUDGE_FEEDBACK_MS));
      const fastPhase = 0.42;
      const holdPhase = 0.26;
      const topEdgeY = Math.max(8, Math.round(18 * rowWidthScale));

      let riseProgress;
      if (textProgress <= fastPhase) {
        const t = textProgress / fastPhase;
        riseProgress = 1 - Math.pow(1 - t, 2.8);
      } else if (textProgress <= fastPhase + holdPhase) {
        riseProgress = 1;
      } else {
        const t = (textProgress - fastPhase - holdPhase) / (1 - fastPhase - holdPhase);
        riseProgress = 1 + t * 0.06;
      }

      let textAlpha;
      if (textProgress < 0.14) {
        textAlpha = textProgress / 0.14;
      } else if (textProgress < fastPhase + holdPhase) {
        textAlpha = 1;
      } else {
        const t = (textProgress - fastPhase - holdPhase) / (1 - fastPhase - holdPhase);
        textAlpha = Math.max(0, 1 - t);
      }

      const textScale = textProgress < 0.16 ? 0.8 + textProgress * 1.0 : 0.96;
      const riseDistance = dynamicJudgeBigRadius * 1.56;
      const textX = judgeX;
      const baseFontSize = judgeFx.fontSize || (judgeFx.text === '不可' ? 40 : 42);
      const fontSize = baseFontSize * rowWidthScale;
      const topSafeY = Math.max(topEdgeY, fontSize * textScale * 0.62 + Math.round(8 * rowWidthScale));
      const textY = Math.max(topSafeY, laneY - riseDistance * riseProgress);

      ctx.save();
      ctx.translate(textX, textY);
      ctx.scale(textScale, textScale);
      ctx.globalAlpha = textAlpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.font = `900 ${fontSize}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
      const popupGap = Math.max(8, Math.round(12 * rowWidthScale));
      const mainText = judgeFx.text;
      const hasDeltaText = Boolean(judgeFx.deltaText);
      const mainMetrics = ctx.measureText(mainText);
      const mainWidth = Math.max(1, mainMetrics.width);

      if (hasDeltaText) {
        const deltaFontSize = fontSize;
        const deltaFont = `800 ${deltaFontSize}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
        ctx.font = deltaFont;
        const deltaMetrics = ctx.measureText(judgeFx.deltaText);
        const deltaWidth = Math.max(1, deltaMetrics.width);
        const mainX = 0;
        const deltaX = mainWidth / 2 + popupGap + deltaWidth / 2;

        ctx.font = `900 ${fontSize}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
        ctx.lineWidth = 6 * rowWidthScale;
        ctx.strokeStyle = judgeFx.stroke;
        ctx.strokeText(mainText, mainX, 0);
        ctx.fillStyle = judgeFx.fill;
        ctx.fillText(mainText, mainX, 0);

        ctx.font = deltaFont;
        ctx.lineWidth = Math.max(4, 5 * rowWidthScale);
        ctx.strokeStyle = judgeFx.deltaStroke || '#2a3342';
        ctx.strokeText(judgeFx.deltaText, deltaX, 0);
        ctx.fillStyle = judgeFx.deltaFill || '#ffffff';
        ctx.fillText(judgeFx.deltaText, deltaX, 0);
      } else {
        ctx.lineWidth = 6 * rowWidthScale;
        ctx.strokeStyle = judgeFx.stroke;
        ctx.strokeText(mainText, 0, 0);
        ctx.fillStyle = judgeFx.fill;
        ctx.fillText(mainText, 0, 0);
      }
      ctx.restore();
    }

    for (const hitNoteFx of hitNoteFxRef.current) {
      const elapsed = nowPerf - hitNoteFx.time;
      if (elapsed < 0 || elapsed > HIT_NOTE_FLY_MS) continue;

      const radius = hitNoteFx.isBig ? dynamicBigRadius : dynamicSmallRadius;
      const flyProgress = Math.max(0, Math.min(1, elapsed / HIT_NOTE_FLY_MS));
      const travelX = laneDisplayWidth * 0.92;
      const x = judgeX + hitNoteFx.sideJitter + flyProgress * travelX;
      const tan45 = 1;
      const baseLift = travelX * tan45;
      const decelLift = baseLift * 0.42;
      const yLift = baseLift * flyProgress - decelLift * flyProgress * flyProgress;
      const y = laneY - yLift;
      const alpha = Math.max(0, 1 - Math.pow(flyProgress, 1.15));
      const scale = Math.max(0.44, 1 - flyProgress * 0.56);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      ctx.scale(scale, scale);

      const blackBorderWidth = noteJudgeOutlineWidth;
      const whiteRingWidth = noteJudgeOutlineWidth * 1.1;
      const whiteRingRadius = radius - blackBorderWidth;
      const coreRadius = (whiteRingRadius - whiteRingWidth) * noteCoreScale;

      ctx.fillStyle = '#0c0f14';
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, whiteRingRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = hitNoteFx.type === 'don' ? '#e95a24' : '#3f8ff0';
      ctx.beginPath();
      ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    const progressRegionTop = Math.max(0, Math.min(height, laneBottom));
    const progressBandHeight = Math.max(0, Math.min(progressAreaHeight, height - progressRegionTop));
    const remainderTop = progressRegionTop + progressBandHeight;
    const remainderHeight = Math.max(0, height - remainderTop);

    const globalSpeedLabel = `♬×${globalSpeedMultiplier.toFixed(2)}`;
    const scrollSpeedLabel = `HS×${scrollSpeedMultiplier.toFixed(2)}`;

    ctx.fillStyle = '#202836';
    ctx.fillRect(0, progressRegionTop, width, progressBandHeight);
    if (remainderHeight > 0) {
      ctx.fillStyle = '#fff8ed';
      ctx.fillRect(0, remainderTop, width, remainderHeight);
    }
    const progressBarHeight = 14;
    const progressBarInset = Math.max(0, (progressBandHeight - progressBarHeight) / 2);
    const progressBarMarginX = progressBarInset;
    const progressBarY = progressRegionTop + progressBarInset;
    const badgeFontSize = 11;
    const badgeHeight = Math.max(14, Math.min(progressBandHeight - 4, 16));
    const badgePadX = 6;
    const badgeGap = 4;
    const badgeSideGap = 8;
    ctx.font = `700 ${badgeFontSize}px "Segoe UI", "Microsoft YaHei", sans-serif`;
    const globalBadgeWidth = Math.ceil(ctx.measureText(globalSpeedLabel).width + badgePadX * 2);
    const scrollBadgeWidth = Math.ceil(ctx.measureText(scrollSpeedLabel).width + badgePadX * 2);
    const badgesTotalWidth = globalBadgeWidth + badgeGap + scrollBadgeWidth;
    const maxBadgeBlockWidth = Math.max(0, width - progressBarMarginX * 2 - 60);
    const canRenderBadges = progressBandHeight >= 16 && badgesTotalWidth <= maxBadgeBlockWidth;
    const badgeBlockWidth = canRenderBadges ? badgesTotalWidth + badgeSideGap : 0;

    const progressBarX = progressBarMarginX + badgeBlockWidth;
    const progressTrackWidth = Math.max(40, width - progressBarMarginX - progressBarX);
    const progressFillWidth = progressTrackWidth * progressRatio;

    if (canRenderBadges) {
      const badgeY = progressRegionTop + Math.max(2, (progressBandHeight - badgeHeight) / 2);
      let badgeX = progressBarMarginX;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${badgeFontSize}px "Segoe UI", "Microsoft YaHei", sans-serif`;

      ctx.fillStyle = 'rgba(44, 57, 78, 0.92)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, globalBadgeWidth, badgeHeight, 999);
      ctx.fill();
      ctx.fillStyle = '#ffe7cb';
      ctx.fillText(globalSpeedLabel, badgeX + globalBadgeWidth / 2, badgeY + badgeHeight / 2 + 0.5);

      badgeX += globalBadgeWidth + badgeGap;
      ctx.fillStyle = 'rgba(56, 72, 98, 0.92)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, scrollBadgeWidth, badgeHeight, 999);
      ctx.fill();
      ctx.fillStyle = '#dff1ff';
      ctx.fillText(scrollSpeedLabel, badgeX + scrollBadgeWidth / 2, badgeY + badgeHeight / 2 + 0.5);
    }

    ctx.fillStyle = 'rgba(96, 112, 136, 0.34)';
    ctx.beginPath();
    ctx.roundRect(progressBarX, progressBarY, progressTrackWidth, progressBarHeight, 999);
    ctx.fill();

    if (progressFillWidth > 0) {
      const progressGradient = ctx.createLinearGradient(progressBarX, 0, progressBarX + progressTrackWidth, 0);
      progressGradient.addColorStop(0, '#ffb13f');
      progressGradient.addColorStop(1, '#f16b2b');
      ctx.fillStyle = progressGradient;
      ctx.beginPath();
      ctx.roundRect(progressBarX, progressBarY, progressFillWidth, progressBarHeight, 999);
      ctx.fill();
    }

    const progressLabelX = progressBarX + progressTrackWidth / 2;
    const progressLabelY = progressBarY + progressBarHeight / 2;
    const progressLabelFont = '700 12px "Segoe UI", "Microsoft YaHei", sans-serif';

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(progressBarX, progressBarY, progressTrackWidth, progressBarHeight, 999);
    ctx.clip();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = progressLabelFont;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(26, 32, 44, 0.85)';
    ctx.strokeText(progressText, progressLabelX, progressLabelY + 0.5);
    ctx.fillStyle = '#d8deea';
    ctx.fillText(progressText, progressLabelX, progressLabelY + 0.5);

    if (progressFillWidth > 0.5) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(progressBarX, progressBarY, progressFillWidth, progressBarHeight);
      ctx.clip();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(71, 32, 14, 0.9)';
      ctx.strokeText(progressText, progressLabelX, progressLabelY + 0.5);
      ctx.fillStyle = '#fff6de';
      ctx.fillText(progressText, progressLabelX, progressLabelY + 0.5);
      ctx.restore();
    }

    ctx.restore();

    const touchGuideCanvas = touchGuideCanvasRef.current;
    if (touchGuideCanvas) {
      const guideWidth = touchGuideCanvas.clientWidth || 1;
      const guideHeight = touchGuideCanvas.clientHeight || 1;
      const guideRenderWidth = Math.floor(guideWidth * dpr);
      const guideRenderHeight = Math.floor(guideHeight * dpr);
      if (touchGuideCanvas.width !== guideRenderWidth || touchGuideCanvas.height !== guideRenderHeight) {
        touchGuideCanvas.width = guideRenderWidth;
        touchGuideCanvas.height = guideRenderHeight;
      }

      const guideCtx = touchGuideCanvas.getContext('2d');
      if (guideCtx) {
        guideCtx.save();
        guideCtx.scale(dpr, dpr);
        guideCtx.clearRect(0, 0, guideWidth, guideHeight);

        const arc = getTouchArcGeometry(guideWidth, guideHeight);
        const nowPulse = performance.now();
        const activePulses = touchGuidePulseRef.current.filter((pulse) => nowPulse - pulse.time <= TOUCH_GUIDE_VIBRATION_MS);
        touchGuidePulseRef.current = activePulses;

        let pulseScaleX = 1;
        let pulseScaleY = 1;
        let donPulseStrength = 0;
        let kaPulseStrength = 0;
        for (const pulse of activePulses) {
          const t = Math.max(0, Math.min(1, (nowPulse - pulse.time) / TOUCH_GUIDE_VIBRATION_MS));
          const wave = Math.sin(t * Math.PI * 4) * (1 - t);
          const strength = 1 - t;
          if (pulse.type === 'don') {
            pulseScaleX += wave * 0.01;
            pulseScaleY -= wave * 0.026;
            donPulseStrength = Math.max(donPulseStrength, strength);
          } else {
            pulseScaleX -= wave * 0.022;
            pulseScaleY += wave * 0.01;
            kaPulseStrength = Math.max(kaPulseStrength, strength);
          }
        }

        // Keep pulse transform scoped to the drum only.
        guideCtx.save();
        guideCtx.translate(arc.centerX, arc.centerY);
        guideCtx.scale(pulseScaleX, pulseScaleY);
        guideCtx.translate(-arc.centerX, -arc.centerY);

        const drumRadius = arc.radius;
        const topY = arc.centerY - drumRadius;

        const drumFacePath = new Path2D();
        drumFacePath.arc(arc.centerX, arc.centerY, drumRadius, 0, Math.PI * 2);

        const fillGradient = guideCtx.createLinearGradient(0, topY, 0, arc.centerY + drumRadius);
        fillGradient.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
        fillGradient.addColorStop(1, 'rgba(248, 248, 248, 0.96)');
        guideCtx.fillStyle = fillGradient;
        guideCtx.fill(drumFacePath);

        if (donPulseStrength > 0.001) {
          const donCenterY = arc.centerY + drumRadius * 0.2;
          const donOuterRadius = drumRadius * 1.22;
          const donGradient = guideCtx.createRadialGradient(
            arc.centerX,
            donCenterY,
            0,
            arc.centerX,
            donCenterY,
            donOuterRadius
          );
          donGradient.addColorStop(0, `rgba(255, 124, 124, ${(0.15 * donPulseStrength).toFixed(3)})`);
          donGradient.addColorStop(0.55, `rgba(255, 148, 148, ${(0.24 * donPulseStrength).toFixed(3)})`);
          donGradient.addColorStop(0.84, `rgba(255, 148, 148, ${(0.38 * donPulseStrength).toFixed(3)})`);
          donGradient.addColorStop(1, 'rgba(255, 148, 148, 0)');
          guideCtx.save();
          guideCtx.clip(drumFacePath);
          guideCtx.fillStyle = donGradient;
          guideCtx.fillRect(arc.centerX - drumRadius, arc.centerY - drumRadius, drumRadius * 2, drumRadius * 2);
          guideCtx.restore();
        }

        // Drum-head hoop: outer shadow ring + thick black rim + inner highlight.
        guideCtx.lineWidth = 3;
        guideCtx.strokeStyle = 'rgba(0, 0, 0, 0.48)';
        guideCtx.beginPath();
        guideCtx.arc(arc.centerX, arc.centerY, drumRadius + 2.4, 0, Math.PI * 2);
        guideCtx.stroke();

        guideCtx.lineWidth = 9;
        guideCtx.strokeStyle = 'rgba(8, 8, 8, 0.96)';
        guideCtx.beginPath();
        guideCtx.arc(arc.centerX, arc.centerY, drumRadius, 0, Math.PI * 2);
        guideCtx.stroke();

        guideCtx.lineWidth = 3;
        guideCtx.strokeStyle = 'rgba(248, 248, 248, 0.86)';
        guideCtx.beginPath();
        guideCtx.arc(arc.centerX, arc.centerY, drumRadius - 2.0, 0, Math.PI * 2);
        guideCtx.stroke();

        if (kaPulseStrength > 0.001) {
          const kaCenterY = arc.centerY + drumRadius * 0.25;
          const kaOverlayRadius = drumRadius * 1.5;
          const kaOverlayGradient = guideCtx.createRadialGradient(
            arc.centerX,
            kaCenterY,
            0,
            arc.centerX,
            kaCenterY,
            kaOverlayRadius
          );
          kaOverlayGradient.addColorStop(0, `rgba(118, 196, 255, ${(0.06 * kaPulseStrength).toFixed(3)})`);
          kaOverlayGradient.addColorStop(0.60, `rgba(138, 206, 255, ${(0.10 * kaPulseStrength).toFixed(3)})`);
          kaOverlayGradient.addColorStop(0.84, `rgba(138, 206, 255, ${(0.18 * kaPulseStrength).toFixed(3)})`);
          kaOverlayGradient.addColorStop(1, 'rgba(138, 206, 255, 0)');
          guideCtx.save();
          guideCtx.clip(drumFacePath);
          guideCtx.fillStyle = kaOverlayGradient;
          guideCtx.fillRect(arc.centerX - drumRadius, arc.centerY - drumRadius, drumRadius * 2, drumRadius * 2);
          guideCtx.restore();

          guideCtx.lineCap = 'round';
          guideCtx.lineWidth = 12;
          guideCtx.strokeStyle = `rgba(118, 196, 255, ${(0.62 * kaPulseStrength).toFixed(3)})`;
          guideCtx.beginPath();
          guideCtx.arc(arc.centerX, arc.centerY, drumRadius + 10, 0, Math.PI * 2);
          guideCtx.stroke();

          guideCtx.lineWidth = 6;
          guideCtx.strokeStyle = `rgba(198, 232, 255, ${(0.72 * kaPulseStrength).toFixed(3)})`;
          guideCtx.beginPath();
          guideCtx.arc(arc.centerX, arc.centerY, drumRadius + 15, 0, Math.PI * 2);
          guideCtx.stroke();
        }

        // Rivet-like hoop decorations spaced along the full rim.
        const rivetCount = 11;
        for (let i = 0; i < rivetCount; i += 1) {
          const angle = (-Math.PI / 2) + (Math.PI * 2 * i) / rivetCount;
          const rx = arc.centerX + Math.cos(angle) * drumRadius;
          const ry = arc.centerY + Math.sin(angle) * drumRadius;
          const rivetRadius = 3.2;

          guideCtx.fillStyle = 'rgba(12, 12, 12, 0.96)';
          guideCtx.beginPath();
          guideCtx.arc(rx, ry, rivetRadius, 0, Math.PI * 2);
          guideCtx.fill();

          guideCtx.lineWidth = 1;
          guideCtx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
          guideCtx.stroke();

          guideCtx.fillStyle = 'rgba(255, 255, 255, 0.62)';
          guideCtx.beginPath();
          guideCtx.arc(rx - 0.8, ry - 0.8, 1.1, 0, Math.PI * 2);
          guideCtx.fill();
        }

        guideCtx.restore();

        if (!isTouchBottomDeadzoneMaskHidden && touchBottomDeadzonePx > 0) {
          const deadzoneTop = Math.max(0, guideHeight - touchBottomDeadzonePx);
          const deadzoneHeight = Math.max(0, guideHeight - deadzoneTop);
          if (deadzoneHeight > 0.5) {
            guideCtx.fillStyle = 'rgba(26, 34, 48, 0.34)';
            guideCtx.fillRect(0, deadzoneTop, guideWidth, deadzoneHeight);

            guideCtx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
            guideCtx.lineWidth = 1.5;
            guideCtx.setLineDash([8, 6]);
            guideCtx.beginPath();
            guideCtx.moveTo(0, deadzoneTop + 0.5);
            guideCtx.lineTo(guideWidth, deadzoneTop + 0.5);
            guideCtx.stroke();
            guideCtx.setLineDash([]);

            guideCtx.save();
            guideCtx.beginPath();
            guideCtx.rect(0, deadzoneTop, guideWidth, deadzoneHeight);
            guideCtx.clip();
            guideCtx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
            const hatchStrokeWidth = 6;
            const hatchGapWidth = 10;
            guideCtx.lineWidth = hatchStrokeWidth;
            const hatchSpacing = hatchStrokeWidth + hatchGapWidth;
            const hatchSpan = guideHeight + guideWidth;
            for (let x = -hatchSpan; x <= guideWidth + hatchSpan; x += hatchSpacing) {
              guideCtx.beginPath();
              guideCtx.moveTo(x, deadzoneTop + deadzoneHeight);
              guideCtx.lineTo(x + deadzoneHeight, deadzoneTop);
              guideCtx.stroke();
            }
            guideCtx.restore();
          }
        }

        const shouldShowPlayOverlay = isPaused || (!isPlaying && notes.length > 0);
        if (shouldShowPlayOverlay) {
          const overlayGradient = guideCtx.createLinearGradient(0, 0, 0, guideHeight);
          overlayGradient.addColorStop(0, 'rgba(8, 13, 22, 0.42)');
          overlayGradient.addColorStop(1, 'rgba(10, 16, 26, 0.58)');
          guideCtx.fillStyle = overlayGradient;
          guideCtx.fillRect(0, 0, guideWidth, guideHeight);

          const iconRadius = Math.max(24, Math.min(44, Math.min(guideWidth, guideHeight) * 0.16));
          const iconX = guideWidth / 2;
          const iconY = guideHeight / 2;

          const iconShadow = guideCtx.createRadialGradient(iconX, iconY, iconRadius * 0.3, iconX, iconY, iconRadius * 1.6);
          iconShadow.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
          iconShadow.addColorStop(1, 'rgba(255, 255, 255, 0)');
          guideCtx.fillStyle = iconShadow;
          guideCtx.beginPath();
          guideCtx.arc(iconX, iconY, iconRadius * 1.6, 0, Math.PI * 2);
          guideCtx.fill();

          guideCtx.fillStyle = 'rgba(255, 255, 255, 0.92)';
          guideCtx.beginPath();
          guideCtx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
          guideCtx.fill();

          guideCtx.lineWidth = 2;
          guideCtx.strokeStyle = 'rgba(33, 43, 58, 0.64)';
          guideCtx.beginPath();
          guideCtx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
          guideCtx.stroke();

          const triangleW = iconRadius * 0.9;
          const triangleH = iconRadius * 1.02;
          const triangleLeft = iconX - triangleW * 0.32;
          guideCtx.fillStyle = '#111111';
          guideCtx.beginPath();
          guideCtx.moveTo(triangleLeft, iconY - triangleH / 2);
          guideCtx.lineTo(triangleLeft, iconY + triangleH / 2);
          guideCtx.lineTo(triangleLeft + triangleW, iconY);
          guideCtx.closePath();
          guideCtx.fill();
        }

        guideCtx.restore();
      }
    }

    ctx.restore();
  }, [
    visibleNotes,
    visibleBarLines,
    visibleRolls,
    visibleBalloons,
    scrollTheme,
    hitFxTick,
    activeRollForDisplay,
    rollHitCounts,
    rollBalloonHits,
    streakHits,
    summary,
    ngCount,
    nowMs,
    durationMs,
    globalSpeedMultiplier,
    scrollSpeedMultiplier,
    clockDriftMs,
    isDriftMonitorVisible,
    isPlaying,
    isPaused,
    barLines,
    notes.length,
    getTouchArcGeometry,
    touchBottomDeadzonePx,
    isTouchBottomDeadzoneMaskHidden
  ]);

  useEffect(() => {
    drawLaneCanvas();
  }, [drawLaneCanvas]);

  useEffect(() => {
    const onResize = () => {
      drawLaneCanvas();
      setIsMobileToolbar(window.innerWidth <= MOBILE_TOOLBAR_BREAKPOINT);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [drawLaneCanvas]);

  const mainPlaybackLabel = isPlaying ? '暂停' : (isPaused ? '继续' : '开始');
  const mainPlaybackIcon = isPlaying ? <PauseRegular /> : <PlayRegular />;
  const mainPlaybackAction = isPlaying ? pausePlayback : (isPaused ? resumePlayback : startPlayback);
  const mainPlaybackDisabled = !notes.length && !isPlaying;

  return (
    <div className="results-panel practice-panel">
      <PracticeBreadcrumb />

      <div className="table-wrapper practice-wrapper">
        <PracticeToolbar
          onImportClick={() => fileInputRef.current?.click()}
          mainPlaybackAction={mainPlaybackAction}
          mainPlaybackDisabled={mainPlaybackDisabled}
          mainPlaybackLabel={mainPlaybackLabel}
          mainPlaybackIcon={mainPlaybackIcon}
          onSeekPrevBar={() => seekByBarLine(-1)}
          onSeekNextBar={() => seekByBarLine(1)}
          onReset={resetPlayback}
          notesLength={notes.length}
          isPaused={isPaused}
          onOpenSpeedDialog={openSpeedDialog}
          onOpenSettings={openSettingsDialog}
        />

        <Dialog open={isSettingsDialogOpen} onOpenChange={handleSettingsDialogOpenChange}>
          <DialogSurface>
            <DialogBody className="practice-settings-dialog-body">
              <Button
                className="practice-settings-close-button"
                appearance="subtle"
                size="small"
                shape="circular"
                icon={<DismissRegular />}
                aria-label="关闭系统设置"
                title="关闭系统设置"
                onClick={closeSettingsDialog}
              />
              <DialogTitle>系统设置</DialogTitle>
              <DialogContent>
                <div className="practice-settings-form">
                  <div className="practice-setting-item">
                    <label className="practice-setting-label" htmlFor="practice-audio-compensation-input">判定补偿</label>
                    <Input
                      id="practice-audio-compensation-input"
                      type="number"
                      value={compensationInputValue}
                      onChange={(_, data) => setCompensationInputValue(String(data?.value ?? ''))}
                      contentAfter="ms"
                    />
                    <p className="practice-setting-help">正数会让判定稍微更晚，负数会更早。默认 0，范围 -300 到 300。当前：{touchAudioLatencyCompensationMs} ms</p>
                  </div>

                  <div className="practice-setting-item">
                    <label className="practice-setting-label" htmlFor="practice-drum-offset-x-input">鼓面位置 X 偏移</label>
                    <Input
                      id="practice-drum-offset-x-input"
                      type="number"
                      value={touchDrumOffsetXInputValue}
                      onChange={(_, data) => setTouchDrumOffsetXInputValue(String(data?.value ?? ''))}
                      contentAfter="px"
                    />
                    <p className="practice-setting-help">只移动位置，不改变大小。默认 0，范围 -300 到 300。当前：{touchDrumOffsetX}px</p>
                  </div>

                  <div className="practice-setting-item">
                    <label className="practice-setting-label" htmlFor="practice-drum-offset-y-input">鼓面位置 Y 偏移</label>
                    <Input
                      id="practice-drum-offset-y-input"
                      type="number"
                      value={touchDrumOffsetYInputValue}
                      onChange={(_, data) => setTouchDrumOffsetYInputValue(String(data?.value ?? ''))}
                      contentAfter="px"
                    />
                    <p className="practice-setting-help">只移动位置，不改变大小。默认 0，范围 -300 到 300。当前：{touchDrumOffsetY}px</p>
                  </div>

                  <div className="practice-setting-item">
                    <label className="practice-setting-label" htmlFor="practice-drum-scale-input">鼓面缩放</label>
                    <Input
                      id="practice-drum-scale-input"
                      type="number"
                      value={touchDrumScaleInputValue}
                      onChange={(_, data) => setTouchDrumScaleInputValue(String(data?.value ?? ''))}
                      contentAfter="%"
                    />
                    <p className="practice-setting-help">仅控制大小。默认 100%，范围 10% 到 500%。当前：{touchDrumScalePercent}%</p>
                  </div>

                  <div className="practice-setting-item">
                    <label className="practice-setting-label" htmlFor="practice-touch-bottom-deadzone-input">底边防误触高度</label>
                    <Input
                      id="practice-touch-bottom-deadzone-input"
                      type="number"
                      value={touchBottomDeadzoneInputValue}
                      onChange={(_, data) => setTouchBottomDeadzoneInputValue(String(data?.value ?? ''))}
                      contentAfter="px"
                    />
                    <p className="practice-setting-help">该高度以下不会触发触摸判定。默认 100，范围 0 到 400。当前：{touchBottomDeadzonePx}px</p>
                  </div>

                  <div className="practice-setting-item">
                    <label className="practice-setting-label" htmlFor="practice-touch-bottom-deadzone-mask-hidden-switch">禁区遮罩显示</label>
                    <Switch
                      id="practice-touch-bottom-deadzone-mask-hidden-switch"
                      checked={!hideTouchBottomDeadzoneMaskInputValue}
                      label={hideTouchBottomDeadzoneMaskInputValue ? '隐藏' : '显示'}
                      onChange={(_, data) => setHideTouchBottomDeadzoneMaskInputValue(!Boolean(data?.checked))}
                    />
                    <p className="practice-setting-help">隐藏后防误触依然生效，只是不显示半透明禁区遮罩。</p>
                  </div>

                  <div className="practice-setting-item">
                    <label className="practice-setting-label" htmlFor="practice-drift-monitor-visible-switch">实时偏差显示</label>
                    <Switch
                      id="practice-drift-monitor-visible-switch"
                      checked={showDriftMonitorInputValue}
                      label={showDriftMonitorInputValue ? '显示' : '隐藏'}
                      onChange={(_, data) => setShowDriftMonitorInputValue(Boolean(data?.checked))}
                    />
                    <p className="practice-setting-help">显示后会在进度旁标注修正后的实时延迟毫秒值；越接近 0 通常越容易打准判定。</p>
                  </div>
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={saveCompensationSetting}>保存</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <Dialog open={isSpeedDialogOpen} onOpenChange={handleSpeedDialogOpenChange}>
          <DialogSurface>
            <DialogBody className="practice-settings-dialog-body">
              <Button
                className="practice-settings-close-button"
                appearance="subtle"
                size="small"
                shape="circular"
                icon={<DismissRegular />}
                aria-label="关闭游戏设置"
                title="关闭游戏设置"
                onClick={closeSpeedDialog}
              />
              <DialogTitle>游戏设置</DialogTitle>
              <DialogContent>
                <div className="practice-settings-form">
                  <div className="practice-setting-item">
                    <label className="practice-setting-label" htmlFor="practice-course-select">难度选择</label>
                    <Select
                      id="practice-course-select"
                      value={courseInputValue}
                      disabled={!availableCourses.length || isPlaying}
                      onChange={(_, data) => {
                        const nextCourseKey = String(data?.value || '');
                        setCourseInputValue(nextCourseKey);
                        const nextBranches = getBranchOptions(courseChartsByKey[nextCourseKey]);
                        const safeBranch = nextBranches.includes(branchInputValue)
                          ? branchInputValue
                          : getPreferredBranchSelection(nextBranches);
                        setBranchInputValue(safeBranch);
                      }}
                    >
                      {availableCourses.map((course) => (
                        <option key={course.value} value={course.value}>
                          {course.label}
                        </option>
                      ))}
                    </Select>
                    <p className="practice-setting-help">默认顺序：魔王里 → 魔王 → 困难 → 普通 → 简单。</p>
                  </div>

                  <div className="practice-setting-item">
                    <label className="practice-setting-label" htmlFor="practice-branch-select">谱面类型</label>
                    <Select
                      id="practice-branch-select"
                      value={branchInputValue}
                      disabled={!branchOptionsForDialog.length || isPlaying}
                      onChange={(_, data) => setBranchInputValue(String(data?.value || ''))}
                    >
                      {branchOptionsForDialog.map((branch) => (
                        <option key={branch} value={branch}>
                          {BRANCH_LABEL_MAP[branch] || `${branch}谱面`}
                        </option>
                      ))}
                    </Select>
                    <p className="practice-setting-help">切换分歧谱面类型，播放中不可修改。</p>
                  </div>

                  <div className="practice-setting-item">
                    <label className="practice-setting-label" htmlFor="practice-global-speed-input">整体变速倍率</label>
                    <Input
                      id="practice-global-speed-input"
                      type="number"
                      step={0.1}
                      value={globalSpeedInputValue}
                      onChange={(_, data) => setGlobalSpeedInputValue(String(data?.value ?? ''))}
                      contentAfter="x"
                    />
                    <p className="practice-setting-help">默认 1。调整后音乐与谱面时钟同步加减速，形成整体变速体感。</p>
                  </div>
                  <div className="practice-setting-item">
                    <label className="practice-setting-label" htmlFor="practice-scroll-speed-input">卷轴速度倍率</label>
                    <Input
                      id="practice-scroll-speed-input"
                      type="number"
                      step={0.1}
                      value={scrollSpeedInputValue}
                      onChange={(_, data) => setScrollSpeedInputValue(String(data?.value ?? ''))}
                      contentAfter="x"
                    />
                    <p className="practice-setting-help">默认 1。仅改变卷速与间距，不改变音乐节奏和判定时机。</p>
                  </div>
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={saveSpeedSetting}>保存</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <PracticeStage
          onPointerDown={handlePracticePointerDown}
          canvasRef={canvasRef}
          touchGuideCanvasRef={touchGuideCanvasRef}
          fileInputRef={fileInputRef}
          onImportLocalCharts={importLocalCharts}
        />
      </div>
    </div>
  );
}

export default PracticeModePage;