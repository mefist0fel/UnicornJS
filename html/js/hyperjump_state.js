// Hyperjump transition: a rotating rainbow "plasma tunnel" for star-to-star
// jumps in the galaxy map - deliberately more acid/trippy than the plain
// system_travel_state starfield, to read as the "bigger" kind of jump.
// Generic over `onDone`, same contract as system_travel_state.js. See
// docs/architecture.md for the state contract.

function CreateHyperjumpState(onDone) {
	const DURATION = 1.6
	const COUNT = 36
	const TUNNEL_LEN = 14
	let t = 0
	let mine = []

	return {
		OnEnter(ctx) {
			t = 0
			mine = []
			for (let i = 0; i < COUNT; i++) {
				const p = CreateCubeObject(ctx.gl, V3(0, 0, 0), 0.35, [1, 1, 1])
				p.a = Math.random() * Math.PI * 2
				p.r = 1 + Math.random() * 2.5
				p.z = Math.random() * TUNNEL_LEN
				mine.push(p)
				ctx.objects.push(p)
			}
			CreatePanel('Hyperjump...', 'top')
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			t += dt
			const { eye, forward, right, up } = ctx.camera.getBasis()
			for (let i = 0; i < mine.length; i++) {
				const p = mine[i]
				p.z -= dt * 16
				if (p.z < 0.5) p.z += TUNNEL_LEN
				const ang = p.a + t * 2
				const h = t * 3 + i * 0.3
				p.color = [0.5 + 0.5 * Math.sin(h), 0.5 + 0.5 * Math.sin(h + 2.09), 0.5 + 0.5 * Math.sin(h + 4.19)]
				p.position = AddV3(eye, AddV3(ScaleV3(forward, p.z), AddV3(ScaleV3(right, Math.cos(ang) * p.r), ScaleV3(up, Math.sin(ang) * p.r))))
			}
			if (t > DURATION) SetState(onDone())
		}
	}
}
