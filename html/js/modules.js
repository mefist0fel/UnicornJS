// Ship model. Two string-encoded ideas, in the spirit of meshformat/texture:
//
//  * a SHIP SCHEMA string (see docs/shipformat.md) - "<width><grid>|<support
//    coords>" - drives both the player ship and enemy ships. Grid chars:
//      .  empty     #  hull cube     W  weapon slot     M  module slot
//    Cell world pos is centred: ((col-(w-1)/2), 0, (row-(h-1)/2)) * SHIP_CELL.
//    After '|', pairs of digits are support-ship slots, each `digit-4` cells
//    from centre (x then z).
//
//  * a small conversion GRAPH of modules (MODULES): every slot holds one
//    module id; it can be turned into any of its `to` neighbours for that
//    module's metal cost (cost 0 = base/empty slot). Graphs are disjoint per
//    slot kind (ship / weapon / module / support).
//
// The central "Ship" slot's module is the ship archetype itself (s1/s2/s3):
// installing one swaps the schema (hull + every slot offset) and the ship's
// stat variables. Any module may carry a `stats` map; RebuildShipStats() sums
// the ship base + every installed module - that's how a shield module raises
// shield capacity, an upgrade raises slot caps, etc. See docs/architecture.md.

const SLOT_SHIP = 3
const SLOT_WEAPON = 0
const SLOT_DEFENSE = 1  // "modules": PD + shields
const SLOT_AUX = 2      // "support": corvettes

const SHIP_CELL = 0.55

// ship stat variables - a flat array like `res`, rebuilt from ship+modules
const STAT_HP = 0
const STAT_WEAPONS = 1   // weapon-slot cap
const STAT_MODULES = 2   // module-slot cap
const STAT_SUPPORTS = 3  // support-slot cap
const STAT_SHIELD = 4    // shield capacity (added to hp pool for now)
const STAT_COUNT = 5

var shipStats = []
var currentShipId = 's1'
var shipHp = 500

// projectile / muzzle colour per damage kind, shared by player and enemy fire
const FIRE_COLORS = {
	kinetic: [1, 0.9, 0.4],
	plasma: [0.7, 0.35, 1],
	rocket: [1, 0.55, 0.15]
}

