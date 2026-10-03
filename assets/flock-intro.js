// Shopify DOM adapter for the flock intro overlay.
//
// flock-transition.js owns the animation and reports "I finished" by dispatching
// flocktransition:complete. This file owns only the overlay's DOM lifecycle:
// mark it ready, start the animation from a real button, and take the overlay
// down afterwards.
(function () {
  "use strict";

  var root = document.querySelector("[data-flock-intro]");
  if (!root) return;

  // If p5 never boots (asset blocked, script error) the charcoal shell must not
  // sit over the storefront forever.
  var BOOT_TIMEOUT_MS = 4000;

  var SCROLL_LOCK_CLASS = "flock-intro-lock";

  var done = false;
  var inerted = []; // only the elements this integration actually changed

  // The theme's own page: skip link, header/footer section groups, and <main>
  // (see layout/theme.liquid). Inerting those isolates it from keyboard and
  // pointer input without touching <body>, <html>, the intro's own trigger, or
  // UI that Shopify/apps inject into <body> (e.g. a consent banner), which must
  // stay operable.
  var PAGE_SELECTOR = "body > [data-skip-link], body > .shopify-section, body > main";

  function isolatePage() {
    var parts = document.querySelectorAll(PAGE_SELECTOR);
    for (var i = 0; i < parts.length; i++) {
      // Already inert for some other reason: leave it, and do not claim it.
      if (parts[i].inert) continue;
      parts[i].inert = true;
      inerted.push(parts[i]);
    }
  }

  // Stop p5 for good once the overlay is gone: its window listeners (keys,
  // pointer, resize) otherwise outlive the canvas. Deferred because dismiss()
  // can run inside the engine's own finishing frame, which still calls p5
  // globals after dispatching its completion event.
  function teardownEngine() {
    setTimeout(function () {
      var p5 = window.p5;
      if (p5 && p5.instance && typeof p5.instance.remove === "function") {
        p5.instance.remove();
      }
    }, 0);
  }

  // The single cleanup path for every dismissal route: completion, boot timeout,
  // and a missing engine. Safe to call more than once.
  function dismiss() {
    if (done) return;
    done = true;
    // Removing the focused trigger would drop focus to <body>; only then is
    // there a focus position to restore.
    var hadFocus = root.contains(document.activeElement);
    for (var i = 0; i < inerted.length; i++) inerted[i].inert = false;
    inerted.length = 0;
    document.documentElement.classList.remove(SCROLL_LOCK_CLASS);
    root.remove();
    if (hadFocus) {
      // The skip link's target: focusable via tabindex="-1", not in tab order.
      var main = document.getElementById("MainContent");
      if (main) main.focus({ preventScroll: true });
    }
    teardownEngine();
  }

  // p5 is up: drop the CSS charcoal fallback so canvas transparency can reveal
  // the real page, and stop the page behind from scrolling under the intro.
  function markReady() {
    root.classList.add("is-ready");
    document.documentElement.classList.add(SCROLL_LOCK_CLASS);
  }

  // Isolate straight away, not on p5 boot: the charcoal shell is already covering
  // the page, so the content behind it must not be tabbable in the meantime.
  isolatePage();

  window.addEventListener("flocktransition:complete", dismiss, { once: true });

  var trigger = root.querySelector("[data-flock-trigger]");
  if (trigger) {
    trigger.addEventListener("click", function () {
      if (typeof window.triggerAnimation === "function") {
        window.triggerAnimation();
      } else {
        dismiss(); // engine unavailable: never strand the visitor behind the overlay
      }
    });
  }

  // p5 global mode creates its canvas during its own setup(), which runs after
  // this script. Poll only until it appears, then stop.
  var deadline = Date.now() + BOOT_TIMEOUT_MS;
  (function waitForCanvas() {
    if (done) return;
    if (root.querySelector("canvas")) {
      markReady();
    } else if (Date.now() > deadline) {
      dismiss();
    } else {
      requestAnimationFrame(waitForCanvas);
    }
  })();
})();
