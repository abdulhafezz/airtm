// content.js - AIRTM CASHIER Advanced Edition

// Constants
const LOG_PREFIX = '[AIRTM CASHIER]';

// Logging utilities
function logInfo(...args) { console.info(LOG_PREFIX, ...args); }
function logWarn(...args) { console.warn(LOG_PREFIX, ...args); }
function logError(...args) { console.error(LOG_PREFIX, ...args); }

// Configuration
const CONFIG = {
    OFFER_CHECK_INTERVAL_MS: 5000,
    SELECTOR_STRATEGIES: [
        // Primary strategy for new peer-transfers page (mobile view)
        // This strategy targets the mobile-specific row structure.
        {
            container: 'div.section__content', // Main content area that includes the table
            offers: 'tr.card.card-p2p--mobile.card__body', // Each mobile offer is a <tr> with this class
            // Selectors below are relative to the 'offers' element (the <tr>)
            transactionType: '.card-p2p--mobile__header .card-p2p--mobile__transaction-type', // Gets "Add funds"
            date: '.card-p2p--mobile__header .card-p2p--mobile__date', // Gets "May 22, 2025 9:27 PM"
            paymentMethod: '.card-p2p--mobile__method .card-p2p--mobile__method-category', // Gets "InstaPay"
            // The JS logic for 'amount' iterates these; it should find the USDC one.
            amount: '.card-p2p--mobile__transaction-amount .card-p2p--mobile__amount',
            // The JS logic for 'rate' needs to parse text like "$1 USDC = £48.8349 EGP".
            // Consider updating the regex in extractDataFromPeerTransfersMobile.
            rate: '.card-p2p--mobile__transaction-amount .text--xs',
            // The 'username' selector points to a container; JS parses its textContent.
            username: '.card-p2p--mobile__peer .card-p2p--mobile__peer-info',
            rating: '.card-p2p--mobile__peer .user-thumb__verified', // Checks for the verified badge
        },
        // Alternative strategy for new peer-transfers page (table/desktop view)
        // This strategy targets the desktop-specific row structure.
        {
            container: 'div.section__content table.table-v2.card-p2p-list', // The table itself
            offers: 'tbody tr.card.card-p2p.card__body:not(.card-p2p--mobile)', // Desktop rows, ensuring not to pick mobile if it also matches partially
            // Selectors below are relative to the 'offers' element (the <tr>)
            transactionType: 'td:nth-child(1) .card-p2p__transaction-type .font-weight--bold', // Gets "Add"
            paymentMethod: 'td:nth-child(2) .card-p2p__method .card-p2p__method-category', // Gets "InstaPay"
            // The JS logic for 'amount' iterates these; it should find the USDC one.
            amount: 'td:nth-child(3) .card-p2p__amount-wrap .card-p2p__amount',
            // The JS logic for 'rate' needs to parse text like "$1 USDC = £48.8349 EGP".
            // Consider updating the regex in extractDataFromPeerTransfersTable.
            rate: 'td:nth-child(4) .text--base',
            username: 'td:nth-child(5) .card-p2p__peer .font-weight--bold', // Gets "عمر ع."
            rating: 'td:nth-child(5) .card-p2p__peer .user-thumb__verified', // Checks for the verified badge
            date: 'td:nth-child(6) .card-p2p__date-wrap', // Contains date and time divs
        },
        // Legacy strategy for cashier-board (fallback)
        {
            container: '.cashier-board-container',
            offers: '.offer-item',
            amount: '.offer-amount',
            rate: '.offer-rate',
            username: '.offer-username',
            rating: '.user-rating',
            paymentMethod: '.payment-method'
        },
        // Alternative legacy strategy (fallback)
        {
            container: '.cashier-board',
            offers: '.offer',
            amount: '.amount',
            rate: '.rate',
            username: '.username',
            rating: '.rating',
            paymentMethod: '.payment-method'
        }
    ]
};

// State
let isMonitoring = false;
let checkInterval = null;
let processedOfferIds = new Set();
const MAX_PROCESSED_IDS = 500; // Limit memory usage

// Initialize content script
function initialize() {
    logInfo('Content script initialized on', window.location.href);
    
    // Run on both old and new Airtm pages
    if (window.location.href.includes('airtm.com') && 
        (window.location.href.includes('cashier-board') || 
         window.location.href.includes('cashier') ||
         window.location.href.includes('peer-transfers'))) {
        
        startMonitoring();
    }
}

