// Orbital camera. Like any object it has a position (the handle the camera
// orbits) plus an offset and a rotation matrix: eye = position + rotMat*offset.
// `theta` (yaw) and `pitch` (elevation ABOVE the horizon) are in DEGREES;
// `radius` comes from a 0..1 `zoomT`. RMB drag orbits (vertical inverted), LMB
// drag pans `p` along the y=0 ground plane inside a square of half-extent
// `panSize` (0 pins the camera at the centre). See docs/camera.md.

function CreateCamera() {
	const cam = {
		p: V3(), // orbit centre
		offset: V3(0, 0, 8),
		rotMat: Mat4FromBasis(V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1)),
		theta: 0,     // yaw, degrees
		pitch: 30,    // elevation above the horizon, degrees
		// zoom is a normalised 0..1 "how far out" the wheel nudges at a FIXED
		// rate; `radius` = min + (max-min)*zoomT^2 (quadratic) in upd(). States
		// that think in world units call setDist(r).
		zoomT: 0.5,
		radius: 8,
		minPitch: 10,
		maxPitch: 80,
		minRadius: 3,
		maxRadius: 20,
		panSize: 0,   // half-extent of the square pan box (world units); 0 = pinned
		autoSpeed: 0, // auto-orbit deg/sec; only menu_state opts in
		fov: 50 * DEG,
		aspect: 1,
		// far clears the true-scale system in ship_state (outer bodies ~3600
		// out, starfield shell ~9000); near stays well above 0 for depth
		// precision at that range.
		near: 0.3,
		far: 10000,

		// Entering a scene: radius range, pan-box half-extent, pitch range
		// (default 10..80 above the horizon; ship passes -80..80). Also resets
		// autoSpeed to 0 - a state that wants the showcase spin sets it after.
		// Doesn't teleport - out-of-range values clamp on the next upd().
		setConstraints(minRad, maxRad, panSize, minPitch = 10, maxPitch = 80) {
			this.minRadius = minRad
			this.maxRadius = maxRad
			this.panSize = panSize
			this.minPitch = minPitch
			this.maxPitch = maxPitch
			this.autoSpeed = 0
		},

		// Point the camera for a scene in one call: orbit centre, distance
		// (world units), pitch (deg), yaw (deg, defaults to the current yaw).
		place(pos, dist, pitch, theta = this.theta) {
			this.p = pos
			this.pitch = pitch
			this.theta = theta
			this.setDist(dist)
		},

		// short names (rot/zm/upd): closure won't rename `.rotate`/`.zoom`/`.update`
		// (DOM-extern collision), so we do it by hand. See optimization.md.
		rot(dTheta, dPitch) {
			this.theta += dTheta
			this.pitch += dPitch
		},

		zm(dZoom) { this.zoomT = clamp(this.zoomT + dZoom, 0, 1) },

		// world-unit distance -> zoomT (inverse of upd()'s quadratic map).
		setDist(r) {
			const span = this.maxRadius - this.minRadius
			const q = span > 0 ? clamp((r - this.minRadius) / span, 0, 1) : 0
			this.zoomT = Msqrt(q)
			this.radius = this.minRadius + span * this.zoomT * this.zoomT
		},

		// Move the orbit centre so the ground point under prevNDC ends up under
		// curNDC - a "drag the map" pan. Rays hit the y=0 plane; if either
		// misses (looking at/above the horizon) the frame's pan is skipped.
		panFromScreen(prev, cur) {
			const a = planeHit(this.screenPointToRay(prev[0], prev[1]))
			const b = planeHit(this.screenPointToRay(cur[0], cur[1]))
			if (!a || !b) return
			this.p[0] += a[0] - b[0]
			this.p[2] += a[2] - b[2]
			this.clampPan()
		},

		clampPan() {
			this.p[0] = clamp(this.p[0], -this.panSize, this.panSize)
			this.p[2] = clamp(this.p[2], -this.panSize, this.panSize)
		},

		upd(dt) { // rebuild rotMat/offset from theta/pitch/zoomT
			if (this.autoSpeed) this.theta += this.autoSpeed * dt
			this.pitch = clamp(this.pitch, this.minPitch, this.maxPitch)
			this.radius = this.minRadius + (this.maxRadius - this.minRadius) * this.zoomT * this.zoomT
			this.clampPan()

			const th = this.theta * DEG, cp = Mc(this.pitch * DEG)
			const back = V3(cp * Mc(th), Ms(this.pitch * DEG), cp * Ms(th))
			const right = NormV3(CrossV3(V3(0, 1, 0), back))
			const up = CrossV3(back, right)
			this.rotMat = Mat4FromBasis(right, up, back)
			this.offset = V3(0, 0, this.radius)
		},

		getEye() {
			return AddV3(this.p, Mat4MulDir(this.rotMat, this.offset))
		},

		getBasis() {
			const eye = this.getEye()
			return {
				eye,
				forward: NormV3(SubV3(this.p, eye)),
				right: V3(this.rotMat[0], this.rotMat[1], this.rotMat[2]),
				up: V3(this.rotMat[4], this.rotMat[5], this.rotMat[6])
			}
		},

		getViewProj() {
			const view = Mat4LookAt(this.getEye(), this.p, V3(0, 1, 0))
			const proj = Mat4Perspective(this.fov, this.aspect, this.near, this.far)
			return Mat4Multiply(proj, view)
		},

		// Reconstructs a pick ray straight from the camera basis + fov,
		// no inverse-matrix unproject needed (see docs/camera.md).
		screenPointToRay(ndcX, ndcY) {
			const { eye, forward, right, up } = this.getBasis()
			const halfH = Math.tan(this.fov / 2)
			const halfW = halfH * this.aspect
			const dir = NormV3(AddV3(forward, AddV3(
				ScaleV3(right, ndcX * halfW),
				ScaleV3(up, ndcY * halfH)
			)))
			return { origin: eye, dir }
		}
	}
	return cam
}

// Ray vs the y=0 ground plane; null if near-parallel or behind the camera.
function planeHit(ray) {
	const dy = ray.dir[1]
	if (dy > -1e-4 && dy < 1e-4) return null
	const t = -ray.origin[1] / dy
	if (t <= 0) return null
	return AddV3(ray.origin, ScaleV3(ray.dir, t))
}

// Shared camera input for the interactive scenes: RMB drag orbits (vertical
// inverted - both deltas negated), LMB drag pans along the ground, wheel
// zooms. Fixed-framing states (menu) just call camera.upd(dt) instead.
// 143 deg per unit-drag ~= the old 2.5 rad.
function ApplyCameraInput(ctx, dt) {
	const inp = ctx.input
	if (inp.btn === 2) ctx.camera.rot(-inp.pdx * 143, -inp.pdy * 143)
	ctx.camera.zm(inp.wheel * 0.0005) // wheel -> fixed step on the 0..1 zoomT
	ctx.camera.upd(dt)
	if (inp.btn === 0) ctx.camera.panFromScreen([inp.px - inp.pdx, inp.py - inp.pdy], [inp.px, inp.py])
}

function SetCameraViewport(camera, width, height) {
	camera.aspect = width / height
}
