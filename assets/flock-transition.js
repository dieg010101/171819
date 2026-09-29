// =============================================================================
//  seventeeneighteennineteen · landing-page flock transition  (v2)
//  p5.js global mode (1.x and 2.x) · 2D renderer · no external assets
// =============================================================================
//
//  ARCHITECTURE
//   1. CONFIG .............. every value you are likely to art-direct
//   2. State ............... state machine, view, logo, pools
//   3. Bird model .......... articulated 3D bird, projected analytically each frame
//   4. Bird class .......... flight model: yaw / pitch / bank, flap bouts, glides
//   5. Flock management .... object pool, spawners, depth sort
//   6. Timeline ............ time-based transition choreography
//   7. p5 lifecycle ........ setup / draw / windowResized
//   8. Rendering ........... background, logo plane, birds, soft near layer
//   9. Public API + input .. triggerAnimation(), onTransitionComplete(), mouse/touch/keys
//  10. Debug + helpers ..... overlay (D), reset (R)
//
//  CAMERA MODEL
//  The camera looks level into a deep volume of air (not up at the sky). Every
//  bird has a world position (X right, Y up, Z distance) and a heading in 3D.
//  Screen size = F / Z, so a bird flying toward the lens grows, one flying away
//  shrinks, and one crossing is seen side-on. Each bird is a small 3D model
//  (body, head, fanned tail, two-segment wings) rotated by its yaw, pitch and
//  bank and projected every frame, so the silhouette changes naturally with
//  viewing angle: profile, three-quarter, head-on, from below.
//
//  A thin-lens depth of field blurs birds away from the focus plane (the logo
//  sits on it), and a short "shutter" smears fast wings and fast birds. Both are
//  done by accumulating a few semi-transparent samples per bird; birds very
//  near the lens go into a low-resolution layer that is blurred as a whole.
// =============================================================================

// -----------------------------------------------------------------------------
// 1. CONFIG
// -----------------------------------------------------------------------------
const CONFIG = {
  theme: {
    background: [27, 27, 26], // flat charcoal (reference)
    vignette: [10, 10, 10],
    vignetteStrength: 0.3, // 0 = none
    grain: 0.06, // film-grain alpha, 0 = off (also dithers the vignette)
    bird: [206, 206, 201], // pale grey birds
    birdVariance: 0.1, // per-bird brightness spread (0..1)
    logo: [192, 192, 188],
    debug: "#FF5A4E",
  },

  logo: {
    layout: "stacked", // 'stacked' (three lines) or 'inline' (one line)
    align: "right", // stacked alignment: 'left' | 'center' | 'right'
    lines: [
      { text: "seventeen", weight: 700, tracking: -0.04 }, // tracking in em
      { text: "eighteen", weight: 400, tracking: -0.015 },
      { text: "nineteen", weight: 700, tracking: -0.04 },
    ],
    font: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    leading: 0.9, // line height in em (stacked)
    widthDesktop: 0.15, // block width (longest line) as a fraction of viewport width
    widthTablet: 0.22,
    widthMobile: 0.44,
    minSize: 16, // px
    maxSize: 72, // ceiling so very large displays never get an oversized title
    maxHeightFrac: 0.3, // block height never exceeds this fraction of the viewport
    hitPadding: 0.45, // em (the glyphs got smaller; keep the target generous)
    minHitHeight: 44, // px
    reactionScale: 0.985, // the only "button" response: a tiny settle
  },

  camera: {
    focusDepth: 30, // world distance in focus; the logo lives on this plane
    apertureNear: 0.14, // defocus strength in front of the focus plane
    apertureFar: 0.05, // ...and behind it
    maxBlurFrac: 0.22, // cap on defocus radius as a fraction of bird half-span
    shutter: 0.028, // s of motion blur (wing smear, fast birds streak)
    nearShutter: 0.45, // shutter multiplier for the soft layer (the layer blur does the rest)
    nearLayerDepth: 8, // birds nearer than this render into the soft low-res layer
    nearLayerScale: 0.36, // resolution of that layer
    fogStart: 45, // birds fade into the haze between these distances
    fogEnd: 175,
    opacityNear: 0.86,
    opacityFar: 0.16,
  },

  bird: {
    // Red-tailed Hawk (Buteo jamaicensis): anatomy + wingbeat
    size: [0.86, 1.14], // overall scale: half wingspan in world units
    // Correlated morphology. One "build" axis runs from stocky adult-like (-1: bulkier
    // body, broader inner wing, shorter/wider tail) to rangier juvenile-like (+1:
    // slimmer wing, longer tail). A small independent factor adds wing length.
    // Values are ± fractions across the axis; every bird stays a Red-tail.
    morph: {
      stockyBias: 0.35, // 0 = builds uniform; higher = more stocky individuals
      bodyBulk: 0.08,
      wingChord: 0.08, // inner-wing breadth (secondary bulge scales with it)
      wingLength: 0.02, // rangy birds a touch longer overall
      tailLength: 0.1,
      tailWidth: 0.06,
      headScale: 0.03,
      longWing: [0, 0.07], // independent extra span (outer wing takes most of it)
      primaryLength: [0.96, 1.05],
      splayBias: [-0.1, 0.1], // individual habit of spreading the fingers
      jitter: 0.015, // tiny independent noise on every trait
    },
    flapHzCalm: [2.2, 3.1], // slow, heavy Buteo wingbeats
    flapHzAlarm: [3.1, 4.3], // energetic, but still a large hawk
    hzSizeCorrelation: 0.6, // bigger birds beat slower, smaller a little faster
    flapAmp: [0.72, 0.9], // rad either side of the stroke midline (broad downstroke)
    flapMid: 0.12, // stroke midline elevation
    downstroke: [0.52, 0.58], // share of the cycle spent on the downstroke
    upstrokeFold: [0.45, 0.8], // wrist/hand flex on the upstroke (inner wing flexes far less)
    armFold: 0.18, // inner-wing sweep at full fold (rad) ...
    handFold: 1.15, // ... versus the hand's
    glideDihedral: [0.03, 0.2], // soaring: nearly flat to a shallow V (never a vulture V)
    glideHand: [-0.06, 0.05], // outer wing relative to the inner wing in a glide
    glideSweep: [0, 0.06], // soaring wings held openly, not falcon-swept
    flapStartCalm: 0.3, // chance a newly spawned calm bird is mid-bout
    flapStartAlarm: 0.9,
    glideCalm: [2.2, 6.5], // s of soaring/gliding between bouts (idle)
    beatsCalm: [1, 4], // a few slow powerful beats, then glide again
    glideAlarm: [0, 0.3],
    beatsAlarm: [5, 12],
    maxBank: 0.95, // rad
    bankGain: 0.5, // bank per rad/s of turning
    thickness: 0.028, // edge thickness (half-spans) for small birds so edge-on wings stay visible
    attackArm: 0.3, // wing angle of attack (rad): wings never vanish edge-on
    attackHand: 0.2,
    twistStroke: 0.35, // extra pronation on the downstroke / supination on the upstroke
    handTwistShare: 0.6, // share of that twist the hand takes (keeps it off edge-on)
    bodyAttitude: 0.12, // nose-up body angle in flight (rad)
    // five emarginated outer primaries ("fingers"): fan spread by pose (1 = template)
    splayGlide: 1.0, // soaring: clearly slotted
    splayDownstroke: 0.8,
    splayUpstroke: 0.35, // fingers close together as the hand folds
    splayTurn: 0.3, // extra spread per rad/s of turning (capped)
    splayBrake: 0.3,
    fingerCurl: 0.045, // fingertips bend up under load (half-spans)
    fingerStagger: 0.14, // leading fingers bend up more than trailing ones: the fan has depth edge-on
    // dynamic tail fan, multiplying each bird's anatomical tail width
    tailFanPowered: 0.84, // straight powered flight: restrained
    tailFanGlide: 1.0,
    tailFanTurn: 0.4, // per rad/s of turning
    tailFanBrake: 0.35,
    tailFanMax: 1.45,
  },

  lod: {
    // projected half-span (px) thresholds for wingtip detail
    fingersAbove: 15, // below: one closed, rounded wingtip (no flickering slots)
    fullFingersAbove: 42, // between: simplified fingers with reduced splay; above: full
    mediumSplay: 0.55,
    blurHide: 0.12, // defocus (fraction of half-span) at which finger detail is dropped
  },

  idle: {
    count: { desktop: 7, tablet: 6, mobile: 4 },
    depthBands: [
      [9, 20, 0.45],
      [20, 38, 0.35],
      [38, 80, 0.2],
    ], // [near, far, share]: mostly mid-distance
    minDepth: 8.5, // idle birds keep at least this far from the lens
    speed: [2.6, 5.2], // world units / s (screen speed also scales with 1/Z)
    maxTurnRate: 1.0, // rad / s
    wheelChance: 0.7, // soaring birds that circle for a while (riding a thermal)
    wheelRadius: [5, 13],
    wheelTime: [10, 22],
    wheelTurnResponse: 1.2, // lower = smoother, less teetering heading/bank changes
    wheelBankResponse: 1.1,
    wheelGlideMul: 1.5, // glides last longer while circling
    wheelLift: 0.06, // gentle climb in the thermal instead of sinking
    groupChance: 0.28, // loose groups of 2-3
    groupSize: [1, 2], // extra birds that join a leader
    hazeEntryChance: 0.3, // share that appear out of the far haze instead of an edge
    respawnDelay: [0.6, 3.5],
    nearPassEvery: [7, 15], // s between big soft birds crossing close to the lens
    nearPassDepth: [2.6, 6],
  },

  swarm: {
    maxBirds: { desktop: 80, tablet: 64, mobile: 44 },
    startleSpeedMul: 1.9,
    spawnRate: { build: [10, 36], swarm: 34, cover: 14 }, // birds / s
    // spawn mix per phase: [emerge from behind the logo, lateral stream, near pass]
    mix: {
      build: [0.8, 0.2, 0.0],
      swarm: [0.45, 0.3, 0.25],
      cover: [0.3, 0.3, 0.4],
    },
    emergeDepth: [1.1, 2.3], // × focusDepth
    emergeSpeed: [7, 12],
    streamDepth: [9, 50],
    streamSpeed: [7, 11.5],
    nearStart: [10, 16],
    nearSpeed: [8, 12],
    maxTurnRate: 2.6,
  },

  foreground: {
    // scripted passes right past the lens: they cover the screen
    count: { desktop: 12, tablet: 11, mobile: 10 },
    window: [1.8, 2.85], // s after click: launch window
    startDepth: [6, 9],
    firstDepth: [1.5, 2.2], // closest distance of the first passes
    closestDepth: [0.45, 0.8], // closest distance of the last passes (smaller = bigger)
    approachTime: [0.36, 0.48], // s time-constant of the approach
    sweepSpeed: [0.7, 1.3], // lateral world speed near the lens
    exitBoost: 2.6,
  },

  timing: {
    // seconds after click
    reaction: 0.6,
    build: 2.0,
    swarm: 3.2,
    cover: 3.8,
    disperse: 5.2, // nominal end: by now most birds have flown out
    pageSwapAt: 3.3,
    pageSwapDuration: 0.25,
    // Completion is visibility-driven: the transition ends once no bird overlaps the
    // viewport for exitClearHold, but not before earliestComplete.
    earliestComplete: 4.9,
    exitClearHold: 0.14,
    exitAssistAt: 6.0, // stragglers still in view get a stronger exit (rare)
    emergencyFadeAt: 6.35, // last resort only: remaining visible birds fade out
    emergencyFadeDuration: 0.3, // hard end = emergencyFadeAt + this + exitClearHold
  },

  exit: {
    // DISPERSE trajectories: every bird actually flies out of frame
    viewportMargin: 36, // px beyond the edge a silhouette must clear to count as gone
    overscan: 60, // px: exit target sits this far past the bird's own radius
    beyond: 0.25, // target continues this far past the edge (× larger viewport side)
    momentumWeight: 0.65, // keep the bird's own projected motion ...
    radialWeight: 0.35, // ... blended with "away from the centre"
    momentumSpeedPx: 260, // px/s at which a bird's own motion counts fully
    inwardRadial: 0.3, // bird heading inward: mostly carry on across (no U-turns)
    jitter: 0.25, // rad of individual variation in the exit direction
    exitTime: [0.6, 1.1], // s a bird aims to take to clear the frame
    depthMomentum: 0.8, // share of current depth motion kept (receding birds keep receding)
    speedMul: 1.2, // at least this much faster than before dispersal
    maxSpeedMul: 2.3, // speed ceiling relative to the bird's own speed ...
    maxScreenSpeed: 0.85, // ... or this on-screen speed (× view.F per second), whichever is higher,
    //     so distant birds can still cross the frame in time
    accel: 4, // how quickly the exit speed builds (1/s)
    assistSpeedMul: 1.5, // straggler assist: extra speed ...
    assistTurnRate: 3.2, // ... and turn authority
    turnRate: 2.2,
    minAlpha: 0.04, // birds fainter than this (deep haze) no longer count as visible
    hazeVanish: 60, // beyond fogEnd, opacity reaches zero over this distance
  },

  reducedMotion: {
    respect: true,
    idleCount: 2,
    idleSpeedMul: 0.6,
    duration: 0.9, // s, simple cross-fade instead of the swarm
  },

  perf: {
    pixelDensity: 1, // 1 keeps retina displays fast
    maxDeltaMs: 50,
    sampleSpacing: 3, // px between blur samples (bigger = fewer samples)
    maxSamples: 6, // per bird, main layer
    maxSamplesNear: 9, // per bird, soft near layer
  },

  debug: false,
};

