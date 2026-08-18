// Dialog draft: a speaker cube (stand-in for a flat portrait mesh later)
// plus a line of text and up to 4 choice buttons, stacked bottom-up with a
// manual per-element offset (ui.js's anchor system only centers a single
// full-width row per anchor, see docs/ui.md). Single-turn - whichever
// option is picked immediately consumes the dialog and advances. Camera
// stays fixed (min==max constraints, theta reset) so the framing is always
// the same regardless of what the player was doing before. See
// docs/architecture.md for the state contract, system.js for NextPlanetState.

function CreateDialogState(planet) {
	let mine = []
	const line = 'A stranger emerges from the ' + planet.name + ' outpost.'
	const options = [
		{ label: 'Trade a favor for fuel (+3 fuel)', apply: () => AddRes(RES_FUEL, 3) },
		{ label: 'Buy a life (-10 money)', apply: () => { if (res[RES_MONEY] >= 10) { AddRes(RES_MONEY, -10); AddRes(RES_LIVES, 1) } } },
		{ label: 'Ask about the stars', apply: () => {} },
		{ label: 'Leave', apply: () => {} }
	]

	function choose(opt) {
		opt.apply()
		planet.dialogDone = true
		SetState(NextPlanetState(planet, 'dialog'))
	}

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({ minPhi: 1.3, maxPhi: 1.3, minRadius: 4, maxRadius: 4, autoSpeed: 0 })
			ctx.camera.theta = 0
			ctx.camera.phi = 1.3
			ctx.camera.radius = 4

			const speaker = CreateCubeObject(ctx.gl, V3(0, 0, 0), 1.4, [0.8, 0.3, 0.9])
			mine = [speaker]
			ctx.objects.push(speaker)

			const panel = CreatePanel(line, 'bottom')
			panel.style.bottom = (4 + options.length * 6 + 4) + 'vmin'

			for (let i = 0; i < options.length; i++) {
				const btn = CreateButton(options[i].label, 'bottom', () => choose(options[i]))
				btn.style.bottom = (4 + i * 6) + 'vmin'
			}
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ctx.camera.update(dt)
		}
	}
}
