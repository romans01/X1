import * as THREE from 'three';

/**
 * Класс Аниматора
 * Мотив: Централизованное управление визуальными эффектами и анимациями для разгрузки основной логики.
 */
export class Animator {
    constructor() {
        this.animations = [];
    }

    /**
     * Создает упрощенную модель вертолета
     * Мотив: Визуальная замена сферы на тематический объект согласно ТЗ.
     */
    createHelicopter() {
        const group = new THREE.Group();
        // Увеличиваем общий масштаб вертолета
        const scale = 1.6;

        // Корпус (тело)
        const bodyGeo = new THREE.BoxGeometry(0.6 * scale, 0.4 * scale, 0.8 * scale);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0x222222 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(body);

        // Кабина (стекло)
        const cockpitGeo = new THREE.BoxGeometry(0.4 * scale, 0.3 * scale, 0.3 * scale);
        const cockpitMat = new THREE.MeshPhongMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6 });
        const cockpit = new THREE.Mesh(cockpitGeo, cockpitMat);
        cockpit.position.set(0, 0.05 * scale, 0.3 * scale);
        group.add(cockpit);

        // Хвост
        const tailGeo = new THREE.BoxGeometry(0.15 * scale, 0.15 * scale, 0.6 * scale);
        const tail = new THREE.Mesh(tailGeo, bodyMat);
        tail.position.set(0, 0, -0.5 * scale);
        group.add(tail);

        // Главный винт
        const rotorGeo = new THREE.BoxGeometry(1.5 * scale, 0.02 * scale, 0.1 * scale);
        const rotorMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const rotor = new THREE.Mesh(rotorGeo, rotorMat);
        rotor.position.set(0, 0.25 * scale, 0);
        group.add(rotor);
        this.rotor = rotor;

        // Хвостовой винт
        const tailRotorGeo = new THREE.BoxGeometry(0.4 * scale, 0.02 * scale, 0.05 * scale);
        const tailRotor = new THREE.Mesh(tailRotorGeo, rotorMat);
        tailRotor.position.set(0.1 * scale, 0, -0.8 * scale);
        tailRotor.rotation.z = Math.PI / 2;
        group.add(tailRotor);
        this.tailRotor = tailRotor;

        return group;
    }

    /**
     * Обновление анимаций (вызывается в каждом кадре)
     */
    update(deltaTime) {
        // Анимация вращения винтов вертолета
        if (this.rotor) {
            this.rotor.rotation.y += 15 * deltaTime;
        }
        if (this.tailRotor) {
            this.tailRotor.rotation.x += 20 * deltaTime;
        }

        // Плавное покачивание (bobbing) для врагов
        const time = Date.now() * 0.005;
        return Math.sin(time) * 0.1;
    }
}

