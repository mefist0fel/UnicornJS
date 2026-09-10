// Hyperjump transition: a rainbow "plasma tube" for star-to-star jumps. The
// real ship (CreateShipModelObjects) sits at the origin facing -z; a long run
// of thin rings (MeshGen.ring, standing on edge along -z) is coloured ONCE from
// a rainbow gradient by index and slides bodily toward +z as one rigid tube -
// it appears far ahead, flies at you, passes, and you're at the new star. No
// per-frame recolour, no recycling. Entered from galaxy_state's jump; onDone ->
// ship_state at the new star. See docs/tasks.md (block 3).

// sine-wheel rainbow, h in turns (0..1 = full wheel)
function Rainbow(h) {
	const a = h * PI * 2
	return [0.5 + 0.5 * Ms(a), 0.5 + 0.5 * Ms(a + 2.094), 0.5 + 0.5 * Ms(a + 4.188)]
}

function CreateHyperjumpState(onDone) {
	const RINGS = 26
	const GAP = 1.3
	const TUNNEL_R = 2.6
	const AHEAD = 9        // nearest ring starts this far ahead (-z)
	const BEHIND = 12      // done once the whole run has passed this far behind (+z)
	const SPEED = 14
	const DUR = (RINGS * GAP + AHEAD + BEHIND) / SPEED

	let t = 0
	let mine = []
	let rings = []

	return {
		OnEnter(ctx) {
			t = 0
			mine = []
			rings = []
			Sfx.hyperjump()

			// chase cam right behind the ship, on the tunnel axis, looking -z
			ctx.camera.setConstraints(5, 5, 0, -85, 85)
			ctx.camera.place(V3(), 5, 4, 90)

			for (const o of CreateShipModelObjects()) mine.push(o)

			// one ring mesh, coloured per-instance from the gradient
			const ringMesh = MeshGen().ring(28, 0.78, 1).build()
			for (let i = 0; i < RINGS; i++) {
				const r = CreateMeshObject(V3(), ringMesh, TUNNEL_R, Rainbow(i / RINGS))
				r.emissive = r.color // self-lit -> reads as plasma, not a dim disc
				r.d0 = AHEAD + i * GAP // fixed offset along -z from the tube's head
				rings.push(r)
				mine.push(r)
			}
			PushObjects(ctx, mine)

			CreatePanel('Hyperjump...', 'top')
		},

		OnExit(ctx) { RemoveObjects(ctx, mine) },

		OnUpdate(ctx, dt) {
			t += dt
			const head = t * SPEED // how far the tube's head has travelled toward +z
			for (const r of rings) r.p = V3(0, 0, head - r.d0)

			// small camera lean: ease in over the first 30%, hold, ease back out
			const k = Mmax(0, Mmin(t / (DUR * 0.3), (DUR - t) / (DUR * 0.3), 1))
			ctx.camera.theta = 90 + 6 * k
			ctx.camera.pitch = 4 + 5 * k
			ctx.camera.upd(dt)

			if (t > DUR) SetState(onDone())
		}
	}
}