// Start monitoring for offers
function startMonitoring() {
    if (isMonitoring) return;
    
    logInfo('Starting offer monitoring');
    isMonitoring = true;
    
    // Check immediately
    checkForNewOffers();
    
    // Then set interval
    checkInterval = setInterval(checkForNewOffers, CONFIG.OFFER_CHECK_INTERVAL_MS);
    
    // Listen for page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

// Stop monitoring
function stopMonitoring() {
    if (!isMonitoring) return;
    
    logInfo('Stopping offer monitoring');
    isMonitoring = false;
    
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
    
    document.removeEventListener('visibilitychange', handleVisibilityChange);
}

// Handle page visibility changes
function handleVisibilityChange() {
    if (document.hidden) {
        // Page is hidden, pause interval to save resources
        if (checkInterval) {
            clearInterval(checkInterval);
            checkInterval = null;
        }
    } else {
        // Page is visible again, resume checking
        if (!checkInterval && isMonitoring) {
            checkForNewOffers();
            checkInterval = setInterval(checkForNewOffers, CONFIG.OFFER_CHECK_INTERVAL_MS);
        }
    }
}

// Check for new offers
function checkForNewOffers() {
    try {
        // Try each selector strategy until one works
        for (const strategy of CONFIG.SELECTOR_STRATEGIES) {
            const container = document.querySelector(strategy.container);
            if (!container) continue;
            
            const offerElements = container.querySelectorAll(strategy.offers);
            if (!offerElements || offerElements.length === 0) continue;
            
            logInfo(`Found ${offerElements.length} offers using strategy with container: ${strategy.container}`);
            
            // Process offers with this strategy
            processOffers(offerElements, strategy);
            return; // Exit after first successful strategy
        }
        
        logWarn('No offers found with any selector strategy');
    } catch (error) {
        logError('Error checking for offers:', error);
    }
}

// Process offer elements
function processOffers(offerElements, strategy) {
    for (const offerElement of offerElements) {
        try {
            // Generate a unique ID for this offer
            const offerId = generateOfferId(offerElement);
            
            // Skip if already processed
            if (processedOfferIds.has(offerId)) continue;
            
            // Extract offer data
            const offerData = extractOfferData(offerElement, strategy);
            if (!offerData) {
                // logWarn('Failed to extract offer data or offer type not processed for ID:', offerId);
                continue;
            }
            
            // Add ID to processed set
            processedOfferIds.add(offerId);
            
            // Limit the size of processed IDs set to prevent memory leaks
            if (processedOfferIds.size > MAX_PROCESSED_IDS) {
                const iterator = processedOfferIds.values();
                processedOfferIds.delete(iterator.next().value);
            }
            
            // Send offer to background script
            sendOfferToBackground({
                id: offerId,
                ...offerData
            });
            
        } catch (error) {
            logError('Error processing offer:', error, offerElement);
        }
    }
}

// Generate a unique ID for an offer
function generateOfferId(offerElement) {
    // Use a combination of content and position for uniqueness
    const text = offerElement.textContent.trim().slice(0, 200); // Limit text length
    const rect = offerElement.getBoundingClientRect();
    // Using a more stable part of the HTML structure if available, or a simpler hash.
    // For example, an action button's data-testid if present and unique per offer.
    let uniquePart = offerElement.querySelector('[data-testid$="-action"]')?.getAttribute('data-testid') || '';
    if (!uniquePart) {
      // Fallback to a simpler content hash if specific unique ID isn't found
      uniquePart = text.substring(0, 50); // Use a small part of text
    }

    return hashString(`${uniquePart}-${rect.top}-${rect.left}`);
}

// Simple string hashing function
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36); // Convert to base36 for shorter string
}

// Extract offer data from element
function extractOfferData(offerElement, strategy) {
    try {
        // Determine if it's mobile or desktop strategy based on a unique selector if possible
        // For now, we rely on the order of strategies and the container selector
        if (strategy.offers.includes('card-p2p--mobile')) {
             // NOTE: The current JS logic filters for "Withdraw" type transactions.
            // If you want to process "Add funds" (as in your example), this logic needs adjustment.
            // Example: `if (!transactionType.toLowerCase().includes('add')) return null;`
            return extractDataFromPeerTransfersMobile(offerElement, strategy);
        } else if (strategy.offers.includes('card-p2p.card__body')) {
            return extractDataFromPeerTransfersTable(offerElement, strategy);
        }
        
        // For legacy cashier-board
        return extractDataFromLegacyCashierBoard(offerElement, strategy);
    } catch (error) {
        logError('Error in extractOfferData:', error, offerElement);
        return null;
    }
}

