// Content script for Zillow Climate Risk Enhancer
(function() {
  'use strict';

  let isProcessing = false;
  let hasProcessedUrl = null;
  let enhancedDataInjected = false;

  // Function to extract First Street URL from Climate risks section
  function findFirstStreetLink() {
    const links = document.querySelectorAll('a[href*="firststreet.org"]');
    for (let link of links) {
      if (link.href.includes('firststreet.org')) {
        return link.href;
      }
    }
    return null;
  }

  // Function to fetch data via background script (to avoid CORS)
  async function fetchFirstStreetData(url) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'fetchFirstStreet', url: url },
        response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error));
          }
        }
      );
    });
  }

  // Get color for severity
  function getSeverityColor(severity) {
    const colors = {
      'extreme': '#dc2626',
      'major': '#ea580c',
      'moderate': '#f59e0b',
      'minor': '#eab308',
      'minimal': '#22c55e',
      'unknown': '#6b7280'
    };
    return colors[severity] || colors.unknown;
  }

  // Create and inject enhanced climate section
  function injectClimateData(data, firstStreetUrl) {
    // Find existing climate section or create new one
    let targetSection = findClimateSection();
    
    if (!targetSection) {
      console.log('Climate section not found, creating new one');
      targetSection = createNewClimateSection();
    }

    if (!targetSection) return;

    // Create enhanced climate display
    const enhancedDiv = document.createElement('div');
    enhancedDiv.id = 'enhanced-climate-data';
    enhancedDiv.style.cssText = `
      margin: 20px 0;
      padding: 20px;
      background: linear-gradient(to bottom, #f8fafc, #ffffff);
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    `;

    enhancedDiv.innerHTML = `
      <div style="display: flex; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 20px; font-weight: 600; color: #1e293b; flex: 1;">
          🌍 Detailed Climate Risk Analysis
        </h3>
        <a href="${firstStreetUrl}" target="_blank" style="color: #3b82f6; text-decoration: none; font-size: 14px; font-weight: 500;">
          View Full Report →
        </a>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px;">
        ${createFactorCard('Flood', data.floodFactor, '💧')}
        ${createFactorCard('Fire', data.fireFactor, '🔥')}
        ${createFactorCard('Wind', data.windFactor, '💨')}
        ${createFactorCard('Air Quality', data.airFactor, '🌫️')}
        ${createFactorCard('Heat', data.heatFactor, '🌡️')}
      </div>

      ${data.keyInsights.length > 0 ? `
        <div style="margin-top: 16px; padding: 16px; background: white; border-radius: 8px; border: 1px solid #e2e8f0;">
          <h4 style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #334155;">📊 Key Insights</h4>
          <ul style="margin: 0; padding-left: 20px; color: #475569; line-height: 1.6; font-size: 14px;">
            ${data.keyInsights.map(insight => `<li style="margin-bottom: 8px;">${insight}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      <div style="margin-top: 12px; padding: 12px; background: #f1f5f9; border-radius: 8px; font-size: 12px; color: #64748b;">
        <strong>📍 Data Source:</strong> First Street Foundation. Ratings on a scale of 1-10 (10 = highest risk).
      </div>
    `;

    // Remove old enhanced data if exists
    const oldEnhanced = document.getElementById('enhanced-climate-data');
    if (oldEnhanced) {
      oldEnhanced.remove();
    }

    targetSection.insertAdjacentElement('afterend', enhancedDiv);
  }

  function createFactorCard(name, factor, icon) {
    const color = getSeverityColor(factor.severity);
    const bgColor = factor.severity === 'unknown' ? '#f8fafc' : 'white';
    
    return `
      <div style="background: ${bgColor}; padding: 16px; border-radius: 8px; border: 2px solid ${color}; text-align: center; transition: transform 0.2s;">
        <div style="font-size: 28px; margin-bottom: 8px;">${icon}</div>
        <div style="font-size: 14px; font-weight: 600; color: #334155; margin-bottom: 4px;">${name}</div>
        <div style="font-size: 32px; font-weight: 700; color: ${color}; margin-bottom: 4px;">${factor.rating}</div>
        <div style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">${factor.severity}</div>
      </div>
    `;
  }

  function findClimateSection() {
    // Look for heading containing "climate"
    const headings = document.querySelectorAll('h2, h3, h4, h5, h6');
    for (let heading of headings) {
      const text = heading.textContent.toLowerCase();
      if (text.includes('climate') && (text.includes('risk') || text.includes('factor'))) {
        return heading.closest('section') || 
               heading.closest('div[class*="section"]') || 
               heading.closest('div[class*="Section"]') ||
               heading.parentElement;
      }
    }

    // Look for any element containing First Street link
    const firstStreetLinks = document.querySelectorAll('a[href*="firststreet.org"]');
    if (firstStreetLinks.length > 0) {
      return firstStreetLinks[0].closest('section') || 
             firstStreetLinks[0].closest('div[class*="section"]') ||
             firstStreetLinks[0].closest('div[class*="Section"]') ||
             firstStreetLinks[0].parentElement.parentElement;
    }

    // Look for elements with climate in class name
    const climateElements = document.querySelectorAll('[class*="climate" i], [class*="Climate" i]');
    if (climateElements.length > 0) {
      return climateElements[0];
    }

    return null;
  }

  function createNewClimateSection() {
    // Try to find a suitable location in the page
    const mainContent = document.querySelector('article') || 
                       document.querySelector('main') || 
                       document.querySelector('[class*="PropertyDetails"]') ||
                       document.querySelector('[data-testid*="property"]');
    
    if (mainContent) {
      const newSection = document.createElement('div');
      newSection.style.cssText = 'margin: 20px 0;';
      mainContent.appendChild(newSection);
      return newSection;
    }

    return null;
  }

  // Show loading indicator
  function showLoadingIndicator() {
    const targetSection = findClimateSection();
    if (!targetSection) return;

    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'enhanced-climate-loading';
    loadingDiv.style.cssText = `
      margin: 20px 0;
      padding: 20px;
      background: #f8fafc;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    loadingDiv.innerHTML = `
      <div style="color: #64748b; font-size: 14px;">
        <div style="font-size: 24px; margin-bottom: 8px;">🔄</div>
        <strong>Loading detailed climate data...</strong>
      </div>
    `;

    targetSection.insertAdjacentElement('afterend', loadingDiv);
  }

  function removeLoadingIndicator() {
    const loading = document.getElementById('enhanced-climate-loading');
    if (loading) {
      loading.remove();
    }
  }

  // Main function to enhance the page
  async function enhancePage() {
    if (isProcessing) return;
    
    const firstStreetUrl = findFirstStreetLink();
    
    // Don't process if we've already processed this URL
    if (firstStreetUrl && hasProcessedUrl === firstStreetUrl) {
      console.log('Already processed this URL, skipping...');
      return;
    }
    
    // Don't process if data is already injected and visible
    if (enhancedDataInjected && document.getElementById('enhanced-climate-data')) {
      console.log('Enhanced data already visible, skipping...');
      return;
    }
    
    isProcessing = true;
    console.log('Zillow Climate Risk Enhancer: Starting...');
    
    if (firstStreetUrl) {
      console.log('Found First Street link:', firstStreetUrl);
      hasProcessedUrl = firstStreetUrl;
      
      try {
        showLoadingIndicator();
        const data = await fetchFirstStreetData(firstStreetUrl);
        
        if (data) {
          console.log('Climate data retrieved:', data);
          removeLoadingIndicator();
          injectClimateData(data, firstStreetUrl);
          enhancedDataInjected = true;
        }
      } catch (error) {
        console.error('Error fetching climate data:', error);
        removeLoadingIndicator();
        
        // Show error message
        const targetSection = findClimateSection();
        if (targetSection) {
          const errorDiv = document.createElement('div');
          errorDiv.style.cssText = `
            margin: 20px 0;
            padding: 16px;
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            color: #991b1b;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
          `;
          errorDiv.innerHTML = `
            <strong>⚠️ Could not load detailed climate data</strong><br>
            <a href="${firstStreetUrl}" target="_blank" style="color: #dc2626; text-decoration: underline;">
              View on First Street →
            </a>
          `;
          targetSection.insertAdjacentElement('afterend', errorDiv);
        }
      }
    } else {
      console.log('No First Street link found on this page');
    }

    isProcessing = false;
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhancePage);
  } else {
    setTimeout(enhancePage, 1000); // Give page time to load
  }

  // Watch for dynamic content changes (Zillow is a SPA)
  let debounceTimer = null;
  const observer = new MutationObserver((mutations) => {
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Don't process if we're already processing or data is already shown
    if (isProcessing || (enhancedDataInjected && document.getElementById('enhanced-climate-data'))) {
      return;
    }
    
    // Check if this is a significant change
    const hasRelevantChanges = mutations.some(mutation => {
      // Ignore our own injected elements
      if (mutation.target.id === 'enhanced-climate-data' || 
          mutation.target.id === 'enhanced-climate-loading') {
        return false;
      }
      
      // Check if First Street link was added
      if (mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          if (node.nodeType === 1) { // Element node
            if (node.querySelector && node.querySelector('a[href*="firststreet.org"]')) {
              return true;
            }
          }
        }
      }
      
      return false;
    });
    
    if (hasRelevantChanges) {
      // Reset state when navigating to a new property
      hasProcessedUrl = null;
      enhancedDataInjected = false;
      
      // Debounce - wait for page to settle
      debounceTimer = setTimeout(enhancePage, 2000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})();