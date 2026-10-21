// =============================================================================
//  seventeeneighteennineteen · password page flock
//  p5.js instance mode (1.x and 2.x) · 2D renderer · no external assets
// =============================================================================
//
//  Red-tailed Hawks streaming across the password page, as a loose migration
//  stream along one diagonal band (the D09 design in the Figma): in from the
//  lower left, over the stacked name, out at the upper right.
//
//  The bird itself (anatomy, morphology, wingbeat, flap bouts and glides,
//  articulated 3D projection) is copied from flock-transition.js §3–4, so the
//  hawks here are the homepage's hawks, measurement for measurement. It is a
//  copy rather than a shared module so the homepage engine stays untouched.
//  Only the flight is new, and the rendering is simpler: these birds are small
//  and far, so there is no depth of field, motion blur or near layer.
//
//  The canvas is transparent and ignores the pointer: the page's own ground,
//  grain, type and forms are the real DOM underneath and on top.
// =============================================================================
(function () {
  "use strict";

  const mount = document.querySelector("[data-password-flock]");
  if (!mount || typeof window.p5 !== "function") return;

  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------
  const CONFIG = {
    color: [206, 206, 201], // the homepage's pale grey birds
    colorVariance: 0.1,

    // Red-tailed Hawk (Buteo jamaicensis): flock-transition.js CONFIG.bird, as is
    bird: {
      size: [0.86, 1.14],
      morph: {
        stockyBias: 0.35,
        bodyBulk: 0.08,
        wingChord: 0.08,
        wingLength: 0.02,
        tailLength: 0.1,
        tailWidth: 0.06,
        headScale: 0.03,
        longWing: [0, 0.07],
        primaryLength: [0.96, 1.05],
        splayBias: [-0.1, 0.1],
        jitter: 0.015,
      },
      flapHzCalm: [2.2, 3.1],
      hzSizeCorrelation: 0.6,
      flapAmp: [0.72, 0.9],
      flapMid: 0.12,
      downstroke: [0.52, 0.58],
      upstrokeFold: [0.45, 0.8],
      armFold: 0.18,
      handFold: 1.15,
      glideDihedral: [0.03, 0.2],
      glideHand: [-0.06, 0.05],
      glideSweep: [0, 0.06],
      flapStartCalm: 0.3,
      glideCalm: [2.2, 6.5],
      beatsCalm: [1, 4],
      maxBank: 0.95,
      bankGain: 0.5,
      thickness: 0.028,
      attackArm: 0.3,
      attackHand: 0.2,
      twistStroke: 0.35,
      handTwistShare: 0.6,
      bodyAttitude: 0.12,
      splayGlide: 1.0,
      splayDownstroke: 0.8,
      splayUpstroke: 0.35,
      splayTurn: 0.3,
      splayBrake: 0.3,
      fingerCurl: 0.045,
      fingerStagger: 0.14,
      tailFanPowered: 0.84,
      tailFanGlide: 1.0,
      tailFanTurn: 0.4,
      tailFanBrake: 0.35,
      tailFanMax: 1.45,
    },

    lod: {
      fingersAbove: 15, // projected half-span (px): below, one closed rounded wingtip
      fullFingersAbove: 42,
      mediumSplay: 0.55,
    },

    stream: {
      count: { desktop: 84, mobile: 36 },
      // [near, far, share]: mostly far, so most birds are small marks, as drawn
      depthBands: [
        [40, 80, 0.2],
        [80, 150, 0.4],
        [150, 240, 0.4],
      ],
      // A phone's camera is "wider" (focal length follows the screen size), so
      // the stream flies nearer there to keep the birds about the same size.
      depthScale: { desktop: 1, mobile: 0.6 },
      speed: [4.5, 7], // world units / s: an unhurried glide across the page
      yawSpread: 0.35, // rad off straight across: some drift toward or away from us
      maxTurnRate: 0.8,
      // The band's centre line, as a cubic Bézier in fractions of the viewport
      // (x across, y down); x only ever increases along it.
      band: {
        desktop: [
          [-0.05, 0.68],
          [0.25, 0.3],
          [0.55, 0.62],
          [1.05, 0.22],
        ],
        mobile: [
          [-0.08, 0.4],
          [0.3, 0.18],
          [0.66, 0.4],
          [1.1, 0.17],
        ],
      },
      spread: { desktop: 0.075, mobile: 0.055 }, // band half-thickness (1σ), × viewport height
      fadeIn: 1.4, // s for the whole stream to appear on load
    },

    fog: { start: 60, end: 260, near: 0.9, far: 0.3 }, // opacity by distance

    maxPixelDensity: 2, // small silhouettes need the extra pixels on retina
    maxDeltaMs: 50,
  };

  const TAU_ = Math.PI * 2;

  // ---------------------------------------------------------------------------
  // BIRD MODEL (flock-transition.js §3, unchanged)
  // ---------------------------------------------------------------------------
  // Local frame: +x forward, +y up, +z right wing. Units: half wingspan ≈ 1.
  const MODEL = {
    body: [-0.04, 0, 0, 0.29, 0.125, 0.13],
    neck: [0.13, 0.03, 0, 0.115, 0.1, 0.108],
    head: [0.225, 0.048, 0, 0.088, 0.08, 0.084],
    bill: [0.305, 0.032, 0, 0.034, 0.027, 0.022],
    hook: [0.3, 0.058, 0.335, 0.05, 0.342, 0.022, 0.328, 0.016, 0.308, 0.03],
    shoulder: [0.07, 0.04, 0.07],
    armLen: 0.43,
    arm: [
      -0.03, 0.105, 0.12, 0.125, 0.28, 0.12, 0.44, 0.1, 0.44, -0.205, 0.4, -0.24,
      0.34, -0.275, 0.26, -0.3, 0.17, -0.31, 0.08, -0.3, 0.0, -0.278, -0.03,
      -0.25,
    ],
    hand: [
      -0.06, 0.1, 0.1, 0.095, 0.22, 0.085, 0.31, 0.06, 0.35, 0.01, 0.35, -0.08,
      0.31, -0.155, 0.22, -0.197, 0.1, -0.212, -0.06, -0.215,
    ],
    handTip: [
      0.26, 0.075, 0.42, 0.085, 0.52, 0.05, 0.565, -0.02, 0.55, -0.09, 0.48,
      -0.16, 0.37, -0.2, 0.26, -0.19,
    ],
    primaries: [
      0.285, 0.055, 0.32, 0.175, 0.048, 0.305, 0.015, 0.14, 0.23, 0.052, 0.31,
      -0.035, -0.04, 0.245, 0.054, 0.295, -0.085, -0.22, 0.225, 0.054, 0.265,
      -0.13, -0.4, 0.185, 0.052,
    ],
    splayCentre: -0.04,
    feather: [
      -0.2, -0.5, 0.35, -0.5, 0.5, -0.37, 0.8, -0.33, 0.93, -0.22, 1, 0, 0.93,
      0.22, 0.8, 0.33, 0.5, 0.37, 0.35, 0.5, -0.2, 0.5,
    ],
    featherLo: [-0.2, -0.5, 0.45, -0.45, 1, 0, 0.45, 0.45, -0.2, 0.5],
    tailRoot: -0.26,
    tail: [
      0, -0.075, -0.17, -0.15, -0.245, -0.165, -0.268, -0.12, -0.278, -0.06,
      -0.28, 0, -0.278, 0.06, -0.268, 0.12, -0.245, 0.165, -0.17, 0.15, 0, 0.075,
    ],
    tailLen: 0.28,
    keel: [0.04, 0.05, -0.25, 0.018, -0.275, -0.008, 0.04, -0.07],
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
    LOD_SPLAY = 1;
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
  const PX = new Float32Array(64);
  const BILL = new Float32Array(6);
  let M0 = 0,
    M1 = 0,
    M2 = 0,
    M3 = 0,
    M4 = 0,
    M5 = 0,
    OX = 0,
    OY = 0;

  function computePose(b, phase) {
    const W = CONFIG.bird;
    const p = phase - Math.floor(phase);
    const ds = b.downstroke;
    const q = p < ds ? (0.5 * p) / ds : 0.5 + (0.5 * (p - ds)) / (1 - ds);
    const ang = TAU_ * q,
      c = Math.cos(ang),
      s = Math.sin(ang);
    const A = b.flapA;
    const up = A * Math.max(0, -s);
    const fold = up * b.fold;
    POSE.eArm = mixf(b.glideE, W.flapMid, A) + A * b.amp * c;
    POSE.sArm = mixf(b.glideSweep, 0.03, A) + fold * W.armFold;
    POSE.armScale = 1 - 0.08 * fold;
    POSE.eHand =
      POSE.eArm +
      mixf(b.glideHand, 0, A) +
      A * 0.5 * b.amp * Math.cos(ang - 0.95);
    POSE.sHand = mixf(b.glideSweep * 1.3 + 0.03, 0.06, A) + fold * W.handFold;
    POSE.handScale = 1 - 0.18 * fold;
    POSE.tailPitch = b.tailPitch + A * 0.07 * s;
    const tw = A * W.twistStroke * s;
    POSE.aArm = W.attackArm - tw * 0.4;
    POSE.aHand = W.attackHand - tw * W.handTwistShare + fold * 0.5;
    POSE.bob = A * 0.035 * s;
    let splay = mixf(W.splayGlide, W.splayDownstroke, A);
    splay = mixf(splay, W.splayUpstroke, up);
    POSE.primarySplay = clampv(
      splay + W.splayTurn * b.maneuver + W.splayBrake * b.brakeAmt + b.splayBias,
      0.2,
      1.5
    );
    POSE.primaryCurl = W.fingerCurl * (1 + A * (0.6 * s - 0.5));
    POSE.tailFan = Math.min(
      W.tailFanMax,
      mixf(W.tailFanGlide, W.tailFanPowered, A) +
        W.tailFanTurn * b.maneuver +
        W.tailFanBrake * b.brakeAmt
    );
  }

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

  function setWingFrame(ox, oy, oz, e, sg, side, att) {
    const se = Math.sin(e),
      ce = Math.cos(e),
      ss = Math.sin(sg),
      cs = Math.cos(sg);
    const ax = -ss,
      ay = cs * se,
      az = cs * ce * side;
    const c0x = cs,
      c0y = ss * se,
      c0z = ss * ce * side;
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
      const lift = stag * (2 - f) * 0.5 * L;
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
    const bx = 1 + (bulk - 1) * 0.3;
    ctx.beginPath();
    emitEllipsoid(ctx, MODEL.body, dy, bx, bulk);
    emitEllipsoid(ctx, MODEL.neck, dy, bx, bulk);
    emitEllipsoid(ctx, MODEL.head, dy, hs, hs);
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
      const L = MODEL.armLen * armU;
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

  // ---------------------------------------------------------------------------
  // VIEW + BAND
  // ---------------------------------------------------------------------------
  const view = { w: 1, h: 1, cx: 0, cy: 0, F: 1, device: "desktop" };
  let band = CONFIG.stream.band.desktop,
    spreadPx = 60;
  const PALETTE = [];
  let reducedMotion = false,
    clock = 0;

  function computeView(p) {
    view.w = p.width;
    view.h = p.height;
    view.cx = p.width * 0.5;
    view.cy = p.height * 0.5;
    view.F = (p.width + p.height) * 0.5; // as the homepage camera
    view.device = p.width <= 700 ? "mobile" : "desktop";
    band = CONFIG.stream.band[view.device];
    spreadPx = CONFIG.stream.spread[view.device] * view.h;
  }

  function bez(c, t) {
    const u = 1 - t;
    return u * u * u * c[0] + 3 * u * u * t * c[1] + 3 * u * t * t * c[2] + t * t * t * c[3];
  }
  const BX = [0, 0, 0, 0],
    BY = [0, 0, 0, 0];

  // The band's centre (px, down) at screen x (px): the curve's x only ever
  // increases, so its parameter is found by bisection.
  function bandY(x) {
    for (let i = 0; i < 4; i++) {
      BX[i] = band[i][0] * view.w;
      BY[i] = band[i][1] * view.h;
    }
    if (x <= BX[0]) return BY[0];
    if (x >= BX[3]) return BY[3];
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) * 0.5;
      if (bez(BX, mid) < x) lo = mid;
      else hi = mid;
    }
    return bez(BY, (lo + hi) * 0.5);
  }

  // ---------------------------------------------------------------------------
  // BIRD (flock-transition.js §4: morphology, wingbeat, steering, attitude)
  // ---------------------------------------------------------------------------
  class Bird {
    spawn(initial) {
      const C = CONFIG.bird,
        S = CONFIG.stream;
      this.size = rr(C.size);
      this.spawnMorph();
      this.tailPitch = rand(-0.06, 0.08);
      this.amp = rr(C.flapAmp);
      this.downstroke = rr(C.downstroke);
      this.fold = rr(C.upstrokeFold);
      this.hz = this.pickHz();
      this.phase = Math.random();
      this.newGlidePose();
      this.flapping = Math.random() < C.flapStartCalm;
      this.flapA = this.flapTarget = this.flapping ? 1 : 0;
      this.beatsLeft = rr(C.beatsCalm);
      this.glideLeft = rr(C.glideCalm);
      this.m1 = rand(0, TAU_);
      this.m2 = rand(0, TAU_);
      this.mf1 = rand(0.12, 0.35);
      this.mf2 = rand(0.25, 0.6);
      this.mYaw = rand(0.05, 0.18);
      this.mPitch = rand(0.03, 0.1);
      this.yawRate = 0;
      this.pitchRate = 0;
      this.bank = 0;
      this.maneuver = 0;
      this.brakeAmt = 0;
      this.lod = 0;
      this.turnResp = 2;
      this.bankResp = 1.8;
      this.accel = 1;
      this.maxTurn = S.maxTurnRate;
      this.color = PALETTE[Math.floor(Math.random() * PALETTE.length)];

      // Each bird keeps its own lane in the band (a fixed offset across it)
      // and its own drift toward or away from the camera.
      const ds = S.depthScale[view.device];
      this.Z = bandRand(S.depthBands) * ds;
      this.zMin = S.depthBands[0][0] * ds;
      this.zMax = S.depthBands[S.depthBands.length - 1][1] * ds;
      this.lane = clampv(gauss(), -2.2, 2.2);
      this.drift = rand(-S.yawSpread, S.yawSpread);
      this.speed = this.speedTarget = rr(S.speed);

      const iz = 1 / this.Z;
      const R = view.F * this.size * iz * 1.3;
      const sx = initial ? rand(-0.05, 1.0) * view.w : -R - rand(0, 0.25 * view.w);
      const sy = bandY(sx) + this.lane * spreadPx;
      this.X = (sx - view.cx) * this.Z / view.F;
      this.Y = -(sy - view.cy) * this.Z / view.F;
      this.yaw = this.tYaw = Math.PI * 0.5 + this.drift;
      this.pitch = this.tPitch = 0;
      this.updateBasis();
      this.project();
    }

    spawnMorph() {
      const M = CONFIG.bird.morph,
        j = M.jitter;
      const t = clampv(rand(-1, 1) - M.stockyBias * Math.random(), -1, 1);
      const lw = rr(M.longWing);
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

    pickHz() {
      const C = CONFIG.bird;
      return rr(C.flapHzCalm) * (1 - C.hzSizeCorrelation * (this.size * this.bodyBulk - 1));
    }

    newGlidePose() {
      const C = CONFIG.bird;
      this.glideE = rr(C.glideDihedral);
      this.glideHand = rr(C.glideHand);
      this.glideSweep = rr(C.glideSweep);
    }

    updateFlap(dt) {
      const C = CONFIG.bird;
      if (this.flapping) {
        const before = this.phase;
        this.phase += this.hz * dt;
        if (Math.floor(this.phase) !== Math.floor(before)) {
          this.beatsLeft--;
          if (this.beatsLeft <= 0) {
            this.flapping = false;
            this.flapTarget = 0;
            this.glideLeft = rr(C.glideCalm);
            if (this.glideLeft > 0.6) this.newGlidePose();
          }
        }
      } else {
        this.phase += this.hz * dt * this.flapA;
        this.glideLeft -= dt;
        if (this.glideLeft <= 0) {
          this.flapping = true;
          this.flapTarget = 1;
          this.beatsLeft = Math.round(rr(C.beatsCalm));
        }
      }
      const rate = this.flapping ? 5 : 2.2;
      this.flapA += (this.flapTarget - this.flapA) * Math.min(1, rate * dt);
    }

    steer(dt) {
      const k = 2.2;
      const dy = wrapAngle(this.tYaw - this.yaw);
      const wantY = clampv(dy * k, -this.maxTurn, this.maxTurn);
      this.yawRate += (wantY - this.yawRate) * Math.min(1, this.turnResp * dt);
      this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
      const wantP = clampv((this.tPitch - this.pitch) * k, -this.maxTurn * 0.6, this.maxTurn * 0.6);
      this.pitchRate += (wantP - this.pitchRate) * Math.min(1, this.turnResp * dt);
      this.pitch = clampv(this.pitch + this.pitchRate * dt, -1.1, 1.1);
      const C = CONFIG.bird;
      const bankT = clampv(-this.yawRate * C.bankGain * (0.6 + this.speed * 0.06), -C.maxBank, C.maxBank);
      this.bank += (bankT - this.bank) * Math.min(1, this.bankResp * dt);
      this.speed += (this.speedTarget - this.speed) * Math.min(1, this.accel * dt);
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
        r0z = -sy;
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

    project() {
      const iz = 1 / this.Z;
      this.sx = view.cx + view.F * this.X * iz;
      this.sy = view.cy - view.F * this.Y * iz;
      this.s = view.F * this.size * iz;
    }

    update(dt) {
      this.m1 += this.mf1 * dt * TAU_;
      this.m2 += this.mf2 * dt * TAU_;
      const mY = Math.sin(this.m1) * this.mYaw + Math.sin(this.m2 * 0.7) * this.mYaw * 0.4;
      const mP = Math.sin(this.m2) * this.mPitch;

      // Keep to the band: climb or descend with its slope where the bird is,
      // and ease back toward its own lane. Drift turns around at the depth limits.
      const lead = 0.02 * view.w;
      const slope = (bandY(this.sx + lead) - bandY(this.sx - lead)) / (2 * lead);
      const off = (this.sy - (bandY(this.sx) + this.lane * spreadPx)) / spreadPx;
      if (this.Z < this.zMin) this.drift = -Math.abs(this.drift);
      else if (this.Z > this.zMax) this.drift = Math.abs(this.drift);
      this.tYaw = Math.PI * 0.5 + this.drift + mY;
      this.tPitch = clampv(Math.atan(-slope) + clampv(off * 0.12, -0.25, 0.25), -0.5, 0.5) + mP;

      this.steer(dt);
      const cp = Math.cos(this.pitch);
      this.vx = cp * Math.sin(this.yaw) * this.speed;
      this.vy = Math.sin(this.pitch) * this.speed + (this.flapping ? 0 : -0.25);
      this.vz = cp * Math.cos(this.yaw) * this.speed;
      this.X += this.vx * dt;
      this.Y += this.vy * dt;
      this.Z = Math.max(this.zMin * 0.8, this.Z + this.vz * dt);

      const man = Math.min(1.2, Math.abs(this.yawRate) + Math.abs(this.pitchRate) * 0.5);
      this.maneuver += (man - this.maneuver) * Math.min(1, 3 * dt);
      const brk = clamp01((this.speed - this.speedTarget) / (0.25 * this.speed + 0.01));
      this.brakeAmt += (brk - this.brakeAmt) * Math.min(1, 4 * dt);

      this.updateFlap(dt);
      this.updateBasis();
      this.project();

      // Out past the right edge (or lost above or below): back in at the left.
      const R = this.s * 1.3 + 40;
      if (this.sx - R > view.w || this.sy + R < 0 || this.sy - R > view.h) this.spawn(false);
    }
  }

  // ---------------------------------------------------------------------------
  // RENDERING
  // ---------------------------------------------------------------------------
  function buildPalette() {
    const B = CONFIG.color,
      V = CONFIG.colorVariance;
    PALETTE.length = 0;
    for (let i = 0; i < 8; i++) {
      const k = 1 - V * (i / 7);
      PALETTE.push(`rgb(${Math.round(B[0] * k)},${Math.round(B[1] * k)},${Math.round(B[2] * k)})`);
    }
  }

  function fogOpacity(Z) {
    const f = CONFIG.fog;
    return mixf(f.near, f.far, easeSmooth((Z - f.start) / (f.end - f.start)));
  }

  // One sample per bird (flock-transition.js drawBird without the blur samples):
  // wingtip detail by projected size, and the edge stroke for the smallest,
  // so a wing seen edge-on never disappears.
  function drawBird(ctx, b, alpha) {
    const Ld = CONFIG.lod,
      s = b.s;
    let lod = b.lod;
    if (s > Ld.fullFingersAbove * 1.08) lod = 2;
    else if (lod === 2 && s < Ld.fullFingersAbove * 0.92) lod = 1;
    if (s < Ld.fingersAbove * 0.92) lod = 0;
    else if (lod === 0 && s > Ld.fingersAbove * 1.08) lod = 1;
    b.lod = LOD_LEVEL = lod;
    LOD_SPLAY = mixf(Ld.mediumSplay, 1, clamp01((s - Ld.fingersAbove) / (Ld.fullFingersAbove - Ld.fingersAbove)));
    ctx.fillStyle = b.color;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = Math.max(0.6, CONFIG.bird.thickness * s);
    ctx.globalAlpha = alpha;
    computePose(b, b.phase);
    setProjection(b, b.sx, b.sy, s);
    emitBird(ctx, b);
    ctx.fill();
    if (lod === 0) ctx.stroke();
  }

  // ---------------------------------------------------------------------------
  // SKETCH
  // ---------------------------------------------------------------------------
  const birds = [];

  function populate() {
    const n = CONFIG.stream.count[view.device];
    birds.length = 0;
    for (let i = 0; i < n; i++) {
      const b = new Bird();
      b.spawn(true);
      birds.push(b);
    }
  }

  function render(p) {
    const ctx = p.drawingContext;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, p.width * p.pixelDensity(), p.height * p.pixelDensity());
    ctx.restore();
    ctx.lineJoin = "round";
    // Far to near, so nearer birds pass over farther ones.
    birds.sort((a, b) => b.Z - a.Z);
    const fade = reducedMotion ? 1 : easeSmooth(clock / CONFIG.stream.fadeIn);
    for (const b of birds) {
      const R = b.s * 1.3;
      if (b.sx + R < 0 || b.sx - R > view.w || b.sy + R < 0 || b.sy - R > view.h) continue;
      drawBird(ctx, b, fade * fogOpacity(b.Z / CONFIG.stream.depthScale[view.device]));
    }
    ctx.globalAlpha = 1;
  }

  new p5(function (p) {
    p.setup = function () {
      p.createCanvas(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelDensity));
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      buildPalette();
      computeView(p);
      populate();
      if (reducedMotion) {
        // A still moment of the same stream, never animated.
        p.noLoop();
        render(p);
      }
      // A hidden tab needn't keep the wings beating.
      document.addEventListener("visibilitychange", function () {
        if (reducedMotion) return;
        if (document.hidden) p.noLoop();
        else p.loop();
      });
    };

    p.draw = function () {
      if (reducedMotion) return;
      const dt = Math.max(0, Math.min(p.deltaTime || 0, CONFIG.maxDeltaMs)) / 1000;
      clock += dt;
      for (const b of birds) b.update(dt);
      render(p);
    };

    p.windowResized = function () {
      const device = view.device;
      p.resizeCanvas(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight);
      computeView(p);
      // Crossing the phone breakpoint changes the band and the bird count.
      if (view.device !== device) populate();
      else for (const b of birds) b.project();
      if (reducedMotion) render(p);
    };
  }, mount);

  // ---------------------------------------------------------------------------
  // HELPERS (as flock-transition.js)
  // ---------------------------------------------------------------------------
  function rand(a, b) {
    return a + Math.random() * (b - a);
  }
  function rr(r) {
    return r[0] + Math.random() * (r[1] - r[0]);
  }
  function gauss() {
    let u = 0,
      v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU_ * v);
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
  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU_;
    while (a < -Math.PI) a += TAU_;
    return a;
  }
})();
