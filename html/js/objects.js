// Scene objects: no entity array/systems here - each state owns a list of
// object instances inside its context (ctx.objects) and pushes/removes them
// itself. Objects share position (also used later for depth sorting) and a
// render() method - an object draws itself, no generic render system walks
// a components table. See docs/architecture.md.

var objProgram = null
var objLoc = null

const objVS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uMvp;
varying vec3 vNormal;
void main() {
	vNormal = aNormal;
	gl_Position = uMvp * vec4(aPos, 1.0);
}
`

const objFS = `
precision mediump float;
uniform vec3 uColor;
varying vec3 vNormal;
void main() {
	vec3 light = normalize(vec3(0.4, 0.8, 0.5));
	float diff = max(dot(normalize(vNormal), light), 0.0);
	gl_FragColor = vec4(uColor * (0.35 + 0.65 * diff), 1.0);
}
`

function InitObjectRenderer(gl) {
	objProgram = CreateProgram(gl, objVS, objFS)
	objLoc = {
		aPos: gl.getAttribLocation(objProgram, 'aPos'),
		aNormal: gl.getAttribLocation(objProgram, 'aNormal'),
		uMvp: gl.getUniformLocation(objProgram, 'uMvp'),
		uColor: gl.getUniformLocation(objProgram, 'uColor')
	}
}

// One type of object, different mesh-generation "innards" per flavor
// (sphere vs. cube today). Meshes are uploaded per instance - not shared -
// so each sphere can carry its own tessellation settings.
function CreateMeshObject(gl, position, mesh, scale, color) {
	const buf = UploadMesh(gl, mesh)
	return {
		position,
		color,
		onClick: null,
		render(viewProj) {
			gl.useProgram(objProgram)

			gl.bindBuffer(gl.ARRAY_BUFFER, buf.posBuf)
			gl.enableVertexAttribArray(objLoc.aPos)
			gl.vertexAttribPointer(objLoc.aPos, 3, gl.FLOAT, false, 0, 0)

			gl.bindBuffer(gl.ARRAY_BUFFER, buf.normBuf)
			gl.enableVertexAttribArray(objLoc.aNormal)
			gl.vertexAttribPointer(objLoc.aNormal, 3, gl.FLOAT, false, 0, 0)

			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.idxBuf)

			const mvp = Mat4Multiply(viewProj, Mat4TranslateScale(this.position, scale))
			gl.uniformMatrix4fv(objLoc.uMvp, false, mvp)
			gl.uniform3fv(objLoc.uColor, this.color)
			gl.drawElements(gl.TRIANGLES, buf.count, gl.UNSIGNED_SHORT, 0)
		}
	}
}

function CreateSphereObject(gl, position, radius, color, latBands = 12, lonBands = 16) {
	const o = CreateMeshObject(gl, position, GenSphereMesh(latBands, lonBands), radius, color)
	o.radius = radius // bounding radius, also used for picking
	return o
}

function CreateCubeObject(gl, position, size, color) {
	return CreateMeshObject(gl, position, GenCubeMesh(), size, color)
}

// pick system: nearest object with onClick+radius hit by the ray, or null
function PickObject(camera, ndcX, ndcY, objects) {
	const ray = camera.screenPointToRay(ndcX, ndcY)
	let closest = null
	let closestT = Infinity
	for (let i = 0; i < objects.length; i++) {
		const o = objects[i]
		if (!o.onClick || !o.radius) continue
		const t = IntersectSphere(ray.origin, ray.dir, o.position, o.radius)
		if (t !== null && t < closestT) {
			closestT = t
			closest = o
		}
	}
	return closest
}

// ray direction is assumed normalized, so the quadratic term is 1
function IntersectSphere(origin, dir, center, radius) {
	const oc = SubV3(origin, center)
	const b = DotV3(oc, dir)
	const c = DotV3(oc, oc) - radius * radius
	const disc = b * b - c
	if (disc < 0) return null
	const t = -b - Math.sqrt(disc)
	return t > 0 ? t : null
}
