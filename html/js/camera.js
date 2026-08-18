// Orbital camera. Like any object it has a position (the handle the camera
// orbits - where the "center of coordinates" sits) plus an offset and a
// rotation matrix: eye = position + rotMat * offset. theta/phi/radius are
// the control state (driven by input/auto-rotate) that rotMat/offset are
// rebuilt from every update(). See docs/camera.md for the reasoning.

function CreateCamera() {
	const cam = {
		position: V3(0, 0, 0),
		offset: V3(0, 0, 8),
		rotMat: Mat4FromBasis(V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1)),
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

		// Called by state OnEnter() when entering a scene - swaps the limits,
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

			const st = Math.sin(this.phi)
			const back = V3(st * Math.cos(this.theta), Math.cos(this.phi), st * Math.sin(this.theta))
			const right = NormV3(CrossV3(V3(0, 1, 0), back))
			const up = CrossV3(back, right)
			this.rotMat = Mat4FromBasis(right, up, back)
			this.offset = V3(0, 0, this.radius)
		},

		getEye() {
			return AddV3(this.position, Mat4MulDir(this.rotMat, this.offset))
		},

		getBasis() {
			const eye = this.getEye()
			return {
				eye,
				forward: NormV3(SubV3(this.position, eye)),
				right: V3(this.rotMat[0], this.rotMat[1], this.rotMat[2]),
				up: V3(this.rotMat[4], this.rotMat[5], this.rotMat[6])
			}
		},

		getViewProj() {
			const view = Mat4LookAt(this.getEye(), this.position, V3(0, 1, 0))
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
