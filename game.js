import * as THREE from 'three';
import { audio } from './audio.js';
import { Animator } from './animation.js';

/**
 * Константы игры
 */
let GRID_SIZE = 50;
const TARGET_PERCENT = 80;

const COLORS = {
    OCCUPIED: 0x3949ab, // Яркий индиго
    TRAIL: 0x00e5ff,    // Светящийся циан
    EMPTY: 0x0a0a0a,    // Почти черный
    BALL: 0xff00ff,     // Маджента
    MINE: 0xff3d00      // Ярко-оранжевый
};

const CELL_TYPE = {
    EMPTY: 0,
    OCCUPIED: 1,
    TRAIL: 2
};

/**
 * Утилита для заливки (Flood Fill)
 * Мотив: Определение областей, не содержащих врагов, для их захвата.
 */
class FloodFill {
    static getFillableAreas(grid, enemies) {
        const visited = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
        const areas = [];

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (grid[y][x] === CELL_TYPE.EMPTY && !visited[y][x]) {
                    const area = [];
                    const queue = [[x, y]];
                    visited[y][x] = true;
                    let hasEnemy = false;

                    while (queue.length > 0) {
                        const [cx, cy] = queue.shift();
                        area.push([cx, cy]);

                        // Проверяем, есть ли враг в этой ячейке
                        if (enemies.some(e => Math.floor(e.x) === cx && Math.floor(e.z) === cy)) {
                            hasEnemy = true;
                        }

                        const neighbors = [
                            [cx + 1, cy], [cx - 1, cy],
                            [cx, cy + 1], [cx, cy - 1]
                        ];

                        for (const [nx, ny] of neighbors) {
                            if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE &&
                                grid[ny][nx] === CELL_TYPE.EMPTY && !visited[ny][nx]) {
                                visited[ny][nx] = true;
                                queue.push([nx, ny]);
                            }
                        }
                    }

                    if (!hasEnemy) {
                        areas.push(area);
                    }
                }
            }
        }
        return areas;
    }
}

/**
 * Класс игрока (Дрон)
 * Мотив: Управление движением и логика формирования следа.
 */
class Drone {
    constructor(scene, animator) {
        this.x = 0;
        this.z = 0;
        this.vx = 0;
        this.vz = 0;
        this.lastX = -1;
        this.lastZ = -1;
        this.speed = 0.15;
        
        this.mesh = animator.createHelicopter();
        scene.add(this.mesh);

        // Свет от дрона
        this.light = new THREE.PointLight(0x00ffff, 1, 5);
        scene.add(this.light);
    }

    update(grid) {
        const nextX = this.x + this.vx;
        const nextZ = this.z + this.vz;

        // Поворот вертолета в сторону движения
        if (this.vx > 0) this.mesh.rotation.y = Math.PI / 2;
        else if (this.vx < 0) this.mesh.rotation.y = -Math.PI / 2;
        else if (this.vz > 0) this.mesh.rotation.y = Math.PI;
        else if (this.vz < 0) this.mesh.rotation.y = 0;

        // Наклон при движении
        if (this.vx !== 0 || this.vz !== 0) {
            this.mesh.rotation.x = 0.2; // Небольшой наклон вперед
        } else {
            this.mesh.rotation.x = 0;
        }

        // Ограничение границами поля
        if (nextX >= 0 && nextX < GRID_SIZE && nextZ >= 0 && nextZ < GRID_SIZE) {
            this.x = nextX;
            this.z = nextZ;
        }

        this.mesh.position.set(this.x - GRID_SIZE / 2 + 0.5, 0.5, this.z - GRID_SIZE / 2 + 0.5);
        this.light.position.copy(this.mesh.position);
    }

    reset(x, z) {
        this.x = x;
        this.z = z;
        this.vx = 0;
        this.vz = 0;
        this.lastX = Math.floor(x);
        this.lastZ = Math.floor(z);
    }
}

/**
 * Класс врага (Шар/Мина)
 * Мотив: Базовая логика движения и отражения для всех типов врагов.
 */
