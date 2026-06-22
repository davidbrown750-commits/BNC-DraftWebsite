# Figure Index - V2

All figures are SVG masters in BNC palette. Caption format follows the BNC style guide: "Figure X.Y - description" where X is the chapter number and Y is the figure number within the chapter.

| Figure | File | Chapter |
|---|---|---|
| 1.1 | `fig-01-01-detector-chain.svg` | Ch 1 - The six stages of the scintillation detector chain |
| 2.1 | `fig-02-01-cs137-spectrum.svg` | Ch 2 - Cs-137 pulse height spectrum reference |
| 3.1 | `fig-03-01-light-yield-vs-resolution.svg` | Ch 3 - Scintillator landscape (light yield vs resolution) |
| 6.1 | `fig-06-01-emission-qe-matching.svg` | Ch 6 - Emission spectra and photodetector QE/PDE overlay |
| 7.1 | `fig-07-01-light-yield-vs-temperature.svg` | Ch 7 - Light yield vs temperature curves |
| 8.1 | `fig-08-01-decision-tree.svg` | Ch 8 - Material selection decision tree |
| 9.1 | `fig-09-01-pmt-cutaway.svg` | Ch 9 - PMT cutaway with photoelectron cascade |
| 9.2 | `fig-09-02-sipm-architecture.svg` | Ch 9 - SiPM architecture: array, die, microcell |
| 11.1 | `fig-11-01-detector-configurations.svg` | Ch 11 - B-style and S-style detector cross-sections |
| 13.1 | `fig-13-01-trapezoidal-filter.svg` | Ch 13 - Trapezoidal filter waveform diagram |
| 14.1 | `fig-14-01-renaissance-map.svg` | Ch 14 - Configuration map for the nuclear renaissance |

## Design conventions

All figures follow the BNC style guide:

- **Palette:** deep navy (#003D6B) for primary surfaces and headings, sky blue (#0078B6) for accents, charcoal (#2C3E50) for transitions, light steel (#ECEFF1) for paper background, light cyan (#7fdbff) for line work, bright cyan (#00b4ff) for active signals/sweep edges, target green (#00ff88) for detection blips and highlights.
- **Typography:** Helvetica/Arial sans-serif. Bold titles, light italic captions.
- **Stroke widths:** 1.4-2.4 px depending on hierarchy.
- **Format:** SVG vector master, with PNG renders to be produced for DOCX builds at 300 DPI.

## Producing PNG renders

For DOCX builds and print-ready PDFs that need raster images, render PNGs at 300 DPI:

```bash
for f in figures/*.svg; do
  out="figures-png/$(basename "$f" .svg).png"
  rsvg-convert -d 300 -p 300 "$f" -o "$out"
done
```

Requires `librsvg-bin` package. Output goes to `book/figures-png/`.

## Future figures to consider adding

For a third edition or follow-on revision, additional high-value figures:

- Master non-proportionality plot for major scintillators
- Temperature characterization workflow flowchart
- A SiPM dark count rate vs temperature curve
- An exploded view of a modern handheld instrument
- A timeline of scintillator material discoveries by decade
- A schematic of a typical PET ring with TOF reconstruction
- A comparison of analog versus digital pulse processing chains
