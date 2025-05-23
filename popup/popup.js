// popup/popup.js
document.addEventListener('DOMContentLoaded', () => {
    const settingsToSave = [
        'monitoringActive', 'telegramToken', 'telegramChatId',
        'minAmount', 'maxAmount', 'paymentMethods', 'usdToEgpRate',
        'manualBalance', 'chromeNotifications', 'telegramNotifications', 'autoAcceptEnabled',
        'botServerUrl', 'userIdForPolling', 'pollingInterval' // <-- Add these
    ];

    // Tab functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            const tabName = button.getAttribute('data-tab');
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === tabName) {
                    content.classList.add('active');
                    // If diagnostics tab is now active, load logs
                    if (tabName === 'diagnostics') {
                        loadDiagnosticLogs();
                    }
                }
            });
        });
    });

    // New function to load and display logs
    function loadDiagnosticLogs() {
        const diagLogOutput = document.getElementById('diagLogOutput');
        if (!diagLogOutput) return;

        chrome.runtime.sendMessage({ type: "GET_DIAGNOSTIC_LOGS" }, (response) => {
            if (chrome.runtime.lastError) {
                diagLogOutput.value = "Error loading logs: " + chrome.runtime.lastError.message;
                console.error("Popup: Error getting diagnostic logs:", chrome.runtime.lastError.message);
            } else if (response && response.success) {
                diagLogOutput.value = response.data.join('\n');
            } else {
                diagLogOutput.value = "Failed to load logs. Response: " + JSON.stringify(response);
            }
        });
    }


    // Load settings
    chrome.storage.local.get(settingsToSave, (result) => {
        if (chrome.runtime.lastError) {
            console.error("Popup: Error loading settings:", chrome.runtime.lastError.message);
            displaySaveStatus("Error loading settings.", false);
            return;
        }
        document.getElementById('monitoringActive').checked = result.monitoringActive || false;
        document.getElementById('telegramToken').value = result.telegramToken || '';
        document.getElementById('telegramChatId').value = result.telegramChatId || '';
        document.getElementById('minAmount').value = result.minAmount || '';
        document.getElementById('maxAmount').value = result.maxAmount || '';
        document.getElementById('paymentMethods').value = result.paymentMethods || '';
        document.getElementById('usdToEgpRate').value = result.usdToEgpRate || '';
        document.getElementById('manualBalance').value = result.manualBalance || '';
        document.getElementById('chromeNotifications').checked = result.chromeNotifications !== undefined ? result.chromeNotifications : true;
        document.getElementById('telegramNotifications').checked = result.telegramNotifications !== undefined ? result.telegramNotifications : true;
        document.getElementById('autoAcceptEnabled').checked = result.autoAcceptEnabled || false;
        document.getElementById('botServerUrl').value = result.botServerUrl || '';
        document.getElementById('userIdForPolling').value = result.userIdForPolling || '';
        document.getElementById('pollingInterval').value = result.pollingInterval || 30; // Default to 30 seconds

        updateMonitoringStatusDisplay(result.monitoringActive);
    });

    // Save settings
    document.getElementById('saveSettings').addEventListener('click', () => {
        const settings = {
            monitoringActive: document.getElementById('monitoringActive').checked,
            telegramToken: document.getElementById('telegramToken').value.trim(),
            telegramChatId: document.getElementById('telegramChatId').value.trim(),
            minAmount: parseFloat(document.getElementById('minAmount').value) || 0,
            maxAmount: parseFloat(document.getElementById('maxAmount').value) || Infinity,
            paymentMethods: document.getElementById('paymentMethods').value.trim(),
            usdToEgpRate: parseFloat(document.getElementById('usdToEgpRate').value) || 0,
            manualBalance: parseFloat(document.getElementById('manualBalance').value) || 0,
            chromeNotifications: document.getElementById('chromeNotifications').checked,
            telegramNotifications: document.getElementById('telegramNotifications').checked,
            autoAcceptEnabled: document.getElementById('autoAcceptEnabled').checked,
            botServerUrl: document.getElementById('botServerUrl').value.trim(),
            userIdForPolling: document.getElementById('userIdForPolling').value.trim(),
            pollingInterval: parseInt(document.getElementById('pollingInterval').value, 10) || 30,
        };
        if (settings.pollingInterval < 15) settings.pollingInterval = 15;


        chrome.storage.local.set(settings, () => {
            if (chrome.runtime.lastError) {
                console.error("Popup: Error saving settings:", chrome.runtime.lastError.message);
                displaySaveStatus("Error saving settings! " + chrome.runtime.lastError.message, false);
            } else {
                console.log("Popup: Settings saved successfully.");
                displaySaveStatus("Settings saved successfully!", true);
                updateMonitoringStatusDisplay(settings.monitoringActive);
            }
        });
    });

    // Test Telegram button
    document.getElementById('testTelegram').addEventListener('click', () => {
        const token = document.getElementById('telegramToken').value.trim();
        const chatId = document.getElementById('telegramChatId').value.trim();
        const resultP = document.getElementById('telegramTestResult');

        if (!token || !chatId) {
            resultP.textContent = "Token and Chat ID are required.";
            resultP.style.color = "red";
            return;
        }
        resultP.textContent = "Testing...";
        resultP.style.color = "orange";

        // This is a simplified test. A real test should come from the background script
        // which has host permissions for api.telegram.org.
        // We can send a message to background script to perform the actual test.
        chrome.runtime.sendMessage(
            {
                type: "TEST_TELEGRAM",
                data: { token, chatId, message: "Airtm Monitor Pro: Telegram test successful!" }
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Popup: Error sending test message to background:", chrome.runtime.lastError.message);
                    resultP.textContent = "Error initiating test: " + chrome.runtime.lastError.message;
                    resultP.style.color = "red";
                    return;
                }
                if (response) {
                    if (response.success) {
                        resultP.textContent = "Test message sent! Check Telegram. (" + (response.detail || "Status OK") + ")";
                        resultP.style.color = "green";
                    } else {
                        resultP.textContent = "Failed to send: " + (response.detail || "Unknown error");
                        resultP.style.color = "red";
                    }
                } else {
                     resultP.textContent = "No response from background script for Telegram test.";
                     resultP.style.color = "red";
                }
            }
        );
    });

    // Scan Now button
    const scanNowButton = document.getElementById('scanNow');
    if(scanNowButton) {
        scanNowButton.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const currentTab = tabs[0];
                if (currentTab && currentTab.url && currentTab.url.includes("app.airtm.com/peer-transfers/available")) {
                    chrome.scripting.executeScript({
                        target: { tabId: currentTab.id },
                        function: () => {
                            // This function is executed in the content script's context
                            // We need to ensure the content script has a way to receive a "scan now" command
                            // or that its `scrapeOffers` function is globally accessible (less ideal).
                            // For now, let's assume the content script's message listener handles "SCAN_OFFERS"
                            chrome.runtime.sendMessage({ action: "SCAN_OFFERS" }, response => {
                                console.log("Scan request sent from popup, response:", response);
                            });
                        }
                    }, () => {
                         if (chrome.runtime.lastError) {
                            console.error("Popup: Error triggering scan via scripting:", chrome.runtime.lastError.message);
                            alert("Error triggering scan. Ensure you are on the Airtm offers page.");
                        } else {
                            console.log("Popup: Scan Now command sent to content script.");
                            alert("Scan initiated! Check the console for details.");
                        }
                    });
                } else {
                    alert("Please navigate to the Airtm 'Available Peer Transfers' page to scan.");
                }
            });
        });
    }


    // Helper to display save status
    function displaySaveStatus(message, success) {
        const statusEl = document.getElementById('saveStatus');
        statusEl.textContent = message;
        statusEl.className = 'status-message ' + (success ? 'success' : 'error');
        setTimeout(() => {
            statusEl.textContent = '';
            statusEl.className = 'status-message';
        }, 3000);
    }

    // Update monitoring status display
    function updateMonitoringStatusDisplay(isActive) {
        const statusTextEl = document.getElementById('monitoringStatusText');
        if (statusTextEl) {
            statusTextEl.textContent = isActive ? 'Active' : 'Inactive';
            statusTextEl.style.color = isActive ? 'green' : 'red';
        }
    }

    // Listener for monitoring status changes from background (if needed)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === "MONITORING_STATUS_UPDATE") {
            updateMonitoringStatusDisplay(message.data.isActive);
            if(document.getElementById('lastCheckTime')) {
                document.getElementById('lastCheckTime').textContent = message.data.lastCheckTime || 'N/A';
            }
            if(document.getElementById('offersDetectedCount')) {
                document.getElementById('offersDetectedCount').textContent = message.data.offersDetectedCount || '0';
            }
        } else if (message.type === "DIAGNOSTIC_LOG_UPDATE") { // Added for real-time log updates
            const diagLogOutput = document.getElementById('diagLogOutput');
            const diagnosticsTab = document.getElementById('diagnostics');
            if (diagLogOutput && diagnosticsTab && diagnosticsTab.classList.contains('active')) {
                diagLogOutput.value = message.data.join('\n');
            }
        }
        // sendResponse({}); // Acknowledge message if needed, or handle specific returns
        return true; // Keep true for potential async responses in other handlers
    });

    // Request initial status from background when popup opens
    chrome.runtime.sendMessage({ type: "GET_MONITORING_STATUS" }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn("Popup: Could not get initial monitoring status from background:", chrome.runtime.lastError.message);
        } else if (response && response.status === "success") {
            updateMonitoringStatusDisplay(response.data.isActive);
            if(document.getElementById('lastCheckTime')) {
                document.getElementById('lastCheckTime').textContent = response.data.lastCheckTime || 'N/A';
            }
            if(document.getElementById('offersDetectedCount')) {
                document.getElementById('offersDetectedCount').textContent = response.data.offersDetectedCount || '0';
            }
        }
    });

    // Placeholder for Diagnostics
    const diagLogOutput = document.getElementById('diagLogOutput');
    if (diagLogOutput) {
        // Initial load if diagnostics tab is default active or becomes active
        // diagLogOutput.value = "Loading logs..."; // Placeholder while loading
    }

    const clearDiagLog = document.getElementById('clearDiagLog');
    if (clearDiagLog) {
        clearDiagLog.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: "CLEAR_DIAGNOSTIC_LOGS" }, (response) => {
                if (chrome.runtime.lastError) {
                    alert("Error clearing logs: " + chrome.runtime.lastError.message);
                    console.error("Popup: Error clearing diagnostic logs:", chrome.runtime.lastError.message);
                } else if (response && response.success) {
                    if(diagLogOutput) diagLogOutput.value = "Logs cleared by request.\n"; // Show immediate feedback
                    loadDiagnosticLogs(); // Reload to confirm and show any new "cleared" log entry from background
                } else {
                    alert("Failed to clear logs. Response: " + JSON.stringify(response));
                }
            });
        });
    }

    const exportDebugInfo = document.getElementById('exportDebugInfo');
    if(exportDebugInfo) {
        exportDebugInfo.addEventListener('click', () => {
            chrome.storage.local.get(null, (allSettings) => {
                const debugInfo = {
                    timestamp: new Date().toISOString(),
                    settings: allSettings,
                    logs: diagLogOutput ? diagLogOutput.value : "No logs available in textarea.",
                    userAgent: navigator.userAgent,
                    extensionVersion: chrome.runtime.getManifest().version
                };
                const blob = new Blob([JSON.stringify(debugInfo, null, 2)], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `airtm_monitor_debug_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        });
    }

    // Initial log load if diagnostics tab is active on popup open
    const initialActiveTabButton = document.querySelector('.tab-button.active');
    if (initialActiveTabButton && initialActiveTabButton.getAttribute('data-tab') === 'diagnostics') {
       loadDiagnosticLogs();
    }
});
