import { resolve } from "node:path";

import {
  Node,
  Project,
  SyntaxKind,
  type ArrowFunction,
  type CallExpression,
  type Block,
  type ExpressionStatement,
  type ImportDeclaration,
  type JsxAttribute,
  type SourceFile,
  type Statement,
  type VariableDeclaration,
} from "ts-morph";

import type {
  ActionNode,
  CacheOperationNode,
  ComponentNode,
  ExternalStoreUsageNode,
  FormFieldNode,
  HookNode,
  ReduxActionUsageNode,
  ReduxSelectorUsageNode,
  SourceLocation,
  StateNode,
  YomiGraph,
} from "./yomi-ir";

export type InstrumentProjectInput = {
  readonly adapterImport?: string;
  readonly apply?: boolean;
  readonly graph: YomiGraph;
  readonly projectPath: string;
  readonly queryAdapterImport?: string;
  readonly target?: string;
  readonly targets?: readonly string[];
};

export type InstrumentationPatch = {
  readonly file: string;
  readonly before: string;
  readonly after: string;
};

export type InstrumentationProposal = {
  readonly adapterImport: string;
  readonly file: string;
  readonly graphNodeId: string;
  readonly kind:
    | "createYomiAction"
    | "traceYomiRouterRefresh"
    | "traceYomiReduxAction"
    | "useYomiExternalStoreTrace"
    | "useYomiFormFieldTrace"
    | "useYomiReduxSelectorTrace"
    | "traceTanStackQueryOperation"
    | "useYomiRenderTrace"
    | "useYomiTraceEffect"
    | "useYomiTracedState";
  readonly metadataName: string;
  readonly patch: InstrumentationPatch;
  readonly source: SourceLocation;
  readonly summary: string;
};

export type InstrumentationResult = {
  readonly applied: boolean;
  readonly changedFiles: readonly string[];
  readonly project: string;
  readonly proposals: readonly InstrumentationProposal[];
  readonly targets: readonly string[];
};

const defaultAdapterImport = "@isamisushi/yomi/react";
const defaultQueryAdapterImport = "@isamisushi/yomi/tanstack-query";

export async function instrumentProject(
  input: InstrumentProjectInput,
): Promise<InstrumentationResult> {
  const projectRoot = resolve(input.projectPath);
  const adapterImport = input.adapterImport ?? defaultAdapterImport;
  const queryAdapterImport = input.queryAdapterImport ?? defaultQueryAdapterImport;
  const targets = normalizeTargets(input);

  const project = createSourceProject(projectRoot);
  const originalTexts = new Map<string, string>();
  const proposalInputs = targets.map((target) =>
    instrumentTarget({
      adapterImport,
      graph: input.graph,
      originalTexts,
      project,
      projectRoot,
      queryAdapterImport,
      target,
    }),
  );

  const changedFiles = Array.from(
    new Set(proposalInputs.map((proposal) => proposal.file)),
  ).sort();
  for (const file of changedFiles) {
    const sourceFile = project.getSourceFile(resolve(projectRoot, file));
    sourceFile?.formatText({ indentSize: 2 });
  }

  if (input.apply === true) {
    await project.save();
  }

  const proposals = proposalInputs.map((proposal) => {
    const sourceFile = project.getSourceFile(resolve(projectRoot, proposal.file));
    if (sourceFile === undefined) {
      throw new Error(`Source file not found after instrumentation: ${proposal.file}`);
    }
    return {
      ...proposal,
      patch: {
        file: proposal.file,
        before: originalTexts.get(proposal.file) ?? proposal.patch.before,
        after: sourceFile.getFullText(),
      },
    };
  });

  return {
    applied: input.apply === true,
    changedFiles: input.apply === true ? changedFiles : [],
    project: projectRoot,
    proposals,
    targets,
  };
}

type InstrumentTargetInput = {
  readonly adapterImport: string;
  readonly graph: YomiGraph;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
  readonly queryAdapterImport: string;
  readonly target: string;
};

