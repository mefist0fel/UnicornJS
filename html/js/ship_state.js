// Ship state: the hub. The player's modular ship sits at the origin (hull +
// slots decoded from its schema string, see modules.js). The left panel is a
// sectioned list - a "Ship" row (upgrades the frame), then WEAPONS / MODULES /
// SUPPORT sections showing only the slots the current caps allow. Selecting a
// row opens a target list (l2); building or re-clicking the row closes
// it. Empty slots draw nothing; a built module's cube is its 3D pick target.
//
// Combat is automatic and happens right here. Enemies arrive from the debug
// menu or from a planet with hostiles (opts.enemies). Every active weapon
// auto-fires from its gun-cube at the nearest live enemy element, aiming at a
// random cell + a random point inside that cell's volume. Point-defense rolls
// to shoot down incoming rockets. Player hp 0 -> menu; clearing all hostiles
// heals the ship and (for a planet) clears its red marker. See docs/battle.md.

const SHIP_ENEMY_DIST = 6
const SHIP_PROJ_SPEED = { 'kinetic': 22, 'plasma': 16, 'rocket': 9 } // quoted: SHIP_PROJ_SPEED[kind] dynamic lookup, see FIRE_COLORS
const SHIP_EXPL_DUR = 0.35

function CreateShipState(opts) {
	opts = opts || {}
	let ctxRef = null
	let live = []          // every 3D object this state owns
	let hullCubes = []
	let slotViz = {}        // slot index -> [objs]
	let playerCells = []
	let enemies = []
	let projectiles = []
	let effects = []
	let turrets = []
	let selected = -1       // shipSlots index, -2 = the Ship row, -1 = none
	let rows = []
	let col2 = []
	let mapBtn = null
	let hyperBtn = null
	let atStar = false
	let sysBackdrop = [] // the current system's planets, shown as a static backdrop
	let shipLifeEl = null   // green HP strip at the top of the left list
	let enemyBars = []      // [{ el, part }] - right-side list, one HP strip per live hostile element
	let topPanel = null
	let hpMax = 0
	let wasHostile = false
	let dead = false
	let buildRefreshT = 0

	function addLive(ctx, o) { ctx.objects.push(o); live.push(o) }
	function delLive(ctx, o) {
		let i = ctx.objects.indexOf(o); if (i !== -1) ctx.objects.splice(i, 1)
		i = live.indexOf(o); if (i !== -1) live.splice(i, 1)
	}

	// -------- ship build / edit --------

	function rebuildHull(ctx) {
		for (const c of hullCubes) delLive(ctx, c)
		hullCubes = []
		const dec = DecodeShipSchema(MODULES[currentShipId].schema)
		playerCells = dec.cells
		for (const p of dec.cells) {
			const cube = CreateCubeObject(V3(p[0], 0, p[2]), 0.5, [0.32, 0.34, 0.4])
			hullCubes.push(cube)
			addLive(ctx, cube)
		}
	}

	function syncSlotViz(ctx, i) {
		if (slotViz[i]) for (const o of slotViz[i]) delLive(ctx, o)
		slotViz[i] = []
		if (ActiveSlots(shipSlots[i].type).indexOf(i) === -1) return // inactive slot: nothing
		const p = shipSlots[i].pos
		const m = MODULES[shipSlots[i].moduleId]
		if (m.viz === 'gun') {
			const g = CreateCubeObject(V3(p[0], 0.45, p[2]), 0.28, shipVizColor(m))
			g.radius = 0.3
			g.onClick = () => selectSlot(i)
			slotViz[i].push(g)
			addLive(ctx, g)
		} else if (m.viz === 'corvette') {
			const body = CreateCubeObject(V3(p[0], 0, p[2]), 0.5, [0.7, 0.72, 0.8])
			const gun = CreateCubeObject(V3(p[0], 0.42, p[2]), 0.22, shipVizColor(m))
			gun.radius = 0.35
			gun.onClick = () => selectSlot(i)
			slotViz[i].push(body, gun)
			addLive(ctx, body)
			addLive(ctx, gun)
		}
	}

	function rebuildViz(ctx) {
		for (const k in slotViz) for (const o of slotViz[k]) delLive(ctx, o)
		slotViz = {}
		for (let i = 0; i < shipSlots.length; i++) syncSlotViz(ctx, i)
	}

	function selectSlot(i) {
		if (PendingBuild(i)) return // slot busy building - ignore
		selected = i === selected ? -1 : i
		refreshLists()
	}

	function selectShip() {
		if (PendingBuild(-1)) return
		selected = selected === -2 ? -1 : -2
		refreshLists()
	}

	// A build was just *queued* (metal charged); nothing is installed yet -
	// TickBuilds() in OnUpdate does the actual resync when it finishes. Here we
	// only close the target list and redraw so the pending row shows its timer.
	function afterBuild() {
		Sfx.build()
		selected = -1
		refreshLists()
	}

	// left/right lists are a stack of two block kinds sharing one 16vmin column:
	//   - a .sb (a real button: slot / conversion target)
	//   - a .sf strip (no text, green fill = an hp fraction) for the ship,
	//     for a built support corvette, and for every hostile element on the right
	// section dividers (the old WEAPONS/MODULES text headers) are gone - just a gap.
	function lifeGrad(frac) {
		const p = Mmax(0, Mmin(100, Math.round(frac * 100)))
		return 'linear-gradient(90deg,#3ad07a ' + p + '%,#0006 ' + p + '%)'
	}

	// a no-text health strip in `anchor`'s column at `top` vmin; returns the el
	function lifeStrip(anchor, top, frac, into) {
		const el = CreatePanel('', anchor)
		el.className = anchor + ' sf'
		el.style.top = top + 'vmin'
		el.style.background = lifeGrad(frac)
		into.push(el)
		return el
	}

	function slotButton(top, label, onClick, isSel, pend) {
		const b = CreateButton(pend ? MODULES[pend.id].name + '  ▸' + pend.secLeft + 's' : label, 'lc', onClick)
		b.className += ' sb'
		b.style.top = top + 'vmin'
		if (pend) {
			const p = Math.round(pend.frac * 100)
			b.style.background = 'linear-gradient(90deg,#3a7a4aee ' + p + '%,#ffffff22 ' + p + '%)'
		} else if (isSel) {
			b.style.background = '#ffffff66'
		}
		rows.push(b)
	}

	function refreshLists() {
		for (const b of rows) b.remove()
		for (const b of col2) b.remove()
		rows = []
		col2 = []

		let y = 7 // leave room for the debug "D" button up top

		// ship hp, then the ship frame slot
		shipLifeEl = lifeStrip('lc', y, hpMax ? shipHp / hpMax : 1, rows)
		y += 2
		slotButton(y, 'Ship: ' + MODULES[currentShipId].name, selectShip, selected === -2, PendingBuild(-1))
		y += 3.2

		for (const type of [SLOT_WEAPON, SLOT_DEFENSE, SLOT_AUX]) {
			y += 1.4 // gap where the section header used to be
			for (const i of ActiveSlots(type)) {
				const s = shipSlots[i]
				// a built support corvette is a mini-ship: show its hp above its button
				if (type === SLOT_AUX && s.moduleId !== s.base) {
					lifeStrip('lc', y, 1, rows) // corvettes don't take damage yet - full for now
					y += 2
				}
				slotButton(y, MODULES[s.moduleId].name, () => selectSlot(i), selected === i, PendingBuild(i))
				y += 3.2
			}
		}

		const tg = selected === -2 ? ShipTargets() : selected >= 0 ? SlotTargets(selected) : null
		if (!tg) return
		for (let k = 0; k < tg.length; k++) {
			const t = tg[k]
			const b = CreateButton(t.cost > 0 ? t.name + ' (' + t.cost + ')' : t.name, 'l2', () => {
				if (selected === -2 ? BuildShip(t.id) : BuildModule(selected, t.id)) afterBuild()
			})
			b.className += ' sb'
			b.style.top = (7 + k * 3.2) + 'vmin'
			col2.push(b)
		}
	}

	// right-side list: one green strip per live hostile element (ship + frigates),
	// rebuilt when that set changes; fills refreshed every frame in OnUpdate.
	function refreshEnemyBars() {
		for (const eb of enemyBars) eb.el.remove()
		enemyBars = []
		const parts = liveParts()
		for (let k = 0; k < parts.length; k++) {
			enemyBars.push({ el: lifeStrip('rc', 7 + k * 2, parts[k].hp / parts[k].hpMax, []), part: parts[k] })
		}
	}

	// nav buttons: Map (passive, left) at peace; Hyperjump (active, right) only
	// when parked on a star's orbit. Both hidden during a fight. Rebuilt whole.
	function updateNavBtns() {
		if (mapBtn) { mapBtn.remove(); mapBtn = null }
		if (hyperBtn) { hyperBtn.remove(); hyperBtn = null }
		if (enemies.length) return
		mapBtn = CreateButton('Map', 'bl', () => SetState(CreateSystemState()))
		if (atStar) hyperBtn = CreateButton('Hyperjump', 'br', () => SetState(CreateGalaxyState()))
	}

	// -------- enemies --------

	function makeEnemyShip(ctx, schema, hp, weapons, color, at) {
		const dec = DecodeShipSchema(schema)
		const objs = []
		for (const p of dec.cells) {
			const o = CreateCubeObject(AddV3(at, p), 0.42, color)
			objs.push(o)
			addLive(ctx, o)
		}
		return {
			pos: at, hp, hpMax: hp, cells: dec.cells, objs,
			weapons: weapons.map((w, k) => ({
				fireKind: w.fireKind, dmg: w.dmg, rate: w.rate, cd: Mr() * w.rate,
				from: AddV3(at, AddV3(dec.weapons[k] || dec.cells[0] || V3(), V3(0, 0.3, 0)))
			}))
		}
	}

	function spawnEnemy(ctx, arch) {
		// beyond the ship in the camera's forward arc so it lands on screen
		const ang = ctx.camera.theta + PI + (Mr() - 0.5) * 1.4
		const dist = SHIP_ENEMY_DIST + Mr() * 2
		const at = V3(Mc(ang) * dist, 1.2 + Mr() * 1.5, Ms(ang) * dist)
		const e = makeEnemyShip(ctx, arch.schema, arch.hp, arch.weapons, [0.9, 0.3, 0.3], at)
		e.frigates = []
		if (arch.frig) {
			for (let f = 0; f < arch.frig.count; f++) {
				const fp = AddV3(at, V3((f - (arch.frig.count - 1) / 2) * 2, 0, 2.2))
				e.frigates.push(makeEnemyShip(ctx, arch.frig.schema, arch.frig.hp, [arch.frig.weapon], [1, 0.5, 0.4], fp))
			}
		}
		enemies.push(e)
		wasHostile = true
		updateNavBtns()
	}

	// live enemy elements (ships + frigates), each a single hp pool
	function liveParts() {
		const out = []
		for (const e of enemies) {
			if (e.hp > 0) out.push(e)
			for (const fr of e.frigates) if (fr.hp > 0) out.push(fr)
		}
		return out
	}

	function nearestPart(from, parts) {
		let best = null
		let bd = Infinity
		for (const p of parts) {
			const d = LenV3(SubV3(p.pos, from))
			if (d < bd) { bd = d; best = p }
		}
		return best
	}

	// random cell of `cells` (offset list) + a random point inside its volume
	function scatter(cells) {
		const c = cells[Mfl(Mr() * cells.length)] || V3()
		return AddV3(c, V3((Mr() - 0.5) * SHIP_CELL, (Mr() - 0.5) * SHIP_CELL, (Mr() - 0.5) * SHIP_CELL))
	}

	// -------- projectiles / effects --------

	function fireAt(ctx, from, aim, kind, dmg, hostile, apply) {
		const start = V3(from[0], from[1], from[2])
		const o = kind === 'plasma'
			? CreateSphereObject(start, 0.18, FIRE_COLORS[kind], 6, 8)
			: CreateCubeObject(start, kind === 'rocket' ? 0.22 : 0.14, FIRE_COLORS[kind])
		addLive(ctx, o)
		let popAt = 0
		if (hostile && kind === 'rocket' && Mr() < PlayerInterceptChance()) popAt = 0.15 + Mr() * 0.2
		projectiles.push({ obj: o, pos: start, aim, dmg, speed: SHIP_PROJ_SPEED[kind], popAt, life: 0, apply })
	}

	function spawnExplosion(ctx, at) {
		Sfx.explosion()
		const o = CreateSphereObject(V3(at[0], at[1], at[2]), 1, [1, 1, 1], 8, 10)
		o.scale = 0.01
		effects.push({ obj: o, t: 0 })
		addLive(ctx, o)
	}

	function updateEffects(ctx, dt) {
		for (let i = effects.length - 1; i >= 0; i--) {
			const e = effects[i]
			e.t += dt
			const k = e.t / SHIP_EXPL_DUR
			if (k >= 1) { delLive(ctx, e.obj); effects.splice(i, 1) }
			else e.obj.scale = Ms(k * PI) * 0.9
		}
	}

	function updateProjectiles(ctx, dt) {
		for (let i = projectiles.length - 1; i >= 0; i--) {
			const p = projectiles[i]
			p.life += dt
			if (p.popAt && p.life > p.popAt) {
				spawnExplosion(ctx, p.pos)
				delLive(ctx, p.obj)
				projectiles.splice(i, 1)
				continue
			}
			const d = SubV3(p.aim, p.pos)
			const dist = LenV3(d)
			const step = p.speed * dt
			if (dist <= step) {
				spawnExplosion(ctx, p.aim)
				if (!p.popAt) p.apply(p.dmg)
				delLive(ctx, p.obj)
				projectiles.splice(i, 1)
				continue
			}
			p.pos = AddV3(p.pos, ScaleV3(NormV3(d), step))
			p.obj.p = p.pos
		}
	}

	function updateCombat(ctx, dt) {
		const parts = liveParts()

		if (parts.length) {
			for (const t of turrets) {
				t.cd -= dt
				if (t.cd <= 0) {
					t.cd = t.rate
					const part = nearestPart(t.from, parts)
					if (part) {
						SfxShoot(t.fireKind)
						fireAt(ctx, t.from, AddV3(part.pos, scatter(part.cells)), t.fireKind, t.dmg, false, dmg => { part.hp = Mmax(0, part.hp - dmg) })
					}
				}
			}
		}

		for (const e of enemies) {
			for (const s of [e].concat(e.frigates)) {
				if (s.hp <= 0) continue
				for (const w of s.weapons) {
					if (!w.fireKind) continue
					w.cd -= dt
					if (w.cd <= 0) {
						w.cd = w.rate
						fireAt(ctx, w.from, scatter(playerCells), w.fireKind, w.dmg, true, dmg => { shipHp = Mmax(0, shipHp - dmg); Sfx.hit() })
					}
				}
			}
		}

		updateProjectiles(ctx, dt)
		updateEffects(ctx, dt)

		for (let i = enemies.length - 1; i >= 0; i--) {
			const e = enemies[i]
			for (let f = e.frigates.length - 1; f >= 0; f--) {
				if (e.frigates[f].hp <= 0) { for (const o of e.frigates[f].objs) delLive(ctx, o); e.frigates.splice(f, 1) }
			}
			if (e.hp <= 0 && e.objs.length) { for (const o of e.objs) delLive(ctx, o); e.objs = [] }
			if (e.hp <= 0 && e.frigates.length === 0) enemies.splice(i, 1)
		}

		if (wasHostile && enemies.length === 0) {
			wasHostile = false
			if (opts.planet) opts.planet.enemyCleared = true
			shipHp = ShipHpMax()
			hpMax = shipHp
			updateNavBtns()
		}

		if (shipHp <= 0) { dead = true; Sfx.death(); SetState(CreateMenuState()) }
	}

	return {
		OnEnter(ctx) {
			ctxRef = ctx
			MusicStart()
			live = []
			hullCubes = []
			slotViz = {}
			enemies = []
			projectiles = []
			effects = []
			rows = []
			col2 = []
			enemyBars = []
			shipLifeEl = null
			selected = -1
			wasHostile = false
			dead = false
			mapBtn = null
			hyperBtn = null

			// the ship always hangs somewhere in a system - draw that system at
			// decoration scale (system.js), positioned so the parked body looms
			// nearby. Static (no orbit animation), non-interactive.
			const sys = GetSystem(ctx, currentStarIndex)
			atStar = opts.atStar || sys.parkedPlanet === PARK_STAR
			DecoSystem(ctx, sys)
			PlaceDeco(sys, opts.planet || (atStar ? PARK_STAR : null))
			sysBackdrop = sys.deco.parts.map(p => p.obj)
			PushObjects(ctx, sysBackdrop)

			// camera orbits the ship/platform at the origin; the parked planet is
			// a ~250-unit giant ~250-1300 units off to one side (see DecoVicinity).
			// Pull-back range lets you frame the platform or take in the planet;
			// pan stays inside the ~20-unit platform.
			ctx.camera.setConstraints({
				minPhi: 0.25, maxPhi: 1.4, minRadius: 8, maxRadius: 70, autoSpeed: 0,
				panRect: { minX: -12, maxX: 12, minZ: -12, maxZ: 12 }
			})
			ctx.camera.p = V3()
			ctx.camera.theta = PI / 2
			ctx.camera.phi = 0.8
			ctx.camera.setDist(22)

			rebuildHull(ctx)
			rebuildViz(ctx)

			turrets = PlayerTurrets()
			hpMax = ShipHpMax()
			if (!opts.enemies) shipHp = hpMax // heal on peaceful entry

			topPanel = CreatePanel(atStar ? 'Star Orbit' : 'Ship Bay', 'top')

			// DEBUG is compile-time false in the release build (see build.py) - closure
			// then DCEs this whole block plus CreateDebugMenu/DEBUG_GLOBAL/ToggleMute.
			if (DEBUG) CreateDebugMenu(ENEMY_ARCHETYPES.map(a => ({ label: 'Spawn ' + a.name, run: () => spawnEnemy(ctx, a) })).concat([
				{
					label: 'Preview: local jump', run: () => {
						const ps = GetSystem(ctx, currentStarIndex).planets
						SetState(CreateSystemTravelState(() => CreateShipState({ atStar }), PARK_STAR, ps[(Mr() * ps.length) | 0]))
					}
				},
				{ label: 'Preview: hyperjump', run: () => SetState(CreateHyperjumpState(() => CreateShipState({ atStar }))) }
			]))

			refreshLists()
			updateNavBtns()

			if (opts.enemies) for (const a of opts.enemies) spawnEnemy(ctx, a)
		},

		OnExit(ctx) {
			RemoveObjects(ctx, live)
			RemoveObjects(ctx, sysBackdrop)
		},

		OnUpdate(ctx, dt) {
			ApplyCameraInput(ctx, dt)

			if (ctx.input.clicked) {
				const hit = PickObject(ctx.camera, ctx.input.clickX, ctx.input.clickY, ctx.objects)
				if (hit && hit.onClick) hit.onClick()
			}

			// pending slot builds: apply finished ones, keep the countdown live
			const done = TickBuilds(dt)
			if (done.any) {
				if (done.shipChanged) rebuildHull(ctx)
				rebuildViz(ctx)
				turrets = PlayerTurrets()
				hpMax = ShipHpMax()
				if (!wasHostile) shipHp = hpMax
				refreshLists()
			} else if (builds.length) {
				buildRefreshT += dt
				if (buildRefreshT > 0.2) { buildRefreshT = 0; refreshLists() }
			}

			updateCombat(ctx, dt)
			if (dead) return

			// left list: ship hp strip
			if (shipLifeEl) shipLifeEl.style.background = lifeGrad(hpMax ? shipHp / hpMax : 1)

			// right list: rebuild only when the hostile set changes, then refill
			const parts = liveParts()
			if (parts.length !== enemyBars.length || enemyBars.some((eb, i) => eb.part !== parts[i])) refreshEnemyBars()
			for (const eb of enemyBars) eb.el.style.background = lifeGrad(eb.part.hp / eb.part.hpMax)

			topPanel.textContent = enemies.length ? 'Hostiles: ' + enemies.length : atStar ? 'Star Orbit' : 'Ship Bay'
		}
	}
}
