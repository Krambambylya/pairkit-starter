/** @type {import('dependency-cruiser').IConfiguration} */
// Cross-feature imports are not forbidden here. features/items → features/user
// (WorkspaceRepository in item-sync.service.ts and items.routes.ts) is an allowed
// exception, not a refactor target.
module.exports = {
  forbidden: [
    {
      name: 'web-not-mobile-or-backend',
      severity: 'error',
      comment: 'web does not import mobile or backend',
      from: { path: '^web/' },
      to: { path: '^(mobile|backend)/' },
    },
    {
      name: 'mobile-not-web-or-backend',
      severity: 'error',
      comment: 'mobile does not import web or backend',
      from: { path: '^mobile/' },
      to: { path: '^(web|backend)/' },
    },
    {
      name: 'backend-not-web-or-mobile',
      severity: 'error',
      comment: 'backend does not import web or mobile',
      from: { path: '^backend/' },
      to: { path: '^(web|mobile)/' },
    },
    {
      name: 'core-not-apps',
      severity: 'error',
      comment: 'core-modules does not import backend, web, or mobile',
      from: { path: '^core-modules/' },
      to: { path: '^(backend|web|mobile)/' },
    },
    {
      name: 'core-public-entry-only',
      severity: 'error',
      comment: 'backend, web, and mobile import @pairkit/core only through ., ./api, and ./client',
      from: { path: '^(backend|web|mobile)/' },
      to: {
        path: '^core-modules/',
        pathNot:
          '^core-modules/(src|dist)/(index\\.(ts|js)|api/index\\.(ts|js)|client/index\\.(ts|js))$',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: '(^|/)(node_modules|dist|\\.next|coverage|generated)/',
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
