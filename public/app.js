(() => {
    'use strict';

    // ── State ──────────────────────────────────────────
    let selectedVoice = 'Wise_Woman';
    let selectedEmotion = 'neutral';
    let audioUrl = null;

    // ── DOM ────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const sections = {
        upload: $('#upload-section'),
        processing: $('#processing-section'),
        text: $('#text-section'),
        generating: $('#generating-section'),
        audio: $('#audio-section'),
        error: $('#error-section'),
    };

    const dropZone = $('#drop-zone');
    const fileInput = $('#file-input');
    const fileNameDisplay = $('#file-name-display');
    const textArea = $('#extracted-text');
    const wordCount = $('#word-count');
    const speedSlider = $('#speed-slider');
    const speedValue = $('#speed-value');
    const generateBtn = $('#generate-btn');
    const audioPlayer = $('#audio-player');
    const playBtn = $('#play-btn');
    const playIcon = $('#play-icon');
    const pauseIcon = $('#pause-icon');
    const progressTrack = $('#progress-track');
    const progressFill = $('#progress-fill');
    const timeLabel = $('#time-label');
    const durationBadge = $('#duration-badge');
    const downloadBtn = $('#download-btn');
    const newBtn = $('#new-btn');
    const retryBtn = $('#retry-btn');

    // ── Section Management ─────────────────────────────
    function showSection(name) {
        Object.values(sections).forEach(s => s.classList.remove('active'));
        sections[name].classList.add('active');
    }

    function showError(title, message) {
        $('#error-title').textContent = title;
        $('#error-message').textContent = message;
        showSection('error');
    }

    // ── File Upload ────────────────────────────────────
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFile(file);
    });

    function handleFile(file) {
        if (file.type !== 'application/pdf') {
            showError('Invalid file', 'Please upload a PDF file.');
            return;
        }

        if (file.size > 20 * 1024 * 1024) {
            showError('File too large', 'Please upload a PDF under 20 MB.');
            return;
        }

        fileNameDisplay.textContent = file.name;
        showSection('processing');
        extractText(file);
    }

    // ── Text Extraction ────────────────────────────────
    async function extractText(file) {
        try {
            const base64 = await fileToBase64(file);

            const res = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdf_base64: base64 }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Extraction failed (${res.status})`);
            }

            const data = await res.json();

            if (!data.text || data.text.trim().length === 0) {
                throw new Error('No text could be extracted from this PDF.');
            }

            textArea.value = data.text;
            updateWordCount();
            showSection('text');
        } catch (err) {
            showError('Extraction failed', err.message);
        }
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    // ── Word Count ─────────────────────────────────────
    textArea.addEventListener('input', updateWordCount);

    function updateWordCount() {
        const text = textArea.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        wordCount.textContent = `${words.toLocaleString()} words`;
    }

    // ── Voice Selection ────────────────────────────────
    document.querySelectorAll('.voice-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.voice-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedVoice = btn.dataset.voice;
        });
    });

    // ── Emotion Selection ──────────────────────────────
    document.querySelectorAll('.emotion-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.emotion-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedEmotion = btn.dataset.emotion;
        });
    });

    // ── Speed Slider ───────────────────────────────────
    speedSlider.addEventListener('input', () => {
        speedValue.textContent = `${parseFloat(speedSlider.value).toFixed(1)}x`;
    });

    // ── Speech Generation ──────────────────────────────
    generateBtn.addEventListener('click', () => {
        const text = textArea.value.trim();
        if (!text) {
            showError('No text', 'Please enter some text to generate speech.');
            return;
        }
        showSection('generating');
        generateSpeech(text);
    });

    async function generateSpeech(text) {
        try {
            const speed = parseFloat(speedSlider.value);

            // Submit to queue
            const res = await fetch('/api/speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    voice_id: selectedVoice,
                    speed,
                    emotion: selectedEmotion,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `Speech submission failed (${res.status})`);
            }

            const data = await res.json();

            if (data.audio) {
                // Synchronous result
                onAudioReady(data.audio.url);
                return;
            }

            if (data.request_id) {
                // Queue-based, poll for result
                await pollForResult(data.request_id);
                return;
            }

            throw new Error('Unexpected response format');
        } catch (err) {
            showError('Generation failed', err.message);
        }
    }

    async function pollForResult(requestId) {
        const maxAttempts = 120;
        for (let i = 0; i < maxAttempts; i++) {
            await sleep(1500);

            try {
                const res = await fetch(`/api/speech-status?id=${requestId}`);
                if (!res.ok) continue;

                const data = await res.json();

                if (data.status === 'COMPLETED' && data.result?.audio?.url) {
                    onAudioReady(data.result.audio.url);
                    return;
                }

                if (data.status === 'FAILED') {
                    throw new Error('Audio generation failed. Please try again.');
                }
            } catch (err) {
                if (err.message.includes('failed')) throw err;
            }
        }

        throw new Error('Audio generation timed out. Please try again.');
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // ── Audio Playback ─────────────────────────────────
    function onAudioReady(url) {
        audioUrl = url;
        audioPlayer.src = url;
        downloadBtn.href = url;
        progressFill.style.width = '0%';
        timeLabel.textContent = '0:00';
        showSection('audio');

        audioPlayer.addEventListener('loadedmetadata', () => {
            durationBadge.textContent = formatTime(audioPlayer.duration);
        }, { once: true });
    }

    playBtn.addEventListener('click', () => {
        if (audioPlayer.paused) {
            audioPlayer.play();
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            audioPlayer.pause();
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
    });

    audioPlayer.addEventListener('timeupdate', () => {
        if (audioPlayer.duration) {
            const pct = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            progressFill.style.width = `${pct}%`;
            timeLabel.textContent = formatTime(audioPlayer.currentTime);
        }
    });

    audioPlayer.addEventListener('ended', () => {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        progressFill.style.width = '100%';
    });

    progressTrack.addEventListener('click', (e) => {
        if (!audioPlayer.duration) return;
        const rect = progressTrack.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        audioPlayer.currentTime = pct * audioPlayer.duration;
    });

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // ── Reset ──────────────────────────────────────────
    newBtn.addEventListener('click', resetApp);
    retryBtn.addEventListener('click', resetApp);

    function resetApp() {
        fileInput.value = '';
        textArea.value = '';
        audioPlayer.src = '';
        audioUrl = null;
        progressFill.style.width = '0%';
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        showSection('upload');
    }
})();
