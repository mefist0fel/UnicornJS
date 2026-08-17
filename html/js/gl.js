// WebGL bootstrap, vec3/mat4 math, shared sphere mesh.
// See docs/architecture.md - factory functions, flat globals, no classes.

function InitGL(canvas) {
	const gl = canvas.getContext('webgl', { antialias: true })
	gl.enable(gl.DEPTH_TEST)
	gl.enable(gl.CULL_FACE)
	gl.clearColor(0.03, 0.02, 0.07, 1)
	return gl
}

function CompileShader(gl, type, src) {
	const sh = gl.createShader(type)
	gl.shaderSource(sh, src)
	gl.compileShader(sh)
	return sh
}

function CreateProgram(gl, vsSrc, fsSrc) {
	const prog = gl.createProgram()
	gl.attachShader(prog, CompileShader(gl, gl.VERTEX_SHADER, vsSrc))
	gl.attachShader(prog, CompileShader(gl, gl.FRAGMENT_SHADER, fsSrc))
	gl.linkProgram(prog)
	return prog
}

// ---- vec3 ----
function V3(x = 0, y = 0, z = 0) { return [x, y, z] }
function AddV3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
function SubV3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] }
function ScaleV3(a, s) { return [a[0] * s, a[1] * s, a[2] * s] }
function CrossV3(a, b) {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0]
	]
}
function DotV3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }
function LenV3(a) { return Math.sqrt(DotV3(a, a)) }
function NormV3(a) {
	const l = LenV3(a) || 1
	return [a[0] / l, a[1] / l, a[2] / l]
}

// ---- mat4, column-major (WebGL convention) ----
function Mat4Multiply(a, b) {
	const o = new Float32Array(16)
	for (let c = 0; c < 4; c++) {
		for (let r = 0; r < 4; r++) {
			let sum = 0
			for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]
			o[c * 4 + r] = sum
		}
	}
	return o
}

function Mat4Perspective(fovy, aspect, near, far) {
	const f = 1 / Math.tan(fovy / 2)
	const nf = 1 / (near - far)
	return new Float32Array([
		f / aspect, 0, 0, 0,
		0, f, 0, 0,
		0, 0, (far + near) * nf, -1,
		0, 0, 2 * far * near * nf, 0
	])
}

// Camera always looks straight at target (honest orbit), see docs/camera.md.
function Mat4LookAt(eye, target, up) {
	const z = NormV3(SubV3(eye, target))
	const x = NormV3(CrossV3(up, z))
	const y = CrossV3(z, x)
	return new Float32Array([
		x[0], y[0], z[0], 0,
		x[1], y[1], z[1], 0,
		x[2], y[2], z[2], 0,
		-DotV3(x, eye), -DotV3(y, eye), -DotV3(z, eye), 1
	])
}

// Sphere entities never rotate, so a plain translate+uniform-scale model
// matrix is enough - no general TRS compose needed.
function Mat4Sphere(position, radius) {
	return new Float32Array([
		radius, 0, 0, 0,
		0, radius, 0, 0,
		0, 0, radius, 0,
		position[0], position[1], position[2], 1
	])
}

// One shared unit-sphere mesh, reused (different model matrix) for every entity.
function CreateSphereMesh(gl, latBands = 12, lonBands = 16) {
	const positions = []
	const normals = []
	const indices = []
	for (let lat = 0; lat <= latBands; lat++) {
		const theta = lat * Math.PI / latBands
		const st = Math.sin(theta), ct = Math.cos(theta)
		for (let lon = 0; lon <= lonBands; lon++) {
			const phi = lon * 2 * Math.PI / lonBands
			const sp = Math.sin(phi), cp = Math.cos(phi)
			const x = cp * st, y = ct, z = sp * st
			positions.push(x, y, z)
			normals.push(x, y, z)
		}
	}
	for (let lat = 0; lat < latBands; lat++) {
		for (let lon = 0; lon < lonBands; lon++) {
			const a = lat * (lonBands + 1) + lon
			const b = a + lonBands + 1
			indices.push(a, a + 1, b, b, a + 1, b + 1)
		}
	}

	const posBuf = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW)

	const normBuf = gl.createBuffer()
	gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW)

	const idxBuf = gl.createBuffer()
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW)

	return { posBuf, normBuf, idxBuf, count: indices.length }
}
