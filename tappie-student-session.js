/* tappie-student-session.js
   Tappie Student Active Session v1
   Purpose:
   - Keep the currently active student UID out of ordinary dashboard/lobby/battle/arena URLs.
   - Do not modify Admin authorization keys.
   - Use sessionStorage so the active student state is short-lived per browser/PWA session.
*/
(function () {
  "use strict";

  const KEY = "tappie_student_active_session_v1";
  const DEFAULT_TTL_MS = 3 * 60 * 1000;
  const SENSITIVE_PARAMS = ["id", "uid", "cardId", "cardid", "cardUid", "card_uid"];
  let lastTouchAt = 0;

  function now() {
    return Date.now();
  }

  function normalizeUid(uid) {
    return String(uid || "").trim();
  }

  function resolveTtl(options) {
    const ttlMs = Number(options && options.ttlMs);
    return Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_TTL_MS;
  }

  function safeParse(raw) {
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") return null;
      if (!normalizeUid(data.uid)) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function readStored() {
    try {
      return safeParse(sessionStorage.getItem(KEY));
    } catch (_) {
      return null;
    }
  }

  function writeStored(data) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (_) {
      return false;
    }
  }

  function isExpired(data) {
    const expiresAt = Number(data && data.expiresAt);
    return !Number.isFinite(expiresAt) || expiresAt <= now();
  }

  function getUrlUid() {
    const params = new URLSearchParams(window.location.search);
    return normalizeUid(params.get("id") || params.get("uid") || "");
  }

  function resolveRedirectTo(redirectTo) {
    if (typeof redirectTo === "function") {
      try { return redirectTo(); } catch (_) { return "index.html"; }
    }
    return redirectTo || "index.html";
  }

  function setActive(uid, source, options) {
    const cleanUid = normalizeUid(uid);
    if (!cleanUid) return null;

    const t = now();
    const ttlMs = resolveTtl(options || {});
    const data = {
      uid: cleanUid,
      source: source || "unknown",
      createdAt: t,
      lastSeenAt: t,
      expiresAt: t + ttlMs
    };

    writeStored(data);
    return data;
  }

  function getActive(options) {
    const opts = options || {};
    const data = readStored();
    if (!data) return null;

    if (isExpired(data)) {
      clearActive("expired");
      return null;
    }

    if (opts.touch !== false) {
      return touch(opts) || data;
    }

    return data;
  }

  function getActiveUid(options) {
    const data = getActive(options || {});
    return data ? data.uid : "";
  }

  function touch(options) {
    const opts = options || {};
    const data = readStored();
    if (!data || isExpired(data)) {
      if (data) clearActive("expired");
      return null;
    }

    const t = now();
    const ttlMs = resolveTtl(opts);
    data.lastSeenAt = t;
    data.expiresAt = t + ttlMs;
    writeStored(data);
    return data;
  }

  function clearActive(reason) {
    try {
      sessionStorage.removeItem(KEY);
      if (reason) sessionStorage.setItem("tappie_student_active_cleared_reason", String(reason));
    } catch (_) {}
  }

  function cleanStudentUrl(options) {
    const opts = options || {};
    if (!window.history || !window.history.replaceState) return;

    const url = new URL(window.location.href);
    let changed = false;

    SENSITIVE_PARAMS.forEach((key) => {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    });

    if (Array.isArray(opts.preserveParams)) {
      const allow = new Set(opts.preserveParams);
      Array.from(url.searchParams.keys()).forEach((key) => {
        if (!allow.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      });
    }

    if (!changed && opts.force !== true) return;

    const nextUrl = url.pathname + (url.search ? url.search : "") + (url.hash || "");
    window.history.replaceState(null, document.title, nextUrl);
  }

  function getUidFromUrlOrSession(options) {
    const opts = options || {};
    const urlUid = getUrlUid();

    if (urlUid) {
      setActive(urlUid, opts.source || "url");
      if (opts.cleanUrl !== false) cleanStudentUrl(opts);
      return urlUid;
    }

    const activeUid = getActiveUid({ touch: opts.touch !== false });
    if (activeUid) return activeUid;

    if (opts.redirectTo) {
      window.location.replace(resolveRedirectTo(opts.redirectTo));
    }

    return "";
  }

  function requireActive(options) {
    const opts = options || {};
    const uid = getUidFromUrlOrSession(opts);
    if (uid) return uid;

    const target = resolveRedirectTo(opts.redirectTo || "index.html");
    window.location.replace(target);
    return "";
  }

  function startAutoTouch() {
    if (startAutoTouch.started) return;
    startAutoTouch.started = true;

    const handler = function () {
      const t = now();
      if (t - lastTouchAt < 1500) return;
      lastTouchAt = t;
      touch({ ttlMs: DEFAULT_TTL_MS });
    };

    ["click", "touchstart", "keydown", "mousedown"].forEach((eventName) => {
      document.addEventListener(eventName, handler, { passive: true });
    });
  }

  window.TappieStudentSession = {
    KEY,
    DEFAULT_TTL_MS,
    setActive,
    getActive,
    getActiveUid,
    requireActive,
    clearActive,
    touch,
    getUidFromUrlOrSession,
    cleanStudentUrl,
    startAutoTouch
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAutoTouch);
  } else {
    startAutoTouch();
  }
})();
