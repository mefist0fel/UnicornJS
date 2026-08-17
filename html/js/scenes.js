// Populates entities/camera/UI for each state. See docs/architecture.md
// for the state table and docs/camera.md for the constraint reasoning.

const MENU = 0
const SOLAR = 1
const PLANET = 2

const PLANETS = [
	{ name: 'Розовый единорог', color: [1, 0.5, 0.8], dist: 5 },
	{ name: 'Оранжевая радуга', color: [1, 0.6, 0.2], dist: 7.5 },
	{ name: 'Мятный простор', color: [0.4, 1, 0.7], dist: 10 }
]

var selectedPlanet = PLANETS[0]

function BuildSolarSystem(clickable) {
	CreateSphereEntity(V3(0, 0, 0), 1.6, [1, 0.95, 0.4])
	for (let i = 0; i < PLANETS.length; i++) {
		const p = PLANETS[i]
		const a = i * 2.2
		const pos = V3(Math.cos(a) * p.dist, 0, Math.sin(a) * p.dist)
		const e = CreateSphereEntity(pos, 0.7, p.color)
		if (clickable) e.onClick = () => { selectedPlanet = p; SetState(PLANET) }
	}
}

function EnterMenu() {
	camera.setConstraints({ minPhi: 0.3, maxPhi: Math.PI / 2 - 0.05, minRadius: 15, maxRadius: 15, autoSpeed: 0.2 })
	camera.phi = 1.0
	camera.radius = 15
	BuildSolarSystem(false)
	CreatePanel('UNICORNS & RAINBOWS', 'top')
	CreateButton('Играть', 'center', () => SetState(SOLAR))
}

function EnterSolar() {
	camera.setConstraints({ minPhi: 0.15, maxPhi: Math.PI / 2 - 0.05, minRadius: 8, maxRadius: 24 })
	camera.radius = 15
	BuildSolarSystem(true)
	CreatePanel('Солнечная система - выбери планету', 'top')
}

function EnterPlanet(p) {
	camera.setConstraints({ minPhi: 0.05, maxPhi: Math.PI - 0.05, minRadius: 5, maxRadius: 14 })
	camera.radius = 7
	CreateSphereEntity(V3(0, 0, 0), 2.5, p.color)
	CreatePanel(p.name, 'top')
	CreateButton('Назад', 'bottom', () => SetState(SOLAR))
}
