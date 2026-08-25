(() => {
  'use strict';
  const KEY = '__YTSS_DOWNLOAD_READY_GATE_V1055__';
  if (globalThis[KEY]) return;
  globalThis[KEY] = true;

  const EVENT = 'ytss-download-studio-info-ready';
  const add = document.addEventListener.bind(document);
  const remove = document.removeEventListener.bind(document);
  const wrappers = new WeakMap();

  document.addEventListener = function(type, listener, options) {
    if (type !== EVENT || !listener) return add(type, listener, options);
    let wrapped = wrappers.get(listener);
    if (!wrapped) {
      wrapped = function(event) {
        // MAIN-world resolver mutates the ephemeral DOM payload during the same
        // ready event. Defer isolated consumers one macrotask so they always see
        // the final enriched payload regardless of cross-world listener ordering.
        setTimeout(() => {
          try {
            if (typeof listener === 'function') listener.call(document, event);
            else listener.handleEvent?.call(listener, event);
          } catch (error) {
            console.error('[YTSS ready gate]', error);
          }
        }, 0);
      };
      wrappers.set(listener, wrapped);
    }
    return add(type, wrapped, options);
  };

  document.removeEventListener = function(type, listener, options) {
    if (type === EVENT && listener && wrappers.has(listener)) {
      return remove(type, wrappers.get(listener), options);
    }
    return remove(type, listener, options);
  };
})();
