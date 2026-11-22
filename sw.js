const CACHE_NAME = 'laundry-dish-quest-v2.2';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

function isHtmlRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  if (accept.includes('text/html')) return true;
  try {
    const url = new URL(request.url);
    return url.pathname.endsWith('/') || url.pathname.endsWith('.html');
  } catch (e) {
    return false;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (isHtmlRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});

function notificationTag(id) {
  return 'load-end-' + id;
}

async function cancelLoadNotification(id) {
  const tag = notificationTag(id);
  const lists = [];
  try {
    lists.push(await self.registration.getNotifications({ tag: tag }));
  } catch (e) {}
  try {
    lists.push(await self.registration.getNotifications({ tag: tag, includeTriggered: true }));
  } catch (e) {}
  lists.forEach((list) => {
    list.forEach((n) => n.close());
  });
}

async function scheduleLoadNotification(data) {
  if (!data || !data.id) return;
  await cancelLoadNotification(data.id);
  const when = typeof data.when === 'number' ? data.when : 0;
  const opts = {
    body: data.body || ((data.title || 'A load') + ' should be done now.'),
    tag: notificationTag(data.id),
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { id: data.id, url: './' },
    renotify: true,
    vibrate: [200, 80, 200]
  };
  if (when > Date.now() + 500) {
    if (typeof TimestampTrigger === 'function') {
      opts.showTrigger = new TimestampTrigger(when);
    } else {
      // This browser cannot schedule a notification for later while the app is closed.
      return;
    }
  }
  await self.registration.showNotification('Load finished', opts);
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'schedule-load-end') {
    event.waitUntil(scheduleLoadNotification(data));
  } else if (data.type === 'cancel-load-end') {
    event.waitUntil(cancelLoadNotification(data.id));
  } else if (data.type === 'notify-now') {
    event.waitUntil(scheduleLoadNotification(Object.assign({}, data, { when: Date.now() })));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  const id = event.notification.data && event.notification.data.id;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          client.postMessage({ type: 'notification-clicked', id: id });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
