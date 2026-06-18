import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import {
  Node,
  Project,
  SyntaxKind,
  ts,
  type ArrowFunction,
  type CallExpression,
  type Expression,
  type FunctionDeclaration,
  type FunctionExpression,
  type ImportDeclaration,
  type JsxAttribute,
  type JsxOpeningElement,
  type JsxOpeningLikeElement,
  type JsxSelfClosingElement,
  type MethodDeclaration,
  type Node as MorphNode,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
  type VariableDeclaration,
} from "ts-morph";

import type {
  ActionNode,
  CacheOperationNode,
  ComponentNode,
  ComponentSuspenseBoundary,
  ComponentPropSerializationRisk,
  ComponentRenderEdgeNode,
  ContextUsageNode,
  DesignSystemUsageNode,
  EffectCleanupEvidence,
  ExternalStoreUsageNode,
  FormFieldNode,
  FormFieldValidationOption,
  HookNode,
  PropNode,
  ReduxActionUsageNode,
  ReduxSelectorUsageNode,
  RemoteDataNode,
  RouteSegmentNode,
  SourceLocation,
  StateNode,
  UiNode,
  YomiGraph,
} from "./yomi-ir";

type FunctionLike = ArrowFunction | FunctionExpression;

type ComponentCandidate = {
  readonly name: string;
  readonly id: string;
  readonly sourceFile: SourceFile;
  readonly node: MorphNode;
  readonly body: MorphNode | undefined;
};

type ExternalPackageComponentCandidate = {
  readonly id: string;
  readonly localName: string;
  readonly importName: string;
  readonly packageName: string;
  readonly moduleSpecifier: string;
  readonly entry: string;
  readonly source: SourceLocation;
};

type PackageImportSpecifier = {
  readonly packageName: string;
  readonly subpath: string;
};

type ComponentExtraction = {
  readonly component: ComponentNode;
  readonly renderEdges: readonly ComponentRenderEdgeNode[];
  readonly designSystemUsages: readonly DesignSystemUsageNode[];
  readonly states: readonly StateNode[];
  readonly hooks: readonly HookNode[];
  readonly actions: readonly ActionExtraction[];
  readonly ui: readonly UiNode[];
  readonly contextActions: readonly ContextActionBinding[];
  readonly propHandlers: readonly PropHandlerBinding[];
  readonly remoteData: readonly RemoteDataNode[];
  readonly cacheOperations: readonly CacheOperationExtraction[];
  readonly formFields: readonly FormFieldNode[];
  readonly props: readonly PropNode[];
  readonly contextUsages: readonly ContextUsageNode[];
  readonly externalStoreUsages: readonly ExternalStoreUsageNode[];
  readonly reduxActionUsages: readonly ReduxActionUsageNode[];
  readonly reduxSelectorUsages: readonly ReduxSelectorUsageNode[];
};

type ProjectExtractionIndex = {
  readonly routeObjectsByComponentName: ReadonlyMap<string, readonly ObjectLiteralExpression[]>;
  readonly reduxSourceFiles: readonly SourceFile[];
  readonly reduxSelectedSourceByPath: Map<string, SourceLocation | undefined>;
};

type StateBinding = {
  readonly state: StateNode;
  readonly hookName: "useForm" | "useReducer" | "useSearchParams" | "useState";
  readonly hookSource?: SourceLocation;
  readonly hookNote?: string;
  readonly hookRisk?: HookNode["risk"];
  readonly setterName: string | undefined;
};

type HandlerBinding = {
  readonly name: string;
  readonly node: MorphNode;
  readonly body: MorphNode | undefined;
  readonly text: string;
};

type ActionExtraction = {
  readonly action: ActionNode;
  readonly handlerReferences: readonly string[];
};

type CacheOperationExtraction = {
  readonly operation: CacheOperationNode;
  readonly handlerReferences: readonly string[];
};

type SwrMutateBinding = {
  readonly key: readonly string[];
  readonly name: string;
  readonly source: SourceLocation;
};

type UseFormBinding = {
  readonly controlName?: string;
  readonly registerName?: string;
  readonly resolverFields: readonly ResolverFieldBinding[];
  readonly setErrorName?: string;
  readonly errorsName?: string;
};

type ResolverFieldBinding = {
  readonly fieldName: string;
  readonly schemaName: string;
  readonly source: SourceLocation;
  readonly validation: FormFieldNode["validation"];
};

type ControlledFieldBinding = {
  readonly fieldName: string;
  readonly localFieldName?: string;
  readonly source: SourceLocation;
  readonly validation?: FormFieldNode["validation"];
};

type RouterSubmitBinding = {
  readonly fetcherNames: readonly string[];
  readonly submitNames: readonly string[];
};

type NextRouterBinding = {
  readonly routerNames: readonly string[];
};

type ServerActionBinding = {
  readonly declaration: FunctionDeclaration;
  readonly name: string;
  readonly source: SourceLocation;
};

type PropHandlerBinding = {
  readonly ownerComponentId: string;
  readonly childComponentId: string;
  readonly propName: string;
  readonly propReferences: readonly string[];
  readonly stateIds: readonly string[];
  readonly hookIds: readonly string[];
  readonly cacheOperationIds: readonly string[];
  readonly network: readonly string[];
};

type ContextActionBinding = {
  readonly actionReference: string;
  readonly stateIds: readonly string[];
  readonly hookIds: readonly string[];
  readonly network: readonly string[];
};

type PropObjectBinding = {
  readonly name: string;
  readonly properties: readonly PropObjectProperty[];
};

type PropObjectProperty = {
  readonly propName: string;
  readonly propReferences: readonly string[];
  readonly handlerText: string;
};

type AssociatedLabel = {
  readonly text: string;
};

const routeNamePattern = /(?:Page|Route|Layout)$/;
const routePathPattern = /(?:^|\/)(?:app|pages|routes)(?:\/|$)/;
const designSystemPathPattern = /(?:^|\/)(?:components\/ui|design-system|ui)(?:\/|$)/;
const networkPattern = /\b(fetch|axios|XMLHttpRequest|useQuery|mutate|mutationFn|queryFn)\b/;
const setterPattern = /\bset[A-Z]\w*\b/;
const uiTextAttributes = new Set(["aria-label", "placeholder", "title", "alt"]);
const ignoredHookNames = new Set([
  "useCallback",
  "useContext",
  "useDebugValue",
  "useDeferredValue",
  "useEffect",
  "useId",
  "useImperativeHandle",
  "useInsertionEffect",
  "useLayoutEffect",
  "useMemo",
  "useReducer",
  "useRef",
  "useState",
  "useSyncExternalStore",
  "useTransition",
]);

export type ExtractProjectGraphInput = {
  readonly projectPath: string;
};

export function extractProjectGraph(input: ExtractProjectGraphInput): YomiGraph {
  const projectRoot = resolve(input.projectPath);
  const project = createSourceProject(projectRoot);
  const projectSourceFiles = project
    .getSourceFiles()
    .filter((sourceFile) => shouldIndexProjectSourceFile(sourceFile, projectRoot));
  const sourceFiles = projectSourceFiles.filter(shouldIndexComponentSourceFile);

  const candidates = collectComponentCandidates(sourceFiles, projectRoot);
  const externalPackageComponents = collectExternalPackageClientComponents(sourceFiles, projectRoot);
  const projectIndex = createProjectExtractionIndex(projectSourceFiles);
  const componentIdsByName = new Map(
    [
      ...candidates.map((candidate) => [candidate.name, candidate.id] as const),
      ...externalPackageComponents.map((component) => [component.localName, component.id] as const),
    ],
  );
  const clientRuntimeFiles = collectClientRuntimeSourceFiles(projectSourceFiles, projectRoot);
  const componentRuntimeById = new Map(
    [
      ...candidates.map(
        (candidate) =>
          [
            candidate.id,
            getComponentRuntime(candidate, projectRoot, clientRuntimeFiles),
          ] as const,
      ),
      ...externalPackageComponents.map(
        (component) => [component.id, "client"] as const,
      ),
    ],
  );
  const componentRoleById = new Map<string, ComponentNode["role"]>(
    [
      ...candidates.map(
        (candidate) =>
          [candidate.id, getComponentRole(candidate, projectRoot)] as const,
      ),
      ...externalPackageComponents.map(
        (component) => [component.id, "external-package"] as const,
      ),
    ],
  );
  const extractions = candidates.map((candidate) =>
    extractComponent(
      candidate,
      projectRoot,
      projectIndex,
      componentIdsByName,
      componentRuntimeById,
      componentRoleById,
    ),
  );
  const actionExtractions = extractions.flatMap((extraction) => extraction.actions);
  const propHandlers = extractions.flatMap((extraction) => extraction.propHandlers);
  const linkedPropHandlers = linkPropHandlerBindings(propHandlers);
  const contextActions = extractions.flatMap((extraction) => extraction.contextActions);
  const actions = linkContextActions(
    linkPropDrilledActions(actionExtractions, linkedPropHandlers),
    actionExtractions,
    contextActions,
  );
  const cacheOperations = linkCacheOperationsToActions(
    extractions.flatMap((extraction) => extraction.cacheOperations),
    actionExtractions,
    linkedPropHandlers,
  );

  return {
    components: [
      ...extractions.map((extraction) => extraction.component),
      ...externalPackageComponents.map(externalPackageComponentNode),
    ],
    renderEdges: extractions.flatMap((extraction) => extraction.renderEdges),
    states: extractions.flatMap((extraction) => extraction.states),
    hooks: extractions.flatMap((extraction) => extraction.hooks),
    actions,
    ui: syncUiNodesWithActions(extractions.flatMap((extraction) => extraction.ui), actions),
    remoteData: extractions.flatMap((extraction) => extraction.remoteData),
    cacheOperations,
    formFields: extractions.flatMap((extraction) => extraction.formFields),
    designSystemUsages: extractions.flatMap((extraction) => extraction.designSystemUsages),
    props: extractions.flatMap((extraction) => extraction.props),
    contextUsages: extractions.flatMap((extraction) => extraction.contextUsages),
    externalStoreUsages: extractions.flatMap((extraction) => extraction.externalStoreUsages),
    reduxActionUsages: extractions.flatMap((extraction) => extraction.reduxActionUsages),
    reduxSelectorUsages: extractions.flatMap((extraction) => extraction.reduxSelectorUsages),
  };
}

function createSourceProject(projectRoot: string): Project {
  const configPath = resolve(projectRoot, "tsconfig.json");
  const sourceFilePaths = collectProjectSourceFilePaths(projectRoot);

  if (existsSync(configPath)) {
    const project = new Project({
      tsConfigFilePath: configPath,
      skipAddingFilesFromTsConfig: true,
    });
    project.addSourceFilesAtPaths(sourceFilePaths);
    return project;
  }

  const project = new Project({
    compilerOptions: {
      allowJs: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    },
    skipAddingFilesFromTsConfig: true,
  });
  project.addSourceFilesAtPaths(sourceFilePaths);
  return project;
}

function collectProjectSourceFilePaths(projectRoot: string): readonly string[] {
  const filePaths: string[] = [];

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = resolve(directory, entry.name);
      const relativePath = normalizePath(relative(projectRoot, entryPath));
      if (shouldIgnoreProjectSourcePath(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }

      if (entry.isFile() && /\.(tsx|jsx|ts|js)$/.test(entry.name)) {
        filePaths.push(entryPath);
      }
    }
  }

  visit(projectRoot);
  return filePaths.sort();
}

function shouldIndexProjectSourceFile(sourceFile: SourceFile, projectRoot: string): boolean {
  if (sourceFile.isDeclarationFile()) {
    return false;
  }

  const fileName = normalizePath(sourceFile.getFilePath());
  const root = normalizePath(projectRoot);
  return (
    fileName.startsWith(`${root}/`) &&
    /\.(tsx|jsx|ts|js)$/.test(fileName) &&
    !shouldIgnoreProjectSourcePath(normalizePath(relative(root, fileName)))
  );
}

function shouldIgnoreProjectSourcePath(relativePath: string): boolean {
  return relativePath.split("/").some((part) =>
    part === "node_modules" ||
    part === "dist" ||
    part === "build" ||
    part === "out" ||
    part === "coverage" ||
    part === ".next" ||
    part === ".turbo" ||
    part === ".crust" ||
    part === ".yomi" ||
    part === ".git"
  );
}

function shouldIndexComponentSourceFile(sourceFile: SourceFile): boolean {
  return /\.(tsx|jsx)$/.test(normalizePath(sourceFile.getFilePath()));
}

function createProjectExtractionIndex(
  sourceFiles: readonly SourceFile[],
): ProjectExtractionIndex {
  return {
    routeObjectsByComponentName: collectRouteObjectsByComponentName(sourceFiles),
    reduxSourceFiles: sourceFiles.filter(isReduxSourceFile),
    reduxSelectedSourceByPath: new Map(),
  };
}

function collectRouteObjectsByComponentName(
  sourceFiles: readonly SourceFile[],
): ReadonlyMap<string, readonly ObjectLiteralExpression[]> {
  const routeObjectsByComponentName = new Map<string, ObjectLiteralExpression[]>();

  for (const sourceFile of sourceFiles) {
    sourceFile.forEachDescendant((node) => {
      if (!Node.isObjectLiteralExpression(node)) {
        return undefined;
      }

      const componentName = getRouteComponentName(node);
      if (componentName === undefined) {
        return undefined;
      }

      const routeObjects = routeObjectsByComponentName.get(componentName) ?? [];
      routeObjects.push(node);
      routeObjectsByComponentName.set(componentName, routeObjects);
      return undefined;
    });
  }

  return routeObjectsByComponentName;
}

function isReduxSourceFile(sourceFile: SourceFile): boolean {
  const text = sourceFile.getFullText();
  return (
    text.includes("configureStore") ||
    text.includes("createSlice") ||
    text.includes("initialState")
  );
}

function collectClientRuntimeSourceFiles(
  sourceFiles: readonly SourceFile[],
  projectRoot: string,
): ReadonlySet<string> {
  const indexedFiles = new Set(sourceFiles.map((sourceFile) => normalizePath(sourceFile.getFilePath())));
  const clientFiles = new Set<string>();
  const queue = sourceFiles.filter((sourceFile) => hasDirective(sourceFile, "use client"));

  while (queue.length > 0) {
    const sourceFile = queue.shift();
    if (sourceFile === undefined) {
      continue;
    }

    const filePath = normalizePath(sourceFile.getFilePath());
    if (clientFiles.has(filePath) || !indexedFiles.has(filePath)) {
      continue;
    }

    clientFiles.add(filePath);
    for (const importedFile of collectRuntimeImportedSourceFiles(sourceFile, projectRoot)) {
      const importedPath = normalizePath(importedFile.getFilePath());
      if (
        indexedFiles.has(importedPath) &&
        !clientFiles.has(importedPath) &&
        !hasDirective(importedFile, "use server")
      ) {
        queue.push(importedFile);
      }
    }
  }

  return clientFiles;
}

function collectRuntimeImportedSourceFiles(
  sourceFile: SourceFile,
  projectRoot: string,
): readonly SourceFile[] {
  const importedFiles: SourceFile[] = [];

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    if (importDeclaration.isTypeOnly()) {
      continue;
    }

    const importedFile = importDeclaration.getModuleSpecifierSourceFile();
    if (
      importedFile !== undefined &&
      shouldIndexProjectSourceFile(importedFile, projectRoot)
    ) {
      importedFiles.push(importedFile);
    }
  }

  for (const exportDeclaration of sourceFile.getExportDeclarations()) {
    if (exportDeclaration.isTypeOnly()) {
      continue;
    }

    const exportedFile = exportDeclaration.getModuleSpecifierSourceFile();
    if (
      exportedFile !== undefined &&
      shouldIndexProjectSourceFile(exportedFile, projectRoot)
    ) {
      importedFiles.push(exportedFile);
    }
  }

  return importedFiles;
}

function collectComponentCandidates(
  sourceFiles: readonly SourceFile[],
  projectRoot: string,
): readonly ComponentCandidate[] {
  const allocatedIds = new Set<string>();
  const candidates: ComponentCandidate[] = [];

  for (const sourceFile of sourceFiles) {
    for (const statement of sourceFile.getStatements()) {
      if (Node.isFunctionDeclaration(statement)) {
        const name = statement.getName();
        const body = statement.getBody();
        if (name !== undefined && isComponentName(name) && body !== undefined && containsJsx(body)) {
          candidates.push({
            name,
            id: allocateId(kebabCase(name), allocatedIds),
            sourceFile,
            node: statement.getNameNode() ?? statement,
            body,
          });
        }
        continue;
      }

      if (!Node.isVariableStatement(statement)) {
        continue;
      }

      for (const declaration of statement.getDeclarations()) {
        const nameNode = declaration.getNameNode();
        const initializer = unwrapExpression(declaration.getInitializer());
        if (
          Node.isIdentifier(nameNode) &&
          isComponentName(nameNode.getText()) &&
          isFunctionLikeInitializer(initializer) &&
          containsJsx(initializer)
        ) {
          candidates.push({
            name: nameNode.getText(),
            id: allocateId(kebabCase(nameNode.getText()), allocatedIds),
            sourceFile,
            node: nameNode,
            body: initializer.getBody(),
          });
        }
      }
    }
  }

  return candidates;
}

function collectExternalPackageClientComponents(
  sourceFiles: readonly SourceFile[],
  projectRoot: string,
): readonly ExternalPackageComponentCandidate[] {
  const candidates: ExternalPackageComponentCandidate[] = [];
  const allocatedIds = new Set<string>();

  for (const sourceFile of sourceFiles) {
    for (const importDeclaration of sourceFile.getImportDeclarations()) {
      if (importDeclaration.isTypeOnly()) {
        continue;
      }

      const packageSpecifier = getPackageImportSpecifier(
        importDeclaration.getModuleSpecifierValue(),
      );
      if (packageSpecifier === undefined) {
        continue;
      }

      const packageEntry = readPackageClientEntry(projectRoot, packageSpecifier);
      if (packageEntry === undefined) {
        continue;
      }

      const importedComponents = collectImportedComponentNames(importDeclaration);
      for (const importedComponent of importedComponents) {
        candidates.push({
          id: allocateId(
            kebabCase(`${packageSpecifier.packageName}-${importedComponent.localName}`),
            allocatedIds,
          ),
          localName: importedComponent.localName,
          importName: importedComponent.importName,
          packageName: packageSpecifier.packageName,
          moduleSpecifier: importDeclaration.getModuleSpecifierValue(),
          entry: packageEntry,
          source: sourceLocation(
            importedComponent.node,
            projectRoot,
            importedComponent.localName,
          ),
        });
      }
    }
  }

  return candidates;
}

function collectImportedComponentNames(
  importDeclaration: ImportDeclaration,
): readonly {
  readonly importName: string;
  readonly localName: string;
  readonly node: MorphNode;
}[] {
  const names: {
    readonly importName: string;
    readonly localName: string;
    readonly node: MorphNode;
  }[] = [];
  const defaultImport = importDeclaration.getDefaultImport();
  if (defaultImport !== undefined && isComponentName(defaultImport.getText())) {
    names.push({
      importName: "default",
      localName: defaultImport.getText(),
      node: defaultImport,
    });
  }

  for (const namedImport of importDeclaration.getNamedImports()) {
    const localName = namedImport.getAliasNode()?.getText() ?? namedImport.getName();
    if (!isComponentName(localName)) {
      continue;
    }

    names.push({
      importName: namedImport.getName(),
      localName,
      node: namedImport.getNameNode(),
    });
  }

  return names;
}

function externalPackageComponentNode(
  candidate: ExternalPackageComponentCandidate,
): ComponentNode {
  return {
    id: candidate.id,
    name: candidate.localName,
    role: "external-package",
    runtime: "client",
    packageEntry: {
      packageName: candidate.packageName,
      moduleSpecifier: candidate.moduleSpecifier,
      importName: candidate.importName,
      entry: candidate.entry,
      clientEntry: true,
    },
    source: candidate.source,
    ownsState: [],
    usesHooks: [],
    renders: [],
  };
}

function getPackageImportSpecifier(moduleSpecifier: string): PackageImportSpecifier | undefined {
  if (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")) {
    return undefined;
  }

  const parts = moduleSpecifier.split("/");
  if (moduleSpecifier.startsWith("@")) {
    if (parts.length < 2) {
      return undefined;
    }
    const packageName = `${parts[0]}/${parts[1]}`;
    return {
      packageName,
      subpath: parts.length > 2 ? `./${parts.slice(2).join("/")}` : ".",
    };
  }

  return {
    packageName: parts[0],
    subpath: parts.length > 1 ? `./${parts.slice(1).join("/")}` : ".",
  };
}

function readPackageClientEntry(
  projectRoot: string,
  specifier: PackageImportSpecifier,
): string | undefined {
  const packageJsonPath = findPackageJsonPath(projectRoot, specifier.packageName);
  if (packageJsonPath === undefined) {
    return undefined;
  }

  const packageJson = readPackageJson(packageJsonPath);
  if (packageJson === undefined) {
    return undefined;
  }

  const entry = resolvePackageEntry(packageJson, specifier.subpath);
  if (entry === undefined) {
    return undefined;
  }

  const entryPath = resolve(dirname(packageJsonPath), entry);
  if (!isReadableFile(entryPath)) {
    return undefined;
  }

  const source = readFileSync(entryPath, "utf8");
  return hasSourceTextDirective(source, "use client") ? entry : undefined;
}

function isReadableFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function findPackageJsonPath(projectRoot: string, packageName: string): string | undefined {
  const directPath = resolve(projectRoot, "node_modules", packageName, "package.json");
  if (existsSync(directPath)) {
    return directPath;
  }

  const pnpmStorePath = resolve(projectRoot, "node_modules", ".pnpm");
  if (!existsSync(pnpmStorePath)) {
    return undefined;
  }

  let pnpmPackageDirs: readonly string[];
  try {
    pnpmPackageDirs = readdirSync(pnpmStorePath)
      .filter((entryName) => !entryName.startsWith("."))
      .sort();
  } catch {
    return undefined;
  }

  for (const packageDir of pnpmPackageDirs) {
    const virtualStorePackageJsonPath = resolve(
      pnpmStorePath,
      packageDir,
      "node_modules",
      packageName,
      "package.json",
    );
    if (existsSync(virtualStorePackageJsonPath)) {
      return virtualStorePackageJsonPath;
    }
  }

  return undefined;
}

type PackageJson = {
  readonly main?: string;
  readonly module?: string;
  readonly exports?: unknown;
};

function readPackageJson(packageJsonPath: string): PackageJson | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    return isPackageJson(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isPackageJson(value: unknown): value is PackageJson {
  return typeof value === "object" && value !== null;
}

function resolvePackageEntry(packageJson: PackageJson, subpath: string): string | undefined {
  const exportEntry = resolvePackageExportEntry(packageJson.exports, subpath);
  if (exportEntry !== undefined) {
    return exportEntry;
  }

  if (subpath !== ".") {
    return undefined;
  }

  return packageJson.module ?? packageJson.main ?? "index.js";
}

function resolvePackageExportEntry(exportsField: unknown, subpath: string): string | undefined {
  if (typeof exportsField === "string") {
    return subpath === "." ? exportsField : undefined;
  }

  if (typeof exportsField !== "object" || exportsField === null) {
    return undefined;
  }

  const exportsRecord = exportsField as Readonly<Record<string, unknown>>;
  const exactExportTarget =
    subpath === "."
      ? exportsRecord["."] ?? exportsRecord.default ?? exportsRecord.import
      : exportsRecord[subpath];
  const exactExportEntry = resolvePackageExportTarget(exactExportTarget);
  if (exactExportEntry !== undefined) {
    return exactExportEntry;
  }

  if (subpath === ".") {
    return undefined;
  }

  return resolvePackageExportPatternEntry(exportsRecord, subpath);
}

function resolvePackageExportPatternEntry(
  exportsRecord: Readonly<Record<string, unknown>>,
  subpath: string,
): string | undefined {
  for (const [pattern, exportTarget] of Object.entries(exportsRecord)) {
    const wildcardValue = matchPackageExportPattern(pattern, subpath);
    if (wildcardValue === undefined) {
      continue;
    }

    const resolvedTarget = resolvePackageExportTarget(exportTarget, wildcardValue);
    if (resolvedTarget !== undefined) {
      return resolvedTarget;
    }
  }

  return undefined;
}

function matchPackageExportPattern(pattern: string, subpath: string): string | undefined {
  const wildcardIndex = pattern.indexOf("*");
  if (wildcardIndex === -1 || pattern.indexOf("*", wildcardIndex + 1) !== -1) {
    return undefined;
  }

  const patternPrefix = pattern.slice(0, wildcardIndex);
  const patternSuffix = pattern.slice(wildcardIndex + 1);
  if (!subpath.startsWith(patternPrefix) || !subpath.endsWith(patternSuffix)) {
    return undefined;
  }

  return subpath.slice(patternPrefix.length, subpath.length - patternSuffix.length);
}

function resolvePackageExportTarget(
  exportTarget: unknown,
  wildcardValue?: string,
): string | undefined {
  if (typeof exportTarget === "string") {
    return wildcardValue === undefined ? exportTarget : exportTarget.replace("*", wildcardValue);
  }

  if (typeof exportTarget === "object" && exportTarget !== null) {
    const rootRecord = exportTarget as Readonly<Record<string, unknown>>;
    for (const key of ["react-server", "browser", "import", "default"]) {
      const value = resolvePackageExportTarget(rootRecord[key], wildcardValue);
      if (value !== undefined) {
        return value;
      }
    }
  }

  return undefined;
}

function hasSourceTextDirective(
  source: string,
  directive: "use client" | "use server",
): boolean {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }

    if (line === `"${directive}";` || line === `'${directive}';`) {
      return true;
    }

    return false;
  }

  return false;
}

