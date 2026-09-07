// Ship state: the hub. The player's modular ship sits at the origin; a
// left-hand two-column list edits its slots (column 1 = slots, column 2 =
// conversion targets for the selected slot - see modules.js). A slot is also
// pickable in 3D (its pad cube). Combat is automatic and happens right here:
// enemies arrive via "Debug: Spawn Enemy" or from a planet with hostiles
// (opts.enemies); every built weapon auto-fires at the nearest live enemy
// element (frigates have their own hp), point-defense rolls to shoot down
// incoming rockets. Player hp hitting 0 -> menu; clearing all hostiles heals
// the ship and (for a planet) clears its red marker. See docs/battle.md.

const SHIP_ENEMY_DIST = 6
const SHIP_PROJ_SPEED = { kinetic: 22, plasma: 16, rocket: 9 }
const SHIP_EXPL_DUR = 0.35

function CreateShipState(opts) {
	opts = opts || {}
	let ctxRef = null
	let mine = []        // static objects owned by this state (hull + pads)
	let live = []        // dynamic objects (module viz, projectiles, effects, enemies)
	let slotViz = []     // slotViz[i] = [objs] for slot i
	let pads = []
	let enemies = []
	let projectiles = []
	let effects = []
	let turrets = []
	let selected = -1
	let col1 = []
	let col2 = []
	let mapBtn = null
	let bars = null
	let topPanel = null
	let hpMax = SHIP_HP_MAX
	let wasHostile = false
	let dead = false

	function addLive(ctx, o) { ctx.objects.push(o); live.push(o) }
	function delLive(ctx, o) {
		let i = ctx.objects.indexOf(o); if (i !== -1) ctx.objects.splice(i, 1)
		i = live.indexOf(o); if (i !== -1) live.splice(i, 1)
	}

	function vizColor(m) {
		if (m.fireKind) return FIRE_COLORS[m.fireKind]
		if (m.intercept) return [0.9, 0.9, 0.95]
		return [0.4, 0.85, 1] // shield
	}

	function padColor(i, sel) {
		if (sel) return [1, 0.9, 0.4]
		const t = shipSlots[i].type
		return t === SLOT_WEAPON ? [0.5, 0.35, 0.35] : t === SLOT_DEFENSE ? [0.35, 0.45, 0.5] : [0.4, 0.4, 0.35]
	}

	function syncSlotViz(ctx, i) {
		for (const o of slotViz[i]) delLive(ctx, o)
		slotViz[i] = []
		const p = shipSlots[i].pos
		const m = SlotModule(i)
		if (m.viz === 'gun') {
			const g = CreateCubeObject(ctx.gl, V3(p[0], 0.45, p[2]), 0.28, vizColor(m))
			slotViz[i].push(g)
			addLive(ctx, g)
		} else if (m.viz === 'corvette') {
			const body = CreateCubeObject(ctx.gl, V3(p[0], 0, p[2]), 0.5, [0.7, 0.72, 0.8])
			const gun = CreateCubeObject(ctx.gl, V3(p[0], 0.42, p[2]), 0.22, vizColor(m))
			slotViz[i].push(body, gun)
			addLive(ctx, body)
			addLive(ctx, gun)
		}
	}

	function buildShip(ctx) {
		for (let c = 0; c < HULL_COLS; c++) {
			for (let r = 0; r < HULL_ROWS; r++) {
				const cube = CreateCubeObject(ctx.gl, hullPos(c, r), 0.5, [0.32, 0.34, 0.4])
				mine.push(cube)
			}
		}
		for (let i = 0; i < shipSlots.length; i++) {
			const s = shipSlots[i]
			const pad = CreateCubeObject(ctx.gl, V3(s.pos[0], 0.15, s.pos[2]), 0.34, padColor(i, false))
			pad.radius = 0.34
			pad.onClick = () => selectSlot(i)
			pads.push(pad)
			mine.push(pad)
			slotViz[i] = []
		}
	}

	function highlightPads() {
		for (let i = 0; i < pads.length; i++) pads[i].color = padColor(i, i === selected)
	}

	function selectSlot(i) {
		selected = i
		highlightPads()
		refreshLists()
	}

	function refreshLists() {
		for (const b of col1) b.remove()
		for (const b of col2) b.remove()
		col1 = []
		col2 = []
		const list = ShipModuleList()
		for (let k = 0; k < list.length; k++) {
			const it = list[k]
			const b = CreateButton(it.name, 'leftcol', () => selectSlot(it.index))
			b.className += ' slotbtn'
			b.style.top = (3 + k * 5) + 'vmin'
			if (it.index === selected) b.style.background = '#ffffff66'
			col1.push(b)
		}
		if (selected < 0) return
		const tg = SlotTargets(selected)
		for (let k = 0; k < tg.length; k++) {
			const t = tg[k]
			const b = CreateButton(t.cost > 0 ? t.name + ' (' + t.cost + ')' : t.name, 'leftcol2', () => {
				if (BuildModule(selected, t.id)) {
					syncSlotViz(ctxRef, selected)
					turrets = PlayerTurrets()
					hpMax = ShipHpMax()
					refreshLists()
				}
			})
			b.className += ' slotbtn'
			b.style.top = (3 + k * 5) + 'vmin'
			col2.push(b)
		}
	}

	function updateMapBtn() {
		const hostile = enemies.length > 0
		if (hostile && mapBtn) { mapBtn.remove(); mapBtn = null }
		if (!hostile && !mapBtn) mapBtn = CreateButton('Map', 'bottomright', () => SetState(CreateSystemState()))
	}

	function spawnEnemy(ctx, arch) {
		// Beyond the ship in the camera's forward arc (theta + PI is the
		// horizontal look direction), so a spawned foe is on screen.
		const ang = ctx.camera.theta + Math.PI + (Math.random() - 0.5) * 1.4
		const dist = SHIP_ENEMY_DIST + Math.random() * 2
		const base = V3(Math.cos(ang) * dist, 1.2 + Math.random() * 1.5, Math.sin(ang) * dist)
		const core = CreateCubeObject(ctx.gl, base, 0.9, [0.9, 0.3, 0.3])
		addLive(ctx, core)
		const frigs = []
		for (let f = 0; f < (arch.frigates || 0); f++) {
			const fp = AddV3(base, V3((f - 0.5) * 1.7, 0, 1.5))
			const fo = CreateCubeObject(ctx.gl, fp, 0.5, [1, 0.5, 0.4])
			addLive(ctx, fo)
			frigs.push({
				hp: arch.frigHp, hpMax: arch.frigHp, obj: fo,
				weapon: { fireKind: arch.frigKind, dmg: arch.frigDmg, rate: arch.frigRate, cd: Math.random() }
			})
		}
		enemies.push({
			name: arch.name,
			core: { hp: arch.hp, hpMax: arch.hp, obj: core },
			frigates: frigs,
			weapon: { fireKind: arch.fireKind, dmg: arch.dmg, rate: arch.rate, cd: Math.random() }
		})
		wasHostile = true
		updateMapBtn()
	}

	// Flat list of live enemy elements as { part, obj } (part carries hp/hpMax).
	function liveParts() {
		const out = []
		for (const e of enemies) {
			if (e.core.hp > 0) out.push({ part: e.core, obj: e.core.obj })
			for (const fr of e.frigates) if (fr.hp > 0) out.push({ part: fr, obj: fr.obj })
		}
		return out
	}

	function nearestPart(from, parts) {
		let best = null
		let bd = Infinity
		for (const p of parts) {
			const d = LenV3(SubV3(p.obj.position, from))
			if (d < bd) { bd = d; best = p }
		}
		return best
	}

	// toRef: { player: true } for enemy fire, or a liveParts() entry for player fire.
	function spawnProjectile(ctx, from, toRef, kind, dmg, hostileToPlayer) {
		const start = V3(from[0], from[1], from[2])
		const o = kind === 'plasma'
			? CreateSphereObject(ctx.gl, start, 0.18, FIRE_COLORS[kind], 6, 8)
			: CreateCubeObject(ctx.gl, start, kind === 'rocket' ? 0.22 : 0.14, FIRE_COLORS[kind])
		addLive(ctx, o)
		let popAt = 0
		if (hostileToPlayer && kind === 'rocket' && Math.random() < PlayerInterceptChance()) {
			popAt = 0.15 + Math.random() * 0.2
		}
		projectiles.push({ obj: o, pos: start, toRef, dmg, speed: SHIP_PROJ_SPEED[kind], popAt, life: 0, hostileToPlayer })
	}

	function spawnExplosion(ctx, at) {
		const o = CreateSphereObject(ctx.gl, V3(at[0], at[1], at[2]), 1, [1, 1, 1], 8, 10)
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
			else e.obj.scale = Math.sin(k * Math.PI) * 0.9
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
			const tgt = p.toRef.player
				? V3(0, 0.3, 0)
				: (p.toRef.part.hp > 0 ? p.toRef.obj.position : null)
			if (!tgt) { delLive(ctx, p.obj); projectiles.splice(i, 1); continue }
			const d = SubV3(tgt, p.pos)
			const dist = LenV3(d)
			const step = p.speed * dt
			if (dist <= step) {
				spawnExplosion(ctx, tgt)
				if (p.toRef.player) shipHp = Math.max(0, shipHp - p.dmg)
				else p.toRef.part.hp = Math.max(0, p.toRef.part.hp - p.dmg)
				delLive(ctx, p.obj)
				projectiles.splice(i, 1)
				continue
			}
			p.pos = AddV3(p.pos, ScaleV3(NormV3(d), step))
			p.obj.position = p.pos
		}
	}

	function updateCombat(ctx, dt) {
		const parts = liveParts()

		if (parts.length) {
			for (const t of turrets) {
				t.cd -= dt
				if (t.cd <= 0) {
					t.cd = t.rate
					const tr = nearestPart(V3(0, 0.3, 0), parts)
					if (tr) spawnProjectile(ctx, V3(0, 0.4, 0), tr, t.fireKind, t.dmg, false)
				}
			}
		}

		for (const e of enemies) {
			const shooters = [{ w: e.weapon, from: e.core.obj.position, alive: e.core.hp > 0 }]
			for (const fr of e.frigates) shooters.push({ w: fr.weapon, from: fr.obj.position, alive: fr.hp > 0 })
			for (const sh of shooters) {
				if (!sh.alive || !sh.w.fireKind) continue
				sh.w.cd -= dt
				if (sh.w.cd <= 0) {
					sh.w.cd = sh.w.rate
					spawnProjectile(ctx, sh.from, { player: true }, sh.w.fireKind, sh.w.dmg, true)
				}
			}
		}

		updateProjectiles(ctx, dt)
		updateEffects(ctx, dt)

		for (let i = enemies.length - 1; i >= 0; i--) {
			const e = enemies[i]
			for (let f = e.frigates.length - 1; f >= 0; f--) {
				if (e.frigates[f].hp <= 0) { delLive(ctx, e.frigates[f].obj); e.frigates.splice(f, 1) }
			}
			if (e.core.hp <= 0 && e.frigates.length === 0) { delLive(ctx, e.core.obj); enemies.splice(i, 1) }
		}

		if (wasHostile && enemies.length === 0) {
			wasHostile = false
			if (opts.planet) opts.planet.enemyCleared = true
			shipHp = ShipHpMax()
			hpMax = shipHp
			updateMapBtn()
		}

		if (shipHp <= 0) { dead = true; SetState(CreateMenuState()) }
	}

	return {
		OnEnter(ctx) {
			ctxRef = ctx
			mine = []
			live = []
			slotViz = []
			pads = []
			enemies = []
			projectiles = []
			effects = []
			col1 = []
			col2 = []
			selected = -1
			wasHostile = false
			dead = false
			mapBtn = null

			ctx.camera.setConstraints({
				minPhi: 0.25, maxPhi: 1.35, minRadius: 4, maxRadius: 16, autoSpeed: 0,
				panRect: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 }
			})
			ctx.camera.position = V3(0, 0, 0)
			ctx.camera.theta = Math.PI / 2
			ctx.camera.phi = 0.8
			ctx.camera.radius = 9

			buildShip(ctx)
			for (const o of mine) ctx.objects.push(o)
			for (let i = 0; i < shipSlots.length; i++) syncSlotViz(ctx, i)

			turrets = PlayerTurrets()
			hpMax = ShipHpMax()
			if (!opts.enemies) { shipHp = hpMax } // heal on peaceful entry

			topPanel = CreatePanel('Ship Bay', 'top')
			CreateButton('Debug: Spawn Enemy', 'bottom', () => spawnEnemy(ctx, RandomEnemyArchetype()))
			bars = { hp: CreateBar('barsright', '#ff5566'), tgt: CreateBar('barsright', '#ffaa33') }
			bars.tgt.el.style.right = '6.7vmin'

			refreshLists()
			updateMapBtn()

			if (opts.enemies) for (const a of opts.enemies) spawnEnemy(ctx, a)
		},

		OnExit(ctx) {
			RemoveObjects(ctx, mine)
			RemoveObjects(ctx, live)
		},

		OnUpdate(ctx, dt) {
			ApplyCameraInput(ctx, dt)

			if (ctx.input.clicked) {
				const hit = PickObject(ctx.camera, ctx.input.clickX, ctx.input.clickY, ctx.objects)
				if (hit && hit.onClick) hit.onClick()
			}

			updateCombat(ctx, dt)
			if (dead) return

			bars.hp.set(shipHp / hpMax * 100)
			const parts = liveParts()
			bars.tgt.set(parts.length ? parts[0].part.hp / parts[0].part.hpMax * 100 : 0)
			topPanel.textContent = enemies.length ? 'Hostiles: ' + enemies.length : 'Ship Bay'
		}
	}
}
