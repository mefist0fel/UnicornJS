// Solar-system state: drag/zoom camera, click a planet to visit it.
// See docs/architecture.md for the state contract (OnEnter/OnExit/OnUpdate).

function CreateSolarState() {
	let mine = []

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({ minPhi: 0.15, maxPhi: Math.PI / 2 - 0.05, minRadius: 8, maxRadius: 24 })
			ctx.camera.radius = 15
			mine = BuildSolarSystem(ctx, true)
			CreatePanel('Солнечная система - выбери планету', 'top')
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ctx.camera.rotate(-ctx.input.dx * 0.005, -ctx.input.dy * 0.005)
			ctx.camera.zoom(ctx.input.wheel * 0.01)
			ctx.camera.update(dt)
			if (ctx.input.clicked) {
				const hit = PickObject(ctx.camera, ctx.input.clickX, ctx.input.clickY, ctx.objects)
				if (hit && hit.onClick) hit.onClick()
			}
		}
	}
}
