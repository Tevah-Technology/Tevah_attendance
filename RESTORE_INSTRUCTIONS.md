# Tevah backend — restored local ZKTeco dependency

The uploaded archive contained vendor/node-zklib with complete implementation but the previously extracted Mac directory had only README.md. This archive includes the full vendor package, including package.json and zklib.js. Original source files are otherwise unchanged.

## Safe installation

1. Back up the existing project and database. Keep your existing `.env` separately.
2. Extract this archive to a **new** folder; do not merge it into an incomplete folder.
3. Verify `vendor/node-zklib/package.json` and `vendor/node-zklib/zklib.js` exist.
4. Copy your private `.env` into the new folder. For testing, use a separate MongoDB database.
5. Run `npm install`, then `node -p "require.resolve('node-zklib')"`, `npm run check`, and `npm run dev`.

Original dependencies specify `node-zklib: file:vendor/node-zklib`; do not replace the customized package with the published npm package.

The package excludes `.env`, `.env.local`, `node_modules`, and `.git`. No live device/database checks were performed.
