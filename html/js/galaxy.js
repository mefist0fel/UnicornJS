// Galaxy content: a 5x5 grid of stars with random per-cell jitter,
// generated exactly once (from menu_state, on Play) and cached forever -
// the star objects are created once here and only added/removed from
// ctx.objects by galaxy_state, never rebuilt. See docs/architecture.md.

const GALAXY_GRID = 5
const GALAXY_SPACING = 6
const GALAXY_JITTER = 2
const GALAXY_JUMP_RADIUS = GALAXY_SPACING * 1.8
const GALAXY_JUMP_FUEL_COST = 2
const STAR_COLORS = [[1, 0.95, 0.6], [0.6, 0.8, 1], [1, 0.8, 0.5], [0.9, 0.95, 1]]

var galaxyStars = null // [{ x, z, object }], null until GenerateGalaxy() runs
var currentStarIndex = 0
var selectedStarIndex = -1
var currentMarker = null
var selectedMarker = null

function GenerateGalaxy(ctx) {
	galaxyStars = []
	const half = (GALAXY_GRID - 1) / 2
	for (let gz = 0; gz < GALAXY_GRID; gz++) {
		for (let gx = 0; gx < GALAXY_GRID; gx++) {
			const x = (gx - half) * GALAXY_SPACING + (Math.random() * 2 - 1) * GALAXY_JITTER
			const z = (gz - half) * GALAXY_SPACING + (Math.random() * 2 - 1) * GALAXY_JITTER
			const color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]
			galaxyStars.push({ x, z, object: CreateSphereObject(ctx.gl, V3(x, 0, z), 0.6, color) })
		}
	}
	currentStarIndex = Math.floor(Math.random() * galaxyStars.length)
	selectedStarIndex = -1
	currentMarker = CreateCubeObject(ctx.gl, V3(0, 0, 0), 0.4, [1, 0.2, 0.2])
	selectedMarker = CreateCubeObject(ctx.gl, V3(0, 0, 0), 0.4, [0.2, 1, 0.3])
}

function StarDist(a, b) {
	return LenV3(SubV3(V3(a.x, 0, a.z), V3(b.x, 0, b.z)))
}

function UpdateGalaxyMarkers() {
	const cur = galaxyStars[currentStarIndex]
	currentMarker.position = V3(cur.x, 1.4, cur.z)
	if (selectedStarIndex >= 0) {
		const sel = galaxyStars[selectedStarIndex]
		selectedMarker.position = V3(sel.x, 1.4, sel.z)
	}
}
