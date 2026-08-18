// Pointer input: independent of camera/state - just raw per-frame data
// (drag deltas, wheel delta, click position). Ported from the equivalent
// module in ../js13k_city/html/js/input.js. Applying it (rotating the
// camera, testing a pick) is each scene's job in its own OnUpdate.

function CreateInput(canvas) {
	let down = false
	let lastX = 0
	let lastY = 0
	let moved = 0

	const input = {
		dx: 0,
		dy: 0,
		wheel: 0,
		clicked: false,
		clickX: 0,
		clickY: 0,

		// Called once per frame by the game loop after the scene has read
		// this frame's deltas, so per-frame fields don't leak into the next.
		update() {
			this.dx = 0
			this.dy = 0
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

	canvas.addEventListener('pointerdown', e => {
		down = true
		moved = 0
		lastX = e.clientX
		lastY = e.clientY
		canvas.setPointerCapture(e.pointerId)
	})

	canvas.addEventListener('pointermove', e => {
		if (!down) return
		const dx = e.clientX - lastX
		const dy = e.clientY - lastY
		lastX = e.clientX
		lastY = e.clientY
		moved += Math.abs(dx) + Math.abs(dy)
		input.dx += dx
		input.dy += dy
	})

	canvas.addEventListener('pointerup', e => {
		down = false
		if (moved < 6) {
			const [x, y] = ndc(e)
			input.clicked = true
			input.clickX = x
			input.clickY = y
		}
	})

	canvas.addEventListener('wheel', e => {
		e.preventDefault()
		input.wheel += e.deltaY
	}, { passive: false })

	return input
}
