// Sound & music - a tiny hand-rolled Web Audio synth. One module covers both
// SFX and the ambient track (no tracker lib, no jsfxr blob - the js13k rule is
// "write it or generate it"). Everything is oscillator + gain-envelope +
// noise-buffer, in the spirit of ZzFX but only as featured as this game needs.
// See docs/sound.md.
//
// AudioContext starts suspended until a user gesture: getAC() lazily builds it,
// the menu's Play button (a real click) resumes it, and a one-shot pointerdown
// listener is the backstop. Music can be "started" before that - its nodes just
// play into the suspended graph silently until the context resumes.

var _ac = null
var _master = null   // everything routes here; mute = _master.gain 0
var _musicBus = null // music sits under its own gain, quieter than SFX
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
	_musicBus = _ac.createGain()
	_musicBus.gain.value = 0.55
	_musicBus.connect(_master)
	return _ac
}

window.addEventListener('pointerdown', () => { getAC() }, { once: true })

function ToggleMute() {
	_muted = !_muted
	if (_master) _master.gain.value = _muted ? 0 : 0.6
}

// ---- primitives ----

// A single enveloped oscillator blip. `o`: { type, freq, freqEnd, attack,
// decay, sustain, sustainLevel, release, vol, at, bus }. `at` = absolute start
// time (music scheduler); default = now. `bus` = destination gain (default
// _master).
function Tone(o) {
	const c = getAC()
	if (!c) return
	const t0 = o.at == null ? c.currentTime : o.at
	const vol = o.vol == null ? 0.25 : o.vol
	const f0 = o.freq || 220
	const f1 = o.freqEnd == null ? f0 : o.freqEnd
	const a = o.attack == null ? 0.004 : o.attack
	const d = o.decay == null ? 0.09 : o.decay
	const s = o.sustain || 0
	const sl = o.sustainLevel == null ? 0.35 : o.sustainLevel
	const r = o.release == null ? 0.06 : o.release
	const end = t0 + a + d + s + r

	const g = c.createGain()
	g.gain.setValueAtTime(0.0001, t0)
	g.gain.linearRampToValueAtTime(vol, t0 + a)
	g.gain.linearRampToValueAtTime(vol * sl, t0 + a + d)
	g.gain.setValueAtTime(vol * sl, t0 + a + d + s)
	g.gain.linearRampToValueAtTime(0.0001, end)
	g.connect(o.bus || _master)

	const osc = c.createOscillator()
	osc.type = o.type || 'square'
	osc.frequency.setValueAtTime(f0, t0)
	if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Mmax(1, f1), end)
	osc.connect(g)
	osc.start(t0)
	osc.stop(end + 0.02)
}

// A burst of filtered white noise - impacts, ticks, whooshes. `o`: { dur,
// filter, cut, cutEnd, vol, at, bus }.
function Noise(o) {
	const c = getAC()
	if (!c) return
	const t0 = o.at == null ? c.currentTime : o.at
	const dur = o.dur || 0.2
	const n = (c.sampleRate * dur) | 0
	const buf = c.createBuffer(1, n, c.sampleRate)
	const ch = buf.getChannelData(0)
	for (let i = 0; i < n; i++) ch[i] = Mr() * 2 - 1
	const src = c.createBufferSource()
	src.buffer = buf

	const filt = c.createBiquadFilter()
	filt.type = o.filter || 'lowpass'
	filt.frequency.setValueAtTime(o.cut || 1200, t0)
	if (o.cutEnd) filt.frequency.exponentialRampToValueAtTime(o.cutEnd, t0 + dur)

	const g = c.createGain()
	const vol = o.vol == null ? 0.25 : o.vol
	g.gain.setValueAtTime(vol, t0)
	g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

	src.connect(filt)
	filt.connect(g)
	g.connect(o.bus || _master)
	src.start(t0)
	src.stop(t0 + dur + 0.02)
}

// ---- SFX presets ----

const Sfx = {
	click() { Tone({ type: 'square', freq: 520, freqEnd: 680, decay: 0.05, release: 0.03, vol: 0.12 }) },
	build() { Tone({ type: 'sawtooth', freq: 170, freqEnd: 340, attack: 0.01, decay: 0.18, release: 0.12, vol: 0.16 }) },
	hit() { Noise({ dur: 0.12, cut: 2200, cutEnd: 400, vol: 0.22 }) },
	explosion() {
		Noise({ dur: 0.5, cut: 1500, cutEnd: 80, vol: 0.3 })
		Tone({ type: 'triangle', freq: 130, freqEnd: 42, decay: 0.4, release: 0.22, vol: 0.22 })
	},
	jump() { Tone({ type: 'sawtooth', freq: 110, freqEnd: 900, attack: 0.02, decay: 0.5, release: 0.35, vol: 0.2 }) },
	hyperjump() {
		Tone({ type: 'sawtooth', freq: 70, freqEnd: 1300, attack: 0.05, decay: 1.3, release: 0.7, vol: 0.22 })
		Noise({ dur: 1.5, filter: 'bandpass', cut: 300, cutEnd: 3200, vol: 0.12 })
	},
	death() {
		Tone({ type: 'sawtooth', freq: 320, freqEnd: 40, decay: 1.1, release: 0.7, vol: 0.3 })
		Noise({ dur: 1.1, cut: 900, cutEnd: 60, vol: 0.28 })
	}
}

