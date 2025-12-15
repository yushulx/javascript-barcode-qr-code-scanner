function showMessage(text) {
    var messageBox = document.getElementById('message-box');
    var messageText = document.getElementById('message-text');
    messageText.textContent = text;
    messageBox.classList.add('show', 'slide-in');
    setTimeout(function () {
        messageBox.classList.remove('slide-in');
        messageBox.classList.add('slide-out');
        setTimeout(function () {
            messageBox.classList.remove('show', 'slide-out');
        }, 500);
    }, 3000);
}