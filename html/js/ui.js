// DOM overlay UI: exactly two widgets, text panel and button.
// Relative sizing comes from CSS vmin units in html/index.html, not JS.
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