function extractComponent(
  candidate: ComponentCandidate,
  projectRoot: string,
  projectIndex: ProjectExtractionIndex,
  componentIdsByName: ReadonlyMap<string, string>,
  componentRuntimeById: ReadonlyMap<string, ComponentNode["runtime"]>,
  componentRoleById: ReadonlyMap<string, ComponentNode["role"]>,
): ComponentExtraction {
  const stateBindings = collectStateBindings(candidate, projectRoot);
  const contextProviderHooks = collectContextProviderHooks(candidate, projectRoot, stateBindings);
  const routeDataHooks = collectRouteDataHooks(candidate, projectRoot, projectIndex);
  const serverActionBindings = collectServerActionBindings(candidate, projectRoot);
  const nextRouterBindings = collectNextRouterBindings(candidate);
  const hooks = [
    ...stateBindings.map((binding) => stateHookNode(candidate, binding)),
    ...collectEffectHooks(candidate, projectRoot, stateBindings),
    ...collectCustomHooks(candidate, projectRoot),
    ...contextProviderHooks,
    ...routeDataHooks,
    ...collectNextRouterRefreshHooks(candidate, projectRoot, nextRouterBindings),
    ...serverActionBindings.map((binding) => serverActionHookNode(candidate, binding)),
  ];
  const handlerBindings = collectHandlerBindings(candidate);
  const propObjectBindings = collectPropObjectBindings(candidate, handlerBindings);
  const controlledFieldBindings = collectUseControllerFieldBindings(candidate, projectRoot);
  const routerSubmitBindings = collectRouterSubmitBindings(candidate);
  const externalStoreUsages = collectExternalStoreUsageNodes(candidate, projectRoot);
  const reduxActionUsages = collectReduxActionUsageNodes(candidate, projectRoot);
  const reduxSelectorUsages = collectReduxSelectorUsageNodes(candidate, projectRoot, projectIndex);
  const actions = collectActions(
    candidate,
    projectRoot,
    stateBindings,
    hooks,
    handlerBindings,
    controlledFieldBindings,
    routerSubmitBindings,
    nextRouterBindings,
    serverActionBindings,
    externalStoreUsages,
    reduxActionUsages,
  );
  const ui = collectUiNodes(
    candidate,
    projectRoot,
    componentIdsByName,
    stateBindings,
    actions.map((action) => action.action),
  );
  const renderEdges = collectComponentRenderEdges(
    candidate,
    projectRoot,
    componentIdsByName,
    componentRuntimeById,
  );
  const designSystemUsages = collectDesignSystemUsages(
    candidate,
    projectRoot,
    componentIdsByName,
    componentRoleById,
  );
  const props = collectPropNodes(
    candidate,
    projectRoot,
    componentIdsByName,
    propObjectBindings,
  );
  const contextUsages = collectContextUsageNodes(candidate, projectRoot);
  const renders = renderEdges.map((edge) => edge.childComponentId);
  const remoteData = collectRemoteDataNodes(candidate, projectRoot);
  const swrMutateBindings = collectSwrMutateBindings(candidate, projectRoot);
  const cacheOperations = collectCacheOperationNodes(
    candidate,
    projectRoot,
    handlerBindings,
    swrMutateBindings,
  ).concat(
    collectNextServerActionCacheOperationNodes(
      candidate,
      projectRoot,
      serverActionBindings,
    ),
  );
  const formFields = collectFormFieldNodes(
    candidate,
    projectRoot,
    stateBindings,
    controlledFieldBindings,
  );
  const propHandlers = collectPropHandlerBindings(
    candidate,
    componentIdsByName,
    stateBindings,
    hooks,
    handlerBindings,
    propObjectBindings,
    cacheOperations,
  );
  const contextActions = collectContextActionBindings(
    candidate,
    stateBindings,
    hooks,
  );

  return {
    component: {
      id: candidate.id,
      name: candidate.name,
      role: getComponentRole(candidate, projectRoot),
      runtime: componentRuntimeById.get(candidate.id) ?? "unknown",
      routeSegment: getNextRouteSegment(candidate, projectRoot),
      source: sourceLocation(candidate.node, projectRoot, candidate.name),
      ownsState: stateBindings.map((binding) => binding.state.id),
      usesHooks: hooks.map((hook) => hook.id),
      renders,
    },
    renderEdges,
    designSystemUsages,
    states: stateBindings.map((binding) => binding.state),
    hooks,
    actions,
    contextActions,
    ui,
    propHandlers,
    remoteData,
    cacheOperations,
    formFields,
    props,
    contextUsages,
    externalStoreUsages,
    reduxActionUsages,
    reduxSelectorUsages,
  };
}

function collectStateBindings(
  candidate: ComponentCandidate,
  projectRoot: string,
): readonly StateBinding[] {
  const bindings: StateBinding[] = [];

  visitBody(candidate.body, (node) => {
    if (!Node.isVariableDeclaration(node)) {
      return;
    }

    const formBindings = collectUseFormStateBindings(node, candidate, projectRoot);
    if (formBindings.length > 0) {
      bindings.push(...formBindings);
      return;
    }

    const nameNode = node.getNameNode();
    const initializer = unwrapExpression(node.getInitializer());
    if (!Node.isArrayBindingPattern(nameNode) || !isStateOwnerHook(initializer)) {
      return;
    }

    const stateElement = nameNode.getElements()[0];
    if (stateElement === undefined || !Node.isBindingElement(stateElement)) {
      return;
    }

    const stateNameNode = stateElement.getNameNode();
    if (!Node.isIdentifier(stateNameNode)) {
      return;
    }

    const setterElement = nameNode.getElements()[1];
    const setterNameNode =
      setterElement !== undefined && Node.isBindingElement(setterElement)
        ? setterElement.getNameNode()
        : undefined;
    const setterName =
      setterNameNode !== undefined && Node.isIdentifier(setterNameNode)
        ? setterNameNode.getText()
        : undefined;
    const stateName = stateNameNode.getText();
    const hookName = getStateOwnerHookName(initializer);
    const hookSource = getStateOwnerHookSource({
      body: candidate.body,
      call: initializer,
      hookName,
      projectRoot,
      setterName,
    });

    bindings.push({
      hookName,
      hookNote:
        hookName === "useReducer"
          ? `Reducer state "${stateName}" is updated through ${setterName ?? "dispatch"}; inspect the reducer before editing display-only components.`
          : hookName === "useSearchParams"
            ? `URL search params "${stateName}" are router-owned state; inspect the search-param setter before editing display-only consumers.`
          : undefined,
      hookRisk: hookName === "useReducer" || hookName === "useSearchParams" ? "high" : undefined,
      hookSource,
      setterName,
      state: {
        id: `${candidate.id}-${kebabCase(stateName)}-state`,
        name: stateName,
        ownerComponentId: candidate.id,
        kind: inferStateKind(node),
        source: sourceLocation(stateNameNode, projectRoot, stateName),
      },
    });
  });

  return dedupeBy(bindings, (binding) => binding.state.id);
}

function collectUseFormStateBindings(
  declaration: VariableDeclaration,
  candidate: ComponentCandidate,
  projectRoot: string,
): readonly StateBinding[] {
  const initializer = unwrapExpression(declaration.getInitializer());
  if (!isHookCall(initializer, "useForm")) {
    return [];
  }

  const registerName = getObjectBindingElementName(declaration, "register");
  const controlName = getObjectBindingElementName(declaration, "control");

  const defaultValues = getUseFormDefaultValues(initializer);
  return defaultValues.map((property) => ({
    hookName: "useForm",
    hookNote:
      `React Hook Form field "${property.fieldName}" is owned by useForm defaultValues/register mapping; inspect field registration before editing display-only inputs.`,
    hookRisk: "high",
    hookSource: sourceLocation(property.sourceNode, projectRoot, registerName ?? controlName ?? "useForm"),
    setterName: registerName ?? controlName,
    state: {
      id: `${candidate.id}-${kebabCase(property.fieldName)}-form-state`,
      name: property.fieldName,
      ownerComponentId: candidate.id,
      kind: "local",
      source: sourceLocation(property.sourceNode, projectRoot, property.fieldName),
    },
  }));
}

function getObjectBindingElementName(
  declaration: VariableDeclaration,
  propertyName: string,
): string | undefined {
  const nameNode = declaration.getNameNode();
  if (!Node.isObjectBindingPattern(nameNode)) {
    return undefined;
  }

  const element = nameNode.getElements().find((bindingElement) => {
    const property = bindingElement.getPropertyNameNode();
    return (property?.getText() ?? bindingElement.getNameNode().getText()) === propertyName;
  });
  const elementName = element?.getNameNode();
  return elementName !== undefined && Node.isIdentifier(elementName)
    ? elementName.getText()
    : undefined;
}

function getUseFormDefaultValues(
  call: CallExpression,
): readonly { readonly fieldName: string; readonly sourceNode: MorphNode }[] {
  const options = unwrapExpression(call.getArguments()[0]);
  if (options === undefined || !Node.isObjectLiteralExpression(options)) {
    return [];
  }

  const defaultValuesProperty = options.getProperty("defaultValues");
  if (
    defaultValuesProperty === undefined ||
    !Node.isPropertyAssignment(defaultValuesProperty)
  ) {
    return [];
  }

  const defaultValues = unwrapExpression(defaultValuesProperty.getInitializer());
  if (defaultValues === undefined || !Node.isObjectLiteralExpression(defaultValues)) {
    return [];
  }

  return defaultValues.getProperties().flatMap((property) => {
    if (!Node.isPropertyAssignment(property) && !Node.isShorthandPropertyAssignment(property)) {
      return [];
    }
    return [{ fieldName: property.getName(), sourceNode: property.getNameNode() }];
  });
}

function collectFormFieldNodes(
  candidate: ComponentCandidate,
  projectRoot: string,
  stateBindings: readonly StateBinding[],
  controlledFieldBindings: readonly ControlledFieldBinding[],
): readonly FormFieldNode[] {
  const useFormBindings = collectUseFormBindings(candidate, projectRoot);
  if (useFormBindings.length === 0 && controlledFieldBindings.length === 0) {
    return [];
  }

  const fields = new Map<string, FormFieldNode>();
  const upsertField = (
    fieldName: string,
    patch: Partial<Omit<FormFieldNode, "errors" | "id" | "name" | "ownerComponentId">> & {
      readonly errors?: readonly FormFieldNode["errors"][number][];
    },
  ) => {
    const existing = fields.get(fieldName);
    const state = stateBindings.find(
      (binding) => binding.hookName === "useForm" && binding.state.name === fieldName,
    );
    fields.set(fieldName, {
      id: existing?.id ?? `${candidate.id}-${kebabCase(fieldName)}-form-field`,
      name: fieldName,
      ownerComponentId: candidate.id,
      stateId: existing?.stateId ?? state?.state.id,
      register: patch.register ?? existing?.register,
      validation: patch.validation ?? existing?.validation,
      errors: dedupeBy([...(existing?.errors ?? []), ...(patch.errors ?? [])], (error) =>
        `${error.kind}:${error.reference}:${error.source.file}:${error.source.line}`,
      ),
    });
  };

  for (const binding of stateBindings) {
    if (binding.hookName === "useForm") {
      upsertField(binding.state.name, {});
    }
  }

  for (const binding of useFormBindings) {
    for (const resolverField of binding.resolverFields) {
      upsertField(resolverField.fieldName, {
        validation: resolverField.validation,
      });
    }
  }

  for (const binding of controlledFieldBindings) {
    upsertField(binding.fieldName, {
      register: binding.source,
      validation: binding.validation,
    });
  }

  visitBody(candidate.body, (node) => {
    if (!isJsxOpeningLikeElement(node) || getJsxTagName(node) !== "Controller") {
      return;
    }

    const fieldName = getStringAttribute(node, "name");
    if (fieldName === undefined) {
      return;
    }

    upsertField(fieldName, {
      register: sourceLocation(node.getTagNameNode(), projectRoot, "Controller"),
      validation: extractControllerRulesValidation(node, projectRoot),
    });
  });

  visitBody(candidate.body, (node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const formBinding = useFormBindings.find((binding) =>
      isRegisterCall(node, binding.registerName),
    );
    if (formBinding === undefined) {
      return;
    }

    const fieldName = extractStringLikeArgument(node.getArguments()[0]);
    if (fieldName === undefined) {
      return;
    }

    upsertField(fieldName, {
      register: sourceLocation(node.getExpression(), projectRoot, formBinding.registerName ?? "register"),
      validation: extractFormValidation(node, projectRoot),
    });
  });

  visitBody(candidate.body, (node) => {
    if (Node.isPropertyAccessExpression(node)) {
      const expression = unwrapExpression(node.getExpression());
      if (expression !== undefined && Node.isIdentifier(expression)) {
        for (const binding of useFormBindings) {
          if (binding.errorsName === expression.getText()) {
            upsertField(node.getName(), {
              errors: [
                {
                  kind: "read",
                  reference: binding.errorsName,
                  source: sourceLocation(node.getNameNode(), projectRoot, node.getName()),
                },
              ],
            });
          }
        }
      }
      return;
    }

    if (Node.isElementAccessExpression(node)) {
      const expression = unwrapExpression(node.getExpression());
      const argument = extractStringLikeArgument(node.getArgumentExpression());
      if (argument === undefined || expression === undefined || !Node.isIdentifier(expression)) {
        return;
      }
      for (const binding of useFormBindings) {
        if (binding.errorsName === expression.getText()) {
          upsertField(argument, {
            errors: [
              {
                kind: "read",
                reference: binding.errorsName,
                source: sourceLocation(node.getArgumentExpression() ?? node, projectRoot, argument),
              },
            ],
          });
        }
      }
      return;
    }

    if (!Node.isCallExpression(node)) {
      return;
    }

    const binding = useFormBindings.find((candidateBinding) =>
      isNamedCall(node, candidateBinding.setErrorName),
    );
    if (binding === undefined) {
      return;
    }

    const fieldName = extractStringLikeArgument(node.getArguments()[0]);
    if (fieldName === undefined) {
      return;
    }

    upsertField(fieldName, {
      errors: [
        {
          kind: "set",
          reference: binding.setErrorName ?? "setError",
          source: sourceLocation(node.getExpression(), projectRoot, binding.setErrorName ?? "setError"),
        },
      ],
    });
  });

  return [...fields.values()];
}

function collectUseFormBindings(
  candidate: ComponentCandidate,
  projectRoot: string,
): readonly UseFormBinding[] {
  const bindings: UseFormBinding[] = [];

  visitBody(candidate.body, (node) => {
    if (!Node.isVariableDeclaration(node)) {
      return;
    }

    const initializer = unwrapExpression(node.getInitializer());
    if (!isHookCall(initializer, "useForm")) {
      return;
    }

    bindings.push({
      controlName: getObjectBindingElementName(node, "control"),
      registerName: getObjectBindingElementName(node, "register"),
      resolverFields: collectUseFormResolverFieldBindings(initializer, projectRoot),
      setErrorName: getObjectBindingElementName(node, "setError"),
      errorsName: getUseFormErrorsBindingName(node),
    });
  });

  return bindings;
}

function getUseFormErrorsBindingName(declaration: VariableDeclaration): string | undefined {
  const nameNode = declaration.getNameNode();
  if (!Node.isObjectBindingPattern(nameNode)) {
    return undefined;
  }

  const formStateElement = nameNode.getElements().find((bindingElement) => {
    const property = bindingElement.getPropertyNameNode();
    return (property?.getText() ?? bindingElement.getNameNode().getText()) === "formState";
  });
  const formStateName = formStateElement?.getNameNode();
  if (formStateName === undefined || !Node.isObjectBindingPattern(formStateName)) {
    return undefined;
  }

  const errorsElement = formStateName.getElements().find((bindingElement) => {
    const property = bindingElement.getPropertyNameNode();
    return (property?.getText() ?? bindingElement.getNameNode().getText()) === "errors";
  });
  const errorsName = errorsElement?.getNameNode();
  return errorsName !== undefined && Node.isIdentifier(errorsName) ? errorsName.getText() : undefined;
}

function collectUseFormResolverFieldBindings(
  useFormCall: CallExpression,
  projectRoot: string,
): readonly ResolverFieldBinding[] {
  const options = unwrapExpression(useFormCall.getArguments()[0]);
  if (options === undefined || !Node.isObjectLiteralExpression(options)) {
    return [];
  }

  const resolver = unwrapExpression(getObjectPropertyInitializer(options, "resolver"));
  if (resolver === undefined || !Node.isCallExpression(resolver)) {
    return [];
  }

  const resolverName = getCallName(resolver.getExpression());
  if (resolverName === undefined || !resolverName.endsWith("Resolver")) {
    return [];
  }

  const schemaExpression = unwrapExpression(resolver.getArguments()[0]);
  const schemaName = Node.isIdentifier(schemaExpression) ? schemaExpression.getText() : resolverName;
  const schema = getSchemaObjectLiteral(schemaExpression);
  if (schema === undefined) {
    return [];
  }

  return schema.getProperties().flatMap((property) => {
    if (!Node.isPropertyAssignment(property) && !Node.isShorthandPropertyAssignment(property)) {
      return [];
    }

    const fieldName = property.getName();
    return [
      {
        fieldName,
        schemaName,
        source: sourceLocation(property.getNameNode(), projectRoot, fieldName),
        validation: {
          options: [
            {
              name: "validate",
              value: `${resolverName}:${schemaName}.${fieldName}`,
            },
          ],
          source: sourceLocation(property.getNameNode(), projectRoot, fieldName),
        },
      },
    ];
  });
}

function getSchemaObjectLiteral(schemaExpression: MorphNode | undefined): ObjectLiteralExpression | undefined {
  const unwrapped = unwrapExpression(schemaExpression);
  if (unwrapped === undefined) {
    return undefined;
  }

  if (Node.isObjectLiteralExpression(unwrapped)) {
    return unwrapped;
  }

  if (Node.isCallExpression(unwrapped)) {
    return getSchemaObjectLiteral(unwrapped.getArguments()[0]);
  }

  if (!Node.isIdentifier(unwrapped)) {
    return undefined;
  }

  const declaration = unwrapped.getDefinitions()[0]?.getDeclarationNode();
  if (declaration === undefined) {
    return undefined;
  }

  if (Node.isVariableDeclaration(declaration)) {
    return getSchemaObjectLiteral(declaration.getInitializer());
  }

  return undefined;
}

function hasUseServerDirective(node: MorphNode | undefined): boolean {
  if (node === undefined) {
    return false;
  }

  const statements = Node.isSourceFile(node) || Node.isBlock(node) ? node.getStatements() : [];
  return statements.some((statement) => {
    const expression = Node.isExpressionStatement(statement) ? statement.getExpression() : undefined;
    return (
      (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) &&
      expression.getLiteralText() === "use server"
    );
  });
}

function isRegisterCall(call: CallExpression, registerName: string | undefined): boolean {
  if (registerName === undefined) {
    return false;
  }
  return isNamedCall(call, registerName);
}

function isNamedCall(call: CallExpression, name: string | undefined): boolean {
  if (name === undefined) {
    return false;
  }
  const expression = unwrapExpression(call.getExpression());
  return Node.isIdentifier(expression) && expression.getText() === name;
}

function collectUseControllerFieldBindings(
  candidate: ComponentCandidate,
  projectRoot: string,
): readonly ControlledFieldBinding[] {
  const bindings: ControlledFieldBinding[] = [];

  visitBody(candidate.body, (node) => {
    if (!Node.isVariableDeclaration(node)) {
      return;
    }

    const initializer = unwrapExpression(node.getInitializer());
    if (!isHookCall(initializer, "useController")) {
      return;
    }

    const options = unwrapExpression(initializer.getArguments()[0]);
    if (options === undefined || !Node.isObjectLiteralExpression(options)) {
      return;
    }

    const fieldName = extractStringLikeArgument(getObjectPropertyInitializer(options, "name"));
    if (fieldName === undefined) {
      return;
    }

    bindings.push({
      fieldName,
      localFieldName: getUseControllerLocalFieldName(node),
      source: sourceLocation(initializer.getExpression(), projectRoot, "useController"),
      validation: extractUseControllerRulesValidation(options, projectRoot),
    });
  });

  return bindings;
}

function getUseControllerLocalFieldName(declaration: VariableDeclaration): string | undefined {
  const nameNode = declaration.getNameNode();
  if (!Node.isObjectBindingPattern(nameNode)) {
    return undefined;
  }

  return getObjectBindingElementName(declaration, "field");
}

function extractFormValidation(
  call: CallExpression,
  projectRoot: string,
): FormFieldNode["validation"] | undefined {
  const options = unwrapExpression(call.getArguments()[1]);
  if (options === undefined || !Node.isObjectLiteralExpression(options)) {
    return undefined;
  }

  return extractValidationOptions(options, projectRoot);
}

function extractControllerRulesValidation(
  node: JsxOpeningLikeElement,
  projectRoot: string,
): FormFieldNode["validation"] | undefined {
  const rulesAttribute = node.getAttribute("rules");
  if (rulesAttribute === undefined || !Node.isJsxAttribute(rulesAttribute)) {
    return undefined;
  }

  const initializer = rulesAttribute.getInitializer();
  const expression = Node.isJsxExpression(initializer) ? initializer.getExpression() : initializer;
  const rules = unwrapExpression(expression);
  return rules !== undefined && Node.isObjectLiteralExpression(rules)
    ? extractValidationOptions(rules, projectRoot)
    : undefined;
}

function extractUseControllerRulesValidation(
  options: ObjectLiteralExpression,
  projectRoot: string,
): FormFieldNode["validation"] | undefined {
  const rules = unwrapExpression(getObjectPropertyInitializer(options, "rules"));
  return rules !== undefined && Node.isObjectLiteralExpression(rules)
    ? extractValidationOptions(rules, projectRoot)
    : undefined;
}

function extractValidationOptions(
  options: ObjectLiteralExpression,
  projectRoot: string,
): FormFieldNode["validation"] | undefined {
  const validationNames = new Set(["maxLength", "minLength", "pattern", "required", "validate"]);
  const optionsFound = options.getProperties().flatMap((property) => {
    if (!Node.isPropertyAssignment(property) && !Node.isShorthandPropertyAssignment(property)) {
      return [];
    }
    const name = property.getName();
    if (!validationNames.has(name)) {
      return [];
    }
    return [
      {
        name: name as FormFieldValidationOption["name"],
        value: Node.isPropertyAssignment(property)
          ? expressionToPolicyValue(property.getInitializer())
          : property.getName(),
        sourceNode: property.getNameNode(),
      },
    ];
  });

  const firstOption = optionsFound[0];
  if (firstOption === undefined) {
    return undefined;
  }

  return {
    options: optionsFound.map(({ name, value }) => ({ name, value })),
    source: sourceLocation(firstOption.sourceNode, projectRoot, firstOption.name),
  };
}

