// Local travel transition: planet-to-planet (or to the star's orbit) inside a
// system. The real modular ship (CreateShipModelObjects) sits at the origin
// facing -z. The whole system is drawn at decoration scale (system.js) and
// slides: at t=0 the ship sits at fromBody's vicinity, over the effect it ends
// up at toBody's vicinity - "we jump between patches but see the effect". Long
// spark streaks fly past along the world z axis; the camera leans toward the
// slide direction, then returns. See docs/tasks.md (block 3).

function CreateSystemTravelState(onDone, fromBody, toBody) {
	const COUNT = 52
	const SWING_IN = 0.35
	const CRUISE = 1.9
	const SWING_BACK = 0.35
	const TOTAL = SWING_IN + CRUISE + SWING_BACK
	const AHEAD = 30
	const BEHIND = 12
	let t = 0
	let sparks = []
	let shipObjs = []
	let decoObjs = []
	let sys = null
	let vFrom = V3(0, 0, 0)
	let vTo = V3(0, 0, 0)
	let theta0 = PI / 2
	let phi0 = 1.2
	let camTheta = 0
	let camPhi = 0

	function respawn() {
		return V3((Mr() * 2 - 1) * 8, (Mr() * 2 - 1) * 6, -AHEAD * (0.25 + Mr() * 0.75))
	}

	return {
		OnEnter(ctx) {
			t = 0

			ctx.camera.setConstraints({ minPhi: 0.1, maxPhi: 1.5, minRadius: 8, maxRadius: 8, autoSpeed: 0 })
			ctx.camera.position = V3(0, 0, 0)
			ctx.camera.theta = theta0
			ctx.camera.phi = phi0
			ctx.camera.radius = 8

			shipObjs = CreateShipModelObjects(ctx.gl)

			sys = GetSystem(ctx, currentStarIndex)
			DecoSystem(ctx, sys)
			decoObjs = sys.deco.parts.map(p => p.obj)
			vFrom = DecoVicinity(sys, fromBody)
			vTo = DecoVicinity(sys, toBody)

			sparks = []
			for (let i = 0; i < COUNT; i++) {
				const p = CreateCubeObject(ctx.gl, respawn(), 1, [1, 1, 1])
				p.scale = [0.05, 0.05, 1.1]
				sparks.push(p)
			}
			for (const o of shipObjs) ctx.objects.push(o)
			for (const o of decoObjs) ctx.objects.push(o)
			for (const o of sparks) ctx.objects.push(o)

			const heading = Matan2(vTo[2] - vFrom[2], vTo[0] - vFrom[0])
			camTheta = heading + PI + 0.18
			camPhi = phi0 - 0.15
		},

		OnExit(ctx) {
			RemoveObjects(ctx, shipObjs)
			RemoveObjects(ctx, decoObjs)
			RemoveObjects(ctx, sparks)
		},

		OnUpdate(ctx, dt) {
			t += dt

			// slide the whole deco system from fromBody's vicinity to toBody's
			let s = Mmin(1, t / TOTAL)
			s = s * s * (3 - 2 * s) // smoothstep
			const offX = vFrom[0] + (vTo[0] - vFrom[0]) * s
			const offZ = vFrom[2] + (vTo[2] - vFrom[2]) * s
			for (const p of sys.deco.parts) {
				p.obj.position = V3(p.base[0] - offX, p.base[1], p.base[2] - offZ)
			}

			let k = 0
			if (t < SWING_IN) k = t / SWING_IN
			else if (t < SWING_IN + CRUISE) k = 1
			else k = Mmax(0, 1 - (t - SWING_IN - CRUISE) / SWING_BACK)
			ctx.camera.theta = LerpAngle(theta0, camTheta, k)
			ctx.camera.phi = phi0 + (camPhi - phi0) * k
			ctx.camera.update(dt)

			for (const p of sparks) {
				p.position = V3(p.position[0], p.position[1], p.position[2] + dt * 30)
				if (p.position[2] > BEHIND) p.position = respawn()
			}

			if (t > TOTAL) SetState(onDone())
		}
	}
}
