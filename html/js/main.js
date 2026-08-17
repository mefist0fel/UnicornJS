// State machine + game loop. See docs/architecture.md.

var canvas = document.getElementById('c')
var gl = InitGL(canvas)
var camera = CreateCamera()
var state = -1
var lastTime = 0

InitEntitySystem(gl)
InitUI()
CreateInput(canvas, camera, OnPick)

function OnPick(ndcX, ndcY) {
	const hit = PickEntity(camera, ndcX, ndcY)
	if (hit && hit.onClick) hit.onClick()
}

function SetState(id) {
	state = id
	ClearEntities()
	ClearUI()
	if (id == MENU) EnterMenu()
	else if (id == SOLAR) EnterSolar()
	else if (id == PLANET) EnterPlanet(selectedPlanet)
}

function Resize() {
	const w = window.innerWidth
	const h = window.innerHeight
	canvas.width = w
	canvas.height = h
	gl.viewport(0, 0, w, h)
	SetCameraViewport(camera, w, h)
}
document.addEventListener('resize', Resize)
Resize()

function Frame(now) {
	const dt = Math.min(0.05, (now - lastTime) / 1000)
	lastTime = now
	camera.update(dt)
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
	RenderEntities(gl, camera)
	requestAnimationFrame(Frame)
}

SetState(MENU)
lastTime = performance.now()
requestAnimationFrame(Frame)
