// Local travel transition: a starfield flying toward the camera, used for
// planet-to-planet jumps within a system. Purely time-based - camera input
// isn't read, particles fly along whatever direction the camera was facing
// when the jump started. Generic over `onDone`, a callback that produces
// the state to switch into once the animation finishes. See
// docs/architecture.md for the state contract.

function CreateSystemTravelState(onDone) {
	const DURATION = 1.2
	const COUNT = 50
	let t = 0
	let mine = []

	function respawn(camera) {
		const { eye, forward, right, up } = camera.getBasis()
		const dist = 8 + Math.random() * 14
		const sx = (Math.random() * 2 - 1) * 6
		const sy = (Math.random() * 2 - 1) * 6
		return AddV3(eye, AddV3(ScaleV3(forward, dist), AddV3(ScaleV3(right, sx), ScaleV3(up, sy))))
	}

	return {
		OnEnter(ctx) {
			t = 0
			mine = []
			for (let i = 0; i < COUNT; i++) {
				const p = CreateCubeObject(ctx.gl, respawn(ctx.camera), 0.12, [1, 1, 1])
				mine.push(p)
				ctx.objects.push(p)
			}
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			t += dt
			const { eye, forward } = ctx.camera.getBasis()
			for (let i = 0; i < mine.length; i++) {
				const p = mine[i]
				const d = DotV3(SubV3(p.position, eye), forward)
				if (d < 0.5) p.position = respawn(ctx.camera)
				else p.position = SubV3(p.position, ScaleV3(forward, dt * 18))
			}
			if (t > DURATION) SetState(onDone())
		}
	}
}
