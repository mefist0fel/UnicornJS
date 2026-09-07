// Solar-system map: a star, its orbit-line rings and 4-7 planets (see
// system.js) with occasional moons. Click the central star to open the
// galaxy map; click a planet within to select it (green orbit-marker
// squares hugging its orbit, see CreateOrbitMarkers) then "Jump" to travel
// there - which drops you into ship_state, in a fight if that planet still
// has hostiles. "Return to ship" goes back to the hub without moving. A tiny
// ship marker orbits whichever body the player is parked at - the outermost
// orbit right after a hyperjump (sys.parkedPlanet == null), or the last
// planet travelled to. Planets that still have hostiles carry a red marker.
// See docs/architecture.md.

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
	let selectedPlanet = null
	let pickMarker = null
	let eventMarkers = [] // [{ marker, planet }]
	let markerAngle = 0

	function selectPlanet(ctx, planet) {
		if (planet === selectedPlanet) return
		selectedPlanet = planet
		if (!selected) {
			selected = true
			pickMarker = CreateOrbitMarkers(ctx.gl, SYSTEM_SELECT_MARKER_COUNT, SYSTEM_SELECT_MARKER_SIZE, [0.2, 1, 0.3])
			for (let i = 0; i < pickMarker.objs.length; i++) {
				ctx.objects.push(pickMarker.objs[i])
				mine.push(pickMarker.objs[i])
			}
			CreateButton('Jump', 'bottomleft', () => TryJump(ctx))
		}
	}

	function TryJump(ctx) {
		if (!selectedPlanet) return
		const planet = selectedPlanet
		sys.parkedPlanet = planet
		SetState(CreateSystemTravelState(() => CreateShipState({
			planet,
			enemies: planetNeedsEventMarker(planet) ? planet.enemyArchetypes : null
		})))
	}

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({
				minPhi: 0.15, maxPhi: Math.PI / 2 - 0.05, minRadius: 4, maxRadius: 22, autoSpeed: 0,
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
			shipTarget = parked ? parked.object.position : V3(0, 0, 0)
			shipOrbitRadius = parked ? parked.radius * 2.2 + SYSTEM_SHIP_ORBIT_PAD : sys.outerRadius
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

			for (let i = 0; i < mine.length; i++) ctx.objects.push(mine[i])

			sys.star.onClick = () => SetState(CreateGalaxyState())
			for (let i = 0; i < sys.planets.length; i++) {
				const planet = sys.planets[i]
				planet.object.onClick = () => selectPlanet(ctx, planet)
			}

			selected = false
			selectedPlanet = null
			pickMarker = null
			shipAngle = Math.random() * Math.PI * 2
			markerAngle = 0
			CreatePanel('System - star to leave, planet to jump', 'top')
			CreateButton('Return to ship', 'bottomright', () => SetState(CreateShipState()))
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ApplyCameraInput(ctx, dt)

			shipAngle += dt * SYSTEM_SHIP_SPEED
			ship.position = V3(shipTarget[0] + Math.cos(shipAngle) * shipOrbitRadius, 0, shipTarget[2] + Math.sin(shipAngle) * shipOrbitRadius)

			for (let i = 0; i < sys.planets.length; i++) {
				const planet = sys.planets[i]
				for (let m = 0; m < planet.moons.length; m++) {
					const moon = planet.moons[m]
					moon.angle += moon.speed * dt
					moon.object.position = V3(
						planet.object.position[0] + Math.cos(moon.angle) * moon.dist,
						0,
						planet.object.position[2] + Math.sin(moon.angle) * moon.dist)
				}
			}

			markerAngle += dt * SYSTEM_MARKER_SPEED
			if (selected) pickMarker.update(selectedPlanet.object.position, selectedPlanet.radius * 1.3, markerAngle)
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