// -----------------------------------------------------------------------------
// 2. STATE
// -----------------------------------------------------------------------------
const STATE = Object.freeze({
  IDLE: "IDLE",
  REACTION: "REACTION",
  BUILD: "BUILD",
  SWARM: "SWARM",
  COVER: "COVER",
  DISPERSE: "DISPERSE",
  COMPLETE: "COMPLETE",
  REDUCED: "REDUCED_MOTION",
});

const KIND_IDLE = 0,
  KIND_SWARM = 1,
  KIND_FORE = 2,
  KIND_NEAR = 3;
const B_CRUISE = 0,
  B_WHEEL = 1,
  B_TARGET = 2,
  B_FLEE = 3,
  B_FORE = 4,
  B_EXIT = 5;
const TAU_ = Math.PI * 2,
  HALF_PI_ = Math.PI * 0.5;

let state = STATE.IDLE;
let clock = 0,
  transitionStart = 0;
let reducedMotion = false,
  debugOn = CONFIG.debug,
  hovering = false;
let fpsSmoothed = 60,
  nextIdleSpawn = 0,
  nextNearPass = 0,
  spawnAccum = 0;
let flowDir = 1;
let FILTER_OK = false; // canvas ctx.filter support (blur of the near layer)

// The host element the canvas is parented to. The Shopify snippet renders it; the
// adapter (flock-intro.js) owns everything else about the overlay's DOM lifecycle.
const MOUNT_SELECTOR = "[data-flock-canvas]";
let mounted = false;

const view = {
  w: 1,
  h: 1,
  cx: 0,
  cy: 0,
  F: 1,
  halfW: 1,
  halfH: 1,
  pd: 1,
  device: "desktop",
};
const logo = {
  size: 0,
  n: 0,
  fonts: [],
  spacings: [],
  xs: new Float32Array(3),
  ys: new Float32Array(3),
  aligns: [],
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0,
  cx: 0,
  cy: 0,
  scale: 1,
  alpha: 1,
};
const fx = { pageMix: 0, birdFade: 1 };
const counts = {
  active: 0,
  idle: 0,
  swarm: 0,
  fore: 0,
  drawn: 0,
  samples: 0,
  near: 0,
  exitVisible: 0,
};
let exitClearSince = -1,
  exitAssisted = false,
  exitFading = false;
const fgPlan = {
  n: 0,
  next: 0,
  times: new Float32Array(16),
  ox: new Float32Array(16),
  oy: new Float32Array(16),
};
const PALETTE = []; // pre-built fill strings (no per-frame string building)
let LOGO_FILL = "";

const pool = [],
  order = [];
let blurKey = -1,
  blurStr = "none";
let bgCanvas = null,
  nearA = null,
  nearB = null,
  nearC = null,
  nearActive = false,
  nearMinBlur = 0;

// -----------------------------------------------------------------------------
// 3. BIRD MODEL
// -----------------------------------------------------------------------------
// Local frame: +x forward, +y up, +z right wing. Units: half wingspan ≈ 1.
// Body, neck and head are ellipsoids (their projections are exact ellipses);
// wings are two planar segments (arm, hand) with their own elevation and sweep;
// the tail is a fan that pitches and spreads. All points are projected into one
// canvas path per sample, with windings normalised so the union fills solid.
const MODEL = {
  // Stout Buteo torso; a short, thick neck blends head and shoulders into one compact mass.
  body: [-0.04, 0, 0, 0.29, 0.125, 0.13], // cx, cy, cz, semi-axes x, y, z
  neck: [0.13, 0.03, 0, 0.115, 0.1, 0.108], // wider than the head: no pigeon-like knob
  head: [0.225, 0.048, 0, 0.088, 0.08, 0.084],
  bill: [0.305, 0.032, 0, 0.034, 0.027, 0.022], // short blunt bill: a nub from any angle
  hook: [0.3, 0.058, 0.335, 0.05, 0.342, 0.022, 0.328, 0.016, 0.308, 0.03], // subtle hook (side view)
  shoulder: [0.07, 0.04, 0.07],
  armLen: 0.43,
  // planforms: (u along span, v along chord, +v = forward)
  // Inner wing: broad and muscular, the secondaries bulging convexly on the trailing edge.
  arm: [
    -0.03, 0.105, 0.12, 0.125, 0.28, 0.12, 0.44, 0.1, 0.44, -0.205, 0.4, -0.24,
    0.34, -0.275, 0.26, -0.3, 0.17, -0.31, 0.08, -0.3, 0.0, -0.278, -0.03,
    -0.25,
  ],
  // Outer wing surface (inner primaries); the five fingers root along its distal edge.
  hand: [
    -0.06, 0.1, 0.1, 0.095, 0.22, 0.085, 0.31, 0.06, 0.35, 0.01, 0.35, -0.08,
    0.31, -0.155, 0.22, -0.197, 0.1, -0.212, -0.06, -0.215,
  ],
  // Closed, rounded wingtip used at small sizes instead of fingers.
  handTip: [
    0.26, 0.075, 0.42, 0.085, 0.52, 0.05, 0.565, -0.02, 0.55, -0.09, 0.48,
    -0.16, 0.37, -0.2, 0.26, -0.19,
  ],
  // Five emarginated outer primaries, leading (P10) to trailing (P6):
  // root u, root v, direction (rad, + = forward), length, width.
  // Middle fingers longest, stepping down either side: a rounded, moderately slotted tip.
  primaries: [
    0.285, 0.055, 0.32, 0.175, 0.048, 0.305, 0.015, 0.14, 0.23, 0.052, 0.31,
    -0.035, -0.04, 0.245, 0.054, 0.295, -0.085, -0.22, 0.225, 0.054, 0.265,
    -0.13, -0.4, 0.185, 0.052,
  ],
  splayCentre: -0.04, // the fan opens and closes about this direction
  // unit feather outline (along 0..1, across ±0.5); roots start inside the hand (no holes)
  // (the outer half narrows: emargination, which is what opens the slots)
  feather: [
    -0.2, -0.5, 0.35, -0.5, 0.5, -0.37, 0.8, -0.33, 0.93, -0.22, 1, 0, 0.93,
    0.22, 0.8, 0.33, 0.5, 0.37, 0.35, 0.5, -0.2, 0.5,
  ],
  featherLo: [-0.2, -0.5, 0.45, -0.45, 1, 0, 0.45, 0.45, -0.2, 0.5],
  // Short, broad tail: rounded to gently squared, fanned dynamically (POSE.tailFan).
  tailRoot: -0.26,
  tail: [
    0, -0.075, -0.17, -0.15, -0.245, -0.165, -0.268, -0.12, -0.278, -0.06,
    -0.28, 0, -0.278, 0.06, -0.268, 0.12, -0.245, 0.165, -0.17, 0.15, 0, 0.075,
  ], // dx, z
  tailLen: 0.28,
  keel: [0.04, 0.05, -0.25, 0.018, -0.275, -0.008, 0.04, -0.07], // tail + rump, mid plane (dx, y)
};

const POSE = {
  eArm: 0,
  sArm: 0,
  armScale: 1,
  eHand: 0,
  sHand: 0,
  handScale: 1,
  tailPitch: 0,
  bob: 0,
  aArm: 0,
  aHand: 0,
  primarySplay: 1,
  primaryCurl: 0,
  tailFan: 1,
};
let LOD_LEVEL = 2,
  LOD_SPLAY = 1; // set per bird in drawBird()
// scratch wing frame: origin, span axis a, chord axis c (with attack), upper-surface normal n
let WOx = 0,
  WOy = 0,
  WOz = 0,
  WAx = 0,
  WAy = 0,
  WAz = 0,
  WCx = 0,
  WCy = 0,
  WCz = 0,
  WNx = 0,
  WNy = 0,
  WNz = 0;
const PX = new Float32Array(64); // scratch: projected polygon
const BILL = new Float32Array(6); // scratch: bill ellipsoid scaled with the head
let M0 = 0,
  M1 = 0,
  M2 = 0,
  M3 = 0,
  M4 = 0,
  M5 = 0,
  OX = 0,
  OY = 0; // current projection

// Wingbeat of a large Buteo: a broad, powerful downstroke; on the upstroke the wrist
// flexes and the hand sweeps back far more than the inner wing, and the fingers close.
// Gliding (flapA → 0) blends to an open, nearly flat soaring pose with a spread fan.
function computePose(b, phase) {
  const W = CONFIG.bird;
  const p = phase - Math.floor(phase);
  const ds = b.downstroke;
  const q = p < ds ? (0.5 * p) / ds : 0.5 + (0.5 * (p - ds)) / (1 - ds);
  const ang = TAU_ * q,
    c = Math.cos(ang),
    s = Math.sin(ang);
  const A = b.flapA;
  const up = A * Math.max(0, -s); // 0..1 through the upstroke
  const fold = up * b.fold;
  POSE.eArm = mixf(b.glideE, W.flapMid, A) + A * b.amp * c; // q=0 top, q=.5 bottom
  POSE.sArm = mixf(b.glideSweep, 0.03, A) + fold * W.armFold;
  POSE.armScale = 1 - 0.08 * fold;
  POSE.eHand =
    POSE.eArm +
    mixf(b.glideHand, 0, A) +
    A * 0.5 * b.amp * Math.cos(ang - 0.95);
  POSE.sHand = mixf(b.glideSweep * 1.3 + 0.03, 0.06, A) + fold * W.handFold;
  POSE.handScale = 1 - 0.18 * fold;
  POSE.tailPitch = b.tailPitch + A * 0.07 * s;
  const tw = A * W.twistStroke * s; // s>0 downstroke: pronate
  POSE.aArm = W.attackArm - tw * 0.4;
  POSE.aHand = W.attackHand - tw * W.handTwistShare + fold * 0.5;
  POSE.bob = A * 0.035 * s;
  // primaries: one coordinated fan (open soaring, closing on the upstroke, wider in turns/braking)
  let splay = mixf(W.splayGlide, W.splayDownstroke, A);
  splay = mixf(splay, W.splayUpstroke, up);
  POSE.primarySplay = clampv(
    splay + W.splayTurn * b.maneuver + W.splayBrake * b.brakeAmt + b.splayBias,
    0.2,
    1.5
  );
  POSE.primaryCurl = W.fingerCurl * (1 + A * (0.6 * s - 0.5));
  // tail: restrained in straight powered flight, fanned gliding, wider turning/braking
  POSE.tailFan = Math.min(
    W.tailFanMax,
    mixf(W.tailFanGlide, W.tailFanPowered, A) +
      W.tailFanTurn * b.maneuver +
      W.tailFanBrake * b.brakeAmt
  );
}

// Set the projection for one sample: screen origin + 2×3 matrix (local → screen px).
function setProjection(b, ox, oy, s) {
  OX = ox;
  OY = oy;
  M0 = b.fx * s;
  M1 = b.ux * s;
  M2 = b.rx * s;
  M3 = -b.fy * s;
  M4 = -b.uy * s;
  M5 = -b.ry * s;
}

