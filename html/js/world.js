// Solar-system content shared by menu.js (background) and solar.js
// (playable) - kept out of both state files so it isn't duplicated.
// See docs/architecture.md.

const PLANETS = [
	{ name: 'Розовый единорог', color: [1, 0.5, 0.8], dist: 5 },
	{ name: 'Оранжевая радуга', color: [1, 0.6, 0.2], dist: 7.5 },
	{ name: 'Мятный простор', color: [0.4, 1, 0.7], dist: 10 }
]

// Creates the sun + planet objects into ctx.objects and returns them, so
// the calling state can remove exactly these on OnExit.
function BuildSolarSystem(ctx, clickable) {
	const made = []
	const sun = CreateSphereObject(ctx.gl, V3(0, 0, 0), 1.6, [1, 0.95, 0.4])
	ctx.objects.push(sun)
	made.push(sun)
	for (let i = 0; i < PLANETS.length; i++) {
		const p = PLANETS[i]
		const a = i * 2.2
		const pos = V3(Math.cos(a) * p.dist, 0, Math.sin(a) * p.dist)
		const e = CreateSphereObject(ctx.gl, pos, 0.7, p.color)
		if (clickable) e.onClick = () => SetState(CreatePlanetState(p))
		ctx.objects.push(e)
		made.push(e)
	}
	return made
}

function RemoveObjects(ctx, list) {
	for (let i = 0; i < list.length; i++) {
		const idx = ctx.objects.indexOf(list[i])
		if (idx !== -1) ctx.objects.splice(idx, 1)
	}
}
