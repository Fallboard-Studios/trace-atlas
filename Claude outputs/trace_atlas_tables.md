# Trace Atlas: Header & Nav Copy Pass

## 1. Header

| Element | Lore | Human | Status in code |
|---|---|---|---|
| Mute toggle | not in your notes | not in your notes | Code has lore "SIGNAL SUPPRESSION [c]" and human "Mute". "[c]" is placeholder text that is being removed. |
| Volume slider | Master Output | Volume | Human label matches. No lore label exists in code. |

## 2. Nav tree: your label decisions

### Top level

| Node | Lore | Human | Code today |
|---|---|---|---|
| Home | Monitor | Deck | "Home" |
| Fleet Params | Environment | Fleet Params | "Fleet Params" |
| Probes | Timbre & Color | Probes | "Probes" |
| Companies | Unity & Variety | Companies | "Companies" |
| Settings | Settings | Navigation | "Settings" |

### Fleet Params

| Node | Lore | Human | Code today |
|---|---|---|---|
| Pacing | Trace Timing | Pacing | "Pacing" |
| Tempo | Ping Rate | Tempo | "Tempo" |
| Frequency | Trace Skip Rate | Automation Rate | "Frequency" |
| Duration | Trace Runway | Automation Length | "Duration" |
| Automatic Intensity | Trace Width | Automation Range | "Automatic Intensity" |
| EQ & Filters | Outer Bounds | EQ & Filters | "EQ & Filters" |
| 3-Band EQ | Trace Metrics | 3-Band EQ | "3-Band EQ" |
| High-Pass Filter | Top Extraction | High-Pass Filter | "High-Pass Filter" |
| Low-Pass Filter | Bottom Extraction | Low-Pass Filter | "Low-Pass Filter" |
| LFO Drift | Signatures | Drift | NA |
| Fleet Drift | Trace Appendix | Environmental Drift | NA |
| Probe Drift | Probe Signature | Voice Drift | NA |
| Time & Space | Dimensional Bounds | Time & Space | "Time & Space" |
| Reverb | External Capacity | Reverb | "Reverb" |
| Delay | Retracing | Delay | "Delay" |
| Output | Trace Flattening | Output | "Output" |
| Compressor | Bundler | Compressor | "Compressor" |
| Limiter | Reduction | Limiter | "Limiter" |

### Probes and Companies (one shared set of rows)

| Node | Lore | Human | Code today |
|---|---|---|---|
| All Probes | Fleet Directives | All Voices | "All Probes" |
| Output | Output | Dynamics | "Output" |
| Dynamics | Ops Clarity | Level Control | "Dynamics" |
| Composition | Payload Registrar | Composition | "Composition" |
| Rhythm | Payload Map | Rhythm | "Rhythm" |
| Pitches | Payload Allocation | Pitches | "Pitches" |
| Envelope | Ping Shell | Envelope | "Envelope" |
| Contour | Ping Profile | Contour | "Contour" |
| Source | Telemetry | Source | "Source" |
| Baseline Oscillator | Baseline Feed | Core Oscillator | same |
| Coaxial Oscillator | Coaxial Effect | Companion Oscillator | same |
| Harmonic Oscillator | Offset Matrix | Accent Oscillator | same |

### Settings

| Node | Lore | Human | Code today |
|---|---|---|---|
| Audio Profile | Trace Capacity | Audio Quality | same |
| Robot Load | Fleet Size | Voice Limit | "Robot Load" |
| Effects Load | Trace Budget | Effects Limit | same |
| Audio Seeds | Foundry | Seeds | same |
| Attenuation Style | Attenuation Style | Atmosphere | same |
| Coordinates | Atlas Vector | Location | same |
| Sessions | Comms | Save & Share | same |

## 3. Controls inside each nav item

### Fleet Params controls

