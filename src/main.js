/**
 * Web 版定数计算器主应用
 */

import { calculateDifficulty, warmupPython } from './data-engine.js';
import { analyzeTjaToJson } from './tjs-analyzer.ts';

// DOM 元素
const exportBtn = document.getElementById('exportBtn');
const uploadBtn = document.getElementById('uploadBtn');
const uploadFolderInput = document.getElementById('uploadFolderInput');
const searchInput = document.getElementById('searchInput');
const resultsBody = document.getElementById('resultsBody');
const tableWrapper = document.getElementById('tableWrapper');
const totalSongsEl = document.getElementById('totalSongs');
const calculatedSongsEl = document.getElementById('calculatedSongs');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const errorModal = document.getElementById('errorModal');
const errorModalTitle = document.getElementById('errorModalTitle');
const errorModalMessage = document.getElementById('errorModalMessage');
const errorModalCloseBtn = document.getElementById('errorModalCloseBtn');
const gapModal = document.getElementById('gapModal');
const gapModalTitle = document.getElementById('gapModalTitle');
const gapModalStats = document.getElementById('gapModalStats');
const gapModalBody = document.getElementById('gapModalBody');
const gapModalCloseBtn = document.getElementById('gapModalCloseBtn');

// 应用状态
let allResults = [];
let allSongsData = [];
let currentRows = [];
let sortState = { col: null, asc: true };
let diffFilter = 'oni+edit';
let dragCounter = 0;

const DIFFICULTY_LABELS = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
  oni: '魔王',
  edit: '魔王(里)'
};

const BRANCH_LABELS = {
  unbranched: '',
  normal: '普通',
  expert: '玄人',
  master: '达人'
};

/**
 * 显示加载界面
 */
function showLoading(text = '加载中...') {
  loadingText.textContent = text;
  loadingOverlay.classList.remove('hidden');
}

/**
 * 隐藏加载界面
 */
function hideLoading() {
  loadingOverlay.classList.add('hidden');
}

function showErrorModal(message, title = '数据导入失败') {
  errorModalTitle.textContent = title;
  errorModalMessage.textContent = message;
  errorModal.classList.remove('hidden');
}

function hideErrorModal() {
  errorModal.classList.add('hidden');
}

function isValidSongJson(songData) {
  return songData && typeof songData === 'object' && songData.courses && typeof songData.courses === 'object';
}

function isSupportedChartFile(fileName) {
  return /\.(json|tja)$/i.test(fileName) && !fileName.includes('Sou-uchi');
}

function getDifficultyKey(value) {
  const key = String(value || '').toLowerCase();
  const mapping = {
    '0': 'easy',
    easy: 'easy',
    '1': 'normal',
    normal: 'normal',
    '2': 'hard',
    hard: 'hard',
    '3': 'oni',
    oni: 'oni',
    '4': 'edit',
    edit: 'edit'
  };
  return mapping[key] || key;
}

function normalizeSongJson(songData) {
  if (!isValidSongJson(songData)) return songData;

  const normalizedCourses = {};
  for (const [difficultyKey, courseData] of Object.entries(songData.courses || {})) {
    normalizedCourses[getDifficultyKey(difficultyKey)] = courseData;
  }

  let normalizedNoteTypes;
  if (songData.noteTypes && typeof songData.noteTypes === 'object') {
    normalizedNoteTypes = {};
    for (const [difficultyKey, noteTypeData] of Object.entries(songData.noteTypes)) {
      normalizedNoteTypes[getDifficultyKey(difficultyKey)] = noteTypeData;
    }
  }

  const normalized = {
    ...songData,
    courses: normalizedCourses
  };

  if (normalizedNoteTypes) {
    normalized.noteTypes = normalizedNoteTypes;
  }

  return normalized;
}

function extractTjaTitle(content) {
  if (!content || typeof content !== 'string') return '';
  const match = content.match(/^\s*TITLE\s*:\s*(.+)\s*$/im);
  return match ? match[1].trim() : '';
}

function extractTjaGenre(content) {
  if (!content || typeof content !== 'string') return '';
  const match = content.match(/^\s*GENRE\s*:\s*(.+)\s*$/im);
  return match ? match[1].trim() : '';
}

