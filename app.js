/**
 * MindfulChat - Mental Health Chatbot
 * A supportive AI companion with memory and crisis detection
 */

// ==========================================
// Configuration
// ==========================================

const CONFIG = {
    GROQ_API_KEY: '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',
    GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
    MODEL: 'llama-3.3-70b-versatile',
    MAX_TOKENS: 500,
    STORAGE_KEY: 'mindfulchat_data'
};

// Crisis detection keywords (comprehensive list)
const CRISIS_KEYWORDS = [
    'kill myself', 'suicide', 'suicidal', 'end my life', 'want to die',
    'don\'t want to live', 'end it all', 'self harm', 'self-harm', 'cutting myself',
    'hurt myself', 'harm myself', 'no reason to live', 'better off dead',
    'can\'t go on', 'take my own life', 'overdose', 'jump off', 'hang myself',
    'slit my wrists', 'not worth living', 'world without me', 'give up on life'
];

// System prompt for therapist-like responses
const SYSTEM_PROMPT = `You are a compassionate, professional mental health support companion named MindfulChat. Your role is to provide emotional support like a caring therapist would.

IMPORTANT GUIDELINES:
1. RESPONSE STYLE:
   - Keep responses brief and conversational (2-4 sentences usually)
   - Sound like a warm, understanding human - not robotic
   - Use natural language like "I hear you", "That sounds really tough", "It makes sense that you'd feel that way"
   - Ask gentle, open-ended questions to understand better
   - Validate feelings without judgment

2. THERAPEUTIC APPROACH:
   - Practice active listening - reflect back what they share
   - Show genuine empathy and understanding
   - Never minimize their feelings or rush to solutions
   - Gently encourage self-reflection
   - Celebrate small wins and progress

3. MEMORY & CONTINUITY:
   - Remember details they've shared before
   - Reference past conversations naturally ("You mentioned before...")
   - Build on ongoing themes in their life
   - Notice patterns and growth

4. BOUNDARIES:
   - You're a supportive companion, not a replacement for professional therapy
   - For serious mental health concerns, gently encourage professional help
   - Never diagnose conditions or prescribe treatments
   - Focus on listening and emotional support

5. CRISIS RESPONSE:
   - If someone expresses thoughts of self-harm, respond with immediate warmth and care
   - Acknowledge their pain without panic
   - Let them know they're not alone
   - The app will show emergency resources automatically

Remember: You're having a real conversation with someone who needs to feel heard. Be present, be warm, be human.`;

// ==========================================
// State Management
// ==========================================

let state = {
    userId: null,
    currentChatId: null,
    chats: {},
    userContext: {
        name: null,
        mood_patterns: [],
        mentioned_topics: [],
        sessions_count: 0
    },
    isTyping: false
};

// ==========================================
// DOM Elements
// ==========================================