| Group (human label) | Control | Lore caption | Human label |
|---|---|---|---|
| Pacing | Tempo | Ping Rate | Tempo |
|  | Frequency | Trace Skip Rate | Automation Rate |
|  | Duration | Trace Runway | Automation Length |
|  | Automatic Intensity | Trace Width | Automation Range |
| 3-Band EQ | Low | Sub-Band | Bass |
|  | Mid | Medial Band | Mid |
|  | High | Apical Band | Treble |
| High-Pass Filter | Frequency | Extraction Ceiling | Cutoff |
|  | Resonance | Boundary Resonance | Resonance |
| Low-Pass Filter | Frequency | Extraction Floor | Cutoff |
|  | Resonance | Boundary Resonance | Resonance |
| Reverb | Decay | Dissipation Time | Reverb Length |
|  | Pre-Delay | Initial Lag | Pre-Delay |
|  | Mix | Diffusion Ratio | Reverb Amount |
| Delay | Time | Propagation Lag | Delay Time |
|  | Feedback | Recirculation Rate | Repeats |
|  | Mix | Reflection Ratio | Delay Amount |
| Compressor | Threshold | Bundle Threshold | Threshold |
|  | Ratio | Bundle Ratio | Ratio |
|  | Attack | Bundle Onset | Attack Time |
|  | Release | Bundle Recovery | Release Time |
|  | Knee | Bundle Curve | Knee |
|  | Decay Mode | Decay Protocol | Decay Mode |
| Limiter | Threshold | Output Ceiling | Ceiling |
| Environmental Drift | Rate Drift | Trace Pulse | Rate Drift |
|  | Depth Drift | Trace Bending | Depth Drift |
| Voice Drift | Rate Drift | Ping Period | Rate Drift |
|  | Depth Drift | Ping Flicker | Depth Drift |

### Probe controls (from the Single Probe tab)

| Section | Control | Lore caption | Human label |
|---|---|---|---|
| Level Control | Monitor mode | Diagnostic Feed | Monitor Mode |
|  | Volume | Transducer Pressure | Volume |
| Composition > Rhythm and Pitches | Density | Payload Density | Note Density |
|  | Motif length | Payload Subgroups | Phrase Length |
|  | Pitch repeat | Payload Duplication | Pitch Repeat Chance |
|  | Note variance | Ping Variance | Note Variance |
|  | Octave range, low | Ping Floor | Lowest Octave |
|  | Octave range, high | Ping Ceiling | Highest Octave |
| Envelope > Contour | Contour | Ping Profile | Contour |
|  | Attack | Ping Onset | Attack Time |
|  | Decay | Ping Settling | Decay Time |
|  | Sustain | Ping Hold | Sustain Level |
|  | Release | Ping Fade | Release Time |

#### Core oscillator (nav lore: Baseline Feed)

| Control | Lore caption | Human label |
|---|---|---|
| Layer heading | Baseline Feed | Core Oscillator |
| Type (Sweep, Sway, Kinetic, Binary, Burst) | Feed Geometry | Core Type |
| Gain (has an LFO) | Feed Saturation | Core Gain |
| Detune (in cents) | Feed Drift | Core Detune |
| Phase | Feed Alignment | Core Phase |
| Interval | Feed Break | Core Interval |

#### Companion oscillator (nav lore: Coaxial Effect)

| Control | Lore caption | Human label |
|---|---|---|
| Layer heading | Coaxial Effect | Companion Oscillator |
| Type (Sweep, Sway, Kinetic, Binary, Burst) | Effect Geometry | Companion Type |
| Gain (has an LFO) | Effect Saturation | Companion Gain |
| Detune (in cents) | Effect Drift | Companion Detune |
| Phase | Effect Alignment | Companion Phase |
| Interval | Effect Break | Companion Interval |

#### Accent oscillator (nav lore: Offset Matrix)

| Control | Lore caption | Human label |
|---|---|---|
| Layer heading | Offset Matrix | Accent Oscillator |
| Type (Sweep, Sway, Kinetic, Binary, Burst) | Matrix Geometry | Accent Type |
| Gain (has an LFO) | Matrix Saturation | Accent Gain |
| Detune (in cents) | Matrix Drift | Accent Detune |
| Phase | Matrix Alignment | Accent Phase |
| Interval | Matrix Break | Accent Interval |

### LFO controls (written once)

| Control | Lore caption | Human label |
|---|---|---|
| LFO heading | Need this to match human behavior | (shows the name of the slider it modulates) |
| Shape | Mutation Type | Shape |
| Rate | Mutation Cadence | Rate |
| Depth | Mutation Span | Depth |

### Waveform names (written once)

| Waveform | Lore Label | Human Label | Where it appears |
|---|---|---|---|
| Triangle | Sweep | Triangle | LFO Shape |
| Sine | Sway | Sine | LFO Shape |
| Square | Binary | Square | LFO Shape |
| Sawtooth | Kinetic | Sawtooth | LFO Shape |
| Pulse | Burst | Pulse | Oscillators |

## 4. Comparison against the code