function getObjectPropertyInitializer(
  objectLiteral: ObjectLiteralExpression,
  propertyName: string,
): MorphNode | undefined {
  const property = objectLiteral.getProperty(propertyName);
  if (property === undefined) {
    return undefined;
  }
  if (Node.isPropertyAssignment(property)) {
    return property.getInitializer();
  }
  if (Node.isShorthandPropertyAssignment(property)) {
    return property.getNameNode();
  }
  return undefined;
}

function stateHookNode(candidate: ComponentCandidate, binding: StateBinding): HookNode {
  return {
    id: `${binding.state.id.replace(/-state$/, "")}-${kebabCase(binding.hookName)}`,
    name: binding.hookName,
    ownerComponentId: candidate.id,
    kind: binding.hookName === "useState" ? "state" : "custom",
    dependencies: binding.hookName === "useState" ? [] : [binding.state.name],
    source: binding.hookSource ?? binding.state.source,
    risk: binding.hookRisk ?? "low",
    note:
      binding.hookNote ??
      `Local state "${binding.state.name}" is owned by ${candidate.name}.`,
  };
}

function collectRouteDataHooks(
  candidate: ComponentCandidate,
  projectRoot: string,
  projectIndex: ProjectExtractionIndex,
): readonly HookNode[] {
  const hooks: HookNode[] = [];

  for (const routeObject of projectIndex.routeObjectsByComponentName.get(candidate.name) ?? []) {
    const loaderSource = getRoutePropertySource(routeObject, "loader", projectRoot);
    if (loaderSource !== undefined) {
      hooks.push({
        id: `${candidate.id}-route-loader`,
        name: "route loader",
        ownerComponentId: candidate.id,
        kind: "custom",
        dependencies: [],
        source: loaderSource,
        risk: "high",
        note: `React Router loader provides server-owned data for ${candidate.name}; inspect the loader before editing display-only route data consumers.`,
      });
    }

    const actionSource = getRoutePropertySource(routeObject, "action", projectRoot);
    if (actionSource !== undefined) {
      hooks.push({
        id: `${candidate.id}-route-action`,
        name: "route action",
        ownerComponentId: candidate.id,
        kind: "custom",
        dependencies: [],
        source: actionSource,
        risk: "high",
        note: `React Router action owns submit/mutation behavior for ${candidate.name}; inspect the action before editing route form UI.`,
      });
    }
  }

  return dedupeBy(hooks, (hook) => hook.id);
}

function collectRouterSubmitBindings(candidate: ComponentCandidate): RouterSubmitBinding {
  const fetcherNames: string[] = [];
  const submitNames: string[] = [];

  visitBody(candidate.body, (node) => {
    if (!Node.isVariableDeclaration(node) || !Node.isIdentifier(node.getNameNode())) {
      return;
    }

    const initializer = unwrapExpression(node.getInitializer());
    if (!Node.isCallExpression(initializer)) {
      return;
    }

    const hookName = getCallName(initializer.getExpression());
    if (hookName === "useFetcher") {
      fetcherNames.push(node.getNameNode().getText());
    }
    if (hookName === "useSubmit") {
      submitNames.push(node.getNameNode().getText());
    }
  });

  return {
    fetcherNames: [...new Set(fetcherNames)],
    submitNames: [...new Set(submitNames)],
  };
}

function collectNextRouterBindings(candidate: ComponentCandidate): NextRouterBinding {
  const useRouterNames = collectNamedImportLocalNames(candidate.sourceFile, "next/navigation", "useRouter");
  if (useRouterNames.length === 0) {
    return { routerNames: [] };
  }

  const routerNames: string[] = [];
  visitBody(candidate.body, (node) => {
    if (!Node.isVariableDeclaration(node) || !Node.isIdentifier(node.getNameNode())) {
      return;
    }

    const initializer = unwrapExpression(node.getInitializer());
    if (
      initializer !== undefined &&
      Node.isCallExpression(initializer) &&
      useRouterNames.includes(getCallName(initializer.getExpression()) ?? "")
    ) {
      routerNames.push(node.getNameNode().getText());
    }
  });

  return {
    routerNames: unique(routerNames),
  };
}

function collectNamedImportLocalNames(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  importedName: string,
): readonly string[] {
  return sourceFile.getImportDeclarations().flatMap((importDeclaration) => {
    if (importDeclaration.getModuleSpecifierValue() !== moduleSpecifier) {
      return [];
    }

    return importDeclaration.getNamedImports().flatMap((specifier) => {
      if (specifier.getName() !== importedName) {
        return [];
      }
      return [specifier.getAliasNode()?.getText() ?? importedName];
    });
  });
}

function collectNextRouterRefreshHooks(
  candidate: ComponentCandidate,
  projectRoot: string,
  nextRouterBindings: NextRouterBinding,
): readonly HookNode[] {
  if (nextRouterBindings.routerNames.length === 0) {
    return [];
  }

  const refreshCalls: CallExpression[] = [];
  visitBody(candidate.body, (node) => {
    if (
      Node.isCallExpression(node) &&
      isNextRouterRefreshCall(node, nextRouterBindings)
    ) {
      refreshCalls.push(node);
    }
  });

  if (refreshCalls.length === 0) {
    return [];
  }

  const firstRefresh = refreshCalls[0];
  return [
    {
      id: `${candidate.id}-router-refresh`,
      name: "router refresh",
      ownerComponentId: candidate.id,
      kind: "custom",
      dependencies: nextRouterBindings.routerNames,
      source: sourceLocation(
        firstRefresh.getExpression(),
        projectRoot,
        getCallName(firstRefresh.getExpression()) ?? "refresh",
      ),
      risk: "medium",
      note:
        "Next router.refresh() refreshes the current route/client router cache and re-fetches Server Component data, but it does not invalidate server-side cache.",
    },
  ];
}

function collectServerActionBindings(
  candidate: ComponentCandidate,
  projectRoot: string,
): readonly ServerActionBinding[] {
  const actionNames = collectReferencedServerActionNames(candidate);
  if (actionNames.size === 0) {
    return [];
  }

  return [...actionNames].flatMap((name) => {
    const declaration = resolveServerActionDeclaration(candidate, name);
    return declaration === undefined
      ? []
      : [
          {
            declaration,
            name,
            source: sourceLocation(declaration.getNameNode() ?? declaration, projectRoot, name),
          },
        ];
  });
}

function serverActionHookNode(
  candidate: ComponentCandidate,
  binding: ServerActionBinding,
): HookNode {
  return {
    id: `${candidate.id}-${kebabCase(binding.name)}-server-action`,
    name: "server action",
    ownerComponentId: candidate.id,
    kind: "custom",
    dependencies: [binding.name],
    source: binding.source,
    risk: "high",
    note: `Next Server Action "${binding.name}" owns this client/server mutation boundary; inspect the server action before editing display-only client controls.`,
  };
}

function collectReferencedServerActionNames(candidate: ComponentCandidate): ReadonlySet<string> {
  const names = new Set<string>();

  visitBody(candidate.body, (node) => {
    if (isJsxOpeningLikeElement(node)) {
      for (const attributeName of ["action", "formAction"]) {
        const value = getJsxExpressionIdentifier(node, attributeName);
        if (value !== undefined) {
          names.add(value);
        }
      }
      return;
    }

    if (Node.isCallExpression(node)) {
      const expression = unwrapExpression(node.getExpression());
      if (expression !== undefined && Node.isIdentifier(expression)) {
        names.add(expression.getText());
      }
    }
  });

  return names;
}

function resolveServerActionDeclaration(
  candidate: ComponentCandidate,
  actionName: string,
): FunctionDeclaration | undefined {
  const sourceFile = candidate.sourceFile;
  const localDeclaration = sourceFile.getFunction(actionName);
  if (localDeclaration !== undefined && isServerActionDeclaration(localDeclaration)) {
    return localDeclaration;
  }

  const importedDeclaration = resolveImportedDeclaration(sourceFile, actionName);
  if (
    importedDeclaration !== undefined &&
    Node.isFunctionDeclaration(importedDeclaration) &&
    isServerActionDeclaration(importedDeclaration)
  ) {
    return importedDeclaration;
  }

  return undefined;
}

function resolveImportedDeclaration(
  sourceFile: SourceFile,
  importedName: string,
): MorphNode | undefined {
  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    const namedImport = importDeclaration.getNamedImports().find((specifier) => {
      const localName = specifier.getAliasNode()?.getText() ?? specifier.getName();
      return localName === importedName;
    });
    if (namedImport === undefined) {
      continue;
    }

    const nameNode = namedImport.getNameNode();
    return Node.isIdentifier(nameNode)
      ? nameNode.getDefinitions()[0]?.getDeclarationNode()
      : undefined;
  }

  return undefined;
}

function isServerActionDeclaration(declaration: FunctionDeclaration): boolean {
  return hasUseServerDirective(declaration.getSourceFile()) || hasUseServerDirective(declaration.getBody());
}

function getRouteComponentName(routeObject: ObjectLiteralExpression): string | undefined {
  const component = unwrapExpression(getObjectPropertyInitializer(routeObject, "Component"));
  if (component !== undefined && Node.isIdentifier(component)) {
    return component.getText();
  }

  const element = unwrapExpression(getObjectPropertyInitializer(routeObject, "element"));
  if (element !== undefined && Node.isJsxElement(element)) {
    return getJsxTagName(element.getOpeningElement());
  }
  if (element !== undefined && Node.isJsxSelfClosingElement(element)) {
    return getJsxTagName(element);
  }

  return undefined;
}

function getRoutePropertySource(
  routeObject: ObjectLiteralExpression,
  propertyName: "action" | "loader",
  projectRoot: string,
): SourceLocation | undefined {
  const initializer = unwrapExpression(getObjectPropertyInitializer(routeObject, propertyName));
  if (initializer === undefined) {
    return undefined;
  }

  const implementation = resolveReferencedImplementationNode(initializer);
  const sourceNode = implementation ?? initializer;
  const symbol = Node.isIdentifier(sourceNode) ? sourceNode.getText() : propertyName;
  return sourceLocation(sourceNode, projectRoot, symbol);
}

function resolveReferencedImplementationNode(node: MorphNode): MorphNode | undefined {
  if (!Node.isIdentifier(node)) {
    return Node.isArrowFunction(node) || Node.isFunctionExpression(node) ? node : undefined;
  }

  const declaration = node.getDefinitions()[0]?.getDeclarationNode();
  if (declaration === undefined) {
    return undefined;
  }
  if (Node.isFunctionDeclaration(declaration)) {
    return declaration.getNameNode() ?? declaration;
  }
  if (Node.isVariableDeclaration(declaration)) {
    const initializer = unwrapExpression(declaration.getInitializer());
    return getFunctionLikeHandlerNode(initializer) ?? declaration.getNameNode();
  }
  return declaration;
}

function collectEffectHooks(
  candidate: ComponentCandidate,
  projectRoot: string,
  stateBindings: readonly StateBinding[],
): readonly HookNode[] {
  const hooks: HookNode[] = [];
  const setterNames = new Set(
    stateBindings
      .map((binding) => binding.setterName)
      .filter((name): name is string => name !== undefined),
  );

  visitBody(candidate.body, (node) => {
    if (!Node.isCallExpression(node) || getCallName(node.getExpression()) !== "useEffect") {
      return;
    }

    const dependencies = collectDependencies(node.getArguments()[1]);
    const effectBody = node.getArguments()[0];
    const text = effectBody?.getText() ?? "";
    const cleanup = collectEffectCleanupEvidence(node, projectRoot);
    const risk =
      cleanup?.kind === "missing-cleanup-risk" ||
      networkPattern.test(text) ||
      hasAnySetter(text, setterNames)
        ? "high"
        : "medium";
    const note =
      cleanup?.note ??
      (risk === "high"
        ? "Effect performs async/network or state commits; check stale response and cleanup behavior."
        : "Effect reruns from declared dependencies; inspect cleanup and dependency precision before editing.");
    const dependencySuffix = dependencies.length > 0 ? dependencies.join("-") : String(hooks.length + 1);

    hooks.push({
      id: `${candidate.id}-${kebabCase(dependencySuffix)}-effect`,
      name: "useEffect",
      ownerComponentId: candidate.id,
      kind: "effect",
      dependencies,
      cleanup,
      source: sourceLocation(node.getExpression(), projectRoot, "useEffect"),
      risk,
      note,
    });
  });

  return dedupeBy(hooks, (hook) => hook.id);
}

function collectEffectCleanupEvidence(
  call: CallExpression,
  projectRoot: string,
): EffectCleanupEvidence | undefined {
  const effectCallback = unwrapExpression(call.getArguments()[0]);
  if (effectCallback === undefined || !isFunctionLikeInitializer(effectCallback)) {
    return undefined;
  }

  const resources = collectEffectCleanupResources(effectCallback);
  if (resources.length === 0) {
    return undefined;
  }

  const hasCleanup = effectCallback
    .getBody()
    .getDescendants()
    .some((node) => Node.isReturnStatement(node) && isCleanupReturnExpression(node.getExpression()));
  const source = sourceLocation(call.getExpression(), projectRoot, "useEffect");
  return {
    kind: hasCleanup ? "cleanup-present" : "missing-cleanup-risk",
    resources,
    source,
    note: hasCleanup
      ? "Effect allocates resources and returns a cleanup function."
      : "Effect allocates resources but does not return a cleanup function; verify listener/timer/subscription teardown before editing display-only UI.",
  };
}

function collectEffectCleanupResources(effectCallback: FunctionLike): readonly string[] {
  const resources: string[] = [];
  effectCallback.getBody().forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const callName = getCallName(node.getExpression());
    if (callName === undefined) {
      return;
    }

    if (
      callName === "addEventListener" ||
      callName === "setInterval" ||
      callName === "setTimeout" ||
      callName === "subscribe"
    ) {
      resources.push(callName);
    }
  });

  return unique(resources);
}

function isCleanupReturnExpression(expression: MorphNode | undefined): boolean {
  const unwrapped = unwrapExpression(expression);
  return unwrapped !== undefined && isFunctionLikeInitializer(unwrapped);
}

function collectCustomHooks(
  candidate: ComponentCandidate,
  projectRoot: string,
): readonly HookNode[] {
  const hooks: HookNode[] = [];

  visitBody(candidate.body, (node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const name = getCallName(node.getExpression());
    if (name === undefined || !/^use[A-Z]/.test(name) || ignoredHookNames.has(name)) {
      return;
    }
    const implementation = getCustomHookImplementation(node.getExpression(), projectRoot);

    hooks.push({
      id: `${candidate.id}-${kebabCase(name)}-hook`,
      name,
      ownerComponentId: candidate.id,
      kind: "custom",
      dependencies: collectCallIdentifierArguments(node),
      source: implementation?.source ?? sourceLocation(node.getExpression(), projectRoot, name),
      risk: implementation?.risk ?? (networkPattern.test(node.getText()) ? "high" : "medium"),
      note:
        implementation?.note ??
        `Custom hook "${name}" may hide state, effects, cache, or network behavior.`,
    });
  });

  return dedupeBy(hooks, (hook) => hook.id);
}

function collectContextProviderHooks(
  candidate: ComponentCandidate,
  projectRoot: string,
  stateBindings: readonly StateBinding[],
): readonly HookNode[] {
  const hooks: HookNode[] = [];
  const providerValueObjects = collectProviderValueObjects(candidate);

  for (const providerValueObject of providerValueObjects) {
    for (const property of providerValueObject.getProperties()) {
      if (!Node.isShorthandPropertyAssignment(property)) {
        continue;
      }

      const propertyName = property.getName();
      const declaration = getVariableDeclarationFromIdentifier(property.getNameNode());
      if (declaration === undefined) {
        continue;
      }

      const initializerText = declaration.getInitializer()?.getText() ?? "";
      const dependencies = stateBindings
        .filter((binding) => containsIdentifier(initializerText, binding.state.name))
        .map((binding) => binding.state.name);
      if (dependencies.length === 0) {
        continue;
      }

      hooks.push({
        id: `${candidate.id}-${kebabCase(propertyName)}-context-provider-hook`,
        name: "useContextProvider",
        ownerComponentId: candidate.id,
        kind: "custom",
        dependencies,
        source: sourceLocation(declaration.getNameNode(), projectRoot, propertyName),
        risk: "high",
        note:
          `Context provider value "${propertyName}" is derived from ${dependencies.join(", ")}; inspect provider value generation before editing consumers.`,
      });
    }
  }

  return dedupeBy(hooks, (hook) => hook.id);
}

function collectContextUsageNodes(
  candidate: ComponentCandidate,
  projectRoot: string,
): readonly ContextUsageNode[] {
  const usages: ContextUsageNode[] = [];
  const usageCountsByContext = new Map<string, number>();

  visitBody(candidate.body, (node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const callName = getCallName(node.getExpression());
    if (callName === undefined) {
      return;
    }

    const contextInfo =
      callName === "useContext"
        ? getDirectUseContextInfo(node, projectRoot)
        : getCustomHookContextInfo(node.getExpression(), projectRoot);
    if (contextInfo === undefined) {
      return;
    }

    const nextCount = (usageCountsByContext.get(contextInfo.contextName) ?? 0) + 1;
    usageCountsByContext.set(contextInfo.contextName, nextCount);
    usages.push({
      id: `${candidate.id}-uses-${kebabCase(contextInfo.contextName)}-${nextCount}-context`,
      ownerComponentId: candidate.id,
      contextName: contextInfo.contextName,
      hookName: callName,
      source: sourceLocation(node.getExpression(), projectRoot, callName),
      providerSource: contextInfo.providerSource,
      note: `${candidate.name} reads ${contextInfo.contextName} through ${callName}.`,
    });
  });

  return dedupeBy(usages, (usage) => usage.id);
}

function getDirectUseContextInfo(
  call: CallExpression,
  projectRoot: string,
): Pick<ContextUsageNode, "contextName" | "providerSource"> | undefined {
  const contextArgument = unwrapExpression(call.getArguments()[0]);
  if (contextArgument === undefined || !Node.isIdentifier(contextArgument)) {
    return undefined;
  }

  return {
    contextName: contextArgument.getText(),
    providerSource: getContextProviderSource(contextArgument, projectRoot),
  };
}

function getCustomHookContextInfo(
  expression: Expression,
  projectRoot: string,
): Pick<ContextUsageNode, "contextName" | "providerSource"> | undefined {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped === undefined || !Node.isIdentifier(unwrapped)) {
    return undefined;
  }

  for (const definition of unwrapped.getDefinitions()) {
    const implementationNode = getImplementationNode(definition.getNode());
    const useContextCall = implementationNode
      ?.getDescendants()
      .filter(Node.isCallExpression)
      .find((call) => getCallName(call.getExpression()) === "useContext");
    if (useContextCall === undefined) {
      continue;
    }

    return getDirectUseContextInfo(useContextCall, projectRoot);
  }

  return undefined;
}

function getContextProviderSource(
  contextIdentifier: MorphNode,
  projectRoot: string,
): SourceLocation | undefined {
  if (!Node.isIdentifier(contextIdentifier)) {
    return undefined;
  }

  const declaration = contextIdentifier.getDefinitions()[0]?.getDeclarationNode();
  if (!Node.isVariableDeclaration(declaration)) {
    return undefined;
  }

  return sourceLocation(
    declaration.getNameNode(),
    projectRoot,
    `${contextIdentifier.getText()}.Provider`,
  );
}

function collectExternalStoreUsageNodes(
  candidate: ComponentCandidate,
  projectRoot: string,
): readonly ExternalStoreUsageNode[] {
  const usages: ExternalStoreUsageNode[] = [];
  const usageCountsByStore = new Map<string, number>();

  visitBody(candidate.body, (node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const callName = getCallName(node.getExpression());
    if (callName === undefined) {
      return;
    }

    const jotaiUsage = getJotaiExternalStoreUsage({
      call: node,
      callName,
      candidate,
      projectRoot,
      usageIndex: usages.length + 1,
    });
    if (jotaiUsage !== undefined) {
      usages.push(jotaiUsage);
      return;
    }

    if (!isExternalStoreHookName(callName)) {
      return;
    }

    const selector = getExternalStoreSelector(node);
    const storeInfo = getExternalStoreDefinitionInfo(node.getExpression(), projectRoot);
    const selectedSources = selector.selectedFields.flatMap((fieldName) => {
      const source = storeInfo.selectedSources.get(fieldName);
      return source === undefined ? [] : [{ fieldName, source }];
    });
    const storeName = storeInfo.storeName ?? callName;
    const nextCount = (usageCountsByStore.get(storeName) ?? 0) + 1;
    usageCountsByStore.set(storeName, nextCount);

    usages.push({
      id: `${candidate.id}-uses-${kebabCase(storeName)}-${nextCount}-external-store`,
      ownerComponentId: candidate.id,
      storeName,
      hookName: callName,
      selector: selector.text,
      selectedFields: selector.selectedFields,
      selectedSources,
      source: sourceLocation(node.getExpression(), projectRoot, callName),
      storeSource: storeInfo.storeSource,
      usageKind: getExternalStoreUsageKind(selector.selectedFields),
      note: `${candidate.name} reads external store ${storeName} through ${callName}${selector.selectedFields.length === 0 ? "" : ` selecting ${selector.selectedFields.join(", ")}`}.`,
    });
  });

  return dedupeBy(usages, (usage) => usage.id);
}

function getJotaiExternalStoreUsage(input: {
  readonly call: CallExpression;
  readonly callName: string;
  readonly candidate: ComponentCandidate;
  readonly projectRoot: string;
  readonly usageIndex: number;
}): ExternalStoreUsageNode | undefined {
  if (
    input.callName !== "useAtom" &&
    input.callName !== "useAtomValue" &&
    input.callName !== "useSetAtom"
  ) {
    return undefined;
  }

  const atomExpression = unwrapExpression(input.call.getArguments()[0]);
  if (atomExpression === undefined || !Node.isIdentifier(atomExpression)) {
    return undefined;
  }

  const atomName = atomExpression.getText();
  const atomSource = getJotaiAtomSource(atomExpression, input.projectRoot);
  const localBindings = getJotaiLocalBindings(input.call);
  const selectedFields = localBindings.length === 0 ? [atomName] : localBindings;
  const selectedSources =
    atomSource === undefined ? [] : [{ fieldName: atomName, source: atomSource }];

  return {
    id: `${input.candidate.id}-uses-${kebabCase(atomName)}-${input.usageIndex}-external-store`,
    ownerComponentId: input.candidate.id,
    storeName: atomName,
    hookName: input.callName,
    selector: atomName,
    selectedFields,
    selectedSources,
    source: sourceLocation(input.call.getExpression(), input.projectRoot, input.callName),
    storeSource: atomSource,
    usageKind: getJotaiUsageKind(input.callName),
    note: `${input.candidate.name} uses Jotai atom ${atomName} through ${input.callName}${selectedFields.length === 0 ? "" : ` binding ${selectedFields.join(", ")}`}.`,
  };
}

function getExternalStoreUsageKind(
  selectedFields: readonly string[],
): ExternalStoreUsageNode["usageKind"] {
  if (selectedFields.length === 0) {
    return "read-write";
  }
  const writeFields = selectedFields.filter(isLikelySetterName);
  if (writeFields.length === selectedFields.length) {
    return "write";
  }
  return writeFields.length === 0 ? "read" : "read-write";
}

function getJotaiUsageKind(callName: string): ExternalStoreUsageNode["usageKind"] {
  if (callName === "useSetAtom") {
    return "write";
  }
  return callName === "useAtom" ? "read-write" : "read";
}

function isLikelySetterName(name: string): boolean {
  return /^(set|update|remove|delete|toggle|reset|clear|add|create)[A-Z_]/.test(name);
}

