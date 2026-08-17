// Orbital camera: spherical coords around a target, per-scene constraints.
// See docs/camera.md for the math and the reasoning behind the constraints.

function CreateCamera() {
	const cam = {
		target: V3(0, 0, 0),
		theta: 0,
		phi: Math.PI / 3,
		radius: 8,
		minPhi: 0.05,
		maxPhi: Math.PI - 0.05,
		minRadius: 3,
		maxRadius: 20,
		autoSpeed: 0,
		fov: 50 * Math.PI / 180,
		aspect: 1,
		near: 0.1,
		far: 200,

		// Called by SetState() when entering a scene - swaps the limits,
		// does not teleport the camera (out-of-range phi/radius just clamp
		// on the next update()).
		setConstraints(c) {
			this.minPhi = c.minPhi
			this.maxPhi = c.maxPhi
			this.minRadius = c.minRadius
			this.maxRadius = c.maxRadius
			this.autoSpeed = c.autoSpeed || 0
		},

		rotate(dTheta, dPhi) {
			this.theta += dTheta
			this.phi += dPhi
		},

		zoom(dRadius) {
			this.radius += dRadius
		},

		update(dt) {
			if (this.autoSpeed) this.theta += this.autoSpeed * dt
			if (this.phi < this.minPhi) this.phi = this.minPhi
			if (this.phi > this.maxPhi) this.phi = this.maxPhi
			if (this.radius < this.minRadius) this.radius = this.minRadius
			if (this.radius > this.maxRadius) this.radius = this.maxRadius
		},

		getEye() {
			const st = Math.sin(this.phi)
			return AddV3(this.target, V3(
				this.radius * st * Math.cos(this.theta),
				this.radius * Math.cos(this.phi),
				this.radius * st * Math.sin(this.theta)
			))
		},

		getBasis() {
			const eye = this.getEye()
			const forward = NormV3(SubV3(this.target, eye))
			const right = NormV3(CrossV3(forward, V3(0, 1, 0)))
			const up = CrossV3(right, forward)
			return { eye, forward, right, up }
		},

		getViewProj() {
			const eye = this.getEye()
			const view = Mat4LookAt(eye, this.target, V3(0, 1, 0))
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

function SetCameraViewport(camera, width, height) {
	camera.aspect = width / height
}
