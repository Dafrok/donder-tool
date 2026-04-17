import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { flushSync } from 'react-dom';
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Body1,
  Spinner
} from '@fluentui/react-components';

let constantsCache = null;
const ROW_HEIGHT = 44;
const VIRTUAL_OVERSCAN_ROWS = 10;
const MIN_NON_FIRST_COL_WIDTH = 120;
const CONSTANT_COLUMN_NAME_SET = new Set(['主定数', '总定数', '定数', '体力', '手速', '爆发', '节奏', '复合']);
let textMeasureContext = null;

function estimateTextPixelWidth(text, font) {
  const normalized = String(text || '').trim();
  if (!normalized) return 0;

  if (typeof document !== 'undefined') {
    if (!textMeasureContext) {
      const canvas = document.createElement('canvas');
      textMeasureContext = canvas.getContext('2d');
    }

    if (textMeasureContext) {
      textMeasureContext.font = font;
      return textMeasureContext.measureText(normalized).width;
    }
  }

  return normalized.length * 8;
}

function getCategoryBadgeClass(category) {
  const normalized = String(category || '').trim().toLowerCase();
  if (!normalized) return '';

  if (normalized.includes('children') || normalized.includes('folk')) {
    return 'badge-children-folk';
  }
  if (normalized.includes('namco') || normalized.includes('original')) {
    return 'badge-namco-original';
  }
  if (normalized.includes('game')) {
    return 'badge-game-music';
  }
  if (normalized.includes('vocaloid')) {
    return 'badge-vocaloid';
  }
  if (normalized.includes('anime')) {
    return 'badge-anime';
  }
  if (normalized.includes('classical')) {
    return 'badge-classical';
  }
  if (normalized.includes('variety') || normalized.includes('variaty')) {
    return 'badge-variety';
  }
  if (normalized.includes('pop')) {
    return 'badge-pop';
  }

  return '';
}

function getBranchTextClass(branch) {
  const normalized = String(branch || '').trim().toLowerCase();
  if (!normalized) return '';

  if (normalized.includes('master') || normalized.includes('达人')) {
    return 'constants-branch-master';
  }
  if (normalized.includes('expert') || normalized.includes('玄人')) {
    return 'constants-branch-expert';
  }
  if (normalized.includes('normal') || normalized.includes('普通')) {
    return 'constants-branch-normal';
  }

  return '';
}

function getDifficultyTextClass(difficulty) {
  const normalized = String(difficulty || '').trim().toLowerCase();
  if (!normalized) return '';

  if (normalized.includes('edit') || normalized.includes('里')) {
    return 'constants-difficulty-edit';
  }
  if (normalized.includes('oni') || normalized.includes('魔王')) {
    return 'constants-difficulty-oni';
  }
  if (normalized.includes('hard') || normalized.includes('困难')) {
    return 'constants-difficulty-hard';
  }
  if (normalized.includes('normal') || normalized.includes('普通')) {
    return 'constants-difficulty-normal';
  }
  if (normalized.includes('easy') || normalized.includes('简单')) {
    return 'constants-difficulty-easy';
  }

  return '';
}

function getConstantValueToneClass(value) {
  const numericValue = getNumericValue(value);
  if (numericValue === null) return '';
  if (numericValue <= 0) return 'constants-value-zero';
  if (numericValue >= 15) return 'constants-value-extreme';

  const step = Math.max(1, Math.min(15, Math.ceil(numericValue)));
  return `constants-value-step-${step}`;
}

