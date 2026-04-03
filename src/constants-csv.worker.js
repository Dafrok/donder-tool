import constantsCsvText from './assets/py/constants.csv?raw';

function parseCsv(rawText) {
  const rows = [];
  let row = [];
  let value = '';
  let index = 0;
  let inQuotes = false;

  while (index < rawText.length) {
    const char = rawText[index];

    if (char === '"') {
      if (inQuotes && rawText[index + 1] === '"') {
        value += '"';
        index += 2;
        continue;
      }
      inQuotes = !inQuotes;
      index += 1;
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(value);
      value = '';
      index += 1;
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      row.push(value);
      value = '';
      if (row.length > 1 || row[0]?.trim()) {
        rows.push(row);
      }
      row = [];

      if (char === '\r' && rawText[index + 1] === '\n') {
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    value += char;
    index += 1;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    if (row.length > 1 || row[0]?.trim()) {
      rows.push(row);
    }
  }

  return rows;
}

function buildPayload() {
  const parsedRows = parseCsv(constantsCsvText);
  if (!parsedRows.length) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = parsedRows[0].map((header) => String(header || '').trim());
  const songColumnIndex = rawHeaders.indexOf('歌曲');
  const columnOrder = rawHeaders.map((_, index) => index);

  if (songColumnIndex > 0) {
    columnOrder.splice(songColumnIndex, 1);
    columnOrder.unshift(songColumnIndex);
  }

  const orderedHeaders = columnOrder.map((index) => rawHeaders[index]);
  const duplicateCounter = new Map();
  const headers = orderedHeaders.map((header, columnIndex) => {
    const base = header || `列${columnIndex + 1}`;
    const count = (duplicateCounter.get(base) || 0) + 1;
    duplicateCounter.set(base, count);
    return {
      key: `${base}__${count}`,
      label: count > 1 ? `${base} (${count})` : base
    };
  });

  const rows = parsedRows.slice(1).map((cells, rowIndex) => {
    const normalizedCells = columnOrder.map((sourceColumnIndex) => String(cells[sourceColumnIndex] || '').trim());
    return {
      id: `row-${rowIndex}`,
      cells: normalizedCells,
      searchText: normalizedCells.join(' ').toLowerCase()
    };
  });

  return { headers, rows };
}

self.onmessage = (event) => {
  if (event?.data?.type !== 'parse-constants-csv') return;

  try {
    const payload = buildPayload();
    self.postMessage({ type: 'parse-success', payload });
  } catch (error) {
    self.postMessage({
      type: 'parse-error',
      message: error instanceof Error ? error.message : '解析 constants.csv 失败'
    });
  }
};
