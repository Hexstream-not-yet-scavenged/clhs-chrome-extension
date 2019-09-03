function addContextMenuItem (info) {
    chrome.contextMenus.create(info,
                               function () {
                               });
}

function installInit () {
    chrome.contextMenus.removeAll();
    HexstreamSoft.clhs.Action.actionsArray.forEach(function (action) {
        addContextMenuItem({
            id: action.name,
            title: action.title,
            contexts: ["all"]
        });
    });
}

chrome.runtime.onInstalled.addListener(installInit);

chrome.browserAction.onClicked.addListener(function (tab) {
    HexstreamSoft.clhs.Action.perform("perform-default-action", "Browser action");
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
    HexstreamSoft.clhs.Action.perform(info.menuItemId, "Context menu");
});

chrome.commands.onCommand.addListener(function (command) {
    HexstreamSoft.clhs.Action.perform(command, "Keyboard shortcut");
});
