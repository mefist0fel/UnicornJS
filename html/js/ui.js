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
	el.onclick = onClick
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

// Third widget, added for battle's HP/energy meters - a vertical fill bar
// anchored to a screen edge rather than a text/click widget. `.set(pct)`
// takes 0..100. See docs/ui.md.
function CreateBar(anchor, color) {
	const el = document.createElement('div')
	el.className = 'bar ' + anchor
	const fill = document.createElement('i')
	fill.style.background = color
	el.appendChild(fill)
	uiRoot.appendChild(el)
	return { el, set(pct) { fill.style.height = Math.max(0, Math.min(100, pct)) + '%' } }
}
