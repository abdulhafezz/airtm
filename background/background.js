// background/background.js

// Add at the top with other global variables:
let diagnosticLogs = [];
const MAX_DIAGNOSTIC_LOGS = 50;

// New function to add a log entry
function addDiagnosticLog(message, level = "INFO") {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    diagnosticLogs.unshift(logEntry); 
    if (diagnosticLogs.length > MAX_DIAGNOSTIC_LOGS) {
        diagnosticLogs.length = MAX_DIAGNOSTIC_LOGS; // Keep the array capped
    }
    // Optionally, send real-time log updates to open popups/options pages
    chrome.runtime.sendMessage({ type: "DIAGNOSTIC_LOG_UPDATE", data: diagnosticLogs }).catch(e => {/*ignore if no listeners, or specific error for "no receiving end"*/});
}
console.log("Airtm Monitor Pro: Background Service Worker Loaded");
addDiagnosticLog("Background Service Worker Loaded", "INFO");

let settings = {
    monitoringActive: false,
    telegramToken: "",
    telegramChatId: "",
    minAmount: 0,
    maxAmount: Infinity,
    paymentMethods: "", // Will be a comma-separated string
    usdToEgpRate: 0,
    manualBalance: 0,
    chromeNotifications: true,
    telegramNotifications: true,
    autoAcceptEnabled: false,
    botServerUrl: "",
    userIdForPolling: "",
    pollingInterval: 30, // Default polling interval in seconds
};

let processedOfferIds = new Set(); // To keep track of offers already notified/processed in the current session
const REMOTE_COMMAND_POLL_ALARM = "remoteCommandPollAlarm";
let isPollingForCommands = false; // Renamed from isRemotePollingActive for clarity
let lastCheckTime = 'N/A';
let offersDetectedThisSession = 0;


// Load settings from storage when the extension starts
chrome.storage.local.get(null, (loadedSettings) => {
    if (chrome.runtime.lastError) {
        console.error("Airtm Monitor Pro: Error loading settings:", chrome.runtime.lastError.message);
        addDiagnosticLog(`Error loading settings: ${chrome.runtime.lastError.message}`, "ERROR");
    } else {
        settings = { ...settings, ...loadedSettings }; // Spread loaded first, then defaults ensure all keys exist
        // Ensure default values for booleans if they were never saved or are undefined
        settings.monitoringActive = !!loadedSettings.monitoringActive;
        settings.chromeNotifications = loadedSettings.chromeNotifications !== undefined ? loadedSettings.chromeNotifications : true;
        settings.telegramNotifications = loadedSettings.telegramNotifications !== undefined ? loadedSettings.telegramNotifications : true;
        settings.autoAcceptEnabled = !!loadedSettings.autoAcceptEnabled;
        settings.botServerUrl = loadedSettings.botServerUrl || "";
        settings.userIdForPolling = loadedSettings.userIdForPolling || "";
        settings.pollingInterval = loadedSettings.pollingInterval || 30;
        console.log("Airtm Monitor Pro: Settings loaded", settings);
        addDiagnosticLog(`Settings loaded. Monitoring Active: ${settings.monitoringActive}, TG Bot Configured: ${!!settings.telegramToken}, Auto-Accept: ${settings.autoAcceptEnabled}`, "INFO");
    }
    setupRemoteCommandPolling(); // Call after settings are loaded/merged
});

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        let relevantSettingsChanged = false;
        for (let key in changes) {
            settings[key] = changes[key].newValue;
            if (key === 'monitoringActive' || key === 'botServerUrl' || key === 'userIdForPolling' || key === 'pollingInterval' || key === 'autoAcceptEnabled' || key === 'manualBalance') {
                relevantSettingsChanged = true;
            }
        }
        console.log("Airtm Monitor Pro: Settings updated in background", settings);
        addDiagnosticLog(`Settings updated. Key(s): ${Object.keys(changes).join(', ')}. Monitoring Active: ${settings.monitoringActive}, Auto-Accept: ${settings.autoAcceptEnabled}`, "INFO");

        if (relevantSettingsChanged) {
            console.log("Airtm Monitor Pro: Relevant settings for polling or auto-accept changed.");
            addDiagnosticLog("Relevant settings for polling/auto-accept changed. Re-evaluating polling.", "INFO");
            setupRemoteCommandPolling(); // Re-evaluate polling based on new settings
        }
    }
});