const ConstantsVirtualList = memo(function ConstantsVirtualList({
  headers,
  visibleRows,
  topSpacerHeight,
  bottomSpacerHeight,
  columnStyles,
  constantColumnIndexes,
  categoryColumnIndex,
  difficultyColumnIndex,
  branchColumnIndex,
  handleSort,
  renderSortIcon,
  openDetail
}) {
  return (
    <div className="constants-virtual-grid table-grid" role="table" aria-label="定数表">
      <div className="constants-virtual-header" role="rowgroup">
        <div className="constants-virtual-header-row" role="row">
          {headers.map((header, columnIndex) => (
            <div
              key={header.key}
              role="columnheader"
              aria-colindex={columnIndex + 1}
              onClick={() => handleSort(columnIndex)}
              className={`${columnIndex === 0 ? 'sticky-first-col-header' : ''} sortable constants-virtual-cell constants-virtual-header-cell`.trim()}
              style={columnStyles[columnIndex]}
            >
              <span className="header-cell-text">
                <span className="header-title-text">{header.label}</span>
                <span className="sort-indicator">{renderSortIcon(columnIndex)}</span>
              </span>
            </div>
          ))}
          <div className="constants-virtual-row-spacer constants-virtual-header-spacer" aria-hidden="true" />
        </div>
      </div>
      {visibleRows.length === 0 && topSpacerHeight === 0 && bottomSpacerHeight === 0 ? (
        <div className="constants-virtual-scroll-root" aria-label="空列表">
          <div className="constants-loading-wrap">
            <Body1>没有匹配的数据</Body1>
          </div>
        </div>
      ) : (
        <div className="constants-virtual-scroll-root" aria-label="定数列表">
          {topSpacerHeight > 0 ? <div className="constants-virtual-spacer" style={{ height: `${topSpacerHeight}px` }} aria-hidden="true" /> : null}
          {visibleRows.map((item) => (
            <div key={item.id} className="constants-row constants-virtual-row" role="row" onClick={() => openDetail(item)}>
              {headers.map((header, columnIndex) => (
                <div
                  key={`${item.id}-${header.key}`}
                  role="gridcell"
                  aria-colindex={columnIndex + 1}
                  className={`${columnIndex === 0 ? 'sticky-first-col-cell' : ''} constants-virtual-cell`.trim()}
                  style={columnStyles[columnIndex]}
                >
                  {columnIndex === categoryColumnIndex ? (
                    <span className={`constants-category-badge ${getCategoryBadgeClass(item.cells[columnIndex])}`.trim()}>
                      {item.cells[columnIndex] || '-'}
                    </span>
                  ) : columnIndex === difficultyColumnIndex ? (
                    <span className={`constants-cell-text constants-difficulty-text ${getDifficultyTextClass(item.cells[columnIndex])}`.trim()}>
                      {item.cells[columnIndex] || '-'}
                    </span>
                  ) : columnIndex === branchColumnIndex ? (
                    <span className={`constants-branch-text ${getBranchTextClass(item.cells[columnIndex])}`.trim()}>
                      {item.cells[columnIndex] || '-'}
                    </span>
                  ) : constantColumnIndexes.has(columnIndex) ? (
                    <span className={`constants-cell-text constants-value-text ${getConstantValueToneClass(item.cells[columnIndex])}`.trim()}>
                      {item.cells[columnIndex] || '-'}
                    </span>
                  ) : (
                    <span className="constants-cell-text">{item.cells[columnIndex] || '-'}</span>
                  )}
                </div>
              ))}
              <div className="constants-virtual-row-spacer constants-virtual-body-spacer" aria-hidden="true" />
            </div>
          ))}
          {bottomSpacerHeight > 0 ? <div className="constants-virtual-spacer" style={{ height: `${bottomSpacerHeight}px` }} aria-hidden="true" /> : null}
        </div>
      )}
    </div>
  );
});

