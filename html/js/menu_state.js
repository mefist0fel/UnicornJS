// Menu state: title, a decorative sun, and a Play button. Play generates
// the galaxy exactly once (galaxyStars stays null until then, see
// galaxy.js) and drops the player straight into the galaxy map. See
// docs/architecture.md for the state contract.

function CreateMenuState() {
	let mine = []

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({ minPhi: 0.6, maxPhi: 0.6, minRadius: 10, maxRadius: 10, autoSpeed: 0.15 })
			ctx.camera.theta = 0
			ctx.camera.phi = 0.6
			ctx.camera.radius = 10

			const sun = CreateSphereObject(ctx.gl, V3(0, 0, 0), 2, [1, 0.9, 0.5])
			mine = [sun]
			ctx.objects.push(sun)

			CreatePanel('UNICORNS & RAINBOWS', 'top')
			CreateButton('Play', 'center', () => {
				if (!galaxyStars) GenerateGalaxy(ctx)
				SetState(CreateGalaxyState())
			})
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ctx.camera.update(dt)
		}
	}
}
