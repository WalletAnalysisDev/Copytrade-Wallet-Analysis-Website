/* Copytrade Wallet Score. Copyright (c) 2026 Copytrade Wallet Score. All rights reserved. See LICENSE. */
/* Web app shim: lets the extension's side-panel code run on a normal web page.
   chrome.storage.local is backed by this site's localStorage (prefix "cs:"), so everything stays in the visitor's browser.
   Browser-only extension features (reading the open tab, GMGN page labels, side panel, extension updates) are simply absent. */
(function(){
  if (window.chrome && window.chrome.runtime && window.chrome.runtime.id) return; // running inside the real extension
  const P = 'cs:', skip = k => String(k).startsWith('gm:'); // GMGN page labels need the extension: don't store their data
  const all = () => { const o = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(P)) { try { o[k.slice(P.length)] = JSON.parse(localStorage.getItem(k)); } catch (e) {} } } } catch (e) {} return o; };
  const listeners = [];
  const fire = ch => { if (Object.keys(ch).length) for (const f of listeners) { try { f(ch, 'local'); } catch (e) {} } };
  const done = (cb, v) => { if (typeof cb === 'function') setTimeout(() => cb(v), 0); return Promise.resolve(v); };
  const local = {
    get(keys, cb) {
      const a = all(); let out = {};
      if (keys == null) out = a;
      else if (typeof keys === 'string') { if (keys in a) out[keys] = a[keys]; }
      else if (Array.isArray(keys)) { for (const k of keys) if (k in a) out[k] = a[k]; }
      else if (typeof keys === 'object') { for (const k in keys) out[k] = k in a ? a[k] : keys[k]; }
      return done(cb, out);
    },
    set(obj, cb) {
      const ch = {};
      for (const k in obj) { if (skip(k)) continue; let old; try { old = JSON.parse(localStorage.getItem(P + k)); } catch (e) {}
        try { localStorage.setItem(P + k, JSON.stringify(obj[k])); ch[k] = { oldValue: old, newValue: obj[k] }; } catch (e) {} }
      fire(ch); return done(cb);
    },
    remove(keys, cb) {
      const ch = {};
      for (const k of [].concat(keys)) { try { const v = localStorage.getItem(P + k); if (v != null) { localStorage.removeItem(P + k); ch[k] = { oldValue: JSON.parse(v) }; } } catch (e) {} }
      fire(ch); return done(cb);
    },
    clear(cb) { const ch = {}; for (const k of Object.keys(all())) ch[k] = {}; try { Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k)); } catch (e) {} fire(ch); return done(cb); }
  };
  window.chrome = {
    storage: { local, onChanged: { addListener: f => listeners.push(f), removeListener: f => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); } } },
    runtime: { id: '', getManifest: () => ({ version: window.WS_WEB_VERSION || 'web' }), getURL: p => p, reload: () => location.reload(), sendMessage: () => {}, onUpdateAvailable: { addListener() {} }, onMessage: { addListener() {} } }
  };
})();