function getJotaiAtomSource(
  atomIdentifier: MorphNode,
  projectRoot: string,
): SourceLocation | undefined {
  if (!Node.isIdentifier(atomIdentifier)) {
    return undefined;
  }

  for (const definition of atomIdentifier.getDefinitions()) {
    const variableDeclaration = definition
      .getNode()
      .getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (
      variableDeclaration === undefined ||
      variableDeclaration.getNameNode() !== definition.getNode()
    ) {
      continue;
    }

    const initializer = unwrapExpression(variableDeclaration.getInitializer());
    if (
      initializer === undefined ||
      !Node.isCallExpression(initializer) ||
      getCallName(initializer.getExpression()) !== "atom"
    ) {
      continue;
    }

    return sourceLocation(
      variableDeclaration.getNameNode(),
      projectRoot,
      variableDeclaration.getName(),
    );
  }

  return undefined;
}

function getJotaiLocalBindings(call: CallExpression): readonly string[] {
  const variableDeclaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (
    variableDeclaration === undefined ||
    unwrapExpression(variableDeclaration.getInitializer()) !== call
  ) {
    return [];
  }

  const nameNode = variableDeclaration.getNameNode();
  if (Node.isIdentifier(nameNode)) {
    return [nameNode.getText()];
  }

  if (Node.isArrayBindingPattern(nameNode)) {
    return nameNode
      .getElements()
      .flatMap((element) =>
        Node.isBindingElement(element) && Node.isIdentifier(element.getNameNode())
          ? [element.getNameNode().getText()]
          : [],
      );
  }

  return [];
}

function isExternalStoreHookName(name: string): boolean {
  return /^use[A-Z][A-Za-z0-9]*Store$/.test(name);
}

function getExternalStoreSelector(call: CallExpression): {
  readonly text: string;
  readonly selectedFields: readonly string[];
} {
  const selector = unwrapExpression(call.getArguments()[0]);
  if (selector === undefined) {
    return {
      text: "<whole-store>",
      selectedFields: [],
    };
  }

  return {
    text: selector.getText(),
    selectedFields: collectStoreSelectorFields(selector),
  };
}

function collectStoreSelectorFields(selector: Expression): readonly string[] {
  if (!isFunctionLikeInitializer(selector)) {
    return collectExpressionReferences(selector);
  }

  const stateParameter = selector.getParameters()[0]?.getName();
  if (stateParameter === undefined) {
    return [];
  }

  const fields: string[] = [];
  const body = selector.getBody();
  collectStoreSelectorField(body, stateParameter, fields);
  body.forEachDescendant((node) => {
    collectStoreSelectorField(node, stateParameter, fields);
  });

  return [...new Set(fields)];
}

function collectStoreSelectorField(
  node: MorphNode,
  stateParameter: string,
  fields: string[],
): void {
    if (!Node.isPropertyAccessExpression(node)) {
      return;
    }

    const expression = unwrapExpression(node.getExpression());
    if (
      expression !== undefined &&
      Node.isIdentifier(expression) &&
      expression.getText() === stateParameter
    ) {
      fields.push(node.getName());
    }
}

function getExternalStoreDefinitionInfo(
  expression: Expression,
  projectRoot: string,
): {
  readonly storeName?: string;
  readonly storeSource?: SourceLocation;
  readonly selectedSources: ReadonlyMap<string, SourceLocation>;
} {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped === undefined || !Node.isIdentifier(unwrapped)) {
    return { selectedSources: new Map() };
  }

  for (const definition of unwrapped.getDefinitions()) {
    const variableDeclaration = definition
      .getNode()
      .getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (
      variableDeclaration === undefined ||
      variableDeclaration.getNameNode() !== definition.getNode()
    ) {
      continue;
    }

    const initializer = unwrapExpression(variableDeclaration.getInitializer());
    const createCall = findExternalStoreCreateCall(initializer);
    if (createCall === undefined) {
      continue;
    }

    return {
      storeName: variableDeclaration.getName(),
      storeSource: sourceLocation(
        variableDeclaration.getNameNode(),
        projectRoot,
        variableDeclaration.getName(),
      ),
      selectedSources: collectExternalStoreSelectedSources(createCall, projectRoot),
    };
  }

  return { selectedSources: new Map() };
}

function findExternalStoreCreateCall(expression: Expression | undefined): CallExpression | undefined {
  if (expression === undefined) {
    return undefined;
  }

  if (Node.isCallExpression(expression) && getCallName(expression.getExpression()) === "create") {
    return expression;
  }

  return expression
    .getDescendants()
    .filter(Node.isCallExpression)
    .find((call) => getCallName(call.getExpression()) === "create");
}

function collectExternalStoreSelectedSources(
  createCall: CallExpression,
  projectRoot: string,
): ReadonlyMap<string, SourceLocation> {
  const sources = new Map<string, SourceLocation>();
  const objectLiteral = createCall
    .getArguments()
    .flatMap((argument) => argument.getDescendants().filter(Node.isObjectLiteralExpression))[0];
  if (objectLiteral === undefined) {
    return sources;
  }

  for (const property of objectLiteral.getProperties()) {
    if (!Node.isPropertyAssignment(property) && !Node.isMethodDeclaration(property)) {
      continue;
    }

    const fieldName = property.getName();
    sources.set(fieldName, sourceLocation(property.getNameNode(), projectRoot, fieldName));
  }

  return sources;
}

function getReferencedExternalStoreUsages(
  handlerText: string,
  externalStoreUsages: readonly ExternalStoreUsageNode[],
): readonly ExternalStoreUsageNode[] {
  return externalStoreUsages.filter((usage) =>
    usage.selectedFields.some((fieldName) =>
      new RegExp(`\\b${escapeRegExp(fieldName)}\\b`).test(handlerText),
    ),
  );
}

function collectReduxActionUsageNodes(
  candidate: ComponentCandidate,
  projectRoot: string,
): readonly ReduxActionUsageNode[] {
  const usages: ReduxActionUsageNode[] = [];

  visitBody(candidate.body, (node) => {
    if (!Node.isCallExpression(node) || getCallName(node.getExpression()) !== "dispatch") {
      return;
    }

    const dispatchedCall = unwrapExpression(node.getArguments()[0]);
    if (!Node.isCallExpression(dispatchedCall)) {
      return;
    }

    const actionExpression = unwrapExpression(dispatchedCall.getExpression());
    if (actionExpression === undefined || !Node.isIdentifier(actionExpression)) {
      return;
    }

    const actionInfo = getReduxActionSourceInfo(actionExpression, projectRoot);
    if (actionInfo === undefined) {
      return;
    }

    usages.push({
      id: `${candidate.id}-dispatches-${kebabCase(actionInfo.actionName)}-${usages.length + 1}-redux-action`,
      ownerComponentId: candidate.id,
      actionName: actionInfo.actionName,
      sliceName: actionInfo.sliceName,
      dispatchSource: sourceLocation(node.getExpression(), projectRoot, "dispatch"),
      actionSource: actionInfo.actionSource,
      reducerSource: actionInfo.reducerSource,
      note: `${candidate.name} dispatches Redux action ${actionInfo.actionName} from ${actionInfo.sliceName}.`,
    });
  });

  return dedupeBy(usages, (usage) => usage.id);
}

function getReduxActionSourceInfo(
  actionIdentifier: MorphNode,
  projectRoot: string,
): {
  readonly actionName: string;
  readonly sliceName: string;
  readonly actionSource?: SourceLocation;
  readonly reducerSource?: SourceLocation;
} | undefined {
  if (!Node.isIdentifier(actionIdentifier)) {
    return undefined;
  }

  const actionName = actionIdentifier.getText();
  for (const definition of actionIdentifier.getDefinitions()) {
    const declarationNode = definition.getDeclarationNode();
    const variableDeclaration =
      declarationNode?.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (variableDeclaration === undefined) {
      continue;
    }

    const initializer = unwrapExpression(variableDeclaration.getInitializer());
    const sliceIdentifier = getReduxSliceIdentifierFromActionsInitializer(initializer);
    if (sliceIdentifier === undefined) {
      continue;
    }

    const sliceInfo = getReduxSliceInfo(sliceIdentifier, actionName, projectRoot);
    if (sliceInfo === undefined) {
      continue;
    }

    return {
      actionName,
      sliceName: sliceInfo.sliceName,
      actionSource: sourceLocation(declarationNode ?? actionIdentifier, projectRoot, actionName),
      reducerSource: sliceInfo.reducerSource,
    };
  }

  return undefined;
}

function getReduxSliceIdentifierFromActionsInitializer(
  initializer: Expression | undefined,
): MorphNode | undefined {
  if (initializer === undefined || !Node.isPropertyAccessExpression(initializer)) {
    return undefined;
  }

  if (initializer.getName() !== "actions") {
    return undefined;
  }

  const sliceExpression = unwrapExpression(initializer.getExpression());
  return sliceExpression !== undefined && Node.isIdentifier(sliceExpression)
    ? sliceExpression
    : undefined;
}

function getReduxSliceInfo(
  sliceIdentifier: MorphNode,
  actionName: string,
  projectRoot: string,
): {
  readonly sliceName: string;
  readonly reducerSource?: SourceLocation;
} | undefined {
  if (!Node.isIdentifier(sliceIdentifier)) {
    return undefined;
  }

  for (const definition of sliceIdentifier.getDefinitions()) {
    const variableDeclaration = definition
      .getNode()
      .getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (variableDeclaration === undefined || variableDeclaration.getNameNode() !== definition.getNode()) {
      continue;
    }

    const createSliceCall = findReduxCreateSliceCall(unwrapExpression(variableDeclaration.getInitializer()));
    if (createSliceCall === undefined) {
      continue;
    }

    return {
      sliceName: variableDeclaration.getName(),
      reducerSource: getReduxReducerSource(createSliceCall, actionName, projectRoot),
    };
  }

  return undefined;
}

function findReduxCreateSliceCall(expression: Expression | undefined): CallExpression | undefined {
  if (expression === undefined) {
    return undefined;
  }

  if (Node.isCallExpression(expression) && getCallName(expression.getExpression()) === "createSlice") {
    return expression;
  }

  return expression
    .getDescendants()
    .filter(Node.isCallExpression)
    .find((call) => getCallName(call.getExpression()) === "createSlice");
}

function getReduxReducerSource(
  createSliceCall: CallExpression,
  actionName: string,
  projectRoot: string,
): SourceLocation | undefined {
  const options = createSliceCall
    .getArguments()
    .map(unwrapExpression)
    .find(Node.isObjectLiteralExpression);
  const reducersProperty = options
    ?.getProperties()
    .find((property) => Node.isPropertyAssignment(property) && property.getName() === "reducers");
  if (!Node.isPropertyAssignment(reducersProperty)) {
    return undefined;
  }

  const reducersObject = unwrapExpression(reducersProperty.getInitializer());
  if (!Node.isObjectLiteralExpression(reducersObject)) {
    return undefined;
  }

  const reducerProperty = reducersObject.getProperties().find(
    (property): property is PropertyAssignment | MethodDeclaration =>
      isNamedObjectProperty(property) && property.getName() === actionName,
  );
  if (reducerProperty === undefined) {
    return undefined;
  }

  return sourceLocation(reducerProperty.getNameNode(), projectRoot, actionName);
}

function isNamedObjectProperty(
  node: MorphNode,
): node is PropertyAssignment | MethodDeclaration {
  return Node.isPropertyAssignment(node) || Node.isMethodDeclaration(node);
}

function getReferencedReduxActionUsages(
  handlerText: string,
  reduxActionUsages: readonly ReduxActionUsageNode[],
): readonly ReduxActionUsageNode[] {
  return reduxActionUsages.filter((usage) =>
    new RegExp(`\\b${escapeRegExp(usage.actionName)}\\b`).test(handlerText),
  );
}

function collectReduxSelectorUsageNodes(
  candidate: ComponentCandidate,
  projectRoot: string,
  projectIndex: ProjectExtractionIndex,
): readonly ReduxSelectorUsageNode[] {
  const usages: ReduxSelectorUsageNode[] = [];

  visitBody(candidate.body, (node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const hookName = getCallName(node.getExpression());
    if (hookName === undefined || !isReduxSelectorHookName(hookName)) {
      return;
    }

    const selector = getReduxSelectorInfo(node);
    if (selector === undefined) {
      return;
    }

    usages.push({
      id: `${candidate.id}-selects-${kebabCase(selector.selectedPath.join("-"))}-${usages.length + 1}-redux-selector`,
      ownerComponentId: candidate.id,
      hookName,
      selector: selector.text,
      selectedPath: selector.selectedPath,
      selectedSource: getReduxSelectedSource(selector.selectedPath, projectIndex, projectRoot),
      source: sourceLocation(node.getExpression(), projectRoot, hookName),
      note: `${candidate.name} reads Redux state ${selector.selectedPath.join(".")} through ${hookName}.`,
    });
  });

  return dedupeBy(usages, (usage) => usage.id);
}

function isReduxSelectorHookName(name: string): boolean {
  return name === "useSelector" || /^use[A-Z][A-Za-z0-9]*Selector$/.test(name);
}

function getReduxSelectorInfo(call: CallExpression): {
  readonly text: string;
  readonly selectedPath: readonly string[];
} | undefined {
  const selector = unwrapExpression(call.getArguments()[0]);
  if (selector === undefined) {
    return undefined;
  }

  if (Node.isIdentifier(selector)) {
    return getReduxIdentifierSelectorInfo(selector);
  }

  if (!isFunctionLikeInitializer(selector)) {
    return undefined;
  }

  return getReduxFunctionSelectorInfo(selector);
}

function getReduxFunctionSelectorInfo(selector: FunctionLike): {
  readonly text: string;
  readonly selectedPath: readonly string[];
} | undefined {
  const stateParameter = selector.getParameters()[0]?.getName();
  if (stateParameter === undefined) {
    return undefined;
  }

  const selectedPath = collectReduxSelectorPath(selector.getBody(), stateParameter);
  return selectedPath.length === 0
    ? undefined
    : {
        text: selector.getText(),
        selectedPath,
      };
}

function getReduxIdentifierSelectorInfo(selector: MorphNode): {
  readonly text: string;
  readonly selectedPath: readonly string[];
} | undefined {
  if (!Node.isIdentifier(selector)) {
    return undefined;
  }

  for (const definition of selector.getDefinitions()) {
    const declarationNode = definition.getDeclarationNode();
    const variableDeclaration = Node.isVariableDeclaration(declarationNode)
      ? declarationNode
      : definition.getNode().getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (variableDeclaration === undefined) {
      continue;
    }

    const initializer = unwrapExpression(variableDeclaration.getInitializer());
    const selectedPath = getReduxSelectorPathFromInitializer(initializer);
    if (selectedPath.length > 0) {
      return {
        text: selector.getText(),
        selectedPath,
      };
    }
  }

  return undefined;
}

function getReduxSelectorPathFromInitializer(initializer: Expression | undefined): readonly string[] {
  if (initializer === undefined) {
    return [];
  }

  if (Node.isIdentifier(initializer)) {
    return getReduxIdentifierSelectorInfo(initializer)?.selectedPath ?? [];
  }

  if (isFunctionLikeInitializer(initializer)) {
    return getReduxFunctionSelectorInfo(initializer)?.selectedPath ?? [];
  }

  if (!Node.isCallExpression(initializer) || getCallName(initializer.getExpression()) !== "createSelector") {
    return [];
  }

  return getReduxCreateSelectorPath(initializer);
}

function getReduxCreateSelectorPath(call: CallExpression): readonly string[] {
  const inputSelectors = getReduxCreateSelectorInputs(call);
  const projector = getReduxCreateSelectorProjector(call);
  for (const [index, inputSelector] of inputSelectors.entries()) {
    const selectedPath = getReduxSelectorPathFromInitializer(inputSelector);
    if (selectedPath.length > 0) {
      const projectorParameter = projector?.getParameters()[index]?.getName();
      const projectedPath =
        projector === undefined || projectorParameter === undefined
          ? []
          : collectReduxSelectorPath(projector.getBody(), projectorParameter);
      return [...selectedPath, ...projectedPath];
    }
  }

  return [];
}

function getReduxCreateSelectorInputs(call: CallExpression): readonly Expression[] {
  const firstArgument = unwrapExpression(call.getArguments()[0]);
  if (firstArgument === undefined) {
    return [];
  }

  if (Node.isArrayLiteralExpression(firstArgument)) {
    return firstArgument
      .getElements()
      .map(unwrapExpression)
      .filter((element): element is Expression => element !== undefined);
  }

  return [firstArgument];
}

function getReduxCreateSelectorProjector(call: CallExpression): FunctionLike | undefined {
  const arguments_ = call.getArguments().map(unwrapExpression);
  for (let index = arguments_.length - 1; index >= 0; index -= 1) {
    const argument = arguments_[index];
    if (argument !== undefined && isFunctionLikeInitializer(argument)) {
      return argument;
    }
  }

  return undefined;
}

function collectReduxSelectorPath(node: MorphNode, stateParameter: string): readonly string[] {
  const access = Node.isPropertyAccessExpression(node)
    ? node
    : node.getDescendants().find(Node.isPropertyAccessExpression);
  if (access === undefined) {
    return [];
  }

  const path: string[] = [];
  let current: MorphNode = access;
  while (Node.isPropertyAccessExpression(current)) {
    path.unshift(current.getName());
    current = current.getExpression();
  }

  return Node.isIdentifier(current) && current.getText() === stateParameter ? path : [];
}

function getReduxSelectedSource(
  selectedPath: readonly string[],
  projectIndex: ProjectExtractionIndex,
  projectRoot: string,
): SourceLocation | undefined {
  const [sliceField, selectedField] = selectedPath;
  if (sliceField === undefined || selectedField === undefined) {
    return undefined;
  }

  const cacheKey = selectedPath.join(".");
  if (projectIndex.reduxSelectedSourceByPath.has(cacheKey)) {
    return projectIndex.reduxSelectedSourceByPath.get(cacheKey);
  }

  for (const file of projectIndex.reduxSourceFiles) {
    const source = getReduxSelectedSourceFromFile(file, sliceField, selectedField, projectRoot);
    if (source !== undefined) {
      projectIndex.reduxSelectedSourceByPath.set(cacheKey, source);
      return source;
    }
  }

  projectIndex.reduxSelectedSourceByPath.set(cacheKey, undefined);
  return undefined;
}

function getReduxSelectedSourceFromFile(
  sourceFile: SourceFile,
  sliceField: string,
  selectedField: string,
  projectRoot: string,
): SourceLocation | undefined {
  for (const call of sourceFile.getDescendants().filter(Node.isCallExpression)) {
    if (getCallName(call.getExpression()) !== "configureStore") {
      continue;
    }

    if (!configureStoreIncludesReducerKey(call, sliceField)) {
      continue;
    }

    const source = getReduxInitialStateFieldSource(sourceFile, selectedField, projectRoot);
    if (source !== undefined) {
      return source;
    }
  }

  return undefined;
}

function configureStoreIncludesReducerKey(call: CallExpression, reducerKey: string): boolean {
  const options = call
    .getArguments()
    .map(unwrapExpression)
    .find(Node.isObjectLiteralExpression);
  const reducerProperty = options
    ?.getProperties()
    .find((property) => Node.isPropertyAssignment(property) && property.getName() === "reducer");
  if (!Node.isPropertyAssignment(reducerProperty)) {
    return false;
  }

  const reducerObject = unwrapExpression(reducerProperty.getInitializer());
  if (!Node.isObjectLiteralExpression(reducerObject)) {
    return false;
  }

  return reducerObject.getProperties().some(
    (property) => isNamedObjectProperty(property) && property.getName() === reducerKey,
  );
}

function getReduxInitialStateFieldSource(
  sourceFile: SourceFile,
  selectedField: string,
  projectRoot: string,
): SourceLocation | undefined {
  const inlineSource = getReduxInlineInitialStateFieldSource(
    sourceFile,
    selectedField,
    projectRoot,
  );
  if (inlineSource !== undefined) {
    return inlineSource;
  }

  for (const variableDeclaration of sourceFile.getVariableDeclarations()) {
    if (variableDeclaration.getName() !== "initialState") {
      continue;
    }

    const initializer = unwrapExpression(variableDeclaration.getInitializer());
    if (!Node.isObjectLiteralExpression(initializer)) {
      continue;
    }

    const field = initializer.getProperties().find(
      (property): property is PropertyAssignment | MethodDeclaration =>
        isNamedObjectProperty(property) && property.getName() === selectedField,
    );
    if (field !== undefined) {
      return sourceLocation(field.getNameNode(), projectRoot, selectedField);
    }
  }

  return undefined;
}

function getReduxInlineInitialStateFieldSource(
  sourceFile: SourceFile,
  selectedField: string,
  projectRoot: string,
): SourceLocation | undefined {
  for (const call of sourceFile.getDescendants().filter(Node.isCallExpression)) {
    if (getCallName(call.getExpression()) !== "createSlice") {
      continue;
    }

    const options = call
      .getArguments()
      .map(unwrapExpression)
      .find(Node.isObjectLiteralExpression);
    const initialStateProperty = options
      ?.getProperties()
      .find(
        (property): property is PropertyAssignment =>
          Node.isPropertyAssignment(property) && property.getName() === "initialState",
      );
    if (initialStateProperty === undefined) {
      continue;
    }

    const initialState = unwrapExpression(initialStateProperty.getInitializer());
    if (!Node.isObjectLiteralExpression(initialState)) {
      continue;
    }

    const field = initialState.getProperties().find(
      (property): property is PropertyAssignment | MethodDeclaration =>
        isNamedObjectProperty(property) && property.getName() === selectedField,
    );
    if (field !== undefined) {
      return sourceLocation(field.getNameNode(), projectRoot, selectedField);
    }
  }

  return undefined;
}

function collectContextActionBindings(
  candidate: ComponentCandidate,
  stateBindings: readonly StateBinding[],
  hooks: readonly HookNode[],
): readonly ContextActionBinding[] {
  const bindings: ContextActionBinding[] = [];
  const providerValueObjects = collectProviderValueObjects(candidate);

  for (const providerValueObject of providerValueObjects) {
    for (const property of providerValueObject.getProperties()) {
      if (!Node.isPropertyAssignment(property) && !Node.isMethodDeclaration(property)) {
        continue;
      }

      const propertyName = property.getName();
      const handlerText = Node.isPropertyAssignment(property)
        ? property.getInitializerOrThrow().getText()
        : property.getBodyText() ?? "";
      const touchedStates = getTouchedStates(handlerText, stateBindings);
      const triggeredHooks = getTriggeredHooks(touchedStates, hooks);
      if (touchedStates.length === 0 && triggeredHooks.length === 0) {
        continue;
      }

      bindings.push({
        actionReference: propertyName,
        stateIds: touchedStates.map((state) => state.id),
        hookIds: triggeredHooks.map((hook) => hook.id),
        network: networkPattern.test(handlerText)
          ? ["context provider action network call"]
          : [],
      });
    }
  }

  return bindings;
}

function getCustomHookImplementation(
  expression: Expression,
  projectRoot: string,
): Pick<HookNode, "note" | "risk" | "source"> | undefined {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped === undefined || !Node.isIdentifier(unwrapped)) {
    return undefined;
  }

  for (const definition of unwrapped.getDefinitions()) {
    const node = definition.getNode();
    const source = sourceLocationFromDefinitionNode(node, projectRoot, unwrapped.getText());
    const implementationText = getHandlerTextFromDefinitionNode(node);
    if (source === undefined || implementationText === undefined) {
      continue;
    }

    return {
      source: getPrimaryCustomHookEditSource(node, projectRoot) ?? source,
      risk: networkPattern.test(implementationText) || setterPattern.test(implementationText)
        ? "high"
        : "medium",
      note:
        `Custom hook "${unwrapped.getText()}" owns hidden state/effect behavior; inspect the hook implementation before editing the caller or display-only children.`,
    };
  }

  return undefined;
}

function getPrimaryCustomHookEditSource(
  definitionNode: MorphNode,
  projectRoot: string,
): SourceLocation | undefined {
  const implementationNode = getImplementationNode(definitionNode);
  const effectCall = implementationNode
    ?.getDescendants()
    .filter(Node.isCallExpression)
    .find((call) => getCallName(call.getExpression()) === "useEffect");

  return effectCall === undefined
    ? undefined
    : sourceLocation(effectCall.getExpression(), projectRoot, "useEffect");
}

