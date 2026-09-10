// Menu state: title, a decorative sun, and a Play button. Play generates the
// galaxy exactly once (galaxyStars stays null until then, see galaxy.js),
// resets the ship config, and drops the player into the ship hub state. See
// docs/architecture.md for the state contract.

function CreateMenuState() {
	let mine = []

	return {
		OnEnter(ctx) {
			MusicStart() // silent until the Play click resumes the audio context

			ctx.camera.setConstraints(10, 10, 0, 56, 56) // pitch pinned at 56
			ctx.camera.autoSpeed = 9 // slow showcase spin, deg/sec
			ctx.camera.place(V3(), 10, 56, 0)

			const sunType = STAR_ARCHETYPES[2] // yellow
			const sun = CreatePlanetObject(V3(), 2, GetRamp(sunType.ramp), sunType.planeScale, V3(), sunType.drift, 1)
			mine = [sun]
			ctx.objects.push(sun)

			CreatePanel('UNICORNS & RAINBOWS', 'top')
			CreateButton('Play', 'center', () => {
				if (!galaxyStars) GenerateGalaxy(ctx)
				ResetShip()
				SetState(CreateShipState())
			})
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ctx.camera.upd(dt)
		}
	}
}
