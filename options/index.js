"use strict";

(function () {

    (function () {
        function Expression (operator, args) {
            if (!Expression.isLiteral(operator))
                throw Error("Operator must be a literal.");
            return {
                operator: operator,
                args: args
            };
        }

        Expression.isLiteral = function (expression) {
            return typeof expression === "string";
        };

        function makeJoiner (joinString) {
            return function () {
                var argForms = Array.prototype.slice.call(arguments);
                var compiledArgs = argForms.map(Expression.compile);
                if (argForms.length === 1)
                    return compiledArgs[0];
                else
                    return function (env) {
                        return compiledArgs.map(function (compiledArg) {
                            return compiledArg(env);
                        }).join(joinString);
                    };
            }
        }

        Expression.operators = {
            "join": makeJoiner(" "),
            "concat": makeJoiner(""),
            "var": function (varNameForm) {
                var compiledVarName = Expression.compile(varNameForm);
                return function (env) {
                    return env[compiledVarName(env)];
                };
            },
            "if": function (conditionForm, thenForm, elseForm) {
                var compiledCondition = Expression.compile(conditionForm);
                var compiledThen = Expression.compile(thenForm);
                var compiledElse = elseForm ? Expression.compile(elseForm) : function () {return "";};
                return function (env) {
                    return compiledCondition(env) ? compiledThen(env) : compiledElse(env);
                };
            },
            "!==": function (leftForm, rightForm) {
                var compiledLeft = Expression.compile(leftForm);
                var compiledRight = Expression.compile(rightForm);
                return function (env) {
                    return compiledLeft(env) !== compiledRight(env);
                };
            }
        };

        var consecutiveWhitespace = /[ \n\t]*/g;
        var consecutiveLiteralChars = /[^ \n\t()]+/g;

        Expression.read = function (stream) {
            if (typeof stream === "string")
                stream = new HexstreamSoft.clhs.StringInputStream(stream);
            stream.skip(consecutiveWhitespace);
            var expressions = [];
            function boundaryNotReached () {
                return !stream.done() && " \n\t)".indexOf(stream.current()) < 0;
            }
            while (boundaryNotReached())
            {
                var expression = (function () {
                    while (boundaryNotReached())
                    {
                        if (stream.current() === "(")
                        {
                            stream.next();
                            var operator = Expression.read(stream);
                            var args = [];
                            while (stream.current() !== ")")
                                args.push(Expression.read(stream));
                            stream.next();
                            return new Expression(operator, args);
                        }
                        else
                            return stream.match(consecutiveLiteralChars);
                    }
                })();
                expressions.push(expression);
            }
            return expressions.length === 1 ? expressions[0] : new Expression("concat", expressions);
        };

        Expression.compile = function (expression) {
            if (Expression.isLiteral(expression))
                return function () {
                    return expression;
                };
            else
            {
                var operatorDefinition = Expression.operators[expression.operator];
                if (operatorDefinition)
                    return operatorDefinition.apply(undefined, expression.args);
                else
                    throw Error("Don't know how to compile \"" + expression.operator + "\" forms.");
            }
        };

        HexstreamSoft.clhs.Expression = Expression;
    })();

    (function () {
        function CompiledTemplate (templateElement) {
            return compile(templateElement.content);
        }

        var Expression = HexstreamSoft.clhs.Expression;

        function compileAttributeValue (value) {
            if (value.indexOf("(") < 0)
                return function () {
                    return value;
                };
            else
                return Expression.compile(Expression.read("(join " + value + ")"));
        };

        function compileAttributes (node) {
            var compiledAttributes = Array.prototype.map.call(node.attributes, function (attribute) {
                var attributeName = attribute.name;
                var compiledAttributeValue = compileAttributeValue(attribute.value);
                if (attributeName === "data-text-content")
                    return function (node, env) {
                        node.textContent = compiledAttributeValue(env);
                    };
                else
                    return function (node, env) {
                        node.setAttribute(attributeName, compiledAttributeValue(env));
                    };
            });
            return function (node, env) {
                compiledAttributes.forEach(function (compiledAttribute) {
                    compiledAttribute(node, env);
                });
            };
        };

        function compileChildren (node) {
            var compiledChildren = Array.prototype.map.call(node.childNodes, compile);
            return function (node, env) {
                compiledChildren.forEach(function (compiledChild) {
                    node.appendChild(compiledChild(env));
                });
            }
        };

        function compileElement (node) {
            var nodeType = node.localName;
            var compiledAttributes = compileAttributes(node);
            var compiledChildren = compileChildren(node);
            return function (env) {
                var newNode = document.createElement(nodeType);
                compiledAttributes(newNode, env);
                compiledChildren(newNode, env);
                return newNode;
            }
        };

        function compileFragment (node) {
            var compiledChildren = compileChildren(node);
            return function (env) {
                var fragment = new DocumentFragment();
                compiledChildren(fragment, env);
                return fragment;
            }
        };

        function compile (node) {
            switch (node.nodeType)
            {
                case Node.ELEMENT_NODE:
                return compileElement(node);

                case Node.TEXT_NODE:
                return function () {
                    return new Text(node.data);
                }

                case Node.DOCUMENT_FRAGMENT_NODE:
                return compileFragment(node);

                default:
                throw Error("Template compiler cannot handle node type \"" + node.nodeType + "\".");
            }
        };

        HexstreamSoft.clhs.CompiledTemplate = CompiledTemplate;
    })();

    (function () {
        function StringInputStream (string, position) {
            var stream = this;
            if (position === undefined)
                position = 0;
            stream.string = string;
            stream.position = position;
        }

        StringInputStream.prototype.current = function () {
            return this.string.charAt(this.position);
        };

        StringInputStream.prototype.done = function () {
            return this.position >= this.string.length;
        };

        StringInputStream.prototype.next = function () {
            if (this.done())
                throw Error("Cannot advance further.");
            this.position++;
            return this.current();
        };

        StringInputStream.prototype.unread = function () {
            if (this.position === 0)
                throw Error("Cannot unread while at first position.");
            else
                this.position--;
        };

        StringInputStream.prototype.skip = function (regexp) {
            if (!regexp.global)
                throw Error("skip method requires regexp.global.");
            regexp.lastIndex = this.position;
            var skipCount = regexp.exec(this.string)[0].length;
            this.position = regexp.lastIndex;
            return skipCount;
        };

        StringInputStream.prototype.match = function (regexp) {
            if (!regexp.global)
                throw Error("match method requires regexp.global.");
            regexp.lastIndex = this.position;
            var matched = regexp.exec(this.string)[0];
            this.position = regexp.lastIndex;
            return matched;
        };

        HexstreamSoft.clhs.StringInputStream = StringInputStream;
    })();

})();

