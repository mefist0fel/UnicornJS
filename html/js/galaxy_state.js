// Galaxy map state: click a star within jump radius to select it (green
// marker), then the jump button appears. See docs/architecture.md for the
// state contract and galaxy.js for the generation/caching.

function CreateGalaxyState() {
	let mine = []
	let selected = false

	function selectStar(ctx, i) {
		if (i === currentStarIndex) return
		if (StarDist(galaxyStars[currentStarIndex], galaxyStars[i]) > GALAXY_JUMP_RADIUS) return
		selectedStarIndex = i
		UpdateGalaxyMarkers()
		if (!selected) {
			selected = true
			ctx.objects.push(selectedMarker)
			mine.push(selectedMarker)
			CreateButton('>', 'bottomleft', () => TryJump(ctx))
		}
	}

	function TryJump(ctx) {
		if (selectedStarIndex < 0 || res[RES_FUEL] < GALAXY_JUMP_FUEL_COST) return
		AddRes(RES_FUEL, -GALAXY_JUMP_FUEL_COST)
		const target = selectedStarIndex
		SetState(CreateHyperjumpState(() => {
			currentStarIndex = target
			selectedStarIndex = -1
			return CreateSystemState()
		}))
	}

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({ minPhi: 0.2, maxPhi: Math.PI / 2 - 0.05, minRadius: 12, maxRadius: 40, autoSpeed: 0 })
			ctx.camera.radius = 26
			ctx.camera.phi = 1.0

			UpdateGalaxyMarkers()
			mine = galaxyStars.map(s => s.object)
			mine.push(currentMarker)
			for (let i = 0; i < mine.length; i++) ctx.objects.push(mine[i])

			for (let i = 0; i < galaxyStars.length; i++) {
				galaxyStars[i].object.onClick = () => selectStar(ctx, i)
			}

			selected = false
			CreatePanel('Galaxy map - select a nearby star, then jump', 'top')
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ctx.camera.rotate(-ctx.input.dx * 0.005, -ctx.input.dy * 0.005)
			ctx.camera.zoom(ctx.input.wheel * 0.01)
			ctx.camera.update(dt)
			if (ctx.input.clicked) {
				const hit = PickObject(ctx.camera, ctx.input.clickX, ctx.input.clickY, ctx.objects)
				if (hit && hit.onClick) hit.onClick()
			}
		}
	}
}
