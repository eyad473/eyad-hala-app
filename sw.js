self.addEventListener('push', (event) => {
  let data = { title: 'إياد ✶ حلا', body: 'رسالة جديدة' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'إياد ✶ حلا', {
      body: data.body || 'رسالة جديدة',
      icon: 'https://cdn-icons-png.flaticon.com/512/833/833472.png',
      badge: 'https://cdn-icons-png.flaticon.com/512/833/833472.png',
      dir: 'rtl',
      lang: 'ar',
      vibrate: [100, 50, 100],
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
