# Still fighting the double pulse on a Tektronix AWG7000?

**Application Brief - AWG Migration | Berkeley Nucleonics Model 685 ArbRider AWG**

If you run a Tektronix AWG7082C, you know the workaround: a series resistor or a capacitor tacked onto the output to tame a secondary pulse and the ringing that rides with it. The Berkeley Nucleonics Model 685 puts a clean edge on the bench without the band-aid, and it produces a true double pulse only when you ask for one. The AWG7000 series is also discontinued, so that workaround is now your long-term support plan. It does not have to be.

## The problem: the artifact you have learned to live with

You program one clean pulse. The output hands you two. There is the pulse you wanted, then a smaller ghost of it a few nanoseconds later, wrapped in ringing. The fix that gets passed around the lab is always the same: a series resistor at the output, or a capacitor in line, to damp the reflection and swallow the second pulse. It mostly works. It also reshapes your edge, costs you amplitude, and drops one more uncalibrated part between the instrument and the device under test.

That is not how a bench should feel in 2026. And on the AWG7082C it is now permanent, because the AWG7000 series has been discontinued. New units are gone. What is left is the used market, the rental fleet, and a soldered-on workaround standing in for a support contract.

## Root cause: why the second pulse shows up

The AWG7000 series reaches its top bandwidth through a low-amplitude, AC-coupled direct-DAC path. Two things follow from that design. Fast edges into anything short of a perfect 50 ohm termination reflect, and a reflection arriving back at a fast output reads on your scope as a secondary pulse. An AC-coupled path also carries its own baseline behavior, so droop and overshoot ride along with the edge. Teams running these units in the field land on the same answer over and over: add a series resistor or a blocking capacitor to absorb the reflection and quiet the ringing.

The passive band-aid treats the symptom. It cannot give you back a clean, full-amplitude, DC-coupled edge, because the output stage was never built to deliver one.

## The fix: the Model 685 puts a clean edge on the bench

The Berkeley Nucleonics Model 685 drives a DC-coupled, 50 ohm, 5 Vpp output directly. Rise and fall times come in under 300 ps, jitter under 2 ps, and the baseline sits flat where you set it through a +/-2.5 V offset range. No series resistor. No blocking capacitor. No ghost pulse to chase. The edge you program is the edge that reaches your device.

And the double pulse? The 685 makes one on purpose. A clean double pulse is a native waveform, alongside sine, square, ramp, pulse, Gaussian, noise, and fully arbitrary playback, so the shape that used to be a defect becomes a setting you dial in. Underneath it all sits 16-bit vertical resolution, which is where the 685 pulls decisively ahead: more levels, lower quantization noise, and pulse and step shapes the 8 to 10-bit AWG7000 path simply cannot render.

## Side by side: AWG7082C and Model 685

| Specification | Tektronix AWG7082C | BNC Model 685 |
|---|---|---|
| Product status | Discontinued; used and rental only | Current and supported |
| Vertical resolution | 8 to 10-bit | 16-bit |
| Output stage | Low-amplitude AC-coupled direct DAC, or amplified path; field workarounds for ringing | DC-coupled, 5 Vpp into 50 ohm, +/-2.5 V offset, no conditioning |
| Rise / fall time | Fast on the direct path, AC-coupled | < 300 ps, DC-coupled |
| Jitter | Not specified here | < 2 ps |
| Sample rate | 8 GS/s (16 GS/s interleaved) | 6.16 GS/s |
| Analog bandwidth | To ~3.2 GHz (to ~6 GHz with the wide-bandwidth option) | 2 GHz |
| Channels | 2 | 2, 4, or 8 |
| Memory depth | 32 Mpts | Up to 4 Gpts per channel |
| Double pulse | Unintended artifact to suppress | Native, clean, on demand |

Model 685 figures are from the published Berkeley Nucleonics specification. AWG7082C figures are from published Tektronix documentation for the discontinued AWG7000 series. The AWG7082C leads on raw sample rate and direct-path bandwidth. For the pulse, timing, and signal-emulation work most AWG7000 owners actually run, 16-bit fidelity and a clean DC-coupled output matter more, and they end the double-pulse workaround for good. If your application genuinely needs more than 6 GS/s on a single channel, the wider ArbRider line has options worth a conversation.

## What you gain: more than a clean pulse

- **Fidelity.** 16-bit resolution resolves pulse shapes, fine steps, and low-level detail that an 8 to 10-bit path quantizes away.
- **A real output.** A DC-coupled 5 Vpp drive into 50 ohm reaches most devices directly, with no external resistor, capacitor, or amplifier in the path.
- **Support you can count on.** The 685 is a current product, with calibration, warranty, and service behind it, not a discontinued unit kept alive on the used market.
- **Room to grow.** Two, four, or eight channels, memory to 4 Gpts per channel, and advanced sequencing with loops, jumps, and conditional branches.
- **The double pulse on your terms.** Generate it cleanly when the test calls for it, and never when it does not.

## Next step: see it on your own pulse

Bring us the waveform that gives your AWG7000 trouble, the one you have been damping with passives. We will reproduce it on a Model 685 and put both edges on a scope side by side. Let's look at the results together. Ready to retire the workaround?

[Request a Model 685 demo](../get-quote.html) or explore the [Model 685 data sheet](bnc-awg-685-datasheet.html).