// id -> { name, slot, cost, to:[id...], viz?, schema?, stats?, fireKind?,
//         dmg?, rate?, intercept? }
//   viz: null (nothing drawn) | 'gun' (small cube) | 'corvette' (body + gun)
const MODULES = {
	// --- ship frames (central slot). schema + stat baseline. ---
	s1: {
		name: 'Scout Frame', slot: SLOT_SHIP, cost: 0, to: ['s2'], buildTime: 5,
		schema: '3.#.MWM###.#.|1474',
		stats: { [STAT_HP]: 500, [STAT_WEAPONS]: 1, [STAT_MODULES]: 2, [STAT_SUPPORTS]: 2 }
	},
	s2: {
		name: 'Wing Frame', slot: SLOT_SHIP, cost: 30, to: ['s1', 's3'], buildTime: 5,
		schema: '5.#...M##M..#WWWM###..#...|0484',
		stats: { [STAT_HP]: 900, [STAT_WEAPONS]: 3, [STAT_MODULES]: 3, [STAT_SUPPORTS]: 2 }
	},
	s3: {
		name: 'Battle Frame', slot: SLOT_SHIP, cost: 60, to: ['s2'], buildTime: 5,
		schema: '5MM#...#W#.W#W#W.#W#.MM#..|048448',
		stats: { [STAT_HP]: 1400, [STAT_WEAPONS]: 5, [STAT_MODULES]: 4, [STAT_SUPPORTS]: 3 }
	},

	// --- weapons ---
	wslot: { name: 'Weapon slot', slot: SLOT_WEAPON, cost: 0, to: ['kin1', 'roc1', 'pla1'], viz: null },
	kin1: { name: 'Kinetic I', slot: SLOT_WEAPON, cost: 5, to: ['kin2', 'wslot'], viz: 'gun', fireKind: 'kinetic', dmg: 6, rate: 0.5 },
	kin2: { name: 'Kinetic II', slot: SLOT_WEAPON, cost: 6, to: ['kin3', 'wslot'], viz: 'gun', fireKind: 'kinetic', dmg: 9, rate: 0.45 },
	kin3: { name: 'Kinetic III', slot: SLOT_WEAPON, cost: 9, to: ['wslot'], viz: 'gun', fireKind: 'kinetic', dmg: 13, rate: 0.4 },
	roc1: { name: 'Rocket I', slot: SLOT_WEAPON, cost: 5, to: ['roc2', 'wslot'], viz: 'gun', fireKind: 'rocket', dmg: 16, rate: 1.6 },
	roc2: { name: 'Rocket II', slot: SLOT_WEAPON, cost: 6, to: ['roc3', 'wslot'], viz: 'gun', fireKind: 'rocket', dmg: 22, rate: 1.5 },
	roc3: { name: 'Rocket III', slot: SLOT_WEAPON, cost: 9, to: ['wslot'], viz: 'gun', fireKind: 'rocket', dmg: 30, rate: 1.4 },
	pla1: { name: 'Plasma I', slot: SLOT_WEAPON, cost: 7, to: ['pla2', 'wslot'], viz: 'gun', fireKind: 'plasma', dmg: 10, rate: 0.9 },
	pla2: { name: 'Plasma II', slot: SLOT_WEAPON, cost: 8, to: ['pla3', 'wslot'], viz: 'gun', fireKind: 'plasma', dmg: 15, rate: 0.85 },
	pla3: { name: 'Plasma III', slot: SLOT_WEAPON, cost: 11, to: ['wslot'], viz: 'gun', fireKind: 'plasma', dmg: 21, rate: 0.8 },

	// --- modules (PD + shields) ---
	dslot: { name: 'Module slot', slot: SLOT_DEFENSE, cost: 0, to: ['shield', 'pd'], viz: null },
	shield: { name: 'Shield', slot: SLOT_DEFENSE, cost: 6, to: ['shield2', 'dslot'], viz: 'gun', stats: { [STAT_SHIELD]: 150 } },
	shield2: { name: 'Shield II', slot: SLOT_DEFENSE, cost: 9, to: ['dslot'], viz: 'gun', stats: { [STAT_SHIELD]: 280 } },
	pd: { name: 'Point Defense', slot: SLOT_DEFENSE, cost: 6, to: ['dslot'], viz: 'gun', intercept: 0.35 },

	// --- support ships (corvettes) ---
	aslot: { name: 'Support slot', slot: SLOT_AUX, cost: 0, to: ['corvKin', 'corvRoc', 'corvPd'], viz: null },
	corvKin: { name: 'Kinetic Corvette', slot: SLOT_AUX, cost: 12, buildTime: 3.5, to: ['aslot'], viz: 'corvette', fireKind: 'kinetic', dmg: 8, rate: 0.5 },
	corvRoc: { name: 'Rocket Corvette', slot: SLOT_AUX, cost: 14, buildTime: 3.5, to: ['aslot'], viz: 'corvette', fireKind: 'rocket', dmg: 20, rate: 1.5 },
	corvPd: { name: 'PD Corvette', slot: SLOT_AUX, cost: 12, buildTime: 3.5, to: ['aslot'], viz: 'corvette', intercept: 0.3 }
}

// "<w><grid w*h>|<support pairs>" -> { w, h, cells, weapons, modules, supports }.
// `cells` is every non-empty cell (used both for the cosmetic hull and for
// volumetric aim: a shot picks a random cell + a random point inside it).
function DecodeShipSchema(str) {
	const w = +str[0]
	const bar = str.indexOf('|')
	const grid = bar < 0 ? str.slice(1) : str.slice(1, bar)
	const h = grid.length / w
	const cx = (w - 1) / 2
	const cz = (h - 1) / 2
	const cells = [], weapons = [], modules = []
	for (let i = 0; i < grid.length; i++) {
		const ch = grid[i]
		if (ch === '.') continue
		const p = V3(((i % w) - cx) * SHIP_CELL, 0, ((i / w | 0) - cz) * SHIP_CELL)
		cells.push(p)
		if (ch === 'W') weapons.push(p)
		else if (ch === 'M') modules.push(p)
	}
	const supports = []
	if (bar >= 0) {
		const s = str.slice(bar + 1)
		for (let i = 0; i + 1 < s.length; i += 2) {
			supports.push(V3((+s[i] - 4) * SHIP_CELL, 0, (+s[i + 1] - 4) * SHIP_CELL))
		}
	}
	return { w, h, cells, weapons, modules, supports }
}

// live per-slot state: [{ type, pos, base, moduleId }] - weapon slots first,
// then module slots, then support slots, each in schema order.
var shipSlots = []

