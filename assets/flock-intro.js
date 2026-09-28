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

  // Storefront content is rendered as sibling section wrappers (header, main,
  // footer). Inerting those isolates the page from keyboard and pointer input
  // without touching <body>, <html>, or the intro's own trigger.
  var PAGE_SELECTOR = "body > .shopify-section";

  var done = false;
  var inerted = []; // only the elements this integration actually changed

  function isolatePage() {
    var sections = document.querySelectorAll(PAGE_SELECTOR);
    for (var i = 0; i < sections.length; i++) {
      // Already inert for some other reason: leave it, and do not claim it.
      if (sections[i].inert) continue;
      sections[i].inert = true;
      inerted.push(sections[i]);
    }
  }

  // The single cleanup path for every dismissal route: completion, boot timeout,
  // and a missing engine. Safe to call more than once.
  function dismiss() {
    if (done) return;
    done = true;
    for (var i = 0; i < inerted.length; i++) inerted[i].inert = false;
    inerted.length = 0;
    document.documentElement.classList.remove(SCROLL_LOCK_CLASS);
    root.remove();
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