// Function to start or restart polling for commands
function setupRemoteCommandPolling() {
    if (settings.monitoringActive && settings.botServerUrl && settings.userIdForPolling) {
        let interval = Math.max(15, parseInt(settings.pollingInterval, 10) || 30);
        chrome.alarms.create(REMOTE_COMMAND_POLL_ALARM, {
            delayInMinutes: 0.1, // Start soon
            periodInMinutes: interval / 60
        });
        isPollingForCommands = true;
        console.log(`Airtm Monitor Pro: Started polling for remote commands every ${interval} seconds.`);
        addDiagnosticLog(`Started polling for remote commands. Interval: ${interval}s.`, "INFO");
    } else {
        chrome.alarms.clear(REMOTE_COMMAND_POLL_ALARM, (wasCleared) => {
            // console.log(`Airtm Monitor Pro: Alarm ${REMOTE_COMMAND_POLL_ALARM} clear attempt result: ${wasCleared}`);
        });
        isPollingForCommands = false;
        console.log("Airtm Monitor Pro: Stopped polling for remote commands (disabled or settings incomplete).");
        addDiagnosticLog("Stopped polling for remote commands (disabled or settings incomplete).", "INFO");
    }
}

async function pollForCommands() {
    if (!settings.monitoringActive || !settings.botServerUrl || !settings.userIdForPolling || !isPollingForCommands) {
        // console.log("Airtm Monitor Pro: Skipping command poll - feature disabled, config missing, or polling stopped.");
        if (!isPollingForCommands) {
             chrome.alarms.clear(REMOTE_COMMAND_POLL_ALARM); // Ensure alarm is cleared if polling flag is false
        }
        return;
    }

    const commandUrl = `${settings.botServerUrl}?userId=${encodeURIComponent(settings.userIdForPolling)}&timestamp=${Date.now()}`;
    // console.log("Airtm Monitor Pro: Polling for commands from:", settings.botServerUrl);

    try {
        const response = await fetch(commandUrl, { method: 'GET' });
        if (!response.ok) {
            console.warn(`Airtm Monitor Pro: Error polling for commands. Status: ${response.status} ${response.statusText}`);
            return;
        }
        const commands = await response.json();

        if (commands && commands.length > 0) {
            console.log("Airtm Monitor Pro: Received remote commands:", commands);
            for (const command of commands) {
                if (command.action === "ACCEPT_OFFER" && command.offerId) {
                    await processAcceptOfferCommand(command.offerId, false); // false for isAutoAccept
                } else {
                    console.warn("Airtm Monitor Pro: Unknown remote command or missing offerId", command);
                }
            }
        } else {
            // console.log("Airtm Monitor Pro: No new remote commands from server.");
        }
    } catch (error) {
        console.error("Airtm Monitor Pro: Exception while polling for remote commands:", error);
    }
}