// e = [cx, cy, cz, ax, ay, az]; sx scales length, sw scales height/width (morphology)
function emitEllipsoid(ctx, e, dy, sx, sw) {
  const x = e[0],
    y = e[1] + dy,
    z = e[2];
  const px = OX + M0 * x + M1 * y + M2 * z,
    py = OY + M3 * x + M4 * y + M5 * z;
  const ex = e[3] * sx,
    ey = e[4] * sw,
    ez = e[5] * sw;
  const a0 = M0 * ex,
    a1 = M1 * ey,
    a2 = M2 * ez;
  const b0 = M3 * ex,
    b1 = M4 * ey,
    b2 = M5 * ez;
  const q11 = a0 * a0 + a1 * a1 + a2 * a2,
    q22 = b0 * b0 + b1 * b1 + b2 * b2;
  const q12 = a0 * b0 + a1 * b1 + a2 * b2;
  const hm = (q11 + q22) * 0.5,
    hd = (q11 - q22) * 0.5;
  const rt = Math.sqrt(hd * hd + q12 * q12);
  const r1 = Math.sqrt(Math.max(hm + rt, 1e-6)),
    r2 = Math.sqrt(Math.max(hm - rt, 1e-6));
  const th = 0.5 * Math.atan2(2 * q12, q11 - q22);
  ctx.moveTo(px + r1 * Math.cos(th), py + r1 * Math.sin(th));
  ctx.ellipse(px, py, r1, r2, th, 0, TAU_, false);
}

