/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 21:
/*!**********************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/NotificationFactories.js ***!
  \**********************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   COMPLETE_NOTIFICATION: () => (/* binding */ COMPLETE_NOTIFICATION),
/* harmony export */   createNotification: () => (/* binding */ createNotification),
/* harmony export */   errorNotification: () => (/* binding */ errorNotification),
/* harmony export */   nextNotification: () => (/* binding */ nextNotification)
/* harmony export */ });
const COMPLETE_NOTIFICATION = (() => createNotification('C', undefined, undefined))();
function errorNotification(error) {
  return createNotification('E', undefined, error);
}
function nextNotification(value) {
  return createNotification('N', value, undefined);
}
function createNotification(kind, value, error) {
  return {
    kind,
    value,
    error
  };
}
//# sourceMappingURL=NotificationFactories.js.map

/***/ }),

/***/ 1026:
/*!*******************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/config.js ***!
  \*******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   config: () => (/* binding */ config)
/* harmony export */ });
const config = {
  onUnhandledError: null,
  onStoppedNotification: null,
  Promise: undefined,
  useDeprecatedSynchronousErrorHandling: false,
  useDeprecatedNextContext: false
};
//# sourceMappingURL=config.js.map

/***/ }),

/***/ 1203:
/*!**********************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/util/pipe.js ***!
  \**********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   pipe: () => (/* binding */ pipe),
/* harmony export */   pipeFromArray: () => (/* binding */ pipeFromArray)
/* harmony export */ });
/* harmony import */ var _identity__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./identity */ 3669);

function pipe(...fns) {
  return pipeFromArray(fns);
}
function pipeFromArray(fns) {
  if (fns.length === 0) {
    return _identity__WEBPACK_IMPORTED_MODULE_0__.identity;
  }
  if (fns.length === 1) {
    return fns[0];
  }
  return function piped(input) {
    return fns.reduce((prev, fn) => fn(prev), input);
  };
}
//# sourceMappingURL=pipe.js.map

/***/ }),

/***/ 1853:
/*!**********************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/util/createErrorClass.js ***!
  \**********************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createErrorClass: () => (/* binding */ createErrorClass)
/* harmony export */ });
function createErrorClass(createImpl) {
  const _super = instance => {
    Error.call(instance);
    instance.stack = new Error().stack;
  };
  const ctorFunc = createImpl(_super);
  ctorFunc.prototype = Object.create(Error.prototype);
  ctorFunc.prototype.constructor = ctorFunc;
  return ctorFunc;
}
//# sourceMappingURL=createErrorClass.js.map

/***/ }),

/***/ 1985:
/*!***********************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/Observable.js ***!
  \***********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Observable: () => (/* binding */ Observable)
/* harmony export */ });
/* harmony import */ var _Subscriber__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./Subscriber */ 2998);
/* harmony import */ var _Subscription__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Subscription */ 3961);
/* harmony import */ var _symbol_observable__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./symbol/observable */ 3494);
/* harmony import */ var _util_pipe__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./util/pipe */ 1203);
/* harmony import */ var _config__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./config */ 1026);
/* harmony import */ var _util_isFunction__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./util/isFunction */ 8071);
/* harmony import */ var _util_errorContext__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./util/errorContext */ 9786);







let Observable = /*#__PURE__*/(() => {
  class Observable {
    constructor(subscribe) {
      if (subscribe) {
        this._subscribe = subscribe;
      }
    }
    lift(operator) {
      const observable = new Observable();
      observable.source = this;
      observable.operator = operator;
      return observable;
    }
    subscribe(observerOrNext, error, complete) {
      const subscriber = isSubscriber(observerOrNext) ? observerOrNext : new _Subscriber__WEBPACK_IMPORTED_MODULE_0__.SafeSubscriber(observerOrNext, error, complete);
      (0,_util_errorContext__WEBPACK_IMPORTED_MODULE_6__.errorContext)(() => {
        const {
          operator,
          source
        } = this;
        subscriber.add(operator ? operator.call(subscriber, source) : source ? this._subscribe(subscriber) : this._trySubscribe(subscriber));
      });
      return subscriber;
    }
    _trySubscribe(sink) {
      try {
        return this._subscribe(sink);
      } catch (err) {
        sink.error(err);
      }
    }
    forEach(next, promiseCtor) {
      promiseCtor = getPromiseCtor(promiseCtor);
      return new promiseCtor((resolve, reject) => {
        const subscriber = new _Subscriber__WEBPACK_IMPORTED_MODULE_0__.SafeSubscriber({
          next: value => {
            try {
              next(value);
            } catch (err) {
              reject(err);
              subscriber.unsubscribe();
            }
          },
          error: reject,
          complete: resolve
        });
        this.subscribe(subscriber);
      });
    }
    _subscribe(subscriber) {
      var _a;
      return (_a = this.source) === null || _a === void 0 ? void 0 : _a.subscribe(subscriber);
    }
    [_symbol_observable__WEBPACK_IMPORTED_MODULE_2__.observable]() {
      return this;
    }
    pipe(...operations) {
      return (0,_util_pipe__WEBPACK_IMPORTED_MODULE_3__.pipeFromArray)(operations)(this);
    }
    toPromise(promiseCtor) {
      promiseCtor = getPromiseCtor(promiseCtor);
      return new promiseCtor((resolve, reject) => {
        let value;
        this.subscribe(x => value = x, err => reject(err), () => resolve(value));
      });
    }
  }
  Observable.create = subscribe => {
    return new Observable(subscribe);
  };
  return Observable;
})();
function getPromiseCtor(promiseCtor) {
  var _a;
  return (_a = promiseCtor !== null && promiseCtor !== void 0 ? promiseCtor : _config__WEBPACK_IMPORTED_MODULE_4__.config.Promise) !== null && _a !== void 0 ? _a : Promise;
}
function isObserver(value) {
  return value && (0,_util_isFunction__WEBPACK_IMPORTED_MODULE_5__.isFunction)(value.next) && (0,_util_isFunction__WEBPACK_IMPORTED_MODULE_5__.isFunction)(value.error) && (0,_util_isFunction__WEBPACK_IMPORTED_MODULE_5__.isFunction)(value.complete);
}
function isSubscriber(value) {
  return value && value instanceof _Subscriber__WEBPACK_IMPORTED_MODULE_0__.Subscriber || isObserver(value) && (0,_Subscription__WEBPACK_IMPORTED_MODULE_1__.isSubscription)(value);
}
//# sourceMappingURL=Observable.js.map

/***/ }),

/***/ 2405:
/*!******************************************************************!*\
  !*** ./src/app/shared/layouts/utils/runtime-graph-normalizer.ts ***!
  \******************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   buildRuntimeGraphSnapshot: () => (/* binding */ buildRuntimeGraphSnapshot),
/* harmony export */   runtimeSnapshotToLayoutGraph: () => (/* binding */ runtimeSnapshotToLayoutGraph)
/* harmony export */ });
const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 120;
const containmentTypes = new Set(['CONTAINS', 'HAS_CHILD', 'HAS_COMPONENT', 'PARENT_OF']);
function asRecord(value) {
  if (typeof value === 'object' && value !== null) {
    return value;
  }
  return {};
}
function extractGuid(value) {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object') {
    return value.GUID ?? value.guid ?? value.id ?? value.toString();
  }
  return undefined;
}
function buildRuntimeGraphSnapshot(input) {
  const nodes = new Map();
  const parentByChild = new Map();
  const worldPositions = new Map();
  input.entities.forEach(entity => {
    const properties = asRecord(entity.properties);
    const guid = extractGuid(entity.id ?? properties['GUID']);
    if (!guid) {
      return;
    }
    const role = properties['role'] || properties['type'] || properties['category'] || 'node';
    const display = asRecord(entity.display ?? properties['display']);
    const position = asRecord(entity.position ?? {});
    const displayBadges = display['badges'];
    const propertyBadges = properties['badges'];
    const badges = Array.isArray(displayBadges) ? displayBadges : Array.isArray(propertyBadges) ? propertyBadges : undefined;
    const worldX = typeof position['x'] === 'number' ? position['x'] : typeof properties['x'] === 'number' ? properties['x'] : undefined;
    const worldY = typeof position['y'] === 'number' ? position['y'] : typeof properties['y'] === 'number' ? properties['y'] : undefined;
    const parentCandidate = entity.parent_guid ?? entity.parentGuid ?? entity.parentGUID ?? entity.parent ?? properties['parent_guid'] ?? properties['parentGuid'] ?? properties['parentGUID'] ?? properties['parent'];
    const node = {
      guid,
      id: String(properties['id'] ?? guid),
      name: String(properties['name'] ?? properties['label'] ?? guid),
      type: String(properties['type'] ?? role ?? 'node'),
      role: typeof role === 'string' ? role : undefined,
      parentGuid: extractGuid(parentCandidate),
      width: typeof display['width'] === 'number' ? display['width'] : undefined,
      height: typeof display['height'] === 'number' ? display['height'] : undefined,
      x: worldX,
      y: worldY,
      style: {
        fill: display['color'] ?? properties['color'],
        stroke: display['border_color'] ?? properties['stroke'],
        icon: display['icon'] ?? properties['icon'],
        badges: badges,
        labelVisible: display['label_visible'] ?? properties['labelVisible']
      },
      metadata: {
        ...properties,
        displayMode: properties['displayMode'],
        labels: entity.labels ?? []
      }
    };
    nodes.set(guid, node);
    if (typeof worldX === 'number' && typeof worldY === 'number') {
      worldPositions.set(guid, {
        x: worldX,
        y: worldY
      });
    }
  });
  input.relationships.forEach(rel => {
    if (!containmentTypes.has(rel.type)) {
      return;
    }
    const from = extractGuid(rel.fromGUID ?? rel.source_guid ?? rel.source);
    const to = extractGuid(rel.toGUID ?? rel.target_guid ?? rel.target);
    if (from && to && nodes.has(to)) {
      parentByChild.set(to, from);
    }
  });
  const rootIds = [];
  nodes.forEach(node => {
    const explicitParent = node.parentGuid && nodes.has(node.parentGuid);
    const containmentParent = parentByChild.get(node.guid);
    node.parentGuid = containmentParent ?? (explicitParent ? node.parentGuid : undefined);
  });
  nodes.forEach(node => {
    if (!node.parentGuid || !nodes.has(node.parentGuid)) {
      rootIds.push(node.guid);
    }
  });
  const assignDefaultPositions = (ids, startX, startY) => {
    const spacing = 320;
    ids.forEach((guid, index) => {
      if (!worldPositions.has(guid)) {
        worldPositions.set(guid, {
          x: startX + index * spacing,
          y: startY
        });
      }
    });
  };
  assignDefaultPositions(rootIds, 0, 0);
  const computeWorldPosition = guid => {
    const existing = worldPositions.get(guid);
    if (existing) {
      return existing;
    }
    const node = nodes.get(guid);
    if (!node) {
      const fallback = {
        x: 0,
        y: 0
      };
      worldPositions.set(guid, fallback);
      return fallback;
    }
    if (node.parentGuid && nodes.has(node.parentGuid)) {
      const parentWorld = computeWorldPosition(node.parentGuid);
      const relativeX = typeof node.x === 'number' ? node.x : 0;
      const relativeY = typeof node.y === 'number' ? node.y : 0;
      const derived = {
        x: parentWorld.x + relativeX,
        y: parentWorld.y + relativeY
      };
      worldPositions.set(guid, derived);
      return derived;
    }
    const derived = {
      x: 0,
      y: 0
    };
    worldPositions.set(guid, derived);
    return derived;
  };
  nodes.forEach((_node, guid) => {
    computeWorldPosition(guid);
  });
  nodes.forEach(node => {
    const world = worldPositions.get(node.guid) ?? {
      x: 0,
      y: 0
    };
    if (node.parentGuid && worldPositions.has(node.parentGuid)) {
      const parentWorld = worldPositions.get(node.parentGuid);
      node.x = world.x - parentWorld.x;
      node.y = world.y - parentWorld.y;
    } else {
      node.x = world.x;
      node.y = world.y;
    }
    node.metadata = {
      ...(node.metadata ?? {}),
      worldPosition: {
        x: world.x,
        y: world.y
      }
    };
  });
  const edges = [];
  input.relationships.forEach(rel => {
    const properties = asRecord(rel.properties);
    const from = extractGuid(rel.fromGUID ?? rel.source_guid ?? rel.source);
    const to = extractGuid(rel.toGUID ?? rel.target_guid ?? rel.target);
    if (!from || !to) {
      return;
    }
    const style = asRecord(rel.display);
    edges.push({
      id: rel.id ?? `${rel.type}-${from}-${to}`,
      from,
      to,
      type: rel.type,
      style: {
        stroke: style['color'] ?? properties['color'],
        strokeWidth: style['width'] ?? properties['width'],
        strokeDashArray: style['dash'] ?? properties['dash'],
        label: style['label'] ?? properties['label'],
        labelVisible: style['label_visible'] ?? properties['labelVisible']
      },
      metadata: {
        ...properties,
        relationType: rel.type
      }
    });
  });
  return {
    nodes,
    edges,
    rootIds
  };
}
function runtimeSnapshotToLayoutGraph(snapshot) {
  const layoutNodes = {};
  const layoutEdges = {};
  const childLists = new Map();
  const edgeLists = new Map();
  snapshot.nodes.forEach((node, guid) => {
    const width = node.width ?? DEFAULT_NODE_WIDTH;
    const height = node.height ?? DEFAULT_NODE_HEIGHT;
    childLists.set(guid, []);
    edgeLists.set(guid, []);
    const metadata = {
      role: node.role,
      display: node.style,
      ...node.metadata
    };
    layoutNodes[guid] = {
      id: guid,
      label: node.name,
      type: node.type ?? 'node',
      geometry: {
        x: node.x ?? 0,
        y: node.y ?? 0,
        width,
        height
      },
      state: {
        collapsed: false,
        visible: true,
        selected: false
      },
      metadata,
      children: [],
      edges: []
    };
  });
  snapshot.nodes.forEach(node => {
    if (node.parentGuid && snapshot.nodes.has(node.parentGuid)) {
      const children = childLists.get(node.parentGuid);
      if (children) {
        children.push(node.guid);
      }
    }
  });
  snapshot.edges.forEach(edge => {
    layoutEdges[edge.id] = {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: edge.style?.label ?? '',
      metadata: {
        ...edge.metadata,
        relationType: edge.type,
        style: {
          stroke: edge.style?.stroke,
          strokeWidth: edge.style?.strokeWidth,
          strokeDashArray: edge.style?.strokeDashArray
        },
        labelVisible: edge.style?.labelVisible ?? true
      }
    };
    const fromEdges = edgeLists.get(edge.from);
    if (fromEdges && !fromEdges.includes(edge.id)) {
      fromEdges.push(edge.id);
    }
    const toEdges = edgeLists.get(edge.to);
    if (toEdges && !toEdges.includes(edge.id)) {
      toEdges.push(edge.id);
    }
  });
  Object.entries(layoutNodes).forEach(([guid, node]) => {
    const children = childLists.get(guid) ?? [];
    const edges = edgeLists.get(guid) ?? [];
    layoutNodes[guid] = {
      ...node,
      children: [...children],
      edges: [...edges]
    };
  });
  const metadata = {
    rootIds: snapshot.rootIds,
    layoutVersion: 1,
    displayMode: 'containment-runtime'
  };
  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    metadata
  };
}

