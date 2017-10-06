function runScript() {
    chrome.runtime.onMessageExternal.addListener(function(request, sender, sendResponse) {
        chrome.storage.local.get(request.address, function(data) {
            console.log(data);
            if (request.action == 'getKey') {
                if (data == null || data[request.address] == null || data[request.address].key == null) {
                    alert('You have installed the Secure Mail extension, but have not yet enrolled this address from internet banking. Secure Mail must be initialized from within Standard Bank Internet Banking.')
                } else {
                    sendResponse(data);
                }
            } else if (request.action == 'checkKey') {
                if (typeof data == 'undefined' || data == null) {
                    sendResponse({})
                }
                sendResponse(data);
            } else if (request.action == 'setKey') {
                data.deviceId = request.deviceId;
                data.key = request.key;
                chrome.storage.local.set({[request.address]: data});
                console.log('set keys', data);
                sendResponse(data);
            }
            return true;
        });
        return true;
    });

    chrome.runtime.onInstalled.addListener(function() {
        window.location = window.location;
    });
    console.log('Background script loaded');
}

runScript();