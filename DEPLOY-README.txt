BNC sandbox site bundle - full self-contained static website
============================================================

WHAT THIS IS
A complete static website (HTML, CSS, JS, images). No server, database, or build step.
Open index.html (or home.html) to start. Everything is relative-linked, so it runs from
any folder or web path, and zips up cleanly to drop into a preview/deploy tool.

ENTRY POINT
  index.html ....... the master Berkeley Nucleonics homepage (same as home.html).
                     The top nav reaches all product lines, support pages, and search.

PRODUCT LINES (8) - each has a home page + docs:
  pdg-home.html ...... Pulse & Delay Generators
  rfsg-home.html ..... RF & Microwave Signal Generators & Sensors (incl. 12100 USB power sensors)
  scintiq-home.html .. Scintillation Detectors (ScintIQ)
  awg-home.html ...... Arbitrary Waveform Generators
  riid-home.html ..... Isotope ID & Radiation Detection
  dei-home.html ...... High Power / Current Pulsers
  index-bold.html .... ICX-FieldHawk Spectrum Analyzers
  pvp-home.html ...... PVP High Voltage Power Supplies

SUPPORT / UTILITY PAGES
  faq.html, contact.html, get-quote.html, rma-form.html, obsolete-products.html,
  privacy.html, compliance-and-legal-notices.html

  docs/ ...... all product data sheets, faithful user manuals (with figures), application
               notes, briefs, technical notes, and the per-line documentation libraries.
  figures/ ... all images, the world-map footer graphic, and per-manual figure sets.

NOTES
- Site search (top right of every page) is keyword + concept aware and indexes every page and FAQ.
- The three forms (Contact, Get a Quote, RMA) post to Formspree (xeewaglw) and email david.brown@berkeleynucleonics.com.
- ICX-FieldHawk and PVP-Series pages are concept content pending final datasheet verification.
- (c) 2026 Berkeley Nucleonics Corporation, San Rafael, CA.