/***/ }),

/***/ 2493:
/*!************************************************************!*\
  !*** ./src/app/shared/layouts/core/layout-orchestrator.ts ***!
  \************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   LayoutOrchestrator: () => (/* binding */ LayoutOrchestrator)
/* harmony export */ });
/* harmony import */ var _layout_events__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./layout-events */ 6748);

const PRIORITY_WEIGHT = {
  critical: 3,
  high: 2,
  normal: 1,
  low: 0
};
const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? () => performance.now() : () => Date.now();
class LayoutOrchestrator {
  engines = new Map();
  contexts = new Map();
  queues = new Map();
  activeCanvases = new Set();
  nextCommandId = 1;
  registerEngine(engine) {
    if (this.engines.has(engine.name)) {
      console.warn(`[LayoutOrchestrator] Engine "${engine.name}" already registered; overriding.`);
    }
    this.engines.set(engine.name, engine);
  }
  unregisterEngine(engineName) {
    this.engines.delete(engineName);
  }
  getRegisteredEngines() {
    return Array.from(this.engines.keys());
  }
  getEngine(engineName) {
    return this.engines.get(engineName);
  }
  getEventBus(canvasId) {
    return this.ensureContext(canvasId).eventBus;
  }
  getActiveEngineName(canvasId) {
    return this.ensureContext(canvasId).activeEngineName;
  }
  setActiveEngine(canvasId, engineName, source = 'system') {
    const context = this.ensureContext(canvasId);
    if (context.activeEngineName === engineName) {
      return;
    }
    const engine = this.engines.get(engineName);
    if (!engine) {
      throw new Error(`[LayoutOrchestrator] Engine "${engineName}" is not registered`);
    }
    const previousEngine = context.activeEngineName;
    context.activeEngineName = engine.name;
    context.eventBus.emit({
      type: 'EngineSwitched',
      engineName: engine.name,
      previousEngineName: previousEngine ?? undefined,
      canvasId,
      source,
      timestamp: Date.now()
    });
  }
  scheduleLayout(canvasId, graph, options = {}) {
    const priority = options.priority ?? 'normal';
    return new Promise((resolve, reject) => {
      const command = {
        id: this.nextCommandId++,
        canvasId,
        graph,
        options: {
          ...options,
          priority
        },
        priority,
        enqueuedAt: now(),
        resolve,
        reject
      };
      const queue = this.ensureQueue(canvasId);
      queue.push(command);
      queue.sort(this.compareCommands);
      this.dispatchNext(canvasId);
    });
  }
  runLayout(canvasId, graph, options = {}) {
    const context = this.ensureContext(canvasId);
    const engineName = options.engineName ?? context.activeEngineName;
    if (!engineName) {
      throw new Error(`[LayoutOrchestrator] No active engine set for canvas "${canvasId}"`);
    }
    const engine = this.engines.get(engineName);
    if (!engine) {
      throw new Error(`[LayoutOrchestrator] Engine "${engineName}" is not registered`);
    }
    const previousGraph = context.lastGraph;
    const timestamp = options.timestamp ?? Date.now();
    const source = options.source ?? 'system';
    const telemetry = options.telemetry;
    const payload = this.buildEventPayload(options, telemetry);
    context.eventBus.emit({
      type: 'LayoutRequested',
      engineName: engine.name,
      canvasId,
      source,
      timestamp,
      payload
    });
    const layoutOptions = {
      reason: options.reason ?? 'data-update',
      viewport: options.viewport,
      timestamp,
      previousGraph: previousGraph ?? undefined,
      engineOptions: options.engineOptions
    };
    const start = now();
    const result = engine.layout(graph, layoutOptions);
    const durationMs = now() - start;
    const metrics = {
      ...(result.diagnostics?.metrics ?? {})
    };
    if (telemetry) {
      metrics['queueWaitMs'] = telemetry.queueWaitMs;
      metrics['queueDepth'] = telemetry.queueLength;
      metrics['queuePriority'] = PRIORITY_WEIGHT[telemetry.priority];
    }
    const resultWithDiagnostics = {
      graph: result.graph,
      camera: result.camera,
      diagnostics: {
        ...(result.diagnostics ?? {}),
        durationMs,
        metrics
      }
    };
    context.lastGraph = resultWithDiagnostics.graph;
    context.lastResult = resultWithDiagnostics;
    context.eventBus.emit({
      type: 'LayoutApplied',
      engineName: engine.name,
      canvasId,
      source,
      timestamp,
      result: resultWithDiagnostics
    });
    return resultWithDiagnostics;
  }
  ensureContext(canvasId) {
    let context = this.contexts.get(canvasId);
    if (!context) {
      context = {
        activeEngineName: null,
        eventBus: new _layout_events__WEBPACK_IMPORTED_MODULE_0__.CanvasEventBus(),
        lastGraph: null,
        lastResult: null
      };
      this.contexts.set(canvasId, context);
    }
    return context;
  }
  ensureQueue(canvasId) {
    let queue = this.queues.get(canvasId);
    if (!queue) {
      queue = [];
      this.queues.set(canvasId, queue);
    }
    return queue;
  }
  dispatchNext(canvasId) {
    if (this.activeCanvases.has(canvasId)) {
      return;
    }
    const queue = this.queues.get(canvasId);
    if (!queue || queue.length === 0) {
      return;
    }
    queue.sort(this.compareCommands);
    const command = queue.shift();
    if (!command) {
      return;
    }
    this.activeCanvases.add(canvasId);
    const telemetry = {
      enqueuedAt: command.enqueuedAt,
      queueLength: queue.length,
      queueWaitMs: Math.max(0, now() - command.enqueuedAt),
      priority: command.priority
    };
    Promise.resolve().then(() => this.runLayout(command.canvasId, command.graph, {
      ...command.options,
      telemetry
    })).then(command.resolve).catch(command.reject).finally(() => {
      this.activeCanvases.delete(canvasId);
      if (!queue.length) {
        this.queues.delete(canvasId);
      }
      this.dispatchNext(canvasId);
    });
  }
  compareCommands = (a, b) => {
    const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    return a.enqueuedAt - b.enqueuedAt;
  };
  buildEventPayload(options, telemetry) {
    const payload = {
      ...(options.engineOptions ?? {})
    };
    if (options.priority) {
      payload['priority'] = options.priority;
    }
    if (telemetry) {
      payload['queueWaitMs'] = telemetry.queueWaitMs;
      payload['queueDepth'] = telemetry.queueLength;
      payload['enqueuedAt'] = telemetry.enqueuedAt;
    }
    return Object.keys(payload).length > 0 ? payload : undefined;
  }
}

/***/ }),

/***/ 2998:
/*!***********************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/Subscriber.js ***!
  \***********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   EMPTY_OBSERVER: () => (/* binding */ EMPTY_OBSERVER),
/* harmony export */   SafeSubscriber: () => (/* binding */ SafeSubscriber),
/* harmony export */   Subscriber: () => (/* binding */ Subscriber)
/* harmony export */ });
/* harmony import */ var _util_isFunction__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./util/isFunction */ 8071);
/* harmony import */ var _Subscription__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Subscription */ 3961);
/* harmony import */ var _config__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./config */ 1026);
/* harmony import */ var _util_reportUnhandledError__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./util/reportUnhandledError */ 5334);
/* harmony import */ var _util_noop__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./util/noop */ 5343);
/* harmony import */ var _NotificationFactories__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./NotificationFactories */ 21);
/* harmony import */ var _scheduler_timeoutProvider__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./scheduler/timeoutProvider */ 9270);
/* harmony import */ var _util_errorContext__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./util/errorContext */ 9786);








