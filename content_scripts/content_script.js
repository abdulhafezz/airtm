// content_scripts/content_script.js
console.log("Airtm Monitor Pro: Content Script Loaded");

/**
 * Attempts to dynamically identify the payment method from an offer element.
 * This is a placeholder and needs to be implemented based on Airtm page structure.
 * @param {Element} offerElement - The HTML element representing a single offer.
 * @returns {string|null} The identified payment method string or null.
 */
function identifyPaymentMethod(offerElement) {
    // TODO: Developer to implement sophisticated payment method detection.
    // This is a critical part based on findings from Step 2 (Manual Page Analysis).

    // Approach 1: Try specific, known selectors first (if some are reliable)
    // const specificSelector = offerElement.querySelector('.payment-method-class'); // Replace with actual selector
    // if (specificSelector && specificSelector.textContent.trim()) {
    //     return specificSelector.textContent.trim();
    // }

    // Approach 2: Keyword analysis in a broader text area of the offer
    // const textToAnalyze = offerElement.querySelector('.offer-description-area')?.textContent.toLowerCase() || ""; // Replace
    // if (textToAnalyze) {
    //     if (textToAnalyze.includes("vodafone cash")) return "Vodafone Cash";
    //     if (textToAnalyze.includes("instapay")) return "InstaPay";
    //     if (textToAnalyze.includes("bank transfer") || textToAnalyze.includes("تحويل بنكي")) return "Bank Transfer";
    //     // Add more keywords and known payment methods from your research (Step 10)
    // }

    // Approach 3: Look for image indicators (src or alt text)
    // const paymentIcon = offerElement.querySelector('.payment-icon-selector img'); // Replace
    // if (paymentIcon) {
    //     const iconSrc = paymentIcon.src.toLowerCase();
    //     const iconAlt = paymentIcon.alt.toLowerCase();
    //     if (iconSrc.includes('vodafone_logo') || iconAlt.includes('vodafone')) return "Vodafone Cash";
    //     if (iconSrc.includes('instapay_logo') || iconAlt.includes('instapay')) return "InstaPay";
    //     // ... more image checks
    // }

    // Approach 4: Heuristics based on structure or surrounding elements
    // e.g., if payment method is always the text in the second `<span>` of a specific `<div>`
    // const potentialElements = offerElement.querySelectorAll('.some-consistent-parent span');
    // if (potentialElements && potentialElements.length > 1) {
    //     const paymentText = potentialElements[1].textContent.trim();
    //     // You might need further validation on paymentText here
    //     if (paymentText) return paymentText;
    // }

    // Fallback: Try a generic selector if nothing specific matched
    const genericSelector = offerElement.querySelector('.payment-method-fallback'); // Replace with a less specific, common selector
    if (genericSelector && genericSelector.textContent.trim()) {
        console.warn("Airtm Monitor Pro: Payment method identified using fallback selector for offer:", offerElement, "Method:", genericSelector.textContent.trim());
        return genericSelector.textContent.trim();
    }
    
    console.warn("Airtm Monitor Pro: Could not identify payment method for offer:", offerElement);
    return null; // Or a default like "Unknown"
}


/**
 * Scrapes the Airtm page for available offers.
 */
function scrapeOffers() {
    console.log("Airtm Monitor Pro: Scraping offers...");
    addContentScriptLog("Scraping offers initiated."); // Example of internal logging
    const offers = [];
    
    // TODO: Developer needs to implement the logic to find offer elements
    // This selector is a placeholder and MUST be updated based on Airtm's actual HTML.
    const offerElements = document.querySelectorAll('.transaction-row-class-placeholder'); // Replace this!

    if (offerElements.length === 0) {
        addContentScriptLog("No offer elements found with the current selector.");
    }

    offerElements.forEach((offerElement, index) => {
        try {
            const paymentMethod = identifyPaymentMethod(offerElement); // Call the new function

            // TODO: Replace these selectors with actual ones from your page analysis
            const amountText = offerElement.querySelector('.amount-selector')?.textContent || ""; // Placeholder
            const currencyText = offerElement.querySelector('.currency-selector')?.textContent || "USDC"; // Placeholder
            const offerIdFromElement = offerElement.dataset.offerId || `generated_${Date.now()}_${index}`; // Placeholder for unique ID

            const amount = parseFloat(amountText.replace(/[^0-9.-]+/g, ""));

            if (paymentMethod && !isNaN(amount) && amount > 0) {
                const offer = {
                    id: offerIdFromElement, // Ensure this ID is unique and preferably stable if possible
                    paymentMethod: paymentMethod,
                    amount: amount,
                    currency: currencyText.trim(),
                    // Add other relevant details: rate, user, original HTML for debug, etc.
                    // e.g., rawHTML: offerElement.innerHTML (for debugging unrecognized methods)
                };
                offers.push(offer);
            } else {
                 addContentScriptLog(`Failed to parse critical info for an offer element. PM: ${paymentMethod}, Amount: ${amountText}`, "WARN");
            }
        } catch (e) {
            console.error("Airtm Monitor Pro: Error parsing an offer:", e, offerElement);
            addContentScriptLog(`Exception during offer parsing: ${e.message}`, "ERROR");
        }
    });

    if (offers.length > 0) {
        // console.log(`Airtm Monitor Pro: Found ${offers.length} offers.`, offers);
        addContentScriptLog(`Found ${offers.length} valid offers. Sending to background.`);
        chrome.runtime.sendMessage({ type: "NEW_OFFERS", data: offers }, response => {
            if (chrome.runtime.lastError) {
                console.error("Airtm Monitor Pro: Error sending offers to background:", chrome.runtime.lastError.message);
                addContentScriptLog(`Error sending offers to background: ${chrome.runtime.lastError.message}`, "ERROR");
            } else {
                // console.log("Airtm Monitor Pro: Offers sent to background script.", response);
            }
        });
    }
    return offers;
}

