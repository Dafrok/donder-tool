/**
 * 计算引擎 - 使用 Pyodide 在浏览器中运行 Python
 * Pyodide 直接从 CDN 加载，Python 模块从 assets 载入
 */

// 导入 Python 模块 URL（Vite 会为这些文件添加 hash）
import py体力Url from './assets/py/体力.py?url'
import py复合Url from './assets/py/复合.py?url'
import py节奏Url from './assets/py/节奏.py?url'
import py爆发Url from './assets/py/爆发.py?url'
import pyCalculatorUrl from './assets/py/calculator.py?url'

let pyodideReady = false;
let pyodide = null;
let modulesReady = false;
let initPromise = null;
let modulesPromise = null;

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 初始化 Pyodide - 从 CDN 加载
 */
export async function initPyodide() {
  if (pyodideReady && pyodide) return pyodide;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('🐍 初始化 Pyodide...');

      await yieldToMain();
      const { loadPyodide } = await import('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs');

      await yieldToMain();
      pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/'
      });

      console.log('✅ Pyodide 初始化完成');
      pyodideReady = true;
      return pyodide;
    } catch (error) {
      console.error('❌ Pyodide 初始化失败:', error);
      throw new Error('无法加载 Python 环境: ' + error.message);
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * 加载 Python 计算模块
 */
export async function loadPythonModules() {
  if (modulesReady) return true;
  if (modulesPromise) return modulesPromise;

  if (!pyodide) {
    pyodide = await initPyodide();
  }

  modulesPromise = (async () => {
    try {
      console.log('📦 加载 Python 模块...');

      // 使用导入的 URL（带 hash）来 fetch Python 代码
      const moduleEntries = await Promise.all([
        fetch(py体力Url).then(r => r.text()).then(code => ['体力.py', code]),
        fetch(py复合Url).then(r => r.text()).then(code => ['复合.py', code]),
        fetch(py节奏Url).then(r => r.text()).then(code => ['节奏.py', code]),
        fetch(py爆发Url).then(r => r.text()).then(code => ['爆发.py', code]),
        fetch(pyCalculatorUrl).then(r => r.text()).then(code => ['calculator.py', code])
      ]);

      await yieldToMain();
      for (const [name, code] of moduleEntries) {
        pyodide.FS.writeFile(name, code);
      }

      await yieldToMain();
      await pyodide.runPythonAsync(`
import sys
sys.path.insert(0, '.')
from calculator import calculate_batch
    `);

      console.log('✅ Python 模块加载完成');
      modulesReady = true;
      return true;
    } catch (error) {
      console.error('❌ 加载 Python 模块失败:', error);
      throw new Error('无法加载 Python 模块: ' + error.message);
    } finally {
      modulesPromise = null;
    }
  })();

  return modulesPromise;
}

export async function warmupPython() {
  await initPyodide();
  await loadPythonModules();
}

/**
 * 加载歌曲数据
 */
export async function loadSongDatabase() {
  try {
    const indexResponse = await fetch('/assets/data/index.json');
    if (!indexResponse.ok) {
      throw new Error('无法加载数据索引');
    }
    const index = await indexResponse.json();
    return index;
  } catch (error) {
    console.error('❌ 加载数据失败:', error);
    throw error;
  }
}

/**
 * 加载某个分类的数据
 */
export async function loadCategoryData(category) {
  try {
    const response = await fetch(`/assets/data/${category}.json`);
    if (!response.ok) {
      throw new Error(`无法加载分类数据: ${category}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`❌ 加载分类 ${category} 失败:`, error);
    throw error;
  }
}

/**
 * 加载全量数据（用于搜索）
 */
export async function loadAllSongs() {
  try {
    const response = await fetch('/assets/data/all.json');
    if (!response.ok) {
      throw new Error('无法加载全量数据');
    }
    return await response.json();
  } catch (error) {
    console.error('❌ 加载全量数据失败:', error);
    throw error;
  }
}

/**
 * 计算难度定数（使用 Python）
 */
export async function calculateDifficulty(songsWithData, onProgress = null, onStatus = null) {
  try {
    if (onStatus) onStatus('初始化 Python 运行时...');
    pyodide = await initPyodide();

    if (onStatus) onStatus('加载 Python 模块...');
    await loadPythonModules();

    await yieldToMain();

    const CHUNK_SIZE = 20;
    const total = songsWithData.length;
    const allResults = [];

    for (let i = 0; i < total; i += CHUNK_SIZE) {
      const chunk = songsWithData.slice(i, i + CHUNK_SIZE);

      if (onStatus) onStatus(`正在计算... (${i}/${total})`);
      if (onProgress) onProgress(i, total);
      await yieldToMain();

      pyodide.globals.set('songs_chunk', chunk);
      const pyResult = await pyodide.runPythonAsync(`
songs = songs_chunk.to_py()
calculate_batch(songs)
      `);

      const chunkResult = pyResult.toJs({
        dict_converter: (entries) => Object.fromEntries(entries)
      });
      pyResult.destroy();
      pyodide.globals.delete('songs_chunk');

      allResults.push(...chunkResult);
    }

    if (onProgress) onProgress(total, total);
    if (onStatus) onStatus('计算完成');
    return allResults;
  } catch (error) {
    console.error('❌ Python 计算失败:', error);
    throw new Error('计算失败: ' + error.message);
  } finally {
    if (pyodide && pyodide.globals && pyodide.globals.has('songs_chunk')) {
      pyodide.globals.delete('songs_chunk');
    }
  }
}

export default {
  initPyodide,
  loadPythonModules,
  warmupPython,
  loadSongDatabase,
  loadCategoryData,
  loadAllSongs,
  calculateDifficulty
};