class Subscriber extends _Subscription__WEBPACK_IMPORTED_MODULE_1__.Subscription {
  constructor(destination) {
    super();
    this.isStopped = false;
    if (destination) {
      this.destination = destination;
      if ((0,_Subscription__WEBPACK_IMPORTED_MODULE_1__.isSubscription)(destination)) {
        destination.add(this);
      }
    } else {
      this.destination = EMPTY_OBSERVER;
    }
  }
  static create(next, error, complete) {
    return new SafeSubscriber(next, error, complete);
  }
  next(value) {
    if (this.isStopped) {
      handleStoppedNotification((0,_NotificationFactories__WEBPACK_IMPORTED_MODULE_5__.nextNotification)(value), this);
    } else {
      this._next(value);
    }
  }
  error(err) {
    if (this.isStopped) {
      handleStoppedNotification((0,_NotificationFactories__WEBPACK_IMPORTED_MODULE_5__.errorNotification)(err), this);
    } else {
      this.isStopped = true;
      this._error(err);
    }
  }
  complete() {
    if (this.isStopped) {
      handleStoppedNotification(_NotificationFactories__WEBPACK_IMPORTED_MODULE_5__.COMPLETE_NOTIFICATION, this);
    } else {
      this.isStopped = true;
      this._complete();
    }
  }
  unsubscribe() {
    if (!this.closed) {
      this.isStopped = true;
      super.unsubscribe();
      this.destination = null;
    }
  }
  _next(value) {
    this.destination.next(value);
  }
  _error(err) {
    try {
      this.destination.error(err);
    } finally {
      this.unsubscribe();
    }
  }
  _complete() {
    try {
      this.destination.complete();
    } finally {
      this.unsubscribe();
    }
  }
}
const _bind = Function.prototype.bind;
function bind(fn, thisArg) {
  return _bind.call(fn, thisArg);
}
class ConsumerObserver {
  constructor(partialObserver) {
    this.partialObserver = partialObserver;
  }
  next(value) {
    const {
      partialObserver
    } = this;
    if (partialObserver.next) {
      try {
        partialObserver.next(value);
      } catch (error) {
        handleUnhandledError(error);
      }
    }
  }
  error(err) {
    const {
      partialObserver
    } = this;
    if (partialObserver.error) {
      try {
        partialObserver.error(err);
      } catch (error) {
        handleUnhandledError(error);
      }
    } else {
      handleUnhandledError(err);
    }
  }
  complete() {
    const {
      partialObserver
    } = this;
    if (partialObserver.complete) {
      try {
        partialObserver.complete();
      } catch (error) {
        handleUnhandledError(error);
      }
    }
  }
}
class SafeSubscriber extends Subscriber {
  constructor(observerOrNext, error, complete) {
    super();
    let partialObserver;
    if ((0,_util_isFunction__WEBPACK_IMPORTED_MODULE_0__.isFunction)(observerOrNext) || !observerOrNext) {
      partialObserver = {
        next: observerOrNext !== null && observerOrNext !== void 0 ? observerOrNext : undefined,
        error: error !== null && error !== void 0 ? error : undefined,
        complete: complete !== null && complete !== void 0 ? complete : undefined
      };
    } else {
      let context;
      if (this && _config__WEBPACK_IMPORTED_MODULE_2__.config.useDeprecatedNextContext) {
        context = Object.create(observerOrNext);
        context.unsubscribe = () => this.unsubscribe();
        partialObserver = {
          next: observerOrNext.next && bind(observerOrNext.next, context),
          error: observerOrNext.error && bind(observerOrNext.error, context),
          complete: observerOrNext.complete && bind(observerOrNext.complete, context)
        };
      } else {
        partialObserver = observerOrNext;
      }
    }
    this.destination = new ConsumerObserver(partialObserver);
  }
}
function handleUnhandledError(error) {
  if (_config__WEBPACK_IMPORTED_MODULE_2__.config.useDeprecatedSynchronousErrorHandling) {
    (0,_util_errorContext__WEBPACK_IMPORTED_MODULE_7__.captureError)(error);
  } else {
    (0,_util_reportUnhandledError__WEBPACK_IMPORTED_MODULE_3__.reportUnhandledError)(error);
  }
}
function defaultErrorHandler(err) {
  throw err;
}
function handleStoppedNotification(notification, subscriber) {
  const {
    onStoppedNotification
  } = _config__WEBPACK_IMPORTED_MODULE_2__.config;
  onStoppedNotification && _scheduler_timeoutProvider__WEBPACK_IMPORTED_MODULE_6__.timeoutProvider.setTimeout(() => onStoppedNotification(notification, subscriber));
}
const EMPTY_OBSERVER = {
  closed: true,
  next: _util_noop__WEBPACK_IMPORTED_MODULE_4__.noop,
  error: defaultErrorHandler,
  complete: _util_noop__WEBPACK_IMPORTED_MODULE_4__.noop
};
//# sourceMappingURL=Subscriber.js.map

/***/ }),

/***/ 3072:
/*!***************************************************!*\
  !*** ./src/app/shared/layouts/engine-registry.ts ***!
  \***************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   registerDefaultLayoutEngines: () => (/* binding */ registerDefaultLayoutEngines)
/* harmony export */ });
/* harmony import */ var _engines_tree_layout_engine__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./engines/tree-layout.engine */ 7579);
/* harmony import */ var _engines_containment_grid_layout_engine__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./engines/containment-grid-layout.engine */ 9136);
/* harmony import */ var _engines_orthogonal_layout_engine__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./engines/orthogonal-layout.engine */ 7548);
/* harmony import */ var _engines_force_layout_engine__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./engines/force-layout.engine */ 6986);
/* harmony import */ var _engines_containment_runtime_layout_engine__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./engines/containment-runtime-layout.engine */ 5456);





function registerDefaultLayoutEngines(orchestrator) {
  orchestrator.registerEngine(new _engines_tree_layout_engine__WEBPACK_IMPORTED_MODULE_0__.TreeLayoutEngine());
  orchestrator.registerEngine(new _engines_containment_grid_layout_engine__WEBPACK_IMPORTED_MODULE_1__.ContainmentGridLayoutEngine());
  orchestrator.registerEngine(new _engines_orthogonal_layout_engine__WEBPACK_IMPORTED_MODULE_2__.OrthogonalLayoutEngine());
  orchestrator.registerEngine(new _engines_force_layout_engine__WEBPACK_IMPORTED_MODULE_3__.ForceLayoutEngine());
  orchestrator.registerEngine(new _engines_containment_runtime_layout_engine__WEBPACK_IMPORTED_MODULE_4__.ContainmentRuntimeLayoutEngine());
  return orchestrator;
}

/***/ }),

/***/ 3494:
/*!******************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/symbol/observable.js ***!
  \******************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   observable: () => (/* binding */ observable)
/* harmony export */ });
const observable = (() => typeof Symbol === 'function' && Symbol.observable || '@@observable')();
//# sourceMappingURL=observable.js.map

/***/ }),

/***/ 3665:
/*!***********************************************************!*\
  !*** ./src/app/shared/layouts/core/layout-graph-utils.ts ***!
  \***********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   canvasDataToLayoutGraph: () => (/* binding */ canvasDataToLayoutGraph),
/* harmony export */   hierarchicalToLayoutGraph: () => (/* binding */ hierarchicalToLayoutGraph),
/* harmony export */   layoutGraphToHierarchical: () => (/* binding */ layoutGraphToHierarchical),
/* harmony export */   layoutResultToCanvasData: () => (/* binding */ layoutResultToCanvasData)
/* harmony export */ });
function cloneNode(node) {
  return {
    ...node,
    style: node.style ? {
      ...node.style
    } : node.style,
    metadata: node.metadata ? {
      ...node.metadata
    } : undefined,
    children: node.children ? node.children.map(child => cloneNode(child)) : []
  };
}
function cloneEdge(edge) {
  return {
    ...edge,
    metadata: edge.metadata ? {
      ...edge.metadata
    } : undefined,
    style: edge.style ? {
      ...edge.style
    } : edge.style,
    waypoints: edge.waypoints ? edge.waypoints.map(point => ({
      ...point
    })) : undefined
  };
}
function createNodeFromLayout(layoutNode) {
  return {
    id: layoutNode.label ?? layoutNode.id,
    GUID: layoutNode.id,
    type: layoutNode.type,
    x: layoutNode.geometry.x,
    y: layoutNode.geometry.y,
    width: layoutNode.geometry.width,
    height: layoutNode.geometry.height,
    text: layoutNode.label ?? layoutNode.id,
    style: layoutNode.metadata['style'] ?? {
      fill: '#1f2937',
      stroke: '#4b5563'
    },
    children: [],
    selected: layoutNode.state.selected,
    visible: layoutNode.state.visible,
    collapsed: layoutNode.state.collapsed,
    dragging: false,
    metadata: {
      ...layoutNode.metadata
    }
  };
}
function layoutGraphToHierarchical(graph) {
  const nodeMap = new Map();
  Object.values(graph.nodes).forEach(node => {
    const hierarchical = createNodeFromLayout(node);
    nodeMap.set(node.id, hierarchical);
  });
  Object.values(graph.nodes).forEach(node => {
    const parent = nodeMap.get(node.id);
    if (!parent) return;
    node.children.forEach(childId => {
      const child = nodeMap.get(childId);
      if (child) {
        parent.children.push(child);
      }
    });
  });
  const roots = computeRootNodes(graph, nodeMap);
  const edges = Object.values(graph.edges).map(edge => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    fromGUID: edge.from,
    toGUID: edge.to,
    label: edge.label ?? '',
    style: edge.metadata['style'] ?? {
      stroke: '#6ea8fe',
      strokeWidth: 2,
      strokeDashArray: null
    },
    metadata: {
      ...edge.metadata
    }
  }));
  return {
    nodes: roots,
    edges,
    metadata: graph.metadata
  };
}
function hierarchicalToLayoutGraph(snapshot) {
  const nodesRecord = {};
  const edgesRecord = snapshot.edges.reduce((acc, edge) => {
    acc[edge.id] = createEdgeRecord(edge);
    return acc;
  }, {});
  const visit = (node, depth = 0) => {
    const nodeId = node.GUID ?? node.id;
    if (!nodeId) return;
    const childrenIds = node.children.map(child => child.GUID ?? child.id).filter(value => Boolean(value));
    nodesRecord[nodeId] = {
      id: nodeId,
      label: node.text ?? node.id,
      type: node.type,
      geometry: {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height
      },
      state: {
        collapsed: node.collapsed ?? false,
        visible: node.visible ?? true,
        selected: node.selected ?? false
      },
      metadata: {
        ...(node.metadata ?? {}),
        style: node.style
      },
      children: childrenIds,
      edges: []
    };
    node.children.forEach(child => visit(child, depth + 1));
  };
  snapshot.nodes.forEach(node => visit(node));
  Object.values(edgesRecord).forEach(edge => {
    const fromNode = nodesRecord[edge.from];
    const toNode = nodesRecord[edge.to];
    if (fromNode && !fromNode.edges.includes(edge.id)) {
      fromNode.edges.push(edge.id);
    }
    if (toNode && !toNode.edges.includes(edge.id)) {
      toNode.edges.push(edge.id);
    }
  });
  const readonlyNodes = {};
  Object.entries(nodesRecord).forEach(([nodeId, node]) => {
    readonlyNodes[nodeId] = {
      ...node,
      geometry: {
        x: node.geometry.x,
        y: node.geometry.y,
        width: node.geometry.width,
        height: node.geometry.height
      },
      state: {
        collapsed: node.state.collapsed,
        visible: node.state.visible,
        selected: node.state.selected
      },
      metadata: {
        ...node.metadata
      },
      children: [...node.children],
      edges: [...node.edges]
    };
  });
  // Deep copy edges to prevent mutations
  const readonlyEdges = {};
  Object.entries(edgesRecord).forEach(([edgeId, edge]) => {
    readonlyEdges[edgeId] = {
      ...edge,
      metadata: {
        ...(edge.metadata ?? {})
      }
    };
  });
  // Freeze geometry objects to prevent mutations
  Object.values(readonlyNodes).forEach(node => {
    Object.freeze(node.geometry);
    Object.freeze(node.state);
    Object.freeze(node);
  });
  Object.values(readonlyEdges).forEach(edge => {
    Object.freeze(edge);
  });
  const frozenGraph = {
    nodes: readonlyNodes,
    edges: readonlyEdges,
    metadata: {
      ...snapshot.metadata
    }
  };
  Object.freeze(frozenGraph.nodes);
  Object.freeze(frozenGraph.edges);
  Object.freeze(frozenGraph.metadata);
  Object.freeze(frozenGraph);
  return frozenGraph;
}
function computeRootNodes(graph, nodeMap) {
  const explicitRoots = graph.metadata.rootIds ?? [];
  if (explicitRoots.length > 0) {
    return explicitRoots.map(id => nodeMap.get(id)).filter(node => Boolean(node));
  }
  const childSet = new Set();
  Object.values(graph.nodes).forEach(node => {
    node.children.forEach(child => childSet.add(child));
  });
  const roots = [];
  nodeMap.forEach((node, nodeId) => {
    if (!childSet.has(nodeId)) {
      roots.push(node);
    }
  });
  return roots;
}
function createEdgeRecord(edge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    label: edge.label,
    metadata: {
      ...(edge.metadata ?? {}),
      style: edge.style
    }
  };
}
function canvasDataToLayoutGraph(data, layoutVersion = 1) {
  const snapshot = {
    nodes: data.nodes.map(node => cloneNode(node)),
    edges: (data.originalEdges ?? data.edges).map(edge => cloneEdge(edge)),
    metadata: {
      rootIds: collectRootGuids(data.nodes),
      layoutVersion
    }
  };
  return hierarchicalToLayoutGraph(snapshot);
}
function layoutResultToCanvasData(result, previous) {
  const snapshot = layoutGraphToHierarchical(result.graph);
  const camera = result.camera ?? previous?.camera;
  return {
    nodes: snapshot.nodes.map(node => cloneNode(node)),
    edges: snapshot.edges.map(edge => cloneEdge(edge)),
    originalEdges: snapshot.edges.map(edge => cloneEdge(edge)),
    camera
  };
}
function collectRootGuids(nodes) {
  return nodes.map(node => node.GUID ?? node.id).filter(value => Boolean(value));
}

