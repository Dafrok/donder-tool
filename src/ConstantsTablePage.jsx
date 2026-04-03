import React, { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  Body1,
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

function getNumericValue(text) {
  const normalized = String(text || '').trim().replace(/%$/, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function ConstantsTablePage({ searchKeyword = '', onCountChange, isActive = false }) {
  const [sortState, setSortState] = useState({ columnIndex: -1, asc: true });
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [loadingState, setLoadingState] = useState({ loading: false, error: '' });
  const [hasActivated, setHasActivated] = useState(isActive);
  const deferredKeyword = useDeferredValue(searchKeyword);

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

  useEffect(() => {
    if (isActive && typeof onCountChange === 'function') {
      onCountChange(filteredRows.length);
    }
  }, [filteredRows.length, onCountChange, isActive]);

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

  function handleSort(columnIndex) {
    setSortState((prev) => {
      if (prev.columnIndex === columnIndex) {
        return { ...prev, asc: !prev.asc };
      }
      return { columnIndex, asc: true };
    });
  }

  function renderSortIcon(columnIndex) {
    if (sortState.columnIndex !== columnIndex) return '⇅';
    return sortState.asc ? '▲' : '▼';
  }

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
              <DataGridRow key={rowId} className="constants-row">
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
        ) : null}
      </div>
    </section>
  );
}

export default memo(ConstantsTablePage);