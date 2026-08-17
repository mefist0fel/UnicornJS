// ECS-lite: entities are plain objects in a flat array, components are just
// fields on them (position+radius = sphere shape, color = material,
// onClick = clickable). Systems below only look at the fields they need.
// See docs/architecture.md.

var entities = []

var sphereMesh = null
var sphereProgram = null
var sphereLoc = null

const sphereVS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uMvp;
varying vec3 vNormal;
void main() {
	vNormal = aNormal;
	gl_Position = uMvp * vec4(aPos, 1.0);
}
`

const sphereFS = `
precision mediump float;
uniform vec3 uColor;
varying vec3 vNormal;
void main() {
	vec3 light = normalize(vec3(0.4, 0.8, 0.5));
	float diff = max(dot(normalize(vNormal), light), 0.0);
	gl_FragColor = vec4(uColor * (0.35 + 0.65 * diff), 1.0);
}
`

function InitEntitySystem(gl) {
	sphereMesh = CreateSphereMesh(gl)
	sphereProgram = CreateProgram(gl, sphereVS, sphereFS)
	sphereLoc = {
		aPos: gl.getAttribLocation(sphereProgram, 'aPos'),
		aNormal: gl.getAttribLocation(sphereProgram, 'aNormal'),
		uMvp: gl.getUniformLocation(sphereProgram, 'uMvp'),
		uColor: gl.getUniformLocation(sphereProgram, 'uColor')
	}
}

function CreateSphereEntity(position, radius, color) {
	const e = { position, radius, color, onClick: null }
	entities.push(e)
	return e
}

function ClearEntities() {
	entities.length = 0
}

// render system: draws every entity that has position+radius+color
function RenderEntities(gl, camera) {
	const viewProj = camera.getViewProj()
	gl.useProgram(sphereProgram)

	gl.bindBuffer(gl.ARRAY_BUFFER, sphereMesh.posBuf)
	gl.enableVertexAttribArray(sphereLoc.aPos)
	gl.vertexAttribPointer(sphereLoc.aPos, 3, gl.FLOAT, false, 0, 0)

	gl.bindBuffer(gl.ARRAY_BUFFER, sphereMesh.normBuf)
	gl.enableVertexAttribArray(sphereLoc.aNormal)
	gl.vertexAttribPointer(sphereLoc.aNormal, 3, gl.FLOAT, false, 0, 0)

	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereMesh.idxBuf)

	for (let i = 0; i < entities.length; i++) {
		const e = entities[i]
		const mvp = Mat4Multiply(viewProj, Mat4Sphere(e.position, e.radius))
		gl.uniformMatrix4fv(sphereLoc.uMvp, false, mvp)
		gl.uniform3fv(sphereLoc.uColor, e.color)
		gl.drawElements(gl.TRIANGLES, sphereMesh.count, gl.UNSIGNED_SHORT, 0)
	}
}

// pick system: nearest entity with onClick hit by the ray, or null
function PickEntity(camera, ndcX, ndcY) {
	const ray = camera.screenPointToRay(ndcX, ndcY)
	let closest = null
	let closestT = Infinity
	for (let i = 0; i < entities.length; i++) {
		const e = entities[i]
		if (!e.onClick) continue
		const t = IntersectSphere(ray.origin, ray.dir, e.position, e.radius)
		if (t !== null && t < closestT) {
			closestT = t
			closest = e
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
