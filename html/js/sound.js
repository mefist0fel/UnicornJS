// Sound - a tiny hand-rolled Web Audio SFX synth (no tracker lib, no jsfxr blob
// - the js13k rule is "write it or generate it"). Every effect is one call to
// Tone (enveloped oscillator) and/or Noise (filtered noise burst); both take
// plain positional args, no options object. See docs/sound.md. The ambient
// music track was cut for size (see below).
//
// AudioContext starts suspended until a user gesture: getAC() lazily builds it,
// the menu's Play button (a real click) resumes it, and a one-shot pointerdown
// listener is the backstop.

var _ac = null
var _master = null   // everything routes here; mute = _master.gain 0
var _muted = false

function getAC() {
	if (_ac) {
		if (_ac.state === 'suspended') _ac.resume()
		return _ac
	}
	try {
		_ac = new (window.AudioContext || window.webkitAudioContext)()
	} catch (e) {
		_ac = null
		return null
	}
	_master = _ac.createGain()
	_master.gain.value = _muted ? 0 : 0.6
	_master.connect(_ac.destination)
	return _ac
}

window.addEventListener('pointerdown', () => { getAC() }, { once: true })

function ToggleMute() {
	_muted = !_muted
	if (_master) _master.gain.value = _muted ? 0 : 0.6
}

// ---- primitives ----
//
// Both take positional args (was an options object with a dozen `x==null?d:x`
// defaults - all the rarely-touched knobs, attack / sustain / start-time / bus,
// went away with the music). Attack and the decay "knee" level are fixed now.

// Enveloped oscillator blip: type, start freq, glide-to freq (0/falsy = none),
// decay time, release time, peak volume.
function Tone(type, f0, f1, decay, release, vol) {
	const c = getAC()
	if (!c) return
	const t0 = c.currentTime
	const a = 0.005
	const end = t0 + a + decay + release
	const g = c.createGain()
	g.gain.setValueAtTime(0.0001, t0)
	g.gain.linearRampToValueAtTime(vol, t0 + a)
	g.gain.linearRampToValueAtTime(vol * 0.3, t0 + a + decay) // decay knee
	g.gain.linearRampToValueAtTime(0.0001, end)
	g.connect(_master)
	const osc = c.createOscillator()
	osc.type = type
	osc.frequency.setValueAtTime(f0, t0)
	if (f1) osc.frequency.exponentialRampToValueAtTime(Mmax(1, f1), end)
	osc.connect(g)
	osc.start(t0)
	osc.stop(end + 0.02)
}

// Filtered white-noise burst: duration, biquad type, cutoff, glide-to cutoff
// (0/falsy = none), peak volume.
function Noise(dur, filter, cut, cutEnd, vol) {
	const c = getAC()
	if (!c) return
	const t0 = c.currentTime
	const n = c.sampleRate * dur | 0
	const buf = c.createBuffer(1, n, c.sampleRate)
	const ch = buf.getChannelData(0)
	for (let i = 0; i < n; i++) ch[i] = Mr() * 2 - 1
	const src = c.createBufferSource()
	src.buffer = buf
	const filt = c.createBiquadFilter()
	filt.type = filter
	filt.frequency.setValueAtTime(cut, t0)
	if (cutEnd) filt.frequency.exponentialRampToValueAtTime(cutEnd, t0 + dur)
	const g = c.createGain()
	g.gain.setValueAtTime(vol, t0)
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
	src.connect(filt)
	filt.connect(g)
	g.connect(_master)
	src.start(t0)
	src.stop(t0 + dur + 0.02)
}

// ---- SFX presets ----

const Sfx = {
	click() { Tone('square', 520, 680, 0.05, 0.03, 0.12) },
	build() { Tone('sawtooth', 170, 340, 0.18, 0.12, 0.16) },
	hit() { Noise(0.12, 'lowpass', 2200, 400, 0.22) },
	explosion() {
		Noise(0.5, 'lowpass', 1500, 80, 0.3)
		Tone('triangle', 130, 42, 0.4, 0.22, 0.22)
	},
	jump() { Tone('sawtooth', 110, 900, 0.5, 0.35, 0.2) },
	hyperjump() {
		Tone('sawtooth', 70, 1300, 1.3, 0.7, 0.22)
		Noise(1.5, 'bandpass', 300, 3200, 0.12)
	},
	death() {
		Tone('sawtooth', 320, 40, 1.1, 0.7, 0.3)
		Noise(1.1, 'lowpass', 900, 60, 0.28)
	}
}

// weapon fire, indexed by fire kind F_KIN/F_PLA/F_ROC (see modules.js).
const SHOOT_SFX = [
	() => Tone('square', 440, 120, 0.09, 0.04, 0.1),   // F_KIN
	() => Tone('sawtooth', 720, 240, 0.14, 0.08, 0.1), // F_PLA
	() => Noise(0.3, 'bandpass', 900, 200, 0.12)       // F_ROC
]
function SfxShoot(kind) {
	const f = SHOOT_SFX[kind]
	if (f) f()
}

// ---- ambient music ----
//
// The 16-step ticking-suspense ambient (drones + LFO wobble + sparse minor
// notes on a setInterval pump) was cut for size - it cost ~360 B zip and was
// the least-finished part (see docs/sound.md, tasks block 5). MusicStart/Stop
// stay as no-ops so menu_state / ship_state keep compiling and the track can
// come back later without touching the call sites.
function MusicStart() {}
function MusicStop() {}
