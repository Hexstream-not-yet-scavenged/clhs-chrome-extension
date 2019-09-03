"use strict";

HexstreamSoft.clhs = {};

(function () {
    function getCurrentTab (callback) {
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, function (tabs) {
            callback(tabs[0]);
        });
    }

    function CLHS (name, root) {
        var clhs = this;
        clhs.name = name;
        clhs.root = root;
        clhs.index = root + "Front/index.htm";
    }

    CLHS.clhses = {};
    CLHS.clhsesArray = [];

    CLHS.define = function (name, root) {
        if (CLHS.clhses[name])
            throw Error("Duplicate definition for clhs \"" + name + "\".");
        var newCLHS = new CLHS(name, root);
        CLHS.clhses[name] = newCLHS;
        CLHS.clhsesArray.push(newCLHS);
    };

    if (window.chrome && chrome.runtime && chrome.runtime.getURL)
        CLHS.define("local", chrome.runtime.getURL("HyperSpec-7-0/HyperSpec/"));

    CLHS.define("canonical", "http://www.lispworks.com/documentation/HyperSpec/");

    CLHS.prototype.getURL = function (path) {
        return this.root + path;
    }

    CLHS.prototype.computeEquivalentURL = function (url) {
        var clhs = this;
        var path = Context.analyzeURL(url).path;
        return path !== undefined ? clhs.getURL(path) : clhs.index;
    };

    /*
      function EventLog (capacity) {
      this.entries = [];
      this.capacity = capacity;
      }

      EventLog.prototype.log = function (event) {
      var entries = this.entries;
      if (entries.length >= this.capacity)
      this.entries.shift();
      this.entries.push(event);
      chrome.runtime.sendMessage(event);
      }

      EventLog.prototype.shouldLog = function () {
      return true;
      }

      var actionEventLog = new EventLog("actionEventLog", 32);
    */

    function Context (name, title, definition) {
        var context = this;
        context.name = name;
        context.title = title;
        if (definition && definition.clhs)
        {
            context.clhs = definition.clhs;
            context.clhs.context = context;
        }
        context.possibleActions = [];
        context.possibleActionNames = [];
        context.defaultActionKey = "default-action_" + name;
    }

    Context.contexts = {};
    Context.contextsArray = [];
    Context.contextNames = [];

    Context.define = function (name, title, definition) {
        if (Context.contexts[name])
            throw Error("Duplicate definition for context \"" + name + "\".");
        var context = new Context (name, title, definition);
        Context.contexts[name] = context;
        Context.contextsArray.push(context);
        Context.contextNames.push(name);
    }

    Context.define("non-clhs", "Non-CLHS");
    Context.define("local-clhs", "Local CLHS", {
        clhs: CLHS.clhses.local
    });
    Context.define("canonical-clhs", "Canonical CLHS", {
        clhs: CLHS.clhses.canonical
    });

    Context.analyzeURL = function (url) {
        var result;
        CLHS.clhsesArray.some(function (clhs) {
            if (url.indexOf(clhs.root) === 0)
            {
                result = {
                    context: clhs.context,
                    path: url.slice(clhs.root.length)
                };
                return true;
            }
        });
        return result || {
            context: Context.contexts["non-clhs"]};
    };

    Context.fromURL = function (url) {
        return Context.analyzeURL(url).context;
    };

    Context.getCurrentContext = function (callback) {
        getCurrentTab(function (tab) {
            callback(Context.fromURL(tab && tab.url || ""));
        });
    };

    Context.prototype.getDefaultAction =  function () {
        return localStorage[this.defaultActionKey];
    }

    function Action (name, title, definition) {
        var action = this;
        action.name = name;
        action.title = title;
        var invalidContexts = definition.invalidContexts || [];
        action.invalidContexts = invalidContexts;
        action.validContexts = Context.contextsArray.filter(function (context) {
            return invalidContexts.indexOf(context) < 0;
        });
        action.needsPermissions = definition.needsPermissions;
        action.perform = definition.perform;
        if (name !== "perform-default-action")
            action.validContexts.forEach(function (context) {
                context.possibleActions.push(action);
                context.possibleActionNames.push(action.name);
            });
    }

    Action.actions = {};
    Action.actionsArray = [];
    Action.actionNames = [];

    Action.define = function (name, title, definition) {
        if (Action.actions[name])
            throw Error("Duplicate definition for action \"" + name + "\".");
        var action = new Action (name, title, definition);
        Action.actions[name] = action;
        Action.actionsArray.push(action);
        Action.actionNames.push(name);
    };

    Action.define("new-tab-local-index", "New tab: Local CLHS index", {
        perform: function () {
            chrome.tabs.create({
                url: CLHS.clhses.local.index
            });
        }
    });

    Action.define("new-tab-canonical-index", "New tab: Canonical CLHS index", {
        perform: function () {
            chrome.tabs.create({
                url: CLHS.clhses.canonical.index
            });
        }
    });

    function focusOrOpen (clhs) {
        chrome.tabs.query({url: clhs.root + "*"}, function (clhsTabs) {
            if (clhsTabs.length > 0)
            {
                var clhsTab = clhsTabs[0];
                chrome.windows.update(clhsTab.windowId, {
                    focused: true
                });
                chrome.tabs.update(clhsTab.id, {
                    active: true
                });
            }
            else
                chrome.tabs.create({
                    url: clhs.index
                });
        });
    }

    Action.define("focus-or-open-local", "Focus or open: Local CLHS", {
        invalidContexts: [Context.contexts["local-clhs"]],
        needsPermissions: ["tabs"],
        perform: function () {
            focusOrOpen(CLHS.clhses.local);
        }
    });

    Action.define("focus-or-open-canonical", "Focus or open: Canonical CLHS", {
        invalidContexts: [Context.contexts["canonical-clhs"]],
        needsPermissions: ["tabs"],
        perform: function () {
            focusOrOpen(CLHS.clhses.canonical);
        }
    });

    Action.define("go-to-local", "Go to: Local CLHS", {
        invalidContexts: [Context.contexts["local-clhs"]],
        perform: function () {
            chrome.tabs.update(undefined, {
                url: CLHS.clhses.local.index
            });
        }
    });

    Action.define("go-to-canonical", "Go to: Canonical CLHS", {
        invalidContexts: [Context.contexts["canonical-clhs"]],
        perform: function () {
            chrome.tabs.update(undefined, {
                url: CLHS.clhses.canonical.index
            });
        }
    });

    function copyTextToClipboard (text) {
        var copyFrom = document.createElement("textarea");
        copyFrom.textContent = text;
        var body = document.body;
        body.appendChild(copyFrom);
        copyFrom.select();
        document.execCommand('copy');
        body.removeChild(copyFrom);
    }

    Action.define("copy-to-clipboard-canonical-url", "Copy to clipboard: Canonical URL", {
        perform: function () {
            getCurrentTab(function (tab) {
                copyTextToClipboard(CLHS.clhses.canonical.computeEquivalentURL(tab && tab.url || ""));
            });
        }
    });

    Action.perform = function (actionName, invoker) {
        /*if (actionEventLog.shouldLog())
          getCurrentContext(function (context) {
          actionEventLog.log({
          type: "performAction",
          actionName: actionName,
          invoker: invoker,
          context: context
          });
          });*/
        if (!window.chrome || !chrome.tabs)
            throw Error("Must be in extension context to perform actions.");

        var action = Action.actions[actionName];

        if (action)
            action.perform();
        else
            alert("Sorry, unrecognized action \"" + actionName + "\". :(");
    }

    Action.define("perform-default-action", "Perform the default action", {
        perform: function () {
            Context.getCurrentContext(function (context) {
                Action.perform(context.getDefaultAction(), "Default action");
            });
        }
    });

    Action.prototype.isValidContext = function (context) {
        return this.validContexts.indexOf(context) >= 0;
    }

    Action.prototype.forEachValidAndInvalidContext = function (callback, thisValue) {
        var action = this;
        Context.contextsArray.forEach(function (context) {
            callback.call(thisValue, context, action.isValidContext(context));
        });
    };

    HexstreamSoft.clhs.CLHS = CLHS;
    HexstreamSoft.clhs.Context = Context;
    HexstreamSoft.clhs.Action = Action;
})();