function extractSongMeta(relativePath, fileName, preferredSongName = '', preferredCategory = '') {
  const segments = (relativePath || '').split('/').filter(Boolean);
  const fileBaseName = fileName.replace(/\.(json|tja)$/i, '');
  const resolvedSongName = preferredSongName || fileBaseName;
  const resolvedCategory = preferredCategory || (segments.length >= 3 ? segments[segments.length - 3] : '用户导入');

  if (segments.length >= 3) {
    return {
      category: resolvedCategory,
      songName: resolvedSongName || segments[segments.length - 2] || fileBaseName
    };
  }

  if (segments.length >= 2) {
    return {
      category: resolvedCategory,
      songName: resolvedSongName || segments[segments.length - 2] || fileBaseName
    };
  }

  return {
    category: resolvedCategory,
    songName: resolvedSongName
  };
}

function isLikelyTjaText(text) {
  if (!text || typeof text !== 'string') return false;
  const hasMeta = /^\s*(TITLE|SUBTITLE|BPM|COURSE|LEVEL|GENRE|WAVE)\s*:/im.test(text);
  const hasStart = /^\s*#START\b/im.test(text);
  return hasMeta && hasStart;
}

function isLikelyJsonText(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch (_) {
    return false;
  }
}

function decodeBytesWithFallback(bytes, encodings, validator) {
  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: true });
      const decoded = decoder.decode(bytes);
      if (!validator || validator(decoded)) {
        return decoded;
      }
    } catch (_) {
      // try next encoding
    }
  }
  throw new Error('无法识别文件编码');
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bytes = new Uint8Array(reader.result);
        const isTja = file.name.toLowerCase().endsWith('.tja');
        const isJson = file.name.toLowerCase().endsWith('.json');
        const sharedEncodings = [
          'utf-8',
          'utf-16le',
          'utf-16be',
          'shift_jis',
          'euc-jp',
          'iso-2022-jp',
          'gb18030',
          'gbk',
          'big5'
        ];
        const validator = isTja ? isLikelyTjaText : isJson ? isLikelyJsonText : undefined;
        const encodings = isTja || isJson ? sharedEncodings : ['utf-8'];
        const text = decodeBytesWithFallback(bytes, encodings, validator);
        resolve(text);
      } catch (error) {
        reject(new Error(`读取文件失败: ${file.name}（${error.message}）`));
      }
    };
    reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