function rebuildSlots() {
	const dec = DecodeShipSchema(MODULES[currentShipId].schema)
	const prev = shipSlots
	function mk(list, type, base) {
		const kept = prev.filter(s => s.type === type)
		return list.map((pos, k) => ({ type, pos, base, moduleId: kept[k] ? kept[k].moduleId : base }))
	}
	shipSlots = mk(dec.weapons, SLOT_WEAPON, 'wslot')
		.concat(mk(dec.modules, SLOT_DEFENSE, 'dslot'))
		.concat(mk(dec.supports, SLOT_AUX, 'aslot'))
}

function RebuildShipStats() {
	const base = MODULES[currentShipId].stats
	for (let i = 0; i < STAT_COUNT; i++) shipStats[i] = base[i] || 0
	for (const s of shipSlots) {
		const st = MODULES[s.moduleId].stats
		if (st) for (const k in st) shipStats[k] += st[k]
	}
}

function ResetShip() {
	currentShipId = 's1'
	shipSlots = []
	builds = []
	rebuildSlots()
	RebuildShipStats()
	shipHp = ShipHpMax()
}

function ShipHpMax() {
	return shipStats[STAT_HP] + shipStats[STAT_SHIELD]
}

function SlotCap(type) {
	return shipStats[type === SLOT_WEAPON ? STAT_WEAPONS : type === SLOT_DEFENSE ? STAT_MODULES : STAT_SUPPORTS]
}

// Indices of the first SlotCap(type) slots of that type - the rest are
// physically present in the schema but inert until an upgrade raises the cap.
function ActiveSlots(type) {
	const out = []
	for (let i = 0; i < shipSlots.length; i++) if (shipSlots[i].type === type) out.push(i)
	return out.slice(0, SlotCap(type))
}

// Left-panel rows: a 'ship' row, then for each category a 'hdr' row (with a
// used/cap count) followed by its active 'slot' rows.
function ShipModuleList() {
	const rows = [{ kind: 'ship', label: 'Ship: ' + MODULES[currentShipId].name }]
	const secs = [[SLOT_WEAPON, 'WEAPONS'], [SLOT_DEFENSE, 'MODULES'], [SLOT_AUX, 'SUPPORT']]
	for (const sec of secs) {
		const act = ActiveSlots(sec[0])
		const used = act.filter(i => shipSlots[i].moduleId !== shipSlots[i].base).length
		rows.push({ kind: 'hdr', label: sec[1] + '  ' + used + '/' + act.length })
		for (const i of act) rows.push({ kind: 'slot', index: i, label: MODULES[shipSlots[i].moduleId].name })
	}
	return rows
}

function SlotTargets(i) {
	return MODULES[shipSlots[i].moduleId].to.map(id => ({ id, name: MODULES[id].name, cost: MODULES[id].cost }))
}

function ShipTargets() {
	return MODULES[currentShipId].to.map(id => ({ id, name: MODULES[id].name, cost: MODULES[id].cost }))
}

// ---- build queue ----
//
// A conversion isn't instant: metal is charged on order, then the module
// arrives after `buildTime` seconds. `slot` is the shipSlots index, or -1 for
// the central Ship frame. One pending build per slot.
var builds = []

function buildDur(id) {
	const m = MODULES[id]
	return m.buildTime || (m.cost === 0 ? 0.6 : 2)
}

function queueBuild(slot, id) {
	const cost = MODULES[id].cost
	if (res[RES_METAL] < cost) return false
	if (builds.some(b => b.slot === slot)) return false
	if (cost > 0) AddRes(RES_METAL, -cost)
	builds.push({ slot, id, t: 0, dur: buildDur(id) })
	return true
}

function BuildModule(i, id) {
	return queueBuild(i, id)
}

function BuildShip(id) {
	return queueBuild(-1, id)
}

// Advance pending builds; apply any that finished. Returns { any, shipChanged }
// so ship_state knows to resync hull/viz/turrets.
function TickBuilds(dt) {
	let any = false
	let shipChanged = false
	for (let i = builds.length - 1; i >= 0; i--) {
		const b = builds[i]
		b.t += dt
		if (b.t < b.dur) continue
		if (b.slot === -1) { currentShipId = b.id; rebuildSlots(); shipChanged = true }
		else shipSlots[b.slot].moduleId = b.id
		builds.splice(i, 1)
		any = true
	}
	if (any) RebuildShipStats()
	return { any, shipChanged }
}

// { id, frac, secLeft } for the pending build on `slot` (-1 = ship), or null.
function PendingBuild(slot) {
	const b = builds.find(x => x.slot === slot)
	return b ? { id: b.id, frac: b.t / b.dur, secLeft: Math.ceil(b.dur - b.t) } : null
}

