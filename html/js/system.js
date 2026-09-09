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
	{ ramp: '$(5(5L1LWjcL:P5.>/wyz', planeScale: [1.7, 1.7, 1.7], drift: [0, 0, 0], emissive: 0, radiusMul: 1, moonChance: 0.4 },       // terran
	{ ramp: '#*7(7P/LTWgn', planeScale: [1.6, 1.6, 1.6], drift: [0, 0, 0], emissive: 0, radiusMul: 1, moonChance: 0.25 },               // oceanic
	{ ramp: '7*%L3,cA1n[L', planeScale: [2, 2, 2], drift: [0, 0, 0], emissive: 0, radiusMul: 0.9, moonChance: 0.5 },                    // mars
	{ ramp: '(()556IIJ^^_qqs', planeScale: [2.3, 2.3, 2.3], drift: [0, 0, 0], emissive: 0, radiusMul: 0.8, moonChance: 0.05 },          // rocky-gray
	{ ramp: ':3.PE:_WGpl^', planeScale: [2.1, 2.1, 2.1], drift: [0, 0, 0], emissive: 0, radiusMul: 0.95, moonChance: 0.3 },             // rocky-tan
	{ ramp: 'Wcnqwz~~~jsw', planeScale: [1.8, 1.8, 1.8], drift: [0, 0, 0], emissive: 0, radiusMul: 0.9, moonChance: 0.2 },              // icy
	{ ramp: '%$$:%$W.(uI,~nA', planeScale: [2.2, 2.2, 2.2], drift: [0.01, 0, 0.01], emissive: 0.28, radiusMul: 0.9, moonChance: 0.15 }, // volcanic
	{ ramp: 'A5.[L>qhWnT:zwp', planeScale: [0.16, 9, 0.16], drift: [0.05, 0, 0.02], emissive: 0, radiusMul: 1.5, moonChance: 0.8, giant: true }, // gas giant (warm)
	{ ramp: '%*>.:WATlnuz', planeScale: [0.16, 7, 0.16], drift: [0.04, 0, 0.02], emissive: 0, radiusMul: 1.4, moonChance: 0.7, giant: true }     // gas giant (blue)
]

const MOON_ARCH = { ramp: '(()556IIJ^^_qqs', planeScale: [2.2, 2.2, 2.2], drift: [0, 0, 0] }

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

	const starType = STAR_ARCHETYPES[Mfl(Mr() * STAR_ARCHETYPES.length)]
	const starRadius = SYSTEM_STAR_BASE_RADIUS * starType.radius
	const starOff = V3(Mr() * 7, Mr() * 7, Mr() * 7)
	const star = CreatePlanetObject(V3(), starRadius, GetRamp(starType.ramp), starType.planeScale, starOff, starType.drift, 1, 20, 26)
	star.radius += 0.3 // pad the *pick* sphere only (render scale is baked in already) - stars/planets shrank a lot, keep them clickable

	const count = SYSTEM_PLANET_MIN + Mfl(Mr() * (SYSTEM_PLANET_MAX - SYSTEM_PLANET_MIN + 1))
	const planets = []
	const rings = []
	let dist = starRadius * 2.6 + 1.1
	for (let i = 0; i < count; i++) {
		dist += 0.75 + Mr() * 0.5
		const angle = Mr() * PI * 2
		const pos = V3(Mc(angle) * dist, 0, Ms(angle) * dist)
		const type = PLANET_ARCHETYPES[Mfl(Mr() * PLANET_ARCHETYPES.length)]
		const radius = SYSTEM_PLANET_BASE_RADIUS * (0.8 + Mr() * 0.5) * type.radiusMul

		const moons = []
		if (Mr() < type.moonChance) {
			const moonCount = Mr() < 0.25 ? 2 : 1
			for (let m = 0; m < moonCount; m++) {
				const moff = V3(Mr() * 7, Mr() * 7, Mr() * 7)
				moons.push({
					object: CreatePlanetObject(V3(), radius * (0.2 + Mr() * 0.12), GetRamp(MOON_ARCH.ramp), MOON_ARCH.planeScale, moff, MOON_ARCH.drift, 0, 10, 12),
					dist: radius * (1.8 + m * 0.9),
					angle: Mr() * PI * 2,
					speed: 0.5 + Mr() * 0.5
				})
			}
		}

		const off = V3(Mr() * 7, Mr() * 7, Mr() * 7)
		const planetObj = CreatePlanetObject(pos, radius, GetRamp(type.ramp), type.planeScale, off, type.drift, type.emissive, 24, 32)
		planetObj.radius += 0.25 // pick-only padding, see the star's above
		const hasEnemies = Mr() < 0.55
		planets.push({
			name: 'Planet ' + (i + 1),
			object: planetObj,
			radius,
			dist,
			angle, // kept for the decoration-scale layout, see DecoSystem
			moons,
			hasEnemies,
			enemyCleared: false,
			enemyArchetypes: hasEnemies ? RollPlanetEnemies() : null
		})
		rings.push(CreateRingObject(V3(), dist, SYSTEM_ORBIT_COLOR))
	}
	// Where the player's ship marker parks after a hyperjump (no planet yet):
	// one ring outside the last planet.
	const outerRadius = dist + 1.1
	sys = { star, starRadius, planets, rings, parkedPlanet: null, outerRadius, deco: null }
	systemCache[starIndex] = sys
	return sys
}

