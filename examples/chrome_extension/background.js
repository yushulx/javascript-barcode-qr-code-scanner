// Background service worker for handling CORS-restricted API calls

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getUserInfo') {
        // Get user info from Dynamsoft API
        fetch('https://www.dynamsoft.com/api-common/Api/User/Info', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'DynamsoftToken': request.token,
                'DynamsoftUser': request.userId
            },
            credentials: 'include'
        })
            .then(response => response.json())
            .then(data => {
                console.log('User info response:', data);
                if (data.code === 0) {
                    const briefCompany = data.data.briefCompanys && data.data.briefCompanys.length > 0
                        ? data.data.briefCompanys[0]
                        : null;

                    const userInfo = {
                        address: data.data.address,
                        city: data.data.city,
                        companyId: briefCompany?.companyId,
                        companyName: briefCompany?.companyName,
                        countryCode: data.data.countryCode,
                        email: data.data.email,
                        firstName: data.data.firstName,
                        lastName: data.data.lastName,
                        phone: data.data.phone,
                        stateCode: data.data.stateCode,
                        title: data.data.title,
                        userId: data.data.userId,
                        website: briefCompany?.website,
                        zipCode: data.data.zipCode,
                        role: data.data.role
                    };
                    sendResponse({ success: true, data: userInfo });
                } else {
                    sendResponse({ success: false, error: data.msg });
                }
            })
            .catch(error => {
                console.error('Error getting user info:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true;
    }

    if (request.action === 'requestTrialLicense') {
        // Request trial license with email
        fetch('https://www.dynamsoft.com/api-portal/Api/Trial/RequestFromWeb', {
            method: 'POST',
            headers: {
                'accept': '*/*',
                'Content-Type': 'application/json',
                'DynamsoftToken': request.token,
                'DynamsoftUser': request.userId
            },
            body: JSON.stringify({
                Email: request.email,
                SolutionId: 2,
                PackageId: 13,
                RequestSource: 7
            })
        })
            .then(response => {
                console.log('Trial license response status:', response.status);
                return response.json();
            })
            .then(data => {
                console.log('Trial license response data:', data);
                sendResponse({ success: true, data: data });
            })
            .catch(error => {
                console.error('Error requesting trial license:', error);
                sendResponse({ success: false, error: error.message });
            });

        // Return true to indicate async response
        return true;
    }

    if (request.action === 'getCookie') {
        // Get cookies from Dynamsoft domain
        chrome.cookies.get({
            url: 'https://www.dynamsoft.com',
            name: request.cookieName
        }, (cookie) => {
            sendResponse({ cookie: cookie });
        });

        return true;
    }

    if (request.action === 'openAuthPopup') {
        // Open OAuth popup
        const authUrl = `https://www.dynamsoft.com/api-common/Api/User/Login/Google?redirectUri=${encodeURIComponent(request.redirectUri)}`;

        chrome.windows.create({
            url: authUrl,
            type: 'popup',
            width: 600,
            height: 700
        }, (window) => {
            sendResponse({ windowId: window.id });
        });

        return true;
    }
});

// Listen for window removal to detect when OAuth popup closes
chrome.windows.onRemoved.addListener((windowId) => {
    // Notify popup that window was closed
    chrome.runtime.sendMessage({ action: 'authWindowClosed', windowId: windowId });
});