var actions = HexstreamSoft.clhs.Action.actionsArray.map(function (action) {
    var neededPermissions = (action.needsPermissions || []).map(function (neededPermission) {
        return "needs-" + neededPermission + "-permission";
    });
    var actionContexts = [];
    action.forEachValidAndInvalidContext(function (context, isValid) {
        actionContexts.push({
            "action-is-valid-in-context": isValid,
            "name": context.name
        });
    });
    return {
        "name": action.name,
        "title": action.title,
        "needed-permissions": neededPermissions,
        "contexts": actionContexts
    };
});

var contextNames = HexstreamSoft.clhs.Context.contextsArray.map(function (context) {
    return context.name;
});

window.addEventListener("DOMContentLoaded", function () {
    function testAction (actionName) {
        HexstreamSoft.clhs.Action.perform(actionName, "Test button");
    }
    var testButtons = document.querySelectorAll(".test-button");
    Array.prototype.forEach.call(testButtons, function (testButton) {
        testButton.addEventListener("click", function (event) {
            event.preventDefault();
            var action = HexstreamSoft.dom.nodeOrAncestorSatisfying(event.target, function (node) {
                return HexstreamSoft.dom.matches(node, "tr");
            }).dataset.action;
            testAction(action);
        });
    });
    var grantTabsPermissionButton = document.querySelector("#grant-tabs-permission-button");
    grantTabsPermissionButton.addEventListener("click", function (event) {
        event.preventDefault();
        chrome.permissions.request({
            permissions: ["tabs"]
        }, function (granted) {
            HexstreamSoft.clhs.permissions["tabs"] = granted ? "granted" : "denied";
        });
    });
    var revokeTabsPermissionButton = document.querySelector("#revoke-tabs-permission-button");
    revokeTabsPermissionButton.addEventListener("click", function (event) {
        event.preventDefault();
        chrome.permissions.remove({
            permissions: ["tabs"]
        }, function (revoked) {
            if (revoked)
                HexstreamSoft.clhs.permissions["tabs"] = "revoked";
            else
                throw Error(chrome.runtime.lastError);
        });
    });
    /*chrome.runtime.getBackgroundPage(function (eventPage) {
        var eventTableBody = document.querySelector("#action-event-log tbody");
        eventPage.eventLog.forEach(function (event) {
            if (event.type !== "performAction")
                return;
            var newTR = eventTableBody.insertRow();
            var invokerTD = newTR.insertCell();
            invokerTD.textContent = event.invoker;
            var activeTabContextTD = newTR.insertCell();
            activeTabContextTD.textContent = event.context;
            var actionPerformedTD = newTR.insertCell();
            actionPerformedTD.textContent = event.actionName;
        });
    });*/
});

