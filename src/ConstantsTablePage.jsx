import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { flushSync } from 'react-dom';
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Body1,
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Spinner,
  createTableColumn
} from '@fluentui/react-components';

let constantsCache = null;

const ConstantsDataGrid = memo(function ConstantsDataGrid({
  filteredRows,
  gridColumns,
  columnSizingOptions,
  handleSort,
  renderSortIcon,
  openDetail
}) {
  return (
    <DataGrid
      className="table-grid constants-grid"
      items={filteredRows}
      columns={gridColumns}
      columnSizingOptions={columnSizingOptions}
      getRowId={(item) => item.id}
      focusMode="composite"
    >
      <DataGridHeader>
        <DataGridRow>
          {({ renderHeaderCell, columnId }) => {
            const columnIndex = Number(String(columnId).replace('col', ''));
            return (
              <DataGridHeaderCell
                onClick={() => handleSort(columnIndex)}
                className={`${columnIndex === 0 ? 'sticky-first-col-header' : ''} sortable`.trim()}
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
                  <span className="header-title-text">{renderHeaderCell()}</span>
                  <span className="sort-indicator">{renderSortIcon(columnIndex)}</span>
                </span>
              </DataGridHeaderCell>
            );
          }}
        </DataGridRow>
      </DataGridHeader>
      <DataGridBody>
        {({ item, rowId }) => (
          <DataGridRow key={rowId} className="constants-row" onClick={() => openDetail(item)}>
            {({ renderCell, columnId }) => {
              const columnIndex = Number(String(columnId).replace('col', ''));
              return (
                <DataGridCell
                  className={columnIndex === 0 ? 'sticky-first-col-cell' : ''}
                  style={columnIndex === 0
                    ? {
                      width: 'var(--song-col-width)',
                      minWidth: 'var(--song-col-width)',
                      maxWidth: 'var(--song-col-width)',
                      flexBasis: 'var(--song-col-width)'
                    }
                    : undefined}
                >
                  {renderCell(item)}
                </DataGridCell>
              );
            }}
          </DataGridRow>
        )}
      </DataGridBody>
    </DataGrid>
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
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 50;
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

  // 当搜索或排序改变时，重置回第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [appliedSearchKeyword, sortState]);

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

  // 分页计算
  const paginationInfo = useMemo(() => {
    const total = filteredRows.length;
    const totalPages = Math.ceil(total / ROWS_PER_PAGE);
    const validPage = Math.max(1, Math.min(currentPage, totalPages || 1));
    const startIndex = (validPage - 1) * ROWS_PER_PAGE;
    const endIndex = startIndex + ROWS_PER_PAGE;
    const paginatedRows = filteredRows.slice(startIndex, endIndex);
    return {
      paginatedRows,
      currentPage: validPage,
      totalPages,
      totalRows: total,
      startIndex,
      endIndex
    };
  }, [filteredRows, currentPage, ROWS_PER_PAGE]);

  const isSearchKeywordPending = searchKeyword !== appliedSearchKeyword;

  useEffect(() => {
    if (isActive && typeof onCountChange === 'function') {
      onCountChange(paginationInfo.totalRows);
    }
  }, [paginationInfo.totalRows, onCountChange, isActive]);

  const columnSizingOptions = useMemo(() => ({
    col0: {
      minWidth: 220,
      idealWidth: 220,
      defaultWidth: 220
    }
  }), []);

  const gridColumns = useMemo(() => {
    return headers.map((header, columnIndex) => {
      return createTableColumn({
        columnId: `col${columnIndex}`,
        renderHeaderCell: () => header.label,
        renderCell: (item) => item.cells[columnIndex] || '-'
      });
    });
  }, [headers]);

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

      <div className="table-wrapper constants-table-wrapper">
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
            <ConstantsDataGrid
              filteredRows={paginationInfo.paginatedRows}
              gridColumns={gridColumns}
              columnSizingOptions={columnSizingOptions}
              handleSort={handleSort}
              renderSortIcon={renderSortIcon}
              openDetail={openDetail}
            />
            <div className="pagination-controls" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px', borderTop: '1px solid #f0f0f0' }}>
              <Button
                appearance="subtle"
                size="small"
                disabled={paginationInfo.currentPage <= 1}
                onClick={() => setCurrentPage(Math.max(1, paginationInfo.currentPage - 1))}
              >
                上一页
              </Button>
              <Body1 style={{ margin: '0 8px', minWidth: '120px', textAlign: 'center' }}>
                第 {paginationInfo.currentPage} / {paginationInfo.totalPages} 页
                <span style={{ fontSize: '12px', color: '#767676', marginLeft: '8px' }}>
                  (共 {paginationInfo.totalRows} 条)
                </span>
              </Body1>
              <Button
                appearance="subtle"
                size="small"
                disabled={paginationInfo.currentPage >= paginationInfo.totalPages}
                onClick={() => setCurrentPage(Math.min(paginationInfo.totalPages, paginationInfo.currentPage + 1))}
              >
                下一页
              </Button>
            </div>
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