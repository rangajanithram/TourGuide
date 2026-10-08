# TripWeave interface standards

- Keep primary actions visible on ordinary laptop viewports; preserve readable text and natural scrolling on phones and at increased zoom. Never hide form controls to force a fit.
- Use the shared forest palette, editorial display type, consistent spacing, visible focus states, and clear action labels.
- Scenery supports the explanation. Weather is illustrative, optional, pausable, and reduced-motion aware. Never imply it is a live forecast.
- Forms preserve entries across mode changes and recoverable failures. Account previews must remain explicitly labeled until real authentication exists.
- Reserve space for lazy 3D scenes. Reuse geometry, instance repeated objects, cap resolution, stop rendering offscreen, and dispose graphics resources.
- Review day/night contrast, keyboard navigation, loading and fallback states, and layouts at phone, tablet, laptop, and desktop sizes.
- Record measurements rather than claiming speed from visual inspection. Target field p75 LCP <= 2.5 seconds, INP <= 200 milliseconds, and CLS <= 0.1. Local development results and maximum observed interaction duration are diagnostics, not field INP or p75 measurements.

## Local diagnostics

`ExperienceMetrics.tsx` observes LCP, windowed CLS, and the maximum observed interaction duration in development. It exposes results in a hidden `data-experience-metrics` output for inspection. It sends no data to a server and runs no observers in production.

Measure a fresh navigation at a fixed viewport. Hot reload, viewport changes, development compilation, and artificial resource contention can distort results. Establish a production-build baseline and field measurements before claiming that the targets are achieved.

## Current visual revision

The guide has vertex-colored terrain, instanced ground details, selectable sunshine/mist/rain, and a distinct night palette. Glass navigation and a smaller responsive hero keep the main action visible. Account panels move over 1.8 seconds; train damping is slower independently. Desktop login and sign-up were inspected at 1366 × 768 and 1280 × 720 respectively, where document height matched viewport height. Phones retain natural scrolling.
