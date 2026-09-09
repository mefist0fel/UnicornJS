// Ship model. Two string-encoded ideas, in the spirit of meshformat/texture:
//
//  * a SHIP SCHEMA string (see docs/shipformat.md) - "<width><grid>|<support
//    coords>" - drives both the player ship and enemy ships. Grid chars:
//      .  empty     #  hull cube     W  weapon slot     M  module slot
//    Axes (fixed project-wide): x = left/right, y = up/down, z = fwd/back,
//    motion plane = xz. In a schema, COL -> x, ROW -> z, and ROW 0 is the NOSE
//    (-z = forward). Cell world pos: ((col-(w-1)/2), 0, (row-(h-1)/2)) * SHIP_CELL.
//    After '|', pairs of digits are support-ship slots, each `digit-4` cells
//    from centre (x then z) - e.g. "0484" = one slot left, one right.
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

// slot KIND (the `type` on a shipSlots entry) - distinct from a module id.
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
var shipHp = 500

// Module ids are plain NUMBERS, declared here in order, and the number itself
// carries what a `viz` field used to: id < 0 = an empty base slot (draw
// nothing), id >= M_CORV = a corvette (body + gun cube), anything else = a
// single gun cube. Ship frames (M_S1..) are never a slot's moduleId, they sit
// past the corvettes. Numeric keys mean MODULES[id] needs no quoting to
// survive closure ADVANCED (see docs/build.md) - the key can't be mangled.
const M_WSLOT = -1, M_DSLOT = -2, M_ASLOT = -3
const M_KIN1 = 0, M_KIN2 = 1, M_KIN3 = 2
const M_ROC1 = 3, M_ROC2 = 4, M_ROC3 = 5
const M_PLA1 = 6, M_PLA2 = 7, M_PLA3 = 8
const M_SHIELD = 9, M_SHIELD2 = 10, M_PD = 11
const M_CORV = 12 // ids >= this are corvettes (viz = body + gun)
const M_CORVKIN = 12, M_CORVROC = 13, M_CORVPD = 14
const M_S1 = 15, M_S2 = 16, M_S3 = 17

// fire kinds (were 'kinetic'/'plasma'/'rocket'); index straight into the
// FIRE_COLORS / SHIP_PROJ_SPEED / SHOOT_SFX arrays.
const F_KIN = 0, F_PLA = 1, F_ROC = 2

var currentShipId = M_S1

// projectile / muzzle colour per fire kind (F_KIN/F_PLA/F_ROC), player + enemy.
const FIRE_COLORS = [[1, 0.9, 0.4], [0.7, 0.35, 1], [1, 0.55, 0.15]]

// id -> { name, cost, to:[id...], schema?, stats?, fireKind?, dmg?, rate?,
//         intercept?, buildTime? }. No `slot` (was never read) and no `viz`
// (derived from the id range, see above). Keys are the M_* number constants.
const MODULES = {
	// --- weapons ---
	[M_WSLOT]: { name: 'Weapon slot', cost: 0, to: [M_KIN1, M_ROC1, M_PLA1] },
	[M_KIN1]: { name: 'Kinetic I', cost: 5, to: [M_KIN2, M_WSLOT], fireKind: F_KIN, dmg: 6, rate: 0.5 },
	[M_KIN2]: { name: 'Kinetic II', cost: 6, to: [M_KIN3, M_WSLOT], fireKind: F_KIN, dmg: 9, rate: 0.45 },
	[M_KIN3]: { name: 'Kinetic III', cost: 9, to: [M_WSLOT], fireKind: F_KIN, dmg: 13, rate: 0.4 },
	[M_ROC1]: { name: 'Rocket I', cost: 5, to: [M_ROC2, M_WSLOT], fireKind: F_ROC, dmg: 16, rate: 1.6 },
	[M_ROC2]: { name: 'Rocket II', cost: 6, to: [M_ROC3, M_WSLOT], fireKind: F_ROC, dmg: 22, rate: 1.5 },
	[M_ROC3]: { name: 'Rocket III', cost: 9, to: [M_WSLOT], fireKind: F_ROC, dmg: 30, rate: 1.4 },
	[M_PLA1]: { name: 'Plasma I', cost: 7, to: [M_PLA2, M_WSLOT], fireKind: F_PLA, dmg: 10, rate: 0.9 },
	[M_PLA2]: { name: 'Plasma II', cost: 8, to: [M_PLA3, M_WSLOT], fireKind: F_PLA, dmg: 15, rate: 0.85 },
	[M_PLA3]: { name: 'Plasma III', cost: 11, to: [M_WSLOT], fireKind: F_PLA, dmg: 21, rate: 0.8 },

	// --- modules (PD + shields) ---
	[M_DSLOT]: { name: 'Module slot', cost: 0, to: [M_SHIELD, M_PD] },
	[M_SHIELD]: { name: 'Shield', cost: 6, to: [M_SHIELD2, M_DSLOT], stats: { [STAT_SHIELD]: 150 } },
	[M_SHIELD2]: { name: 'Shield II', cost: 9, to: [M_DSLOT], stats: { [STAT_SHIELD]: 280 } },
	[M_PD]: { name: 'Point Defense', cost: 6, to: [M_DSLOT], intercept: 0.35 },

	// --- support ships (corvettes) ---
	[M_ASLOT]: { name: 'Support slot', cost: 0, to: [M_CORVKIN, M_CORVROC, M_CORVPD] },
	[M_CORVKIN]: { name: 'Kinetic Corvette', cost: 12, buildTime: 3.5, to: [M_ASLOT], fireKind: F_KIN, dmg: 8, rate: 0.5 },
	[M_CORVROC]: { name: 'Rocket Corvette', cost: 14, buildTime: 3.5, to: [M_ASLOT], fireKind: F_ROC, dmg: 20, rate: 1.5 },
	[M_CORVPD]: { name: 'PD Corvette', cost: 12, buildTime: 3.5, to: [M_ASLOT], intercept: 0.3 },

	// --- ship frames (central slot). schema + stat baseline. col->x, row->z,
	// row 0 = nose (-z, forward). ---
	[M_S1]: {
		name: 'Scout Frame', cost: 0, to: [M_S2], buildTime: 5,
		schema: '3.#.MWM###.#.|1474',
		stats: { [STAT_HP]: 500, [STAT_WEAPONS]: 1, [STAT_MODULES]: 2, [STAT_SUPPORTS]: 2 }
	},
	[M_S2]: {
		// symmetric arrow: 3 spine guns, 4 wing-root modules, 2 support slots on the sides.
		name: 'Wing Frame', cost: 30, to: [M_S1, M_S3], buildTime: 5,
		schema: '5..W..M###M##W##M###M.#W#.|0484',
		stats: { [STAT_HP]: 900, [STAT_WEAPONS]: 3, [STAT_MODULES]: 3, [STAT_SUPPORTS]: 2 }
	},
	[M_S3]: {
		// 5 guns (2 nose + spine + 2 tips), 4 wing modules, 3 support (2 sides + 1 rear).
		name: 'Battle Frame', cost: 60, to: [M_S2], buildTime: 5,
		schema: '5.W.W.M#W#MW###WM###M.###.|048448',
		stats: { [STAT_HP]: 1400, [STAT_WEAPONS]: 5, [STAT_MODULES]: 4, [STAT_SUPPORTS]: 3 }
	}
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
	shipSlots = mk(dec.weapons, SLOT_WEAPON, M_WSLOT)
		.concat(mk(dec.modules, SLOT_DEFENSE, M_DSLOT))
		.concat(mk(dec.supports, SLOT_AUX, M_ASLOT))
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
	currentShipId = M_S1
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
		if (m.fireKind != null) t.push({ fireKind: m.fireKind, dmg: m.dmg, rate: m.rate, cd: Mr() * m.rate, from: AddV3(shipSlots[i].pos, V3(0, 0.45, 0)) })
	}
	for (const i of ActiveSlots(SLOT_AUX)) {
		const m = MODULES[shipSlots[i].moduleId]
		if (m.fireKind != null) t.push({ fireKind: m.fireKind, dmg: m.dmg, rate: m.rate, cd: Mr() * m.rate, from: AddV3(shipSlots[i].pos, V3(0, 0.42, 0)) })
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
	return m.fireKind != null ? FIRE_COLORS[m.fireKind] : m.intercept ? [0.9, 0.9, 0.95] : [0.4, 0.85, 1]
}

