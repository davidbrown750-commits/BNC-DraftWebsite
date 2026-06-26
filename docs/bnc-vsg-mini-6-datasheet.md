# Model VSG-Mini-6 USB Vector Signal Generator (9 kHz to 6 GHz)

**Berkeley Nucleonics** | Vector Signal Generator | Product Data Sheet

Specifications transcribed verbatim from the source product manual (V1.2). Values apply after a 10-minute warm-up at 25 °C ambient unless otherwise stated. Control-software name to be confirmed (verify).

## Overview

The Berkeley Nucleonics VSG-Mini-6 is the second vector signal generator in the BNC RF and microwave line, sized to sit beside a laptop rather than fill a rack. It generates continuous-wave, swept, and fully vector-modulated signals from 9 kHz to 6 GHz, and it draws power and data over a single USB Type-C cable.

Inside the compact housing, a 16-bit DAC and an FPGA-based interpolator build clean waveforms with 100 MHz of modulation bandwidth and 125 MB of playback memory. That combination supports single-tone work, frequency and power sweeps, stored IQ playback, and real-time IQ streaming from a host. An optional built-in GNSS receiver disciplines the reference for timing, positioning, and frequency calibration in the field.

The VSG-Mini-6 runs on Windows and Linux, on x86 and ARM hosts, so it fits embedded and automated setups as readily as a desk.

## Key Features

- **Frequency:** 9 kHz to 6 GHz continuous coverage.
- **Modulation bandwidth:** 100 MHz RAM playback, 50 MHz continuous streaming.
- **Memory depth:** 125 MB (32 M samples) of built-in IQ memory.
- **SSB phase noise:** -124 dBc/Hz at 10 kHz offset on a 1 GHz carrier.
- **Output power:** up to 14 dBm maximum; minimum to -100 dBm or below across the range.
- **Converter:** 16-bit DAC with an FPGA-based high-performance interpolator.
- **Interface:** USB 3.0 / 2.0 over Type-C, with PD power on the same connector.
- **Timing:** optional built-in GNSS for timing, positioning, and frequency calibration.
- **Hosts:** Windows and Linux, on x86 and ARM processors.

## Specifications

### Frequency

| Parameter | Specification |
|---|---|
| Frequency range | 9 kHz to 6 GHz |
| Frequency resolution | 0.1 Hz analog tuning, ≤1 uHz digital tuning |
| LO switching time | ≤100 us pre-programmed; ≤50 ms software controlled |
| Reference clock | Internal or external, manual correction or GNSS calibration is available |
| Frequency accuracy — TCXO (std.) | <0.5 ppm, manual correction is available |
| Frequency accuracy — OCXO (opt.01) | <0.2 ppm, manual correction is available |
| Frequency accuracy — OCXO via GNSS | ≤0.05 ppm, when GNSS is locked |
| Aging and temperature stability — TCXO (std.) | ≤1 ppm/year, ≤1 ppm |
| Aging and temperature stability — OCXO (opt.01) | ≤1 ppm/year, ≤0.15 ppm |
| Built-in GNSS 1PPS accuracy | ±100 ns |

### Spectrum Purity — SSB phase noise (dBc/Hz)

| Carrier frequency | 1 GHz | 3 GHz | 6 GHz |
|---|---|---|---|
| 1 kHz | -115 | -105 | -98 |
| 10 kHz | -124 | -114 | -108 |
| 100 kHz | -126 | -116 | -110 |
| 1 MHz | -138 | -128 | -122 |

### Spectrum Purity — Harmonics, spurious, EVM

| Parameter | Condition | Specification |
|---|---|---|
| Harmonics (CW, 0 dBm) | 100 MHz | ≤-45 dBc |
| Harmonics (CW, 0 dBm) | 1 GHz | ≤-50 dBc |
| Harmonics (CW, 0 dBm) | 3 GHz | ≤-60 dBc |
| Harmonics (CW, 0 dBm) | 6 GHz | ≤-75 dBc |
| Non-harmonic spurious | 1 MHz steps size, 20 MHz observation BW | Spurious ≤-80 dBc for approximately 98% of frequency points; worst-case spurious ≤-55 dBc |
| EVM (Typical) | 1 GHz | ≤0.3% 1MSPS QAM 16, Alpha = 0.35; ≤0.5% 10MSPS QAM 64, Alpha = 0.35 |
| EVM (Typical) | 6 GHz | ≤0.5% 1MSPS QAM 16, Alpha = 0.35; ≤1.0% 10MSPS QAM 64, Alpha = 0.35 |

