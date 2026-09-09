// Local travel transition: planet-to-planet (or to the star's orbit) inside a
// system. The sequence the player sees:
//   1. the ship yaws to face the destination point,
//   2. the camera tucks in close behind it,
//   3. spark streaks appear, running along the ship's NEW forward axis,
//   4. the whole system slides from fromBody's vicinity to toBody's,
//   5. we arrive, the streaks fade,
//   6. the camera eases back out.
// The ship model has no real rotation - its cubes are re-placed by RotY() about
// the origin, which is enough at this blocky scale. Everything that used to run
// along world -z (streaks, camera) now runs along `fwd` = the vFrom->vTo
// heading. See docs/tasks.md (block 3) and the deco-scale note in system.js.

function CreateSystemTravelState(onDone, fromBody, toBody) {
	const COUNT = 90
	const SWING_IN = 0.6    // ship turns + camera tucks
	const CRUISE = 1.9      // system slides past
	const SWING_BACK = 0.5  // camera returns
	const TOTAL = SWING_IN + CRUISE + SWING_BACK
	const AHEAD = 800       // spark field length ahead along -fwd
	const BEHIND = 200
	const SPARK_SPEED = 700
	const R_FAR = 34        // camera distance at rest / on return
	const R_TUCK = 18       // camera tucked in behind the engines during cruise

	let t = 0
	let sparks = []
	let shipObjs = []
	let decoObjs = []
	let sys = null
	let vFrom = V3()
	let vTo = V3()
	let fwd = V3(0, 0, -1)  // unit heading in the xz plane
	let rightV = V3(1, 0, 0) // fwd turned +90 in xz - spark lateral spread
	let yaw = 0             // rotates the ship's local -z nose onto fwd
	let streakScale = [0.2, 0.2, 12]
	let theta0 = PI / 2
	let phi0 = 1.2
	let camTheta = 0        // target azimuth: just behind the ship
	let camPhi = 0

	function respawn() {
		return { d: -AHEAD * (0.25 + Mr() * 0.75), u: (Mr() * 2 - 1) * 45, s: (Mr() * 2 - 1) * 60 }
	}

	function sparkPos(o) {
		return V3(fwd[0] * o.d + rightV[0] * o.s, o.u, fwd[2] * o.d + rightV[2] * o.s)
	}

	return {
		OnEnter(ctx) {
			t = 0
			Sfx.jump()

			ctx.camera.setConstraints({ minPhi: 0.1, maxPhi: 1.5, minRadius: R_TUCK, maxRadius: R_FAR, autoSpeed: 0 })
			ctx.camera.p = V3()
			ctx.camera.theta = theta0
			ctx.camera.phi = phi0
			ctx.camera.setDist(R_FAR)

			shipObjs = CreateShipModelObjects()
			for (const o of shipObjs) o.base = o.p.slice()

			sys = GetSystem(ctx, currentStarIndex)
			DecoSystem(ctx, sys)
			decoObjs = sys.deco.parts.map(p => p.obj)
			vFrom = DecoVicinity(sys, fromBody)
			vTo = DecoVicinity(sys, toBody)

			const dx = vTo[0] - vFrom[0], dz = vTo[2] - vFrom[2]
			const len = Msqrt(dx * dx + dz * dz) || 1
			fwd = V3(dx / len, 0, dz / len)
			rightV = V3(-fwd[2], 0, fwd[0])
			yaw = Matan2(-fwd[0], -fwd[2])                 // local -z -> fwd
			streakScale = Ma(fwd[0]) > Ma(fwd[2]) ? [12, 0.2, 0.2] : [0.2, 0.2, 12]
			camTheta = Matan2(-fwd[2], -fwd[0]) + 0.15     // sit just behind the ship, slight 3/4
			camPhi = phi0 - 0.25

			sparks = []
			for (let i = 0; i < COUNT; i++) {
				const p = CreateCubeObject(V3(), 1, [0, 0, 0])
				p.scale = streakScale
				p.loc = respawn()
				sparks.push(p)
			}
			PushObjects(ctx, shipObjs)
			PushObjects(ctx, decoObjs)
			PushObjects(ctx, sparks)
		},

		OnExit(ctx) {
			RemoveObjects(ctx, shipObjs)
			RemoveObjects(ctx, decoObjs)
			RemoveObjects(ctx, sparks)
		},

		OnUpdate(ctx, dt) {
			t += dt

			// phase envelope: 0 -> 1 over SWING_IN, hold at 1, 1 -> 0 over SWING_BACK
			let k = 0
			if (t < SWING_IN) k = t / SWING_IN
			else if (t < SWING_IN + CRUISE) k = 1
			else k = Mmax(0, 1 - (t - SWING_IN - CRUISE) / SWING_BACK)

			// ship yaws onto the heading during SWING_IN, then holds
			const turnK = Mmin(1, t / SWING_IN)
			for (const o of shipObjs) o.p = RotY(o.base, yaw * turnK)

			// system slides only during the cruise: turn first, then fly, then arrive
			let sl = Mmax(0, Mmin(1, (t - SWING_IN) / CRUISE))
			sl = sl * sl * (3 - 2 * sl)
			const offX = vFrom[0] + (vTo[0] - vFrom[0]) * sl
			const offZ = vFrom[2] + (vTo[2] - vFrom[2]) * sl
			for (const p of sys.deco.parts) p.obj.p = V3(p.base[0] - offX, p.base[1], p.base[2] - offZ)

			// camera: tuck in behind the ship, hold, ease back to neutral
			if (k === 1 && ctx.input.btn === 2) {
				ctx.camera.rot(-ctx.input.pdx * 2.5, -ctx.input.pdy * 2.5) // look around mid-cruise
			} else if (k < 1 && t >= SWING_IN + CRUISE) {
				ctx.camera.theta = LerpAngle(ctx.camera.theta, theta0, 0.12)
				ctx.camera.phi += (phi0 - ctx.camera.phi) * 0.12
			} else {
				ctx.camera.theta = LerpAngle(theta0, camTheta, k)
				ctx.camera.phi = phi0 + (camPhi - phi0) * k
			}
			ctx.camera.setDist(R_FAR + (R_TUCK - R_FAR) * k)
			ctx.camera.upd(dt)

			// spark streaks travel back along fwd; brightness follows the envelope
			for (const p of sparks) {
				p.loc.d += dt * SPARK_SPEED
				if (p.loc.d > BEHIND) p.loc = respawn()
				p.p = sparkPos(p.loc)
				p.color = [k, k, k]
			}

			if (t > TOTAL) SetState(onDone())
		}
	}
}