function getImplementationNode(node: MorphNode): MorphNode | undefined {
  if (Node.isFunctionDeclaration(node)) {
    return node.getBody();
  }
  if (Node.isIdentifier(node)) {
    const functionDeclaration = node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
    if (functionDeclaration?.getNameNode() === node) {
      return functionDeclaration.getBody();
    }

    const variableDeclaration = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    const initializer = unwrapExpression(variableDeclaration?.getInitializer());
    return getFunctionLikeHandlerNode(initializer);
  }

  return undefined;
}

function collectCallIdentifierArguments(call: CallExpression): readonly string[] {
  return call.getArguments().flatMap((argument) => {
    const unwrapped = unwrapExpression(argument);
    return unwrapped !== undefined && Node.isIdentifier(unwrapped)
      ? [unwrapped.getText()]
      : [];
  });
}

function collectProviderValueObjects(candidate: ComponentCandidate): readonly ObjectLiteralExpression[] {
  const values: ObjectLiteralExpression[] = [];

  visitBody(candidate.body, (node) => {
    if (!isJsxOpeningLikeElement(node) || !isContextProviderTag(node)) {
      return;
    }

    const valueAttribute = node.getAttribute("value");
    if (valueAttribute === undefined || !Node.isJsxAttribute(valueAttribute)) {
      return;
    }

    const initializer = valueAttribute.getInitializer();
    if (initializer === undefined || !Node.isJsxExpression(initializer)) {
      return;
    }

    const expression = initializer.getExpression();
    const valueObject = expression === undefined
      ? undefined
      : getObjectLiteralFromExpression(expression);
    if (valueObject !== undefined) {
      values.push(valueObject);
    }
  });

  return values;
}

function isContextProviderTag(node: JsxOpeningLikeElement): boolean {
  const tagNameNode = node.getTagNameNode();
  if (Node.isPropertyAccessExpression(tagNameNode)) {
    return tagNameNode.getName() === "Provider";
  }
  return getJsxTagName(node) === "Provider";
}

function getObjectLiteralFromExpression(expression: MorphNode): ObjectLiteralExpression | undefined {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped === undefined) {
    return undefined;
  }

  if (Node.isObjectLiteralExpression(unwrapped)) {
    return unwrapped;
  }

  if (Node.isIdentifier(unwrapped)) {
    const declaration = getVariableDeclarationFromIdentifier(unwrapped);
    return declaration === undefined
      ? undefined
      : getObjectLiteralFromExpression(declaration.getInitializer() ?? declaration);
  }

  if (Node.isCallExpression(unwrapped) && getCallName(unwrapped.getExpression()) === "useMemo") {
    const callback = unwrapExpression(unwrapped.getArguments()[0]);
    if (isFunctionLikeInitializer(callback)) {
      return getObjectLiteralFromExpression(callback.getBody());
    }
  }

  return undefined;
}

function getVariableDeclarationFromIdentifier(
  identifier: MorphNode,
): VariableDeclaration | undefined {
  if (!Node.isIdentifier(identifier)) {
    return undefined;
  }

  for (const definition of identifier.getDefinitions()) {
    const node = definition.getNode();
    if (Node.isVariableDeclaration(node)) {
      return node;
    }

    if (Node.isIdentifier(node)) {
      const declaration = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
      if (declaration !== undefined && declaration.getNameNode() === node) {
        return declaration;
      }
    }
  }

  return undefined;
}

function collectRemoteDataNodes(
  candidate: ComponentCandidate,
  projectRoot: string,
): readonly RemoteDataNode[] {
  const remoteData: RemoteDataNode[] = [];

  visitBody(candidate.body, (node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const callName = getCallName(node.getExpression());
    if (callName === "fetch") {
      if (isNestedInsideRemoteDataHook(node)) {
        return;
      }

      const nextFetchTags = extractNextFetchTags(node);
      remoteData.push({
        id: `${candidate.id}-${nextFetchTags.length === 0 ? "fetch" : "next-fetch"}-${remoteData.length + 1}-remote`,
        ownerComponentId: candidate.id,
        kind: nextFetchTags.length === 0 ? "fetch" : "next-fetch",
        key: nextFetchTags.length === 0 ? extractFetchKey(node) : nextFetchTags,
        endpoint: extractStringLikeArgument(node.getArguments()[0]),
        source: sourceLocation(node.getExpression(), projectRoot, "fetch"),
        risk: nextFetchTags.length === 0 ? "high" : "medium",
        note:
          nextFetchTags.length === 0
            ? "Fetch result can become stale unless request ordering, abort, or cache ownership is explicit."
            : "Next server fetch is tagged for on-demand revalidation; check matching revalidateTag calls after mutations.",
      });
      return;
    }

    if (callName === "useQuery") {
      remoteData.push({
        id: `${candidate.id}-use-query-${remoteData.length + 1}-remote`,
        ownerComponentId: candidate.id,
        kind: "react-query",
        key: extractQueryKey(node),
        endpoint: extractEndpointFromCallText(node),
        source: sourceLocation(node.getExpression(), projectRoot, "useQuery"),
        risk: getQueryKeyRisk(node),
        note: "React Query data is keyed by queryKey; stale or broad keys can cause cache inconsistency.",
      });
      return;
    }

    if (callName === "useSWR") {
      remoteData.push({
        id: `${candidate.id}-use-swr-${remoteData.length + 1}-remote`,
        ownerComponentId: candidate.id,
        kind: "swr",
        key: extractSwrKey(node),
        endpoint: extractStringLikeArgument(node.getArguments()[0]),
        source: sourceLocation(node.getExpression(), projectRoot, "useSWR"),
        risk: getSwrKeyRisk(node),
        note: "SWR data is keyed by the first argument; broad or unstable keys can return stale data.",
      });
    }
  });

  return remoteData;
}

function collectCacheOperationNodes(
  candidate: ComponentCandidate,
  projectRoot: string,
  handlerBindings: ReadonlyMap<string, HandlerBinding>,
  swrMutateBindings: ReadonlyMap<string, SwrMutateBinding>,
): readonly CacheOperationExtraction[] {
  const operations: CacheOperationExtraction[] = [];

  visitBody(candidate.body, (node) => {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const boundSwrMutate = getBoundSwrMutateBinding(node, swrMutateBindings);
    const operationKind = getCacheOperationKind(node, boundSwrMutate);
    if (operationKind === undefined) {
      return;
    }

    const id = `${candidate.id}-${operationKind}-${operations.length + 1}-cache`;
    operations.push({
      operation: {
        id,
        ownerComponentId: candidate.id,
        kind: operationKind,
        policy: extractCacheOperationPolicy(node, boundSwrMutate !== undefined, projectRoot),
        targetKey: extractCacheTargetKey(node, boundSwrMutate),
        trigger: getContainingMutationTrigger(node, projectRoot),
        source: sourceLocation(
          node.getExpression(),
          projectRoot,
          getCallName(node.getExpression()) ?? operationKind,
        ),
      },
      handlerReferences: unique([
        ...getContainingHandlerReferences(node, handlerBindings),
        ...getContainingMutationReferences(node),
      ]),
    });
  });

  return operations;
}

function collectNextServerActionCacheOperationNodes(
  candidate: ComponentCandidate,
  projectRoot: string,
  serverActionBindings: readonly ServerActionBinding[],
): readonly CacheOperationExtraction[] {
  const operations: CacheOperationExtraction[] = [];

  for (const binding of serverActionBindings) {
    const body = binding.declaration.getBody();
    if (body === undefined) {
      continue;
    }

    const cacheImports = collectNextCacheImports(binding.declaration.getSourceFile());
    if (cacheImports.size === 0) {
      continue;
    }

    visitBody(body, (node) => {
      if (!Node.isCallExpression(node)) {
        return;
      }

      const operationKind = getNextCacheOperationKind(node, cacheImports);
      if (operationKind === undefined) {
        return;
      }

      operations.push({
        operation: {
          id: `${candidate.id}-${kebabCase(binding.name)}-${operationKind}-${operations.length + 1}-cache`,
          ownerComponentId: candidate.id,
          kind: operationKind,
          targetKey: extractCacheTargetKey(node, undefined),
          source: sourceLocation(
            node.getExpression(),
            projectRoot,
            getCallName(node.getExpression()) ?? operationKind,
          ),
        },
        handlerReferences: [binding.name],
      });
    });
  }

  return operations;
}

function collectNextCacheImports(
  sourceFile: SourceFile,
): ReadonlyMap<string, NextCacheOperationKind> {
  const imports = new Map<string, NextCacheOperationKind>();

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    if (importDeclaration.getModuleSpecifierValue() !== "next/cache") {
      continue;
    }

    for (const specifier of importDeclaration.getNamedImports()) {
      const exportedName = specifier.getName();
      const operationKind = nextCacheOperationKindFromExport(exportedName);
      if (operationKind === undefined) {
        continue;
      }

      const localName = specifier.getAliasNode()?.getText() ?? exportedName;
      imports.set(localName, operationKind);
    }
  }

  return imports;
}

type NextCacheOperationKind = Extract<
  CacheOperationNode["kind"],
  "revalidate-path" | "revalidate-tag" | "update-tag"
>;

function nextCacheOperationKindFromExport(
  exportedName: string,
): NextCacheOperationKind | undefined {
  switch (exportedName) {
    case "revalidatePath":
      return "revalidate-path";
    case "revalidateTag":
      return "revalidate-tag";
    case "updateTag":
      return "update-tag";
    default:
      return undefined;
  }
}

function collectSwrMutateBindings(
  candidate: ComponentCandidate,
  projectRoot: string,
): ReadonlyMap<string, SwrMutateBinding> {
  const bindings = new Map<string, SwrMutateBinding>();
  visitBody(candidate.body, (node) => {
    if (!Node.isVariableDeclaration(node)) {
      return;
    }

    const initializer = node.getInitializer();
    if (
      initializer === undefined ||
      !Node.isCallExpression(initializer) ||
      getCallName(initializer.getExpression()) !== "useSWR"
    ) {
      return;
    }

    const nameNode = node.getNameNode();
    if (!Node.isObjectBindingPattern(nameNode)) {
      return;
    }

    for (const element of nameNode.getElements()) {
      const propertyName = element.getPropertyNameNode()?.getText() ?? element.getNameNode().getText();
      if (propertyName !== "mutate") {
        continue;
      }

      const localName = element.getNameNode().getText();
      bindings.set(localName, {
        key: extractSwrKey(initializer),
        name: localName,
        source: sourceLocation(element.getNameNode(), projectRoot, localName),
      });
    }
  });
  return bindings;
}

function getBoundSwrMutateBinding(
  call: CallExpression,
  swrMutateBindings: ReadonlyMap<string, SwrMutateBinding>,
): SwrMutateBinding | undefined {
  const expression = call.getExpression();
  return Node.isIdentifier(expression) ? swrMutateBindings.get(expression.getText()) : undefined;
}

function getContainingMutationReferences(node: MorphNode): readonly string[] {
  const mutationReference = getContainingMutationReference(node);
  return mutationReference === undefined ? [] : [mutationReference];
}

function getContainingMutationTrigger(
  node: MorphNode,
  projectRoot: string,
): CacheOperationNode["trigger"] | undefined {
  return (
    getContainingUseMutationCallbackTrigger(node, projectRoot) ??
    getContainingMutateCallCallbackTrigger(node, projectRoot)
  );
}

function getContainingUseMutationCallbackTrigger(
  node: MorphNode,
  projectRoot: string,
): CacheOperationNode["trigger"] | undefined {
  const mutationReference = getContainingUseMutationReference(node);
  if (mutationReference === undefined) {
    return undefined;
  }

  const callbackProperty = node
    .getAncestors()
    .find((ancestor) => Node.isPropertyAssignment(ancestor) && isMutationCallbackName(ancestor.getName()));
  if (!Node.isPropertyAssignment(callbackProperty)) {
    return undefined;
  }

  const useMutationCall = callbackProperty.getFirstAncestorByKind(SyntaxKind.CallExpression);
  if (
    useMutationCall === undefined ||
    getCallName(useMutationCall.getExpression()) !== "useMutation"
  ) {
    return undefined;
  }

  return {
    kind: mutationCallbackTriggerKind(callbackProperty.getName()),
    reference: mutationReference,
    source: sourceLocation(callbackProperty.getNameNode(), projectRoot, callbackProperty.getName()),
  };
}

function getContainingMutateCallCallbackTrigger(
  node: MorphNode,
  projectRoot: string,
): CacheOperationNode["trigger"] | undefined {
  const callbackProperty = node
    .getAncestors()
    .find((ancestor) => Node.isPropertyAssignment(ancestor) && isMutationCallbackName(ancestor.getName()));
  if (!Node.isPropertyAssignment(callbackProperty)) {
    return undefined;
  }

  const mutateCall = callbackProperty.getFirstAncestorByKind(SyntaxKind.CallExpression);
  if (mutateCall === undefined || getCallName(mutateCall.getExpression()) !== "mutate") {
    return undefined;
  }

  const mutationReference = getMutationReferenceFromMutateCall(mutateCall);
  if (mutationReference === undefined) {
    return undefined;
  }

  return {
    kind: mutationCallbackTriggerKind(callbackProperty.getName()),
    reference: mutationReference,
    source: sourceLocation(callbackProperty.getNameNode(), projectRoot, callbackProperty.getName()),
  };
}

function getContainingMutationReference(node: MorphNode): string | undefined {
  return getContainingUseMutationReference(node) ?? getContainingMutateCallReference(node);
}

function getContainingUseMutationReference(node: MorphNode): string | undefined {
  const useMutationCall = node.getAncestors().find(
    (ancestor): ancestor is CallExpression =>
      Node.isCallExpression(ancestor) &&
      getCallName(ancestor.getExpression()) === "useMutation",
  );
  if (useMutationCall === undefined) {
    return undefined;
  }

  const declaration = useMutationCall.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (declaration === undefined) {
    return undefined;
  }

  const nameNode = declaration.getNameNode();
  return Node.isIdentifier(nameNode) ? nameNode.getText() : undefined;
}

function getMutationReferenceFromMutateCall(call: CallExpression): string | undefined {
  const expression = call.getExpression();
  if (Node.isPropertyAccessExpression(expression)) {
    const ownerExpression = unwrapExpression(expression.getExpression());
    return Node.isIdentifier(ownerExpression) ? ownerExpression.getText() : undefined;
  }
  return undefined;
}

function getContainingMutateCallReference(node: MorphNode): string | undefined {
  const mutateCall = node.getAncestors().find(
    (ancestor): ancestor is CallExpression =>
      Node.isCallExpression(ancestor) &&
      getCallName(ancestor.getExpression()) === "mutate",
  );
  return mutateCall === undefined ? undefined : getMutationReferenceFromMutateCall(mutateCall);
}

function isMutationCallbackName(name: string): boolean {
  return name === "onSuccess" || name === "onError" || name === "onSettled";
}

function mutationCallbackTriggerKind(
  name: string,
): NonNullable<CacheOperationNode["trigger"]>["kind"] {
  switch (name) {
    case "onError":
      return "mutation-error";
    case "onSettled":
      return "mutation-settled";
    case "onSuccess":
      return "mutation-success";
    default:
      throw new Error(`Unsupported mutation callback "${name}".`);
  }
}

function collectActions(
  candidate: ComponentCandidate,
  projectRoot: string,
  stateBindings: readonly StateBinding[],
  hooks: readonly HookNode[],
  handlerBindings: ReadonlyMap<string, HandlerBinding>,
  controlledFieldBindings: readonly ControlledFieldBinding[],
  routerSubmitBindings: RouterSubmitBinding,
  nextRouterBindings: NextRouterBinding,
  serverActionBindings: readonly ServerActionBinding[],
  externalStoreUsages: readonly ExternalStoreUsageNode[],
  reduxActionUsages: readonly ReduxActionUsageNode[],
): readonly ActionExtraction[] {
  const actions: ActionExtraction[] = [];

  visitBody(candidate.body, (node) => {
    if (!isJsxOpeningLikeElement(node)) {
      return;
    }

    for (const attribute of node.getAttributes()) {
      if (!Node.isJsxAttribute(attribute)) {
        continue;
      }

      const attributeName = getJsxAttributeName(attribute);
      if (!isEventAttribute(attributeName)) {
        continue;
      }

      const handlerText = getEventHandlerText(attribute, handlerBindings);
      const touchedStates = getTouchedStates(handlerText, stateBindings);
      const referencedExternalStoreUsages = getReferencedExternalStoreUsages(
        handlerText,
        externalStoreUsages,
      );
      const referencedReduxActionUsages = getReferencedReduxActionUsages(
        handlerText,
        reduxActionUsages,
      );
      const triggeredHooks = withActionSpecificHookSources({
        body: candidate.body,
        handlerText,
        hooks: [
          ...getTriggeredHooks(touchedStates, hooks),
          ...getRouterSubmitTriggeredHooks(handlerText, hooks, routerSubmitBindings),
          ...getNextRouterRefreshTriggeredHooks(handlerText, hooks, nextRouterBindings),
          ...getServerActionTriggeredHooks(handlerText, hooks, serverActionBindings),
        ],
        projectRoot,
        stateBindings,
      });
      const tagName = getJsxTagName(node);

      actions.push({
        action: {
          id: `${candidate.id}-${kebabCase(attributeName)}-${actions.length + 1}-action`,
          name: `${eventNameToVerb(attributeName)} ${tagName}`,
          ownerComponentId: candidate.id,
          source: sourceLocation(attribute.getNameNode(), projectRoot, attributeName),
          implementationSource: getEventActionImplementationSource(attribute, projectRoot),
          touchesState: touchedStates.map((state) => state.id),
          triggersHooks: triggeredHooks.map((hook) => hook.id),
          externalStoreUsages: referencedExternalStoreUsages.map((usage) => usage.id),
          reduxActionUsages: referencedReduxActionUsages.map((usage) => usage.id),
          network: [
            ...(networkPattern.test(handlerText) ? ["inline handler network call"] : []),
            ...(isRouterSubmitHandler(handlerText, routerSubmitBindings)
              ? ["React Router imperative action submit"]
              : []),
            ...(hasServerActionCall(handlerText, serverActionBindings)
              ? ["Next Server Action call"]
              : []),
            ...(hasNextRouterRefreshCall(handlerText, nextRouterBindings)
              ? ["Next router.refresh current route"]
              : []),
          ],
        },
        handlerReferences: collectHandlerReferences(attribute),
      });
    }

    const registeredFieldAction = collectRegisteredFieldAction({
      actionsCount: actions.length,
      candidate,
      node,
      projectRoot,
      stateBindings,
      hooks,
      controlledFieldBindings,
    });
    if (registeredFieldAction !== undefined) {
      actions.push(registeredFieldAction);
    }

    const routerFormAction = collectRouterFormAction({
      actionsCount: actions.length,
      candidate,
      hooks,
      node,
      projectRoot,
      routerSubmitBindings,
    });
    if (routerFormAction !== undefined) {
      actions.push(routerFormAction);
    }

    const nextServerAction = collectNextServerAction({
      actionsCount: actions.length,
      candidate,
      hooks,
      node,
      projectRoot,
      serverActionBindings,
    });
    if (nextServerAction !== undefined) {
      actions.push(nextServerAction);
    }
  });

  return actions;
}

function collectRouterFormAction(input: {
  readonly actionsCount: number;
  readonly candidate: ComponentCandidate;
  readonly hooks: readonly HookNode[];
  readonly node: JsxOpeningLikeElement;
  readonly projectRoot: string;
  readonly routerSubmitBindings: RouterSubmitBinding;
}): ActionExtraction | undefined {
  const tagName = getJsxTagName(input.node);
  if (tagName !== "button") {
    return undefined;
  }

  const buttonType = getStringAttribute(input.node, "type");
  if (buttonType !== undefined && buttonType !== "submit") {
    return undefined;
  }

  const form = getAncestorRouterForm(input.node, input.routerSubmitBindings);
  if (form === undefined) {
    return undefined;
  }

  const routeAction = input.hooks.find((hook) => hook.name === "route action");
  if (routeAction === undefined) {
    return undefined;
  }

  return {
    action: {
      id: `${input.candidate.id}-router-action-${input.actionsCount + 1}-action`,
      name: `submit ${getJsxTagText(form)}`,
      ownerComponentId: input.candidate.id,
      source: sourceLocation(input.node.getTagNameNode(), input.projectRoot, "routerAction"),
      touchesState: [],
      triggersHooks: [routeAction.id],
      network: ["React Router route action submit"],
    },
    handlerReferences: [routeAction.name],
  };
}

function collectNextServerAction(input: {
  readonly actionsCount: number;
  readonly candidate: ComponentCandidate;
  readonly hooks: readonly HookNode[];
  readonly node: JsxOpeningLikeElement;
  readonly projectRoot: string;
  readonly serverActionBindings: readonly ServerActionBinding[];
}): ActionExtraction | undefined {
  const serverActionName = getServerActionNameForJsxNode(input.node);
  if (serverActionName === undefined) {
    return undefined;
  }

  const serverActionHook = input.hooks.find(
    (hook) => hook.name === "server action" && hook.dependencies.includes(serverActionName),
  );
  if (serverActionHook === undefined) {
    return undefined;
  }

  return {
    action: {
      id: `${input.candidate.id}-${kebabCase(serverActionName)}-${input.actionsCount + 1}-action`,
      name: `invoke server action ${serverActionName}`,
      ownerComponentId: input.candidate.id,
      source: sourceLocation(input.node.getTagNameNode(), input.projectRoot, "serverAction"),
      touchesState: [],
      triggersHooks: [serverActionHook.id],
      network: ["Next Server Action submit"],
    },
    handlerReferences: [serverActionName],
  };
}

function getServerActionNameForJsxNode(node: JsxOpeningLikeElement): string | undefined {
  const tagName = getJsxTagName(node);
  if (tagName === "form") {
    return getJsxExpressionIdentifier(node, "action");
  }

  if (tagName !== "button") {
    return undefined;
  }

  const buttonType = getStringAttribute(node, "type");
  if (buttonType !== undefined && buttonType !== "submit") {
    return undefined;
  }

  return getJsxExpressionIdentifier(node, "formAction") ?? getAncestorFormServerActionName(node);
}

function getAncestorFormServerActionName(node: JsxOpeningLikeElement): string | undefined {
  for (const ancestor of node.getAncestors()) {
    const openingElement = Node.isJsxElement(ancestor)
      ? ancestor.getOpeningElement()
      : isJsxOpeningLikeElement(ancestor)
        ? ancestor
        : undefined;
    if (openingElement !== undefined && getJsxTagName(openingElement) === "form") {
      return getJsxExpressionIdentifier(openingElement, "action");
    }
  }

  return undefined;
}

function getServerActionTriggeredHooks(
  handlerText: string,
  hooks: readonly HookNode[],
  serverActionBindings: readonly ServerActionBinding[],
): readonly HookNode[] {
  return serverActionBindings.flatMap((binding) => {
    if (!hasServerActionCall(handlerText, [binding])) {
      return [];
    }
    return hooks.filter(
      (hook) => hook.name === "server action" && hook.dependencies.includes(binding.name),
    );
  });
}

function hasServerActionCall(
  handlerText: string,
  serverActionBindings: readonly ServerActionBinding[],
): boolean {
  return serverActionBindings.some((binding) =>
    new RegExp(`\\b${escapeRegExp(binding.name)}\\s*\\(`).test(handlerText),
  );
}

function getNextRouterRefreshTriggeredHooks(
  handlerText: string,
  hooks: readonly HookNode[],
  nextRouterBindings: NextRouterBinding,
): readonly HookNode[] {
  if (!hasNextRouterRefreshCall(handlerText, nextRouterBindings)) {
    return [];
  }
  return hooks.filter((hook) => hook.name === "router refresh");
}

function hasNextRouterRefreshCall(
  handlerText: string,
  nextRouterBindings: NextRouterBinding,
): boolean {
  return nextRouterBindings.routerNames.some((name) =>
    new RegExp(`\\b${escapeRegExp(name)}\\.refresh\\s*\\(`).test(handlerText),
  );
}

function isNextRouterRefreshCall(
  call: CallExpression,
  nextRouterBindings: NextRouterBinding,
): boolean {
  const expression = call.getExpression();
  if (!Node.isPropertyAccessExpression(expression) || expression.getName() !== "refresh") {
    return false;
  }
  const routerExpression = unwrapExpression(expression.getExpression());
  return (
    routerExpression !== undefined &&
    Node.isIdentifier(routerExpression) &&
    nextRouterBindings.routerNames.includes(routerExpression.getText())
  );
}

