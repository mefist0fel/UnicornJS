// Battle draft: two cubes facing off, a bullet cube ping-ponging between
// them for a bit of life, and a single "Next" button - there's no real
// combat yet, advancing always costs 1 life (skip = passed through, still
// took a hit). See docs/architecture.md for the state contract, system.js
// for NextPlanetState.

function CreateBattleState(planet) {
	let mine = []
	let bullet = null
	let bulletT = 0

	function advance() {
		AddRes(RES_LIVES, -1)
		planet.battleDone = true
		SetState(NextPlanetState(planet, 'battle'))
	}

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({ minPhi: 1.1, maxPhi: 1.1, minRadius: 8, maxRadius: 8, autoSpeed: 0 })
			ctx.camera.theta = Math.PI / 2 // fighters sit apart along X, this puts X across the screen
			ctx.camera.phi = 1.1
			ctx.camera.radius = 8

			const fighter = CreateCubeObject(ctx.gl, V3(-2, 0, 0), 1, [0.9, 0.3, 0.3])
			const enemy = CreateCubeObject(ctx.gl, V3(2, 0, 0), 1, planet.color)
			bullet = CreateCubeObject(ctx.gl, V3(-2, 0, 0), 0.25, [1, 1, 0.4])
			mine = [fighter, enemy, bullet]
			ctx.objects.push(fighter, enemy, bullet)

			CreatePanel('A hostile ship blocks your way!', 'top')
			CreateButton('Next', 'bottomright', advance)
			bulletT = 0
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ctx.camera.update(dt)
			bulletT += dt
			const s = (Math.sin(bulletT * 3) + 1) / 2
			bullet.position = V3(-2 + s * 4, Math.sin(bulletT * 10) * 0.3, 0)
		}
	}
}