(function () {
    HexstreamSoft.modules.ensure("HexstreamSoft.StateDomain", "HexstreamSoft.EventBinding");

    var preferencesSchema = (function () {
        var show_hide = {
            possibleValues: ["show", "hide"],
            defaultValue: "show"
        };
        var show_hide_default_hide = {
            possibleValues: ["show", "hide"],
            defaultValue: "hide"
        };
        var properties = {};
        HexstreamSoft.clhs.Context.contextsArray.forEach(function (context) {
            properties[context.defaultActionKey] = {
                possibleValues: context.possibleActionNames,
                defaultValue: context.possibleActionNames[0]
            };
        });
        function addMenuItemsForAction (action, show_hide) {
            action.validContexts.forEach(function (context) {
                properties["menu-item_" + context.name + "_" + action.name] = show_hide;
            });
        }
        HexstreamSoft.clhs.Action.actionsArray.forEach(function (action) {
            addMenuItemsForAction(action, show_hide);
        });
        addMenuItemsForAction(HexstreamSoft.clhs.Action.actions["perform-default-action"], show_hide_default_hide);
        return new HexstreamSoft.StateDomainSchema(properties);
    })();

    var preferences = new HexstreamSoft.StateDomain(preferencesSchema);

    HexstreamSoft.EventBinding.bind("storage", "=", "storage",
                                    {
                                        storage: localStorage,
                                    },
                                    {"source":
                                     {
                                         keys: preferences.schema.keys
                                     }
                                    },
                                    {
                                        storage: preferences,
                                    });
    HexstreamSoft.EventBinding.bind("storage", "=", "document",
                                    {
                                        storage: preferences,
                                    },
                                    {},
                                    {
                                        document: document.documentElement,
                                        stateDomainName: "extension-prefs"
                                    });
    HexstreamSoft.EventBinding.bind("storage", ">", "classList",
                                    {
                                        storage: preferences,
                                        keys: [],
                                    },
                                    {},
                                    {
                                        document: document.documentElement,
                                        nodeSelector: "body"
                                    });


    var pagePreferencesSchema = new HexstreamSoft.StateDomainSchema({
        "/options/test-mode/": {
            possibleValues: ["true", "false"],
            defaultValue: false
        }
    });

    var pagePreferences = new HexstreamSoft.StateDomain(pagePreferencesSchema);

    HexstreamSoft.EventBinding.bind("storage", "=", "storage",
                                    {
                                        storage: localStorage,
                                    },
                                    {"source":
                                     {
                                         keys: pagePreferences.schema.keys
                                     }
                                    },
                                    {
                                        storage: pagePreferences,
                                    });
    HexstreamSoft.EventBinding.bind("storage", "=", "document",
                                    {
                                        storage: pagePreferences
                                    },
                                    {},
                                    {
                                        document: document.documentElement,
                                        stateDomainName: "page-prefs"
                                    });
    HexstreamSoft.EventBinding.bind("storage", ">", "classList",
                                    {
                                        storage: pagePreferences,
                                        keys: ["/options/test-mode/"],
                                    },
                                    {},
                                    {
                                        document: document.documentElement,
                                        nodeSelector: "body"
                                    });

    if (window.chrome && chrome.commands)
        chrome.commands.getAll(function (commands) {
            var shortcut = {
                valueValidator:
                function (value) {
                    return typeof value === "string";
                },

                defaultValue:
                ""
            }
            var properties = {};
            commands.forEach(function (command) {
                properties[command.name] = shortcut;
            });

            HexstreamSoft.clhs.keyboardShortcutsSchema = new HexstreamSoft.StateDomainSchema(properties);
            HexstreamSoft.clhs.keyboardShortcuts = new HexstreamSoft.StateDomain(HexstreamSoft.clhs.keyboardShortcutsSchema);

            HexstreamSoft.EventBinding.bind("storage", ">", "document",
                                            {
                                                storage: HexstreamSoft.clhs.keyboardShortcuts,
                                            },
                                            {},
                                            {
                                                document: document.documentElement,
                                                stateDomainName: "chrome.keyboard-shortcuts"
                                            });
        });

    function syncShortcuts () {
        if (window.chrome && chrome.commands)
            chrome.commands.getAll(function (commands) {
                commands.forEach(function (command) {
                    HexstreamSoft.clhs.keyboardShortcuts[command.name] = command.shortcut ? command.shortcut : "";
                });
            });
    }

    syncShortcuts();

    document.addEventListener("visibilitychange", function () {
        if (!document.hidden)
            syncShortcuts();
    });

    if (window.chrome && chrome.permissions)
        chrome.permissions.getAll(function (allPermissions) {
            allPermissions = allPermissions.permissions || [];
            var perm = {
                possibleValues: ["not-given", "denied", "granted", "revoked"],
                defaultValue: "not-given"
            }
            var properties = {"tabs": perm};

            var permissionsSchema = new HexstreamSoft.StateDomainSchema(properties);
            var permissions = new HexstreamSoft.StateDomain(permissionsSchema);

            if (allPermissions.indexOf("tabs") >= 0)
                permissions["tabs"] = "granted";
            HexstreamSoft.EventBinding.bind("storage", ">", "document",
                                            {
                                                storage: permissions,
                                            },
                                            {},
                                            {
                                                document: document.documentElement,
                                                stateDomainName: "chrome.permissions"
                                            });
            HexstreamSoft.EventBinding.bind("storage", ">", "classList",
                                            {
                                                storage: permissions,
                                                keys: permissions.schema.keys,
                                            },
                                            {},
                                            {
                                                document: document.documentElement,
                                                nodeSelector: "body"
                                            });
            chrome.permissions.onAdded.addListener(function (addedPermissions) {
                addedPermissions = addedPermissions.permissions || [];
                if (addedPermissions.indexOf("tabs") >= 0)
                    permissions["tabs"] = "granted";
            });
            chrome.permissions.onRemoved.addListener(function (removedPermissions) {
                removedPermissions = removedPermissions.permissions || [];
                if (removedPermissions.indexOf("tabs") >= 0)
                    permissions["tabs"] = "revoked";
            });

            HexstreamSoft.clhs.permissionsSchema = permissionsSchema;
            HexstreamSoft.clhs.permissions = permissions;
        });

    // Exported above because of asynchrony:
    // keyboardShortcutsSchema, keyboardShortcuts, permissionsSchema, permissions
    HexstreamSoft.clhs.preferencesSchema = preferencesSchema;
    HexstreamSoft.clhs.preferences = preferences;
    HexstreamSoft.clhs.pagePreferencesSchema = pagePreferencesSchema;
    HexstreamSoft.clhs.pagePreferences = pagePreferences;
})();
