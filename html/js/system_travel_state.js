// Local travel transition: planet-to-planet inside a system. Unlike the
// hyperjump we DON'T hide the system - the player keeps seeing it - we just
// re-add the cached system objects and fly long spark streaks past the ship.
// The camera leans toward the heading (toward `toPos`), holds, and returns.
// `onDone` produces the next state, `toPos` is the target planet's world
// position (for the heading). See docs/tasks.md (block 3).

function CreateSystemTravelState(onDone, toPos) {
	const COUNT = 40
	const SWING_IN = 0.3
	const CRUISE = 1.0
	const SWING_BACK = 0.3
	let t = 0
	let mine = []
	let sysObjs = []
	let theta0 = 0
	let phi0 = 0
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
			mine = []

			const sys = GetSystem(ctx, currentStarIndex)
			sysObjs = [sys.star]
			for (const r of sys.rings) sysObjs.push(r)
			for (const p of sys.planets) {
				sysObjs.push(p.object)
				for (const m of p.moons) sysObjs.push(m.object)
			}
			for (const o of sysObjs) ctx.objects.push(o)

			for (let i = 0; i < COUNT; i++) {
				const p = CreateCubeObject(ctx.gl, respawn(ctx.camera), 1, [1, 1, 1])
				p.scale = [0.05, 0.05, 1.1] // stretched "spark" streak (see Mat4TranslateScale)
				mine.push(p)
				ctx.objects.push(p)
			}

			theta0 = ctx.camera.theta
			phi0 = ctx.camera.phi
			const heading = toPos ? Math.atan2(toPos[2], toPos[0]) : theta0
			camTheta = heading + Math.PI + 0.18 // behind the ship, ~10deg off
			camPhi = phi0 - 0.15               // slight rise
		},

		OnExit(ctx) {
			RemoveObjects(ctx, sysObjs)
			RemoveObjects(ctx, mine)
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
			for (let i = 0; i < mine.length; i++) {
				const p = mine[i]
				const d = DotV3(SubV3(p.position, b.eye), b.forward)
				if (d < 0.5) p.position = respawn(ctx.camera)
				else p.position = SubV3(p.position, ScaleV3(b.forward, dt * 26))
			}

			if (t > SWING_IN + CRUISE + SWING_BACK) SetState(onDone())
		}
	}
}
