// Pointer input: drag rotates the orbital camera, wheel zooms,
// a short drag (below threshold) is treated as a click for 3D picking.

function CreateInput(canvas, camera, onPick) {
	let dragging = false
	let lastX = 0
	let lastY = 0
	let moved = 0

	function ndc(e) {
		const rect = canvas.getBoundingClientRect()
		return [
			((e.clientX - rect.left) / rect.width) * 2 - 1,
			-(((e.clientY - rect.top) / rect.height) * 2 - 1)
		]
	}

	canvas.addEventListener('pointerdown', e => {
		dragging = true
		moved = 0
		lastX = e.clientX
		lastY = e.clientY
		canvas.setPointerCapture(e.pointerId)
	})

	canvas.addEventListener('pointermove', e => {
		if (!dragging) return
		const dx = e.clientX - lastX
		const dy = e.clientY - lastY
		lastX = e.clientX
		lastY = e.clientY
		moved += Math.abs(dx) + Math.abs(dy)
		camera.rotate(-dx * 0.005, -dy * 0.005)
	})

	canvas.addEventListener('pointerup', e => {
		dragging = false
		if (moved < 6) {
			const [x, y] = ndc(e)
			onPick(x, y)
		}
	})

	canvas.addEventListener('wheel', e => {
		e.preventDefault()
		camera.zoom(e.deltaY * 0.01)
	}, { passive: false })
}
