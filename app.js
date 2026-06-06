document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const recordBtn = document.getElementById('recordBtn');
    const sendBtn = document.getElementById('sendBtn');
    const questionInput = document.getElementById('questionInput');
    const statusText = document.getElementById('statusText');
    const chatArea = document.getElementById('chatArea');
    const messagesContainer = document.getElementById('messagesContainer');
    const emptyState = document.getElementById('emptyState');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    // Settings Modals
    const settingsBtn = document.getElementById('settingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const apiKeyInput = document.getElementById('apiKey');
    const systemPromptInput = document.getElementById('systemPrompt');

    // Admin Dashboard
    const adminLoginModal = document.getElementById('adminLoginModal');
    const adminDashboardModal = document.getElementById('adminDashboardModal');
    const closeAdminLoginBtn = document.getElementById('closeAdminLoginBtn');
    const closeAdminDashboardBtn = document.getElementById('closeAdminDashboardBtn');
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    const adminPasswordInput = document.getElementById('adminPassword');
    const totalTokensStat = document.getElementById('totalTokensStat');
    const audioRequestsStat = document.getElementById('audioRequestsStat');
    const resetStatsBtn = document.getElementById('resetStatsBtn');
    const logoIcon = document.querySelector('.logo-icon');

    // --- State ---
    let isListening = false;
    let isRecordingLoop = false;
    let silenceTimer = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let audioContext = null;
    let analyser = null;
    let microphoneStream = null;

    let geminiApiKey = localStorage.getItem('geminiApiKey') || '';
    
    const DEFAULT_SYSTEM_PROMPT = `You are a real-time PM Interview Copilot. Provide a highly structured cheat sheet for the given question.

CRITICAL FORMATTING RULES FOR PRODUCT/STRATEGY QUESTIONS:
1. First, output a Heading (H3) titled "### Refined Question" and provide a clear, grammatically corrected, and formal version of what the user is asking (since speech-to-text can be messy).
2. Auto-detect the question type (e.g., Design, Root Cause Analysis, Product Improvement, Metrics, Strategy).
3. Select and identify the most appropriate framework at the top (e.g., CIRCLES for Design, 5 Whys/Fishbone for RCA, HEART for Metrics, RICE for Prioritization, etc.). Do NOT force CIRCLES if another framework fits better.
4. You MUST include a Heading (H3) for EVERY SINGLE STEP of your chosen framework to ensure a complete answer.
5. UNDER EACH HEADING, USE EXACTLY 3-5 BULLET POINTS.
6. EACH BULLET POINT MUST BE MAXIMUM 15-20 WORDS.
7. Be direct and concise. NO fluff, NO introductory or concluding paragraphs.

EXCEPTION FOR SQL QUESTIONS:
If the user asks an SQL query question, completely ignore the rules above. Instead, provide ONLY the direct SQL query formatted in a markdown code block (\`\`\`sql ... \`\`\`), with absolutely no explanation or framework.`;

    let customSystemPrompt = localStorage.getItem('systemPrompt') || DEFAULT_SYSTEM_PROMPT;
    let conversationHistory = [];
    let totalTokens = parseInt(localStorage.getItem('totalTokens') || '0', 10);
    let audioRequests = parseInt(localStorage.getItem('audioRequests') || '0', 10);

    // Initialize API Key & Prompt if present
    if (geminiApiKey) {
        apiKeyInput.value = geminiApiKey;
    } else {
        // Show settings automatically if no API key
        setTimeout(() => settingsModal.classList.add('active'), 1000);
    }
    systemPromptInput.value = customSystemPrompt;

    function updateAdminStats() {
        totalTokensStat.textContent = totalTokens.toLocaleString();
        audioRequestsStat.textContent = audioRequests.toLocaleString();
    }
    updateAdminStats();

    // --- Admin Dashboard Logic ---
    let logoClicks = 0;
    let logoClickTimer;
    logoIcon.addEventListener('click', () => {
        logoClicks++;
        clearTimeout(logoClickTimer);
        if (logoClicks >= 5) {
            logoClicks = 0;
            adminLoginModal.classList.add('active');
        } else {
            logoClickTimer = setTimeout(() => { logoClicks = 0; }, 1000);
        }
    });

    closeAdminLoginBtn.addEventListener('click', () => adminLoginModal.classList.remove('active'));
    closeAdminDashboardBtn.addEventListener('click', () => adminDashboardModal.classList.remove('active'));

    adminLoginBtn.addEventListener('click', () => {
        if (adminPasswordInput.value === 'admin') {
            adminLoginModal.classList.remove('active');
            adminPasswordInput.value = '';
            adminDashboardModal.classList.add('active');
        } else {
            alert('Incorrect password');
        }
    });

    resetStatsBtn.addEventListener('click', () => {
        totalTokens = 0;
        audioRequests = 0;
        localStorage.setItem('totalTokens', 0);
        localStorage.setItem('audioRequests', 0);
        updateAdminStats();
    });

    // --- Audio & Whisper Logic ---
    async function startListening(isAutoRestart = false) {
        if (isListening && !isAutoRestart) return;
        isListening = true;
        isRecordingLoop = true;

        try {
            if (!microphoneStream) {
                // Request high-quality, raw audio by disabling browser processing 
                // which often distorts voice for AI models
                microphoneStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: false,
                        noiseSuppression: false,
                        autoGainControl: false,
                        channelCount: 1,
                        sampleRate: 44100
                    } 
                });
            }
            
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const source = audioContext.createMediaStreamSource(microphoneStream);
                analyser = audioContext.createAnalyser();
                analyser.fftSize = 512;
                source.connect(analyser);
            }

            // Request a higher bitrate for better audio fidelity
            mediaRecorder = new MediaRecorder(microphoneStream, {
                audioBitsPerSecond: 128000
            });
            audioChunks = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                if (audioChunks.length === 0) return;
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                
                // Send to Whisper
                if (geminiApiKey && geminiApiKey.toLowerCase() !== 'demo') {
                    statusText.textContent = "Processing audio with Whisper...";
                    try {
                        const text = await fetchWhisperTranscription(audioBlob);
                        if (text && text.trim()) {
                            questionInput.value += (questionInput.value ? ' ' : '') + text.trim();
                            questionInput.style.height = 'auto';
                            questionInput.style.height = (questionInput.scrollHeight) + 'px';
                            checkInputState();
                        }
                    } catch(e) {
                        console.error("Whisper error:", e);
                    }
                }
                
                if (isListening && isRecordingLoop) {
                    startListening(true);
                }
            };

            mediaRecorder.start();
            recordBtn.classList.add('recording');
            recordBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
            statusText.textContent = "Listening... (auto-transcribes on pause)";
            statusText.classList.add('recording');
            questionInput.placeholder = "Listening for audio...";

            detectSilence();
        } catch(e) {
            console.error("Microphone access denied:", e);
            statusText.textContent = "Microphone access denied.";
            isListening = false;
            isRecordingLoop = false;
        }
    }

    function detectSilence() {
        if (!isListening || !analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const checkVolume = () => {
            if (!isListening) return;
            
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            let average = sum / bufferLength;

            if (average < 15) { // Silence threshold
                if (!silenceTimer) {
                    silenceTimer = setTimeout(() => {
                        if (mediaRecorder && mediaRecorder.state === 'recording') {
                            mediaRecorder.stop();
                        }
                    }, 4000); // 4 seconds of silence triggers pause
                }
            } else {
                if (silenceTimer) {
                    clearTimeout(silenceTimer);
                    silenceTimer = null;
                }
            }
            
            requestAnimationFrame(checkVolume);
        };
        
        checkVolume();
    }

    function stopListening() {
        isListening = false;
        isRecordingLoop = false;
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
        
        recordBtn.classList.remove('recording');
        recordBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>`;
        statusText.textContent = "Microphone ready";
        statusText.classList.remove('recording');
        questionInput.placeholder = "Speak or type your PM question...";
        checkInputState();
    }

    async function fetchWhisperTranscription(audioBlob) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', 'whisper-large-v3'); // Use the full model for max accuracy
        formData.append('language', 'en'); // Force English transcription to stop foreign hallucinations

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${geminiApiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error('Whisper API failed');
        }

        audioRequests++;
        localStorage.setItem('audioRequests', audioRequests);
        updateAdminStats();

        const data = await response.json();
        let text = data.text.trim();
        
        // Filter out common Whisper silence hallucinations
        const lowerText = text.toLowerCase();
        
        const containsHallucinationWord = 
            lowerText.includes("undertextning.nu") ||
            lowerText.includes("amara.org") ||
            lowerText.includes("medietekst") ||
            lowerText.includes("takk for") ||
            lowerText.includes("thanks for watching") ||
            lowerText.includes("hush! thank you") ||
            lowerText.includes("bukübekski") ||
            lowerText.includes("soin");

        // Catch severe repetitions, e.g., "I'm going to take a picture of the" repeating 3+ times
        const hasExtremeRepetition = /(.{12,})\1{2,}/i.test(lowerText);

        // Catch pure "thank you" repetitions
        const isOnlyThankYou = /^(?:\s*thank you\.?\s*)+$/.test(lowerText);

        // Catch non-English scripts (Korean Hangul, Cyrillic, etc.) that sometimes leak through
        const containsForeignScript = /[\u3131-\uD79D\u0400-\u04FF\uAC00-\uD7A3]/.test(text); 

        // Short string "thank you" or "bye"
        const isShortThankYou = lowerText.length < 50 && lowerText.includes("thank you");
        const isShortBye = lowerText.length < 20 && (lowerText.includes("you") || lowerText.includes("bye"));

        if (containsHallucinationWord || hasExtremeRepetition || isOnlyThankYou || isShortThankYou || isShortBye || containsForeignScript) {
            return "";
        }

        return text;
    }

    recordBtn.addEventListener('click', () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    });

    // --- Input Handling ---
    questionInput.addEventListener('input', () => {
        questionInput.style.height = 'auto';
        questionInput.style.height = (questionInput.scrollHeight) + 'px';
        checkInputState();
    });

    function checkInputState() {
        if (questionInput.value.trim().length > 0) {
            sendBtn.removeAttribute('disabled');
        } else {
            sendBtn.setAttribute('disabled', 'true');
        }
    }

    // --- Settings Modal ---
    settingsBtn.addEventListener('click', () => settingsModal.classList.add('active'));
    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
    
    saveSettingsBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        const prompt = systemPromptInput.value.trim();
        if (key) {
            localStorage.setItem('geminiApiKey', key);
            geminiApiKey = key;
            
            if (prompt) {
                localStorage.setItem('systemPrompt', prompt);
                customSystemPrompt = prompt;
            }
            
            settingsModal.classList.remove('active');
            
            // Show a brief success message
            const origText = statusText.textContent;
            statusText.textContent = "Settings saved successfully";
            setTimeout(() => { statusText.textContent = origText; }, 3000);
        } else {
            alert('Please enter a valid API key.');
        }
    });

    // --- Chat Logic ---
    function addMessage(text, sender) {
        emptyState.style.display = 'none';
        messagesContainer.style.display = 'flex';

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${sender}`;
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'message-label';
        labelDiv.textContent = sender === 'user' ? 'You' : 'PM AI Assistant';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        if (sender === 'ai') {
            // Parse Markdown
            contentDiv.innerHTML = marked.parse(text);
        } else {
            contentDiv.textContent = text;
        }

        msgDiv.appendChild(labelDiv);
        msgDiv.appendChild(contentDiv);
        messagesContainer.appendChild(msgDiv);
        
        scrollToBottom();
    }

    function scrollToBottom() {
        chatArea.scrollTo({
            top: chatArea.scrollHeight,
            behavior: 'smooth'
        });
    }

    async function handleSend() {
        const question = questionInput.value.trim();
        if (!question) return;

        clearTimeout(silenceTimer);

        // Add user message
        addMessage(question, 'user');
        
        // Reset input to immediately catch new speech without stopping mic
        questionInput.value = '';
        questionInput.style.height = 'auto';
        sendBtn.setAttribute('disabled', 'true');

        // Show loading
        loadingIndicator.style.display = 'flex';
        scrollToBottom();

        // Call Groq API
        try {
            const response = await fetchGroqResponse(question);
            loadingIndicator.style.display = 'none';
            addMessage(response, 'ai');
        } catch (error) {
            console.error(error);
            loadingIndicator.style.display = 'none';
            addMessage("Sorry, I encountered an error. Please check your API key and try again.\n\nError details: " + error.message, 'ai');
        }
    }

    sendBtn.addEventListener('click', () => {
        if (!isListening) startListening();
        handleSend();
    });

    // Enable Enter to send (shift+enter for new line)
    questionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) {
                if (!isListening) startListening();
                handleSend();
            }
        }
    });

    // --- Groq API Integration ---
    async function fetchGroqResponse(question) {
        // DEMO MODE fallback
        if (!geminiApiKey || geminiApiKey.toLowerCase() === 'demo') {
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(`## CIRCLES Framework Analysis (DEMO MODE)

### Comprehend the Situation
* **Goal**: Validate the application flow with a demo response.
* **Context**: You asked: "${question}"
* **Constraint**: This is a mock response because no API key was provided.

### Identify the Customer
* Product Managers preparing for interviews.
* Interview Candidates practicing cases.

### Report Customer Needs
* Needs to see the progress bar working seamlessly.
* Needs to validate the UI flow, markdown parsing, and layout without needing an API key initially.

### Cut Through Prioritization
* Prioritize showing a beautiful, structured markdown response over an actual AI generation for this demo.

### List Solutions
* **Solution 1**: Implement a "Demo Mode" fallback directly into the application. (Recommended)

### Evaluate Trade-offs
* **Pros**: Extremely fast, securely validates the markdown parser and UI responsiveness.
* **Cons**: Not a real AI response.

### Summarize Recommendation
This demo validates that your application flow is working perfectly! The progress bar works, the markdown parses correctly, and scrolling works. You can now enter a real Groq API key in the configuration settings to get actual AI responses!`);
                }, 2500); // 2.5 second delay to show off the loading progress bar
            });
        }

        const url = `https://api.groq.com/openai/v1/chat/completions`;
        const systemInstruction = customSystemPrompt;

        // Add user question to history (OpenAI/Groq format)
        conversationHistory.push({
            role: "user",
            content: question
        });

        // Prepend system message for Groq
        const messages = [
            { role: "system", content: systemInstruction },
            ...conversationHistory
        ];

        const payload = {
            model: "llama-3.3-70b-versatile", // Upgraded to Llama 3.3 70B for much higher intelligence
            messages: messages,
            temperature: 0.7,
            max_tokens: 2048,
            top_p: 0.95
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${geminiApiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            // Revert history on error
            conversationHistory.pop();
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'API request failed');
        }

        const data = await response.json();
        
        if (data.usage) {
            totalTokens += data.usage.total_tokens;
            localStorage.setItem('totalTokens', totalTokens);
            updateAdminStats();
        }
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const aiText = data.choices[0].message.content;
            
            // Add AI response to history
            conversationHistory.push({
                role: "assistant", // Groq uses 'assistant', not 'model'
                content: aiText
            });

            return aiText;
        } else {
            conversationHistory.pop(); // revert user msg
            throw new Error('Unexpected response format from Groq API');
        }
    }
});