function emitPoly(ctx, n) {
  let area = 0;
  for (let i = 0, j = n - 1; i < n; j = i++)
    area += PX[j * 2] * PX[i * 2 + 1] - PX[i * 2] * PX[j * 2 + 1];
  if (area >= 0) {
    ctx.moveTo(PX[0], PX[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(PX[i * 2], PX[i * 2 + 1]);
  } else {
    ctx.moveTo(PX[(n - 1) * 2], PX[(n - 1) * 2 + 1]);
    for (let i = n - 2; i >= 0; i--) ctx.lineTo(PX[i * 2], PX[i * 2 + 1]);
  }
  ctx.closePath();
}

function projectInto(i, x, y, z) {
  PX[i * 2] = OX + M0 * x + M1 * y + M2 * z;
  PX[i * 2 + 1] = OY + M3 * x + M4 * y + M5 * z;
}

// Wing frame at origin (ox, oy, oz): elevation e, sweep sg, attack att; side = ±1
// mirrors to the left wing. Arm, hand and primaries all project through this frame,
// so the fingers follow elevation, sweep, wrist fold and attack automatically.
function setWingFrame(ox, oy, oz, e, sg, side, att) {
  const se = Math.sin(e),
    ce = Math.cos(e),
    ss = Math.sin(sg),
    cs = Math.cos(sg);
  const ax = -ss,
    ay = cs * se,
    az = cs * ce * side; // span axis
  const c0x = cs,
    c0y = ss * se,
    c0z = ss * ce * side; // chord axis (flat)
  // plane normal (up for a level wing, either side); pitch the chord by the attack angle
  const nx = side * (ay * c0z - az * c0y),
    ny = side * (az * c0x - ax * c0z),
    nz = side * (ax * c0y - ay * c0x);
  const ca = Math.cos(att),
    sa = Math.sin(att);
  WOx = ox;
  WOy = oy;
  WOz = oz;
  WAx = ax;
  WAy = ay;
  WAz = az;
  WCx = c0x * ca + nx * sa;
  WCy = c0y * ca + ny * sa;
  WCz = c0z * ca + nz * sa;
  WNx = nx * ca - c0x * sa;
  WNy = ny * ca - c0y * sa;
  WNz = nz * ca - c0z * sa;
}

function wingPoint(i, u, v, h) {
  projectInto(
    i,
    WOx + u * WAx + v * WCx + h * WNx,
    WOy + u * WAy + v * WCy + h * WNy,
    WOz + u * WAz + v * WCz + h * WNz
  );
}

function emitWingPoly(ctx, pts, uS, vS) {
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++)
    wingPoint(i, pts[i * 2] * uS, pts[i * 2 + 1] * vS, 0);
  emitPoly(ctx, n);
}

// The five outer primaries as one coordinated fan: each feather rotates about the
// fan centre by the pose splay; roots overlap the hand; tips curl up slightly.
function emitPrimaries(ctx, b, uS, vS) {
  const P = MODEL.primaries,
    shape = LOD_LEVEL === 2 ? MODEL.feather : MODEL.featherLo;
  const n = shape.length >> 1,
    cen = MODEL.splayCentre;
  const splay = POSE.primarySplay * LOD_SPLAY,
    curl = POSE.primaryCurl;
  const stag =
    CONFIG.bird.fingerStagger * Math.max(0.3, curl / CONFIG.bird.fingerCurl);
  const lenS = uS * b.primaryLength;
  for (let f = 0; f < 5; f++) {
    const o = f * 5;
    const th = cen + (P[o + 2] - cen) * splay;
    const dU = Math.cos(th),
      dV = Math.sin(th);
    const L = P[o + 3] * lenS,
      wd = P[o + 4] * vS;
    const ub = P[o] * uS,
      vb = P[o + 1] * vS;
    const lift = stag * (2 - f) * 0.5 * L; // leading fingers bend up most
    for (let i = 0; i < n; i++) {
      const t = shape[i * 2],
        w = shape[i * 2 + 1] * wd,
        a = t * L;
      wingPoint(
        i,
        ub + dU * a - dV * w,
        vb + dV * a + dU * w,
        t > 0 ? (curl + lift) * t * t : 0
      );
    }
    emitPoly(ctx, n);
  }
}

function emitBird(ctx, b) {
  const dy = POSE.bob,
    bulk = b.bodyBulk,
    hs = b.headScale;
  const bx = 1 + (bulk - 1) * 0.3; // bulk adds girth more than length
  ctx.beginPath();
  emitEllipsoid(ctx, MODEL.body, dy, bx, bulk);
  emitEllipsoid(ctx, MODEL.neck, dy, bx, bulk);
  emitEllipsoid(ctx, MODEL.head, dy, hs, hs);
  // bill: a small nub plus a subtle hook, scaled about the head centre
  const hx = MODEL.head[0],
    hy = MODEL.head[1],
    bl = MODEL.bill;
  BILL[0] = hx + (bl[0] - hx) * hs;
  BILL[1] = hy + (bl[1] - hy) * hs;
  BILL[2] = 0;
  BILL[3] = bl[3];
  BILL[4] = bl[4];
  BILL[5] = bl[5];
  emitEllipsoid(ctx, BILL, dy, hs, hs);
  const k = MODEL.hook;
  for (let i = 0; i < 5; i++)
    projectInto(
      i,
      hx + (k[i * 2] - hx) * hs,
      hy + (k[i * 2 + 1] - hy) * hs + dy,
      0
    );
  emitPoly(ctx, 5);
  // tail fan: length and width are anatomy; the fan widens mostly toward the tip
  const tp = POSE.tailPitch,
    ct = Math.cos(tp),
    st = Math.sin(tp),
    T = MODEL.tail;
  const fan = POSE.tailFan,
    tl = b.tailLength * (1 - 0.08 * (fan - 1)),
    tw = b.tailWidth;
  const tn = T.length >> 1;
  for (let i = 0; i < tn; i++) {
    const d = T[i * 2] * tl,
      f = 1 + (fan - 1) * (-T[i * 2] / MODEL.tailLen);
    projectInto(i, MODEL.tailRoot + d * ct, dy - d * st, T[i * 2 + 1] * tw * f);
  }
  emitPoly(ctx, tn);
  const K = MODEL.keel,
    kn = K.length >> 1;
  for (let i = 0; i < kn; i++) {
    const d = K[i * 2] < 0 ? K[i * 2] * b.tailLength : K[i * 2];
    const ky = K[i * 2 + 1];
    projectInto(i, MODEL.tailRoot + d * ct + ky * st, dy + ky * ct - d * st, 0);
  }
  emitPoly(ctx, kn);
  // wings
  const S = MODEL.shoulder,
    wl = b.wingLen;
  const armU = POSE.armScale * wl,
    armV = b.wingChord;
  const handU = POSE.handScale * wl * b.outerWingLength,
    handV = 1 + (b.wingChord - 1) * 0.5;
  for (let side = -1; side <= 1; side += 2) {
    const sy = S[1] + dy,
      sz = S[2] * bulk * side;
    setWingFrame(S[0], sy, sz, POSE.eArm, POSE.sArm, side, POSE.aArm);
    emitWingPoly(ctx, MODEL.arm, armU, armV);
    const L = MODEL.armLen * armU; // wrist
    const wx = WOx + WAx * L,
      wy = WOy + WAy * L,
      wz = WOz + WAz * L;
    setWingFrame(wx, wy, wz, POSE.eHand, POSE.sHand, side, POSE.aHand);
    emitWingPoly(ctx, MODEL.hand, handU, handV);
    if (LOD_LEVEL === 0)
      emitWingPoly(
        ctx,
        MODEL.handTip,
        handU * (1 + (b.primaryLength - 1) * 0.5),
        handV
      );
    else emitPrimaries(ctx, b, handU, handV);
  }
}

// -----------------------------------------------------------------------------
// 4. BIRD CLASS
// -----------------------------------------------------------------------------
class Bird {
  constructor() {
    this.active = false;
    this.kind = KIND_IDLE;
    this.behavior = B_CRUISE;
    this.X = 0;
    this.Y = 0;
    this.Z = 30;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.speed = 5;
    this.speedTarget = 5;
    this.accel = 1;
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.maxTurn = 1;
    this.tYaw = 0;
    this.tPitch = 0;
    this.baseYaw = 0;
    this.basePitch = 0;
    this.fx = 0;
    this.fy = 0;
    this.fz = 1;
    this.ux = 0;
    this.uy = 1;
    this.uz = 0;
    this.rx = 1;
    this.ry = 0;
    this.rz = 0;
    // anatomy / wingbeat
    this.size = 1;
    this.wingLen = 1;
    this.tailPitch = 0;
    // Red-tail morphology (correlated, see spawnMorph)
    this.build = 0;
    this.bodyBulk = 1;
    this.wingChord = 1;
    this.outerWingLength = 1;
    this.primaryLength = 1;
    this.tailLength = 1;
    this.tailWidth = 1;
    this.headScale = 1;
    this.splayBias = 0;
    this.maneuver = 0;
    this.brakeAmt = 0;
    this.lod = 2;
    this.turnResp = 3;
    this.bankResp = 2.5;
    this.hz = 3.5;
    this.amp = 0.9;
    this.downstroke = 0.55;
    this.fold = 0.5;
    this.phase = 0;
    this.flapA = 1;
    this.flapTarget = 1;
    this.flapping = true;
    this.beatsLeft = 4;
    this.glideLeft = 0;
    this.alarm = false;
    this.glideE = 0.3;
    this.glideHand = 0;
    this.glideSweep = 0.1;
    // meander
    this.m1 = 0;
    this.m2 = 0;
    this.mf1 = 0.2;
    this.mf2 = 0.1;
    this.mYaw = 0.2;
    this.mPitch = 0.08;
    // behaviour data
    this.cx = 0;
    this.cy = 0;
    this.cz = 0;
    this.radius = 5;
    this.wdir = 1;
    this.wheelLeft = 0;
    this.wheelAfter = -1;
    this.tx = 0;
    this.ty = 0;
    this.tz = 0;
    this.fz0 = 0;
    this.fzMin = 0;
    this.fT = 0.4;
    this.fVx = 0;
    this.fVy = 0;
    this.leaveAt = 1e9;
    this.leaving = false;
    // lifecycle / look
    this.age = 0;
    this.life = 60;
    this.entered = false;
    this.fade = 1;
    this.fadeRate = 1;
    this.color = "";
    this.alpha = 1;
    this.sx = 0;
    this.sy = 0;
    this.s = 0;
    this.onScreen = false;
    // exit (dispersal / end of life): an off-screen target, then hold course
    this.exX = 0;
    this.exY = 0;
    this.exZ = 0;
    this.exLocked = false;
    this.exiting = false;
    this.fadeOut = 0;
    this.visible = false;
  }

  spawnCommon(kind, alarm) {
    const C = CONFIG.bird;
    this.active = true;
    this.kind = kind;
    this.alarm = alarm;
    this.size = rr(C.size);
    this.spawnMorph();
    this.tailPitch = rand(-0.06, 0.08);
    this.amp = rr(C.flapAmp);
    this.downstroke = rr(C.downstroke);
    this.fold = rr(C.upstrokeFold);
    this.hz = this.pickHz(alarm);
    this.phase = Math.random();
    this.newGlidePose();
    this.flapping =
      Math.random() < (alarm ? C.flapStartAlarm : C.flapStartCalm);
    this.flapA = this.flapTarget = this.flapping ? 1 : 0;
    this.beatsLeft = rr(alarm ? C.beatsAlarm : C.beatsCalm);
    this.glideLeft = rr(alarm ? C.glideAlarm : C.glideCalm);
    this.m1 = rand(0, TAU_);
    this.m2 = rand(0, TAU_);
    this.mf1 = rand(0.12, 0.35);
    this.mf2 = rand(0.25, 0.6);
    this.mYaw = rand(0.08, 0.35);
    this.mPitch = rand(0.03, 0.12);
    this.yawRate = 0;
    this.pitchRate = 0;
    this.bank = 0;
    this.maneuver = 0;
    this.brakeAmt = 0;
    this.lod = 2;
    this.turnResp = 3;
    this.bankResp = 2.5;
    this.age = 0;
    this.life = 90;
    this.entered = false;
    this.leaving = false;
    this.leaveAt = 1e9;
    this.fade = 1;
    this.fadeRate = 1.5;
    this.wheelAfter = -1;
    this.wheelLeft = 0;
    this.exiting = false;
    this.exLocked = false;
    this.fadeOut = 0;
    this.visible = false;
    this.accel = 1.5;
    this.color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  }

  // One correlated build axis (stocky adult-like ... rangier juvenile-like) plus an
  // independent long-wing factor: variation within Red-tailed Hawk proportions only.
  spawnMorph() {
    const M = CONFIG.bird.morph,
      j = M.jitter;
    const t = clampv(rand(-1, 1) - M.stockyBias * Math.random(), -1, 1);
    const lw = rr(M.longWing);
    this.build = t;
    this.bodyBulk = 1 - M.bodyBulk * t + rand(-j, j);
    this.wingChord = 1 - M.wingChord * t + rand(-j, j);
    this.tailLength = 1 + M.tailLength * t + rand(-j, j);
    this.tailWidth = 1 - M.tailWidth * t + rand(-j, j);
    this.headScale = 1 - M.headScale * t + rand(-j, j);
    this.wingLen = 1 + M.wingLength * t + lw * 0.4 + rand(-j, j);
    this.outerWingLength = 1 + lw * 0.8 + rand(-j, j);
    this.primaryLength = rr(M.primaryLength) + lw * 0.4;
    this.splayBias = rr(M.splayBias);
  }

  // Heavier birds beat a little slower.
  pickHz(alarm) {
    const C = CONFIG.bird;
    return (
      rr(alarm ? C.flapHzAlarm : C.flapHzCalm) *
      (1 - C.hzSizeCorrelation * (this.size * this.bodyBulk - 1))
    );
  }

  newGlidePose() {
    const C = CONFIG.bird;
    this.glideE = rr(C.glideDihedral);
    this.glideHand = rr(C.glideHand);
    this.glideSweep = rr(C.glideSweep);
  }

  setHeading(yaw, pitch) {
    this.yaw = this.tYaw = this.baseYaw = yaw;
    this.pitch = this.tPitch = this.basePitch = pitch;
  }

  updateFlap(dt) {
    const C = CONFIG.bird;
    if (this.flapping) {
      const before = this.phase;
      this.phase += this.hz * dt;
      if (Math.floor(this.phase) !== Math.floor(before)) {
        // completed a wingbeat
        this.beatsLeft--;
        if (this.beatsLeft <= 0) {
          this.flapping = false;
          this.flapTarget = 0;
          this.glideLeft =
            rr(this.alarm ? C.glideAlarm : C.glideCalm) *
            (this.behavior === B_WHEEL ? CONFIG.idle.wheelGlideMul : 1);
          if (this.glideLeft > 0.6) this.newGlidePose();
        }
      }
    } else {
      this.phase += this.hz * dt * this.flapA; // wings settle, don't freeze
      this.glideLeft -= dt;
      if (this.glideLeft <= 0) {
        this.flapping = true;
        this.flapTarget = 1;
        this.beatsLeft = Math.round(
          rr(this.alarm ? C.beatsAlarm : C.beatsCalm)
        );
      }
    }
    const rate = this.flapping ? 5 : 2.2;
    this.flapA += (this.flapTarget - this.flapA) * Math.min(1, rate * dt);
  }

  steer(dt) {
    const k = 2.2;
    let dy = wrapAngle(this.tYaw - this.yaw);
    const wantY = clampv(dy * k, -this.maxTurn, this.maxTurn);
    this.yawRate += (wantY - this.yawRate) * Math.min(1, this.turnResp * dt);
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
    const wantP = clampv(
      (this.tPitch - this.pitch) * k,
      -this.maxTurn * 0.6,
      this.maxTurn * 0.6
    );
    this.pitchRate +=
      (wantP - this.pitchRate) * Math.min(1, this.turnResp * dt);
    this.pitch = clampv(this.pitch + this.pitchRate * dt, -1.1, 1.1);
    const C = CONFIG.bird;
    const bankT = clampv(
      -this.yawRate * C.bankGain * (0.6 + this.speed * 0.06),
      -C.maxBank,
      C.maxBank
    );
    this.bank += (bankT - this.bank) * Math.min(1, this.bankResp * dt);
    this.speed +=
      (this.speedTarget - this.speed) * Math.min(1, this.accel * dt);
  }

  updateBasis() {
    const pa = this.pitch + CONFIG.bird.bodyAttitude * (0.4 + 0.6 * this.flapA);
    const cp = Math.cos(pa),
      sp = Math.sin(pa);
    const cy = Math.cos(this.yaw),
      sy = Math.sin(this.yaw);
    const fx = cp * sy,
      fy = sp,
      fz = cp * cy;
    const r0x = cy,
      r0z = -sy; // right, level
    // up0 = f × r0
    const u0x = fy * r0z,
      u0y = fz * r0x - fx * r0z,
      u0z = -fy * r0x;
    const cb = Math.cos(this.bank),
      sb = Math.sin(this.bank);
    this.fx = fx;
    this.fy = fy;
    this.fz = fz;
    this.rx = r0x * cb + u0x * sb;
    this.ry = u0y * sb;
    this.rz = r0z * cb + u0z * sb;
    this.ux = u0x * cb - r0x * sb;
    this.uy = u0y * cb;
    this.uz = u0z * cb - r0z * sb;
  }

  update(dt, t) {
    this.age += dt;
    this.m1 += this.mf1 * dt * TAU_;
    this.m2 += this.mf2 * dt * TAU_;
    const mY =
      Math.sin(this.m1) * this.mYaw + Math.sin(this.m2 * 0.7) * this.mYaw * 0.4;
    const mP = Math.sin(this.m2) * this.mPitch;

    switch (this.behavior) {
      case B_CRUISE: {
        let yaw = this.baseYaw;
        if (this.kind === KIND_IDLE && !reducedMotion) {
          // keep idle birds out of the lens: turn broadside when too near
          const minD = CONFIG.idle.minDepth;
          if (this.Z < minD && Math.cos(yaw) < 0.2)
            yaw += (Math.sin(yaw) >= 0 ? -1 : 1) * 0.6 * dt;
          this.baseYaw = yaw;
        }
        this.tYaw = yaw + mY;
        this.tPitch = this.basePitch + mP;
        if (this.wheelAfter >= 0 && this.entered && this.age > this.wheelAfter)
          this.startWheel();
        break;
      }
      case B_WHEEL: {
        const dx = this.X - this.cx,
          dz = this.Z - this.cz;
        const d = Math.hypot(dx, dz) || 1;
        const corr = clampv((d - this.radius) / this.radius, -1, 1) * 0.9;
        const tx = (dz / d) * this.wdir - (dx / d) * corr,
          tz = (-dx / d) * this.wdir - (dz / d) * corr;
        this.tYaw = Math.atan2(tx, tz);
        this.tPitch = mP * 0.4 + Math.sin(this.m1 * 0.5) * 0.04;
        this.wheelLeft -= dt;
        if (this.wheelLeft <= 0) {
          this.behavior = B_CRUISE;
          this.baseYaw = this.yaw;
          this.wheelAfter = -1;
          this.leaving = true;
          this.turnResp = 2;
          this.bankResp = 1.8;
        }
        break;
      }
      case B_TARGET: {
        const dx = this.tx - this.X,
          dy = this.ty - this.Y,
          dz = this.tz - this.Z;
        this.tYaw = Math.atan2(dx, dz) + mY * 0.4;
        this.tPitch = Math.atan2(dy, Math.hypot(dx, dz)) + mP;
        break;
      }
      case B_FLEE: {
        this.tYaw = this.baseYaw + mY * 0.5;
        this.tPitch = this.basePitch + mP;
        break;
      }
      case B_EXIT: {
        if (!this.exLocked) {
          const dx = this.exX - this.X,
            dy = this.exY - this.Y,
            dz = this.exZ - this.Z;
          this.tYaw = Math.atan2(dx, dz) + mY * 0.15;
          this.tPitch = Math.atan2(dy, Math.hypot(dx, dz)) + mP * 0.3;
          // Keep homing on the target (it lies past the retirement boundary). Holding a
          // receding course instead would drift the bird back toward its vanishing point.
          if (dx * dx + dy * dy + dz * dz < 1) this.exLocked = true;
        } else {
          this.tYaw = this.yaw;
          this.tPitch = this.pitch;
        }
        break;
      }
      case B_FORE:
        this.updateFore(dt);
        break;
    }

    if (this.behavior !== B_FORE) {
      this.steer(dt);
      const cp = Math.cos(this.pitch);
      this.vx = cp * Math.sin(this.yaw) * this.speed;
      const sink = this.flapping
        ? 0
        : this.behavior === B_WHEEL
        ? CONFIG.idle.wheelLift
        : -0.25;
      this.vy = Math.sin(this.pitch) * this.speed + sink;
      this.vz = cp * Math.cos(this.yaw) * this.speed;
    }
    this.X += this.vx * dt;
    this.Y += this.vy * dt;
    this.Z += this.vz * dt;

    // turning and braking drive finger splay and tail fan (smoothed: no twitching)
    const man = Math.min(
      1.2,
      Math.abs(this.yawRate) + Math.abs(this.pitchRate) * 0.5
    );
    this.maneuver += (man - this.maneuver) * Math.min(1, 3 * dt);
    const brk = clamp01(
      (this.speed - this.speedTarget) / (0.25 * this.speed + 0.01)
    );
    this.brakeAmt += (brk - this.brakeAmt) * Math.min(1, 4 * dt);

    this.updateFlap(dt);
    this.updateBasis();
    if (this.fadeOut > 0) {
      this.fade -= this.fadeOut * dt;
      if (this.fade <= 0) {
        this.active = false;
        return;
      }
    } else if (this.fade < 1)
      this.fade = Math.min(1, this.fade + this.fadeRate * dt);

    // projection + lifecycle
    if (this.Z < 0.22) {
      this.active = false;
      return;
    }
    const F = view.F,
      iz = 1 / this.Z;
    this.sx = view.cx + F * this.X * iz;
    this.sy = view.cy - F * this.Y * iz;
    this.s = F * this.size * iz;
    const R = this.s * 1.25;
    this.onScreen =
      this.sx + R > 0 &&
      this.sx - R < view.w &&
      this.sy + R > 0 &&
      this.sy - R < view.h;
    if (this.onScreen) this.entered = true;
    const margin = Math.max(60, R * 0.4);
    const far =
      this.sx + R < -margin ||
      this.sx - R > view.w + margin ||
      this.sy + R < -margin ||
      this.sy - R > view.h + margin;
    // visible = the silhouette (plus blur) still overlaps the viewport and isn't lost in haze
    const E = CONFIG.exit,
      Rv = R + blurRadius(this.Z, this.s),
      m = E.viewportMargin;
    this.visible =
      this.sx + Rv > -m &&
      this.sx - Rv < view.w + m &&
      this.sy + Rv > -m &&
      this.sy - Rv < view.h + m &&
      this.fade * depthOpacity(this.Z) > E.minAlpha &&
      this.s > 0.8;
    if (
      (this.entered && far && this.behavior !== B_WHEEL) ||
      (!this.entered && this.age > 9) ||
      this.Z > CONFIG.camera.fogEnd + E.hazeVanish
    ) {
      this.active = false;
      return;
    }
    // end of life: never vanish in view. Invisible birds are retired; visible ones fly out.
    if (this.age > this.life) {
      if (!this.visible) this.active = false;
      else if (this.kind === KIND_FORE) {
        if (!this.leaving) this.leaveAt = this.age;
      } else if (!this.exiting) this.startExit(state === STATE.IDLE ? 0 : 1);
    }
  }

  // Leave the frame convincingly. The exit direction blends the bird's own projected
  // motion with "away from the centre" (inward-moving birds mostly carry on across),
  // aims at a point safely past the viewport edge given the bird's projected size,
  // and sets just enough speed to get there. mode: 0 calm, 1 dispersal, 2 straggler assist.
  startExit(mode) {
    const E = CONFIG.exit,
      F = view.F,
      Z = this.Z,
      iz = 1 / Z;
    // projected screen velocity: the same perspective derivative the renderer uses
    let mx = F * (this.vx * Z - this.X * this.vz) * iz * iz;
    let my = -F * (this.vy * Z - this.Y * this.vz) * iz * iz;
    let ml = Math.hypot(mx, my);
    if (ml < 1) {
      mx = this.fx;
      my = -this.fy;
      ml = Math.hypot(mx, my) || 1;
    }
    const mStrength = clamp01(Math.hypot(mx, my) / E.momentumSpeedPx);
    mx /= ml;
    my /= ml;
    let rx = this.sx - view.cx,
      ry = this.sy - view.cy;
    const rl = Math.hypot(rx, ry),
      off = clamp01(rl / Math.hypot(view.halfW, view.halfH));
    if (rl > 1) {
      rx /= rl;
      ry /= rl;
    } else {
      rx = mx;
      ry = my;
    }
    const wm = E.momentumWeight * (0.35 + 0.65 * mStrength);
    let wr = E.radialWeight * (0.4 + 0.6 * off) * (mode === 2 ? 1.6 : 1);
    if (mx * rx + my * ry < 0) wr *= E.inwardRadial;
    let dx = wm * mx + wr * rx,
      dy = wm * my + wr * ry;
    const dl = Math.hypot(dx, dy);
    if (dl < 1e-3) {
      dx = mx;
      dy = my;
    } else {
      dx /= dl;
      dy /= dl;
    }
    const j = rand(-E.jitter, E.jitter) * (mode === 2 ? 0.4 : 1),
      cj = Math.cos(j),
      sj = Math.sin(j);
    const ex = dx * cj - dy * sj,
      ey = dx * sj + dy * cj;
    // distance along that direction until the whole silhouette is past the edge
    const R =
      this.s * 1.25 + blurRadius(Z, this.s) + E.viewportMargin + E.overscan;
    const tx =
      ex > 1e-4
        ? (view.w + R - this.sx) / ex
        : ex < -1e-4
        ? (-R - this.sx) / ex
        : 1e9;
    const ty =
      ey > 1e-4
        ? (view.h + R - this.sy) / ey
        : ey < -1e-4
        ? (-R - this.sy) / ey
        : 1e9;
    const tEdge = Math.max(0, Math.min(tx, ty));
    const tT = tEdge + E.beyond * Math.max(view.w, view.h);
    const px = this.sx + ex * tT,
      py = this.sy + ey * tT;
    const time = rr(E.exitTime) * (mode === 2 ? 0.6 : 1);
    const Zt = clampv(Z + this.vz * time * E.depthMomentum, Z * 0.7, Z * 1.6);
    this.exX = ((px - view.cx) * Zt) / F;
    this.exY = (-(py - view.cy) * Zt) / F;
    this.exZ = Zt;
    // speed: enough to clear the edge in `time`, within a hawk's plausible hurry
    const need = (1.15 * tEdge * (Z + Zt) * 0.5) / F / time; // 1.15: allow for the turn
    if (mode > 0) {
      const boost = mode === 2 ? E.assistSpeedMul : 1;
      const lo = this.speed * E.speedMul;
      const hi =
        Math.max(this.speed * E.maxSpeedMul, E.maxScreenSpeed * Z) * boost; // F·(v/Z) ≤ maxScreenSpeed·F
      this.speedTarget = clampv(need, lo, Math.max(lo, hi));
      this.accel = Math.max(this.accel, E.accel * (mode === 2 ? 1.4 : 1));
      this.maxTurn = Math.max(
        this.maxTurn,
        mode === 2 ? E.assistTurnRate : E.turnRate
      );
      this.turnResp = Math.max(this.turnResp, mode === 2 ? 4 : 3);
      this.bankResp = Math.max(this.bankResp, 2.5);
    }
    this.behavior = B_EXIT;
    this.exiting = true;
    this.exLocked = false;
  }

  startWheel() {
    const I = CONFIG.idle;
    this.behavior = B_WHEEL;
    this.radius =
      rr(I.wheelRadius) * mixf(0.8, 1.3, clamp01((this.Z - 20) / 80));
    this.wdir = Math.random() < 0.5 ? -1 : 1;
    // centre to the side of travel so the bird rolls straight into the turn
    const rx = Math.cos(this.yaw),
      rz = -Math.sin(this.yaw);
    this.cx = this.X + rx * this.radius * this.wdir;
    this.cz = this.Z + rz * this.radius * this.wdir;
    this.cz = Math.max(this.cz, CONFIG.idle.minDepth + this.radius + 2);
    this.wheelLeft = rr(I.wheelTime);
    this.maxTurn = Math.max(this.maxTurn, (this.speed / this.radius) * 1.3);
    this.turnResp = I.wheelTurnResponse;
    this.bankResp = I.wheelBankResponse;
  }

  // Scripted camera pass: exponential approach to the closest distance, then a sweep out.
  updateFore(dt) {
    const Fg = CONFIG.foreground;
    if (!this.leaving && this.age > this.leaveAt) {
      this.leaving = true;
      this.fVx *= Fg.exitBoost;
      this.fVy *= Fg.exitBoost * 0.6;
    }
    const zTarget = this.leaving ? this.fzMin * 0.6 : this.fzMin;
    this.vz = (zTarget - this.Z) / this.fT;
    this.vx = this.fVx;
    this.vy = this.fVy;
    // orientation follows velocity (plus a little life)
    const sp = Math.hypot(this.vx, this.vy, this.vz) || 1;
    this.speed = sp;
    const yaw = Math.atan2(this.vx, this.vz),
      pitch = Math.asin(clampv(this.vy / sp, -1, 1));
    const prev = this.yaw;
    this.yaw += wrapAngle(yaw - this.yaw) * Math.min(1, 6 * dt);
    this.pitch += (pitch - this.pitch) * Math.min(1, 6 * dt);
    this.yawRate = wrapAngle(this.yaw - prev) / Math.max(dt, 1e-4);
    const C = CONFIG.bird;
    this.bank +=
      (clampv(-this.yawRate * 0.3, -C.maxBank, C.maxBank) +
        Math.sin(this.m1) * 0.2 -
        this.bank) *
      Math.min(1, 3 * dt);
  }
}

// -----------------------------------------------------------------------------
// 5. FLOCK MANAGEMENT
// -----------------------------------------------------------------------------
function buildPool() {
  const total =
    Math.max(CONFIG.idle.count.desktop, CONFIG.reducedMotion.idleCount) +
    6 +
    CONFIG.swarm.maxBirds.desktop +
    16;
  for (let i = 0; i < total; i++) {
    const b = new Bird();
    pool.push(b);
    order.push(b);
  }
}

function acquire() {
  for (let i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i];
  return null;
}

function idleTarget() {
  return reducedMotion
    ? CONFIG.reducedMotion.idleCount
    : CONFIG.idle.count[view.device];
}

// visible world half-extents at distance Z
function halfWAt(Z) {
  return (view.halfW * Z) / view.F;
}
function halfHAt(Z) {
  return (view.halfH * Z) / view.F;
}
function logRand(r) {
  return Math.exp(rand(Math.log(r[0]), Math.log(r[1])));
}
function bandRand(bands) {
  let r = Math.random(),
    i = 0;
  while (i < bands.length - 1 && r > bands[i][2]) {
    r -= bands[i][2];
    i++;
  }
  return Math.exp(rand(Math.log(bands[i][0]), Math.log(bands[i][1])));
}

function spawnIdle(initial) {
  const b = acquire();
  if (!b) return null;
  const I = CONFIG.idle;
  b.spawnCommon(KIND_IDLE, false);
  b.behavior = B_CRUISE;
  b.speed = b.speedTarget =
    rr(I.speed) * (reducedMotion ? CONFIG.reducedMotion.idleSpeedMul : 1);
  b.maxTurn = I.maxTurnRate;
  let Z = bandRand(I.depthBands);
  let yaw,
    pitch = rand(-0.12, 0.16);
  const side = Math.random() < 0.5 ? -1 : 1;
  if (initial) {
    b.X = rand(-0.85, 0.85) * halfWAt(Z);
    b.Y = rand(-0.75, 0.8) * halfHAt(Z);
    b.Z = Z;
    yaw = rand(-Math.PI, Math.PI);
    if (Math.cos(yaw) < -0.3) yaw = side * rand(0.9, 2.1); // not straight at the lens
    b.fade = 0;
    b.fadeRate = rand(0.25, 0.6);
    b.age = rand(0, 3);
  } else if (Math.random() < I.hazeEntryChance) {
    Z = rand(CONFIG.camera.fogEnd * 0.75, CONFIG.camera.fogEnd * 0.95);
    b.X = rand(-0.8, 0.8) * halfWAt(Z);
    b.Y = rand(-0.5, 0.8) * halfHAt(Z);
    b.Z = Z;
    yaw = Math.PI + rand(-0.7, 0.7); // coming closer out of the haze
    b.fade = 0;
    b.fadeRate = 0.35;
  } else {
    b.Z = Z;
    b.X = -side * (halfWAt(Z) + b.size * 1.6);
    b.Y = rand(-0.7, 0.85) * halfHAt(Z);
    yaw = side * (HALF_PI_ + rand(-0.95, 0.95)); // inward, with depth travel
  }
  b.setHeading(yaw, pitch);
  if (!reducedMotion && Math.random() < I.wheelChance)
    b.wheelAfter = rand(0.5, 3.5);
  b.life = 70;
  b.updateBasis();
  return b;
}

function spawnGroupAround(lead) {
  const I = CONFIG.idle;
  const n = Math.round(rr(I.groupSize || [1, 2]));
  let made = 0;
  for (let i = 0; i < n; i++) {
    const b = acquire();
    if (!b) break;
    b.spawnCommon(KIND_IDLE, false);
    b.behavior = B_CRUISE;
    b.maxTurn = lead.maxTurn;
    b.X = lead.X - lead.fx * rand(1, 3) + rand(-1.5, 1.5);
    b.Y = lead.Y + rand(-0.9, 0.9);
    b.Z = lead.Z - lead.fz * rand(1, 3) + rand(-2, 2);
    b.speed = b.speedTarget = lead.speed * rand(0.95, 1.08);
    b.setHeading(lead.yaw + rand(-0.12, 0.12), lead.pitch + rand(-0.05, 0.05));
    b.wheelAfter = lead.wheelAfter >= 0 ? lead.wheelAfter + rand(0.3, 1.2) : -1;
    b.hz = b.pickHz(false);
    b.fade = lead.fade;
    b.fadeRate = lead.fadeRate;
    b.updateBasis();
    made++;
  }
  return made;
}

// a big soft bird crossing close to the lens (idle ambience, like the reference)
function spawnNearPass() {
  const b = acquire();
  if (!b) return;
  const I = CONFIG.idle;
  b.spawnCommon(KIND_NEAR, false);
  b.behavior = B_CRUISE;
  b.maxTurn = 0.5;
  const Z = rr(I.nearPassDepth),
    side = Math.random() < 0.5 ? -1 : 1;
  b.Z = Z;
  b.X = -side * (halfWAt(Z) + b.size * 1.4);
  b.Y = rand(-0.75, 0.55) * halfHAt(Z);
  b.speed = b.speedTarget = Z * rand(0.9, 1.35);
  b.setHeading(side * (HALF_PI_ + rand(-0.25, 0.35)), rand(-0.05, 0.25));
  b.mYaw *= 0.3;
  b.flapping = true;
  b.flapA = b.flapTarget = 1;
  b.beatsLeft = 40;
  b.life = 12;
  b.updateBasis();
}

function spawnEmerge() {
  const b = acquire();
  if (!b) return;
  const S = CONFIG.swarm,
    fd = CONFIG.camera.focusDepth;
  b.spawnCommon(KIND_SWARM, true);
  b.behavior = B_TARGET;
  b.maxTurn = S.maxTurnRate * 0.6;
  const Z = fd * rr(S.emergeDepth);
  const ang = rand(0, TAU_),
    rad =
      Math.sqrt(Math.random()) * rand(0.05, 0.32) * Math.min(view.w, view.h) +
      10;
  const sx = logo.cx + Math.cos(ang) * rad * 1.4,
    sy = logo.cy + Math.sin(ang) * rad * 0.8;
  b.Z = Z;
  b.X = ((sx - view.cx) * Z) / view.F;
  b.Y = (-(sy - view.cy) * Z) / view.F;
  // fan outward past the camera, swirling with the flock's handedness
  const tw = flowDir * rand(0.2, 0.8);
  const dx = Math.cos(ang + tw),
    dy = -Math.sin(ang + tw);
  b.tx = dx * rand(5, 16) + b.X * 0.3;
  b.ty = dy * rand(3, 10) + b.Y * 0.3 + 1;
  b.tz = rand(-4, 7);
  b.speed = b.speedTarget = rr(S.emergeSpeed);
  const ddx = b.tx - b.X,
    ddy = b.ty - b.Y,
    ddz = b.tz - b.Z;
  b.setHeading(Math.atan2(ddx, ddz), Math.atan2(ddy, Math.hypot(ddx, ddz)));
  b.fade = 0;
  b.fadeRate = rand(2.5, 4.5);
  b.life = 8;
  b.updateBasis();
}

function spawnStream() {
  const b = acquire();
  if (!b) return;
  const S = CONFIG.swarm;
  b.spawnCommon(KIND_SWARM, true);
  b.behavior = B_FLEE;
  b.maxTurn = S.maxTurnRate * 0.4;
  const Z = logRand(S.streamDepth);
  b.Z = Z;
  if (Math.random() < 0.5) {
    b.X = -flowDir * (halfWAt(Z) + b.size * 1.5);
    b.fade = 1;
  } else {
    b.X = -flowDir * halfWAt(Z) * rand(0.1, 1);
    b.fade = 0;
    b.fadeRate = rand(2.5, 4);
  }
  b.Y = rand(-0.85, 0.85) * halfHAt(Z);
  b.speed = b.speedTarget = rr(S.streamSpeed);
  b.baseYaw = flowDir * (HALF_PI_ + rand(-0.55, 0.55));
  b.basePitch = rand(-0.12, 0.28);
  b.setHeading(b.baseYaw, b.basePitch);
  b.basePitch = b.pitch;
  b.baseYaw = b.yaw;
  b.life = 8;
  b.updateBasis();
}

function spawnNear() {
  const b = acquire();
  if (!b) return;
  const S = CONFIG.swarm;
  b.spawnCommon(KIND_SWARM, true);
  b.behavior = B_TARGET;
  b.maxTurn = S.maxTurnRate * 0.5;
  const Z = rr(S.nearStart);
  b.Z = Z;
  b.X = rand(-0.9, 0.9) * halfWAt(Z);
  b.Y = rand(-0.8, 0.8) * halfHAt(Z);
  const sgn = b.X >= 0 ? 1 : -1;
  b.tx = sgn * rand(1.5, 4.5);
  b.ty = rand(-2, 2.5);
  b.tz = -2;
  b.speed = b.speedTarget = rr(S.nearSpeed);
  const ddx = b.tx - b.X,
    ddy = b.ty - b.Y,
    ddz = b.tz - b.Z;
  b.setHeading(Math.atan2(ddx, ddz), Math.atan2(ddy, Math.hypot(ddx, ddz)));
  b.fade = 0;
  b.fadeRate = 4;
  b.life = 6;
  b.updateBasis();
}

// graded plan of camera passes: offsets spread over the screen, the last ones closest
function planForeground() {
  const Fg = CONFIG.foreground;
  const n = Math.min(16, Fg.count[view.device]);
  fgPlan.n = n;
  fgPlan.next = 0;
  for (let i = 0; i < n; i++) {
    const f = n > 1 ? i / (n - 1) : 1;
    fgPlan.times[i] =
      mixf(Fg.window[0], Fg.window[1], Math.pow(f, 0.85)) + rand(-0.04, 0.04);
    const a = i * 2.39996 + rand(-0.4, 0.4);
    const r = mixf(0.55, 0.15, f) * rand(0.7, 1.1);
    fgPlan.ox[i] = Math.cos(a) * r;
    fgPlan.oy[i] = Math.sin(a) * r * 0.8;
  }
}

function spawnFore(i) {
  const b = acquire();
  if (!b) return;
  const Fg = CONFIG.foreground;
  b.spawnCommon(KIND_FORE, true);
  b.behavior = B_FORE;
  const f = fgPlan.n > 1 ? i / (fgPlan.n - 1) : 1;
  const Z0 = rr(Fg.startDepth);
  b.fzMin = mixf(
    rr(Fg.firstDepth),
    rr(Fg.closestDepth),
    easeSmooth(Math.min(1, f * 1.5))
  );
  b.fT = rr(Fg.approachTime);
  const sweep = rr(Fg.sweepSpeed) * (Math.random() < 0.5 ? -1 : 1);
  b.fVx = sweep;
  b.fVy = rand(-0.25, 0.35);
  // choose the start so the closest pass lands on the planned screen offset
  const tc = b.fT * 2.2;
  b.Z = Z0;
  b.X = (fgPlan.ox[i] * view.halfW * b.fzMin) / view.F - b.fVx * tc;
  b.Y = (-fgPlan.oy[i] * view.halfH * b.fzMin) / view.F - b.fVy * tc;
  b.leaveAt = tc + rand(0.05, 0.3);
  b.yaw = Math.atan2(b.fVx, -1);
  b.pitch = 0;
  b.hz = b.pickHz(true);
  b.flapping = true;
  b.flapA = b.flapTarget = 1;
  b.beatsLeft = 30;
  b.fade = 0;
  b.fadeRate = 5;
  b.life = 4;
  b.updateBasis();
}

function updateFlock(dt) {
  const t = clock - transitionStart;
  let a = 0,
    ni = 0,
    ns = 0,
    nf = 0,
    nv = 0;
  for (let i = 0; i < pool.length; i++) {
    const b = pool[i];
    if (!b.active) continue;
    b.update(dt, t);
    if (!b.active) continue;
    a++;
    if (b.visible) nv++;
    if (b.kind === KIND_IDLE) ni++;
    else if (b.kind === KIND_FORE) nf++;
    else if (b.kind === KIND_SWARM) ns++;
  }
  counts.active = a;
  counts.idle = ni;
  counts.fore = nf;
  counts.exitVisible = nv;
  if (state === STATE.IDLE) counts.swarm = ns;
}

// insertion sort, far → near (nearly sorted frame to frame, allocation-free)
function sortByDepth() {
  for (let i = 1; i < order.length; i++) {
    const b = order[i],
      z = b.active ? b.Z : -1e9;
    let j = i - 1;
    while (j >= 0 && (order[j].active ? order[j].Z : -1e9) < z) {
      order[j + 1] = order[j];
      j--;
    }
    order[j + 1] = b;
  }
}

// -----------------------------------------------------------------------------
// 6. TIMELINE
// -----------------------------------------------------------------------------
function stateAt(t) {
  const T = CONFIG.timing;
  if (t < T.reaction) return STATE.REACTION;
  if (t < T.build) return STATE.BUILD;
  if (t < T.swarm) return STATE.SWARM;
  if (t < T.cover) return STATE.COVER;
  return STATE.DISPERSE;
}

function enterState(s) {
  state = s;
  if (s === STATE.DISPERSE) onEnterDisperse();
}

// Phase A: every bird in view startles: faster wingbeats, turns away, accelerates.
function onEnterReaction() {
  const S = CONFIG.swarm,
    C = CONFIG.bird;
  for (let i = 0; i < pool.length; i++) {
    const b = pool[i];
    if (!b.active) continue;
    b.alarm = true;
    b.hz = b.pickHz(true);
    b.flapping = true;
    b.flapTarget = 1;
    b.beatsLeft = Math.round(rr(C.beatsAlarm));
    b.speedTarget = b.speed * S.startleSpeedMul * rand(0.85, 1.15);
    b.accel = rand(1.5, 3);
    b.maxTurn = Math.max(b.maxTurn, 2.2);
    if (b.kind === KIND_NEAR) continue;
    const ex = b.sx - logo.cx,
      ey = b.sy - logo.cy;
    b.behavior = B_FLEE; // lateral, away from the logo
    b.baseYaw = (ex >= 0 ? 1 : -1) * (HALF_PI_ + rand(-0.6, 0.8));
    b.basePitch = (ey < 0 ? 0.35 : 0.1) + rand(0, 0.3);
    b.fade = Math.max(b.fade, 0.2);
    b.fadeRate = 3;
    b.life = b.age + 6;
  }
}

function onEnterDisperse() {
  for (let i = 0; i < pool.length; i++) {
    const b = pool[i];
    if (!b.active) continue;
    if (b.kind === KIND_FORE) {
      if (!b.leaving) b.leaveAt = Math.min(b.leaveAt, b.age);
      continue;
    }
    b.startExit(1); // an actual off-screen destination
  }
}

function updateTimeline(dt) {
  if (state === STATE.IDLE) {
    if (counts.idle < idleTarget() && clock >= nextIdleSpawn) {
      const b = spawnIdle(false);
      if (
        b &&
        !reducedMotion &&
        counts.idle + 1 < idleTarget() &&
        Math.random() < CONFIG.idle.groupChance
      ) {
        counts.idle += spawnGroupAround(b);
      }
      counts.idle++;
      nextIdleSpawn = clock + rr(CONFIG.idle.respawnDelay);
    }
    if (!reducedMotion && clock >= nextNearPass) {
      spawnNearPass();
      nextNearPass = clock + rr(CONFIG.idle.nearPassEvery);
    }
    return;
  }
  if (state === STATE.COMPLETE) return;

  const t = clock - transitionStart;
  const T = CONFIG.timing;

  if (state === STATE.REDUCED) {
    const k = easeSmooth(t / CONFIG.reducedMotion.duration);
    fx.pageMix = k;
    fx.birdFade = 1 - k;
    logo.alpha = 1 - k;
    if (t >= CONFIG.reducedMotion.duration) finishTransition();
    return;
  }

  const next = stateAt(t);
  if (next !== state) enterState(next);

  logo.scale =
    1 - (1 - CONFIG.logo.reactionScale) * easeOutCubic(clamp01(t / 0.45));
  fx.pageMix = easeSmooth((t - T.pageSwapAt) / T.pageSwapDuration);
  logo.alpha = 1 - fx.pageMix;

  const S = CONFIG.swarm;
  const spawnStart = T.reaction * 0.7;
  if (t >= spawnStart && t < T.cover) {
    let rate, mix;
    if (t < T.build) {
      rate = mixf(
        S.spawnRate.build[0],
        S.spawnRate.build[1],
        (t - spawnStart) / (T.build - spawnStart)
      );
      mix = S.mix.build;
    } else if (t < T.swarm) {
      rate = S.spawnRate.swarm;
      mix = S.mix.swarm;
    } else {
      rate = S.spawnRate.cover;
      mix = S.mix.cover;
    }
    const maxSwarm = S.maxBirds[view.device];
    rate *= maxSwarm / S.maxBirds.desktop;
    spawnAccum += rate * dt;
    while (spawnAccum >= 1) {
      spawnAccum -= 1;
      if (counts.swarm >= maxSwarm) {
        spawnAccum = 0;
        break;
      }
      const r = Math.random() * (mix[0] + mix[1] + mix[2]);
      if (r < mix[0]) spawnEmerge();
      else if (r < mix[0] + mix[1]) spawnStream();
      else spawnNear();
      counts.swarm++;
    }
  }

  while (fgPlan.next < fgPlan.n && t >= fgPlan.times[fgPlan.next]) {
    spawnFore(fgPlan.next);
    fgPlan.next++;
  }

  if (state !== STATE.DISPERSE) return;
  // Normal ending: the frame has been clear of birds for a short hold (and the flock had
  // its nominal time). Birds leave by flying out, never by a global dissolve.
  if (counts.exitVisible === 0) {
    if (exitClearSince < 0) exitClearSince = t;
  } else exitClearSince = -1;
  if (
    exitClearSince >= 0 &&
    t - exitClearSince >= T.exitClearHold &&
    t >= T.earliestComplete
  ) {
    finishTransition();
    return;
  }
  // Rare stragglers: first a stronger, still smooth exit; only then a fade; then a hard end.
  if (!exitAssisted && t >= T.exitAssistAt) {
    exitAssisted = true;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b.active || !b.visible) continue;
      if (b.kind === KIND_FORE) {
        b.fVx *= 1.6;
        b.fVy *= 1.3;
        if (!b.leaving) b.leaveAt = b.age;
      } else b.startExit(2);
    }
  }
  if (!exitFading && t >= T.emergencyFadeAt) {
    exitFading = true;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (b.active && b.visible) b.fadeOut = 1 / T.emergencyFadeDuration;
    }
  }
  if (t >= T.emergencyFadeAt + T.emergencyFadeDuration + T.exitClearHold)
    finishTransition();
}

