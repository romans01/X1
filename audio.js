/**
 * Класс управления звуковыми эффектами
 * Мотив: Обеспечение аудио-обратной связи для игровых событий (захват, смерть, победа)
 * с использованием синтеза звука (Web Audio API), чтобы не зависеть от внешних файлов.
 */
class AudioController {
    constructor() {
        this.context = null;
        this.enabled = false;
        this.engineOsc = null;
        this.engineGain = null;
        this.noiseNode = null;
        this.lfo = null;
    }

    /**
     * Инициализация аудио-контекста
     */
    init() {
        if (this.context) return;
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.enabled = true;
        this.startEngine();
    }

    /**
     * Создание генератора шума для звука ветра/воздуха
     */
    createNoiseNode() {
        const bufferSize = 2 * this.context.sampleRate;
        const noiseBuffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        const whiteNoise = this.context.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;
        return whiteNoise;
    }

    /**
     * Запуск реалистичного двигателя
     */
    startEngine() {
        if (!this.enabled || this.engineOsc) return;

        const now = this.context.currentTime;

        // Основной узел усиления
        this.engineGain = this.context.createGain();
        this.engineGain.gain.setValueAtTime(0, now);
        this.engineGain.connect(this.context.destination);

        // 1. Низкочастотный гул (основа) - мягкий треугольник
        this.engineOsc = this.context.createOscillator();
        this.engineOsc.type = 'triangle';
        this.engineOsc.frequency.setValueAtTime(45, now);

        // 2. Рокот лопастей - квадратная волна с сильным фильтром
        this.subOsc = this.context.createOscillator();
        this.subOsc.type = 'square';
        this.subOsc.frequency.setValueAtTime(45, now);
        
        const subFilter = this.context.createBiquadFilter();
        subFilter.type = 'lowpass';
        subFilter.frequency.setValueAtTime(150, now);
        subFilter.Q.setValueAtTime(10, now);

        const subGain = this.context.createGain();
        subGain.gain.setValueAtTime(0.4, now);

        this.subOsc.connect(subFilter);
        subFilter.connect(subGain);
        subGain.connect(this.engineGain);

        // 3. Шум (поток воздуха)
        const noise = this.createNoiseNode();
        this.noiseFilter = this.context.createBiquadFilter();
        this.noiseFilter.type = 'bandpass';
        this.noiseFilter.frequency.setValueAtTime(300, now);
        this.noiseFilter.Q.setValueAtTime(1, now);
        
        const noiseGain = this.context.createGain();
        noiseGain.gain.setValueAtTime(0.02, now);

        noise.connect(this.noiseFilter);
        this.noiseFilter.connect(noiseGain);
        noiseGain.connect(this.engineGain);

        // 4. LFO для эффекта лопастей (модуляция всего)
        this.lfo = this.context.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.setValueAtTime(10, now); 
        
        const lfoGain = this.context.createGain();
        lfoGain.gain.setValueAtTime(5, now); // Модуляция частоты
        
        const lfoAmp = this.context.createGain();
        lfoAmp.gain.setValueAtTime(0.4, now); // Модуляция громкости

        const lfoFilter = this.context.createGain();
        lfoFilter.gain.setValueAtTime(100, now); // Модуляция фильтра шума

        this.lfo.connect(lfoGain);
        lfoGain.connect(this.engineOsc.frequency);
        lfoGain.connect(this.subOsc.frequency);
        
        this.lfo.connect(lfoAmp);
        lfoAmp.connect(this.engineGain.gain);

        this.lfo.connect(lfoFilter);
        lfoFilter.connect(this.noiseFilter.frequency);

        this.engineOsc.connect(this.engineGain);
        
        noise.start();
        this.lfo.start();
        this.engineOsc.start();
        this.subOsc.start();
    }

    /**
     * Обновление звука с эффектом Доплера
     */
    updateEngine(pos, vel, camPos) {
        if (!this.enabled || !this.engineOsc) return;

        const now = this.context.currentTime;

        const dx = camPos.x - pos.x;
        const dy = camPos.y - pos.y;
        const dz = camPos.z - pos.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

        const nx = dx / dist;
        const nz = dz / dist;
        const dot = (vel.vx * nx + vel.vz * nz);
        
        const dopplerShift = dot * 40; 
        const isMoving = Math.abs(vel.vx) > 0 || Math.abs(vel.vz) > 0;
        
        const baseFreq = isMoving ? 55 : 40;
        const targetFreq = baseFreq + dopplerShift;

        const distFactor = Math.max(0.1, 1 - (dist / 120));
        const targetGain = (isMoving ? 0.08 : 0.04) * distFactor;

        this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.1);
        this.subOsc.frequency.setTargetAtTime(targetFreq, now, 0.1);
        this.engineGain.gain.setTargetAtTime(targetGain, now, 0.1);
        
        // Управляем "резкостью" звука через фильтр
        this.noiseFilter.frequency.setTargetAtTime(isMoving ? 600 : 300, now, 0.2);
        this.lfo.frequency.setTargetAtTime(isMoving ? 14 : 10, now, 0.3);
    }

    /**
     * Остановить звук двигателя
     */
    stopEngine() {
        if (this.engineOsc) {
            this.engineOsc.stop();
            this.subOsc.stop();
            this.lfo.stop();
            this.engineOsc.disconnect();
            this.subOsc.disconnect();
            this.engineGain.disconnect();
            this.engineOsc = null;
        }
    }

    /**
     * Звук захвата территории
     */
    playCapture() {
        if (!this.enabled) return;
        this.playSound(440, 880, 0.2, 'triangle');
    }

    /**
     * Звук столкновения/смерти
     */
    playDeath() {
        if (!this.enabled) return;
        this.playSound(300, 50, 0.5, 'sawtooth');
    }

    /**
     * Звук начала уровня
     */
    playStart() {
        if (!this.enabled) return;
        this.playSound(523.25, 1046.5, 0.1, 'sine');
    }

    /**
     * Звук победы
     */
    playWin() {
        if (!this.enabled) return;
        const now = this.context.currentTime;
        this.playSound(523.25, 523.25, 0.1, 'square', now);
        this.playSound(659.25, 659.25, 0.1, 'square', now + 0.15);
        this.playSound(783.99, 783.99, 0.3, 'square', now + 0.3);
    }

    /**
     * Звук шага при рисовании следа
     */
    playTrailStep() {
        if (!this.enabled) return;
        this.playSound(880, 1200, 0.05, 'sine', null, 0.02);
    }

    /**
     * Универсальный метод генерации звука
     */
    playSound(startFreq, endFreq, duration, type, startTime = null, volume = 0.1) {
        if (!this.enabled) return;
        
        const osc = this.context.createOscillator();
        const gain = this.context.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, startTime || this.context.currentTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, (startTime || this.context.currentTime) + duration);

        gain.gain.setValueAtTime(volume, startTime || this.context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, (startTime || this.context.currentTime) + duration);

        osc.connect(gain);
        gain.connect(this.context.destination);

        osc.start(startTime || this.context.currentTime);
        osc.stop((startTime || this.context.currentTime) + duration);
    }
}

// Экспортируем экземпляр
export const audio = new AudioController();