function readEntryAsync(entry) {
  return new Promise((resolve, reject) => {
    if (entry.isFile) {
      entry.file(
        (file) => resolve([{ file, relativePath: entry.fullPath.replace(/^\//, '') }]),
        (err) => reject(err)
      );
      return;
    }

    if (!entry.isDirectory) {
      resolve([]);
      return;
    }

    const dirReader = entry.createReader();
    const entries = [];

    const readBatch = () => {
      dirReader.readEntries(
        async (batch) => {
          if (!batch.length) {
            const nestedArrays = await Promise.all(entries.map(readEntryAsync));
            resolve(nestedArrays.flat());
            return;
          }
          entries.push(...batch);
          readBatch();
        },
        (err) => reject(err)
      );
    };

    readBatch();
  });
}

async function collectDroppedFiles(dataTransfer) {
  if (dataTransfer.items && dataTransfer.items.length) {
    const itemEntries = [];
    for (const item of dataTransfer.items) {
      if (item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        itemEntries.push(entry);
      }
    }

    if (itemEntries.length) {
      const nested = await Promise.all(itemEntries.map(readEntryAsync));
      return nested.flat();
    }
  }

  return Array.from(dataTransfer.files || []).map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
}

async function parseDroppedSongs(dataTransfer) {
  const droppedFiles = await collectDroppedFiles(dataTransfer);
  return parseSongEntries(droppedFiles);
}

function normalizeFileList(fileList) {
  return Array.from(fileList || []).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name
  }));
}

async function parseSongEntries(fileEntries, onProgress) {
  const chartFiles = fileEntries.filter(({ file }) => isSupportedChartFile(file.name));

  if (!chartFiles.length) {
    throw new Error('未检测到可用的谱面文件。请拖入包含 .json 或 .tja 的文件夹。');
  }

  const songs = [];
  const errors = [];
  const BATCH = 30;

  for (let i = 0; i < chartFiles.length; i++) {
    if (i % BATCH === 0) {
      showLoading(`正在读取文件... (${i}/${chartFiles.length})`);
      if (onProgress) onProgress(i, chartFiles.length);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const { file, relativePath } = chartFiles[i];
    const isJsonFile = file.name.toLowerCase().endsWith('.json');
    try {
      const text = await readFileAsText(file);
      let data;
      let preferredSongName = '';
      let preferredCategory = '';

      if (file.name.toLowerCase().endsWith('.tja')) {
        data = analyzeTjaToJson(text);
        preferredSongName = extractTjaTitle(text);
        preferredCategory = extractTjaGenre(text);
      } else {
        data = JSON.parse(text);
      }

      data = normalizeSongJson(data);

      if (!isValidSongJson(data)) {
        // 非谱面 JSON（如配置/元数据）静默跳过
        if (!isJsonFile) {
          errors.push(`${relativePath}: 缺少 courses 字段或格式不正确`);
        }
        continue;
      }

      const { category, songName } = extractSongMeta(relativePath, file.name, preferredSongName, preferredCategory);
      songs.push({ category, songName, data });
    } catch (error) {
      // 非谱面 JSON 解析失败时静默跳过，避免干扰批量导入
      if (!isJsonFile) {
        errors.push(`${relativePath}: ${error.message}`);
      }
    }
  }

  if (onProgress) onProgress(chartFiles.length, chartFiles.length);
  showLoading(`已读取 ${songs.length} 首歌曲，准备计算...`);
  await new Promise((resolve) => setTimeout(resolve, 0));

  if (!songs.length && errors.length) {
    const detail = errors.slice(0, 8).join('\n');
    throw new Error(`导入的谱面文件均无效。\n\n${detail}`);
  }

  if (errors.length) {
    const detail = errors.slice(0, 8).join('\n');
    showErrorModal(`部分文件已跳过：\n\n${detail}`, '部分文件格式有误');
  }

  return songs;
}

async function handleImportedEntries(fileEntries, sourceLabel) {
  const totalFiles = fileEntries.filter(({ file }) => isSupportedChartFile(file.name)).length;

  showLoading('正在读取导入的数据文件...');
  progressContainer.classList.remove('hidden');
  updateProgress(0, totalFiles || 1);

  const importedSongs = await parseSongEntries(fileEntries, (current, total) => {
    updateProgress(current, total);
  });

  if (!importedSongs.length) {
    // 本次导入未发现可计算谱面，静默结束（无关 JSON 已被忽略）
    hideLoading();
    progressContainer.classList.add('hidden');
    return;
  }

  allSongsData = importedSongs;
  await runCalculation(importedSongs, sourceLabel);
}

/**
 * 更新进度条
 */
function updateProgress(current, total) {
  const percentage = (current / total) * 100;
  progressFill.style.width = percentage + '%';
}

/**
 * 初始化应用
 */
async function initApp() {
  try {
    showLoading('初始化应用...');
    totalSongsEl.textContent = '0';
    calculatedSongsEl.textContent = '0';

    console.log('✅ 应用初始化完成，等待用户上传数据');
    hideLoading();    
    // 初始化 footer
    initializeFooter();
    // 空闲时预热 Python，减少点击计算时的“假死感”
    const warmup = () => {
      warmupPython()
        .then(() => console.log('✅ Python 预热完成'))
        .catch((e) => console.warn('⚠️ Python 预热失败，将在计算时重试:', e.message));
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(warmup, { timeout: 2000 });
    } else {
      setTimeout(warmup, 300);
    }
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    showLoading(`❌ 加载失败: ${error.message}`);
  }
}

/**
 * 格式化数值
 */
function formatNumber(num) {
  if (num === 0 || !num) return '-';
  return num.toFixed(2);
}

function findGapData(songIndex, difficulty, branchType) {
  const song = allSongsData[songIndex];
  if (!song?.data?.courses) return null;
  const course = song.data.courses[difficulty];
  if (!course) return null;
  const key = branchType || 'unbranched';
  if (course[key] && Array.isArray(course[key])) return course[key];
  for (const sideData of Object.values(course)) {
    if (sideData && typeof sideData === 'object' && !Array.isArray(sideData) && Array.isArray(sideData[key])) {
      return sideData[key];
    }
  }
  return null;
}

function getGapColorClass(gap) {
  if (gap === null) return 'gap-null';
  if (gap <= 80) return 'gap-fast';
  if (gap <= 150) return 'gap-medium';
  if (gap <= 300) return 'gap-normal';
  return 'gap-slow';
}

function renderGapContent(gapData) {
  if (!gapData) return null;

  let html = '';
  let totalNotes = 0;
  let totalGap = 0;
  let gapCount = 0;
  let minGap = Infinity;

  for (let i = 0; i < gapData.length; i++) {
    const bar = gapData[i];
    if (!bar || bar.length === 0) continue;
    totalNotes += bar.length;

    html += '<div class="gap-bar">';
    html += `<span class="gap-bar-label">${i + 1}</span>`;
    for (const gap of bar) {
      if (gap === null) {
        html += '<span class="gap-value gap-null">-</span>';
      } else {
        const cls = getGapColorClass(gap);
        html += `<span class="gap-value ${cls}">${gap.toFixed(1)}</span>`;
        totalGap += gap;
        gapCount++;
        if (gap < minGap) minGap = gap;
      }
    }
    html += '</div>';
  }

  return {
    html: html || '<div class="gap-empty">无音符间隔数据</div>',
    stats: {
      totalNotes,
      avgGap: gapCount > 0 ? (totalGap / gapCount).toFixed(1) : '-',
      minGap: minGap === Infinity ? '-' : minGap.toFixed(1)
    }
  };
}

function showGapModal(songIndex, difficulty, branchType) {
  const gapData = findGapData(songIndex, difficulty, branchType);
  const song = allSongsData[songIndex];
  const songName = song?.songName || '';
  const diffLabel = DIFFICULTY_LABELS[difficulty] || difficulty;
  const branchLabel = BRANCH_LABELS[branchType] || '';

  gapModalTitle.textContent = `${songName} - ${diffLabel}${branchLabel ? ' (' + branchLabel + ')' : ''}`;

  const result = renderGapContent(gapData);
  if (!result) {
    gapModalStats.innerHTML = '';
    gapModalBody.innerHTML = '<div class="gap-empty">无音符间隔数据</div>';
  } else {
    gapModalStats.innerHTML = `
      <span>音符数: ${result.stats.totalNotes}</span>
      <span>平均间隔: ${result.stats.avgGap} ms</span>
      <span>最小间隔: ${result.stats.minGap} ms</span>
    `;
    gapModalBody.innerHTML = result.html;
  }

  gapModal.classList.remove('hidden');
}

function hideGapModal() {
  gapModal.classList.add('hidden');
}

/**
 * 显示计算结果
 */
function displayResults(results) {
  resultsBody.innerHTML = '';

  if (!results || results.length === 0) {
    tableWrapper.classList.remove('has-data');
    resultsBody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:#90a4ae;">无计算结果，请重新拖入数据文件夹</td></tr>';
    return;
  }

  tableWrapper.classList.add('has-data');

  currentRows = [];
  let totalCharts = 0;

  for (let songIdx = 0; songIdx < results.length; songIdx++) {
    const song = results[songIdx];
    const charts = Array.isArray(song.charts) ? song.charts : [];
    totalCharts += charts.length;

    for (const chart of charts) {
      currentRows.push({
        category: song.category,
        songName: song.songName,
        songIndex: songIdx,
        difficulty: chart.difficulty,
        branchType: chart.branchType,
        ratings: chart.ratings
      });
    }
  }

  // 更新状态栏
  totalSongsEl.textContent = String(results.length);
  calculatedSongsEl.textContent = String(totalCharts);

  sortState = { col: null, asc: true };
  updateSortHeaders();
  renderRows();
}

/**
 * 获取难度对应的颜色
 */
function getDifficultyColor(difficulty) {
  const colors = {
    easy: '#ff1744',      // 花红色
    normal: '#9ccc65',    // 草绿色
    hard: '#0277bd',      // 蓝色系绿色
    oni: '#c2185b',       // 深粉色
    edit: '#6a1b9a'       // 深紫色
  };
  return colors[difficulty] || '#37474f';
}

/**
 * 获取分支对应的颜色
 */
function getBranchColor(branchType) {
  const colors = {
    normal: '#546e7a',    // 深灰色
    expert: '#0096d6',    // 青蓝色
    master: '#ff6b9d'     // 粉红色
  };
  return colors[branchType] || '#37474f';
}

/**
 * 渲染当前行数据（支持排序）
 */
function renderRows(rows = currentRows) {
  const keyword = searchInput.value.toLowerCase();
  const renderList = [...rows];

  if (sortState.col !== null && SORTABLE_COLS[sortState.col]) {
    const field = SORTABLE_COLS[sortState.col];
    renderList.sort((a, b) => {
      const va = a.ratings[field] || 0;
      const vb = b.ratings[field] || 0;
      return sortState.asc ? va - vb : vb - va;
    });
  }

  resultsBody.innerHTML = '';

  for (const row of renderList) {
    // 难度筛选
    if (diffFilter === 'oni+edit') {
      if (row.difficulty !== 'oni' && row.difficulty !== 'edit') continue;
    } else if (diffFilter !== 'all') {
      if (row.difficulty !== diffFilter) continue;
    }

    const diffLabel = DIFFICULTY_LABELS[row.difficulty] || row.difficulty;
    const branchLabel = BRANCH_LABELS[row.branchType] || '';
    const diffColor = getDifficultyColor(row.difficulty);
    const branchColor = getBranchColor(row.branchType);

    const text = `${row.category} ${row.songName} ${diffLabel} ${branchLabel}`.toLowerCase();
    if (keyword && !text.includes(keyword)) continue;

    const tr = document.createElement('tr');
    tr.dataset.songIndex = row.songIndex;
    tr.dataset.difficulty = row.difficulty;
    tr.dataset.branchType = row.branchType;
    tr.innerHTML = `
      <td>${row.category}</td>
      <td><strong>${row.songName}</strong></td>
      <td style="color: ${diffColor}; font-weight: 600;">${diffLabel}</td>
      <td style="color: ${branchColor}; font-weight: 600;">${branchLabel}</td>
      <td>${formatNumber(row.ratings.stamina)}</td>
      <td>${formatNumber(row.ratings.complex)}</td>
      <td>${formatNumber(row.ratings.complexRatio)}</td>
      <td>${formatNumber(row.ratings.rhythm)}</td>
      <td>${formatNumber(row.ratings.rhythmRatio)}</td>
      <td>${formatNumber(row.ratings.speed)}</td>
    `;
    resultsBody.appendChild(tr);
  }
}

// 数值列与 ratings 字段的映射（列索引从 0 开始，分支占第 3 列）
const SORTABLE_COLS = {
  4: 'stamina',
  5: 'complex',
  6: 'complexRatio',
  7: 'rhythm',
  8: 'rhythmRatio',
  9: 'speed'
};

function updateSortHeaders() {
  const ths = document.querySelectorAll('table thead th');
  ths.forEach((th, i) => {
    if (!SORTABLE_COLS[i]) return;
    th.dataset.colIndex = i;
    const indicator = th.querySelector('.sort-indicator') || document.createElement('span');
    indicator.className = 'sort-indicator';
    if (sortState.col === i) {
      indicator.textContent = sortState.asc ? ' ▲' : ' ▼';
    } else {
      indicator.textContent = ' ⇅';
    }
    if (!th.querySelector('.sort-indicator')) th.appendChild(indicator);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  errorModalCloseBtn.addEventListener('click', hideErrorModal);
  errorModal.addEventListener('click', (e) => {
    if (e.target === errorModal) hideErrorModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!gapModal.classList.contains('hidden')) {
        hideGapModal();
      } else if (!errorModal.classList.contains('hidden')) {
        hideErrorModal();
      }
    }
  });

  // 行点击查看音符间隔
  resultsBody.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr || tr.dataset.songIndex === undefined) return;
    showGapModal(parseInt(tr.dataset.songIndex), tr.dataset.difficulty, tr.dataset.branchType);
  });

  // 间隔详情弹窗关闭
  gapModalCloseBtn.addEventListener('click', hideGapModal);
  gapModal.addEventListener('click', (e) => {
    if (e.target === gapModal) hideGapModal();
  });

  // 难度筛选器
  document.getElementById('diffFilter').addEventListener('change', (e) => {
    diffFilter = e.target.value;
    renderRows();
  });

  // 拖拽文件夹导入（拖入表格区域后自动计算）
  tableWrapper.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter += 1;
    tableWrapper.classList.add('drag-over');
  });

  tableWrapper.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  tableWrapper.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter -= 1;
    if (dragCounter <= 0) {
      dragCounter = 0;
      tableWrapper.classList.remove('drag-over');
    }
  });

  tableWrapper.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    tableWrapper.classList.remove('drag-over');

    try {
      const fileEntries = await collectDroppedFiles(e.dataTransfer);
      await handleImportedEntries(fileEntries, '用户拖入数据');
    } catch (error) {
      hideLoading();
      showErrorModal(error.message || '读取拖拽数据失败，请检查文件格式。', '导入失败');
    }
  });

  // 表头点击排序
  document.querySelector('table thead tr').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;
    const colIndex = parseInt(th.dataset.colIndex);
    if (!SORTABLE_COLS[colIndex]) return;
    const field = SORTABLE_COLS[colIndex];

    if (sortState.col === colIndex) {
      sortState.asc = !sortState.asc;
    } else {
      sortState.col = colIndex;
      sortState.asc = false; // 数值列默认降序更实用
    }

    updateSortHeaders();
    renderRows();
  });

  initApp();
});