/***/ }),

/***/ 3669:
/*!**************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/util/identity.js ***!
  \**************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   identity: () => (/* binding */ identity)
/* harmony export */ });
function identity(x) {
  return x;
}
//# sourceMappingURL=identity.js.map

/***/ }),

/***/ 3961:
/*!*************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/Subscription.js ***!
  \*************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   EMPTY_SUBSCRIPTION: () => (/* binding */ EMPTY_SUBSCRIPTION),
/* harmony export */   Subscription: () => (/* binding */ Subscription),
/* harmony export */   isSubscription: () => (/* binding */ isSubscription)
/* harmony export */ });
/* harmony import */ var _util_isFunction__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./util/isFunction */ 8071);
/* harmony import */ var _util_UnsubscriptionError__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./util/UnsubscriptionError */ 4079);
/* harmony import */ var _util_arrRemove__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./util/arrRemove */ 7908);



class Subscription {
  constructor(initialTeardown) {
    this.initialTeardown = initialTeardown;
    this.closed = false;
    this._parentage = null;
    this._finalizers = null;
  }
  unsubscribe() {
    let errors;
    if (!this.closed) {
      this.closed = true;
      const {
        _parentage
      } = this;
      if (_parentage) {
        this._parentage = null;
        if (Array.isArray(_parentage)) {
          for (const parent of _parentage) {
            parent.remove(this);
          }
        } else {
          _parentage.remove(this);
        }
      }
      const {
        initialTeardown: initialFinalizer
      } = this;
      if ((0,_util_isFunction__WEBPACK_IMPORTED_MODULE_0__.isFunction)(initialFinalizer)) {
        try {
          initialFinalizer();
        } catch (e) {
          errors = e instanceof _util_UnsubscriptionError__WEBPACK_IMPORTED_MODULE_1__.UnsubscriptionError ? e.errors : [e];
        }
      }
      const {
        _finalizers
      } = this;
      if (_finalizers) {
        this._finalizers = null;
        for (const finalizer of _finalizers) {
          try {
            execFinalizer(finalizer);
          } catch (err) {
            errors = errors !== null && errors !== void 0 ? errors : [];
            if (err instanceof _util_UnsubscriptionError__WEBPACK_IMPORTED_MODULE_1__.UnsubscriptionError) {
              errors = [...errors, ...err.errors];
            } else {
              errors.push(err);
            }
          }
        }
      }
      if (errors) {
        throw new _util_UnsubscriptionError__WEBPACK_IMPORTED_MODULE_1__.UnsubscriptionError(errors);
      }
    }
  }
  add(teardown) {
    var _a;
    if (teardown && teardown !== this) {
      if (this.closed) {
        execFinalizer(teardown);
      } else {
        if (teardown instanceof Subscription) {
          if (teardown.closed || teardown._hasParent(this)) {
            return;
          }
          teardown._addParent(this);
        }
        (this._finalizers = (_a = this._finalizers) !== null && _a !== void 0 ? _a : []).push(teardown);
      }
    }
  }
  _hasParent(parent) {
    const {
      _parentage
    } = this;
    return _parentage === parent || Array.isArray(_parentage) && _parentage.includes(parent);
  }
  _addParent(parent) {
    const {
      _parentage
    } = this;
    this._parentage = Array.isArray(_parentage) ? (_parentage.push(parent), _parentage) : _parentage ? [_parentage, parent] : parent;
  }
  _removeParent(parent) {
    const {
      _parentage
    } = this;
    if (_parentage === parent) {
      this._parentage = null;
    } else if (Array.isArray(_parentage)) {
      (0,_util_arrRemove__WEBPACK_IMPORTED_MODULE_2__.arrRemove)(_parentage, parent);
    }
  }
  remove(teardown) {
    const {
      _finalizers
    } = this;
    _finalizers && (0,_util_arrRemove__WEBPACK_IMPORTED_MODULE_2__.arrRemove)(_finalizers, teardown);
    if (teardown instanceof Subscription) {
      teardown._removeParent(this);
    }
  }
}
Subscription.EMPTY = (() => {
  const empty = new Subscription();
  empty.closed = true;
  return empty;
})();
const EMPTY_SUBSCRIPTION = Subscription.EMPTY;
function isSubscription(value) {
  return value instanceof Subscription || value && 'closed' in value && (0,_util_isFunction__WEBPACK_IMPORTED_MODULE_0__.isFunction)(value.remove) && (0,_util_isFunction__WEBPACK_IMPORTED_MODULE_0__.isFunction)(value.add) && (0,_util_isFunction__WEBPACK_IMPORTED_MODULE_0__.isFunction)(value.unsubscribe);
}
function execFinalizer(finalizer) {
  if ((0,_util_isFunction__WEBPACK_IMPORTED_MODULE_0__.isFunction)(finalizer)) {
    finalizer();
  } else {
    finalizer.unsubscribe();
  }
}
//# sourceMappingURL=Subscription.js.map

/***/ }),

/***/ 4079:
/*!*************************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/util/UnsubscriptionError.js ***!
  \*************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   UnsubscriptionError: () => (/* binding */ UnsubscriptionError)
/* harmony export */ });
/* harmony import */ var _createErrorClass__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./createErrorClass */ 1853);

const UnsubscriptionError = (0,_createErrorClass__WEBPACK_IMPORTED_MODULE_0__.createErrorClass)(_super => function UnsubscriptionErrorImpl(errors) {
  _super(this);
  this.message = errors ? `${errors.length} errors occurred during unsubscription:
${errors.map((err, i) => `${i + 1}) ${err.toString()}`).join('\n  ')}` : '';
  this.name = 'UnsubscriptionError';
  this.errors = errors;
});
//# sourceMappingURL=UnsubscriptionError.js.map

/***/ }),

/***/ 5334:
/*!**************************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/util/reportUnhandledError.js ***!
  \**************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   reportUnhandledError: () => (/* binding */ reportUnhandledError)
/* harmony export */ });
/* harmony import */ var _config__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../config */ 1026);
/* harmony import */ var _scheduler_timeoutProvider__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../scheduler/timeoutProvider */ 9270);


function reportUnhandledError(err) {
  _scheduler_timeoutProvider__WEBPACK_IMPORTED_MODULE_1__.timeoutProvider.setTimeout(() => {
    const {
      onUnhandledError
    } = _config__WEBPACK_IMPORTED_MODULE_0__.config;
    if (onUnhandledError) {
      onUnhandledError(err);
    } else {
      throw err;
    }
  });
}
//# sourceMappingURL=reportUnhandledError.js.map

/***/ }),

/***/ 5343:
/*!**********************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/util/noop.js ***!
  \**********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   noop: () => (/* binding */ noop)
/* harmony export */ });
function noop() {}
//# sourceMappingURL=noop.js.map

/***/ }),

/***/ 5456:
/*!*****************************************************************************!*\
  !*** ./src/app/shared/layouts/engines/containment-runtime-layout.engine.ts ***!
  \*****************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ContainmentRuntimeLayoutEngine: () => (/* binding */ ContainmentRuntimeLayoutEngine)
/* harmony export */ });
/* harmony import */ var _utils_runtime_graph_normalizer__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../utils/runtime-graph-normalizer */ 2405);
/* harmony import */ var _core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../core/layout-graph-utils */ 3665);
/* harmony import */ var _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../../canvas/layout-primitives */ 9188);