function getRouterSubmitTriggeredHooks(
  handlerText: string,
  hooks: readonly HookNode[],
  routerSubmitBindings: RouterSubmitBinding,
): readonly HookNode[] {
  if (!isRouterSubmitHandler(handlerText, routerSubmitBindings)) {
    return [];
  }

  const routeAction = hooks.find((hook) => hook.name === "route action");
  return routeAction === undefined ? [] : [routeAction];
}

function isRouterSubmitHandler(
  handlerText: string,
  routerSubmitBindings: RouterSubmitBinding,
): boolean {
  return (
    routerSubmitBindings.submitNames.some((name) =>
      hasPostSubmitCall(handlerText, `${escapeRegExp(name)}\\s*\\(`),
    ) ||
    routerSubmitBindings.fetcherNames.some((name) =>
      hasPostSubmitCall(handlerText, `${escapeRegExp(name)}\\.submit\\s*\\(`),
    )
  );
}

function hasPostSubmitCall(handlerText: string, callPattern: string): boolean {
  return new RegExp(callPattern).test(handlerText) && /\bmethod\s*:\s*["']post["']/i.test(handlerText);
}

function getAncestorRouterForm(
  node: JsxOpeningLikeElement,
  routerSubmitBindings: RouterSubmitBinding,
): JsxOpeningLikeElement | undefined {
  for (const ancestor of node.getAncestors()) {
    const openingElement = Node.isJsxElement(ancestor)
      ? ancestor.getOpeningElement()
      : isJsxOpeningLikeElement(ancestor)
        ? ancestor
        : undefined;
    if (
      openingElement !== undefined &&
      isRouterFormTag(getJsxTagText(openingElement), routerSubmitBindings) &&
      (getStringAttribute(openingElement, "method") ?? "get").toLowerCase() === "post"
    ) {
      return openingElement;
    }
  }

  return undefined;
}

function isRouterFormTag(tagName: string, routerSubmitBindings: RouterSubmitBinding): boolean {
  if (tagName === "Form") {
    return true;
  }
  return routerSubmitBindings.fetcherNames.some((name) => tagName === `${name}.Form`);
}

function collectRegisteredFieldAction(input: {
  readonly actionsCount: number;
  readonly candidate: ComponentCandidate;
  readonly node: JsxOpeningLikeElement;
  readonly projectRoot: string;
  readonly stateBindings: readonly StateBinding[];
  readonly hooks: readonly HookNode[];
  readonly controlledFieldBindings: readonly ControlledFieldBinding[];
}): ActionExtraction | undefined {
  const registerCall = getRegisterCallFromJsxNode(input.node);
  const controlledField = getControlledFieldFromJsxNode(
    input.node,
    input.projectRoot,
    input.controlledFieldBindings,
  );
  if (registerCall === undefined && controlledField === undefined) {
    return undefined;
  }

  const uiLabel = getUiLabel(input.node, getJsxTagName(input.node), "input");
  const touchedState =
    controlledField === undefined
      ? findFormStateForUiLabel(input.stateBindings, uiLabel)
      : findFormStateByName(input.stateBindings, controlledField.fieldName);
  if (touchedState === undefined) {
    return undefined;
  }

  const triggeredHooks = getTriggeredHooks([touchedState.state], input.hooks);
  const source =
    controlledField === undefined && registerCall !== undefined
      ? sourceLocation(registerCall.getExpression(), input.projectRoot, "register")
      : sourceLocation(input.node.getTagNameNode(), input.projectRoot, "register");
  const referenceName = controlledField?.localFieldName ?? touchedState.setterName ?? "register";
  return {
    action: {
      id: `${input.candidate.id}-register-${input.actionsCount + 1}-action`,
      name: `${controlledField === undefined ? "register" : "control"} ${getJsxTagName(input.node)}`,
      ownerComponentId: input.candidate.id,
      source,
      touchesState: [touchedState.state.id],
      triggersHooks: triggeredHooks.map((hook) => hook.id),
      network: [],
    },
    handlerReferences: [referenceName],
  };
}

function getRegisterCallFromJsxNode(node: JsxOpeningLikeElement): CallExpression | undefined {
  for (const attribute of node.getAttributes()) {
    if (!Node.isJsxSpreadAttribute(attribute)) {
      continue;
    }

    const expression = unwrapExpression(attribute.getExpression());
    if (Node.isCallExpression(expression) && getCallName(expression.getExpression()) === "register") {
      return expression;
    }
  }

  return undefined;
}

function getControlledFieldFromJsxNode(
  node: JsxOpeningLikeElement,
  projectRoot: string,
  controlledFieldBindings: readonly ControlledFieldBinding[],
): ControlledFieldBinding | undefined {
  if (getJsxTagName(node) === "Controller") {
    return undefined;
  }

  const controller = node
    .getAncestors()
    .find(
      (ancestor): ancestor is JsxOpeningLikeElement =>
        isJsxOpeningLikeElement(ancestor) && getJsxTagName(ancestor) === "Controller",
    );
  if (controller !== undefined) {
    const controllerFieldName = getStringAttribute(controller, "name");
    if (controllerFieldName === undefined) {
      return undefined;
    }
    return {
      fieldName: controllerFieldName,
      source: sourceLocation(controller.getTagNameNode(), projectRoot, "Controller"),
      validation: extractControllerRulesValidation(controller, projectRoot),
    };
  }

  for (const attribute of node.getAttributes()) {
    if (!Node.isJsxSpreadAttribute(attribute)) {
      continue;
    }
    const expression = unwrapExpression(attribute.getExpression());
    if (!Node.isIdentifier(expression)) {
      continue;
    }
    const binding = controlledFieldBindings.find(
      (candidate) => candidate.localFieldName === expression.getText(),
    );
    if (binding !== undefined) {
      return binding;
    }
  }

  return undefined;
}

function findFormStateForUiLabel(
  stateBindings: readonly StateBinding[],
  uiLabel: string,
): StateBinding | undefined {
  const normalizedLabel = normalizeFieldName(uiLabel);
  return stateBindings.find(
    (binding) =>
      binding.hookName === "useForm" &&
      normalizeFieldName(binding.state.name) === normalizedLabel,
  );
}

function findFormStateByName(
  stateBindings: readonly StateBinding[],
  fieldName: string,
): StateBinding | undefined {
  return stateBindings.find(
    (binding) => binding.hookName === "useForm" && binding.state.name === fieldName,
  );
}

function normalizeFieldName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function extractFetchKey(call: CallExpression): readonly string[] {
  const endpoint = extractStringLikeArgument(call.getArguments()[0]);
  return endpoint === undefined ? [call.getText()] : [endpoint];
}

function extractNextFetchTags(call: CallExpression): readonly string[] {
  const options = unwrapExpression(call.getArguments()[1]);
  if (options === undefined || !Node.isObjectLiteralExpression(options)) {
    return [];
  }

  const nextProperty = options.getProperty("next");
  if (nextProperty === undefined || !Node.isPropertyAssignment(nextProperty)) {
    return [];
  }

  const nextOptions = unwrapExpression(nextProperty.getInitializer());
  if (nextOptions === undefined || !Node.isObjectLiteralExpression(nextOptions)) {
    return [];
  }

  const tagsProperty = nextOptions.getProperty("tags");
  if (tagsProperty === undefined || !Node.isPropertyAssignment(tagsProperty)) {
    return [];
  }

  return expressionToKeyParts(tagsProperty.getInitializer());
}

function extractQueryKey(call: CallExpression): readonly string[] {
  const firstArgument = call.getArguments()[0];
  if (firstArgument === undefined) {
    return [];
  }

  if (Node.isObjectLiteralExpression(firstArgument)) {
    const queryKey = firstArgument.getProperty("queryKey");
    if (queryKey !== undefined && Node.isPropertyAssignment(queryKey)) {
      return expressionToKeyParts(queryKey.getInitializer());
    }
  }

  return expressionToKeyParts(firstArgument);
}

function extractSwrKey(call: CallExpression): readonly string[] {
  return expressionToKeyParts(call.getArguments()[0]);
}

function extractCacheTargetKey(
  call: CallExpression,
  boundSwrMutate: SwrMutateBinding | undefined,
): readonly string[] {
  if (boundSwrMutate !== undefined) {
    return boundSwrMutate.key;
  }

  const firstArgument = call.getArguments()[0];
  if (firstArgument === undefined) {
    return [];
  }

  if (Node.isObjectLiteralExpression(firstArgument)) {
    const queryKey = firstArgument.getProperty("queryKey");
    if (queryKey !== undefined && Node.isPropertyAssignment(queryKey)) {
      return expressionToKeyParts(queryKey.getInitializer());
    }
  }

  return expressionToKeyParts(firstArgument);
}

function extractCacheOperationPolicy(
  call: CallExpression,
  isBoundSwrMutate: boolean,
  projectRoot: string,
): CacheOperationNode["policy"] | undefined {
  if (!isBoundSwrMutate && getCallName(call.getExpression()) !== "mutate") {
    return undefined;
  }

  const optionsArgument = getSwrMutateOptionsArgument(call, isBoundSwrMutate);
  if (optionsArgument === undefined || !Node.isObjectLiteralExpression(optionsArgument)) {
    return undefined;
  }

  const options = ["optimisticData", "rollbackOnError", "populateCache", "revalidate"].flatMap(
    (name) => {
      const property = optionsArgument.getProperty(name);
      if (property === undefined || !Node.isPropertyAssignment(property)) {
        return [];
      }
      return [
        {
          name: name as CacheOperationNodePolicyOptionName,
          value: expressionToPolicyValue(property.getInitializer()),
        },
      ];
    },
  );
  if (!options.some((option) => option.name === "optimisticData")) {
    return undefined;
  }

  const optimisticProperty = optionsArgument.getProperty("optimisticData");
  return {
    kind: "optimistic-update",
    options,
    source:
      optimisticProperty !== undefined && Node.isPropertyAssignment(optimisticProperty)
        ? sourceLocation(optimisticProperty.getNameNode(), projectRoot, "optimisticData")
        : sourceLocation(optionsArgument, projectRoot, "optimisticData"),
  };
}

type CacheOperationNodePolicyOptionName =
  NonNullable<CacheOperationNode["policy"]>["options"][number]["name"];

function getSwrMutateOptionsArgument(
  call: CallExpression,
  isBoundSwrMutate: boolean,
): MorphNode | undefined {
  const args = call.getArguments();
  return isBoundSwrMutate ? args[1] : args[2];
}

function expressionToPolicyValue(expression: MorphNode | undefined): string {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped === undefined) {
    return "undefined";
  }
  if (Node.isTrueLiteral(unwrapped)) {
    return "true";
  }
  if (Node.isFalseLiteral(unwrapped)) {
    return "false";
  }
  return unwrapped.getText();
}

function expressionToKeyParts(expression: MorphNode | undefined): readonly string[] {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped === undefined) {
    return [];
  }

  if (Node.isArrayLiteralExpression(unwrapped)) {
    return unwrapped.getElements().map(keyPartText);
  }
  if (Node.isStringLiteral(unwrapped) || Node.isNoSubstitutionTemplateLiteral(unwrapped)) {
    return [unwrapped.getLiteralText()];
  }
  const resolvedString = resolveStringLiteralValue(unwrapped);
  if (resolvedString !== undefined) {
    return [resolvedString];
  }
  return [unwrapped.getText()];
}

function keyPartText(node: MorphNode): string {
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  const resolvedString = resolveStringLiteralValue(node);
  if (resolvedString !== undefined) {
    return resolvedString;
  }
  return node.getText();
}

function extractStringLikeArgument(node: MorphNode | undefined): string | undefined {
  const unwrapped = unwrapExpression(node);
  if (unwrapped === undefined) {
    return undefined;
  }
  if (Node.isStringLiteral(unwrapped) || Node.isNoSubstitutionTemplateLiteral(unwrapped)) {
    return unwrapped.getLiteralText();
  }
  const resolvedString = resolveStringLiteralValue(unwrapped);
  if (resolvedString !== undefined) {
    return resolvedString;
  }
  if (Node.isBinaryExpression(unwrapped)) {
    return extractStringLikeArgument(unwrapped.getLeft());
  }
  return undefined;
}

function resolveStringLiteralValue(node: MorphNode): string | undefined {
  if (!Node.isIdentifier(node)) {
    return undefined;
  }

  for (const definition of node.getDefinitions()) {
    const declaration = getVariableDeclarationFromDefinitionNode(definition.getDeclarationNode());
    const initializer = unwrapExpression(declaration?.getInitializer());
    if (
      initializer !== undefined &&
      (Node.isStringLiteral(initializer) || Node.isNoSubstitutionTemplateLiteral(initializer))
    ) {
      return initializer.getLiteralText();
    }
  }

  return undefined;
}

function getVariableDeclarationFromDefinitionNode(
  node: MorphNode | undefined,
): VariableDeclaration | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (Node.isVariableDeclaration(node)) {
    return node;
  }
  return node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
}

function extractEndpointFromCallText(call: CallExpression): string | undefined {
  const fetchCall = call
    .getDescendants()
    .filter(Node.isCallExpression)
    .find((descendant) => getCallName(descendant.getExpression()) === "fetch");
  return fetchCall === undefined
    ? undefined
    : extractStringLikeArgument(fetchCall.getArguments()[0]);
}

function getQueryKeyRisk(call: CallExpression): RemoteDataNode["risk"] {
  const key = extractQueryKey(call);
  return key.length <= 1 ? "medium" : "low";
}

function getSwrKeyRisk(call: CallExpression): RemoteDataNode["risk"] {
  const key = extractSwrKey(call);
  return key.length <= 1 ? "medium" : "low";
}

function getCacheOperationKind(
  call: CallExpression,
  boundSwrMutate?: SwrMutateBinding,
): CacheOperationNode["kind"] | undefined {
  if (boundSwrMutate !== undefined) {
    return "mutate";
  }

  const callName = getCallName(call.getExpression());
  switch (callName) {
    case "invalidateQueries":
      return "invalidate";
    case "setQueryData":
      return "set-query-data";
    case "mutate":
      if (!Node.isIdentifier(call.getExpression())) {
        return undefined;
      }
      return "mutate";
    case "refetch":
      return "refetch";
    default:
      return undefined;
  }
}

function getNextCacheOperationKind(
  call: CallExpression,
  cacheImports: ReadonlyMap<string, NextCacheOperationKind>,
): NextCacheOperationKind | undefined {
  const expression = unwrapExpression(call.getExpression());
  if (expression === undefined || !Node.isIdentifier(expression)) {
    return undefined;
  }
  return cacheImports.get(expression.getText());
}

function getContainingHandlerReferences(
  node: MorphNode,
  handlerBindings: ReadonlyMap<string, HandlerBinding>,
): readonly string[] {
  return [...handlerBindings.values()]
    .filter((handler) => handler.body !== undefined && containsNode(handler.body, node))
    .map((handler) => handler.name);
}

function containsNode(container: MorphNode, node: MorphNode): boolean {
  return (
    container.getSourceFile().getFilePath() === node.getSourceFile().getFilePath() &&
    container.getStart() <= node.getStart() &&
    container.getEnd() >= node.getEnd()
  );
}

function hasSharedReference(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.some((reference) => right.includes(reference));
}

function isNestedInsideRemoteDataHook(call: CallExpression): boolean {
  return call.getAncestors().some((ancestor) => {
    if (!Node.isCallExpression(ancestor)) {
      return false;
    }
    const callName = getCallName(ancestor.getExpression());
    return callName === "useQuery" || callName === "useSWR";
  });
}

function collectPropHandlerBindings(
  candidate: ComponentCandidate,
  componentIdsByName: ReadonlyMap<string, string>,
  stateBindings: readonly StateBinding[],
  hooks: readonly HookNode[],
  handlerBindings: ReadonlyMap<string, HandlerBinding>,
  propObjectBindings: ReadonlyMap<string, PropObjectBinding>,
  cacheOperations: readonly CacheOperationExtraction[],
): readonly PropHandlerBinding[] {
  const bindings: PropHandlerBinding[] = [];

  visitBody(candidate.body, (node) => {
    if (!isJsxOpeningLikeElement(node)) {
      return;
    }

    const childComponentId = componentIdsByName.get(getJsxTagName(node));
    if (childComponentId === undefined || childComponentId === candidate.id) {
      return;
    }

    const eventProps = collectJsxEventProps(node, handlerBindings, propObjectBindings);
    bindings.push(
      ...eventProps.map((eventProp) =>
        propHandlerBindingFromEventProp({
          ownerComponentId: candidate.id,
          childComponentId,
          eventProp,
          stateBindings,
          hooks,
          cacheOperations,
        }),
      ),
    );
  });

  return bindings;
}

function collectJsxEventProps(
  node: JsxOpeningLikeElement,
  handlerBindings: ReadonlyMap<string, HandlerBinding>,
  propObjectBindings: ReadonlyMap<string, PropObjectBinding>,
): readonly PropObjectProperty[] {
  const eventProps: PropObjectProperty[] = [];

  for (const attribute of node.getAttributes()) {
    if (Node.isJsxAttribute(attribute)) {
      const propName = getJsxAttributeName(attribute);
      if (!isEventAttribute(propName)) {
        continue;
      }

      eventProps.push({
        propName,
        propReferences: collectHandlerReferences(attribute),
        handlerText: getEventHandlerText(attribute, handlerBindings),
      });
      continue;
    }

    if (Node.isJsxSpreadAttribute(attribute)) {
      eventProps.push(
        ...getSpreadEventProps(attribute.getExpression(), propObjectBindings, handlerBindings),
      );
    }
  }

  return eventProps;
}

function getSpreadEventProps(
  expression: Expression,
  propObjectBindings: ReadonlyMap<string, PropObjectBinding>,
  handlerBindings: ReadonlyMap<string, HandlerBinding>,
): readonly PropObjectProperty[] {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped === undefined) {
    return [];
  }

  if (Node.isIdentifier(unwrapped)) {
    return propObjectBindings.get(unwrapped.getText())?.properties ?? [];
  }

  if (Node.isObjectLiteralExpression(unwrapped)) {
    return collectObjectLiteralEventProps(unwrapped, handlerBindings);
  }

  return [];
}

function propHandlerBindingFromEventProp(input: {
  readonly ownerComponentId: string;
  readonly childComponentId: string;
  readonly eventProp: PropObjectProperty;
  readonly stateBindings: readonly StateBinding[];
  readonly hooks: readonly HookNode[];
  readonly cacheOperations: readonly CacheOperationExtraction[];
}): PropHandlerBinding {
  const touchedStates = getTouchedStates(input.eventProp.handlerText, input.stateBindings);
  const triggeredHooks = getTriggeredHooks(touchedStates, input.hooks);
  const cacheOperationIds = input.cacheOperations
    .filter((operation) =>
      hasSharedReference(operation.handlerReferences, input.eventProp.propReferences),
    )
    .map((operation) => operation.operation.id);

  return {
    ownerComponentId: input.ownerComponentId,
    childComponentId: input.childComponentId,
    propName: input.eventProp.propName,
    propReferences: input.eventProp.propReferences,
    stateIds: touchedStates.map((state) => state.id),
    hookIds: triggeredHooks.map((hook) => hook.id),
    cacheOperationIds,
    network: networkPattern.test(input.eventProp.handlerText)
      ? ["prop-drilled handler network call"]
      : [],
  };
}

function linkPropDrilledActions(
  actions: readonly ActionExtraction[],
  linkedPropHandlers: readonly PropHandlerBinding[],
): readonly ActionNode[] {
  return actions.map(({ action, handlerReferences }) => {
    const matchedHandlers = linkedPropHandlers.filter(
      (handler) =>
        handler.childComponentId === action.ownerComponentId &&
        handlerReferences.includes(handler.propName),
    );

    if (matchedHandlers.length === 0) {
      return action;
    }

    return {
      ...action,
      touchesState: unique([
        ...action.touchesState,
        ...matchedHandlers.flatMap((handler) => handler.stateIds),
      ]),
      triggersHooks: unique([
        ...action.triggersHooks,
        ...matchedHandlers.flatMap((handler) => handler.hookIds),
      ]),
      network: unique([
        ...action.network,
        ...matchedHandlers.flatMap((handler) => handler.network),
      ]),
    };
  });
}

function linkContextActions(
  actions: readonly ActionNode[],
  actionExtractions: readonly ActionExtraction[],
  contextActions: readonly ContextActionBinding[],
): readonly ActionNode[] {
  return actions.map((action) => {
    const extraction = actionExtractions.find((item) => item.action.id === action.id);
    if (extraction === undefined) {
      return action;
    }

    const matchedContextActions = contextActions.filter((contextAction) =>
      extraction.handlerReferences.includes(contextAction.actionReference),
    );
    if (matchedContextActions.length === 0) {
      return action;
    }

    return {
      ...action,
      touchesState: unique([
        ...action.touchesState,
        ...matchedContextActions.flatMap((contextAction) => contextAction.stateIds),
      ]),
      triggersHooks: unique([
        ...action.triggersHooks,
        ...matchedContextActions.flatMap((contextAction) => contextAction.hookIds),
      ]),
      network: unique([
        ...action.network,
        ...matchedContextActions.flatMap((contextAction) => contextAction.network),
      ]),
    };
  });
}

function linkCacheOperationsToActions(
  cacheOperations: readonly CacheOperationExtraction[],
  actions: readonly ActionExtraction[],
  linkedPropHandlers: readonly PropHandlerBinding[],
): readonly CacheOperationNode[] {
  return cacheOperations.flatMap((cacheOperation) => {
    const ownerActionIds = unique([
      ...findDirectOwnerActionIds(cacheOperation, actions),
      ...findPropDrilledOwnerActionIds(cacheOperation, actions, linkedPropHandlers),
    ]);

    if (ownerActionIds.length === 0) {
      return [cacheOperation.operation];
    }

    return ownerActionIds.map((ownerActionId) => ({
      ...cacheOperation.operation,
      id:
        ownerActionIds.length === 1
          ? cacheOperation.operation.id
          : `${cacheOperation.operation.id}-${kebabCase(ownerActionId)}`,
      ownerActionId,
    }));
  });
}

function findDirectOwnerActionIds(
  cacheOperation: CacheOperationExtraction,
  actions: readonly ActionExtraction[],
): readonly string[] {
  return actions
    .filter(
      (action) =>
      action.action.ownerComponentId === cacheOperation.operation.ownerComponentId &&
      hasSharedReference(action.handlerReferences, cacheOperation.handlerReferences),
    )
    .map((action) => action.action.id);
}

function findPropDrilledOwnerActionIds(
  cacheOperation: CacheOperationExtraction,
  actions: readonly ActionExtraction[],
  linkedPropHandlers: readonly PropHandlerBinding[],
): readonly string[] {
  return actions.flatMap((action) => {
    const matchingHandlers = linkedPropHandlers.filter(
      (handler) =>
        handler.childComponentId === action.action.ownerComponentId &&
        action.handlerReferences.includes(handler.propName) &&
        handler.cacheOperationIds.includes(cacheOperation.operation.id),
    );
    return matchingHandlers.length === 0 ? [] : [action.action.id];
  });
}

function linkPropHandlerBindings(
  propHandlers: readonly PropHandlerBinding[],
): readonly PropHandlerBinding[] {
  let current = [...propHandlers];
  let changed = true;

  while (changed) {
    changed = false;
    current = current.map((handler) => {
      const upstreamHandlers = current.filter(
        (upstream) =>
          upstream.childComponentId === handler.ownerComponentId &&
          handler.propReferences.includes(upstream.propName),
      );

      if (upstreamHandlers.length === 0) {
        return handler;
      }

      const next = {
        ...handler,
        stateIds: unique([
          ...handler.stateIds,
          ...upstreamHandlers.flatMap((upstream) => upstream.stateIds),
        ]),
        hookIds: unique([
          ...handler.hookIds,
          ...upstreamHandlers.flatMap((upstream) => upstream.hookIds),
        ]),
        cacheOperationIds: unique([
          ...handler.cacheOperationIds,
          ...upstreamHandlers.flatMap((upstream) => upstream.cacheOperationIds),
        ]),
        network: unique([
          ...handler.network,
          ...upstreamHandlers.flatMap((upstream) => upstream.network),
        ]),
      };

      changed =
        changed ||
        next.stateIds.length !== handler.stateIds.length ||
        next.hookIds.length !== handler.hookIds.length ||
        next.cacheOperationIds.length !== handler.cacheOperationIds.length ||
        next.network.length !== handler.network.length;

      return next;
    });
  }

  return current;
}