/**
 * Attempts to click the "Accept" button for a given offer.
 * @param {string} offerId - An identifier for the offer to accept.
 */
function acceptOffer(offerId) {
    // TODO: Developer needs to implement logic to find the specific offer element
    // (e.g., using its offerId if it's stored as a data attribute or found in its structure)
    // and then find its corresponding "Accept" button to click.
    console.log(`Airtm Monitor Pro: Attempting to accept offer ${offerId}...`);
    addContentScriptLog(`Attempting to accept offer ${offerId}...`, "ACTION");

    // Example:
    // const offerElement = document.querySelector(`[data-offer-id="${offerId}"]`); // Assuming offerId is in a data attribute
    // if (offerElement) {
    //     const acceptButton = offerElement.querySelector('.accept-button-selector'); // Replace with actual selector
    //     if (acceptButton && !acceptButton.disabled) {
    //         acceptButton.click();
    //         console.log(`Airtm Monitor Pro: "Accept" button clicked for offer ${offerId}`);
    //         addContentScriptLog(`"Accept" button clicked for offer ${offerId}`, "SUCCESS");
    //         return { success: true, detail: "Accept button clicked." };
    //     } else {
    //         console.warn(`Airtm Monitor Pro: "Accept" button not found or disabled for offer ${offerId}`);
    //         addContentScriptLog(`"Accept" button not found/disabled for ${offerId}`, "WARN");
    //         return { success: false, detail: "Accept button not found or disabled." };
    //     }
    // } else {
    //     console.warn(`Airtm Monitor Pro: Could not find offer element for ID ${offerId}`);
    //     addContentScriptLog(`Could not find offer element for ID ${offerId}`, "WARN");
    //     return { success: false, detail: "Offer element not found." };
    // }
    alert(`Content Script: SIMULATING ACCEPTANCE of offer ${offerId}. Implement actual click logic!`);
    return { success: true, detail: "Simulated click. Implement actual logic." }; // Placeholder
}

/**
 * Observes the page for dynamically added offers.
 */
function observeOfferChanges() {
    // TODO: Developer should implement a MutationObserver if offers are loaded dynamically
    // without a full page reload. This is essential for continuous monitoring.
    // console.log("Airtm Monitor Pro: Setting up MutationObserver (placeholder)...");
    // addContentScriptLog("MutationObserver setup (placeholder). Needs implementation.");

    // const targetNode = document.querySelector('#offers-container-selector'); // Replace with actual container selector
    // if (!targetNode) {
    //     console.warn("Airtm Monitor Pro: Offers container not found for MutationObserver.");
    //     addContentScriptLog("Offers container for MutationObserver not found.", "WARN");
    //     return;
    // }
    // const config = { childList: true, subtree: true }; // Adjust config as needed
    // const callback = function(mutationsList, observer) {
    //     let newOffersFound = false;
    //     for(const mutation of mutationsList) {
    //         if (mutation.type === 'childList') {
    //             // Check mutation.addedNodes for actual new offer elements
    //             // This logic needs to be specific to how Airtm adds new offers.
    //             // It's important to avoid re-processing existing offers.
    //             // A simple scrapeOffers() here might be inefficient if many nodes change.
    //             // Better to check if addedNodes contain actual offer elements.
    //             // e.g. Array.from(mutation.addedNodes).some(node => node.matches('.transaction-row-class-placeholder'))
    //             newOffersFound = true; // Placeholder, refine this detection
    //         }
    //     }
    //     if (newOffersFound) {
    //         console.log("Airtm Monitor Pro: Potential new offers detected by MutationObserver. Re-scraping.");
    //         addContentScriptLog("MutationObserver detected changes. Re-scraping.", "INFO");
    //         scrapeOffers();
    //     }
    // };
    // const observer = new MutationObserver(callback);
    // observer.observe(targetNode, config);
    // console.log("Airtm Monitor Pro: MutationObserver is active (placeholder).");
}

// Simple logging function for content script (optional, for internal diagnostics if needed)
// This could be expanded to send logs to background script for central storage if Step 8 was complete.
function addContentScriptLog(message, level = "INFO") {
    console.log(`[CS LOG][${level}] ${message}`);
}

// Main logic for content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // console.log("Airtm Monitor Pro: Message received in content script:", message);
    addContentScriptLog(`Message received: ${JSON.stringify(message)}`, "MSG_IN");
    if (message.action === "ACCEPT_OFFER") {
        const result = acceptOffer(message.offerId);
        sendResponse(result);
    } else if (message.action === "SCAN_OFFERS") {
        const offers = scrapeOffers();
        sendResponse({ status: "Offers scanned from content script.", count: offers.length });
    }
    return true; // Indicates that the response will be sent asynchronously for ACCEPT_OFFER or if scrapeOffers becomes async.
});

// Initial scrape and observer setup
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        addContentScriptLog("DOM fully loaded and parsed. Initializing scan and observer.");
        scrapeOffers();
        observeOfferChanges();
    });
} else {
    addContentScriptLog("DOM already loaded. Initializing scan and observer.");
    scrapeOffers();
    observeOfferChanges();
}

addContentScriptLog("Content Script Initialized and Ready.");
console.log("Airtm Monitor Pro: Content Script Initialized.");