/**
 * 导出结果为 CSV
 */
function exportResults() {
  if (allResults.length === 0) {
    alert('没有计算结果可导出');
    return;
  }

  const rows = ['分类,歌曲,难度,分支,体力,复合,复合难占比,节奏,节奏难占比,爆发'];

  for (const song of allResults) {
    for (const chart of song.charts) {
      const difficultyLabel = DIFFICULTY_LABELS[chart.difficulty];
      const branchLabel = BRANCH_LABELS[chart.branchType];
      
      rows.push(
        `"${song.category}","${song.songName}","${difficultyLabel}","${branchLabel}",${
          chart.ratings.stamina
        },${chart.ratings.complex},${chart.ratings.complexRatio},${chart.ratings.rhythm},${chart.ratings.rhythmRatio},${chart.ratings.speed}`
      );
    }
  }

  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `taiko_ratings_${new Date().toISOString().slice(0, 10)}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function runCalculation(dataset, sourceLabel = '当前数据') {
  if (!dataset || dataset.length === 0) {
    showErrorModal('没有可计算的数据，请先加载数据或拖入文件夹。', '没有可用数据');
    return;
  }

  try {
    showLoading(`准备计算（${sourceLabel}）...`);
    progressContainer.classList.remove('hidden');
    updateProgress(0, dataset.length);
    allResults = await calculateDifficulty(
      dataset,
      (current, total) => {
        updateProgress(current, total);
      },
      (statusText) => {
        showLoading(statusText);
      }
    );

    displayResults(allResults);
    exportBtn.disabled = false;
    hideLoading();
    progressContainer.classList.add('hidden');

    console.log(`✅ 计算完成（${sourceLabel}）`);
  } catch (error) {
    console.error('❌ 计算失败:', error);
    showErrorModal(error.message || '计算失败，请检查数据格式。', '计算失败');
    hideLoading();
    progressContainer.classList.add('hidden');
  }
}

/**
 * 处理导出按钮点击
 */
exportBtn.addEventListener('click', () => {
  exportResults();
});

uploadBtn.addEventListener('click', () => {
  uploadFolderInput.click();
});

uploadFolderInput.addEventListener('change', async (e) => {
  try {
    const fileEntries = normalizeFileList(e.target.files);
    await handleImportedEntries(fileEntries, '用户上传文件夹');
  } catch (error) {
    hideLoading();
    showErrorModal(error.message || '上传失败，请检查文件格式。', '导入失败');
  } finally {
    uploadFolderInput.value = '';
  }
});

/**
 * 处理搜索输入
 */
searchInput.addEventListener('input', () => {
  renderRows();
});

/**
 * 初始化 footer
 */
function initializeFooter() {
  const footer = document.getElementById('footer');
  const buildTime = __BUILD_TIME__;
  const gitHash = __GIT_HASH__;
  
  // 格式化时间为 YYYY-MM-DD HH:MM:SS
  const date = new Date(buildTime);
  const timeStr = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  footer.innerHTML = `
    <div>部署时间: ${timeStr} | 版本: <a href="https://github.com/Dafrok/taiko-rating-app/commit/${gitHash}" target="_blank">${gitHash}</a></div>
  `;
}

// 页面加载时初始化
// (由上方 DOMContentLoaded 监听器统一处理)
