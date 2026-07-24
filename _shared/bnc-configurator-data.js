/* ============================================================
   BNC Product Configurator - product data
   Source of truth: MASTERPL2026 price list (DDG, RF, T&M tabs)
   Part-number grammar: legacy berkeleynucleonics.com configurators
   No pricing appears here by design. Quotes go through the form.
   ============================================================ */

(function () {
  "use strict";

  var FIG = (window.BNC_CFG_FIG_PATH || "figures/");

  /* ---------------------------------------------------------
     FAMILY 1: Digital Delay / Pulse Generators (575, 577)
     --------------------------------------------------------- */

  var DDG_OUTPUTS = [
    { code: "AT20", label: "TTL / adjustable 20 V output", std: true,
      info: "The standard output. TTL levels or adjustable amplitude up to 20 V into high impedance. Included at no charge." },
    { code: "TZ50", label: "TTL / adjustable, 50 ohm match",
      info: "TTL-compatible adjustable output matched to 50 ohm loads for clean edges on terminated lines." },
    { code: "AT35", label: "TTL / adjustable 35 V output",
      info: "Raises the adjustable output amplitude to 35 V for driving higher-threshold devices." },
    { code: "TZ35", label: "TTL 50 ohm match / 35 V adjustable",
      info: "Combines the 50 ohm matched output with amplitude adjustable up to 35 V." },
    { code: "AT45", label: "High voltage 45 V output, fast risetime",
      info: "High voltage 45 V output with increased pulse width capability and fast risetime. The highest drive option for this platform." },
    { code: "L82", label: "820 nm optical output",
      info: "Fiber-coupled 820 nm optical output for electrically isolated triggering and noise-immune links." },
    { code: "L130", label: "1300 nm optical output",
      info: "Fiber-coupled 1300 nm optical output for longer fiber runs and telecom-band systems." }
  ];

  var DDG_BANK_IDS = ["outAB", "outCD", "outEF", "outGH"];

  function ddgBank(bankId, bankLabel, channelsIn) {
    var otherBanks = DDG_BANK_IDS.filter(function (b) { return b !== bankId; });
    return {
      id: bankId,
      label: "Output type, channels " + bankLabel,
      hint: "Each bank of two channels can carry its own output type.",
      type: "radio",
      onlyFor: channelsIn ? { group: { id: "channels", in: channelsIn } } : null,
      options: DDG_OUTPUTS.map(function (o) {
        var opt = {
          code: o.code,
          label: o.code + (o.std ? " (standard)" : ""),
          note: o.label,
          pn: "-" + o.code,
          desc: "Ch " + bankLabel + ": " + o.label,
          info: o.info,
          default: !!o.std
        };
        // AT45 is limited to two banks (4 channels) per unit; once two other
        // banks carry AT45, this bank can no longer take AT45 or AT35.
        if (o.code === "AT45" || o.code === "AT35") {
          opt.onlyFor = { radios: { groups: otherBanks, in: ["AT45"], lessThan: 2 } };
          opt.onlyForReason = o.code === "AT45"
            ? "AT45 is limited to two banks (4 channels) per unit"
            : "Not offered once two banks carry the AT45 output";
        }
        return opt;
      })
    };
  }

  function ddgCommonTail(rackNote) {
    return [
      {
        id: "trigopts", label: "Trigger options", type: "check",
        options: [
          { code: "DT15", codeLabel: "-DT15", label: "Dual trigger input", note: "Second 15 V adjustable trigger input",
            pn: "-DT15", desc: "Dual trigger 15 V adjustable input", badge: "Dual trigger",
            info: "Adds a second independent 15 V adjustable trigger input so two event sources can drive the timing system." }
        ]
      },
      {
        id: "input", label: "Trigger / gate input", type: "radio",
        options: [
          { code: "IA15", label: "IA15 (standard)", note: "Electrical 15 V adjustable input", pn: "-IA15",
            desc: "15 V adjustable trigger input",
            info: "Standard electrical trigger and gate input, adjustable to 15 V. Included at no charge.", default: true },
          { code: "IL82", label: "IL82", note: "820 nm optical input", pn: "-IL82",
            desc: "820 nm optical trigger input",
            info: "Optical 820 nm trigger input for isolated, noise-immune triggering over fiber." },
          { code: "IL130", label: "IL130", note: "1300 nm optical input", pn: "-IL130",
            desc: "1300 nm optical trigger input",
            info: "Optical 1300 nm trigger input for isolated triggering over longer fiber runs." }
        ]
      },
      {
        id: "comm", label: "Communication", type: "radio",
        options: [
          { code: "S", label: "Standard", note: "RS-232 and USB", pn: "-S",
            desc: "RS-232 and USB communication",
            info: "RS-232 and USB remote control are standard on every unit.", default: true },
          { code: "COM", label: "-COM", note: "Adds GPIB and Ethernet", pn: "-COM",
            desc: "GPIB and Ethernet communication added", badge: "GPIB + Ethernet",
            info: "Adds GPIB (IEEE-488) and Ethernet control alongside the standard RS-232 and USB. The choice for automated test racks." }
        ]
      },
      {
        id: "power", label: "Power cord", type: "radio",
        options: [
          { code: "US", label: "-US", note: "115 V North American power cord", pn: "-US",
            desc: "115 V North American power cord",
            info: "115 V North American power cord. No charge.", default: true },
          { code: "EU", label: "-EU", note: "230 V European power cord", pn: "-EU",
            desc: "230 V European power cord",
            info: "230 V European power cord. No charge." }
        ]
      },
      {
        id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check",
        options: [
          { code: "RM1", codeLabel: "P/N 6923", label: "19 inch single rack mount", pn: "", acc: "6923",
            desc: "19 inch single rack mount", badge: "Rack mount",
            info: "Mounts one unit in a standard 19 inch rack. " + rackNote },
          { code: "RM2", codeLabel: "P/N 6978", label: "19 inch dual rack mount", pn: "", acc: "6978",
            desc: "19 inch dual rack mount", badge: "Dual rack mount",
            info: "Mounts two units side by side in a standard 19 inch rack. " + rackNote,
            excludes: ["RM1"] }
        ]
      }
    ];
  }

  var FAMILY_DDG = {
    id: "ddg",
    title: "Digital Delay / Pulse Generator Configurator",
    subtitle: "Models 575, 577 and 745T. Build your part number, then request a QuickQuote.",
    models: [
      {
        id: "575",
        name: "Model 575",
        blurb: "250 ps resolution, 200 ps channel-to-channel jitter, 2 to 8 channels",
        info: "The Model 575 digital delay and pulse generator provides 250 ps delay and width resolution with 200 ps internal channel-to-channel jitter. RS-232 and USB are standard, and every bank of two channels can carry its own output type. Two-year warranty.",
        image: FIG + "575-front.jpg",
        pnBase: "575",
        groups: [
          {
            id: "channels", label: "Number of channels", type: "radio",
            options: [
              { code: "2C", label: "2 channels", pn: "-2C", desc: "2-channel digital delay generator",
                info: "Two independent delay and pulse channels. The compact entry point to the 575 platform.", default: true },
              { code: "4C", label: "4 channels", pn: "-4C", desc: "4-channel digital delay generator",
                info: "Four independent channels, the most popular configuration for laser and imaging timing." },
              { code: "8C", label: "8 channels", pn: "-8C", desc: "8-channel digital delay generator",
                info: "Eight independent channels for complex sequencing across many instruments." }
            ]
          },
          ddgBank("outAB", "A/B", null),
          ddgBank("outCD", "C/D", ["4C", "8C"]),
          ddgBank("outEF", "E/F", ["8C"]),
          ddgBank("outGH", "G/H", ["8C"])
        ].concat(ddgCommonTail("Fits the Model 575."))
      },
      {
        id: "577",
        name: "Model 577",
        blurb: "250 ps resolution, 50 ps channel-to-channel jitter, 3-year warranty",
        info: "The Model 577 delivers the same 250 ps delay and width resolution as the 575 with internal channel-to-channel jitter reduced to 50 ps, in 4- or 8-channel versions. RS-232 and USB are standard. Three-year warranty.",
        image: FIG + "577-front.png",
        pnBase: "577",
        groups: [
          {
            id: "channels", label: "Number of channels", type: "radio",
            options: [
              { code: "4C", label: "4 channels", pn: "-4C", desc: "4-channel digital delay generator",
                info: "Four independent channels with 50 ps channel-to-channel jitter.", default: true },
              { code: "8C", label: "8 channels", pn: "-8C", desc: "8-channel digital delay generator",
                info: "Eight independent channels with 50 ps channel-to-channel jitter for demanding multi-device timing." }
            ]
          },
          ddgBank("outAB", "A/B", null),
          ddgBank("outCD", "C/D", null),
          ddgBank("outEF", "E/F", ["8C"]),
          ddgBank("outGH", "G/H", ["8C"])
        ].concat(ddgCommonTail("Fits the Model 577."))
      },
      {
        id: "745t",
        name: "Model 745T",
        blurb: "Touchscreen digital delay generators, 4 or 8 channels",
        info: "The 745T is a touchscreen digital delay generator available in 4- and 8-channel versions, with rack mounts and a family of GFT signal-conditioning modules.",
        image: FIG + "745t.png",
        pnBase: "745T",
        groups: [
          {
            id: "version", label: "Version", type: "radio",
            options: [
              { code: "4C", label: "745T-4C-GOC", note: "Touchscreen digital delay generator, 4 channels", pn: "-4C-GOC",
                desc: "Touchscreen digital delay generator, 4 channels",
                info: "Four-channel touchscreen digital delay generator.", default: true },
              { code: "8C", label: "745T-8C-GOC", note: "Touchscreen digital delay generator, 8 channels", pn: "-8C-GOC",
                desc: "Touchscreen digital delay generator, 8 channels",
                info: "Eight-channel touchscreen digital delay generator." }
            ]
          },
          {
            id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check",
            options: [
              { code: "RM60", codeLabel: "P/N 7060", label: "19 inch single rackmount", pn: "", acc: "7060",
                desc: "19 inch single rackmount", badge: "Rack mount",
                excludes: ["RM61"],
                info: "Mounts one touchscreen 745T in a standard 19 inch rack." },
              { code: "RM61", codeLabel: "P/N 7061", label: "19 inch dual rackmount", pn: "", acc: "7061",
                desc: "19 inch dual rackmount", badge: "Dual rack mount",
                excludes: ["RM60"],
                info: "Mounts two touchscreen 745T units side by side in a standard 19 inch rack." },
              { code: "GFT101", codeLabel: "P/N GFT101", label: "Electrical to optical converter", pn: "", acc: "GFT101",
                desc: "electrical to optical converter",
                info: "Converts electrical delay outputs to optical for isolated fiber distribution." },
              { code: "GFT200", codeLabel: "P/N GFT200", label: "Optical to electrical converter", pn: "", acc: "GFT200",
                desc: "optical to electrical converter",
                info: "Converts optical signals back to electrical at the receiving end of a fiber link." },
              { code: "GFT300", codeLabel: "P/N GFT300", label: "Sub-nanosecond pulse stretcher", pn: "", acc: "GFT300",
                desc: "sub-nanosecond pulse stretcher",
                info: "Stretches sub-nanosecond pulses for downstream instruments that need wider pulses." },
              { code: "GFT400", codeLabel: "P/N GFT400", label: "Gaussian pulse module", pn: "", acc: "GFT400",
                desc: "Gaussian pulse module",
                info: "Shapes outputs into Gaussian pulses." },
              { code: "GFT500", codeLabel: "P/N GFT500", label: "Fast rise time module", pn: "", acc: "GFT500",
                desc: "fast rise time module",
                info: "Sharpens output edges for timing-critical loads." },
              { code: "GFT632", codeLabel: "P/N GFT632", label: "32 V pulse generator module", pn: "", acc: "GFT632",
                desc: "32 V pulse generator module",
                info: "Standalone 32 V pulse generator module for high-drive applications." }
            ]
          }
        ]
      }
    ]
  };

  /* ---------------------------------------------------------
     FAMILY 1b: Model 765 (standalone configurator)
     --------------------------------------------------------- */

  var FAMILY_765 = {
    id: "765",
    title: "Model 765 Fast Pulse Generator Configurator",
    subtitle: "70 ps edges at 5 V, or 400 ps edges at 50 V in the HV versions. Build your part number, then request a QuickQuote.",
    models: [
      {
        id: "765",
        name: "Model 765",
        blurb: "Fast pulse generator: 70 ps edges at 5 V, or 400 ps edges at 50 V",
        info: "The Model 765 is a fast pulse generator with 70 ps edge times at 5 V in 2- and 4-channel versions, plus high-voltage versions delivering 400 ps edges at 50 V in 1- and 2-channel configurations.",
        image: FIG + "765-front.png",
        pnBase: "765",
        imageRules: [
          { when: { group: { id: "version", in: ["HV1", "HV2"] } }, src: FIG + "765hv-front.png", caption: "765 high-voltage version" }
        ],
        groups: [
          {
            id: "version", label: "Version", type: "radio",
            options: [
              { code: "2", label: "765-2", note: "2 channels, 70 ps edge time, 5 V", pn: "-2",
                desc: "2-channel pulse generator, 70 ps edge time, 5 V",
                info: "Two channels with 70 ps edge times at 5 V amplitude.", default: true },
              { code: "4", label: "765-4", note: "4 channels, 70 ps edge time, 5 V", pn: "-4",
                desc: "4-channel pulse generator, 70 ps edge time, 5 V",
                info: "Four channels with 70 ps edge times at 5 V amplitude." },
              { code: "HV1", label: "765-HV-1C", note: "1 channel, 400 ps edge time, 50 V", pn: "-HV-1C",
                desc: "1-channel high-voltage pulse generator, 400 ps edge time, 50 V", badge: "50 V HV",
                info: "Single-channel high-voltage version: 400 ps edge times at 50 V amplitude." },
              { code: "HV2", label: "765-HV-2C", note: "2 channels, 400 ps edge time, 50 V", pn: "-HV-2C",
                desc: "2-channel high-voltage pulse generator, 400 ps edge time, 50 V", badge: "50 V HV",
                info: "Two-channel high-voltage version: 400 ps edge times at 50 V amplitude." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "GPIB", codeLabel: "-GPIB", label: "GP-IB / USB-TMC interface",
                pn: "-GPIB", desc: "GP-IB / USB-TMC interface", badge: "GPIB",
                info: "Adds GPIB (IEEE-488) and USB-TMC instrument control." }
            ]
          },
          {
            id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check",
            options: [
              { code: "SSKIT", codeLabel: "P/N 765 SSKit", label: "1 TB solid state disk for the 765 series", pn: "", acc: "765-SSKIT",
                desc: "1 TB solid state disk",
                info: "Adds 1 TB of solid state storage for waveform and settings data." },
              { code: "RM", codeLabel: "P/N 765-RM", label: "Rackmount kit", pn: "", acc: "765-RM",
                desc: "rackmount kit", badge: "Rack mount",
                info: "Mounts the 765 in a standard 19 inch rack." }
            ]
          }
        ]
      }
    ]
  };

  /* ---------------------------------------------------------
     FAMILY 2: Arbitrary Waveform Generators
     670C, 675, 685C, 685, 686 (Rider platform)
     --------------------------------------------------------- */

  function riderAccessories(extra) {
    var base = [
      { code: "RACK", codeLabel: "P/N RIDER-RACK", label: "19 inch rackmount kit", pn: "", acc: "RIDER-RACK",
        desc: "19 inch rackmount kit", badge: "Rack kit",
        info: "Rackmount kit for installing the instrument in a standard 19 inch rack." },
      { code: "SSD250", codeLabel: "P/N SSD-250", label: "Additional 250 GB solid state disk", pn: "", acc: "SSD-250",
        desc: "additional 250 GB SSD",
        info: "Adds 250 GB of solid state waveform storage.", excludes: ["SSD500", "SSD1000"] },
      { code: "SSD500", codeLabel: "P/N SSD-500", label: "Additional 500 GB solid state disk", pn: "", acc: "SSD-500",
        desc: "additional 500 GB SSD",
        info: "Adds 500 GB of solid state waveform storage.", excludes: ["SSD250", "SSD1000"] },
      { code: "SSD1000", codeLabel: "P/N SSD-1000", label: "Additional 1 TB solid state disk", pn: "", acc: "SSD-1000",
        desc: "additional 1 TB SSD",
        info: "Adds 1 TB of solid state waveform storage.", excludes: ["SSD250", "SSD500"] },
      { code: "GPIB", codeLabel: "P/N RIDER-GPIB", label: "GP-IB / USB-TMC option", pn: "", acc: "RIDER-GPIB",
        desc: "GP-IB / USB-TMC interface", badge: "GPIB",
        info: "Adds GPIB (IEEE-488) and USB-TMC instrument control for automated test systems." },
      { code: "SYNC", codeLabel: "P/N RIDER-AWG-SYNC", label: "Multi-instrument synchronization cable, 0.5 m", pn: "", acc: "RIDER-AWG-SYNC",
        desc: "multi-instrument synchronization cable",
        info: "Phase-locks several instruments together so channel counts can scale beyond a single chassis." }
    ];
    return { id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check", options: base.concat(extra || []) };
  }

  var LVDS_ACC = { code: "SMA8", codeLabel: "P/N AT-LVDS-SMA8", label: "Mini SAS HD to 16 SMA cable (8 LVDS outputs)", pn: "", acc: "AT-LVDS-SMA8",
    desc: "Mini SAS HD to 16 SMA cable",
    info: "Breaks the digital connector out to 16 SMA connectors carrying 8 LVDS pairs." };
  var DTTL_ACC = { code: "DTTL8", codeLabel: "P/N AT-DTTL8", label: "8-bit LVDS to LVTTL converter", pn: "", acc: "AT-DTTL8",
    desc: "8-bit LVDS to LVTTL converter",
    info: "Converts 8 LVDS digital outputs to LVTTL levels for driving standard logic." };

  function digLicense(code, label, minCh, chGroupIn, others, seriesNote) {
    return {
      code: code, codeLabel: "-" + code, label: label,
      note: "Requires at least " + minCh + " channels. Includes Mini SAS cabling and an LVDS to LVTTL converter.",
      pn: "-" + code, desc: label, badge: label.replace(" license", ""),
      onlyFor: { group: { id: "channels", in: chGroupIn } },
      onlyForReason: "Requires at least " + minCh + " analog channels",
      excludes: others,
      info: "Digital pattern license enabling " + label.toLowerCase() + ". " + seriesNote +
        " Ships with Mini SAS to Mini SAS HD cabling (8 LVDS pairs) and an 8-bit LVDS to LVTTL converter."
    };
  }

  var FAMILY_AWG = {
    id: "awg",
    title: "Arbitrary Waveform Generator Configurator",
    subtitle: "Rider platform: 670C, 675, 685C, 685 and 686. Build your part number, then request a QuickQuote.",
    models: [
      {
        id: "670c",
        name: "Model 670C",
        blurb: "600 MS/s, 2 or 4 channels, up to 512 M points",
        info: "The 670C combines a 600 MS/s arbitrary waveform generator with a 180 MHz function generator, in 2- or 4-channel versions with deep waveform memory options.",
        image: FIG + "670c-front2.png",
        imageCaption: "Model 670C - 600 MS/s 16-bit arbitrary waveform generator",
        pnBase: "670C",
        groups: [
          {
            id: "channels", label: "Number of channels", type: "radio",
            options: [
              { code: "2C", label: "2 channels", pn: "-2C", desc: "2-channel 600 MS/s AWG",
                info: "Two-channel version with the full 180 MHz analog bandwidth.", default: true },
              { code: "4C", label: "4 channels", pn: "-4C", desc: "4-channel 600 MS/s AWG",
                info: "Four-channel version. Also available as a 100 MHz LF variant with a 12 Vpp output stage." }
            ]
          },
          {
            id: "bw", label: "Analog bandwidth", type: "radio",
            options: [
              { code: "STD", label: "180 MHz (standard)", pn: "", desc: "180 MHz function generator bandwidth",
                info: "Full 180 MHz AFG bandwidth.", default: true },
              { code: "LF", label: "100 MHz LF", note: "12 Vpp output, 4-channel only", pn: "",
                desc: "100 MHz LF variant with 12 Vpp output",
                onlyFor: { group: { id: "channels", in: ["4C"] } },
                onlyForReason: "LF variant is built on the 4-channel chassis",
                info: "The LF variant trades bandwidth (100 MHz) for a built-in 12 Vpp output stage. Available on the 4-channel chassis with 2 M or 128 M point memory.", badge: "LF 12 Vpp" }
            ]
          },
          {
            id: "memory", label: "Waveform memory (per channel)", type: "radio",
            options: [
              { code: "2M", label: "2 M points",
                pn: function (s) { return "-2M" + (s.radios.bw === "LF" ? "-LF" : ""); },
                desc: "2 M points of waveform memory",
                info: "2 million points of waveform memory per channel. The standard depth.", default: true },
              { code: "64M", label: "64 M points",
                pn: "-64M", desc: "64 M points of waveform memory",
                onlyFor: { group: { id: "bw", in: ["STD"] } },
                onlyForReason: "LF variant offers 2 M or 128 M memory",
                info: "64 million points per channel for long modulation records." },
              { code: "128M", label: "128 M points (LF only)",
                pn: "-128M-LF", desc: "128 M points of waveform memory (LF)",
                onlyFor: { group: { id: "bw", in: ["LF"] } },
                onlyForReason: "128 M depth is offered on the LF variant",
                info: "128 million points per channel on the 100 MHz LF variant." },
              { code: "256M", label: "256 M points",
                pn: "-256M", desc: "256 M points of waveform memory",
                onlyFor: { group: { id: "bw", in: ["STD"] } },
                onlyForReason: "LF variant offers 2 M or 128 M memory",
                info: "256 million points per channel for very long scenario playback." },
              { code: "512M", label: "512 M points",
                pn: "-512M", desc: "512 M points of waveform memory",
                onlyFor: { group: { id: "bw", in: ["STD"] } },
                onlyForReason: "LF variant offers 2 M or 128 M memory",
                info: "512 million points per channel, the deepest memory on the 670C." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "HV", codeLabel: "-HV2 / -HV4", label: "High voltage output, 12 Vpp into 50 ohm",
                pn: function (s) { return s.radios.channels === "2C" ? "-HV2" : "-HV4"; },
                desc: function (s) { return "High voltage 12 Vpp output (" + (s.radios.channels === "2C" ? "HV2" : "HV4") + ")"; },
                badge: "12 Vpp HV",
                onlyFor: { group: { id: "bw", in: ["STD"] } },
                onlyForReason: "The LF variant already includes a 12 Vpp output stage",
                info: "Raises the output drive to 12 Vpp into 50 ohm. Ordered as -HV2 on 2-channel and -HV4 on 4-channel units." },
              digLicense("DIG8", "8-channel digital license", 2, ["2C", "4C"], [],
                "Adds 8 digital pattern channels to the 670C.")
            ]
          },
          riderAccessories([
            Object.assign({}, LVDS_ACC, { needs: ["DIG8"] }),
            Object.assign({}, DTTL_ACC, { needs: ["DIG8"] })
          ])
        ]
      },
      {
        id: "675",
        name: "Model 675",
        blurb: "1.2 GS/s, 300 MHz, 2 to 8 channels, up to 1 G point",
        info: "The 675 is a 1.2 GS/s arbitrary waveform generator with 300 MHz bandwidth and 6 Vpp outputs, scaling from 2 to 8 channels with up to 1024 M points of memory.",
        image: FIG + "675-front.png",
        pnBase: "675",
        groups: [
          {
            id: "channels", label: "Number of channels", type: "radio",
            options: [
              { code: "2C", label: "2 channels", pn: "-2C", desc: "2-channel 1.2 GS/s AWG",
                info: "Two-channel version of the 1.2 GS/s, 300 MHz platform.", default: true },
              { code: "4C", label: "4 channels", pn: "-4C", desc: "4-channel 1.2 GS/s AWG",
                info: "Four-channel version. Unlocks the 16-channel digital license." },
              { code: "8C", label: "8 channels", pn: "-8C", desc: "8-channel 1.2 GS/s AWG",
                info: "Eight-channel version. Unlocks the 32-channel digital license." }
            ]
          },
          {
            id: "memory", label: "Waveform memory (per channel)", type: "radio",
            options: [
              { code: "2M", label: "2 M points", pn: "-2M", desc: "2 M points of waveform memory",
                info: "2 million points per channel.", default: true },
              { code: "64M", label: "64 M points", pn: "-64M", desc: "64 M points of waveform memory",
                info: "64 million points per channel." },
              { code: "128M", label: "128 M points", pn: "-128M", desc: "128 M points of waveform memory",
                info: "128 million points per channel." },
              { code: "1G", label: "1024 M points", pn: "-1G", desc: "1024 M points of waveform memory",
                info: "1024 million points per channel, the deepest memory on the 675." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "HV", codeLabel: "-HV2 / -HV4 / -HV8", label: "High voltage output, 12 Vpp into 50 ohm",
                pn: function (s) { return { "2C": "-HV2", "4C": "-HV4", "8C": "-HV8" }[s.radios.channels]; },
                desc: function (s) { return "High voltage 12 Vpp output (HV" + s.radios.channels.charAt(0) + ")"; },
                badge: "12 Vpp HV",
                info: "Raises the output drive to 12 Vpp into 50 ohm across all channels. The code follows the channel count: -HV2, -HV4 or -HV8." },
              { code: "PAT", codeLabel: "-PAT", label: "Serial pattern generator",
                pn: "-PAT", desc: "Serial pattern generator", badge: "Pattern gen",
                info: "Turns the analog channels into a serial pattern generator for stress and protocol testing." },
              digLicense("DIG8", "8-channel digital license", 2, ["2C", "4C", "8C"], ["DIG16", "DIG32"],
                "Adds 8 digital pattern channels to the 675."),
              digLicense("DIG16", "16-channel digital license", 4, ["4C", "8C"], ["DIG8", "DIG32"],
                "Adds 16 digital pattern channels to the 675."),
              digLicense("DIG32", "32-channel digital license", 8, ["8C"], ["DIG8", "DIG16"],
                "Adds 32 digital pattern channels to the 675.")
            ]
          },
          riderAccessories([
            Object.assign({}, LVDS_ACC), Object.assign({}, DTTL_ACC)
          ])
        ]
      },
      {
        id: "685c",
        name: "Model 685C",
        blurb: "3 GS/s, 2 GHz, differential outputs, 2 to 8 channels",
        info: "The 685C provides 3 GS/s sampling with 2 GHz bandwidth, 2048 M points per channel and 1.5 Vpp differential outputs, in 2-, 4- or 8-channel versions.",
        image: FIG + "685c-front.png",
        pnBase: "685C",
        groups: [
          {
            id: "channels", label: "Number of channels", type: "radio",
            options: [
              { code: "2C", label: "2 channels", pn: "-2C", desc: "2-channel 3 GS/s AWG, 1.5 Vpp differential",
                info: "Two channels at 3 GS/s with 2048 M points per channel.", default: true },
              { code: "4C", label: "4 channels", pn: "-4C", desc: "4-channel 3 GS/s AWG, 1.5 Vpp differential",
                info: "Four channels at 3 GS/s with 2048 M points per channel." },
              { code: "8C", label: "8 channels", pn: "-8C", desc: "8-channel 3 GS/s AWG, 1.5 Vpp differential",
                info: "Eight channels at 3 GS/s with 2048 M points per channel." }
            ]
          },
          riderAccessories()
        ]
      },
      {
        id: "685",
        name: "Model 685",
        blurb: "6 GS/s, 2 GHz, single-ended or differential, RF mode to 12 GS/s",
        info: "The 685 samples at 6 GS/s with 2 GHz bandwidth and 2048 M points per channel, with a choice of 5 Vpp single-ended or differential outputs and an optional 12 GS/s RF mode.",
        image: FIG + "685-front.png",
        pnBase: "685",
        groups: [
          {
            id: "channels", label: "Number of channels", type: "radio",
            options: [
              { code: "2C", label: "2 channels", pn: "-2C", desc: "2-channel 6 GS/s AWG",
                info: "Two channels at 6 GS/s with 2048 M points per channel.", default: true },
              { code: "4C", label: "4 channels", pn: "-4C", desc: "4-channel 6 GS/s AWG",
                info: "Four channels at 6 GS/s with 2048 M points per channel." },
              { code: "8C", label: "8 channels", pn: "-8C", desc: "8-channel 6 GS/s AWG",
                info: "Eight channels at 6 GS/s with 2048 M points per channel." }
            ]
          },
          {
            id: "output", label: "Output type", type: "radio",
            options: [
              { code: "D", label: "Differential (standard)", note: "1.5 Vpp differential (3 Vpp on 8-channel)",
                pn: "D", desc: "Differential outputs",
                info: "Differential outputs, 1.5 Vpp (3 Vpp on the 8-channel version). Part numbers read 685-2CD, 685-4CD, 685-8CD.", default: true },
              { code: "SE", label: "Single-ended, 5 Vpp",
                pn: function (s) { return "-SE" + s.radios.channels.charAt(0); },
                desc: "5 Vpp single-ended outputs", badge: "5 Vpp SE",
                info: "Single-ended 5 Vpp outputs. Part numbers read 685-2C-SE2, 685-4C-SE4, 685-8C-SE8." }
            ]
          },
          {
            id: "memory", label: "Waveform memory (per channel)", type: "radio",
            options: [
              { code: "2G", label: "2048 M points (standard)", pn: "", desc: "2048 M points per channel",
                info: "2048 million points of waveform memory per channel, standard.", default: true },
              { code: "4G", label: "4096 M points", pn: "-4G", desc: "Memory upgrade to 4096 M points per channel",
                badge: "4G memory",
                info: "Doubles waveform memory to 4096 million points per channel." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "RF", codeLabel: "-RF", label: "12 GS/s RF mode",
                pn: "-RF", desc: "12 GS/s RF mode", badge: "12 GS/s RF",
                info: "Interleaves the converters to reach 12 GS/s for direct RF signal generation." },
              { code: "PAT", codeLabel: "-PAT", label: "Serial pattern generator",
                pn: "-PAT", desc: "Serial pattern generator", badge: "Pattern gen",
                info: "Serial pattern generation on the analog channels for stress and protocol testing." },
              { code: "FSS", codeLabel: "-FSS", label: "Fast sequence switch",
                pn: "-FSS", desc: "Fast sequence switch",
                info: "Fast scenario switching between stored sequences with minimal dead time." },
              digLicense("DIG8", "8-channel digital license", 2, ["2C", "4C", "8C"], ["DIG16", "DIG32"],
                "Adds 8 digital pattern channels to the 685."),
              digLicense("DIG16", "16-channel digital license", 4, ["4C", "8C"], ["DIG8", "DIG32"],
                "Adds 16 digital pattern channels to the 685."),
              digLicense("DIG32", "32-channel digital license", 8, ["8C"], ["DIG8", "DIG16"],
                "Adds 32 digital pattern channels to the 685.")
            ]
          },
          riderAccessories([
            Object.assign({}, LVDS_ACC), Object.assign({}, DTTL_ACC)
          ])
        ]
      },
      {
        id: "686",
        name: "Model 686",
        blurb: "20 GS/s, full memory, single-ended or differential outputs",
        info: "The 686 is the top of the AWG line: 20 GS/s sampling with full waveform memory and a choice of 5 Vpp single-ended or 2.5 Vpp differential outputs, in 2- or 4-channel versions.",
        image: FIG + "686-front.png",
        pnBase: "686",
        groups: [
          {
            id: "channels", label: "Number of channels", type: "radio",
            options: [
              { code: "2C", label: "2 channels", pn: "-2C", desc: "2-channel 20 GS/s AWG",
                info: "Two channels at 20 GS/s with full memory.", default: true },
              { code: "4C", label: "4 channels", pn: "-4C", desc: "4-channel 20 GS/s AWG",
                info: "Four channels at 20 GS/s with full memory. Unlocks the digital pattern licenses." }
            ]
          },
          {
            id: "output", label: "Output type", type: "radio",
            options: [
              { code: "D", label: "Differential (standard)", note: "2.5 Vpp differential, 1.25 Vpp single-ended",
                pn: "D", desc: "2.5 Vpp differential outputs",
                info: "Differential 2.5 Vpp outputs (1.25 Vpp used single-ended). Part numbers read 686-2CD, 686-4CD.", default: true },
              { code: "SE", label: "Single-ended, 5 Vpp", pn: "-SE",
                desc: "5 Vpp single-ended outputs", badge: "5 Vpp SE",
                info: "Single-ended 5 Vpp outputs. Part numbers read 686-2C-SE, 686-4C-SE." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "PAT", codeLabel: "-PAT", label: "Serial pattern generator",
                pn: "-PAT", desc: "Serial pattern generator", badge: "Pattern gen",
                info: "Serial pattern generation on the analog channels for stress and protocol testing." },
              digLicense("DIG8", "8-channel digital license", 4, ["4C"], ["DIG16", "DIG32"],
                "Adds 8 digital pattern channels to the 686."),
              digLicense("DIG16", "16-channel digital license", 4, ["4C"], ["DIG8", "DIG32"],
                "Adds 16 digital pattern channels to the 686."),
              digLicense("DIG32", "32-channel digital license", 4, ["4C"], ["DIG8", "DIG16"],
                "Adds 32 digital pattern channels to the 686.")
            ]
          },
          riderAccessories([
            Object.assign({}, LVDS_ACC), Object.assign({}, DTTL_ACC)
          ])
        ]
      }
    ]
  };

  /* ---------------------------------------------------------
     FAMILY 3: RF and Microwave Signal Generators
     845, 865B, 870A, 875
     --------------------------------------------------------- */

  var FAMILY_RF = {
    id: "rf",
    title: "RF / Microwave Signal Generator Configurator",
    subtitle: "Models 845, 865B, 870A, 871A and 875. Build your part number, then request a QuickQuote.",
    models: [
      {
        id: "845",
        name: "Model 845",
        blurb: "Microwave signal generator, 6 to 26.5 GHz versions",
        info: "The Model 845 is a low-noise microwave signal generator available in 6, 12, 20 and 26.5 GHz versions, with desktop, rackmount and OEM packages. The 6 GHz version includes the 9 kHz extension and high output power options as standard.",
        image: FIG + "845-desktop.png",
        imageCaption: "Configuration preview",
        pnBase: "845",
        similar: ["865b", "870a", "871a"],
        imageRules: [
          { when: { group: { id: "housing", in: ["OEM"] } }, src: FIG + "845-oem.png", caption: "OEM board-level package" },
          { when: { group: { id: "housing", in: ["RACK"] } }, src: FIG + "opt-rackmount-1u.png", caption: "19 inch 1U rackmount module" },
          { when: { checked: "BUMP" }, src: FIG + "opt-bumper.png", caption: "Ruggedized protective bumper" },
          { when: { checked: "RKX" }, src: FIG + "opt-rackkit.png", caption: "19 inch 3U rackmount kit" }
        ],
        groups: [
          {
            id: "freq", label: "Frequency range", type: "radio",
            options: [
              { code: "6", label: "6 GHz", note: "Includes 9 kHz extension and high power", pn: "-6",
                desc: "100 kHz to 6 GHz microwave signal generator (9 kHz extension and high output power included)",
                info: "The 845-6 covers up to 6 GHz and already includes the 9 kHz low-frequency extension and the high output power option." },
              { code: "12", label: "12 GHz", pn: "-12", desc: "12 GHz microwave signal generator",
                info: "Coverage to 12 GHz for general microwave test." },
              { code: "20", label: "20 GHz", pn: "-20", desc: "20 GHz microwave signal generator",
                info: "Coverage to 20 GHz. The most popular 845 version.", default: true },
              { code: "26", label: "26.5 GHz", pn: "-26", desc: "26.5 GHz microwave signal generator",
                info: "Coverage to 26.5 GHz for K-band and satellite work." }
            ]
          },
          {
            id: "housing", label: "Package", type: "radio",
            options: [
              { code: "DESK", label: "Desktop (standard)", pn: "", desc: "Desktop housing",
                info: "The standard desktop housing with front-panel display and controls.", default: true },
              { code: "RACK", label: "-1URM rackmount", note: "19 inch 1U rack module", pn: "-1URM",
                desc: "19 inch 1U rackmount module", badge: "1U rackmount",
                info: "Packages the generator as a 19 inch 1U rack module for integrated systems." },
              { code: "OEM", label: "-OEM package", note: "Board-level integration", pn: "-OEM",
                desc: "OEM package", badge: "OEM",
                info: "Board-level OEM package for embedding inside your own product or system." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "HP", codeLabel: "-HP", label: "Higher output power",
                pn: "-HP", desc: "Higher output power",
                onlyFor: { all: [ { group: { id: "freq", in: ["12", "20", "26"] } }, { group: { id: "housing", in: ["DESK", "RACK"] } } ] },
                onlyForReason: "Included on the 845-6; not offered with the OEM package",
                info: "Raises maximum output power across the band. Already included on the 845-6." },
              { code: "FS", codeLabel: "-FS", label: "Ultra-fast switching speed",
                pn: "-FS", desc: "Ultra-fast switching speed", badge: "Fast switching",
                info: "Dramatically faster frequency switching for automated test and agile applications." },
              { code: "PE3", codeLabel: "-PE3", label: "Mechanical step attenuator",
                note: "6 GHz version reaches -120 dBm; 12 and 20 GHz versions reach -90 dBm",
                pn: "-PE3",
                desc: function (s) { return "Mechanical step attenuator (" + (s.radios.freq === "6" ? "-120 dBm" : "-90 dBm") + ")"; },
                onlyFor: { all: [ { group: { id: "freq", in: ["6", "12", "20"] } }, { group: { id: "housing", in: ["DESK", "RACK"] } } ] },
                onlyForReason: "26.5 GHz units use -PE or -PE2; not offered with the OEM package",
                excludes: ["PE", "PE2"],
                info: "Extends the calibrated output range downward with a mechanical step attenuator: to -120 dBm on the 6 GHz version, -90 dBm on 12 and 20 GHz versions." },
              { code: "PE", codeLabel: "-PE", label: "Mechanical step attenuator to -90 dBm (26.5 GHz)",
                pn: "-PE", desc: "Mechanical step attenuator to -90 dBm",
                onlyFor: { all: [ { group: { id: "freq", in: ["26"] } }, { group: { id: "housing", in: ["DESK", "RACK"] } } ] },
                onlyForReason: "Offered on the 26.5 GHz version",
                excludes: ["PE3", "PE2", "GPIB"],
                info: "Mechanical step attenuator extending output to -90 dBm on the 26.5 GHz version. Cannot be combined with GPIB in the desktop housing." },
              { code: "PE2", codeLabel: "-PE2", label: "Mechanical step attenuator to -120 dBm (26.5 GHz)",
                pn: "-PE2", desc: "Mechanical step attenuator to -120 dBm",
                onlyFor: { all: [ { group: { id: "freq", in: ["26"] } }, { group: { id: "housing", in: ["DESK", "RACK"] } } ] },
                onlyForReason: "Offered on the 26.5 GHz version",
                excludes: ["PE3", "PE", "GPIB"],
                info: "Mechanical step attenuator extending output to -120 dBm on the 26.5 GHz version. Cannot be combined with GPIB in the desktop housing." },
              { code: "FILT", codeLabel: "-FILT", label: "Improved harmonic filtering",
                pn: "-FILT",
                desc: function (s) { return "Improved harmonic filtering (" + (s.radios.freq === "6" ? "FILT-06" : "FILT-26") + ")"; },
                info: "Adds tracking harmonic filters for cleaner spectral purity. Ordered as FILT-06 on the 6 GHz version, FILT-26 on 12, 20 and 26.5 GHz versions." },
              { code: "N", codeLabel: "-N", label: "N-type connector instead of standard SMA",
                pn: "-N", desc: "N-type output connector",
                onlyFor: { group: { id: "housing", in: ["DESK", "RACK"] } },
                onlyForReason: "Not offered with the OEM package",
                info: "Replaces the standard SMA output connector with an N-type connector." },
              { code: "REAR", codeLabel: "-REAR", label: "Move RF output to rear panel",
                pn: "-REAR", desc: "RF output moved to rear panel", badge: "Rear output",
                onlyFor: { group: { id: "housing", in: ["RACK"] } },
                onlyForReason: "Offered only with the -1URM rackmount module",
                info: "Relocates the RF output to the rear panel for rack cabling. Ordered together with the -1URM rackmount module." },
              { code: "GPIB", codeLabel: "-GPIB", label: "GPIB interface",
                pn: "-GPIB", desc: "GPIB interface", badge: "GPIB",
                info: "Adds GPIB (IEEE-488) control. In the desktop housing, GPIB cannot be combined with the -PE or -PE2 attenuator." }
            ]
          },
          {
            id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check",
            options: [
              { code: "RKX", codeLabel: "Option RM", label: "19 inch 3U rackmount kit for desktop units", pn: "", acc: "RM",
                desc: "19 inch 3U rackmount kit",
                onlyFor: { group: { id: "housing", in: ["DESK"] } },
                onlyForReason: "For desktop units only",
                excludes: ["BUMP"],
                info: "Mounts the desktop unit in a standard 19 inch rack, 3U high." },
              { code: "BUMP", codeLabel: "Bumper", label: "Ruggedized protective bumper", pn: "", acc: "BUMPER",
                desc: "ruggedized protective bumper",
                onlyFor: { group: { id: "housing", in: ["DESK"] } },
                onlyForReason: "For desktop units only",
                excludes: ["RKX"],
                info: "Shock-absorbing bumper set for field and portable use of the desktop housing." },
              { code: "SPSU", codeLabel: "Spare PSU", label: "Spare power supply", pn: "", acc: "SPARE-PSU",
                desc: "spare power supply",
                info: "Spare external power supply for the 835/845 family." }
            ]
          }
        ]
      },
      {
        id: "865b",
        name: "Model 865B",
        blurb: "Low-noise microwave signal generator, 12 to 40 GHz versions",
        info: "The Model 865B is an ultra-low phase noise microwave signal generator available in 12, 20, 26 and 40 GHz versions, with attenuator, filtering and phase-noise enhancement options.",
        image: FIG + "865b-front.png",
        pnBase: "865B",
        similar: ["870a", "871a"],
        imageRules: [
          { when: { group: { id: "housing", in: ["RACK"] } }, src: FIG + "opt-rackmount-1u.png", caption: "19 inch 1U rackmount module" },
          { when: { checked: "BUMP" }, src: FIG + "opt-bumper.png", caption: "Ruggedized protective bumper" }
        ],
        groups: [
          {
            id: "freq", label: "Frequency range", type: "radio",
            options: [
              { code: "12", label: "12 GHz", pn: "-12", desc: "12 GHz low-noise microwave signal generator",
                info: "Coverage to 12 GHz with ultra-low phase noise." },
              { code: "20", label: "20 GHz", pn: "-20", desc: "20 GHz low-noise microwave signal generator",
                info: "Coverage to 20 GHz with ultra-low phase noise. The most popular version.", default: true },
              { code: "26", label: "26 GHz", pn: "-26", desc: "26 GHz low-noise microwave signal generator",
                info: "Coverage to 26 GHz with ultra-low phase noise." },
              { code: "40", label: "40 GHz", pn: "-40", desc: "40 GHz low-noise microwave signal generator",
                info: "Coverage to 40 GHz with ultra-low phase noise." }
            ]
          },
          {
            id: "housing", label: "Package", type: "radio",
            options: [
              { code: "DESK", label: "Desktop (standard)", pn: "", desc: "Desktop housing",
                info: "The standard desktop housing.", default: true },
              { code: "RACK", label: "-1URM rackmount", note: "19 inch 1U rack module", pn: "-1URM",
                desc: "19 inch 1U rackmount module", badge: "1U rackmount",
                info: "Packages the generator as a 19 inch 1U rack module for integrated systems." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "8K", codeLabel: "-8K", label: "Frequency range extension to 8 kHz",
                pn: "-8K", desc: "Frequency extension down to 8 kHz",
                info: "Extends the low end of the frequency range down to 8 kHz." },
              { code: "LN", codeLabel: "-LN", label: "Enhanced close-in phase noise and frequency stability",
                pn: "-LN", desc: "Enhanced close-in phase noise", badge: "Low noise",
                excludes: ["LNP"],
                info: "Improves close-in phase noise and frequency stability. Choose either -LN or -LN+." },
              { code: "LNP", codeLabel: "-LN+", label: "Enhanced phase noise plus long-term frequency stability",
                pn: "-LN+", desc: "Enhanced phase noise and long-term stability", badge: "Low noise+",
                excludes: ["LN"],
                info: "Everything in -LN plus further enhanced long-term frequency stability. Cannot be combined with -LN." },
              { code: "FS", codeLabel: "-FS", label: "Ultra-fast switching speed",
                pn: "-FS", desc: "Ultra-fast switching speed", badge: "Fast switching",
                info: "Dramatically faster frequency switching for automated and agile applications." },
              { code: "MOD", codeLabel: "-MOD", label: "Analog modulation",
                pn: "-MOD", desc: "Analog modulation",
                info: "Adds analog amplitude, frequency and phase modulation capability." },
              { code: "FILT", codeLabel: "-FILT", label: "Harmonic filtering",
                pn: "-FILT", desc: "Harmonic filtering",
                excludes: ["PE4"],
                info: "Adds harmonic filtering for improved spectral purity. Not available in combination with the -PE4 electrical attenuator." },
              { code: "VREF", codeLabel: "-VREF", label: "Variable external reference",
                pn: "-VREF", desc: "Variable external reference",
                info: "Accepts a wide range of external reference frequencies instead of the standard 10 MHz." },
              { code: "PE4", codeLabel: "-PE4", label: "Electrical step attenuator",
                pn: "-PE4", desc: "Electrical step attenuator",
                excludes: ["PE", "PE2", "FILT"],
                info: "Fast electrical step attenuator for level control without mechanical wear. Not available with -FILT." },
              { code: "PE", codeLabel: "-PE", label: "Mechanical step attenuator to -90 dBm",
                pn: "-PE", desc: "Mechanical step attenuator to -90 dBm",
                excludes: ["PE4", "PE2"],
                info: "Mechanical step attenuator extending calibrated output down to -90 dBm." },
              { code: "PE2", codeLabel: "-PE2", label: "Mechanical step attenuator to -120 dBm",
                pn: "-PE2", desc: "Mechanical step attenuator to -120 dBm",
                excludes: ["PE4", "PE"],
                info: "Mechanical step attenuator extending calibrated output down to -120 dBm." },
              { code: "GPIB", codeLabel: "-GPIB", label: "GPIB interface",
                pn: "-GPIB", desc: "GPIB interface", badge: "GPIB",
                info: "Adds GPIB (IEEE-488) control." },
              { code: "REAR", codeLabel: "-REAR", label: "Move RF output to rear panel",
                pn: "-REAR", desc: "RF output moved to rear panel", badge: "Rear output",
                onlyFor: { group: { id: "housing", in: ["RACK"] } },
                onlyForReason: "Offered with the -1URM rackmount module",
                info: "Relocates the RF output to the rear panel for rack cabling. Ordered together with the 1U rackmount module." }
            ]
          },
          {
            id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check",
            options: [
              { code: "BUMP", codeLabel: "Bumper", label: "Ruggedized protective bumper", pn: "", acc: "BUMPER",
                desc: "ruggedized protective bumper",
                onlyFor: { group: { id: "housing", in: ["DESK"] } },
                onlyForReason: "For desktop units only",
                info: "Shock-absorbing bumper set for field and portable use of the desktop housing." }
            ]
          }
        ]
      },
      {
        id: "870a",
        name: "Model 870A",
        blurb: "High-purity signal generator, 12.75 to 54 GHz, 1 to 4 channels",
        info: "The Model 870A is a high-performance, high-purity signal generator available to 12.75, 20, 40 or 54 GHz, as a desktop unit, a 1U rack module or a multi-channel 2U rack system with 2 to 4 phase-coherent channels.",
        image: FIG + "870a-front.jpg",
        pnBase: "870A",
        similar: ["871a", "875"],
        imageRules: [
          { when: { group: { id: "config", in: ["RM1"] } }, src: FIG + "opt-rackmount-1u.png", caption: "Single-high 19 inch rack module (no display)" },
          { when: { group: { id: "config", in: ["CH2", "CH3", "CH4"] } }, src: FIG + "875-rack-4ch.png", caption: "Double-high 19 inch rack module, no display (representative)" }
        ],
        groups: [
          {
            id: "freq", label: "Maximum frequency", type: "radio",
            options: [
              { code: "12", label: "12.75 GHz", pn: "-12", desc: "High-purity signal generator to 12.75 GHz",
                info: "Coverage to 12.75 GHz." },
              { code: "20", label: "20 GHz", pn: "-20", desc: "High-purity signal generator to 20 GHz",
                info: "Coverage to 20 GHz. The most popular version.", default: true },
              { code: "40", label: "40 GHz", pn: "-40", desc: "High-purity signal generator to 40 GHz",
                info: "Coverage to 40 GHz." },
              { code: "50", label: "54 GHz", pn: "-50", desc: "High-performance signal generator to 54 GHz",
                info: "The 870A-50 covers up to 54 GHz. Its option set differs slightly: the -PE2-50 attenuator reaches -110 dBm." }
            ]
          },
          {
            id: "config", label: "Configuration", type: "radio",
            options: [
              { code: "SINGLE", label: "Desktop, 1 channel", pn: "", desc: "Single-channel desktop unit",
                info: "Standard single-channel desktop instrument.", default: true },
              { code: "RM1", label: "-1URM rack module", note: "1 channel, single-high 19 inch rack mount (1U)", pn: "-1URM",
                desc: "Single channel in a single-high 19 inch rack mount (1U)", badge: "1U rackmount",
                onlyFor: { group: { id: "freq", in: ["12", "20", "40"] } },
                onlyForReason: "1U module offered on 12.75, 20 and 40 GHz versions",
                info: "Packages a single channel as a single-high (1U) 19 inch rack-mount module." },
              { code: "CH2", label: "2 channels", note: "Double-high 19 inch rack mount (2U)", pn: "-2",
                desc: "2 channels in a double-high 19 inch rack mount (2U)", badge: "2 channels",
                info: "Two channels in a double-high (2U) 19 inch rack-mount module. Per-channel options apply to each channel." },
              { code: "CH3", label: "3 channels", note: "Double-high 19 inch rack mount (2U)", pn: "-3",
                desc: "3 channels in a double-high 19 inch rack mount (2U)", badge: "3 channels",
                info: "Three channels in a double-high (2U) 19 inch rack-mount module. Per-channel options apply to each channel." },
              { code: "CH4", label: "4 channels", note: "Double-high 19 inch rack mount (2U)", pn: "-4",
                desc: "4 channels in a double-high 19 inch rack mount (2U)", badge: "4 channels",
                info: "Four channels in a double-high (2U) 19 inch rack-mount module. Per-channel options apply to each channel." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "LN", codeLabel: "-LN", label: "Enhanced close-in phase noise and frequency stability",
                pn: "-LN", desc: "Enhanced close-in phase noise", badge: "Low noise",
                excludes: ["LNP"],
                info: "Improves close-in phase noise and frequency stability. Priced per unit. Choose either -LN or -LN+." },
              { code: "LNP", codeLabel: "-LN+", label: "Enhanced phase noise plus long-term frequency stability",
                pn: "-LN+", desc: "Enhanced phase noise and long-term stability", badge: "Low noise+",
                excludes: ["LN"],
                info: "Everything in -LN plus further enhanced long-term frequency stability. Cannot be combined with -LN." },
              { code: "FS", codeLabel: "-FS", label: "Fast switching speed (per channel)",
                pn: "-FS", desc: "Fast switching speed",
                info: "Faster frequency switching, priced per channel on multi-channel systems." },
              { code: "MOD", codeLabel: "-MOD", label: "Analog modulation (per channel)",
                pn: "-MOD", desc: "Analog modulation",
                info: "Adds analog modulation capability, priced per channel on multi-channel systems." },
              { code: "PE", codeLabel: "-PE", label: "Mechanical step attenuator to -90 dBm",
                pn: "-PE", desc: "Mechanical step attenuator to -90 dBm",
                onlyFor: { group: { id: "freq", in: ["12", "20", "40"] } },
                onlyForReason: "The 54 GHz version uses -PE2-50",
                excludes: ["PE2"],
                info: "Mechanical step attenuator to -90 dBm, with 12/20 GHz and 40 GHz versions." },
              { code: "PE2", codeLabel: "-PE2", label: "Mechanical step attenuator to -120 dBm",
                pn: function (s) { return s.radios.freq === "50" ? "-PE2-50" : "-PE2"; },
                desc: function (s) { return s.radios.freq === "50" ? "Mechanical step attenuator to -110 dBm (54 GHz version)" : "Mechanical step attenuator to -120 dBm"; },
                excludes: ["PE"],
                info: "Mechanical step attenuator extending output to -120 dBm (-110 dBm on the 54 GHz version, ordered as -PE2-50)." },
              { code: "VREF", codeLabel: "-VREF", label: "Flexible external reference, 1 to 250 MHz",
                pn: "-VREF", desc: "Flexible external reference 1 to 250 MHz",
                info: "Accepts external reference frequencies anywhere from 1 to 250 MHz." },
              { code: "FLASH", codeLabel: "-FLASH", label: "MicroSD card slot",
                pn: "-FLASH", desc: "MicroSD card slot for removable memory",
                info: "Adds a MicroSD card slot for removable storage." },
              { code: "GPIB", codeLabel: "-GPIB", label: "GPIB interface",
                pn: "-GPIB", desc: "GPIB interface", badge: "GPIB",
                onlyFor: { group: { id: "freq", in: ["12", "20", "40"] } },
                onlyForReason: "Not listed for the 54 GHz version",
                info: "Adds GPIB (IEEE-488) control." }
            ]
          }
        ]
      },
      {
        id: "871a",
        name: "Model 871A",
        blurb: "Ultra-performance signal generator, 12.75 to 51 GHz, 1 to 4 channels",
        info: "The Model 871A is an ultra-performance signal generator available to 12.75, 20, 40 or 51 GHz, as a desktop unit or a double-high 19 inch rack module with 1 to 4 channels, with low-noise, modulation and attenuator options.",
        image: FIG + "870a-front.jpg",
        imageCaption: "Representative unit shown",
        pnBase: "871A",
        imageRules: [
          { when: { group: { id: "config", in: ["CH1", "CH2", "CH3", "CH4"] } }, src: FIG + "875-rack-4ch.png", caption: "Double-high 19 inch rack module, no display (representative)" }
        ],
        groups: [
          {
            id: "freq", label: "Maximum frequency", type: "radio",
            options: [
              { code: "12", label: "12.75 GHz", pn: "-12", desc: "Ultra-performance signal generator to 12.75 GHz",
                info: "Coverage to 12.75 GHz." },
              { code: "20", label: "20 GHz", pn: "-20", desc: "Ultra-performance signal generator to 20 GHz",
                info: "Coverage to 20 GHz.", default: true },
              { code: "40", label: "40 GHz", pn: "-40", desc: "Ultra-performance signal generator to 40 GHz",
                info: "Coverage to 40 GHz." },
              { code: "50", label: "51 GHz", pn: "-50", desc: "Ultra-performance signal generator to 51 GHz",
                info: "Coverage to 51 GHz. Uses the -PE2-50 attenuator (-110 dBm)." }
            ]
          },
          {
            id: "config", label: "Configuration", type: "radio",
            options: [
              { code: "DESK", label: "Desktop, 1 channel", pn: "", desc: "Single-channel desktop unit",
                info: "Standard single-channel desktop instrument.", default: true },
              { code: "CH1", label: "1 channel, rack", note: "Double-high 19 inch rack mount (2U)", pn: "-1",
                desc: "1 channel in a double-high 19 inch rack mount (2U)", badge: "Rack module",
                info: "One channel in a double-high (2U) 19 inch rack-mount module." },
              { code: "CH2", label: "2 channels", note: "Double-high 19 inch rack mount (2U)", pn: "-2",
                desc: "2 channels in a double-high 19 inch rack mount (2U)", badge: "2 channels",
                info: "Two channels in a double-high (2U) 19 inch rack-mount module. Per-channel options apply to each channel." },
              { code: "CH3", label: "3 channels", note: "Double-high 19 inch rack mount (2U)", pn: "-3",
                desc: "3 channels in a double-high 19 inch rack mount (2U)", badge: "3 channels",
                info: "Three channels in a double-high (2U) 19 inch rack-mount module. Per-channel options apply to each channel." },
              { code: "CH4", label: "4 channels", note: "Double-high 19 inch rack mount (2U)", pn: "-4",
                desc: "4 channels in a double-high 19 inch rack mount (2U)", badge: "4 channels",
                info: "Four channels in a double-high (2U) 19 inch rack-mount module. Per-channel options apply to each channel." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "1K", codeLabel: "-1K", label: "Frequency range extension to 1 kHz (per channel)",
                pn: "-1K", desc: "Frequency extension down to 1 kHz",
                info: "Extends the low end of the frequency range down to 1 kHz, priced per channel." },
              { code: "LN", codeLabel: "-LN", label: "Enhanced close-in phase noise and frequency stability",
                pn: "-LN", desc: "Enhanced close-in phase noise", badge: "Low noise",
                excludes: ["LNP"],
                info: "Improves close-in phase noise and frequency stability. Choose either -LN or -LN+." },
              { code: "LNP", codeLabel: "-LN+", label: "Enhanced phase noise plus long-term frequency stability",
                pn: "-LN+", desc: "Enhanced phase noise and long-term stability", badge: "Low noise+",
                excludes: ["LN"],
                info: "Everything in -LN plus further enhanced long-term frequency stability. Cannot be combined with -LN." },
              { code: "FS", codeLabel: "-FS", label: "Fast switching speed (per channel)",
                pn: "-FS", desc: "Fast switching speed",
                info: "Faster frequency switching, priced per channel." },
              { code: "MOD", codeLabel: "-MOD", label: "AM / FM / PM modulation (per channel)",
                pn: "-MOD", desc: "AM / FM / PM modulation",
                info: "Adds amplitude, frequency and phase modulation, priced per channel." },
              { code: "PULSE", codeLabel: "-PULSE", label: "Pulse modulation (per channel)",
                pn: "-PULSE", desc: "Pulse modulation",
                info: "Adds pulse modulation capability, priced per channel." },
              { code: "PE2", codeLabel: "-PE2", label: "Mechanical step attenuator (per channel)",
                pn: function (s) { return s.radios.freq === "50" ? "-PE2-50" : "-PE2-40"; },
                desc: function (s) { return s.radios.freq === "50" ? "Mechanical step attenuator to -110 dBm (51 GHz version)" : "Mechanical step attenuator to -120 dBm"; },
                info: "Mechanical step attenuator, priced per channel: to -120 dBm (ordered as -PE2-40) or -110 dBm on the 51 GHz version (-PE2-50)." },
              { code: "VREF", codeLabel: "-VREF", label: "Flexible external reference, 1 to 250 MHz",
                pn: "-VREF", desc: "Flexible external reference 1 to 250 MHz",
                info: "Accepts external reference frequencies anywhere from 1 to 250 MHz." },
              { code: "FLASH", codeLabel: "-FLASH", label: "MicroSD card slot",
                pn: "-FLASH", desc: "MicroSD card slot for removable memory",
                info: "Adds a MicroSD card slot for removable storage." },
              { code: "GPIB", codeLabel: "-GPIB", label: "GPIB interface",
                pn: "-GPIB", desc: "GPIB interface", badge: "GPIB",
                info: "Adds GPIB (IEEE-488) control." }
            ]
          }
        ]
      },
      {
        id: "875",
        name: "Model 875",
        blurb: "Agile vector signal generator, 4 to 40 GHz, up to 4 channels",
        info: "The Model 875 is an agile vector signal generator available in 4, 6, 12, 20 and 40 GHz versions, as a desktop unit or a 19 inch 2U rack module with 1 to 4 channels, with a deep set of modulation, streaming and switching options.",
        image: FIG + "875-desktop.png",
        pnBase: "875",
        similar: [],
        imageRules: [
          { when: { group: { id: "config", in: ["1R", "2R", "3R", "4R"] } }, src: FIG + "875-rack-4ch.png", caption: "19 inch 2U rack module (multi-channel rear panel shown)" }
        ],
        groups: [
          {
            id: "freq", label: "Maximum frequency", type: "radio",
            options: [
              { code: "4", label: "4 GHz", pn: "-4", desc: "4 GHz vector signal generator",
                info: "Coverage to 4 GHz.", default: true },
              { code: "6", label: "6 GHz", pn: "-6", desc: "6 GHz vector signal generator",
                info: "Coverage to 6 GHz." },
              { code: "12", label: "12 GHz", pn: "-12", desc: "12 GHz vector signal generator",
                info: "Coverage to 12 GHz." },
              { code: "20", label: "20 GHz", pn: "-20", desc: "20 GHz vector signal generator",
                info: "Coverage to 20 GHz." },
              { code: "40", label: "40 GHz", pn: "-40", desc: "40 GHz vector signal generator",
                info: "Coverage to 40 GHz." }
            ]
          },
          {
            id: "config", label: "Configuration", type: "radio",
            options: [
              { code: "DESK", label: "Desktop, 1 channel", pn: "", desc: "Single-channel desktop unit",
                info: "Standard single-channel desktop instrument.", default: true },
              { code: "1R", label: "1 channel, rack", note: "19 inch 2URM module", pn: "-1R",
                desc: "1 channel in a 19 inch 2U rack module", badge: "Rack module",
                info: "One channel in a 19 inch 2U rack module." },
              { code: "2R", label: "2 channels, rack", note: "19 inch 2URM module", pn: "-2R",
                desc: "2 channels in a 19 inch 2U rack module", badge: "2-ch rack",
                info: "Two channels in a 19 inch 2U rack module. Per-channel options apply to each channel." },
              { code: "3R", label: "3 channels, rack", note: "19 inch 2URM module", pn: "-3R",
                desc: "3 channels in a 19 inch 2U rack module", badge: "3-ch rack",
                info: "Three channels in a 19 inch 2U rack module. Per-channel options apply to each channel." },
              { code: "4R", label: "4 channels, rack", note: "19 inch 2URM module", pn: "-4R",
                desc: "4 channels in a 19 inch 2U rack module", badge: "4-ch rack",
                info: "Four channels in a 19 inch 2U rack module. Per-channel options apply to each channel." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "100K", codeLabel: "-100K", label: "Frequency extension to 100 kHz",
                pn: "-100K", desc: "Frequency extension down to 100 kHz",
                info: "Extends the low end of the frequency range down to 100 kHz." },
              { code: "LN", codeLabel: "-LN", label: "Enhanced close-in phase noise and frequency stability",
                pn: "-LN", desc: "Enhanced close-in phase noise", badge: "Low noise",
                excludes: ["LNP"],
                info: "Improves close-in phase noise and frequency stability. Priced per unit. Choose either -LN or -LN+." },
              { code: "LNP", codeLabel: "-LN+", label: "Enhanced phase noise plus long-term frequency stability",
                pn: "-LN+", desc: "Enhanced phase noise and long-term stability", badge: "Low noise+",
                excludes: ["LN"],
                info: "Everything in -LN plus further enhanced long-term frequency stability. Cannot be combined with -LN." },
              { code: "UFS", codeLabel: "-UFS", label: "Ultra-fast switching speed (per channel)",
                pn: "-UFS", desc: "Ultra-fast switching speed", badge: "Ultra-fast",
                info: "Ultra-fast frequency and level switching, priced per channel." },
              { code: "PHS", codeLabel: "-PHS", label: "Phase-coherent switching (per output)",
                pn: "-PHS", desc: "Phase-coherent switching",
                info: "Maintains phase coherence when switching frequencies, priced per output." },
              { code: "SYNC", codeLabel: "-SYNC", label: "Phase-coherent switching and waveform sync across modules",
                pn: "-SYNC", desc: "Multi-module phase-coherent switching and waveform synchronization",
                needs: ["PHS"],
                info: "Coordinates phase-coherent switching and waveform synchronization across multiple modules. Requires option -PHS." },
              { code: "FCP", codeLabel: "-FCP", label: "Fast control port, external digital I/Q streaming (per channel)",
                pn: "-FCP", desc: "Fast control port with external digital I/Q streaming",
                excludes: ["AIQ", "GPIB"],
                info: "High-speed control port for external digital I/Q data streaming. The FCP/AIQ and FCP/GPIB combinations are not supported." },
              { code: "PDW", codeLabel: "-PDW", label: "Pulse descriptor word lists via FCP (per channel)",
                pn: "-PDW", desc: "Pulse descriptor word upload, playback and streaming",
                needs: ["FCP"],
                info: "Uploads, plays back and streams pulse descriptor word lists through the fast control port. Requires option -FCP." },
              { code: "MOD", codeLabel: "-MOD", label: "Internal analog modulation (per channel)",
                pn: "-MOD", desc: "Internal analog modulation",
                info: "Adds internal analog modulation, priced per channel." },
              { code: "IVM", codeLabel: "-IVM", label: "Internal digital modulation schemes (per channel)",
                pn: "-IVM", desc: "Internal digital vector modulation",
                info: "Internally generated digital modulation schemes, priced per channel." },
              { code: "AWGN", codeLabel: "-AWGN", label: "Additive white Gaussian noise generation (per channel)",
                pn: "-AWGN", desc: "Additive white Gaussian noise generation",
                info: "Bandwidth-selective additive white Gaussian noise generation, priced per channel." },
              { code: "AIQ", codeLabel: "-AIQ", label: "External analog I/Q inputs (per channel)",
                pn: "-AIQ", desc: "External analog I/Q inputs",
                excludes: ["FCP"],
                info: "External analog I/Q modulation inputs, priced per channel. Not supported together with -FCP." },
              { code: "PE4", codeLabel: "-PE4", label: "Electrical step attenuator (per channel)",
                pn: "-PE4", desc: "Electrical step attenuator",
                excludes: ["PE", "PE2"],
                info: "Fast electrical step attenuator, priced per channel, with 4/6/12/20 GHz and 40 GHz versions." },
              { code: "PE", codeLabel: "-PE", label: "Mechanical step attenuator to -90 dBm (per channel)",
                pn: "-PE", desc: "Mechanical step attenuator to -90 dBm",
                excludes: ["PE4", "PE2"],
                info: "Mechanical step attenuator extending calibrated output to -90 dBm, priced per channel." },
              { code: "PE2", codeLabel: "-PE2", label: "Mechanical step attenuator to -120 dBm (per channel)",
                pn: "-PE2", desc: "Mechanical step attenuator to -120 dBm",
                excludes: ["PE4", "PE"],
                info: "Mechanical step attenuator extending calibrated output to -120 dBm, priced per channel." },
              { code: "FILT", codeLabel: "-FILT", label: "Harmonic filtering (per channel)",
                pn: "-FILT",
                desc: function (s) { return "Harmonic filtering (" + (s.radios.freq === "40" ? "FILT-40" : "FILT-20") + ")"; },
                needs: ["PE4"],
                onlyFor: { group: { id: "freq", in: ["6", "12", "20", "40"] } },
                onlyForReason: "Offered on the 6, 12, 20 and 40 GHz versions",
                info: "Harmonic filtering per channel. Requires the -PE4 electrical attenuator. Ordered as FILT-20 on 6/12/20 GHz versions and FILT-40 on the 40 GHz version." },
              { code: "AVIO", codeLabel: "-AVIO", label: "Avionics modulation: DME, VOR, ILS, marker beacon (per channel)",
                pn: "-AVIO", desc: "Avionics modulation capability",
                info: "Adds DME, VOR, ILS and marker beacon avionics test modulation, priced per channel." },
              { code: "VREF", codeLabel: "-VREF", label: "Variable external reference",
                pn: "-VREF", desc: "Variable external reference",
                info: "Accepts a wide range of external reference frequencies." },
              { code: "SD", codeLabel: "-SD", label: "MicroSD card slot for I/Q data storage",
                pn: "-SD", desc: "MicroSD card slot for non-volatile I/Q data storage",
                info: "Adds a MicroSD card slot for non-volatile storage of I/Q data." },
              { code: "PCM", codeLabel: "-PCM", label: "Phase calibratable mode firmware (per channel)",
                pn: "-PCM", desc: "Phase calibratable mode firmware",
                info: "Firmware enabling phase calibratable mode, priced per channel." },
              { code: "GPIB", codeLabel: "-GPIB", label: "GPIB interface",
                pn: "-GPIB", desc: "GPIB interface", badge: "GPIB",
                excludes: ["FCP"],
                info: "Adds GPIB (IEEE-488) control. Not supported together with -FCP." }
            ]
          }
        ]
      }
    ]
  };

  /* ---------------------------------------------------------
     FAMILY 4: Radiation Detection and Isotope Identification
     SAM 940Plus, SAM 950, RD-120, RD-150
     --------------------------------------------------------- */

  var FAMILY_RIID = {
    id: "riid",
    title: "Radiation Detection / Isotope ID Configurator",
    subtitle: "SAM 940Plus, SAM 950, RD-120 SAMPack and RD-150. Build your configuration, then request a QuickQuote.",
    models: [
      {
        id: "sam940plus",
        name: "SAM 940Plus",
        blurb: "Handheld isotope identifier, NaI, CeBr3 or LBC detectors",
        info: "The SAM 940Plus handheld radiation isotope identifier is offered with 2x2 inch NaI, CeBr3 or LBC (LaBr3-compatible) detectors, with or without Domino neutron detection, plus camera, directionality and external probe options.",
        image: FIG + "sam940plus.jpg",
        pnBase: "SAM 940Plus",
        groups: [
          {
            id: "detector", label: "Detector configuration", type: "radio",
            options: [
              { code: "G", label: "-G", note: "2x2 inch NaI, gamma only", pn: "-G",
                desc: "2x2 inch NaI detector, gamma only",
                info: "Standard 2x2 inch NaI gamma detector.", default: true },
              { code: "GN", label: "-GN", note: "2x2 inch NaI plus Domino neutron", pn: "-GN",
                desc: "2x2 inch NaI plus Domino neutron detector (1.2 cps/nv)",
                info: "Adds a Domino neutron detector (1.2 cps/nv) to the 2x2 inch NaI gamma detector." },
              { code: "HGC15", label: "-HG-C15", note: "1.5x1.5 inch CeBr3 high resolution", pn: "-HG-C15",
                desc: "1.5x1.5 inch CeBr3 high-resolution detector",
                info: "High-resolution 1.5x1.5 inch CeBr3 detector for sharper spectra and better isotope separation." },
              { code: "HGC20", label: "-HG-C20", note: "2x2 inch CeBr3 high resolution", pn: "-HG-C20",
                desc: "2x2 inch CeBr3 high-resolution detector",
                info: "High-resolution 2x2 inch CeBr3 detector combining resolution with detection efficiency." },
              { code: "HGL", label: "-HG-L", note: "2x2 inch LBC high resolution", pn: "-HG-L",
                desc: "2x2 inch LBC (LaBr3-compatible) high-resolution detector",
                info: "High-resolution 2x2 inch LBC (LaBr3-compatible crystal) detector." },
              { code: "HGNC", label: "-HGN-C", note: "2x2 inch CeBr3 plus Domino neutron", pn: "-HGN-C",
                desc: "2x2 inch CeBr3 plus Domino neutron detector (1.2 cps/nv)",
                info: "High-resolution CeBr3 detector with Domino neutron detection (1.2 cps/nv)." },
              { code: "HGNL", label: "-HGN-L", note: "2x2 inch LBC plus Domino neutron", pn: "-HGN-L",
                desc: "2x2 inch LBC plus Domino neutron detector (1.2 cps/nv)",
                info: "High-resolution LBC detector with Domino neutron detection (1.2 cps/nv)." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "OB", codeLabel: "OB", label: "Removable battery packs: 2 Li-ion plus 1 AA pack",
                pn: "-OB", desc: "removable battery packs (2 Li-ion, 1 AA)",
                info: "Removable battery set: two Li-ion packs plus an AA battery pack for extended field operation." },
              { code: "OC", codeLabel: "OC", label: "Camera with multimedia support",
                pn: "-OC", desc: "camera with multimedia support",
                info: "Built-in camera for photographing sources and scenes alongside spectra." },
              { code: "OD", codeLabel: "OD", label: "Gamma directionality gyro sensor",
                pn: "-OD", desc: "gamma directionality gyro sensor", badge: "Directionality",
                info: "Gyro-based gamma directionality sensing to help localize sources." },
              { code: "OM", codeLabel: "OM", label: "Mirroring to PDA (PDA with PeakAbout IV software)",
                pn: "-OM", desc: "mirroring to PDA",
                info: "Mirrors the instrument display to a PDA running the companion software." },
              { code: "OPGN20", codeLabel: "OP-G-N20", label: "External 2x2 inch NaI probe",
                pn: "-OP-G-N20", desc: "external 2x2 inch NaI probe",
                info: "External 2x2 inch NaI probe for reach-in and survey work." },
              { code: "OPGN30", codeLabel: "OP-G-N30", label: "External 3x3 inch NaI probe",
                pn: "-OP-G-N30", desc: "external 3x3 inch NaI probe",
                info: "External 3x3 inch NaI probe with higher detection efficiency." },
              { code: "OPNH", codeLabel: "OP-N-Hxx", label: "He-3 neutron sensors (call for configuration)",
                pn: "-OP-N-Hxx", desc: "He-3 neutron sensors (configuration quoted)",
                info: "External He-3 neutron sensor options. Configurations and pricing are quoted individually." },
              { code: "OPND", codeLabel: "OP-N-Dxx", label: "Domino neutron sensors (call for configuration)",
                pn: "-OP-N-Dxx", desc: "Domino neutron sensors (configuration quoted)",
                info: "External Domino neutron sensor options. Configurations and pricing are quoted individually." },
              { code: "OPPC", codeLabel: "OP-PC", label: "Pancake probe (call for configuration)",
                pn: "-OP-PC", desc: "pancake probe (configuration quoted)",
                info: "Pancake GM probe for surface contamination surveys. Quoted individually." }
            ]
          }
        ]
      },
      {
        id: "sam950",
        name: "SAM 950",
        blurb: "SAM III handheld isotope identifier, NaI, CeBr3 or LBC",
        info: "The SAM 950 (SAM III) handheld radiation isotope identifier is offered with 2x2 or 3x3 inch NaI detectors, high-resolution CeBr3 or LBC detectors, each with or without neutron detection.",
        image: FIG + "sam950.jpeg",
        pnBase: "950",
        groups: [
          {
            id: "detector", label: "Detector configuration", type: "radio",
            options: [
              { code: "GN20", label: "-G-N20", note: "2x2 inch NaI", pn: "-G-N20",
                desc: "2x2 inch NaI detector",
                info: "Standard 2x2 inch NaI gamma detector.", default: true },
              { code: "GN30", label: "-G-N30", note: "3x3 inch NaI", pn: "-G-N30",
                desc: "3x3 inch NaI detector",
                info: "Larger 3x3 inch NaI detector for higher efficiency." },
              { code: "GNN20", label: "-GN-N20", note: "2x2 inch NaI plus neutron", pn: "-GN-N20",
                desc: "2x2 inch NaI plus neutron detector",
                info: "2x2 inch NaI with added neutron detection." },
              { code: "GNN30", label: "-GN-N30", note: "3x3 inch NaI plus neutron", pn: "-GN-N30",
                desc: "3x3 inch NaI plus neutron detector",
                info: "3x3 inch NaI with added neutron detection." },
              { code: "HGC20", label: "-HG-C20", note: "2x2 inch CeBr3", pn: "-HG-C20",
                desc: "2x2 inch CeBr3 high-resolution detector",
                info: "High-resolution 2x2 inch CeBr3 detector." },
              { code: "HGL20", label: "-HG-L20", note: "2x2 inch LBC", pn: "-HG-L20",
                desc: "2x2 inch LBC high-resolution detector",
                info: "High-resolution 2x2 inch LBC (LaBr3-compatible) detector." },
              { code: "HGNC15", label: "-HGN-C15", note: "1.5x1.5 inch CeBr3 plus neutron", pn: "-HGN-C15",
                desc: "1.5x1.5 inch CeBr3 plus neutron detector",
                info: "Compact high-resolution CeBr3 detector with neutron detection." },
              { code: "HGNC20", label: "-HGN-C20", note: "2x2 inch CeBr3 plus neutron", pn: "-HGN-C20",
                desc: "2x2 inch CeBr3 plus neutron detector",
                info: "High-resolution 2x2 inch CeBr3 detector with neutron detection." },
              { code: "HGNL15", label: "-HGN-L15", note: "1.5x1.5 inch LBC plus neutron", pn: "-HGN-L15",
                desc: "1.5x1.5 inch LBC plus neutron detector",
                info: "Compact high-resolution LBC detector with neutron detection." }
            ]
          },
          {
            id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check",
            options: [
              { code: "ADA", codeLabel: "P/N ADA950", label: "AC adapter set", pn: "", acc: "ADA950",
                desc: "AC adapter set",
                info: "Spare or additional AC adapter set for the SAM 950." }
            ]
          }
        ]
      },
      {
        id: "rd120",
        name: "RD-120 SAMPack",
        blurb: "Backpack isotope identifier, gamma and neutron versions",
        info: "The RD-120 SAMPack backpack isotope identifier is offered in NaI gamma, gamma-plus-neutron, high-resolution CeBr3 and Lanthanum versions, up to a dual-detector directional configuration.",
        image: FIG + "rd120-pack.png",
        pnBase: "RD-120",
        groups: [
          {
            id: "config", label: "Configuration", type: "radio",
            options: [
              { code: "G", label: "-G", note: "Gamma only", pn: "-G",
                desc: "backpack isotope identifier, gamma only",
                info: "Gamma-only SAMPack.", default: true },
              { code: "GN", label: "-GN", note: "Gamma plus He-3 neutron (5 cps/nv)", pn: "-GN",
                desc: "backpack isotope identifier with gamma and neutron detection (5 cps/nv He-3)",
                info: "Adds a 5 cps/nv He-3 neutron detector to the gamma detector." },
              { code: "HGL20", label: "-HG-L20", note: "2x2 inch Lanthanum", pn: "-HG-L20",
                desc: "backpack isotope identifier, 2x2 inch Lanthanum detector",
                info: "High-resolution 2x2 inch Lanthanum detector." },
              { code: "HGNL20", label: "-HGN-L20", note: "2x2 inch Lanthanum plus neutron", pn: "-HGN-L20",
                desc: "backpack isotope identifier, 2x2 inch Lanthanum plus neutron",
                info: "High-resolution Lanthanum detector with neutron detection." },
              { code: "HGC20", label: "-HG-C20", note: "2x2 inch Cerium", pn: "-HG-C20",
                desc: "backpack isotope identifier, 2x2 inch Cerium detector",
                info: "High-resolution 2x2 inch Cerium (CeBr3) detector." },
              { code: "HGNC20", label: "-HGN-C20", note: "2x2 inch Cerium plus neutron", pn: "-HGN-C20",
                desc: "backpack isotope identifier, 2x2 inch Cerium plus neutron",
                info: "High-resolution Cerium detector with neutron detection." },
              { code: "DGN", label: "-D-GN", note: "Dual 2x2 detectors, directionality, 15 cps/nv neutron", pn: "-D-GN",
                desc: "backpack isotope identifier, dual 2x2 detectors with directionality and 15 cps/nv neutron", badge: "Directional",
                info: "Directional configuration with two 2x2 detectors, two Domino neutron sensors and 15 cps/nv neutron sensitivity." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "HE35", codeLabel: "He-3 Option", label: "5 cps/nv He-3 addition (for G / HG models)",
                pn: "", acc: "HE-3-5CPS", desc: "5 cps/nv He-3 neutron addition",
                onlyFor: { group: { id: "config", in: ["G", "HGL20", "HGC20"] } },
                onlyForReason: "He-3 additions apply to the gamma-only G and HG models",
                excludes: ["HE317"],
                info: "Adds a 5 cps/nv He-3 neutron detector to a gamma-only configuration." },
              { code: "HE317", codeLabel: "He-3 Option", label: "17 cps/nv He-3 addition (for G / HG models)",
                pn: "", acc: "HE-3-17CPS", desc: "17 cps/nv He-3 neutron addition",
                onlyFor: { group: { id: "config", in: ["G", "HGL20", "HGC20"] } },
                onlyForReason: "He-3 additions apply to the gamma-only G and HG models",
                excludes: ["HE35"],
                info: "Adds a higher-sensitivity 17 cps/nv He-3 neutron detector to a gamma-only configuration." }
            ]
          },
          {
            id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check",
            options: [
              { code: "AC", codeLabel: "P/N 7100", label: "Spare AC adapter / charger", pn: "", acc: "7100",
                desc: "spare AC adapter / charger",
                info: "Spare AC adapter and charger for the SAM 945 / RD-120." },
              { code: "VEH", codeLabel: "P/N 7101", label: "Spare vehicle adapter charger", pn: "", acc: "7101",
                desc: "spare vehicle adapter charger",
                info: "Vehicle power adapter and charger for the SAM 945 / RD-120." }
            ]
          }
        ]
      },
      {
        id: "rd150",
        name: "RD-150",
        blurb: "Vehicle-ready radiation detection system, 2x4x16 or 4x4x16 NaI",
        info: "The RD-150 vehicle-ready radiation detection system is offered with one 2x4x16 inch or one 4x4x16 inch NaI detector, with neutron detector additions quoted per configuration.",
        image: FIG + "rd150-case.png",
        pnBase: "RD-150",
        groups: [
          {
            id: "config", label: "Detector configuration", type: "radio",
            options: [
              { code: "2G1", label: "-2G1", note: "2x4x16 inch NaI, 1 each", pn: "-2G1",
                desc: "vehicle-ready radiation detection system, 2x4x16 inch NaI",
                info: "One 2x4x16 inch NaI detector.", default: true },
              { code: "4G1", label: "-4G1", note: "4x4x16 inch NaI, 1 each", pn: "-4G1",
                desc: "vehicle-ready radiation detection system, 4x4x16 inch NaI",
                info: "One larger 4x4x16 inch NaI detector for greater sensitivity." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "NH", codeLabel: "-NHxx", label: "He-3 neutron detector addition (quoted per configuration)",
                pn: "-NHxx", desc: "He-3 neutron detector addition (specify needs in the notes field)",
                info: "He-3 or equivalent neutron detector additions. Configurations and pricing are quoted individually; describe your requirement in the notes field." },
              { code: "HD", codeLabel: "-HDxx", label: "Neutron detector addition (quoted per configuration)",
                pn: "-HDxx", desc: "neutron detector addition (specify needs in the notes field)",
                info: "Additional neutron detector options quoted per configuration; describe your requirement in the notes field." }
            ]
          },
          {
            id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check",
            options: [
              { code: "PC", codeLabel: "P/N 7140", label: "Power cable for RD-150", pn: "", acc: "7140",
                desc: "power cable",
                info: "IP68-rated power cable for the RD-150." }
            ]
          }
        ]
      }
    ]
  };

  /* ---------------------------------------------------------
     FAMILY 5: EVO High Voltage DC Power Supplies
     --------------------------------------------------------- */

  var FAMILY_EVO = {
    id: "evo",
    title: "PVP High Voltage DC Power Supply Configurator",
    subtitle: "PVP series, 1.5 kV to 30 kV. Build your configuration, then request a QuickQuote.",
    models: [
      {
        id: "evo",
        name: "PVP Series",
        blurb: "Adjustable high voltage DC power supplies, 500 W to 3000 W",
        info: "The PVP series delivers adjustable high voltage DC from 0 up to 1.5, 5, 10, 20 or 30 kV with matching current ranges, in standard, polarity-reversal and floating-output versions, with optional ramp control and arc detection.",
        image: FIG + "evo.png",
        pnBase: "PVP",
        groups: [
          {
            id: "voltage", label: "Output voltage", type: "radio",
            options: [
              { code: "1500", label: "0 to 1,500 V", pn: " 1500", desc: "0 to 1,500 V DC adjustable output",
                info: "Adjustable output from 0 up to 1,500 V DC.", default: true },
              { code: "5000", label: "0 to 5,000 V", pn: " 5000", desc: "0 to 5,000 V DC adjustable output",
                info: "Adjustable output from 0 up to 5,000 V DC." },
              { code: "10000", label: "0 to 10,000 V", pn: " 10000", desc: "0 to 10,000 V DC adjustable output",
                info: "Adjustable output from 0 up to 10,000 V DC." },
              { code: "20000", label: "0 to 20,000 V", pn: " 20000", desc: "0 to 20,000 V DC adjustable output",
                info: "Adjustable output from 0 up to 20,000 V DC, in positive or negative polarity versions (500 W)." },
              { code: "30000", label: "0 to 30,000 V", pn: " 30000", desc: "0 to 30,000 V DC adjustable output",
                info: "Adjustable output from 0 up to 30,000 V DC, in positive or negative polarity versions (500 W)." }
            ]
          },
          {
            id: "current", label: "Output current / power class", type: "radio",
            options: [
              { code: "1400", label: "1,400 mA (2,000 W)", pn: "-1400", desc: "0 to 1,400 mA, 2,000 W class",
                onlyFor: { group: { id: "voltage", in: ["1500"] } },
                info: "2,000 W class: 0 to 1,400 mA at up to 1,500 V.", default: true },
              { code: "2000", label: "2,000 mA (3,000 W)", pn: "-2000", desc: "0 to 2,000 mA, 3,000 W class",
                onlyFor: { group: { id: "voltage", in: ["1500"] } },
                info: "3,000 W class: 0 to 2,000 mA at up to 1,500 V." },
              { code: "400", label: "400 mA (2,000 W)", pn: "-400", desc: "0 to 400 mA, 2,000 W class",
                onlyFor: { group: { id: "voltage", in: ["5000"] } },
                info: "2,000 W class: 0 to 400 mA at up to 5,000 V." },
              { code: "600", label: "600 mA (3,000 W)", pn: "-600", desc: "0 to 600 mA, 3,000 W class",
                onlyFor: { group: { id: "voltage", in: ["5000"] } },
                info: "3,000 W class: 0 to 600 mA at up to 5,000 V." },
              { code: "200", label: "200 mA (2,000 W)", pn: "-200", desc: "0 to 200 mA, 2,000 W class",
                onlyFor: { group: { id: "voltage", in: ["10000"] } },
                info: "2,000 W class: 0 to 200 mA at up to 10,000 V." },
              { code: "300", label: "300 mA (3,000 W)", pn: "-300", desc: "0 to 300 mA, 3,000 W class",
                onlyFor: { group: { id: "voltage", in: ["10000"] } },
                info: "3,000 W class: 0 to 300 mA at up to 10,000 V." },
              { code: "25", label: "25 mA (500 W)", pn: "-25", desc: "0 to 25 mA, 500 W class",
                onlyFor: { group: { id: "voltage", in: ["20000"] } },
                info: "500 W class: 0 to 25 mA at up to 20,000 V." },
              { code: "17", label: "17 mA (500 W)", pn: "-17", desc: "0 to 17 mA, 500 W class",
                onlyFor: { group: { id: "voltage", in: ["30000"] } },
                info: "500 W class: 0 to 17 mA at up to 30,000 V." }
            ]
          },
          {
            id: "variant", label: "Output configuration", type: "radio",
            options: [
              { code: "STD", label: "Standard", pn: "", desc: "standard output configuration",
                onlyFor: { group: { id: "voltage", in: ["1500", "5000", "10000"] } },
                info: "Standard grounded output configuration.", default: true },
              { code: "REV", label: "rev", note: "Polarity-reversal version", pn: " rev",
                desc: "polarity-reversal (rev) version",
                onlyFor: { group: { id: "voltage", in: ["1500", "5000", "10000"] } },
                info: "The rev version supports reversed output polarity." },
              { code: "FLO", label: "flo", note: "Floating output, 1.5 kV models", pn: " flo",
                desc: "floating output version",
                onlyFor: { group: { id: "voltage", in: ["1500"] } },
                onlyForReason: "Floating output is offered on the 1,500 V models",
                info: "Floating output version, offered on the 1,500 V models." },
              { code: "POS", label: "POS", note: "Positive polarity", pn: " POS",
                desc: "positive polarity output",
                onlyFor: { group: { id: "voltage", in: ["20000", "30000"] } },
                info: "Positive polarity version of the 20 kV / 30 kV supplies." },
              { code: "NEG", label: "NEG", note: "Negative polarity", pn: " NEG",
                desc: "negative polarity output",
                onlyFor: { group: { id: "voltage", in: ["20000", "30000"] } },
                info: "Negative polarity version of the 20 kV / 30 kV supplies." }
            ]
          },
          {
            id: "options", label: "Options", type: "check",
            options: [
              { code: "RAMP", codeLabel: "PVP Option", label: "Ramp control: adjustable voltage ramp-up and ramp-down",
                pn: "", acc: "PVP-RAMP-CONTROL", desc: "ramp control option",
                info: "Enables adjustable voltage ramp-up and ramp-down for controlled output transitions." },
              { code: "ARC", codeLabel: "PVP Option", label: "Arc detection with rapid shutdown",
                pn: "", acc: "PVP-ARC-DETECTION", desc: "arc detection option",
                info: "Detects arcs and shuts the output down rapidly to protect the supply and connected equipment." }
            ]
          }
        ]
      }
    ]
  };

  /* ---------------------------------------------------------
     FAMILY 6: ICX FieldHawk Spectrum Analyzers (Harogic OEM)
     BNC option part numbers = Harogic option code + "B"
     --------------------------------------------------------- */

  function icxOpt(o) { return Object.assign({ pn: "" }, o); }

  var ICX_OPT_71 = icxOpt({ code: "O71", codeLabel: "opt 71B", label: "Basic digital modulation analysis",
    acc: "opt 71B", desc: "basic digital modulation analysis (CW, ASK, 2FSK, 4FSK, BPSK, QPSK, 8PSK, 16QAM, 64QAM and more)",
    info: "Adds demodulation and analysis of common digital modulation schemes: CW, ASK, 2FSK, 4FSK, BPSK, QPSK, 8PSK, 16QAM, 64QAM and more." });
  var ICX_OPT_72 = icxOpt({ code: "O72", codeLabel: "opt 72B", label: "Pulse signal measurement",
    acc: "opt 72B", desc: "pulse signal measurement",
    info: "Adds automatic pulse signal measurement: pulse width, repetition interval and duty parameters." });
  var ICX_ANT_34 = icxOpt({ code: "O34", codeLabel: "opt 34B", label: "External omnidirectional antenna, 400 to 8000 MHz",
    acc: "opt 34B", desc: "external omnidirectional antenna, 400-8000 MHz, gain under 2 dBi",
    info: "External omnidirectional antenna covering 400 to 8000 MHz for broad-area monitoring." });
  var ICX_ANT_35 = icxOpt({ code: "O35", codeLabel: "opt 35B", label: "External handheld directional antenna, 0.5 to 10 GHz",
    acc: "opt 35B", desc: "external handheld directional antenna, 0.5-10 GHz",
    info: "Handheld directional antenna covering 0.5 to 10 GHz for signal hunting and direction finding." });
  var ICX_ADPT_SMAN = icxOpt({ code: "ASMAN", codeLabel: "P/N LJ0855B", label: "Adapter, SMA jack to N plug",
    acc: "LJ0855B", desc: "SMA jack to N plug adapter",
    info: "Coaxial adapter from SMA jack (female) to N plug (male)." });

  function icxOCXO(excludeFreq, reason) {
    return icxOpt({ code: "O01", codeLabel: "opt 01B", label: "Built-in OCXO reference, temperature drift under 0.15 ppm",
      acc: "opt 01B", desc: "built-in OCXO reference (temperature drift under 0.15 ppm)", badge: "OCXO",
      onlyFor: { group: { id: "freq", in: excludeFreq } },
      onlyForReason: reason,
      info: "Oven-controlled crystal oscillator reference with temperature drift under 0.15 ppm. Included as standard on the 40 GHz models." });
  }

  var FAMILY_ICX = {
    id: "icx",
    title: "ICX FieldHawk Spectrum Analyzer Configurator",
    subtitle: "USB, handheld and rugged real-time spectrum analyzers. Build your configuration, then request a QuickQuote.",
    models: [
      {
        id: "icx-u",
        name: "ICX USB series",
        blurb: "USB receivers, 9.5 to 40 GHz, PC-driven real-time analysis",
        info: "Compact USB spectrum analyzers driven from a PC running ICX Studio, covering 9 kHz up to 9.5 or 40 GHz.",
        image: FIG + "icx-usb.png",
        pnBase: "ICX",
        groups: [
          {
            id: "freq", label: "Model / frequency range", type: "radio",
            options: [
              /* RAMMED-OUT 2026-07-23 (hidden for now, may return):
              { code: "060U", label: "ICX-060U", note: "9 kHz to 6.3 GHz", pn: "-060U",
                desc: "USB spectrum analyzer, 9 kHz to 6.3 GHz",
                info: "USB spectrum analyzer covering 9 kHz to 6.3 GHz for RF development, troubleshooting and monitoring.", default: true },
              */
              { code: "090U", label: "ICX-090U", note: "9 kHz to 9.5 GHz", pn: "-090U",
                desc: "wideband USB spectrum analyzer, 9 kHz to 9.5 GHz",
                info: "Wideband USB spectrum analyzer covering 9 kHz to 9.5 GHz for advanced RF, microwave and wireless analysis.", default: true },
              { code: "400U", label: "ICX-400U", note: "9 kHz to 40 GHz, OCXO included", pn: "-400U",
                desc: "professional USB spectrum analyzer, 9 kHz to 40 GHz (OCXO included)",
                info: "Professional USB spectrum analyzer covering 9 kHz to 40 GHz. The OCXO reference is included as standard." }
            ]
          },
          {
            id: "options", label: "Options", hint: "BNC option part numbers carry a B suffix.", type: "check",
            options: [
              icxOCXO(["090U"], "Included as standard on the ICX-400U"),
              icxOpt({ code: "O05", codeLabel: "opt 05B", label: "Internal high-precision GNSS",
                acc: "opt 05B", desc: "internal high-precision GNSS",
                onlyFor: { group: { id: "freq", in: ["090U"] } },
                onlyForReason: "Offered on the ICX-090U",
                info: "Internal high-precision GNSS receiver for location-stamped measurements and timing." }),
              icxOpt({ code: "O20", codeLabel: "opt 20B", label: "IO extension board",
                acc: "opt 20B", desc: "IO extension board",
                info: "IO extension board adding trigger and reference connectivity." }),
              icxOpt({ code: "O401", codeLabel: "opt 40-1B", label: "T1 extended temperature, -20 C to +65 C",
                acc: "opt 40-1B", desc: "T1 extended temperature class (-20 C to +65 C)",
                onlyFor: { group: { id: "freq", in: ["090U"] } },
                onlyForReason: "T1 class for the ICX-090U; the 400U uses opt 40-3B",
                excludes: ["O403"],
                info: "Extends the operating temperature range to -20 C through +65 C." }),
              icxOpt({ code: "O403", codeLabel: "opt 40-3B", label: "T1 extended temperature, -20 C to +65 C",
                acc: "opt 40-3B", desc: "T1 extended temperature class (-20 C to +65 C)",
                onlyFor: { group: { id: "freq", in: ["400U"] } },
                onlyForReason: "This T1 variant covers the ICX-400U",
                excludes: ["O401"],
                info: "Extends the operating temperature range to -20 C through +65 C." }),
              icxOpt({ code: "O50", codeLabel: "opt 50B", label: "100 MHz analysis bandwidth",
                acc: "opt 50B", desc: "100 MHz real-time analysis bandwidth", badge: "100 MHz BW",
                onlyFor: { group: { id: "freq", in: ["090U"] } },
                onlyForReason: "Offered on the ICX-090U",
                info: "Widens the real-time analysis bandwidth to 100 MHz." }),
              ICX_OPT_71, ICX_OPT_72
            ]
          },
          {
            id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check",
            options: [
              ICX_ANT_34, ICX_ANT_35, ICX_ADPT_SMAN,
              icxOpt({ code: "GNS10", codeLabel: "P/N TX1923B", label: "GNSS tri-frequency antenna, 10 m",
                acc: "TX1923B", desc: "GNSS tri-frequency antenna, MMCX, 10 m",
                excludes: ["GNS5", "GNS3"],
                info: "GNSS tri-frequency antenna with MMCX connector and 10 m cable." }),
              icxOpt({ code: "GNS5", codeLabel: "P/N TX1922B", label: "GNSS tri-frequency antenna, 5 m",
                acc: "TX1922B", desc: "GNSS tri-frequency antenna, MMCX, 5 m",
                excludes: ["GNS10", "GNS3"],
                info: "GNSS tri-frequency antenna with MMCX connector and 5 m cable." }),
              icxOpt({ code: "GNS3", codeLabel: "P/N TX1921B", label: "GNSS tri-frequency antenna, 3 m",
                acc: "TX1921B", desc: "GNSS tri-frequency antenna, MMCX, 3 m",
                excludes: ["GNS10", "GNS5"],
                info: "GNSS tri-frequency antenna with MMCX connector and 3 m cable." }),
              icxOpt({ code: "A2429M", codeLabel: "P/N LJ1142B", label: "Adapter, 2.4 mm (F) to 2.92 mm (M)",
                acc: "LJ1142B", desc: "2.4 mm female to 2.92 mm male adapter",
                info: "Precision millimeter-wave adapter, 2.4 mm female to 2.92 mm male, 50 ohm. Useful with the 40 GHz models." }),
              icxOpt({ code: "A2429F", codeLabel: "P/N GJ0924B", label: "Adapter, 2.4 mm (F) to 2.92 mm (F)",
                acc: "GJ0924B", desc: "2.4 mm female to 2.92 mm female adapter",
                info: "Precision millimeter-wave adapter, 2.4 mm female to 2.92 mm female, 50 ohm. Useful with the 40 GHz models." })
            ]
          }
        ]
      },
      {
        id: "icx-h",
        name: "ICX handheld",
        blurb: "Handheld real-time analyzer, up to 40 GHz, field-ready",
        info: "Handheld ICX FieldHawk spectrum analyzer covering 9 kHz up to 40 GHz, with real-time high-speed signal capture.",
        image: FIG + "icx-handheld.png",
        pnBase: "ICX",
        groups: [
          {
            id: "freq", label: "Model / frequency range", type: "radio",
            options: [
              /* RAMMED-OUT 2026-07-23 (hidden for now, may return):
              { code: "095", label: "ICX-095", note: "9 kHz to 9.5 GHz, real-time", pn: "-095",
                desc: "advanced handheld real-time spectrum analyzer, 9 kHz to 9.5 GHz",
                info: "Advanced real-time handheld analyzer covering 9 kHz to 9.5 GHz with high-speed signal capture.", default: true },
              */
              /* RAMMED-OUT 2026-07-23 (hidden for now, may return):
              { code: "200", label: "ICX-200", note: "9 kHz to 20 GHz, real-time", pn: "-200",
                desc: "high-performance handheld spectrum analyzer, 9 kHz to 20 GHz",
                info: "High-performance handheld analyzer covering 9 kHz to 20 GHz." },
              */
              { code: "400", label: "ICX-400", note: "9 kHz to 40 GHz, OCXO included", pn: "-400",
                desc: "flagship handheld spectrum analyzer, 9 kHz to 40 GHz (OCXO included)",
                info: "Flagship handheld analyzer covering 9 kHz to 40 GHz. The OCXO reference is included as standard.", default: true }
            ]
          },
          {
            id: "options", label: "Options", hint: "BNC option part numbers carry a B suffix.", type: "check",
            options: [
              /* RAMMED-OUT 2026-07-23 (only ICX-400 live; OCXO is standard on it, so no optional-OCXO handheld model remains):
              icxOCXO(["095", "200"], "Included as standard on the ICX-400"),
              */
              ICX_OPT_71, ICX_OPT_72
            ]
          },
          {
            id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check",
            options: [
              icxOpt({ code: "BELT", codeLabel: "P/N PJ0133B", label: "Shoulder carrier belt",
                acc: "PJ0133B", desc: "shoulder carrier belt",
                info: "Shoulder carrier belt for handheld field use." }),
              icxOpt({ code: "BAG", codeLabel: "P/N GJ2016B", label: "Functional shoulder bag",
                acc: "GJ2016B", desc: "functional shoulder bag",
                info: "Functional shoulder bag for the handheld series." }),
              ICX_ANT_34, ICX_ANT_35, ICX_ADPT_SMAN
            ]
          }
        ]
      },
      {
        id: "icx-r",
        name: "ICX rugged",
        blurb: "IP68-rated analyzers for harsh environments",
        info: "Ruggedized, IP68-rated ICX FieldHawk analyzers for industrial, military and field applications, covering 9 kHz up to 9.5, 20 or 40 GHz, with an optional onboard AI accelerator.",
        image: FIG + "icx-rugged.png",
        pnBase: "ICX",
        groups: [
          {
            id: "freq", label: "Model / frequency range", type: "radio",
            options: [
              { code: "090R", label: "ICX-090R", note: "9 kHz to 9.5 GHz, IP68", pn: "-090R",
                desc: "rugged IP68 spectrum analyzer, 9 kHz to 9.5 GHz",
                info: "Rugged IP68-rated analyzer covering 9 kHz to 9.5 GHz for harsh environments.", default: true },
              /* RAMMED-OUT 2026-07-23 (hidden for now, may return):
              { code: "200R", label: "ICX-200R", note: "9 kHz to 20 GHz, IP68", pn: "-200R",
                desc: "rugged IP68 spectrum analyzer, 9 kHz to 20 GHz",
                info: "Ruggedized handheld analyzer covering 9 kHz to 20 GHz for demanding industrial and military use." },
              */
              { code: "400R", label: "ICX-400R", note: "9 kHz to 40 GHz, IP68, OCXO included", pn: "-400R",
                desc: "rugged IP68 spectrum analyzer, 9 kHz to 40 GHz (OCXO included)",
                info: "IP68-rated analyzer covering 9 kHz to 40 GHz for mission-critical monitoring. The OCXO reference is included as standard." }
            ]
          },
          {
            id: "options", label: "Options", hint: "BNC option part numbers carry a B suffix.", type: "check",
            options: [
              icxOCXO(["090R"], "Included as standard on the ICX-400R"),
              icxOpt({ code: "O08", codeLabel: "opt 08B", label: "Onboard Nvidia Jetson Orin NX AI accelerator, 117 TOPS",
                acc: "opt 08B", desc: "onboard Nvidia Jetson Orin NX 8G AI accelerator (117 TOPS)", badge: "AI onboard",
                info: "Adds an onboard Nvidia Jetson Orin NX 8G module (117 TOPS) for edge AI signal processing." }),
              icxOpt({ code: "O403", codeLabel: "opt 40-3B", label: "T1 extended temperature, -20 C to +65 C",
                acc: "opt 40-3B", desc: "T1 extended temperature class (-20 C to +65 C)",
                info: "Extends the operating temperature range to -20 C through +65 C." }),
              ICX_OPT_71, ICX_OPT_72
            ]
          },
          {
            id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check",
            options: [
              icxOpt({ code: "BELT", codeLabel: "P/N PJ0133B", label: "Shoulder carrier belt",
                acc: "PJ0133B", desc: "shoulder carrier belt",
                info: "Shoulder carrier belt for field use." }),
              ICX_ANT_34, ICX_ANT_35, ICX_ADPT_SMAN
            ]
          }
        ]
      }
    ]
  };

  /* Every product carries the three-year service agreement accessory
     and a typical-delivery note shown in the quote list. */
  var SA8000 = { code: "SA8000", codeLabel: "P/N SA-8000", label: "Three-year service agreement", pn: "", acc: "SA-8000",
    desc: "three-year service agreement",
    info: "Extends factory support and calibration coverage to three years. Ordered as P/N SA-8000 alongside any instrument." };
  var TA8000 = { code: "TA8000", codeLabel: "P/N TA-8000", label: "Additional Academy Class Pass (3 included with every purchase)", pn: "", acc: "TA-8000",
    desc: "additional Academy Class Pass",
    info: "One additional BNC Academy class pass. Every purchase already includes three passes; add P/N TA-8000 for each extra seat." };
  var FAM_DELIVERY = {
    ddg: "Stock - 2 weeks",
    "765": "2 - 3 weeks",
    awg: "Stock - 3 weeks",
    rf: "Stock - 4 weeks",
    riid: "Stock - 4 weeks",
    evo: "Stock - 3 weeks",
    icx: "Stock - 2 weeks"
  };
  var ALL_FAMILIES = [FAMILY_DDG, FAMILY_765, FAMILY_AWG, FAMILY_RF, FAMILY_RIID, FAMILY_EVO, FAMILY_ICX];
  ALL_FAMILIES.forEach(function (fam) {
    fam.models.forEach(function (m) {
      m.delivery = m.delivery || FAM_DELIVERY[fam.id] || "";
      var accGroup = null;
      m.groups.forEach(function (g) { if (g.id === "acc") accGroup = g; });
      if (!accGroup) {
        accGroup = { id: "acc", label: "Accessories", hint: "Quoted as separate line items.", type: "check", options: [] };
        m.groups.push(accGroup);
      }
      accGroup.options.push(Object.assign({}, SA8000));
      accGroup.options.push(Object.assign({}, TA8000));
    });
  });

  /* Order-independent registration: queue if the engine has not loaded yet. */
  function reg(f) {
    if (window.BNCConfigurator) window.BNCConfigurator.register(f);
    else (window.__bncCfgQueue = window.__bncCfgQueue || []).push(f);
  }
  ALL_FAMILIES.forEach(reg);
})();
