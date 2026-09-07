// Pointer input: independent of camera/state - just raw per-frame data.
// Ported from ../js13k_city and then reworked for the two-button scheme:
// RMB drag = orbit, LMB drag = pan, wheel = zoom, LMB tap = pick (see
// docs/camera.md). Deltas are in NDC units (-1..1 across the viewport) so
// they don't depend on canvas pixel size; `btn` is the button currently held
// (0 left, 2 right, -1 none). The context menu is suppressed so RMB is free.

function CreateInput(canvas) {
	let btn = -1
	let lastNx = 0
	let lastNy = 0
	let lastPxX = 0
	let lastPxY = 0
	let movedPx = 0

	const input = {
		btn: -1,
		pdx: 0, // pointer delta this frame, NDC x (drag)
		pdy: 0, // pointer delta this frame, NDC y (drag)
		px: 0,  // current pointer position, NDC x
		py: 0,  // current pointer position, NDC y
		wheel: 0,
		clicked: false,
		clickX: 0,
		clickY: 0,

		// Called once per frame by the game loop after the scene has read
		// this frame's deltas. btn/px/py persist (they're state, not events).
		update() {
			this.pdx = 0
			this.pdy = 0
			this.wheel = 0
			this.clicked = false
		}
	}

	function ndc(e) {
		const rect = canvas.getBoundingClientRect()
		return [
			((e.clientX - rect.left) / rect.width) * 2 - 1,
			-(((e.clientY - rect.top) / rect.height) * 2 - 1)
		]
	}

	canvas.addEventListener('contextmenu', e => e.preventDefault())

	canvas.addEventListener('pointerdown', e => {
		btn = e.button
		input.btn = btn
		movedPx = 0
		lastPxX = e.clientX
		lastPxY = e.clientY
		const n = ndc(e)
		lastNx = n[0]
		lastNy = n[1]
		input.px = n[0]
		input.py = n[1]
		canvas.setPointerCapture(e.pointerId)
	})

	canvas.addEventListener('pointermove', e => {
		const n = ndc(e)
		input.px = n[0]
		input.py = n[1]
		if (btn < 0) return
		input.pdx += n[0] - lastNx
		input.pdy += n[1] - lastNy
		lastNx = n[0]
		lastNy = n[1]
		movedPx += Math.abs(e.clientX - lastPxX) + Math.abs(e.clientY - lastPxY)
		lastPxX = e.clientX
		lastPxY = e.clientY
	})

	canvas.addEventListener('pointerup', e => {
		if (btn === 0 && movedPx < 6) {
			const n = ndc(e)
			input.clicked = true
			input.clickX = n[0]
			input.clickY = n[1]
		}
		btn = -1
		input.btn = -1
	})

	canvas.addEventListener('wheel', e => {
		e.preventDefault()
		input.wheel += e.deltaY
	}, { passive: false })

	return input
}
