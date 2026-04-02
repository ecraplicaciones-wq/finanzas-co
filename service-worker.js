/**
 * FinanzasCO — Service Worker v4.1
 * Estrategia: Cache-first para app shell + Stale-while-revalidate para fuentes
 * Esteban, 2026
 */

const APP_CACHE   = 'finanzasco-app-v4.1';
const FONTS_CACHE = 'finanzasco-fonts-v1';

// Archivos del app shell — se cachean en la instalación
const APP_SHELL = [
  '/',
  '/index.html',
];

// ─────────────────────────────────────────────
// INSTALL — cachea el app shell
// ─────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando FinanzasCO v4.1...');
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => {
        console.log('[SW] App shell cacheado correctamente');
        return self.skipWaiting(); // activa inmediatamente sin esperar recarga
      })
      .catch(err => console.error('[SW] Error cacheando shell:', err))
  );
});

// ─────────────────────────────────────────────
// ACTIVATE — limpia caches de versiones anteriores
// ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const validCaches = [APP_CACHE, FONTS_CACHE];
      return Promise.all(
        cacheNames
          .filter(name => !validCaches.includes(name))
          .map(name => {
            console.log('[SW] Eliminando cache antiguo:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activado — tomando control de clientes');
      return self.clients.claim(); // toma control sin recargar
    })
  );
});

// ─────────────────────────────────────────────
// FETCH — estrategia por tipo de recurso
// ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo interceptar GET
  if (request.method !== 'GET') return;

  // ── Google Fonts: stale-while-revalidate ──
  // Sirve desde caché inmediatamente, actualiza en background
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(staleWhileRevalidate(request, FONTS_CACHE));
    return;
  }

  // ── App shell: cache-first ──
  // Sirve desde caché. Si no está, va a la red y cachea el resultado.
  // Si la red falla, muestra la app desde caché (funciona offline).
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithFallback(request));
    return;
  }

  // ── Resto (CDN externos): network-first ──
  event.respondWith(networkFirst(request));
});

// ─────────────────────────────────────────────
// ESTRATEGIAS DE CACHÉ
// ─────────────────────────────────────────────

/**
 * Cache-first: sirve caché si existe, si no va a la red.
 * Si la red falla, sirve la raíz '/' como fallback.
 */
async function cacheFirstWithFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(APP_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Sin conexión — sirve el HTML principal como fallback
    const fallback = await caches.match('/') || await caches.match('/index.html');
    if (fallback) return fallback;
    return new Response(
      '<h1 style="font-family:sans-serif;padding:20px">FinanzasCO sin conexión<br><small>Recarga cuando tengas internet</small></h1>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

/**
 * Stale-while-revalidate: sirve caché, actualiza en background.
 * Ideal para fuentes y recursos que cambian poco.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Siempre intenta actualizar en background
  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || fetchPromise;
}

/**
 * Network-first: intenta la red, cae en caché si falla.
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(APP_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

// ─────────────────────────────────────────────
// NOTIFICACIONES PUSH (base preparada)
// ─────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'FinanzasCO', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      vibrate: [100, 50, 100],
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});

console.log('[SW] FinanzasCO Service Worker cargado');