function finishTransition() {
  if (state === STATE.COMPLETE) return;
  for (let i = 0; i < pool.length; i++) pool[i].active = false;
  counts.active = counts.idle = counts.swarm = counts.fore = 0;
  state = STATE.COMPLETE;
  fx.pageMix = 1;
  fx.birdFade = 0;
  logo.alpha = 0;
  onTransitionComplete();
  render();
  noLoop();
}

function resetToIdle() {
  for (let i = 0; i < pool.length; i++) pool[i].active = false;
  reducedMotion = prefersReducedMotion();
  state = STATE.IDLE;
  transitionStart = 0;
  spawnAccum = 0;
  exitClearSince = -1;
  exitAssisted = false;
  exitFading = false;
  fgPlan.n = 0;
  fgPlan.next = 0;
  fx.pageMix = 0;
  fx.birdFade = 1;
  logo.scale = 1;
  logo.alpha = 1;
  counts.swarm = 0;
  const n = idleTarget();
  for (let i = 0; i < n - 1; i++) spawnIdle(true);
  counts.idle = n - 1;
  nextIdleSpawn = clock + rand(1.5, 4);
  nextNearPass = clock + rand(2.5, 6);
  loop();
}

// -----------------------------------------------------------------------------
// 7. p5 LIFECYCLE
// -----------------------------------------------------------------------------
function setup() {
  // The sketch only runs inside the intro shell. Without it (non-homepage, or the
  // theme editor suppressing the snippet) stay inert rather than attaching a
  // stray canvas to <body>.
  const mount = document.querySelector(MOUNT_SELECTOR);
  if (!mount) {
    noCanvas();
    noLoop();
    return;
  }
  mounted = true;
  createCanvas(windowWidth, windowHeight).parent(mount);
  pixelDensity(CONFIG.perf.pixelDensity);
  view.pd = pixelDensity();
  FILTER_OK = detectFilter();
  buildPalette();
  computeView();
  buildBackground();
  buildNearLayers();
  buildPool();
  layoutLogo();
  resetToIdle();
}

