// Player resources: everything in the game is a resource exchange, so
// instead of one field per resource we keep a flat array (res) indexed by
// named constants - "player state as a small array/dict", see
// docs/architecture.md. Add a resource by adding a RES_xxx constant, a
// name and a starting value; nothing else needs to change.

const RES_MONEY = 0
const RES_FUEL = 1
const RES_METAL = 2
const RES_COUNT = 3
const RES_NAMES = ['Money', 'Fuel', 'Metal']

const res = [20, 10, 100]

// The HUD (top-right, see #hud in index.html) lives outside #ui on purpose
// so state transitions (which ClearUI() the state-scoped panels/buttons)
// never touch it - see docs/ui.md.
var resHud = null

function InitResHud() {
	resHud = document.getElementById('hud')
	RenderResHud()
}

function AddRes(idx, amount) {
	res[idx] = Mmax(0, res[idx] + amount)
	RenderResHud()
}

function RenderResHud() {
	let text = ''
	for (let i = 0; i < RES_COUNT; i++) text += RES_NAMES[i] + ': ' + res[i] + '  '
	resHud.textContent = text
}
