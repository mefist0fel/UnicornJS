// Planet overview: the planet itself plus the ship, freely orbitable -
// unlike dialog/battle this can be revisited any number of times (no
// consumed flag). "Search" grants whatever resources are still scattered
// on the planet and zeroes them out; "Next" returns to the system map.
// See docs/architecture.md for the state contract.

function CreateOverviewState(planet) {
	let mine = []

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({ minPhi: 0.05, maxPhi: Math.PI - 0.05, minRadius: 5, maxRadius: 14, autoSpeed: 0 })
			ctx.camera.theta = Math.PI / 2 // ship sits apart along X, this puts X across the screen
			ctx.camera.phi = 1.2
			ctx.camera.radius = 7

			const ball = CreateSphereObject(ctx.gl, V3(0, 0, 0), 2.5, planet.color)
			const ship = CreateShipObject(ctx.gl, V3(3.2, 0, 0), [0.85, 0.85, 0.9])
			mine = [ball, ship]
			ctx.objects.push(ball, ship)

			CreatePanel(planet.name, 'top')
			CreateButton('Search', 'bottomleft', () => SearchPlanet(planet))
			CreateButton('Next', 'bottomright', () => SetState(CreateSystemState()))
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ctx.camera.rotate(-ctx.input.dx * 0.005, -ctx.input.dy * 0.005)
			ctx.camera.zoom(ctx.input.wheel * 0.01)
			ctx.camera.update(dt)
		}
	}
}
