import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Body1,
  Button,
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  DismissRegular,
  StarFilled,
  StarRegular
} from '@fluentui/react-icons';
import { matchPath, useLocation, useNavigate } from 'react-router-dom';
import { createChartView, getChartInfo } from '../TJARenderer/src/api.ts';

function getDifficultyColor(difficulty) {
  const colors = {
    easy: '#cf202f',
    normal: '#4d7f2f',
    hard: '#005a9c',
    oni: '#8f1d4f',
    edit: '#5c2d91'
  };
  return colors[difficulty] || '#475467';
}

function getBranchColor(branchType) {
  const colors = {
    normal: '#667085',
    expert: '#0078d4',
    master: '#b42318'
  };
  return colors[branchType] || '#667085';
}

function formatRatingValue(value) {
  if (value === 0 || !value) return '-';
  return Number(value).toFixed(2);
}

function formatRatingWithRatio(value, ratio) {
  const valueText = formatRatingValue(value);
  const ratioText = formatRatingValue(ratio);
  if (ratioText === '-') return valueText;
  return `${valueText} (${ratioText})`;
}

function formatGapThreshold(value) {
  if (!Number.isFinite(value)) return '-';
  return Number(value).toFixed(1);
}

function pickCourseSpecifier(chartInfo, difficulty) {
  const specifiers = chartInfo?.courseSpecifiers || [];
  if (!specifiers.length) return undefined;

  const diffKey = String(difficulty || '').toLowerCase();
  const exact = specifiers.find((item) => String(item?.difficulty || '').toLowerCase() === diffKey);
  if (exact) return exact;

  const contains = specifiers.find((item) => String(item?.difficulty || '').toLowerCase().includes(diffKey));
  if (contains) return contains;

  return specifiers[0];
}

function isCoarseInputDevice() {
  return navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
}

function renderChartToCanvas(detail, canvas, options = {}) {
  const chartInfo = getChartInfo(detail.tjaContent);
  const course = pickCourseSpecifier(chartInfo, detail.difficulty);
  const branchOption = detail.branchType && detail.branchType !== 'unbranched' ? detail.branchType : 'auto';
  const baseDpr = window.devicePixelRatio || 1;
  const qualityScale = Number.isFinite(options.qualityScale) ? options.qualityScale : 1;
  const dpr = Math.min(6, Math.max(1, baseDpr * qualityScale));
  const beatsPerLine = Number.isFinite(options.beatsPerLine) ? options.beatsPerLine : 16;

  createChartView(detail.tjaContent, canvas, course, {
    branch: branchOption,
    zoom: { beatsPerLine },
    showAttribution: false,
    dpr
  });
}

function getTouchDistance(touchA, touchB) {
  const dx = touchA.clientX - touchB.clientX;
  const dy = touchA.clientY - touchB.clientY;
  return Math.hypot(dx, dy);
}

function getTouchCenter(touchA, touchB) {
  return {
    x: (touchA.clientX + touchB.clientX) / 2,
    y: (touchA.clientY + touchB.clientY) / 2
  };
}