function instrumentTarget(input: InstrumentTargetInput): InstrumentationProposal {
  const targetHook = input.graph.hooks.find((hook) => hook.id === input.target);
  const targetState = input.graph.states.find((state) => state.id === input.target);
  const targetAction = input.graph.actions.find((action) => action.id === input.target);
  const targetCacheOperation = input.graph.cacheOperations.find(
    (operation) => operation.id === input.target,
  );
  const targetReduxActionUsage = input.graph.reduxActionUsages.find(
    (usage) => usage.id === input.target,
  );
  const targetReduxSelectorUsage = input.graph.reduxSelectorUsages.find(
    (usage) => usage.id === input.target,
  );
  const targetExternalStoreUsage = input.graph.externalStoreUsages.find(
    (usage) => usage.id === input.target,
  );
  const targetFormField = input.graph.formFields.find((field) => field.id === input.target);
  const targetComponent = input.graph.components.find(
    (component) => component.id === input.target,
  );

  const proposal =
    targetHook !== undefined
      ? instrumentHook({
          adapterImport: input.adapterImport,
          hook: targetHook,
          originalTexts: input.originalTexts,
          project: input.project,
          projectRoot: input.projectRoot,
        })
      : targetState !== undefined
        ? instrumentUseState({
            adapterImport: input.adapterImport,
            originalTexts: input.originalTexts,
            project: input.project,
            projectRoot: input.projectRoot,
            state: targetState,
          })
        : targetAction !== undefined
          ? instrumentAction({
              action: targetAction,
              adapterImport: input.adapterImport,
              originalTexts: input.originalTexts,
              project: input.project,
              projectRoot: input.projectRoot,
            })
          : targetCacheOperation !== undefined
            ? instrumentCacheOperation({
                cacheOperation: targetCacheOperation,
                originalTexts: input.originalTexts,
                project: input.project,
                projectRoot: input.projectRoot,
                queryAdapterImport: input.queryAdapterImport,
              })
            : targetComponent !== undefined
              ? instrumentRender({
                  adapterImport: input.adapterImport,
                  component: targetComponent,
                  originalTexts: input.originalTexts,
                  project: input.project,
                  projectRoot: input.projectRoot,
                })
              : targetReduxActionUsage !== undefined
                ? instrumentReduxActionUsage({
                    adapterImport: input.adapterImport,
                    originalTexts: input.originalTexts,
                    project: input.project,
                    projectRoot: input.projectRoot,
                    usage: targetReduxActionUsage,
                  })
                : targetReduxSelectorUsage !== undefined
                  ? instrumentReduxSelectorUsage({
                      adapterImport: input.adapterImport,
                      originalTexts: input.originalTexts,
                      project: input.project,
                      projectRoot: input.projectRoot,
                      usage: targetReduxSelectorUsage,
                    })
                  : targetExternalStoreUsage !== undefined
                    ? instrumentExternalStoreUsage({
                        adapterImport: input.adapterImport,
                        originalTexts: input.originalTexts,
                        project: input.project,
                        projectRoot: input.projectRoot,
                        usage: targetExternalStoreUsage,
                      })
                    : targetFormField !== undefined
                      ? instrumentFormField({
                          adapterImport: input.adapterImport,
                          field: targetFormField,
                          graph: input.graph,
                          originalTexts: input.originalTexts,
                          project: input.project,
                          projectRoot: input.projectRoot,
                        })
              : undefined;

  if (proposal === undefined) {
    throw new Error(
      `Unsupported instrumentation target "${input.target}". Expected a component, hook, state, action, cache operation, form field, external store usage, Redux action usage, or Redux selector usage graph node id.`,
    );
  }
  return proposal;
}

function normalizeTargets(input: InstrumentProjectInput): readonly string[] {
  const targets = [...(input.target === undefined ? [] : [input.target]), ...(input.targets ?? [])]
    .map((target) => target.trim())
    .filter((target) => target !== "");
  const uniqueTargets = Array.from(new Set(targets));
  if (uniqueTargets.length === 0) {
    throw new Error("At least one instrumentation target is required.");
  }
  return uniqueTargets;
}

function instrumentHook(input: {
  readonly adapterImport: string;
  readonly hook: HookNode;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
}): InstrumentationProposal {
  if (input.hook.source.symbol === "useEffect") {
    return instrumentUseEffect(input);
  }
  if (input.hook.name === "router refresh" && input.hook.source.symbol === "refresh") {
    return instrumentRouterRefresh(input);
  }

  throw new Error(
    `Unsupported hook source "${input.hook.source.symbol}" for "${input.hook.id}". Currently yomi instrument supports useEffect and router refresh targets.`,
  );
}

function instrumentUseEffect(input: {
  readonly adapterImport: string;
  readonly hook: HookNode;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
}): InstrumentationProposal {
  if (input.hook.source.symbol !== "useEffect") {
    throw new Error(
      `Unsupported hook source "${input.hook.source.symbol}" for "${input.hook.id}". Currently yomi instrument supports useEffect targets.`,
    );
  }

  const sourceFile = input.project.getSourceFile(
    resolve(input.projectRoot, input.hook.source.file),
  );
  if (sourceFile === undefined) {
    throw new Error(`Source file not found for hook: ${input.hook.source.file}`);
  }

  const useEffectCall = findCallAtSource(sourceFile, input.hook.source, "useEffect");
  if (useEffectCall === undefined) {
    throw new Error(
      `Could not find useEffect call at ${input.hook.source.file}:${input.hook.source.line}.`,
    );
  }

  rememberOriginalText(input.originalTexts, input.hook.source.file, sourceFile);
  const metadataName = `${toIdentifier(input.hook.id)}Trace`;

  addReactInstrumentationImport(sourceFile, input.adapterImport, [
    "useYomiTraceEffect",
  ]);
  addMetadataConstant({
    graphNodeId: input.hook.id,
    metadataName,
    source: input.hook.source,
    sourceFile,
  });
  replaceUseEffectCall(useEffectCall, metadataName);
  removeUnusedReactUseEffectImport(sourceFile);
  const after = sourceFile.getFullText();
  return {
    adapterImport: input.adapterImport,
    file: input.hook.source.file,
    graphNodeId: input.hook.id,
    kind: "useYomiTraceEffect",
    metadataName,
    patch: {
      file: input.hook.source.file,
      before: input.originalTexts.get(input.hook.source.file) ?? after,
      after,
    },
    source: input.hook.source,
    summary: `Wrapped ${input.hook.source.symbol} with useYomiTraceEffect and added source-linked trace metadata.`,
  };
}

