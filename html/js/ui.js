// DOM overlay UI: three widgets - text panel, button (plain and hold), fill
// bar. Relative sizing comes from CSS vmin units in html/index.html, not JS.
// See docs/ui.md.

var uiRoot = null

function InitUI() {
	uiRoot = document.getElementById('ui')
}

function ClearUI() {
	uiRoot.innerHTML = ''
}

function CreatePanel(text, anchor = 'top') {
	const el = document.createElement('div')
	el.className = 'panel ' + anchor
	el.textContent = text
	uiRoot.appendChild(el)
	return el
}

function CreateButton(text, anchor, onClick) {
	const el = document.createElement('div')
	el.className = 'button ' + anchor
	el.textContent = text
	el.onclick = e => { Sfx.click(); if (onClick) onClick(e) }
	uiRoot.appendChild(el)
	return el
}

// Same widget as CreateButton (same .button class/anchor), wired to
// press-and-hold instead of click - battle_state's abilities are held down
// rather than tapped. pointerleave/pointercancel also count as "released"
// so a drag-off or a lost pointer can't strand an ability stuck on.
function CreateHoldButton(text, anchor, onDown, onUp) {
	const el = document.createElement('div')
	el.className = 'button ' + anchor
	el.textContent = text
	el.addEventListener('pointerdown', onDown)
	el.addEventListener('pointerup', onUp)
	el.addEventListener('pointerleave', onUp)
	el.addEventListener('pointercancel', onUp)
	uiRoot.appendChild(el)
	return el
}

// Health is shown with no dedicated widget: a text-less .slotlife block whose
// inline `background: linear-gradient(90deg, green X%, dark X%)` is the fill -
// same trick as the pending-build button. ship_state.js drives one for the
// ship, one per built support corvette, and a right-column list for hostiles.