async function processAcceptOfferCommand(offerId, isAutoAccept = false) {
    const mode = isAutoAccept ? "AUTO-ACCEPT" : "Remote Command";
    console.log(`Airtm Monitor Pro: Processing ${mode} to accept offer: ${offerId}`);

    // Prevent processing if already handled, especially important for auto-accept vs manual remote accept
    if (processedOfferIds.has(offerId) && !isAutoAccept) { // Allow auto-accept to proceed even if manually processed for logging
        console.log(`Airtm Monitor Pro (${mode}): Offer ${offerId} already processed or being processed. Skipping.`);
        return;
    }
    if (isAutoAccept) { // For auto-accept, add to processed set immediately to prevent race conditions
        processedOfferIds.add(offerId);
    }

    chrome.tabs.query({ url: "https://app.airtm.com/peer-transfers/available*" }, (tabs) => {
        if (tabs && tabs.length > 0) {
            const airtmTab = tabs.find(tab => tab.active && tab.status === 'complete') || tabs.find(tab => tab.status === 'complete') || tabs[0];
            if (airtmTab && airtmTab.id) {
                chrome.tabs.sendMessage(airtmTab.id, { action: "ACCEPT_OFFER", offerId: offerId }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error(`Airtm Monitor Pro (${mode}): Error sending ACCEPT_OFFER to content script for ${offerId}:`, chrome.runtime.lastError.message);
                        sendTelegramNotification(null, true, `🤖❌ ${mode} FAILED for ...${offerId.slice(-6)}. Error: ${chrome.runtime.lastError.message}`);
                        if (isAutoAccept) { processedOfferIds.delete(offerId); } // Allow manual notification
                    } else {
                        console.log(`Airtm Monitor Pro (${mode}): ACCEPT_OFFER sent to content script for ${offerId}. Response:`, response);
                        if (response && response.success) {
                            sendTelegramNotification(null, true, `${isAutoAccept ? '🤖✅ Auto-acceptance SUCCEEDED' : '✅ Remotely initiated acceptance SUCCEEDED'} for offer ID: ...${offerId.slice(-6)}.`);
                            if(!isAutoAccept) processedOfferIds.add(offerId); // Add to processed if manual remote accept succeeded
                        } else {
                            sendTelegramNotification(null, true, `${isAutoAccept ? '🤖❌ Auto-acceptance FAILED' : '❌ Remotely initiated acceptance FAILED'} for ...${offerId.slice(-6)}. Content script: ${response ? response.detail : 'No details'}.`);
                            if (isAutoAccept) { processedOfferIds.delete(offerId); } // Allow manual notification
                        }
                    }
                });
            } else {
                console.warn(`Airtm Monitor Pro (${mode}): No suitable Airtm tab found for offer ${offerId}. Tab:`, airtmTab);
                sendTelegramNotification(null, true, `${isAutoAccept ? '🤖❌ Auto-acceptance FAILED' : '❌ Remote accept FAILED'}. No ready Airtm tab for ...${offerId.slice(-6)}.`);
                if (isAutoAccept) { processedOfferIds.delete(offerId); }
            }
        } else {
            console.warn(`Airtm Monitor Pro (${mode}): No Airtm tabs found for offer ${offerId}.`);
            sendTelegramNotification(null, true, `${isAutoAccept ? '🤖❌ Auto-acceptance FAILED' : '❌ Remote accept FAILED'}. No Airtm tabs open for ...${offerId.slice(-6)}.`);
            if (isAutoAccept) { processedOfferIds.delete(offerId); }
        }
    });
}


/**
 * Filters offers based on user settings for general notification.
 * @param {Array<Object>} offers - Array of offer objects from the content script.
 * @returns {Array<Object>} Filtered offers.
 */
function filterOffersForNotification(offers) {
    if (!settings.monitoringActive || !offers) {
        return [];
    }
    const preferredMethods = settings.paymentMethods ? settings.paymentMethods.toLowerCase().split(',').map(m => m.trim()).filter(m => m) : [];

    return offers.filter(offer => {
        if (!offer || typeof offer.amount !== 'number' || !offer.id) {
            console.warn("Airtm Monitor Pro (Filter): Invalid offer structure:", offer);
            return false;
        }
        const meetsAmountCriteria = offer.amount >= (settings.minAmount || 0) && offer.amount <= (settings.maxAmount || Infinity);
        let meetsPaymentMethodCriteria = true;
        if (preferredMethods.length > 0 && offer.paymentMethod) {
            meetsPaymentMethodCriteria = preferredMethods.includes(offer.paymentMethod.toLowerCase());
        } else if (preferredMethods.length > 0 && !offer.paymentMethod) {
            meetsPaymentMethodCriteria = false;
        }

        // Primary filter: amount, payment method, and NOT YET PROCESSED
        return meetsAmountCriteria && meetsPaymentMethodCriteria && !processedOfferIds.has(offer.id);
    });
}

