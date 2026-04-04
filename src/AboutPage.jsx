import React, { useState } from 'react';
import {
  Body1,
  Button,
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbItem,
  Divider,
  Link
} from '@fluentui/react-components';

function normalizeComparableUrl(urlLike) {
  if (!urlLike) return '';
  try {
    const url = new URL(urlLike, window.location.href);
    return `${url.origin}${url.pathname}${url.search}`;
  } catch (_) {
    return String(urlLike);
  }
}

function getCurrentEntryScriptUrl() {
  const moduleScripts = Array.from(document.querySelectorAll('script[type="module"][src]'));
  if (!moduleScripts.length) return '';
  return moduleScripts[moduleScripts.length - 1]?.src || '';
}

async function getServerEntryScriptUrl(scope) {
  const indexUrl = new URL(`index.html?__update_check=${Date.now()}`, scope).toString();
  const response = await fetch(indexUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`获取线上 index 失败（${response.status}）`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const moduleScripts = Array.from(doc.querySelectorAll('script[type="module"][src]'));
  if (!moduleScripts.length) return '';
  const lastScriptSrc = moduleScripts[moduleScripts.length - 1]?.getAttribute('src') || '';
  if (!lastScriptSrc) return '';
  return new URL(lastScriptSrc, scope).toString();
}

async function forceRefreshFromServer(registration) {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  await registration.unregister();
  const url = new URL(window.location.href);
  url.searchParams.set('__force_refresh', String(Date.now()));
  window.location.replace(url.toString());
}

function AboutPage({ footerInfo, isOffline, onBack }) {
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateHint, setUpdateHint] = useState('');

  async function checkForUpdate() {
    if (!('serviceWorker' in navigator)) {
      setUpdateHint('当前浏览器不支持 Service Worker，无法检查更新。');
      return;
    }

    if (!window.isSecureContext) {
      setUpdateHint('当前页面不是安全上下文（HTTPS），无法检查更新。');
      return;
    }

    setIsCheckingUpdate(true);
    setUpdateHint('正在检查更新...');

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        setUpdateHint('未检测到已注册的离线缓存，请先刷新页面后再试。');
        return;
      }

      if (registration.waiting) {
        const shouldActivate = window.confirm('发现新版本，是否立即更新？');
        if (shouldActivate) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          setUpdateHint('正在切换到新版本...');
        } else {
          setUpdateHint('已检测到新版本，稍后可再次点击检查更新。');
        }
        return;
      }

      await registration.update();
      await new Promise((resolve) => setTimeout(resolve, 800));

      const latestRegistration = await navigator.serviceWorker.getRegistration();
      if (latestRegistration?.waiting) {
        const shouldActivate = window.confirm('发现新版本，是否立即更新？');
        if (shouldActivate) {
          latestRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
          setUpdateHint('正在切换到新版本...');
        } else {
          setUpdateHint('已检测到新版本，稍后可再次点击检查更新。');
        }
      } else {
        const currentEntryUrl = getCurrentEntryScriptUrl();
        const serverEntryUrl = await getServerEntryScriptUrl(latestRegistration?.scope || registration.scope || window.location.origin);

        if (currentEntryUrl && serverEntryUrl
          && normalizeComparableUrl(currentEntryUrl) !== normalizeComparableUrl(serverEntryUrl)) {
          const shouldForceRefresh = window.confirm('检测到静态资源已更新，是否立即强制刷新并更新离线缓存？');
          if (shouldForceRefresh) {
            setUpdateHint('检测到资源变化，正在强制刷新并更新缓存...');
            await forceRefreshFromServer(latestRegistration || registration);
            return;
          }
          setUpdateHint('已检测到静态资源变化，稍后可再次点击检查更新。');
        } else {
          setUpdateHint('当前已经是最新版本。');
        }
      }
    } catch (error) {
      setUpdateHint(`检查更新失败：${error?.message || String(error)}`);
    } finally {
      setIsCheckingUpdate(false);
    }
  }

  return (
    <div className="results-panel">
      <header className="list-caption" aria-label="关于页面导航">
        <Breadcrumb className="list-breadcrumb" aria-label="关于页面面包屑">
          <BreadcrumbItem>
            <BreadcrumbButton current aria-current="page">关于</BreadcrumbButton>
          </BreadcrumbItem>
        </Breadcrumb>
      </header>
      <div className="table-wrapper" style={{ padding: 16 }}>
        <section aria-label="这是个什么工具">
          <h3 style={{ margin: 0, fontSize: 16 }}>这是个什么工具</h3>
          <Body1 style={{ marginTop: 8 }}>
            Donder Assistant 是给太鼓爱好者做的免费小工具，主打一个开箱即用：打开网页就能做谱面分析、查定数、算出勤。
          </Body1>
        </section>

        <section aria-label="你可以用它做什么" style={{ marginTop: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>你可以用它做什么</h3>
          <Body1 style={{ marginTop: 8 }}>
            在“谱面分析”里，你可以直接上传或拖拽 .tja 文件/文件夹，自动算出体力、复合、节奏、手速、爆发等指标，也能搜索、按难度筛选、排序，还能导出 CSV。
          </Body1>
          <Body1 style={{ marginTop: 8 }}>
            点开任意谱面还能看详情：音符间隔统计、分段明细、谱面预览都在里面。预览支持全屏、缩放、拖动，也可以保存图片。
          </Body1>
        </section>

        <section aria-label="查表和日常速算" style={{ marginTop: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>查表和日常速算</h3>
          <Body1 style={{ marginTop: 8 }}>
            “定数表”可以快速检索内置数据，点进详情还能看五维雷达图，方便横向对比。
          </Body1>
          <Body1 style={{ marginTop: 8 }}>
            “出勤工具”里有单曲价格速算和目标成绩速算，日常算账、算目标时会省很多事。
          </Body1>
        </section>

        <section aria-label="一点小贴士" style={{ marginTop: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>一点小贴士</h3>
          <Body1 style={{ marginTop: 8 }}>
            收藏和部分数据会缓存在本地（localStorage / IndexedDB）。就算临时断网，也能继续看已加载内容；网络恢复后状态会自动更新。
          </Body1>
        </section>

        <Divider style={{ marginTop: 14 }} />

        <div className="about-meta" style={{ marginTop: 12 }}>
          <div className="about-meta-line">部署时间: {footerInfo.timeStr}</div>
          <div className="about-meta-line">
            版本:
            {' '}
            <Link href={`https://github.com/Dafrok/donder-assistant/commit/${footerInfo.hash}`} target="_blank" rel="noreferrer">
              {footerInfo.hash}
            </Link>
          </div>
          <div className="about-meta-line">
            网络状态:
            {' '}
            <span className={`network-status ${isOffline ? 'is-offline' : 'is-online'}`}>
              {isOffline ? '网络不可达' : '网络可达'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <Button appearance="primary" onClick={checkForUpdate} disabled={isCheckingUpdate}>
            {isCheckingUpdate ? '检查中...' : '检查更新'}
          </Button>
          <Body1>{updateHint || '可手动检查当前 PWA 是否有新版本。'}</Body1>
        </div>
      </div>
    </div>
  );
}

export default AboutPage;
