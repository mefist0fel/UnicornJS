// Solar-system content for a single star: generated once per star index,
// lazily on first visit, then cached forever in systemCache - both the
// data (dialogDone/battleDone flags and searched-out resources must
// survive revisits) and the render objects themselves (no GL buffer churn
// on repeat visits). See docs/architecture.md.

const SYSTEM_PLANET_MIN = 2
const SYSTEM_PLANET_MAX = 4
const PLANET_COLORS = [[1, 0.5, 0.8], [1, 0.6, 0.2], [0.4, 1, 0.7], [0.6, 0.6, 1], [1, 0.9, 0.4]]

var systemCache = {}

function GetSystem(ctx, starIndex) {
	let sys = systemCache[starIndex]
	if (sys) return sys

	const star = CreateSphereObject(ctx.gl, V3(0, 0, 0), 1.6, [1, 0.95, 0.4])
	const count = SYSTEM_PLANET_MIN + Math.floor(Math.random() * (SYSTEM_PLANET_MAX - SYSTEM_PLANET_MIN + 1))
	const planets = []
	for (let i = 0; i < count; i++) {
		const dist = 4 + i * 2.5
		const angle = Math.random() * Math.PI * 2
		const pos = V3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist)
		const color = PLANET_COLORS[Math.floor(Math.random() * PLANET_COLORS.length)]
		const resources = [0, 0, 0]
		for (let r = 0; r < 3; r++) resources[Math.floor(Math.random() * RES_COUNT)]++
		planets.push({
			name: 'Planet ' + (i + 1),
			object: CreateSphereObject(ctx.gl, pos, 0.8, color),
			color,
			hasDialog: Math.random() < 0.6,
			hasBattle: Math.random() < 0.5,
			dialogDone: false,
			battleDone: false,
			resources
		})
	}
	sys = { star, planets }
	systemCache[starIndex] = sys
	return sys
}

function SearchPlanet(planet) {
	for (let i = 0; i < RES_COUNT; i++) {
		AddRes(i, planet.resources[i])
		planet.resources[i] = 0
	}
}

// Decides which sub-state a planet visit should open next, in the fixed
// order dialog -> battle -> overview, skipping steps that are absent or
// already consumed. `from` is where we're arriving from: 'jump' (just
// landed), 'dialog' (dialog just finished) or 'battle' (battle just
// finished) - overview never leads anywhere via this function, it's
// revisited freely instead.
function NextPlanetState(planet, from) {
	if (from === 'jump' && planet.hasDialog && !planet.dialogDone) return CreateDialogState(planet)
	if (from !== 'battle' && planet.hasBattle && !planet.battleDone) return CreateBattleState(planet)
	return CreateOverviewState(planet)
}
