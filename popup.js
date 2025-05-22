// popup.js - AIRTM CASHIER Advanced Edition

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const statusText = document.getElementById('status-text');
    const statusDot = document.getElementById('status-dot');
    const totalOffersElement = document.getElementById('total-offers');
    const pendingOffersElement = document.getElementById('pending-offers');
    const lastOfferTimeElement = document.getElementById('last-offer-time');
    const p2pRateElement = document.getElementById('p2p-rate');
    const p2pRateTimeElement = document.getElementById('p2p-rate-time');
    const paymentMethodsBody = document.getElementById('payment-methods-body');
    const paymentMethodsTimeElement = document.getElementById('payment-methods-time');
    
    // Buttons
    const toggleMonitoringButton = document.getElementById('toggle-monitoring');
    const openAirtmButton = document.getElementById('open-airtm');
    const clearCounterButton = document.getElementById('clear-counter');
    const saveSettingsButton = document.getElementById('save-settings');
    const testTelegramButton = document.getElementById('test-telegram');
    const refreshP2PRateButton = document.getElementById('refresh-p2p-rate');
    const refreshPaymentMethodsButton = document.getElementById('refresh-payment-methods');
    const testSoundButton = document.getElementById('test-sound');
    
    // Form elements
    const botTokenInput = document.getElementById('bot-token');
    const chatIdInput = document.getElementById('chat-id');
    const pollIntervalInput = document.getElementById('poll-interval');
    const p2pRateIntervalInput = document.getElementById('p2p-rate-interval');
    const autoAcceptCheckbox = document.getElementById('auto-accept');
    const vodafoneBalanceInput = document.getElementById('vodafone-balance');
    const usdEgpRateInput = document.getElementById('usd-egp-rate');
    const minOfferInput = document.getElementById('min-offer');
    const maxOfferInput = document.getElementById('max-offer');
    const chromeNotificationsCheckbox = document.getElementById('chrome-notifications');
    const notificationSoundCheckbox = document.getElementById('notification-sound');
    
    // Results
    const telegramTestResult = document.getElementById('telegram-test-result');
    
    // Egyptian payment methods data (fallback)
    const fallbackPaymentMethods = {
        "payment_methods": [
            {
                "name": "Vodafone Cash",
                "buy_price": 77.5,
                "sell_price": 76.25,
                "last_updated": "2025-05-22T16:00:00Z"
            },
            {
                "name": "Orange Cash",
                "buy_price": 77.35,
                "sell_price": 76.1,
                "last_updated": "2025-05-22T16:00:00Z"
            },
            {
                "name": "InstaPay",
                "buy_price": 77.65,
                "sell_price": 76.4,
                "last_updated": "2025-05-22T16:00:00Z"
            },
            {
                "name": "Etisalat Cash",
                "buy_price": 77.3,
                "sell_price": 76.05,
                "last_updated": "2025-05-22T16:00:00Z"
            },
            {
                "name": "CIB Bank",
                "buy_price": 77.8,
                "sell_price": 76.55,
                "last_updated": "2025-05-22T16:00:00Z"
            },
            {
                "name": "NBE Bank",
                "buy_price": 77.75,
                "sell_price": 76.5,
                "last_updated": "2025-05-22T16:00:00Z"
            },
            {
                "name": "QNB Bank",
                "buy_price": 77.7,
                "sell_price": 76.45,
                "last_updated": "2025-05-22T16:00:00Z"
            },
            {
                "name": "Bank Transfer",
                "buy_price": 77.6,
                "sell_price": 76.35,
                "last_updated": "2025-05-22T16:00:00Z"
            }
        ]
    };
    
    // Load settings and status
    loadSettings();
    updateStatus();
    loadPaymentMethods();
    
    // Event listeners
    toggleMonitoringButton.addEventListener('click', toggleMonitoring);
    openAirtmButton.addEventListener('click', openAirtm);
    clearCounterButton.addEventListener('click', clearCounter);
    saveSettingsButton.addEventListener('click', saveSettings);
    testTelegramButton.addEventListener('click', testTelegram);
    refreshP2PRateButton.addEventListener('click', refreshP2PRate);
    refreshPaymentMethodsButton.addEventListener('click', refreshPaymentMethods);
    testSoundButton.addEventListener('click', testSound);
    
    // Listen for status updates from background script
    chrome.runtime.onMessage.addListener(function(message) {
        if (message.action === "status_update_for_popup") {
            updateStatus();
        }
        
        if (message.action === "p2p_rate_updated") {
            updateP2PRate(message.rate);
        }
        
        if (message.action === "payment_methods_updated") {
            loadPaymentMethods(message.methods);
        }
    });
    
    // Functions
    function loadSettings() {
        chrome.storage.local.get('config', function(data) {
            if (data.config) {
                botTokenInput.value = data.config.BOT_TOKEN || '';
                chatIdInput.value = data.config.CHAT_ID || '';
                pollIntervalInput.value = data.config.POLL_INTERVAL_MS || 30000;
                p2pRateIntervalInput.value = data.config.P2P_RATE_CHECK_INTERVAL_MS || 300000;
                autoAcceptCheckbox.checked = data.config.AUTO_ACCEPT_IF_SUFFICIENT || false;
                vodafoneBalanceInput.value = data.config.VODAFONE_BALANCE || 0;
                usdEgpRateInput.value = data.config.USD_TO_EGP_RATE || 0;
                minOfferInput.value = data.config.MIN_OFFER_USD || 0;
                maxOfferInput.value = data.config.MAX_OFFER_USD || 0;
                chromeNotificationsCheckbox.checked = data.config.CHROME_NOTIFICATIONS_ENABLED !== false;
                notificationSoundCheckbox.checked = data.config.NOTIFICATION_SOUND_ENABLED !== false;
                
                // Update P2P rate display
                if (data.config.CURRENT_P2P_RATE) {
                    updateP2PRate(data.config.CURRENT_P2P_RATE);
                    
                    // Update last check time
                    if (data.config.LAST_P2P_RATE_CHECK) {
                        const date = new Date(data.config.LAST_P2P_RATE_CHECK);
                        p2pRateTimeElement.textContent = `Last updated: ${formatDate(date)}`;
                    }
                }
            }
        });
    }
    
    function updateStatus() {
        chrome.runtime.sendMessage({ action: 'get_status' }, function(response) {
            if (response) {
                // Update monitoring status
                if (response.enabled) {
                    statusText.textContent = 'Monitoring';
                    statusDot.classList.add('active');
                    toggleMonitoringButton.textContent = 'Disable Monitoring';
                } else {
                    statusText.textContent = 'Paused';
                    statusDot.classList.remove('active');
                    toggleMonitoringButton.textContent = 'Enable Monitoring';
                }
                
                // Update stats
                totalOffersElement.textContent = response.offerCount || 0;
                pendingOffersElement.textContent = response.pendingOffersCount || 0;
                
                // Update last offer time
                if (response.lastOfferTime) {
                    const date = new Date(response.lastOfferTime);
                    lastOfferTimeElement.textContent = formatDate(date);
                } else {
                    lastOfferTimeElement.textContent = 'Never';
                }
                
                // Update P2P rate if available
                if (response.currentP2PRate) {
                    updateP2PRate(response.currentP2PRate);
                }
            }
        });
    }
    
    function updateP2PRate(rate) {
        if (rate) {
            p2pRateElement.textContent = rate.toFixed(2);
        } else {
            p2pRateElement.textContent = 'Unknown';
        }
    }
    
    function loadPaymentMethods(methods) {
        // Use provided methods or fallback
        const paymentMethods = methods || fallbackPaymentMethods.payment_methods;
        
        // Clear existing rows
        paymentMethodsBody.innerHTML = '';
        
        if (paymentMethods && paymentMethods.length > 0) {
            // Sort methods by buy price (highest first)
            const sortedMethods = [...paymentMethods].sort((a, b) => b.buy_price - a.buy_price);
            
            // Add rows for each payment method
            sortedMethods.forEach(method => {
                const row = document.createElement('tr');
                row.className = 'payment-method-row';
                
                const nameCell = document.createElement('td');
                nameCell.textContent = method.name;
                
                const buyCell = document.createElement('td');
                buyCell.textContent = method.buy_price.toFixed(2) + ' EGP';
                buyCell.style.color = '#4CAF50'; // Green for buy price
                
                const sellCell = document.createElement('td');
                sellCell.textContent = method.sell_price.toFixed(2) + ' EGP';
                sellCell.style.color = '#F44336'; // Red for sell price
                
                row.appendChild(nameCell);
                row.appendChild(buyCell);
                row.appendChild(sellCell);
                
                paymentMethodsBody.appendChild(row);
            });
            
            // Update last updated time
            if (paymentMethods[0] && paymentMethods[0].last_updated) {
                const date = new Date(paymentMethods[0].last_updated);
                paymentMethodsTimeElement.textContent = `Last updated: ${formatDate(date)}`;
            } else {
                paymentMethodsTimeElement.textContent = `Last updated: ${formatDate(new Date())}`;
            }
        } else {
            // Show no data message
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 3;
            cell.className = 'loading-text';
            cell.textContent = 'No payment method data available';
            row.appendChild(cell);
            paymentMethodsBody.appendChild(row);
        }
    }
    
    function refreshPaymentMethods() {
        // Show loading state
        paymentMethodsBody.innerHTML = '<tr><td colspan="3" class="loading-text">Refreshing payment methods...</td></tr>';
        
        // In a real implementation, this would fetch from the API
        // For now, we'll use the fallback data with a slight delay to simulate refresh
        setTimeout(() => {
            loadPaymentMethods();
        }, 1000);
    }
    
    function toggleMonitoring() {
        chrome.runtime.sendMessage({ action: 'toggle_enabled' }, function(response) {
            if (response && response.success) {
                updateStatus();
            }
        });
    }
    
    function openAirtm() {
        chrome.runtime.sendMessage({ action: 'open_airtm_page' });
    }
    
    function clearCounter() {
        chrome.runtime.sendMessage({ action: 'clear_count' }, function(response) {
            if (response && response.success) {
                updateStatus();
            }
        });
    }
    
    function refreshP2PRate() {
        // Show loading state
        p2pRateElement.textContent = 'Loading...';
        
        chrome.runtime.sendMessage({ action: 'fetch_p2p_rate' }, function(response) {
            if (response && response.success) {
                // Will be updated via message listener
                setTimeout(updateStatus, 1000); // Fallback update
            } else {
                p2pRateElement.textContent = 'Error';
                setTimeout(updateStatus, 2000); // Retry
            }
        });
    }
    
    function testSound() {
        // Create and play the notification sound
        const audio = new Audio(chrome.runtime.getURL('notification.mp3'));
        audio.volume = 0.7; // 70% volume
        audio.play().catch(error => {
            console.error('Error playing test sound:', error);
        });
    }
    
    function saveSettings() {
        const settings = {
            action: 'save_settings',
            BOT_TOKEN: botTokenInput.value.trim(),
            CHAT_ID: chatIdInput.value.trim(),
            POLL_INTERVAL_MS: parseInt(pollIntervalInput.value, 10) || 30000,
            P2P_RATE_CHECK_INTERVAL_MS: parseInt(p2pRateIntervalInput.value, 10) || 300000,
            AUTO_ACCEPT_IF_SUFFICIENT: autoAcceptCheckbox.checked,
            VODAFONE_BALANCE: parseFloat(vodafoneBalanceInput.value) || 0,
            USD_TO_EGP_RATE: parseFloat(usdEgpRateInput.value) || 0,
            MIN_OFFER_USD: parseFloat(minOfferInput.value) || 0,
            MAX_OFFER_USD: parseFloat(maxOfferInput.value) || 0,
            CHROME_NOTIFICATIONS_ENABLED: chromeNotificationsCheckbox.checked,
            NOTIFICATION_SOUND_ENABLED: notificationSoundCheckbox.checked
        };
        
        chrome.runtime.sendMessage(settings, function(response) {
            if (response && response.success) {
                showSaveSuccess();
            }
        });
    }
    
    function testTelegram() {
        const botToken = botTokenInput.value.trim();
        const chatId = chatIdInput.value.trim();
        
        if (!botToken || !chatId) {
            showTelegramTestResult(false, 'Bot token and chat ID are required');
            return;
        }
        
        telegramTestResult.textContent = 'Testing...';
        telegramTestResult.className = 'test-result';
        telegramTestResult.style.display = 'block';
        
        chrome.runtime.sendMessage({
            action: 'test_telegram',
            BOT_TOKEN: botToken,
            CHAT_ID: chatId
        }, function(response) {
            showTelegramTestResult(response.success, response.error);
        });
    }
    
    function showTelegramTestResult(success, error) {
        telegramTestResult.textContent = success ? 'Test successful!' : `Test failed: ${error}`;
        telegramTestResult.className = success ? 'test-result success' : 'test-result error';
        telegramTestResult.style.display = 'block';
        
        // Hide after 5 seconds
        setTimeout(function() {
            telegramTestResult.style.display = 'none';
        }, 5000);
    }
    
    function showSaveSuccess() {
        const saveResult = document.createElement('div');
        saveResult.className = 'test-result success';
        saveResult.textContent = 'Settings saved successfully!';
        saveResult.style.position = 'fixed';
        saveResult.style.bottom = '20px';
        saveResult.style.left = '50%';
        saveResult.style.transform = 'translateX(-50%)';
        saveResult.style.padding = '10px 20px';
        saveResult.style.borderRadius = '4px';
        saveResult.style.zIndex = '1000';
        
        document.body.appendChild(saveResult);
        
        setTimeout(function() {
            saveResult.style.opacity = '0';
            saveResult.style.transition = 'opacity 0.5s';
            
            setTimeout(function() {
                document.body.removeChild(saveResult);
            }, 500);
        }, 2000);
    }
    
    function formatDate(date) {
        if (isToday(date)) {
            return `Today ${formatTime(date)}`;
        } else if (isYesterday(date)) {
            return `Yesterday ${formatTime(date)}`;
        } else {
            return `${date.toLocaleDateString()} ${formatTime(date)}`;
        }
    }
    
    function formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    function isToday(date) {
        const today = new Date();
        return date.getDate() === today.getDate() &&
               date.getMonth() === today.getMonth() &&
               date.getFullYear() === today.getFullYear();
    }
    
    function isYesterday(date) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return date.getDate() === yesterday.getDate() &&
               date.getMonth() === yesterday.getMonth() &&
               date.getFullYear() === yesterday.getFullYear();
    }
    
    // Request notification permission if not already granted
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission().then(function(permission) {
            console.log('Notification permission:', permission);
        });
    }
});
