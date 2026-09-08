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
	gl.bindTexture(GL_TEXTURE_2D, tex)
	gl.texImage2D(GL_TEXTURE_2D, 0, GL_RGBA, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, data)
	const wrap = repeat ? GL_REPEAT : GL_CLAMP_TO_EDGE
	gl.texParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, wrap)
	gl.texParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, wrap)
	gl.texParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR)
	gl.texParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR)
	return tex
}

// Classic multi-octave value noise: a coarse grid of random values per
// octave, cosine-interpolated between grid points, octaves at frequency
// 4, 8, 16 with halving amplitude, summed and remapped to 0..1. Grid
// indices wrap (`% freq`) so the result tiles seamlessly - the triplanar
// sampler reads it with GL_REPEAT. `size` must be power-of-two. Stopping at
// freq 16 (no 1/32 octave) keeps surfaces readable rather than sandpapery.
function GenNoiseTexture(gl, size = 64) {
	const acc = F32(size * size)
	let amp = 1
	for (let freq = 4; freq <= size / 4; freq *= 2) {
		const g = F32(freq * freq)
		for (let i = 0; i < g.length; i++) g[i] = Mr() * 2 - 1
		for (let y = 0; y < size; y++) {
			const fy = y / size * freq
			const iy = Mfl(fy)
			const sy = (1 - Mc((fy - iy) * PI)) / 2
			for (let x = 0; x < size; x++) {
				const fx = x / size * freq
				const ix = Mfl(fx)
				const sx = (1 - Mc((fx - ix) * PI)) / 2
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
// mesh quantisation (geometry.js): MeshCharVal(code) / 92 -> 0..1 per
// channel. Keyframes spread evenly over 0..1, linearly interpolated into a
// width x 1 RGBA strip.
function GenRampTexture(gl, str, width = 64) {
	const kf = []
	for (let i = 0; i + 2 < str.length; i += 3) {
		kf.push([
			MeshCharVal(str.charCodeAt(i)) / 92,
			MeshCharVal(str.charCodeAt(i + 1)) / 92,
			MeshCharVal(str.charCodeAt(i + 2)) / 92
		])
	}
	const data = new Uint8Array(width * 4)
	for (let x = 0; x < width; x++) {
		const t = x / (width - 1) * (kf.length - 1)
		const i = Mmin(kf.length - 2, Mfl(t))
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