const DEFAULT_PADDING = 48;
const DEFAULT_GAP = 24;
// Containment edge types should NOT be rendered as lines - they define the hierarchy instead
const CONTAINMENT_EDGE_TYPES = new Set(['CONTAINS', 'HAS_CHILD', 'HAS_COMPONENT', 'PARENT_OF']);
class ContainmentRuntimeLayoutEngine {
  name = 'containment-runtime';
  capabilities = {
    supportsIncremental: true,
    deterministic: true,
    canHandleRealtime: true
  };
  layout(graph, options) {
    const snapshot = (0,_core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_1__.layoutGraphToHierarchical)(graph);
    // Extract runtime config from engineOptions
    const runtimeConfig = this.extractRuntimeConfig(options.engineOptions);
    const layoutMetrics = {
      padding: DEFAULT_PADDING,
      gap: DEFAULT_GAP
    };
    const processedNodes = snapshot.nodes.map(node => this.layoutContainer(node, layoutMetrics, runtimeConfig));
    processedNodes.forEach(root => this.updateWorldMetadata(root));
    // Filter containment edges based on containmentMode
    // In 'containers' mode: hide CONTAINS edges (visual hierarchy replaces them)
    // In 'flat' mode: show CONTAINS edges as visible lines
    const edgesToRender = runtimeConfig.containmentMode === 'containers' ? snapshot.edges.filter(edge => {
      const edgeType = edge.metadata?.['relationType']?.toUpperCase() || '';
      return !CONTAINMENT_EDGE_TYPES.has(edgeType);
    }) : snapshot.edges; // In flat mode, show all edges including CONTAINS
    const routedEdges = this.computeEdgeWaypoints(processedNodes, edgesToRender, runtimeConfig);
    const updatedGraph = (0,_core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_1__.hierarchicalToLayoutGraph)({
      nodes: processedNodes,
      edges: routedEdges,
      metadata: {
        ...snapshot.metadata,
        layoutVersion: (graph.metadata.layoutVersion ?? 0) + 1,
        displayMode: 'containment-runtime'
      }
    });
    const diagnosticMetrics = {
      nodeCount: processedNodes.length,
      edgeCount: routedEdges.length
    };
    if (typeof options.timestamp === 'number') {
      diagnosticMetrics['runtimeMs'] = Math.max(0, Date.now() - options.timestamp);
    }
    return {
      graph: updatedGraph,
      diagnostics: {
        metrics: diagnosticMetrics
      }
    };
  }
  processRawData(input) {
    const runtimeSnapshot = (0,_utils_runtime_graph_normalizer__WEBPACK_IMPORTED_MODULE_0__.buildRuntimeGraphSnapshot)(input);
    return (0,_utils_runtime_graph_normalizer__WEBPACK_IMPORTED_MODULE_0__.runtimeSnapshotToLayoutGraph)(runtimeSnapshot);
  }
  extractRuntimeConfig(engineOptions) {
    // Default config if not provided
    const defaults = {
      containmentMode: 'containers',
      layoutMode: 'grid',
      edgeRouting: 'orthogonal'
    };
    if (!engineOptions) {
      return defaults;
    }
    return {
      containmentMode: engineOptions['containmentMode'] ?? defaults.containmentMode,
      layoutMode: engineOptions['layoutMode'] ?? defaults.layoutMode,
      edgeRouting: engineOptions['edgeRouting'] ?? defaults.edgeRouting
    };
  }
  layoutContainer(node, metrics, config) {
    const clone = this.ensureDefaults(this.cloneNode(node));
    if (!clone.children || clone.children.length === 0) {
      return clone;
    }
    const children = clone.children ?? [];
    // Recursively layout children first to get their sizes
    const laidOutChildren = children.map(child => this.layoutContainer(child, metrics, config));
    // Apply layout algorithm based on layoutMode
    if (config.layoutMode === 'grid') {
      this.applyAdaptiveGrid(clone, laidOutChildren, metrics);
    } else if (config.layoutMode === 'force') {
      // TODO: Implement force-directed layout delegation
      this.applyAdaptiveGrid(clone, laidOutChildren, metrics); // Fallback to grid for now
    }
    clone.children = laidOutChildren;
    // In 'containers' mode: resize parent to fit children (visual containment)
    // In 'flat' mode: skip resize, let nodes have independent sizes
    if (config.containmentMode === 'containers') {
      _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_2__.LayoutPrimitives.resizeToFitChildren(clone, metrics.padding, metrics.padding);
    }
    return clone;
  }
  ensureDefaults(node) {
    const defaults = _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_2__.LayoutPrimitives.getMinimumNodeSize(node.type);
    node.width = Number.isFinite(node.width) ? node.width : defaults.width;
    node.height = Number.isFinite(node.height) ? node.height : defaults.height;
    node.metadata = {
      ...(node.metadata ?? {}),
      defaultWidth: node.width,
      defaultHeight: node.height,
      displayMode: 'containment-runtime'
    };
    return node;
  }
  applyAdaptiveGrid(parent, children, metrics) {
    if (children.length === 0) {
      return;
    }
    const padding = metrics.padding;
    const gap = metrics.gap;
    const headerOffset = _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_2__.LayoutPrimitives.computeHeaderOffset(parent);
    // Simple vertical stack layout - don't resize children, just position them
    let y = headerOffset + _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_2__.LayoutPrimitives.HEADER_GAP;
    children.forEach((child, index) => {
      child.x = padding;
      child.y = y;
      y += (child.height ?? 0) + (index < children.length - 1 ? gap : 0);
    });
  }
  clampChildrenToParent(parent, children, metrics) {
    if (!children || children.length === 0) {
      return;
    }
    const headerOffset = _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_2__.LayoutPrimitives.computeHeaderOffset(parent);
    children.forEach(child => {
      _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_2__.LayoutPrimitives.clampChildWithinParent(child, parent, metrics.padding, headerOffset);
    });
  }
  applyWorldRelativePositions(parent, children) {
    if (!children || children.length === 0) {
      return;
    }
    const parentWorld = this.readWorldPosition(parent) ?? {
      x: parent.x ?? 0,
      y: parent.y ?? 0
    };
    children.forEach(child => {
      const childWorld = this.readWorldPosition(child);
      if (childWorld) {
        child.x = childWorld.x - parentWorld.x;
        child.y = childWorld.y - parentWorld.y;
      } else {
        child.x = Number.isFinite(child.x) ? child.x : 0;
        child.y = Number.isFinite(child.y) ? child.y : 0;
      }
    });
  }
  readWorldPosition(node) {
    const metadata = node.metadata;
    if (metadata && typeof metadata['worldPosition'] === 'object') {
      const value = metadata['worldPosition'];
      const x = Number(value?.x ?? Number.NaN);
      const y = Number(value?.y ?? Number.NaN);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return {
          x,
          y
        };
      }
    }
    return null;
  }
  computeEdgeWaypoints(nodes, edges, config) {
    if (!edges || edges.length === 0) {
      return edges;
    }
    const nodeMap = new Map();
    const worldPositions = new Map();
    const collect = (node, offsetX = 0, offsetY = 0) => {
      const worldX = offsetX + (node.x ?? 0);
      const worldY = offsetY + (node.y ?? 0);
      nodeMap.set(node.GUID ?? node.id, node);
      worldPositions.set(node.GUID ?? node.id, {
        x: worldX,
        y: worldY
      });
      node.children?.forEach(child => collect(child, worldX, worldY));
    };
    nodes.forEach(root => collect(root));
    return edges.map(edge => {
      const fromNode = nodeMap.get(edge.fromGUID ?? edge.from);
      const toNode = nodeMap.get(edge.toGUID ?? edge.to);
      if (!fromNode || !toNode) {
        return edge;
      }
      const fromWorld = worldPositions.get(fromNode.GUID ?? fromNode.id) ?? {
        x: 0,
        y: 0
      };
      const toWorld = worldPositions.get(toNode.GUID ?? toNode.id) ?? {
        x: 0,
        y: 0
      };
      const fromCenter = {
        x: fromWorld.x + (fromNode.width ?? 0) / 2,
        y: fromWorld.y + (fromNode.height ?? 0) / 2
      };
      const toCenter = {
        x: toWorld.x + (toNode.width ?? 0) / 2,
        y: toWorld.y + (toNode.height ?? 0) / 2
      };
      // Apply edge routing based on edgeRouting config
      let waypoints;
      if (config.edgeRouting === 'orthogonal') {
        const gridOffset = 24;
        waypoints = [{
          x: fromCenter.x,
          y: fromCenter.y
        }, {
          x: fromCenter.x,
          y: toCenter.y - gridOffset
        }, {
          x: toCenter.x,
          y: toCenter.y - gridOffset
        }, {
          x: toCenter.x,
          y: toCenter.y
        }];
      } else {
        // Straight routing - direct line
        waypoints = [{
          x: fromCenter.x,
          y: fromCenter.y
        }, {
          x: toCenter.x,
          y: toCenter.y
        }];
      }
      return {
        ...edge,
        waypoints
      };
    });
  }
  updateWorldMetadata(node, parentWorld) {
    const parentX = parentWorld?.x ?? 0;
    const parentY = parentWorld?.y ?? 0;
    const localX = Number(node.x ?? 0);
    const localY = Number(node.y ?? 0);
    const worldX = parentX + localX;
    const worldY = parentY + localY;
    node.metadata = {
      ...(node.metadata ?? {}),
      worldPosition: {
        x: worldX,
        y: worldY
      }
    };
    node.children?.forEach(child => this.updateWorldMetadata(child, {
      x: worldX,
      y: worldY
    }));
  }
  cloneNode(node) {
    return {
      ...node,
      style: node.style ? {
        ...node.style
      } : node.style,
      metadata: node.metadata ? {
        ...node.metadata
      } : undefined,
      children: node.children ? node.children.map(child => this.cloneNode(child)) : []
    };
  }
}

/***/ }),

/***/ 6670:
/*!************************************************************!*\
  !*** ./src/app/shared/layouts/utils/raw-data-processor.ts ***!
  \************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   getDefaultNodeSize: () => (/* binding */ getDefaultNodeSize),
/* harmony export */   processRawDataToGraph: () => (/* binding */ processRawDataToGraph),
/* harmony export */   validateRawData: () => (/* binding */ validateRawData)
/* harmony export */ });
/**
 * Get default node dimensions based on entity type
 */
function getDefaultNodeSize(type) {
  const sizes = {
    'container': {
      width: 200,
      height: 120
    },
    'folder': {
      width: 200,
      height: 120
    },
    'frontend': {
      width: 200,
      height: 120
    },
    'node': {
      width: 160,
      height: 80
    },
    'component': {
      width: 120,
      height: 60
    },
    'file': {
      width: 120,
      height: 60
    }
  };
  return sizes[type] || sizes['node'];
}
/**
 * Extract GUID from entity (handles multiple property formats)
 */
function extractGUID(entity) {
  const props = entity.properties || {};
  return props['GUID'] || entity['GUID'] || entity.id;
}
/**
 * Extract entity type from entity properties
 */
function extractType(entity) {
  const props = entity.properties || {};
  return props['type'] || entity.type || 'node';
}
/**
 * Extract entity name for display
 */
function extractName(entity) {
  return entity.name || entity.id;
}
/**
 * Build hierarchy from CONTAINS relationships
 * Returns map of nodeId -> array of child IDs
 */
function buildParentChildMap(relationships) {
  const parentChildMap = new Map();
  const childToParent = new Map();
  relationships.forEach(rel => {
    if (rel.type === 'CONTAINS') {
      const parentGUID = rel.fromGUID || rel.source;
      const childGUID = rel.toGUID || rel.target;
      if (!parentChildMap.has(parentGUID)) {
        parentChildMap.set(parentGUID, []);
      }
      parentChildMap.get(parentGUID).push(childGUID);
      childToParent.set(childGUID, parentGUID);
    }
  });
  return parentChildMap;
}
/**
 * Find root node IDs (nodes with no parent in CONTAINS relationships)
 */
function findRootNodeIds(nodeIds, relationships) {
  const childIds = new Set();
  relationships.forEach(rel => {
    if (rel.type === 'CONTAINS') {
      const childGUID = rel.toGUID || rel.target;
      childIds.add(childGUID);
    }
  });
  return Array.from(nodeIds).filter(id => !childIds.has(id));
}
/**
 * Process raw entities and relationships into a LayoutGraph
 * This is the core transformation used by runtime engines
 */
