/** Diagram core entry point. DSL and graph work starts at BE-003/BE-016. */
export const diagramCorePackage = "@pm/diagram-core" as const;
export * from "./schemaValidator.js";
export * from "./businessValidator.js";
export * from "./sourceRefsValidator.js";
export * from "./graphModel.js";
