// Solar-system map: a star, its orbit-line rings and 4-7 planets (see
// system.js) with occasional moons. Pick a target - a planet OR the central
// star (its orbit is a real location) - then "Jump": that plays the travel
// effect and drops you into ship_state parked at the target. "Return to ship"
// goes back without moving. A tiny ship marker orbits whatever the player is
// parked at - the outer orbit right after arriving (sys.parkedPlanet == null),
// the star's orbit (PARK_STAR), or the last planet. Planets that still have
// hostiles carry a red marker. See docs/architecture.md.

const SYSTEM_SHIP_SCALE = 0.05
const SYSTEM_SHIP_ORBIT_PAD = 0.18
const SYSTEM_SHIP_SPEED = 0.6
const SYSTEM_SELECT_MARKER_COUNT = 6
const SYSTEM_SELECT_MARKER_SIZE = 0.1
const SYSTEM_MARKER_SPEED = 0.8

function CreateSystemState() {
	let mine = []
	let sys = null
	let ship = null
	let shipTarget = V3(0, 0, 0)
	let shipOrbitRadius = 1
	let shipAngle = 0
	let selected = false
	let selectedTarget = null // a planet object, or PARK_STAR
	let pickMarker = null
	let eventMarkers = [] // [{ marker, planet }]
	let markerAngle = 0

	function tgtPos(t) { return t === PARK_STAR ? V3(0, 0, 0) : t.object.position }
	function tgtRad(t) { return t === PARK_STAR ? sys.starRadius : t.radius }

	function selectTarget(ctx, t) {
		if (t === selectedTarget) return
		selectedTarget = t
		if (!selected) {
			selected = true
			pickMarker = CreateOrbitMarkers(ctx.gl, SYSTEM_SELECT_MARKER_COUNT, SYSTEM_SELECT_MARKER_SIZE, [0.2, 1, 0.3])
			for (let i = 0; i < pickMarker.objs.length; i++) {
				ctx.objects.push(pickMarker.objs[i])
				mine.push(pickMarker.objs[i])
			}
			CreateButton('Jump', 'bottomright', () => TryJump(ctx))
		}
	}

	function TryJump(ctx) {
		if (!selectedTarget) return
		const from = sys.parkedPlanet // where we're leaving from (planet / PARK_STAR / null)
		if (selectedTarget === PARK_STAR) {
			sys.parkedPlanet = PARK_STAR
			SetState(CreateSystemTravelState(() => CreateShipState({ atStar: true }), from, PARK_STAR))
		} else {
			const planet = selectedTarget
			sys.parkedPlanet = planet
			SetState(CreateSystemTravelState(() => CreateShipState({
				planet,
				enemies: planetNeedsEventMarker(planet) ? planet.enemyArchetypes : null
			}), from, planet))
		}
	}

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({
				minPhi: 0.15, maxPhi: PI / 2 - 0.05, minRadius: 4, maxRadius: 22, autoSpeed: 0,
				panRect: { minX: -8, maxX: 8, minZ: -8, maxZ: 8 }
			})
			ctx.camera.position = V3(0, 0, 0)
			ctx.camera.radius = 13
			ctx.camera.phi = 0.85

			sys = GetSystem(ctx, currentStarIndex)
			mine = [sys.star]
			for (let i = 0; i < sys.rings.length; i++) mine.push(sys.rings[i])
			for (let i = 0; i < sys.planets.length; i++) {
				const planet = sys.planets[i]
				mine.push(planet.object)
				for (let m = 0; m < planet.moons.length; m++) mine.push(planet.moons[m].object)
			}

			const parked = sys.parkedPlanet
			if (parked === PARK_STAR) {
				shipTarget = V3(0, 0, 0)
				shipOrbitRadius = sys.starRadius * 2.6 + SYSTEM_SHIP_ORBIT_PAD
			} else if (parked) {
				shipTarget = parked.object.position
				shipOrbitRadius = parked.radius * 2.2 + SYSTEM_SHIP_ORBIT_PAD
			} else {
				shipTarget = V3(0, 0, 0)
				shipOrbitRadius = sys.outerRadius
			}
			ship = CreateShipObject(ctx.gl, V3(0, 0, 0), [0.4, 1, 0.45], SYSTEM_SHIP_SCALE)
			const shipRing = CreateRingObject(ctx.gl, shipTarget, shipOrbitRadius, [0.4, 0.7, 0.5])
			mine.push(ship, shipRing)

			eventMarkers = []
			for (let i = 0; i < sys.planets.length; i++) {
				const planet = sys.planets[i]
				if (!planetNeedsEventMarker(planet)) continue
				const marker = CreateOrbitMarkers(ctx.gl, SYSTEM_EVENT_MARKER_COUNT, SYSTEM_EVENT_MARKER_SIZE, [1, 0.2, 0.2])
				eventMarkers.push({ marker, planet })
				for (let m = 0; m < marker.objs.length; m++) mine.push(marker.objs[m])
			}

			PushObjects(ctx, mine)

			sys.star.onClick = () => selectTarget(ctx, PARK_STAR)
			for (let i = 0; i < sys.planets.length; i++) {
				const planet = sys.planets[i]
				planet.object.onClick = () => selectTarget(ctx, planet)
			}

			selected = false
			selectedTarget = null
			pickMarker = null
			shipAngle = Mr() * PI * 2
			markerAngle = 0
			CreatePanel('System - pick a planet or the star, then Jump', 'top')
			CreateButton('Return to ship', 'bottomleft', () => SetState(CreateShipState()))
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ApplyCameraInput(ctx, dt)

			shipAngle += dt * SYSTEM_SHIP_SPEED
			ship.position = V3(shipTarget[0] + Mc(shipAngle) * shipOrbitRadius, 0, shipTarget[2] + Ms(shipAngle) * shipOrbitRadius)

			for (let i = 0; i < sys.planets.length; i++) {
				const planet = sys.planets[i]
				for (let m = 0; m < planet.moons.length; m++) {
					const moon = planet.moons[m]
					moon.angle += moon.speed * dt
					moon.object.position = V3(
						planet.object.position[0] + Mc(moon.angle) * moon.dist,
						0,
						planet.object.position[2] + Ms(moon.angle) * moon.dist)
				}
			}

			markerAngle += dt * SYSTEM_MARKER_SPEED
			if (selected) pickMarker.update(tgtPos(selectedTarget), tgtRad(selectedTarget) * (selectedTarget === PARK_STAR ? 1.7 : 1.3), markerAngle)
			for (let i = 0; i < eventMarkers.length; i++) {
				const em = eventMarkers[i]
				em.marker.update(em.planet.object.position, em.planet.radius * 1.6, markerAngle + i)
			}

			if (ctx.input.clicked) {
				const hit = PickObject(ctx.camera, ctx.input.clickX, ctx.input.clickY, ctx.objects)
				if (hit && hit.onClick) hit.onClick()
			}
		}
	}
}