function processRawDataToGraph(input) {
  const nodes = {};
  const edges = {};
  const nodeIds = new Set();
  // Phase 1: Transform entities to layout nodes
  input.entities.forEach(entity => {
    const guid = extractGUID(entity);
    if (!guid || guid === 'test-modular-root') {
      return; // Skip invalid or test nodes
    }
    const type = extractType(entity);
    const name = extractName(entity);
    const size = getDefaultNodeSize(type);
    nodeIds.add(guid);
    nodes[guid] = {
      id: guid,
      label: name,
      type,
      geometry: {
        x: 0,
        y: 0,
        width: size.width,
        height: size.height
      },
      state: {
        collapsed: false,
        visible: true,
        selected: false
      },
      metadata: {
        ...entity.properties,
        rawEntity: entity
      },
      children: [],
      edges: []
    };
  });
  // Phase 2: Build hierarchy from CONTAINS relationships
  const parentChildMap = buildParentChildMap(input.relationships);
  parentChildMap.forEach((childIds, parentId) => {
    if (nodes[parentId]) {
      nodes[parentId] = {
        ...nodes[parentId],
        children: childIds.filter(childId => nodes[childId]) // Only include valid children
      };
    }
  });
  // Phase 3: Create edges from non-CONTAINS relationships
  input.relationships.forEach(rel => {
    if (rel.type !== 'CONTAINS') {
      const fromGUID = rel.fromGUID || rel.source;
      const toGUID = rel.toGUID || rel.target;
      // Only create edge if both nodes exist
      if (nodes[fromGUID] && nodes[toGUID]) {
        const edgeId = rel.id || `edge-${fromGUID}-${toGUID}`;
        edges[edgeId] = {
          id: edgeId,
          from: fromGUID,
          to: toGUID,
          label: rel.type,
          metadata: {
            ...rel.properties,
            relationType: rel.type,
            rawRelationship: rel
          }
        };
        // Update node edge references
        nodes[fromGUID] = {
          ...nodes[fromGUID],
          edges: [...nodes[fromGUID].edges, edgeId]
        };
        nodes[toGUID] = {
          ...nodes[toGUID],
          edges: [...nodes[toGUID].edges, edgeId]
        };
      }
    }
  });
  // Phase 4: Find root nodes
  const rootIds = findRootNodeIds(nodeIds, input.relationships);
  return {
    nodes,
    edges,
    metadata: {
      rootIds,
      layoutVersion: 1
    }
  };
}
/**
 * Validate that a raw data input is well-formed
 */
function validateRawData(input) {
  const errors = [];
  if (!input.entities || input.entities.length === 0) {
    errors.push('No entities provided');
  }
  if (!input.relationships) {
    errors.push('No relationships provided');
  }
  // Check for entities without GUIDs
  const missingGUIDs = input.entities.filter(e => !extractGUID(e));
  if (missingGUIDs.length > 0) {
    errors.push(`${missingGUIDs.length} entities missing GUID`);
  }
  return {
    valid: errors.length === 0,
    errors
  };
}

/***/ }),

/***/ 6748:
/*!******************************************************!*\
  !*** ./src/app/shared/layouts/core/layout-events.ts ***!
  \******************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   CanvasEventBus: () => (/* binding */ CanvasEventBus)
/* harmony export */ });
/* harmony import */ var rxjs__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! rxjs */ 8530);

class CanvasEventBus {
  subject = new rxjs__WEBPACK_IMPORTED_MODULE_0__.Subject();
  get events$() {
    return this.subject.asObservable();
  }
  emit(event) {
    this.subject.next(event);
  }
  complete() {
    this.subject.complete();
  }
}

/***/ }),

/***/ 6986:
/*!***************************************************************!*\
  !*** ./src/app/shared/layouts/engines/force-layout.engine.ts ***!
  \***************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ForceLayoutEngine: () => (/* binding */ ForceLayoutEngine)
/* harmony export */ });
/* harmony import */ var _core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../core/layout-graph-utils */ 3665);
/* harmony import */ var _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../canvas/layout-primitives */ 9188);
/* harmony import */ var _utils_raw_data_processor__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../utils/raw-data-processor */ 6670);



const DEFAULT_RADIUS = 350;
class ForceLayoutEngine {
  name = 'force-directed';
  capabilities = {
    supportsIncremental: true,
    deterministic: false,
    canHandleRealtime: true
  };
  layout(graph, options) {
    const snapshot = (0,_core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__.layoutGraphToHierarchical)(graph);
    const roots = snapshot.nodes.map(node => this.cloneNode(node));
    const flatNodes = [];
    this.collectNodes(roots, flatNodes);
    _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_1__.LayoutPrimitives.calculateForceDirectedPositions(flatNodes, 0, 0, DEFAULT_RADIUS);
    flatNodes.forEach(node => {
      node.metadata = {
        ...(node.metadata ?? {}),
        displayMode: 'force-directed',
        defaultWidth: node.width,
        defaultHeight: node.height
      };
    });
    const updatedGraph = (0,_core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__.hierarchicalToLayoutGraph)({
      nodes: roots,
      edges: snapshot.edges,
      metadata: snapshot.metadata
    });
    const camera = options.reason === 'initial' || options.reason === 'engine-switch' ? {
      x: -400,
      y: -300,
      zoom: 0.6
    } : undefined;
    return {
      graph: updatedGraph,
      camera
    };
  }
  /**
   * Process raw entities and relationships into a LayoutGraph
   * Implements the optional processRawData interface for direct data loading
   */
  processRawData(input, _options) {
    // Use default transformation utility
    const graph = (0,_utils_raw_data_processor__WEBPACK_IMPORTED_MODULE_2__.processRawDataToGraph)(input);
    // Add force-directed specific metadata
    const enhancedNodes = {};
    Object.entries(graph.nodes).forEach(([nodeId, node]) => {
      enhancedNodes[nodeId] = {
        ...node,
        metadata: {
          ...node.metadata,
          displayMode: 'force-directed'
        }
      };
    });
    return {
      ...graph,
      nodes: enhancedNodes
    };
  }
  cloneNode(node) {
    return {
      ...node,
      children: node.children ? node.children.map(child => this.cloneNode(child)) : [],
      metadata: node.metadata ? {
        ...node.metadata
      } : undefined,
      style: node.style ? {
        ...node.style
      } : node.style
    };
  }
  collectNodes(nodes, acc) {
    nodes.forEach(node => {
      acc.push(node);
      if (node.children.length > 0) {
        this.collectNodes(node.children, acc);
      }
    });
  }
}

/***/ }),

/***/ 7548:
/*!********************************************************************!*\
  !*** ./src/app/shared/layouts/engines/orthogonal-layout.engine.ts ***!
  \********************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   OrthogonalLayoutEngine: () => (/* binding */ OrthogonalLayoutEngine)
/* harmony export */ });
/* harmony import */ var _core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../core/layout-graph-utils */ 3665);
/* harmony import */ var _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../canvas/layout-primitives */ 9188);
/* harmony import */ var _utils_raw_data_processor__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../utils/raw-data-processor */ 6670);



const LAYER_HORIZONTAL_SPACING = 360;
const NODE_VERTICAL_SPACING = 40;
const LAYER_VERTICAL_PADDING = 140;
class OrthogonalLayoutEngine {
  name = 'orthogonal';
  capabilities = {
    supportsIncremental: true,
    deterministic: true,
    canHandleRealtime: true
  };
  layout(graph, options) {
    const snapshot = (0,_core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__.layoutGraphToHierarchical)(graph);
    const roots = snapshot.nodes.map(node => this.cloneNode(node));
    const layers = new Map();
    roots.forEach(root => this.collectLayers(root, 0, layers));
    const layerKeys = Array.from(layers.keys()).sort((a, b) => a - b);
    let currentY = 0;
    layerKeys.forEach(depth => {
      const nodes = layers.get(depth) ?? [];
      let layerCursorY = currentY;
      nodes.forEach(node => {
        const size = this.ensureNodeSize(node);
        node.x = depth * LAYER_HORIZONTAL_SPACING;
        node.y = layerCursorY;
        node.metadata = {
          ...(node.metadata ?? {}),
          displayMode: 'orthogonal',
          defaultWidth: size.width,
          defaultHeight: size.height
        };
        layerCursorY += size.height + NODE_VERTICAL_SPACING;
      });
      currentY = layerCursorY + LAYER_VERTICAL_PADDING;
    });
    this.alignParents(roots);
    const bounds = this.calculateAbsoluteBounds(roots);
    roots.forEach(root => this.convertAbsoluteToRelative(root, 0, 0));
    const updatedGraph = (0,_core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__.hierarchicalToLayoutGraph)({
      nodes: roots,
      edges: snapshot.edges,
      metadata: snapshot.metadata
    });
    const camera = options.reason === 'initial' || options.reason === 'engine-switch' ? this.calculateCamera(bounds) : undefined;
    return {
      graph: updatedGraph,
      camera
    };
  }
  /**
   * Process raw entities and relationships into a LayoutGraph
   * Implements the optional processRawData interface for direct data loading
   */
  processRawData(input, _options) {
    // Use default transformation utility
    const graph = (0,_utils_raw_data_processor__WEBPACK_IMPORTED_MODULE_2__.processRawDataToGraph)(input);
    // Add orthogonal specific metadata
    const enhancedNodes = {};
    Object.entries(graph.nodes).forEach(([nodeId, node]) => {
      enhancedNodes[nodeId] = {
        ...node,
        metadata: {
          ...node.metadata,
          displayMode: 'orthogonal'
        }
      };
    });
    return {
      ...graph,
      nodes: enhancedNodes
    };
  }
  cloneNode(node) {
    return {
      ...node,
      children: node.children ? node.children.map(child => this.cloneNode(child)) : [],
      metadata: node.metadata ? {
        ...node.metadata
      } : undefined,
      style: node.style ? {
        ...node.style
      } : node.style
    };
  }
  collectLayers(node, depth, layers) {
    const layer = layers.get(depth) ?? [];
    layer.push(node);
    layers.set(depth, layer);
    node.children.forEach(child => this.collectLayers(child, depth + 1, layers));
  }
  ensureNodeSize(node) {
    const defaults = _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_1__.LayoutPrimitives.getMinimumNodeSize(node.type);
    if (!Number.isFinite(node.width) || node.width <= 0) {
      node.width = defaults.width;
    }
    if (!Number.isFinite(node.height) || node.height <= 0) {
      node.height = defaults.height;
    }
    return {
      width: node.width,
      height: node.height
    };
  }
  alignParents(nodes) {
    nodes.forEach(node => {
      if (node.children.length > 0) {
        this.alignParents(node.children);
        const centre = this.computeChildrenCentre(node);
        node.y = Math.max(0, centre - node.height / 2);
      }
    });
  }
  computeChildrenCentre(node) {
    if (node.children.length === 0) {
      return node.y + node.height / 2;
    }
    const firstChild = node.children[0];
    const lastChild = node.children[node.children.length - 1];
    return (firstChild.y + firstChild.height / 2 + lastChild.y + lastChild.height / 2) / 2;
  }
  calculateAbsoluteBounds(nodes) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const visit = (nodeList, offsetX, offsetY) => {
      nodeList.forEach(node => {
        const absX = offsetX + node.x;
        const absY = offsetY + node.y;
        minX = Math.min(minX, absX);
        minY = Math.min(minY, absY);
        maxX = Math.max(maxX, absX + node.width);
        maxY = Math.max(maxY, absY + node.height);
        if (node.children.length > 0) {
          visit(node.children, absX, absY);
        }
      });
    };
    visit(nodes, 0, 0);
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return {
        minX: 0,
        minY: 0,
        maxX: 0,
        maxY: 0
      };
    }
    return {
      minX,
      minY,
      maxX,
      maxY
    };
  }
  calculateCamera(bounds) {
    const padding = 200;
    return {
      x: bounds.minX - padding,
      y: Math.max(0, bounds.minY - padding),
      zoom: 0.65
    };
  }
  convertAbsoluteToRelative(node, parentX, parentY) {
    const absX = node.x;
    const absY = node.y;
    node.x = absX - parentX;
    node.y = absY - parentY;
    node.children.forEach(child => this.convertAbsoluteToRelative(child, absX, absY));
  }
}

