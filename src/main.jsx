import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Badge,
  Body1,
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  FluentProvider,
  Hamburger,
  Input,
  Link,
  Nav,
  NavDrawer,
  NavDrawerBody,
  NavDrawerHeader,
  NavItem,
  Spinner,
  createLightTheme,
  createTableColumn,
  Title3,
  webLightTheme
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  ArrowUploadRegular,
  FilterRegular,
  InfoRegular,
  SearchRegular
} from '@fluentui/react-icons';
import { calculateDifficulty, warmupPython } from './data-engine.js';
import { analyzeTjaToJson } from './tjs-analyzer.ts';
import './styles.css';

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

const DIFFICULTY_FILTER_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'easy', label: '简单' },
  { value: 'normal', label: '一般' },
  { value: 'hard', label: '困难' },
  { value: 'oni', label: '魔王' },
  { value: 'edit', label: '魔王(里)' },
  { value: 'oni+edit', label: '魔王 & 魔王(里)' }
];

const SORTABLE_COLS = {
  level: 'level',
  stamina: 'stamina',
  complex: 'complex',
  complexRatio: 'complexRatio',
  rhythm: 'rhythm',
  rhythmRatio: 'rhythmRatio',
  speed: 'speed',
  burst: 'burst'
};

const TAIKO_KA_PALETTE = {
  10: '#041823',
  20: '#072638',
  30: '#0a354d',
  40: '#0d4462',
  50: '#105378',
  60: '#14638d',
  70: '#1773a3',
  80: '#1b83b9',
  90: '#1d89bf',
  100: '#249ad8',
  110: '#3aa8dd',
  120: '#52b4e1',
  130: '#6bc0e6',
  140: '#88ceec',
  150: '#a7dcf2',
  160: '#c7eaf8'
};

const taikoKaTheme = {
  ...webLightTheme,
  ...createLightTheme(TAIKO_KA_PALETTE)
};

function FilterButton(props) {
  return (
    <Button
      {...props}
      appearance="transparent"
      icon={<FilterRegular />}
      size="small"
    />
  );
}

function formatNumber(num) {
  if (num === 0 || !num) return '-';
  return num.toFixed(2);
}

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

function isValidSongJson(songData) {
  return songData && typeof songData === 'object' && songData.courses && typeof songData.courses === 'object';
}

function isSupportedChartFile(fileName) {
  return /\.tja$/i.test(fileName) && !fileName.includes('Sou-uchi');
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

  let normalizedLevels;
  if (songData.levels && typeof songData.levels === 'object') {
    normalizedLevels = {};
    for (const [difficultyKey, level] of Object.entries(songData.levels)) {
      normalizedLevels[getDifficultyKey(difficultyKey)] = level;
    }
  }

  const normalized = {
    ...songData,
    courses: normalizedCourses
  };

  if (normalizedNoteTypes) {
    normalized.noteTypes = normalizedNoteTypes;
  }

  if (normalizedLevels) {
    normalized.levels = normalizedLevels;
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
  const fileBaseName = fileName.replace(/\.tja$/i, '');
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
      // Try next encoding.
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

function normalizeFileList(fileList) {
  return Array.from(fileList || []).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name
  }));
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

  const bars = [];
  let totalNotes = 0;
  let totalGap = 0;
  let gapCount = 0;
  let minGap = Infinity;

  for (let i = 0; i < gapData.length; i += 1) {
    const bar = gapData[i];
    if (!bar || bar.length === 0) continue;
    totalNotes += bar.length;

    bars.push({
      label: `${i + 1}`,
      values: bar.map((gap) => {
        if (gap === null) {
          return { text: '-', className: 'gap-null' };
        }
        totalGap += gap;
        gapCount += 1;
        if (gap < minGap) minGap = gap;
        return {
          text: gap.toFixed(1),
          className: getGapColorClass(gap)
        };
      })
    });
  }

  return {
    bars,
    stats: {
      totalNotes,
      avgGap: gapCount > 0 ? (totalGap / gapCount).toFixed(1) : '-',
      minGap: minGap === Infinity ? '-' : minGap.toFixed(1)
    }
  };
}