function instrumentRouterRefresh(input: {
  readonly adapterImport: string;
  readonly hook: HookNode;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
}): InstrumentationProposal {
  const sourceFile = input.project.getSourceFile(
    resolve(input.projectRoot, input.hook.source.file),
  );
  if (sourceFile === undefined) {
    throw new Error(`Source file not found for hook: ${input.hook.source.file}`);
  }

  const refreshCall = findCallAtSource(sourceFile, input.hook.source, "refresh");
  if (refreshCall === undefined) {
    throw new Error(
      `Could not find router refresh call at ${input.hook.source.file}:${input.hook.source.line}.`,
    );
  }

  rememberOriginalText(input.originalTexts, input.hook.source.file, sourceFile);
  const metadataName = `${toIdentifier(input.hook.id)}Trace`;
  addReactInstrumentationImport(sourceFile, input.adapterImport, [
    "traceYomiRouterRefresh",
  ]);
  addMetadataConstant({
    graphNodeId: input.hook.id,
    metadataName,
    source: input.hook.source,
    sourceFile,
  });

  const refreshText = refreshCall.getText();
  refreshCall.replaceWithText(`traceYomiRouterRefresh(${metadataName}, () => ${refreshText})`);
  const after = sourceFile.getFullText();
  return {
    adapterImport: input.adapterImport,
    file: input.hook.source.file,
    graphNodeId: input.hook.id,
    kind: "traceYomiRouterRefresh",
    metadataName,
    patch: {
      file: input.hook.source.file,
      before: input.originalTexts.get(input.hook.source.file) ?? after,
      after,
    },
    source: input.hook.source,
    summary: `Wrapped router refresh with traceYomiRouterRefresh and added source-linked trace metadata.`,
  };
}

function instrumentUseState(input: {
  readonly adapterImport: string;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
  readonly state: StateNode;
}): InstrumentationProposal {
  if (input.state.kind !== "local") {
    throw new Error(
      `Unsupported state kind "${input.state.kind}" for "${input.state.id}". Currently yomi instrument supports local useState targets.`,
    );
  }

  const sourceFile = input.project.getSourceFile(
    resolve(input.projectRoot, input.state.source.file),
  );
  if (sourceFile === undefined) {
    throw new Error(`Source file not found for state: ${input.state.source.file}`);
  }

  const stateDeclaration = findStateDeclaration(sourceFile, input.state);
  if (stateDeclaration === undefined) {
    throw new Error(
      `Could not find useState declaration for ${input.state.name} at ${input.state.source.file}:${input.state.source.line}.`,
    );
  }

  const initializer = stateDeclaration.getInitializer();
  if (!Node.isCallExpression(initializer) || initializer.getExpression().getText() !== "useState") {
    throw new Error(
      `State target "${input.state.id}" is not backed by a direct useState call.`,
    );
  }

  rememberOriginalText(input.originalTexts, input.state.source.file, sourceFile);
  const metadataName = `${toIdentifier(input.state.id)}Trace`;

  addReactInstrumentationImport(sourceFile, input.adapterImport, [
    "useYomiTracedState",
  ]);
  addMetadataConstant({
    graphNodeId: input.state.id,
    metadataName,
    source: input.state.source,
    sourceFile,
  });
  replaceUseStateCall(initializer, metadataName);
  removeUnusedReactNamedImport(sourceFile, "useState");
  const after = sourceFile.getFullText();
  return {
    adapterImport: input.adapterImport,
    file: input.state.source.file,
    graphNodeId: input.state.id,
    kind: "useYomiTracedState",
    metadataName,
    patch: {
      file: input.state.source.file,
      before: input.originalTexts.get(input.state.source.file) ?? after,
      after,
    },
    source: input.state.source,
    summary: `Wrapped ${input.state.name} state with useYomiTracedState and added source-linked trace metadata.`,
  };
}

function instrumentAction(input: {
  readonly action: ActionNode;
  readonly adapterImport: string;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
}): InstrumentationProposal {
  if (!input.action.source.symbol.startsWith("on")) {
    throw new Error(
      `Unsupported action source "${input.action.source.symbol}" for "${input.action.id}". Currently yomi instrument supports JSX event handler attributes.`,
    );
  }

  const sourceFile = input.project.getSourceFile(
    resolve(input.projectRoot, input.action.source.file),
  );
  if (sourceFile === undefined) {
    throw new Error(`Source file not found for action: ${input.action.source.file}`);
  }

  const attribute = findJsxAttributeAtSource(sourceFile, input.action.source);
  if (attribute === undefined) {
    throw new Error(
      `Could not find JSX action attribute at ${input.action.source.file}:${input.action.source.line}.`,
    );
  }

  const initializer = attribute.getInitializer();
  if (!Node.isJsxExpression(initializer)) {
    throw new Error(`Action target "${input.action.id}" is not backed by a JSX expression.`);
  }

  const expression = initializer.getExpression();
  if (expression === undefined) {
    throw new Error(`Action target "${input.action.id}" has an empty JSX expression.`);
  }

  rememberOriginalText(input.originalTexts, input.action.source.file, sourceFile);
  const metadataName = `${toIdentifier(input.action.id)}Trace`;

  addReactInstrumentationImport(sourceFile, input.adapterImport, [
    "createYomiAction",
  ]);
  addMetadataConstant({
    graphNodeId: input.action.id,
    metadataName,
    source: input.action.source,
    sourceFile,
  });
  expression.replaceWithText(`createYomiAction(${metadataName}, ${expression.getText()})`);
  const after = sourceFile.getFullText();
  return {
    adapterImport: input.adapterImport,
    file: input.action.source.file,
    graphNodeId: input.action.id,
    kind: "createYomiAction",
    metadataName,
    patch: {
      file: input.action.source.file,
      before: input.originalTexts.get(input.action.source.file) ?? after,
      after,
    },
    source: input.action.source,
    summary: `Wrapped ${input.action.source.symbol} with createYomiAction and added source-linked trace metadata.`,
  };
}