/***/ }),

/***/ 7579:
/*!**************************************************************!*\
  !*** ./src/app/shared/layouts/engines/tree-layout.engine.ts ***!
  \**************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   TreeLayoutEngine: () => (/* binding */ TreeLayoutEngine)
/* harmony export */ });
/* harmony import */ var _core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../core/layout-graph-utils */ 3665);
/* harmony import */ var _utils_raw_data_processor__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../utils/raw-data-processor */ 6670);


const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;
const COLLAPSED_HEIGHT = 64;
const HORIZONTAL_INDENT = 12;
const HORIZONTAL_PADDING = 24;
const VERTICAL_GAP = 24;
class TreeLayoutEngine {
  name = 'tree';
  capabilities = {
    supportsIncremental: false,
    deterministic: true,
    canHandleRealtime: false
  };
  layout(graph, options) {
    const snapshot = (0,_core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__.layoutGraphToHierarchical)(graph);
    const roots = snapshot.nodes.map(node => this.cloneNode(node));
    roots.forEach(root => {
      this.initialiseCollapseState(root, true);
      this.positionTree(root, 0, 0);
    });
    roots.forEach(root => {
      this.convertAbsoluteToRelative(root, 0, 0);
    });
    const updatedGraph = (0,_core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__.hierarchicalToLayoutGraph)({
      nodes: roots,
      edges: snapshot.edges,
      metadata: snapshot.metadata
    });
    const camera = options.reason === 'initial' || options.reason === 'engine-switch' ? {
      x: 0,
      y: 0,
      zoom: 0.75
    } : undefined;
    return {
      graph: updatedGraph,
      camera
    };
  }
  /**
   * Process raw entities and relationships into a LayoutGraph
   * Implements the optional processRawData interface for direct data loading
   */
  processRawData(input, _options) {
    // Use default transformation utility
    const graph = (0,_utils_raw_data_processor__WEBPACK_IMPORTED_MODULE_1__.processRawDataToGraph)(input);
    // Add tree specific metadata
    const enhancedNodes = {};
    Object.entries(graph.nodes).forEach(([nodeId, node]) => {
      enhancedNodes[nodeId] = {
        ...node,
        metadata: {
          ...node.metadata,
          displayMode: 'tree'
        }
      };
    });
    return {
      ...graph,
      nodes: enhancedNodes
    };
  }
  cloneNode(node) {
    return {
      ...node,
      children: node.children ? node.children.map(child => this.cloneNode(child)) : [],
      metadata: node.metadata ? {
        ...node.metadata
      } : undefined,
      style: node.style ? {
        ...node.style
      } : node.style
    };
  }
  initialiseCollapseState(node, isRoot) {
    if (node.children.length > 0) {
      node.collapsed = !isRoot;
      node.children.forEach(child => this.initialiseCollapseState(child, false));
    } else {
      node.collapsed = false;
    }
    node.metadata = {
      ...(node.metadata ?? {}),
      displayMode: 'tree',
      defaultWidth: NODE_WIDTH,
      defaultHeight: COLLAPSED_HEIGHT
    };
    node.width = NODE_WIDTH;
    node.height = node.collapsed ? COLLAPSED_HEIGHT : NODE_HEIGHT;
  }
  positionTree(node, currentY, indent) {
    node.x = indent;
    node.y = currentY;
    if (node.children.length === 0 || node.collapsed) {
      return node.height;
    }
    let totalHeight = node.height + VERTICAL_GAP;
    let childTop = currentY + node.height + VERTICAL_GAP;
    let maxChildWidth = NODE_WIDTH;
    node.children.forEach((child, index) => {
      if (index > 0) {
        childTop += VERTICAL_GAP;
        totalHeight += VERTICAL_GAP;
      }
      const childHeight = this.positionTree(child, childTop, indent + HORIZONTAL_INDENT);
      totalHeight += childHeight;
      childTop += childHeight;
      maxChildWidth = Math.max(maxChildWidth, HORIZONTAL_INDENT + child.width + HORIZONTAL_PADDING);
    });
    node.width = Math.max(node.width, maxChildWidth);
    node.height = totalHeight;
    return totalHeight;
  }
  convertAbsoluteToRelative(node, parentX, parentY) {
    const absX = node.x;
    const absY = node.y;
    node.x = absX - parentX;
    node.y = absY - parentY;
    node.children.forEach(child => this.convertAbsoluteToRelative(child, absX, absY));
  }
}

/***/ }),

/***/ 7908:
/*!***************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/util/arrRemove.js ***!
  \***************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   arrRemove: () => (/* binding */ arrRemove)
/* harmony export */ });
function arrRemove(arr, item) {
  if (arr) {
    const index = arr.indexOf(item);
    0 <= index && arr.splice(index, 1);
  }
}
//# sourceMappingURL=arrRemove.js.map

/***/ }),

/***/ 8071:
/*!****************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/util/isFunction.js ***!
  \****************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   isFunction: () => (/* binding */ isFunction)
/* harmony export */ });
function isFunction(value) {
  return typeof value === 'function';
}
//# sourceMappingURL=isFunction.js.map

/***/ }),

/***/ 8530:
/*!********************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/Subject.js ***!
  \********************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   AnonymousSubject: () => (/* binding */ AnonymousSubject),
/* harmony export */   Subject: () => (/* binding */ Subject)
/* harmony export */ });
/* harmony import */ var _Observable__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./Observable */ 1985);
/* harmony import */ var _Subscription__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./Subscription */ 3961);
/* harmony import */ var _util_ObjectUnsubscribedError__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./util/ObjectUnsubscribedError */ 9117);
/* harmony import */ var _util_arrRemove__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./util/arrRemove */ 7908);
/* harmony import */ var _util_errorContext__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./util/errorContext */ 9786);





let Subject = /*#__PURE__*/(() => {
  class Subject extends _Observable__WEBPACK_IMPORTED_MODULE_0__.Observable {
    constructor() {
      super();
      this.closed = false;
      this.currentObservers = null;
      this.observers = [];
      this.isStopped = false;
      this.hasError = false;
      this.thrownError = null;
    }
    lift(operator) {
      const subject = new AnonymousSubject(this, this);
      subject.operator = operator;
      return subject;
    }
    _throwIfClosed() {
      if (this.closed) {
        throw new _util_ObjectUnsubscribedError__WEBPACK_IMPORTED_MODULE_2__.ObjectUnsubscribedError();
      }
    }
    next(value) {
      (0,_util_errorContext__WEBPACK_IMPORTED_MODULE_4__.errorContext)(() => {
        this._throwIfClosed();
        if (!this.isStopped) {
          if (!this.currentObservers) {
            this.currentObservers = Array.from(this.observers);
          }
          for (const observer of this.currentObservers) {
            observer.next(value);
          }
        }
      });
    }
    error(err) {
      (0,_util_errorContext__WEBPACK_IMPORTED_MODULE_4__.errorContext)(() => {
        this._throwIfClosed();
        if (!this.isStopped) {
          this.hasError = this.isStopped = true;
          this.thrownError = err;
          const {
            observers
          } = this;
          while (observers.length) {
            observers.shift().error(err);
          }
        }
      });
    }
    complete() {
      (0,_util_errorContext__WEBPACK_IMPORTED_MODULE_4__.errorContext)(() => {
        this._throwIfClosed();
        if (!this.isStopped) {
          this.isStopped = true;
          const {
            observers
          } = this;
          while (observers.length) {
            observers.shift().complete();
          }
        }
      });
    }
    unsubscribe() {
      this.isStopped = this.closed = true;
      this.observers = this.currentObservers = null;
    }
    get observed() {
      var _a;
      return ((_a = this.observers) === null || _a === void 0 ? void 0 : _a.length) > 0;
    }
    _trySubscribe(subscriber) {
      this._throwIfClosed();
      return super._trySubscribe(subscriber);
    }
    _subscribe(subscriber) {
      this._throwIfClosed();
      this._checkFinalizedStatuses(subscriber);
      return this._innerSubscribe(subscriber);
    }
    _innerSubscribe(subscriber) {
      const {
        hasError,
        isStopped,
        observers
      } = this;
      if (hasError || isStopped) {
        return _Subscription__WEBPACK_IMPORTED_MODULE_1__.EMPTY_SUBSCRIPTION;
      }
      this.currentObservers = null;
      observers.push(subscriber);
      return new _Subscription__WEBPACK_IMPORTED_MODULE_1__.Subscription(() => {
        this.currentObservers = null;
        (0,_util_arrRemove__WEBPACK_IMPORTED_MODULE_3__.arrRemove)(observers, subscriber);
      });
    }
    _checkFinalizedStatuses(subscriber) {
      const {
        hasError,
        thrownError,
        isStopped
      } = this;
      if (hasError) {
        subscriber.error(thrownError);
      } else if (isStopped) {
        subscriber.complete();
      }
    }
    asObservable() {
      const observable = new _Observable__WEBPACK_IMPORTED_MODULE_0__.Observable();
      observable.source = this;
      return observable;
    }
  }
  Subject.create = (destination, source) => {
    return new AnonymousSubject(destination, source);
  };
  return Subject;
})();
class AnonymousSubject extends Subject {
  constructor(destination, source) {
    super();
    this.destination = destination;
    this.source = source;
  }
  next(value) {
    var _a, _b;
    (_b = (_a = this.destination) === null || _a === void 0 ? void 0 : _a.next) === null || _b === void 0 ? void 0 : _b.call(_a, value);
  }
  error(err) {
    var _a, _b;
    (_b = (_a = this.destination) === null || _a === void 0 ? void 0 : _a.error) === null || _b === void 0 ? void 0 : _b.call(_a, err);
  }
  complete() {
    var _a, _b;
    (_b = (_a = this.destination) === null || _a === void 0 ? void 0 : _a.complete) === null || _b === void 0 ? void 0 : _b.call(_a);
  }
  _subscribe(subscriber) {
    var _a, _b;
    return (_b = (_a = this.source) === null || _a === void 0 ? void 0 : _a.subscribe(subscriber)) !== null && _b !== void 0 ? _b : _Subscription__WEBPACK_IMPORTED_MODULE_1__.EMPTY_SUBSCRIPTION;
  }
}
//# sourceMappingURL=Subject.js.map

/***/ }),

/***/ 9117:
/*!*****************************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/util/ObjectUnsubscribedError.js ***!
  \*****************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ObjectUnsubscribedError: () => (/* binding */ ObjectUnsubscribedError)
/* harmony export */ });
/* harmony import */ var _createErrorClass__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./createErrorClass */ 1853);

const ObjectUnsubscribedError = (0,_createErrorClass__WEBPACK_IMPORTED_MODULE_0__.createErrorClass)(_super => function ObjectUnsubscribedErrorImpl() {
  _super(this);
  this.name = 'ObjectUnsubscribedError';
  this.message = 'object unsubscribed';
});
//# sourceMappingURL=ObjectUnsubscribedError.js.map

/***/ }),

/***/ 9136:
/*!**************************************************************************!*\
  !*** ./src/app/shared/layouts/engines/containment-grid-layout.engine.ts ***!
  \**************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   ContainmentGridLayoutEngine: () => (/* binding */ ContainmentGridLayoutEngine)
/* harmony export */ });
/* harmony import */ var _core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../core/layout-graph-utils */ 3665);
/* harmony import */ var _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../canvas/layout-primitives */ 9188);
/* harmony import */ var _utils_raw_data_processor__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../utils/raw-data-processor */ 6670);



