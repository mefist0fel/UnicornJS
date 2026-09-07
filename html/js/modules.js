// Ship modules: a small conversion-graph catalog. Every slot on the ship
// holds one module; a module can be turned into any of its `to` neighbours
// for that module's metal cost (cost 0 = a base/empty slot, i.e. free
// disassembly). The three graphs (weapon / defense / aux) are disjoint - a
// weapon slot never reaches a shield. Combat reads the built modules directly
// (PlayerTurrets / PlayerInterceptChance / ShipHpMax). See docs/architecture.md
// and docs/battle.md.

const SLOT_WEAPON = 0
const SLOT_DEFENSE = 1
const SLOT_AUX = 2

const SHIP_HP_MAX = 600
var shipHp = SHIP_HP_MAX

// projectile / muzzle colour per damage kind, shared by player and enemy fire
const FIRE_COLORS = {
	kinetic: [1, 0.9, 0.4],
	plasma: [0.7, 0.35, 1],
	rocket: [1, 0.55, 0.15]
}

// id -> { name, slot, cost, to:[id...], viz, fireKind?, dmg?, rate?,
//         intercept?, hpBonus?, corvHp? }
//   viz: null (base slot, nothing drawn) | 'gun' (small cube) | 'corvette'
//        (big cube + gun cube)
const MODULES = {
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

	dslot: { name: 'Defense slot', slot: SLOT_DEFENSE, cost: 0, to: ['shield', 'pd'], viz: null },
	shield: { name: 'Shield', slot: SLOT_DEFENSE, cost: 6, to: ['dslot'], viz: 'gun', hpBonus: 150 },
	pd: { name: 'Point Defense', slot: SLOT_DEFENSE, cost: 6, to: ['dslot'], viz: 'gun', intercept: 0.35 },

	aslot: { name: 'Aux slot', slot: SLOT_AUX, cost: 0, to: ['corvKin', 'corvRoc', 'corvPd'], viz: null },
	corvKin: { name: 'Kinetic Corvette', slot: SLOT_AUX, cost: 12, to: ['aslot'], viz: 'corvette', fireKind: 'kinetic', dmg: 8, rate: 0.5, corvHp: 80 },
	corvRoc: { name: 'Rocket Corvette', slot: SLOT_AUX, cost: 14, to: ['aslot'], viz: 'corvette', fireKind: 'rocket', dmg: 20, rate: 1.5, corvHp: 70 },
	corvPd: { name: 'PD Corvette', slot: SLOT_AUX, cost: 12, to: ['aslot'], viz: 'corvette', intercept: 0.3, corvHp: 70 }
}

// The ship is a 3x4 grid of hull cubes in the XZ plane; 6 of them carry an
// "edge" slot (4 weapon at the corners, 2 defense on the long sides) and 6
// aux slots ring the ship. SHIP_LAYOUT is [{ type, base, pos }] in the order
// the left-hand editor list shows them.
const HULL_CELL = 0.55
const HULL_COLS = 3
const HULL_ROWS = 4

function hullPos(col, row) {
	return V3((col - 1) * HULL_CELL, 0, (row - 1.5) * HULL_CELL)
}

const SHIP_LAYOUT = []
;[[0, 0], [2, 0], [0, 3], [2, 3]].forEach(cr =>
	SHIP_LAYOUT.push({ type: SLOT_WEAPON, base: 'wslot', pos: hullPos(cr[0], cr[1]) }))
;[[0, 1.5], [2, 1.5]].forEach(cr =>
	SHIP_LAYOUT.push({ type: SLOT_DEFENSE, base: 'dslot', pos: hullPos(cr[0], cr[1]) }))
for (let i = 0; i < 6; i++) {
	const a = i * Math.PI / 3
	SHIP_LAYOUT.push({ type: SLOT_AUX, base: 'aslot', pos: V3(Math.cos(a) * 1.95, 0, Math.sin(a) * 1.95) })
}

// live per-slot state: [{ type, pos, moduleId }]
var shipSlots = []

function ResetShip() {
	shipSlots = SHIP_LAYOUT.map(s => ({ type: s.type, pos: s.pos, moduleId: s.base }))
	shipHp = ShipHpMax()
}

function SlotModule(i) {
	return MODULES[shipSlots[i].moduleId]
}

// Conversion targets for slot i: [{ id, name, cost }] from the current
// module's graph edges.
function SlotTargets(i) {
	return MODULES[shipSlots[i].moduleId].to.map(id => ({ id, name: MODULES[id].name, cost: MODULES[id].cost }))
}

// Convert slot i to module id if the player can afford it. Returns success.
function BuildModule(i, id) {
	const cost = MODULES[id].cost
	if (res[RES_METAL] < cost) return false
	if (cost > 0) AddRes(RES_METAL, -cost)
	shipSlots[i].moduleId = id
	return true
}

// Left-editor rows: [{ index, name }], name = current module (or base slot).
function ShipModuleList() {
	return shipSlots.map((s, i) => ({ index: i, name: MODULES[s.moduleId].name }))
}

function ShipHpMax() {
	let hp = SHIP_HP_MAX
	for (const s of shipSlots) {
		const b = MODULES[s.moduleId].hpBonus
		if (b) hp += b
	}
	return hp
}

// Every built weapon + every live corvette as an independent auto-firing
// turret: [{ fireKind, dmg, rate, cd }]. cd is randomised so they don't all
// fire on the same frame.
function PlayerTurrets() {
	const t = []
	for (const s of shipSlots) {
		const m = MODULES[s.moduleId]
		if (m.fireKind) t.push({ fireKind: m.fireKind, dmg: m.dmg, rate: m.rate, cd: Math.random() * m.rate })
	}
	return t
}

// Combined chance that at least one point-defense module shoots down an
// incoming rocket (independent rolls, so 1 - product of misses).
function PlayerInterceptChance() {
	let miss = 1
	for (const s of shipSlots) {
		const ic = MODULES[s.moduleId].intercept
		if (ic) miss *= 1 - ic
	}
	return 1 - miss
}

// ---- enemies ----
//
// An archetype: core hp + weapon, optionally a couple of frigates each with
// their own hp and weapon. `fireKind` null = unarmed (a frigate carrier's
// core can still be a threat via its rockets). RollPlanetEnemies picks 1-3.
const ENEMY_ARCHETYPES = [
	{ name: 'Raider', hp: 140, fireKind: 'kinetic', dmg: 7, rate: 0.5, frigates: 0 },
	{ name: 'Gunship', hp: 120, fireKind: 'plasma', dmg: 15, rate: 1.0, frigates: 0 },
	{ name: 'Missile Boat', hp: 100, fireKind: 'rocket', dmg: 26, rate: 1.9, frigates: 0 },
	{
		name: 'Carrier', hp: 180, fireKind: 'rocket', dmg: 18, rate: 2.2,
		frigates: 2, frigHp: 60, frigKind: 'kinetic', frigDmg: 6, frigRate: 0.6
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
