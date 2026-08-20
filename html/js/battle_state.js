// Battle draft v2: real-time energy combat on an invisible rotating arena.
// Fighters sit at the arena's edges (x = +-ARENA_HALF); the camera auto-
// orbits the whole thing (autoSpeed, same idiom as menu_state's spin) so it
// reads as "the platform turns like the system does", with a big backdrop
// sphere below standing in for the planet. See docs/camera.md for why
// theta must still be set explicitly even though autoSpeed drives it after
// that. Player holds one of four ability buttons; the enemy runs the same
// four abilities through a small timer-driven AI. Numbers below are all
// draft/tunable - see docs/battle.md for the design space and how to
// retune them.

const ARENA_HALF = 10
const BT_HP_MAX = 100
const BT_EN_MAX = 100
const BT_EN_REGEN = 14 // energy/s, both fighters

const BT_SHIELD_DRAIN = 8 // energy/s while held - blocks all incoming damage

const BT_LASER_COST = 16 // energy/s while held
const BT_LASER_DPS = 20

const BT_PLASMA_COST = 20 // energy per shot
const BT_PLASMA_RATE = 0.55 // seconds between shots while held
const BT_PLASMA_DMG = 14
const BT_PLASMA_SPEED = 16

const BT_MISSILE_COST = 32 // energy per shot
const BT_MISSILE_RATE = 1.2
const BT_MISSILE_DMG = 24
const BT_MISSILE_SPEED = 8

