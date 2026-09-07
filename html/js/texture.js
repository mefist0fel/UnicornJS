// Procedural textures from code - the same spirit as the string-encoded
// meshes (geometry.js): nothing is shipped as an image, everything is built
// at load. Two things live here:
//   * one shared tileable value-noise texture (GenNoiseTexture) - the input
//     to the planet shader's triplanar sampling;
//   * gradient ramps (GenRampTexture / GetRamp) - an Nx1 strip of colour the
//     planet shader indexes by the blended noise value ("height -> colour").
// See docs/texture.md.

// Wraps the raw bytes in a GL texture. `repeat` needs power-of-two w/h
// (the noise texture); ramps are Nx1 and use CLAMP.
function MakeTexture(gl, w, h, data, repeat) {
	const tex = gl.createTexture()
	gl.bindTexture(gl.TEXTURE_2D, tex)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
	const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
	return tex
}

// Classic multi-octave value noise: a coarse grid of random values per
// octave, cosine-interpolated between grid points, octaves at frequency
// 4, 8, 16 with halving amplitude, summed and remapped to 0..1. Grid
// indices wrap (`% freq`) so the result tiles seamlessly - the triplanar
// sampler reads it with gl.REPEAT. `size` must be power-of-two. Stopping at
// freq 16 (no 1/32 octave) keeps surfaces readable rather than sandpapery.
function GenNoiseTexture(gl, size = 64) {
	const acc = new Float32Array(size * size)
	let amp = 1
	for (let freq = 4; freq <= size / 4; freq *= 2) {
		const g = new Float32Array(freq * freq)
		for (let i = 0; i < g.length; i++) g[i] = Math.random() * 2 - 1
		for (let y = 0; y < size; y++) {
			const fy = y / size * freq
			const iy = Math.floor(fy)
			const sy = (1 - Math.cos((fy - iy) * Math.PI)) / 2
			for (let x = 0; x < size; x++) {
				const fx = x / size * freq
				const ix = Math.floor(fx)
				const sx = (1 - Math.cos((fx - ix) * Math.PI)) / 2
				const x0 = ix % freq, x1 = (ix + 1) % freq
				const y0 = (iy % freq) * freq, y1 = ((iy + 1) % freq) * freq
				const top = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * sx
				const bot = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * sx
				acc[y * size + x] += (top + (bot - top) * sy) * amp
			}
		}
		amp *= 0.5
	}
	let lo = Infinity, hi = -Infinity
	for (let i = 0; i < acc.length; i++) { if (acc[i] < lo) lo = acc[i]; if (acc[i] > hi) hi = acc[i] }
	const span = hi - lo || 1
	const data = new Uint8Array(size * size * 4)
	for (let i = 0; i < acc.length; i++) {
		const v = ((acc[i] - lo) / span) * 255
		data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v
		data[i * 4 + 3] = 255
	}
	return MakeTexture(gl, size, size, data, true)
}

// A ramp string is groups of 3 chars, each group one RGB keyframe in the
// MESH_ALPHABET quantisation (geometry.js): charIndex / 63 -> 0..1 per
// channel. Keyframes spread evenly over 0..1, linearly interpolated into a
// width x 1 RGBA strip.
function GenRampTexture(gl, str, width = 64) {
	const kf = []
	for (let i = 0; i + 2 < str.length; i += 3) {
		kf.push([
			MESH_ALPHABET.indexOf(str[i]) / 63,
			MESH_ALPHABET.indexOf(str[i + 1]) / 63,
			MESH_ALPHABET.indexOf(str[i + 2]) / 63
		])
	}
	const data = new Uint8Array(width * 4)
	for (let x = 0; x < width; x++) {
		const t = x / (width - 1) * (kf.length - 1)
		const i = Math.min(kf.length - 2, Math.floor(t))
		const f = t - i
		const a = kf[i], b = kf[i + 1] || a
		data[x * 4] = (a[0] + (b[0] - a[0]) * f) * 255
		data[x * 4 + 1] = (a[1] + (b[1] - a[1]) * f) * 255
		data[x * 4 + 2] = (a[2] + (b[2] - a[2]) * f) * 255
		data[x * 4 + 3] = 255
	}
	return MakeTexture(gl, width, 1, data, false)
}

// N bodies of the same archetype share one ramp texture.
var rampCache = {}
function GetRamp(gl, str) {
	return rampCache[str] || (rampCache[str] = GenRampTexture(gl, str))
}
