// Unregister all service workers and clear caches
(function() {
  'use strict';

  // Only run in browser environment
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // Unregister all service workers
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.unregister().then(function(success) {
        if (success) {
          console.log('[SW Cleanup] Service worker unregistered successfully');
        }
      });
    }
  }).catch(function(err) {
    console.error('[SW Cleanup] Error unregistering service workers:', err);
  });

  // Clear all caches
  if ('caches' in window) {
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          console.log('[SW Cleanup] Deleting cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(function() {
      console.log('[SW Cleanup] All caches cleared');
    }).catch(function(err) {
      console.error('[SW Cleanup] Error clearing caches:', err);
    });
  }

  // Prevent any new service worker registrations
  if (navigator.serviceWorker && navigator.serviceWorker.register) {
    const originalRegister = navigator.serviceWorker.register;
    navigator.serviceWorker.register = function() {
      console.warn('[SW Cleanup] Service worker registration blocked');
      return Promise.reject(new Error('Service worker registration is disabled'));
    };
  }
})();