function getNumericValue(text) {
  const normalized = String(text || '').trim().replace(/%$/, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function getHeaderBaseName(headerLabel) {
  return String(headerLabel || '').replace(/\s*\(\d+\)$/, '').trim();
}

function findLastColumnIndex(headers, baseName) {
  for (let index = headers.length - 1; index >= 0; index -= 1) {
    if (getHeaderBaseName(headers[index]?.label) === baseName) {
      return index;
    }
  }
  return -1;
}

function findLastColumnIndexByNames(headers, names) {
  for (let nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
    const target = names[nameIndex];
    const found = findLastColumnIndex(headers, target);
    if (found >= 0) {
      return found;
    }
  }
  return -1;
}

function getBranchSortRank(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 99;
  if (normalized.includes('master') || normalized.includes('达人')) return 0;
  if (normalized.includes('expert') || normalized.includes('玄人')) return 1;
  if (normalized.includes('normal') || normalized.includes('普通')) return 2;
  return 98;
}

function ConstantsTablePage({ searchKeyword = '', onCountChange, onOpenDetail, isActive = false }) {
  const [isPending, startTransition] = useTransition();
  const [isListBusy, setIsListBusy] = useState(false);
  const [sortState, setSortState] = useState({ columnIndex: -1, asc: true });
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [loadingState, setLoadingState] = useState({ loading: false, error: '' });
  const [hasActivated, setHasActivated] = useState(isActive);
  const pendingRaf1Ref = useRef(0);
  const pendingRaf2Ref = useRef(0);
  const pendingTimerRef = useRef(0);
  const tableWrapperRef = useRef(null);
  const scrollUpdateRafRef = useRef(0);
  const [virtualViewportHeight, setVirtualViewportHeight] = useState(0);
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);

  const clearPendingSchedule = useCallback(() => {
    if (pendingRaf1Ref.current) {
      window.cancelAnimationFrame(pendingRaf1Ref.current);
      pendingRaf1Ref.current = 0;
    }
    if (pendingRaf2Ref.current) {
      window.cancelAnimationFrame(pendingRaf2Ref.current);
      pendingRaf2Ref.current = 0;
    }
    if (pendingTimerRef.current) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = 0;
    }
  }, []);

  const scheduleListUpdate = useCallback((work, options = {}) => {
    const { immediate = false, mode = 'raf' } = options;
    clearPendingSchedule();

    if (immediate) {
      flushSync(() => {
        setIsListBusy(true);
      });
    } else {
      setIsListBusy(true);
    }

    if (mode === 'timeout') {
      pendingTimerRef.current = window.setTimeout(() => {
        pendingTimerRef.current = 0;
        startTransition(() => {
          work();
        });
      });
      return;
    }

    pendingRaf1Ref.current = window.requestAnimationFrame(() => {
      pendingRaf1Ref.current = 0;
      pendingRaf2Ref.current = window.requestAnimationFrame(() => {
        pendingRaf2Ref.current = 0;
        startTransition(() => {
          work();
        });
      });
    });
  }, [clearPendingSchedule, startTransition]);

  useEffect(() => {
    if (!isPending && isListBusy) {
      const rafId = window.requestAnimationFrame(() => {
        setIsListBusy(false);
      });
      return () => window.cancelAnimationFrame(rafId);
    }
    return undefined;
  }, [isPending, isListBusy]);

  useEffect(() => {
    return () => {
      clearPendingSchedule();
    };
  }, [clearPendingSchedule]);

  useEffect(() => {
    return () => {
      if (scrollUpdateRafRef.current) {
        window.cancelAnimationFrame(scrollUpdateRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isActive) {
      setHasActivated(true);
    }
  }, [isActive]);

  useEffect(() => {
    if (!hasActivated) return undefined;

    if (constantsCache?.headers && constantsCache?.rows) {
      setHeaders(constantsCache.headers);
      setRows(constantsCache.rows);
      setLoadingState({ loading: false, error: '' });
      return undefined;
    }

    setLoadingState({ loading: true, error: '' });
    const worker = new Worker(new URL('./constants-csv.worker.js', import.meta.url), { type: 'module' });

    const handleMessage = (event) => {
      const { type, payload, message } = event.data || {};
      if (type === 'parse-success') {
        const nextHeaders = Array.isArray(payload?.headers) ? payload.headers : [];
        const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
        constantsCache = { headers: nextHeaders, rows: nextRows };
        setHeaders(nextHeaders);
        setRows(nextRows);
        setLoadingState({ loading: false, error: '' });
      } else if (type === 'parse-error') {
        setLoadingState({ loading: false, error: message || '读取定数表失败' });
      }
    };

    worker.addEventListener('message', handleMessage);
    worker.postMessage({ type: 'parse-constants-csv' });

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.terminate();
    };
  }, [hasActivated]);

  const filteredRows = useMemo(() => {
    const normalizedKeyword = searchKeyword.trim().toLowerCase();
    let result = rows;

    if (normalizedKeyword) {
      result = result.filter((row) => {
        return row.searchText.includes(normalizedKeyword);
      });
    }

    if (sortState.columnIndex >= 0) {
      const branchColumnIndex = findLastColumnIndex(headers, '分支');
      result = [...result].sort((a, b) => {
        const left = a.cells[sortState.columnIndex] || '';
        const right = b.cells[sortState.columnIndex] || '';

        if (sortState.columnIndex === branchColumnIndex) {
          const compare = getBranchSortRank(left) - getBranchSortRank(right);
          return sortState.asc ? compare : -compare;
        }

        const leftNum = getNumericValue(left);
        const rightNum = getNumericValue(right);

        let compare = 0;
        if (leftNum !== null && rightNum !== null) {
          compare = leftNum - rightNum;
        } else {
          compare = left.localeCompare(right, 'zh-CN', { numeric: true, sensitivity: 'base' });
        }

        return sortState.asc ? compare : -compare;
      });
    }

    return result;
  }, [searchKeyword, rows, sortState, headers]);

  useEffect(() => {
    const wrapper = tableWrapperRef.current;
    if (!wrapper) return undefined;

    const updateViewport = () => {
      setVirtualViewportHeight(wrapper.clientHeight);
    };

    updateViewport();
    const resizeObserver = new ResizeObserver(updateViewport);
    resizeObserver.observe(wrapper);

    return () => {
      resizeObserver.disconnect();
    };
  }, [hasActivated]);

  const handleTableWrapperScroll = useCallback((event) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    if (scrollUpdateRafRef.current) return;

    scrollUpdateRafRef.current = window.requestAnimationFrame(() => {
      scrollUpdateRafRef.current = 0;
      setVirtualScrollTop(nextScrollTop);
    });
  }, []);

  const virtualRows = useMemo(() => {
    if (!filteredRows.length) {
      return {
        visibleRows: [],
        topSpacerHeight: 0,
        bottomSpacerHeight: 0
      };
    }

    const effectiveViewportHeight = Math.max(virtualViewportHeight, ROW_HEIGHT * 8);
    const startIndex = Math.max(0, Math.floor(virtualScrollTop / ROW_HEIGHT) - VIRTUAL_OVERSCAN_ROWS);
    const endIndex = Math.min(
      filteredRows.length,
      Math.ceil((virtualScrollTop + effectiveViewportHeight) / ROW_HEIGHT) + VIRTUAL_OVERSCAN_ROWS
    );

    return {
      visibleRows: filteredRows.slice(startIndex, endIndex),
      topSpacerHeight: startIndex * ROW_HEIGHT,
      bottomSpacerHeight: (filteredRows.length - endIndex) * ROW_HEIGHT
    };
  }, [filteredRows, virtualScrollTop, virtualViewportHeight]);

  useEffect(() => {
    const wrapper = tableWrapperRef.current;
    if (!wrapper) return;
    const maxScrollTop = Math.max(0, (filteredRows.length * ROW_HEIGHT) - wrapper.clientHeight);
    if (wrapper.scrollTop > maxScrollTop) {
      wrapper.scrollTop = maxScrollTop;
      setVirtualScrollTop(maxScrollTop);
    }
  }, [filteredRows.length]);

  const categoryColumnIndex = useMemo(() => findLastColumnIndex(headers, '分类'), [headers]);
  const difficultyColumnIndex = useMemo(() => findLastColumnIndex(headers, '难度'), [headers]);
  const branchColumnIndex = useMemo(() => findLastColumnIndex(headers, '分支'), [headers]);
  const constantColumnIndexes = useMemo(() => {
    const result = new Set();
    for (let index = 0; index < headers.length; index += 1) {
      const baseName = getHeaderBaseName(headers[index]?.label);
      if (CONSTANT_COLUMN_NAME_SET.has(baseName)) {
        result.add(index);
      }
    }
    return result;
  }, [headers]);

  const columnStyles = useMemo(() => {
    if (!headers.length) return [];

    return headers.map((header, columnIndex) => {
      if (columnIndex === 0) {
        return {
          width: 'var(--song-col-width)',
          minWidth: 'var(--song-col-width)',
          maxWidth: 'var(--song-col-width)',
          flexBasis: 'var(--song-col-width)',
          flexGrow: 0,
          flexShrink: 0
        };
      }

      let computedWidth = Math.max(
        MIN_NON_FIRST_COL_WIDTH,
        estimateTextPixelWidth(header.label, '700 14px "Segoe UI", "Microsoft YaHei", sans-serif') + 42
      );

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const rawText = rows[rowIndex]?.cells?.[columnIndex];
        if (!rawText) continue;

        const measuredWidth = estimateTextPixelWidth(rawText, '400 14px "Segoe UI", "Microsoft YaHei", sans-serif') + 24;
        if (measuredWidth > computedWidth) {
          computedWidth = measuredWidth;
        }

      }

      const width = `${Math.ceil(computedWidth)}px`;
      return {
        width,
        minWidth: width,
        flexBasis: width,
        maxWidth: width,
        flexGrow: 0,
        flexShrink: 0
      };
    });
  }, [headers, rows]);

  useEffect(() => {
    if (isActive && typeof onCountChange === 'function') {
      onCountChange(filteredRows.length, rows.length);
    }
  }, [filteredRows.length, rows.length, onCountChange, isActive]);

  const handleSort = useCallback((columnIndex) => {
    scheduleListUpdate(() => {
      setSortState((prev) => {
        if (prev.columnIndex === columnIndex) {
          return { ...prev, asc: !prev.asc };
        }
        return { columnIndex, asc: true };
      });
    }, { immediate: true, mode: 'timeout' });
  }, [scheduleListUpdate]);

  const renderSortIcon = useCallback((columnIndex) => {
    if (sortState.columnIndex !== columnIndex) return '⇅';
    return sortState.asc ? '▲' : '▼';
  }, [sortState]);

  const openDetail = useCallback((row) => {
    if (typeof onOpenDetail !== 'function') return;

    const songIndex = findLastColumnIndex(headers, '歌曲');
    const categoryIndex = findLastColumnIndex(headers, '分类');
    const difficultyIndex = findLastColumnIndex(headers, '难度');
    const branchIndex = findLastColumnIndex(headers, '分支');
    const totalConstantIndex = findLastColumnIndexByNames(headers, ['主定数', '总定数', '定数']);
    const totalConstantRaw = totalConstantIndex >= 0
      ? row.cells[totalConstantIndex]
      : (row.cells[row.cells.length - 1] || '');
    const totalConstantValue = getNumericValue(totalConstantRaw);

    const dimensionNames = ['体力', '手速', '爆发', '节奏', '复合'];
    const dimensions = dimensionNames.map((name) => {
      const dimIndex = findLastColumnIndex(headers, name);
      const raw = dimIndex >= 0 ? row.cells[dimIndex] : '';
      const numeric = getNumericValue(raw);
      return {
        name,
        raw,
        value: numeric === null ? 0 : numeric
      };
    });

    onOpenDetail({
      id: row.id,
      songName: songIndex >= 0 ? row.cells[songIndex] : '',
      category: categoryIndex >= 0 ? row.cells[categoryIndex] : '',
      difficulty: difficultyIndex >= 0 ? row.cells[difficultyIndex] : '',
      branch: branchIndex >= 0 ? row.cells[branchIndex] : '',
      totalConstantRaw,
      totalConstant: totalConstantValue,
      dimensions,
      cells: row.cells,
      headers: headers.map((header) => header.label)
    });
  }, [headers, onOpenDetail]);

  return (
    <section className="constants-panel" aria-label="定数表页面">
      <header className="list-caption" aria-label="定数表页面头部">
        <Breadcrumb className="list-breadcrumb" aria-label="面包屑">
          <BreadcrumbItem>
            <BreadcrumbButton>数据分析</BreadcrumbButton>
          </BreadcrumbItem>
          <BreadcrumbDivider />
          <BreadcrumbItem>
            <BreadcrumbButton current aria-current="page">定数表</BreadcrumbButton>
          </BreadcrumbItem>
        </Breadcrumb>

      </header>

      <div className="constants-table-wrapper table-wrapper" ref={tableWrapperRef} onScroll={handleTableWrapperScroll}>
        {loadingState.loading ? (
          <div className="constants-loading-wrap">
            <Spinner size="large" label="正在解析定数表..." />
          </div>
        ) : null}
        {loadingState.error ? (
          <div className="constants-loading-wrap">
            <Body1>{loadingState.error}</Body1>
          </div>
        ) : null}
        {!loadingState.loading && !loadingState.error ? (
          <>
            <ConstantsVirtualList
              headers={headers}
              visibleRows={virtualRows.visibleRows}
              topSpacerHeight={virtualRows.topSpacerHeight}
              bottomSpacerHeight={virtualRows.bottomSpacerHeight}
              columnStyles={columnStyles}
              constantColumnIndexes={constantColumnIndexes}
              categoryColumnIndex={categoryColumnIndex}
              difficultyColumnIndex={difficultyColumnIndex}
              branchColumnIndex={branchColumnIndex}
              handleSort={handleSort}
              renderSortIcon={renderSortIcon}
              openDetail={openDetail}
            />
          </>
        ) : null}
        {!loadingState.loading && !loadingState.error && (isPending || isListBusy) ? (
          <div className="constants-list-busy-overlay" aria-live="polite" aria-label="列表更新中">
            <Spinner size="medium" label="更新列表中..." />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default memo(ConstantsTablePage, (prevProps, nextProps) => {
  return prevProps.searchKeyword === nextProps.searchKeyword
    && prevProps.isActive === nextProps.isActive;
});