// What to draw for a module in a slot, from its id range (replaces `viz`):
// 0 = nothing (empty base slot), 1 = one gun cube, 2 = a corvette (body + gun).
function SlotViz(id) {
	return id < 0 ? 0 : id >= M_CORV ? 2 : 1
}

// The player's ship as a flat array of static cubes (hull cells + active
// module viz). ship_state builds its own pickable version; the transition
// states (hyperjump/system_travel) use this so the *real* ship is what flies
// through the effect, not a placeholder.
function CreateShipModelObjects() {
	const out = []
	for (const p of DecodeShipSchema(MODULES[currentShipId].schema).cells) {
		out.push(CreateCubeObject(V3(p[0], 0, p[2]), 0.5, [0.32, 0.34, 0.4]))
	}
	for (let i = 0; i < shipSlots.length; i++) {
		if (ActiveSlots(shipSlots[i].type).indexOf(i) === -1) continue
		const s = shipSlots[i]
		const vk = SlotViz(s.moduleId)
		if (!vk) continue
		const m = MODULES[s.moduleId]
		if (vk === 2) {
			out.push(CreateCubeObject(V3(s.pos[0], 0, s.pos[2]), 0.5, [0.7, 0.72, 0.8]))
			out.push(CreateCubeObject(V3(s.pos[0], 0.42, s.pos[2]), 0.22, shipVizColor(m)))
		} else {
			out.push(CreateCubeObject(V3(s.pos[0], 0.45, s.pos[2]), 0.28, shipVizColor(m)))
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
	{ name: 'Raider', schema: '3.W.###.#.', hp: 150, weapons: [{ fireKind: F_KIN, dmg: 7, rate: 0.5 }] },
	{ name: 'Gunship', schema: '3W#W###.#.', hp: 170, weapons: [{ fireKind: F_PLA, dmg: 14, rate: 1.0 }, { fireKind: F_PLA, dmg: 14, rate: 1.15 }] },
	{ name: 'Missile Boat', schema: '3.#.#W#.#.', hp: 120, weapons: [{ fireKind: F_ROC, dmg: 26, rate: 1.9 }] },
	{
		name: 'Carrier', schema: '5.###..#W#.#####.#W#..###.', hp: 240,
		weapons: [{ fireKind: F_ROC, dmg: 16, rate: 2.2 }, { fireKind: F_ROC, dmg: 16, rate: 2.4 }],
		frig: { schema: '2W#.#', hp: 60, weapon: { fireKind: F_KIN, dmg: 6, rate: 0.6 }, count: 2 }
	}
]

function RandomEnemyArchetype() {
	return ENEMY_ARCHETYPES[Mfl(Mr() * ENEMY_ARCHETYPES.length)]
}

function RollPlanetEnemies() {
	const out = []
	const n = 1 + Mfl(Mr() * 3)
	for (let i = 0; i < n; i++) out.push(RandomEnemyArchetype())
	return out
}
