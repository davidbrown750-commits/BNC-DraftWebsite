/* BNC product-index "Line-Card" embed. Scoped + self-contained: drop a
   <div class="bnc-lc" data-line="rfsg"></div> on a page and include this script.
   All styles live under .bnc-lc-root so nothing leaks into the host page.
   Config for every line is bundled below (BNC_LC_CONFIGS). */
(function(){
  var QUOTE_ENDPOINT = "https://formspree.io/f/mkolqnpr";
  var DSBASE_DEFAULT = "https://www.berkeleynucleonics.com/docs/";
  var CMP_MAX = 4;

  var CSS = ".bnc-lc-root{--accent:#113163;--purple:#6b46c1;--purple-soft:#f1ecfb;--green:#1f8a5b;--green-soft:#e8f5ee;--ink:#1c2530;--muted:#6b7686;--line:#e6e8ec;--row-alt:#fafbfc;--hover:#f4f6f9;"
   + "font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;color:var(--ink);line-height:1.5;font-size:15px;text-align:left;-webkit-font-smoothing:antialiased}"
   + ".bnc-lc-root *{box-sizing:border-box}"
   + ".bnc-lc-root .lc{margin:0;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:#fff}"
   + ".bnc-lc-root .lc-head{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;background:#fff;border:0;border-left:4px solid var(--purple);cursor:pointer;padding:16px 20px;font-family:inherit;text-align:left}"
   + ".bnc-lc-root .lc-head:hover{background:var(--purple-soft)}"
   + ".bnc-lc-root .lc-title{font-size:17px;font-weight:700;color:var(--accent)}"
   + ".bnc-lc-root .lc-title .lc-dot{color:var(--purple);margin:0 3px}"
   + ".bnc-lc-root .lc-cta{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;font-weight:600;white-space:nowrap}"
   + ".bnc-lc-root .lc-chev{display:inline-block;color:var(--green);font-size:13px;transition:transform .18s}"
   + ".bnc-lc-root .lc-head.open .lc-chev{transform:rotate(180deg)}"
   + ".bnc-lc-root .lc-body{padding:2px 20px 18px}"
   + ".bnc-lc-root .lede{color:var(--muted);font-size:15px;margin:14px 2px 18px;max-width:72ch}"
   + ".bnc-lc-root .bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid var(--line);border-radius:8px;padding:11px 15px;margin:0 0 16px;background:#fff}"
   + ".bnc-lc-root .bar .hint{font-size:13.5px;color:var(--muted)}.bnc-lc-root .bar .sp{flex:1}.bnc-lc-root .bar .count{font-size:13px;color:var(--ink);font-weight:600}"
   + ".bnc-lc-root .btn{font-family:inherit;font-size:13.5px;font-weight:600;border:1px solid var(--accent);background:#fff;color:var(--accent);border-radius:6px;padding:8px 16px;cursor:pointer}"
   + ".bnc-lc-root .btn:hover:not(:disabled){background:var(--accent);color:#fff}"
   + ".bnc-lc-root .btn.primary{background:var(--accent);color:#fff}.bnc-lc-root .btn.primary:hover:not(:disabled){background:#0c2549}"
   + ".bnc-lc-root .btn.green{border-color:var(--green);color:var(--green)}.bnc-lc-root .btn.green:hover:not(:disabled){background:var(--green);color:#fff}"
   + ".bnc-lc-root .btn:disabled{opacity:.4;cursor:not-allowed;border-color:var(--line);color:var(--muted)}"
   + ".bnc-lc-root table.idx{width:100%;border-collapse:collapse;font-size:14px}"
   + ".bnc-lc-root table.idx thead th{background:#fff;text-align:left;color:var(--muted);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:700;padding:10px 12px;border-bottom:2px solid var(--ink);white-space:nowrap;user-select:none}"
   + ".bnc-lc-root table.idx thead th[data-k]{cursor:pointer}.bnc-lc-root table.idx thead th[data-k]:hover{color:var(--ink)}"
   + ".bnc-lc-root .arr{display:inline-block;width:12px;color:#b7c0cc;font-size:10px;margin-right:4px}.bnc-lc-root table.idx thead th[data-k]:hover .arr{color:var(--muted)}.bnc-lc-root table.idx th.sorted .arr{color:var(--purple)}"
   + ".bnc-lc-root th.cc{width:34px;text-align:center}"
   + ".bnc-lc-root table.idx tbody td{padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:middle;color:var(--ink)}"
   + ".bnc-lc-root table.idx tbody tr{background:#fff}.bnc-lc-root table.idx tbody tr:nth-child(even){background:var(--row-alt)}.bnc-lc-root table.idx tbody tr:hover{background:var(--hover)}"
   + ".bnc-lc-root table.idx tbody tr.sel{background:var(--purple-soft);box-shadow:inset 3px 0 0 var(--purple)}"
   + ".bnc-lc-root td.cc{text-align:center}.bnc-lc-root td.cc input{width:16px;height:16px;cursor:pointer;accent-color:var(--purple)}"
   + ".bnc-lc-root .model a{color:var(--accent);text-decoration:none;font-weight:700;font-size:15px}.bnc-lc-root .model a:hover{text-decoration:underline}"
   + ".bnc-lc-root .model .sum{display:block;color:var(--muted);font-weight:400;font-size:12.5px;margin-top:1px}"
   + ".bnc-lc-root td.spec{font-variant-numeric:tabular-nums}"
   + ".bnc-lc-root .tbar{text-align:right;margin-top:14px}"
   + ".bnc-lc-root .ov{position:fixed;inset:0;background:rgba(18,24,32,.55);display:none;align-items:center;justify-content:center;z-index:2147483000;padding:18px}"
   + ".bnc-lc-root .ov.on{display:flex}"
   + ".bnc-lc-root .modal{background:#fff;border-radius:10px;max-width:860px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.35)}"
   + ".bnc-lc-root .modal .mh{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid var(--line)}"
   + ".bnc-lc-root .modal .mh h2{margin:0;font-size:18px;font-weight:600;color:var(--ink)}.bnc-lc-root .modal .mh h2 .pl{color:var(--purple)}"
   + ".bnc-lc-root .modal .x{border:0;background:none;font-size:22px;line-height:1;color:var(--muted);cursor:pointer}.bnc-lc-root .modal .mb{padding:20px 22px}"
   + ".bnc-lc-root table.cmp{width:100%;border-collapse:collapse;font-size:13.5px}"
   + ".bnc-lc-root table.cmp th,.bnc-lc-root table.cmp td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;color:var(--ink)}"
   + ".bnc-lc-root table.cmp thead th{font-weight:700;border-bottom:2px solid var(--ink);font-size:14px}"
   + ".bnc-lc-root table.cmp td:first-child,.bnc-lc-root table.cmp th:first-child{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:700;white-space:nowrap}"
   + ".bnc-lc-root table.cmp td.diff{font-weight:700;color:var(--purple)}"
   + ".bnc-lc-root .qmodels{background:var(--green-soft);border:1px solid #cfe7da;border-radius:6px;padding:10px 14px;margin:0 0 14px;font-size:13.5px}.bnc-lc-root .qmodels b{color:var(--green)}"
   + ".bnc-lc-root .fld{margin:0 0 12px}.bnc-lc-root .fld label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:700;margin:0 0 4px}"
   + ".bnc-lc-root .fld input,.bnc-lc-root .fld textarea{width:100%;border:1px solid #cdd3dc;border-radius:6px;padding:9px 11px;font-family:inherit;font-size:14px;color:var(--ink)}.bnc-lc-root .fld textarea{min-height:70px;resize:vertical}"
   + ".bnc-lc-root .qok{color:var(--green);font-weight:600;font-size:14px}";

  var BNC_LC_CONFIGS = /*__CONFIGS__*/ {
"pdg": {
  title: "Pulse & Delay Generators",
  productLine: "Pulse & Delay Generators",
  lede: "Compare the line at a glance and open any datasheet. Click any column heading to sort. Select models to compare them side by side or request a quote.",
  dsbase: "https://www.berkeleynucleonics.com/docs/",
  quoteEndpoint: "https://formspree.io/f/xeewaglw",
  columns: [
    {key:"channels", label:"Channels"},
    {key:"maxfreq", label:"Max Frequency"},
    {key:"jitter", label:"Jitter"},
    {key:"resolution", label:"Resolution"},
    {key:"amplitude", label:"Amplitude"}
  ],
  models: [
   {num:765, model:"Model 765", sum:"Ultra-fast 4 ps transitions", ds:"bnc-model-765-datasheet.html",
    vals:{channels:"2 or 4",maxfreq:"800 MHz",jitter:"4 ps",resolution:"10 ps",amplitude:"±5 Vpp"}, sort:{channels:2,maxfreq:8,jitter:1,resolution:2,amplitude:3}},
   {num:765.5, model:"Model 765-HV", sum:"High-voltage pulse & delay", ds:"bnc-model-765hv-datasheet.html",
    vals:{channels:"1 or 2",maxfreq:"400 MHz",jitter:"15 ps",resolution:"10 ps",amplitude:"±50 Vpp"}, sort:{channels:1,maxfreq:7,jitter:3,resolution:2,amplitude:4}},
   {num:577, model:"Model 577", sum:"Precision digital delay control", ds:"bnc-model-577-datasheet.html",
    vals:{channels:"4 or 8",maxfreq:"20 MHz",jitter:"< 50 ps",resolution:"250 ps",amplitude:"20 VDC (45 V opt.)"}, sort:{channels:4,maxfreq:3,jitter:5,resolution:4,amplitude:7}},
   {num:588.5, model:"Model 588B", sum:"High-density 24-channel system", ds:"bnc-model-588b-datasheet.html",
    vals:{channels:"12 or 24",maxfreq:"—",jitter:"< 5 ps",resolution:"250 ps",amplitude:"20 VDC"}, sort:{channels:6,maxfreq:0,jitter:2,resolution:4,amplitude:7}},
   {num:525, model:"Model 525", sum:"Compact 6-channel delay", ds:"bnc-model-525-datasheet.html",
    vals:{channels:"6",maxfreq:"20 MHz",jitter:"< 50 ps",resolution:"4 ns",amplitude:"5 VDC"}, sort:{channels:3,maxfreq:3,jitter:5,resolution:6,amplitude:7}},
   {num:575, model:"Model 575", sum:"Flexible low-frequency delay", ds:"bnc-model-575-datasheet.html",
    vals:{channels:"2, 4 or 8",maxfreq:"10 MHz",jitter:"50 ps",resolution:"250 ps",amplitude:"20 VDC (45 V opt.)"}, sort:{channels:4,maxfreq:2,jitter:6,resolution:7,amplitude:7}},
   {num:588, model:"Model 588", sum:"1U rackmount timing solution", ds:"bnc-model-588-datasheet.html",
    vals:{channels:"4 or 8",maxfreq:"10 MHz",jitter:"50 ps",resolution:"250 ps",amplitude:"20 VDC"}, sort:{channels:4,maxfreq:2,jitter:6,resolution:4,amplitude:1}},
   {num:725, model:"Model 725", sum:"Multi-trigger synchronization tool", ds:"bnc-model-725-datasheet.html",
    vals:{channels:"8",maxfreq:"780 kHz",jitter:"10 ns, 200 ps",resolution:"10 ns",amplitude:"4.9 V max"}, sort:{channels:4,maxfreq:1,jitter:8,resolution:7,amplitude:7}},
   {num:507, model:"Model 507", sum:"High-current 25 A output", ds:"bnc-model-507-datasheet.html",
    vals:{channels:"2 to 4",maxfreq:"Single shot",jitter:"100 ns",resolution:"200 ns",amplitude:"25 A"}, sort:{channels:2,maxfreq:9,jitter:7,resolution:9,amplitude:6}},
   {num:508, model:"Model 508", sum:"Fast 6 A drive pulses", ds:"bnc-model-508-datasheet.html",
    vals:{channels:"2 to 4",maxfreq:"Single shot",jitter:"10 ns",resolution:"100 ns",amplitude:"6 A"}, sort:{channels:2,maxfreq:9,jitter:10,resolution:8,amplitude:5}},
   {num:745, model:"Model 745T", sum:"Femtosecond digital delays", ds:"bnc-model-745t-datasheet.html",
    vals:{channels:"4 or 8",maxfreq:"80 MHz",jitter:"25 ps",resolution:"1 ps",amplitude:"±5 V"}, sort:{channels:4,maxfreq:5,jitter:4,resolution:1,amplitude:3}}
  ]
},
"rfsg": {
  title: "RF & Microwave Signal Generators",
  productLine: "RF & Microwave Signal Generators",
  lede: "Berkeley Nucleonics RF and microwave signal generators run from kHz tones to beyond 50 GHz, in benchtop, OEM, and USB-powered formats. Compare the line at a glance and open any datasheet. Click any column heading to sort. Select models to compare them side by side or request a quote.",
  dsbase: "https://www.berkeleynucleonics.com/docs/",
  quoteEndpoint: "https://formspree.io/f/xeewaglw",
  columns: [
    {key:"type", label:"Type"},
    {key:"freq", label:"Frequency Range"},
    {key:"channels", label:"Channels"},
    {key:"switch", label:"Switching Speed"},
    {key:"power", label:"Output Power"}
  ],
  models: [
   {num:871, model:"Model 871", sum:"Flagship generator up to 51 GHz", ds:"bnc-model-871-datasheet.html",
    vals:{type:"Signal Generator",freq:"1 kHz to 51 GHz",channels:"1, 2, 3 or 4",switch:"5 µs",power:"-120 to +20 dBm"},
    sort:{type:1,freq:1,channels:2,switch:1,power:1}},
   {num:870, model:"Model 870A", sum:"Wide coverage, 10 MHz to 54 GHz", ds:"bnc-model-870a-datasheet.html",
    vals:{type:"Signal Generator",freq:"10 MHz to 54 GHz",channels:"1, 2, 3 or 4",switch:"15 µs",power:"-20 to +20 dBm"},
    sort:{type:1,freq:3,channels:2,switch:2,power:8}},
   {num:855, model:"Model 855B", sum:"High-power multi-channel platform", ds:"bnc-model-855b-datasheet.html",
    vals:{type:"Signal Generator",freq:"300 kHz to 42 GHz",channels:"2, 3 or 4",switch:"500 µs (25 µs opt. FS)",power:"-20 to +25 dBm (-60 with opt. PE4)"},
    sort:{type:1,freq:6,channels:3,switch:6,power:9}},
   {num:865, model:"Model 865B", sum:"Low phase noise broadband source", ds:"bnc-model-865b-datasheet.html",
    vals:{type:"Signal Generator",freq:"100 kHz to 40 GHz",channels:"1",switch:"500 µs (30 µs opt. FS)",power:"-120 to +24 dBm"},
    sort:{type:1,freq:5,channels:1,switch:7,power:3}},
   {num:845, model:"Model 845", sum:"Compact 26.5 GHz mid-band unit", ds:"bnc-model-845-datasheet.html",
    vals:{type:"Signal Generator",freq:"100 kHz to 26.5 GHz",channels:"1",switch:"400 µs (<30 µs opt. FS)",power:"-120 to +21 dBm"},
    sort:{type:1,freq:4,channels:1,switch:4,power:2}},
   {num:835, model:"Model 835", sum:"Entry-level RF, flexible options", ds:"bnc-model-835-datasheet.html",
    vals:{type:"Signal Generator",freq:"9 kHz to 6 GHz",channels:"1",switch:"400 µs",power:"-30 to +17 dBm (-120 with opt. PE3)"},
    sort:{type:1,freq:2,channels:1,switch:3,power:4}},
   {num:805, model:"Model 805-SG", sum:"Stable 20 GHz fixed source", ds:"bnc-model-805sg-datasheet.html",
    vals:{type:"Signal Generator",freq:"20 GHz",channels:"1",switch:"500 µs (20 µs opt. FS)",power:"-20 to +16 dBm"},
    sort:{type:1,freq:7,channels:1,switch:5,power:7}},
   {num:845.1, model:"Model 845-OEM", sum:"OEM design for embedded systems", ds:"bnc-model-845oem-datasheet.html",
    vals:{type:"Signal Generator",freq:"100 kHz to 26.5 GHz",channels:"—",switch:"400 µs (<30 µs opt. FS)",power:"-20 to +15 dBm"},
    sort:{type:1,freq:4,switch:3,power:5}},
   {num:1000, model:"RFS-1000", sum:"42 GHz CW and sweep", ds:"bnc-rfs-1000-datasheet.html",
    vals:{type:"Signal Generator",freq:"100 MHz to 42 GHz",channels:"1",switch:"252 ms",power:"Up to +15 dBm"},
    sort:{type:1,freq:8,channels:1,switch:9,power:8}},
   {num:866, model:"Model 866-M", sum:"Compact 40 GHz frequency synthesizer", ds:"bnc-model-866m-datasheet.html",
    vals:{type:"Frequency Synthesizer",freq:"1 MHz to 40 GHz",channels:"1",switch:"500 µs (85 µs opt. FS)",power:"-10 to +25 dBm"},
    sort:{type:2,freq:4,channels:1,switch:5,power:2}},
   {num:805.5, model:"Model 805-M", sum:"Ultra-agile frequency synthesizer", ds:"bnc-model-805m-datasheet.html",
    vals:{type:"Frequency Synthesizer",freq:"100 kHz to 22 GHz",channels:"1",switch:"500 µs (20 µs opt. FS)",power:"-40 to +25 dBm"},
    sort:{type:2,freq:2,channels:1,switch:4,power:1}},
   {num:825, model:"Model 825-M", sum:"Ultra-agile multichannel signal source", ds:"bnc-model-825m-datasheet.html",
    vals:{type:"Frequency Synthesizer",freq:"8 kHz to 20 GHz",channels:"1 to 4",switch:"200 µs (5 µs opt. FS)",power:"0 to +18 dBm"},
    sort:{type:2,freq:1,channels:3,switch:3,power:4}},
   {num:845.5, model:"Model 845-M", sum:"Low-noise 20 GHz microwave synthesizer", ds:"bnc-model-845m-datasheet.html",
    vals:{type:"Frequency Synthesizer",freq:"10 MHz to 20 GHz",channels:"1 or 2",switch:"180 µs (25 µs opt. FS)",power:"+23 dBm"},
    sort:{type:2,freq:5,channels:2,switch:2,power:5}},
   {num:865.5, model:"Model 865B-M", sum:"Wideband low-noise 43.5 GHz synthesizer", ds:"bnc-model-865bm-datasheet.html",
    vals:{type:"Frequency Synthesizer",freq:"100 kHz to 43.5 GHz",channels:"1",switch:"500 µs (20 µs opt. FS)",power:"-5 to +20 dBm"},
    sort:{type:2,freq:3,channels:1,switch:4,power:3}},
   {num:865.6, model:"Model 865B-M-40-X", sum:"Multi-channel wideband low-noise synthesizer", ds:"bnc-model-865bm-40x-datasheet.html",
    vals:{type:"Frequency Synthesizer",freq:"100 kHz to 43.5 GHz",channels:"1 to 4",switch:"500 µs (20 µs opt. FS)",power:"-10 to +25 dBm"},
    sort:{type:2,freq:3,channels:4,switch:4,power:2}},
   {num:875, model:"Model 875", sum:"Multi-channel VSG, wide coverage", ds:"bnc-model-875-datasheet.html",
    vals:{type:"Vector Signal Generator",freq:"1 kHz to 51 GHz",channels:"1, 2, 3 or 4",switch:"5 µs",power:"-120 to +20 dBm"},
    sort:{type:3,freq:1,channels:1,switch:1,power:1}},
   {num:875.5, model:"VSG-Mini-6", sum:"USB-powered 6 GHz vector source", ds:"bnc-vsg-mini-6-datasheet.html",
    vals:{type:"Vector Signal Generator",freq:"9 kHz to 6 GHz",channels:"1",switch:"≤100 µs",power:"-100 to +14 dBm"},
    sort:{type:3,freq:2,channels:1,switch:2,power:2}}
  ]
},
"awg": {
  title: "Arbitrary Waveform Generators",
  productLine: "Arbitrary Waveform Generators",
  lede: "Compare the line at a glance and open any datasheet. Click any column heading to sort. Select models to compare them side by side or request a quote.",
  dsbase: "https://www.berkeleynucleonics.com/docs/",
  quoteEndpoint: "https://formspree.io/f/xeewaglw",
  columns: [
    {key:"channels", label:"Channels"},
    {key:"sampling", label:"Sample Rate"},
    {key:"bandwidth", label:"Bandwidth"},
    {key:"bits", label:"Resolution"}
  ],
  models: [
   {num:686, model:"Model 686", sum:"Flagship 10 GHz, 20 GS/s AWG", ds:"bnc-awg-686-datasheet.html",
    vals:{channels:"2 or 4",sampling:"20 GS/s",bandwidth:"10 GHz",bits:"14 bit"}, sort:{channels:3,sampling:7,bandwidth:6,bits:1}},
   {num:685, model:"Model 685", sum:"Differential outputs, 16-bit, 6 GS/s", ds:"bnc-awg-685-datasheet.html",
    vals:{channels:"2, 4 or 8",sampling:"6.16 GS/s",bandwidth:"2 GHz",bits:"16 bit"}, sort:{channels:4,sampling:6,bandwidth:6,bits:2}},
   {num:685.3, model:"Model 685C", sum:"Sub-nanosecond 600 ps edge generation", ds:"bnc-awg-685c-datasheet.html",
    vals:{channels:"2, 4 or 8",sampling:"3 GSa/s",bandwidth:"2 GHz",bits:"16 bit"}, sort:{channels:4,sampling:5,bandwidth:5,bits:2}},
   {num:675, model:"Model 675", sum:"300 MHz, 1.2 GS/s performance AWG", ds:"bnc-awg-675-datasheet.html",
    vals:{channels:"2, 4 or 8",sampling:"1.2 GS/s",bandwidth:"*318 MHz",bits:"16 bit"}, sort:{channels:4,sampling:3,bandwidth:4,bits:2}},
   {num:670, model:"Model 670C", sum:"Mid-range 600 MS/s benchtop AWG", ds:"bnc-awg-670c-datasheet.html",
    vals:{channels:"2 or 4",sampling:"600 MS/s",bandwidth:"*318 MHz",bits:"16 bit"}, sort:{channels:3,sampling:2,bandwidth:4,bits:2}},
   {num:645, model:"Model 645", sum:"Compact 50 MHz benchtop generator", ds:"bnc-awg-645-datasheet.html",
    vals:{channels:"1",sampling:"125 MSa/s",bandwidth:"20 MHz",bits:"16 bit"}, sort:{channels:1,sampling:1,bandwidth:1,bits:2}},
   {num:2255, model:"Model A2255", sum:"Dual-channel 250 MHz AWG", ds:"bnc-awg-a2255-datasheet.html",
    vals:{channels:"2",sampling:"1.25 GS/s",bandwidth:"250 MHz",bits:"14 bit"}, sort:{channels:2,sampling:4,bandwidth:3,bits:1}},
   {num:2085, model:"Model A2085", sum:"Dual-channel 80 MHz AWG", ds:"bnc-awg-a2085-datasheet.html",
    vals:{channels:"2",sampling:"1.25 GS/s",bandwidth:"80 MHz",bits:"14 bit"}, sort:{channels:2,sampling:4,bandwidth:2,bits:1}}
  ]
},
"rtsa": {
  title: "ICX-FieldHawk Real-Time Spectrum Analyzers",
  productLine: "ICX-FieldHawk RTSA",
  lede: "Every ICX-FieldHawk is a gap-free real-time spectrum analyzer with 100 MHz real-time bandwidth. The line is broken out by frequency coverage and form factor — USB, handheld, and rugged. Click a heading to sort, select models to compare, or request a quote.",
  dsbase: "https://www.berkeleynucleonics.com/docs/",
  columns: [
    {key:"freq", label:"Frequency Range"},
    {key:"form", label:"Form Factor"}
  ],
  models: [
   {num:4.5, model:"ICX-045U", sum:"Compact USB analyzer", ds:"bnc-icx-fieldhawk-usb-datasheet.html",
    vals:{freq:"9 kHz to 4.5 GHz", form:"USB / host PC"}, sort:{freq:4.5, form:1}},
   {num:6.3, model:"ICX-060U", sum:"USB, mid-band", ds:"bnc-icx-fieldhawk-usb-datasheet.html",
    vals:{freq:"9 kHz to 6.3 GHz", form:"USB / host PC"}, sort:{freq:6.3, form:1}},
   {num:9.5, model:"ICX-090U", sum:"Wideband USB", ds:"bnc-icx-fieldhawk-usb-datasheet.html",
    vals:{freq:"9 kHz to 9.5 GHz", form:"USB / host PC"}, sort:{freq:9.5, form:1}},
   {num:20, model:"ICX-200U", sum:"Microwave USB", ds:"bnc-icx-fieldhawk-usb-datasheet.html",
    vals:{freq:"9 kHz to 20 GHz", form:"USB / host PC"}, sort:{freq:20, form:1}},
   {num:40, model:"ICX-400U", sum:"40 GHz USB flagship", ds:"bnc-icx-fieldhawk-usb-datasheet.html",
    vals:{freq:"9 kHz to 40 GHz", form:"USB / host PC"}, sort:{freq:40, form:1}},
   {num:4.5, model:"ICX-045", sum:"Field handheld", ds:"bnc-icx-fieldhawk-handheld-datasheet.html",
    vals:{freq:"9 kHz to 4.5 GHz", form:"Handheld (touchscreen)"}, sort:{freq:4.5, form:2}},
   {num:6, model:"ICX-060", sum:"Handheld, mid-band", ds:"bnc-icx-fieldhawk-handheld-datasheet.html",
    vals:{freq:"9 kHz to 6 GHz", form:"Handheld (touchscreen)"}, sort:{freq:6, form:2}},
   {num:9, model:"ICX-090", sum:"Compact handheld", ds:"bnc-icx-fieldhawk-handheld-datasheet.html",
    vals:{freq:"9 kHz to 9 GHz", form:"Handheld (touchscreen)"}, sort:{freq:9, form:2}},
   {num:9.5, model:"ICX-095", sum:"Real-time handheld", ds:"bnc-icx-fieldhawk-handheld-datasheet.html",
    vals:{freq:"9 kHz to 9.5 GHz", form:"Handheld (touchscreen)"}, sort:{freq:9.5, form:2}},
   {num:20, model:"ICX-200", sum:"Microwave handheld", ds:"bnc-icx-fieldhawk-handheld-datasheet.html",
    vals:{freq:"9 kHz to 20 GHz", form:"Handheld (touchscreen)"}, sort:{freq:20, form:2}},
   {num:40, model:"ICX-400", sum:"40 GHz handheld flagship", ds:"bnc-icx-fieldhawk-handheld-datasheet.html",
    vals:{freq:"9 kHz to 40 GHz", form:"Handheld (touchscreen)"}, sort:{freq:40, form:2}},
   {num:9.5, model:"ICX-095R", sum:"Rugged IP68 field unit", ds:"bnc-icx-fieldhawk-rugged-datasheet.html",
    vals:{freq:"9 kHz to 9.5 GHz", form:"Rugged IP68"}, sort:{freq:9.5, form:3}},
   {num:20, model:"ICX-200R", sum:"Rugged, microwave", ds:"bnc-icx-fieldhawk-rugged-datasheet.html",
    vals:{freq:"9 kHz to 20 GHz", form:"Rugged IP68"}, sort:{freq:20, form:3}},
   {num:40, model:"ICX-400R", sum:"Rugged 40 GHz, mission-critical", ds:"bnc-icx-fieldhawk-rugged-datasheet.html",
    vals:{freq:"9 kHz to 40 GHz", form:"Rugged IP68"}, sort:{freq:40, form:3}}
  ]
},
"dei": {
  title: "High-Current / High-Voltage Pulsers (DEI)",
  productLine: "DEI High-Current / High-Voltage Pulsers",
  lede: "Compare the line at a glance and open any datasheet. Click any column heading to sort. Select models to compare them side by side or request a quote.",
  dsbase: "https://www.berkeleynucleonics.com/docs/",
  quoteEndpoint: "https://formspree.io/f/xeewaglw",
  columns: [
    {key:"voltage", label:"Output Voltage"},
    {key:"current", label:"Output Current"},
    {key:"freq", label:"Frequency Range"},
    {key:"pw", label:"Pulse Width"},
    {key:"risefall", label:"Rise / Fall Time"}
  ],
  models: [
   {num:4110, model:"PVX-4110", sum:"Bipolar ±10 kV high-voltage pulser", ds:"bnc-dei-pvx-4110-datasheet.html",
    vals:{voltage:"10,000 V",current:"—",freq:"Single-shot to 10 kHz",pw:"<200 ns to DC",risefall:"<60 ns (rise & fall)"},
    sort:{voltage:7,current:0,freq:2,pw:6,risefall:4}},
   {num:4000, model:"PVX-4000-2kV", sum:"Compact ±2 kV precision pulser", ds:"bnc-dei-pvx-4000-datasheet.html",
    vals:{voltage:"±2000 V",current:"—",freq:"Single-shot to 30 kHz",pw:"2% to 98% DC",risefall:"≤ 50 ns from 500 V"},
    sort:{voltage:4,current:0,freq:4,pw:7,risefall:3}},
   {num:4000, model:"PVX-4000-2kV-EX", sum:"Extended-frequency ±2 kV, to 100 kHz", ds:"bnc-dei-pvx-4000-datasheet.html",
    vals:{voltage:"±2000 V",current:"—",freq:"Single-shot to 100 kHz",pw:"2% to 98% DC",risefall:"≤ 50 ns from 500 V"},
    sort:{voltage:4,current:0,freq:6,pw:7,risefall:3}},
   {num:4130, model:"PVX-4130", sum:"Mid-range ±6 kV pulser", ds:"bnc-dei-pvx-4130-datasheet.html",
    vals:{voltage:"±6000 V",current:"—",freq:"Single-shot to 10 kHz",pw:"<150 ns to DC",risefall:"<60 ns (typ. <52 ns)"},
    sort:{voltage:6,current:0,freq:2,pw:5,risefall:5}},
   {num:4141, model:"PVX-4141", sum:"Compact 3.5 kV fast-transition pulser", ds:"bnc-dei-pvx-4141-datasheet.html",
    vals:{voltage:"3,500 V",current:"—",freq:"Single-shot to 30 kHz",pw:"60 ns to DC",risefall:"<25 ns"},
    sort:{voltage:5,current:0,freq:4,pw:4,risefall:2}},
   {num:4210, model:"PVM-4210", sum:"Modular ±950 V versatile pulser", ds:"bnc-dei-pvm-4210-datasheet.html",
    vals:{voltage:"950 V",current:"—",freq:"Single-shot to 20 kHz (5 MHz burst)",pw:"<50 ns to DC",risefall:"≤ 25 ns (10%–90%)"},
    sort:{voltage:2,current:0,freq:3,pw:3,risefall:2}},
   {num:4151, model:"PVX-4151", sum:"High-frequency ±1.5 kV continuous pulser",
    vals:{voltage:"1,500 V",current:"—",freq:"240 kHz (at max voltage)",pw:"<60 ns to DC",risefall:"<25 ns"},
    sort:{voltage:3,current:0,freq:7,pw:4,risefall:2}},
   {num:2506, model:"PVX-2506", sum:"Low-voltage +50 V precision pulser", ds:"bnc-dei-pvx-2506-datasheet.html",
    vals:{voltage:"+50 V",current:"—",freq:"Single-shot to 50 kHz",pw:"<1 µs to 100 µs",risefall:"<200 ns at 50 V (10%–90%)"},
    sort:{voltage:1,current:0,freq:5,pw:2,risefall:6}},
   {num:1001, model:"PVM-1001", sum:"OEM ±950 V ultra-fast edges", ds:"bnc-dei-pvm-1001-datasheet.html",
    vals:{voltage:"950 V",current:"—",freq:"≤ 1 MHz (5 MHz burst)",pw:"55 ns ≤ PW ≤ 10,000 ns",risefall:"Rise ≤ 8 ns / Fall ≤ 50 ns @ 950 V"},
    sort:{voltage:2,current:0,freq:1,pw:1,risefall:1}},
   {num:7401, model:"PCX-7401", sum:"3 A pulsed / CW current driver", ds:"bnc-dei-pcx-7401-datasheet.html",
    vals:{voltage:"—",current:"3 A",freq:"5 Hz to 1 MHz",pw:"100 ns to DC",risefall:"100 ns"},
    sort:{voltage:0,current:1,freq:1,pw:3,risefall:5}},
   {num:7421, model:"PCX-7421", sum:"21.5 A fast-pulse current driver", ds:"bnc-dei-pcx-7421-datasheet.html",
    vals:{voltage:"—",current:"21.5 A",freq:"40 Hz to 100 kHz",pw:"100 ns to 500 ms",risefall:"< 25 ns"},
    sort:{voltage:0,current:2,freq:2,pw:4,risefall:3}},
   {num:200, model:"PIM-MINI-200", sum:"200 A mini current driver", ds:"bnc-dei-pim-mini-200-datasheet.html",
    vals:{voltage:"—",current:"200 A",freq:"≤ 200 Hz",pw:"25 µs to 250 µs",risefall:"10 µs"},
    sort:{voltage:0,current:6,freq:3,pw:6,risefall:6}},
   {num:7700, model:"PCM-7700", sum:"200 A extended-width current driver", ds:"bnc-dei-pcm-7700-datasheet.html",
    vals:{voltage:"—",current:"200 A",freq:"Single-shot to 1 kHz",pw:"500 µs to 50 ms",risefall:"75 µs"},
    sort:{voltage:0,current:6,freq:4,pw:7,risefall:7}},
   {num:6141, model:"PCO-6141", sum:"60 A OEM current driver, 12 ns rise", ds:"bnc-dei-pco-6141-datasheet.html",
    vals:{voltage:"—",current:"60 A",freq:"Single-shot to 500 kHz",pw:"200 ns to DC",risefall:"12 ns"},
    sort:{voltage:0,current:4,freq:5,pw:5,risefall:1}},
   {num:6131, model:"PCO-6131", sum:"125 A compact OEM current driver", ds:"bnc-dei-pco-6131-datasheet.html",
    vals:{voltage:"—",current:"125 A",freq:"Single-shot to 500 kHz",pw:"<100 ns to DC",risefall:"30 ns"},
    sort:{voltage:0,current:5,freq:5,pw:2,risefall:4}},
   {num:7500, model:"PCX-7500-EX", sum:"450 A air-cooled current source", ds:"bnc-dei-pcx-7500-datasheet.html",
    vals:{voltage:"—",current:"450 A",freq:"≤ 10,000 Hz",pw:"4 µs to 5,000 µs",risefall:"10 µs"},
    sort:{voltage:0,current:6,freq:5,pw:2,risefall:4}}
  ]
},
"riid": {
  title: "Isotope Identifiers & Radiation Detectors",
  productLine: "Isotope ID & Radiation Detection",
  lede: "Compare the line at a glance and open any datasheet. Click any column heading to sort. Select models to compare them side by side or request a quote.",
  dsbase: "https://www.berkeleynucleonics.com/docs/",
  quoteEndpoint: "https://formspree.io/f/xeewaglw",
  columns: [
    {key:"form", label:"Form Factor"},
    {key:"detection", label:"Detection Type"},
    {key:"detector", label:"Detector"},
    {key:"crystal", label:"Detector Size"},
    {key:"energy", label:"Energy Range"}
  ],
  models: [
   {num:940, model:"SAM 940+", sum:"Small handheld RIID, lightweight rugged build", ds:"bnc-sam-940-plus-datasheet.html",
    vals:{form:"Hand-held",detection:"Gamma, Neutron, *Alpha + Beta",detector:"NaI, CeBr2, LBC",crystal:"1.5×1.5, 2×2",energy:"20 keV – 10 MeV"}, sort:{form:1,detection:1,detector:3,crystal:1,energy:4}},
   {num:950, model:"SAM 950", sum:"Rugged handheld RIID, shockproof enclosure", ds:"bnc-sam-950-datasheet.html",
    vals:{form:"Hand-held",detection:"Gamma & Neutron",detector:"NaI, CeBr3, LBC",crystal:"1.5×1.5, 2×2, 3×3",energy:"20 keV – 3.0 MeV"}, sort:{form:1,detection:1,detector:3,crystal:4,energy:3}},
   {num:945, model:"SAM 945", sum:"Handheld RIID, smartphone-linked interface", ds:"bnc-sam-945-datasheet.html",
    vals:{form:"Hand-held",detection:"Gamma & Neutron",detector:"NaI, CeBr",crystal:"2×2",energy:"20 keV – 3.0 MeV"}, sort:{form:1,detection:1,detector:2,crystal:2,energy:3}},
   {num:120, model:"SAMpack 120 (RD-120)", sum:"Backpack RIID, wearable field solution", ds:"bnc-sampack-120-datasheet.html",
    vals:{form:"Backpack",detection:"Gamma & Neutron",detector:"NaI, LaBr, CeBr",crystal:"2×2, 3×3",energy:"20 keV – 3.0 MeV"}, sort:{form:2,detection:1,detector:3,crystal:3,energy:3}},
   {num:150, model:"SAMmobile 150 (RD-150)", sum:"Vehicle mounted detection system", ds:"bnc-sammobile-150-datasheet.html",
    vals:{form:"Vehicle",detection:"Gamma & Neutron",detector:"NaI",crystal:"2×4×16, 4×4×16",energy:"10 keV – 3.0 MeV"}, sort:{form:3,detection:1,detector:1,crystal:5,energy:1}},
   {num:907, model:"Model 907", sum:"Multi-radiation survey meter", ds:"bnc-model-907-datasheet.html",
    vals:{form:"Survey Meter",detection:"Alpha, Beta, Gamma, X-Ray",detector:"Geiger-Muller Tube",crystal:"—",energy:"—"}, sort:{form:3,detection:5,detector:2,crystal:0,energy:0}},
   {num:951, model:"Model 951 (PRD)", sum:"nukeALERT personal radiation detector", ds:"bnc-model-951-datasheet.html",
    vals:{form:"Personal RAD Detector",detection:"Gamma",detector:"CsI Scintillator",crystal:"—",energy:"—"}, sort:{form:1,detection:1,detector:3,crystal:0,energy:0}},
   {num:1703, model:"Model 1703GNA-II MBT (PRD)", sum:"Personal dosimeter plus neutron", ds:"bnc-pm1703gna-datasheet.html",
    vals:{form:"Personal RAD Dosimeter",detection:"Gamma, Neutron",detector:"CsI(Tl) SiPM, GM Counter, LiF/ZnS",crystal:"—",energy:"—"}, sort:{form:1,detection:3,detector:5,crystal:0,energy:0}},
   {num:1, model:"MetRad 1", sum:"Radiation and metal detector", ds:"bnc-metrad-1-datasheet.html",
    vals:{form:"Hybrid Wand",detection:"Gamma, Metal",detector:"CsI(Tl) with SiPM",crystal:"—",energy:"—"}, sort:{form:2,detection:2,detector:4,crystal:0,energy:0}},
   {num:970, model:"Model 970 (MCA)", sum:"Portable multi-channel analyzer", ds:"bnc-model-970-mca-datasheet.html",
    vals:{form:"—",detection:"—",detector:"NaI, CsI, CeBr, LaBr",crystal:"—",energy:"—"}, sort:{form:0,detection:0,detector:2,crystal:0,energy:0}}
  ]
},
"scintiq": {
  title: "ScintIQ Scintillation Detectors",
  productLine: "ScintIQ Scintillation Detectors",
  lede: "Compare scintillator materials at a glance and open any datasheet. Click any column heading to sort. Select materials to compare them side by side or request a quote.",
  dsbase: "https://www.berkeleynucleonics.com/docs/",
  quoteEndpoint: "https://formspree.io/f/xeewaglw",
  columns: [
    {key:"res", label:"Energy Res. @ 662 keV"},
    {key:"density", label:"Density"},
    {key:"decay", label:"Decay Time"},
    {key:"emission", label:"Max Emission"},
    {key:"app", label:"Primary Application"}
  ],
  models: [
   {num:1, model:"NaI(Tl)", sum:"High light output, cost-effective workhorse", ds:"bnc-scintiq-naitl-datasheet.html",
    vals:{res:"< 7.5% FWHM",density:"3.67 g/cm³",decay:"230 ns",emission:"415 nm",app:"General gamma counting"}, sort:{res:7.5,density:3.67,decay:230,emission:415,app:1}},
   {num:2, model:"LaBr₃(Ce)", sum:"Best-in-class 3% energy resolution", ds:"bnc-scintiq-labr3-datasheet.html",
    vals:{res:"3.0% FWHM",density:"5.07 g/cm³",decay:"16–20 ns",emission:"370 nm",app:"Isotope identification (RIID)"}, sort:{res:3.0,density:5.07,decay:16,emission:370,app:2}},
   {num:3, model:"CeBr₃", sum:"High resolution, low intrinsic background", ds:"bnc-scintiq-cebr3-datasheet.html",
    vals:{res:"4% FWHM",density:"5.23 g/cm³",decay:"18–25 ns",emission:"370 nm",app:"Gamma spectroscopy"}, sort:{res:4.0,density:5.23,decay:18,emission:370,app:3}},
   {num:4, model:"SrI₂(Eu)", sum:"Very high-resolution gamma spectroscopy", ds:"bnc-scintiq-sri2eu-datasheet.html",
    vals:{res:"3.5%",density:"4.6 g/cm³",decay:"1–5 µs",emission:"400–480 nm",app:"Gamma spectroscopy / RIID"}, sort:{res:3.5,density:4.6,decay:1000,emission:400,app:4}},
   {num:5, model:"CLLBC", sum:"High-resolution dual-mode neutron-gamma", ds:"bnc-scintiq-cllbc-datasheet.html",
    vals:{res:"< 3.5% FWHM",density:"4.08 g/cm³",decay:"120–500 ns",emission:"420 nm",app:"Neutron-gamma RIID"}, sort:{res:3.5,density:4.08,decay:120,emission:420,app:5}},
   {num:6, model:"CLYC", sum:"Dual-mode neutron-gamma detection", ds:"bnc-scintiq-clyc-datasheet.html",
    vals:{res:"4.5–5.5%",density:"3.31 g/cm³",decay:"50 ns (+1 µs)",emission:"370 nm",app:"Neutron-gamma detection"}, sort:{res:4.5,density:3.31,decay:50,emission:370,app:6}},
   {num:7, model:"LBC", sum:"Rugged 3% lanthanum spectroscopy", ds:"bnc-scintiq-lbc-datasheet.html",
    vals:{res:"3% FWHM",density:"4.90 g/cm³",decay:"35 ns",emission:"380 nm",app:"Gamma spectroscopy"}, sort:{res:3.0,density:4.90,decay:35,emission:380,app:7}},
   {num:8, model:"BGO", sum:"Highest density, non-hygroscopic stopping power", ds:"bnc-scintiq-bgo-datasheet.html",
    vals:{res:"—",density:"7.13 g/cm³",decay:"300 ns",emission:"480 nm",app:"PET imaging"}, sort:{res:99,density:7.13,decay:300,emission:480,app:8}},
   {num:9, model:"CsI(Tl)", sum:"Rugged photodiode/SiPM-readout crystal", ds:"bnc-scintiq-csitl-datasheet.html",
    vals:{res:"—",density:"4.51 g/cm³",decay:"600 ns / 3.4 µs",emission:"550 nm",app:"Charged-particle detection"}, sort:{res:99,density:4.51,decay:600,emission:550,app:9}},
   {num:10, model:"LYSO(Ce)", sum:"Dense, fast PET timing crystal", ds:"bnc-scintiq-lyso-datasheet.html",
    vals:{res:"—",density:"7.2 g/cm³",decay:"50 ns",emission:"420 nm",app:"PET imaging"}, sort:{res:99,density:7.2,decay:50,emission:420,app:10}},
   {num:11, model:"GAGG:Ce", sum:"Non-hygroscopic SiPM-matched garnet", ds:"bnc-scintiq-gaggce-datasheet.html",
    vals:{res:"—",density:"6.6 g/cm³",decay:"< 90 ns",emission:"520 nm",app:"PET imaging"}, sort:{res:99,density:6.6,decay:90,emission:520,app:11}},
   {num:12, model:"YAP:Ce", sum:"Fast low-energy X-ray crystal", ds:"bnc-scintiq-yapce-datasheet.html",
    vals:{res:"—",density:"5.55 g/cm³",decay:"27 ns",emission:"350 nm",app:"X-ray microanalysis"}, sort:{res:99,density:5.55,decay:27,emission:350,app:12}},
   {num:13, model:"BaF₂", sum:"Sub-nanosecond ultrafast UV scintillator", ds:"bnc-scintiq-baf2-datasheet.html",
    vals:{res:"—",density:"4.88 g/cm³",decay:"0.8 ns (fast)",emission:"220 / 310 nm",app:"Fast timing / PALS"}, sort:{res:99,density:4.88,decay:0.8,emission:220,app:13}},
   {num:14, model:"PbWO₄", sum:"Ultrafast ultra-dense calorimeter crystal", ds:"bnc-scintiq-pbwo4-datasheet.html",
    vals:{res:"—",density:"8.28 g/cm³",decay:"~6 ns",emission:"420 nm",app:"HEP calorimetry"}, sort:{res:99,density:8.28,decay:6,emission:420,app:14}},
   {num:15, model:"YAG:Ce", sum:"Rugged electron-beam imaging screen", ds:"bnc-scintiq-yag-datasheet.html",
    vals:{res:"—",density:"4.57 g/cm³",decay:"70 ns",emission:"550 nm",app:"Electron microscopy"}, sort:{res:99,density:4.57,decay:70,emission:550,app:15}},
   {num:16, model:"6Li Glass", sum:"Fast thermal-neutron detection glass", ds:"bnc-scintiq-6liglass-datasheet.html",
    vals:{res:"—",density:"2.5 g/cm³",decay:"~60 ns",emission:"395 nm",app:"Thermal neutron detection"}, sort:{res:99,density:2.5,decay:60,emission:395,app:16}}
  ]
},
"pvp": {
  title: "PVP-Series High-Voltage Power Supplies",
  productLine: "PVP-Series HV Power Supplies",
  lede: "Compare the PVP-Series high-voltage DC supplies at a glance and open the datasheet. Click any column heading to sort. Select models to compare them side by side or request a quote.",
  dsbase: "https://www.berkeleynucleonics.com/docs/",
  quoteEndpoint: "https://formspree.io/f/xeewaglw",
  columns: [
    {key:"voltage", label:"Max Voltage"},
    {key:"current", label:"Max Current"},
    {key:"power", label:"Output Power"},
    {key:"polarity", label:"Polarity"}
  ],
  models: [
   {num:1, model:"PVP-1500-2000", sum:"1.5 kV high-current, 2 A", ds:"bnc-pvp-hv-power-supply-manual.html",
    vals:{voltage:"1.5 kV",current:"2 A",power:"3 kW",polarity:"Floating or reversible"}, sort:{voltage:1.5,current:2000,power:3000,polarity:1}},
   {num:2, model:"PVP-1500-1400", sum:"1.5 kV floating high-current", ds:"bnc-pvp-hv-power-supply-manual.html",
    vals:{voltage:"1.5 kV",current:"1.4 A",power:"2 kW",polarity:"Floating or reversible"}, sort:{voltage:1.5,current:1400,power:2000,polarity:1}},
   {num:3, model:"PVP-5000-600", sum:"5 kV mid-voltage workhorse", ds:"bnc-pvp-hv-power-supply-manual.html",
    vals:{voltage:"5 kV",current:"600 mA",power:"3 kW",polarity:"Pos / neg / reversible"}, sort:{voltage:5,current:600,power:3000,polarity:2}},
   {num:4, model:"PVP-5000-400", sum:"5 kV reversible HV test", ds:"bnc-pvp-hv-power-supply-manual.html",
    vals:{voltage:"5 kV",current:"400 mA",power:"2 kW",polarity:"Pos / neg / reversible"}, sort:{voltage:5,current:400,power:2000,polarity:2}},
   {num:5, model:"PVP-10000-300", sum:"10 kV characterization supply", ds:"bnc-pvp-hv-power-supply-manual.html",
    vals:{voltage:"10 kV",current:"300 mA",power:"3 kW",polarity:"Pos / neg / reversible"}, sort:{voltage:10,current:300,power:3000,polarity:2}},
   {num:6, model:"PVP-10000-200", sum:"10 kV reversible bench source", ds:"bnc-pvp-hv-power-supply-manual.html",
    vals:{voltage:"10 kV",current:"200 mA",power:"2 kW",polarity:"Pos / neg / reversible"}, sort:{voltage:10,current:200,power:2000,polarity:2}},
   {num:7, model:"PVP-20000-25", sum:"20 kV precision HV reference", ds:"bnc-pvp-hv-power-supply-manual.html",
    vals:{voltage:"20 kV",current:"25 mA",power:"500 W",polarity:"Positive or negative"}, sort:{voltage:20,current:25,power:500,polarity:3}},
   {num:8, model:"PVP-30000-17", sum:"30 kV breakdown and charging", ds:"bnc-pvp-hv-power-supply-manual.html",
    vals:{voltage:"30 kV",current:"17 mA",power:"500 W",polarity:"Positive or negative"}, sort:{voltage:30,current:17,power:500,polarity:3}}
  ]
}
};

  function esc(s){ return String(s==null?"":s); }
  function injectCSS(){ if(document.getElementById('bnc-lc-style')) return;
    var st=document.createElement('style'); st.id='bnc-lc-style'; st.textContent=CSS;
    (document.head||document.documentElement).appendChild(st); }

  function initWidget(mount, cfg){
    var COLS=cfg.columns, MODELS=cfg.models, DSBASE=cfg.dsbase||DSBASE_DEFAULT;
    function val(m,k){ return (m.vals&&m.vals[k]!=null)?m.vals[k]:(m[k]!=null?m[k]:"—"); }
    function sortVal(m,k){ if(k==="num")return m.num; var s=m.sort&&m.sort[k]; return s==null?9999:s; }
    var colHead=COLS.map(function(c){return '<th data-k="'+c.key+'"><span class="arr">↕</span>'+esc(c.label)+'</th>';}).join('');
    var root=document.createElement('div'); root.className='bnc-lc-root';
    root.innerHTML =
      '<div class="lc"><button type="button" class="lc-head" aria-expanded="false">'+
        '<span class="lc-title">Line-Card <span class="lc-dot">&middot;</span> '+esc(cfg.title)+'</span>'+
        '<span class="lc-cta"><span class="lc-word">click to expand</span> <span class="lc-chev">&#9662;</span></span>'+
      '</button><div class="lc-body" hidden>'+
        (cfg.lede?'<p class="lede">'+esc(cfg.lede)+'</p>':'')+
        '<div class="bar"><span class="hint">Select multiple models, then:</span><span class="count">0 selected</span>'+
          '<button class="btn green cmpBtn" disabled>Compare</button><button class="btn primary quoteBtn" disabled>Request quote</button>'+
          '<span class="sp"></span><button class="btn clearBtn" style="border-color:var(--line);color:var(--muted)">Clear</button></div>'+
        '<table class="idx"><thead><tr><th class="cc"></th><th data-k="num"><span class="arr">↕</span>Model</th>'+colHead+'</tr></thead><tbody class="tb"></tbody></table>'+
        '<div class="tbar"><button class="btn primary quoteBtn2" disabled>Request quote on selected</button></div>'+
      '</div></div>'+
      '<div class="ov cmpOv"><div class="modal"><div class="mh"><h2>Compare <span class="pl">'+esc(cfg.title)+'</span></h2><button class="x" data-close>&times;</button></div><div class="mb"><table class="cmp cmpTbl"></table></div></div></div>'+
      '<div class="ov quoteOv"><div class="modal"><div class="mh"><h2>Request a quote</h2><button class="x" data-close>&times;</button></div><div class="mb"><div class="qmodels"></div>'+
        '<div class="fld"><label>Your email *</label><input type="email" class="qEmail" placeholder="you@company.com" autocomplete="email"></div>'+
        '<div class="fld"><label>Name / company</label><input type="text" class="qName" placeholder="Optional"></div>'+
        '<div class="fld"><label>Anything to add?</label><textarea class="qMsg" placeholder="Quantities, application, timeline (optional)"></textarea></div>'+
        '<button class="btn primary qSend">Send quote request</button><div class="qStatus" style="margin-top:10px;font-size:13.5px;color:var(--muted)"></div></div></div></div>';
    mount.innerHTML=''; mount.appendChild(root);
    var q=function(s){return root.querySelector(s);};
    var tb=q('.tb'), sel={}, selCount=0, sortK=null, sortDir=1;

    function rows(){
      var list=MODELS.slice();
      if(sortK) list.sort(function(a,b){var d=sortVal(a,sortK)-sortVal(b,sortK); return (d||(a.num-b.num))*sortDir;});
      tb.innerHTML=list.map(function(m){var id=m.model;
        return '<tr data-id="'+esc(id)+'"'+(sel[id]?' class="sel"':'')+'><td class="cc"><input type="checkbox" '+(sel[id]?'checked':'')+' data-id="'+esc(id)+'"></td>'+
          '<td class="model"><a href="'+DSBASE+m.ds+'">'+esc(m.model)+'</a><span class="sum">'+esc(m.sum)+'</span></td>'+
          COLS.map(function(c){return '<td class="spec">'+esc(val(m,c.key))+'</td>';}).join('')+'</tr>';
      }).join('');
    }
    function setSort(k){ if(sortK===k) sortDir*=-1; else {sortK=k;sortDir=1;}
      var ths=root.querySelectorAll('thead th[data-k]');
      for(var i=0;i<ths.length;i++){var on=ths[i].getAttribute('data-k')===k; ths[i].classList.toggle('sorted',on);
        var a=ths[i].querySelector('.arr'); if(a) a.textContent= on?(sortDir>0?'↑':'↓'):'↕';}
      rows(); }
    function selectedModels(){ return MODELS.filter(function(m){return sel[m.model];}); }
    function refreshBar(){ q('.count').textContent=selCount+' selected'; q('.cmpBtn').disabled=selCount<2; q('.quoteBtn').disabled=selCount<1; q('.quoteBtn2').disabled=selCount<1; }
    function openOv(c){ q('.'+c).classList.add('on'); }

    var ths=root.querySelectorAll('thead th[data-k]');
    for(var i=0;i<ths.length;i++){ (function(th){ th.addEventListener('click',function(){setSort(th.getAttribute('data-k'));}); })(ths[i]); }
    tb.addEventListener('change',function(e){ var cb=e.target; if(!cb||cb.type!=='checkbox')return;
      var id=cb.getAttribute('data-id'); if(cb.checked){sel[id]=1;selCount++;} else {delete sel[id];selCount--;}
      var tr=cb.parentNode.parentNode; if(tr) tr.classList.toggle('sel',cb.checked); refreshBar(); });
    q('.clearBtn').addEventListener('click',function(){ sel={};selCount=0; rows(); refreshBar(); });

    q('.cmpBtn').addEventListener('click',function(){ var ms=selectedModels().slice(0,CMP_MAX);
      var head='<thead><tr><th>Spec</th>'+ms.map(function(m){return '<th><a href="'+DSBASE+m.ds+'" style="color:var(--accent);text-decoration:none">'+esc(m.model)+'</a><div style="font-weight:400;color:var(--muted);font-size:12px">'+esc(m.sum)+'</div></th>';}).join('')+'</tr></thead>';
      var body=COLS.map(function(c){var vs=ms.map(function(m){return val(m,c.key);}); var same=vs.every(function(v){return v===vs[0];});
        return '<tr><td>'+esc(c.label)+'</td>'+vs.map(function(v){return '<td'+(same?'':' class="diff"')+'>'+esc(v)+'</td>';}).join('')+'</tr>';}).join('');
      var dsrow='<tr><td>Datasheet</td>'+ms.map(function(m){return '<td><a href="'+DSBASE+m.ds+'" style="color:var(--accent)">Open &rarr;</a></td>';}).join('')+'</tr>';
      q('.cmpTbl').innerHTML=head+'<tbody>'+body+dsrow+'</tbody>'; openOv('cmpOv'); });

    function prefillFromLogin(){
      try{
        var u = window.Clerk && window.Clerk.user; if(!u) return;
        var em = u.primaryEmailAddress && u.primaryEmailAddress.emailAddress;
        var nm = u.fullName || ((u.firstName||'')+' '+(u.lastName||'')).trim();
        var eF=q('.qEmail'), nF=q('.qName');
        if(em && eF && !eF.value) eF.value=em;
        if(nm && nF && !nF.value) nF.value=nm;
      }catch(e){}
    }
    function openQuote(){ var ms=selectedModels();
      q('.qmodels').innerHTML='Quote request for: '+ms.map(function(m){return '<b>'+esc(m.model)+'</b>';}).join(', ');
      q('.qStatus').textContent=''; prefillFromLogin(); openOv('quoteOv'); }
    q('.quoteBtn').addEventListener('click',openQuote); q('.quoteBtn2').addEventListener('click',openQuote);
    q('.qSend').addEventListener('click',function(){ var email=q('.qEmail').value.trim(), st=q('.qStatus');
      if(!/.+@.+\..+/.test(email)){ st.className='qStatus'; st.style.color='#b3261e'; st.textContent='Please enter a valid email so we can send your quote.'; return; }
      var ms=selectedModels(); st.className='qStatus'; st.style.color='var(--muted)'; st.textContent='Sending…';
      fetch(QUOTE_ENDPOINT,{method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json'},
        body:JSON.stringify({email:email,name:q('.qName').value.trim(),message:q('.qMsg').value.trim(),
          _subject:'Quote request: '+ms.map(function(m){return m.model;}).join(', '),product_line:cfg.productLine||cfg.title,
          models:ms.map(function(m){return m.model+' ('+m.sum+')';}).join('; ')})})
       .then(function(r){ if(r.ok){ st.className='qok'; st.textContent='Thank you. Your quote request was sent. We will be in touch shortly.'; }
         else { st.style.color='#b3261e'; st.textContent='That did not send. Please try again or email info@berkeleynucleonics.com.'; } })
       .catch(function(){ st.style.color='#b3261e'; st.textContent='Could not reach the server. Email info@berkeleynucleonics.com.'; }); });

    var closes=root.querySelectorAll('[data-close]');
    for(var j=0;j<closes.length;j++){ (function(b){ b.addEventListener('click',function(){ b.closest('.ov').classList.remove('on'); }); })(closes[j]); }
    var ovs=root.querySelectorAll('.ov');
    for(var k=0;k<ovs.length;k++){ (function(o){ o.addEventListener('click',function(e){ if(e.target===o) o.classList.remove('on'); }); })(ovs[k]); }

    var head=q('.lc-head'), bodyEl=q('.lc-body');
    head.addEventListener('click',function(){ var willOpen=bodyEl.hasAttribute('hidden');
      if(willOpen) bodyEl.removeAttribute('hidden'); else bodyEl.setAttribute('hidden','');
      head.setAttribute('aria-expanded',willOpen?'true':'false'); head.classList.toggle('open',willOpen);
      q('.lc-word').textContent= willOpen?'click to collapse':'click to expand'; });

    rows(); refreshBar();
  }

  function boot(){ injectCSS();
    var mounts=document.querySelectorAll('.bnc-lc[data-line]');
    for(var i=0;i<mounts.length;i++){ var cfg=BNC_LC_CONFIGS[mounts[i].getAttribute('data-line')]; if(cfg) initWidget(mounts[i],cfg); }
  }
  if(document.readyState!=='loading') boot(); else document.addEventListener('DOMContentLoaded',boot);
})();
