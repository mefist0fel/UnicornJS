// First file in the concat order (see html/index.html) - foundational aliases,
// constants and module-scope globals every later file can lean on. Declaring a
// `let` here (even before it holds a real value) puts it in scope for all the
// scripts concatenated after this one; whoever owns it assigns it at startup.
// See docs/architecture.md.

// ---- Math aliases ----
// These tokens repeat hundreds of times; closure mangles the short globals to
// 1 char. (Math.random/sin/cos/... don't need `this`, so a bare alias is safe.)
const Mr = Math.random
const Ms = Math.sin
const Mc = Math.cos
const Ma = Math.abs
const Mfl = Math.floor
const Mmin = Math.min
const Mmax = Math.max
const Msqrt = Math.sqrt
const Matan2 = Math.atan2
const PI = Math.PI

// degrees -> radians (camera angles are authored in degrees), and a clamp used
// by every "keep this in range" check (camera limits, 0..1 zoom, pan box).
const DEG = PI / 180
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v }

// ---- WebGL 1 enum values ----
// Fixed by the Khronos spec - identical in every implementation - so hardcode
// them: `gl.ARRAY_BUFFER` is a 16-char property lookup closure can't rename
// (it's in the DOM externs), but these numeric consts get inlined and the
// number repeats gzip to almost nothing. Names kept here for reference.
const GL_DEPTH_TEST = 2929
const GL_CULL_FACE = 2884
const GL_COLOR_BUFFER_BIT = 16384
const GL_DEPTH_BUFFER_BIT = 256
const GL_ARRAY_BUFFER = 34962
const GL_ELEMENT_ARRAY_BUFFER = 34963
const GL_STATIC_DRAW = 35044
const GL_FLOAT = 5126
const GL_TRIANGLES = 4
const GL_UNSIGNED_BYTE = 5121
const GL_UNSIGNED_SHORT = 5123
const GL_TEXTURE_2D = 3553
const GL_RGBA = 6408
const GL_TEXTURE_WRAP_S = 10242
const GL_TEXTURE_WRAP_T = 10243
const GL_TEXTURE_MIN_FILTER = 10241
const GL_TEXTURE_MAG_FILTER = 10240
const GL_LINEAR = 9729
const GL_CLAMP_TO_EDGE = 33071
const GL_REPEAT = 10497
const GL_VERTEX_SHADER = 35633
const GL_FRAGMENT_SHADER = 35632
const GL_TEXTURE0 = 33984
const GL_TEXTURE1 = 33985

// ---- wrappers ----
// `new Float32Array(` is 17 chars closure keeps verbatim; wrap it (used ~9x).
function F32(a) { return new Float32Array(a) }

// ---- module-scope globals ----
// The WebGL context. Assigned once by InitGL (gl.js) at startup, then read
// directly everywhere instead of threading it through every factory's first
// argument. Undefined until InitGL runs - nothing touches it at load time.
let gl

let shortcuts = {
  // Bind texture shortcut
  tex: (texture, unit = 0) => gl.bindTexture(unit, texture),
  nb: (type, buf) => {
    const bufIdx = gl.createBuffer()
	gl.bindBuffer(type, bufIdx)
	gl.bufferData(type, buf, GL_STATIC_DRAW)
    return bufIdx;
  }
 };