/*
var i = 0;

var observer = new MutationObserver(function (records) {
    Array.prototype.forEach.call(records, function (record) {
        var addedElementNodes = Array.prototype.slice.call(record.addedNodes).filter(function (addedNode) {return addedNode.nodeType === Node.ELEMENT_NODE;});
        function format (node) {
            var string = node.tagName.toLowerCase();
            if (node.id)
                string += "#" + node.id;
            return string;
        }
        function childCount (node) {
            return node.querySelectorAll("*").length;
        }
        if (addedElementNodes.length > 0)
        console.log({
            i: ++i,
            target: format(record.target),
            addedNodes: addedElementNodes.map(format).join(", "),
            childCounts: addedElementNodes.map(childCount).join(", ")
        });
    })
});

observer.observe(document.documentElement, {childList: true, subtree: true});
*/

var TokenList = HexstreamSoft.dom.TokenList;

(function () {
    var observer = new MutationObserver(function (records) {
        HexstreamSoft.dom.forEachAddedNode(records, function (addedNode) {
            if (!HexstreamSoft.dom.matches(addedNode, "label"))
                return;
            var control = addedNode.control;
            if (!control || !HexstreamSoft.dom.matches(control, "input[type=radio].replaced"))
                return;
            var form = control.form;
            if (!form)
                return;
            function addListener (eventName, mutationFunction) {
                addedNode.addEventListener(eventName, function () {
                    var relatedRadioButtons = Array.prototype.slice.call(form[control.name]);
                    relatedRadioButtons.forEach(function (radioButton) {
                        var dynamicContext = new TokenList(radioButton, "data-dynamic-context");
                        mutationFunction.call(dynamicContext, "related-radio-button");
                    });
                });
            }
            addListener("mouseenter", TokenList.prototype.add);
            addListener("mouseleave", TokenList.prototype.remove);
        })
    });
    observer.observe(document.documentElement, {childList: true, subtree: true});
})();

(function () {
    var nextAutoCellId = 1;
    var cellCallback = function (addedNode) {
        if (!HexstreamSoft.dom.matches(addedNode, "TH, TD"))
            return;
        var headerIds = HexstreamSoft.dom.parseTokens(addedNode.headers);
        headerIds.forEach(function (headerId) {
            if (addedNode.id === "")
                addedNode.id = "autoCellId_" + nextAutoCellId++;
            var header = document.querySelector("#" + headerId);
            var existingDependentCells = header.dataset.dependentCells;
            header.dataset.dependentCells = existingDependentCells
                ? existingDependentCells + " " + addedNode.id
                : addedNode.id;
        });
        var headerElements = headerIds.map(function (headerId) {
            return document.querySelector("#" + headerId);
        });
        function addListener (eventName, mutationFunction) {
            addedNode.addEventListener(eventName, function () {
                headerElements.forEach(function (headerElement) {
                    var dynamicContext = new TokenList(headerElement, "data-dynamic-context");
                    mutationFunction.call(dynamicContext, "parent-of-hovered");
                });
                var dependentCells = addedNode.dataset.dependentCells;
                HexstreamSoft.dom.parseTokens(dependentCells || "").forEach(function (dependentCellId) {
                    var dynamicContext = new TokenList(document.querySelector("#" + dependentCellId),
                                                       "data-dynamic-context");
                    mutationFunction.call(dynamicContext, "child-of-hovered");
                });
            });
        }
        addListener("mouseenter", TokenList.prototype.add);
        addListener("mouseleave", TokenList.prototype.remove);
    };
    var cellsObserver = new MutationObserver(function (records) {
        HexstreamSoft.dom.forEachAddedNode(records, cellCallback);
    });
    var headersXrefObserver = new MutationObserver(function (records) {
        HexstreamSoft.dom.forEachAddedNode(records, function (addedNode) {
            if (HexstreamSoft.dom.matches(addedNode, "table.feature_headers-xref"))
            {
                Array.prototype.forEach.call(addedNode.querySelectorAll("*"), cellCallback);
                cellsObserver.observe(addedNode, {childList: true, subtree: true});
            }
        });
    });
    headersXrefObserver.observe(document.documentElement, {childList: true, subtree: true});
})();
