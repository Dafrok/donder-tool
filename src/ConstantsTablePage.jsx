import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { flushSync } from 'react-dom';
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Body1,
  Spinner
} from '@fluentui/react-components';
import { VirtualizerScrollView } from '@fluentui/react-virtualizer';

let constantsCache = null;
const ROW_HEIGHT = 52;

const ConstantsVirtualList = memo(function ConstantsVirtualList({
  headers,
  filteredRows,
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
              style={columnIndex === 0
                ? {
                  width: 'var(--song-col-width)',
                  minWidth: 'var(--song-col-width)',
                  maxWidth: 'var(--song-col-width)',
                  flexBasis: 'var(--song-col-width)'
                }
                : undefined}
            >
              <span className="header-cell-text">
                <span className="header-title-text">{header.label}</span>
                <span className="sort-indicator">{renderSortIcon(columnIndex)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <VirtualizerScrollView
        className="constants-virtual-scroll-root"
        container={{ className: 'constants-virtual-scroll-container' }}
        numItems={filteredRows.length}
        itemSize={ROW_HEIGHT}
        axis="vertical"
      >
        {(index) => {
          const item = filteredRows[index];
          if (!item) return null;

          return (
            <div key={item.id} className="constants-row constants-virtual-row" role="row" onClick={() => openDetail(item)}>
              {headers.map((header, columnIndex) => (
                <div
                  key={`${item.id}-${header.key}`}
                  role="gridcell"
                  aria-colindex={columnIndex + 1}
                  className={`${columnIndex === 0 ? 'sticky-first-col-cell' : ''} constants-virtual-cell`.trim()}
                  style={columnIndex === 0
                    ? {
                      width: 'var(--song-col-width)',
                      minWidth: 'var(--song-col-width)',
                      maxWidth: 'var(--song-col-width)',
                      flexBasis: 'var(--song-col-width)'
                    }
                    : undefined}
                >
                  {item.cells[columnIndex] || '-'}
                </div>
              ))}
            </div>
          );
        }}
      </VirtualizerScrollView>
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

function ConstantsTablePage({ searchKeyword = '', onCountChange, onOpenDetail, isActive = false }) {
  const [isPending, startTransition] = useTransition();
  const [isListBusy, setIsListBusy] = useState(false);
  const [sortState, setSortState] = useState({ columnIndex: -1, asc: true });
  const [appliedSearchKeyword, setAppliedSearchKeyword] = useState(searchKeyword);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [loadingState, setLoadingState] = useState({ loading: false, error: '' });
  const [hasActivated, setHasActivated] = useState(isActive);
  const deferredKeyword = useDeferredValue(appliedSearchKeyword);
  const pendingRaf1Ref = useRef(0);
  const pendingRaf2Ref = useRef(0);
  const pendingTimerRef = useRef(0);

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
    if (searchKeyword === appliedSearchKeyword) return;
    scheduleListUpdate(() => {
      setAppliedSearchKeyword(searchKeyword);
    }, { immediate: false, mode: 'raf' });
  }, [searchKeyword, appliedSearchKeyword, scheduleListUpdate]);

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
    const normalizedKeyword = deferredKeyword.trim().toLowerCase();
    let result = rows;

    if (normalizedKeyword) {
      result = result.filter((row) => {
        return row.searchText.includes(normalizedKeyword);
      });
    }

    if (sortState.columnIndex >= 0) {
      result = [...result].sort((a, b) => {
        const left = a.cells[sortState.columnIndex] || '';
        const right = b.cells[sortState.columnIndex] || '';
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
  }, [deferredKeyword, rows, sortState]);

  const isSearchKeywordPending = searchKeyword !== appliedSearchKeyword;

  useEffect(() => {
    if (isActive && typeof onCountChange === 'function') {
      onCountChange(filteredRows.length);
    }
  }, [filteredRows.length, onCountChange, isActive]);

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

      <div className="constants-table-wrapper table-wrapper">
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
              filteredRows={filteredRows}
              handleSort={handleSort}
              renderSortIcon={renderSortIcon}
              openDetail={openDetail}
            />
            {filteredRows.length === 0 ? (
              <div className="constants-loading-wrap">
                <Body1>没有匹配的数据</Body1>
              </div>
            ) : null}
          </>
        ) : null}
        {!loadingState.loading && !loadingState.error && (isPending || isListBusy || isSearchKeywordPending) ? (
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