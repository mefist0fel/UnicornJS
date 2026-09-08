// Scene objects: no entity array/systems here - each state owns a list of
// object instances inside its context (ctx.objects) and pushes/removes them
// itself. Objects share position (also used later for depth sorting) and a
// render() method - an object draws itself, no generic render system walks
// a components table. See docs/architecture.md.

var objProgram = null
var objLoc = null

// Set once per frame by main.js before the render loop, not passed through
// render(viewProj) - only the planet shader needs them (eye for the rim
// light, time for the drift animation), so globals spare every other
// object's render() call from carrying unused arguments.
var camEyePos = V3(0, 0, 0)
var gTime = 0

// Flat-lit solid-colour shader for cubes/rings/lines. GLSL identifiers are
// 1-char to save bytes (they're the JS<->shader contract, so the
// getAttribLocation/getUniformLocation names below match). Readable form:
//   VS: attribute vec3 aPos; attribute vec3 aNormal; uniform mat4 uMvp;
//       varying vec3 vNormal;
//       void main(){ vNormal=aNormal; gl_Position=uMvp*vec4(aPos,1.); }
//   FS: uniform vec3 uColor; uniform vec3 uEmissive; varying vec3 vNormal;
//       // uEmissive is added on top of the lit diffuse term (light the
//       // surface gives off - lava cracks etc.), not multiplied.
//       void main(){ vec3 L=normalize(vec3(.4,.8,.5));
//         float f=max(dot(normalize(vNormal),L),0.);
//         gl_FragColor=vec4(uColor*(.35+.65*f)+uEmissive,1.); }
const objVS = `attribute vec3 a;attribute vec3 b;uniform mat4 c;varying vec3 n;void main(){n=b;gl_Position=c*vec4(a,1.);}`
const objFS = `precision mediump float;uniform vec3 d;uniform vec3 e;varying vec3 n;void main(){vec3 l=normalize(vec3(.4,.8,.5));float f=max(dot(normalize(n),l),0.);gl_FragColor=vec4(d*(.35+.65*f)+e,1.);}`

function InitObjectRenderer(gl) {
	objProgram = CreateProgram(gl, objVS, objFS)
	objLoc = {
		aPos: gl.getAttribLocation(objProgram, 'a'),
		aNormal: gl.getAttribLocation(objProgram, 'b'),
		uMvp: gl.getUniformLocation(objProgram, 'c'),
		uColor: gl.getUniformLocation(objProgram, 'd'),
		uEmissive: gl.getUniformLocation(objProgram, 'e')
	}
}

// One type of object, different mesh-generation "innards" per flavor
// (sphere vs. cube today). Meshes are uploaded per instance - not shared -
// so each sphere can carry its own tessellation settings.
// `scale` lives on the object (this.scale), not just closed over, so a
// caller can animate it after creation - battle_state's hit-impact "explode"
// effect (grow then shrink over its lifetime) is the one thing that needs
// this; every other object just leaves it untouched after creation.
function CreateMeshObject(gl, position, mesh, scale, color, emissive) {
	const buf = UploadMesh(gl, mesh)
	return {
		position,
		scale,
		color,
		emissive: emissive || [0, 0, 0],
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

			const mvp = Mat4Multiply(viewProj, Mat4TranslateScale(this.position, this.scale))
			gl.uniformMatrix4fv(objLoc.uMvp, false, mvp)
			gl.uniform3fv(objLoc.uColor, this.color)
			gl.uniform3fv(objLoc.uEmissive, this.emissive)
			gl.drawElements(gl.TRIANGLES, buf.count, gl.UNSIGNED_SHORT, 0)
		}
	}
}

function CreateSphereObject(gl, position, radius, color, latBands = 12, lonBands = 16, emissive) {
	const o = CreateMeshObject(gl, position, GenSphereMesh(latBands, lonBands), radius, color, emissive)
	o.radius = radius // bounding radius, also used for picking
	return o
}

function CreateCubeObject(gl, position, size, color) {
	return CreateMeshObject(gl, position, GenCubeMesh(), size, color)
}

// Thin flat orbit-line ring (see GenRingMesh, geometry.js) - `radius` is the
// orbit's own radius, the ring mesh is authored at radius 1 so a uniform
// scale by `radius` both sizes and positions its thickness correctly. Never
// clickable (no onClick/.radius bounding sphere is set), so PickObject just
// skips it like it skips any other non-interactive object.
function CreateRingObject(gl, position, radius, color) {
	return CreateMeshObject(gl, position, GenRingMesh(), radius, color)
}

// A flat thin ribbon lying in the y=0 plane between two world points - the
// "reachable" line from the current star to the selected one (galaxy_state).
// Both endpoints are baked into the mesh (model matrix stays identity), so no
// rotation support in Mat4TranslateScale is needed. Double-wound so it's
// visible from either side.
function CreateLineObject(gl, a, b, color, width = 0.09) {
	const d = NormV3(SubV3(b, a))
	const perp = ScaleV3(NormV3(V3(-d[2], 0, d[0])), width / 2)
	const p0 = SubV3(a, perp), p1 = AddV3(a, perp), p2 = AddV3(b, perp), p3 = SubV3(b, perp)
	const positions = [
		p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]
	]
	const normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]
	const indices = [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]
	return CreateMeshObject(gl, V3(0, 0, 0), { positions, normals, indices }, 1, color)
}

