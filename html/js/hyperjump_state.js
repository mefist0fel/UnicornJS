// Hyperjump transition: a "plasma" rainbow tunnel for star-to-star jumps.
// Looks like ship_state - the real modular ship (CreateShipModelObjects) sits
// at the origin facing -z - flying down a tunnel of dense concentric cube
// rings (GenRingOfCubes) that runs along the WORLD z axis (the ship's forward
// axis), not the camera's. Far rings (large +d, ahead) are black, take on
// colour as they near, the hue freezes and they travel past and behind (d<0,
// +z) then recycle to the far end. Walls bend gently. Nothing else is drawn.
// Entered from galaxy_state's jump; onDone -> ship_state at the new star.
// See docs/tasks.md (block 3).

// sine-wheel rainbow, h in turns (0..1 = full wheel)
function Rainbow(h) {
	const a = h * PI * 2
	return [0.5 + 0.5 * Ms(a), 0.5 + 0.5 * Ms(a + 2.094), 0.5 + 0.5 * Ms(a + 4.188)]
}

function CreateHyperjumpState(onDone) {
	const ROWS = 34
	const GAP = 0.92
	const SPAN = ROWS * GAP
	const AHEAD = 1.5 // nearest ring's start distance ahead (along -z)
	const BEHIND = 6  // recycle once a ring is this far behind (+z)
	const TOTAL = SPAN + AHEAD + BEHIND
	const SPEED = 16
	const LOCK_D = 4  // hue freezes once a ring is within this of the ship
	const HUE_K = 0.15
	const BEND = 0.35
	const SWING_IN = 0.4
	const CRUISE = 2.4
	const SWING_BACK = 0.4

	let t = 0
	let mine = []
	let rows = []
	let theta0 = PI / 2
	let phi0 = PI / 2 - 0.08 // on-axis, tiny downtilt - looking straight down the throat

	return {
		OnEnter(ctx) {
			t = 0
			mine = []
			rows = []
			Sfx.hyperjump()

			// chase cam right behind the ship, on the tunnel axis, looking -z
			ctx.camera.setConstraints({ minPhi: 0.05, maxPhi: PI - 0.05, minRadius: 5, maxRadius: 5, autoSpeed: 0 })
			ctx.camera.position = V3(0, 0, 0)
			ctx.camera.theta = theta0
			ctx.camera.phi = phi0
			ctx.camera.radius = 5

			for (const o of CreateShipModelObjects(ctx.gl)) mine.push(o)
			for (let i = 0; i < ROWS; i++) {
				const r = CreateMeshObject(ctx.gl, V3(0, 0, 0), GenRingOfCubes(34, 2.1, 0.14), 1, [0, 0, 0])
				r.d = AHEAD + i * GAP // signed distance ahead along -z (d<0 = behind, +z)
				r.hue = r.d * HUE_K
				rows.push(r)
				mine.push(r)
			}
			PushObjects(ctx, mine)

			CreatePanel('Hyperjump...', 'top')
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			t += dt

			// 3-phase camera lean (small, not heading-based - ship always faces -z)
			let k = 0
			if (t < SWING_IN) k = t / SWING_IN
			else if (t < SWING_IN + CRUISE) k = 1
			else k = Mmax(0, 1 - (t - SWING_IN - CRUISE) / SWING_BACK)
			ctx.camera.theta = LerpAngle(theta0, theta0 + 0.13, k) // gentle lean, stay near-axis
			ctx.camera.phi = phi0 - 0.1 * k
			ctx.camera.update(dt)

			for (const r of rows) {
				r.d -= dt * SPEED
				if (r.d < -BEHIND) r.d += TOTAL
				// hue tracks position (rainbow gradient) until close, then freezes
				if (r.d > LOCK_D) r.hue = r.d * HUE_K + t * 0.06
				let bright = Mmin(1, (SPAN - r.d) / (SPAN * 0.45)) // black far ahead
				bright *= Mmin(1, (r.d + BEHIND) / 2)              // dim as it passes behind
				const c = Rainbow(r.hue)
				r.color = [c[0] * bright, c[1] * bright, c[2] * bright]
				const bx = Ms(r.d * 0.18 + t * 1.3) * BEND
				const by = Mc(r.d * 0.14 + t) * BEND
				r.position = V3(bx, by, -r.d) // along the world z axis
			}

			if (t > SWING_IN + CRUISE + SWING_BACK) SetState(onDone())
		}
	}
}
