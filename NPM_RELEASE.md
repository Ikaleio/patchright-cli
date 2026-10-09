# npm releases

The public npm package is `prcli`. A successful `CI` run on `main` triggers `.github/workflows/release.yml`. Pull-request CI runs do not publish. The release uses the exact commit checked by CI.

## Version and package contents

Each release adds the workflow run number to the source patch version. For example, source version `0.38.1` and release run `4` produce `0.38.5`. npm and Rust use the same generated version. Source files do not receive a generated-version commit. Retrying a version that is already on npm skips publishing it again.

The package includes seven native binaries: Linux x64 and ARM64 for glibc and musl, macOS x64 and ARM64, and Windows x64. Windows ARM64 uses the x64 binary through emulation. Linux glibc binaries target glibc 2.28. The compiled Patchright daemon and its runtime dependencies are included. Installation uses the bundled binary and does not download an upstream agent-browser executable.

The publish job checks the npm file list, installs the actual tarball in an empty directory, and runs `prcli --version` before uploading to npm. `scripts/check-npm-package.js` rejects missing binaries, missing daemon entry points, and private local artifacts.

## First publication

A package must exist before npm can configure its Trusted Publisher. The maintainer account is `ikaleio`.

1. Log in with `npm login`.
2. Run **Publish npm** with **dry-run** enabled to build and check the package.
3. Download the `npm-package` artifact from that run.
4. Publish its tarball with `npm publish ./prcli-<version>.tgz --access public`.
5. Create the Trusted Publisher:

   ```bash
   npm trust github prcli --repo Ikaleio/patchright-cli --file release.yml --allow-publish --yes
   ```

   npm can require two-factor authentication for this step. The equivalent npm package settings use GitHub owner `Ikaleio`, repository `patchright-cli`, workflow filename `release.yml`, and permission for direct `npm publish`. Leave the environment name empty.

6. Run **Publish npm** again without **dry-run**, or push a change to `main` and wait for CI.

The workflow uses GitHub OIDC credentials. It does not need an `NPM_TOKEN` repository secret. See the [npm Trusted Publisher documentation](https://docs.npmjs.com/trusted-publishers/) for authentication requirements.

## Manual run and recovery

**Actions → Publish npm → Run workflow** builds the selected `main` commit. Enable **dry-run** to produce and check a tarball without publishing. A failed platform build prevents publication.

For a failed publish, fix authentication and re-run the failed job. npm versions cannot be overwritten. Each new workflow run generates another version. The published version is checked with `npm view prcli@<version> version`.
