// Bootstrap + state machine + game loop. See docs/architecture.md.

const canvas = document.getElementById('c')
const ctx = {
	gl: InitGL(canvas),
	objects: [],
	camera: CreateCamera(),
	input: CreateInput(canvas)
}
let currentState = null
let lastTime = 0

InitObjectRenderer(ctx.gl)
InitUI()

// Switching state is just swapping currentState for another state instance;
// this wrapper is what makes that swap also call OnExit/OnEnter. It does
// *not* touch ctx.objects - states clean up their own objects if they want to
// (see RemoveObjects in world.js), the object graph itself is never reset.
function SetState(next) {
	if (currentState && currentState.OnExit) currentState.OnExit(ctx)
	ClearUI()
	currentState = next
	if (currentState.OnEnter) currentState.OnEnter(ctx)
}

function Resize() {
	const w = window.innerWidth
	const h = window.innerHeight
	canvas.width = w
	canvas.height = h
	ctx.gl.viewport(0, 0, w, h)
	SetCameraViewport(ctx.camera, w, h)
}
window.addEventListener('resize', Resize)
Resize()

function Frame(now) {
	const dt = Math.min(0.05, (now - lastTime) / 1000)
	lastTime = now

	currentState.OnUpdate(ctx, dt)

	ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT | ctx.gl.DEPTH_BUFFER_BIT)
	const viewProj = ctx.camera.getViewProj()
	for (let i = 0; i < ctx.objects.length; i++) ctx.objects[i].render(viewProj)

	ctx.input.update()
	requestAnimationFrame(Frame)
}

SetState(CreateMenuState())
lastTime = performance.now()
requestAnimationFrame(Frame)
