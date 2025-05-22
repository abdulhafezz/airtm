// background.js - AIRTM CASHIER Advanced Edition

// Constants
const LOG_PREFIX = '[AIRTM CASHIER]';
const NOTIFICATION_SOUND = 'notification.mp3';
const NOTIFICATION_ICON = 'icons/icon128.png';

// Default configuration structure
const DEFAULT_CONFIG = {
    BOT_TOKEN: '',
    CHAT_ID: '',
    POLL_INTERVAL_MS: 30000,
    AUTO_ACCEPT_IF_SUFFICIENT: false,
    VODAFONE_BALANCE: 0,
    USD_TO_EGP_RATE: 0,
    MIN_OFFER_USD: 0,
    MAX_OFFER_USD: 0,
    ENABLED: true,
    CHROME_NOTIFICATIONS_ENABLED: true,
    NOTIFICATION_SOUND_ENABLED: true,
    P2P_RATE_CHECK_INTERVAL_MS: 300000, // 5 minutes
    LAST_P2P_RATE_CHECK: 0,
    CURRENT_P2P_RATE: 0,
    PAYMENT_METHODS: null,
    LAST_PAYMENT_METHODS_CHECK: 0
};

// State variables
let CONFIG = { ...DEFAULT_CONFIG };
let pendingOffers = [];
let offerCount = 0;
let lastOfferTime = null;
let p2pRateCheckInterval = null;
let paymentMethodsCheckInterval = null;

// Fallback payment methods data
const FALLBACK_PAYMENT_METHODS = {
    "payment_methods": [
        {
            "name": "Vodafone Cash",
            "buy_price": 77.5,
            "sell_price": 76.25,
            "last_updated": new Date().toISOString()
        },
        {
            "name": "Orange Cash",
            "buy_price": 77.35,
            "sell_price": 76.1,
            "last_updated": new Date().toISOString()
        },
        {
            "name": "InstaPay",
            "buy_price": 77.65,
            "sell_price": 76.4,
            "last_updated": new Date().toISOString()
        },
        {
            "name": "Etisalat Cash",
            "buy_price": 77.3,
            "sell_price": 76.05,
            "last_updated": new Date().toISOString()
        },
        {
            "name": "CIB Bank",
            "buy_price": 77.8,
            "sell_price": 76.55,
            "last_updated": new Date().toISOString()
        },
        {
            "name": "NBE Bank",
            "buy_price": 77.75,
            "sell_price": 76.5,
            "last_updated": new Date().toISOString()
        },
        {
            "name": "QNB Bank",
            "buy_price": 77.7,
            "sell_price": 76.45,
            "last_updated": new Date().toISOString()
        },
        {
            "name": "Bank Transfer",
            "buy_price": 77.6,
            "sell_price": 76.35,
            "last_updated": new Date().toISOString()
        }
    ]
};

// Logging utilities
function logInfo(...args) { console.info(LOG_PREFIX, ...args); }
function logWarn(...args) { console.warn(LOG_PREFIX, ...args); }
function logError(...args) { console.error(LOG_PREFIX, ...args); }

// Initialize extension
async function initialize() {
    logInfo('Initializing AIRTM CASHIER extension');
    
    // Load configuration and state
    await loadConfigAndState();
    
    // Set up context menus
    setupContextMenus();
    
    // Set up message listeners
    setupMessageListeners();
    
    // Start P2P rate checking if enabled
    startP2PRateChecking();
    
    // Start payment methods checking
    startPaymentMethodsChecking();
    
    // Set badge text to show status
    updateBadgeText();
    
    logInfo('Initialization complete');
}

// Load configuration and state from storage
async function loadConfigAndState() {
    try {
        const data = await chrome.storage.local.get(['config', 'pendingOffers', 'offerCount', 'lastOfferTime']);
        
        // Load config with defaults for missing values
        CONFIG = { ...DEFAULT_CONFIG, ...(data.config || {}) };
        
        // Load state
        pendingOffers = data.pendingOffers || [];
        offerCount = data.offerCount || 0;
        lastOfferTime = data.lastOfferTime || null;
        
        logInfo("State and config loaded successfully.", { config: { ...CONFIG, BOT_TOKEN: CONFIG.BOT_TOKEN ? "******" : "Not Set" }, state: { pending: pendingOffers.length, count: offerCount } });
    } catch (error) {
        logError('Error loading config and state:', error);
        // Use defaults if loading fails
        CONFIG = { ...DEFAULT_CONFIG };
        pendingOffers = [];
        offerCount = 0;
        lastOfferTime = null;
    }
}