// Extract data from new peer-transfers page (mobile view)
function extractDataFromPeerTransfersMobile(offerElement, strategy) {
    const transactionTypeElement = offerElement.querySelector(strategy.transactionType);
    const transactionType = transactionTypeElement ? transactionTypeElement.textContent.trim() : '';
    
    // DEVELOPER NOTE: The original code filters for 'Withdraw'.
    // If you want to process "Add funds" (like in the example HTML),
    // you might need to change this condition, e.g., to:
    // if (!transactionType.toLowerCase().includes('add')) {
    //     logInfo('Skipping non-add funds transaction (mobile):', transactionType);
    //     return null;
    // }
    // For now, keeping original logic which might skip "Add funds":
    if (transactionType && !transactionType.toLowerCase().includes('add funds') && !transactionType.toLowerCase().includes('add')) { // Adjusted to be more inclusive of "Add"
        logInfo('Skipping non-add transaction (mobile):', transactionType);
        return null;
    }
    
    const paymentMethodElement = offerElement.querySelector(strategy.paymentMethod);
    const paymentMethod = paymentMethodElement ? paymentMethodElement.textContent.trim() : 'Unknown';
    
    const amountElements = offerElement.querySelectorAll(strategy.amount);
    let amountText = '';
    let amount = 0;
    
    for (const el of amountElements) {
        const text = el.textContent.trim();
        if (text.includes('USDC')) {
            amountText = text;
            amount = parseFloat(text.replace(/[^\d.]/g, ''));
            break;
        }
    }
    
    if (!amount) {
        logWarn('Could not extract amount from mobile offer:', offerElement);
        return null;
    }
    
    const rateElement = offerElement.querySelector(strategy.rate);
    let rate = 0;
    if (rateElement) {
        const rateTextContent = rateElement.textContent.trim();
        // DEVELOPER NOTE: Original regex was / \$([0-9.]+) USD /.
        // Updated to match "£X.XXXX EGP" or similar based on example.
        const rateMatch = rateTextContent.match(/\$1\s*USDC\s*=\s*([£$€]?)([0-9.]+)\s*([A-Z]{3})/i) || rateTextContent.match(/([£$€]?)([0-9.]+)\s*([A-Z]{3})\s*per\s*USDC/i) || rateTextContent.match(/([0-9.]+)/);

        if (rateMatch && rateMatch.length > 1) {
             // Try to get the number, ideally from a group that captures it.
            rate = parseFloat(rateMatch[2] || rateMatch[1]);
        }
        if (isNaN(rate)) rate = 0;
    }
    
    const usernameElement = offerElement.querySelector(strategy.username);
    const username = usernameElement ? usernameElement.textContent.trim().replace(/\s+/g, ' ').split(/\n/)[0] : 'Unknown'; // Take first line
    
    const ratingElement = offerElement.querySelector(strategy.rating);
    const rating = ratingElement ? '5★ (Verified)' : 'N/A';
    
    const dateElement = offerElement.querySelector(strategy.date);
    const dateText = dateElement ? dateElement.textContent.trim() : '';
    
    const total = (amount * (rate || 1)).toFixed(2); // Fallback rate to 1 if not found
    
    return {
        amount,
        rate: rate || 0, // Ensure rate is a number
        total,
        username,
        rating,
        transactionType,
        date: dateText,
        paymentMethod,
        timestamp: Date.now()
    };
}

// Extract data from new peer-transfers page (table view)
function extractDataFromPeerTransfersTable(offerElement, strategy) {
    const transactionTypeElement = offerElement.querySelector(strategy.transactionType);
    const transactionType = transactionTypeElement ? transactionTypeElement.textContent.trim() : '';

    // DEVELOPER NOTE: If you want to process "Add" (like in the example HTML),
    // you might need to adjust this condition.
    if (transactionType && !transactionType.toLowerCase().includes('add')) {
        logInfo('Skipping non-add transaction (table):', transactionType);
        return null;
    }

    const paymentMethodElement = offerElement.querySelector(strategy.paymentMethod);
    const paymentMethod = paymentMethodElement ? paymentMethodElement.textContent.trim() : 'Unknown';
    
    const amountElements = offerElement.querySelectorAll(strategy.amount);
    let amount = 0;
    if (amountElements && amountElements.length > 0) {
        for (const el of amountElements) {
            const text = el.textContent.trim();
            if (text.includes('USDC')) {
                amount = parseFloat(text.replace(/[^\d.]/g, ''));
                break;
            }
        }
    }
     if (!amount) {
        logWarn('Could not extract amount from table offer:', offerElement);
        return null;
    }
    
    const rateElement = offerElement.querySelector(strategy.rate);
    let rate = 0;
    if (rateElement) {
        const rateTextContent = rateElement.textContent.trim();
        // DEVELOPER NOTE: Original parsing was basic.
        // Updated to match "£X.XXXX EGP" or similar based on example.
        const rateMatch = rateTextContent.match(/\$1\s*USDC\s*=\s*([£$€]?)([0-9.]+)\s*([A-Z]{3})/i) || rateTextContent.match(/([£$€]?)([0-9.]+)\s*([A-Z]{3})\s*per\s*USDC/i) || rateTextContent.match(/([0-9.]+)/);
        if (rateMatch && rateMatch.length > 1) {
            rate = parseFloat(rateMatch[2] || rateMatch[1]);
        }
         if (isNaN(rate)) rate = 0;
    }
    
    const usernameElement = offerElement.querySelector(strategy.username);
    const username = usernameElement ? usernameElement.textContent.trim() : 'Unknown';
    
    const ratingElement = offerElement.querySelector(strategy.rating);
    const rating = ratingElement ? '5★ (Verified)' : 'N/A';
    
    const dateElement = offerElement.querySelector(strategy.date);
    const dateText = dateElement ? dateElement.textContent.trim().replace(/\s+/g, ' ') : ''; // Consolidate whitespace
    
    const total = (amount * (rate || 1)).toFixed(2);
    
    return {
        amount,
        rate: rate || 0,
        total,
        username,
        rating,
        transactionType,
        date: dateText,
        paymentMethod,
        timestamp: Date.now()
    };
}

