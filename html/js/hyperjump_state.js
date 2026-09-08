// Hyperjump transition: a "plasma" rainbow tunnel for star-to-star jumps.
// Dense concentric rings of cubes (GenRingOfCubes) march toward the camera:
// far rings are black, they take on colour as they near the ship, the colour
// then "locks" and just travels past and behind, then the row recycles to the
// far end. Walls bend gently. The ship stays visible; nothing else is drawn
// (the previous state already cleaned up). Generic over `onDone`, same
// contract as system_travel_state.js. See docs/tasks.md (block 3).

// sine-wheel rainbow, h in turns (0..1 = full wheel)
function Rainbow(h) {
	const a = h * Math.PI * 2
	return [0.5 + 0.5 * Math.sin(a), 0.5 + 0.5 * Math.sin(a + 2.094), 0.5 + 0.5 * Math.sin(a + 4.188)]
}

function CreateHyperjumpState(onDone) {
	const ROWS = 20
	const GAP = 1.3
	const SPAN = ROWS * GAP
	const NEAR = 2 // rings recycle before they reach the camera
	const SPEED = 15
	const LOCK_Z = 4
	const BEND = 0.9
	const SWING_IN = 0.35
	const CRUISE = 1.4
	const SWING_BACK = 0.35

	let t = 0
	let mine = []
	let rows = []
	let theta0 = 0
	let phi0 = 1.3

	return {
		OnEnter(ctx) {
			t = 0
			mine = []
			rows = []

			ctx.camera.setConstraints({ minPhi: 0.05, maxPhi: Math.PI - 0.05, minRadius: 6, maxRadius: 6, autoSpeed: 0 })
			ctx.camera.position = V3(0, 0, 0)
			ctx.camera.phi = phi0
			ctx.camera.radius = 6
			theta0 = ctx.camera.theta

			const ship = CreateShipObject(ctx.gl, V3(0, 0, 0), [0.8, 0.88, 1], 0.3)
			mine.push(ship)
			for (let i = 0; i < ROWS; i++) {
				const r = CreateMeshObject(ctx.gl, V3(0, 0, 0), GenRingOfCubes(16, 3.2, 0.22), 1, [0, 0, 0])
				r.z = NEAR + i * GAP
				r.hue = r.z * 0.09 // rainbow position along the tunnel; freezes once close
				rows.push(r)
				mine.push(r)
			}
			for (const o of mine) ctx.objects.push(o)

			CreatePanel('Hyperjump...', 'top')
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			t += dt

			// 3-phase camera swing: lean, hold, return
			let k = 0
			if (t < SWING_IN) k = t / SWING_IN
			else if (t < SWING_IN + CRUISE) k = 1
			else k = Math.max(0, 1 - (t - SWING_IN - CRUISE) / SWING_BACK)
			ctx.camera.theta = LerpAngle(theta0, theta0 + 0.5, k)
			ctx.camera.phi = phi0 - 0.22 * k
			ctx.camera.update(dt)

			const { eye, forward, right, up } = ctx.camera.getBasis()
			for (const r of rows) {
				r.z -= dt * SPEED
				if (r.z < NEAR) r.z += SPAN
				// hue tracks position (rainbow gradient scrolling with the rings)
				// until the ring gets close, then it freezes and just travels past
				if (r.z > LOCK_Z) r.hue = r.z * 0.09 + t * 0.04
				// black far away, full colour once near, quick dim right at the eye
				let bright = Math.min(1, (SPAN - r.z) / (SPAN * 0.55))
				bright *= Math.min(1, (r.z - NEAR + 0.3) / 1.6) * 0.85
				const c = Rainbow(r.hue)
				r.color = [c[0] * bright, c[1] * bright, c[2] * bright]
				const bx = Math.sin(r.z * 0.18 + t * 1.3) * BEND
				const by = Math.cos(r.z * 0.14 + t) * BEND
				r.position = AddV3(eye, AddV3(ScaleV3(forward, r.z), AddV3(ScaleV3(right, bx), ScaleV3(up, by))))
			}

			if (t > SWING_IN + CRUISE + SWING_BACK) SetState(onDone())
		}
	}
}
