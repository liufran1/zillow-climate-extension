// Background service worker to handle CORS-restricted requests

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchFirstStreet') {
    fetchFirstStreetData(request.url)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }
});

async function fetchFirstStreetData(url) {
  try {
    console.log('Background: Fetching First Street data from:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    const data = parseFirstStreetHTML(html);
    
    console.log('Background: Parsed data:', data);
    return data;
  } catch (error) {
    console.error('Background: Error fetching First Street data:', error);
    throw error;
  }
}

function parseFirstStreetHTML(html) {
  // Parse HTML as text (no DOM parser in service workers)
  const data = {
    floodFactor: extractFactor(html, 'flood'),
    fireFactor: extractFactor(html, 'fire'),
    windFactor: extractFactor(html, 'wind'),
    airFactor: extractFactor(html, 'air'),
    heatFactor: extractFactor(html, 'heat'),
    keyInsights: extractKeyInsights(html)
  };
  
  return data;
}

function extractFactor(html, type) {
  // Convert to lowercase for case-insensitive matching
  const lowerHtml = html.toLowerCase();
  const typeLower = type.toLowerCase();
  
  // Try multiple patterns to find the factor
  const patterns = [
    // Pattern: "Flood Factor - 7/10" or "Flood Factor: 7/10"
    new RegExp(`${typeLower}\\s+factor[:\\s-]+(\\d+)\\s*\\/\\s*10`, 'i'),
    // Pattern: "Factor 7" right after the type
    new RegExp(`${typeLower}[^\\d]{0,30}factor[^\\d]{0,10}(\\d+)`, 'i'),
    // Pattern: Just number with /10 near the type
    new RegExp(`${typeLower}[^\\d]{0,50}(\\d+)\\s*\\/\\s*10`, 'i'),
    // Pattern: "7 out of 10"
    new RegExp(`${typeLower}[^\\d]{0,30}(\\d+)\\s*out\\s*of\\s*10`, 'i'),
    // Pattern: In JSON data (First Street sometimes embeds data)
    new RegExp(`"${typeLower}[_-]?(?:factor|risk|score)"[^\\d]{0,20}(\\d+)`, 'i'),
    // Pattern: data-factor-type="flood" ... >7<
    new RegExp(`data-[^>]*${typeLower}[^>]*>\\s*(\\d+)\\s*<`, 'i')
  ];
  
  for (let pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const rating = parseInt(match[1]);
      // Validate that rating is between 1-10
      if (rating >= 1 && rating <= 10) {
        return {
          rating: rating.toString(),
          description: `${type.charAt(0).toUpperCase() + type.slice(1)} risk rating`,
          severity: getSeverity(rating)
        };
      }
    }
  }
  
  // Try to find in structured data / JSON-LD
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/is);
  if (jsonLdMatch) {
    try {
      const jsonData = JSON.parse(jsonLdMatch[1]);
      const jsonStr = JSON.stringify(jsonData).toLowerCase();
      const factorMatch = jsonStr.match(new RegExp(`${typeLower}[^\\d]{0,20}(\\d+)`, 'i'));
      if (factorMatch) {
        const rating = parseInt(factorMatch[1]);
        if (rating >= 1 && rating <= 10) {
          return {
            rating: rating.toString(),
            description: `${type.charAt(0).toUpperCase() + type.slice(1)} risk rating`,
            severity: getSeverity(rating)
          };
        }
      }
    } catch (e) {
      // JSON parsing failed, continue
    }
  }
  
  // Look for the factor in data attributes or class names with numbers
  const dataAttrPattern = new RegExp(`(?:data-${typeLower}|class="[^"]*${typeLower}[^"]*")[^>]*>\\s*(\\d+)`, 'i');
  const dataMatch = html.match(dataAttrPattern);
  if (dataMatch) {
    const rating = parseInt(dataMatch[1]);
    if (rating >= 1 && rating <= 10) {
      return {
        rating: rating.toString(),
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} risk rating`,
        severity: getSeverity(rating)
      };
    }
  }
  
  return { 
    rating: 'N/A', 
    description: 'Data not available', 
    severity: 'unknown' 
  };
}

function extractKeyInsights(html) {
  const insights = [];
  
  // Remove script and style tags first
  let cleanHtml = html.replace(/<script[^>]*>.*?<\/script>/gis, '');
  cleanHtml = cleanHtml.replace(/<style[^>]*>.*?<\/style>/gis, '');
  
  // Look for list items that might contain insights
  const listPattern = /<li[^>]*>(.*?)<\/li>/gis;
  let match;
  while ((match = listPattern.exec(cleanHtml)) !== null && insights.length < 8) {
    const text = stripHtmlTags(match[1]).trim();
    if (text.length > 50 && text.length < 400 && isLikelyInsight(text)) {
      insights.push(text);
    }
  }
  
  // Look for paragraphs with insight-like content
  if (insights.length < 5) {
    const paraPattern = /<p[^>]*>(.*?)<\/p>/gis;
    while ((match = paraPattern.exec(cleanHtml)) !== null && insights.length < 8) {
      const text = stripHtmlTags(match[1]).trim();
      if (text.length > 50 && text.length < 400 && isLikelyInsight(text) && !insights.includes(text)) {
        insights.push(text);
      }
    }
  }
  
  // Look for divs with specific classes that might contain insights
  const insightDivPattern = /<div[^>]*class="[^"]*(?:insight|summary|description|detail)[^"]*"[^>]*>(.*?)<\/div>/gis;
  while ((match = insightDivPattern.exec(cleanHtml)) !== null && insights.length < 8) {
    const text = stripHtmlTags(match[1]).trim();
    if (text.length > 50 && text.length < 400 && !insights.includes(text)) {
      insights.push(text);
    }
  }
  
  return insights.slice(0, 5);
}

function stripHtmlTags(str) {
  return str.replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
}

function isLikelyInsight(text) {
  // Check if text contains keywords that suggest it's an insight
  const insightKeywords = [
    'risk', 'factor', 'climate', 'property', 'area', 'likely', 'percent', '%',
    'year', 'increase', 'decrease', 'flood', 'fire', 'wind', 'heat', 'air',
    'damage', 'insurance', 'expect', 'future', 'current', 'average', 'compared',
    'probability', 'chance', 'exposure', 'vulnerable', 'impact', 'severe'
  ];
  
  const lowerText = text.toLowerCase();
  const matchCount = insightKeywords.filter(keyword => lowerText.includes(keyword)).length;
  
  // Needs at least 2 keywords and shouldn't be a navigation link
  return matchCount >= 2 && 
         !lowerText.includes('click here') && 
         !lowerText.includes('learn more') &&
         !lowerText.includes('sign up') &&
         !lowerText.includes('subscribe');
}

function getSeverity(rating) {
  if (rating >= 8) return 'extreme';
  if (rating >= 6) return 'major';
  if (rating >= 4) return 'moderate';
  if (rating >= 2) return 'minor';
  return 'minimal';
}