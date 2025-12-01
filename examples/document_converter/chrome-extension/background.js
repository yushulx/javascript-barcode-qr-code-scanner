// Background service worker for Document Converter extension
// Opens the app in a new tab when the extension icon is clicked

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('index.html')
  });
});
