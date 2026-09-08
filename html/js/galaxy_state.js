// Galaxy map: click a star to select it. In-jump-range stars get a green
// selector + a '>' jump button (spends fuel, plays hyperjump_state); out of
// range gets a red selector and no jump button (you can still look). A line
// is drawn from the current star to the selected one, coloured to match. The
// current star itself selects with a 'V' button - descend into that system
// with no jump. See docs/architecture.md, galaxy.js for generation/caching.

function CreateGalaxyState() {
	let mine = []
	let btn = null
	let line = null
	let selected = false
	let markerAngle = 0

	function reachable(i) {
		return i === currentStarIndex || StarDist(galaxyStars[currentStarIndex], galaxyStars[i]) <= GALAXY_JUMP_RADIUS
	}

	function refreshButton(ctx, canReach) {
		if (btn) { btn.remove(); btn = null }
		if (selectedStarIndex < 0) return
		if (selectedStarIndex === currentStarIndex) {
			btn = CreateButton('V', 'bottomleft', () => SetState(CreateShipState({ atStar: true })))
		} else if (canReach) {
			btn = CreateButton('>', 'bottomright', () => TryJump(ctx))
		}
	}

	function setLine(ctx, col) {
		if (line) {
			RemoveObjects(ctx, [line])
			const li = mine.indexOf(line)
			if (li !== -1) mine.splice(li, 1)
			line = null
		}
		if (selectedStarIndex < 0 || selectedStarIndex === currentStarIndex) return
		const a = galaxyStars[currentStarIndex]
		const b = galaxyStars[selectedStarIndex]
		line = CreateLineObject(ctx.gl, V3(a.x, 0.25, a.z), V3(b.x, 0.25, b.z), col)
		ctx.objects.push(line)
		mine.push(line)
	}

	function selectStar(ctx, i) {
		selectedStarIndex = i
		const canReach = reachable(i)
		if (!selected) {
			selected = true
			for (let m = 0; m < selectedMarker.objs.length; m++) {
				ctx.objects.push(selectedMarker.objs[m])
				mine.push(selectedMarker.objs[m])
			}
		}
		const col = canReach ? [0.2, 1, 0.3] : [1, 0.35, 0.3]
		for (let m = 0; m < selectedMarker.objs.length; m++) selectedMarker.objs[m].color = col
		setLine(ctx, col)
		refreshButton(ctx, canReach)
	}

	function TryJump(ctx) {
		if (selectedStarIndex < 0 || res[RES_FUEL] < GALAXY_JUMP_FUEL_COST) return
		AddRes(RES_FUEL, -GALAXY_JUMP_FUEL_COST)
		const target = selectedStarIndex
		SetState(CreateHyperjumpState(() => {
			currentStarIndex = target
			selectedStarIndex = -1
			GetSystem(ctx, target).parkedPlanet = PARK_STAR
			return CreateShipState({ atStar: true })
		}))
	}

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({
				minPhi: 0.2, maxPhi: PI / 2 - 0.05, minRadius: 12, maxRadius: 40, autoSpeed: 0,
				panRect: { minX: -14, maxX: 14, minZ: -14, maxZ: 14 }
			})
			ctx.camera.position = V3(0, 0, 0)
			ctx.camera.radius = 26
			ctx.camera.phi = 1.0

			markerAngle = 0
			selectedStarIndex = -1
			selected = false
			line = null
			UpdateGalaxyMarkers(markerAngle)
			mine = galaxyStars.map(s => s.object)
			for (let m = 0; m < currentMarker.objs.length; m++) mine.push(currentMarker.objs[m])
			// reach ring: how far a hyperjump can go from the current star
			const cur = galaxyStars[currentStarIndex]
			mine.push(CreateRingObject(ctx.gl, V3(cur.x, 0.2, cur.z), GALAXY_JUMP_RADIUS, [0.3, 0.55, 0.4]))
			PushObjects(ctx, mine)

			for (let i = 0; i < galaxyStars.length; i++) {
				galaxyStars[i].object.onClick = () => selectStar(ctx, i)
			}

			btn = null
			CreatePanel('Star map - pick a system to jump to', 'top')
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ApplyCameraInput(ctx, dt)

			markerAngle += dt * GALAXY_MARKER_SPEED
			UpdateGalaxyMarkers(markerAngle)

			if (ctx.input.clicked) {
				const hit = PickObject(ctx.camera, ctx.input.clickX, ctx.input.clickY, ctx.objects)
				if (hit && hit.onClick) hit.onClick()
			}
		}
	}
}