function instrumentReduxActionUsage(input: {
  readonly adapterImport: string;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
  readonly usage: ReduxActionUsageNode;
}): InstrumentationProposal {
  const sourceFile = input.project.getSourceFile(
    resolve(input.projectRoot, input.usage.dispatchSource.file),
  );
  if (sourceFile === undefined) {
    throw new Error(`Source file not found for Redux action usage: ${input.usage.dispatchSource.file}`);
  }

  const dispatchCall = findCallAtSource(
    sourceFile,
    input.usage.dispatchSource,
    input.usage.dispatchSource.symbol,
  );
  if (dispatchCall === undefined) {
    throw new Error(
      `Could not find Redux dispatch call at ${input.usage.dispatchSource.file}:${input.usage.dispatchSource.line}.`,
    );
  }

  rememberOriginalText(input.originalTexts, input.usage.dispatchSource.file, sourceFile);
  const metadataName = `${toIdentifier(input.usage.id)}Trace`;
  addReactInstrumentationImport(sourceFile, input.adapterImport, [
    "traceYomiReduxAction",
  ]);
  addMetadataConstant({
    graphNodeId: input.usage.id,
    metadataName,
    source: input.usage.dispatchSource,
    sourceFile,
  });

  const dispatchText = dispatchCall.getText();
  dispatchCall.replaceWithText(`traceYomiReduxAction(${metadataName}, () => ${dispatchText})`);
  const after = sourceFile.getFullText();
  return {
    adapterImport: input.adapterImport,
    file: input.usage.dispatchSource.file,
    graphNodeId: input.usage.id,
    kind: "traceYomiReduxAction",
    metadataName,
    patch: {
      file: input.usage.dispatchSource.file,
      before: input.originalTexts.get(input.usage.dispatchSource.file) ?? after,
      after,
    },
    source: input.usage.dispatchSource,
    summary: `Wrapped Redux dispatch ${input.usage.actionName} with traceYomiReduxAction and added source-linked trace metadata.`,
  };
}

function instrumentReduxSelectorUsage(input: {
  readonly adapterImport: string;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
  readonly usage: ReduxSelectorUsageNode;
}): InstrumentationProposal {
  const sourceFile = input.project.getSourceFile(
    resolve(input.projectRoot, input.usage.source.file),
  );
  if (sourceFile === undefined) {
    throw new Error(`Source file not found for Redux selector usage: ${input.usage.source.file}`);
  }

  const selectorCall = findCallAtSource(
    sourceFile,
    input.usage.source,
    input.usage.source.symbol,
  );
  if (selectorCall === undefined) {
    throw new Error(
      `Could not find Redux selector hook call at ${input.usage.source.file}:${input.usage.source.line}.`,
    );
  }

  const statement = findEnclosingStatement(selectorCall);
  if (statement === undefined) {
    throw new Error(
      `Redux selector usage "${input.usage.id}" must be inside a statement to insert trace evidence.`,
    );
  }

  rememberOriginalText(input.originalTexts, input.usage.source.file, sourceFile);
  const metadataName = `${toIdentifier(input.usage.id)}Trace`;
  addReactInstrumentationImport(sourceFile, input.adapterImport, [
    "useYomiReduxSelectorTrace",
  ]);
  addMetadataConstant({
    graphNodeId: input.usage.id,
    metadataName,
    source: input.usage.source,
    sourceFile,
  });
  insertStatementAfter(statement, reduxSelectorTraceStatement(input.usage, metadataName));
  const after = sourceFile.getFullText();
  return {
    adapterImport: input.adapterImport,
    file: input.usage.source.file,
    graphNodeId: input.usage.id,
    kind: "useYomiReduxSelectorTrace",
    metadataName,
    patch: {
      file: input.usage.source.file,
      before: input.originalTexts.get(input.usage.source.file) ?? after,
      after,
    },
    source: input.usage.source,
    summary: `Inserted source-linked Redux selector hook trace for ${input.usage.selectedPath.join(".")}.`,
  };
}

function instrumentExternalStoreUsage(input: {
  readonly adapterImport: string;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
  readonly usage: ExternalStoreUsageNode;
}): InstrumentationProposal {
  const sourceFile = input.project.getSourceFile(
    resolve(input.projectRoot, input.usage.source.file),
  );
  if (sourceFile === undefined) {
    throw new Error(`Source file not found for external store usage: ${input.usage.source.file}`);
  }

  const storeCall = findCallAtSource(
    sourceFile,
    input.usage.source,
    input.usage.source.symbol,
  );
  if (storeCall === undefined) {
    throw new Error(
      `Could not find external store hook call at ${input.usage.source.file}:${input.usage.source.line}.`,
    );
  }

  const statement = findEnclosingStatement(storeCall);
  if (statement === undefined) {
    throw new Error(
      `External store usage "${input.usage.id}" must be inside a statement to insert trace evidence.`,
    );
  }

  rememberOriginalText(input.originalTexts, input.usage.source.file, sourceFile);
  const metadataName = `${toIdentifier(input.usage.id)}Trace`;
  addReactInstrumentationImport(sourceFile, input.adapterImport, [
    "useYomiExternalStoreTrace",
  ]);
  addMetadataConstant({
    graphNodeId: input.usage.id,
    metadataName,
    source: input.usage.source,
    sourceFile,
  });
  insertStatementAfter(statement, externalStoreTraceStatement(input.usage, metadataName));
  const after = sourceFile.getFullText();
  return {
    adapterImport: input.adapterImport,
    file: input.usage.source.file,
    graphNodeId: input.usage.id,
    kind: "useYomiExternalStoreTrace",
    metadataName,
    patch: {
      file: input.usage.source.file,
      before: input.originalTexts.get(input.usage.source.file) ?? after,
      after,
    },
    source: input.usage.source,
    summary: `Inserted source-linked external store trace for ${input.usage.storeName}.`,
  };
}

