// Debug menu: a tiny "D" button (top-left) that toggles a stacked column of
// one-tap command buttons. DEBUG_GLOBAL commands are always present; a state
// passes its own (e.g. ship_state passes enemy-spawn closures). Everything is
// a normal .button, so ClearUI() on the next SetState wipes it like any widget.
// Add a command = add one { label, run } entry. See docs/ui.md.

// Compile-time flag: true here (dev / --skip-minify / index.dev.html), but
// build.py rewrites it to `!1` in the concatenated bundle before closure, so
// the release DCEs every `if (DEBUG) ...` block and this whole file with it.
const DEBUG = true

const DEBUG_GLOBAL = [
	{ label: '+50 Metal', run: () => AddRes(RES_METAL, 50) },
	{ label: '+10 Fuel', run: () => AddRes(RES_FUEL, 10) },
	{ label: 'Mute/unmute', run: () => ToggleMute() }
]

function CreateDebugMenu(extra) {
	const cmds = DEBUG_GLOBAL.concat(extra || [])
	let items = []
	let open = false

	function close() {
		for (const el of items) el.remove()
		items = []
	}

	const btn = CreateButton('D', 'dbg', () => {
		open = !open
		close()
		if (!open) return
		for (let i = 0; i < cmds.length; i++) {
			const b = CreateButton(cmds[i].label, 'dbg', cmds[i].run)
			b.className += ' sb'
			b.style.top = (7 + i * 3.4) + 'vmin'
			b.style.background = '#1a1c22' // opaque - the open menu covers the editor rows
			items.push(b)
		}
	})
	// keep the toggle a small square, not a full-width slot row
	btn.style.padding = '0.4vmin 1.4vmin'
	btn.style.fontSize = '1.8vmin'
}
