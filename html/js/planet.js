// Planet state: one big sphere, full-orbit camera, "back" button.
// Also home to the first non-sphere object (a plain cube) as a demo of the
// second mesh-generation flavor - see CreateCubeObject in objects.js.
// See docs/architecture.md for the state contract (OnEnter/OnExit/OnUpdate).

function CreatePlanetState(planet) {
	let mine = []

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({ minPhi: 0.05, maxPhi: Math.PI - 0.05, minRadius: 5, maxRadius: 14 })
			ctx.camera.radius = 7

			const ball = CreateSphereObject(ctx.gl, V3(0, 0, 0), 2.5, planet.color)
			const cube = CreateCubeObject(ctx.gl, V3(3.5, 0, 0), 1, [0.8, 0.8, 0.9])
			ctx.objects.push(ball, cube)
			mine = [ball, cube]

			CreatePanel(planet.name, 'top')
			CreateButton('Назад', 'bottom', () => SetState(CreateSolarState()))
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