function instrumentFormField(input: {
  readonly adapterImport: string;
  readonly field: FormFieldNode;
  readonly graph: YomiGraph;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
}): InstrumentationProposal {
  const component = input.graph.components.find(
    (candidate) => candidate.id === input.field.ownerComponentId,
  );
  if (component === undefined) {
    throw new Error(`Owner component not found for form field: ${input.field.id}`);
  }

  const sourceFile = input.project.getSourceFile(resolve(input.projectRoot, component.source.file));
  if (sourceFile === undefined) {
    throw new Error(`Source file not found for form field owner: ${component.source.file}`);
  }

  const renderTarget = findComponentRenderTarget(sourceFile, component);
  if (renderTarget === undefined || renderTarget.kind !== "block") {
    throw new Error(
      `Form field target "${input.field.id}" requires a block-bodied owner component.`,
    );
  }

  const evidence = getFormFieldTraceEvidence(input.field);
  rememberOriginalText(input.originalTexts, component.source.file, sourceFile);
  const metadataName = `${toIdentifier(input.field.id)}Trace`;
  addReactInstrumentationImport(sourceFile, input.adapterImport, [
    "useYomiFormFieldTrace",
  ]);
  addMetadataConstant({
    graphNodeId: input.field.id,
    metadataName,
    source: evidence.source,
    sourceFile,
  });
  insertFormFieldTraceStatement(renderTarget.body, input.field, metadataName, evidence.kind);
  const after = sourceFile.getFullText();
  return {
    adapterImport: input.adapterImport,
    file: component.source.file,
    graphNodeId: input.field.id,
    kind: "useYomiFormFieldTrace",
    metadataName,
    patch: {
      file: component.source.file,
      before: input.originalTexts.get(component.source.file) ?? after,
      after,
    },
    source: evidence.source,
    summary: `Inserted source-linked form field trace for ${input.field.name}.`,
  };
}

function instrumentCacheOperation(input: {
  readonly cacheOperation: CacheOperationNode;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
  readonly queryAdapterImport: string;
}): InstrumentationProposal {
  const sourceFile = input.project.getSourceFile(
    resolve(input.projectRoot, input.cacheOperation.source.file),
  );
  if (sourceFile === undefined) {
    throw new Error(`Source file not found for cache operation: ${input.cacheOperation.source.file}`);
  }

  const call = findCacheOperationCallAtSource(sourceFile, input.cacheOperation);
  if (call === undefined) {
    throw new Error(
      `Could not find cache operation call at ${input.cacheOperation.source.file}:${input.cacheOperation.source.line}.`,
    );
  }

  const statement = findCacheTraceInsertionStatement(call);
  if (statement === undefined) {
    throw new Error(
      `Cache operation target "${input.cacheOperation.id}" must be a standalone, awaited, returned, or assigned statement.`,
    );
  }

  rememberOriginalText(input.originalTexts, input.cacheOperation.source.file, sourceFile);
  const metadataName = `${toIdentifier(input.cacheOperation.id)}Trace`;

  addInstrumentationImport({
    moduleSpecifier: input.queryAdapterImport,
    sourceFile,
    typeImportName: "YomiQueryTraceMetadata",
    valueImports: ["traceTanStackQueryOperation"],
  });
  addMetadataConstant({
    graphNodeId: input.cacheOperation.id,
    metadataName,
    metadataTypeName: "YomiQueryTraceMetadata",
    source: input.cacheOperation.source,
    sourceFile,
  });
  insertCacheTraceStatement(statement, input.cacheOperation, metadataName);
  const after = sourceFile.getFullText();
  return {
    adapterImport: input.queryAdapterImport,
    file: input.cacheOperation.source.file,
    graphNodeId: input.cacheOperation.id,
    kind: "traceTanStackQueryOperation",
    metadataName,
    patch: {
      file: input.cacheOperation.source.file,
      before: input.originalTexts.get(input.cacheOperation.source.file) ?? after,
      after,
    },
    source: input.cacheOperation.source,
    summary: `Inserted source-linked TanStack Query trace before ${input.cacheOperation.source.symbol}.`,
  };
}