/**
 * Attempts to automatically accept an offer if conditions are met.
 * @param {Object} offer - The offer object.
 */
async function tryAutoAccept(offer) {
    if (!settings.autoAcceptEnabled || !settings.monitoringActive) {
        return false; // Auto-accept not enabled or main monitoring is off
    }

    if (processedOfferIds.has(offer.id)) {
        // console.log(`Airtm Monitor Pro (AutoAccept): Offer ${offer.id} already processed. Skipping.`);
        return false;
    }

    console.log(`Airtm Monitor Pro (AutoAccept): Checking conditions for offer ID ${offer.id}:`, offer);

    // Auto-accept specific filters (can be stricter or different from notification filters)
    const meetsAmountCriteria = offer.amount >= (settings.minAmount || 0) && offer.amount <= (settings.maxAmount || Infinity);
    const preferredMethods = settings.paymentMethods ? settings.paymentMethods.toLowerCase().split(',').map(m => m.trim()).filter(m => m) : [];
    let meetsPaymentMethodCriteria = true;
    if (preferredMethods.length > 0 && offer.paymentMethod) {
        meetsPaymentMethodCriteria = preferredMethods.includes(offer.paymentMethod.toLowerCase());
    } else if (preferredMethods.length > 0 && !offer.paymentMethod) {
        meetsPaymentMethodCriteria = false;
    }

    if (!meetsAmountCriteria || !meetsPaymentMethodCriteria) {
        // console.log(`Airtm Monitor Pro (AutoAccept): Offer ${offer.id} did not meet amount/payment criteria for auto-accept.`);
        return false;
    }

    let meetsBalanceCriteria = false;
    if (typeof settings.manualBalance === 'number' && settings.manualBalance > 0) {
        if (offer.amount <= settings.manualBalance) {
            meetsBalanceCriteria = true;
        } else {
            console.log(`Airtm Monitor Pro (AutoAccept): Offer ${offer.id} amount ${offer.amount} exceeds manual balance ${settings.manualBalance}.`);
        }
    } else {
        console.log(`Airtm Monitor Pro (AutoAccept): Auto-accept requires a positive manual balance. Offer ${offer.id} not auto-accepted.`);
        return false; // Strict: requires positive manual balance
    }

    if (meetsBalanceCriteria) { // All auto-accept conditions met
        console.log(`Airtm Monitor Pro (AutoAccept): Offer ID ${offer.id} meets all criteria. Attempting acceptance.`);
        // Send pre-attempt notification
        if (settings.telegramNotifications) {
           await sendTelegramNotification(null, true, `🤖 Attempting AUTO-ACCEPTANCE for offer:
Method: ${offer.paymentMethod}
Amount: ${offer.amount} ${offer.currency}
Offer ID: ...${offer.id.slice(-6)}`);
        }
        await processAcceptOfferCommand(offer.id, true); // true for isAutoAccept
        return true; // Indicates an attempt was made
    } else {
        // console.log(`Airtm Monitor Pro (AutoAccept): Offer ID ${offer.id} did not meet balance criteria.`);
        return false;
    }
}