function ChartDetailPage({ detail, chartId = '', onBack, isFavorite = false, onToggleFavorite }) {
  const location = useLocation();
  const navigate = useNavigate();

  const previewRouteMatch = matchPath('/chart/:chartId/preview', location.pathname);
  const isPreviewRoute = Boolean(previewRouteMatch);

  const previewCanvasRef = useRef(null);
  const previewShellRef = useRef(null);
  const resizeDebounceTimerRef = useRef(null);
  const lastPreviewSizeRef = useRef({ width: 0, height: 0 });
  const overlayViewportRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const dragStateRef = useRef({ active: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
  const touchStateRef = useRef({
    mode: 'none',
    startDistance: 0,
    startScale: 1,
    startOffset: { x: 0, y: 0 },
    startCenter: { x: 0, y: 0 },
    startPoint: { x: 0, y: 0 }
  });
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const suppressDblClickUntilRef = useRef(0);
  const [previewError, setPreviewError] = useState('');
  const [overlayPreviewError, setOverlayPreviewError] = useState('');
  const [previewResizeTick, setPreviewResizeTick] = useState(0);
  const [overlayScale, setOverlayScale] = useState(1);
  const [overlayRenderScale, setOverlayRenderScale] = useState(1);
  const [isOverlayRenderReady, setIsOverlayRenderReady] = useState(false);
  const [isOverlayCanvasVisible, setIsOverlayCanvasVisible] = useState(false);
  const [isDirectManipulating, setIsDirectManipulating] = useState(false);
  const [overlayOffset, setOverlayOffset] = useState({ x: 0, y: 0 });
  const overlayScaleRef = useRef(1);
  const overlayOffsetRef = useRef({ x: 0, y: 0 });
  const overlayTransformRafRef = useRef(0);
  const pendingOverlayScaleRef = useRef(1);
  const pendingOverlayOffsetRef = useRef({ x: 0, y: 0 });
  const pendingOverlayCommitRef = useRef({ scale: false, offset: false });
  const overlayRenderDebounceTimerRef = useRef(null);
  const wheelInteractionTimerRef = useRef(null);
  const doubleTapToggleRafRef = useRef(0);

  const previewCanvasKey = useMemo(() => {
    if (!detail) return 'chart-preview-empty';
    return `${detail.songName || ''}-${detail.difficulty || ''}-${detail.branchType || ''}`;
  }, [detail]);

  const statItems = detail?.stats ? [
    { label: '音符总数', value: detail.stats.totalNotes },
    { label: '平均间隔', value: `${detail.stats.avgGap} ms` },
    { label: '间隔中位数', value: `${detail.stats.medianGap} ms` },
    { label: '最小间隔', value: `${detail.stats.minGap} ms` },
    {
      label: '最高频间隔',
      value: detail.stats.modeGap === '-'
        ? '-'
        : `${detail.stats.modeGap} ms (${detail.stats.modeGapCount} 次)`
    },
    {
      label: '次高频间隔',
      value: detail.stats.secondModeGap === '-'
        ? '-'
        : `${detail.stats.secondModeGap} ms (${detail.stats.secondModeGapCount} 次)`
    }
  ] : [];

  const ratingItems = detail?.ratings ? [
    { label: '体力', value: detail.ratings.stamina },
    { label: '手速', value: detail.ratings.speed },
    { label: '手速（95线）', value: detail.ratings.speed95 },
    { label: '爆发', value: detail.ratings.burst },
    { label: '复合', value: formatRatingWithRatio(detail.ratings.complex, detail.ratings.complexRatio) },
    { label: '节奏', value: formatRatingWithRatio(detail.ratings.rhythm, detail.ratings.rhythmRatio) }
  ] : [];

  const gapProfile = detail?.stats?.gapSpeedProfile || null;
  const fastMax = formatGapThreshold(gapProfile?.fastMax);
  const mediumMax = formatGapThreshold(gapProfile?.mediumMax);
  const normalMax = formatGapThreshold(gapProfile?.normalMax);

  useEffect(() => {
    overlayScaleRef.current = overlayScale;
  }, [overlayScale]);

  useEffect(() => {
    overlayOffsetRef.current = overlayOffset;
  }, [overlayOffset]);

  useEffect(() => {
    return () => {
      if (overlayTransformRafRef.current) {
        window.cancelAnimationFrame(overlayTransformRafRef.current);
        overlayTransformRafRef.current = 0;
      }
      if (doubleTapToggleRafRef.current) {
        window.cancelAnimationFrame(doubleTapToggleRafRef.current);
        doubleTapToggleRafRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    if (!isPreviewRoute) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPreviewRoute]);

  useEffect(() => {
    if (!isPreviewRoute) return;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        closePreviewRoute();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isPreviewRoute]);

  useEffect(() => {
    if (!isPreviewRoute) return;
    setOverlayScale(1);
    setOverlayRenderScale(1);
    setIsOverlayRenderReady(false);
    setIsOverlayCanvasVisible(false);
    setOverlayOffset({ x: 0, y: 0 });
    setOverlayPreviewError('');
  }, [isPreviewRoute, previewCanvasKey]);

  useEffect(() => {
    if (!isPreviewRoute || !detail?.tjaContent) return;

    // Sync initial position with boundary/centering rules to avoid first-frame jump.
    let frame2 = 0;
    const frame1 = window.requestAnimationFrame(() => {
      frame2 = window.requestAnimationFrame(() => {
        setOverlayOffset((prev) => clampOverlayOffset(prev, overlayScaleRef.current));
        setIsOverlayRenderReady(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(frame1);
      if (frame2) {
        window.cancelAnimationFrame(frame2);
      }
    };
  }, [isPreviewRoute, previewCanvasKey, detail?.tjaContent]);

  useEffect(() => {
    if (!isPreviewRoute) return;
    if (overlayRenderDebounceTimerRef.current) {
      clearTimeout(overlayRenderDebounceTimerRef.current);
    }

    overlayRenderDebounceTimerRef.current = setTimeout(() => {
      setOverlayRenderScale(overlayScaleRef.current);
    }, 250);

    return () => {
      if (overlayRenderDebounceTimerRef.current) {
        clearTimeout(overlayRenderDebounceTimerRef.current);
        overlayRenderDebounceTimerRef.current = null;
      }
    };
  }, [overlayScale, isPreviewRoute]);

  useEffect(() => {
    const shell = previewShellRef.current;
    if (!shell || !detail?.tjaContent) return;

    const schedulePreviewRerender = () => {
      if (resizeDebounceTimerRef.current) {
        clearTimeout(resizeDebounceTimerRef.current);
      }

      resizeDebounceTimerRef.current = setTimeout(() => {
        setPreviewResizeTick((value) => value + 1);
      }, 300);
    };

    const updateByElementSize = (element) => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      if (width <= 0 || height <= 0) return;
      if (width === lastPreviewSizeRef.current.width && height === lastPreviewSizeRef.current.height) return;

      lastPreviewSizeRef.current = { width, height };
      schedulePreviewRerender();
    };

    const handleWindowResize = () => {
      if (!previewShellRef.current) return;
      updateByElementSize(previewShellRef.current);
    };

    updateByElementSize(shell);

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        updateByElementSize(entry.target);
      });
      resizeObserver.observe(shell);
    }

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (resizeDebounceTimerRef.current) {
        clearTimeout(resizeDebounceTimerRef.current);
        resizeDebounceTimerRef.current = null;
      }
    };
  }, [detail?.tjaContent, previewCanvasKey]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    if (!detail?.tjaContent) {
      setPreviewError('该谱面没有缓存的 TJA 文本，无法渲染预览。');
      return;
    }

    try {
      renderChartToCanvas(detail, canvas);
      setPreviewError('');
    } catch (error) {
      setPreviewError(`谱面预览渲染失败：${error?.message || String(error)}`);
    }
  }, [detail, previewCanvasKey, previewResizeTick]);

  useEffect(() => {
    if (!isPreviewRoute || !isOverlayRenderReady) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    let revealFrame = 0;

    if (!detail?.tjaContent) {
      setOverlayPreviewError('该谱面没有缓存的 TJA 文本，无法渲染预览。');
      return;
    }

    try {
      const coarseInput = isCoarseInputDevice();
      renderChartToCanvas(detail, canvas, {
        beatsPerLine: coarseInput ? 10 : 14,
        qualityScale: coarseInput
          ? Math.max(1.8, Math.min(3.2, overlayRenderScale))
          : Math.max(1.2, Math.min(2.4, overlayRenderScale))
      });

      // Re-clamp immediately after render to absorb any canvas size changes.
      setOverlayOffset((prev) => clampOverlayOffset(prev, overlayScaleRef.current));

      // Reveal canvas only after at least one post-render frame.
      revealFrame = window.requestAnimationFrame(() => {
        setIsOverlayCanvasVisible(true);
      });
      setOverlayPreviewError('');
    } catch (error) {
      setOverlayPreviewError(`谱面预览渲染失败：${error?.message || String(error)}`);
      setIsOverlayCanvasVisible(true);
    }

    return () => {
      if (revealFrame) {
        window.cancelAnimationFrame(revealFrame);
      }
    };
  }, [detail, isPreviewRoute, previewCanvasKey, overlayRenderScale, isOverlayRenderReady]);

  useEffect(() => {
    if (!isPreviewRoute) return;
    const viewport = overlayViewportRef.current;
    if (!viewport) return;

    const onWheel = (event) => {
      handleOverlayWheel(event);
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', onWheel);
      if (wheelInteractionTimerRef.current) {
        clearTimeout(wheelInteractionTimerRef.current);
        wheelInteractionTimerRef.current = null;
      }
    };
  }, [isPreviewRoute]);

  const clampScale = React.useCallback((value) => Math.min(4, Math.max(1, value)), []);

  const queueOverlayTransformCommit = () => {
    if (overlayTransformRafRef.current) return;
    overlayTransformRafRef.current = window.requestAnimationFrame(() => {
      overlayTransformRafRef.current = 0;
      const commitFlags = pendingOverlayCommitRef.current;
      if (commitFlags.scale) {
        setOverlayScale(pendingOverlayScaleRef.current);
      }
      if (commitFlags.offset) {
        setOverlayOffset(pendingOverlayOffsetRef.current);
      }
      pendingOverlayCommitRef.current = { scale: false, offset: false };
    });
  };

  const commitOverlayOffset = (nextOffset) => {
    overlayOffsetRef.current = nextOffset;
    pendingOverlayOffsetRef.current = nextOffset;
    pendingOverlayCommitRef.current.offset = true;
    queueOverlayTransformCommit();
  };

  const commitOverlayScaleAndOffset = (nextScale, nextOffset) => {
    overlayScaleRef.current = nextScale;
    overlayOffsetRef.current = nextOffset;
    pendingOverlayScaleRef.current = nextScale;
    pendingOverlayOffsetRef.current = nextOffset;
    pendingOverlayCommitRef.current.scale = true;
    pendingOverlayCommitRef.current.offset = true;
    queueOverlayTransformCommit();
  };

  const getFitScale = () => {
    const viewport = overlayViewportRef.current;
    const canvas = overlayCanvasRef.current;
    if (!viewport || !canvas) return 1;

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;

    if (!viewportWidth || !viewportHeight || !canvasWidth || !canvasHeight) return 1;

    const fitScale = Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight);
    return Math.min(4, Math.max(1, fitScale));
  };

  const getNativeCanvasScale = () => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return 1;

    const cssWidth = canvas.offsetWidth;
    const pixelWidth = canvas.width;
    if (!cssWidth || !pixelWidth) return 1;

    // Native canvas scale is backing-store pixels over CSS pixels.
    return clampScale(pixelWidth / cssWidth);
  };

  const getCenteredOffsetForScale = (scale) => {
    const viewport = overlayViewportRef.current;
    const canvas = overlayCanvasRef.current;
    if (!viewport || !canvas) return { x: 0, y: 0 };

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const scaledWidth = canvas.offsetWidth * scale;
    const scaledHeight = canvas.offsetHeight * scale;

    return {
      x: (viewportWidth - scaledWidth) / 2,
      y: (viewportHeight - scaledHeight) / 2
    };
  };

  const clampOverlayOffset = (nextOffset, scale = overlayScaleRef.current) => {
    const viewport = overlayViewportRef.current;
    const canvas = overlayCanvasRef.current;
    if (!viewport || !canvas) return nextOffset;

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const canvasWidth = canvas.offsetWidth;
    const canvasHeight = canvas.offsetHeight;

    if (!viewportWidth || !viewportHeight || !canvasWidth || !canvasHeight) {
      return nextOffset;
    }

    const scaledWidth = canvasWidth * scale;
    const scaledHeight = canvasHeight * scale;

    let minX;
    let maxX;
    if (scaledWidth <= viewportWidth) {
      const centeredX = (viewportWidth - scaledWidth) / 2;
      minX = centeredX;
      maxX = centeredX;
    } else {
      minX = viewportWidth - scaledWidth;
      maxX = 0;
    }

    let minY;
    let maxY;
    if (scaledHeight <= viewportHeight) {
      const centeredY = (viewportHeight - scaledHeight) / 2;
      minY = centeredY;
      maxY = centeredY;
    } else {
      minY = viewportHeight - scaledHeight;
      maxY = 0;
    }

    return {
      x: Math.min(maxX, Math.max(minX, nextOffset.x)),
      y: Math.min(maxY, Math.max(minY, nextOffset.y))
    };
  };

  const openPreviewRoute = React.useCallback(() => {
    if (!chartId) return;
    navigate({
      pathname: `/chart/${encodeURIComponent(chartId)}/preview`,
      search: location.search
    });
  }, [chartId, navigate, location.search]);

  const closePreviewRoute = React.useCallback(() => {
    if (!chartId) {
      navigate(-1);
      return;
    }
    navigate({
      pathname: `/chart/${encodeURIComponent(chartId)}`,
      search: location.search
    });
  }, [chartId, navigate, location.search]);

  const savePreviewImage = React.useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const fileName = `${detail?.songName || 'chart'}-preview.png`;

    const triggerDownload = (url) => {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    };

    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        triggerDownload(url);
        URL.revokeObjectURL(url);
      }, 'image/png');
      return;
    }

    triggerDownload(canvas.toDataURL('image/png'));
  }, [detail?.songName]);

  function toggleOriginalAndFitScale(centerPoint) {
    const nativeScale = getNativeCanvasScale();
    const currentScale = overlayScaleRef.current;
    const targetScale = currentScale > 1.02 ? 1 : nativeScale;

    let nextOffset;
    if (centerPoint && Number.isFinite(centerPoint.x) && Number.isFinite(centerPoint.y)) {
      const prevOffset = overlayOffsetRef.current;
      const contentX = (centerPoint.x - prevOffset.x) / currentScale;
      const contentY = (centerPoint.y - prevOffset.y) / currentScale;
      nextOffset = {
        x: centerPoint.x - contentX * targetScale,
        y: centerPoint.y - contentY * targetScale
      };
    } else {
      nextOffset = getCenteredOffsetForScale(targetScale);
    }

    const clampedOffset = clampOverlayOffset(nextOffset, targetScale);
    commitOverlayScaleAndOffset(targetScale, clampedOffset);
  }

  const handleOverlayWheel = React.useCallback((event) => {
    event.preventDefault();
    setIsDirectManipulating(true);
    if (wheelInteractionTimerRef.current) {
      clearTimeout(wheelInteractionTimerRef.current);
    }

    const viewport = overlayViewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const prevScale = overlayScaleRef.current;

    let delta = event.deltaY;
    if (event.deltaMode === 1) {
      delta *= 16;
    } else if (event.deltaMode === 2) {
      delta *= viewport.clientHeight || 800;
    }

    const scaleFactor = Math.exp(-delta * 0.0018);
    const nextScale = clampScale(prevScale * scaleFactor);
    if (nextScale === prevScale) return;

    const prevOffset = overlayOffsetRef.current;
    const contentX = (pointerX - prevOffset.x) / prevScale;
    const contentY = (pointerY - prevOffset.y) / prevScale;
    const nextOffset = {
      x: pointerX - contentX * nextScale,
      y: pointerY - contentY * nextScale
    };

    commitOverlayScaleAndOffset(nextScale, clampOverlayOffset(nextOffset, nextScale));

    wheelInteractionTimerRef.current = setTimeout(() => {
      setIsDirectManipulating(false);
      wheelInteractionTimerRef.current = null;
    }, 90);
  }, [clampScale]);

  const handleOverlayMouseDown = React.useCallback((event) => {
    event.preventDefault();
    setIsDirectManipulating(true);
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: overlayOffsetRef.current.x,
      offsetY: overlayOffsetRef.current.y
    };
  }, []);

  const handleOverlayMouseMove = React.useCallback((event) => {
    if (!dragStateRef.current.active) return;
    const dx = event.clientX - dragStateRef.current.startX;
    const dy = event.clientY - dragStateRef.current.startY;
    commitOverlayOffset(clampOverlayOffset({
      x: dragStateRef.current.offsetX + dx,
      y: dragStateRef.current.offsetY + dy
    }));
  }, []);

  const handleOverlayMouseUp = React.useCallback(() => {
    dragStateRef.current.active = false;
    setIsDirectManipulating(false);
  }, []);

  const handleOverlayTouchStart = React.useCallback((event) => {
    setIsDirectManipulating(true);
    if (event.touches.length === 2) {
      const [touchA, touchB] = event.touches;
      touchStateRef.current = {
        mode: 'pinch',
        startDistance: getTouchDistance(touchA, touchB),
        startScale: overlayScaleRef.current,
        startOffset: overlayOffsetRef.current,
        startCenter: getTouchCenter(touchA, touchB),
        startPoint: { x: 0, y: 0 }
      };
      return;
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      touchStateRef.current = {
        mode: 'pan',
        startDistance: 0,
        startScale: overlayScaleRef.current,
        startOffset: overlayOffsetRef.current,
        startCenter: { x: 0, y: 0 },
        startPoint: { x: touch.clientX, y: touch.clientY }
      };
    }
  }, []);

  const handleOverlayTouchMove = React.useCallback((event) => {
    if (!touchStateRef.current.mode || touchStateRef.current.mode === 'none') return;

    if (touchStateRef.current.mode === 'pan' && event.touches.length === 1) {
      const touch = event.touches[0];
      const dx = touch.clientX - touchStateRef.current.startPoint.x;
      const dy = touch.clientY - touchStateRef.current.startPoint.y;
      commitOverlayOffset(clampOverlayOffset({
        x: touchStateRef.current.startOffset.x + dx,
        y: touchStateRef.current.startOffset.y + dy
      }));
      return;
    }

    if (touchStateRef.current.mode === 'pinch' && event.touches.length === 2) {
      const [touchA, touchB] = event.touches;
      const nextDistance = getTouchDistance(touchA, touchB);
      const center = getTouchCenter(touchA, touchB);
      const nextScale = clampScale((nextDistance / touchStateRef.current.startDistance) * touchStateRef.current.startScale);
      const contentX = (touchStateRef.current.startCenter.x - touchStateRef.current.startOffset.x) / touchStateRef.current.startScale;
      const contentY = (touchStateRef.current.startCenter.y - touchStateRef.current.startOffset.y) / touchStateRef.current.startScale;

      commitOverlayScaleAndOffset(nextScale, clampOverlayOffset({
        x: center.x - contentX * nextScale,
        y: center.y - contentY * nextScale
      }, nextScale));
    }
  }, [clampScale]);

  const handleOverlayTouchEnd = React.useCallback((event) => {
    const prevMode = touchStateRef.current.mode;

    if (event.touches.length === 0) {
      touchStateRef.current.mode = 'none';
      setIsDirectManipulating(false);

      if (prevMode === 'pan' && event.changedTouches.length === 1) {
        const touch = event.changedTouches[0];
        const now = Date.now();
        const dt = now - lastTapRef.current.time;
        const dx = touch.clientX - lastTapRef.current.x;
        const dy = touch.clientY - lastTapRef.current.y;
        const distance = Math.hypot(dx, dy);

        if (dt > 0 && dt < 300 && distance < 28) {
          const viewport = overlayViewportRef.current;
          const rect = viewport?.getBoundingClientRect();
          const point = rect
            ? { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
            : undefined;
          // Run the toggle on next frame so `.is-direct-manipulating` is removed first.
          if (doubleTapToggleRafRef.current) {
            window.cancelAnimationFrame(doubleTapToggleRafRef.current);
          }
          doubleTapToggleRafRef.current = window.requestAnimationFrame(() => {
            doubleTapToggleRafRef.current = 0;
            toggleOriginalAndFitScale(point);
          });
          suppressDblClickUntilRef.current = Date.now() + 450;
          lastTapRef.current = { time: 0, x: 0, y: 0 };
          return;
        }

        lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
      }
      return;
    }

    if (event.touches.length === 1) {
      setIsDirectManipulating(true);
      const touch = event.touches[0];
      touchStateRef.current = {
        mode: 'pan',
        startDistance: 0,
        startScale: overlayScaleRef.current,
        startOffset: overlayOffsetRef.current,
        startCenter: { x: 0, y: 0 },
        startPoint: { x: touch.clientX, y: touch.clientY }
      };
    }
  }, []);

  return (
    <div className="results-panel chart-detail-panel">
      <header className="chart-detail-header" aria-label="谱面详情导航">
        <div className="chart-detail-header-row">
          <Breadcrumb className="list-breadcrumb" aria-label="谱面详情面包屑">
            <BreadcrumbItem>
              <BreadcrumbButton onClick={onBack}>数据分析</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton onClick={onBack}>谱面分析</BreadcrumbButton>
            </BreadcrumbItem>
            <BreadcrumbDivider />
            <BreadcrumbItem>
              <BreadcrumbButton className="chart-breadcrumb-song" current aria-current="page">
                <span className="chart-breadcrumb-song-text">{detail?.songName || '未知歌曲'}</span>
              </BreadcrumbButton>
            </BreadcrumbItem>
          </Breadcrumb>
        </div>
      </header>

      <div className="chart-detail-body">
        {detail ? (
          <div className="chart-detail-grid">
            <div className="chart-detail-left-column">
              <section className="chart-detail-card chart-detail-stats-card" aria-label="概览">
                <div className="chart-detail-card-title-row">
                  <h3 className="chart-detail-card-title">概览</h3>
                  <Button
                    className="chart-detail-favorite-button"
                    appearance="transparent"
                    size="small"
                    icon={isFavorite ? <StarFilled color="#f5b301" /> : <StarRegular color="#f5b301" />}
                    aria-label={isFavorite ? '取消收藏谱面' : '收藏谱面'}
                    disabled={!onToggleFavorite}
                    onClick={onToggleFavorite}
                  />
                </div>

                {(detail?.diffLabel || detail?.branchLabel || detail?.stats) ? (
                  <div className="chart-detail-stats-grid">
                    {(detail?.diffLabel || detail?.level || detail?.branchLabel) && (
                      <>
                        <div className="chart-detail-stat-block chart-detail-basic-info">
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '14px' }}>
                            <div style={{ color: getDifficultyColor(detail.difficulty), fontWeight: 700 }}>
                              {detail.diffLabel}
                            </div>
                            {detail.level && (
                              <div style={{ color: '#1f4f71' }}>
                                ★{detail.level}
                              </div>
                            )}
                            {detail.branchLabel && (
                              <div style={{ color: getBranchColor(detail.branchType), fontWeight: 600 }}>
                                {detail.branchLabel}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                    {statItems.map((item) => (
                      <div
                        className={`chart-detail-stat-block ${item.label.includes('频间隔') ? 'chart-detail-stat-block-wide' : ''}`}
                        key={item.label}
                      >
                        <span className="chart-detail-stat-label">{item.label}</span>
                        <span className="chart-detail-stat-value">{item.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Body1 className="hint">无可用的概要数据</Body1>
                )}
              </section>

              <section className="chart-detail-card chart-detail-ratings-card" aria-label="定数">
                <h3 className="chart-detail-card-title">难易度量化评估</h3>
                {ratingItems.length ? (
                  <div className="chart-detail-ratings-grid">
                    {ratingItems.map((item) => (
                      <div className="chart-detail-rating-block chart-detail-stat-block" key={item.label}>
                        <span className="chart-detail-stat-label">{item.label}</span>
                        <span className="chart-detail-stat-value">
                          {typeof item.value === 'string' ? item.value : formatRatingValue(item.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Body1 className="hint">暂无可用定数数据</Body1>
                )}
              </section>
            </div>

            <div className="chart-detail-main-column">
              <section className="chart-detail-card chart-detail-preview-card" aria-label="谱面预览">
                <h3 className="chart-detail-card-title">谱面预览</h3>
                {detail?.tjaContent ? (
                  <div className="chart-detail-preview-shell" ref={previewShellRef}>
                    <button
                      type="button"
                      className="chart-detail-preview-trigger"
                      aria-label="打开谱面全屏预览"
                      onClick={openPreviewRoute}
                    >
                      <canvas
                        key={previewCanvasKey}
                        ref={previewCanvasRef}
                        className="chart-detail-preview-canvas"
                      />
                    </button>
                    <Body1 className="hint">点击谱面可进入全屏预览，可缩放与拖动。</Body1>
                    {previewError ? <Body1 className="hint">{previewError}</Body1> : null}
                  </div>
                ) : (
                  <Body1 className="hint">该谱面没有可用的 TJA 缓存，无法渲染预览。</Body1>
                )}
              </section>

              <section className="chart-detail-card chart-detail-gaps-card" aria-label="音符间隔明细">
                <h3 className="chart-detail-card-title">音符间隔明细</h3>
                <div className="chart-gap-legend" aria-label="间隔颜色说明">
                  <span className="gap-fast gap-value">快速 ≤{fastMax}ms</span>
                  <span className="gap-medium gap-value">中速 {fastMax}-{mediumMax}ms</span>
                  <span className="gap-normal gap-value">常规 {mediumMax}-{normalMax}ms</span>
                  <span className="gap-slow gap-value">慢速 {'>'}{normalMax}ms</span>
                  <span className="gap-null gap-value">空值 -</span>
                </div>
                {detail.bars.length ? (
                  <div className="chart-gap-list gap-list">
                    {detail.bars.map((bar) => (
                      <div className="gap-bar" key={bar.label}>
                        <span className="gap-bar-label">{bar.label}</span>
                        <div className="gap-bar-values">
                          {bar.values.length ? (
                            bar.values.map((value, idx) => (
                              <span className={`gap-value ${value.className}`} key={`${bar.label}-${idx}`}>
                                {value.text}
                              </span>
                            ))
                          ) : (
                            <span className="gap-null gap-value" key={`${bar.label}-placeholder`}>
                              -
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Body1 className="hint">该谱面暂无可展示的小节间隔数据。</Body1>
                )}
              </section>
            </div>
          </div>
        ) : (
          <div className="chart-detail-card chart-detail-empty">
            <Body1 className="hint">未找到对应谱面详情，请从列表重新进入。</Body1>
          </div>
        )}
      </div>

      {isPreviewRoute ? (
        <div
          className="chart-preview-route-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="谱面全屏预览"
        >
          <div
            ref={overlayViewportRef}
            className="chart-preview-route-viewport"
            onMouseDown={handleOverlayMouseDown}
            onDoubleClick={(event) => {
              if (isCoarseInputDevice()) return;
              if (Date.now() < suppressDblClickUntilRef.current) return;
              const rect = event.currentTarget.getBoundingClientRect();
              toggleOriginalAndFitScale({
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
              });
            }}
            onMouseMove={handleOverlayMouseMove}
            onMouseUp={handleOverlayMouseUp}
            onMouseLeave={handleOverlayMouseUp}
            onTouchStart={handleOverlayTouchStart}
            onTouchMove={handleOverlayTouchMove}
            onTouchEnd={handleOverlayTouchEnd}
          >
            {detail?.tjaContent ? (
              <div
                className={`chart-preview-route-stage ${isOverlayCanvasVisible ? '' : 'is-hidden'}`}
                style={{
                  transform: `translate(${overlayOffset.x}px, ${overlayOffset.y}px)`
                }}
              >
                <div
                  className={`chart-preview-route-zoom-layer ${isDirectManipulating ? 'is-direct-manipulating' : ''}`}
                  style={{ transform: `scale(${overlayScale})` }}
                >
                  <canvas
                    key={`${previewCanvasKey}-route-preview`}
                    ref={overlayCanvasRef}
                    className="chart-preview-route-canvas"
                  />
                </div>
              </div>
            ) : (
              <div className="chart-preview-route-empty">该谱面没有可用的 TJA 缓存，无法渲染预览。</div>
            )}
          </div>
          <div className="chart-preview-route-toolbar" aria-label="谱面预览工具栏">
            <Button
              appearance="transparent"
              className="chart-preview-route-toolbar-button"
              size="small"
              icon={<ArrowDownloadRegular />}
              onClick={savePreviewImage}
            >
              保存
            </Button>
            <Button
              appearance="transparent"
              className="chart-preview-route-toolbar-button"
              size="small"
              icon={<DismissRegular />}
              onClick={closePreviewRoute}
            >
              关闭
            </Button>
          </div>
          {overlayPreviewError ? <Body1 className="hint chart-preview-route-error">{overlayPreviewError}</Body1> : null}
        </div>
      ) : null}
    </div>
  );
}

export default ChartDetailPage;