function instrumentRender(input: {
  readonly adapterImport: string;
  readonly component: ComponentNode;
  readonly originalTexts: Map<string, string>;
  readonly project: Project;
  readonly projectRoot: string;
}): InstrumentationProposal {
  const sourceFile = input.project.getSourceFile(
    resolve(input.projectRoot, input.component.source.file),
  );
  if (sourceFile === undefined) {
    throw new Error(`Source file not found for component: ${input.component.source.file}`);
  }

  const renderTarget = findComponentRenderTarget(sourceFile, input.component);
  if (renderTarget === undefined) {
    throw new Error(
      `Could not find component body for ${input.component.name} at ${input.component.source.file}:${input.component.source.line}.`,
    );
  }

  rememberOriginalText(input.originalTexts, input.component.source.file, sourceFile);
  const metadataName = `${toIdentifier(input.component.id)}RenderTrace`;
  const traceStatement = `useYomiRenderTrace(${metadataName}, () => ${JSON.stringify(`${input.component.name} render committed.`)});`;

  addReactInstrumentationImport(sourceFile, input.adapterImport, [
    "useYomiRenderTrace",
  ]);
  addMetadataConstant({
    graphNodeId: input.component.id,
    metadataName,
    source: input.component.source,
    sourceFile,
  });
  insertRenderTraceStatement(renderTarget, traceStatement, metadataName);
  const after = sourceFile.getFullText();
  return {
    adapterImport: input.adapterImport,
    file: input.component.source.file,
    graphNodeId: input.component.id,
    kind: "useYomiRenderTrace",
    metadataName,
    patch: {
      file: input.component.source.file,
      before: input.originalTexts.get(input.component.source.file) ?? after,
      after,
    },
    source: input.component.source,
    summary: `Inserted useYomiRenderTrace for ${input.component.name} render commits and added source-linked trace metadata.`,
  };
}

type RenderTraceTarget =
  | {
      readonly kind: "block";
      readonly body: Block;
    }
  | {
      readonly kind: "expression-arrow";
      readonly body: ReturnType<ArrowFunction["getBody"]>;
    };

function rememberOriginalText(
  originalTexts: Map<string, string>,
  file: string,
  sourceFile: SourceFile,
): void {
  if (!originalTexts.has(file)) {
    originalTexts.set(file, sourceFile.getFullText());
  }
}

function createSourceProject(projectRoot: string): Project {
  const tsConfigFilePath = resolve(projectRoot, "tsconfig.json");
  return new Project({
    skipAddingFilesFromTsConfig: false,
    tsConfigFilePath,
  });
}

function findCallAtSource(
  sourceFile: SourceFile,
  source: SourceLocation,
  calleeName: string,
): CallExpression | undefined {
  const calls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const expression = call.getExpression();
      return expression.getText() === calleeName || getCallExpressionName(call) === calleeName;
    });
  return nearestByLine(
    calls.filter((call) => call.getStartLineNumber() === source.line),
    source.line,
  ) ?? nearestByLine(calls, source.line);
}

function addReactInstrumentationImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  valueImports: readonly string[],
): void {
  addInstrumentationImport({
    moduleSpecifier,
    sourceFile,
    typeImportName: "YomiTraceMetadata",
    valueImports,
  });
}

function addInstrumentationImport(input: {
  readonly moduleSpecifier: string;
  readonly sourceFile: SourceFile;
  readonly typeImportName: string;
  readonly valueImports: readonly string[];
}): void {
  const existingImport = input.sourceFile.getImportDeclaration(input.moduleSpecifier);
  if (existingImport !== undefined) {
    for (const valueImport of input.valueImports) {
      addNamedImport(existingImport, valueImport, false);
    }
    addNamedImport(existingImport, input.typeImportName, true);
    return;
  }

  input.sourceFile.addImportDeclaration({
    moduleSpecifier: input.moduleSpecifier,
    namedImports: [
      ...input.valueImports.map((name) => ({ name })),
      { name: input.typeImportName, isTypeOnly: true },
    ],
  });
}

function addNamedImport(
  declaration: ImportDeclaration,
  name: string,
  isTypeOnly: boolean,
): void {
  const hasImport = declaration.getNamedImports().some((namedImport) =>
    namedImport.getName() === name && namedImport.isTypeOnly() === isTypeOnly,
  );
  if (!hasImport) {
    declaration.addNamedImport({ name, isTypeOnly });
  }
}

function addMetadataConstant(input: {
  readonly graphNodeId: string;
  readonly metadataName: string;
  readonly metadataTypeName?: string;
  readonly source: SourceLocation;
  readonly sourceFile: SourceFile;
}): void {
  if (input.sourceFile.getVariableDeclaration(input.metadataName) !== undefined) {
    return;
  }

  input.sourceFile.insertStatements(firstNonImportStatementIndex(input.sourceFile), [
    `const ${input.metadataName}: ${input.metadataTypeName ?? "YomiTraceMetadata"} = {
  name: ${JSON.stringify(input.source.symbol)},
  source: {
    file: ${JSON.stringify(input.source.file)},
    line: ${input.source.line},
    symbol: ${JSON.stringify(input.source.symbol)},
  },
  graphNodeId: ${JSON.stringify(input.graphNodeId)},
};`,
  ]);
}

function firstNonImportStatementIndex(sourceFile: SourceFile): number {
  const statements = sourceFile.getStatements();
  const index = statements.findIndex((statement) => {
    if (Node.isImportDeclaration(statement)) {
      return false;
    }
    if (Node.isExpressionStatement(statement) && Node.isStringLiteral(statement.getExpression())) {
      return false;
    }
    return true;
  });
  return index === -1 ? statements.length : index;
}