function getChartLevel(songData, difficulty) {
  if (!songData || typeof songData !== 'object') return null;

  const levelMap = songData.levels;
  if (levelMap && typeof levelMap === 'object') {
    const mapped = levelMap[difficulty] ?? levelMap[getDifficultyKey(difficulty)];
    const parsed = Number(mapped);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }

  const course = songData.courses?.[difficulty] ?? songData.courses?.[getDifficultyKey(difficulty)];
  if (course && typeof course === 'object' && !Array.isArray(course) && Number.isFinite(Number(course.level))) {
    const parsed = Number(course.level);
    if (parsed > 0) return parsed;
  }

  return null;
}

function App() {
  const fileInputRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const filterPanelRef = useRef(null);
  const [allSongsData, setAllSongsData] = useState([]);
  const [allResults, setAllResults] = useState([]);
  const [currentRows, setCurrentRows] = useState([]);
  const [sortState, setSortState] = useState({ col: null, asc: false });
  const [diffFilter, setDiffFilter] = useState('oni+edit');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('加载中...');
  const [dragOver, setDragOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [hideTopBarTitle, setHideTopBarTitle] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false);
  const [errorDialog, setErrorDialog] = useState({ open: false, title: '数据导入失败', message: '' });
  const [gapDialog, setGapDialog] = useState({
    open: false,
    title: '音符间隔详情',
    stats: null,
    bars: []
  });

  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('webkitdirectory', '');
      fileInputRef.current.setAttribute('directory', '');
    }

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
  }, []);

  useEffect(() => {
    const rootStyle = document.documentElement.style;

    const updateLayoutVars = () => {
      const headerHeight = headerRef.current?.getBoundingClientRect().height || 0;
      const footerHeight = footerRef.current?.getBoundingClientRect().height || 0;
      rootStyle.setProperty('--header-height', `${Math.ceil(headerHeight)}px`);
      rootStyle.setProperty('--footer-height', `${Math.ceil(footerHeight)}px`);
    };

    updateLayoutVars();

    let resizeObserver;
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(updateLayoutVars);
      if (headerRef.current) resizeObserver.observe(headerRef.current);
      if (footerRef.current) resizeObserver.observe(footerRef.current);
    }

    window.addEventListener('resize', updateLayoutVars);
    return () => {
      window.removeEventListener('resize', updateLayoutVars);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const updateTopBarMode = () => {
      const topBarWidth = headerRef.current?.getBoundingClientRect().width || window.innerWidth;
      setHideTopBarTitle(topBarWidth < 640);
    };

    updateTopBarMode();

    let resizeObserver;
    if ('ResizeObserver' in window && headerRef.current) {
      resizeObserver = new ResizeObserver(updateTopBarMode);
      resizeObserver.observe(headerRef.current);
    }

    window.addEventListener('resize', updateTopBarMode);
    return () => {
      window.removeEventListener('resize', updateTopBarMode);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!filterPanelOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!filterPanelRef.current?.contains(event.target)) {
        setFilterPanelOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setFilterPanelOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [filterPanelOpen]);

  const footerInfo = useMemo(() => {
    const date = new Date(__BUILD_TIME__);
    const timeStr = date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    return {
      timeStr,
      hash: __GIT_HASH__
    };
  }, []);

  const gridColumns = useMemo(() => ([
    createTableColumn({
      columnId: 'songName',
      renderHeaderCell: () => '歌曲名',
      renderCell: (item) => item.songName
    }),
    createTableColumn({
      columnId: 'category',
      renderHeaderCell: () => '分类',
      renderCell: (item) => item.category
    }),
    createTableColumn({
      columnId: 'difficulty',
      renderHeaderCell: () => '难度',
      renderCell: (item) => {
        const diffLabel = DIFFICULTY_LABELS[item.difficulty] || item.difficulty;
        return <span style={{ color: getDifficultyColor(item.difficulty), fontWeight: 700 }}>{diffLabel}</span>;
      }
    }),
    createTableColumn({
      columnId: 'level',
      renderHeaderCell: () => '星级',
      renderCell: (item) => (item.level ? `★${item.level}` : '-')
    }),
    createTableColumn({
      columnId: 'branchType',
      renderHeaderCell: () => '分支',
      renderCell: (item) => {
        const branchLabel = BRANCH_LABELS[item.branchType] || '';
        return <span style={{ color: getBranchColor(item.branchType), fontWeight: 600 }}>{branchLabel}</span>;
      }
    }),
    createTableColumn({
      columnId: 'stamina',
      renderHeaderCell: () => '体力',
      renderCell: (item) => formatNumber(item.ratings.stamina)
    }),
    createTableColumn({
      columnId: 'complex',
      renderHeaderCell: () => '复合',
      renderCell: (item) => formatNumber(item.ratings.complex)
    }),
    createTableColumn({
      columnId: 'complexRatio',
      renderHeaderCell: () => '复合难占比',
      renderCell: (item) => formatNumber(item.ratings.complexRatio)
    }),
    createTableColumn({
      columnId: 'rhythm',
      renderHeaderCell: () => '节奏',
      renderCell: (item) => formatNumber(item.ratings.rhythm)
    }),
    createTableColumn({
      columnId: 'rhythmRatio',
      renderHeaderCell: () => '节奏难占比',
      renderCell: (item) => formatNumber(item.ratings.rhythmRatio)
    }),
    createTableColumn({
      columnId: 'speed',
      renderHeaderCell: () => '手速',
      renderCell: (item) => formatNumber(item.ratings.speed)
    }),
    createTableColumn({
      columnId: 'burst',
      renderHeaderCell: () => '爆发',
      renderCell: (item) => formatNumber(item.ratings.burst)
    })
  ]), []);

  const filteredRows = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    const rows = [...currentRows];

    if (sortState.col !== null && SORTABLE_COLS[sortState.col]) {
      const field = SORTABLE_COLS[sortState.col];
      rows.sort((a, b) => {
        const va = field === 'level' ? (a.level || 0) : (a.ratings[field] || 0);
        const vb = field === 'level' ? (b.level || 0) : (b.ratings[field] || 0);
        return sortState.asc ? va - vb : vb - va;
      });
    }

    return rows.filter((row) => {
      if (diffFilter === 'oni+edit') {
        if (row.difficulty !== 'oni' && row.difficulty !== 'edit') return false;
      } else if (diffFilter !== 'all') {
        if (row.difficulty !== diffFilter) return false;
      }

      if (!keyword) return true;
      const diffLabel = DIFFICULTY_LABELS[row.difficulty] || row.difficulty;
      const branchLabel = BRANCH_LABELS[row.branchType] || '';
      const text = `${row.category} ${row.songName} ${diffLabel} ${branchLabel}`.toLowerCase();
      return text.includes(keyword);
    });
  }, [currentRows, diffFilter, searchKeyword, sortState]);

  const totalSongs = allResults.length;
  const totalCharts = currentRows.length;

  function showLoading(text = '加载中...') {
    setLoadingText(text);
    setIsLoading(true);
  }

  function hideLoading() {
    setIsLoading(false);
  }

  function showErrorModal(message, title = '数据导入失败') {
    setErrorDialog({ open: true, title, message });
  }

  function hideErrorModal() {
    setErrorDialog((prev) => ({ ...prev, open: false }));
  }

  function hideGapModal() {
    setGapDialog((prev) => ({ ...prev, open: false }));
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

  function openGapModal(row) {
    const gapData = findGapData(row.songIndex, row.difficulty, row.branchType);
    const song = allSongsData[row.songIndex];
    const songName = song?.songName || '';
    const diffLabel = DIFFICULTY_LABELS[row.difficulty] || row.difficulty;
    const branchLabel = BRANCH_LABELS[row.branchType] || '';
    const result = renderGapContent(gapData);

    setGapDialog({
      open: true,
      title: `${songName} - ${diffLabel}${branchLabel ? ` (${branchLabel})` : ''}`,
      stats: result?.stats || null,
      bars: result?.bars || []
    });
  }

  async function parseSongEntries(fileEntries) {
    const chartFiles = fileEntries.filter(({ file }) => isSupportedChartFile(file.name));

    if (!chartFiles.length) {
      throw new Error('未检测到可用的谱面文件。请拖入包含 .tja 的文件夹。');
    }

    const songs = [];
    const errors = [];
    const BATCH = 30;

    for (let i = 0; i < chartFiles.length; i += 1) {
      if (i % BATCH === 0) {
        showLoading(`正在读取文件... (${i}/${chartFiles.length})`);
        // 给浏览器一次渲染机会，避免大批文件导入时界面卡死。
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      const { file, relativePath } = chartFiles[i];
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
          errors.push(`${relativePath}: 缺少 courses 字段或格式不正确`);
          continue;
        }

        const { category, songName } = extractSongMeta(relativePath, file.name, preferredSongName, preferredCategory);
        songs.push({ category, songName, data });
      } catch (error) {
        errors.push(`${relativePath}: ${error.message}`);
      }
    }

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

  async function runCalculation(dataset, sourceLabel = '当前数据') {
    if (!dataset || dataset.length === 0) {
      showErrorModal('没有可计算的数据，请先加载数据或拖入文件夹。', '没有可用数据');
      return;
    }

    try {
      showLoading(`准备计算（${sourceLabel}）...`);
      const results = await calculateDifficulty(dataset, null, (statusText) => {
        showLoading(statusText);
      });
      setAllResults(results);

      const rows = [];
      for (let songIdx = 0; songIdx < results.length; songIdx += 1) {
        const song = results[songIdx];
        const sourceSong = dataset[songIdx];
        const charts = Array.isArray(song.charts) ? song.charts : [];
        for (const chart of charts) {
          const level = getChartLevel(sourceSong?.data, chart.difficulty);
          rows.push({
            id: `${songIdx}-${chart.difficulty}-${chart.branchType}-${rows.length}`,
            category: song.category,
            songName: song.songName,
            songIndex: songIdx,
            difficulty: chart.difficulty,
            level,
            branchType: chart.branchType,
            ratings: chart.ratings
          });
        }
      }

      setCurrentRows(rows);
      setSortState({ col: null, asc: false });
      hideLoading();
      console.log(`✅ 计算完成（${sourceLabel}）`);
    } catch (error) {
      console.error('❌ 计算失败:', error);
      showErrorModal(error.message || '计算失败，请检查数据格式。', '计算失败');
      hideLoading();
    }
  }

  async function handleImportedEntries(fileEntries, sourceLabel) {
    showLoading('正在读取导入的数据文件...');
    const importedSongs = await parseSongEntries(fileEntries);

    if (!importedSongs.length) {
      hideLoading();
      return;
    }

    setAllSongsData(importedSongs);
    await runCalculation(importedSongs, sourceLabel);
  }

  function exportResults() {
    if (allResults.length === 0) {
      showErrorModal('没有计算结果可导出。', '导出失败');
      return;
    }

    const rows = ['分类,歌曲,难度,星级,分支,体力,复合,复合难占比,节奏,节奏难占比,手速,爆发'];

    for (let songIndex = 0; songIndex < allResults.length; songIndex += 1) {
      const song = allResults[songIndex];
      const sourceSong = allSongsData[songIndex];
      for (const chart of song.charts) {
        const difficultyLabel = DIFFICULTY_LABELS[chart.difficulty] || chart.difficulty;
        const branchLabel = BRANCH_LABELS[chart.branchType] || '';
        const level = getChartLevel(sourceSong?.data, chart.difficulty);

        rows.push(
          `"${song.category}","${song.songName}","${difficultyLabel}","${level || ''}","${branchLabel}",${chart.ratings.stamina},${chart.ratings.complex},${chart.ratings.complexRatio},${chart.ratings.rhythm},${chart.ratings.rhythmRatio},${chart.ratings.speed},${chart.ratings.burst}`
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
    URL.revokeObjectURL(url);
  }

  async function onUploadInputChange(event) {
    try {
      const fileEntries = normalizeFileList(event.target.files);
      await handleImportedEntries(fileEntries, '用户上传文件夹');
    } catch (error) {
      hideLoading();
      showErrorModal(error.message || '上传失败，请检查文件格式。', '导入失败');
    } finally {
      event.target.value = '';
    }
  }

  async function onDrop(event) {
    event.preventDefault();
    setDragOver(false);

    try {
      const fileEntries = await collectDroppedFiles(event.dataTransfer);
      await handleImportedEntries(fileEntries, '用户拖入数据');
    } catch (error) {
      hideLoading();
      showErrorModal(error.message || '读取拖拽数据失败，请检查文件格式。', '导入失败');
    }
  }

  function onSort(columnId) {
    if (!SORTABLE_COLS[columnId]) return;
    setSortState((prev) => {
      if (prev.col === columnId) {
        return { ...prev, asc: !prev.asc };
      }
      return { col: columnId, asc: false };
    });
  }

  function sortIndicator(columnId) {
    if (!SORTABLE_COLS[columnId]) return '';
    if (sortState.col !== columnId) return '⇅';
    return sortState.asc ? '▲' : '▼';
  }

  function handleNavSelect(_, data) {
    if (data.value === 'upload') {
      fileInputRef.current?.click();
    } else if (data.value === 'export') {
      exportResults();
    } else if (data.value === 'about') {
      setAboutDialogOpen(true);
    }
    setMenuOpen(false);
  }

  return (
    <FluentProvider theme={taikoKaTheme}>
      <div className="app-shell">
        <header className={`top-bar${hideTopBarTitle ? ' top-bar-compact' : ''}`} ref={headerRef}>
          <div className="top-bar-primary">
            <div className="top-bar-left">
              <Hamburger
                className="header-hamburger"
                aria-label="打开操作抽屉"
                onClick={() => setMenuOpen((prev) => !prev)}
              />
              {!hideTopBarTitle ? <Title3 className="top-bar-title">太鼓谱面难度分析</Title3> : null}
            </div>
            <div className="actions-row">
              <Input
                className="search-input"
                contentBefore={<SearchRegular />}
                contentAfter={(
                  <span className="search-filter-addon" ref={filterPanelRef}>
                    <FilterButton
                      className="search-filter-trigger"
                      aria-label={filterPanelOpen ? '收起过滤器' : '展开过滤器'}
                      aria-haspopup="menu"
                      aria-expanded={filterPanelOpen}
                      onClick={() => setFilterPanelOpen((prev) => !prev)}
                    />
                    {filterPanelOpen ? (
                      <div className="filter-dropdown" role="menu" aria-label="难度过滤器">
                        <div className="filter-label">难度过滤</div>
                        <div className="filter-options" role="radiogroup" aria-label="按难度过滤">
                          {DIFFICULTY_FILTER_OPTIONS.map((option) => {
                            const selected = diffFilter === option.value;
                            return (
                              <Button
                                key={option.value}
                                className={`filter-option-btn${selected ? ' is-selected' : ''}`}
                                appearance="subtle"
                                size="small"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => {
                                  setDiffFilter(option.value);
                                  setFilterPanelOpen(false);
                                }}
                              >
                                {option.label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </span>
                )}
                placeholder="搜索歌曲..."
                value={searchKeyword}
                onChange={(_, data) => setSearchKeyword(data.value)}
              />
            </div>
          </div>
        </header>

        <NavDrawer
          className="app-nav-drawer"
          open={menuOpen}
          type="overlay"
          position="start"
          onOpenChange={(_, data) => setMenuOpen(data.open)}
        >
          <NavDrawerHeader
            className="app-nav-drawer-header"
            role="button"
            tabIndex={0}
            aria-label="收起操作抽屉"
            onClick={() => setMenuOpen(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setMenuOpen(false);
              }
            }}
          >
            <Hamburger
              className="header-hamburger drawer-header-hamburger"
              aria-label="收起操作抽屉"
            />
          </NavDrawerHeader>
          <NavDrawerBody>
            <Nav onNavItemSelect={handleNavSelect} selectedValue="">
              <NavItem value="upload" icon={<ArrowUploadRegular />}>上传谱面</NavItem>
              <NavItem value="export" icon={<ArrowDownloadRegular />} disabled={!allResults.length}>导出定数</NavItem>
              <NavItem value="about" icon={<InfoRegular />}>关于</NavItem>
            </Nav>
          </NavDrawerBody>
        </NavDrawer>

        <main className="content-area">
          <div
            className={`results-panel${dragOver ? ' drag-over' : ''}`}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setDragOver(false);
              }
            }}
            onDrop={onDrop}
          >
            <section className="list-info-bar">
              <Body1 className="list-stat">歌曲数: {totalSongs}</Body1>
              <Body1 className="list-stat">谱面数: {totalCharts}</Body1>
            </section>
            {!filteredRows.length ? (
              <div className="drop-placeholder" role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()}>
                <div className="drop-icon">📂</div>
                <Body1>点击或拖拽上传 TJA 文件或文件夹</Body1>
                <Body1 className="hint">支持 .TJA 谱面，兼容任意目录结构</Body1>
              </div>
            ) : (
              <div className="table-wrapper">
                <DataGrid
                  className="table-grid"
                  items={filteredRows}
                  columns={gridColumns}
                  getRowId={(item) => item.id}
                  focusMode="composite"
                >
                  <DataGridHeader>
                    <DataGridRow>
                      {({ renderHeaderCell, columnId }) => (
                        <DataGridHeaderCell
                          onClick={() => onSort(columnId)}
                          className={`${SORTABLE_COLS[columnId] ? 'sortable' : ''} ${columnId === 'songName' ? 'sticky-first-col-header' : ''}`.trim()}
                        >
                          <span className="header-cell-text">
                            <span className="header-title-text">{renderHeaderCell()}</span>
                            {SORTABLE_COLS[columnId] ? <span className="sort-indicator">{sortIndicator(columnId)}</span> : null}
                          </span>
                        </DataGridHeaderCell>
                      )}
                    </DataGridRow>
                  </DataGridHeader>
                  <DataGridBody>
                    {({ item, rowId }) => (
                      <DataGridRow key={rowId} className="result-row" onClick={() => openGapModal(item)}>
                        {({ renderCell, columnId }) => (
                          <DataGridCell className={columnId === 'songName' ? 'sticky-first-col-cell' : ''}>
                            {renderCell(item)}
                          </DataGridCell>
                        )}
                      </DataGridRow>
                    )}
                  </DataGridBody>
                </DataGrid>
              </div>
            )}
          </div>
        </main>

        <input ref={fileInputRef} type="file" multiple className="hidden-input" onChange={onUploadInputChange} />

        <Dialog open={errorDialog.open} onOpenChange={(_, data) => !data.open && hideErrorModal()}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>{errorDialog.title}</DialogTitle>
              <DialogContent>
                <pre className="dialog-pre">{errorDialog.message}</pre>
              </DialogContent>
              <DialogActions>
                <DialogTrigger disableButtonEnhancement>
                  <Button appearance="primary" onClick={hideErrorModal}>我知道了</Button>
                </DialogTrigger>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <Dialog open={gapDialog.open} onOpenChange={(_, data) => !data.open && hideGapModal()}>
          <DialogSurface className="gap-dialog-surface">
            <DialogBody>
              <DialogTitle>{gapDialog.title}</DialogTitle>
              <DialogContent>
                {gapDialog.stats ? (
                  <div className="gap-stats">
                    <Badge appearance="tint">音符数: {gapDialog.stats.totalNotes}</Badge>
                    <Badge appearance="tint">平均间隔: {gapDialog.stats.avgGap} ms</Badge>
                    <Badge appearance="tint">最小间隔: {gapDialog.stats.minGap} ms</Badge>
                  </div>
                ) : (
                  <Body1 className="hint">无音符间隔数据</Body1>
                )}
                <div className="gap-list">
                  {gapDialog.bars.map((bar) => (
                    <div className="gap-bar" key={bar.label}>
                      <span className="gap-bar-label">{bar.label}</span>
                      {bar.values.map((value, idx) => (
                        <span className={`gap-value ${value.className}`} key={`${bar.label}-${idx}`}>
                          {value.text}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={hideGapModal}>关闭</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <Dialog open={aboutDialogOpen} onOpenChange={(_, data) => setAboutDialogOpen(data.open)}>
          <DialogSurface>
            <DialogBody>
              <DialogTitle>关于太鼓铺面难度分析</DialogTitle>
              <DialogContent>
                <Body1>
                  这是一个用于分析太鼓谱面难度的工具，支持导入 TJA 谱面文件，自动计算体力、复合、节奏、手速与爆发等维度评分。
                </Body1>
                <Body1 style={{ marginTop: 8 }}>
                  你可以通过上传或拖拽文件夹批量导入谱面，使用顶部筛选与搜索快速定位歌曲，并将计算结果导出为 CSV。
                </Body1>
                <div className="about-meta" style={{ marginTop: 12 }}>
                  <div className="about-meta-line">部署时间: {footerInfo.timeStr}</div>
                  <div className="about-meta-line">
                    版本:
                    {' '}
                    <Link href={`https://github.com/Dafrok/taiko-rating-app/commit/${footerInfo.hash}`} target="_blank" rel="noreferrer">
                      {footerInfo.hash}
                    </Link>
                  </div>
                  <div className="about-meta-line">
                    网络状态:
                    {' '}
                    <span className={`network-status ${isOffline ? 'is-offline' : 'is-online'}`}>
                      {isOffline ? '当前离线（缓存模式）' : '在线'}
                    </span>
                  </div>
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={() => setAboutDialogOpen(false)}>关闭</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        {isLoading ? (
          <div className="loading-overlay">
            <div className="loading-panel">
              <Spinner size="large" label={loadingText} />
            </div>
          </div>
        ) : null}
      </div>
    </FluentProvider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
