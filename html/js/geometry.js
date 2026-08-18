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