function replaceUseEffectCall(call: CallExpression, metadataName: string): void {
  const args = call.getArguments().map((argument) => argument.getText());
  call.replaceWithText(`useYomiTraceEffect(${metadataName}, ${args.join(", ")})`);
}

function removeUnusedReactUseEffectImport(sourceFile: SourceFile): void {
  removeUnusedReactNamedImport(sourceFile, "useEffect");
}

function removeUnusedReactNamedImport(sourceFile: SourceFile, importName: string): void {
  const stillUsesUseEffect = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some((call) => call.getExpression().getText() === importName);

  if (stillUsesUseEffect) {
    return;
  }

  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== "react") {
      continue;
    }
    for (const namedImport of declaration.getNamedImports()) {
      if (namedImport.getName() === importName) {
        namedImport.remove();
      }
    }
    removeEmptyImport(declaration);
  }
}

function findStateDeclaration(
  sourceFile: SourceFile,
  state: StateNode,
): VariableDeclaration | undefined {
  const declarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration).filter(
    (declaration) => {
    const nameNode = declaration.getNameNode();
    if (!Node.isArrayBindingPattern(nameNode)) {
      return false;
    }
    const firstElement = nameNode.getElements()[0];
    return firstElement?.getText() === state.name;
    },
  );
  return nearestByLine(
    declarations.filter((declaration) => declaration.getStartLineNumber() === state.source.line),
    state.source.line,
  ) ?? nearestByLine(declarations, state.source.line);
}

function replaceUseStateCall(call: CallExpression, metadataName: string): void {
  const typeArguments = call.getTypeArguments().map((typeArgument) => typeArgument.getText());
  const typeArgumentsText = typeArguments.length === 0 ? "" : `<${typeArguments.join(", ")}>`;
  const args = call.getArguments().map((argument) => argument.getText());
  call.replaceWithText(
    `useYomiTracedState${typeArgumentsText}(${metadataName}${
      args.length === 0 ? "" : `, ${args.join(", ")}`
    })`,
  );
}

function findJsxAttributeAtSource(
  sourceFile: SourceFile,
  source: SourceLocation,
): JsxAttribute | undefined {
  const attributes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute).filter((attribute) =>
    attribute.getNameNode().getText() === source.symbol,
  );
  return nearestByLine(
    attributes.filter((attribute) => attribute.getStartLineNumber() === source.line),
    source.line,
  ) ?? nearestByLine(attributes, source.line);
}

function findCacheOperationCallAtSource(
  sourceFile: SourceFile,
  cacheOperation: CacheOperationNode,
): CallExpression | undefined {
  const calls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => getCallExpressionName(call) === cacheOperation.source.symbol);
  return nearestByLine(
    calls.filter((call) => call.getStartLineNumber() === cacheOperation.source.line),
    cacheOperation.source.line,
  ) ?? nearestByLine(calls, cacheOperation.source.line);
}

function getCallExpressionName(call: CallExpression): string | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }
  return undefined;
}

function findEnclosingStatement(node: Node): Statement | undefined {
  return node.getFirstAncestor((ancestor): ancestor is Statement =>
    Node.isExpressionStatement(ancestor) ||
    Node.isReturnStatement(ancestor) ||
    Node.isVariableStatement(ancestor),
  );
}

function insertStatementAfter(statement: Statement, insertedStatement: string): void {
  if (statement.getSourceFile().getFullText().includes(insertedStatement)) {
    return;
  }

  const parent = statement.getParent();
  if (Node.isBlock(parent)) {
    const index = parent.getStatements().findIndex((candidate) => candidate === statement);
    parent.insertStatements(index + 1, [insertedStatement]);
    return;
  }

  if (Node.isSourceFile(parent)) {
    const index = parent.getStatements().findIndex((candidate) => candidate === statement);
    parent.insertStatements(index + 1, [insertedStatement]);
    return;
  }

  statement.replaceWithText(`${statement.getText()}
${insertedStatement}`);
}

function reduxSelectorTraceStatement(
  usage: ReduxSelectorUsageNode,
  metadataName: string,
): string {
  return `useYomiReduxSelectorTrace(${metadataName}, ${JSON.stringify(usage.selectedPath)});`;
}

function externalStoreTraceStatement(
  usage: ExternalStoreUsageNode,
  metadataName: string,
): string {
  return `useYomiExternalStoreTrace(${metadataName}, ${JSON.stringify(usage.storeName)}, ${JSON.stringify(usage.selectedFields)}, ${JSON.stringify(usage.usageKind)});`;
}

function findCacheTraceInsertionStatement(call: CallExpression): Statement | undefined {
  const expressionStatement = call.getFirstAncestorByKind(SyntaxKind.ExpressionStatement);
  if (
    expressionStatement !== undefined &&
    isDirectOrAwaitedCacheCall(expressionStatement.getExpression(), call)
  ) {
    return expressionStatement;
  }

  const returnStatement = call.getFirstAncestorByKind(SyntaxKind.ReturnStatement);
  if (
    returnStatement !== undefined &&
    isDirectOrAwaitedCacheCall(returnStatement.getExpression(), call)
  ) {
    return returnStatement;
  }

  const variableDeclaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (
    variableDeclaration !== undefined &&
    isDirectOrAwaitedCacheCall(variableDeclaration.getInitializer(), call)
  ) {
    return variableDeclaration.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  }

  return undefined;
}

