import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, matchPath, useLocation, useNavigate } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
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
  Nav,
  NavDivider,
  NavDrawer,
  NavDrawerBody,
  NavDrawerHeader,
  NavItem,
  NavSectionHeader,
  Spinner,
  Toolbar,
  ToolbarButton,
  createLightTheme,
  createTableColumn,
  Title3,
  webLightTheme
} from '@fluentui/react-components';
import {
  ArrowDownloadRegular,
  ArrowUploadRegular,
  CalculatorRegular,
  DataHistogramRegular,
  FilterRegular,
  InfoRegular,
  MoneyCalculatorRegular,
  SearchRegular,
  StarFilled,
  StarRegular
} from '@fluentui/react-icons';
import { calculateDifficulty, warmupPython } from './data-engine.js';
import { analyzeTjaToJson } from './tjs-analyzer.ts';
import AboutPage from './AboutPage.jsx';
import ChartDetailPage from './ChartDetailPage.jsx';
import ConstantsDetailPage from './ConstantsDetailPage.jsx';
import ConstantsTablePage from './ConstantsTablePage.jsx';
import SingleSongPricePage from './SingleSongPricePage.jsx';
import TargetScorePage from './TargetScorePage.jsx';
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
  totalNotes: 'totalNotes',
  stamina: 'stamina',
  complex: 'complex',
  complexRatio: 'complexRatio',
  rhythm: 'rhythm',
  rhythmRatio: 'rhythmRatio',
  speed: 'speed',
  burst: 'burst'
};

const TAIKO_KA_PALETTE = {
  10: '#7a2f1b',
  20: '#8f3a20',
  30: '#a54625',
  40: '#bb522b',
  50: '#cf5f31',
  60: '#de6f39',
  70: '#e98045',
  80: '#ef8f57',
  90: '#f39f6c',
  100: '#f7ae81',
  110: '#f9bc95',
  120: '#fbc9aa',
  130: '#fdd7bf',
  140: '#fee4d3',
  150: '#fff0e6',
  160: '#fff8f2'
};

const NETWORK_PROBE_URLS = [
  'https://www.gstatic.com/generate_204',
  'https://github.com/favicon.ico'
];

const ROUTER_BASENAME = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';
const FAVORITE_IDS_STORAGE_KEY = 'taiko-rating.favorite-chart-ids.v1';
const FAVORITE_SONGS_CACHE_FLAG_KEY = 'taiko-rating.favorite-songs-cache-flag.v1';
const DIFF_FILTER_STORAGE_KEY = 'taiko-rating.diff-filter.v1';
const FAVORITE_SONGS_DB_NAME = 'taiko-rating-cache';
const FAVORITE_SONGS_DB_STORE = 'kv';
const FAVORITE_SONGS_DB_KEY = 'favorite-songs';
const DIFFICULTY_FILTER_VALUE_SET = new Set(DIFFICULTY_FILTER_OPTIONS.map((option) => option.value));

function loadStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function saveStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`⚠️ 持久化失败: ${key}`, error);
  }
}

function openFavoriteCacheDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }

    const request = indexedDB.open(FAVORITE_SONGS_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FAVORITE_SONGS_DB_STORE)) {
        db.createObjectStore(FAVORITE_SONGS_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('打开缓存数据库失败'));
  });
}

async function readFavoriteSongsFromDb() {
  const db = await openFavoriteCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FAVORITE_SONGS_DB_STORE, 'readonly');
    const store = tx.objectStore(FAVORITE_SONGS_DB_STORE);
    const request = store.get(FAVORITE_SONGS_DB_KEY);
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error || new Error('读取收藏缓存失败'));
    tx.oncomplete = () => db.close();
    tx.onabort = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function writeFavoriteSongsToDb(songs) {
  const db = await openFavoriteCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FAVORITE_SONGS_DB_STORE, 'readwrite');
    const store = tx.objectStore(FAVORITE_SONGS_DB_STORE);
    store.put(songs, FAVORITE_SONGS_DB_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('写入收藏缓存失败'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('写入收藏缓存被中止'));
    };
  });
}

async function clearFavoriteSongsDb() {
  const db = await openFavoriteCacheDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FAVORITE_SONGS_DB_STORE, 'readwrite');
    const store = tx.objectStore(FAVORITE_SONGS_DB_STORE);
    store.delete(FAVORITE_SONGS_DB_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve(true);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('清理收藏缓存失败'));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('清理收藏缓存被中止'));
    };
  });
}

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

