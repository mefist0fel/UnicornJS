// Solar-system content for a single star: generated once per star index,
// lazily on first visit, then cached forever in systemCache - both the
// data (enemyCleared flags must survive revisits) and the render objects
// themselves (no GL buffer churn on repeat visits). See docs/architecture.md.
//
// PLANET_ARCHETYPES: each planet is stamped from one of these "canon" kinds
// and rendered by the triplanar planet shader (objects.js, CreatePlanetObject)
// - `ramp` is a gradient string (texture.js), `planeScale` the per-axis
// triplanar sampling scale (isotropic for rock, Y-heavy for gas giants ->
// horizontal bands), `drift` a per-frame sample-offset velocity (0 for rock),
// `emissive` a lit<->self-lit blend (>0 for lava glow). `moonChance` is how
// likely that kind spawns one or two (gray, MOON_ARCH) moons. Stars reuse
// STAR_ARCHETYPES from galaxy.js - "stars are planets too", same shader with
// emissive 1.

const PLANET_ARCHETYPES = [
	{ ramp: 'CFOFOeLelxseRgOJUK679', planeScale: [1.7, 1.7, 1.7], drift: [0, 0, 0], emissive: 0, radiusMul: 1, moonChance: 0.4 },       // terran
	{ ramp: 'CGPFPgKejlv0', planeScale: [1.6, 1.6, 1.6], drift: [0, 0, 0], emissive: 0, radiusMul: 1, moonChance: 0.25 },               // oceanic
	{ ramp: 'PGEeMHsWL0oe', planeScale: [2, 2, 2], drift: [0, 0, 0], emissive: 0, radiusMul: 0.9, moonChance: 0.5 },                    // mars
	{ ramp: 'FFFOOObbcppq224', planeScale: [2.3, 2.3, 2.3], drift: [0, 0, 0], emissive: 0, radiusMul: 0.8, moonChance: 0.05 },          // rocky-gray
	{ ramp: 'RMJgZRqla1zp', planeScale: [2.1, 2.1, 2.1], drift: [0, 0, 0], emissive: 0, radiusMul: 0.95, moonChance: 0.3 },             // rocky-tan
	{ ramp: 'ls0269///x46', planeScale: [1.8, 1.8, 1.8], drift: [0, 0, 0], emissive: 0, radiusMul: 0.9, moonChance: 0.2 },              // icy
	{ ramp: 'ECCREClJF5bH/0W', planeScale: [2.2, 2.2, 2.2], drift: [0.01, 0, 0.01], emissive: 0.28, radiusMul: 0.9, moonChance: 0.15 }, // volcanic
	{ ramp: 'WOJoeU2wl0jR961', planeScale: [0.16, 9, 0.16], drift: [0.05, 0, 0.02], emissive: 0, radiusMul: 1.5, moonChance: 0.8, giant: true }, // gas giant (warm)
	{ ramp: 'EGUJRlWjz059', planeScale: [0.16, 7, 0.16], drift: [0.04, 0, 0.02], emissive: 0, radiusMul: 1.4, moonChance: 0.7, giant: true }     // gas giant (blue)
]

const MOON_ARCH = { ramp: 'FFFOOObbcppq224', planeScale: [2.2, 2.2, 2.2], drift: [0, 0, 0] }

const SYSTEM_PLANET_MIN = 4
const SYSTEM_PLANET_MAX = 7
const SYSTEM_STAR_BASE_RADIUS = 0.42
const SYSTEM_PLANET_BASE_RADIUS = 0.2
const SYSTEM_ORBIT_COLOR = [0.35, 0.4, 0.55]
// A planet with something still to do gets a single red cube on a small
// orbit - same idiom as the player's own ship marker (CreateOrbitMarkers
// with count 1 is just "one cube going around in a circle"), not the
// multi-square selector look (that one's reserved for current/selected).
const SYSTEM_EVENT_MARKER_COUNT = 1
const SYSTEM_EVENT_MARKER_SIZE = 0.13

// sys.parkedPlanet holds a planet object, or PARK_STAR ("parked on the star's
// orbit" - a real location: Hyperjump is only available from there), or null
// (drifting on the outer orbit, right after arriving in a system).
const PARK_STAR = 'star'

var systemCache = {}

function planetNeedsEventMarker(planet) {
	return planet.hasEnemies && !planet.enemyCleared
}

function GetSystem(ctx, starIndex) {
	let sys = systemCache[starIndex]
	if (sys) return sys

	const starType = STAR_ARCHETYPES[Math.floor(Math.random() * STAR_ARCHETYPES.length)]
	const starRadius = SYSTEM_STAR_BASE_RADIUS * starType.radius
	const starOff = V3(Math.random() * 7, Math.random() * 7, Math.random() * 7)
	const star = CreatePlanetObject(ctx.gl, V3(0, 0, 0), starRadius, GetRamp(ctx.gl, starType.ramp), starType.planeScale, starOff, starType.drift, 1, 20, 26)
	star.radius += 0.3 // pad the *pick* sphere only (render scale is baked in already) - stars/planets shrank a lot, keep them clickable

	const count = SYSTEM_PLANET_MIN + Math.floor(Math.random() * (SYSTEM_PLANET_MAX - SYSTEM_PLANET_MIN + 1))
	const planets = []
	const rings = []
	let dist = starRadius * 2.6 + 1.1
	for (let i = 0; i < count; i++) {
		dist += 0.75 + Math.random() * 0.5
		const angle = Math.random() * Math.PI * 2
		const pos = V3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist)
		const type = PLANET_ARCHETYPES[Math.floor(Math.random() * PLANET_ARCHETYPES.length)]
		const radius = SYSTEM_PLANET_BASE_RADIUS * (0.8 + Math.random() * 0.5) * type.radiusMul

		const moons = []
		if (Math.random() < type.moonChance) {
			const moonCount = Math.random() < 0.25 ? 2 : 1
			for (let m = 0; m < moonCount; m++) {
				const moff = V3(Math.random() * 7, Math.random() * 7, Math.random() * 7)
				moons.push({
					object: CreatePlanetObject(ctx.gl, V3(0, 0, 0), radius * (0.2 + Math.random() * 0.12), GetRamp(ctx.gl, MOON_ARCH.ramp), MOON_ARCH.planeScale, moff, MOON_ARCH.drift, 0, 10, 12),
					dist: radius * (1.8 + m * 0.9),
					angle: Math.random() * Math.PI * 2,
					speed: 0.5 + Math.random() * 0.5
				})
			}
		}

		const off = V3(Math.random() * 7, Math.random() * 7, Math.random() * 7)
		const planetObj = CreatePlanetObject(ctx.gl, pos, radius, GetRamp(ctx.gl, type.ramp), type.planeScale, off, type.drift, type.emissive, 24, 32)
		planetObj.radius += 0.25 // pick-only padding, see the star's above
		const hasEnemies = Math.random() < 0.55
		planets.push({
			name: 'Planet ' + (i + 1),
			object: planetObj,
			radius,
			dist,
			moons,
			hasEnemies,
			enemyCleared: false,
			enemyArchetypes: hasEnemies ? RollPlanetEnemies() : null
		})
		rings.push(CreateRingObject(ctx.gl, V3(0, 0, 0), dist, SYSTEM_ORBIT_COLOR))
	}
	// Where the player's ship marker parks after a hyperjump (no planet yet):
	// one ring outside the last planet.
	const outerRadius = dist + 1.1
	sys = { star, starRadius, planets, rings, parkedPlanet: null, outerRadius }
	systemCache[starIndex] = sys
	return sys
}
