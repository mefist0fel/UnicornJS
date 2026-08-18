// Solar-system state: a star and 2-4 planets (see system.js). Click the
// star to go back to the galaxy map, click a planet within to select it
// (green marker), then jump. A ship marker orbits the star while parked.
// See docs/architecture.md for the state contract.

function CreateSystemState() {
	let mine = []
	let ship = null
	let shipAngle = 0
	let selected = false
	let selectedPlanet = null

	function selectPlanet(ctx, planet) {
		if (planet === selectedPlanet) return
		selectedPlanet = planet
		if (!selected) {
			selected = true
			CreateButton('>', 'bottomleft', () => TryJump(ctx))
		}
	}

	function TryJump(ctx) {
		if (!selectedPlanet) return
		const planet = selectedPlanet
		SetState(CreateSystemTravelState(() => NextPlanetState(planet, 'jump')))
	}

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({ minPhi: 0.15, maxPhi: Math.PI / 2 - 0.05, minRadius: 6, maxRadius: 20, autoSpeed: 0 })
			ctx.camera.radius = 12
			ctx.camera.phi = 0.8

			const sys = GetSystem(ctx, currentStarIndex)
			mine = [sys.star]
			for (let i = 0; i < sys.planets.length; i++) mine.push(sys.planets[i].object)
			ship = CreateShipObject(ctx.gl, V3(3, 0, 0), [0.85, 0.85, 0.9])
			mine.push(ship)
			for (let i = 0; i < mine.length; i++) ctx.objects.push(mine[i])

			sys.star.onClick = () => SetState(CreateGalaxyState())
			for (let i = 0; i < sys.planets.length; i++) {
				const planet = sys.planets[i]
				planet.object.onClick = () => selectPlanet(ctx, planet)
			}

			selected = false
			selectedPlanet = null
			shipAngle = 0
			CreatePanel('System - click the star to leave, a planet to jump', 'top')
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ctx.camera.rotate(-ctx.input.dx * 0.005, -ctx.input.dy * 0.005)
			ctx.camera.zoom(ctx.input.wheel * 0.01)
			ctx.camera.update(dt)

			shipAngle += dt
			ship.position = V3(Math.cos(shipAngle) * 3, 0, Math.sin(shipAngle) * 3)

			if (ctx.input.clicked) {
				const hit = PickObject(ctx.camera, ctx.input.clickX, ctx.input.clickY, ctx.objects)
				if (hit && hit.onClick) hit.onClick()
			}
		}
	}
}