function sendChromeNotification(offer) {
    if (!settings.chromeNotifications) return;

    const notificationId = `airtm-offer-${offer.id}-${Date.now()}`;
    let message = `Method: ${offer.paymentMethod || 'N/A'}
Amount: ${offer.amount} ${offer.currency || 'USD'}`;
    if (settings.usdToEgpRate && offer.currency && (offer.currency.toUpperCase() === 'USDC' || offer.currency.toUpperCase() === 'USD')) {
        const egpAmount = (offer.amount * settings.usdToEgpRate).toFixed(2);
        message += ` (approx. ${egpAmount} EGP)`;
    }

    chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: "../images/icon48.png",
        title: "New Airtm Offer!",
        message: message,
        priority: 2
    }, (createdNotificationId) => {
        if (chrome.runtime.lastError) {
            console.error("Airtm Monitor Pro: Error creating Chrome notification:", chrome.runtime.lastError.message);
        } else {
            console.log("Airtm Monitor Pro: Chrome notification sent:", createdNotificationId);
            // Add to processed only if Telegram is NOT also going to process it, or handle deduplication there.
            // For simplicity, let sendTelegramNotification also add to processedOfferIds if it's active.
            // If only Chrome notifications are on, this is the place.
            if (!settings.telegramNotifications) {
                 processedOfferIds.add(offer.id);
            }
        }
    });
}

async function sendTelegramNotification(offer, isTest = false, customMessage = "") {
    if (!isTest && !settings.telegramNotifications) {
        // console.log("Airtm Monitor Pro: Telegram notifications are disabled in settings.");
        return { success: false, detail: "Telegram notifications disabled in settings." };
    }

    const token = settings.telegramToken;
    const chatId = settings.telegramChatId;

    if (!token || !chatId) {
        console.warn("Airtm Monitor Pro: Telegram token or chat ID is not set.");
        return { success: false, detail: "Telegram token or chat ID not set." };
    }

    let text;
    if (isTest) {
        text = customMessage || "Airtm Monitor Pro: This is a test message!";
    } else {
        text = `🔔 *New Airtm Offer!*

`;
        text += `*Payment Method:* ${offer.paymentMethod || 'N/A'}
`;
        text += `*Amount:* ${offer.amount} ${offer.currency || 'USDC'}
`;
        if (settings.usdToEgpRate && offer.currency && (offer.currency.toUpperCase() === 'USDC' || offer.currency.toUpperCase() === 'USD')) {
            const egpAmount = (offer.amount * settings.usdToEgpRate).toFixed(2);
            text += `*Estimated Price:* ${egpAmount} EGP
`;
        }
        text += `
Offer ID (Internal): ...${offer.id.slice(-6)}`; // Shortened ID for display
    }

    const telegramApiUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    const messagePayload = {
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown",
        reply_markup: (isTest || !offer) ? null : { // No buttons for test or system messages
            inline_keyboard: [
                [
                    { text: "Accept Manually (Remote)", callback_data: `accept_offer_${offer.id}` },
                    { text: "Ignore", callback_data: `ignore_offer_${offer.id}` }
                ]
            ]
        }
    };

    try {
        const response = await fetch(telegramApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(messagePayload)
        });
        const responseData = await response.json();
        if (responseData.ok) {
            // console.log("Airtm Monitor Pro: Telegram message sent successfully.", responseData);
            if (!isTest && offer) { // Add to processed only for actual offer notifications
                processedOfferIds.add(offer.id);
            }
            return { success: true, detail: "Message sent.", data: responseData };
        } else {
            console.error("Airtm Monitor Pro: Error sending Telegram message:", responseData);
            return { success: false, detail: responseData.description || "Unknown Telegram API error.", data: responseData };
        }
    } catch (error) {
        console.error("Airtm Monitor Pro: Network/other error sending Telegram message:", error);
        return { success: false, detail: error.message || "Network error." };
    }
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // console.log("Airtm Monitor Pro: Message received in background:", message, "from:", sender.tab ? "CS" : "Popup/Self");
    lastCheckTime = new Date().toLocaleTimeString();

    if (message.type === "NEW_OFFERS") {
        offersDetectedThisSession += message.data.length;
        const newOffers = message.data;
        // console.log(`Airtm Monitor Pro: Received ${newOffers.length} new offers from content script.`);

        (async () => { // Process offers asynchronously
            let notifiedCount = 0;
            for (const offer of newOffers) {
                if (processedOfferIds.has(offer.id)) continue; // Skip if already handled by any means

                // Attempt auto-accept first for any offer that meets basic criteria
                // (filterOffersForNotification is not called before this for auto-accept)
                const autoAccepted = await tryAutoAccept(offer);

                if (autoAccepted) { // If auto-accept was attempted (successful or not, it's "handled")
                    // The tryAutoAccept function and processAcceptOfferCommand handle their own notifications.
                    // processedOfferIds.add(offer.id) is handled within tryAutoAccept/processAcceptOfferCommand.
                    notifiedCount++; // Count it as processed for response
                    continue; // Move to next offer
                }

                // If not auto-accepted, check against standard notification filters
                if (filterOffersForNotification([offer]).length > 0) { // filterOffersForNotification expects an array
                    // console.log(`Airtm Monitor Pro: Offer ${offer.id} passed notification filters.`);
                    if (settings.chromeNotifications) sendChromeNotification(offer); // Adds to processedOfferIds if only C.N. is on
                    if (settings.telegramNotifications) await sendTelegramNotification(offer); // Adds to processedOfferIds
                    notifiedCount++;
                }
            }
            sendResponse({ status: "Offers processed", notifiedOrAttemptedCount: notifiedCount });
        })(); // Self-invoking async function to handle promises correctly and use await

        return true; // Indicates asynchronous response for NEW_OFFERS
    }
    else if (message.type === "TEST_TELEGRAM") {
        const { token, chatId, message: testMsg } = message.data;
        const originalToken = settings.telegramToken;
        const originalChatId = settings.telegramChatId;
        settings.telegramToken = token; // Temporarily use provided token/chatId
        settings.telegramChatId = chatId;

        sendTelegramNotification(null, true, testMsg)
            .then(response => sendResponse(response))
            .finally(() => { // Restore original settings
                settings.telegramToken = originalToken;
                settings.telegramChatId = originalChatId;
            });
        return true; // Indicates asynchronous response
    }
    else if (message.type === "GET_MONITORING_STATUS") {
        sendResponse({
            status: "success",
            data: {
                isActive: settings.monitoringActive,
                lastCheckTime: lastCheckTime,
                offersDetectedCount: offersDetectedThisSession
            }
        });
        return false; // Synchronous response
    }
    else if (message.action === "SCAN_OFFERS" && sender.tab) {
        // console.log("Airtm Monitor Pro: Content script acknowledged scan request:", message);
        sendResponse({ status: "Scan signal acknowledged." });
        return false; // Synchronous response
    }
    // Default: return false if not sending an async response.
    // Explicitly returning true only for async paths like NEW_OFFERS and TEST_TELEGRAM.
    return false;
});


