// WebGL bootstrap, vec3/mat4 math, generic mesh upload. `gl`, the Math aliases
// and the GL_* enum consts live in include.js (loaded first). Mesh generation
// lives in geometry.js. See docs/architecture.md.

// Sets the module-scope `gl` (include.js). Everything else just reads it.
function InitGL(canvas) {
	gl = canvas.getContext('webgl', { antialias: true })
	gl.enable(GL_DEPTH_TEST)
	gl.enable(GL_CULL_FACE)
	gl.clearColor(0.03, 0.02, 0.07, 1)
}

function CompileShader(type, src) {
	const sh = gl.createShader(type)
	gl.shaderSource(sh, src)
	gl.compileShader(sh)
	return sh
}

function CreateProgram(vsSrc, fsSrc) {
	const prog = gl.createProgram()
	gl.attachShader(prog, CompileShader(GL_VERTEX_SHADER, vsSrc))
	gl.attachShader(prog, CompileShader(GL_FRAGMENT_SHADER, fsSrc))
	gl.linkProgram(prog)
	return prog
}

// Uploads a { positions, normals, indices } mesh (see geometry.js) into GL
// buffers. Each object gets its own buffers - meshes are not shared/instanced.

// function UploadMesh(mesh) {
// 	const posBuf = gl.cb()
// 	shortcuts.bb(GL_ARRAY_BUFFER, posBuf)
// 	shortcuts.bd(GL_ARRAY_BUFFER, F32(mesh.positions), GL_STATIC_DRAW)

// 	const normBuf = gl.cb()
// 	shortcuts.bb(GL_ARRAY_BUFFER, normBuf)
// 	shortcuts.bd(GL_ARRAY_BUFFER, F32(mesh.normals), GL_STATIC_DRAW)

// 	const idxBuf = gl.cb()
// 	shortcuts.bb(GL_ELEMENT_ARRAY_BUFFER, idxBuf)
// 	shortcuts.bd(GL_ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), GL_STATIC_DRAW)

// 	return { posBuf, normBuf, idxBuf, count: mesh.indices.length }
// }

// Optimized upload mesh version
function UploadMesh(mesh) {
	const posBuf = shortcuts.nb(GL_ARRAY_BUFFER, F32(mesh.positions))

	const normBuf = shortcuts.nb(GL_ARRAY_BUFFER, F32(mesh.normals))

	const idxBuf = shortcuts.nb(GL_ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices))

	return { posBuf, normBuf, idxBuf, count: mesh.indices.length }
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
function LenV3(a) { return Msqrt(DotV3(a, a)) }
// Rotate a vec3 around +Y (up) by `ang` radians. RotY([0,0,-1], ang) points the
// local -z "nose" to (-sin ang, 0, -cos ang) - system_travel_state uses it to
// yaw the ship (and its spark axis) onto the heading.
function RotY(v, ang) {
	const s = Ms(ang), c = Mc(ang)
	return [v[0] * c + v[2] * s, v[1], v[2] * c - v[0] * s]
}

// Interpolate angle a -> b along the shortest arc (used for the travel-state
// camera swing, where theta can wrap past +-PI).
function LerpAngle(a, b, t) {
	let d = (b - a) % (PI * 2)
	if (d > PI) d -= PI * 2
	if (d < -PI) d += PI * 2
	return a + d * t
}
function NormV3(a) {
	const l = LenV3(a) || 1
	return [a[0] / l, a[1] / l, a[2] / l]
}

// ---- mat4, column-major (WebGL convention) ----
function Mat4Multiply(a, b) {
	const o = F32(16)
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
	return F32([
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
	return F32([
		x[0], y[0], z[0], 0,
		x[1], y[1], z[1], 0,
		x[2], y[2], z[2], 0,
		-DotV3(x, eye), -DotV3(y, eye), -DotV3(z, eye), 1
	])
}

// Rotation matrix from three orthonormal world-space axes (columns).
// Used by camera.js to expose its orientation as a real matrix, see docs/camera.md.
function Mat4FromBasis(right, up, back) {
	return F32([
		right[0], right[1], right[2], 0,
		up[0], up[1], up[2], 0,
		back[0], back[1], back[2], 0,
		0, 0, 0, 1
	])
}

// Transforms a direction (w=0, translation ignored) by a mat4.
function Mat4MulDir(m, v) {
	return [
		m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
		m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
		m[2] * v[0] + m[6] * v[1] + m[10] * v[2]
	]
}

// Objects never rotate, so a plain translate+scale model matrix is enough -
// no general TRS compose needed. `scale` is a number (uniform) in almost
// every call site; battle_state's laser beam is the one exception that
// needs a stretched box (long on X, thin on Y/Z) and passes a [sx,sy,sz]
// array instead - `.length` is enough to tell the two apart since numbers
// don't have one.
function Mat4TranslateScale(position, scale) {
	const sx = scale.length ? scale[0] : scale
	const sy = scale.length ? scale[1] : scale
	const sz = scale.length ? scale[2] : scale
	return F32([
		sx, 0, 0, 0,
		0, sy, 0, 0,
		0, 0, sz, 0,
		position[0], position[1], position[2], 1
	])
}
