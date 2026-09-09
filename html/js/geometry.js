// Pure mesh-data generators - no GL calls, no globals. Each returns
// { positions, normals, indices } for a unit-sized mesh centered at the
// origin; objects.js scales it via position+radius when uploading/drawing.
// See docs/architecture.md.

// ---- mesh builder ----
//
// Collect quads (4 points), optionally through a transform matrix (xf), then
// build() emits { positions, normals, indices }: faces in add order
// (0,1,2)+(0,2,3), one FLAT normal per quad from its own two edges. Every
// cube-ish mesh below goes through this - one place for the boilerplate, one
// copy of the cube face table.
function MeshGen() {
	// one entry per quad: [p0, p1, p2, p3], each pN a live [x,y,z] (kept as
	// points, not flattened - build() only reads them, and the shared cube
	// tables are never mutated).
	const quads = []
	let mat = 0
	const g = {
		xf(m) { mat = m; return g },
		quad(a, b, c, d) {
			quads.push([a, b, c, d].map(p => mat ? Mat4MulPoint(mat, p) : p))
			return g
		},
		// decode a mesh string (see docs/meshformat.md): 3 chars = a point,
		// 4 points = a quad. Added through the current transform like any quad.
		str(s) {
			for (let i = 0; i < s.length; i += 12) g.quad(
				[decP(s, i), decP(s, i + 1), decP(s, i + 2)],
				[decP(s, i + 3), decP(s, i + 4), decP(s, i + 5)],
				[decP(s, i + 6), decP(s, i + 7), decP(s, i + 8)],
				[decP(s, i + 9), decP(s, i + 10), decP(s, i + 11)])
			return g
		},
		build() {
			const positions = [], normals = [], indices = []
			for (let q = 0; q < quads.length; q++) {
				const [p0, p1, p2, p3] = quads[q]
				const n = NormV3(CrossV3(SubV3(p1, p0), SubV3(p2, p0)))
				const base = q * 4
				for (const p of [p0, p1, p2, p3]) {
					positions.push(p[0], p[1], p[2])
					normals.push(n[0], n[1], n[2])
				}
				indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
			}
			return { positions, normals, indices }
		}
	}
	return g
}

// signed coord in -1..1 for char i of a mesh string (MeshCharVal is below).
function decP(s, i) { return (MeshCharVal(s, i) - 46) / 46 }

// One unit cube: 6 quads, each wound CCW seen from outside, corners at +-0.5.
// The single source of truth for "a cube" - GenCubeMesh and GenRingOfCubes
// both stamp this through MeshGen.
//
// Tried naming the 8 corners as shared consts and referencing them here: closure
// keeps the consts (doesn't inline) so the minified bundle shrinks ~18 B, but
// the zip grew +33 B - the 24 inline `[-.5,.5,.5]`-style literals are a regular
// table that deflate already crushes, and `[ib,hb,Za,eb]` refs are higher
// entropy. Left inline. See docs/optimization.md.
// Not used
const CUBE_QUADS = [
	[[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]],     // +Y
	[[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]], // -Y
	[[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]],     // +Z
	[[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]], // -Z
	[[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]],     // +X
	[[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]]  // -X
]
// function addCube(g) {
// 	for (const q of CUBE_QUADS) g.quad(q[0], q[1], q[2], q[3])
// }

