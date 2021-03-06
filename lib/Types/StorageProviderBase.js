'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _index = require('../TypeSystem/index.js');

var _index2 = _interopRequireDefault(_index);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

_index2.default.storageProviders = {
    DbCreationType: {
        Merge: 10,
        DropTableIfChanged: 20,
        DropTableIfChange: 20,
        DropAllExistingTables: 30,
        ErrorIfChange: 40,
        DropDbIfChange: 50
    }
};

_index2.default.ConcurrencyMode = { Fixed: 'fixed', None: 'none' };
_index2.default.Class.define('$data.StorageProviderBase', null, null, {
    constructor: function constructor(schemaConfiguration, context) {
        this.providerConfiguration = schemaConfiguration || {};

        this.name = this.getType().name;
        if (_index2.default.RegisteredStorageProviders) {
            var keys = Object.keys(_index2.default.RegisteredStorageProviders);
            for (var i = 0; i < keys.length; i++) {
                if (this instanceof _index2.default.RegisteredStorageProviders[keys[i]]) {
                    this.name = keys[i];
                    break;
                }
            }
        }
    },
    providers: {},
    supportedDataTypes: { value: [], writable: false },
    initializeStore: function initializeStore(callBack) {
        _index.Guard.raise("Pure class");
    },

    executeQuery: function executeQuery(queryable, callBack) {
        _index.Guard.raise("Pure class");
    },
    loadRawData: function loadRawData(tableName, callBack) {
        callBack = _index2.default.PromiseHandlerBase.createCallbackSettings(callBack);
        callBack.error(new _index.Exception('loadRawData is not supported', 'Invalid Operation'));
    },

    buildIndependentBlocks: function buildIndependentBlocks(changedItems) {
        /// <summary>
        /// Build and processes a dependency graph from the changed items,
        /// and generates blocks that can be inserted to the database sequentially.
        /// </summary>
        /// <param name="changedItems">Array of changed items to build independent blocks from.</param>
        var edgesTo = [];
        var edgesFrom = [];

        function hasOwnProperty(obj) {
            /// <summary>
            /// Returns true if object has own property (used for 'hashset'-like objects)
            /// </summary>
            /// <param name="obj">Target object</param>
            /// <returns>True if the object has own property</returns>
            for (var p in obj) {
                if (obj.hasOwnProperty(p)) return true;
            }
            return false;
        }

        // Building edgesTo and edgesFrom arrays (containing only indeces of items in changedItems array.
        for (var i = 0; i < changedItems.length; i++) {
            var current = changedItems[i];
            if (!current.dependentOn || current.dependentOn.length == 0) {
                // This item is independent
                continue;
            }

            var to = null;
            // Iterating over items 'current' depends on
            for (var j = 0; j < current.dependentOn.length; j++) {
                var currentDependency = current.dependentOn[j];
                if (currentDependency.entityState == _index2.default.EntityState.Unchanged) {
                    continue;
                }
                to = to || {};
                // Getting the index of current dependency
                var ixDependendOn = -1;
                for (var k = 0; k < changedItems.length; k++) {
                    if (changedItems[k].data == currentDependency) {
                        ixDependendOn = k;
                        changedItems[k].referredBy = changedItems[k].referredBy || [];
                        changedItems[k].referredBy.push(current.data);
                        break;
                    }
                }
                // Sanity check
                if (ixDependendOn == -1) {
                    _index.Guard.raise(new _index.Exception('Dependent object not found', 'ObjectNotFound', current.dependentOn[j]));
                }
                // Setting edge in 'to' array
                to[ixDependendOn] = true;
                // Setting edge in 'from' array
                var from = edgesFrom[ixDependendOn] || {};
                from[i] = true;
                edgesFrom[ixDependendOn] = from;
            }
            // Persisting found edges in edgesTo array
            if (to !== null) edgesTo[i] = to;
        }

        // Array of sequentialyl independent blocks (containing objects, not just their id's)
        var independentBlocks = [];
        // Objects getting their dependency resolved in the current cycle.
        var currentBlock = [];
        // Filling currentBlock with initially independent objects.
        for (var x = 0; x < changedItems.length; x++) {
            if (!edgesTo.hasOwnProperty(x)) {
                currentBlock.push(x);
            }
        }
        while (currentBlock.length > 0) {
            // Shifting currentBlock to cbix,
            // and clearing currentBlock for next independent block
            var cbix = [].concat(currentBlock);
            currentBlock = [];
            // Iterating over previous independent block, to generate the new one
            for (var b = 0; b < cbix.length; b++) {
                var dependentNodes = edgesFrom[cbix[b]];
                if (typeof dependentNodes !== 'undefined') {
                    for (var d in dependentNodes) {
                        // Removing edge from 'edgesTo'
                        delete edgesTo[d][cbix[b]];
                        // Check if has any more dependency
                        if (!hasOwnProperty(edgesTo[d])) {
                            // It doesn't, so let's clean up a bit
                            delete edgesTo[d];
                            // and push the item to 'currentBlock'
                            currentBlock.push(d);
                        }
                    }
                }
                // Clearing processed item from 'edgesFrom'
                delete edgesFrom[cbix[b]];
            }
            // Push cbix t to independentBlocks
            var cb = [];
            for (var c = 0; c < cbix.length; c++) {
                var item = changedItems[cbix[c]];
                if (item.data.entityState != _index2.default.EntityState.Unchanged) cb.push(item);
            }
            if (cb.length > 0) independentBlocks.push(cb);
        }
        return independentBlocks;
    },
    getTraceString: function getTraceString(queryable) {
        _index.Guard.raise("Pure class");
    },
    setContext: function setContext(ctx) {
        this.context = ctx;
    },

    _buildContinuationFunction: function _buildContinuationFunction(context, query) {
        if (Array.isArray(query.result)) {
            query.result.next = this._buildPagingMethod(context, query, 'next');
            query.result.prev = this._buildPagingMethod(context, query, 'prev');
        }
    },
    _buildPagingMethod: function _buildPagingMethod(context, query, mode) {
        return function (onResult_items) {
            var pHandler = new _index2.default.PromiseHandler();
            var cbWrapper = pHandler.createCallback(onResult_items);

            var continuation = new _index2.default.Expressions.ContinuationExpressionBuilder(mode);
            var continuationResult = continuation.compile(query);
            if (continuationResult.expression) {
                var queryable = _index.Container.createQueryable(context, continuationResult.expression);
                queryable.defaultType = query.defaultType;
                context.executeQuery(queryable, cbWrapper);
            } else {
                cbWrapper.error(new _index.Exception(continuationResult.message, 'Invalid Operation', continuationResult));
            }

            return pHandler.getPromise();
        };
    },

    buildDbType_modifyInstanceDefinition: function buildDbType_modifyInstanceDefinition(instanceDefinition, storageModel) {
        var buildDbType_copyPropertyDefinition = function buildDbType_copyPropertyDefinition(propertyDefinition, refProp) {
            var cPropertyDef;
            if (refProp) {
                cPropertyDef = JSON.parse(JSON.stringify(instanceDefinition[refProp]));
                cPropertyDef.kind = propertyDefinition.kind;
                cPropertyDef.name = propertyDefinition.name;
                cPropertyDef.notMapped = false;
            } else {
                cPropertyDef = JSON.parse(JSON.stringify(propertyDefinition));
            }

            cPropertyDef.dataType = _index.Container.resolveType(propertyDefinition.dataType);
            cPropertyDef.type = cPropertyDef.dataType;
            cPropertyDef.key = false;
            cPropertyDef.computed = false;
            return cPropertyDef;
        };
        var buildDbType_createConstrain = function buildDbType_createConstrain(foreignType, dataType, propertyName, prefix, keyPropertyName) {
            var constrain = new Object();
            constrain[foreignType.name] = propertyName;
            constrain[dataType.name] = keyPropertyName ? keyPropertyName : prefix + '__' + propertyName;
            return constrain;
        };

        if (storageModel.Associations) {
            storageModel.Associations.forEach(function (association) {
                var addToEntityDef = false;
                var foreignType = association.FromType;
                var dataType = association.ToType;
                var foreignPropName = association.ToPropertyName;

                var memDef = association.FromType.getMemberDefinition(association.FromPropertyName);
                var keyProperties = [];
                if (memDef && typeof memDef.keys === "string" && memDef.keys) {
                    keyProperties = [memDef.keys];
                } else if (memDef && Array.isArray(memDef.keys)) {
                    keyProperties = [].concat(memDef.keys);
                } else if (memDef && typeof memDef.foreignKeys === "string" && memDef.foreignKeys) {
                    keyProperties = [memDef.foreignKeys];
                } else if (memDef && Array.isArray(memDef.foreignKeys)) {
                    keyProperties = [].concat(memDef.foreignKeys);
                }

                association.ReferentialConstraint = association.ReferentialConstraint || [];

                if ((association.FromMultiplicity == "*" || association.FromMultiplicity == "$$unbound") && association.ToMultiplicity == "0..1" || association.FromMultiplicity == "0..1" && association.ToMultiplicity == "1") {
                    foreignType = association.ToType;
                    dataType = association.FromType;
                    foreignPropName = association.FromPropertyName;
                    addToEntityDef = true;
                }

                foreignType.memberDefinitions.getPublicMappedProperties().filter(function (d) {
                    return d.key;
                }).forEach(function (d, i) {
                    var constraint = buildDbType_createConstrain(foreignType, dataType, d.name, foreignPropName, keyProperties[i]);
                    if (addToEntityDef) {
                        //instanceDefinition[foreignPropName + '__' + d.name] = buildDbType_copyPropertyDefinition(d, foreignPropName);
                        instanceDefinition[constraint[dataType.name]] = buildDbType_copyPropertyDefinition(d, foreignPropName);

                        var dependentMemDef = dataType.getMemberDefinition(keyProperties[i]);
                        if (dependentMemDef) {
                            dependentMemDef.isDependentProperty = true;
                            dependentMemDef.navigationPropertyName = association.FromPropertyName;
                        }
                    }
                    association.ReferentialConstraint.push(constraint);
                }, this);
            }, this);
        }
        //Copy complex type properties
        if (storageModel.ComplexTypes) {
            storageModel.ComplexTypes.forEach(function (complexType) {
                complexType.ReferentialConstraint = complexType.ReferentialConstraint || [];

                complexType.ToType.memberDefinitions.getPublicMappedProperties().forEach(function (d) {
                    if (d.inverseProperty) {
                        var type = _index.Container.resolveType(d.type);
                        if (type.isAssignableTo && type.isAssignableTo(_index2.default.Entity)) {
                            var keyProp = type.memberDefinitions.getPublicMappedProperties().filter(function (p) {
                                return p.key;
                            })[0];

                            var keyPropName = d.keys && d.keys[0] || d.name + '__' + keyProp.name;

                            if (!instanceDefinition[complexType.FromPropertyName + '__' + keyPropName]) {
                                instanceDefinition[complexType.FromPropertyName + '__' + keyPropName] = buildDbType_copyPropertyDefinition(keyProp);
                            }

                            var constraint = { complexNavProperty: true };
                            constraint[complexType.ToType.name] = d.name + '.' + keyProp.name;
                            constraint[complexType.FromType.name] = complexType.FromPropertyName + '__' + keyPropName;
                            complexType.ReferentialConstraint.push(constraint);
                        }
                    } else {
                        instanceDefinition[complexType.FromPropertyName + '__' + d.name] = buildDbType_copyPropertyDefinition(d);
                        instanceDefinition[complexType.FromPropertyName + '__' + d.name].complexType = complexType;

                        complexType.ReferentialConstraint.push(buildDbType_createConstrain(complexType.ToType, complexType.FromType, d.name, complexType.FromPropertyName));
                    }
                }, this);
            }, this);
        }
    },
    buildDbType_generateConvertToFunction: function buildDbType_generateConvertToFunction(storageModel) {
        return function (logicalEntity) {
            var dbInstance = new storageModel.PhysicalType();
            dbInstance.entityState = logicalEntity.entityState;

            //logicalEntity.changedProperties.forEach(function(memberDef){
            //}, this);
            storageModel.PhysicalType.memberDefinitions.getPublicMappedProperties().forEach(function (property) {
                if (logicalEntity[property.name] !== undefined) {
                    dbInstance[property.name] = logicalEntity[property.name];
                }
            }, this);

            var getProp = function getProp(container, path, throwWhenNoValue) {
                var p = path.split(".");
                var holder = container;
                for (var i = 0; i < p.length; i++) {
                    holder = holder[p[i]];
                    if (!holder) {
                        if (throwWhenNoValue) throw 'no value';
                        return holder;
                    }
                }

                return holder;
            };

            var setProp = function setProp(dbInstance, complexInstance, constrain, mapping) {
                var value = dbInstance[constrain[mapping.From]];
                try {
                    if (!constrain.complexNavProperty || typeof value === "undefined") {
                        value = getProp(complexInstance, constrain[mapping.To], constrain.complexNavProperty);
                    }
                } catch (e) {
                    return;
                }

                dbInstance[constrain[mapping.From]] = value;
            };

            if (storageModel.Associations) {
                storageModel.Associations.forEach(function (association) {
                    if (association.FromMultiplicity == "*" && association.ToMultiplicity == "0..1" || association.FromMultiplicity == "0..1" && association.ToMultiplicity == "1") {
                        var complexInstance = logicalEntity[association.FromPropertyName];
                        if (complexInstance !== undefined) {
                            association.ReferentialConstraint.forEach(function (constrain) {
                                if (complexInstance !== null && (logicalEntity && !logicalEntity.changedProperties || logicalEntity && logicalEntity.changedProperties && !logicalEntity.changedProperties.some(function (md) {
                                    return md.name == constrain[association.From];
                                }))) {
                                    dbInstance[constrain[association.From]] = getProp(complexInstance, constrain[association.To]);
                                } else if (_index.Guard.isNullOrUndefined(logicalEntity[constrain[association.From]])) {
                                    dbInstance[constrain[association.From]] = null;
                                }
                            }, this);
                        }
                    }
                }, this);
            }
            if (storageModel.ComplexTypes) {
                storageModel.ComplexTypes.forEach(function (cmpType) {
                    var complexInstance = logicalEntity[cmpType.FromPropertyName];
                    if (complexInstance !== undefined) {
                        cmpType.ReferentialConstraint.forEach(function (constrain) {
                            if (complexInstance !== null && (logicalEntity && !logicalEntity.changedProperties || logicalEntity && logicalEntity.changedProperties && !logicalEntity.changedProperties.some(function (md) {
                                return md.name == constrain[cmpType.From];
                            }))) {
                                setProp(dbInstance, complexInstance, constrain, cmpType);
                                // dbInstance[constrain[cmpType.From]] = getProp(complexInstance, constrain[cmpType.To]);
                            } else if (_index.Guard.isNullOrUndefined(logicalEntity[constrain[association.From]])) {
                                dbInstance[constrain[cmpType.From]] = null;
                            }
                        }, this);
                    }
                }, this);
            }
            return dbInstance;
        };
    },

    bulkInsert: function bulkInsert(a, b, c, callback) {
        callback.error(new _index.Exception('Not Implemented'));
    },

    supportedFieldOperations: {
        value: {
            length: { dataType: "number", allowedIn: "filter, map" },
            substr: { dataType: "string", allowedIn: "filter", parameters: [{ name: "startFrom", dataType: "number" }, { name: "length", dataType: "number" }] },
            toLowerCase: { dataType: "string" }
        },
        enumerable: true,
        writable: true
    },

    resolveFieldOperation: function resolveFieldOperation(operationName, expression, frameType) {
        ///<summary></summary>
        var result = this.supportedFieldOperations[operationName];
        if (Array.isArray(result)) {
            var i = 0;
            for (; i < result.length; i++) {
                if (result[i].allowedType === 'default' || _index.Container.resolveType(result[i].allowedType) === _index.Container.resolveType(expression.selector.memberDefinition.type) && frameType && result[i].allowedIn && (Array.isArray(result[i].allowedIn) && result[i].allowedIn.some(function (type) {
                    return frameType === _index.Container.resolveType(type);
                }) || !Array.isArray(result[i].allowedIn) && frameType === _index.Container.resolveType(result[i].allowedIn))) {
                    result = result[i];
                    break;
                }
            }
            if (i === result.length) {
                result = undefined;
            }
        }

        if (!result) {
            _index.Guard.raise(new _index.Exception("Field operation '" + operationName + "' is not supported by the provider"));
        };
        if (frameType && result.allowedIn) {
            if (result.allowedIn instanceof Array && !result.allowedIn.some(function (type) {
                return frameType === _index.Container.resolveType(type);
            }) || !(result.allowedIn instanceof Array) && frameType !== _index.Container.resolveType(result.allowedIn)) {
                _index.Guard.raise(new _index.Exception(operationName + " not supported in: " + frameType.name));
            }
        }
        result.name = operationName;
        return result;
    },

    supportedBinaryOperators: {
        value: {
            equal: { mapTo: 'eq', dataType: "boolean" }
        },
        enumerable: true,
        writable: true
    },

    resolveBinaryOperator: function resolveBinaryOperator(operator, expression, frameType) {
        var result = this.supportedBinaryOperators[operator];
        if (!result) {
            _index.Guard.raise(new _index.Exception("Binary operator '" + operator + "' is not supported by the provider"));
        };
        if (frameType && result.allowedIn) {
            if (result.allowedIn instanceof Array && !result.allowedIn.some(function (type) {
                return frameType === _index.Container.resolveType(type);
            }) || !(result.allowedIn instanceof Array) && frameType !== _index.Container.resolveType(result.allowedIn)) {
                _index.Guard.raise(new _index.Exception(operator + " not supported in: " + frameType.name));
            }
        }
        result.name = operator;
        return result;
    },

    supportedUnaryOperators: {
        value: {
            not: { mapTo: 'not' }
        },
        enumerable: true,
        writable: true
    },
    resolveUnaryOperator: function resolveUnaryOperator(operator, expression, frameType) {
        var result = this.supportedUnaryOperators[operator];
        if (!result) {
            _index.Guard.raise(new _index.Exception("Unary operator '" + operator + "' is not supported by the provider"));
        };
        if (frameType && result.allowedIn) {
            if (result.allowedIn instanceof Array && !result.allowedIn.some(function (type) {
                return frameType === _index.Container.resolveType(type);
            }) || !(result.allowedIn instanceof Array) && frameType !== _index.Container.resolveType(result.allowedIn)) {
                _index.Guard.raise(new _index.Exception(operator + " not supported in: " + frameType.name));
            }
        }
        result.name = operator;
        return result;
    },

    supportedSetOperations: {
        value: {
            toArray: { invokable: true, allowedIn: [] }
        },
        enumerable: true,
        writable: true
    },
    resolveSetOperations: function resolveSetOperations(operation, expression, frameType) {
        var result = this.supportedSetOperations[operation];
        if (!result) {
            _index.Guard.raise(new _index.Exception("Operation '" + operation + "' is not supported by the provider"));
        };
        var allowedIn = result.allowedIn || [];
        if (frameType && allowedIn) {
            if (allowedIn instanceof Array && !allowedIn.some(function (type) {
                return frameType === _index.Container.resolveType(type);
            }) || !(allowedIn instanceof Array) && frameType !== _index.Container.resolveType(allowedIn)) {
                _index.Guard.raise(new _index.Exception(operation + " not supported in: " + frameType.name));
            }
        }
        return result;
    },

    resolveTypeOperations: function resolveTypeOperations(operation, expression, frameType) {
        _index.Guard.raise(new _index.Exception("Entity '" + expression.entityType.name + "' Operation '" + operation + "' is not supported by the provider"));
    },

    resolveContextOperations: function resolveContextOperations(operation, expression, frameType) {
        _index.Guard.raise(new _index.Exception("Context '" + expression.instance.getType().name + "' Operation '" + operation + "' is not supported by the provider"));
    },

    makePhysicalTypeDefinition: function makePhysicalTypeDefinition(entityDefinition, association) {},

    _beginTran: function _beginTran(tables, isWrite, callBack) {
        callBack.success(new _index2.default.Transaction());
    },

    getFieldUrl: function getFieldUrl() {
        return '#';
    },

    supportedAutoincrementKeys: {
        value: {}
    }
}, {
    onRegisterProvider: { value: new _index2.default.Event() },
    registerProvider: function registerProvider(name, provider) {
        this.onRegisterProvider.fire({ name: name, provider: provider }, this);
        _index2.default.RegisteredStorageProviders = _index2.default.RegisteredStorageProviders || [];
        _index2.default.RegisteredStorageProviders[name] = provider;
    },
    getProvider: function getProvider(name) {
        var provider = _index2.default.RegisteredStorageProviders[name];
        if (!provider) console.warn("Provider not found: '" + name + "'");
        return provider;
        /*var provider = $data.RegisteredStorageProviders[name];
        if (!provider)
            Guard.raise(new Exception("Provider not found: '" + name + "'", "Not Found"));
        return provider;*/
    },
    isSupported: {
        get: function get() {
            return true;
        },
        set: function set() {}
    }
});

exports.default = _index2.default;
module.exports = exports['default'];