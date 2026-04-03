/*
  Combined COI + PWA service worker bootstrap.
  - Worker context: COOP/COEP response headers + offline caching
  - Window context: SW registration + update prompt
*/

(() => {
  const SW_VERSION = '2026-04-04-1';
  const APP_SHELL_CACHE = `app-shell-${SW_VERSION}`;
  const RUNTIME_CACHE = `runtime-${SW_VERSION}`;
  const PRECACHE_PATHS = ['./', './index.html', './offline.html', './manifest.webmanifest', './favicon.ico'];

  function resolveScopeUrl(path) {
    return new URL(path, self.registration.scope).toString();
  }

  function applyCrossOriginHeaders(response, coepCredentialless) {
    if (!response || response.status === 0) return response;

    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', coepCredentialless ? 'credentialless' : 'require-corp');

    if (!coepCredentialless) {
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  // Worker-side implementation.
  if (typeof window === 'undefined') {
    let coepCredentialless = false;

    self.addEventListener('install', (event) => {
      event.waitUntil(
        (async () => {
          const cache = await caches.open(APP_SHELL_CACHE);
          const urls = PRECACHE_PATHS.map((path) => resolveScopeUrl(path));
          await cache.addAll(urls);
        })()
      );
    });

    self.addEventListener('activate', (event) => {
      event.waitUntil(
        (async () => {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((key) => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
              .map((key) => caches.delete(key))
          );
          await self.clients.claim();
        })()
      );
    });

    self.addEventListener('message', (event) => {
      const message = event.data || {};

      if (message.type === 'SKIP_WAITING') {
        self.skipWaiting();
      }

      if (message.type === 'COEP_CREDENTIALLESS') {
        coepCredentialless = !!message.value;
      }
    });

    self.addEventListener('fetch', (event) => {
      const request = event.request;

      if (request.method !== 'GET') return;
      if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

      const requestUrl = new URL(request.url);
      const isSameOrigin = requestUrl.origin === self.location.origin;
      const isNavigation = request.mode === 'navigate';
      const isPyResource = isSameOrigin && /\.py$/.test(requestUrl.pathname);
      const isStaticAsset =
        isSameOrigin &&
        (/\/assets\//.test(requestUrl.pathname) ||
          /\.(?:js|css|ico|png|jpg|jpeg|webp|svg|webmanifest|json|py)$/.test(requestUrl.pathname));

      const proxiedRequest =
        coepCredentialless && request.mode === 'no-cors'
          ? new Request(request, { credentials: 'omit' })
          : request;

      event.respondWith(
        (async () => {
          // Navigation: network first, fallback to cached app shell.
          if (isNavigation) {
            try {
              const networkResponse = await fetch(proxiedRequest);
              const wrapped = applyCrossOriginHeaders(networkResponse, coepCredentialless);
              const cache = await caches.open(APP_SHELL_CACHE);
              cache.put(resolveScopeUrl('./index.html'), wrapped.clone());
              return wrapped;
            } catch (_) {
              const cache = await caches.open(APP_SHELL_CACHE);
              const fallback = await cache.match(resolveScopeUrl('./index.html'));
              if (fallback) return fallback;
              const offlineFallback = await cache.match(resolveScopeUrl('./offline.html'));
              if (offlineFallback) return offlineFallback;
              throw _;
            }
          }

          // Python assets: network first, then runtime cache fallback.
          if (isPyResource) {
            const runtime = await caches.open(RUNTIME_CACHE);

            try {
              const networkResponse = await fetch(proxiedRequest);
              const wrapped = applyCrossOriginHeaders(networkResponse, coepCredentialless);
              runtime.put(request, wrapped.clone());
              return wrapped;
            } catch (_) {
              const cached = await runtime.match(request);
              if (cached) return cached;
              throw _;
            }
          }

          // Static resources: cache first.
          if (isStaticAsset) {
            const runtime = await caches.open(RUNTIME_CACHE);
            const cached = await runtime.match(request);
            if (cached) return cached;

            const networkResponse = await fetch(proxiedRequest);
            const wrapped = applyCrossOriginHeaders(networkResponse, coepCredentialless);
            runtime.put(request, wrapped.clone());
            return wrapped;
          }

          // Others: network first with runtime fallback.
          try {
            const networkResponse = await fetch(proxiedRequest);
            return applyCrossOriginHeaders(networkResponse, coepCredentialless);
          } catch (_) {
            const runtime = await caches.open(RUNTIME_CACHE);
            const cached = await runtime.match(request);
            if (cached) return cached;
            throw _;
          }
        })()
      );
    });

    return;
  }

  // Window-side bootstrap.
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;

  const currentScript = document.currentScript;
  if (!currentScript || !currentScript.src) return;

  let hasControllerRefresh = false;

  navigator.serviceWorker
    .register(currentScript.src)
    .then((registration) => {
      const promptForUpdate = (worker) => {
        if (!worker) return;

        const shouldUpdate = window.confirm('检测到新版本，是否立即更新？');
        if (shouldUpdate) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      };

      if (registration.waiting) {
        promptForUpdate(registration.waiting);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            promptForUpdate(newWorker);
          }
        });
      });

      if (registration.active && !navigator.serviceWorker.controller) {
        window.location.reload();
      }
    })
    .catch((error) => {
      console.error('Service Worker 注册失败:', error);
    });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasControllerRefresh) return;
    hasControllerRefresh = true;
    window.location.reload();
  });
})();