async function probeNetworkReachability(signal) {
  for (const baseUrl of NETWORK_PROBE_URLS) {
    const probeUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}ts=${Date.now()}`;

    try {
      await fetch(probeUrl, {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        redirect: 'follow',
        signal
      });
      return true;
    } catch (error) {
      if (signal?.aborted) {
        throw error;
      }
    }
  }

  return false;
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

function buildGapSpeedProfile(minGap, avgGap, medianGap, modeGap, secondModeGap) {
  const anchors = [minGap, avgGap, medianGap, Number(modeGap), Number(secondModeGap)]
    .filter((value) => Number.isFinite(value));

  if (anchors.length < 3) {
    return {
      fastMax: 80,
      mediumMax: 150,
      normalMax: 300
    };
  }

  anchors.sort((a, b) => a - b);
  while (anchors.length < 5) {
    anchors.push(anchors[anchors.length - 1]);
  }

  const low = anchors[0];
  const lower = anchors[1];
  const mid = anchors[2];
  const upper = anchors[3];
  const high = anchors[4];

  const mid1 = (low + lower) / 2;
  const mid2 = (lower + mid) / 2;
  const upperBlend = (upper + high) / 2;
  const mid3 = (mid + upperBlend) / 2;

  const fastMax = Number(mid1.toFixed(1));
  const mediumMax = Number(Math.max(mid2, fastMax + 0.1).toFixed(1));
  const normalMax = Number(Math.max(mid3, mediumMax + 0.1).toFixed(1));

  return { fastMax, mediumMax, normalMax };
}

function getGapColorClass(gap, profile) {
  if (gap === null) return 'gap-null';
  if (gap <= profile.fastMax) return 'gap-fast';
  if (gap <= profile.mediumMax) return 'gap-medium';
  if (gap <= profile.normalMax) return 'gap-normal';
  return 'gap-slow';
}

function renderGapContent(gapData) {
  if (!gapData) return null;

  const bars = [];
  let totalNotes = 0;
  let totalGap = 0;
  let gapCount = 0;
  let minGap = Infinity;
  const gapFrequency = new Map();
  const gapValues = [];

  for (let i = 0; i < gapData.length; i += 1) {
    const bar = gapData[i];
    if (!Array.isArray(bar)) continue;
    totalNotes += bar.length;

    bars.push({
      label: `${i + 1}`,
      values: bar.map((gap) => {
        if (gap === null) {
          return { text: '-', rawGap: null };
        }
        const gapText = gap.toFixed(1);
        totalGap += gap;
        gapCount += 1;
        if (gap < minGap) minGap = gap;
        gapValues.push(gap);
        gapFrequency.set(gapText, (gapFrequency.get(gapText) || 0) + 1);
        return {
          text: gapText,
          rawGap: gap
        };
      })
    });
  }

  const rankedGaps = Array.from(gapFrequency.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return Number(a[0]) - Number(b[0]);
    });

  const modeGap = rankedGaps[0]?.[0] || '-';
  const modeGapCount = rankedGaps[0]?.[1] || 0;
  const secondModeGap = rankedGaps[1]?.[0] || '-';
  const secondModeGapCount = rankedGaps[1]?.[1] || 0;
  const avgGapValue = gapCount > 0 ? totalGap / gapCount : null;
  let medianGapValue = null;
  if (gapValues.length) {
    const sortedValues = [...gapValues].sort((a, b) => a - b);
    const mid = Math.floor(sortedValues.length / 2);
    medianGapValue = sortedValues.length % 2 === 0
      ? (sortedValues[mid - 1] + sortedValues[mid]) / 2
      : sortedValues[mid];
  }
  const gapSpeedProfile = buildGapSpeedProfile(
    minGap === Infinity ? null : minGap,
    avgGapValue,
    medianGapValue,
    modeGap,
    secondModeGap
  );

  const coloredBars = bars.map((bar) => ({
    ...bar,
    values: bar.values.map((value) => ({
      text: value.text,
      className: getGapColorClass(value.rawGap, gapSpeedProfile)
    }))
  }));

  return {
    bars: coloredBars,
    stats: {
      totalNotes,
      avgGap: avgGapValue === null ? '-' : avgGapValue.toFixed(1),
      medianGap: medianGapValue === null ? '-' : medianGapValue.toFixed(1),
      minGap: minGap === Infinity ? '-' : minGap.toFixed(1),
      modeGap,
      modeGapCount,
      secondModeGap,
      secondModeGapCount,
      gapSpeedProfile
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

async function hashText(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const filterPanelRef = useRef(null);
  const [allSongsData, setAllSongsData] = useState([]);
  const [allResults, setAllResults] = useState([]);
  const [currentRows, setCurrentRows] = useState([]);
  const [sortState, setSortState] = useState({ col: null, asc: false });
  const [diffFilter, setDiffFilter] = useState(() => {
    try {
      const stored = localStorage.getItem(DIFF_FILTER_STORAGE_KEY);
      if (stored && DIFFICULTY_FILTER_VALUE_SET.has(stored)) {
        return stored;
      }
    } catch (_) {
      // Ignore storage access errors and use default filter.
    }
    return 'oni+edit';
  });
  const [searchInput, setSearchInput] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('加载中...');
  const [dragOver, setDragOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [hideTopBarTitle, setHideTopBarTitle] = useState(false);
  const [constantsVisibleCount, setConstantsVisibleCount] = useState(0);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [errorDialog, setErrorDialog] = useState({ open: false, title: '数据导入失败', message: '' });
  const [hasFavoriteCache, setHasFavoriteCache] = useState(() => {
    return localStorage.getItem(FAVORITE_SONGS_CACHE_FLAG_KEY) === '1';
  });
  const [favoriteChartIds, setFavoriteChartIds] = useState(() => {
    const ids = loadStoredJson(FAVORITE_IDS_STORAGE_KEY, []);
    if (!Array.isArray(ids)) return new Set();
    return new Set(ids.filter((id) => typeof id === 'string' && id));
  });
  const [currentPage, setCurrentPage] = useState(1);
  const ROWS_PER_PAGE = 50;

  const routeSearchKeyword = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('q') ?? '';
  }, [location.search]);

  useEffect(() => {
    setSearchInput(routeSearchKeyword);
    setSearchKeyword(routeSearchKeyword);
  }, [routeSearchKeyword]);

  useEffect(() => {
    try {
      localStorage.setItem(DIFF_FILTER_STORAGE_KEY, diffFilter);
    } catch (_) {
      // Ignore storage access errors.
    }
  }, [diffFilter]);

  // 当过滤条件改变时，重置回第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [diffFilter, searchKeyword, sortState]);

  const isAboutRoute = location.pathname === '/about';
  const isConstantsRoute = location.pathname === '/constants';
  const constantsDetailRouteMatch = matchPath('/constants/:entryId', location.pathname);
  const isConstantsDetailRoute = Boolean(constantsDetailRouteMatch);
  const isSinglePriceRoute = location.pathname === '/single-price';
  const isTargetScoreRoute = location.pathname === '/target-score';
  const isRootRoute = location.pathname === '/';
  const chartPreviewRouteMatch = matchPath('/chart/:chartId/preview', location.pathname);
  const chartDetailRouteMatch = matchPath('/chart/:chartId', location.pathname);
  const chartRouteMatch = chartPreviewRouteMatch || chartDetailRouteMatch;
  const isChartRoute = Boolean(chartRouteMatch);
  const isKnownRoute = isRootRoute || isConstantsRoute || isConstantsDetailRoute || isAboutRoute || isSinglePriceRoute || isTargetScoreRoute || isChartRoute;
  const routeChartId = useMemo(() => {
    if (!chartRouteMatch?.params?.chartId) return '';
    try {
      return decodeURIComponent(chartRouteMatch.params.chartId);
    } catch (_) {
      return chartRouteMatch.params.chartId;
    }
  }, [chartRouteMatch]);

  const routeConstantsDetail = useMemo(() => {
    const stateDetail = location.state?.constantDetail;
    if (stateDetail && typeof stateDetail === 'object') {
      return stateDetail;
    }
    return null;
  }, [location.state]);

  useEffect(() => {
    const isTouchDevice = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;
    if (!isTouchDevice) return;

    const preventGestureZoom = (event) => {
      event.preventDefault();
    };
    const preventCtrlWheelZoom = (event) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };

    document.addEventListener('gesturestart', preventGestureZoom, { passive: false });
    document.addEventListener('gesturechange', preventGestureZoom, { passive: false });
    document.addEventListener('gestureend', preventGestureZoom, { passive: false });
    window.addEventListener('wheel', preventCtrlWheelZoom, { passive: false });

    return () => {
      document.removeEventListener('gesturestart', preventGestureZoom);
      document.removeEventListener('gesturechange', preventGestureZoom);
      document.removeEventListener('gestureend', preventGestureZoom);
      window.removeEventListener('wheel', preventCtrlWheelZoom);
    };
  }, []);

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

  async function restoreFavoriteSongsFromCache(sourceLabel = '本地收藏缓存', showErrorWhenEmpty = false) {
    let cachedSongs = [];
    try {
      cachedSongs = await readFavoriteSongsFromDb();
    } catch (error) {
      console.warn('⚠️ 读取收藏缓存失败:', error);
      cachedSongs = [];
    }

    if (!Array.isArray(cachedSongs) || cachedSongs.length === 0) {
      setHasFavoriteCache(false);
      localStorage.removeItem(FAVORITE_SONGS_CACHE_FLAG_KEY);
      if (showErrorWhenEmpty) {
        showErrorModal('尚未收藏任何谱面，请先在列表中点击星标收藏。', '没有收藏缓存');
      }
      return false;
    }

    const restoredSongs = cachedSongs
      .map((song) => {
        if (!song || typeof song !== 'object' || !song.data) return null;
        return {
          category: song.category || '未知分类',
          songName: song.songName || '未知歌曲',
          data: normalizeSongJson(song.data),
          songHash: song.songHash || '',
          tjaContent: typeof song.tjaContent === 'string' ? song.tjaContent : ''
        };
      })
      .filter(Boolean);

    if (!restoredSongs.length) {
      setHasFavoriteCache(false);
      localStorage.removeItem(FAVORITE_SONGS_CACHE_FLAG_KEY);
      if (showErrorWhenEmpty) {
        showErrorModal('收藏缓存数据无效，请重新收藏后再试。', '收藏缓存无效');
      }
      return false;
    }

    setHasFavoriteCache(true);
    localStorage.setItem(FAVORITE_SONGS_CACHE_FLAG_KEY, '1');
    setSearchInput('');
    setSearchKeyword('');
    commitSearch('', { replace: true });
    setAllSongsData(restoredSongs);
    await runCalculation(restoredSongs, sourceLabel);
    return true;
  }

  useEffect(() => {
    const rootStyle = document.documentElement.style;
    let rafId = 0;
    let lastHeaderHeight = -1;
    let lastFooterHeight = -1;

    const applyLayoutVars = () => {
      const headerHeight = headerRef.current?.getBoundingClientRect().height || 0;
      const footerHeight = (isRootRoute || isConstantsRoute)
        ? (footerRef.current?.getBoundingClientRect().height || 0)
        : 0;

      const nextHeaderHeight = Math.ceil(headerHeight);
      const nextFooterHeight = Math.ceil(footerHeight);

      if (nextHeaderHeight !== lastHeaderHeight) {
        rootStyle.setProperty('--header-height', `${nextHeaderHeight}px`);
        lastHeaderHeight = nextHeaderHeight;
      }
      if (nextFooterHeight !== lastFooterHeight) {
        rootStyle.setProperty('--footer-height', `${nextFooterHeight}px`);
        lastFooterHeight = nextFooterHeight;
      }
    };

    const scheduleLayoutVarsUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        applyLayoutVars();
      });
    };

    applyLayoutVars();

    let resizeObserver;
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(scheduleLayoutVarsUpdate);
      if (headerRef.current) resizeObserver.observe(headerRef.current);
      if ((isRootRoute || isConstantsRoute) && footerRef.current) resizeObserver.observe(footerRef.current);
    }

    window.addEventListener('resize', scheduleLayoutVarsUpdate);
    return () => {
      window.removeEventListener('resize', scheduleLayoutVarsUpdate);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [isRootRoute, isConstantsRoute]);

  useEffect(() => {
    let rafId = 0;

    const applyTopBarMode = () => {
      if (!isRootRoute && !isConstantsRoute) {
        setHideTopBarTitle((prev) => (prev ? false : prev));
        return;
      }
      const topBarWidth = headerRef.current?.getBoundingClientRect().width || window.innerWidth;
      const nextCompact = topBarWidth < 640;
      setHideTopBarTitle((prev) => (prev === nextCompact ? prev : nextCompact));
    };

    const scheduleTopBarModeUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        applyTopBarMode();
      });
    };

    applyTopBarMode();

    let resizeObserver;
    if ('ResizeObserver' in window && headerRef.current) {
      resizeObserver = new ResizeObserver(scheduleTopBarModeUpdate);
      resizeObserver.observe(headerRef.current);
    }

    window.addEventListener('resize', scheduleTopBarModeUpdate);
    return () => {
      window.removeEventListener('resize', scheduleTopBarModeUpdate);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [isRootRoute, isConstantsRoute]);

  useEffect(() => {
    let active = true;
    let currentController = null;

    const checkNetworkStatus = async () => {
      const controller = new AbortController();
      currentController?.abort();
      currentController = controller;

      if (!navigator.onLine) {
        if (active && currentController === controller) {
          setIsOffline(true);
        }
        return;
      }

      try {
        const reachable = await probeNetworkReachability(controller.signal);
        if (active && currentController === controller) {
          setIsOffline(!reachable);
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if (currentController === controller) {
          setIsOffline(true);
        }
      }
    };

    const handleOnline = () => {
      void checkNetworkStatus();
    };
    const handleOffline = () => setIsOffline(true);

    void checkNetworkStatus();

    const intervalId = window.setInterval(() => {
      void checkNetworkStatus();
    }, 30000);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleOnline);

    return () => {
      active = false;
      currentController?.abort();
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleOnline);
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

  useEffect(() => {
    if (!isKnownRoute) {
      navigate('/', { replace: true });
    }
  }, [isKnownRoute, navigate]);

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

  const chartIdsBySongIndex = useMemo(() => {
    const grouped = new Map();
    for (const row of currentRows) {
      if (!grouped.has(row.songIndex)) {
        grouped.set(row.songIndex, []);
      }
      grouped.get(row.songIndex).push(row.id);
    }
    return grouped;
  }, [currentRows]);

  const columnSizingOptions = useMemo(() => ({
    songName: {
      minWidth: 220,
      idealWidth: 220,
      defaultWidth: 220
    }
  }), []);

  const gridColumns = useMemo(() => ([
    createTableColumn({
      columnId: 'songName',
      renderHeaderCell: () => '歌曲名',
      renderCell: (item) => item.songName
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
      renderHeaderCell: () => '分歧',
      renderCell: (item) => {
        const branchLabel = BRANCH_LABELS[item.branchType] || '';
        if (!branchLabel) {
          return <span style={{ color: '#c4cbd4', fontWeight: 400, opacity: 0.78 }}>无</span>;
        }
        return <span style={{ color: getBranchColor(item.branchType), fontWeight: 600 }}>{branchLabel}</span>;
      }
    }),
    createTableColumn({
      columnId: 'totalNotes',
      renderHeaderCell: () => 'Note 数',
      renderCell: (item) => item.ratings.totalNotes || 0
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
    }),
    createTableColumn({
      columnId: 'favorite',
      renderHeaderCell: () => '收藏',
      renderCell: (item) => {
        const relatedChartIds = chartIdsBySongIndex.get(item.songIndex) || [item.id];
        const isFavorite = relatedChartIds.every((chartId) => favoriteChartIds.has(chartId));
        return (
          <Button
            appearance="transparent"
            size="small"
            icon={isFavorite ? <StarFilled color="#f5b301" /> : <StarRegular color="#f5b301" />}
            aria-label={isFavorite ? '取消收藏谱面' : '收藏谱面'}
            onClick={(event) => {
              event.stopPropagation();
              toggleFavoriteChart(item);
            }}
          />
        );
      }
    })
  ]), [favoriteChartIds, chartIdsBySongIndex]);

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

  const selectedChartRow = useMemo(() => {
    if (!routeChartId) return null;
    return currentRows.find((row) => row.id === routeChartId) || null;
  }, [currentRows, routeChartId]);

  const selectedChartDetail = useMemo(() => {
    if (!selectedChartRow) return null;
    const gapData = findGapData(selectedChartRow.songIndex, selectedChartRow.difficulty, selectedChartRow.branchType);
    const song = allSongsData[selectedChartRow.songIndex];
    const songName = song?.songName || '';
    const diffLabel = DIFFICULTY_LABELS[selectedChartRow.difficulty] || selectedChartRow.difficulty;
    const branchLabel = BRANCH_LABELS[selectedChartRow.branchType] || '';
    const result = renderGapContent(gapData);
    return {
      title: `${songName} - ${diffLabel}${branchLabel ? ` (${branchLabel})` : ''}`,
      songName,
      difficulty: selectedChartRow.difficulty,
      diffLabel,
      level: selectedChartRow.level,
      branchType: selectedChartRow.branchType,
      branchLabel,
      category: selectedChartRow.category,
      ratings: selectedChartRow.ratings || null,
      stats: result?.stats || null,
      bars: result?.bars || [],
      tjaContent: typeof song?.tjaContent === 'string' ? song.tjaContent : ''
    };
  }, [allSongsData, selectedChartRow]);

  const selectedChartIsFavorite = useMemo(() => {
    if (!selectedChartRow) return false;
    const relatedChartIds = chartIdsBySongIndex.get(selectedChartRow.songIndex) || [selectedChartRow.id];
    return relatedChartIds.length > 0 && relatedChartIds.every((chartId) => favoriteChartIds.has(chartId));
  }, [selectedChartRow, chartIdsBySongIndex, favoriteChartIds]);

  useEffect(() => {
    if (isChartRoute && !selectedChartDetail) {
      navigate({ pathname: '/', search: location.search });
    }
  }, [isChartRoute, selectedChartDetail, navigate, location.search]);

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

  function commitSearch(nextValue = searchInput, options = {}) {
    const keyword = nextValue.trim();
    const params = new URLSearchParams(location.search);
    if (keyword) {
      params.set('q', keyword);
    } else {
      params.delete('q');
    }
    const search = params.toString();
    const targetPath = isConstantsRoute ? '/constants' : '/';
    navigate({ pathname: targetPath, search: search ? `?${search}` : '' }, { replace: Boolean(options.replace) });
  }

  function closeChartDetailPage() {
    if (location.pathname !== '/') {
      navigate({ pathname: '/', search: location.search });
    }
  }

  async function persistFavoriteSongs(idsSet) {
    let existingSongs = [];
    try {
      const stored = await readFavoriteSongsFromDb();
      existingSongs = Array.isArray(stored) ? stored : [];
    } catch (error) {
      console.warn('⚠️ 读取已有收藏缓存失败:', error);
      existingSongs = [];
    }

    const favoriteSongIndexes = new Set(
      currentRows
        .filter((row) => idsSet.has(row.id))
        .map((row) => row.songIndex)
    );

    const selectedSongs = Array.from(favoriteSongIndexes)
      .sort((a, b) => a - b)
      .map((songIndex) => allSongsData[songIndex])
      .filter(Boolean)
      .map((song) => ({
        category: song.category,
        songName: song.songName,
        data: song.data,
        songHash: song.songHash,
        tjaContent: typeof song.tjaContent === 'string' ? song.tjaContent : ''
      }));

    const selectedSongHashSet = new Set(selectedSongs.map((song) => song.songHash).filter(Boolean));
    const currentDatasetSongHashSet = new Set(
      allSongsData
        .map((song) => song?.songHash)
        .filter((songHash) => typeof songHash === 'string' && songHash)
    );

    // Keep favorites from other imports; replace only songs from the current dataset.
    const retainedExistingSongs = existingSongs.filter((song) => {
      const songHash = song?.songHash;
      if (typeof songHash !== 'string' || !songHash) return false;
      if (!currentDatasetSongHashSet.has(songHash)) return true;
      return selectedSongHashSet.has(songHash);
    });

    const mergedByHash = new Map();
    for (const song of retainedExistingSongs) {
      if (song?.songHash) mergedByHash.set(song.songHash, song);
    }
    for (const song of selectedSongs) {
      if (song?.songHash) mergedByHash.set(song.songHash, song);
    }
    const cachedSongs = Array.from(mergedByHash.values());

    if (cachedSongs.length === 0) {
      try {
        await clearFavoriteSongsDb();
      } catch (error) {
        console.warn('⚠️ 清理收藏缓存失败:', error);
      }
      localStorage.removeItem(FAVORITE_SONGS_CACHE_FLAG_KEY);
      setHasFavoriteCache(false);
      return;
    }

    try {
      await writeFavoriteSongsToDb(cachedSongs);
      localStorage.setItem(FAVORITE_SONGS_CACHE_FLAG_KEY, '1');
    } catch (error) {
      console.warn('⚠️ 写入收藏缓存失败:', error);
    }
    setHasFavoriteCache(cachedSongs.length > 0);
  }

  function toggleFavoriteChart(row) {
    setFavoriteChartIds((prev) => {
      const next = new Set(prev);
      const relatedChartIds = chartIdsBySongIndex.get(row.songIndex) || [row.id];
      const isAllFavorited = relatedChartIds.every((chartId) => next.has(chartId));

      if (isAllFavorited) {
        for (const chartId of relatedChartIds) {
          next.delete(chartId);
        }
      } else {
        for (const chartId of relatedChartIds) {
          next.add(chartId);
        }
      }

      saveStoredJson(FAVORITE_IDS_STORAGE_KEY, Array.from(next));
      void persistFavoriteSongs(next);
      return next;
    });
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

  function openChartDetailPage(row) {
    navigate({
      pathname: `/chart/${encodeURIComponent(row.id)}`,
      search: location.search
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
        let tjaContent = '';

        if (file.name.toLowerCase().endsWith('.tja')) {
          data = analyzeTjaToJson(text);
          preferredSongName = extractTjaTitle(text);
          preferredCategory = extractTjaGenre(text);
          tjaContent = text;
        } else {
          data = JSON.parse(text);
        }

        data = normalizeSongJson(data);

        if (!isValidSongJson(data)) {
          errors.push(`${relativePath}: 缺少 courses 字段或格式不正确`);
          continue;
        }

        const { category, songName } = extractSongMeta(relativePath, file.name, preferredSongName, preferredCategory);
        const songHash = await hashText(`${relativePath}\n${text}`);
        songs.push({ category, songName, data, songHash, tjaContent });
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
          const chartId = await hashText(`${sourceSong?.songHash || song.songName}|${chart.difficulty}|${chart.branchType || 'unbranched'}`);
          rows.push({
            id: chartId,
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

    // Reset search after importing new charts so results start from a full list.
    setSearchInput('');
    setSearchKeyword('');
    if (location.search) {
      const params = new URLSearchParams(location.search);
      if (params.has('q')) {
        params.delete('q');
        const search = params.toString();
        navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
      }
    }

    setAllSongsData(importedSongs);
    await runCalculation(importedSongs, sourceLabel);
  }

  function exportResults() {
    if (allResults.length === 0) {
      showErrorModal('没有计算结果可导出。', '导出失败');
      return;
    }

    const rows = ['分类,歌曲,难度,星级,分支,Note数,体力,复合,复合难占比,节奏,节奏难占比,手速,爆发'];

    for (let songIndex = 0; songIndex < allResults.length; songIndex += 1) {
      const song = allResults[songIndex];
      const sourceSong = allSongsData[songIndex];
      for (const chart of song.charts) {
        const difficultyLabel = DIFFICULTY_LABELS[chart.difficulty] || chart.difficulty;
        const branchLabel = BRANCH_LABELS[chart.branchType] || '';
        const level = getChartLevel(sourceSong?.data, chart.difficulty);

        rows.push(
          `"${song.category}","${song.songName}","${difficultyLabel}","${level || ''}","${branchLabel}",${chart.ratings.totalNotes || 0},${chart.ratings.stamina},${chart.ratings.complex},${chart.ratings.complexRatio},${chart.ratings.rhythm},${chart.ratings.rhythmRatio},${chart.ratings.speed},${chart.ratings.burst}`
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

  const navPathMap = useMemo(() => ({
    constants: '/constants',
    analysis: '/',
    about: '/about',
    singlePrice: '/single-price',
    targetScore: '/target-score'
  }), []);

  const handleNavSelect = useCallback((_, data) => {
    const path = navPathMap[data.value];
    if (path) {
      navigate(path);
    }
    setMenuOpen(false);
  }, [navigate, navPathMap]);

  const selectedNavValue = useMemo(() => {
    if (isAboutRoute) return 'about';
    if (isTargetScoreRoute) return 'targetScore';
    if (isSinglePriceRoute) return 'singlePrice';
    if (isConstantsRoute || isConstantsDetailRoute) return 'constants';
    return 'analysis';
  }, [isAboutRoute, isTargetScoreRoute, isSinglePriceRoute, isConstantsRoute, isConstantsDetailRoute]);

  const openConstantsDetail = useCallback((detail) => {
    if (!detail?.id) return;
    navigate({
      pathname: `/constants/${encodeURIComponent(detail.id)}`,
      search: location.search
    }, {
      state: { constantDetail: detail }
    });
  }, [navigate, location.search]);

  return (
    <FluentProvider theme={taikoKaTheme}>
      <div className="app-shell">
        <header className={`top-bar${hideTopBarTitle ? ' top-bar-compact' : ''}`} ref={headerRef}>
          <div className="top-bar-primary">
            <div className="top-bar-left">
              <Hamburger
                className="topbar-hamburger"
                aria-label="打开操作抽屉"
                onClick={() => setMenuOpen((prev) => !prev)}
              />
              {!hideTopBarTitle ? <Title3 className="top-bar-title">Donder Assistant</Title3> : null}
            </div>
            {(isRootRoute || isConstantsRoute) ? (
              <div className="actions-row">
                <Input
                  key={isConstantsRoute ? `constants-${routeSearchKeyword}` : 'analysis-search'}
                  className="search-input"
                  contentBefore={<SearchRegular />}
                  contentAfter={isConstantsRoute ? undefined : (
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
                                  size="medium"
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
                  placeholder={isConstantsRoute ? '搜索定数表...' : '搜索歌曲...'}
                  value={isConstantsRoute ? undefined : searchInput}
                  defaultValue={isConstantsRoute ? routeSearchKeyword : undefined}
                  onChange={(_, data) => {
                    if (!isConstantsRoute) {
                      setSearchInput(data.value);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitSearch(event.currentTarget.value);
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
        </header>

        <NavDrawer
          open={menuOpen}
          type="overlay"
          position="start"
          onOpenChange={(_, data) => setMenuOpen(data.open)}
        >
          <NavDrawerHeader
            className="app-nav-drawer-header"
          >
            <Hamburger
              aria-label="收起操作抽屉"
              onClick={() => setMenuOpen(false)}
            />
          </NavDrawerHeader>
          <NavDrawerBody
          >
            <Nav
              onNavItemSelect={handleNavSelect}
              selectedValue={selectedNavValue}
            >
              <NavSectionHeader>数据分析</NavSectionHeader>
              <NavItem value="constants" icon={<DataHistogramRegular />}>定数表</NavItem>
              <NavItem value="analysis" icon={<DataHistogramRegular />}>谱面分析</NavItem>

              <NavDivider />
              <NavSectionHeader>出勤工具</NavSectionHeader>
              <NavItem value="singlePrice" icon={<MoneyCalculatorRegular />}>单曲价格速算</NavItem>
              <NavItem value="targetScore" icon={<CalculatorRegular />}>目标成绩速算</NavItem>

              <NavDivider />
              <NavItem value="about" icon={<InfoRegular />}>关于</NavItem>
            </Nav>
          </NavDrawerBody>
        </NavDrawer>

        <main className="content-area">
          <div
            className={`results-panel${dragOver ? ' drag-over' : ''}${isRootRoute ? '' : ' route-panel-hidden'}`}
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
            aria-hidden={!isRootRoute}
          >
            <header className="list-caption" aria-label="谱面列表说明与操作">
              <Breadcrumb className="list-breadcrumb" aria-label="面包屑">
                <BreadcrumbItem>
                  <BreadcrumbButton>数据分析</BreadcrumbButton>
                </BreadcrumbItem>
                <BreadcrumbDivider />
                <BreadcrumbItem>
                  <BreadcrumbButton current aria-current="page">谱面分析</BreadcrumbButton>
                </BreadcrumbItem>
              </Breadcrumb>
              <Toolbar className="list-toolbar" aria-label="谱面列表工具栏">
                <ToolbarButton
                  className="list-toolbar-button"
                  appearance="subtle"
                  size="small"
                  icon={<StarRegular />}
                  disabled={!hasFavoriteCache}
                  onClick={() => void restoreFavoriteSongsFromCache('手动加载收藏夹', true)}
                >
                  加载收藏
                </ToolbarButton>
                <ToolbarButton className="list-toolbar-button" appearance="subtle" size="small" icon={<ArrowUploadRegular />} onClick={() => fileInputRef.current?.click()}>
                  上传谱面
                </ToolbarButton>
                <ToolbarButton className="list-toolbar-button" appearance="subtle" size="small" disabled={!allResults.length} icon={<ArrowDownloadRegular />} onClick={exportResults}>
                  导出定数
                </ToolbarButton>
              </Toolbar>
            </header>
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
                  items={paginationInfo.paginatedRows}
                  columns={gridColumns}
                  columnSizingOptions={columnSizingOptions}
                  getRowId={(item) => item.id}
                  focusMode="composite"
                >
                  <DataGridHeader>
                    <DataGridRow>
                      {({ renderHeaderCell, columnId }) => (
                        <DataGridHeaderCell
                          onClick={() => onSort(columnId)}
                          className={`${SORTABLE_COLS[columnId] ? 'sortable' : ''} ${columnId === 'songName' ? 'sticky-first-col-header' : ''}`.trim()}
                          style={columnId === 'songName'
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
                            {SORTABLE_COLS[columnId] ? <span className="sort-indicator">{sortIndicator(columnId)}</span> : null}
                          </span>
                        </DataGridHeaderCell>
                      )}
                    </DataGridRow>
                  </DataGridHeader>
                  <DataGridBody>
                    {({ item, rowId }) => (
                      <DataGridRow key={rowId} className="result-row" onClick={() => openChartDetailPage(item)}>
                        {({ renderCell, columnId }) => (
                          <DataGridCell
                            className={columnId === 'songName' ? 'sticky-first-col-cell' : ''}
                            style={columnId === 'songName'
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
                        )}
                      </DataGridRow>
                    )}
                  </DataGridBody>
                </DataGrid>
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
              </div>
            )}
          </div>

          {isAboutRoute ? <AboutPage footerInfo={footerInfo} isOffline={isOffline} onBack={() => navigate('/')} /> : null}
          <div className={`constants-route-panel${isConstantsRoute ? '' : ' route-panel-hidden'}`} aria-hidden={!isConstantsRoute}>
            <ConstantsTablePage
              searchKeyword={searchKeyword}
              onCountChange={setConstantsVisibleCount}
              onOpenDetail={openConstantsDetail}
              isActive={isConstantsRoute}
            />
          </div>
          {isConstantsDetailRoute ? (
            <ConstantsDetailPage
              detail={routeConstantsDetail}
              onBack={() => navigate({ pathname: '/constants', search: location.search })}
            />
          ) : null}
          {isSinglePriceRoute ? <SingleSongPricePage onBack={() => navigate('/')} /> : null}
          {isTargetScoreRoute ? <TargetScorePage onBack={() => navigate('/')} /> : null}
          {isChartRoute ? (
            <ChartDetailPage
              detail={selectedChartDetail}
              chartId={routeChartId}
              onBack={closeChartDetailPage}
              isFavorite={selectedChartIsFavorite}
              onToggleFavorite={selectedChartRow ? () => toggleFavoriteChart(selectedChartRow) : undefined}
            />
          ) : null}
        </main>

        {(isRootRoute || isConstantsRoute) ? (
          <footer className="app-footer" ref={footerRef}>
            <div className="status-strip">
              {isRootRoute ? (
                <div className="list-info-bar" role="status" aria-label="谱面列表统计信息">
                  <Body1 className="list-stat">
                    <span className="list-stat-label">歌曲：</span>
                    <span className="list-stat-value">{totalSongs}</span>
                  </Body1>
                  <Body1 className="list-stat">
                    <span className="list-stat-label">谱面：</span>
                    <span className="list-stat-value">{paginationInfo.totalRows}</span>
                    {paginationInfo.totalRows < totalCharts ? (
                      <span style={{ fontSize: '12px', color: '#767676', marginLeft: '8px' }}>
                        (过滤后 / 全部 {totalCharts})
                      </span>
                    ) : null}
                  </Body1>
                </div>
              ) : null}
              {isConstantsRoute ? (
                <div className="list-info-bar" role="status" aria-label="定数表统计信息">
                  <Body1 className="list-stat">
                    <span className="list-stat-label">条目：</span>
                    <span className="list-stat-value">{constantsVisibleCount}</span>
                  </Body1>
                </div>
              ) : null}
            </div>
          </footer>
        ) : null}

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

createRoot(document.getElementById('root')).render(
  <BrowserRouter basename={ROUTER_BASENAME}>
    <App />
  </BrowserRouter>
);