function GenSphereMesh(latBands = 12, lonBands = 16) {
	const positions = []
	const normals = []
	const indices = []
	for (let lat = 0; lat <= latBands; lat++) {
		const theta = lat * PI / latBands
		const st = Ms(theta), ct = Mc(theta)
		for (let lon = 0; lon <= lonBands; lon++) {
			const phi = lon * 2 * PI / lonBands
			const sp = Ms(phi), cp = Mc(phi)
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
	return { positions, normals, indices }
}

// Unit cube, ±0.5 corners, 24 verts (flat per-face normals). Same output as
// before; the face table now lives in CUBE_QUADS.
function GenCubeMesh() {
	const g = MeshGen()
	//addCube(g)
	g.str(CUBE_MESH)
	return g.build()
}

// Flat annulus in the XZ plane, unit outer radius, used as an orbit line -
// objects.js scales it by the orbit's actual radius, same as a sphere is
// scaled by its radius. Only drawn from above/the side within roughly a
// hemisphere (system_state's camera never dips below the ecliptic, see
// docs/camera.md), so a single CCW winding (normal +Y) is enough - no need
// to double it up for back-face visibility.
function GenRingMesh(segments = 40, thickness = 0.008) {
	const positions = []
	const normals = []
	const indices = []
	for (let i = 0; i <= segments; i++) {
		const a = i / segments * PI * 2
		const c = Mc(a), s = Ms(a)
		positions.push(c, 0, s, c * (1 - thickness), 0, s * (1 - thickness))
		normals.push(0, 1, 0, 0, 1, 0)
	}
	for (let i = 0; i < segments; i++) {
		const a = i * 2, b = a + 2
		indices.push(a, a + 1, b, a + 1, b + 1, b)
	}
	return { positions, normals, indices }
}

// `seg` little cubes (half-extent `size`) evenly on a circle of `radius` in the
// XY plane (so the ring faces down +Z, the hyperjump tunnel axis). Baked into
// one mesh - a whole ring is a single object/draw-call/colour (hyperjump_state
// moves and recolours rows of these).
function GenRingOfCubes(seg, radius, size) {
	const g = MeshGen()
	for (let i = 0; i < seg; i++) {
		const a = i * PI * 2 / seg
		g.xf(Mat4TranslateScale([Mc(a) * radius, Ms(a) * radius, 0], size * 2))
		g.str(CUBE_MESH)
		//addCube(g)
	}
	return g.build()
}

// ---- string-encoded meshes / data ----
//
// One JS string literal instead of an array of numbers: after minification a
// string is about as tight as it gets (no commas/brackets to strip). Instead
// of a fixed 64-char alphabet we quantize straight against the character code
// over the whole printable ASCII range - no lookup-table constant to carry.
//
// Usable codes: 0x20 ' ' .. 0x7E '~' (95), minus the two that need escaping
// in a single-quoted literal, 0x27 ' and 0x5C \ -> 93 contiguous LEVELS
// (index n = 0..92). Two `if`s bridge the gaps. 93 is odd, so the centre and
// the quarter mark are exact:
//   n=0   -> ' '   -> signed -1.0   / unsigned 0.0
//   n=46  -> 'O'   -> signed  0.0   / unsigned 0.5
//   n=69  -> 'g'   -> signed +0.5   / unsigned 0.75
//   n=92  -> '~'   -> signed +1.0   / unsigned 1.0
//   full row: (space)!"#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~
//
// MeshCharVal(str, i) -> n for char i of str. Signed coord = (n-46)/46 ;
// unsigned = n/92. (Always called on a string char, so it takes the index -
// no bare charCodeAt at the call sites.)
// MeshEncChar(n) -> the char (offline tooling; closure drops it as dead code).
function MeshCharVal(s, i) {
	const code = s.charCodeAt(i)
	let n = code - 32
	if (code > 0x27) n--
	if (code > 0x5C) n--
	return n
}

function MeshEncChar(n) {
	n = Mmax(0, Mmin(92, Math.round(n)))
	let c = n + 32
	if (c >= 0x27) c++
	if (c >= 0x5C) c++
	return String.fromCharCode(c)
}

// 3 chars = 1 point (X,Y,Z), 4 points = 1 quad, CCW from outside - see
// docs/meshformat.md. Just feeds the string to MeshGen (flat per-face normals).
function DecodeMeshString(s) {
	return MeshGen().str(s).build()
}

// One unit cube (±1 corners), regenerated offline with MeshEncChar from the
// same corner order as CUBE_QUADS - see docs/meshformat.md.
const CUBE_MESH = ' ~~~~~~~  ~    ~  ~ ~  ~  ~~ ~~~~ ~~~      ~ ~~ ~ ~~  ~~ ~~~     ~ ~~ ~ '

// function GenEncodedCubeMesh() {
// 	return DecodeMeshString(CUBE_MESH)
// }
