// Galaxy content: a 5x5 grid of stars with random per-cell jitter,
// generated exactly once (from menu_state, on Play) and cached forever -
// the star objects are created once here and only added/removed from
// ctx.objects by galaxy_state, never rebuilt. See docs/architecture.md.
//
// STAR_ARCHETYPES is shared with system.js (which loads after this file, see
// html/index.html) - every star, whether a galaxy-map dot or a system's own
// sun, is drawn from the same "canon" spectral sequence: red dwarf < orange
// < yellow < white < blue, each bigger than the last. Stars use the planet
// triplanar shader (CreatePlanetObject, objects.js) with emissive 1 and an
// emissive ramp; `drift` gives the surface a slow churn. See docs/texture.md.
const STAR_ARCHETYPES = [
	{ ramp: 'RECsLG5bL', planeScale: [3, 3, 3], drift: [0.03, 0.04, 0.01], radius: 0.8 },   // red dwarf
	{ ramp: 'vRG7jL/0b', planeScale: [3, 3, 3], drift: [0.03, 0.03, 0.02], radius: 1.05 },  // orange
	{ ramp: '5eK/0W/9x///', planeScale: [2.5, 4, 2.5], drift: [0.02, 0.03, 0.01], radius: 1.3 }, // yellow (Sol)
	{ ramp: '76z//////', planeScale: [3, 3, 3], drift: [0.04, 0.04, 0.02], radius: 1.55 },  // white
	{ ramp: 'es/v1/9+/', planeScale: [3, 3, 3], drift: [0.04, 0.05, 0.02], radius: 1.85 }   // blue-white
]

const GALAXY_GRID = 5
const GALAXY_SPACING = 6
const GALAXY_JITTER = 2
const GALAXY_JUMP_RADIUS = GALAXY_SPACING * 1.8
const GALAXY_JUMP_FUEL_COST = 2
const GALAXY_STAR_BASE_RADIUS = 0.45
const GALAXY_MARKER_COUNT = 6
const GALAXY_MARKER_SIZE = 0.22
const GALAXY_MARKER_SPEED = 0.8

var galaxyStars = null // [{ x, z, type, object }], null until GenerateGalaxy() runs
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
			const type = STAR_ARCHETYPES[Math.floor(Math.random() * STAR_ARCHETYPES.length)]
			const radius = GALAXY_STAR_BASE_RADIUS * type.radius
			const off = V3(Math.random() * 7, Math.random() * 7, Math.random() * 7)
			const object = CreatePlanetObject(ctx.gl, V3(x, 0, z), radius, GetRamp(ctx.gl, type.ramp), type.planeScale, off, type.drift, 1)
			object.radius += 0.35 // pick-only padding, see system.js's identical hack
			galaxyStars.push({ x, z, type, object })
		}
	}
	currentStarIndex = Math.floor(Math.random() * galaxyStars.length)
	selectedStarIndex = -1
	currentMarker = CreateOrbitMarkers(ctx.gl, GALAXY_MARKER_COUNT, GALAXY_MARKER_SIZE, [1, 0.2, 0.2])
	selectedMarker = CreateOrbitMarkers(ctx.gl, GALAXY_MARKER_COUNT, GALAXY_MARKER_SIZE, [0.2, 1, 0.3])
}

function StarDist(a, b) {
	return LenV3(SubV3(V3(a.x, 0, a.z), V3(b.x, 0, b.z)))
}

// angle drives the markers' continuous rotation - callers pass an
// ever-increasing value (see galaxy_state's OnUpdate), not a per-star phase.
function UpdateGalaxyMarkers(angle) {
	const cur = galaxyStars[currentStarIndex]
	currentMarker.update(V3(cur.x, 0.3, cur.z), cur.object.radius * 1.9, angle)
	if (selectedStarIndex >= 0) {
		const sel = galaxyStars[selectedStarIndex]
		selectedMarker.update(V3(sel.x, 0.3, sel.z), sel.object.radius * 1.9, angle + Math.PI)
	}
}
