/**
 * Happy Marian 3.0 - 全域通用音效與配樂引擎 (Global Audio Engine - Web Audio API Edition)
 * 解決 Safari 靜音限制、避免預載亂叫、達成零延遲完美打擊感！
 */

const GlobalAudio = {
    soundUrls: {
        click: './audio/click.mp3',
        popupOpen: './audio/popupOpen.mp3',
        popupClose: './audio/popupClose.mp3',
        countdown: './audio/countdown.mp3',
        fireNormal: './audio/fireNormal.mp3',
        fireUlt: './audio/fireUlt.mp3',
        hit: './audio/hit.mp3',
        cutin: './audio/cutin.mp3',
        victory: './audio/victory.mp3',
        shatter: './audio/shatter.mp3'
    },

    bgm: {
        dashboard: new Audio('./audio/cyberwave-orchestra-puzzle-game-loop-bright-casual-video-game-music-249201_low.mp3'), 
        lobby: new Audio('./audio/決戦へ_low.mp3'),     
        arenaNormal: new Audio('./audio/wind_feelings_low.mp3'), 
        arenaBattle: new Audio('./audio/Devil_Disaster_low.mp3'), 
        gacha: new Audio('./audio/Battle_in_the_Moonlight_low.mp3')        
    },

    audioCtx: null,
    audioBuffers: {}, 
    currentBGM: null,       
    isDucking: false,       

    init: function() {
        for (let key in this.bgm) {
            this.bgm[key].volume = 1; 
            this.bgm[key].loop = true;
        }

        this.bindClickEvents();
        this.observeModals();
        this.bindMicDucking(); 
        this.autoPlayBGM();    
        
        // 🚀 Safari 專用強化喚醒邏輯
        const unlock = () => {
            if (!this.audioCtx) {
                // 1. 建立 Context
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                
                // 2. 🚀 重要：立刻播放一段「靜音」來解鎖硬體
                const buffer = this.audioCtx.createBuffer(1, 1, 22050);
                const source = this.audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(this.audioCtx.destination);
                source.start(0);

                // 3. 開始預載所有音效
                this.preloadAllSounds();
                console.log("🔓 Safari/Chrome Web Audio 啟動完成");
            }
            
            // 每次點擊都嘗試 Resume，確保 Context 沒睡著
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            // 成功解鎖後移除監聽器
            window.removeEventListener('click', unlock);
            window.removeEventListener('touchstart', unlock);
        };

        window.addEventListener('click', unlock);
        window.addEventListener('touchstart', unlock);

        console.log("🎵 Global Audio Engine 3.5 Initialized (Safari Optimized)");
    },

    preloadAllSounds: function() {
        for (let key in this.soundUrls) {
            fetch(this.soundUrls[key])
                .then(response => response.arrayBuffer())
                .then(arrayBuffer => {
                    // 🚀 Safari 的 decodeAudioData 有時不支援 Promise 寫法
                    // 使用回調函數寫法確保最強相容性
                    return new Promise((resolve, reject) => {
                        this.audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
                    });
                })
                .then(audioBuffer => {
                    this.audioBuffers[key] = audioBuffer;
                })
                .catch(e => console.warn(`音效 ${key} 載入失敗:`, e));
        }
    },

    play: function(soundName) {
        // 🚀 關鍵修復：在播放前強迫再 Check 一次 Context 狀態
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        if (!this.audioCtx || !this.audioBuffers[soundName]) return; 
        
        const source = this.audioCtx.createBufferSource();
        source.buffer = this.audioBuffers[soundName];
        const gainNode = this.audioCtx.createGain();
        
        let vol = 1.0; 
        switch (soundName) {
            case 'click': vol = 0.4; break;
            case 'popupOpen': vol = 2.2; break;
            case 'popupClose': vol = 2; break;
            case 'fireNormal': vol = 0.7; break;
            case 'fireUlt': vol = 0.7; break;
            case 'hit': vol = 0.8; break;
            case 'countdown': vol = 1.6; break;
            case 'cutin': vol = 2; break;
        }
        
        gainNode.gain.setValueAtTime(vol, this.audioCtx.currentTime);
        source.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        source.start(0);
    },


    // --- 以下為原本的 BGM 切換與監聽邏輯，完全沒變 ---

    playGachaBGM: function() {
        if (this.currentBGM) {
            this.currentBGM.pause();
        }
        this.bgm.gacha.currentTime = 0;
        this.bgm.gacha.play().catch(e => {});
        document.body.dataset.gachaBgmPlaying = "true";
    },

    resumeNormalBGM: function() {
        if (document.body.dataset.gachaBgmPlaying) {
            this.bgm.gacha.pause();
            if (this.currentBGM) {
                this.currentBGM.play().catch(e => {});
            }
            delete document.body.dataset.gachaBgmPlaying;
        }
    },

    autoPlayBGM: function() {
        const currentPath = window.location.pathname.toLowerCase();
        const urlParams = new URLSearchParams(window.location.search);
        let targetBGM = null;

        if (currentPath.includes('dashboard')) {
            targetBGM = this.bgm.dashboard;
        } else if (currentPath.includes('arena')) {
            if (urlParams.get('mode') === 'battle' || urlParams.get('roomId')) {
                targetBGM = this.bgm.arenaBattle;
            } else {
                targetBGM = this.bgm.arenaNormal;
            }
        } else if (currentPath.includes('lobby')) {
            targetBGM = this.bgm.lobby; 
        }

        if (targetBGM) {
            this.currentBGM = targetBGM;
            const startBgmInteraction = () => {
                this.currentBGM.play().catch(e => {});
                document.removeEventListener('pointerdown', startBgmInteraction);
            };
            document.addEventListener('pointerdown', startBgmInteraction);
        }
    },

    bindMicDucking: function() {
        document.addEventListener('pointerdown', (e) => {
            if (e.target.closest('#record-btn') || e.target.closest('#battle-record-btn')) {
                if (this.currentBGM && !this.currentBGM.paused) {
                    this.currentBGM.pause(); 
                    this.isDucking = true;
                }
            }
        });

        const resumeAudio = (e) => {
            if (this.isDucking && (e.target.closest('#record-btn') || e.target.closest('#battle-record-btn'))) {
                setTimeout(() => {
                    if (this.currentBGM) this.currentBGM.play().catch(e=>{});
                    this.isDucking = false;
                }, 500); 
            }
        };

        document.addEventListener('pointerup', resumeAudio);
        document.addEventListener('pointercancel', resumeAudio);
        document.addEventListener('pointerout', resumeAudio);
    },

    bindClickEvents: function() {
        document.addEventListener('pointerdown', (e) => {
            const target = e.target.closest('button, a, .btn, .btn-dock, .btn-play-pill, .ws-letter, .btn-image-choice');
            
            // 🚀 黑名單：這些按鈕按下去會觸發 Popup，所以它們不應該發出 Click 聲音，交給 Popup 負責就好
            const noClickClasses = ['history-btn', 'btn-close-modal', 'btn-glory']; 
            // 如果你的網頁裡還有其他按鈕是用來開彈窗的，也可以把它們的 class 加到上面這個陣列裡

            if (target && !target.disabled && !target.classList.contains('disabled') && target.id !== 'record-btn' && target.id !== 'battle-record-btn') {
                
                // 檢查這個按鈕是否帶有黑名單的 class
                const isNoClickClass = noClickClasses.some(cls => target.classList.contains(cls));
                
                if (target.hasAttribute('data-no-click-sound') || isNoClickClass) {
                    return; // 乖乖閉嘴
                }
                
                this.play('click');
            }
        });
    },

    observeModals: function() {
        const displayModals = ['#summary', '#impact-overlay', '#phonic-helper-overlay', '#logModal'];
        const classModals = [{ selector: '#lb-panel', activeClass: 'open' }];

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                const target = mutation.target;

                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const isDisplayModal = displayModals.some(selector => target.matches(selector));
                    if (isDisplayModal) {
                        const displayStyle = window.getComputedStyle(target).display;
                        const opacityStyle = window.getComputedStyle(target).opacity;
                        if (displayStyle !== 'none' && opacityStyle !== '0' && !target.dataset.audioStateOpen) {
                            this.play('popupOpen');
                            target.dataset.audioStateOpen = "true";
                        } else if (displayStyle === 'none' && target.dataset.audioStateOpen) {
                            this.play('popupClose');
                            delete target.dataset.audioStateOpen;
                        }
                    }
                }

                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    classModals.forEach(config => {
                        if (target.matches(config.selector)) {
                            const isOpen = target.classList.contains(config.activeClass);
                            if (isOpen && !target.dataset.audioStateOpen) {
                                this.play('popupOpen');
                                target.dataset.audioStateOpen = "true";
                            } else if (!isOpen && target.dataset.audioStateOpen) {
                                this.play('popupClose');
                                delete target.dataset.audioStateOpen;
                            }
                        }
                    });
                }
            });
        });

        observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
    }
};

window.GlobalAudio = GlobalAudio;

document.addEventListener('DOMContentLoaded', () => {
    GlobalAudio.init();
});
