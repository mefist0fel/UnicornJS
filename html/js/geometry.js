// Pure mesh-data generators - no GL calls, no globals. Each returns
// { positions, normals, indices } for a unit-sized mesh centered at the
// origin; objects.js scales it via position+radius when uploading/drawing.
// See docs/architecture.md.

function GenSphereMesh(latBands = 12, lonBands = 16) {
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
	return { positions, normals, indices }
}

// 24 verts (4 per face) so each face gets a flat, non-interpolated normal.
function GenCubeMesh() {
	const faces = [
		[[0, 1, 0], [-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1]],   // +Y
		[[0, -1, 0], [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1]], // -Y
		[[0, 0, 1], [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]],    // +Z
		[[0, 0, -1], [1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1]], // -Z
		[[1, 0, 0], [1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1]],    // +X
		[[-1, 0, 0], [-1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1]] // -X
	]
	const positions = []
	const normals = []
	const indices = []
	for (let f = 0; f < faces.length; f++) {
		const [n, verts] = faces[f]
		const base = positions.length / 3
		for (let v = 0; v < 4; v++) {
			positions.push(verts[v * 3] * 0.5, verts[v * 3 + 1] * 0.5, verts[v * 3 + 2] * 0.5)
			normals.push(n[0], n[1], n[2])
		}
		indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
	}
	return { positions, normals, indices }
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
		const a = i / segments * Math.PI * 2
		const c = Math.cos(a), s = Math.sin(a)
		positions.push(c, 0, s, c * (1 - thickness), 0, s * (1 - thickness))
		normals.push(0, 1, 0, 0, 1, 0)
	}
	for (let i = 0; i < segments; i++) {
		const a = i * 2, b = a + 2
		indices.push(a, a + 1, b, a + 1, b + 1, b)
	}
	return { positions, normals, indices }
}

// `seg` little cubes evenly on a circle of `radius` in the XY plane (so the
// ring faces down +Z, the hyperjump tunnel axis). Baked into one mesh - a
// whole ring is a single object/draw-call/colour (hyperjump_state moves and
// recolours rows of these). Cube corners at +-size.
function GenRingOfCubes(seg, radius, size) {
	const positions = []
	const normals = []
	const indices = []
	// unit cube corners, CCW per face as seen from outside (same winding as GenCubeMesh)
	const faces = [
		[[0, 0, 1], [-1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]],
		[[0, 0, -1], [1, -1, -1, -1, -1, -1, -1, 1, -1, 1, 1, -1]],
		[[1, 0, 0], [1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1, 1]],
		[[-1, 0, 0], [-1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1]],
		[[0, 1, 0], [-1, 1, 1, 1, 1, 1, 1, 1, -1, -1, 1, -1]],
		[[0, -1, 0], [-1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1]]
	]
	for (let i = 0; i < seg; i++) {
		const a = i * Math.PI * 2 / seg
		const cx = Math.cos(a) * radius, cy = Math.sin(a) * radius
		for (let f = 0; f < 6; f++) {
			const n = faces[f][0], v = faces[f][1]
			const base = positions.length / 3
			for (let k = 0; k < 4; k++) {
				positions.push(cx + v[k * 3] * size, cy + v[k * 3 + 1] * size, v[k * 3 + 2] * size)
				normals.push(n[0], n[1], n[2])
			}
			indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
		}
	}
	return { positions, normals, indices }
}

// ---- string-encoded meshes ----
//
// A mesh can be written as one short JS string literal instead of an array
// of numbers - a string literal is already about as small as it can get
// after minification (no commas/brackets to strip), so this is a way to
// keep hand-authored meshes cheap in the zip without hand-writing a base64
// encoder/decoder pair for a whole binary format.
//
// Alphabet: standard base64 (A-Z a-z 0-9 + /), 64 characters. We could fit
// more - printable ASCII is 0x20 ' ' .. 0x7E '~' (95 chars), and inside a
// single-quoted JS string literal only 2 of those need escaping (' and \),
// leaving 93 usable - but we only need 64 distinct values (6 bits) per
// number, and base64 is a well-known alphabet, so there's no reason to
// invent a wider one.
//
// Each character = one coordinate, quantized to 64 signed levels:
//   charIndex (0..63) -> level = charIndex - 32 (-32..31, a signed 6-bit int)
//   level -> coordinate = level / 32  (-1.0 .. 0.96875)
// Note +1.0 itself is not representable (only +31/32 = 0.96875 is) - that's
// the usual asymmetry of signed quantization (like an int8 being -128..127,
// not -128..128), fine for draft-quality geometry.
//
// 3 characters = 1 point (X, Y, Z). 4 points (12 characters) = 1 quad face,
// triangulated as (0,1,2)+(0,2,3) - so the 4 points of a face must already
// be wound CCW as seen from outside the mesh, same as a hand-written
// GenCubeMesh() face. Normals are NOT stored (would cost another 12 chars
// per face for no visual gain at this scale) - they're computed here, once
// per face, from the quad's own two edges, exactly like the flat shading
// GenCubeMesh() does by hand.
//
// Example - a unit cube's +Z face has corners (going CCW when viewed from
// +Z, i.e. from outside): (-1,-1,1) (1,-1,1) (1,1,1) (-1,1,1). Quantized:
// -1 -> level -32 -> char 'A' (index 0); 1 -> level 31 -> char '/' (index
// 63). So that one face alone would encode as 'AA/' + '/A/' + '//' + 'A/'
// ... (X Y Z per point, 3 points shown) - see CUBE_MESH below for the full
// 6-face (24-point, 72-char) string, generated the same way offline.
const MESH_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function DecodeMeshString(s) {
	const positions = []
	const normals = []
	const indices = []
	const points = []
	for (let i = 0; i < s.length; i += 3) {
		points.push([
			(MESH_ALPHABET.indexOf(s[i]) - 32) / 32,
			(MESH_ALPHABET.indexOf(s[i + 1]) - 32) / 32,
			(MESH_ALPHABET.indexOf(s[i + 2]) - 32) / 32
		])
	}
	for (let q = 0; q < points.length; q += 4) {
		const [p0, p1, p2, p3] = [points[q], points[q + 1], points[q + 2], points[q + 3]]
		const n = NormV3(CrossV3(SubV3(p1, p0), SubV3(p2, p0)))
		const base = positions.length / 3
		for (const p of [p0, p1, p2, p3]) {
			positions.push(p[0], p[1], p[2])
			normals.push(n[0], n[1], n[2])
		}
		indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
	}
	return { positions, normals, indices }
}

// Reverse direction: a flat list of [x,y,z] points (each in -1..1) back
// into a MESH_ALPHABET string, for regenerating a CUBE_MESH-style constant
// offline (e.g. from a small modelling script) rather than by hand.
function EncodeMeshPoints(points) {
	let s = ''
	for (const p of points) {
		for (const v of p) {
			let level = Math.round(v * 32)
			if (level < -32) level = -32
			if (level > 31) level = 31
			s += MESH_ALPHABET[level + 32]
		}
	}
	return s
}

// One unit cube (6 faces x 4 verts), generated offline with EncodeMeshPoints
// from the same corner coordinates as GenCubeMesh() - see docs/meshformat.md.
const CUBE_MESH = 'A///////AA/AAAA/AA/A/AA/AA//A////A///AAAAAA/A//A/A//AA//A///AAAAA/A//A/A'

function GenEncodedCubeMesh() {
	return DecodeMeshString(CUBE_MESH)
}