// weapon fire, keyed by damage kind (see FIRE_COLORS in modules.js)
const SHOOT_SFX = {
	kinetic() { Tone({ type: 'square', freq: 440, freqEnd: 120, decay: 0.09, release: 0.04, vol: 0.1 }) },
	plasma() { Tone({ type: 'sawtooth', freq: 720, freqEnd: 240, decay: 0.14, release: 0.08, vol: 0.1 }) },
	rocket() { Noise({ dur: 0.3, filter: 'bandpass', cut: 900, cutEnd: 200, vol: 0.12 }) }
}
function SfxShoot(kind) {
	const f = SHOOT_SFX[kind]
	if (f) f()
}

// ---- ambient music: slow ticking suspense ----
//
// A 16-step loop at a crawl. Two detuned low drones run continuously; the loop
// only sprinkles ticks (filtered-noise blips), a downbeat sine thud, and sparse
// minor-key notes with a long tail. Scheduled ~0.25s ahead on a 60ms pump so it
// stays steady without a per-sample callback.
const MUS_BPM = 60
const MUS_STEPS = 16
const MUS_TICK = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1]   // hi-tick pattern
const MUS_NOTE = [0, -1, -1, -1, 7, -1, -1, -1, -1, -1, 3, -1, -1, -1, 10, -1] // semitones over the root, -1 = rest
const MUS_ROOT = 110 // A2

var _musicOn = false
var _musTimer = 0
var _musStep = 0
var _musNext = 0
var _drones = null

function mkDrone(freq) {
	const c = _ac
	const osc = c.createOscillator()
	osc.type = 'sawtooth'
	osc.frequency.value = freq
	const lp = c.createBiquadFilter()
	lp.type = 'lowpass'
	lp.frequency.value = 280
	const g = c.createGain()
	g.gain.setValueAtTime(0.0001, c.currentTime)
	g.gain.linearRampToValueAtTime(0.05, c.currentTime + 2.5)
	// very slow gain wobble so the pad "breathes"
	const lfo = c.createOscillator()
	lfo.frequency.value = 0.06
	const lg = c.createGain()
	lg.gain.value = 0.02
	lfo.connect(lg)
	lg.connect(g.gain)
	osc.connect(lp)
	lp.connect(g)
	g.connect(_musicBus)
	osc.start()
	lfo.start()
	return { osc, lfo, g }
}

function musStep(step, when) {
	if (MUS_TICK[step]) Noise({ dur: 0.05, filter: 'bandpass', cut: 4200, vol: 0.05, at: when, bus: _musicBus })
	const s = MUS_NOTE[step]
	if (s >= 0) {
		Tone({
			type: 'triangle', freq: MUS_ROOT * Math.pow(2, s / 12),
			attack: 0.02, decay: 0.12, sustain: 0.15, sustainLevel: 0.5, release: 1.1,
			vol: 0.05, at: when, bus: _musicBus
		})
	}
	if (step === 0) Tone({ type: 'sine', freq: 44, decay: 0.5, release: 0.5, vol: 0.12, at: when, bus: _musicBus })
}

function musPump() {
	const c = getAC()
	if (!c || !_musicOn || c.state !== 'running') return
	if (!_musNext) {
		_musNext = c.currentTime + 0.1
		_drones = [mkDrone(MUS_ROOT / 2), mkDrone(MUS_ROOT / 2 + 0.4)]
	}
	const dt = 60 / MUS_BPM / 4 // sixteenth-note step
	while (_musNext < c.currentTime + 0.25) {
		musStep(_musStep % MUS_STEPS, _musNext)
		_musStep++
		_musNext += dt
	}
}

function MusicStart() {
	if (_musicOn) return
	getAC()
	_musicOn = true
	_musStep = 0
	_musNext = 0 // set on the first running pump (may be suspended right now)
	_musTimer = setInterval(musPump, 60)
}

function MusicStop() {
	_musicOn = false
	clearInterval(_musTimer)
	if (_drones && _ac) {
		const n = _ac.currentTime
		for (const d of _drones) {
			d.g.gain.cancelScheduledValues(n)
			d.g.gain.linearRampToValueAtTime(0.0001, n + 0.7)
			d.osc.stop(n + 0.8)
			d.lfo.stop(n + 0.8)
		}
	}
	_drones = null
}
