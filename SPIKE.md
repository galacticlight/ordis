# Spike: raymarched mercury (`spike/raymarched-mercury`)

Proof-of-concept only. Default path remains the mesh sphere. Nothing here is merged to `main`.

## Audit of the current mesh path

The intended look is liquid mercury: coalescence, surface tension, viscous sluggish motion, and speech as waves on that surface.

What `OrdisAvatar.ts` actually does on `main` (through `70f878f`, motion from `ccf02cb`):

- Mercury is a `SphereGeometry(0.16)` with `MeshPhysicalMaterial` (metalness 1, roughness 0.05, cyan emissive). It is a perfect ball bearing.
- “Fluid” motion is layered sines on the whole seal (`idleBreathOffset`, `idlePrecession`), a uniform scale wobble (`idleMicroCaustic`), and emissive/glow/light pulsing (`softCorePulse`).
- Speech “ripples” are three camera-facing additive planes with expanding gaussian rings. They do not displace the mercury surface.
- There is no metaball field, no curl/simplex advection, no velocity/viscosity, and no implicit surface.

**Verdict:** the implementation approximates the intended look through metaphor (shimmer + overlay rings). It does not produce a mercury-like fluid. The Operator’s read is correct: the prose description is near the target; the current cube does not feel like fluid.

## What this spike adds

A second render path that replaces only the inner mercury sphere (and its overlay rings / core-glow) with a raymarched implicit field. The optical-glass cube, gold filigree, arabesque, and halo stay.

The field is a summed stack of:

1. **Wyvill metaball kernels** — five overlapping charges so neighboring lobes coalesce instead of intersecting.
2. **Curl-noise advection** on the CPU, with an overdamped spring back to rest (`MOTION.mercuryViscosity` 5.6 vs `mercuryRestore` 1.6) so motion is sluggish, not bouncy.
3. **Value-noise perturbation** of the field (stand-in for simplex advection on the GPU).
4. **Speech ripples** as radial, normal-displaced envelopes using the same life/amp/speed and ASR fade as the overlay rings.

Shading is a mercury-style specular term plus a cheap studio environment (the mesh path still has the real `RoomEnvironment` IBL, so it wins on chrome).

`MOTION` remains the parameter table. New keys: `mercuryViscosity`, `mercuryRestore`, `mercuryNoiseSpeed`, `mercuryBounds`, `mercuryThreshold`, `mercuryRippleDisplace`, `mercurySteps`, `mercuryIdleSteps`. Existing breath, precession, pulse, speak-gap, and idle-skip behavior is unchanged.

Toggle:

- Default: `mesh`
- Overlay query: `?mercury=raymarch`
- Preview: `npx vite --config spike/vite.config.ts` then `http://127.0.0.1:5179/` (`?mode=speak` for speech)

Voice input, personality, memory, habitat tasks, and the TTS pipeline were not touched.

## Benchmarks

Captured 2026-11-06 5:08 PM PT on the Linux box, HeadlessChrome, WebGL via **ANGLE SwiftShader (Subzero)** — software rasterizer, not the Operator’s Mac GPU. Each sample is 72 frames of `tickMotion` + `render` + `readPixels` (1×1) to flush the GPU. Raw data: `spike/captures/bench.json`.

| Status   | Mesh median | Raymarch median | Ratio | Mesh p95 | Raymarch p95 |
|----------|-------------|-----------------|-------|----------|--------------|
| idle     | 56.7 ms     | 132.9 ms        | 2.34× | 63.5 ms  | 158.1 ms     |
| speaking | 56.1 ms     | 149.2 ms        | 2.66× | 59.8 ms  | 171.7 ms     |

Absolute milliseconds will be much lower on Apple Silicon. The useful figure is the **relative** cost: about two and a half times the current sphere on a conservative software backend. Idle still uses the existing every-other-frame skip in the live loop (the bench measures every submitted frame).

## Visual notes

Stills: `spike/captures/idle.png`, `spike/captures/speak.png`.

- Cube identity holds: glass, gold cage, and rings frame both cores.
- Mesh mercury stays a perfect sphere. Speaking lifts its cyan emissive; overlay rings are easy to miss in a still.
- Raymarch mercury reads as a coalesced metal droplet with surface-tension lobes — the first time the core looks like fluid rather than a ball bearing.
- Raymarch shading is still flatter than the mesh IBL. Speech ripples exist as field displacements; they are subtler in a photograph than the old overlay rings.

## Recommendation

**Do not merge yet.** The path is the right *kind* of solution if the goal is “this should feel like mercury”: the body is an implicit fluid field driven by the existing `MOTION` table, and the Sentinel cube remains a cube.

Before considering a merge:

1. Sample the real `RoomEnvironment` (or a PMREM cubemap) in the raymarch shader so the metal matches the mesh chrome.
2. Time the overlay on the Operator’s Mac — SwiftShader ratios are a ceiling, not a ship number.
3. Decide how merged the idle droplet should be (tighter rests = one bead; current rests show coalescing lobes).
4. If Mac frame time is not comfortable, drop `mercurySteps` further while speaking/idle, or keep this as a Settings toggle rather than the default.

A cheaper hybrid (keep the sphere, add vertex displacement) would not give metaball coalescence, so it is a fallback rather than a substitute.

## Follow-up after QA 44ecbc3

`bc4b824` keeps dying raymarch ripple amplitudes after speech ends. The next pass replaces the Wyvill density residual with quadratic smooth-union sphere SDFs, sphere-traces with that conservative distance, and evaluates value-noise plus speech ripple only at hits for shading (not inside `fieldSdf`).

## Follow-up: chrome lighting

Raymarch shading now samples the same RoomEnvironment PMREM as the mesh path (`textureCubeUV`) and a sharp GGX lobe (roughness 0.05, `envMapIntensity` 1.35) so the volume can read as mercury next to the mesh IBL. Ripple uniforms and the conservative `fieldSdf` are unchanged.