function draw() {
  const dt =
    Math.max(0, Math.min(deltaTime || 0, CONFIG.perf.maxDeltaMs)) / 1000;
  advanceFrame(dt);
}

function advanceFrame(dt) {
  clock += dt;
  updateTimeline(dt);
  updateFlock(dt);
  sortByDepth();
  updateHover();
  render();
  if (debugOn) drawDebug(dt);
}

function windowResized() {
  if (!mounted) return;
  resizeCanvas(windowWidth, windowHeight, true);
  view.pd = pixelDensity();
  computeView();
  buildBackground();
  buildNearLayers();
  layoutLogo();
  if (state === STATE.COMPLETE) redraw();
}

function computeView() {
  view.w = width;
  view.h = height;
  view.cx = width * 0.5;
  view.cy = height * 0.5;
  view.halfW = width * 0.5;
  view.halfH = height * 0.5;
  view.F = (width + height) * 0.5;
  const minDim = Math.min(width, height);
  view.device =
    width < 700 || minDim < 500
      ? "mobile"
      : width < 1100
      ? "tablet"
      : "desktop";
}

// -----------------------------------------------------------------------------
// 8. RENDERING
// -----------------------------------------------------------------------------
function rgbStr(c, a) {
  return a === undefined
    ? `rgb(${c[0]},${c[1]},${c[2]})`
    : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

function buildPalette() {
  const B = CONFIG.theme.bird,
    V = CONFIG.theme.birdVariance;
  PALETTE.length = 0;
  for (let i = 0; i < 8; i++) {
    const k = 1 - V * (i / 7);
    PALETTE.push(
      rgbStr([Math.round(B[0] * k), Math.round(B[1] * k), Math.round(B[2] * k)])
    );
  }
  LOGO_FILL = rgbStr(CONFIG.theme.logo);
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function detectFilter() {
  try {
    const c = makeCanvas(2, 2).getContext("2d");
    if (!("filter" in c)) return false;
    c.filter = "blur(2px)";
    return c.filter === "blur(2px)";
  } catch (e) {
    return false;
  }
}

// Charcoal + soft vignette + static grain, rendered once per resize.
function buildBackground() {
  const T = CONFIG.theme,
    pd = view.pd;
  bgCanvas = makeCanvas(view.w * pd, view.h * pd);
  const g = bgCanvas.getContext("2d");
  g.setTransform(pd, 0, 0, pd, 0, 0);
  g.fillStyle = rgbStr(T.background);
  g.fillRect(0, 0, view.w, view.h);
  if (T.vignetteStrength > 0) {
    const R = Math.hypot(view.w, view.h) * 0.6;
    const rg = g.createRadialGradient(
      view.cx,
      view.cy,
      R * 0.25,
      view.cx,
      view.cy,
      R
    );
    rg.addColorStop(0, rgbStr(T.vignette, 0));
    rg.addColorStop(1, rgbStr(T.vignette, T.vignetteStrength));
    g.fillStyle = rg;
    g.fillRect(0, 0, view.w, view.h);
  }
  if (T.grain > 0) {
    const tile = makeCanvas(128, 128),
      tg = tile.getContext("2d");
    const img = tg.createImageData(128, 128),
      d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    tg.putImageData(img, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = T.grain;
    g.fillStyle = g.createPattern(tile, "repeat");
    g.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
    g.globalAlpha = 1;
  }
}

function buildNearLayers() {
  const k = CONFIG.camera.nearLayerScale;
  nearA = makeCanvas(view.w * k, view.h * k);
  nearB = makeCanvas(view.w * k, view.h * k);
  nearC = makeCanvas((view.w * k) / 1.4, (view.h * k) / 1.4); // scratch for the fallback blur
}

// radius (px, at full resolution) of the defocus disc for a bird at distance Z
function blurRadius(Z, s) {
  const C = CONFIG.camera,
    fd = C.focusDepth;
  const d = 1 / Z - 1 / fd;
  const r = 0.5 * view.F * (d > 0 ? C.apertureNear * d : -C.apertureFar * d);
  return Math.min(r, s * C.maxBlurFrac);
}

function depthOpacity(Z) {
  const C = CONFIG.camera;
  if (Z > C.fogEnd)
    return (
      C.opacityFar * (1 - easeSmooth((Z - C.fogEnd) / CONFIG.exit.hazeVanish))
    );
  return mixf(
    C.opacityNear,
    C.opacityFar,
    easeSmooth((Z - C.fogStart) / (C.fogEnd - C.fogStart))
  );
}

// Draw one bird as N accumulated samples: motion blur (position + wing phase over
// the shutter) and defocus (samples spread over a disc). k = layer scale.
function drawBird(ctx, b, k, residualOnly) {
  const Z = b.Z,
    iz = 1 / Z,
    F = view.F;
  const s = b.s * k;
  const ox = b.sx * k,
    oy = b.sy * k;
  const sh = CONFIG.camera.shutter * (k < 1 ? CONFIG.camera.nearShutter : 1);
  const svx = F * (b.vx * Z - b.X * b.vz) * iz * iz * k * sh; // screen motion over the shutter
  const svy = -F * (b.vy * Z - b.Y * b.vz) * iz * iz * k * sh;
  const grow = -b.vz * iz * sh * (k < 1 ? 0.35 : 1); // size change over the shutter
  let r = blurRadius(Z, b.s) * k;
  if (residualOnly)
    r = Math.sqrt(Math.max(0, r * r - nearMinBlur * nearMinBlur));
  const blurLen = Math.hypot(Math.hypot(svx, svy) + Math.abs(grow) * s, r * 2);
  const P = CONFIG.perf;
  const maxN = k < 1 ? P.maxSamplesNear : P.maxSamples;
  const spacing = k < 1 ? P.sampleSpacing * 0.7 : P.sampleSpacing;
  // wing-tip travel over the shutter also needs samples
  const wingSmear = b.flapA * b.amp * b.hz * sh * TAU_ * s * 0.3;
  const n = Math.max(
    1,
    Math.min(maxN, 1 + Math.ceil(Math.max(blurLen, wingSmear) / spacing))
  );
  const alpha = b.alpha;
  if (alpha <= 0.003) return;
  const a = n === 1 ? alpha : 1 - Math.pow(1 - Math.min(alpha, 0.995), 1 / n);
  // wingtip level of detail from the size the bird renders at in this layer, reduced by
  // defocus (blurred fingers are invisible anyway), with hysteresis against flicker
  const Ld = CONFIG.lod;
  const hs = s * (1 - clamp01(blurRadius(Z, b.s) / (b.s * Ld.blurHide)));
  let lod = b.lod;
  if (hs > Ld.fullFingersAbove * 1.08) lod = 2;
  else if (lod === 2 && hs < Ld.fullFingersAbove * 0.92) lod = 1;
  if (hs < Ld.fingersAbove * 0.92) lod = 0;
  else if (lod === 0 && hs > Ld.fingersAbove * 1.08) lod = 1;
  b.lod = LOD_LEVEL = lod;
  LOD_SPLAY = mixf(
    Ld.mediumSplay,
    1,
    clamp01((hs - Ld.fingersAbove) / (Ld.fullFingersAbove - Ld.fingersAbove))
  );
  ctx.fillStyle = b.color;
  ctx.strokeStyle = b.color;
  // Edge thickness stroke only where it matters: small birds (cheap closed-tip paths).
  // Larger birds get their thickness from the wing's angle of attack.
  const stroke = lod === 0 && k === 1;
  ctx.lineWidth = Math.max(0.6 * k, CONFIG.bird.thickness * s);
  ctx.globalAlpha = a;
  const rot = b.m1 * 1.7;
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : (i + 0.5) / n - 0.5;
    let jx = 0,
      jy = 0;
    if (r > 0.25 && n > 1) {
      const rad = r * Math.sqrt((i + 0.5) / n),
        th = i * 2.39996 + rot;
      jx = Math.cos(th) * rad;
      jy = Math.sin(th) * rad;
    }
    computePose(b, b.phase + b.hz * u * sh * (k < 1 ? 0.3 : 0.6));
    setProjection(b, ox + svx * u + jx, oy + svy * u + jy, s * (1 + grow * u));
    emitBird(ctx, b);
    ctx.fill();
    if (stroke) ctx.stroke();
  }
  counts.samples += n;
}

function render() {
  const ctx = drawingContext,
    pd = view.pd;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  // The real page is the destination: it is already rendered in the DOM behind this
  // canvas. So each frame starts fully transparent and the charcoal landing
  // background is laid over it at 1 - pageMix; as pageMix reaches 1 the canvas is
  // clear and the storefront shows through, with the birds still drawn on top.
  const m = fx.pageMix;
  ctx.clearRect(0, 0, view.w * pd, view.h * pd);
  if (m < 0.999) {
    ctx.globalAlpha = 1 - m;
    ctx.drawImage(bgCanvas, 0, 0);
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(pd, 0, 0, pd, 0, 0);

  counts.drawn = 0;
  counts.samples = 0;
  counts.near = 0;
  ctx.lineJoin = "round";
  const fd = CONFIG.camera.focusDepth,
    nearZ = CONFIG.camera.nearLayerDepth;
  let logoDrawn = logo.alpha <= 0.001;
  nearActive = false;
  nearMinBlur = 1e9;

  for (let i = 0; i < order.length; i++) {
    const b = order[i];
    if (!b.active) break; // inactive birds sort to the end
    if (!logoDrawn && b.Z < fd) {
      drawLogo(ctx);
      logoDrawn = true;
    }
    b.alpha = b.fade * fx.birdFade * depthOpacity(b.Z);
    if (!b.onScreen || b.alpha <= 0.003) continue;
    if (b.Z < nearZ) {
      // handled by the soft layer
      nearActive = true;
      nearMinBlur = Math.min(
        nearMinBlur,
        blurRadius(b.Z, b.s) * CONFIG.camera.nearLayerScale
      );
      continue;
    }
    drawBird(ctx, b, 1, false);
    counts.drawn++;
  }
  if (!logoDrawn) drawLogo(ctx);
  ctx.globalAlpha = 1;
  if (nearActive) renderNearLayer(ctx);
}

// Birds close to the lens: drawn at low resolution, blurred as a layer (where the
// browser supports canvas filters), then scaled up: cheap, and genuinely soft.
function renderNearLayer(mainCtx) {
  const k = CONFIG.camera.nearLayerScale,
    nearZ = CONFIG.camera.nearLayerDepth;
  const g = nearA.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.clearRect(0, 0, nearA.width, nearA.height);
  g.lineJoin = "round";
  const useFilter = FILTER_OK;
  const baseBlur = nearMinBlur;
  for (let i = 0; i < order.length; i++) {
    const b = order[i];
    if (!b.active) break;
    if (b.Z >= nearZ || !b.onScreen || b.alpha <= 0.003) continue;
    drawBird(g, b, k, true);
    counts.drawn++;
    counts.near++;
  }
  g.globalAlpha = 1;
  let src = nearA;
  {
    // always soften: never show upscaled pixels
    const h = nearB.getContext("2d");
    h.setTransform(1, 0, 0, 1, 0, 0);
    h.clearRect(0, 0, nearB.width, nearB.height);
    if (useFilter) {
      const q = Math.max(2, Math.round(baseBlur * 1.6)); // quantised to 0.5 px, cached string
      if (q !== blurKey) {
        blurKey = q;
        blurStr = `blur(${(q * 0.5).toFixed(1)}px)`;
      }
      h.filter = blurStr;
      h.drawImage(nearA, 0, 0);
      h.filter = "none";
    } else {
      // no canvas filters (e.g. Safari): blur by shrinking and re-enlarging with smoothing
      const d = clampv(baseBlur * 1.1, 2, 8);
      const sw = Math.max(1, Math.round(nearA.width / d)),
        shh = Math.max(1, Math.round(nearA.height / d));
      const c = nearC.getContext("2d");
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.imageSmoothingEnabled = true;
      h.imageSmoothingEnabled = true;
      c.clearRect(0, 0, nearC.width, nearC.height);
      if (d > 3) {
        // two halvings keep the average smooth
        h.drawImage(nearA, 0, 0, nearA.width * 0.5, nearA.height * 0.5);
        c.drawImage(
          nearB,
          0,
          0,
          nearA.width * 0.5,
          nearA.height * 0.5,
          0,
          0,
          sw,
          shh
        );
        h.clearRect(0, 0, nearB.width, nearB.height);
      } else {
        c.drawImage(nearA, 0, 0, sw, shh);
      }
      h.drawImage(nearC, 0, 0, sw, shh, 0, 0, nearB.width, nearB.height);
    }
    src = nearB;
  }
  mainCtx.setTransform(1, 0, 0, 1, 0, 0);
  mainCtx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in mainCtx)
    mainCtx.imageSmoothingQuality = "high";
  mainCtx.drawImage(src, 0, 0, view.w * view.pd, view.h * view.pd);
  mainCtx.setTransform(view.pd, 0, 0, view.pd, 0, 0);
}

function drawLogo(ctx) {
  if (logo.alpha <= 0.001) return;
  const pd = view.pd,
    s = logo.scale;
  ctx.setTransform(
    pd * s,
    0,
    0,
    pd * s,
    pd * logo.cx * (1 - s),
    pd * logo.cy * (1 - s)
  );
  ctx.globalAlpha = logo.alpha;
  ctx.fillStyle = LOGO_FILL;
  ctx.textBaseline = "alphabetic";
  for (let i = 0; i < logo.n; i++) {
    ctx.font = logo.fonts[i];
    setSpacing(ctx, logo.spacings[i]);
    ctx.textAlign = logo.aligns[i];
    ctx.fillText(CONFIG.logo.lines[i].text, logo.xs[i], logo.ys[i]);
  }
  setSpacing(ctx, "0px");
  ctx.setTransform(pd, 0, 0, pd, 0, 0);
  ctx.globalAlpha = 1;
}

// Measure and place the logo (stacked or inline); the hit area is the glyph bounds.
function layoutLogo() {
  const ctx = drawingContext,
    C = CONFIG.logo,
    L = C.lines;
  const stacked = C.layout === "stacked";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  // width at 100px
  let w100 = 0;
  const widths = [];
  for (let i = 0; i < L.length; i++) {
    ctx.font = `${L[i].weight} 100px ${C.font}`;
    setSpacing(ctx, (L[i].tracking * 100).toFixed(2) + "px");
    widths[i] = ctx.measureText(L[i].text).width;
    w100 = stacked ? Math.max(w100, widths[i]) : w100 + widths[i];
  }
  const frac =
    view.device === "mobile"
      ? C.widthMobile
      : view.device === "tablet"
      ? C.widthTablet
      : C.widthDesktop;
  const hFactor = stacked ? L.length * C.leading : 1;
  let size = (frac * view.w) / (w100 / 100);
  size = Math.min(size, C.maxSize, (view.h * C.maxHeightFrac) / hFactor);
  size = Math.max(size, C.minSize);
  logo.size = size;
  logo.n = L.length;
  logo.fonts.length = logo.spacings.length = logo.aligns.length = 0;
  const lw = [],
    asc = [],
    desc = [];
  for (let i = 0; i < L.length; i++) {
    logo.fonts.push(`${L[i].weight} ${size.toFixed(2)}px ${C.font}`);
    logo.spacings.push((L[i].tracking * size).toFixed(2) + "px");
    ctx.font = logo.fonts[i];
    setSpacing(ctx, logo.spacings[i]);
    const m = ctx.measureText(L[i].text);
    lw[i] = m.width;
    asc[i] = m.actualBoundingBoxAscent || size * 0.72;
    desc[i] = m.actualBoundingBoxDescent || size * 0.02;
  }
  setSpacing(ctx, "0px");
  logo.cx = view.cx;
  logo.cy = view.cy;
  let blockW, top, bottom;
  if (stacked) {
    blockW = Math.max(...lw);
    const lh = size * C.leading;
    // baselines relative to the first; then centre the glyph block vertically
    let y = 0;
    top = -asc[0];
    bottom = 0;
    for (let i = 0; i < L.length; i++) {
      logo.ys[i] = y;
      bottom = y + desc[i];
      y += lh;
    }
    const off = view.cy - (top + bottom) * 0.5;
    for (let i = 0; i < L.length; i++) logo.ys[i] += off;
    top += off;
    bottom += off;
    const left = view.cx - blockW * 0.5,
      right = view.cx + blockW * 0.5;
    for (let i = 0; i < L.length; i++) {
      logo.aligns.push(C.align);
      logo.xs[i] =
        C.align === "left" ? left : C.align === "right" ? right : view.cx;
    }
  } else {
    blockW = lw.reduce((s, v) => s + v, 0);
    const a = Math.max(...asc),
      d = Math.max(...desc);
    const base = view.cy + (a - d) * 0.5;
    let x = view.cx - blockW * 0.5;
    for (let i = 0; i < L.length; i++) {
      logo.aligns.push("left");
      logo.xs[i] = x;
      logo.ys[i] = base;
      x += lw[i];
    }
    top = base - a;
    bottom = base + d;
  }
  const pad = C.hitPadding * size;
  const halfH = Math.max((bottom - top) * 0.5 + pad, C.minHitHeight * 0.5);
  const midY = (top + bottom) * 0.5;
  logo.x0 = view.cx - blockW * 0.5 - pad;
  logo.x1 = view.cx + blockW * 0.5 + pad;
  logo.y0 = midY - halfH;
  logo.y1 = midY + halfH;
}

function setSpacing(ctx, v) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = v;
}

// -----------------------------------------------------------------------------
// 9. PUBLIC API + INPUT
// -----------------------------------------------------------------------------
// Call from anywhere (e.g. an HTML logo's click handler). Returns true if the
// transition started; repeated calls while it is playing are ignored.
function triggerAnimation() {
  if (state !== STATE.IDLE) return false;
  transitionStart = clock;
  if (hovering) {
    hovering = false;
    cursor(ARROW);
  }
  if (reducedMotion) {
    state = STATE.REDUCED;
    return true;
  }
  flowDir = Math.random() < 0.5 ? -1 : 1;
  spawnAccum = 0;
  counts.swarm = 0;
  exitClearSince = -1;
  exitAssisted = false;
  exitFading = false;
  planForeground();
  state = STATE.REACTION;
  onEnterReaction();
  return true;
}

// Hook: replace with routing (e.g. window.location = '/home') when ready.
function onTransitionComplete() {
  if (typeof window !== "undefined" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("flocktransition:complete"));
  }
}