// Extract data from legacy cashier-board
function extractDataFromLegacyCashierBoard(offerElement, strategy) {
    // This function remains as it was, assuming its selectors are still valid for that old page.
    const paymentMethodElement = offerElement.querySelector(strategy.paymentMethod);
    const paymentMethod = paymentMethodElement ? paymentMethodElement.textContent.trim() : 'Unknown';
    
    const amountElement = offerElement.querySelector(strategy.amount);
    if (!amountElement) return null;
    
    const amountText = amountElement.textContent.trim();
    const amount = parseFloat(amountText.replace(/[^\d.]/g, ''));
    
    const rateElement = offerElement.querySelector(strategy.rate);
    const rate = rateElement ? parseFloat(rateElement.textContent.replace(/[^\d.]/g, '')) : 0;
    
    const usernameElement = offerElement.querySelector(strategy.username);
    const username = usernameElement ? usernameElement.textContent.trim() : 'Unknown';
    
    const ratingElement = offerElement.querySelector(strategy.rating);
    const rating = ratingElement ? ratingElement.textContent.trim() : 'N/A';
    
    const total = (amount * (rate || 1)).toFixed(2);
    
    return {
        amount,
        rate,
        total,
        username,
        rating,
        paymentMethod,
        timestamp: Date.now()
    };
}

// Send offer to background script
function sendOfferToBackground(offer) {
    logInfo('New offer detected:', offer);
    
    chrome.runtime.sendMessage({
        action: 'new_offer',
        offer: offer
    }).catch(error => {
        logError('Error sending offer to background:', error);
    });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'stop_monitoring') {
        stopMonitoring();
        sendResponse({ success: true });
        return true;
    }
    
    if (message.action === 'start_monitoring') {
        startMonitoring();
        sendResponse({ success: true });
        return true;
    }
    
    // Debug command to log current page structure
    if (message.action === 'debug_page_structure') {
        logPageStructure();
        sendResponse({ success: true });
        return true;
    }
});

// Debug function to log page structure
function logPageStructure() {
    logInfo('Debugging page structure');
    
    // Log all potential container elements
    CONFIG.SELECTOR_STRATEGIES.forEach(strategy => {
        const container = document.querySelector(strategy.container);
        logInfo(`Container ${strategy.container} exists: ${!!container}`);
        
        if (container) {
            const offers = container.querySelectorAll(strategy.offers);
            logInfo(`Found ${offers.length} offers using ${strategy.offers} in container ${strategy.container}`);
            
            if (offers.length > 0) {
                // Log first offer structure
                const firstOffer = offers[0];
                logInfo('First offer HTML:', firstOffer.outerHTML);
                
                // Try to extract data
                const data = extractOfferData(firstOffer, strategy);
                logInfo('Extracted data:', data);
            }
        }
    });
    
    // Log overall page structure
    logInfo('Page URL:', window.location.href);
    logInfo('Body classes:', document.body.className);
}

// Initialize on load
initialize();

// Also initialize on URL changes (for single-page applications)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        logInfo('URL changed to', url);
        // Clear processed IDs on URL change to re-scan if user navigates back and forth
        processedOfferIds.clear();
        initialize();
    }
}).observe(document, { subtree: true, childList: true });
