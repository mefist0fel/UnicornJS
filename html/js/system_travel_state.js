// Local travel transition: planet-to-planet (or to the star's orbit) inside a
// system. Looks like ship_state - the real modular ship (CreateShipModelObjects)
// sits at the centre - with the system still visible as a backdrop (minus its
// star, which would overlap the ship) and long spark streaks flying past. The
// camera leans toward the heading (fromPos -> toPos), holds, and returns.
// `onDone` produces the next state. Honest "slide the whole system" is Part B.
// See docs/tasks.md (block 3).

function CreateSystemTravelState(onDone, fromPos, toPos) {
	const COUNT = 40
	const SWING_IN = 0.3
	const CRUISE = 1.0
	const SWING_BACK = 0.3
	let t = 0
	let sparks = []
	let shipObjs = []
	let sysObjs = []
	let theta0 = Math.PI / 2
	let phi0 = 0.85
	let camTheta = 0
	let camPhi = 0

	function respawn(camera) {
		const b = camera.getBasis()
		const dist = 8 + Math.random() * 16
		const sx = (Math.random() * 2 - 1) * 7
		const sy = (Math.random() * 2 - 1) * 7
		return AddV3(b.eye, AddV3(ScaleV3(b.forward, dist), AddV3(ScaleV3(b.right, sx), ScaleV3(b.up, sy))))
	}

	return {
		OnEnter(ctx) {
			t = 0

			ctx.camera.setConstraints({ minPhi: 0.1, maxPhi: 1.4, minRadius: 10, maxRadius: 10, autoSpeed: 0 })
			ctx.camera.position = V3(0, 0, 0)
			ctx.camera.theta = theta0
			ctx.camera.phi = phi0
			ctx.camera.radius = 10

			shipObjs = CreateShipModelObjects(ctx.gl)

			const sys = GetSystem(ctx, currentStarIndex)
			sysObjs = [] // system as a distant backdrop; skip the star (sits on the
			for (const p of sys.planets) { // ship) and the orbit rings (too busy up close)
				sysObjs.push(p.object)
				for (const m of p.moons) sysObjs.push(m.object)
			}

			sparks = []
			for (let i = 0; i < COUNT; i++) {
				const p = CreateCubeObject(ctx.gl, respawn(ctx.camera), 1, [1, 1, 1])
				p.scale = [0.05, 0.05, 1.1] // stretched "spark" streak (see Mat4TranslateScale)
				sparks.push(p)
			}
			for (const o of shipObjs) ctx.objects.push(o)
			for (const o of sysObjs) ctx.objects.push(o)
			for (const o of sparks) ctx.objects.push(o)

			const from = fromPos || V3(0, 0, 0)
			const to = toPos || V3(1, 0, 0)
			const heading = Math.atan2(to[2] - from[2], to[0] - from[0])
			camTheta = heading + Math.PI + 0.18 // behind the ship, ~10deg off
			camPhi = phi0 - 0.15               // slight rise
		},

		OnExit(ctx) {
			RemoveObjects(ctx, shipObjs)
			RemoveObjects(ctx, sysObjs)
			RemoveObjects(ctx, sparks)
		},

		OnUpdate(ctx, dt) {
			t += dt

			let k = 0
			if (t < SWING_IN) k = t / SWING_IN
			else if (t < SWING_IN + CRUISE) k = 1
			else k = Math.max(0, 1 - (t - SWING_IN - CRUISE) / SWING_BACK)
			ctx.camera.theta = LerpAngle(theta0, camTheta, k)
			ctx.camera.phi = phi0 + (camPhi - phi0) * k
			ctx.camera.update(dt)

			const b = ctx.camera.getBasis()
			for (const p of sparks) {
				const d = DotV3(SubV3(p.position, b.eye), b.forward)
				if (d < 0.5) p.position = respawn(ctx.camera)
				else p.position = SubV3(p.position, ScaleV3(b.forward, dt * 26))
			}

			if (t > SWING_IN + CRUISE + SWING_BACK) SetState(onDone())
		}
	}
}