function prefersReducedMotion() {
  return (
    CONFIG.reducedMotion.respect &&
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function hitLogo(x, y) {
  return x >= logo.x0 && x <= logo.x1 && y >= logo.y0 && y <= logo.y1;
}

function handlePointer(x, y) {
  if (state !== STATE.IDLE || !hitLogo(x, y)) return false;
  triggerAnimation();
  return true;
}

function mousePressed() {
  if (handlePointer(mouseX, mouseY)) return false;
}

function touchStarted() {
  // p5 1.x touch path (2.x routes touches to mousePressed)
  const t = touches && touches.length ? touches[0] : null;
  if (handlePointer(t ? t.x : mouseX, t ? t.y : mouseY)) return false;
}

function updateHover() {
  const over = state === STATE.IDLE && hitLogo(mouseX, mouseY);
  if (over !== hovering) {
    hovering = over;
    cursor(over ? HAND : ARROW);
  }
}

function keyPressed() {
  // Authoring shortcuts only: p5 listens on window, so in production any
  // visitor keypress would reach them.
  if (!CONFIG.debug) return;
  if (key === "r" || key === "R") resetToIdle();
  else if (key === "d" || key === "D") {
    debugOn = !debugOn;
    if (state === STATE.COMPLETE) redraw();
  }
}

// -----------------------------------------------------------------------------
// 10. DEBUG + HELPERS
// -----------------------------------------------------------------------------
function drawDebug(dt) {
  if (dt > 0) fpsSmoothed += (1 / dt - fpsSmoothed) * 0.08;
  const ctx = drawingContext;
  ctx.setTransform(view.pd, 0, 0, view.pd, 0, 0);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = CONFIG.theme.debug;
  ctx.lineWidth = 1;
  if (state !== STATE.COMPLETE)
    ctx.strokeRect(logo.x0, logo.y0, logo.x1 - logo.x0, logo.y1 - logo.y0);
  const t = state === STATE.IDLE ? 0 : clock - transitionStart;
  const lines = [
    `state    ${state}`,
    `fps      ${fpsSmoothed.toFixed(0)}`,
    `birds    ${counts.active} active / ${counts.drawn} drawn (${counts.near} soft)`,
    `         idle ${counts.idle}  swarm ${counts.swarm}  fore ${counts.fore}  in view ${counts.exitVisible}`,
    `samples  ${counts.samples}   blur: ${FILTER_OK ? "filter" : "samples"}`,
    `t        ${t.toFixed(2)} s`,
    `viewport ${view.w}×${view.h} (${view.device})`,
    `R reset · D debug`,
  ];
  ctx.font = "11px ui-monospace, Menlo, Consolas, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(8, 8, 300, lines.length * 14 + 10);
  ctx.fillStyle = CONFIG.theme.debug;
  for (let i = 0; i < lines.length; i++)
    ctx.fillText(lines[i], 14, 13 + i * 14);
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}
function rr(r) {
  return r[0] + Math.random() * (r[1] - r[0]);
}
function mixf(a, b, t) {
  return a + (b - a) * t;
}
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampv(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function easeSmooth(t) {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}
function easeOutCubic(t) {
  t = clamp01(t);
  return 1 - Math.pow(1 - t, 3);
}
function wrapAngle(a) {
  while (a > Math.PI) a -= TAU_;
  while (a < -Math.PI) a += TAU_;
  return a;
}
