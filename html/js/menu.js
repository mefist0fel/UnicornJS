// Menu state: solar system spinning in the background, not clickable.
// See docs/architecture.md for the state contract (OnEnter/OnExit/OnUpdate).

function CreateMenuState() {
	let mine = []

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({ minPhi: 0.3, maxPhi: Math.PI / 2 - 0.05, minRadius: 15, maxRadius: 15, autoSpeed: 0.2 })
			ctx.camera.phi = 1.0
			ctx.camera.radius = 15
			mine = BuildSolarSystem(ctx, false)
			CreatePanel('UNICORNS & RAINBOWS', 'top')
			CreateButton('Играть', 'center', () => SetState(CreateSolarState()))
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ctx.camera.update(dt)
		}
	}
}
