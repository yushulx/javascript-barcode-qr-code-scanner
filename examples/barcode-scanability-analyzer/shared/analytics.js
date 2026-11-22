/*
 * Shared analytics for Dynamsoft Codepool online demos.
 *
 * Loaded by every page under /codepool/demos/. It initializes the GTM
 * dataLayer queue and exposes window.DemoAnalytics so each demo only has to
 * report domain events instead of duplicating push() calls.
 *
 * Requires the GTM container snippet (GTM-538F83) in the page <head>.
 */
(function () {
  'use strict';

  var SLUG = (function () {
    var parts = window.location.pathname.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || 'unknown';
  })();

  window.dataLayer = window.dataLayer || [];

  function track(eventName, params) {
    var payload = { event: eventName, demo_slug: SLUG };
    var extra = params || {};
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) {
        payload[key] = extra[key];
      }
    }
    window.dataLayer.push(payload);
  }

  window.DemoAnalytics = {
    slug: SLUG,

    track: track,

    /* SDK/wasm finished loading and the router instance is usable. */
    ready: function (loadMs) {
      track('demo_engine_ready', { load_ms: Math.round(loadMs) });
    },

    /* License activation or wasm load failed. The license is domain-bound,
       so a spike here means a deployment or network problem, not expiry. */
    error: function (code, message) {
      track('demo_license_error', {
        error_code: String(code),
        error_message: String(message == null ? '' : message).slice(0, 200)
      });
    },

    start: function (mode, inputSource) {
      track('demo_scan_start', { mode: mode, input_source: inputSource });
    },

    success: function (mode, inputSource, extra) {
      var payload = { mode: mode, input_source: inputSource };
      var more = extra || {};
      for (var key in more) {
        if (Object.prototype.hasOwnProperty.call(more, key)) {
          payload[key] = more[key];
        }
      }
      track('demo_scan_success', payload);
    },

    fail: function (mode, inputSource) {
      track('demo_scan_fail', { mode: mode, input_source: inputSource });
    },

    /* Generic UI engagement: edit, rectify, save, mode switch. */
    action: function (name, extra) {
      var payload = { action_name: name };
      var more = extra || {};
      for (var key in more) {
        if (Object.prototype.hasOwnProperty.call(more, key)) {
          payload[key] = more[key];
        }
      }
      track('demo_action', payload);
    },

    /* Conversion: any click that leaves for the trial license page. */
    trialClick: function (placement) {
      track('demo_trial_click', { placement: placement });
    }
  };

  /* Delegate clicks on any [data-demo-cta] element so every demo gets the
     trial conversion event without repeating the wiring in each page. */
  function bindCtaClicks() {
    document.addEventListener('click', function (event) {
      var target = event.target;
      var el = target && target.closest ? target.closest('[data-demo-cta]') : null;
      if (!el) {
        return;
      }
      var name = el.getAttribute('data-demo-cta');
      if (name === 'trial') {
        window.DemoAnalytics.trialClick(name);
      } else {
        window.DemoAnalytics.action('cta_click', {
          cta: name,
          href: el.getAttribute('href') || ''
        });
      }
    }, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindCtaClicks, false);
  } else {
    bindCtaClicks();
  }
})();