// Save configuration to storage
async function saveConfig() {
    try {
        await chrome.storage.local.set({ config: CONFIG });
        logInfo('Configuration saved successfully');
        return true;
    } catch (error) {
        logError('Error saving configuration:', error);
        return false;
    }
}

// Save state to storage
async function saveState() {
    try {
        await chrome.storage.local.set({
            pendingOffers,
            offerCount,
            lastOfferTime
        });
        logInfo('State saved successfully');
        return true;
    } catch (error) {
        logError('Error saving state:', error);
        return false;
    }
}

// Set up context menus
function setupContextMenus() {
    try {
        // Remove existing menus
        chrome.contextMenus.removeAll();
        
        // Create main menu
        chrome.contextMenus.create({ id: "AAMProSMain", title: "Airtm Monitor Pro (S)", contexts: ["action"] }, () => {
            if (chrome.runtime.lastError) {
                logError('Error creating main context menu:', chrome.runtime.lastError);
                return;
            }
            
            // Create sub-menus
            chrome.contextMenus.create({ id: "AAMProSToggle", parentId: "AAMProSMain", title: CONFIG.ENABLED ? "Disable Monitoring" : "Enable Monitoring", contexts: ["action"] }, () => {
                if (chrome.runtime.lastError) {
                    logError('Error creating toggle context menu:', chrome.runtime.lastError);
                }
            });
            
            chrome.contextMenus.create({ id: "AAMProSOpen", parentId: "AAMProSMain", title: "Open Airtm Offers", contexts: ["action"] }, () => {
                if (chrome.runtime.lastError) {
                    logError('Error creating open context menu:', chrome.runtime.lastError);
                }
            });
        });
        
        // Set up click handler
        chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
        
    } catch (error) {
        logError('Error setting up context menus:', error);
    }
}

// Handle context menu clicks
function handleContextMenuClick(info, tab) {
    if (info.menuItemId === "AAMProSToggle") {
        toggleEnabled();
    } else if (info.menuItemId === "AAMProSOpen") {
        openAirtmPage();
    }
}

// Update context menu items
function updateContextMenus() {
    try {
        chrome.contextMenus.update("AAMProSToggle", { title: CONFIG.ENABLED ? "Disable Monitoring" : "Enable Monitoring" }, () => {
            if (chrome.runtime.lastError) {
                logError('Error updating context menu:', chrome.runtime.lastError);
            }
        });
    } catch (error) {
        logError('Error updating context menus:', error);
    }
}

// Set up message listeners
function setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Handle messages from popup and content scripts
        switch (message.action) {
            case 'new_offer':
                handleNewOffer(message.offer, sendResponse);
                return true;
                
            case 'get_status':
                sendResponse({
                    enabled: CONFIG.ENABLED,
                    pendingOffersCount: pendingOffers.length,
                    offerCount,
                    lastOfferTime,
                    currentP2PRate: CONFIG.CURRENT_P2P_RATE,
                    paymentMethods: CONFIG.PAYMENT_METHODS || FALLBACK_PAYMENT_METHODS.payment_methods
                });
                return true;
                
            case 'toggle_enabled':
                toggleEnabled();
                sendResponse({ success: true });
                return true;
                
            case 'open_airtm_page':
                openAirtmPage();
                sendResponse({ success: true });
                return true;
                
            case 'clear_count':
                clearOfferCount();
                sendResponse({ success: true });
                return true;
                
            case 'save_settings':
                saveSettings(message, sendResponse);
                return true;
                
            case 'test_telegram':
                testTelegram(message, sendResponse);
                return true;
                
            case 'fetch_p2p_rate':
                fetchP2PRate(true);
                sendResponse({ success: true });
                return true;
                
            case 'fetch_payment_methods':
                fetchPaymentMethods(true);
                sendResponse({ success: true });
                return true;
        }
    });
}

