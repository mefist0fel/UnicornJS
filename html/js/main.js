// Bootstrap + state machine + game loop. See docs/architecture.md.

const canvas = document.getElementById('c')
InitGL(canvas) // sets the module-scope `gl` (include.js) - do this before anything reads it
const ctx = {
	objects: [],
	camera: CreateCamera(),
	input: CreateInput(canvas)
}
let currentState = null
let lastTime = 0

InitObjectRenderer()
InitPlanetRenderer()
InitUI()
InitResHud()

// Star-sky backdrop: built once, drawn every frame behind ctx.objects,
// never owned by a state (see CreateStarfield in objects.js).
const starfield = CreateStarfield()

// Switching state is just swapping currentState for another state instance;
// this wrapper is what makes that swap also call OnExit/OnEnter. It does
// *not* touch ctx.objects - states clean up their own objects if they want to
// (see RemoveObjects in objects.js), the object graph itself is never reset.
function SetState(next) {
	if (currentState && currentState.OnExit) currentState.OnExit(ctx)
	ClearUI()
	currentState = next
	if (currentState.OnEnter) currentState.OnEnter(ctx)
}

function Resize() {
	const w = canvas.clientWidth
	const h = canvas.clientHeight
	canvas.width = w
	canvas.height = h
	gl.viewport(0, 0, w, h)
	SetCameraViewport(ctx.camera, w, h)
}
Resize()

function Frame(now) {
	const dt = Mmin(0.05, (now - lastTime) / 1000)
	lastTime = now

	// Checked every frame instead of only on a 'resize' event - covers cases
	// the event doesn't fire for (devtools panel toggling, some embedders),
	// and it's cheap since it's just two integer comparisons.
	if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) Resize()

	currentState.OnUpdate(ctx, dt)

	gl.clear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT)
	camEyePos = ctx.camera.getEye() // read by the planet shader (rim light), see objects.js
	gTime = now / 1000 // read by the planet shader (drift animation)
	const viewProj = ctx.camera.getViewProj()
	// starfield is a skybox: re-centre the shell on the eye so it never shifts
	// relative to the view, however far the true-scale system travels.
	for (let i = 0; i < starfield.length; i++) {
		starfield[i].position = AddV3(starfield[i].basePos, camEyePos)
		starfield[i].render(viewProj)
	}
	for (let i = 0; i < ctx.objects.length; i++) ctx.objects[i].render(viewProj)

	ctx.input.update()
	requestAnimationFrame(Frame)
}

SetState(CreateMenuState())
lastTime = performance.now()
requestAnimationFrame(Frame)