class Enemy {
    constructor(scene, x, z, type, speed) {
        this.x = x;
        this.z = z;
        this.type = type; // 'ball' или 'mine'
        this.speed = speed;
        
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * speed;
        this.vz = Math.sin(angle) * speed;

        const geometry = type === 'ball' ? new THREE.SphereGeometry(0.4, 12, 12) : new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const color = type === 'ball' ? COLORS.BALL : COLORS.MINE;
        const material = new THREE.MeshStandardMaterial({ 
            color: color, 
            emissive: color,
            emissiveIntensity: 0.8 
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        scene.add(this.mesh);
    }

    update(grid) {
        let nextX = this.x + this.vx;
        let nextZ = this.z + this.vz;

        const gridX = Math.floor(nextX);
        const gridZ = Math.floor(nextZ);

        if (this.type === 'ball') {
            // Отражение от границ и занятых зон
            if (gridX < 0 || gridX >= GRID_SIZE || grid[Math.floor(this.z)][gridX] === CELL_TYPE.OCCUPIED) {
                this.vx *= -1;
                nextX = this.x + this.vx;
            }
            if (gridZ < 0 || gridZ >= GRID_SIZE || grid[gridZ][Math.floor(this.x)] === CELL_TYPE.OCCUPIED) {
                this.vz *= -1;
                nextZ = this.z + this.vz;
            }
        } else {
            // Мина движется ТОЛЬКО по занятой территории (суше)
            if (gridX < 0 || gridX >= GRID_SIZE || grid[Math.floor(this.z)][gridX] !== CELL_TYPE.OCCUPIED) {
                this.vx *= -1;
                nextX = this.x + this.vx;
            }
            if (gridZ < 0 || gridZ >= GRID_SIZE || grid[gridZ][Math.floor(this.x)] !== CELL_TYPE.OCCUPIED) {
                this.vz *= -1;
                nextZ = this.z + this.vz;
            }
        }

        this.x = nextX;
        this.z = nextZ;
        this.mesh.position.set(this.x - GRID_SIZE / 2 + 0.5, 0.5, this.z - GRID_SIZE / 2 + 0.5);
    }
}

/**
 * Класс отслеживания статистики игрока
 * Мотив: Сбор и расчет метрик поведения игрока для отображения в конце уровня.
 */
class StatsTracker {
    constructor() {
        this.reset();
    }

    reset() {
        this.startTime = Date.now();
        this.directionChanges = 0;
        this.totalDistance = 0;
        this.lastTurnTime = Date.now();
        this.turnIntervals = [];
        this.timeInDanger = 0; // Время в пустой зоне (мс)
        this.lastDangerCheck = null;
    }

    recordTurn() {
        this.directionChanges++;
        const now = Date.now();
        this.turnIntervals.push(now - this.lastTurnTime);
        this.lastTurnTime = now;
    }

    recordMove(distance, isDanger) {
        this.totalDistance += distance;
        const now = Date.now();
        if (isDanger) {
            if (this.lastDangerCheck) {
                this.timeInDanger += (now - this.lastDangerCheck);
            }
            this.lastDangerCheck = now;
        } else {
            this.lastDangerCheck = null;
        }
    }

    getStats() {
        const totalTimeSec = (Date.now() - this.startTime) / 1000;
        const avgReaction = this.turnIntervals.length > 0 
            ? (this.turnIntervals.reduce((a, b) => a + b, 0) / this.turnIntervals.length / 1000).toFixed(2)
            : 0;

        return {
            time: this.formatTime(totalTimeSec),
            turns: this.directionChanges,
            avgReaction: avgReaction + " сек",
            distance: Math.floor(this.totalDistance) + " м",
            dangerRatio: Math.floor((this.timeInDanger / 1000 / totalTimeSec) * 100) + "%"
        };
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
}

/**
 * Основной класс игры
 * Мотив: Оркестрация всех систем, уровней и рендеринга.
 */
class Game {
    constructor() {
        this.level = 1;
        this.lives = 3;
        this.capturedPercent = 0;
        this.grid = [];
        this.enemies = [];
        this.trailCount = 0;
        this.animator = new Animator();
        this.stats = new StatsTracker();
        
        this.initScene();
        this.initGrid();
        this.initDrone();
        this.setupEventListeners();
        this.startLevel(1);
        this.animate();
    }

    initScene() {
        // Очищаем старую сцену если она была
        if (this.scene) {
            while(this.scene.children.length > 0){ 
                this.scene.remove(this.scene.children[0]); 
            }
        } else {
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
            this.renderer = new THREE.WebGLRenderer({ antialias: true });
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.renderer.setClearColor(0x020202);
            document.getElementById('game-container').appendChild(this.renderer.domElement);
        }

        // Динамическая позиция камеры в зависимости от размера сетки
        const camHeight = GRID_SIZE;
        const camDist = GRID_SIZE * 0.7;
        this.camera.position.set(0, camHeight, camDist);
        this.camera.lookAt(0, 0, 0);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
        sunLight.position.set(10, 20, 10);
        this.scene.add(sunLight);

        // Основная подложка (пол)
        const floorGeo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
        const floorMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.1;
        this.scene.add(floor);

        // Сетка пола (визуальная)
        const gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x00ffff, 0x111111);
        gridHelper.material.opacity = 0.2;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);

        // InstancedMesh для занятых блоков
        const geometry = new THREE.BoxGeometry(0.95, 0.5, 0.95);
        const material = new THREE.MeshPhongMaterial({ 
            color: COLORS.OCCUPIED,
            emissive: COLORS.OCCUPIED,
            emissiveIntensity: 0.2
        });
        this.occupiedMesh = new THREE.InstancedMesh(geometry, material, GRID_SIZE * GRID_SIZE);
        this.scene.add(this.occupiedMesh);

        // Mesh для следа
        const trailGeometry = new THREE.BoxGeometry(0.8, 0.15, 0.8);
        const trailMaterial = new THREE.MeshStandardMaterial({ 
            color: COLORS.TRAIL,
            emissive: COLORS.TRAIL,
            emissiveIntensity: 1.0
        });
        this.trailMesh = new THREE.InstancedMesh(trailGeometry, trailMaterial, GRID_SIZE * GRID_SIZE);
        this.scene.add(this.trailMesh);
    }

    initGrid() {
        this.grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(CELL_TYPE.EMPTY));
        
        // Создаем начальную рамку (2 ячейки толщиной)
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (x < 2 || x >= GRID_SIZE - 2 || y < 2 || y >= GRID_SIZE - 2) {
                    this.grid[y][x] = CELL_TYPE.OCCUPIED;
                }
            }
        }
        this.updateVisualGrid();
    }

    initDrone() {
        this.drone = new Drone(this.scene, this.animator);
        this.drone.reset(1, 1);
    }

    /**
     * Запуск уровня
     * Мотив: Сброс состояния игры и инициализация параметров сложности для нового уровня.
     */
    startLevel(lvl) {
        this.level = lvl;
        this.enemies.forEach(e => this.scene.remove(e.mesh));
        this.enemies = [];
        this.trailCount = 0;
        this.capturedPercent = 0; // Сбрасываем процент перед расчетом
        this.stats.reset();
        this.initGrid();
        this.drone.reset(1, 1);
        audio.playStart();
        
        let ballCount = 2;
        let mineCount = 0;
        let ballSpeed = 0.05;
        let droneSpeed = 0.15;

        if (lvl === 2) {
            ballCount = 3;
            mineCount = 1;
            ballSpeed = 0.08;
        } else if (lvl === 3) {
            ballCount = 5;
            mineCount = 2;
            ballSpeed = 0.12;
            droneSpeed = 0.22;
        }

        this.drone.speed = droneSpeed;

        // Создаем шары (в пустоте)
        for (let i = 0; i < ballCount; i++) {
            const rx = 5 + Math.random() * (GRID_SIZE - 10);
            const rz = 5 + Math.random() * (GRID_SIZE - 10);
            this.enemies.push(new Enemy(this.scene, rx, rz, 'ball', ballSpeed));
        }

        // Создаем мины (на суше)
        for (let i = 0; i < mineCount; i++) {
            // Размещаем мины в разных углах, подальше от игрока (1,1)
            const mx = (i === 0) ? GRID_SIZE - 2 : 2;
            const mz = GRID_SIZE - 2;
            this.enemies.push(new Enemy(this.scene, mx, mz, 'mine', ballSpeed));
        }

        document.getElementById('level-val').innerText = this.level;
        document.getElementById('lives-val').innerText = this.lives;
        this.calculateCaptured();
    }

    updateVisualGrid() {
        let occIdx = 0;
        let trailIdx = 0;
        const dummy = new THREE.Object3D();

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (this.grid[y][x] === CELL_TYPE.OCCUPIED) {
                    dummy.position.set(x - GRID_SIZE / 2 + 0.5, 0.25, y - GRID_SIZE / 2 + 0.5);
                    dummy.updateMatrix();
                    this.occupiedMesh.setMatrixAt(occIdx++, dummy.matrix);
                } else if (this.grid[y][x] === CELL_TYPE.TRAIL) {
                    dummy.position.set(x - GRID_SIZE / 2 + 0.5, 0.05, y - GRID_SIZE / 2 + 0.5);
                    dummy.updateMatrix();
                    this.trailMesh.setMatrixAt(trailIdx++, dummy.matrix);
                }
            }
        }
        this.occupiedMesh.count = occIdx;
        this.trailMesh.count = trailIdx;
        this.occupiedMesh.instanceMatrix.needsUpdate = true;
        this.trailMesh.instanceMatrix.needsUpdate = true;
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            audio.init(); // Инициализация звука при первом нажатии
            const oldVx = this.drone.vx;
            const oldVz = this.drone.vz;

            switch(e.key.toLowerCase()) {
                case 'arrowup': case 'w': this.drone.vx = 0; this.drone.vz = -this.drone.speed; break;
                case 'arrowdown': case 's': this.drone.vx = 0; this.drone.vz = this.drone.speed; break;
                case 'arrowleft': case 'a': this.drone.vx = -this.drone.speed; this.drone.vz = 0; break;
                case 'arrowright': case 'd': this.drone.vx = this.drone.speed; this.drone.vz = 0; break;
            }

            if (this.drone.vx !== oldVx || this.drone.vz !== oldVz) {
                this.stats.recordTurn();
            }
        });

        document.getElementById('restart-btn').onclick = () => {
            if (this.capturedPercent >= TARGET_PERCENT) {
                if (this.level < 3) {
                    this.level++;
                    this.startLevel(this.level);
                } else {
                    this.level = 1;
                    this.lives = 3;
                    this.startLevel(1);
                }
            } else if (this.lives <= 0) {
                this.level = 1;
                this.lives = 3;
                this.startLevel(1);
            }
            document.getElementById('message').classList.add('hidden');
        };

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        document.getElementById('grid-size-select').onchange = (e) => {
            GRID_SIZE = parseInt(e.target.value);
            this.initScene();
            this.initDrone(); // Воскрешаем вертолетик в новой сцене
            this.lives = 3;
            this.startLevel(1);
            e.target.blur(); // Снимаем фокус с выпадающего списка, чтобы клавиши управления работали
        };
    }

    /**
     * Обработка захвата территории
     * Мотив: Вычисление замкнутых областей без врагов и их заполнение при возвращении дрона на базу.
     */
    handleCapture() {
        audio.playCapture();
        const fillAreas = FloodFill.getFillableAreas(this.grid, this.enemies);
        fillAreas.forEach(area => {
            area.forEach(([x, y]) => {
                this.grid[y][x] = CELL_TYPE.OCCUPIED;
            });
        });

        // Превращаем след в сушу
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (this.grid[y][x] === CELL_TYPE.TRAIL) {
                    this.grid[y][x] = CELL_TYPE.OCCUPIED;
                }
            }
        }
        this.trailCount = 0;
        this.updateVisualGrid();
        this.calculateCaptured();
    }

    calculateCaptured() {
        let occupied = 0;
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (this.grid[y][x] === CELL_TYPE.OCCUPIED) occupied++;
            }
        }
        this.capturedPercent = Math.floor((occupied / (GRID_SIZE * GRID_SIZE)) * 100);
        document.getElementById('percent-val').innerText = this.capturedPercent;

        if (this.capturedPercent >= TARGET_PERCENT) {
            audio.playWin();
            if (this.level < 3) {
                this.showMessage(`Уровень ${this.level} пройден!`, "Следующий уровень");
            } else {
                this.showMessage("ПОБЕДА!", "Играть снова");
            }
        }
    }

    /**
     * Смерть игрока
     * Мотив: Уменьшение жизней, сброс следа и позиции дрона при столкновении или ошибке.
     */
    die() {
        audio.playDeath();
        this.lives--;
        document.getElementById('lives-val').innerText = this.lives;
        
        // Очищаем след
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (this.grid[y][x] === CELL_TYPE.TRAIL) this.grid[y][x] = CELL_TYPE.EMPTY;
            }
        }
        this.trailCount = 0;
        this.updateVisualGrid();
        this.drone.reset(1, 1);

        if (this.lives <= 0) {
            this.showMessage("ИГРА ОКОНЧЕНА", "Попробовать еще раз");
        }
    }

    showMessage(text, btnText) {
        const s = this.stats.getStats();
        const statsHtml = `
            <div><span>Время прохождения:</span> <span>${s.time}</span></div>
            <div><span>Смен направления:</span> <span>${s.turns}</span></div>
            <div><span>Ср. время реакции:</span> <span>${s.avgReaction}</span></div>
            <div><span>Пройденный путь:</span> <span>${s.distance}</span></div>
            <div><span>Уровень риска:</span> <span>${s.dangerRatio}</span></div>
        `;
        document.getElementById('detailed-stats').innerHTML = statsHtml;
        document.getElementById('message-text').innerText = text;
        document.getElementById('restart-btn').innerText = btnText;
        document.getElementById('message').classList.remove('hidden');
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const deltaTime = 0.016; // Примерно 60fps
        const bobbingOffset = this.animator.update(deltaTime);

        if (document.getElementById('message').classList.contains('hidden')) {
            this.drone.update(this.grid);
            
            // Обновляем звук двигателя с учетом позиции и скорости (эффект Доплера)
            audio.updateEngine(
                this.drone.mesh.position, 
                { vx: this.drone.vx, vz: this.drone.vz }, 
                this.camera.position
            );
            
            // Обновляем статистику движения
            const isDanger = this.trailCount > 0;
            const dist = Math.sqrt(this.drone.vx**2 + this.drone.vz**2);
            this.stats.recordMove(dist, isDanger);

            // Обновляем таймер и статистику в UI
            const timeSec = (Date.now() - this.stats.startTime) / 1000;
            document.getElementById('timer-val').innerText = this.stats.formatTime(timeSec);
            
            const s = this.stats.getStats();
            document.getElementById('turns-val').innerText = s.turns;
            document.getElementById('reaction-val').innerText = s.avgReaction.split(' ')[0];
            document.getElementById('distance-val').innerText = s.distance.replace(' м', '');
            document.getElementById('risk-val').innerText = s.dangerRatio.replace('%', '');

            const gx = Math.floor(this.drone.x);
            const gz = Math.floor(this.drone.z);
            
            // Обрабатываем логику только при смене ячейки сетки
            if (gx !== this.drone.lastX || gz !== this.drone.lastZ) {
                const currentCell = this.grid[gz][gx];

                if (currentCell === CELL_TYPE.EMPTY) {
                    this.grid[gz][gx] = CELL_TYPE.TRAIL;
                    this.trailCount++;
                    audio.playTrailStep();
                    this.updateVisualGrid();
                } else if (currentCell === CELL_TYPE.OCCUPIED && this.trailCount > 0) {
                    this.handleCapture();
                } else if (currentCell === CELL_TYPE.TRAIL) {
                    // Если дрон пересек свой же след - это смерть
                    this.die();
                }
                
                this.drone.lastX = gx;
                this.drone.lastZ = gz;
            }

            this.enemies.forEach(enemy => {
                enemy.update(this.grid);
                
                // Добавляем эффект покачивания врагам
                enemy.mesh.position.y = 0.5 + bobbingOffset;
                
                // Столкновение с дроном
                const dist = Math.sqrt((enemy.x - this.drone.x)**2 + (enemy.z - this.drone.z)**2);
                if (dist < 0.8) this.die();

                // Столкновение с незавершенным следом
                if (this.grid[Math.floor(enemy.z)][Math.floor(enemy.x)] === CELL_TYPE.TRAIL) {
                    this.die();
                }
            });
        } else {
            // Если игра на паузе (окно сообщения), переводим двигатель в режим холостого хода
            audio.updateEngine(false);
        }

        this.renderer.render(this.scene, this.camera);
    }

    hasTrail() {
        return this.trailCount > 0;
    }
}

new Game();
