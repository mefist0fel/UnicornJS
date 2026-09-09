// Orbital camera. Like any object it has a position (the handle the camera
// orbits - where the "center of coordinates" sits) plus an offset and a
// rotation matrix: eye = position + rotMat * offset. theta/phi/radius are
// the control state (driven by input/auto-rotate) that rotMat/offset are
// rebuilt from every update(). RMB drag orbits (vertical inverted), LMB drag
// pans `position` along the y=0 ground plane, clamped to panRect (an empty
// Rect pins the camera at the center). See docs/camera.md for the reasoning.

const ZERO_RECT = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }

function CreateCamera() {
	const cam = {
		p: V3(), // position
		offset: V3(0, 0, 8),
		rotMat: Mat4FromBasis(V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1)),
		theta: 0,
		phi: PI / 3,
		// zoom is a normalised 0..1 "how far out" that the wheel nudges at a
		// FIXED rate; `radius` is derived from it in update() as
		// min + (max-min)*zoomT^2 - quadratic so a wheel notch barely moves the
		// camera up close and sweeps a lot when already far out. States that
		// think in world units call setDist(r) (back-solves zoomT).
		zoomT: 0.5,
		radius: 8,
		minPhi: 0.05,
		maxPhi: PI - 0.05,
		minRadius: 3,
		maxRadius: 20,
		autoSpeed: 0,
		panRect: ZERO_RECT,
		fov: 50 * PI / 180,
		aspect: 1,
		// far has to clear the true-scale system drawn in ship_state /
		// system_travel (a ~250-unit planet a few hundred units off, outer
		// bodies ~3600 out, and the camera-locked starfield shell at ~7500).
		// near is kept well above 0 for depth precision at that range - every
		// scene keeps its close geometry past ~0.3 units.
		near: 0.3,
		far: 10000,

		// Called by state OnEnter() when entering a scene - swaps the limits,
		// does not teleport the camera (out-of-range phi/radius/position just
		// clamp on the next update()).
		setConstraints(c) {
			this.minPhi = c.minPhi
			this.maxPhi = c.maxPhi
			this.minRadius = c.minRadius
			this.maxRadius = c.maxRadius
			this.autoSpeed = c.autoSpeed || 0
			this.panRect = c.panRect || ZERO_RECT
		},

		// short names (rot/zm/upd): closure won't rename `.rotate`/`.zoom`/`.update`
		// (DOM-extern collision), so we do it by hand - ~15 bytes. See optimization.md.
		rot(dTheta, dPhi) { // camera.rotate
			this.theta += dTheta
			this.phi += dPhi
		},

		zm(dZoom) { // camera.zoom - nudge the 0..1 zoomT
			this.zoomT = Mmin(1, Mmax(0, this.zoomT + dZoom))
		},

		// set the camera distance in world units - converts to zoomT via the
		// inverse of update()'s quadratic map. Call after setConstraints().
		setDist(r) {
			const span = this.maxRadius - this.minRadius
			const q = span > 0 ? Mmin(1, Mmax(0, (r - this.minRadius) / span)) : 0
			this.zoomT = Msqrt(q)
			this.radius = this.minRadius + span * this.zoomT * this.zoomT
		},

		// Move the orbit center so the ground point grabbed by prevNDC ends up
		// under curNDC - a "drag the map" pan. Both rays are intersected with
		// the y=0 plane; if either misses (looking at/above the horizon) the
		// frame's pan is skipped. Result is clamped to panRect.
		panFromScreen(prev, cur) {
			const a = planeHit(this.screenPointToRay(prev[0], prev[1]))
			const b = planeHit(this.screenPointToRay(cur[0], cur[1]))
			if (!a || !b) return
			this.p[0] += a[0] - b[0]
			this.p[2] += a[2] - b[2]
			this.clampPan()
		},

		clampPan() {
			const r = this.panRect
			if (this.p[0] < r.minX) this.p[0] = r.minX
			if (this.p[0] > r.maxX) this.p[0] = r.maxX
			if (this.p[2] < r.minZ) this.p[2] = r.minZ
			if (this.p[2] > r.maxZ) this.p[2] = r.maxZ
		},

		upd(dt) { // camera.update: rebuild rotMat/offset from theta/phi/zoomT
			if (this.autoSpeed) this.theta += this.autoSpeed * dt
			if (this.phi < this.minPhi) this.phi = this.minPhi
			if (this.phi > this.maxPhi) this.phi = this.maxPhi
			// quadratic zoom: zoomT (0..1) -> distance, always within [min,max]
			this.radius = this.minRadius + (this.maxRadius - this.minRadius) * this.zoomT * this.zoomT
			this.clampPan()

			const st = Ms(this.phi)
			const back = V3(st * Mc(this.theta), Mc(this.phi), st * Ms(this.theta))
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
function ApplyCameraInput(ctx, dt) {
	const inp = ctx.input
	if (inp.btn === 2) ctx.camera.rot(-inp.pdx * 2.5, -inp.pdy * 2.5)
	ctx.camera.zm(inp.wheel * 0.0005) // wheel -> fixed step on the 0..1 zoomT
	ctx.camera.upd(dt)
	if (inp.btn === 0) ctx.camera.panFromScreen([inp.px - inp.pdx, inp.py - inp.pdy], [inp.px, inp.py])
}

function SetCameraViewport(camera, width, height) {
	camera.aspect = width / height
}