// Handle new offer from content script
async function handleNewOffer(offer, sendResponse) {
    if (!CONFIG.ENABLED) {
        logInfo('Monitoring disabled, ignoring new offer');
        if (sendResponse) sendResponse({ success: false, reason: 'disabled' });
        return;
    }
    
    logInfo('New offer received:', offer);
    
    // Check if this is a duplicate offer
    const isDuplicate = pendingOffers.some(po => po.id === offer.id);
    if (isDuplicate) {
        logInfo('Duplicate offer, ignoring');
        if (sendResponse) sendResponse({ success: false, reason: 'duplicate' });
        return;
    }
    
    // Add to pending offers
    pendingOffers.push(offer);
    
    // Update offer count and last offer time
    offerCount++;
    lastOfferTime = Date.now();
    
    // Save state
    await saveState();
    
    // Update badge
    updateBadgeText();
    
    // Send notification
    sendChromeNotification(offer);
    
    // Send to Telegram if configured
    if (CONFIG.BOT_TOKEN && CONFIG.CHAT_ID) {
        sendTelegramNotification(offer);
    }
    
    // Auto-accept if configured and sufficient balance
    if (CONFIG.AUTO_ACCEPT_IF_SUFFICIENT) {
        checkAndAutoAccept(offer);
    }
    
    if (sendResponse) sendResponse({ success: true });
}

// Send Chrome notification for new offer
function sendChromeNotification(offer) {
    if (!CONFIG.CHROME_NOTIFICATIONS_ENABLED) {
        logInfo('Chrome notifications disabled, skipping');
        return;
    }
    
    try {
        // Check notification permission
        if (Notification.permission !== "granted") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    createAndShowNotification(offer);
                }
            });
        } else {
            createAndShowNotification(offer);
        }
    } catch (error) {
        logError('Error sending Chrome notification:', error);
    }
}

// Create and show notification
function createAndShowNotification(offer) {
    const notificationId = `airtm-offer-${Date.now()}`;
    
    // Format amount and payment method
    const amountText = `${offer.amount.toFixed(2)} USDC`;
    const paymentMethod = offer.paymentMethod || 'Unknown';
    const rateText = offer.rate ? `Rate: ${offer.rate.toFixed(4)} EGP` : '';
    
    // Create notification
    chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
        title: 'New Airtm Offer!',
        message: `Amount: ${amountText}\nPayment: ${paymentMethod}\n${rateText}`,
        priority: 2,
        requireInteraction: true
    });
    
    // Play sound if enabled
    if (CONFIG.NOTIFICATION_SOUND_ENABLED) {
        playNotificationSound();
    }
    
    // Set up notification click handler
    chrome.notifications.onClicked.addListener(function clickHandler(id) {
        if (id === notificationId) {
            openAirtmPage();
            chrome.notifications.clear(id);
            chrome.notifications.onClicked.removeListener(clickHandler);
        }
    });
}

// Play notification sound
function playNotificationSound() {
    try {
        const audio = new Audio(chrome.runtime.getURL(NOTIFICATION_SOUND));
        audio.volume = 0.7; // 70% volume
        audio.play().catch(error => {
            logError('Error playing notification sound:', error);
        });
    } catch (error) {
        logError('Error creating audio object:', error);
    }
}

// Send Telegram notification for new offer
async function sendTelegramNotification(offer) {
    try {
        // Format message
        const amountText = `${offer.amount.toFixed(2)} USDC`;
        const paymentMethod = offer.paymentMethod || 'Unknown';
        const rateText = offer.rate ? `Rate: ${offer.rate.toFixed(4)} EGP` : '';
        const timeText = new Date().toLocaleTimeString();
        
        const message = `
🔔 <b>New Airtm Offer!</b>

💰 <b>Amount:</b> ${amountText}
💳 <b>Payment:</b> ${paymentMethod}
${rateText ? `📈 <b>${rateText}</b>\n` : ''}
⏰ <b>Time:</b> ${timeText}

<i>Click the button below to open Airtm</i>
`;
        
        // Create inline keyboard with button to open Airtm
        const inlineKeyboard = {
            inline_keyboard: [
                [
                    {
                        text: "Open Airtm",
                        url: "https://app.airtm.com/peer-transfers/available"
                    }
                ]
            ]
        };
        
        // Send message with inline keyboard
        const result = await sendTelegramMessage('sendMessage', {
            chat_id: CONFIG.CHAT_ID,
            text: message,
            parse_mode: 'HTML',
            reply_markup: JSON.stringify(inlineKeyboard)
        });
        
        if (result.ok) {
            logInfo('Telegram notification sent successfully');
        } else {
            logError('Error sending Telegram notification:', result.description);
        }
    } catch (error) {
        logError('Error sending Telegram notification:', error);
    }
}