const elements = {
    sidebar: document.getElementById('sidebar'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    newChatBtn: document.getElementById('newChatBtn'),
    chatHistory: document.getElementById('chatHistory'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    chatContainer: document.getElementById('chatContainer'),
    messages: document.getElementById('messages'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    emergencyModal: document.getElementById('emergencyModal'),
    closeEmergencyModal: document.getElementById('closeEmergencyModal'),
    typingTemplate: document.getElementById('typingIndicatorTemplate'),
    suggestionChips: document.querySelectorAll('.suggestion-chip')
};

// ==========================================
// Utility Functions
// ==========================================

/**
 * Generate a unique user ID using browser fingerprinting
 */
function generateUserId() {
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        new Date().getTimezoneOffset(),
        navigator.platform
    ];
    
    let hash = 0;
    const str = components.join('|');
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    
    return 'user_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36);
}

/**
 * Generate a unique chat ID
 */
function generateChatId() {
    return 'chat_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return date.toLocaleDateString([], { weekday: 'long' });
    } else {
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Check for crisis keywords in message
 */
function detectCrisis(message) {
    const lowerMessage = message.toLowerCase();
    return CRISIS_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Extract chat title from first message
 */
function getChatTitle(messages) {
    if (messages.length === 0) return 'New conversation';
    
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage) return 'New conversation';
    
    const content = firstUserMessage.content;
    if (content.length <= 30) return content;
    return content.substring(0, 30) + '...';
}

// ==========================================
// Storage Functions
// ==========================================

/**
 * Load user data from localStorage
 */
function loadUserData() {
    try {
        const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            state = { ...state, ...data };
            return true;
        }
    } catch (e) {
        console.error('Error loading data:', e);
    }
    return false;
}

/**
 * Save user data to localStorage
 */
function saveUserData() {
    try {
        const dataToSave = {
            userId: state.userId,
            currentChatId: state.currentChatId,
            chats: state.chats,
            userContext: state.userContext
        };
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (e) {
        console.error('Error saving data:', e);
    }
}

/**
 * Update user context based on conversation
 */
function updateUserContext(message) {
    // Track session count
    if (!state.userContext.sessions_count) {
        state.userContext.sessions_count = 0;
    }
    
    // Extract potential name mentions
    const nameMatch = message.match(/(?:my name is|i'm called|call me|i am)\s+(\w+)/i);
    if (nameMatch) {
        state.userContext.name = nameMatch[1];
    }
    
    // Track mentioned topics (simple keyword extraction)
    const topics = ['work', 'family', 'relationship', 'anxiety', 'depression', 'sleep', 
                    'stress', 'school', 'friends', 'health', 'money', 'loneliness'];
    topics.forEach(topic => {
        if (message.toLowerCase().includes(topic)) {
            if (!state.userContext.mentioned_topics.includes(topic)) {
                state.userContext.mentioned_topics.push(topic);
            }
        }
    });
    
    saveUserData();
}

// ==========================================
// UI Functions
// ==========================================

/**
 * Create a message element
 */
function createMessageElement(role, content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'user' ? 'user-message' : 'ai-message'}`;
    
    const avatarIcon = role === 'user' 
        ? '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>'
        : '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>';
    
    messageDiv.innerHTML = `
        <div class="message-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${avatarIcon}
            </svg>
        </div>
        <div class="message-content">${escapeHtml(content)}</div>
    `;
    
    return messageDiv;
}

/**
 * Add typing indicator
 */
function showTypingIndicator() {
    const template = elements.typingTemplate.content.cloneNode(true);
    const indicator = template.querySelector('.message');
    indicator.id = 'typingIndicator';
    elements.messages.appendChild(indicator);
    scrollToBottom();
}

/**
 * Remove typing indicator
 */
function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

/**
 * Scroll messages to bottom
 */
function scrollToBottom() {
    elements.messages.scrollTop = elements.messages.scrollHeight;
}

/**
 * Render chat history sidebar
 */
function renderChatHistory() {
    const historySection = elements.chatHistory.querySelector('.history-section');
    
    // Clear existing items except label
    const existingItems = historySection.querySelectorAll('.history-item');
    existingItems.forEach(item => item.remove());
    
    // Sort chats by last updated
    const sortedChats = Object.entries(state.chats)
        .sort(([, a], [, b]) => b.updatedAt - a.updatedAt);
    
    if (sortedChats.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'history-item';
        emptyState.textContent = 'No conversations yet';
        emptyState.style.opacity = '0.5';
        emptyState.style.cursor = 'default';
        historySection.appendChild(emptyState);
        return;
    }
    
    sortedChats.forEach(([chatId, chat]) => {
        const item = document.createElement('div');
        item.className = `history-item ${chatId === state.currentChatId ? 'active' : ''}`;
        item.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>${escapeHtml(getChatTitle(chat.messages))}</span>
        `;
        item.addEventListener('click', () => loadChat(chatId));
        historySection.appendChild(item);
    });
}

/**
 * Render messages for current chat
 */
function renderMessages() {
    elements.messages.innerHTML = '';
    
    if (!state.currentChatId || !state.chats[state.currentChatId]) return;
    
    const chat = state.chats[state.currentChatId];
    chat.messages.forEach(msg => {
        if (msg.role !== 'system') {
            const messageEl = createMessageElement(msg.role, msg.content);
            elements.messages.appendChild(messageEl);
        }
    });
    
    scrollToBottom();
}

/**
 * Show/hide welcome screen
 */
function toggleWelcomeScreen(show) {
    if (show) {
        elements.welcomeScreen.classList.remove('hidden');
        elements.chatContainer.classList.remove('active');
    } else {
        elements.welcomeScreen.classList.add('hidden');
        elements.chatContainer.classList.add('active');
    }
}

/**
 * Show emergency modal
 */
function showEmergencyModal() {
    elements.emergencyModal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

/**
 * Hide emergency modal
 */
function hideEmergencyModal() {
    elements.emergencyModal.classList.remove('active');
    document.body.style.overflow = '';
}

/**
 * Toggle mobile sidebar
 */
function toggleSidebar() {
    elements.sidebar.classList.toggle('open');
    
    // Create/toggle overlay
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', toggleSidebar);
        document.body.appendChild(overlay);
    }
    overlay.classList.toggle('active');
}

// ==========================================
// Chat Functions
// ==========================================

/**
 * Create a new chat
 */
function createNewChat() {
    const chatId = generateChatId();
    
    state.chats[chatId] = {
        id: chatId,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    
    state.currentChatId = chatId;
    state.userContext.sessions_count++;
    
    saveUserData();
    renderChatHistory();
    renderMessages();
    toggleWelcomeScreen(true);
    
    // Close mobile sidebar
    if (elements.sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

/**
 * Load an existing chat
 */
function loadChat(chatId) {
    if (!state.chats[chatId]) return;
    
    state.currentChatId = chatId;
    saveUserData();
    
    renderChatHistory();
    renderMessages();
    toggleWelcomeScreen(state.chats[chatId].messages.length === 0);
    
    // Close mobile sidebar
    if (elements.sidebar.classList.contains('open')) {
        toggleSidebar();
    }
}

/**
 * Build conversation context for API
 */
function buildConversationContext() {
    const messages = [];
    
    // Build enhanced system prompt with user context
    let enhancedPrompt = SYSTEM_PROMPT;
    
    if (state.userContext.name) {
        enhancedPrompt += `\n\nThe user's name is ${state.userContext.name}. Use their name occasionally to be personal.`;
    }
    
    if (state.userContext.mentioned_topics.length > 0) {
        enhancedPrompt += `\n\nTopics the user has mentioned before: ${state.userContext.mentioned_topics.join(', ')}. You can reference these when relevant.`;
    }
    
    if (state.userContext.sessions_count > 1) {
        enhancedPrompt += `\n\nThis is session #${state.userContext.sessions_count} with this user. They're a returning visitor, which shows they find value in talking with you.`;
    }
    
    messages.push({ role: 'system', content: enhancedPrompt });
    
    // Add chat history (limit to last 20 messages for context)
    if (state.currentChatId && state.chats[state.currentChatId]) {
        const chatMessages = state.chats[state.currentChatId].messages
            .filter(m => m.role !== 'system')
            .slice(-20);
        messages.push(...chatMessages);
    }
    
    return messages;
}

/**
 * Send message to Groq API
 */
async function sendToGroq(messages) {
    try {
        const response = await fetch(CONFIG.GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: CONFIG.MODEL,
                messages: messages,
                max_tokens: CONFIG.MAX_TOKENS,
                temperature: 0.7,
                top_p: 0.9
            })
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('Groq API error:', error);
        throw error;
    }
}

/**
 * Handle sending a message
 */
async function handleSendMessage() {
    const content = elements.messageInput.value.trim();
    if (!content || state.isTyping) return;
    
    // Ensure we have a chat
    if (!state.currentChatId) {
        createNewChat();
    }
    
    // Check for crisis
    if (detectCrisis(content)) {
        showEmergencyModal();
    }
    
    // Add user message
    state.chats[state.currentChatId].messages.push({
        role: 'user',
        content: content,
        timestamp: Date.now()
    });
    state.chats[state.currentChatId].updatedAt = Date.now();
    
    // Update user context
    updateUserContext(content);
    
    // Update UI
    toggleWelcomeScreen(false);
    const userMessageEl = createMessageElement('user', content);
    elements.messages.appendChild(userMessageEl);
    scrollToBottom();
    
    // Clear input
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    elements.sendBtn.disabled = true;
    
    // Show typing indicator
    state.isTyping = true;
    showTypingIndicator();
    
    try {
        // Build context and send to API
        const conversationContext = buildConversationContext();
        const aiResponse = await sendToGroq(conversationContext);
        
        // Remove typing indicator
        removeTypingIndicator();
        
        // Add AI response
        state.chats[state.currentChatId].messages.push({
            role: 'assistant',
            content: aiResponse,
            timestamp: Date.now()
        });
        state.chats[state.currentChatId].updatedAt = Date.now();
        
        // Display AI message
        const aiMessageEl = createMessageElement('assistant', aiResponse);
        elements.messages.appendChild(aiMessageEl);
        scrollToBottom();
        
        saveUserData();
        renderChatHistory();
        
    } catch (error) {
        removeTypingIndicator();
        
        // Show error message
        const errorMessage = "I'm having trouble connecting right now. Please try again in a moment. Remember, if you need immediate support, the helpline numbers are always available.";
        const errorEl = createMessageElement('assistant', errorMessage);
        elements.messages.appendChild(errorEl);
        scrollToBottom();
    } finally {
        state.isTyping = false;
    }
}

// ==========================================
// Event Listeners
// ==========================================

/**
 * Initialize event listeners
 */
function initEventListeners() {
    // Mobile menu
    elements.mobileMenuBtn.addEventListener('click', toggleSidebar);
    
    // New chat button
    elements.newChatBtn.addEventListener('click', createNewChat);
    
    // Message input
    elements.messageInput.addEventListener('input', () => {
        // Auto-resize textarea
        elements.messageInput.style.height = 'auto';
        elements.messageInput.style.height = Math.min(elements.messageInput.scrollHeight, 200) + 'px';
        
        // Enable/disable send button
        elements.sendBtn.disabled = !elements.messageInput.value.trim();
    });
    
    elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    
    // Send button
    elements.sendBtn.addEventListener('click', handleSendMessage);
    
    // Suggestion chips
    elements.suggestionChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const message = chip.dataset.message;
            elements.messageInput.value = message;
            elements.sendBtn.disabled = false;
            handleSendMessage();
        });
    });
    
    // Emergency modal
    elements.closeEmergencyModal.addEventListener('click', hideEmergencyModal);
    elements.emergencyModal.addEventListener('click', (e) => {
        if (e.target === elements.emergencyModal) {
            hideEmergencyModal();
        }
    });
    
    // Handle escape key for modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (elements.emergencyModal.classList.contains('active')) {
                hideEmergencyModal();
            }
            if (elements.sidebar.classList.contains('open')) {
                toggleSidebar();
            }
        }
    });
}

// ==========================================
// Initialization
// ==========================================

/**
 * Initialize the application
 */
function init() {
    // Load existing data or create new user
    const hasData = loadUserData();
    
    if (!hasData) {
        state.userId = generateUserId();
        saveUserData();
    }
    
    // Initialize event listeners
    initEventListeners();
    
    // Render chat history
    renderChatHistory();
    
    // Load last chat or show welcome
    if (state.currentChatId && state.chats[state.currentChatId]) {
        const hasMessages = state.chats[state.currentChatId].messages.length > 0;
        renderMessages();
        toggleWelcomeScreen(!hasMessages);
    } else {
        toggleWelcomeScreen(true);
    }
    
    // Focus input
    elements.messageInput.focus();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
