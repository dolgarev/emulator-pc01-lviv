chrome.app.runtime.onLaunched.addListener(function() {
    chrome.app.window.create('window.html', {
        id: 'emul_pc01_lviv',
        bounds: {
            width: 640,
            height: 640
        },
        minWidth: 640,
        minHeight: 640,
        maxWidth: 640,
        maxHeight: 640
    });
});