function syncUiNodesWithActions(
  uiNodes: readonly UiNode[],
  actions: readonly ActionNode[],
): readonly UiNode[] {
  const actionsById = new Map(actions.map((action) => [action.id, action]));

  return uiNodes.map((uiNode) => {
    if (uiNode.actionId === undefined) {
      return uiNode;
    }

    const action = actionsById.get(uiNode.actionId);
    if (action === undefined || action.touchesState.length === 0) {
      return uiNode;
    }

    return {
      ...uiNode,
      stateIds: action.touchesState,
    };
  });
}

function collectHandlerBindings(candidate: ComponentCandidate): ReadonlyMap<string, HandlerBinding> {
  const handlers = new Map<string, HandlerBinding>();

  visitBody(candidate.body, (node) => {
    if (Node.isFunctionDeclaration(node) && node.getNameNode() !== undefined && node.getBody() !== undefined) {
      const nameNode = node.getNameNode();
      const body = node.getBody();
      if (nameNode === undefined || body === undefined) {
        return;
      }
      handlers.set(nameNode.getText(), {
        name: nameNode.getText(),
        node: nameNode,
        body,
        text: body.getText(),
      });
      return;
    }

    if (!Node.isVariableDeclaration(node) || !Node.isIdentifier(node.getNameNode())) {
      return;
    }

    const initializer = unwrapExpression(node.getInitializer());
    const handlerBody = getFunctionLikeHandlerNode(initializer);
    const name = node.getNameNode().getText();
    handlers.set(name, {
      name,
      node: node.getNameNode(),
      body: handlerBody,
      text: handlerBody?.getText() ?? initializer?.getText() ?? "",
    });
  });

  return handlers;
}

function collectPropObjectBindings(
  candidate: ComponentCandidate,
  handlerBindings: ReadonlyMap<string, HandlerBinding>,
): ReadonlyMap<string, PropObjectBinding> {
  const propObjects = new Map<string, PropObjectBinding>();

  visitBody(candidate.body, (node) => {
    if (!Node.isVariableDeclaration(node) || !Node.isIdentifier(node.getNameNode())) {
      return;
    }

    const initializer = unwrapExpression(node.getInitializer());
    if (initializer === undefined || !Node.isObjectLiteralExpression(initializer)) {
      return;
    }

    const properties = collectObjectLiteralEventProps(initializer, handlerBindings);
    if (properties.length === 0) {
      return;
    }

    propObjects.set(node.getNameNode().getText(), {
      name: node.getNameNode().getText(),
      properties,
    });
  });

  return propObjects;
}

function collectObjectLiteralEventProps(
  objectLiteral: ObjectLiteralExpression,
  handlerBindings: ReadonlyMap<string, HandlerBinding>,
): readonly PropObjectProperty[] {
  const eventProps: PropObjectProperty[] = [];

  for (const property of objectLiteral.getProperties()) {
    if (Node.isShorthandPropertyAssignment(property)) {
      const propName = property.getName();
      if (!isEventAttribute(propName)) {
        continue;
      }

      eventProps.push({
        propName,
        propReferences: [propName],
        handlerText:
          handlerBindings.get(propName)?.text ??
          resolveHandlerTextFromSymbol(property.getNameNode()) ??
          propName,
      });
      continue;
    }

    if (Node.isPropertyAssignment(property)) {
      const propName = property.getName();
      if (!isEventAttribute(propName)) {
        continue;
      }

      eventProps.push({
        propName,
        propReferences: collectExpressionReferences(property.getInitializerOrThrow()),
        handlerText: getExpressionHandlerText(property.getInitializerOrThrow(), handlerBindings),
      });
      continue;
    }

    if (Node.isSpreadAssignment(property)) {
      const spread = unwrapExpression(property.getExpression());
      if (spread !== undefined && Node.isObjectLiteralExpression(spread)) {
        eventProps.push(...collectObjectLiteralEventProps(spread, handlerBindings));
      }
    }
  }

  return eventProps;
}

function getFunctionLikeHandlerNode(node: Expression | undefined): MorphNode | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (isFunctionLikeInitializer(node)) {
    return node.getBody();
  }
  if (isHookCall(node, "useCallback")) {
    const callback = unwrapExpression(node.getArguments()[0]);
    return isFunctionLikeInitializer(callback) ? callback.getBody() : undefined;
  }
  return undefined;
}

function getEventHandlerText(
  attribute: JsxAttribute,
  handlerBindings: ReadonlyMap<string, HandlerBinding>,
): string {
  const initializer = attribute.getInitializer();
  if (initializer === undefined) {
    return "";
  }

  if (Node.isJsxExpression(initializer) && initializer.getExpression() !== undefined) {
    return getExpressionHandlerText(initializer.getExpressionOrThrow(), handlerBindings);
  }

  return initializer.getText();
}

function getExpressionHandlerText(
  expression: Expression,
  handlerBindings: ReadonlyMap<string, HandlerBinding>,
): string {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped === undefined) {
    return "";
  }

  if (Node.isIdentifier(unwrapped)) {
    return (
      handlerBindings.get(unwrapped.getText())?.text ??
      resolveHandlerTextFromSymbol(unwrapped) ??
      unwrapped.getText()
    );
  }
  if (Node.isPropertyAccessExpression(unwrapped)) {
    return resolveHandlerTextFromSymbol(unwrapped.getNameNode()) ?? unwrapped.getText();
  }
  if (isFunctionLikeInitializer(unwrapped)) {
    return unwrapped.getBody().getText();
  }
  if (Node.isCallExpression(unwrapped)) {
    return getReturnedFunctionHandlerBodyText(unwrapped) ?? unwrapped.getText();
  }
  return unwrapped.getText();
}

function getEventActionImplementationSource(
  attribute: JsxAttribute,
  projectRoot: string,
): SourceLocation {
  const factorySource = getHandlerFactorySource(attribute, projectRoot);
  return factorySource ?? sourceLocation(attribute.getNameNode(), projectRoot, getJsxAttributeName(attribute));
}

function getHandlerFactorySource(
  attribute: JsxAttribute,
  projectRoot: string,
): SourceLocation | undefined {
  const initializer = attribute.getInitializer();
  if (initializer === undefined || !Node.isJsxExpression(initializer)) {
    return undefined;
  }

  const expression = unwrapExpression(initializer.getExpression());
  if (expression === undefined || !Node.isCallExpression(expression)) {
    return undefined;
  }

  const factoryDeclaration = getHandlerFactoryDeclaration(expression);
  if (factoryDeclaration === undefined) {
    return undefined;
  }

  const factoryName = factoryDeclaration.getName() ?? getCallName(expression.getExpression()) ?? "handlerFactory";
  return sourceLocation(
    factoryDeclaration.getNameNode() ?? factoryDeclaration,
    projectRoot,
    factoryName,
  );
}

function collectHandlerReferences(attribute: JsxAttribute): readonly string[] {
  const initializer = attribute.getInitializer();
  if (initializer === undefined || !Node.isJsxExpression(initializer)) {
    return [];
  }

  const expression = initializer.getExpression();
  return expression === undefined ? [] : collectExpressionReferences(expression);
}

function collectExpressionReferences(expression: Expression): readonly string[] {
  const unwrapped = unwrapExpression(expression);
  if (unwrapped === undefined) {
    return [];
  }
  if (Node.isIdentifier(unwrapped)) {
    return [unwrapped.getText()];
  }
  if (Node.isPropertyAccessExpression(unwrapped)) {
    return [unwrapped.getName()];
  }
  if (isFunctionLikeInitializer(unwrapped)) {
    return collectIdentifierReferences(unwrapped.getBody());
  }
  if (Node.isCallExpression(unwrapped)) {
    return collectIdentifierReferences(unwrapped);
  }
  return [];
}

function collectIdentifierReferences(node: MorphNode): readonly string[] {
  const references: string[] = [];

  node.forEachDescendant((descendant) => {
    if (Node.isIdentifier(descendant)) {
      references.push(descendant.getText());
    }
    if (Node.isPropertyAccessExpression(descendant)) {
      references.push(descendant.getName());
    }
    return undefined;
  });

  return unique(references);
}

function resolveHandlerTextFromSymbol(identifier: MorphNode): string | undefined {
  if (!Node.isIdentifier(identifier)) {
    return undefined;
  }

  for (const definition of identifier.getDefinitions()) {
    const node = definition.getNode();
    const handlerText = getHandlerTextFromDefinitionNode(node);
    if (handlerText !== undefined) {
      return handlerText;
    }
  }

  return undefined;
}

function getHandlerTextFromDefinitionNode(node: MorphNode): string | undefined {
  const direct = getHandlerTextFromDeclaration(node);
  if (direct !== undefined) {
    return direct;
  }

  for (const ancestor of node.getAncestors()) {
    const handlerText = getHandlerTextFromDeclaration(ancestor);
    if (handlerText !== undefined) {
      return handlerText;
    }
  }

  return undefined;
}

function getHandlerTextFromDeclaration(node: MorphNode): string | undefined {
  if (Node.isFunctionDeclaration(node) && node.getBody() !== undefined) {
    return getReturnedFunctionHandlerBodyText(node) ?? node.getBodyOrThrow().getText();
  }

  if (Node.isVariableDeclaration(node)) {
    const initializer = unwrapExpression(node.getInitializer());
    if (initializer !== undefined && isFunctionLikeInitializer(initializer)) {
      const returnedHandlerText = getReturnedFunctionHandlerBodyText(initializer);
      if (returnedHandlerText !== undefined) {
        return returnedHandlerText;
      }
    }
    const handlerBody = getFunctionLikeHandlerNode(initializer);
    return handlerBody?.getText() ?? initializer?.getText();
  }

  return undefined;
}

function getReturnedFunctionHandlerBodyText(
  node: MorphNode,
): string | undefined {
  const returnedFunction = getReturnedFunctionLike(node);
  return returnedFunction?.getBody().getText();
}

function getReturnedFunctionLike(node: MorphNode): FunctionLike | undefined {
  const body = Node.isCallExpression(node)
    ? getHandlerFactoryDeclaration(node)?.getBody()
    : Node.isFunctionDeclaration(node)
      ? node.getBody()
      : isFunctionLikeInitializer(node)
        ? node.getBody()
        : undefined;
  if (body === undefined) {
    return undefined;
  }

  if (!Node.isBlock(body)) {
    const returnedExpression = unwrapExpression(body);
    return isFunctionLikeInitializer(returnedExpression) ? returnedExpression : undefined;
  }

  for (const statement of body.getStatements()) {
    if (!Node.isReturnStatement(statement)) {
      continue;
    }

    const returnedExpression = unwrapExpression(statement.getExpression());
    if (isFunctionLikeInitializer(returnedExpression)) {
      return returnedExpression;
    }
  }

  return undefined;
}

function getHandlerFactoryDeclaration(
  callExpression: CallExpression,
): FunctionDeclaration | undefined {
  const callee = unwrapExpression(callExpression.getExpression());
  if (callee === undefined || !Node.isIdentifier(callee)) {
    return undefined;
  }

  const declaration = callee.getDefinitions()[0]?.getDeclarationNode();
  return Node.isFunctionDeclaration(declaration) &&
    getReturnedFunctionLike(declaration) !== undefined
    ? declaration
    : undefined;
}

function collectUiNodes(
  candidate: ComponentCandidate,
  projectRoot: string,
  componentIdsByName: ReadonlyMap<string, string>,
  stateBindings: readonly StateBinding[],
  actions: readonly ActionNode[],
): readonly UiNode[] {
  const ui: UiNode[] = [];
  const stateIds = stateBindings.map((binding) => binding.state.id);
  const labelsByControlId = collectAssociatedLabels(candidate);

  visitBody(candidate.body, (node) => {
    if (!isJsxOpeningLikeElement(node)) {
      return;
    }

    const tagName = getJsxTagName(node);
    const role = inferUiRole(tagName, node);
    if (role === undefined) {
      return;
    }

    const action = findActionForJsxNode(actions, node, projectRoot);
    const renderedComponentId = componentIdsByName.get(tagName);
    const associatedLabel = getAssociatedLabel(node, labelsByControlId);

    ui.push({
      id: `${candidate.id}-${kebabCase(tagName)}-${ui.length + 1}-ui`,
      label: getUiLabel(node, tagName, role, associatedLabel),
      role,
      componentId: renderedComponentId ?? candidate.id,
      actionId: action?.id,
      stateIds: action?.touchesState.length ? action.touchesState : stateIds,
      source: sourceLocation(node.getTagNameNode(), projectRoot, `<${tagName}>`),
    });
  });

  return ui;
}

function collectAssociatedLabels(candidate: ComponentCandidate): ReadonlyMap<string, AssociatedLabel> {
  const labels = new Map<string, AssociatedLabel>();

  visitBody(candidate.body, (node) => {
    if (!isJsxOpeningLikeElement(node) || getJsxTagName(node) !== "label") {
      return;
    }

    const controlId = getStringAttribute(node, "htmlFor");
    const text = getStaticJsxText(node);
    if (controlId === undefined || controlId.trim() === "" || text === undefined) {
      return;
    }

    labels.set(controlId.trim(), { text });
  });

  return labels;
}

function getAssociatedLabel(
  node: JsxOpeningLikeElement,
  labelsByControlId: ReadonlyMap<string, AssociatedLabel>,
): AssociatedLabel | undefined {
  const controlId = getStringAttribute(node, "id");
  return controlId === undefined ? undefined : labelsByControlId.get(controlId.trim());
}

function findActionForJsxNode(
  actions: readonly ActionNode[],
  node: JsxOpeningLikeElement,
  projectRoot: string,
): ActionNode | undefined {
  const eventAttributeNames = node
    .getAttributes()
    .filter(Node.isJsxAttribute)
    .map(getJsxAttributeName)
    .filter(isEventAttribute);

  const location = sourceLocation(node.getTagNameNode(), projectRoot, getJsxTagName(node));
  const endLine = node.getEndLineNumber();
  return actions.find(
    (action) =>
      (eventAttributeNames.includes(action.source.symbol) ||
        action.source.symbol === "register" ||
        action.source.symbol === "routerAction" ||
        action.source.symbol === "serverAction") &&
      action.source.file === location.file &&
      action.source.line >= location.line &&
      action.source.line <= endLine,
  );
}

function collectComponentRenderEdges(
  candidate: ComponentCandidate,
  projectRoot: string,
  componentIdsByName: ReadonlyMap<string, string>,
  componentRuntimeById: ReadonlyMap<string, ComponentNode["runtime"]>,
): readonly ComponentRenderEdgeNode[] {
  const edges: ComponentRenderEdgeNode[] = [];
  const seen = new Set<string>();
  const ownerRuntime = componentRuntimeById.get(candidate.id) ?? "unknown";

  visitBody(candidate.body, (node) => {
    if (!isJsxOpeningLikeElement(node)) {
      return;
    }

    const tagName = getJsxTagName(node);
    const childComponentId = componentIdsByName.get(tagName);
    if (childComponentId === undefined || childComponentId === candidate.id) {
      return;
    }

    const edgeKey = `${candidate.id}->${childComponentId}`;
    if (seen.has(edgeKey)) {
      return;
    }
    seen.add(edgeKey);

    const childRuntime = componentRuntimeById.get(childComponentId) ?? "unknown";
    const kind =
      ownerRuntime === "server" && childRuntime === "client"
        ? "server-to-client-boundary"
        : "render";
    const serializationRisks =
      kind === "server-to-client-boundary"
        ? collectComponentPropSerializationRisks(candidate, node, projectRoot)
        : [];
    const suspenseBoundary = getNearestSuspenseBoundary(node, projectRoot);
    edges.push({
      id: `${candidate.id}-renders-${childComponentId}`,
      ownerComponentId: candidate.id,
      childComponentId,
      kind,
      suspenseBoundary,
      serializationRisks,
      source: sourceLocation(node.getTagNameNode(), projectRoot, tagName),
      note:
        kind === "server-to-client-boundary"
          ? `${candidate.name} is a Server Component that renders client island ${tagName}; client interactivity is owned beyond this boundary.${suspenseBoundary === undefined ? "" : " This render is gated by a Suspense fallback."}${serializationRisks.length === 0 ? "" : ` ${serializationRisks.length} prop serialization risk(s) detected.`}`
          : `${candidate.name} renders ${tagName}.`,
    });
  });

  return edges;
}

function collectDesignSystemUsages(
  candidate: ComponentCandidate,
  projectRoot: string,
  componentIdsByName: ReadonlyMap<string, string>,
  componentRoleById: ReadonlyMap<string, ComponentNode["role"]>,
): readonly DesignSystemUsageNode[] {
  const usages: DesignSystemUsageNode[] = [];
  const usageCountsByComponent = new Map<string, number>();

  visitBody(candidate.body, (node) => {
    if (!isJsxOpeningLikeElement(node)) {
      return;
    }

    const tagName = getJsxTagName(node);
    const componentId = componentIdsByName.get(tagName);
    if (
      componentId === undefined ||
      componentRoleById.get(componentId) !== "design-system"
    ) {
      return;
    }

    const nextCount = (usageCountsByComponent.get(componentId) ?? 0) + 1;
    usageCountsByComponent.set(componentId, nextCount);

    usages.push({
      id: `${candidate.id}-uses-${componentId}-${nextCount}`,
      ownerComponentId: candidate.id,
      componentId,
      componentName: tagName,
      props: getJsxPropNames(node),
      source: sourceLocation(node.getTagNameNode(), projectRoot, tagName),
      note: `${candidate.name} renders design-system component ${tagName}.`,
    });
  });

  return usages;
}

function collectPropNodes(
  candidate: ComponentCandidate,
  projectRoot: string,
  componentIdsByName: ReadonlyMap<string, string>,
  propObjectBindings: ReadonlyMap<string, PropObjectBinding>,
): readonly PropNode[] {
  const props: PropNode[] = [];
  const propCountsByBoundary = new Map<string, number>();

  visitBody(candidate.body, (node) => {
    if (!isJsxOpeningLikeElement(node)) {
      return;
    }

    const tagName = getJsxTagName(node);
    const targetComponentId = componentIdsByName.get(tagName);
    if (targetComponentId === undefined || targetComponentId === candidate.id) {
      return;
    }

    for (const attribute of node.getAttributes()) {
      if (Node.isJsxAttribute(attribute)) {
        props.push(
          propNodeFromAttribute({
            attribute,
            candidate,
            projectRoot,
            propCountsByBoundary,
            tagName,
            targetComponentId,
          }),
        );
        continue;
      }

      if (Node.isJsxSpreadAttribute(attribute)) {
        props.push(
          ...propNodesFromSpreadAttribute({
            attribute,
            candidate,
            projectRoot,
            propCountsByBoundary,
            propObjectBindings,
            tagName,
            targetComponentId,
          }),
        );
      }
    }
  });

  return props;
}

function propNodeFromAttribute(input: {
  readonly attribute: JsxAttribute;
  readonly candidate: ComponentCandidate;
  readonly projectRoot: string;
  readonly propCountsByBoundary: Map<string, number>;
  readonly tagName: string;
  readonly targetComponentId: string;
}): PropNode {
  const propName = getJsxAttributeName(input.attribute);
  const value = getJsxAttributeValueText(input.attribute);
  return {
    id: nextPropNodeId(input, propName),
    ownerComponentId: input.candidate.id,
    targetComponentId: input.targetComponentId,
    propName,
    kind: isEventAttribute(propName) ? "event-handler" : "value",
    value,
    references: getJsxAttributeReferences(input.attribute),
    source: sourceLocation(input.attribute.getNameNode(), input.projectRoot, propName),
    note: `${input.candidate.name} passes ${propName} to ${input.tagName}.`,
  };
}

function propNodesFromSpreadAttribute(input: {
  readonly attribute: MorphNode;
  readonly candidate: ComponentCandidate;
  readonly projectRoot: string;
  readonly propCountsByBoundary: Map<string, number>;
  readonly propObjectBindings: ReadonlyMap<string, PropObjectBinding>;
  readonly tagName: string;
  readonly targetComponentId: string;
}): readonly PropNode[] {
  if (!Node.isJsxSpreadAttribute(input.attribute)) {
    return [];
  }

  const expression = unwrapExpression(input.attribute.getExpression());
  const spreadName = expression?.getText() ?? "{...spread}";
  const knownProps =
    expression !== undefined && Node.isIdentifier(expression)
      ? input.propObjectBindings.get(expression.getText())?.properties
      : undefined;

  if (knownProps !== undefined && knownProps.length > 0) {
    return knownProps.map((property) => ({
      id: nextPropNodeId(input, property.propName),
      ownerComponentId: input.candidate.id,
      targetComponentId: input.targetComponentId,
      propName: property.propName,
      kind: isEventAttribute(property.propName) ? "event-handler" : "value",
      value: property.handlerText,
      references: property.propReferences,
      viaSpread: spreadName,
      source: sourceLocation(input.attribute, input.projectRoot, property.propName),
      note: `${input.candidate.name} passes ${property.propName} to ${input.tagName} through ${spreadName}.`,
    }));
  }

  return [
    {
      id: nextPropNodeId(input, "{...spread}"),
      ownerComponentId: input.candidate.id,
      targetComponentId: input.targetComponentId,
      propName: "{...spread}",
      kind: "spread",
      value: spreadName,
      references:
        expression === undefined ? [] : collectExpressionReferences(expression),
      viaSpread: spreadName,
      source: sourceLocation(input.attribute, input.projectRoot, "{...spread}"),
      note: `${input.candidate.name} passes unresolved spread props to ${input.tagName}.`,
    },
  ];
}

function nextPropNodeId(input: {
  readonly candidate: ComponentCandidate;
  readonly propCountsByBoundary: Map<string, number>;
  readonly targetComponentId: string;
}, propName: string): string {
  const key = `${input.candidate.id}->${input.targetComponentId}:${propName}`;
  const nextCount = (input.propCountsByBoundary.get(key) ?? 0) + 1;
  input.propCountsByBoundary.set(key, nextCount);
  return `${input.candidate.id}-passes-${input.targetComponentId}-${kebabCase(propName)}-${nextCount}-prop`;
}