// Every active weapon + every live support corvette as an auto-firing turret:
// { fireKind, dmg, rate, cd, from } - `from` is the gun-cube position the
// projectile leaves from. cd randomised so they don't all fire on one frame.
function PlayerTurrets() {
	const t = []
	for (const i of ActiveSlots(SLOT_WEAPON)) {
		const m = MODULES[shipSlots[i].moduleId]
		if (m.fireKind) t.push({ fireKind: m.fireKind, dmg: m.dmg, rate: m.rate, cd: Math.random() * m.rate, from: AddV3(shipSlots[i].pos, V3(0, 0.45, 0)) })
	}
	for (const i of ActiveSlots(SLOT_AUX)) {
		const m = MODULES[shipSlots[i].moduleId]
		if (m.fireKind) t.push({ fireKind: m.fireKind, dmg: m.dmg, rate: m.rate, cd: Math.random() * m.rate, from: AddV3(shipSlots[i].pos, V3(0, 0.42, 0)) })
	}
	return t
}

// 1 - product of misses over the active module slots that carry `intercept`.
function PlayerInterceptChance() {
	let miss = 1
	for (const i of ActiveSlots(SLOT_DEFENSE)) {
		const ic = MODULES[shipSlots[i].moduleId].intercept
		if (ic) miss *= 1 - ic
	}
	return 1 - miss
}

// Current ship's cell offsets (relative to origin) - what enemy fire aims at.
function PlayerCells() {
	return DecodeShipSchema(MODULES[currentShipId].schema).cells
}

function shipVizColor(m) {
	return m.fireKind ? FIRE_COLORS[m.fireKind] : m.intercept ? [0.9, 0.9, 0.95] : [0.4, 0.85, 1]
}

// The player's ship as a flat array of static cubes (hull cells + active
// module viz). ship_state builds its own pickable version; the transition
// states (hyperjump/system_travel) use this so the *real* ship is what flies
// through the effect, not a placeholder.
function CreateShipModelObjects(gl) {
	const out = []
	for (const p of DecodeShipSchema(MODULES[currentShipId].schema).cells) {
		out.push(CreateCubeObject(gl, V3(p[0], 0, p[2]), 0.5, [0.32, 0.34, 0.4]))
	}
	for (let i = 0; i < shipSlots.length; i++) {
		if (ActiveSlots(shipSlots[i].type).indexOf(i) === -1) continue
		const s = shipSlots[i]
		const m = MODULES[s.moduleId]
		if (m.viz === 'gun') {
			out.push(CreateCubeObject(gl, V3(s.pos[0], 0.45, s.pos[2]), 0.28, shipVizColor(m)))
		} else if (m.viz === 'corvette') {
			out.push(CreateCubeObject(gl, V3(s.pos[0], 0, s.pos[2]), 0.5, [0.7, 0.72, 0.8]))
			out.push(CreateCubeObject(gl, V3(s.pos[0], 0.42, s.pos[2]), 0.22, shipVizColor(m)))
		}
	}
	return out
}

// ---- enemies ----
//
// Schema-driven cube-grids, single hp pool, a fixed weapon list firing from
// the schema's W cells. A Carrier also spawns `frig.count` mini-ships, each
// its own grid + hp. See docs/battle.md.
const ENEMY_ARCHETYPES = [
	{ name: 'Raider', schema: '3.W.###.#.', hp: 150, weapons: [{ fireKind: 'kinetic', dmg: 7, rate: 0.5 }] },
	{ name: 'Gunship', schema: '3W#W###.#.', hp: 170, weapons: [{ fireKind: 'plasma', dmg: 14, rate: 1.0 }, { fireKind: 'plasma', dmg: 14, rate: 1.15 }] },
	{ name: 'Missile Boat', schema: '3.#.#W#.#.', hp: 120, weapons: [{ fireKind: 'rocket', dmg: 26, rate: 1.9 }] },
	{
		name: 'Carrier', schema: '5.###..#W#.#####.#W#..###.', hp: 240,
		weapons: [{ fireKind: 'rocket', dmg: 16, rate: 2.2 }, { fireKind: 'rocket', dmg: 16, rate: 2.4 }],
		frig: { schema: '2W#.#', hp: 60, weapon: { fireKind: 'kinetic', dmg: 6, rate: 0.6 }, count: 2 }
	}
]

function RandomEnemyArchetype() {
	return ENEMY_ARCHETYPES[Math.floor(Math.random() * ENEMY_ARCHETYPES.length)]
}

function RollPlanetEnemies() {
	const out = []
	const n = 1 + Math.floor(Math.random() * 3)
	for (let i = 0; i < n; i++) out.push(RandomEnemyArchetype())
	return out
}
