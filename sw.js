self.addEventListener('push', (event) => {
  // الإشعار تمويهي قصداً — ما بيكشف محتوى ولا أسماء
  event.waitUntil(
    self.registration.showNotification('سَما 🌙', {
      body: 'في شي جديد بالسما، تعال شوف ✨',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      vibrate: [100, 50, 100],
      tag: 'sama-new',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