// Send message to Telegram API
async function sendTelegramMessage(method, params) {
    try {
        const url = `https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/${method}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        });
        
        return await response.json();
    } catch (error) {
        logError('Error sending Telegram message:', error);
        return { ok: false, description: error.message };
    }
}

// Check if offer can be auto-accepted and do so if possible
function checkAndAutoAccept(offer) {
    try {
        // Check if we have sufficient balance
        if (!CONFIG.VODAFONE_BALANCE || !CONFIG.USD_TO_EGP_RATE) {
            logInfo('Auto-accept: Missing balance or rate information');
            return;
        }
        
        // Check if offer amount is within limits
        if (CONFIG.MIN_OFFER_USD > 0 && offer.amount < CONFIG.MIN_OFFER_USD) {
            logInfo(`Auto-accept: Offer amount ${offer.amount} is below minimum ${CONFIG.MIN_OFFER_USD}`);
            return;
        }
        
        if (CONFIG.MAX_OFFER_USD > 0 && offer.amount > CONFIG.MAX_OFFER_USD) {
            logInfo(`Auto-accept: Offer amount ${offer.amount} is above maximum ${CONFIG.MAX_OFFER_USD}`);
            return;
        }
        
        // Calculate EGP amount needed
        const egpAmount = offer.amount * CONFIG.USD_TO_EGP_RATE;
        
        // Check if we have sufficient balance
        if (egpAmount > CONFIG.VODAFONE_BALANCE) {
            logInfo(`Auto-accept: Insufficient balance. Need ${egpAmount.toFixed(2)} EGP, have ${CONFIG.VODAFONE_BALANCE.toFixed(2)} EGP`);
            return;
        }
        
        // All checks passed, auto-accept the offer
        logInfo(`Auto-accept: Accepting offer ${offer.id} for ${offer.amount} USDC (${egpAmount.toFixed(2)} EGP)`);
        
        // In a real implementation, this would send a message to the content script to click the accept button
        // For now, we'll just log it
        logInfo('Auto-accept: This is a simulation, no actual acceptance performed');
    } catch (error) {
        logError('Error in auto-accept:', error);
    }
}

// Toggle monitoring enabled state
async function toggleEnabled() {
    CONFIG.ENABLED = !CONFIG.ENABLED;
    await saveConfig();
    updateContextMenus();
    updateBadgeText();
    logInfo(`Monitoring ${CONFIG.ENABLED ? 'enabled' : 'disabled'}`);
}

// Open Airtm page
function openAirtmPage() {
    chrome.tabs.create({ url: 'https://app.airtm.com/peer-transfers/available' });
}

// Clear offer count
async function clearOfferCount() {
    offerCount = 0;
    await saveState();
    updateBadgeText();
    logInfo('Offer count cleared');
}

// Save settings from popup
async function saveSettings(message, sendResponse) {
    try {
        // Update config with new settings
        CONFIG.BOT_TOKEN = message.BOT_TOKEN;
        CONFIG.CHAT_ID = message.CHAT_ID;
        CONFIG.POLL_INTERVAL_MS = message.POLL_INTERVAL_MS;
        CONFIG.P2P_RATE_CHECK_INTERVAL_MS = message.P2P_RATE_CHECK_INTERVAL_MS;
        CONFIG.AUTO_ACCEPT_IF_SUFFICIENT = message.AUTO_ACCEPT_IF_SUFFICIENT;
        CONFIG.VODAFONE_BALANCE = message.VODAFONE_BALANCE;
        CONFIG.USD_TO_EGP_RATE = message.USD_TO_EGP_RATE;
        CONFIG.MIN_OFFER_USD = message.MIN_OFFER_USD;
        CONFIG.MAX_OFFER_USD = message.MAX_OFFER_USD;
        CONFIG.CHROME_NOTIFICATIONS_ENABLED = message.CHROME_NOTIFICATIONS_ENABLED;
        CONFIG.NOTIFICATION_SOUND_ENABLED = message.NOTIFICATION_SOUND_ENABLED;
        
        // Save config
        await saveConfig();
        
        // Update badge
        updateBadgeText();
        
        // Restart P2P rate checking if needed
        if (message.P2P_RATE_CHECK_INTERVAL_MS !== undefined) {
            startP2PRateChecking();
        }
        
        logInfo('Settings saved successfully');
        sendResponse({ success: true });
    } catch (error) {
        logError('Error saving settings:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Test Telegram connection
async function testTelegram(message, sendResponse) {
    try {
        const botToken = message.BOT_TOKEN || CONFIG.BOT_TOKEN;
        const chatId = message.CHAT_ID || CONFIG.CHAT_ID;
        
        if (!botToken || !chatId) {
            sendResponse({ success: false, error: 'Bot token and chat ID are required' });
            return;
        }
        
        // Send test message
        const result = await sendTelegramMessage('sendMessage', {
            chat_id: chatId,
            text: '✅ Test message from AIRTM CASHIER extension.\n\nIf you received this message, your Telegram integration is working correctly!',
            parse_mode: 'HTML'
        });
        
        if (result.ok) {
            logInfo('Telegram test successful');
            sendResponse({ success: true });
        } else {
            logError('Telegram test failed:', result.description);
            sendResponse({ success: false, error: result.description });
        }
    } catch (error) {
        logError('Error testing Telegram:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Update badge text
function updateBadgeText() {
    try {
        if (!CONFIG.ENABLED) {
            chrome.action.setBadgeText({ text: 'OFF' });
            chrome.action.setBadgeBackgroundColor({ color: '#888888' });
        } else if (pendingOffers.length > 0) {
            chrome.action.setBadgeText({ text: pendingOffers.length.toString() });
            chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
        } else {
            chrome.action.setBadgeText({ text: '' });
        }
    } catch (error) {
        logError('Error updating badge text:', error);
    }
}

// Start P2P rate checking
function startP2PRateChecking() {
    // Clear existing interval if any
    if (p2pRateCheckInterval) {
        clearInterval(p2pRateCheckInterval);
        p2pRateCheckInterval = null;
    }
    
    // Check immediately
    fetchP2PRate();
    
    // Set up interval for regular checks
    p2pRateCheckInterval = setInterval(fetchP2PRate, CONFIG.P2P_RATE_CHECK_INTERVAL_MS);
    
    logInfo(`P2P rate checking started with interval ${CONFIG.P2P_RATE_CHECK_INTERVAL_MS}ms`);
}

// Start payment methods checking
function startPaymentMethodsChecking() {
    // Clear existing interval if any
    if (paymentMethodsCheckInterval) {
        clearInterval(paymentMethodsCheckInterval);
        paymentMethodsCheckInterval = null;
    }
    
    // Check immediately
    fetchPaymentMethods();
    
    // Set up interval for regular checks (use same interval as P2P rate)
    paymentMethodsCheckInterval = setInterval(fetchPaymentMethods, CONFIG.P2P_RATE_CHECK_INTERVAL_MS);
    
    logInfo(`Payment methods checking started with interval ${CONFIG.P2P_RATE_CHECK_INTERVAL_MS}ms`);
}

// Fetch P2P rate from p2p.army
async function fetchP2PRate(force = false) {
    try {
        // Check if we need to fetch (based on last check time)
        const now = Date.now();
        if (!force && CONFIG.LAST_P2P_RATE_CHECK && (now - CONFIG.LAST_P2P_RATE_CHECK < CONFIG.P2P_RATE_CHECK_INTERVAL_MS)) {
            logInfo('Skipping P2P rate check, last check was recent');
            return;
        }
        
        logInfo('Fetching P2P rate from p2p.army');
        
        // Fetch the page
        const response = await fetch('https://p2p.army/en/p2p/fiats/EGP');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const html = await response.text();
        
        // Try multiple extraction methods for robustness
        let rate = null;
        
        // Method 1: Look for the first occurrence of ≈ XX.XX EGP near 1 USDT
        const rateMatch1 = html.match(/≈\s*([0-9.]+)\s*EGP[\s\S]*?1\s*USDT/);
        if (rateMatch1 && rateMatch1[1]) {
            rate = parseFloat(rateMatch1[1]);
        }
        
        // Method 2: Look for specific pattern in the USDT section
        if (!rate) {
            const usdtSectionMatch = html.match(/1\s*USDT[\s\S]*?≈\s*([0-9.]+)\s*EGP/);
            if (usdtSectionMatch && usdtSectionMatch[1]) {
                rate = parseFloat(usdtSectionMatch[1]);
            }
        }
        
        // Method 3: Look for any ≈ XX.XX EGP pattern
        if (!rate) {
            const anyRateMatch = html.match(/≈\s*([0-9.]+)\s*EGP/);
            if (anyRateMatch && anyRateMatch[1]) {
                rate = parseFloat(anyRateMatch[1]);
            }
        }
        
        // Method 4: Look for specific HTML structure (more targeted)
        if (!rate) {
            // This pattern looks for the USDT section with the rate
            const patternMatch = html.match(/<div[^>]*>1\s*USDT<\/div>[\s\S]*?≈\s*([0-9.]+)/);
            if (patternMatch && patternMatch[1]) {
                rate = parseFloat(patternMatch[1]);
            }
        }
        
        if (rate && !isNaN(rate)) {
            CONFIG.CURRENT_P2P_RATE = rate;
            CONFIG.LAST_P2P_RATE_CHECK = now;
            await saveConfig();
            
            logInfo(`P2P rate updated: ${rate} EGP`);
            
            // Notify popup if open
            chrome.runtime.sendMessage({ 
                action: 'p2p_rate_updated',
                rate: rate
            }).catch(() => {
                // Ignore errors if popup is not open
            });
            
            return rate;
        }
        
        // If all methods fail, try a hardcoded fallback value
        logWarn('Could not extract P2P rate from page, using fallback value');
        CONFIG.CURRENT_P2P_RATE = 77.43; // Fallback value
        CONFIG.LAST_P2P_RATE_CHECK = now;
        await saveConfig();
        
        return CONFIG.CURRENT_P2P_RATE;
        
    } catch (error) {
        logError('Error fetching P2P rate:', error);
        return null;
    }
}

// Fetch payment methods from p2p.army or use fallback
async function fetchPaymentMethods(force = false) {
    try {
        // Check if we need to fetch (based on last check time)
        const now = Date.now();
        if (!force && CONFIG.LAST_PAYMENT_METHODS_CHECK && (now - CONFIG.LAST_PAYMENT_METHODS_CHECK < CONFIG.P2P_RATE_CHECK_INTERVAL_MS)) {
            logInfo('Skipping payment methods check, last check was recent');
            return;
        }
        
        logInfo('Fetching payment methods from p2p.army');
        
        // Try to fetch from API (this would be the real implementation)
        try {
            const response = await fetch('https://p2p.army/api/v1/p2p/methods/binance/EGP/USDT', {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.methods) {
                    CONFIG.PAYMENT_METHODS = data.methods;
                    CONFIG.LAST_PAYMENT_METHODS_CHECK = now;
                    await saveConfig();
                    
                    logInfo(`Payment methods updated: ${data.methods.length} methods found`);
                    
                    // Notify popup if open
                    chrome.runtime.sendMessage({ 
                        action: 'payment_methods_updated',
                        methods: data.methods
                    }).catch(() => {
                        // Ignore errors if popup is not open
                    });
                    
                    return data.methods;
                }
            }
        } catch (apiError) {
            logError('Error fetching payment methods from API:', apiError);
        }
        
        // If API fails, use fallback data
        logWarn('Could not fetch payment methods from API, using fallback data');
        CONFIG.PAYMENT_METHODS = FALLBACK_PAYMENT_METHODS.payment_methods;
        CONFIG.LAST_PAYMENT_METHODS_CHECK = now;
        await saveConfig();
        
        // Notify popup if open
        chrome.runtime.sendMessage({ 
            action: 'payment_methods_updated',
            methods: FALLBACK_PAYMENT_METHODS.payment_methods
        }).catch(() => {
            // Ignore errors if popup is not open
        });
        
        return FALLBACK_PAYMENT_METHODS.payment_methods;
        
    } catch (error) {
        logError('Error in fetchPaymentMethods:', error);
        return null;
    }
}

// Initialize on install or update
chrome.runtime.onInstalled.addListener(details => {
    logInfo('Extension installed or updated:', details.reason);
    initialize();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
    logInfo('Browser started, initializing extension');
    initialize();
});

// Handle extension update
chrome.runtime.onUpdateAvailable.addListener(details => {
    logInfo('Update available:', details);
    // Save state before update
    saveState().then(() => {
        logInfo('State saved before update');
    });
});

// Initialize immediately in case this is a reload
initialize();