### Amplitude

| Parameter | 9 kHz | 100 MHz | 1 GHz | 3 GHz | 6 GHz |
|---|---|---|---|---|---|
| Max. output power (dBm) | ≥0 | ≥7 | ≥14 | ≥14 | ≥7 |
| Min. output power (dBm) | ≤-100 | ≤-100 | ≤-100 | ≤-100 | ≤-100 |

| Power accuracy (Guaranteed / Typical) | Specification |
|---|---|
| Output power ≥-45 dBm | ±1.2 dB / 0.7 dB |
| Output power -80 dBm to -45 dBm | ±1.5 dB / 1.2 dB |
| Output power -100 dBm to -80 dBm | ±2.0 dB / 1.8 dB |
| Power setting step size | 0.1 dB |

### Signal Processing

| Parameter | Specification |
|---|---|
| Standard function | Single-tone, Frequency sweep, Power sweep, IQ playback, Real-Time IQ playback |
| Modulation bandwidth | 100 MHz RAM playback, 50 MHz continuous streaming |
| Built-in memory depth | 125 MB (32 M samples) |
| IQ sampling rate | 195.3125 kHz to 125 MHz, step size ≤10 Hz |
| Basic modulation — APSK | 16APSK |
| Basic modulation — ASK | 2ASK, 4ASK, 8ASK |
| Basic modulation — FSK | 2FSK, 4FSK, 8FSK, 16FSK |
| Basic modulation — QAM | 16 QAM, 64 QAM, 256 QAM, 1024 QAM |
| Basic modulation — PSK | BPSK, QPSK, 8PSK, 16PSK, DBPSK, DQPSK, D8PSK, Pi/4 DQPSK |

### General Characteristics — Input and output

| Parameter | Specification |
|---|---|
| Power | Type-C, PD protocol (12 V/3 A std.). Voltage range 9 to 12 V, Ripple <200 mVpp |
| Data | Type-C, USB3.0 (USB2.0 bandwidth limited). Requires 5 V/1 A power supply |
| RF output | N(F), Output impedance 50 Ω |
| External reference clock input | MMCX(F), Amplitude ≥1.5 Vpp, Input impedance 330 Ω |
| Reference clock output | MMCX(F), Output impedance 50 Ω, 100 MHz |
| External trigger input | 3.3 V CMOS, Input high impedance |
| External trigger output | 3.3 V CMOS |
| GNSS antenna input | SMA (F) |
| Power consumption | ≤16 W |
| Overall / core weight | ≤360 g / ≤120 g |

### General Characteristics — Physical and environmental

| Parameter | Specification |
|---|---|
| Overall / core dimensions (L × W × H) | ≤163 x 66 x 37 mm / ≤63 x 60 x 15 mm |
| System requirements — Linux | aarch64, x64 |
| System requirements — Windows | x64 |
| Operating / storage temp — T0 class (std.) | 0 to 50 °C / -20 to 70 °C |
| Operating / storage temp — T1 class (opt.40) | -20 to 65 °C / -40 to 85 °C |
| Operating / storage temp — T2 class (opt.41), only core | -40 to 65 °C / -40 to 85 °C |
| Packaging accessories | Flash disk × 1, USB 3.0 data cable × 1, USB power cable × 1, Power adapter × 1 |

**Specification conditions.** (1) 10 min warm-up after power-on. (2) Ambient temperature 25 °C (instrument temperature 50 °C). (3) With adequate cooling ensuring both ambient and core temperatures remain within the rated range.

### Options

| Code | Description | Type |
|---|---|---|
| 01 | Built-in OCXO reference clock | built-in hardware |
| 05 | Built-in high precise GNSS | built-in hardware |
| 40 | T1 temperature class | built-in hardware |
| 41 | T2 temperature class, only available for core | built-in hardware |

---

*Hero image and control-software screenshots carry on-device and on-screen branding from the source product (model silkscreen and application wordmark) that must be rebranded to Berkeley Nucleonics / Model VSG-Mini-6 before publication.*