// ---- decoration scale (a.k.a. the TRUE scale) ----
//
// The map (system_state) draws the system tiny and caricature-tight - the whole
// thing fits the same ~20-unit patch the ship's build platform occupies. When
// the ship "hangs" in the system (ship_state, system_travel_state) we want the
// honest thing instead: you sit on a ~20-unit platform on a planet's orbit, the
// planet a 200-300 unit giant a few hundred units off filling half the sky, the
// other bodies distant specks, the star a small far disc. That's a SEPARATE set
// of CreatePlanetObject instances (radii x1000, orbit distances x140), cached
// on sys.deco. The ship stays at the origin; we slide the whole system so the
// parked body's "vicinity" lands on the origin.
//
// Noise is sampled in object space on a UNIT sphere (objects.js), so a planet
// shows the exact same surface at map radius ~0.2 and deco radius ~250 - the
// ramp/offset/planeScale are copied verbatim and size only ever comes from the
// model matrix. Don't bake radius into a mesh or this breaks.
const DECO_ORBIT = 400     // orbit distances: map ~2..9 -> ~800..3600 (bodies well apart)
const DECO_RADIUS = 1000   // body radii: map ~0.2 -> ~200
const DECO_STAR_RMUL = 90  // the star stays a comparatively small distant disc
const DECO_PLATFORM_GAP = 45 // ship-to-planet-limb clearance at the vicinity point

function decoDist(d) {
	return d * DECO_ORBIT
}

function decoCopy(ctx, mapObj, radius, basePos) {
	// tessellation scales with apparent size but flattens out (sqrt) - a
	// 250-unit planet doesn't need 250x the triangles of a moon.
	const lat = Mmax(16, Mmin(56, Math.round(16 + Msqrt(radius) * 2)))
	return CreatePlanetObject(basePos.slice(), radius, mapObj.rampTex, mapObj.planeScale, mapObj.offset, mapObj.drift, mapObj.emissive, lat, Math.round(lat * 1.3))
}

function DecoSystem(ctx, sys) {
	if (sys.deco) return sys.deco
	const parts = [] // [{ obj, base }] - base = canonical deco world pos
	parts.push({ obj: decoCopy(ctx, sys.star, sys.starRadius * DECO_STAR_RMUL, V3()), base: V3() })
	for (const p of sys.planets) {
		const dd = decoDist(p.dist)
		p.decoBase = V3(Mc(p.angle) * dd, 0, Ms(p.angle) * dd)
		p.decoRadius = p.radius * DECO_RADIUS
		parts.push({ obj: decoCopy(ctx, p.object, p.decoRadius, p.decoBase), base: p.decoBase })
		for (const m of p.moons) {
			const mb = AddV3(p.decoBase, V3(Mc(m.angle) * m.dist * DECO_RADIUS, 0, Ms(m.angle) * m.dist * DECO_RADIUS))
			parts.push({ obj: decoCopy(ctx, m.object, m.object.scale * DECO_RADIUS, mb), base: mb })
		}
	}
	sys.deco = { parts }
	return sys.deco
}

// Where the ship hangs, in deco world coords - a platform ON the parked body's
// orbit, offset along the orbit tangent by one planet-radius + a gap so the
// planet looms off to one side rather than dead ahead.
function DecoVicinity(sys, body) {
	if (body && body !== PARK_STAR) {
		const b = body.decoBase
		const r = LenV3(b) || 1
		const tang = V3(-b[2] / r, 0, b[0] / r) // unit orbit tangent
		return AddV3(b, ScaleV3(tang, body.decoRadius + DECO_PLATFORM_GAP))
	}
	return V3(sys.starRadius * DECO_STAR_RMUL + DECO_PLATFORM_GAP + 30, 0, 0)
}

// Offset every deco part so the ship (origin) sits at `body`'s vicinity.
function PlaceDeco(sys, body) {
	const v = DecoVicinity(sys, body)
	for (const p of sys.deco.parts) p.obj.p = SubV3(p.base, v)
}