function isDirectOrAwaitedCacheCall(node: Node | undefined, call: CallExpression): boolean {
  if (node === call) {
    return true;
  }
  return Node.isAwaitExpression(node) && node.getExpression() === call;
}

function insertCacheTraceStatement(
  statement: Statement,
  cacheOperation: CacheOperationNode,
  metadataName: string,
): void {
  if (statement.getSourceFile().getFullText().includes(`metadata: ${metadataName}`)) {
    return;
  }

  const operation = tanStackTraceOperation(cacheOperation);
  if (operation === undefined) {
    throw new Error(
      `Cache operation kind "${cacheOperation.kind}" is not supported by @isamisushi/yomi/tanstack-query instrumentation.`,
    );
  }

  statement.replaceWithText(`${cacheTraceStatement(cacheOperation, metadataName, operation)}
${statement.getText()}`);
}

function tanStackTraceOperation(
  cacheOperation: CacheOperationNode,
): "invalidate" | "refetch" | "set-query-data" | undefined {
  switch (cacheOperation.kind) {
    case "invalidate":
      return "invalidate";
    case "refetch":
      return "refetch";
    case "set-query-data":
      return "set-query-data";
    case "mutate":
      return undefined;
  }
}

function cacheTraceStatement(
  cacheOperation: CacheOperationNode,
  metadataName: string,
  operation: "invalidate" | "refetch" | "set-query-data",
): string {
  const queryKey =
    cacheOperation.targetKey.length === 0
      ? ""
      : `,
  queryKey: ${JSON.stringify(cacheOperation.targetKey)}`;
  return `traceTanStackQueryOperation({
  metadata: ${metadataName},
  operation: ${JSON.stringify(operation)}${queryKey},
});`;
}

function findComponentRenderTarget(
  sourceFile: SourceFile,
  component: ComponentNode,
): RenderTraceTarget | undefined {
  const functionDeclaration = sourceFile.getFunction(component.name);
  const functionBody = functionDeclaration?.getBody();
  if (Node.isBlock(functionBody)) {
    return { kind: "block", body: functionBody };
  }

  const declarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration).filter(
    (declaration) => declaration.getNameNode().getText() === component.name,
  );
  for (const declaration of declarations) {
    const initializer = declaration.getInitializer();
    if (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) {
      const body = initializer.getBody();
      if (Node.isBlock(body)) {
        return { kind: "block", body };
      }
      if (Node.isArrowFunction(initializer)) {
        return { kind: "expression-arrow", body };
      }
    }
  }

  return undefined;
}

function insertRenderTraceStatement(
  target: RenderTraceTarget,
  traceStatement: string,
  metadataName: string,
): void {
  if (target.body.getText().includes(`useYomiRenderTrace(${metadataName}`)) {
    return;
  }

  if (target.kind === "block") {
    target.body.insertStatements(firstHookStatementIndex(target.body), [traceStatement]);
    return;
  }

  target.body.replaceWithText(`{
${traceStatement}
return ${target.body.getText()};
}`);
}

function getFormFieldTraceEvidence(field: FormFieldNode): {
  readonly kind: "error" | "field" | "validation";
  readonly source: SourceLocation;
} {
  if (field.validation !== undefined) {
    return { kind: "validation", source: field.validation.source };
  }
  if (field.register !== undefined) {
    return { kind: "field", source: field.register };
  }
  const error = field.errors[0];
  if (error !== undefined) {
    return { kind: "error", source: error.source };
  }
  throw new Error(`Form field "${field.id}" has no source-linked evidence.`);
}

function insertFormFieldTraceStatement(
  body: Block,
  field: FormFieldNode,
  metadataName: string,
  evidenceKind: "error" | "field" | "validation",
): void {
  if (body.getText().includes(`useYomiFormFieldTrace(${metadataName}`)) {
    return;
  }
  body.insertStatements(firstHookStatementIndex(body), [
    `useYomiFormFieldTrace(${metadataName}, ${JSON.stringify(field.name)}, ${JSON.stringify(evidenceKind)});`,
  ]);
}

function firstHookStatementIndex(body: Block): number {
  const statements = body.getStatements();
  const directiveOffset = statements.findIndex((statement) => {
    if (!Node.isExpressionStatement(statement)) {
      return true;
    }
    const expression = statement.getExpression();
    return !Node.isStringLiteral(expression);
  });
  return directiveOffset === -1 ? statements.length : directiveOffset;
}

function nearestByLine<T extends { getStartLineNumber: () => number }>(
  nodes: readonly T[],
  line: number,
): T | undefined {
  return [...nodes].sort(
    (left: T, right: T) =>
      Math.abs(left.getStartLineNumber() - line) -
      Math.abs(right.getStartLineNumber() - line),
  )[0];
}

function removeEmptyImport(declaration: ImportDeclaration): void {
  const hasDefaultImport = declaration.getDefaultImport() !== undefined;
  const hasNamespaceImport = declaration.getNamespaceImport() !== undefined;
  if (!hasDefaultImport && !hasNamespaceImport && declaration.getNamedImports().length === 0) {
    declaration.remove();
  }
}

function toIdentifier(value: string): string {
  const parts = value.split(/[^A-Za-z0-9]+/).filter((part) => part !== "");
  const [first = "yomi", ...rest] = parts;
  return [
    first.toLowerCase(),
    ...rest.map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`),
  ].join("");
}