// A spherical shell of white cubes as the star-sky backdrop. Points are
// sampled in a cube and kept only if MIN < |p| < R, so the result is roughly
// uniform on the sphere. The shell sits far outside everything (R ~7500, past
// the outer deco orbits) and its size is scaled to match, so apparent star
// size is unchanged - and main.js re-centres it on the camera eye every frame,
// making it an infinitely-distant skybox (zero parallax) rather than fixed
// geometry the true-scale system could fly past. `basePos` is the shell-space
// offset main.js adds the eye to. Rendered before ctx.objects, state-independent.
function CreateStarfield(gl, count = 180) {
	const out = []
	const R = 7500
	while (out.length < count) {
		const p = V3((Mr() * 2 - 1) * R, (Mr() * 2 - 1) * R, (Mr() * 2 - 1) * R)
		const d = LenV3(p)
		if (d < 5500 || d > R) continue
		const o = CreateCubeObject(gl, p, 10 + Mr() * Mr() * 45, [1, 1, 1])
		o.basePos = p
		out.push(o)
	}
	return out
}

// Ship marker - same "cube" shape as CreateCubeObject, but built from the
// string-encoded mesh (see geometry.js) as its one real use in the game.
// The encoded cube's corners sit at +-1 rather than +-0.5, hence the extra
// 0.5 scale factor to match the visual size of a hand-coded cube.
function CreateShipObject(gl, position, color, scale = 0.5) {
	return CreateMeshObject(gl, position, GenEncodedCubeMesh(), scale, color)
}

// A handful of small cubes evenly spaced on a circle, continuously
// rotating - the "selector" visual used for current/selected star or planet
// (galaxy_state/system_state) and for the red "has an event" marker on a
// planet (system_state). Not a scene object itself (no render()) - callers
// push .objs into ctx.objects and drive .update() every frame with a
// growing angle, same idiom as the ship orbiting a body.
function CreateOrbitMarkers(gl, count, size, color) {
	const objs = []
	for (let i = 0; i < count; i++) objs.push(CreateCubeObject(gl, V3(0, 0, 0), size, color))
	return {
		objs,
		update(center, radius, angle) {
			for (let i = 0; i < count; i++) {
				const a = angle + i * PI * 2 / count
				objs[i].position = V3(center[0] + Mc(a) * radius, center[1], center[2] + Ms(a) * radius)
			}
		}
	}
}

// ---- planets & stars: one triplanar shader ----
//
// A sphere doesn't get a solid color - it gets a surface. The shared
// value-noise texture (texture.js) is sampled triplanar-style (three planar
// projections of the object-space position, blended by abs(normal)^4 so the
// seams where planes meet are hidden), and the blended noise value indexes a
// gradient ramp ("height -> color"). uEmissive fades from a lit planet (0)
// to a self-lit star with a rim glow (1) - a sun is just this shader with an
// emissive ramp. uDrift * gTime slides the sample position over time: 0 for
// rock, a horizontal push for gas-giant bands, a slow churn for stars. See
// docs/texture.md and docs/architecture.md.
var planetProgram = null
var planetLoc = null
var noiseTex = null

// GLSL identifiers 1-char to save bytes; the getXxxLocation names below match.
// Readable form (a=aPos b=aNormal c=uMvp m=uModel N=uNoise R=uRamp
// P=uPlaneScale O=uOffset D=uDrift T=uTime E=uEmissive Y=uEye
// p=vObjPos W=vWorldPos n=vNormal):
//   VS: p=aPos; n=aNormal; W=(uModel*vec4(aPos,1.)).xyz;
//       gl_Position=uMvp*vec4(aPos,1.);
//   FS: vec3 n=normalize(vNormal);
//       vec3 w=pow(abs(n),vec3(4.));  w/=w.x+w.y+w.z;
//       vec3 q=vObjPos*uPlaneScale + uOffset + uTime*uDrift;
//       float h = triplanar sample of uNoise by q.yz/q.zx/q.xy blended by w;
//       vec3 col = texture2D(uRamp, vec2(clamp(h,.02,.98),.5)).rgb;
//       float d=max(dot(n,normalize(vec3(.4,.8,.5))),0.);
//       vec3 lit=col*(.3+.7*d);
//       float rim=pow(1.-max(dot(n,normalize(uEye-vWorldPos)),0.),3.);
//       vec3 glow=col + rim*vec3(1.,.95,.85)*.6;
//       gl_FragColor=vec4(mix(lit,glow,uEmissive),1.);
const planetVS = `attribute vec3 a;attribute vec3 b;uniform mat4 c;uniform mat4 m;varying vec3 p;varying vec3 W;varying vec3 n;void main(){p=a;n=b;W=(m*vec4(a,1.)).xyz;gl_Position=c*vec4(a,1.);}`
const planetFS = `precision mediump float;uniform sampler2D N;uniform sampler2D R;uniform vec3 P;uniform vec3 O;uniform vec3 D;uniform float T;uniform float E;uniform vec3 Y;varying vec3 p;varying vec3 W;varying vec3 n;void main(){vec3 x=normalize(n);vec3 w=pow(abs(x),vec3(4.));w/=w.x+w.y+w.z;vec3 q=p*P+O+T*D;float h=texture2D(N,q.yz).r*w.x+texture2D(N,q.zx).r*w.y+texture2D(N,q.xy).r*w.z;vec3 c=texture2D(R,vec2(clamp(h,.02,.98),.5)).rgb;float d=max(dot(x,normalize(vec3(.4,.8,.5))),0.);vec3 l=c*(.3+.7*d);float r=pow(1.-max(dot(x,normalize(Y-W)),0.),3.);vec3 g=c+r*vec3(1.,.95,.85)*.6;gl_FragColor=vec4(mix(l,g,E),1.);}`