function getJsxAttributeValueText(attribute: JsxAttribute): string {
  const initializer = attribute.getInitializer();
  if (initializer === undefined) {
    return "true";
  }

  if (!Node.isJsxExpression(initializer)) {
    return initializer.getText().replace(/^["']|["']$/g, "");
  }

  const expression = unwrapExpression(initializer.getExpression());
  return expression?.getText() ?? "<empty>";
}

function getJsxAttributeReferences(attribute: JsxAttribute): readonly string[] {
  const initializer = attribute.getInitializer();
  if (initializer === undefined || !Node.isJsxExpression(initializer)) {
    return [];
  }

  const expression = initializer.getExpression();
  return expression === undefined ? [] : collectExpressionReferences(expression);
}

function getJsxPropNames(node: JsxOpeningLikeElement): readonly string[] {
  return node.getAttributes().map((attribute) => {
    if (Node.isJsxAttribute(attribute)) {
      return getJsxAttributeName(attribute);
    }
    return "{...spread}";
  });
}

function getNearestSuspenseBoundary(
  node: JsxOpeningLikeElement,
  projectRoot: string,
): ComponentSuspenseBoundary | undefined {
  for (const ancestor of node.getAncestors()) {
    if (!Node.isJsxElement(ancestor)) {
      continue;
    }

    const openingElement = ancestor.getOpeningElement();
    if (getJsxTagName(openingElement) !== "Suspense") {
      continue;
    }

    return {
      kind: "manual",
      fallback: getSuspenseFallbackLabel(openingElement),
      source: sourceLocation(openingElement.getTagNameNode(), projectRoot, "Suspense"),
      note:
        "Manual React Suspense boundary controls streaming/fallback for this rendered subtree.",
    };
  }

  return undefined;
}

function getSuspenseFallbackLabel(node: JsxOpeningElement): string {
  const fallbackAttribute = node
    .getAttributes()
    .filter(Node.isJsxAttribute)
    .find((attribute) => getJsxAttributeName(attribute) === "fallback");
  if (fallbackAttribute === undefined) {
    return "<none>";
  }

  const initializer = fallbackAttribute.getInitializer();
  if (initializer === undefined) {
    return "<implicit>";
  }

  if (!Node.isJsxExpression(initializer)) {
    return initializer.getText();
  }

  const expression = unwrapExpression(initializer.getExpression());
  if (expression === undefined) {
    return "<empty>";
  }

  if (Node.isJsxElement(expression)) {
    const openingElement = expression.getOpeningElement();
    return getStaticJsxText(openingElement) ?? getUiLabel(openingElement, getJsxTagName(openingElement), "status");
  }

  if (Node.isJsxSelfClosingElement(expression)) {
    return getUiLabel(expression, getJsxTagName(expression), "status");
  }

  return expression.getText();
}

function collectComponentPropSerializationRisks(
  candidate: ComponentCandidate,
  node: JsxOpeningLikeElement,
  projectRoot: string,
): readonly ComponentPropSerializationRisk[] {
  return node.getAttributes().flatMap((attribute) => {
    if (!Node.isJsxAttribute(attribute)) {
      return [];
    }

    const propName = getJsxAttributeName(attribute);
    if (propName === "children") {
      return [];
    }

    const initializer = attribute.getInitializer();
    if (initializer === undefined || !Node.isJsxExpression(initializer)) {
      return [];
    }

    const expression = unwrapExpression(initializer.getExpression());
    if (expression === undefined) {
      return [];
    }

    const riskKind = getPropSerializationRiskKind(expression, candidate);
    if (riskKind === undefined) {
      return [];
    }

    return [
      {
        propName,
        kind: riskKind,
        source: sourceLocation(attribute.getNameNode(), projectRoot, propName),
        note: getPropSerializationRiskNote(propName, riskKind),
      },
    ];
  });
}

function getPropSerializationRiskKind(
  expression: Expression,
  candidate: ComponentCandidate,
  seen = new Set<MorphNode>(),
): ComponentPropSerializationRisk["kind"] | undefined {
  if (seen.has(expression)) {
    return undefined;
  }
  seen.add(expression);

  if (isServerActionReference(expression, candidate)) {
    return undefined;
  }
  if (isFunctionLikeInitializer(expression)) {
    return "function";
  }
  if (Node.isIdentifier(expression)) {
    if (resolvesToFunctionLikeDeclaration(expression)) {
      return "function";
    }
    const initializer = getIdentifierValueInitializer(expression);
    return initializer === undefined
      ? undefined
      : getPropSerializationRiskKind(initializer, candidate, seen);
  }
  if (Node.isNewExpression(expression)) {
    return "class-instance";
  }
  if (Node.isArrayLiteralExpression(expression)) {
    for (const element of expression.getElements()) {
      const elementRiskKind = getPropSerializationRiskKind(
        unwrapExpression(element) ?? element,
        candidate,
        seen,
      );
      const objectRiskKind = toNestedObjectRiskKind(elementRiskKind);
      if (objectRiskKind !== undefined) {
        return objectRiskKind;
      }
    }
    return undefined;
  }
  if (Node.isObjectLiteralExpression(expression)) {
    for (const property of expression.getProperties()) {
      if (Node.isMethodDeclaration(property) || Node.isGetAccessorDeclaration(property)) {
        return "object-with-function";
      }

      const propertyExpression = getObjectPropertySerializationExpression(property);
      if (propertyExpression === undefined) {
        return "object-with-unknown-expression";
      }

      const propertyRiskKind = getPropSerializationRiskKind(
        propertyExpression,
        candidate,
        seen,
      );
      const objectRiskKind = toNestedObjectRiskKind(propertyRiskKind);
      if (objectRiskKind !== undefined) {
        return objectRiskKind;
      }
    }
    return undefined;
  }
  if (
    Node.isCallExpression(expression) ||
    Node.isPropertyAccessExpression(expression) ||
    Node.isElementAccessExpression(expression)
  ) {
    return "unknown-expression";
  }
  return undefined;
}

function getPropSerializationRiskNote(
  propName: string,
  kind: ComponentPropSerializationRisk["kind"],
): string {
  switch (kind) {
    case "function":
      return `Prop "${propName}" passes a regular function across a Server Component -> Client Component boundary. Use a Server Action for mutations or move the function behind the client boundary.`;
    case "class-instance":
      return `Prop "${propName}" passes a class instance across a Server Component -> Client Component boundary. Pass plain serializable data instead.`;
    case "object-with-function":
      return `Prop "${propName}" contains a nested function crossing a Server Component -> Client Component boundary. Keep behavior in a Client Component or pass a Server Action explicitly.`;
    case "object-with-class-instance":
      return `Prop "${propName}" contains a nested class instance crossing a Server Component -> Client Component boundary. Pass plain serializable data instead.`;
    case "object-with-unknown-expression":
      return `Prop "${propName}" contains a nested expression that Yomi cannot prove serializable across a Server Component -> Client Component boundary.`;
    case "unknown-expression":
      return `Prop "${propName}" crosses a Server Component -> Client Component boundary through an expression that Yomi cannot prove serializable.`;
  }
}

function isServerActionReference(
  expression: Expression,
  candidate: ComponentCandidate,
): boolean {
  if (Node.isIdentifier(expression)) {
    return resolveServerActionDeclaration(candidate, expression.getText()) !== undefined;
  }

  if (!Node.isCallExpression(expression)) {
    return false;
  }

  const callExpression = unwrapExpression(expression.getExpression());
  if (!Node.isPropertyAccessExpression(callExpression) || callExpression.getName() !== "bind") {
    return false;
  }

  const boundTarget = unwrapExpression(callExpression.getExpression());
  return (
    boundTarget !== undefined &&
    Node.isIdentifier(boundTarget) &&
    resolveServerActionDeclaration(candidate, boundTarget.getText()) !== undefined
  );
}

function getIdentifierValueInitializer(identifier: MorphNode): Expression | undefined {
  if (!Node.isIdentifier(identifier)) {
    return undefined;
  }

  const declaration = identifier.getDefinitions()[0]?.getDeclarationNode();
  if (!Node.isVariableDeclaration(declaration)) {
    return undefined;
  }

  return unwrapExpression(declaration.getInitializer());
}

function getObjectPropertySerializationExpression(
  property: MorphNode,
): Expression | undefined {
  if (Node.isPropertyAssignment(property)) {
    return unwrapExpression(property.getInitializer());
  }

  if (Node.isShorthandPropertyAssignment(property)) {
    return property.getNameNode();
  }

  if (Node.isSpreadAssignment(property)) {
    return unwrapExpression(property.getExpression());
  }

  return undefined;
}

function toNestedObjectRiskKind(
  kind: ComponentPropSerializationRisk["kind"] | undefined,
): ComponentPropSerializationRisk["kind"] | undefined {
  switch (kind) {
    case "function":
    case "object-with-function":
      return "object-with-function";
    case "class-instance":
    case "object-with-class-instance":
      return "object-with-class-instance";
    case "unknown-expression":
    case "object-with-unknown-expression":
      return "object-with-unknown-expression";
    case undefined:
      return undefined;
  }
}

function resolvesToFunctionLikeDeclaration(identifier: MorphNode): boolean {
  if (!Node.isIdentifier(identifier)) {
    return false;
  }

  for (const definition of identifier.getDefinitions()) {
    const declaration = definition.getDeclarationNode();
    if (
      Node.isFunctionDeclaration(declaration) ||
      Node.isFunctionExpression(declaration) ||
      Node.isArrowFunction(declaration)
    ) {
      return true;
    }

    if (Node.isVariableDeclaration(declaration)) {
      const initializer = unwrapExpression(declaration.getInitializer());
      if (initializer !== undefined && isFunctionLikeInitializer(initializer)) {
        return true;
      }
    }
  }

  return false;
}

function getComponentRole(
  candidate: ComponentCandidate,
  projectRoot: string,
): ComponentNode["role"] {
  const file = normalizePath(relative(projectRoot, candidate.sourceFile.getFilePath()));
  if (getNextRouteSegment(candidate, projectRoot) !== undefined) {
    return "route";
  }
  if (routeNamePattern.test(candidate.name) || routePathPattern.test(file)) {
    return "route";
  }
  if (designSystemPathPattern.test(file)) {
    return "design-system";
  }
  return "component";
}

function getComponentRuntime(
  candidate: ComponentCandidate,
  projectRoot: string,
  clientRuntimeFiles: ReadonlySet<string>,
): ComponentNode["runtime"] {
  if (hasDirective(candidate.sourceFile, "use server")) {
    return "server";
  }
  if (
    hasDirective(candidate.sourceFile, "use client") ||
    clientRuntimeFiles.has(normalizePath(candidate.sourceFile.getFilePath()))
  ) {
    return "client";
  }

  const file = normalizePath(relative(projectRoot, candidate.sourceFile.getFilePath()));
  if (getNextRouteSegment(candidate, projectRoot) !== undefined || file.split("/").includes("app")) {
    return "server";
  }

  return "unknown";
}

function hasDirective(sourceFile: SourceFile, directive: "use client" | "use server"): boolean {
  for (const statement of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(statement)) {
      return false;
    }

    const expression = statement.getExpression();
    if (!Node.isStringLiteral(expression)) {
      return false;
    }

    if (expression.getLiteralText() === directive) {
      return true;
    }
  }

  return false;
}

function getNextRouteSegment(
  candidate: ComponentCandidate,
  projectRoot: string,
): RouteSegmentNode | undefined {
  const file = normalizePath(relative(projectRoot, candidate.sourceFile.getFilePath()));
  const parts = file.split("/");
  const appIndex = parts.indexOf("app");
  if (appIndex === -1) {
    return undefined;
  }

  const fileName = parts.at(-1);
  const kind = getNextRouteSegmentKind(fileName);
  if (kind === undefined) {
    return undefined;
  }

  const routeParts = parts
    .slice(appIndex + 1, -1)
    .filter((part) => part !== "" && !/^\(.+\)$/.test(part));
  return {
    kind,
    path: routeParts.length === 0 ? "/" : `/${routeParts.join("/")}`,
  };
}

function getNextRouteSegmentKind(fileName: string | undefined): RouteSegmentNode["kind"] | undefined {
  switch (fileName) {
    case "error.tsx":
    case "error.jsx":
      return "error";
    case "layout.tsx":
    case "layout.jsx":
      return "layout";
    case "loading.tsx":
    case "loading.jsx":
      return "loading";
    case "not-found.tsx":
    case "not-found.jsx":
      return "not-found";
    case "page.tsx":
    case "page.jsx":
      return "page";
    case "template.tsx":
    case "template.jsx":
      return "template";
    default:
      return undefined;
  }
}

function inferStateKind(node: VariableDeclaration): StateNode["kind"] {
  const initializerText = node.getInitializer()?.getText() ?? "";
  return networkPattern.test(initializerText) ? "remote" : "local";
}

function inferUiRole(
  tagName: string,
  node: JsxOpeningLikeElement,
): UiNode["role"] | undefined {
  const explicitRole = getStringAttribute(node, "role");
  if (explicitRole === "status" || explicitRole === "dialog") {
    return explicitRole;
  }

  const normalized = tagName.toLowerCase();
  if (normalized === "button") {
    return "button";
  }
  if (normalized === "input" || normalized === "textarea" || normalized === "select") {
    return "input";
  }
  if (normalized === "form") {
    return "form";
  }
  if (normalized === "dialog") {
    return "dialog";
  }
  if (/button|input|select|search|field/i.test(tagName)) {
    return /input|select|search|field/i.test(tagName) ? "input" : "button";
  }
  if (/status|alert|toast|message/i.test(tagName)) {
    return "status";
  }
  if (/panel|card|section|list|table|view|page/i.test(tagName)) {
    return "panel";
  }
  return undefined;
}

function getUiLabel(
  node: JsxOpeningLikeElement,
  fallback: string,
  role: UiNode["role"],
  associatedLabel?: AssociatedLabel,
): string {
  for (const attributeName of uiTextAttributes) {
    const value = getStringAttribute(node, attributeName);
    if (value !== undefined && value.trim() !== "") {
      return value.trim();
    }
  }

  if (associatedLabel !== undefined && associatedLabel.text.trim() !== "") {
    return associatedLabel.text.trim();
  }

  const text = role === "button" ? getStaticJsxText(node) : undefined;
  if (text !== undefined) {
    return text;
  }

  return splitWords(fallback) || node.getText().slice(0, 48);
}

function getStaticJsxText(node: JsxOpeningLikeElement): string | undefined {
  const parent = node.getParent();
  if (!Node.isJsxElement(parent)) {
    return undefined;
  }
  if (parent.getOpeningElement() !== node) {
    return undefined;
  }

  const text = parent
    .getJsxChildren()
    .flatMap((child) => {
      if (Node.isJsxText(child)) {
        return [child.getText()];
      }
      if (Node.isJsxElement(child)) {
        return [getStaticJsxText(child.getOpeningElement()) ?? ""];
      }
      return [];
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return text === "" ? undefined : text;
}

function getStringAttribute(
  node: JsxOpeningLikeElement,
  attributeName: string,
): string | undefined {
  const attribute = node.getAttribute(attributeName);
  if (attribute === undefined || !Node.isJsxAttribute(attribute)) {
    return undefined;
  }

  const initializer = attribute.getInitializer();
  if (initializer === undefined) {
    return undefined;
  }
  if (Node.isStringLiteral(initializer)) {
    return initializer.getLiteralText();
  }
  if (Node.isJsxExpression(initializer)) {
    const expression = initializer.getExpression();
    return expression !== undefined && Node.isStringLiteral(expression)
      ? expression.getLiteralText()
      : undefined;
  }
  return undefined;
}

function getJsxExpressionIdentifier(
  node: JsxOpeningLikeElement,
  attributeName: string,
): string | undefined {
  const attribute = node.getAttribute(attributeName);
  if (attribute === undefined || !Node.isJsxAttribute(attribute)) {
    return undefined;
  }

  const initializer = attribute.getInitializer();
  if (initializer === undefined || !Node.isJsxExpression(initializer)) {
    return undefined;
  }

  const expression = unwrapExpression(initializer.getExpression());
  return expression !== undefined && Node.isIdentifier(expression)
    ? expression.getText()
    : undefined;
}

function collectDependencies(node: MorphNode | undefined): readonly string[] {
  if (node === undefined || !Node.isArrayLiteralExpression(node)) {
    return [];
  }

  return node
    .getElements()
    .map((element) => normalizeDependency(element.getText()))
    .filter(Boolean);
}

function normalizeDependency(raw: string): string {
  return raw
    .replace(/^props\./, "")
    .replace(/^state\./, "")
    .replace(/\?.*$/, "")
    .replace(/\[.*$/, "")
    .trim();
}

function isHookCall(node: MorphNode | undefined, hookName: string): node is CallExpression {
  return Node.isCallExpression(node) && getCallName(node.getExpression()) === hookName;
}

function isStateOwnerHook(node: MorphNode | undefined): node is CallExpression {
  return (
    isHookCall(node, "useState") ||
    isHookCall(node, "useReducer") ||
    isHookCall(node, "useSearchParams")
  );
}

function getStateOwnerHookName(node: CallExpression): StateBinding["hookName"] {
  const callName = getCallName(node.getExpression());
  if (callName === "useReducer" || callName === "useSearchParams") {
    return callName;
  }
  return "useState";
}

function getStateOwnerHookSource(input: {
  readonly body: MorphNode | undefined;
  readonly call: CallExpression;
  readonly hookName: StateBinding["hookName"];
  readonly projectRoot: string;
  readonly setterName: string | undefined;
}): SourceLocation | undefined {
  if (input.hookName === "useReducer") {
    return getReducerSourceLocation(input.call.getArguments()[0], input.projectRoot);
  }
  if (input.hookName === "useSearchParams") {
    const setterName = input.setterName;
    if (setterName === undefined) {
      return sourceLocation(input.call.getExpression(), input.projectRoot, "useSearchParams");
    }

    const setterCall = findCallExpressionByName(input.body, setterName);
    return setterCall === undefined
      ? sourceLocation(input.call.getExpression(), input.projectRoot, "useSearchParams")
      : sourceLocation(setterCall.getExpression(), input.projectRoot, setterName);
  }
  return undefined;
}

function getReducerSourceLocation(
  node: MorphNode | undefined,
  projectRoot: string,
): SourceLocation | undefined {
  const unwrapped = unwrapExpression(node);
  if (unwrapped === undefined || !Node.isIdentifier(unwrapped)) {
    return undefined;
  }

  for (const definition of unwrapped.getDefinitions()) {
    const source = sourceLocationFromDefinitionNode(
      definition.getNode(),
      projectRoot,
      unwrapped.getText(),
    );
    if (source !== undefined) {
      return source;
    }
  }

  return undefined;
}

function sourceLocationFromDefinitionNode(
  node: MorphNode,
  projectRoot: string,
  fallbackSymbol: string,
): SourceLocation | undefined {
  if (Node.isFunctionDeclaration(node)) {
    return sourceLocation(node.getNameNode() ?? node, projectRoot, node.getName() ?? fallbackSymbol);
  }

  if (Node.isIdentifier(node)) {
    const functionDeclaration = node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
    if (functionDeclaration?.getNameNode() === node) {
      return sourceLocation(node, projectRoot, functionDeclaration.getName() ?? fallbackSymbol);
    }

    const variableDeclaration = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (variableDeclaration !== undefined && variableDeclaration.getNameNode() === node) {
      return sourceLocation(node, projectRoot, node.getText());
    }
  }

  return undefined;
}

function getCallName(expression: Expression): string | undefined {
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }
  return undefined;
}

function isFunctionLikeInitializer(node: MorphNode | undefined): node is FunctionLike {
  return Node.isArrowFunction(node) || Node.isFunctionExpression(node);
}

function unwrapExpression(node: MorphNode | undefined): Expression | undefined {
  if (node === undefined || !Node.isExpression(node)) {
    return undefined;
  }

  let current: Expression = node;
  while (
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current) ||
    current.getKind() === SyntaxKind.SatisfiesExpression
  ) {
    const expression = getExpressionFromWrapper(current);
    if (expression === undefined) {
      return current;
    }
    current = expression;
  }

  return current;
}

function getExpressionFromWrapper(node: Expression): Expression | undefined {
  if (Node.isParenthesizedExpression(node) || Node.isAsExpression(node)) {
    return node.getExpression();
  }
  const maybeExpression = node.getFirstChildByKind(SyntaxKind.Identifier)
    ?? node.getFirstChildIfKind(SyntaxKind.ObjectLiteralExpression)
    ?? node.getFirstChildIfKind(SyntaxKind.ArrowFunction)
    ?? node.getFirstChildIfKind(SyntaxKind.FunctionExpression)
    ?? node.getFirstChildIfKind(SyntaxKind.CallExpression)
    ?? node.getFirstChildIfKind(SyntaxKind.PropertyAccessExpression);
  return maybeExpression !== undefined && Node.isExpression(maybeExpression)
    ? maybeExpression
    : undefined;
}

function containsJsx(node: MorphNode): boolean {
  return (
    Node.isJsxElement(node) ||
    Node.isJsxFragment(node) ||
    Node.isJsxSelfClosingElement(node) ||
    node
      .getDescendants()
      .some(
        (descendant) =>
          Node.isJsxElement(descendant) ||
          Node.isJsxFragment(descendant) ||
          Node.isJsxSelfClosingElement(descendant),
      )
  );
}

function visitBody(
  body: MorphNode | undefined,
  visitor: (node: MorphNode) => void,
): void {
  if (body === undefined) {
    return;
  }

  visitor(body);
  body.forEachDescendant((node) => {
    visitor(node);
    return undefined;
  });
}

function isJsxOpeningLikeElement(
  node: MorphNode,
): node is JsxOpeningElement | JsxSelfClosingElement {
  return Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node);
}

function getJsxTagName(node: JsxOpeningLikeElement): string {
  const tagNameNode = node.getTagNameNode();
  if (Node.isIdentifier(tagNameNode)) {
    return tagNameNode.getText();
  }
  if (Node.isPropertyAccessExpression(tagNameNode)) {
    return tagNameNode.getName();
  }
  return tagNameNode.getText();
}

function getJsxTagText(node: JsxOpeningLikeElement): string {
  return node.getTagNameNode().getText();
}

function getJsxAttributeName(attribute: JsxAttribute): string {
  return attribute.getNameNode().getText();
}

function isEventAttribute(name: string): boolean {
  return /^on[A-Z]/.test(name);
}

function eventNameToVerb(name: string): string {
  switch (name) {
    case "onChange":
      return "change";
    case "onClick":
      return "click";
    case "onSubmit":
      return "submit";
    case "onInput":
      return "input";
    default:
      return splitWords(name.replace(/^on/, "")).toLowerCase() || name;
  }
}

function getTouchedStates(
  handlerText: string,
  stateBindings: readonly StateBinding[],
): readonly StateNode[] {
  return stateBindings
    .filter(
      (binding) =>
        binding.setterName !== undefined && containsIdentifier(handlerText, binding.setterName),
    )
    .map((binding) => binding.state);
}

function getTriggeredHooks(
  touchedStates: readonly StateNode[],
  hooks: readonly HookNode[],
): readonly HookNode[] {
  const touchedStateNames = new Set(touchedStates.map((state) => state.name));
  return hooks.filter(
    (hook) =>
      (hook.kind === "effect" || hook.kind === "custom" || hook.name === "useReducer" || hook.name === "useForm") &&
      hook.dependencies.some((dependency) => touchedStateNames.has(dependency)),
  );
}

function withActionSpecificHookSources(input: {
  readonly body: MorphNode | undefined;
  readonly handlerText: string;
  readonly hooks: readonly HookNode[];
  readonly projectRoot: string;
  readonly stateBindings: readonly StateBinding[];
}): readonly HookNode[] {
  return input.hooks.map((hook) => {
    if (hook.name !== "useSearchParams") {
      return hook;
    }

    const binding = input.stateBindings.find(
      (stateBinding) =>
        stateBinding.hookName === "useSearchParams" &&
        stateBinding.setterName !== undefined &&
        containsIdentifier(input.handlerText, stateBinding.setterName),
    );
    if (binding?.setterName === undefined) {
      return hook;
    }

    const setterCall = findCallExpressionByName(input.body, binding.setterName);
    return setterCall === undefined
      ? hook
      : {
          ...hook,
          source: sourceLocation(setterCall.getExpression(), input.projectRoot, binding.setterName),
        };
  });
}

function findCallExpressionByName(
  body: MorphNode | undefined,
  callName: string,
): CallExpression | undefined {
  let match: CallExpression | undefined;
  visitBody(body, (node) => {
    if (match !== undefined || !Node.isCallExpression(node)) {
      return;
    }
    if (getCallName(node.getExpression()) === callName) {
      match = node;
    }
  });
  return match;
}

function hasAnySetter(text: string, setterNames: ReadonlySet<string>): boolean {
  if (setterNames.size === 0) {
    return setterPattern.test(text);
  }
  return [...setterNames].some((setterName) => containsIdentifier(text, setterName));
}

function containsIdentifier(text: string, identifier: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9_$])${escapeRegExp(identifier)}([^A-Za-z0-9_$]|$)`).test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceLocation(
  node: MorphNode,
  projectRoot: string,
  symbol: string,
): SourceLocation {
  return {
    file: normalizePath(relative(projectRoot, node.getSourceFile().getFilePath())),
    line: node.getStartLineNumber(),
    symbol,
  };
}

function isComponentName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

function kebabCase(value: string): string {
  return (
    value
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "node"
  );
}

function splitWords(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim();
}

function allocateId(baseId: string, allocatedIds: Set<string>): string {
  let id = baseId;
  let suffix = 2;
  while (allocatedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  allocatedIds.add(id);
  return id;
}

function dedupeBy<T>(items: readonly T[], getKey: (item: T) => string): readonly T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function unique<T>(items: readonly T[]): readonly T[] {
  return [...new Set(items)];
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}