function CreateBattleState(planet) {
	let mine = []
	let live = [] // dynamically added/removed objects (shield/laser/projectiles)
	let projectiles = []
	let bars = null
	let player, enemy
	let over = false
	let aiAction = 'idle'
	let aiT = 0

	function addExtra(ctx, o) {
		ctx.objects.push(o)
		live.push(o)
	}

	function removeExtra(ctx, o) {
		let i = ctx.objects.indexOf(o)
		if (i !== -1) ctx.objects.splice(i, 1)
		i = live.indexOf(o)
		if (i !== -1) live.splice(i, 1)
	}

	function clearExtras(ctx) {
		for (let i = 0; i < live.length; i++) {
			const idx = ctx.objects.indexOf(live[i])
			if (idx !== -1) ctx.objects.splice(idx, 1)
		}
		live = []
		projectiles = []
	}

	function makeFighter(gl, x, color) {
		return {
			obj: CreateCubeObject(gl, V3(x, 0, 0), 1, color),
			x,
			hp: BT_HP_MAX,
			en: BT_EN_MAX,
			shield: false,
			shieldObj: null,
			laserObj: null,
			plasmaCd: 0,
			missileCd: 0,
			held: { shield: false, laser: false, plasma: false, missile: false }
		}
	}

	// Both fighters always sit on the X axis, so a projectile only ever
	// needs to walk its X coordinate - no aim/rotation math needed.
	function fire(ctx, shooter, target, kind) {
		const dir = shooter.x < target.x ? 1 : -1
		const isPlasma = kind === 'plasma'
		const color = isPlasma ? [0.7, 0.35, 1] : [1, 0.55, 0.15]
		const obj = isPlasma
			? CreateSphereObject(ctx.gl, V3(shooter.x, 0, 0), 0.3, color, 6, 8)
			: CreateCubeObject(ctx.gl, V3(shooter.x, 0, 0), 0.35, color)
		projectiles.push({
			x: shooter.x, dir, target, obj,
			speed: isPlasma ? BT_PLASMA_SPEED : BT_MISSILE_SPEED,
			dmg: isPlasma ? BT_PLASMA_DMG : BT_MISSILE_DMG
		})
		addExtra(ctx, obj)
	}

	function updateProjectiles(ctx, dt) {
		for (let i = projectiles.length - 1; i >= 0; i--) {
			const p = projectiles[i]
			p.x += p.dir * p.speed * dt
			p.obj.position = V3(p.x, 0, 0)
			if ((p.dir > 0 && p.x >= p.target.x) || (p.dir < 0 && p.x <= p.target.x)) {
				if (!p.target.shield) p.target.hp = Math.max(0, p.target.hp - p.dmg)
				removeExtra(ctx, p.obj)
				projectiles.splice(i, 1)
			}
		}
	}

	function updateFighter(ctx, f, target, dt) {
		f.en = Math.min(BT_EN_MAX, f.en + BT_EN_REGEN * dt)

		if (f.held.shield && f.en > 0) {
			f.shield = true
			f.en = Math.max(0, f.en - BT_SHIELD_DRAIN * dt)
			if (!f.shieldObj) {
				f.shieldObj = CreateSphereObject(ctx.gl, V3(f.x, 0, 0), 0.85, [0.4, 0.85, 1])
				addExtra(ctx, f.shieldObj)
			}
		} else {
			f.shield = false
			if (f.shieldObj) { removeExtra(ctx, f.shieldObj); f.shieldObj = null }
		}

		if (f.held.laser && f.en > 0) {
			f.en = Math.max(0, f.en - BT_LASER_COST * dt)
			if (!target.shield) target.hp = Math.max(0, target.hp - BT_LASER_DPS * dt)
			const color = target.shield ? [0.5, 0.5, 0.5] : [1, 0.2, 0.25]
			if (!f.laserObj) {
				const len = Math.abs(target.x - f.x)
				f.laserObj = CreateMeshObject(ctx.gl, V3((f.x + target.x) / 2, 0, 0), GenCubeMesh(), [len, 0.12, 0.12], color)
				addExtra(ctx, f.laserObj)
			} else {
				f.laserObj.color = color
			}
		} else if (f.laserObj) {
			removeExtra(ctx, f.laserObj); f.laserObj = null
		}

		f.plasmaCd -= dt
		if (f.held.plasma && f.plasmaCd <= 0 && f.en >= BT_PLASMA_COST) {
			f.en -= BT_PLASMA_COST
			f.plasmaCd = BT_PLASMA_RATE
			fire(ctx, f, target, 'plasma')
		}

		f.missileCd -= dt
		if (f.held.missile && f.missileCd <= 0 && f.en >= BT_MISSILE_COST) {
			f.en -= BT_MISSILE_COST
			f.missileCd = BT_MISSILE_RATE
			fire(ctx, f, target, 'missile')
		}
	}

	// Timer-driven AI: pick an ability, hold it for a random span, repeat.
	// Backs off to idle (regen only) below a low-energy threshold instead
	// of spending itself to zero and standing there defenseless.
	function aiTick(dt) {
		aiT -= dt
		if (aiT > 0) return
		enemy.held.shield = enemy.held.laser = enemy.held.plasma = enemy.held.missile = false
		const r = Math.random()
		if (enemy.en < 22) { aiAction = 'idle'; aiT = 0.5 + Math.random() * 0.5 }
		else if (r < 0.22) { aiAction = 'shield'; aiT = 0.7 + Math.random() * 0.9 }
		else if (r < 0.55) { aiAction = 'laser'; aiT = 0.6 + Math.random() * 0.8 }
		else if (r < 0.8) { aiAction = 'plasma'; aiT = 0.5 + Math.random() * 0.6 }
		else { aiAction = 'missile'; aiT = 0.4 + Math.random() * 0.5 }
		if (aiAction !== 'idle') enemy.held[aiAction] = true
	}

	function end(ctx, text, btnText, lifeCost) {
		over = true
		clearExtras(ctx)
		if (lifeCost) AddRes(RES_LIVES, -lifeCost)
		planet.battleDone = true
		ClearUI()
		CreatePanel(text, 'top')
		CreateButton(btnText, 'bottomright', () => SetState(NextPlanetState(planet, 'battle')))
	}

	return {
		OnEnter(ctx) {
			ctx.camera.setConstraints({ minPhi: 1.05, maxPhi: 1.05, minRadius: 22, maxRadius: 22, autoSpeed: 0.15 })
			ctx.camera.theta = Math.PI / 2 // fighters sit apart along X, this puts X across the screen
			ctx.camera.phi = 1.05
			ctx.camera.radius = 22

			player = makeFighter(ctx.gl, -ARENA_HALF, [0.3, 0.7, 1])
			enemy = makeFighter(ctx.gl, ARENA_HALF, planet.color)
			const backdrop = CreateSphereObject(ctx.gl, V3(0, -13, 0), 6, planet.color, 10, 14)
			mine = [player.obj, enemy.obj, backdrop]
			ctx.objects.push(player.obj, enemy.obj, backdrop)

			CreatePanel('A hostile ship blocks your way!', 'top')

			const abilities = [
				{ key: 'shield', label: 'Shield' },
				{ key: 'laser', label: 'Laser' },
				{ key: 'plasma', label: 'Plasma' },
				{ key: 'missile', label: 'Missile' }
			]
			for (let i = 0; i < abilities.length; i++) {
				const key = abilities[i].key
				const btn = CreateHoldButton(abilities[i].label, 'bottom',
					() => { player.held[key] = true },
					() => { player.held[key] = false })
				btn.style.left = 'calc(50% + ' + ((i - 1.5) * 15) + 'vmin)'
			}

			const hpP = CreateBar('barsleft', '#ff5566')
			const enP = CreateBar('barsleft', '#55d6ff')
			enP.el.style.left = '6.7vmin'
			const hpE = CreateBar('barsright', '#ff5566')
			const enE = CreateBar('barsright', '#55d6ff')
			enE.el.style.right = '6.7vmin'
			bars = { hpP, enP, hpE, enE }

			over = false
			aiAction = 'idle'
			aiT = 0
		},

		OnExit(ctx) {
			clearExtras(ctx)
			RemoveObjects(ctx, mine)
		},

		OnUpdate(ctx, dt) {
			ctx.camera.update(dt)
			bars.hpP.set(player.hp)
			bars.enP.set(player.en)
			bars.hpE.set(enemy.hp)
			bars.enE.set(enemy.en)
			if (over) return

			aiTick(dt)
			updateFighter(ctx, player, enemy, dt)
			updateFighter(ctx, enemy, player, dt)
			updateProjectiles(ctx, dt)

			if (enemy.hp <= 0) end(ctx, 'Enemy destroyed!', 'Next', 0)
			else if (player.hp <= 0) end(ctx, 'Your ship is disabled...', 'Retreat', 1)
		}
	}
}