const CONTAINER_PADDING = 40;
const CHILD_SPACING = 24;
class ContainmentGridLayoutEngine {
  name = 'containment-grid';
  capabilities = {
    supportsIncremental: true,
    deterministic: true,
    canHandleRealtime: true
  };
  layout(graph, _options) {
    const snapshot = (0,_core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__.layoutGraphToHierarchical)(graph);
    const roots = snapshot.nodes.map(node => this.cloneNode(node));
    roots.forEach(root => this.layoutContainer(root));
    const updatedGraph = (0,_core_layout_graph_utils__WEBPACK_IMPORTED_MODULE_0__.hierarchicalToLayoutGraph)({
      nodes: roots,
      edges: snapshot.edges,
      metadata: snapshot.metadata
    });
    return {
      graph: updatedGraph
    };
  }
  /**
   * Process raw entities and relationships into a LayoutGraph
   * Implements the optional processRawData interface for direct data loading
   */
  processRawData(input, _options) {
    // Use default transformation utility
    const graph = (0,_utils_raw_data_processor__WEBPACK_IMPORTED_MODULE_2__.processRawDataToGraph)(input);
    // Add containment-grid specific metadata
    const enhancedNodes = {};
    Object.entries(graph.nodes).forEach(([nodeId, node]) => {
      enhancedNodes[nodeId] = {
        ...node,
        metadata: {
          ...node.metadata,
          displayMode: 'containment-grid'
        }
      };
    });
    return {
      ...graph,
      nodes: enhancedNodes
    };
  }
  cloneNode(node) {
    return {
      ...node,
      children: node.children ? node.children.map(child => this.cloneNode(child)) : [],
      metadata: node.metadata ? {
        ...node.metadata
      } : undefined,
      style: node.style ? {
        ...node.style
      } : node.style
    };
  }
  layoutContainer(node) {
    const defaults = _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_1__.LayoutPrimitives.getMinimumNodeSize(node.type);
    node.width = node.metadata?.['defaultWidth'] ?? node.width ?? defaults.width;
    node.height = node.metadata?.['defaultHeight'] ?? node.height ?? defaults.height;
    node.metadata = {
      ...(node.metadata ?? {}),
      displayMode: 'containment-grid',
      defaultWidth: node.width,
      defaultHeight: node.height
    };
    if (node.children.length === 0) {
      return;
    }
    node.children.forEach(child => {
      const childDefaults = _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_1__.LayoutPrimitives.getMinimumNodeSize(child.type);
      child.width = child.metadata?.['defaultWidth'] ?? child.width ?? childDefaults.width;
      child.height = child.metadata?.['defaultHeight'] ?? child.height ?? childDefaults.height;
    });
    const headerOffset = _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_1__.LayoutPrimitives.computeHeaderOffset(node);
    _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_1__.LayoutPrimitives.calculateGridPositions(node.children, node.width - CONTAINER_PADDING, node.height - CONTAINER_PADDING, CONTAINER_PADDING / 2, headerOffset + _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_1__.LayoutPrimitives.HEADER_GAP, CHILD_SPACING);
    _canvas_layout_primitives__WEBPACK_IMPORTED_MODULE_1__.LayoutPrimitives.resizeToFitChildren(node, CONTAINER_PADDING / 2, CONTAINER_PADDING / 2);
    node.children.forEach(child => this.layoutContainer(child));
  }
}

/***/ }),

/***/ 9188:
/*!****************************************************!*\
  !*** ./src/app/shared/canvas/layout-primitives.ts ***!
  \****************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   LayoutPrimitives: () => (/* binding */ LayoutPrimitives)
/* harmony export */ });
/**
 * Reusable layout calculation primitives
 * Extracted from GridLayoutEngine to eliminate code duplication
 */
let LayoutPrimitives = /*#__PURE__*/(() => {
  class LayoutPrimitives {
    /**
     * Fixed header height for containers - matches visual header (icon + text + type)
     */
    static HEADER_HEIGHT = 50;
    /**
     * Vertical gap between header and first child
     */
    static HEADER_GAP = 10;
    static clampNumber(value, min, max) {
      if (!Number.isFinite(value)) {
        return min;
      }
      if (min >= max) {
        return min;
      }
      return Math.min(Math.max(value, min), max);
    }
    /**
     * Calculate grid positions for children within a container
     */
    static calculateGridPositions(children, containerWidth, containerHeight, sidePadding = 20, topPadding = 50, childSpacing = 10) {
      if (children.length === 0) return;
      const cols = Math.ceil(Math.sqrt(children.length)); // Square-ish grid
      let x = sidePadding;
      let y = topPadding;
      let rowHeight = 0;
      children.forEach((child, index) => {
        // Position child
        child.x = x;
        child.y = y;
        // Track row height
        rowHeight = Math.max(rowHeight, child.height);
        // Move to next column
        x += child.width + childSpacing;
        // Move to next row if needed
        if ((index + 1) % cols === 0) {
          x = sidePadding;
          y += rowHeight + childSpacing;
          rowHeight = 0;
        }
      });
    }
    /**
     * Calculate force-directed positions for nodes
     */
    static calculateForceDirectedPositions(nodes, centerX = 400, centerY = 300, radius = 200) {
      // Simple circular layout for now (can be enhanced to proper force-directed)
      nodes.forEach((node, index) => {
        const angle = index / nodes.length * 2 * Math.PI;
        node.x = centerX + Math.cos(angle) * radius;
        node.y = centerY + Math.sin(angle) * radius;
      });
    }
    /**
     * Detect and resolve collisions between nodes
     */
    static detectCollisions(nodes) {
      // Simple collision detection - can be enhanced
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeA = nodes[i];
          const nodeB = nodes[j];
          if (this.nodesOverlap(nodeA, nodeB)) {
            return true;
          }
        }
      }
      return false;
    }
    /**
     * Resize parent to fit all children with padding
     */
    static resizeToFitChildren(parent, sidePadding = 20, bottomPadding = 20) {
      if (parent.children.length === 0) return;
      let maxX = 0;
      let maxY = 0;
      parent.children.forEach(child => {
        maxX = Math.max(maxX, child.x + child.width);
        maxY = Math.max(maxY, child.y + child.height);
      });
      // Resize parent to contain all children + padding
      parent.width = Math.max(parent.width, maxX + sidePadding);
      parent.height = Math.max(parent.height, maxY + bottomPadding);
    }
    /**
     * Get minimum node size based on type
     */
    static getMinimumNodeSize(type) {
      const sizes = {
        'container': {
          width: 200,
          height: 120
        },
        'node': {
          width: 160,
          height: 80
        },
        'component': {
          width: 120,
          height: 60
        }
      };
      return sizes[type] || sizes.node;
    }
    /**
     * Position root nodes horizontally with spacing
     */
    static positionRootNodes(rootNodes, spacing = 50) {
      let x = spacing;
      rootNodes.forEach(node => {
        node.x = x;
        node.y = spacing;
        x += node.width + spacing;
      });
    }
    /**
     * Fixed header offset for containment-style containers to avoid clamping children into the title bar.
     * Uses a constant value to prevent jumping when parent is resized.
     */
    static computeHeaderOffset(node) {
      return this.HEADER_HEIGHT;
    }
    /**
     * Clamp a child node inside its parent bounds using padding and header offsets.
     */
    static clampChildWithinParent(child, parent, padding = 20, headerOffset) {
      const parentDefaults = this.getMinimumNodeSize(parent.type);
      const childDefaults = this.getMinimumNodeSize(child.type);
      const parentWidth = Number.isFinite(parent.width) ? parent.width : parentDefaults.width;
      const parentHeight = Number.isFinite(parent.height) ? parent.height : parentDefaults.height;
      child.width = Number.isFinite(child.width) ? child.width : childDefaults.width;
      child.height = Number.isFinite(child.height) ? child.height : childDefaults.height;
      const effectiveHeader = headerOffset ?? this.computeHeaderOffset(parent);
      const minX = padding;
      const maxX = Math.max(minX, parentWidth - padding - child.width);
      const minY = padding + effectiveHeader;
      const maxY = Math.max(minY, parentHeight - padding - child.height);
      child.x = this.clampNumber(child.x ?? minX, minX, maxX);
      child.y = this.clampNumber(child.y ?? minY, minY, maxY);
    }
    /**
     * Check if two nodes overlap
     */
    static nodesOverlap(nodeA, nodeB) {
      return !(nodeA.x + nodeA.width < nodeB.x || nodeB.x + nodeB.width < nodeA.x || nodeA.y + nodeA.height < nodeB.y || nodeB.y + nodeB.height < nodeA.y);
    }
  }
  return LayoutPrimitives;
})();

/***/ }),

/***/ 9270:
/*!**************************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/scheduler/timeoutProvider.js ***!
  \**************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   timeoutProvider: () => (/* binding */ timeoutProvider)
/* harmony export */ });
const timeoutProvider = {
  setTimeout(handler, timeout, ...args) {
    const {
      delegate
    } = timeoutProvider;
    if (delegate === null || delegate === void 0 ? void 0 : delegate.setTimeout) {
      return delegate.setTimeout(handler, timeout, ...args);
    }
    return setTimeout(handler, timeout, ...args);
  },
  clearTimeout(handle) {
    const {
      delegate
    } = timeoutProvider;
    return ((delegate === null || delegate === void 0 ? void 0 : delegate.clearTimeout) || clearTimeout)(handle);
  },
  delegate: undefined
};
//# sourceMappingURL=timeoutProvider.js.map

/***/ }),

/***/ 9786:
/*!******************************************************************!*\
  !*** ./node_modules/rxjs/dist/esm/internal/util/errorContext.js ***!
  \******************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   captureError: () => (/* binding */ captureError),
/* harmony export */   errorContext: () => (/* binding */ errorContext)
/* harmony export */ });
/* harmony import */ var _config__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../config */ 1026);

let context = null;
function errorContext(cb) {
  if (_config__WEBPACK_IMPORTED_MODULE_0__.config.useDeprecatedSynchronousErrorHandling) {
    const isRoot = !context;
    if (isRoot) {
      context = {
        errorThrown: false,
        error: null
      };
    }
    cb();
    if (isRoot) {
      const {
        errorThrown,
        error
      } = context;
      context = null;
      if (errorThrown) {
        throw error;
      }
    }
  } else {
    cb();
  }
}
function captureError(err) {
  if (_config__WEBPACK_IMPORTED_MODULE_0__.config.useDeprecatedSynchronousErrorHandling && context) {
    context.errorThrown = true;
    context.error = err;
  }
}
//# sourceMappingURL=errorContext.js.map

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
/*!*******************************************************!*\
  !*** ./src/app/shared/layouts/async/layout.worker.ts ***!
  \*******************************************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _core_layout_orchestrator__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../core/layout-orchestrator */ 2493);
/* harmony import */ var _engine_registry__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../engine-registry */ 3072);


const orchestrator = (0,_engine_registry__WEBPACK_IMPORTED_MODULE_1__.registerDefaultLayoutEngines)(new _core_layout_orchestrator__WEBPACK_IMPORTED_MODULE_0__.LayoutOrchestrator());
self.onmessage = event => {
  const payload = event.data;
  try {
    const resolvedEngine = payload.options.engineName ?? orchestrator.getActiveEngineName(payload.canvasId) ?? 'containment-grid';
    orchestrator.setActiveEngine(payload.canvasId, resolvedEngine, payload.options.source ?? 'system');
    const result = orchestrator.runLayout(payload.canvasId, payload.graph, {
      ...payload.options,
      engineName: resolvedEngine
    });
    self.postMessage({
      result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({
      error: message
    });
  }
};
})();

/******/ })()
;