function InitPlanetRenderer(gl) {
	planetProgram = CreateProgram(gl, planetVS, planetFS)
	planetLoc = {
		aPos: gl.getAttribLocation(planetProgram, 'a'),
		aNormal: gl.getAttribLocation(planetProgram, 'b'),
		uMvp: gl.getUniformLocation(planetProgram, 'c'),
		uModel: gl.getUniformLocation(planetProgram, 'm'),
		uNoise: gl.getUniformLocation(planetProgram, 'N'),
		uRamp: gl.getUniformLocation(planetProgram, 'R'),
		uPlaneScale: gl.getUniformLocation(planetProgram, 'P'),
		uOffset: gl.getUniformLocation(planetProgram, 'O'),
		uDrift: gl.getUniformLocation(planetProgram, 'D'),
		uTime: gl.getUniformLocation(planetProgram, 'T'),
		uEmissive: gl.getUniformLocation(planetProgram, 'E'),
		uEye: gl.getUniformLocation(planetProgram, 'Y')
	}
	noiseTex = GenNoiseTexture(gl, 64)
}

// rampTex is a ramp texture (GetRamp, texture.js). planeScale/offset/drift
// are vec3 arrays; emissive is 0..1. Keeps .radius for picking and honors
// this.scale in the model matrix, same as CreateMeshObject.
function CreatePlanetObject(gl, position, radius, rampTex, planeScale, offset, drift, emissive, latBands = 16, lonBands = 22) {
	const buf = UploadMesh(gl, GenSphereMesh(latBands, lonBands))
	return {
		position,
		scale: radius,
		radius,
		rampTex,
		planeScale,
		offset,
		drift,
		emissive,
		onClick: null,
		render(viewProj) {
			gl.useProgram(planetProgram)

			gl.bindBuffer(gl.ARRAY_BUFFER, buf.posBuf)
			gl.enableVertexAttribArray(planetLoc.aPos)
			gl.vertexAttribPointer(planetLoc.aPos, 3, gl.FLOAT, false, 0, 0)

			gl.bindBuffer(gl.ARRAY_BUFFER, buf.normBuf)
			gl.enableVertexAttribArray(planetLoc.aNormal)
			gl.vertexAttribPointer(planetLoc.aNormal, 3, gl.FLOAT, false, 0, 0)

			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.idxBuf)

			gl.activeTexture(gl.TEXTURE0)
			gl.bindTexture(gl.TEXTURE_2D, noiseTex)
			gl.uniform1i(planetLoc.uNoise, 0)
			gl.activeTexture(gl.TEXTURE1)
			gl.bindTexture(gl.TEXTURE_2D, this.rampTex)
			gl.uniform1i(planetLoc.uRamp, 1)

			const model = Mat4TranslateScale(this.position, this.scale)
			gl.uniformMatrix4fv(planetLoc.uMvp, false, Mat4Multiply(viewProj, model))
			gl.uniformMatrix4fv(planetLoc.uModel, false, model)
			gl.uniform3fv(planetLoc.uPlaneScale, this.planeScale)
			gl.uniform3fv(planetLoc.uOffset, this.offset)
			gl.uniform3fv(planetLoc.uDrift, this.drift)
			gl.uniform1f(planetLoc.uTime, gTime)
			gl.uniform1f(planetLoc.uEmissive, this.emissive)
			gl.uniform3fv(planetLoc.uEye, camEyePos)
			gl.drawElements(gl.TRIANGLES, buf.count, gl.UNSIGNED_SHORT, 0)
		}
	}
}

// Bulk add/remove for ctx.objects - states use these in OnEnter/OnExit to
// register and then clean up exactly the objects they own, see
// docs/architecture.md.
function PushObjects(ctx, list) {
	for (let i = 0; i < list.length; i++) ctx.objects.push(list[i])
}
function RemoveObjects(ctx, list) {
	for (let i = 0; i < list.length; i++) {
		const idx = ctx.objects.indexOf(list[i])
		if (idx !== -1) ctx.objects.splice(idx, 1)
	}
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
	const t = -b - Msqrt(disc)
	return t > 0 ? t : null
}
