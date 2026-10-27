/**
 * @ai-designer/editor-core — the framework-free editor engine (I15): undo/redo history backed by
 * server operations, selection, viewport, tools, pending-operation queue and the save-state machine.
 * The web app wires it to React with a Zustand store (ADR-015); nothing here touches the DOM.
 */
export * from './command-stack.js';
export * from './selection.js';
export * from './viewport.js';
export * from './tools.js';
export * from './pending-ops.js';
export * from './save-state.js';