chrome.notifications.onClicked.addListener((notificationId) => {
    // console.log("Airtm Monitor Pro: Notification clicked:", notificationId);
    chrome.tabs.query({ url: "https://app.airtm.com/*" }, (tabs) => {
        if (tabs && tabs.length > 0) {
            const airtmTab = tabs.find(tab => tab.url && tab.url.includes("app.airtm.com/peer-transfers/available")) || tabs[0];
            if (airtmTab && airtmTab.id) {
                 chrome.tabs.update(airtmTab.id, { active: true });
                 chrome.windows.update(airtmTab.windowId, { focused: true });
            } else { // Fallback if tab ID is somehow not available
                chrome.tabs.create({ url: "https://app.airtm.com/peer-transfers/available" });
            }
        } else {
            chrome.tabs.create({ url: "https://app.airtm.com/peer-transfers/available" });
        }
    });
    chrome.notifications.clear(notificationId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REMOTE_COMMAND_POLL_ALARM) {
        pollForCommands();
    }
    // Example for another alarm (currently commented out in setup)
    // else if (alarm.name === "airtmMonitorAlarm" && settings.monitoringActive) {
    //     console.log("Airtm Monitor Pro: airtmMonitorAlarm triggered...");
    // }
});

console.log("Airtm Monitor Pro: Background Service Worker Initialized.");
