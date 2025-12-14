// Check if we're on a Zillow page
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  const statusDiv = document.getElementById('status');
  
  if (tabs[0] && tabs[0].url) {
    const url = tabs[0].url;
    
    if (url.includes('zillow.com')) {
      statusDiv.className = 'status active';
      statusDiv.innerHTML = '<strong>✓ Active on Zillow</strong><br>Extension is monitoring this page.';
    } else {
      statusDiv.className = 'status inactive';
      statusDiv.innerHTML = '<strong>⚠ Not on Zillow</strong><br>Navigate to a Zillow property listing to use this extension.';
    }
  } else {
    statusDiv.className = 'status inactive';
    statusDiv.innerHTML = '<strong>⚠ Unable to detect page</strong>';
  }
});